import { describe, it, expect } from 'vitest';
import { RateLimiter, isRateLimitError, calculateBackoffMs } from '../../src/interview/rate-limiter.js';

describe('rate-limiter', () => {
  it('detects rate limit errors', () => {
    expect(isRateLimitError('429 Too Many Requests')).toBe(true);
    expect(isRateLimitError('rate limit exceeded')).toBe(true);
    expect(isRateLimitError('some other error')).toBe(false);
  });

  it('calculates backoff delay with jitter', () => {
    const first = calculateBackoffMs(0, 'linear');
    const second = calculateBackoffMs(1, 'linear');
    expect(second).toBeGreaterThanOrEqual(first);
  });

  it('acquires tokens with burst capacity', async () => {
    const limiter = new RateLimiter({
      enabled: true,
      requestsPerSecond: 1000,
      burstLimit: 2,
      backoffStrategy: 'exponential',
      maxRetries: 1,
    });

    await limiter.acquire();
    await limiter.acquire();
  });
});
