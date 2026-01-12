/**
 * LLM client interface for abstracting different providers.
 */

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
   * Parse JSON from LLM response, handling common formatting issues.
   */
  parseJSON<T>(response: string): T;
}

/**
 * Default model configurations per provider.
 */
export const DEFAULT_MODELS: Record<LLMProviderId, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  ollama: 'llama3.2',
};

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
