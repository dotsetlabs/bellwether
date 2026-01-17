/**
 * Metrics collection types for observability.
 */

/**
 * Error category for metrics tracking.
 */
export type ErrorCategory =
  | 'transport'
  | 'llm_auth'
  | 'llm_rate_limit'
  | 'llm_quota'
  | 'llm_refusal'
  | 'llm_parse'
  | 'llm_connection'
  | 'llm_timeout'
  | 'interview'
  | 'workflow'
  | 'config'
  | 'unknown';

/**
 * Operation type for timing metrics.
 */
export type OperationType =
  | 'llm_call'
  | 'llm_stream'
  | 'tool_call'
  | 'discovery'
  | 'question_generation'
  | 'response_analysis'
  | 'profile_synthesis'
  | 'summary_generation'
  | 'interview_total'
  | 'workflow_execution'
  | 'assertion_evaluation'
  | 'baseline_comparison';

/**
 * Token usage record.
 */
export interface TokenUsageRecord {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: Date;
  operation?: string;
}

/**
 * Operation timing record.
 */
export interface TimingRecord {
  operation: OperationType;
  durationMs: number;
  success: boolean;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Error record for metrics.
 */
export interface ErrorRecord {
  category: ErrorCategory;
  code: string;
  message: string;
  timestamp: Date;
  retryable: boolean;
  operation?: string;
}

/**
 * Cost record.
 */
export interface CostRecord {
  provider: string;
  model: string;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  timestamp: Date;
}

/**
 * Interview metrics summary.
 */
export interface InterviewMetrics {
  /** Start time */
  startedAt: Date;
  /** End time */
  endedAt?: Date;
  /** Total duration in ms */
  totalDurationMs?: number;
  /** Tools discovered */
  toolsDiscovered: number;
  /** Questions generated */
  questionsGenerated: number;
  /** Tool calls made */
  toolCallsMade: number;
  /** Tool calls succeeded */
  toolCallsSucceeded: number;
  /** Tool calls failed */
  toolCallsFailed: number;
  /** Personas used */
  personasUsed: number;
  /** LLM calls made */
  llmCallsMade: number;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Total cost USD */
  totalCostUSD: number;
  /** Errors by category */
  errorsByCategory: Record<ErrorCategory, number>;
}

/**
 * Aggregated metrics for a time period.
 */
export interface AggregatedMetrics {
  /** Time period start */
  periodStart: Date;
  /** Time period end */
  periodEnd: Date;

  /** Token usage by provider/model */
  tokenUsage: {
    provider: string;
    model: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
  }[];

  /** Operation timing statistics */
  operationStats: {
    operation: OperationType;
    count: number;
    successCount: number;
    failureCount: number;
    avgDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
  }[];

  /** Error statistics */
  errorStats: {
    category: ErrorCategory;
    count: number;
    retryableCount: number;
    terminalCount: number;
  }[];

  /** Total cost */
  totalCostUSD: number;
  costByProvider: { provider: string; costUSD: number }[];
}

/**
 * Prometheus metric types.
 */
export type PrometheusMetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Prometheus metric definition.
 */
export interface PrometheusMetric {
  name: string;
  type: PrometheusMetricType;
  help: string;
  labels?: string[];
}

/**
 * Prometheus metric value.
 */
export interface PrometheusMetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

/**
 * Histogram bucket configuration.
 */
export interface HistogramBuckets {
  /** Bucket boundaries */
  le: number[];
  /** Count per bucket */
  counts: number[];
  /** Total sum */
  sum: number;
  /** Total count */
  count: number;
}

/**
 * Dashboard-compatible metrics output.
 */
export interface DashboardMetrics {
  /** Timestamp of metrics snapshot */
  timestamp: string;
  /** Interview summary */
  interview: {
    status: 'running' | 'completed' | 'failed';
    progress: number; // 0-100
    toolsTotal: number;
    toolsCompleted: number;
    questionsTotal: number;
    questionsCompleted: number;
  };
  /** Token usage */
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  /** Cost */
  cost: {
    current: number;
    projected: number;
    currency: string;
  };
  /** Performance */
  performance: {
    avgLLMLatencyMs: number;
    avgToolLatencyMs: number;
    errorsTotal: number;
    successRate: number;
  };
  /** Provider breakdown */
  providers: {
    name: string;
    calls: number;
    tokens: number;
    errors: number;
    avgLatencyMs: number;
  }[];
}
