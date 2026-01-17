/**
 * Retry logic with exponential backoff.
 */

import { getLogger } from '../logging/logger.js';
import {
  BellwetherError,
  LLMRateLimitError,
  isRetryable,
  wrapError,
  createTimingContext,
  type ErrorContext,
} from './types.js';

/**
 * Retry options.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Add jitter to delays (default: true) */
  jitter?: boolean;
  /** Custom retry condition (default: isRetryable) */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Callback on retry (for logging) */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Operation name for logging */
  operation?: string;
  /** Additional context for errors */
  context?: ErrorContext;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry' | 'operation' | 'context'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Calculate delay with exponential backoff and optional jitter.
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitter: boolean
): number {
  // Exponential backoff: delay = initial * multiplier^(attempt - 1)
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  const clampedDelay = Math.min(exponentialDelay, maxDelayMs);

  if (jitter) {
    // Add random jitter: ±25% of the delay
    const jitterRange = clampedDelay * 0.25;
    const jitterAmount = Math.random() * jitterRange * 2 - jitterRange;
    return Math.max(0, clampedDelay + jitterAmount);
  }

  return clampedDelay;
}

/**
 * Sleep for the specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic.
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => await llmClient.complete(prompt),
 *   { maxAttempts: 3, operation: 'LLM completion' }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = DEFAULT_OPTIONS.maxAttempts,
    initialDelayMs = DEFAULT_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_OPTIONS.maxDelayMs,
    backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier,
    jitter = DEFAULT_OPTIONS.jitter,
    shouldRetry = isRetryable,
    onRetry,
    operation = 'operation',
    context,
  } = options;

  const logger = getLogger('retry');
  const startedAt = new Date();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        // Wrap and rethrow with context
        const wrappedError = wrapError(error, {
          ...context,
          operation,
          timing: createTimingContext(startedAt),
          retry: {
            attempt,
            maxAttempts,
          },
        });

        logger.warn({
          operation,
          attempt,
          maxAttempts,
          error: wrappedError.toJSON(),
          message: `${operation} failed after ${attempt} attempt(s)`,
        });

        throw wrappedError;
      }

      // Calculate delay for next attempt
      // Use server-provided retry-after if available (from LLMRateLimitError)
      let delayMs: number;
      if (error instanceof LLMRateLimitError && error.retryAfterMs) {
        // Use server-specified delay, but respect our maxDelayMs cap
        delayMs = Math.min(error.retryAfterMs, maxDelayMs);
        logger.debug({
          operation,
          serverDelayMs: error.retryAfterMs,
          actualDelayMs: delayMs,
          message: `Using server-provided retry delay`,
        });
      } else {
        delayMs = calculateDelay(
          attempt,
          initialDelayMs,
          maxDelayMs,
          backoffMultiplier,
          jitter
        );
      }

      // Log retry
      logger.debug({
        operation,
        attempt,
        maxAttempts,
        delayMs: Math.round(delayMs),
        error: error instanceof Error ? error.message : String(error),
        message: `Retrying ${operation} in ${Math.round(delayMs)}ms`,
      });

      // Notify callback
      if (onRetry) {
        onRetry(error, attempt, delayMs);
      }

      // Wait before retry
      await sleep(delayMs);
    }
  }

  // This should never happen, but TypeScript needs it
  throw wrapError(lastError, {
    ...context,
    operation,
    timing: createTimingContext(startedAt),
    retry: { attempt: maxAttempts, maxAttempts },
  });
}

/**
 * Create a retry wrapper for a specific operation.
 *
 * @example
 * ```typescript
 * const retryableFetch = createRetryWrapper({
 *   maxAttempts: 5,
 *   operation: 'API fetch'
 * });
 *
 * const data = await retryableFetch(() => fetchData());
 * ```
 */
export function createRetryWrapper(
  defaultOptions: RetryOptions
): <T>(fn: () => Promise<T>, overrides?: RetryOptions) => Promise<T> {
  return <T>(fn: () => Promise<T>, overrides: RetryOptions = {}): Promise<T> => {
    return withRetry(fn, { ...defaultOptions, ...overrides });
  };
}

/**
 * Retry options specifically tuned for LLM calls.
 */
export const LLM_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 2000, // LLM rate limits often need longer waits
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error) => {
    // Check for known LLM error patterns
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // Rate limits - always retry
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }

    // Connection issues - retry
    if (
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up') ||
      message.includes('fetch failed')
    ) {
      return true;
    }

    // Timeouts - retry
    if (message.includes('timeout')) {
      return true;
    }

    // Server errors (5xx) - retry
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return true;
    }

    // Auth errors - don't retry
    if (message.includes('401') || message.includes('unauthorized') || message.includes('api key')) {
      return false;
    }

    // Quota errors - don't retry
    if (message.includes('quota') || message.includes('insufficient') || message.includes('credit')) {
      return false;
    }

    // Default: use standard isRetryable
    return isRetryable(error);
  },
};

/**
 * Retry options for MCP transport operations.
 */
export const TRANSPORT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 2, // Transport failures are often persistent
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error) => {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // Timeouts might be transient
    if (message.includes('timeout')) {
      return true;
    }

    // Connection resets might recover
    if (message.includes('econnreset')) {
      return true;
    }

    // Protocol errors are permanent
    if (message.includes('protocol') || message.includes('parse')) {
      return false;
    }

    // Server exit is permanent
    if (message.includes('exit') || message.includes('closed')) {
      return false;
    }

    return isRetryable(error);
  },
};

/**
 * Retry options for tool calls during interviews.
 */
export const TOOL_CALL_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 2, // Tool failures are often deterministic
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: (error) => {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // Timeout - might succeed on retry
    if (message.includes('timeout')) {
      return true;
    }

    // Most tool errors are deterministic - don't retry
    return false;
  },
};

/**
 * Circuit breaker state for preventing cascade failures.
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure?: Date;
  isOpen: boolean;
  openedAt?: Date;
}

/**
 * Circuit breaker options.
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting to close circuit (default: 30000) */
  resetTimeMs?: number;
  /** Time window for counting failures in ms (default: 60000) */
  failureWindowMs?: number;
}

const DEFAULT_CIRCUIT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeMs: 30000,
  failureWindowMs: 60000,
};

/**
 * Create a circuit breaker for an operation.
 *
 * @example
 * ```typescript
 * const protectedCall = createCircuitBreaker('llm-api');
 *
 * try {
 *   const result = await protectedCall(() => llmClient.complete(prompt));
 * } catch (error) {
 *   // Either operation error or circuit open error
 * }
 * ```
 */
export function createCircuitBreaker(
  name: string,
  options: CircuitBreakerOptions = {}
): <T>(fn: () => Promise<T>) => Promise<T> {
  const {
    failureThreshold = DEFAULT_CIRCUIT_OPTIONS.failureThreshold,
    resetTimeMs = DEFAULT_CIRCUIT_OPTIONS.resetTimeMs,
    failureWindowMs = DEFAULT_CIRCUIT_OPTIONS.failureWindowMs,
  } = options;

  const state: CircuitBreakerState = {
    failures: 0,
    isOpen: false,
  };

  const logger = getLogger('circuit-breaker');

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    // Check if circuit is open
    if (state.isOpen) {
      const now = new Date();
      const timeSinceOpen = state.openedAt
        ? now.getTime() - state.openedAt.getTime()
        : 0;

      if (timeSinceOpen < resetTimeMs) {
        // Still in open state
        throw new BellwetherError(`Circuit breaker '${name}' is open`, {
          code: 'CIRCUIT_BREAKER_OPEN',
          severity: 'high',
          retryable: 'retryable',
          context: {
            metadata: {
              name,
              failures: state.failures,
              openedAt: state.openedAt?.toISOString(),
              timeUntilReset: resetTimeMs - timeSinceOpen,
            },
          },
        });
      }

      // Half-open: try one request
      logger.info({
        circuitBreaker: name,
        message: `Circuit breaker '${name}' attempting half-open test`,
      });
    }

    try {
      const result = await fn();

      // Success: reset state
      if (state.isOpen) {
        logger.info({
          circuitBreaker: name,
          message: `Circuit breaker '${name}' closed after successful test`,
        });
      }
      state.failures = 0;
      state.isOpen = false;
      state.openedAt = undefined;

      return result;
    } catch (error) {
      const now = new Date();

      // Reset failure count if outside window
      if (state.lastFailure) {
        const timeSinceLastFailure = now.getTime() - state.lastFailure.getTime();
        if (timeSinceLastFailure > failureWindowMs) {
          state.failures = 0;
        }
      }

      state.failures++;
      state.lastFailure = now;

      // Check if we should open the circuit
      if (state.failures >= failureThreshold && !state.isOpen) {
        state.isOpen = true;
        state.openedAt = now;

        logger.warn({
          circuitBreaker: name,
          failures: state.failures,
          message: `Circuit breaker '${name}' opened after ${state.failures} failures`,
        });
      }

      throw error;
    }
  };
}
