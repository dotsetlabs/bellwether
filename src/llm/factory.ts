/**
 * LLM provider factory - creates and auto-detects providers.
 */

import type { LLMClient, LLMConfig, LLMProviderId } from './client.js';
import { DEFAULT_MODELS } from './client.js';
import { OpenAIClient } from './openai.js';
import { AnthropicClient } from './anthropic.js';
import { OllamaClient } from './ollama.js';

/**
 * Create an LLM client from configuration.
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  const apiKey = resolveApiKey(config);

  switch (config.provider) {
    case 'openai':
      return new OpenAIClient({
        apiKey,
        model: config.model,
        baseURL: config.baseUrl,
        onUsage: config.onUsage,
      });

    case 'anthropic':
      return new AnthropicClient({
        apiKey,
        model: config.model,
        baseURL: config.baseUrl,
        onUsage: config.onUsage,
      });

    case 'ollama':
      return new OllamaClient({
        baseUrl: config.baseUrl,
        model: config.model,
        onUsage: config.onUsage,
      });

    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/**
 * Resolve API key from config or environment.
 */
function resolveApiKey(config: LLMConfig): string | undefined {
  // Direct API key takes precedence
  if (config.apiKey) {
    return config.apiKey;
  }

  // Check specified env var
  if (config.apiKeyEnvVar) {
    const key = process.env[config.apiKeyEnvVar];
    if (!key) {
      throw new Error(`Environment variable ${config.apiKeyEnvVar} is not set`);
    }
    return key;
  }

  // Default env vars per provider
  const defaultEnvVars: Record<LLMProviderId, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    ollama: '', // Ollama doesn't need an API key
  };

  const defaultVar = defaultEnvVars[config.provider];
  if (defaultVar) {
    return process.env[defaultVar];
  }

  return undefined;
}

/**
 * Auto-detect the best available provider based on environment.
 */
export function detectProvider(): LLMProviderId {
  // Check for API keys in order of preference
  if (process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }

  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }

  // Fall back to Ollama (local, no API key needed)
  return 'ollama';
}

/**
 * Create an LLM client with auto-detection.
 * Uses environment variables to determine the best provider.
 */
export function createAutoClient(modelOverride?: string): LLMClient {
  const provider = detectProvider();

  return createLLMClient({
    provider,
    model: modelOverride ?? DEFAULT_MODELS[provider],
  });
}

/**
 * Get information about available providers.
 */
export interface ProviderAvailability {
  provider: LLMProviderId;
  available: boolean;
  reason?: string;
}

/**
 * Check which providers are available.
 */
export async function checkProviderAvailability(): Promise<ProviderAvailability[]> {
  const results: ProviderAvailability[] = [];

  // Check OpenAI
  if (process.env.OPENAI_API_KEY) {
    results.push({ provider: 'openai', available: true });
  } else {
    results.push({
      provider: 'openai',
      available: false,
      reason: 'OPENAI_API_KEY not set',
    });
  }

  // Check Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    results.push({ provider: 'anthropic', available: true });
  } else {
    results.push({
      provider: 'anthropic',
      available: false,
      reason: 'ANTHROPIC_API_KEY not set',
    });
  }

  // Check Ollama
  const ollama = new OllamaClient();
  const ollamaAvailable = await ollama.isAvailable();
  if (ollamaAvailable) {
    results.push({ provider: 'ollama', available: true });
  } else {
    results.push({
      provider: 'ollama',
      available: false,
      reason: 'Ollama not running (start with: ollama serve)',
    });
  }

  return results;
}

/**
 * Get the default model for a provider.
 */
export function getDefaultModel(provider: LLMProviderId): string {
  return DEFAULT_MODELS[provider];
}

/**
 * List all supported providers.
 */
export function getSupportedProviders(): LLMProviderId[] {
  return ['openai', 'anthropic', 'ollama'];
}
