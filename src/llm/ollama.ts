/**
 * Ollama LLM client implementation for local models.
 */

import type {
  LLMClient,
  Message,
  CompletionOptions,
  ProviderInfo,
  StreamingOptions,
  StreamingResult,
} from './client.js';
import { DEFAULT_MODELS, parseJSONResponse } from './client.js';
import { withRetry, LLM_RETRY_OPTIONS } from '../errors/retry.js';
import { LLMConnectionError, BellwetherError } from '../errors/index.js';
import { getLogger } from '../logging/logger.js';
import { LLM_DEFAULTS } from '../constants.js';

export interface OllamaClientOptions {
  /** Base URL for Ollama API (defaults to http://localhost:11434) */
  baseUrl?: string;
  /** Default model to use */
  model?: string;
  /** Callback to receive token usage from each API call */
  onUsage?: (inputTokens: number, outputTokens: number) => void;
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
 * Streaming chunk from Ollama API.
 */
interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Ollama LLM client for local model inference.
 */
export class OllamaClient implements LLMClient {
  private baseUrl: string;
  private defaultModel: string;
  private logger = getLogger('ollama');
  private onUsage?: (inputTokens: number, outputTokens: number) => void;

  constructor(options?: OllamaClientOptions) {
    this.baseUrl = options?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? LLM_DEFAULTS.OLLAMA_BASE_URL;
    this.defaultModel = options?.model ?? DEFAULT_MODELS.ollama;
    this.onUsage = options?.onUsage;
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
            temperature: options?.temperature ?? LLM_DEFAULTS.TEMPERATURE,
            num_predict: options?.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
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
            signal: options?.signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error (${response.status}): ${errorText}`);
          }

          const result = (await response.json()) as OllamaChatResponse;

          if (!result.message?.content) {
            throw new Error('No content in Ollama response');
          }

          // Track token usage from Ollama response
          if (this.onUsage) {
            const promptTokens = result.prompt_eval_count ?? 0;
            const completionTokens = result.eval_count ?? 0;
            if (promptTokens > 0 || completionTokens > 0) {
              this.onUsage(promptTokens, completionTokens);
              this.logger.debug({
                promptTokens,
                completionTokens,
                msg: 'Ollama token usage tracked',
              });
            }
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
              throw new BellwetherError(
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

  async stream(prompt: string, options?: StreamingOptions): Promise<StreamingResult> {
    return this.streamChat([{ role: 'user', content: prompt }], options);
  }

  async streamChat(messages: Message[], options?: StreamingOptions): Promise<StreamingResult> {
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
          stream: true, // Enable streaming
          options: {
            temperature: options?.temperature ?? LLM_DEFAULTS.TEMPERATURE,
            num_predict: options?.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
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
            signal: options?.signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error (${response.status}): ${errorText}`);
          }

          if (!response.body) {
            throw new Error('No response body for streaming');
          }

          // Read the NDJSON stream
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          let promptTokens = 0;
          let completionTokens = 0;
          let buffer = '';

          try {
            let done = false;
            while (!done) {
              const result = await reader.read();
              done = result.done;
              const value = result.value;
              if (done) break;

              // Decode chunk and add to buffer
              buffer += decoder.decode(value, { stream: true });

              // Process complete lines (NDJSON format)
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  const chunk = JSON.parse(line) as OllamaStreamChunk;

                  if (chunk.message?.content) {
                    fullText += chunk.message.content;
                    options?.onChunk?.(chunk.message.content);
                  }

                  // Track token counts from final chunk
                  if (chunk.done) {
                    promptTokens = chunk.prompt_eval_count ?? 0;
                    completionTokens = chunk.eval_count ?? 0;
                  }
                } catch {
                  // Skip malformed JSON lines
                  this.logger.debug({ line }, 'Skipping malformed stream line');
                }
              }
            }

            // Process any remaining buffer
            if (buffer.trim()) {
              try {
                const chunk = JSON.parse(buffer) as OllamaStreamChunk;
                if (chunk.message?.content) {
                  fullText += chunk.message.content;
                  options?.onChunk?.(chunk.message.content);
                }
                if (chunk.done) {
                  promptTokens = chunk.prompt_eval_count ?? 0;
                  completionTokens = chunk.eval_count ?? 0;
                }
              } catch (parseError) {
                // Log parse error for debugging
                this.logger.debug(
                  {
                    buffer,
                    error: parseError instanceof Error ? parseError.message : String(parseError),
                  },
                  'Failed to parse final buffer chunk'
                );
              }
            }
          } finally {
            reader.releaseLock();
          }

          // Track token usage
          if (this.onUsage && (promptTokens > 0 || completionTokens > 0)) {
            this.onUsage(promptTokens, completionTokens);
            this.logger.debug({
              promptTokens,
              completionTokens,
              msg: 'Ollama streaming token usage tracked',
            });
          }

          if (!fullText) {
            throw new Error('No content in Ollama streaming response');
          }

          options?.onComplete?.(fullText);
          return { text: fullText, completed: true };
        } catch (error) {
          options?.onError?.(error instanceof Error ? error : new Error(String(error)));

          if (error instanceof Error) {
            const message = error.message.toLowerCase();

            // Check for connection errors - these are retryable
            if (message.includes('econnrefused') || message.includes('fetch failed')) {
              throw new LLMConnectionError('ollama', model, undefined, error);
            }

            // Check for model not found - not retryable
            if (message.includes('not found') || message.includes('does not exist')) {
              throw new BellwetherError(
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
        operation: 'Ollama streaming chat completion',
        context: { component: 'ollama', metadata: { model, baseUrl: this.baseUrl } },
        onRetry: (error, attempt, delayMs) => {
          this.logger.debug({
            attempt,
            delayMs: Math.round(delayMs),
            error: error instanceof Error ? error.message : String(error),
            msg: `Retrying Ollama streaming API call`,
          });
        },
      }
    );
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
    } catch (error) {
      this.logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Ollama availability check failed'
      );
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

      const result = (await response.json()) as { models?: Array<{ name: string }> };
      return result.models?.map((m) => m.name) ?? [];
    } catch (error) {
      this.logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to list Ollama models'
      );
      return [];
    }
  }
}
