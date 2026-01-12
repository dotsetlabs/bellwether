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

export interface OpenAIClientOptions {
  /** API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Default model to use */
  model?: string;
  /** Base URL for API (for proxies/alternatives) */
  baseURL?: string;
}

/**
 * OpenAI LLM client implementation.
 */
export class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private defaultModel: string;
  private logger = getLogger('openai');

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
          const response = await this.client.chat.completions.create({
            model,
            messages: allMessages.map(m => ({
              role: m.role,
              content: m.content,
            })),
            max_tokens: options?.maxTokens ?? 4096,
            temperature: options?.temperature ?? 0.7,
            response_format: options?.responseFormat === 'json'
              ? { type: 'json_object' }
              : undefined,
          });

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
