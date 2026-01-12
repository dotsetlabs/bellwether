import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  withRetry,
  createRetryWrapper,
  createCircuitBreaker,
  LLM_RETRY_OPTIONS,
  TRANSPORT_RETRY_OPTIONS,
  TOOL_CALL_RETRY_OPTIONS,
} from '../../src/errors/retry.js';
import {
  InquestError,
  TimeoutError,
  ConnectionError,
  LLMRateLimitError,
  LLMAuthError,
  LLMQuotaError,
  ProtocolError,
  ServerExitError,
} from '../../src/errors/types.js';
import { resetLogger, configureLogger } from '../../src/logging/logger.js';

describe('errors/retry', () => {
  beforeEach(() => {
    // Configure logger to silent for tests
    configureLogger({ level: 'silent' });
  });

  afterEach(() => {
    resetLogger();
    vi.restoreAllMocks();
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new TimeoutError('Timeout', 5000))
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        jitter: false,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on terminal error', async () => {
      const fn = vi.fn().mockRejectedValue(
        new InquestError('Terminal error', {
          code: 'TERMINAL',
          retryable: 'terminal',
        })
      );

      await expect(
        withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, jitter: false })
      ).rejects.toThrow('Terminal error');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not exceed maxAttempts', async () => {
      const fn = vi.fn().mockRejectedValue(new TimeoutError('Timeout', 5000));

      await expect(
        withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, jitter: false })
      ).rejects.toThrow('Timeout');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should calculate exponential backoff correctly', async () => {
      const delays: number[] = [];
      const fn = vi.fn().mockRejectedValue(new TimeoutError('Timeout', 5000));

      await expect(
        withRetry(fn, {
          maxAttempts: 4,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          jitter: false,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs);
          },
        })
      ).rejects.toThrow();

      // Should have delays for attempts 1, 2, 3 (4th attempt fails immediately)
      expect(delays).toHaveLength(3);
      expect(delays[0]).toBe(100); // 100 * 2^0
      expect(delays[1]).toBe(200); // 100 * 2^1
      expect(delays[2]).toBe(400); // 100 * 2^2
    });

    it('should add jitter when enabled', async () => {
      const delays: number[] = [];
      const fn = vi.fn().mockRejectedValue(new TimeoutError('Timeout', 5000));

      // Mock Math.random to return predictable values
      vi.spyOn(Math, 'random').mockReturnValue(0.75); // Will add positive jitter

      await expect(
        withRetry(fn, {
          maxAttempts: 2,
          initialDelayMs: 100,
          jitter: true,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs);
          },
        })
      ).rejects.toThrow();

      // With jitter at 0.75: jitterAmount = 100 * 0.25 * (2 * 0.75 - 1) = 100 * 0.25 * 0.5 = 12.5
      // delay = 100 + 12.5 = 112.5
      expect(delays[0]).toBeGreaterThan(100);
      expect(delays[0]).toBeLessThanOrEqual(125); // Max jitter is +25%
    });

    it('should skip jitter when disabled', async () => {
      const delays: number[] = [];
      const fn = vi.fn().mockRejectedValue(new TimeoutError('Timeout', 5000));

      await expect(
        withRetry(fn, {
          maxAttempts: 2,
          initialDelayMs: 100,
          jitter: false,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs);
          },
        })
      ).rejects.toThrow();

      expect(delays[0]).toBe(100); // Exact value, no jitter
    });

    it('should cap delay at maxDelayMs', async () => {
      const delays: number[] = [];
      const fn = vi.fn().mockRejectedValue(new TimeoutError('Timeout', 5000));

      await expect(
        withRetry(fn, {
          maxAttempts: 5,
          initialDelayMs: 100,
          maxDelayMs: 300,
          backoffMultiplier: 2,
          jitter: false,
          onRetry: (_error, _attempt, delayMs) => {
            delays.push(delayMs);
          },
        })
      ).rejects.toThrow();

      expect(delays[0]).toBe(100); // 100 * 2^0 = 100
      expect(delays[1]).toBe(200); // 100 * 2^1 = 200
      expect(delays[2]).toBe(300); // 100 * 2^2 = 400, capped to 300
      expect(delays[3]).toBe(300); // Stays at cap
    });

    it('should call onRetry callback with correct params', async () => {
      const onRetry = vi.fn();
      const error = new TimeoutError('Timeout', 5000);
      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      await withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        jitter: false,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(error, 1, 10);
    });

    it('should wrap final error with context', async () => {
      // Use a retryable error so it actually retries before failing
      const fn = vi.fn().mockRejectedValue(new TimeoutError('Timeout error', 5000));

      try {
        await withRetry(fn, {
          maxAttempts: 2,
          initialDelayMs: 10,
          jitter: false,
          operation: 'test operation',
          context: { tool: 'test-tool' },
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InquestError);
        const inqError = error as InquestError;
        expect(inqError.context.operation).toBe('test operation');
        expect(inqError.context.tool).toBe('test-tool');
        expect(inqError.context.retry?.attempt).toBe(2);
        expect(inqError.context.retry?.maxAttempts).toBe(2);
        expect(inqError.context.timing).toBeDefined();
        expect(inqError.context.timing?.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include timing information in error', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Error'));

      try {
        await withRetry(fn, {
          maxAttempts: 1,
          initialDelayMs: 10,
        });
      } catch (error) {
        const inqError = error as InquestError;
        expect(inqError.context.timing?.startedAt).toBeInstanceOf(Date);
        expect(inqError.context.timing?.failedAt).toBeInstanceOf(Date);
        expect(typeof inqError.context.timing?.durationMs).toBe('number');
      }
    });

    it('should use custom shouldRetry function', async () => {
      const shouldRetry = vi.fn().mockReturnValue(false);
      const fn = vi.fn().mockRejectedValue(new TimeoutError('Timeout', 5000));

      await expect(
        withRetry(fn, {
          maxAttempts: 3,
          initialDelayMs: 10,
          shouldRetry,
        })
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(TimeoutError), 1);
    });

    it('should handle custom operation name', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Error'));

      try {
        await withRetry(fn, {
          maxAttempts: 1,
          operation: 'custom operation',
        });
      } catch (error) {
        const inqError = error as InquestError;
        expect(inqError.context.operation).toBe('custom operation');
      }
    });

    it('should preserve InquestError when wrapping', async () => {
      const originalError = new InquestError('Original', {
        code: 'ORIGINAL',
        severity: 'high',
      });
      const fn = vi.fn().mockRejectedValue(originalError);

      try {
        await withRetry(fn, { maxAttempts: 1 });
      } catch (error) {
        const inqError = error as InquestError;
        expect(inqError.code).toBe('ORIGINAL');
        expect(inqError.severity).toBe('high');
      }
    });
  });

  describe('createRetryWrapper', () => {
    it('should return function with default options', async () => {
      const retryFn = createRetryWrapper({
        maxAttempts: 2,
        initialDelayMs: 10,
        jitter: false,
      });

      const fn = vi.fn().mockRejectedValue(new TimeoutError('Timeout', 5000));

      await expect(retryFn(fn)).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should allow override of default options', async () => {
      const retryFn = createRetryWrapper({
        maxAttempts: 5,
        initialDelayMs: 10,
        jitter: false,
      });

      const fn = vi.fn().mockRejectedValue(new TimeoutError('Timeout', 5000));

      await expect(retryFn(fn, { maxAttempts: 2 })).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(2); // Override takes precedence
    });

    it('should merge override options with defaults', async () => {
      const onRetry = vi.fn();
      const retryFn = createRetryWrapper({
        maxAttempts: 3,
        initialDelayMs: 10,
        jitter: false,
        operation: 'default op',
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new TimeoutError('Timeout', 5000))
        .mockResolvedValue('success');

      await retryFn(fn, { onRetry, operation: 'override op' });

      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('LLM_RETRY_OPTIONS', () => {
    const { shouldRetry } = LLM_RETRY_OPTIONS;

    it('should retry on rate limit (429)', () => {
      expect(shouldRetry!(new Error('Rate limit exceeded 429'), 1)).toBe(true);
      expect(shouldRetry!(new Error('rate limit'), 1)).toBe(true);
    });

    it('should retry on timeout', () => {
      expect(shouldRetry!(new Error('Request timeout'), 1)).toBe(true);
      expect(shouldRetry!(new TimeoutError('Timeout', 5000), 1)).toBe(true);
    });

    it('should retry on connection errors', () => {
      expect(shouldRetry!(new Error('ECONNRESET'), 1)).toBe(true);
      expect(shouldRetry!(new Error('ECONNREFUSED'), 1)).toBe(true);
      expect(shouldRetry!(new Error('socket hang up'), 1)).toBe(true);
      expect(shouldRetry!(new Error('fetch failed'), 1)).toBe(true);
    });

    it('should retry on 500, 502, 503 errors', () => {
      expect(shouldRetry!(new Error('500 Internal Server Error'), 1)).toBe(true);
      expect(shouldRetry!(new Error('502 Bad Gateway'), 1)).toBe(true);
      expect(shouldRetry!(new Error('503 Service Unavailable'), 1)).toBe(true);
    });

    it('should NOT retry on 401/auth errors', () => {
      expect(shouldRetry!(new Error('401 Unauthorized'), 1)).toBe(false);
      expect(shouldRetry!(new Error('invalid api key'), 1)).toBe(false);
      expect(shouldRetry!(new LLMAuthError('openai'), 1)).toBe(false);
    });

    it('should NOT retry on quota/credit errors', () => {
      expect(shouldRetry!(new Error('quota exceeded'), 1)).toBe(false);
      expect(shouldRetry!(new Error('insufficient credits'), 1)).toBe(false);
      expect(shouldRetry!(new LLMQuotaError('openai'), 1)).toBe(false);
    });

    it('should use correct timing parameters', () => {
      expect(LLM_RETRY_OPTIONS.maxAttempts).toBe(3);
      expect(LLM_RETRY_OPTIONS.initialDelayMs).toBe(2000);
      expect(LLM_RETRY_OPTIONS.maxDelayMs).toBe(60000);
    });
  });

  describe('TRANSPORT_RETRY_OPTIONS', () => {
    const { shouldRetry } = TRANSPORT_RETRY_OPTIONS;

    it('should retry on timeout', () => {
      expect(shouldRetry!(new Error('timeout'), 1)).toBe(true);
    });

    it('should retry on ECONNRESET', () => {
      expect(shouldRetry!(new Error('ECONNRESET'), 1)).toBe(true);
    });

    it('should NOT retry on protocol errors', () => {
      expect(shouldRetry!(new Error('protocol error'), 1)).toBe(false);
      expect(shouldRetry!(new ProtocolError('Invalid message'), 1)).toBe(false);
    });

    it('should NOT retry on server exit', () => {
      expect(shouldRetry!(new Error('server exit'), 1)).toBe(false);
      expect(shouldRetry!(new Error('connection closed'), 1)).toBe(false);
      expect(shouldRetry!(new ServerExitError('Server exited', 1), 1)).toBe(false);
    });

    it('should NOT retry on parse errors', () => {
      expect(shouldRetry!(new Error('parse error'), 1)).toBe(false);
    });

    it('should use correct timing parameters', () => {
      expect(TRANSPORT_RETRY_OPTIONS.maxAttempts).toBe(2);
      expect(TRANSPORT_RETRY_OPTIONS.initialDelayMs).toBe(500);
      expect(TRANSPORT_RETRY_OPTIONS.maxDelayMs).toBe(5000);
    });
  });

  describe('TOOL_CALL_RETRY_OPTIONS', () => {
    const { shouldRetry } = TOOL_CALL_RETRY_OPTIONS;

    it('should retry on timeout', () => {
      expect(shouldRetry!(new Error('timeout'), 1)).toBe(true);
    });

    it('should NOT retry on other tool errors', () => {
      expect(shouldRetry!(new Error('invalid arguments'), 1)).toBe(false);
      expect(shouldRetry!(new Error('tool not found'), 1)).toBe(false);
      expect(shouldRetry!(new Error('permission denied'), 1)).toBe(false);
    });

    it('should use correct timing parameters', () => {
      expect(TOOL_CALL_RETRY_OPTIONS.maxAttempts).toBe(2);
    });
  });

  describe('createCircuitBreaker', () => {
    it('should execute normally in CLOSED state', async () => {
      const breaker = createCircuitBreaker('test');
      const fn = vi.fn().mockResolvedValue('success');

      const result = await breaker(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should open after failureThreshold failures', async () => {
      const breaker = createCircuitBreaker('test', {
        failureThreshold: 3,
        resetTimeMs: 1000,
      });

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // First 3 failures
      for (let i = 0; i < 3; i++) {
        await expect(breaker(fn)).rejects.toThrow('failure');
      }

      // 4th call should fail with circuit breaker open
      await expect(breaker(fn)).rejects.toThrow("Circuit breaker 'test' is open");
    });

    it('should throw error when OPEN', async () => {
      const breaker = createCircuitBreaker('test-open', {
        failureThreshold: 2,
        resetTimeMs: 10000,
      });

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      await expect(breaker(fn)).rejects.toThrow('failure');
      await expect(breaker(fn)).rejects.toThrow('failure');

      // Now circuit is open
      try {
        await breaker(fn);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InquestError);
        const inqError = error as InquestError;
        expect(inqError.code).toBe('CIRCUIT_BREAKER_OPEN');
        expect(inqError.retryable).toBe('retryable');
        expect(inqError.context.metadata?.name).toBe('test-open');
      }
    });

    it('should transition to HALF-OPEN after resetTimeMs', async () => {
      vi.useFakeTimers();

      const breaker = createCircuitBreaker('test-halfopen', {
        failureThreshold: 2,
        resetTimeMs: 1000,
      });

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      await expect(breaker(fn)).rejects.toThrow('failure');
      await expect(breaker(fn)).rejects.toThrow('failure');

      // Circuit is open
      await expect(breaker(fn)).rejects.toThrow('is open');

      // Advance time past reset
      vi.advanceTimersByTime(1100);

      // Now in half-open, should allow one attempt
      fn.mockResolvedValueOnce('success');
      const result = await breaker(fn);
      expect(result).toBe('success');

      vi.useRealTimers();
    });

    it('should close on successful half-open test', async () => {
      vi.useFakeTimers();

      const breaker = createCircuitBreaker('test-close', {
        failureThreshold: 2,
        resetTimeMs: 100,
      });

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      await expect(breaker(fn)).rejects.toThrow('failure');
      await expect(breaker(fn)).rejects.toThrow('failure');

      // Advance time past reset
      vi.advanceTimersByTime(200);

      // Half-open test succeeds
      fn.mockResolvedValue('success');
      await breaker(fn);

      // Circuit should be closed, subsequent calls should work
      const result = await breaker(fn);
      expect(result).toBe('success');

      vi.useRealTimers();
    });

    it('should reset failure count after failureWindowMs', async () => {
      vi.useFakeTimers();

      const breaker = createCircuitBreaker('test-window', {
        failureThreshold: 3,
        failureWindowMs: 1000,
      });

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // 2 failures
      await expect(breaker(fn)).rejects.toThrow('failure');
      await expect(breaker(fn)).rejects.toThrow('failure');

      // Wait past the window
      vi.advanceTimersByTime(1100);

      // This failure should reset the count (not open circuit)
      await expect(breaker(fn)).rejects.toThrow('failure');

      // Can still make calls (circuit not open yet)
      fn.mockResolvedValue('success');
      const result = await breaker(fn);
      expect(result).toBe('success');

      vi.useRealTimers();
    });

    it('should include metadata in circuit open error', async () => {
      const breaker = createCircuitBreaker('test-meta', {
        failureThreshold: 1,
        resetTimeMs: 10000,
      });

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      await expect(breaker(fn)).rejects.toThrow('failure');

      try {
        await breaker(fn);
      } catch (error) {
        const inqError = error as InquestError;
        expect(inqError.context.metadata?.name).toBe('test-meta');
        expect(inqError.context.metadata?.failures).toBe(1);
        expect(inqError.context.metadata?.openedAt).toBeDefined();
        expect(inqError.context.metadata?.timeUntilReset).toBeDefined();
      }
    });

    it('should accept custom failure threshold', async () => {
      const breaker = createCircuitBreaker('test-threshold', {
        failureThreshold: 5,
      });

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // 5 failures should open
      for (let i = 0; i < 5; i++) {
        await expect(breaker(fn)).rejects.toThrow('failure');
      }

      // 6th call should fail with circuit open
      await expect(breaker(fn)).rejects.toThrow('is open');
    });

    it('should accept custom reset time', async () => {
      vi.useFakeTimers();

      const breaker = createCircuitBreaker('test-reset', {
        failureThreshold: 1,
        resetTimeMs: 5000,
      });

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      await expect(breaker(fn)).rejects.toThrow('failure');
      await expect(breaker(fn)).rejects.toThrow('is open');

      // Not enough time
      vi.advanceTimersByTime(3000);
      await expect(breaker(fn)).rejects.toThrow('is open');

      // Now enough time
      vi.advanceTimersByTime(3000);
      fn.mockResolvedValue('success');
      const result = await breaker(fn);
      expect(result).toBe('success');

      vi.useRealTimers();
    });
  });
});
