/**
 * Metrics collector for comprehensive observability.
 *
 * Tracks timing, token usage, errors, and costs across all operations.
 */

import type {
  TokenUsageRecord,
  TimingRecord,
  ErrorRecord,
  CostRecord,
  OperationType,
  ErrorCategory,
  InterviewMetrics,
  AggregatedMetrics,
  DashboardMetrics,
} from './types.js';
import { getModelPricing } from '../cost/tracker.js';

/**
 * Options for the metrics collector.
 */
export interface MetricsCollectorOptions {
  /** Maximum number of records to keep in memory */
  maxRecords?: number;
  /** Whether to track individual records (vs just aggregates) */
  trackRecords?: boolean;
}

const DEFAULT_OPTIONS: Required<MetricsCollectorOptions> = {
  maxRecords: 10000,
  trackRecords: true,
};

/**
 * Centralized metrics collector for observability.
 */
export class MetricsCollector {
  private readonly options: Required<MetricsCollectorOptions>;

  // Individual records (when trackRecords is true)
  private tokenRecords: TokenUsageRecord[] = [];
  private timingRecords: TimingRecord[] = [];
  private errorRecords: ErrorRecord[] = [];
  private costRecords: CostRecord[] = [];

  // Aggregated counters (always maintained)
  private tokensByProviderModel = new Map<string, { input: number; output: number; calls: number }>();
  private timingByOperation = new Map<string, { durations: number[]; successes: number; failures: number }>();
  private errorsByCategory = new Map<ErrorCategory, { total: number; retryable: number; terminal: number }>();
  private costByProvider = new Map<string, number>();

  // Interview-specific metrics
  private interviewMetrics: InterviewMetrics | null = null;

  constructor(options: MetricsCollectorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start tracking an interview.
   */
  startInterview(): void {
    this.interviewMetrics = {
      startedAt: new Date(),
      toolsDiscovered: 0,
      questionsGenerated: 0,
      toolCallsMade: 0,
      toolCallsSucceeded: 0,
      toolCallsFailed: 0,
      personasUsed: 0,
      llmCallsMade: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUSD: 0,
      errorsByCategory: {} as Record<ErrorCategory, number>,
    };
  }

  /**
   * End interview tracking.
   */
  endInterview(): InterviewMetrics | null {
    if (this.interviewMetrics) {
      this.interviewMetrics.endedAt = new Date();
      this.interviewMetrics.totalDurationMs =
        this.interviewMetrics.endedAt.getTime() - this.interviewMetrics.startedAt.getTime();
    }
    return this.interviewMetrics;
  }

  /**
   * Record token usage from an LLM call.
   */
  recordTokenUsage(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    operation?: string
  ): void {
    const record: TokenUsageRecord = {
      provider,
      model,
      inputTokens,
      outputTokens,
      timestamp: new Date(),
      operation,
    };

    if (this.options.trackRecords) {
      this.tokenRecords.push(record);
      this.trimRecords('token');
    }

    // Update aggregates
    const key = `${provider}:${model}`;
    const existing = this.tokensByProviderModel.get(key) ?? { input: 0, output: 0, calls: 0 };
    existing.input += inputTokens;
    existing.output += outputTokens;
    existing.calls++;
    this.tokensByProviderModel.set(key, existing);

    // Update cost
    const pricing = getModelPricing(model);
    if (pricing) {
      const inputCost = (inputTokens / 1_000_000) * pricing.input;
      const outputCost = (outputTokens / 1_000_000) * pricing.output;
      const totalCost = inputCost + outputCost;

      const costRecord: CostRecord = {
        provider,
        model,
        inputCost,
        outputCost,
        totalCost,
        timestamp: new Date(),
      };

      if (this.options.trackRecords) {
        this.costRecords.push(costRecord);
        this.trimRecords('cost');
      }

      const providerCost = this.costByProvider.get(provider) ?? 0;
      this.costByProvider.set(provider, providerCost + totalCost);

      // Update interview metrics
      if (this.interviewMetrics) {
        this.interviewMetrics.totalCostUSD += totalCost;
      }
    }

    // Update interview metrics
    if (this.interviewMetrics) {
      this.interviewMetrics.totalInputTokens += inputTokens;
      this.interviewMetrics.totalOutputTokens += outputTokens;
      this.interviewMetrics.llmCallsMade++;
    }
  }

  /**
   * Record operation timing.
   */
  recordTiming(
    operation: OperationType,
    durationMs: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    const record: TimingRecord = {
      operation,
      durationMs,
      success,
      timestamp: new Date(),
      metadata,
    };

    if (this.options.trackRecords) {
      this.timingRecords.push(record);
      this.trimRecords('timing');
    }

    // Update aggregates
    const existing = this.timingByOperation.get(operation) ?? { durations: [], successes: 0, failures: 0 };
    existing.durations.push(durationMs);
    if (success) {
      existing.successes++;
    } else {
      existing.failures++;
    }
    this.timingByOperation.set(operation, existing);

    // Update interview metrics for tool calls
    if (this.interviewMetrics && operation === 'tool_call') {
      this.interviewMetrics.toolCallsMade++;
      if (success) {
        this.interviewMetrics.toolCallsSucceeded++;
      } else {
        this.interviewMetrics.toolCallsFailed++;
      }
    }
  }

  /**
   * Record an error.
   */
  recordError(
    category: ErrorCategory,
    code: string,
    message: string,
    retryable: boolean,
    operation?: string
  ): void {
    const record: ErrorRecord = {
      category,
      code,
      message,
      timestamp: new Date(),
      retryable,
      operation,
    };

    if (this.options.trackRecords) {
      this.errorRecords.push(record);
      this.trimRecords('error');
    }

    // Update aggregates
    const existing = this.errorsByCategory.get(category) ?? { total: 0, retryable: 0, terminal: 0 };
    existing.total++;
    if (retryable) {
      existing.retryable++;
    } else {
      existing.terminal++;
    }
    this.errorsByCategory.set(category, existing);

    // Update interview metrics
    if (this.interviewMetrics) {
      this.interviewMetrics.errorsByCategory[category] =
        (this.interviewMetrics.errorsByCategory[category] ?? 0) + 1;
    }
  }

  /**
   * Update interview-specific counters.
   */
  updateInterviewCounters(updates: Partial<{
    toolsDiscovered: number;
    questionsGenerated: number;
    personasUsed: number;
  }>): void {
    if (this.interviewMetrics) {
      if (updates.toolsDiscovered !== undefined) {
        this.interviewMetrics.toolsDiscovered = updates.toolsDiscovered;
      }
      if (updates.questionsGenerated !== undefined) {
        this.interviewMetrics.questionsGenerated += updates.questionsGenerated;
      }
      if (updates.personasUsed !== undefined) {
        this.interviewMetrics.personasUsed = updates.personasUsed;
      }
    }
  }

  /**
   * Create a timed operation wrapper.
   */
  async time<T>(
    operation: OperationType,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      this.recordTiming(operation, Date.now() - startTime, true, metadata);
      return result;
    } catch (error) {
      this.recordTiming(operation, Date.now() - startTime, false, metadata);
      throw error;
    }
  }

  /**
   * Get current interview metrics.
   */
  getInterviewMetrics(): InterviewMetrics | null {
    return this.interviewMetrics;
  }

  /**
   * Get aggregated metrics for a time period.
   */
  getAggregatedMetrics(periodStart?: Date, periodEnd?: Date): AggregatedMetrics {
    const start = periodStart ?? new Date(0);
    const end = periodEnd ?? new Date();

    // Filter records by time period if tracking individual records
    const filteredTokenRecords = this.options.trackRecords
      ? this.tokenRecords.filter(r => r.timestamp >= start && r.timestamp <= end)
      : [];
    const filteredTimingRecords = this.options.trackRecords
      ? this.timingRecords.filter(r => r.timestamp >= start && r.timestamp <= end)
      : [];
    const filteredErrorRecords = this.options.trackRecords
      ? this.errorRecords.filter(r => r.timestamp >= start && r.timestamp <= end)
      : [];

    // Calculate token usage stats
    const tokenUsage = this.options.trackRecords
      ? this.calculateTokenUsageFromRecords(filteredTokenRecords)
      : this.calculateTokenUsageFromAggregates();

    // Calculate operation stats
    const operationStats = this.options.trackRecords
      ? this.calculateOperationStatsFromRecords(filteredTimingRecords)
      : this.calculateOperationStatsFromAggregates();

    // Calculate error stats
    const errorStats = this.options.trackRecords
      ? this.calculateErrorStatsFromRecords(filteredErrorRecords)
      : this.calculateErrorStatsFromAggregates();

    // Calculate total cost
    let totalCostUSD = 0;
    const costByProviderArr: { provider: string; costUSD: number }[] = [];
    for (const [provider, cost] of this.costByProvider) {
      totalCostUSD += cost;
      costByProviderArr.push({ provider, costUSD: cost });
    }

    return {
      periodStart: start,
      periodEnd: end,
      tokenUsage,
      operationStats,
      errorStats,
      totalCostUSD,
      costByProvider: costByProviderArr,
    };
  }

  /**
   * Get dashboard-compatible metrics.
   */
  getDashboardMetrics(): DashboardMetrics {
    const interview = this.interviewMetrics;
    const aggregated = this.getAggregatedMetrics();

    // Calculate progress
    let progress = 0;
    let status: 'running' | 'completed' | 'failed' = 'running';
    if (interview) {
      if (interview.endedAt) {
        const hasErrors = Object.values(interview.errorsByCategory).some(c => c > 0);
        status = hasErrors ? 'failed' : 'completed';
        progress = 100;
      } else if (interview.toolsDiscovered > 0) {
        // Estimate progress based on tool calls vs expected
        const expectedCalls = interview.toolsDiscovered * 5; // Rough estimate
        progress = Math.min(99, Math.round((interview.toolCallsMade / expectedCalls) * 100));
      }
    }

    // Calculate average latencies
    const llmStats = aggregated.operationStats.find(s => s.operation === 'llm_call');
    const toolStats = aggregated.operationStats.find(s => s.operation === 'tool_call');

    // Calculate success rate
    let totalOps = 0;
    let successOps = 0;
    for (const stat of aggregated.operationStats) {
      totalOps += stat.count;
      successOps += stat.successCount;
    }
    const successRate = totalOps > 0 ? (successOps / totalOps) * 100 : 100;

    // Calculate total errors
    let errorsTotal = 0;
    for (const stat of aggregated.errorStats) {
      errorsTotal += stat.count;
    }

    // Build provider breakdown
    const providers: DashboardMetrics['providers'] = [];
    for (const usage of aggregated.tokenUsage) {
      const existing = providers.find(p => p.name === usage.provider);
      if (existing) {
        existing.calls += usage.callCount;
        existing.tokens += usage.totalInputTokens + usage.totalOutputTokens;
      } else {
        providers.push({
          name: usage.provider,
          calls: usage.callCount,
          tokens: usage.totalInputTokens + usage.totalOutputTokens,
          errors: 0, // Would need to track errors by provider
          avgLatencyMs: llmStats?.avgDurationMs ?? 0,
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      interview: {
        status,
        progress,
        toolsTotal: interview?.toolsDiscovered ?? 0,
        toolsCompleted: interview?.toolCallsSucceeded ?? 0,
        questionsTotal: interview?.questionsGenerated ?? 0,
        questionsCompleted: interview?.toolCallsMade ?? 0,
      },
      tokens: {
        input: interview?.totalInputTokens ?? 0,
        output: interview?.totalOutputTokens ?? 0,
        total: (interview?.totalInputTokens ?? 0) + (interview?.totalOutputTokens ?? 0),
      },
      cost: {
        current: aggregated.totalCostUSD,
        projected: this.calculateProjectedCost(),
        currency: 'USD',
      },
      performance: {
        avgLLMLatencyMs: llmStats?.avgDurationMs ?? 0,
        avgToolLatencyMs: toolStats?.avgDurationMs ?? 0,
        errorsTotal,
        successRate,
      },
      providers,
    };
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.tokenRecords = [];
    this.timingRecords = [];
    this.errorRecords = [];
    this.costRecords = [];
    this.tokensByProviderModel.clear();
    this.timingByOperation.clear();
    this.errorsByCategory.clear();
    this.costByProvider.clear();
    this.interviewMetrics = null;
  }

  /**
   * Get raw records for external processing.
   */
  getRawRecords(): {
    tokens: TokenUsageRecord[];
    timing: TimingRecord[];
    errors: ErrorRecord[];
    costs: CostRecord[];
  } {
    return {
      tokens: [...this.tokenRecords],
      timing: [...this.timingRecords],
      errors: [...this.errorRecords],
      costs: [...this.costRecords],
    };
  }

  // Private helper methods

  private trimRecords(type: 'token' | 'timing' | 'error' | 'cost'): void {
    const maxRecords = this.options.maxRecords;
    switch (type) {
      case 'token':
        if (this.tokenRecords.length > maxRecords) {
          this.tokenRecords = this.tokenRecords.slice(-maxRecords);
        }
        break;
      case 'timing':
        if (this.timingRecords.length > maxRecords) {
          this.timingRecords = this.timingRecords.slice(-maxRecords);
        }
        break;
      case 'error':
        if (this.errorRecords.length > maxRecords) {
          this.errorRecords = this.errorRecords.slice(-maxRecords);
        }
        break;
      case 'cost':
        if (this.costRecords.length > maxRecords) {
          this.costRecords = this.costRecords.slice(-maxRecords);
        }
        break;
    }
  }

  private calculateTokenUsageFromRecords(records: TokenUsageRecord[]): AggregatedMetrics['tokenUsage'] {
    const byKey = new Map<string, { provider: string; model: string; input: number; output: number; calls: number }>();

    for (const record of records) {
      const key = `${record.provider}:${record.model}`;
      const existing = byKey.get(key) ?? {
        provider: record.provider,
        model: record.model,
        input: 0,
        output: 0,
        calls: 0,
      };
      existing.input += record.inputTokens;
      existing.output += record.outputTokens;
      existing.calls++;
      byKey.set(key, existing);
    }

    return Array.from(byKey.values()).map(v => ({
      provider: v.provider,
      model: v.model,
      totalInputTokens: v.input,
      totalOutputTokens: v.output,
      callCount: v.calls,
    }));
  }

  private calculateTokenUsageFromAggregates(): AggregatedMetrics['tokenUsage'] {
    return Array.from(this.tokensByProviderModel.entries()).map(([key, v]) => {
      const [provider, model] = key.split(':');
      return {
        provider,
        model,
        totalInputTokens: v.input,
        totalOutputTokens: v.output,
        callCount: v.calls,
      };
    });
  }

  private calculateOperationStatsFromRecords(records: TimingRecord[]): AggregatedMetrics['operationStats'] {
    const byOp = new Map<string, { durations: number[]; successes: number; failures: number }>();

    for (const record of records) {
      const existing = byOp.get(record.operation) ?? { durations: [], successes: 0, failures: 0 };
      existing.durations.push(record.durationMs);
      if (record.success) {
        existing.successes++;
      } else {
        existing.failures++;
      }
      byOp.set(record.operation, existing);
    }

    return this.convertOperationStats(byOp);
  }

  private calculateOperationStatsFromAggregates(): AggregatedMetrics['operationStats'] {
    return this.convertOperationStats(this.timingByOperation);
  }

  private convertOperationStats(
    byOp: Map<string, { durations: number[]; successes: number; failures: number }>
  ): AggregatedMetrics['operationStats'] {
    const results: AggregatedMetrics['operationStats'] = [];

    for (const [operation, data] of byOp) {
      const sorted = [...data.durations].sort((a, b) => a - b);
      const count = sorted.length;

      if (count === 0) continue;

      const sum = sorted.reduce((a, b) => a + b, 0);
      const avg = sum / count;
      const min = sorted[0];
      const max = sorted[count - 1];
      const p50 = sorted[Math.floor(count * 0.5)];
      const p95 = sorted[Math.floor(count * 0.95)];
      const p99 = sorted[Math.floor(count * 0.99)];

      results.push({
        operation: operation as OperationType,
        count,
        successCount: data.successes,
        failureCount: data.failures,
        avgDurationMs: Math.round(avg),
        minDurationMs: min,
        maxDurationMs: max,
        p50DurationMs: p50,
        p95DurationMs: p95,
        p99DurationMs: p99,
      });
    }

    return results;
  }

  private calculateErrorStatsFromRecords(records: ErrorRecord[]): AggregatedMetrics['errorStats'] {
    const byCategory = new Map<ErrorCategory, { total: number; retryable: number; terminal: number }>();

    for (const record of records) {
      const existing = byCategory.get(record.category) ?? { total: 0, retryable: 0, terminal: 0 };
      existing.total++;
      if (record.retryable) {
        existing.retryable++;
      } else {
        existing.terminal++;
      }
      byCategory.set(record.category, existing);
    }

    return Array.from(byCategory.entries()).map(([category, data]) => ({
      category,
      count: data.total,
      retryableCount: data.retryable,
      terminalCount: data.terminal,
    }));
  }

  private calculateErrorStatsFromAggregates(): AggregatedMetrics['errorStats'] {
    return Array.from(this.errorsByCategory.entries()).map(([category, data]) => ({
      category,
      count: data.total,
      retryableCount: data.retryable,
      terminalCount: data.terminal,
    }));
  }

  private calculateProjectedCost(): number {
    if (!this.interviewMetrics) return 0;

    const current = this.interviewMetrics.totalCostUSD;
    const toolsDone = this.interviewMetrics.toolCallsMade;
    const toolsTotal = this.interviewMetrics.toolsDiscovered * 5; // Rough estimate per persona

    if (toolsDone === 0 || toolsTotal === 0) return current;

    const progressRatio = toolsDone / toolsTotal;
    if (progressRatio >= 1) return current;

    return current / progressRatio;
  }
}

/**
 * Global metrics collector instance.
 */
let globalCollector: MetricsCollector | null = null;

/**
 * Get or create the global metrics collector.
 */
export function getMetricsCollector(options?: MetricsCollectorOptions): MetricsCollector {
  if (!globalCollector) {
    globalCollector = new MetricsCollector(options);
  }
  return globalCollector;
}

/**
 * Reset the global metrics collector.
 */
export function resetMetricsCollector(): void {
  globalCollector?.reset();
  globalCollector = null;
}
