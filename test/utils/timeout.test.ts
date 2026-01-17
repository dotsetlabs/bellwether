import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withTimeout,
  withTimeoutResult,
  withTimeoutAll,
  withTimeoutRetry,
  createDeadline,
  createTimeoutAbortController,
  checkAborted,
  TimeoutError,
  AbortError,
  DEFAULT_TIMEOUTS,
} from '../../src/utils/timeout.js';
import { resetLogger, configureLogger } from '../../src/logging/logger.js';

describe('utils/timeout', () => {
  beforeEach(() => {
    configureLogger({ level: 'silent' });
  });

  afterEach(() => {
    resetLogger();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('DEFAULT_TIMEOUTS', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_TIMEOUTS.toolCall).toBe(30000);
      expect(DEFAULT_TIMEOUTS.llmCall).toBe(60000);
      expect(DEFAULT_TIMEOUTS.stateSnapshot).toBe(30000);
      expect(DEFAULT_TIMEOUTS.probeTool).toBe(5000);
      expect(DEFAULT_TIMEOUTS.resourceRead).toBe(15000);
    });
  });

  describe('TimeoutError', () => {
    it('should create error with operation name and timeout', () => {
      const error = new TimeoutError('test operation', 5000);

      expect(error.name).toBe('TimeoutError');
      expect(error.operationName).toBe('test operation');
      expect(error.timeoutMs).toBe(5000);
      expect(error.message).toContain('test operation');
      expect(error.message).toContain('5000ms');
    });

    it('should allow custom message', () => {
      const error = new TimeoutError('op', 1000, 'Custom timeout message');

      expect(error.message).toBe('Custom timeout message');
    });
  });

  describe('AbortError', () => {
    it('should create error with operation name', () => {
      const error = new AbortError('test operation');

      expect(error.name).toBe('AbortError');
      expect(error.operationName).toBe('test operation');
      expect(error.message).toContain('test operation');
      expect(error.message).toContain('aborted');
    });

    it('should allow custom message', () => {
      const error = new AbortError('op', 'Custom abort message');

      expect(error.message).toBe('Custom abort message');
    });
  });

  describe('withTimeout', () => {
    it('should resolve if promise completes before timeout', async () => {
      const promise = Promise.resolve('success');

      const result = await withTimeout(promise, 1000, 'test');

      expect(result).toBe('success');
    });

    it('should reject with TimeoutError if timeout exceeded', async () => {
      vi.useFakeTimers();

      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('late'), 5000);
      });

      const timeoutPromise = withTimeout(promise, 100, 'slow operation');

      // Advance time past the timeout
      vi.advanceTimersByTime(150);

      await expect(timeoutPromise).rejects.toThrow(TimeoutError);
      await expect(timeoutPromise).rejects.toThrow('slow operation');
    });

    it('should clean up timeout on successful completion', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const promise = Promise.resolve('success');

      await withTimeout(promise, 1000, 'test');

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should clean up timeout on promise rejection', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const promise = Promise.reject(new Error('failure'));

      await expect(withTimeout(promise, 1000, 'test')).rejects.toThrow('failure');

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('withTimeoutResult', () => {
    it('should return success result on completion', async () => {
      const promise = Promise.resolve('success');

      const result = await withTimeoutResult(promise, 1000, 'test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe('success');
      }
    });

    it('should return failure result on timeout', async () => {
      vi.useFakeTimers();

      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('late'), 5000);
      });

      const resultPromise = withTimeoutResult(promise, 100, 'test');

      vi.advanceTimersByTime(150);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(TimeoutError);
      }
    });

    it('should return failure result on promise rejection', async () => {
      const promise = Promise.reject(new Error('failure'));

      const result = await withTimeoutResult(promise, 1000, 'test');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('failure');
      }
    });
  });

  describe('withTimeoutAll', () => {
    it('should execute multiple operations with individual timeouts', async () => {
      const operations = [
        { promise: Promise.resolve('a'), timeoutMs: 1000, operationName: 'op1' },
        { promise: Promise.resolve('b'), timeoutMs: 1000, operationName: 'op2' },
      ];

      const results = await withTimeoutAll(operations);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should handle mixed success and timeout', async () => {
      vi.useFakeTimers();

      const fastPromise = Promise.resolve('fast');
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('slow'), 5000);
      });

      const operations = [
        { promise: fastPromise, timeoutMs: 1000, operationName: 'fast' },
        { promise: slowPromise, timeoutMs: 100, operationName: 'slow' },
      ];

      const resultsPromise = withTimeoutAll(operations);

      vi.advanceTimersByTime(150);

      const results = await resultsPromise;

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      if (!results[1].success) {
        expect(results[1].operationName).toBe('slow');
      }
    });
  });

  describe('withTimeoutRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withTimeoutRetry(fn, 1000, 'test', 3);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on timeout', async () => {
      vi.useFakeTimers();

      let attempt = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          return new Promise((resolve) => {
            setTimeout(() => resolve('late'), 5000);
          });
        }
        return Promise.resolve('success');
      });

      const resultPromise = withTimeoutRetry(fn, 100, 'test', 2);

      // First attempt times out
      vi.advanceTimersByTime(150);

      // Second attempt succeeds immediately
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries exhausted', async () => {
      // Use real timers for this test since the function handles retries internally
      const fn = vi.fn().mockRejectedValue(new TimeoutError('test', 100));

      await expect(withTimeoutRetry(fn, 100, 'test', 2)).rejects.toThrow(TimeoutError);
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('createDeadline', () => {
    it('should track remaining time correctly', () => {
      vi.useFakeTimers();

      const deadline = createDeadline(1000, 'test');

      expect(deadline.getRemainingMs()).toBe(1000);
      expect(deadline.isExpired()).toBe(false);

      vi.advanceTimersByTime(500);

      expect(deadline.getRemainingMs()).toBe(500);
      expect(deadline.isExpired()).toBe(false);

      vi.advanceTimersByTime(600);

      expect(deadline.getRemainingMs()).toBe(0);
      expect(deadline.isExpired()).toBe(true);
    });

    it('should throw on checkDeadline when expired', () => {
      vi.useFakeTimers();

      const deadline = createDeadline(100, 'test operation');

      // Should not throw before expiry
      expect(() => deadline.checkDeadline()).not.toThrow();

      vi.advanceTimersByTime(150);

      // Should throw after expiry
      expect(() => deadline.checkDeadline()).toThrow(TimeoutError);
      expect(() => deadline.checkDeadline()).toThrow('test operation');
    });

    it('should calculate sub-operation timeout correctly', () => {
      vi.useFakeTimers();

      const deadline = createDeadline(1000, 'test');

      // When plenty of time remains, return maxMs
      expect(deadline.getTimeoutFor(500)).toBe(500);

      vi.advanceTimersByTime(800);

      // When less time than maxMs remains, return remaining
      expect(deadline.getTimeoutFor(500)).toBe(200);

      vi.advanceTimersByTime(250);

      // When expired, return 0
      expect(deadline.getTimeoutFor(500)).toBe(0);
    });
  });

  describe('createTimeoutAbortController', () => {
    it('should abort after timeout', async () => {
      vi.useFakeTimers();

      const { controller, cleanup } = createTimeoutAbortController(100, 'test');

      expect(controller.signal.aborted).toBe(false);

      vi.advanceTimersByTime(150);

      expect(controller.signal.aborted).toBe(true);

      cleanup();
    });

    it('should not abort if cleaned up before timeout', () => {
      vi.useFakeTimers();

      const { controller, cleanup } = createTimeoutAbortController(100, 'test');

      cleanup();

      vi.advanceTimersByTime(150);

      expect(controller.signal.aborted).toBe(false);
    });
  });

  describe('checkAborted', () => {
    it('should not throw for undefined signal', () => {
      expect(() => checkAborted(undefined, 'test')).not.toThrow();
    });

    it('should not throw for non-aborted signal', () => {
      const controller = new AbortController();

      expect(() => checkAborted(controller.signal, 'test')).not.toThrow();
    });

    it('should throw AbortError for aborted signal', () => {
      const controller = new AbortController();
      controller.abort();

      expect(() => checkAborted(controller.signal, 'test operation')).toThrow(AbortError);
      expect(() => checkAborted(controller.signal, 'test operation')).toThrow('test operation');
    });
  });
});
