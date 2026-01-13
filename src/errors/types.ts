/**
 * Comprehensive error types for Bellwether.
 *
 * Error hierarchy:
 * - BellwetherError (base)
 *   - TransportError (MCP communication)
 *   - LLMError (LLM provider issues)
 *   - InterviewError (interview execution)
 *   - WorkflowError (workflow execution)
 *   - ConfigError (configuration issues)
 */

/**
 * Error severity levels.
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Whether an error is retryable.
 */
export type RetryableStatus = 'retryable' | 'terminal' | 'unknown';

/**
 * Error context for debugging and recovery.
 */
export interface ErrorContext {
  /** Operation that failed */
  operation?: string;
  /** Component where error occurred */
  component?: string;
  /** Tool name if applicable */
  tool?: string;
  /** Workflow ID if applicable */
  workflow?: string;
  /** Step index if applicable */
  stepIndex?: number;
  /** Request ID for tracing */
  requestId?: string;
  /** Timing information */
  timing?: {
    startedAt: Date;
    failedAt: Date;
    durationMs: number;
  };
  /** Retry information */
  retry?: {
    attempt: number;
    maxAttempts: number;
    nextDelayMs?: number;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Base error class for all Bellwether errors.
 */
export class BellwetherError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;
  /** Error severity */
  readonly severity: ErrorSeverity;
  /** Whether this error is retryable */
  readonly retryable: RetryableStatus;
  /** Error context for debugging */
  readonly context: ErrorContext;
  /** Original error if this wraps another */
  readonly cause?: Error;

  constructor(
    message: string,
    options: {
      code: string;
      severity?: ErrorSeverity;
      retryable?: RetryableStatus;
      context?: ErrorContext;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'BellwetherError';
    this.code = options.code;
    this.severity = options.severity ?? 'medium';
    this.retryable = options.retryable ?? 'unknown';
    this.context = options.context ?? {};
    this.cause = options.cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create a new error with additional context.
   */
  withContext(additionalContext: Partial<ErrorContext>): BellwetherError {
    return new BellwetherError(this.message, {
      code: this.code,
      severity: this.severity,
      retryable: this.retryable,
      context: { ...this.context, ...additionalContext },
      cause: this.cause,
    });
  }

  /**
   * Convert to JSON for logging.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      retryable: this.retryable,
      context: this.context,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
          }
        : undefined,
      stack: this.stack,
    };
  }
}

// =============================================================================
// Transport Errors
// =============================================================================

/**
 * Base class for transport-related errors.
 */
export class TransportError extends BellwetherError {
  constructor(
    message: string,
    options: {
      code: string;
      severity?: ErrorSeverity;
      retryable?: RetryableStatus;
      context?: ErrorContext;
      cause?: Error;
    }
  ) {
    super(message, options);
    this.name = 'TransportError';
  }
}

/**
 * Connection failed or was lost.
 */
export class ConnectionError extends TransportError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super(message, {
      code: 'TRANSPORT_CONNECTION_FAILED',
      severity: 'high',
      retryable: 'retryable',
      context,
      cause,
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Request timed out.
 */
export class TimeoutError extends TransportError {
  /** Timeout value in milliseconds */
  readonly timeoutMs: number;

  constructor(
    message: string,
    timeoutMs: number,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(message, {
      code: 'TRANSPORT_TIMEOUT',
      severity: 'medium',
      retryable: 'retryable',
      context: { ...context, metadata: { ...context?.metadata, timeoutMs } },
      cause,
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Server process exited unexpectedly.
 */
export class ServerExitError extends TransportError {
  /** Exit code if available */
  readonly exitCode?: number;
  /** Exit signal if available */
  readonly signal?: string;

  constructor(
    message: string,
    exitCode?: number,
    signal?: string,
    context?: ErrorContext
  ) {
    super(message, {
      code: 'TRANSPORT_SERVER_EXIT',
      severity: 'high',
      retryable: 'terminal',
      context: { ...context, metadata: { ...context?.metadata, exitCode, signal } },
    });
    this.name = 'ServerExitError';
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

/**
 * Protocol error (invalid message format, etc).
 */
export class ProtocolError extends TransportError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super(message, {
      code: 'TRANSPORT_PROTOCOL_ERROR',
      severity: 'high',
      retryable: 'terminal',
      context,
      cause,
    });
    this.name = 'ProtocolError';
  }
}

/**
 * Buffer overflow during message processing.
 */
export class BufferOverflowError extends TransportError {
  /** Current buffer size */
  readonly bufferSize: number;
  /** Maximum allowed size */
  readonly maxSize: number;

  constructor(bufferSize: number, maxSize: number, context?: ErrorContext) {
    super(
      `Buffer overflow: ${bufferSize} bytes exceeds maximum ${maxSize} bytes`,
      {
        code: 'TRANSPORT_BUFFER_OVERFLOW',
        severity: 'high',
        retryable: 'terminal',
        context: { ...context, metadata: { bufferSize, maxSize } },
      }
    );
    this.name = 'BufferOverflowError';
    this.bufferSize = bufferSize;
    this.maxSize = maxSize;
  }
}

// =============================================================================
// LLM Errors
// =============================================================================

/**
 * Base class for LLM-related errors.
 */
export class LLMError extends BellwetherError {
  /** LLM provider name */
  readonly provider: string;
  /** Model name if available */
  readonly model?: string;

  constructor(
    message: string,
    provider: string,
    options: {
      code: string;
      model?: string;
      severity?: ErrorSeverity;
      retryable?: RetryableStatus;
      context?: ErrorContext;
      cause?: Error;
    }
  ) {
    super(message, {
      code: options.code,
      severity: options.severity,
      retryable: options.retryable,
      context: {
        ...options.context,
        metadata: { ...options.context?.metadata, provider, model: options.model },
      },
      cause: options.cause,
    });
    this.name = 'LLMError';
    this.provider = provider;
    this.model = options.model;
  }
}

/**
 * Authentication/API key error.
 */
export class LLMAuthError extends LLMError {
  constructor(
    provider: string,
    model?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super('LLM authentication failed - check API key', provider, {
      code: 'LLM_AUTH_FAILED',
      model,
      severity: 'critical',
      retryable: 'terminal',
      context,
      cause,
    });
    this.name = 'LLMAuthError';
  }
}

/**
 * Rate limit exceeded.
 */
export class LLMRateLimitError extends LLMError {
  /** Retry after in milliseconds if known */
  readonly retryAfterMs?: number;

  constructor(
    provider: string,
    retryAfterMs?: number,
    model?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super('LLM rate limit exceeded', provider, {
      code: 'LLM_RATE_LIMITED',
      model,
      severity: 'medium',
      retryable: 'retryable',
      context: { ...context, metadata: { ...context?.metadata, retryAfterMs } },
      cause,
    });
    this.name = 'LLMRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Quota/credits exhausted.
 */
export class LLMQuotaError extends LLMError {
  constructor(
    provider: string,
    model?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super('LLM quota or credits exhausted', provider, {
      code: 'LLM_QUOTA_EXHAUSTED',
      model,
      severity: 'critical',
      retryable: 'terminal',
      context,
      cause,
    });
    this.name = 'LLMQuotaError';
  }
}

/**
 * Model refused to complete request (content policy, etc).
 */
export class LLMRefusalError extends LLMError {
  /** Refusal reason if available */
  readonly reason?: string;

  constructor(
    provider: string,
    reason?: string,
    model?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(reason ? `LLM refused request: ${reason}` : 'LLM refused request', provider, {
      code: 'LLM_REFUSED',
      model,
      severity: 'medium',
      retryable: 'terminal', // Different prompt might work, but same prompt won't
      context: { ...context, metadata: { ...context?.metadata, reason } },
      cause,
    });
    this.name = 'LLMRefusalError';
    this.reason = reason;
  }
}

/**
 * LLM response parsing failed.
 */
export class LLMParseError extends LLMError {
  /** Raw response that couldn't be parsed */
  readonly rawResponse?: string;

  constructor(
    provider: string,
    rawResponse?: string,
    model?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super('Failed to parse LLM response', provider, {
      code: 'LLM_PARSE_ERROR',
      model,
      severity: 'medium',
      retryable: 'retryable', // Different response might parse
      context: {
        ...context,
        metadata: {
          ...context?.metadata,
          rawResponsePreview: rawResponse?.slice(0, 200),
        },
      },
      cause,
    });
    this.name = 'LLMParseError';
    this.rawResponse = rawResponse;
  }
}

/**
 * LLM connection failed.
 */
export class LLMConnectionError extends LLMError {
  constructor(
    provider: string,
    model?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(`Failed to connect to LLM provider: ${provider}`, provider, {
      code: 'LLM_CONNECTION_FAILED',
      model,
      severity: 'high',
      retryable: 'retryable',
      context,
      cause,
    });
    this.name = 'LLMConnectionError';
  }
}

// =============================================================================
// Interview Errors
// =============================================================================

/**
 * Base class for interview-related errors.
 */
export class InterviewError extends BellwetherError {
  constructor(
    message: string,
    options: {
      code: string;
      severity?: ErrorSeverity;
      retryable?: RetryableStatus;
      context?: ErrorContext;
      cause?: Error;
    }
  ) {
    super(message, options);
    this.name = 'InterviewError';
  }
}

/**
 * Tool call failed.
 */
export class ToolCallError extends InterviewError {
  /** Tool name */
  readonly toolName: string;
  /** Arguments passed to tool */
  readonly args: Record<string, unknown>;

  constructor(
    toolName: string,
    args: Record<string, unknown>,
    message: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(`Tool call failed for '${toolName}': ${message}`, {
      code: 'INTERVIEW_TOOL_CALL_FAILED',
      severity: 'medium',
      retryable: 'retryable',
      context: { ...context, tool: toolName, metadata: { ...context?.metadata, args } },
      cause,
    });
    this.name = 'ToolCallError';
    this.toolName = toolName;
    this.args = args;
  }
}

/**
 * Discovery failed.
 */
export class DiscoveryError extends InterviewError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super(`Server discovery failed: ${message}`, {
      code: 'INTERVIEW_DISCOVERY_FAILED',
      severity: 'high',
      retryable: 'retryable',
      context,
      cause,
    });
    this.name = 'DiscoveryError';
  }
}

/**
 * Question generation failed.
 */
export class QuestionGenerationError extends InterviewError {
  constructor(toolName: string, context?: ErrorContext, cause?: Error) {
    super(`Failed to generate questions for tool '${toolName}'`, {
      code: 'INTERVIEW_QUESTION_GEN_FAILED',
      severity: 'low',
      retryable: 'retryable',
      context: { ...context, tool: toolName },
      cause,
    });
    this.name = 'QuestionGenerationError';
  }
}

/**
 * Analysis/synthesis failed.
 */
export class AnalysisError extends InterviewError {
  constructor(
    phase: 'response' | 'profile' | 'summary',
    context?: ErrorContext,
    cause?: Error
  ) {
    super(`Failed to analyze ${phase}`, {
      code: `INTERVIEW_${phase.toUpperCase()}_ANALYSIS_FAILED`,
      severity: 'low',
      retryable: 'retryable',
      context: { ...context, metadata: { ...context?.metadata, phase } },
      cause,
    });
    this.name = 'AnalysisError';
  }
}

// =============================================================================
// Workflow Errors
// =============================================================================

/**
 * Base class for workflow-related errors.
 */
export class WorkflowError extends BellwetherError {
  /** Workflow ID */
  readonly workflowId: string;
  /** Workflow name */
  readonly workflowName?: string;

  constructor(
    message: string,
    workflowId: string,
    options: {
      code: string;
      workflowName?: string;
      severity?: ErrorSeverity;
      retryable?: RetryableStatus;
      context?: ErrorContext;
      cause?: Error;
    }
  ) {
    super(message, {
      code: options.code,
      severity: options.severity,
      retryable: options.retryable,
      context: {
        ...options.context,
        workflow: workflowId,
        metadata: { ...options.context?.metadata, workflowName: options.workflowName },
      },
      cause: options.cause,
    });
    this.name = 'WorkflowError';
    this.workflowId = workflowId;
    this.workflowName = options.workflowName;
  }
}

/**
 * Workflow step failed.
 */
export class WorkflowStepError extends WorkflowError {
  /** Step index (0-based) */
  readonly stepIndex: number;
  /** Tool name for this step */
  readonly toolName: string;

  constructor(
    workflowId: string,
    stepIndex: number,
    toolName: string,
    message: string,
    workflowName?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(`Workflow step ${stepIndex + 1} failed (${toolName}): ${message}`, workflowId, {
      code: 'WORKFLOW_STEP_FAILED',
      workflowName,
      severity: 'medium',
      retryable: 'retryable',
      context: { ...context, stepIndex, tool: toolName },
      cause,
    });
    this.name = 'WorkflowStepError';
    this.stepIndex = stepIndex;
    this.toolName = toolName;
  }
}

/**
 * Argument resolution failed (JSON path evaluation).
 */
export class ArgResolutionError extends WorkflowError {
  /** The path expression that failed */
  readonly pathExpression: string;
  /** Step index where resolution failed */
  readonly stepIndex: number;

  constructor(
    workflowId: string,
    stepIndex: number,
    pathExpression: string,
    message: string,
    workflowName?: string,
    context?: ErrorContext
  ) {
    super(
      `Argument resolution failed at step ${stepIndex + 1}: ${message}`,
      workflowId,
      {
        code: 'WORKFLOW_ARG_RESOLUTION_FAILED',
        workflowName,
        severity: 'medium',
        retryable: 'terminal', // Path expression won't change
        context: {
          ...context,
          stepIndex,
          metadata: { ...context?.metadata, pathExpression },
        },
      }
    );
    this.name = 'ArgResolutionError';
    this.pathExpression = pathExpression;
    this.stepIndex = stepIndex;
  }
}

/**
 * Assertion failed during workflow execution.
 */
export class AssertionError extends WorkflowError {
  /** The assertion that failed */
  readonly assertion: string;
  /** Actual value received */
  readonly actualValue?: unknown;

  constructor(
    workflowId: string,
    stepIndex: number,
    assertion: string,
    actualValue?: unknown,
    workflowName?: string,
    context?: ErrorContext
  ) {
    super(`Assertion failed at step ${stepIndex + 1}: ${assertion}`, workflowId, {
      code: 'WORKFLOW_ASSERTION_FAILED',
      workflowName,
      severity: 'medium',
      retryable: 'terminal', // Same input = same assertion failure
      context: {
        ...context,
        stepIndex,
        metadata: { ...context?.metadata, assertion, actualValue },
      },
    });
    this.name = 'AssertionError';
    this.assertion = assertion;
    this.actualValue = actualValue;
  }
}

// =============================================================================
// Configuration Errors
// =============================================================================

/**
 * Configuration-related error.
 */
export class ConfigError extends BellwetherError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super(message, {
      code: 'CONFIG_ERROR',
      severity: 'high',
      retryable: 'terminal',
      context,
      cause,
    });
    this.name = 'ConfigError';
  }
}

/**
 * Configuration file not found.
 */
export class ConfigNotFoundError extends ConfigError {
  /** Path that was searched */
  readonly path: string;

  constructor(path: string, context?: ErrorContext) {
    super(`Configuration file not found: ${path}`, {
      ...context,
      metadata: { ...context?.metadata, path },
    });
    this.name = 'ConfigNotFoundError';
    this.path = path;
  }
}

/**
 * Configuration validation failed.
 */
export class ConfigValidationError extends ConfigError {
  /** Validation errors */
  readonly validationErrors: string[];

  constructor(errors: string[], context?: ErrorContext) {
    super(`Configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`, {
      ...context,
      metadata: { ...context?.metadata, validationErrors: errors },
    });
    this.name = 'ConfigValidationError';
    this.validationErrors = errors;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if an error is a BellwetherError.
 */
export function isBellwetherError(error: unknown): error is BellwetherError {
  return error instanceof BellwetherError;
}

/**
 * Check if an error is retryable.
 */
export function isRetryable(error: unknown): boolean {
  if (isBellwetherError(error)) {
    return error.retryable === 'retryable';
  }
  // For unknown errors, default to retryable for transient issues
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('rate limit') ||
      message.includes('429')
    );
  }
  return false;
}

/**
 * Wrap an unknown error in a BellwetherError.
 */
export function wrapError(
  error: unknown,
  context?: ErrorContext
): BellwetherError {
  if (isBellwetherError(error)) {
    return context ? error.withContext(context) : error;
  }

  const originalError = error instanceof Error ? error : new Error(String(error));

  return new BellwetherError(originalError.message, {
    code: 'UNKNOWN_ERROR',
    severity: 'medium',
    retryable: 'unknown',
    context,
    cause: originalError,
  });
}

/**
 * Extract error message from any error type.
 */
export function getErrorMessage(error: unknown): string {
  if (isBellwetherError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Create timing context for error tracking.
 */
export function createTimingContext(startedAt: Date): ErrorContext['timing'] {
  const failedAt = new Date();
  return {
    startedAt,
    failedAt,
    durationMs: failedAt.getTime() - startedAt.getTime(),
  };
}
