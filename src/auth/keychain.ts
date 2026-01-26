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
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
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

const ACCOUNT_ENV_VARS: Record<string, string> = {
  [PROVIDER_ACCOUNTS.openai]: 'OPENAI_API_KEY',
  [PROVIDER_ACCOUNTS.anthropic]: 'ANTHROPIC_API_KEY',
};

const ENV_CREDENTIALS_FILE = '.env';
const ENV_KEY_FILE = '.env.key';
const ENCRYPTION_PREFIX = 'enc:';

function getEnvCredentialsPath(): string {
  return join(homedir(), '.bellwether', ENV_CREDENTIALS_FILE);
}

function getEnvKeyPath(): string {
  return join(homedir(), '.bellwether', ENV_KEY_FILE);
}

function loadOrCreateKey(): Buffer {
  const fs = require('fs') as typeof import('fs');
  const keyPath = getEnvKeyPath();
  if (fs.existsSync(keyPath)) {
    const keyHex = fs.readFileSync(keyPath, 'utf-8').trim();
    return Buffer.from(keyHex, 'hex');
  }

  const key = randomBytes(32);
  const dir = join(homedir(), '.bellwether');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
  return key;
}

export function isEncryptedEnvValue(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

export function encryptEnvValue(value: string): string {
  const key = loadOrCreateKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptEnvValue(value: string): string | undefined {
  if (!isEncryptedEnvValue(value)) {
    return value;
  }

  const payload = value.slice(ENCRYPTION_PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    return undefined;
  }

  const [ivHex, tagHex, dataHex] = parts;
  try {
    const key = loadOrCreateKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}

/**
 * Keychain interface - can be implemented by different backends.
 */
export interface KeychainBackend {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

/**
 * Type definition for the optional keytar module.
 * Keytar provides secure credential storage using the system keychain.
 */
interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

/**
 * Keytar-based keychain backend (requires keytar package).
 */
class KeytarBackend implements KeychainBackend {
  private keytar: KeytarModule | null = null;
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
 * Stores credentials in ~/.bellwether/.env (with restrictive permissions).
 *
 * NOTE: This is less secure than system keychain but better than nothing.
 * Credentials are stored encrypted at rest with 0600 permissions.
 */
class FileBackend implements KeychainBackend {
  private credentialsPath: string;
  private envLines: string[] | null = null;

  constructor() {
    this.credentialsPath = getEnvCredentialsPath();
  }

  private async load(): Promise<string[]> {
    if (this.envLines) return this.envLines;

    const fs = await import('fs');
    try {
      if (fs.existsSync(this.credentialsPath)) {
        const content = fs.readFileSync(this.credentialsPath, 'utf-8');
        this.envLines = content.split('\n');
      } else {
        this.envLines = [];
      }
    } catch {
      this.envLines = [];
    }

    return this.envLines!;
  }

  private async save(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const dir = path.join(os.homedir(), '.bellwether');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    fs.writeFileSync(this.credentialsPath, this.envLines?.join('\n') ?? '', { mode: 0o600 });
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    void service;
    const envVar = ACCOUNT_ENV_VARS[account] ?? account;
    const lines = await this.load();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      if (key !== envVar) continue;
      const rawValue = trimmed.substring(eqIndex + 1).trim();
      const decrypted = decryptEnvValue(rawValue);
      return decrypted ?? null;
    }

    return null;
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    void service;
    const envVar = ACCOUNT_ENV_VARS[account] ?? account;
    const encrypted = encryptEnvValue(password);
    const lines = await this.load();
    let updated = false;
    const nextLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        return line;
      }
      const key = trimmed.substring(0, eqIndex).trim();
      if (key !== envVar) {
        return line;
      }
      updated = true;
      return `${envVar}=${encrypted}`;
    });

    if (!updated) {
      nextLines.push(`${envVar}=${encrypted}`);
    }

    this.envLines = nextLines;
    await this.save();
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    void service;
    const envVar = ACCOUNT_ENV_VARS[account] ?? account;
    const lines = await this.load();
    let removed = false;
    const nextLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return true;
      }
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        return true;
      }
      const key = trimmed.substring(0, eqIndex).trim();
      if (key === envVar) {
        removed = true;
        return false;
      }
      return true;
    });

    if (removed) {
      this.envLines = nextLines;
      await this.save();
    }

    return removed;
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
