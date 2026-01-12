/**
 * LLM module - multi-provider language model support.
 */

// Types and interfaces
export type {
  LLMClient,
  Message,
  CompletionOptions,
  ProviderInfo,
  LLMConfig,
  LLMProviderId,
} from './client.js';

export { DEFAULT_MODELS, parseJSONResponse } from './client.js';

// Provider implementations
export { OpenAIClient } from './openai.js';
export type { OpenAIClientOptions } from './openai.js';

export { AnthropicClient } from './anthropic.js';
export type { AnthropicClientOptions } from './anthropic.js';

export { OllamaClient } from './ollama.js';
export type { OllamaClientOptions } from './ollama.js';

// Factory functions
export {
  createLLMClient,
  createAutoClient,
  detectProvider,
  checkProviderAvailability,
  getDefaultModel,
  getSupportedProviders,
} from './factory.js';
export type { ProviderAvailability } from './factory.js';
