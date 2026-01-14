/**
 * Credential resolution - unified API key retrieval from multiple sources.
 *
 * Resolution order (first match wins):
 * 1. Direct API key passed in config (programmatic use)
 * 2. Environment variable (explicit override, highest priority for CLI)
 * 3. System keychain (secure storage)
 * 4. .env files (already loaded into process.env by dotenv)
 *
 * This ensures that:
 * - CI/CD can use env vars without touching keychain
 * - Local dev can use keychain for convenience
 * - Project .env files work as expected
 */

import type { LLMProviderId, LLMConfig } from '../llm/client.js';
import { getKeychainService } from './keychain.js';

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
  source: 'config' | 'env' | 'keychain' | 'none';
  envVar?: string;
}

/**
 * Resolve API key from all available sources.
 *
 * @param config - LLM configuration
 * @returns The resolved API key and its source
 */
export async function resolveCredentials(
  config: Pick<LLMConfig, 'provider' | 'apiKey' | 'apiKeyEnvVar'>
): Promise<CredentialResult> {
  // 1. Direct API key in config takes precedence
  if (config.apiKey) {
    return { apiKey: config.apiKey, source: 'config' };
  }

  // 2. Check specified env var
  if (config.apiKeyEnvVar) {
    const key = process.env[config.apiKeyEnvVar];
    if (key) {
      return { apiKey: key, source: 'env', envVar: config.apiKeyEnvVar };
    }
  }

  // 3. Check default env var for provider
  const defaultEnvVar = DEFAULT_ENV_VARS[config.provider];
  if (defaultEnvVar) {
    const key = process.env[defaultEnvVar];
    if (key) {
      return { apiKey: key, source: 'env', envVar: defaultEnvVar };
    }
  }

  // 4. Check keychain (for providers that use API keys)
  if (config.provider !== 'ollama') {
    try {
      const keychain = getKeychainService();
      const key = await keychain.getApiKey(config.provider);
      if (key) {
        return { apiKey: key, source: 'keychain' };
      }
    } catch {
      // Keychain not available - continue without it
    }
  }

  // No credentials found
  return { apiKey: undefined, source: 'none' };
}

/**
 * Synchronous API key resolution (for backward compatibility).
 * Does NOT check keychain - use resolveCredentials for full resolution.
 */
export function resolveApiKeySync(
  config: Pick<LLMConfig, 'provider' | 'apiKey' | 'apiKeyEnvVar'>
): string | undefined {
  // 1. Direct API key
  if (config.apiKey) {
    return config.apiKey;
  }

  // 2. Specified env var
  if (config.apiKeyEnvVar) {
    const key = process.env[config.apiKeyEnvVar];
    if (key) {
      return key;
    }
  }

  // 3. Default env var
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
