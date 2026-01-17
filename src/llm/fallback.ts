/**
 * Fallback LLM client that tries multiple providers in sequence.
 * Provides resilience through provider failover and model fallback.
 */

import type {
  LLMClient,
  Message,
  CompletionOptions,
  ProviderInfo,
  LLMConfig,
  LLMProviderId,
  StreamingOptions,
  StreamingResult,
} from './client.js';
import { parseJSONResponse, DEFAULT_MODELS } from './client.js';
import { createLLMClient } from './factory.js';
import { OllamaClient } from './ollama.js';
import { getLogger } from '../logging/logger.js';
import {
  LLMAuthError,
  LLMQuotaError,
  LLMConnectionError,
  LLMRateLimitError,
} from '../errors/types.js';

const logger = getLogger('fallback-llm');

/**
 * Health status for a provider.
 */
export interface ProviderHealth {
  provider: LLMProviderId;
  healthy: boolean;
  lastChecked: Date;
  lastError?: string;
  consecutiveFailures: number;
}

/**
 * Configuration for fallback behavior.
 */
export interface FallbackConfig {
  /** Primary provider configurations in priority order */
  providers: LLMConfig[];
  /** Whether to use Ollama as final fallback (default: true) */
  useOllamaFallback?: boolean;
  /** Ollama model to use for fallback */
  ollamaModel?: string;
  /** Health check interval in ms (default: 60000) */
  healthCheckIntervalMs?: number;
  /** Max consecutive failures before marking unhealthy (default: 3) */
  maxConsecutiveFailures?: number;
  /** Time to wait before retrying unhealthy provider in ms (default: 300000) */
  unhealthyRetryDelayMs?: number;
  /** Callback for usage tracking (applied to all providers) */
  onUsage?: (inputTokens: number, outputTokens: number) => void;
}

/**
 * Fallback result with metadata.
 */
export interface FallbackResult {
  response: string;
  provider: LLMProviderId;
  model: string;
  attemptedProviders: LLMProviderId[];
  failedProviders: Array<{ provider: LLMProviderId; error: string }>;
}

/**
 * LLM client with automatic provider failover.
 */
export class FallbackLLMClient implements LLMClient {
  private clients: Map<LLMProviderId, LLMClient> = new Map();
  private providerOrder: LLMProviderId[] = [];
  private health: Map<LLMProviderId, ProviderHealth> = new Map();
  private config: Required<Omit<FallbackConfig, 'providers' | 'onUsage'>> & {
    providers: LLMConfig[];
    onUsage?: (inputTokens: number, outputTokens: number) => void;
  };

  constructor(config: FallbackConfig) {
    this.config = {
      providers: config.providers,
      useOllamaFallback: config.useOllamaFallback ?? true,
      ollamaModel: config.ollamaModel ?? DEFAULT_MODELS.ollama,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 60000,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 3,
      unhealthyRetryDelayMs: config.unhealthyRetryDelayMs ?? 300000,
      onUsage: config.onUsage,
    };

    this.initializeClients();
  }

  /**
   * Initialize all provider clients.
   */
  private initializeClients(): void {
    for (const providerConfig of this.config.providers) {
      try {
        // Apply shared onUsage callback
        const configWithUsage = {
          ...providerConfig,
          onUsage: this.config.onUsage,
        };
        const client = createLLMClient(configWithUsage);
        this.clients.set(providerConfig.provider, client);
        this.providerOrder.push(providerConfig.provider);
        this.health.set(providerConfig.provider, {
          provider: providerConfig.provider,
          healthy: true,
          lastChecked: new Date(),
          consecutiveFailures: 0,
        });
        logger.debug({ provider: providerConfig.provider }, 'Initialized provider');
      } catch (error) {
        logger.warn(
          { provider: providerConfig.provider, error: String(error) },
          'Failed to initialize provider'
        );
      }
    }

    // Add Ollama as final fallback if enabled
    if (this.config.useOllamaFallback && !this.clients.has('ollama')) {
      try {
        const ollamaClient = new OllamaClient({
          model: this.config.ollamaModel,
        });
        this.clients.set('ollama', ollamaClient);
        this.providerOrder.push('ollama');
        this.health.set('ollama', {
          provider: 'ollama',
          healthy: true, // Assume healthy until checked
          lastChecked: new Date(),
          consecutiveFailures: 0,
        });
        logger.debug('Added Ollama as fallback provider');
      } catch (error) {
        logger.warn({ error: String(error) }, 'Failed to initialize Ollama fallback');
      }
    }

    if (this.clients.size === 0) {
      throw new Error('No LLM providers could be initialized');
    }
  }

  /**
   * Get combined provider info.
   */
  getProviderInfo(): ProviderInfo {
    const primaryClient = this.getPrimaryClient();
    const info = primaryClient.getProviderInfo();
    return {
      ...info,
      id: `fallback(${this.providerOrder.join(',')})`,
      name: `Fallback: ${info.name}`,
    };
  }

  /**
   * Get the current primary (first healthy) client.
   */
  private getPrimaryClient(): LLMClient {
    for (const providerId of this.providerOrder) {
      if (this.isProviderHealthy(providerId)) {
        const client = this.clients.get(providerId);
        if (client) return client;
      }
    }
    // Return first client as fallback (guaranteed to exist from constructor check)
    const firstClient = this.clients.values().next().value;
    if (!firstClient) {
      throw new Error('No LLM clients available');
    }
    return firstClient;
  }

  /**
   * Check if a provider is currently healthy.
   */
  private isProviderHealthy(providerId: LLMProviderId): boolean {
    const health = this.health.get(providerId);
    if (!health) return false;

    // If marked unhealthy, check if retry delay has passed
    if (!health.healthy) {
      const timeSinceCheck = Date.now() - health.lastChecked.getTime();
      if (timeSinceCheck >= this.config.unhealthyRetryDelayMs) {
        // Reset to allow retry
        health.healthy = true;
        health.consecutiveFailures = 0;
        logger.info({ provider: providerId }, 'Resetting unhealthy provider for retry');
      }
    }

    return health.healthy;
  }

  /**
   * Mark a provider as failed.
   */
  private markProviderFailed(providerId: LLMProviderId, error: Error): void {
    const health = this.health.get(providerId);
    if (!health) return;

    health.consecutiveFailures++;
    health.lastError = error.message;
    health.lastChecked = new Date();

    // Check if we should mark as unhealthy
    if (health.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      health.healthy = false;
      logger.warn(
        {
          provider: providerId,
          consecutiveFailures: health.consecutiveFailures,
          error: error.message,
        },
        'Marking provider as unhealthy'
      );
    }
  }

  /**
   * Mark a provider as successful.
   */
  private markProviderSuccess(providerId: LLMProviderId): void {
    const health = this.health.get(providerId);
    if (!health) return;

    health.healthy = true;
    health.consecutiveFailures = 0;
    health.lastChecked = new Date();
    health.lastError = undefined;
  }

  /**
   * Determine if an error should trigger failover to next provider.
   */
  private shouldFailover(error: unknown): boolean {
    // Auth and quota errors are terminal for that provider - failover
    if (error instanceof LLMAuthError || error instanceof LLMQuotaError) {
      return true;
    }

    // Connection errors - failover
    if (error instanceof LLMConnectionError) {
      return true;
    }

    // Rate limits - failover (they have their own retry logic)
    if (error instanceof LLMRateLimitError) {
      return true;
    }

    // Check error message for common failover conditions
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('econnrefused') ||
        message.includes('econnreset') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('unavailable') ||
        message.includes('503') ||
        message.includes('502')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Execute a completion with fallback.
   */
  private async executeWithFallback<T>(
    operation: (client: LLMClient) => Promise<T>,
    operationName: string
  ): Promise<{ result: T; provider: LLMProviderId }> {
    const attemptedProviders: LLMProviderId[] = [];
    const errors: Array<{ provider: LLMProviderId; error: Error }> = [];

    for (const providerId of this.providerOrder) {
      if (!this.isProviderHealthy(providerId)) {
        logger.debug({ provider: providerId }, 'Skipping unhealthy provider');
        continue;
      }

      const client = this.clients.get(providerId);
      if (!client) continue;

      attemptedProviders.push(providerId);

      try {
        logger.debug({ provider: providerId, operation: operationName }, 'Attempting operation');
        const result = await operation(client);
        this.markProviderSuccess(providerId);
        return { result, provider: providerId };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ provider: providerId, error: err });
        this.markProviderFailed(providerId, err);

        logger.warn(
          {
            provider: providerId,
            operation: operationName,
            error: err.message,
            shouldFailover: this.shouldFailover(error),
          },
          'Provider operation failed'
        );

        if (!this.shouldFailover(error)) {
          // Non-failover error - throw immediately
          throw error;
        }

        // Continue to next provider
      }
    }

    // All providers failed
    const errorSummary = errors
      .map(({ provider, error }) => `${provider}: ${error.message}`)
      .join('; ');
    throw new Error(
      `All LLM providers failed for ${operationName}. Errors: ${errorSummary}`
    );
  }

  /**
   * Chat completion with fallback.
   */
  async chat(messages: Message[], options?: CompletionOptions): Promise<string> {
    const { result } = await this.executeWithFallback(
      (client) => client.chat(messages, options),
      'chat'
    );
    return result;
  }

  /**
   * Single prompt completion with fallback.
   */
  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const { result } = await this.executeWithFallback(
      (client) => client.complete(prompt, options),
      'complete'
    );
    return result;
  }

  /**
   * Parse JSON from response.
   */
  parseJSON<T>(response: string): T {
    return parseJSONResponse<T>(response);
  }

  /**
   * Stream completion from a single prompt with fallback.
   */
  async stream(prompt: string, options?: StreamingOptions): Promise<StreamingResult> {
    const { result } = await this.executeWithFallback(
      (client) => client.stream(prompt, options),
      'stream'
    );
    return result;
  }

  /**
   * Stream chat completion with fallback.
   */
  async streamChat(messages: Message[], options?: StreamingOptions): Promise<StreamingResult> {
    const { result } = await this.executeWithFallback(
      (client) => client.streamChat(messages, options),
      'streamChat'
    );
    return result;
  }

  /**
   * Get health status for all providers.
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.health.values());
  }

  /**
   * Get list of available providers in priority order.
   */
  getProviderOrder(): LLMProviderId[] {
    return [...this.providerOrder];
  }

  /**
   * Check health of all providers (for Ollama this pings the server).
   */
  async checkHealth(): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];

    for (const providerId of this.providerOrder) {
      const client = this.clients.get(providerId);
      const health = this.health.get(providerId);
      if (!client || !health) continue;

      try {
        // For Ollama, use isAvailable()
        if (providerId === 'ollama' && client instanceof OllamaClient) {
          const available = await client.isAvailable();
          health.healthy = available;
          health.lastChecked = new Date();
          if (!available) {
            health.lastError = 'Ollama server not responding';
          } else {
            health.lastError = undefined;
            health.consecutiveFailures = 0;
          }
        } else {
          // For API providers, we assume healthy if we have credentials
          // Actual health is determined by request success/failure
          health.lastChecked = new Date();
        }
      } catch (error) {
        health.healthy = false;
        health.lastError = error instanceof Error ? error.message : String(error);
        health.lastChecked = new Date();
      }

      results.push({ ...health });
    }

    return results;
  }

  /**
   * Manually mark a provider as unhealthy.
   */
  disableProvider(providerId: LLMProviderId): void {
    const health = this.health.get(providerId);
    if (health) {
      health.healthy = false;
      health.lastChecked = new Date();
      logger.info({ provider: providerId }, 'Provider manually disabled');
    }
  }

  /**
   * Manually mark a provider as healthy.
   */
  enableProvider(providerId: LLMProviderId): void {
    const health = this.health.get(providerId);
    if (health) {
      health.healthy = true;
      health.consecutiveFailures = 0;
      health.lastError = undefined;
      health.lastChecked = new Date();
      logger.info({ provider: providerId }, 'Provider manually enabled');
    }
  }
}

/**
 * Create a fallback LLM client from available providers.
 * Automatically detects available API keys and sets up fallback chain.
 */
export function createFallbackClient(options?: {
  preferredOrder?: LLMProviderId[];
  useOllamaFallback?: boolean;
  ollamaModel?: string;
  onUsage?: (inputTokens: number, outputTokens: number) => void;
}): FallbackLLMClient {
  const providers: LLMConfig[] = [];
  const order = options?.preferredOrder ?? ['anthropic', 'openai', 'ollama'];

  for (const providerId of order) {
    if (providerId === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      providers.push({
        provider: 'anthropic',
        model: DEFAULT_MODELS.anthropic,
      });
    } else if (providerId === 'openai' && process.env.OPENAI_API_KEY) {
      providers.push({
        provider: 'openai',
        model: DEFAULT_MODELS.openai,
      });
    } else if (providerId === 'ollama') {
      // Ollama will be added as fallback if useOllamaFallback is true
    }
  }

  return new FallbackLLMClient({
    providers,
    useOllamaFallback: options?.useOllamaFallback ?? true,
    ollamaModel: options?.ollamaModel,
    onUsage: options?.onUsage,
  });
}
