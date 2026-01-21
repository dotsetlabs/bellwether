import OpenAI from 'openai';
import type { LLMClient, Message, CompletionOptions, ProviderInfo, StreamingOptions, StreamingResult } from './client.js';
import { DEFAULT_MODELS, parseJSONResponse } from './client.js';
import { withRetry, LLM_RETRY_OPTIONS } from '../errors/retry.js';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMQuotaError,
  LLMConnectionError,
  LLMRefusalError,
} from '../errors/index.js';
import { getLogger } from '../logging/logger.js';
import { LLM_DEFAULTS } from '../constants.js';

export interface OpenAIClientOptions {
  /** API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Default model to use */
  model?: string;
  /** Base URL for API (for proxies/alternatives) */
  baseURL?: string;
  /** Callback to receive token usage from each API call */
  onUsage?: (inputTokens: number, outputTokens: number) => void;
}

/**
 * OpenAI LLM client implementation.
 */
/**
 * Models that require special parameter handling.
 * This includes reasoning models (o1, o3) and newer GPT models (gpt-5+).
 * These models:
 * - Require max_completion_tokens instead of max_tokens
 * - Don't support custom temperature (only default of 1)
 * - Use reasoning tokens that come out of the completion token budget
 */
const MODELS_WITH_RESTRICTED_PARAMS = [
  'o1',
  'o1-mini',
  'o1-preview',
  'o3',
  'o3-mini',
  'gpt-5',
];

/**
 * Minimum max_completion_tokens for reasoning models.
 * Reasoning models use tokens for internal "thinking" before producing output.
 * We need a high minimum to ensure there are enough tokens left for actual output.
 */
const REASONING_MODEL_MIN_TOKENS = 8192;

/**
 * Check if a model has restricted parameters (newer reasoning/GPT-5 models).
 */
function hasRestrictedParams(model: string): boolean {
  const modelLower = model.toLowerCase();
  return MODELS_WITH_RESTRICTED_PARAMS.some(prefix =>
    modelLower.startsWith(prefix)
  );
}

/**
 * Get the effective max tokens for a model, accounting for reasoning overhead.
 */
function getEffectiveMaxTokens(model: string, requestedMaxTokens: number): number {
  if (hasRestrictedParams(model)) {
    // Reasoning models need much higher token limits because reasoning tokens
    // come out of the completion budget. Use at least REASONING_MODEL_MIN_TOKENS.
    return Math.max(requestedMaxTokens, REASONING_MODEL_MIN_TOKENS);
  }
  return requestedMaxTokens;
}

export class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private defaultModel: string;
  private logger = getLogger('openai');
  private onUsage?: (inputTokens: number, outputTokens: number) => void;

  constructor(options?: OpenAIClientOptions) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new LLMAuthError('openai');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: options?.baseURL,
    });

    this.defaultModel = options?.model ?? DEFAULT_MODELS.openai;
    this.onUsage = options?.onUsage;
  }

  getProviderInfo(): ProviderInfo {
    return {
      id: 'openai',
      name: 'OpenAI',
      supportsJSON: true,
      supportsStreaming: true,
      defaultModel: this.defaultModel,
    };
  }

  async chat(messages: Message[], options?: CompletionOptions): Promise<string> {
    const model = options?.model ?? this.defaultModel;

    return withRetry(
      async () => {
        // Prepend system message if provided
        const allMessages = options?.systemPrompt
          ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
          : messages;

        try {
          // Build request parameters - newer models have restricted params
          const requestedMaxTokens = options?.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS;
          const restrictedParams = hasRestrictedParams(model);
          // For reasoning models, ensure we have enough tokens for both reasoning AND output
          const maxTokensValue = getEffectiveMaxTokens(model, requestedMaxTokens);

          const response = await this.client.chat.completions.create({
            model,
            messages: allMessages.map(m => ({
              role: m.role,
              content: m.content,
            })),
            // Use max_completion_tokens for newer models (o1, o3, gpt-5+)
            // Use max_tokens for older models (gpt-4, gpt-3.5, etc.)
            ...(restrictedParams
              ? { max_completion_tokens: maxTokensValue }
              : { max_tokens: maxTokensValue }),
            // Newer models (o1, o3, gpt-5+) don't support custom temperature
            // Only include temperature for models that support it
            ...(restrictedParams
              ? {}
              : { temperature: options?.temperature ?? LLM_DEFAULTS.TEMPERATURE }),
            response_format: options?.responseFormat === 'json'
              ? { type: 'json_object' }
              : undefined,
          });

          // Track actual token usage from API response
          if (this.onUsage && response.usage) {
            this.onUsage(
              response.usage.prompt_tokens,
              response.usage.completion_tokens
            );
          }

          const choice = response.choices[0];
          let content = choice?.message?.content;

          // Check for refusal - but sometimes the model puts valid content in the refusal field!
          if (!content && choice?.message?.refusal) {
            const refusal = choice.message.refusal;
            // Check if the refusal actually contains JSON (model mistake)
            if (refusal.includes('[') || refusal.includes('{')) {
              // Extract JSON from refusal text
              const jsonMatch = refusal.match(/```json\s*([\s\S]*?)\s*```/) ||
                               refusal.match(/(\[[\s\S]*\])/) ||
                               refusal.match(/(\{[\s\S]*\})/);
              if (jsonMatch) {
                content = jsonMatch[1];
              }
            }
            if (!content) {
              throw new LLMRefusalError('openai', refusal, model);
            }
          }

          if (!content) {
            this.logger.error({ response: JSON.stringify(response) }, 'No content in OpenAI response');
            throw new Error('No content in LLM response');
          }

          return content;
        } catch (error) {
          // Convert to typed errors for retry logic
          if (error instanceof Error) {
            const message = error.message.toLowerCase();

            if (message.includes('401')) {
              throw new LLMAuthError('openai', model);
            }
            if (message.includes('429')) {
              // Extract Retry-After header if available from OpenAI API error
              let retryAfterMs: number | undefined;
              const apiError = error as { headers?: { get?: (name: string) => string | null } };
              if (apiError.headers?.get) {
                const retryAfter = apiError.headers.get('retry-after');
                if (retryAfter) {
                  // retry-after can be seconds or HTTP date
                  const seconds = parseInt(retryAfter, 10);
                  if (!isNaN(seconds)) {
                    retryAfterMs = seconds * 1000;
                    this.logger.debug({ retryAfterMs }, 'Extracted Retry-After header');
                  }
                }
                // Also check x-ratelimit-reset-requests header (OpenAI specific)
                const resetRequests = apiError.headers.get('x-ratelimit-reset-requests');
                if (resetRequests && !retryAfterMs) {
                  // Format: "1s", "1m", etc.
                  const match = resetRequests.match(/(\d+)([smh])/);
                  if (match) {
                    const value = parseInt(match[1], 10);
                    const unit = match[2];
                    const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000 };
                    retryAfterMs = value * (multipliers[unit] || 1000);
                    this.logger.debug({ retryAfterMs, resetRequests }, 'Extracted x-ratelimit-reset-requests');
                  }
                }
              }
              throw new LLMRateLimitError('openai', retryAfterMs, model);
            }
            if (message.includes('insufficient_quota')) {
              throw new LLMQuotaError('openai', model);
            }
            if (message.includes('econnrefused') || message.includes('fetch failed')) {
              throw new LLMConnectionError('openai', model);
            }
          }
          throw error;
        }
      },
      {
        ...LLM_RETRY_OPTIONS,
        operation: 'OpenAI chat completion',
        context: { component: 'openai', metadata: { model } },
        onRetry: (error, attempt, delayMs) => {
          this.logger.debug({
            attempt,
            delayMs: Math.round(delayMs),
            error: error instanceof Error ? error.message : String(error),
            msg: `Retrying OpenAI API call`,
          });
        },
      }
    );
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  parseJSON<T>(response: string): T {
    return parseJSONResponse<T>(response);
  }

  async stream(prompt: string, options?: StreamingOptions): Promise<StreamingResult> {
    return this.streamChat([{ role: 'user', content: prompt }], options);
  }

  async streamChat(messages: Message[], options?: StreamingOptions): Promise<StreamingResult> {
    const model = options?.model ?? this.defaultModel;

    return withRetry(
      async () => {
        // Prepend system message if provided
        const allMessages = options?.systemPrompt
          ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
          : messages;

        try {
          // Build request parameters - newer models have restricted params
          const requestedMaxTokens = options?.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS;
          const restrictedParams = hasRestrictedParams(model);
          // For reasoning models, ensure we have enough tokens for both reasoning AND output
          const maxTokensValue = getEffectiveMaxTokens(model, requestedMaxTokens);

          const stream = await this.client.chat.completions.create({
            model,
            messages: allMessages.map(m => ({
              role: m.role,
              content: m.content,
            })),
            // Use max_completion_tokens for newer models (o1, o3, gpt-5+)
            // Use max_tokens for older models (gpt-4, gpt-3.5, etc.)
            ...(restrictedParams
              ? { max_completion_tokens: maxTokensValue }
              : { max_tokens: maxTokensValue }),
            // Newer models (o1, o3, gpt-5+) don't support custom temperature
            // Only include temperature for models that support it
            ...(restrictedParams
              ? {}
              : { temperature: options?.temperature ?? LLM_DEFAULTS.TEMPERATURE }),
            response_format: options?.responseFormat === 'json'
              ? { type: 'json_object' }
              : undefined,
            stream: true,
          });

          let fullText = '';
          let inputTokens = 0;
          let outputTokens = 0;
          let finishReason: string | null = null;

          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            const content = choice?.delta?.content;
            if (content) {
              fullText += content;
              options?.onChunk?.(content);
            }

            // Track finish reason from final chunk
            if (choice?.finish_reason) {
              finishReason = choice.finish_reason;
            }

            // Track usage from final chunk if available
            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens;
              outputTokens = chunk.usage.completion_tokens;
            }
          }

          // Report token usage if callback provided
          if (this.onUsage && (inputTokens > 0 || outputTokens > 0)) {
            this.onUsage(inputTokens, outputTokens);
          }

          // Handle empty responses gracefully - don't throw, let caller handle
          // This can happen with content filters, refusals, or empty model responses
          if (!fullText && finishReason) {
            this.logger.debug({ finishReason }, 'Streaming completed with no content');
          }

          options?.onComplete?.(fullText);
          return { text: fullText, completed: fullText.length > 0 };
        } catch (error) {
          options?.onError?.(error instanceof Error ? error : new Error(String(error)));

          // Convert to typed errors for retry logic (same as chat method)
          if (error instanceof Error) {
            const message = error.message.toLowerCase();

            if (message.includes('401')) {
              throw new LLMAuthError('openai', model);
            }
            if (message.includes('429')) {
              let retryAfterMs: number | undefined;
              const apiError = error as { headers?: { get?: (name: string) => string | null } };
              if (apiError.headers?.get) {
                const retryAfter = apiError.headers.get('retry-after');
                if (retryAfter) {
                  const seconds = parseInt(retryAfter, 10);
                  if (!isNaN(seconds)) {
                    retryAfterMs = seconds * 1000;
                  }
                }
              }
              throw new LLMRateLimitError('openai', retryAfterMs, model);
            }
            if (message.includes('insufficient_quota')) {
              throw new LLMQuotaError('openai', model);
            }
            if (message.includes('econnrefused') || message.includes('fetch failed')) {
              throw new LLMConnectionError('openai', model);
            }
          }
          throw error;
        }
      },
      {
        ...LLM_RETRY_OPTIONS,
        operation: 'OpenAI streaming chat completion',
        context: { component: 'openai', metadata: { model } },
        onRetry: (error, attempt, delayMs) => {
          this.logger.debug({
            attempt,
            delayMs: Math.round(delayMs),
            error: error instanceof Error ? error.message : String(error),
            msg: `Retrying OpenAI streaming API call`,
          });
        },
      }
    );
  }
}
