/**
 * LLM client interface for abstracting different providers.
 */

import {
  DEFAULT_MODELS as DEFAULT_MODELS_CONST,
  PREMIUM_MODELS as PREMIUM_MODELS_CONST,
} from '../constants.js';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  /** Model to use */
  model?: string;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for sampling (0-2) */
  temperature?: number;
  /** Response format */
  responseFormat?: 'text' | 'json';
  /** System prompt to set context */
  systemPrompt?: string;
}

/**
 * Options for streaming completions.
 */
export interface StreamingOptions extends CompletionOptions {
  /** Callback invoked with each chunk of text as it arrives */
  onChunk?: (chunk: string) => void;
  /** Callback invoked when streaming completes with full text */
  onComplete?: (fullText: string) => void;
  /** Callback invoked if an error occurs during streaming */
  onError?: (error: Error) => void;
}

/**
 * Result of a streaming completion.
 */
export interface StreamingResult {
  /** The complete text (after streaming finishes) */
  text: string;
  /** Whether streaming completed successfully */
  completed: boolean;
}

/**
 * Provider capabilities and metadata.
 */
export interface ProviderInfo {
  /** Unique provider identifier */
  id: string;
  /** Human-readable provider name */
  name: string;
  /** Whether the provider supports JSON mode */
  supportsJSON: boolean;
  /** Whether the provider supports streaming */
  supportsStreaming: boolean;
  /** Default model for this provider */
  defaultModel: string;
}

export interface LLMClient {
  /**
   * Get provider information.
   */
  getProviderInfo(): ProviderInfo;

  /**
   * Generate a completion from a list of messages.
   */
  chat(messages: Message[], options?: CompletionOptions): Promise<string>;

  /**
   * Generate a completion from a single prompt.
   */
  complete(prompt: string, options?: CompletionOptions): Promise<string>;

  /**
   * Stream a completion from a single prompt.
   * Yields text chunks as they arrive from the LLM.
   * Returns the complete response text when done.
   */
  stream(prompt: string, options?: StreamingOptions): Promise<StreamingResult>;

  /**
   * Stream a chat completion from a list of messages.
   * Yields text chunks as they arrive from the LLM.
   * Returns the complete response text when done.
   */
  streamChat(messages: Message[], options?: StreamingOptions): Promise<StreamingResult>;

  /**
   * Parse JSON from LLM response, handling common formatting issues.
   */
  parseJSON<T>(response: string): T;
}

/**
 * Default model configurations per provider.
 * Uses budget-friendly models by default for cost efficiency.
 * @see constants.ts for the source values
 */
export const DEFAULT_MODELS: Record<LLMProviderId, string> = DEFAULT_MODELS_CONST;

/**
 * Premium model configurations for --quality flag.
 * Higher quality output but more expensive.
 * @see constants.ts for the source values
 */
export const PREMIUM_MODELS: Record<LLMProviderId, string> = PREMIUM_MODELS_CONST;

/**
 * Provider IDs.
 */
export type LLMProviderId = 'openai' | 'anthropic' | 'ollama';

/**
 * Configuration for LLM providers.
 */
export interface LLMConfig {
  /** Provider to use */
  provider: LLMProviderId;
  /** Model to use (provider-specific) */
  model?: string;
  /** API key (or env var name containing it) */
  apiKey?: string;
  /** Environment variable containing API key */
  apiKeyEnvVar?: string;
  /** Base URL for API (for proxies/self-hosted) */
  baseUrl?: string;
  /** Callback to receive actual token usage from each API call */
  onUsage?: (inputTokens: number, outputTokens: number) => void;
}

/**
 * Parse JSON from LLM response, handling common formatting issues.
 * Shared utility function for all providers.
 */
export function parseJSONResponse<T>(response: string): T {
  // Handle markdown code blocks
  let cleaned = response.trim();

  // Remove ```json or ``` wrappers
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    // Remove first line (```json or ```)
    lines.shift();
    // Remove last line (```)
    if (lines[lines.length - 1]?.trim() === '```') {
      lines.pop();
    }
    cleaned = lines.join('\n');
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON from LLM response: ${error}`);
  }
}
