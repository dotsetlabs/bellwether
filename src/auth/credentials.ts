/**
 * Credential resolution - unified API key retrieval from multiple sources.
 *
 * Resolution order (highest to lowest priority):
 * 1. Direct config (apiKey in config)
 * 2. Custom environment variable (apiKeyEnvVar in config)
 * 3. Standard environment variable (OPENAI_API_KEY, ANTHROPIC_API_KEY)
 * 4. Project .env file (./env in current working directory)
 * 5. Global .env file (~/.bellwether/.env)
 * 6. System keychain (via bellwether auth)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { LLMProviderId, LLMConfig } from '../llm/client.js';
import { getKeychainService, decryptEnvValue, isEncryptedEnvValue } from './keychain.js';

/**
 * Default environment variable names for each provider.
 */
export const DEFAULT_ENV_VARS: Record<LLMProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  ollama: '', // Ollama doesn't need an API key
};

/**
 * Result of credential resolution.
 */
export interface CredentialResult {
  apiKey: string | undefined;
  source: 'config' | 'env' | 'project-env' | 'global-env' | 'keychain' | 'none';
  envVar?: string;
  envFile?: string;
}

/**
 * Read a specific environment variable from a .env file.
 * Returns undefined if the file doesn't exist or the variable isn't found.
 */
function readEnvFile(
  filePath: string,
  envVar: string,
  options?: { allowEncrypted?: boolean }
): string | undefined {
  try {
    if (!existsSync(filePath)) {
      return undefined;
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=VALUE format
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, eqIndex).trim();
      if (key !== envVar) {
        continue;
      }

      let value = trimmed.substring(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (options?.allowEncrypted && isEncryptedEnvValue(value)) {
        const decrypted = decryptEnvValue(value);
        if (decrypted) {
          return decrypted;
        }
        // Warn about decryption failure so users know their credential exists but can't be decrypted
        console.warn(
          `[bellwether] Encrypted credential found for ${envVar} but decryption failed. Check your encryption key.`
        );
        return undefined;
      }

      if (value) {
        return value;
      }
    }

    return undefined;
  } catch {
    // File read error - return undefined
    return undefined;
  }
}

/**
 * Get the path to the global Bellwether .env file.
 */
function getGlobalEnvPath(): string {
  return join(homedir(), '.bellwether', '.env');
}

/**
 * Get the path to the project .env file.
 */
function getProjectEnvPath(): string {
  return join(process.cwd(), '.env');
}

/**
 * Resolve API key from all available sources.
 *
 * Resolution order (highest to lowest priority):
 * 1. Direct config (apiKey in config)
 * 2. Custom environment variable (apiKeyEnvVar in config)
 * 3. Standard environment variable (OPENAI_API_KEY, ANTHROPIC_API_KEY)
 * 4. Project .env file (./env in current working directory)
 * 5. Global .env file (~/.bellwether/.env)
 * 6. System keychain (via bellwether auth)
 *
 * @param config - LLM configuration
 * @returns The resolved API key and its source
 */
export async function resolveCredentials(
  config: Pick<LLMConfig, 'provider' | 'apiKey' | 'apiKeyEnvVar'>
): Promise<CredentialResult> {
  // 1. Direct config
  if (config.apiKey) {
    return { apiKey: config.apiKey, source: 'config' };
  }

  // 2. Custom environment variable
  if (config.apiKeyEnvVar) {
    const key = process.env[config.apiKeyEnvVar];
    if (key) {
      return { apiKey: key, source: 'env', envVar: config.apiKeyEnvVar };
    }
  }

  // 3. Standard environment variable (already in process.env)
  const defaultEnvVar = DEFAULT_ENV_VARS[config.provider];
  if (defaultEnvVar) {
    const key = process.env[defaultEnvVar];
    if (key) {
      return { apiKey: key, source: 'env', envVar: defaultEnvVar };
    }
  }

  // 4. Project .env file
  if (defaultEnvVar) {
    const projectEnvPath = getProjectEnvPath();
    const key = readEnvFile(projectEnvPath, defaultEnvVar);
    if (key) {
      return { apiKey: key, source: 'project-env', envVar: defaultEnvVar, envFile: projectEnvPath };
    }
  }

  // 5. Global .env file (~/.bellwether/.env)
  if (defaultEnvVar) {
    const globalEnvPath = getGlobalEnvPath();
    const key = readEnvFile(globalEnvPath, defaultEnvVar, { allowEncrypted: true });
    if (key) {
      return { apiKey: key, source: 'global-env', envVar: defaultEnvVar, envFile: globalEnvPath };
    }
  }

  // 6. System keychain
  if (config.provider !== 'ollama') {
    try {
      const keychain = getKeychainService();
      const key = await keychain.getApiKey(config.provider);
      if (key) {
        return { apiKey: key, source: 'keychain' };
      }
    } catch {
      // Keychain not available
    }
  }

  return { apiKey: undefined, source: 'none' };
}

/**
 * Synchronous API key resolution (for backward compatibility).
 * Does NOT check keychain - use resolveCredentials for full resolution.
 */
export function resolveApiKeySync(
  config: Pick<LLMConfig, 'provider' | 'apiKey' | 'apiKeyEnvVar'>
): string | undefined {
  if (config.apiKey) {
    return config.apiKey;
  }

  if (config.apiKeyEnvVar) {
    const key = process.env[config.apiKeyEnvVar];
    if (key) return key;
  }

  const defaultEnvVar = DEFAULT_ENV_VARS[config.provider];
  if (defaultEnvVar) {
    return process.env[defaultEnvVar];
  }

  return undefined;
}

/**
 * Check if credentials are available for a provider.
 */
export async function hasCredentials(provider: LLMProviderId): Promise<boolean> {
  if (provider === 'ollama') {
    return true; // Ollama doesn't need credentials
  }

  const result = await resolveCredentials({ provider });
  return result.source !== 'none';
}

/**
 * Get a description of where credentials are configured.
 */
export async function describeCredentialSource(provider: LLMProviderId): Promise<string> {
  if (provider === 'ollama') {
    return 'Ollama (no API key required)';
  }

  const result = await resolveCredentials({ provider });

  switch (result.source) {
    case 'config':
      return 'Provided in configuration';
    case 'env':
      return `Environment variable: ${result.envVar}`;
    case 'project-env':
      return `Project .env file: ${result.envFile}`;
    case 'global-env':
      return `Global .env file: ${result.envFile}`;
    case 'keychain':
      return 'System keychain';
    case 'none':
      return 'Not configured';
  }
}

/**
 * Get authentication status for all providers.
 */
export interface AuthStatus {
  provider: LLMProviderId;
  configured: boolean;
  source: CredentialResult['source'];
  envVar?: string;
}

export async function getAuthStatus(): Promise<AuthStatus[]> {
  const providers: LLMProviderId[] = ['openai', 'anthropic', 'ollama'];
  const results: AuthStatus[] = [];

  for (const provider of providers) {
    if (provider === 'ollama') {
      results.push({
        provider,
        configured: true,
        source: 'none', // Ollama doesn't use credentials
      });
      continue;
    }

    const creds = await resolveCredentials({ provider });
    results.push({
      provider,
      configured: creds.source !== 'none',
      source: creds.source,
      envVar: creds.envVar,
    });
  }

  return results;
}
