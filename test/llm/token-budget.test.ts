import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  estimateTokens,
  estimateMessagesTokens,
  estimateWithContext,
  getContextWindow,
  truncateMessages,
  truncateText,
  TokenBudgetTracker,
  BudgetEnforcedLLMClient,
  TokenBudgetExceededError,
  withTokenBudget,
} from '../../src/llm/token-budget.js';
import type { LLMClient, Message, ProviderInfo } from '../../src/llm/client.js';

describe('Token Estimation', () => {
  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should estimate tokens for simple text', () => {
      const text = 'Hello, world!';
      const tokens = estimateTokens(text);
      // Should be roughly chars/4 with some adjustments
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(text.length);
    });

    it('should account for special characters', () => {
      const withSpecial = 'function foo() { return {}; }';
      const withoutSpecial = 'function foo return';

      const tokensWithSpecial = estimateTokens(withSpecial);
      const tokensWithoutSpecial = estimateTokens(withoutSpecial);

      // Special characters should increase token count
      expect(tokensWithSpecial).toBeGreaterThan(tokensWithoutSpecial);
    });

    it('should estimate longer text reasonably', () => {
      const longText = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
      const tokens = estimateTokens(longText);

      // Rough estimate: ~1000 words -> ~1300 tokens
      expect(tokens).toBeGreaterThan(500);
      expect(tokens).toBeLessThan(3000);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should estimate empty messages', () => {
      expect(estimateMessagesTokens([])).toBe(3);
    });

    it('should add overhead per message', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];

      const tokens = estimateMessagesTokens(messages);
      const contentTokens = estimateTokens('Hello') + estimateTokens('Hi');

      // Should include message overhead
      expect(tokens).toBeGreaterThan(contentTokens);
    });

    it('should handle system messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];

      const tokens = estimateMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(10);
    });
  });

  describe('getContextWindow', () => {
    it('should return known model context windows', () => {
      expect(getContextWindow('gpt-4')).toBe(8_000);
      expect(getContextWindow('gpt-4o')).toBe(128_000);
      expect(getContextWindow('claude-3-opus-20240229')).toBe(200_000);
    });

    it('should return default for unknown models', () => {
      expect(getContextWindow('unknown-model')).toBe(16_000);
    });

    it('should match prefixes for versioned models', () => {
      expect(getContextWindow('gpt-4o-2024-01-01')).toBe(128_000);
      expect(getContextWindow('claude-3-opus-20240229-test')).toBe(200_000);
    });
  });

  describe('estimateWithContext', () => {
    it('should check against context window', () => {
      const result = estimateWithContext('Hello world', 'gpt-4');

      expect(result.tokens).toBeGreaterThan(0);
      expect(result.contextWindow).toBe(8_000);
      expect(result.exceedsContext).toBe(false);
      expect(result.availableForOutput).toBeGreaterThan(0);
    });

    it('should detect when exceeding context', () => {
      // Create text that would exceed GPT-4's 8k context
      const longText = 'word '.repeat(10_000);
      const result = estimateWithContext(longText, 'gpt-4');

      expect(result.exceedsContext).toBe(true);
    });
  });
});

describe('Truncation', () => {
  describe('truncateText', () => {
    it('should not truncate short text', () => {
      const text = 'Hello, world!';
      expect(truncateText(text, 1000)).toBe(text);
    });

    it('should truncate long text', () => {
      const text = 'word '.repeat(1000);
      const truncated = truncateText(text, 100);

      expect(truncated.length).toBeLessThan(text.length);
      expect(truncated.endsWith('...')).toBe(true);
    });

    it('should try to truncate at word boundary', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const truncated = truncateText(text, 10);

      // Should end with ... and not cut mid-word
      expect(truncated.endsWith('...')).toBe(true);
    });
  });

  describe('truncateMessages', () => {
    it('should not truncate when within budget', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Hello' },
      ];

      const result = truncateMessages(messages, 10000);
      expect(result).toHaveLength(2);
    });

    it('should keep system message', () => {
      const messages: Message[] = [
        { role: 'system', content: 'Important system prompt' },
        { role: 'user', content: 'Message 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'user', content: 'Message 3' },
      ];

      const result = truncateMessages(messages, 50);
      expect(result[0].role).toBe('system');
    });

    it('should keep most recent messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Old message 1' },
        { role: 'user', content: 'Old message 2' },
        { role: 'user', content: 'Recent message 1' },
        { role: 'user', content: 'Recent message 2' },
      ];

      const result = truncateMessages(messages, 40, { keepSystemMessage: false });

      // Should keep most recent messages
      expect(result.some(m => m.content === 'Recent message 2')).toBe(true);
    });

    it('should respect minMessages option', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Message 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'user', content: 'Message 3' },
      ];

      const result = truncateMessages(messages, 10, {
        keepSystemMessage: false,
        minMessages: 2,
      });

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty messages', () => {
      const result = truncateMessages([], 1000);
      expect(result).toHaveLength(0);
    });
  });
});

describe('TokenBudgetTracker', () => {
  it('should track token usage', () => {
    const tracker = new TokenBudgetTracker({ maxTotalTokens: 10000 });

    tracker.recordUsage(100, 50);
    tracker.recordUsage(200, 100);

    const status = tracker.getStatus();
    expect(status.totalUsed).toBe(450);
    expect(status.remaining).toBe(9550);
  });

  it('should calculate percentage correctly', () => {
    const tracker = new TokenBudgetTracker({ maxTotalTokens: 1000 });

    tracker.recordUsage(250, 250);

    const status = tracker.getStatus();
    expect(status.percentageUsed).toBe(50);
  });

  it('should trigger warning at threshold', () => {
    const onWarning = vi.fn();
    const tracker = new TokenBudgetTracker({
      maxTotalTokens: 1000,
      warningThreshold: 0.5,
      onBudgetWarning: onWarning,
    });

    // First usage - under threshold
    tracker.recordUsage(200, 100);
    expect(onWarning).not.toHaveBeenCalled();

    // Second usage - exceeds threshold
    tracker.recordUsage(200, 100);
    expect(onWarning).toHaveBeenCalledTimes(1);

    // Third usage - already warned
    tracker.recordUsage(100, 100);
    expect(onWarning).toHaveBeenCalledTimes(1);
  });

  it('should trigger exceeded callback', () => {
    const onExceeded = vi.fn();
    const tracker = new TokenBudgetTracker({
      maxTotalTokens: 500,
      onBudgetExceeded: onExceeded,
    });

    tracker.recordUsage(300, 300);
    expect(onExceeded).toHaveBeenCalledTimes(1);
  });

  it('should check if request would exceed budget', () => {
    const tracker = new TokenBudgetTracker({ maxTotalTokens: 1000 });

    tracker.recordUsage(800, 0);

    expect(tracker.wouldExceedBudget(100, 50)).toBe(false);
    expect(tracker.wouldExceedBudget(200, 100)).toBe(true);
  });

  it('should calculate max safe input tokens', () => {
    const tracker = new TokenBudgetTracker({
      maxTotalTokens: 10000,
      maxInputTokensPerRequest: 5000,
      outputReserve: 1000,
    });

    const maxSafe = tracker.getMaxSafeInputTokens();
    expect(maxSafe).toBe(5000); // Limited by maxInputTokensPerRequest

    tracker.recordUsage(6000, 0);
    const maxSafeAfter = tracker.getMaxSafeInputTokens();
    expect(maxSafeAfter).toBeLessThan(5000); // Now limited by remaining budget
  });

  it('should reset correctly', () => {
    const tracker = new TokenBudgetTracker({ maxTotalTokens: 1000 });

    tracker.recordUsage(500, 300);
    tracker.reset();

    const status = tracker.getStatus();
    expect(status.totalUsed).toBe(0);
    expect(status.remaining).toBe(1000);
  });
});

describe('BudgetEnforcedLLMClient', () => {
  let mockClient: LLMClient;

  beforeEach(() => {
    mockClient = {
      getProviderInfo: () => ({
        id: 'test',
        name: 'Test Provider',
        supportsJSON: true,
        supportsStreaming: true,
        defaultModel: 'test-model',
      } as ProviderInfo),
      chat: vi.fn().mockResolvedValue('Response'),
      complete: vi.fn().mockResolvedValue('Response'),
      stream: vi.fn().mockResolvedValue({ text: 'Response', completed: true }),
      streamChat: vi.fn().mockResolvedValue({ text: 'Response', completed: true }),
      parseJSON: vi.fn().mockImplementation((r: string) => JSON.parse(r)),
    };
  });

  it('should pass through normal requests', async () => {
    const client = new BudgetEnforcedLLMClient(mockClient);

    await client.chat([{ role: 'user', content: 'Hello' }]);

    expect(mockClient.chat).toHaveBeenCalled();
  });

  it('should track usage across requests', async () => {
    const client = new BudgetEnforcedLLMClient(mockClient, {
      maxTotalTokens: 10000,
    });

    await client.chat([{ role: 'user', content: 'Hello' }]);
    await client.complete('Test prompt');

    const status = client.getBudgetStatus();
    expect(status.totalUsed).toBeGreaterThan(0);
  });

  it('should throw in strict mode when budget exceeded', async () => {
    const client = new BudgetEnforcedLLMClient(mockClient, {
      maxTotalTokens: 10,
      strict: true,
    });

    await expect(
      client.chat([{ role: 'user', content: 'This is a long message that exceeds budget' }])
    ).rejects.toThrow(TokenBudgetExceededError);
  });

  it('should truncate in non-strict mode', async () => {
    const client = new BudgetEnforcedLLMClient(mockClient, {
      maxTotalTokens: 100,
      maxInputTokensPerRequest: 20,
      outputReserve: 10,
      model: 'gpt-4', // 8k context window
    });

    // This message exceeds the total budget
    const longMessage = 'word '.repeat(200);
    await client.complete(longMessage);

    // Should have been called with truncated content
    expect(mockClient.complete).toHaveBeenCalled();
    const callArg = (mockClient.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.length).toBeLessThan(longMessage.length);
  });

  it('should reset budget', async () => {
    const client = new BudgetEnforcedLLMClient(mockClient, {
      maxTotalTokens: 1000,
    });

    await client.chat([{ role: 'user', content: 'Hello' }]);
    expect(client.getBudgetStatus().totalUsed).toBeGreaterThan(0);

    client.resetBudget();
    expect(client.getBudgetStatus().totalUsed).toBe(0);
  });
});

describe('withTokenBudget', () => {
  it('should create budget-enforced client', () => {
    const mockClient: LLMClient = {
      getProviderInfo: () => ({
        id: 'test',
        name: 'Test',
        supportsJSON: true,
        supportsStreaming: true,
        defaultModel: 'test',
      } as ProviderInfo),
      chat: vi.fn().mockResolvedValue(''),
      complete: vi.fn().mockResolvedValue(''),
      stream: vi.fn().mockResolvedValue({ text: '', completed: true }),
      streamChat: vi.fn().mockResolvedValue({ text: '', completed: true }),
      parseJSON: vi.fn(),
    };

    const wrapped = withTokenBudget(mockClient, { maxTotalTokens: 5000 });

    expect(wrapped).toBeInstanceOf(BudgetEnforcedLLMClient);
    expect(wrapped.getBudgetStatus().totalBudget).toBe(5000);
  });
});
