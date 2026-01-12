/**
 * Ollama LLM client implementation for local models.
 */

import type { LLMClient, Message, CompletionOptions, ProviderInfo } from './client.js';
import { DEFAULT_MODELS, parseJSONResponse } from './client.js';
import { withRetry, LLM_RETRY_OPTIONS } from '../errors/retry.js';
import { LLMConnectionError, InquestError } from '../errors/index.js';
import { getLogger } from '../logging/logger.js';

export interface OllamaClientOptions {
  /** Base URL for Ollama API (defaults to http://localhost:11434) */
  baseUrl?: string;
  /** Default model to use */
  model?: string;
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
  format?: 'json';
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama LLM client for local model inference.
 */
export class OllamaClient implements LLMClient {
  private baseUrl: string;
  private defaultModel: string;
  private logger = getLogger('ollama');

  constructor(options?: OllamaClientOptions) {
    this.baseUrl = options?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.defaultModel = options?.model ?? DEFAULT_MODELS.ollama;
  }

  getProviderInfo(): ProviderInfo {
    return {
      id: 'ollama',
      name: 'Ollama (Local)',
      supportsJSON: true, // Ollama supports format: 'json'
      supportsStreaming: true,
      defaultModel: this.defaultModel,
    };
  }

  async chat(messages: Message[], options?: CompletionOptions): Promise<string> {
    const model = options?.model ?? this.defaultModel;

    return withRetry(
      async () => {
        // Build messages array with optional system prompt
        const allMessages: OllamaChatMessage[] = [];

        if (options?.systemPrompt) {
          allMessages.push({
            role: 'system',
            content: options.systemPrompt,
          });
        }

        for (const msg of messages) {
          allMessages.push({
            role: msg.role,
            content: msg.content,
          });
        }

        const request: OllamaChatRequest = {
          model,
          messages: allMessages,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 4096,
          },
        };

        // Add JSON format if requested
        if (options?.responseFormat === 'json') {
          request.format = 'json';
        }

        try {
          const response = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error (${response.status}): ${errorText}`);
          }

          const result = await response.json() as OllamaChatResponse;

          if (!result.message?.content) {
            throw new Error('No content in Ollama response');
          }

          return result.message.content;
        } catch (error) {
          if (error instanceof Error) {
            const message = error.message.toLowerCase();

            // Check for connection errors - these are retryable
            if (message.includes('econnrefused') || message.includes('fetch failed')) {
              throw new LLMConnectionError('ollama', model, undefined, error);
            }

            // Check for model not found - not retryable
            if (message.includes('not found') || message.includes('does not exist')) {
              throw new InquestError(
                `Model "${model}" not found. Pull it with: ollama pull ${model}`,
                {
                  code: 'LLM_MODEL_NOT_FOUND',
                  severity: 'high',
                  retryable: 'terminal',
                  context: { component: 'ollama', metadata: { model } },
                  cause: error,
                }
              );
            }
          }
          throw error;
        }
      },
      {
        ...LLM_RETRY_OPTIONS,
        maxAttempts: 2, // Ollama is local, fewer retries needed
        operation: 'Ollama chat completion',
        context: { component: 'ollama', metadata: { model, baseUrl: this.baseUrl } },
        onRetry: (error, attempt, delayMs) => {
          this.logger.debug({
            attempt,
            delayMs: Math.round(delayMs),
            error: error instanceof Error ? error.message : String(error),
            msg: `Retrying Ollama API call`,
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

  /**
   * Check if Ollama is running and accessible.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models.
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return [];
      }

      const result = await response.json() as { models?: Array<{ name: string }> };
      return result.models?.map(m => m.name) ?? [];
    } catch {
      return [];
    }
  }
}
