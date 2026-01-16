import OpenAI from 'openai';
import type { LLMClient, Message, CompletionOptions, ProviderInfo } from './client.js';
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
 * Check if a model has restricted parameters (newer reasoning/GPT-5 models).
 */
function hasRestrictedParams(model: string): boolean {
  const modelLower = model.toLowerCase();
  return MODELS_WITH_RESTRICTED_PARAMS.some(prefix =>
    modelLower.startsWith(prefix)
  );
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
          const maxTokensValue = options?.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS;
          const restrictedParams = hasRestrictedParams(model);

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
              throw new LLMRateLimitError('openai', undefined, model);
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
}
