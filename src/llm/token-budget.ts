/**
 * Token budget enforcement for LLM API calls.
 *
 * Provides pre-estimation, budget tracking, context window management,
 * and graceful truncation.
 */

import type { Message, LLMClient, CompletionOptions, StreamingOptions, StreamingResult, ProviderInfo } from './client.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger({ name: 'token-budget' });

/**
 * Context window sizes for different models (in tokens).
 */
const CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI GPT-5 series
  'gpt-5.2': 256_000,
  'gpt-5.1': 256_000,
  'gpt-5': 200_000,
  'gpt-5-mini': 128_000,
  'gpt-5-nano': 64_000,
  // OpenAI GPT-4 series
  'gpt-4.1': 128_000,
  'gpt-4.1-mini': 128_000,
  'gpt-4.1-nano': 64_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_000,
  'gpt-3.5-turbo': 16_000,
  // Anthropic Claude 4.5
  'claude-opus-4-5': 200_000,
  'claude-opus-4-5-20251101': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-sonnet-4-5-20250929': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  // Anthropic Claude 4
  'claude-opus-4-20250514': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  // Anthropic Claude 3.x
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-opus-20240229': 200_000,
  'claude-3-sonnet-20240229': 200_000,
  'claude-3-haiku-20240307': 200_000,
  // Ollama (varies by model, using conservative defaults)
  'llama3.2': 128_000,
  'llama3.1': 128_000,
  'mixtral': 32_000,
  'codellama': 16_000,
};

/**
 * Default context window for unknown models.
 */
const DEFAULT_CONTEXT_WINDOW = 16_000;

/**
 * Token budget configuration options.
 */
export interface TokenBudgetOptions {
  /** Maximum total tokens for the session (input + output) */
  maxTotalTokens?: number;
  /** Maximum input tokens per request */
  maxInputTokensPerRequest?: number;
  /** Maximum output tokens per request */
  maxOutputTokensPerRequest?: number;
  /** Warning threshold (0-1) - warn when this percentage of budget is used */
  warningThreshold?: number;
  /** Reserve tokens for output (don't use entire context window for input) */
  outputReserve?: number;
  /** Callback when approaching budget limit */
  onBudgetWarning?: (used: number, total: number, percentage: number) => void;
  /** Callback when budget is exceeded */
  onBudgetExceeded?: (used: number, total: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<TokenBudgetOptions, 'onBudgetWarning' | 'onBudgetExceeded'>> = {
  maxTotalTokens: 1_000_000, // 1M tokens default budget
  maxInputTokensPerRequest: 100_000,
  maxOutputTokensPerRequest: 8_000,
  warningThreshold: 0.8,
  outputReserve: 4_000,
};

/**
 * Token estimation result.
 */
export interface TokenEstimate {
  /** Estimated token count */
  tokens: number;
  /** Whether this exceeds the context window */
  exceedsContext: boolean;
  /** Context window size for the model */
  contextWindow: number;
  /** Available tokens after this input */
  availableForOutput: number;
}

/**
 * Budget status.
 */
export interface BudgetStatus {
  /** Total tokens used */
  totalUsed: number;
  /** Total budget */
  totalBudget: number;
  /** Percentage of budget used */
  percentageUsed: number;
  /** Whether warning threshold is exceeded */
  warningTriggered: boolean;
  /** Whether budget is exceeded */
  budgetExceeded: boolean;
  /** Remaining tokens */
  remaining: number;
}

/**
 * Estimate tokens from text using a character-based heuristic.
 * This is a rough approximation (~4 characters per token for English text).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // More accurate estimation considering:
  // - Whitespace tokens
  // - Special characters
  // - Code tends to have more tokens per character
  const chars = text.length;
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const specialChars = (text.match(/[{}[\]()<>:;,."'`]/g) || []).length;

  // Weighted estimate
  const baseTokens = chars / 4;
  const wordAdjustment = words * 0.3;
  const specialAdjustment = specialChars * 0.5;

  return Math.ceil(baseTokens + wordAdjustment + specialAdjustment);
}

/**
 * Estimate tokens for a message array.
 */
export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    // Role overhead (~4 tokens per message for role/formatting)
    total += 4;
    total += estimateTokens(msg.content);
  }
  // Add overhead for message structure
  total += 3;
  return total;
}

/**
 * Get context window size for a model.
 */
export function getContextWindow(model: string): number {
  // Try exact match first
  if (model in CONTEXT_WINDOWS) {
    return CONTEXT_WINDOWS[model];
  }
  // Try prefix matching for versioned models
  for (const [key, value] of Object.entries(CONTEXT_WINDOWS)) {
    if (model.startsWith(key)) {
      return value;
    }
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Estimate tokens and check against context window.
 */
export function estimateWithContext(
  text: string | Message[],
  model: string,
  outputReserve: number = DEFAULT_OPTIONS.outputReserve
): TokenEstimate {
  const tokens = typeof text === 'string'
    ? estimateTokens(text)
    : estimateMessagesTokens(text);

  const contextWindow = getContextWindow(model);
  const availableForInput = contextWindow - outputReserve;
  const availableForOutput = Math.max(0, contextWindow - tokens);

  return {
    tokens,
    exceedsContext: tokens > availableForInput,
    contextWindow,
    availableForOutput,
  };
}

/**
 * Truncate messages to fit within token budget using sliding window.
 * Keeps system message and most recent messages.
 */
export function truncateMessages(
  messages: Message[],
  maxTokens: number,
  options: { keepSystemMessage?: boolean; minMessages?: number } = {}
): Message[] {
  const { keepSystemMessage = true, minMessages = 2 } = options;

  if (messages.length === 0) return [];

  // Separate system message from conversation
  let systemMessage: Message | null = null;
  let conversation: Message[] = [];

  if (keepSystemMessage && messages[0]?.role === 'system') {
    systemMessage = messages[0];
    conversation = messages.slice(1);
  } else {
    conversation = [...messages];
  }

  // Calculate system message tokens
  const systemTokens = systemMessage ? estimateTokens(systemMessage.content) + 4 : 0;
  const availableTokens = maxTokens - systemTokens;

  if (availableTokens <= 0) {
    // System message alone exceeds budget - truncate it
    if (systemMessage) {
      const truncatedSystem = truncateText(systemMessage.content, maxTokens - 10);
      return [{ role: 'system', content: truncatedSystem }];
    }
    return [];
  }

  // Use sliding window - keep most recent messages that fit
  const result: Message[] = [];
  let currentTokens = 0;

  // Work backwards from most recent
  for (let i = conversation.length - 1; i >= 0; i--) {
    const msg = conversation[i];
    const msgTokens = estimateTokens(msg.content) + 4;

    if (currentTokens + msgTokens <= availableTokens || result.length < minMessages) {
      result.unshift(msg);
      currentTokens += msgTokens;
    } else {
      break;
    }
  }

  // Add system message back at the start
  if (systemMessage) {
    result.unshift(systemMessage);
  }

  return result;
}

/**
 * Truncate text to approximately fit within token budget.
 */
export function truncateText(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  // Calculate approximate character limit
  const ratio = maxTokens / estimated;
  const charLimit = Math.floor(text.length * ratio * 0.95); // 5% safety margin

  // Try to truncate at word boundary
  let truncated = text.slice(0, charLimit);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > charLimit * 0.8) {
    truncated = truncated.slice(0, lastSpace);
  }

  return truncated + '...';
}

/**
 * Token budget tracker for a session.
 */
export class TokenBudgetTracker {
  private readonly options: Required<Omit<TokenBudgetOptions, 'onBudgetWarning' | 'onBudgetExceeded'>>;
  private readonly onBudgetWarning?: TokenBudgetOptions['onBudgetWarning'];
  private readonly onBudgetExceeded?: TokenBudgetOptions['onBudgetExceeded'];

  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private warningEmitted = false;

  constructor(options: TokenBudgetOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.onBudgetWarning = options.onBudgetWarning;
    this.onBudgetExceeded = options.onBudgetExceeded;
  }

  /**
   * Record token usage.
   */
  recordUsage(inputTokens: number, outputTokens: number): void {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;

    const status = this.getStatus();

    // Check for budget exceeded
    if (status.budgetExceeded && this.onBudgetExceeded) {
      this.onBudgetExceeded(status.totalUsed, status.totalBudget);
    }
    // Check for warning threshold
    else if (status.warningTriggered && !this.warningEmitted && this.onBudgetWarning) {
      this.onBudgetWarning(status.totalUsed, status.totalBudget, status.percentageUsed);
      this.warningEmitted = true;
    }
  }

  /**
   * Get current budget status.
   */
  getStatus(): BudgetStatus {
    const totalUsed = this.totalInputTokens + this.totalOutputTokens;
    const percentageUsed = (totalUsed / this.options.maxTotalTokens) * 100;

    return {
      totalUsed,
      totalBudget: this.options.maxTotalTokens,
      percentageUsed,
      warningTriggered: percentageUsed >= this.options.warningThreshold * 100,
      budgetExceeded: totalUsed >= this.options.maxTotalTokens,
      remaining: Math.max(0, this.options.maxTotalTokens - totalUsed),
    };
  }

  /**
   * Check if a request would exceed the budget.
   */
  wouldExceedBudget(estimatedInputTokens: number, expectedOutputTokens: number = 1000): boolean {
    const status = this.getStatus();
    return (status.totalUsed + estimatedInputTokens + expectedOutputTokens) > this.options.maxTotalTokens;
  }

  /**
   * Get maximum safe input tokens for next request.
   */
  getMaxSafeInputTokens(): number {
    const status = this.getStatus();
    const remaining = status.remaining - this.options.outputReserve;
    return Math.min(remaining, this.options.maxInputTokensPerRequest);
  }

  /**
   * Reset the tracker.
   */
  reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.warningEmitted = false;
  }
}

/**
 * Budget-aware error.
 */
export class TokenBudgetExceededError extends Error {
  readonly used: number;
  readonly budget: number;
  readonly requested: number;

  constructor(used: number, budget: number, requested: number) {
    super(`Token budget exceeded: used ${used} + requested ${requested} > budget ${budget}`);
    this.name = 'TokenBudgetExceededError';
    this.used = used;
    this.budget = budget;
    this.requested = requested;
  }
}

/**
 * Wrapper that enforces token budget on an LLM client.
 */
export class BudgetEnforcedLLMClient implements LLMClient {
  private readonly client: LLMClient;
  private readonly tracker: TokenBudgetTracker;
  private readonly model: string;
  private readonly strict: boolean;

  constructor(
    client: LLMClient,
    options: TokenBudgetOptions & { model?: string; strict?: boolean } = {}
  ) {
    this.client = client;
    this.tracker = new TokenBudgetTracker(options);
    this.model = options.model ?? client.getProviderInfo().defaultModel;
    this.strict = options.strict ?? false;
  }

  getProviderInfo(): ProviderInfo {
    return this.client.getProviderInfo();
  }

  async chat(messages: Message[], options?: CompletionOptions): Promise<string> {
    const model = options?.model ?? this.model;
    const estimate = estimateWithContext(messages, model);

    // Check if we need to truncate
    if (estimate.exceedsContext || this.tracker.wouldExceedBudget(estimate.tokens)) {
      if (this.strict) {
        const status = this.tracker.getStatus();
        throw new TokenBudgetExceededError(status.totalUsed, status.totalBudget, estimate.tokens);
      }

      // Truncate messages to fit
      const maxTokens = Math.min(
        estimate.contextWindow - (options?.maxTokens ?? DEFAULT_OPTIONS.outputReserve),
        this.tracker.getMaxSafeInputTokens()
      );

      logger.warn({ originalTokens: estimate.tokens, maxTokens }, 'Truncating messages to fit budget');
      messages = truncateMessages(messages, maxTokens);
    }

    const result = await this.client.chat(messages, options);

    // Estimate output tokens and record
    const outputTokens = estimateTokens(result);
    const inputTokens = estimateMessagesTokens(messages);
    this.tracker.recordUsage(inputTokens, outputTokens);

    return result;
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const model = options?.model ?? this.model;
    const estimate = estimateWithContext(prompt, model);

    if (estimate.exceedsContext || this.tracker.wouldExceedBudget(estimate.tokens)) {
      if (this.strict) {
        const status = this.tracker.getStatus();
        throw new TokenBudgetExceededError(status.totalUsed, status.totalBudget, estimate.tokens);
      }

      const maxTokens = Math.min(
        estimate.contextWindow - (options?.maxTokens ?? DEFAULT_OPTIONS.outputReserve),
        this.tracker.getMaxSafeInputTokens()
      );

      logger.warn({ originalTokens: estimate.tokens, maxTokens }, 'Truncating prompt to fit budget');
      prompt = truncateText(prompt, maxTokens);
    }

    const result = await this.client.complete(prompt, options);

    const outputTokens = estimateTokens(result);
    const inputTokens = estimateTokens(prompt);
    this.tracker.recordUsage(inputTokens, outputTokens);

    return result;
  }

  async stream(prompt: string, options?: StreamingOptions): Promise<StreamingResult> {
    const model = options?.model ?? this.model;
    const estimate = estimateWithContext(prompt, model);

    if (estimate.exceedsContext || this.tracker.wouldExceedBudget(estimate.tokens)) {
      if (this.strict) {
        const status = this.tracker.getStatus();
        throw new TokenBudgetExceededError(status.totalUsed, status.totalBudget, estimate.tokens);
      }

      const maxTokens = Math.min(
        estimate.contextWindow - (options?.maxTokens ?? DEFAULT_OPTIONS.outputReserve),
        this.tracker.getMaxSafeInputTokens()
      );

      prompt = truncateText(prompt, maxTokens);
    }

    const result = await this.client.stream(prompt, options);

    const outputTokens = estimateTokens(result.text);
    const inputTokens = estimateTokens(prompt);
    this.tracker.recordUsage(inputTokens, outputTokens);

    return result;
  }

  async streamChat(messages: Message[], options?: StreamingOptions): Promise<StreamingResult> {
    const model = options?.model ?? this.model;
    const estimate = estimateWithContext(messages, model);

    if (estimate.exceedsContext || this.tracker.wouldExceedBudget(estimate.tokens)) {
      if (this.strict) {
        const status = this.tracker.getStatus();
        throw new TokenBudgetExceededError(status.totalUsed, status.totalBudget, estimate.tokens);
      }

      const maxTokens = Math.min(
        estimate.contextWindow - (options?.maxTokens ?? DEFAULT_OPTIONS.outputReserve),
        this.tracker.getMaxSafeInputTokens()
      );

      messages = truncateMessages(messages, maxTokens);
    }

    const result = await this.client.streamChat(messages, options);

    const outputTokens = estimateTokens(result.text);
    const inputTokens = estimateMessagesTokens(messages);
    this.tracker.recordUsage(inputTokens, outputTokens);

    return result;
  }

  parseJSON<T>(response: string): T {
    return this.client.parseJSON(response);
  }

  /**
   * Get current budget status.
   */
  getBudgetStatus(): BudgetStatus {
    return this.tracker.getStatus();
  }

  /**
   * Reset the budget tracker.
   */
  resetBudget(): void {
    this.tracker.reset();
  }
}

/**
 * Create a budget-enforced wrapper around an LLM client.
 */
export function withTokenBudget(
  client: LLMClient,
  options?: TokenBudgetOptions & { model?: string; strict?: boolean }
): BudgetEnforcedLLMClient {
  return new BudgetEnforcedLLMClient(client, options);
}
