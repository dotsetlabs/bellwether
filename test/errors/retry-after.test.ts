import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, LLM_RETRY_OPTIONS } from '../../src/errors/retry.js';
import { LLMRateLimitError } from '../../src/errors/types.js';

describe('Retry-After handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should use server-provided retry delay when available', async () => {
    let attempt = 0;
    const serverDelayMs = 5000;

    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) {
        // First attempt fails with rate limit including retry-after
        throw new LLMRateLimitError('openai', serverDelayMs, 'gpt-4');
      }
      return Promise.resolve('success');
    });

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const resultPromise = withRetry(fn, {
      ...LLM_RETRY_OPTIONS,
      maxAttempts: 3,
      initialDelayMs: 1000, // Default would be 1000ms
    });

    // First call fails immediately
    await vi.advanceTimersByTimeAsync(0);

    // Should wait the server-specified delay (5000ms), not the default (1000ms)
    // Find the retry setTimeout call (ignoring shorter timers)
    const retryCall = setTimeoutSpy.mock.calls.find(call => {
      const delay = call[1] as number;
      // The delay should be close to serverDelayMs (5000) but capped at maxDelayMs (60000)
      return delay >= 4000 && delay <= 6000;
    });

    expect(retryCall).toBeDefined();
    const actualDelay = retryCall?.[1] as number;
    // Allow some variance due to potential capping
    expect(actualDelay).toBeLessThanOrEqual(serverDelayMs);

    // Advance past the retry delay
    await vi.advanceTimersByTimeAsync(6000);

    const result = await resultPromise;
    expect(result).toBe('success');
    expect(attempt).toBe(2);
  });

  it('should cap server delay at maxDelayMs', async () => {
    let attempt = 0;
    const serverDelayMs = 120000; // 2 minutes - exceeds default max
    const maxDelayMs = 60000; // 1 minute cap

    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) {
        throw new LLMRateLimitError('openai', serverDelayMs, 'gpt-4');
      }
      return Promise.resolve('success');
    });

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const resultPromise = withRetry(fn, {
      ...LLM_RETRY_OPTIONS,
      maxAttempts: 3,
      maxDelayMs,
    });

    // First call fails
    await vi.advanceTimersByTimeAsync(0);

    // Should cap at maxDelayMs (60000), not use serverDelayMs (120000)
    const retryCall = setTimeoutSpy.mock.calls.find(call => {
      const delay = call[1] as number;
      return delay >= 50000 && delay <= 65000;
    });

    expect(retryCall).toBeDefined();
    const actualDelay = retryCall?.[1] as number;
    expect(actualDelay).toBeLessThanOrEqual(maxDelayMs);

    // Advance to complete
    await vi.advanceTimersByTimeAsync(maxDelayMs + 1000);
    await resultPromise;
  });

  it('should fall back to exponential backoff when no retry-after provided', async () => {
    let attempt = 0;
    const initialDelayMs = 1000;

    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) {
        // Rate limit error without retry-after
        throw new LLMRateLimitError('openai', undefined, 'gpt-4');
      }
      return Promise.resolve('success');
    });

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const resultPromise = withRetry(fn, {
      ...LLM_RETRY_OPTIONS,
      maxAttempts: 3,
      initialDelayMs,
      jitter: false, // Disable jitter for predictable testing
    });

    await vi.advanceTimersByTimeAsync(0);

    // Should use default initial delay
    const retryCall = setTimeoutSpy.mock.calls.find(call => {
      const delay = call[1] as number;
      return delay >= 500 && delay <= 1500;
    });

    expect(retryCall).toBeDefined();

    await vi.advanceTimersByTimeAsync(2000);
    await resultPromise;
  });
});

describe('LLMRateLimitError', () => {
  it('should store retryAfterMs', () => {
    const error = new LLMRateLimitError('openai', 5000, 'gpt-4');
    expect(error.retryAfterMs).toBe(5000);
    expect(error.provider).toBe('openai');
    expect(error.model).toBe('gpt-4');
  });

  it('should handle undefined retryAfterMs', () => {
    const error = new LLMRateLimitError('anthropic', undefined, 'claude-3');
    expect(error.retryAfterMs).toBeUndefined();
  });

  it('should be retryable', () => {
    const error = new LLMRateLimitError('openai', 1000);
    expect(error.retryable).toBe('retryable');
  });
});
