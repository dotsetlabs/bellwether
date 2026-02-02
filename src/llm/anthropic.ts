/**
 * Anthropic Claude LLM client implementation.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMClient,
  Message,
  CompletionOptions,
  ProviderInfo,
  StreamingOptions,
  StreamingResult,
} from './client.js';
import { DEFAULT_MODELS, parseJSONResponse } from './client.js';
import { LLM_DEFAULTS } from '../constants.js';
import { withRetry, LLM_RETRY_OPTIONS } from '../errors/retry.js';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMQuotaError,
  LLMConnectionError,
  LLMRefusalError,
} from '../errors/index.js';
import { getLogger } from '../logging/logger.js';

/**
 * Placeholder messages for Claude message normalization.
 * Claude requires alternating user/assistant messages starting with user.
 */
const PLACEHOLDER_CONTINUE = 'Continue.';
const PLACEHOLDER_GREETING = 'Hello.';

type ErrorWithDetails = {
  status?: number;
  statusCode?: number;
  code?: string;
  type?: string;
  message?: string;
  error?: {
    code?: string;
    type?: string;
    message?: string;
  };
  headers?: { get?: (name: string) => string | null };
  cause?: { message?: string };
};

function getErrorStatus(error: unknown): number | undefined {
  const err = error as ErrorWithDetails;
  return err.status ?? err.statusCode;
}

function getErrorCode(error: unknown): string | undefined {
  const err = error as ErrorWithDetails;
  return err.code ?? err.error?.code;
}

function getErrorType(error: unknown): string | undefined {
  const err = error as ErrorWithDetails;
  return err.type ?? err.error?.type;
}

function getErrorMessage(error: unknown): string {
  const err = error as ErrorWithDetails;
  return err.error?.message ?? err.message ?? '';
}

export interface AnthropicClientOptions {
  /** API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Default model to use */
  model?: string;
  /** Base URL for API (for proxies/alternatives) */
  baseURL?: string;
  /** Callback to receive token usage from each API call */
  onUsage?: (inputTokens: number, outputTokens: number) => void;
}

/**
 * Anthropic Claude LLM client implementation.
 */
export class AnthropicClient implements LLMClient {
  private client: Anthropic;
  private defaultModel: string;
  private logger = getLogger('anthropic');
  private onUsage?: (inputTokens: number, outputTokens: number) => void;

  constructor(options?: AnthropicClientOptions) {
    const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LLMAuthError('anthropic');
    }

    this.client = new Anthropic({
      apiKey,
      baseURL: options?.baseURL,
    });

    this.defaultModel = options?.model ?? DEFAULT_MODELS.anthropic;
    this.onUsage = options?.onUsage;
  }

  getProviderInfo(): ProviderInfo {
    return {
      id: 'anthropic',
      name: 'Anthropic Claude',
      supportsJSON: false, // Claude doesn't have a JSON mode like OpenAI
      supportsStreaming: true,
      defaultModel: this.defaultModel,
    };
  }

  async chat(messages: Message[], options?: CompletionOptions): Promise<string> {
    const model = options?.model ?? this.defaultModel;

    return withRetry(
      async () => {
        // Separate system message from conversation messages
        const systemPrompt = options?.systemPrompt;

        // Convert messages to Anthropic format
        const anthropicMessages = messages.map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        }));

        // If first message has system role, extract it
        let system = systemPrompt;
        if (messages.length > 0 && messages[0].role === 'system') {
          system = system ? `${system}\n\n${messages[0].content}` : messages[0].content;
          anthropicMessages.shift();
        }

        // Claude requires messages to start with user role
        // If we have no messages after removing system, add a placeholder
        if (anthropicMessages.length === 0) {
          throw new Error('At least one user message is required');
        }

        // Ensure messages alternate between user and assistant
        // Claude is strict about this
        const normalizedMessages = this.normalizeMessageOrder(anthropicMessages);

        try {
          const response = await this.client.messages.create(
            {
              model,
              max_tokens: options?.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
              system: system,
              messages: normalizedMessages,
            },
            { signal: options?.signal }
          );

          // Track actual token usage from API response
          if (this.onUsage && response.usage) {
            this.onUsage(response.usage.input_tokens, response.usage.output_tokens);
          }

          // Check for content filtering refusal
          this.checkForRefusal(response, model);

          // Extract text content from response
          const textBlocks = response.content.filter((block) => block.type === 'text');
          if (textBlocks.length === 0) {
            throw new Error('No text content in Claude response');
          }

          return textBlocks.map((block) => block.text).join('');
        } catch (error) {
          // Don't re-process errors that are already typed LLM errors
          if (
            error instanceof LLMRefusalError ||
            error instanceof LLMAuthError ||
            error instanceof LLMRateLimitError ||
            error instanceof LLMQuotaError ||
            error instanceof LLMConnectionError
          ) {
            throw error;
          }

          // Convert to typed errors for retry logic
          if (error instanceof Error) {
            const status = getErrorStatus(error);
            const code = (getErrorCode(error) ?? '').toLowerCase();
            const type = (getErrorType(error) ?? '').toLowerCase();
            const message = getErrorMessage(error).toLowerCase();

            if (status === 401 || status === 403 || message.includes('authentication')) {
              throw new LLMAuthError('anthropic', model);
            }
            if (
              status === 429 ||
              code.includes('rate_limit') ||
              type.includes('rate_limit') ||
              message.includes('rate limit')
            ) {
              // Extract retry-after-ms header if available from Anthropic API error
              let retryAfterMs: number | undefined;
              const apiError = error as ErrorWithDetails;
              if (apiError.headers?.get) {
                // Anthropic uses retry-after-ms header (milliseconds)
                const retryAfterMsHeader = apiError.headers.get('retry-after-ms');
                if (retryAfterMsHeader) {
                  const ms = parseInt(retryAfterMsHeader, 10);
                  if (!isNaN(ms)) {
                    retryAfterMs = ms;
                    this.logger.debug({ retryAfterMs }, 'Extracted retry-after-ms header');
                  }
                }
                // Fall back to standard retry-after header (seconds)
                if (!retryAfterMs) {
                  const retryAfter = apiError.headers.get('retry-after');
                  if (retryAfter) {
                    const seconds = parseInt(retryAfter, 10);
                    if (!isNaN(seconds)) {
                      retryAfterMs = seconds * 1000;
                      this.logger.debug({ retryAfterMs }, 'Extracted retry-after header');
                    }
                  }
                }
              }
              throw new LLMRateLimitError('anthropic', retryAfterMs, model);
            }
            if (
              status === 402 ||
              code.includes('insufficient') ||
              type.includes('insufficient') ||
              message.includes('insufficient') ||
              message.includes('credit')
            ) {
              throw new LLMQuotaError('anthropic', model);
            }
            if (message.includes('econnrefused') || message.includes('fetch failed')) {
              throw new LLMConnectionError('anthropic', model);
            }
          }
          throw error;
        }
      },
      {
        ...LLM_RETRY_OPTIONS,
        operation: 'Anthropic chat completion',
        context: { component: 'anthropic', metadata: { model } },
        onRetry: (error, attempt, delayMs) => {
          this.logger.debug({
            attempt,
            delayMs: Math.round(delayMs),
            error: error instanceof Error ? error.message : String(error),
            msg: `Retrying Anthropic API call`,
          });
        },
      }
    );
  }

  /**
   * Check for content filtering refusal in Anthropic response.
   * Anthropic uses stop_reason to indicate why generation stopped.
   */
  private checkForRefusal(
    response: { stop_reason: string | null; content: Array<{ type: string; text?: string }> },
    model: string
  ): void {
    // Check stop_reason for content filtering
    if (response.stop_reason === 'content_filter') {
      throw new LLMRefusalError('anthropic', 'Content was filtered', model);
    }

    // Check for safety-related stop reasons
    if (response.stop_reason === 'safety') {
      throw new LLMRefusalError('anthropic', 'Response blocked due to safety concerns', model);
    }

    // Check content for refusal indicators
    const textBlocks = response.content.filter((block) => block.type === 'text');
    if (textBlocks.length > 0) {
      const fullText = textBlocks
        .map((block) => block.text ?? '')
        .join('')
        .toLowerCase();

      // Check for common refusal patterns in Claude's responses
      const refusalPatterns = [
        'i cannot help with',
        'i am not able to',
        "i can't assist with",
        'i cannot assist with',
        'i am unable to',
        "i won't be able to",
        'i must decline',
        'i need to refuse',
        'against my guidelines',
        'violates my ethical guidelines',
        'goes against my values',
        'i cannot provide',
        'i cannot generate',
        'harmful content',
        'dangerous content',
        'illegal content',
      ];

      for (const pattern of refusalPatterns) {
        if (fullText.includes(pattern)) {
          // Extract more context around the refusal
          const startIdx = Math.max(0, fullText.indexOf(pattern) - 20);
          const endIdx = Math.min(
            fullText.length,
            fullText.indexOf(pattern) + pattern.length + 100
          );
          const context = fullText.slice(startIdx, endIdx).trim();

          throw new LLMRefusalError('anthropic', `Model declined: "${context}..."`, model);
        }
      }
    }
  }

  /**
   * Normalize message order for Claude's requirements.
   * Claude requires alternating user/assistant messages starting with user.
   */
  private normalizeMessageOrder(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of messages) {
      if (result.length === 0) {
        // First message must be from user
        if (msg.role === 'assistant') {
          // Insert placeholder user message
          result.push({ role: 'user', content: PLACEHOLDER_CONTINUE });
        }
        result.push(msg);
      } else {
        const lastRole = result[result.length - 1].role;
        if (msg.role === lastRole) {
          // Same role as previous - merge content
          result[result.length - 1].content += `\n\n${msg.content}`;
        } else {
          result.push(msg);
        }
      }
    }

    // Ensure we end with the messages array not empty
    if (result.length === 0) {
      result.push({ role: 'user', content: PLACEHOLDER_GREETING });
    }

    return result;
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
        // Separate system message from conversation messages
        const systemPrompt = options?.systemPrompt;

        // Convert messages to Anthropic format
        const anthropicMessages = messages.map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        }));

        // If first message has system role, extract it
        let system = systemPrompt;
        if (messages.length > 0 && messages[0].role === 'system') {
          system = system ? `${system}\n\n${messages[0].content}` : messages[0].content;
          anthropicMessages.shift();
        }

        // Claude requires messages to start with user role
        if (anthropicMessages.length === 0) {
          throw new Error('At least one user message is required');
        }

        // Ensure messages alternate between user and assistant
        const normalizedMessages = this.normalizeMessageOrder(anthropicMessages);

        try {
          const stream = await this.client.messages.stream(
            {
              model,
              max_tokens: options?.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
              system: system,
              messages: normalizedMessages,
            },
            { signal: options?.signal }
          );

          let fullText = '';

          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const text = event.delta.text;
              if (text) {
                fullText += text;
                options?.onChunk?.(text);
              }
            }
          }

          // Get final message for token usage
          const finalMessage = await stream.finalMessage();

          // Track actual token usage from API response
          if (this.onUsage && finalMessage.usage) {
            this.onUsage(finalMessage.usage.input_tokens, finalMessage.usage.output_tokens);
          }

          // Check for content filtering refusal
          this.checkForRefusal(finalMessage, model);

          if (!fullText) {
            throw new Error('No text content in streaming response');
          }

          options?.onComplete?.(fullText);
          return { text: fullText, completed: true };
        } catch (error) {
          options?.onError?.(error instanceof Error ? error : new Error(String(error)));

          // Don't re-process errors that are already typed LLM errors
          if (
            error instanceof LLMRefusalError ||
            error instanceof LLMAuthError ||
            error instanceof LLMRateLimitError ||
            error instanceof LLMQuotaError ||
            error instanceof LLMConnectionError
          ) {
            throw error;
          }

          // Convert to typed errors for retry logic (same as chat method)
          if (error instanceof Error) {
            const message = error.message.toLowerCase();

            if (message.includes('401') || message.includes('authentication')) {
              throw new LLMAuthError('anthropic', model);
            }
            if (message.includes('429') || message.includes('rate limit')) {
              let retryAfterMs: number | undefined;
              const apiError = error as { headers?: { get?: (name: string) => string | null } };
              if (apiError.headers?.get) {
                const retryAfterMsHeader = apiError.headers.get('retry-after-ms');
                if (retryAfterMsHeader) {
                  const ms = parseInt(retryAfterMsHeader, 10);
                  if (!isNaN(ms)) {
                    retryAfterMs = ms;
                  }
                }
                if (!retryAfterMs) {
                  const retryAfter = apiError.headers.get('retry-after');
                  if (retryAfter) {
                    const seconds = parseInt(retryAfter, 10);
                    if (!isNaN(seconds)) {
                      retryAfterMs = seconds * 1000;
                    }
                  }
                }
              }
              throw new LLMRateLimitError('anthropic', retryAfterMs, model);
            }
            if (message.includes('insufficient') || message.includes('credit')) {
              throw new LLMQuotaError('anthropic', model);
            }
            if (message.includes('econnrefused') || message.includes('fetch failed')) {
              throw new LLMConnectionError('anthropic', model);
            }
          }
          throw error;
        }
      },
      {
        ...LLM_RETRY_OPTIONS,
        operation: 'Anthropic streaming chat completion',
        context: { component: 'anthropic', metadata: { model } },
        onRetry: (error, attempt, delayMs) => {
          this.logger.debug({
            attempt,
            delayMs: Math.round(delayMs),
            error: error instanceof Error ? error.message : String(error),
            msg: `Retrying Anthropic streaming API call`,
          });
        },
      }
    );
  }
}
