import { RATE_LIMITING } from '../constants.js';
import type { RateLimitConfig } from './types.js';

/**
 * Token bucket rate limiter with async acquisition.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(private config: RateLimitConfig) {
    if (config.requestsPerSecond <= 0) {
      throw new Error(`requestsPerSecond must be positive, got ${config.requestsPerSecond}`);
    }
    if (config.burstLimit <= 0) {
      throw new Error(`burstLimit must be positive, got ${config.burstLimit}`);
    }
    this.tokens = config.burstLimit;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    // Token bucket algorithm - loop until a token is available
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      const waitMs = Math.max(
        1,
        Math.ceil(((1 - this.tokens) / this.config.requestsPerSecond) * 1000)
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    if (elapsedSeconds <= 0) return;

    const refillTokens = elapsedSeconds * this.config.requestsPerSecond;
    if (refillTokens >= 1) {
      this.tokens = Math.min(this.config.burstLimit, this.tokens + refillTokens);
      this.lastRefill = now;
    }
  }
}

export function isRateLimitError(message: string | null): boolean {
  if (!message) return false;
  return RATE_LIMITING.ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function calculateBackoffMs(
  attempt: number,
  strategy: RateLimitConfig['backoffStrategy']
): number {
  const baseDelay = RATE_LIMITING.BASE_DELAY_MS;
  const maxDelay = RATE_LIMITING.MAX_DELAY_MS;
  const jitter = RATE_LIMITING.JITTER_RATIO;

  const rawDelay =
    strategy === 'linear' ? baseDelay * (attempt + 1) : baseDelay * Math.pow(2, attempt);

  const capped = Math.min(rawDelay, maxDelay);
  const jitterDelta = capped * jitter * (Math.random() - 0.5) * 2;

  return Math.max(0, Math.round(capped + jitterDelta));
}
