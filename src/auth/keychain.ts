/**
 * Cross-platform keychain service for secure credential storage.
 *
 * Uses the system keychain:
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: Secret Service (libsecret)
 *
 * Gracefully degrades if keychain is unavailable (e.g., CI environments).
 */

import { homedir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';
import type { LLMProviderId } from '../llm/client.js';

// Create require function for loading CommonJS optional dependencies in ESM
const require = createRequire(import.meta.url);

// Service name for keychain entries
const SERVICE_NAME = 'bellwether';

// Account names for each provider
const PROVIDER_ACCOUNTS: Record<LLMProviderId, string> = {
  openai: 'openai-api-key',
  anthropic: 'anthropic-api-key',
  ollama: 'ollama', // Ollama doesn't use API keys, but included for completeness
};

/**
 * Keychain interface - can be implemented by different backends.
 */
export interface KeychainBackend {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

/**
 * Keytar-based keychain backend (requires keytar package).
 */
class KeytarBackend implements KeychainBackend {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private keytar: any = null;
  private initPromise: Promise<void> | null = null;

  private async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Dynamic import to avoid requiring keytar if not installed
        // Using require() for optional dependency
        this.keytar = require('keytar');
      } catch {
        // keytar not available - will use fallback
        this.keytar = null;
      }
    })();

    return this.initPromise;
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    await this.init();
    if (!this.keytar) return null;
    return this.keytar.getPassword(service, account);
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    await this.init();
    if (!this.keytar) {
      throw new Error(
        'Keychain not available. Install keytar: npm install keytar\n' +
        'Or use environment variables instead.'
      );
    }
    await this.keytar.setPassword(service, account, password);
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    await this.init();
    if (!this.keytar) return false;
    return this.keytar.deletePassword(service, account);
  }
}

/**
 * File-based fallback for environments without keychain access.
 * Stores credentials in ~/.bellwether/credentials (with restrictive permissions).
 *
 * NOTE: This is less secure than system keychain but better than nothing.
 * Credentials are stored in plain text but with 0600 permissions.
 */
class FileBackend implements KeychainBackend {
  private credentialsPath: string;
  private credentials: Record<string, Record<string, string>> | null = null;

  constructor() {
    this.credentialsPath = join(homedir(), '.bellwether', 'credentials.json');
  }

  private async load(): Promise<Record<string, Record<string, string>>> {
    if (this.credentials) return this.credentials;

    const fs = await import('fs');
    try {
      if (fs.existsSync(this.credentialsPath)) {
        const content = fs.readFileSync(this.credentialsPath, 'utf-8');
        this.credentials = JSON.parse(content) as Record<string, Record<string, string>>;
      } else {
        this.credentials = {};
      }
    } catch {
      this.credentials = {};
    }

    return this.credentials!;
  }

  private async save(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const dir = path.join(os.homedir(), '.bellwether');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    fs.writeFileSync(
      this.credentialsPath,
      JSON.stringify(this.credentials, null, 2),
      { mode: 0o600 }
    );
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    const creds = await this.load();
    return creds[service]?.[account] ?? null;
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    const creds = await this.load();
    if (!creds[service]) {
      creds[service] = {};
    }
    creds[service][account] = password;
    await this.save();
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    const creds = await this.load();
    if (creds[service]?.[account]) {
      delete creds[service][account];
      if (Object.keys(creds[service]).length === 0) {
        delete creds[service];
      }
      await this.save();
      return true;
    }
    return false;
  }
}

/**
 * Keychain service - manages API key storage.
 */
export class KeychainService {
  private backend: KeychainBackend;
  private useFileBackend: boolean = false;

  constructor() {
    // Try keytar first, fall back to file-based storage
    this.backend = new KeytarBackend();
  }

  /**
   * Check if secure keychain (keytar) is available.
   */
  async isSecureKeychainAvailable(): Promise<boolean> {
    try {
      // Try to access keytar using require
      require('keytar');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the backend being used.
   */
  async getBackendType(): Promise<'keychain' | 'file'> {
    if (await this.isSecureKeychainAvailable()) {
      return 'keychain';
    }
    return 'file';
  }

  /**
   * Enable file-based fallback explicitly.
   */
  enableFileBackend(): void {
    this.backend = new FileBackend();
    this.useFileBackend = true;
  }

  /**
   * Get API key for a provider from keychain.
   */
  async getApiKey(provider: LLMProviderId): Promise<string | null> {
    const account = PROVIDER_ACCOUNTS[provider];
    if (!account || provider === 'ollama') {
      return null;
    }

    try {
      return await this.backend.getPassword(SERVICE_NAME, account);
    } catch {
      // If keytar fails, try file backend
      if (!this.useFileBackend) {
        this.enableFileBackend();
        return await this.backend.getPassword(SERVICE_NAME, account);
      }
      return null;
    }
  }

  /**
   * Store API key for a provider in keychain.
   */
  async setApiKey(provider: LLMProviderId, apiKey: string): Promise<void> {
    const account = PROVIDER_ACCOUNTS[provider];
    if (!account || provider === 'ollama') {
      throw new Error(`Provider ${provider} does not use API keys`);
    }

    try {
      await this.backend.setPassword(SERVICE_NAME, account, apiKey);
    } catch (error) {
      // If keytar fails, try file backend
      if (!this.useFileBackend) {
        this.enableFileBackend();
        await this.backend.setPassword(SERVICE_NAME, account, apiKey);
      } else {
        throw error;
      }
    }
  }

  /**
   * Delete API key for a provider from keychain.
   */
  async deleteApiKey(provider: LLMProviderId): Promise<boolean> {
    const account = PROVIDER_ACCOUNTS[provider];
    if (!account || provider === 'ollama') {
      return false;
    }

    try {
      return await this.backend.deletePassword(SERVICE_NAME, account);
    } catch {
      // If keytar fails, try file backend
      if (!this.useFileBackend) {
        this.enableFileBackend();
        return await this.backend.deletePassword(SERVICE_NAME, account);
      }
      return false;
    }
  }

  /**
   * Get all stored credentials (without values, just which providers have keys).
   */
  async getStoredProviders(): Promise<LLMProviderId[]> {
    const providers: LLMProviderId[] = [];

    for (const provider of ['openai', 'anthropic'] as LLMProviderId[]) {
      const key = await this.getApiKey(provider);
      if (key) {
        providers.push(provider);
      }
    }

    return providers;
  }

  /**
   * Clear all stored credentials.
   */
  async clearAll(): Promise<void> {
    for (const provider of ['openai', 'anthropic'] as LLMProviderId[]) {
      await this.deleteApiKey(provider);
    }
  }
}

// Singleton instance
let keychainService: KeychainService | null = null;

/**
 * Get the keychain service instance.
 */
export function getKeychainService(): KeychainService {
  if (!keychainService) {
    keychainService = new KeychainService();
  }
  return keychainService;
}
