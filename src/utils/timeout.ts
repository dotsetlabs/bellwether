/**
 * Centralized timeout management utilities.
 *
 * Provides consistent timeout handling across all async operations
 * to prevent indefinite hangs and improve reliability.
 */

import { getLogger } from '../logging/logger.js';
import { TIMEOUTS, INTERVIEW, WORKFLOW } from '../constants.js';

const logger = getLogger('timeout');

/**
 * Default timeout values in milliseconds.
 *
 * These reference the centralized constants where applicable,
 * ensuring consistency across the codebase.
 */
export const DEFAULT_TIMEOUTS = {
  /** Timeout for individual tool calls - uses INTERVIEW.TOOL_TIMEOUT */
  toolCall: INTERVIEW.TOOL_TIMEOUT,
  /** Timeout for LLM API calls - uses TIMEOUTS.INTERVIEW */
  llmCall: TIMEOUTS.INTERVIEW,
  /** Timeout for state snapshots - uses WORKFLOW.STATE_SNAPSHOT_TIMEOUT */
  stateSnapshot: WORKFLOW.STATE_SNAPSHOT_TIMEOUT,
  /** Timeout for individual probe tool calls - uses WORKFLOW.PROBE_TOOL_TIMEOUT */
  probeTool: WORKFLOW.PROBE_TOOL_TIMEOUT,
  /** Timeout for resource reads - uses INTERVIEW.RESOURCE_TIMEOUT */
  resourceRead: INTERVIEW.RESOURCE_TIMEOUT,
  /** Timeout for HTTP requests - uses TIMEOUTS.HTTP_REQUEST */
  httpRequest: TIMEOUTS.HTTP_REQUEST,
  /** Timeout for SSE connection establishment */
  sseConnect: 10000,
  /** Timeout for interview question generation (longer for local models) */
  questionGeneration: 120000,
  /** Timeout for response analysis */
  responseAnalysis: 60000,
  /** Timeout for profile synthesis */
  profileSynthesis: 120000,
} as const;

/**
 * Timeout configuration that can be passed to operations.
 */
export interface TimeoutConfig {
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Name of the operation (for error messages) */
  operationName: string;
  /** Whether to log timeout warnings */
  logWarning?: boolean;
  /** Custom error message */
  errorMessage?: string;
}

/**
 * Optional timeout behavior overrides.
 */
export interface TimeoutOptions {
  /** Abort controller to signal when timeout occurs */
  abortController?: AbortController;
}

/**
 * Error class for timeout errors.
 */
export class TimeoutError extends Error {
  readonly operationName: string;
  readonly timeoutMs: number;

  constructor(operationName: string, timeoutMs: number, message?: string) {
    super(message ?? `${operationName} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.operationName = operationName;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error class for aborted operations.
 */
export class AbortError extends Error {
  readonly operationName: string;

  constructor(operationName: string, message?: string) {
    super(message ?? `${operationName} was aborted`);
    this.name = 'AbortError';
    this.operationName = operationName;
  }
}

/**
 * Check if an AbortSignal is aborted and throw AbortError if so.
 *
 * @param signal - The AbortSignal to check
 * @param operationName - Name of the operation for error messages
 * @throws AbortError if the signal is aborted
 */
export function checkAborted(signal: AbortSignal | undefined, operationName: string): void {
  if (signal?.aborted) {
    throw new AbortError(operationName);
  }
}

/**
 * Wrap a promise with a timeout.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name of the operation for error messages
 * @returns The promise result or throws TimeoutError
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
  options?: TimeoutOptions
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const abortController = options?.abortController;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      logger.warn({ operationName, timeoutMs }, 'Operation timed out');
      if (abortController) {
        abortController.abort(new TimeoutError(operationName, timeoutMs));
      }
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Wrap a promise with a timeout and return a result object instead of throwing.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name of the operation
 * @returns Object with either result or error
 */
export async function withTimeoutResult<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
  options?: TimeoutOptions
): Promise<{ success: true; result: T } | { success: false; error: TimeoutError | Error }> {
  try {
    const result = await withTimeout(promise, timeoutMs, operationName, options);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Create an abort controller that automatically aborts after a timeout.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name of the operation
 * @returns AbortController and cleanup function
 */
export function createTimeoutAbortController(
  timeoutMs: number,
  operationName: string
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.debug({ operationName, timeoutMs }, 'Aborting due to timeout');
    controller.abort(new TimeoutError(operationName, timeoutMs));
  }, timeoutMs);

  return {
    controller,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Execute multiple promises with individual timeouts.
 * Returns results for all, including those that timed out.
 *
 * @param operations - Array of operations with their timeouts
 * @returns Array of results (either success with value or failure with error)
 */
export async function withTimeoutAll<T>(
  operations: Array<{
    promise: Promise<T>;
    timeoutMs: number;
    operationName: string;
    options?: TimeoutOptions;
  }>
): Promise<
  Array<{ success: true; result: T } | { success: false; error: Error; operationName: string }>
> {
  return Promise.all(
    operations.map(async ({ promise, timeoutMs, operationName, options }) => {
      try {
        const result = await withTimeout(promise, timeoutMs, operationName, options);
        return { success: true as const, result };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error : new Error(String(error)),
          operationName,
        };
      }
    })
  );
}

/**
 * Execute a function with a timeout, retrying on timeout up to maxRetries.
 *
 * @param fn - Function to execute
 * @param timeoutMs - Timeout per attempt
 * @param operationName - Name of the operation
 * @param maxRetries - Maximum number of retries (default: 1)
 * @returns The function result
 */
export async function withTimeoutRetry<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName: string,
  maxRetries: number = 1
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, operationName);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof TimeoutError && attempt < maxRetries) {
        logger.debug({ operationName, attempt: attempt + 1, maxRetries }, 'Retrying after timeout');
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Unexpected retry loop exit');
}

/**
 * Create a deadline-based timeout manager.
 * Useful for operations with multiple steps that should complete within a total time.
 *
 * @param totalTimeoutMs - Total time allowed for all operations
 * @param operationName - Name of the overall operation
 * @returns Deadline manager
 */
export function createDeadline(
  totalTimeoutMs: number,
  operationName: string
): {
  /** Get remaining time in milliseconds */
  getRemainingMs: () => number;
  /** Check if deadline has passed */
  isExpired: () => boolean;
  /** Get timeout for a sub-operation (remaining time or max, whichever is smaller) */
  getTimeoutFor: (maxMs: number) => number;
  /** Throw if deadline has passed */
  checkDeadline: () => void;
} {
  const startTime = Date.now();
  const deadline = startTime + totalTimeoutMs;

  return {
    getRemainingMs: () => Math.max(0, deadline - Date.now()),

    isExpired: () => Date.now() >= deadline,

    getTimeoutFor: (maxMs: number) => Math.min(maxMs, Math.max(0, deadline - Date.now())),

    checkDeadline: () => {
      if (Date.now() >= deadline) {
        throw new TimeoutError(
          operationName,
          totalTimeoutMs,
          `${operationName} exceeded total deadline of ${totalTimeoutMs}ms`
        );
      }
    },
  };
}
