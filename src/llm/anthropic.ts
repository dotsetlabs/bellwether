/**
 * Anthropic Claude LLM client implementation.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMClient, Message, CompletionOptions, ProviderInfo } from './client.js';
import { DEFAULT_MODELS, parseJSONResponse } from './client.js';
import { withRetry, LLM_RETRY_OPTIONS } from '../errors/retry.js';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMQuotaError,
  LLMConnectionError,
} from '../errors/index.js';
import { getLogger } from '../logging/logger.js';

/**
 * Placeholder messages for Claude message normalization.
 * Claude requires alternating user/assistant messages starting with user.
 */
const PLACEHOLDER_CONTINUE = 'Continue.';
const PLACEHOLDER_GREETING = 'Hello.';

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
        const anthropicMessages = messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
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
          const response = await this.client.messages.create({
            model,
            max_tokens: options?.maxTokens ?? 4096,
            system: system,
            messages: normalizedMessages,
          });

          // Track actual token usage from API response
          if (this.onUsage && response.usage) {
            this.onUsage(
              response.usage.input_tokens,
              response.usage.output_tokens
            );
          }

          // Extract text content from response
          const textBlocks = response.content.filter(block => block.type === 'text');
          if (textBlocks.length === 0) {
            throw new Error('No text content in Claude response');
          }

          return textBlocks.map(block => block.text).join('');
        } catch (error) {
          // Convert to typed errors for retry logic
          if (error instanceof Error) {
            const message = error.message.toLowerCase();

            if (message.includes('401') || message.includes('authentication')) {
              throw new LLMAuthError('anthropic', model);
            }
            if (message.includes('429') || message.includes('rate')) {
              throw new LLMRateLimitError('anthropic', undefined, model);
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
          result[result.length - 1].content += '\n\n' + msg.content;
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
}
