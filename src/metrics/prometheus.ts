/**
 * Prometheus metrics exporter.
 *
 * Exports metrics in Prometheus text format for scraping.
 */

import type { MetricsCollector } from './collector.js';
import type { PrometheusMetric, HistogramBuckets } from './types.js';

/**
 * Default histogram buckets for latency metrics (in ms).
 */
const DEFAULT_LATENCY_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Metric definitions for Prometheus export.
 */
const METRIC_DEFINITIONS: PrometheusMetric[] = [
  // Token usage metrics
  {
    name: 'bellwether_llm_tokens_total',
    type: 'counter',
    help: 'Total number of tokens used',
    labels: ['provider', 'model', 'direction'],
  },
  {
    name: 'bellwether_llm_calls_total',
    type: 'counter',
    help: 'Total number of LLM API calls',
    labels: ['provider', 'model'],
  },

  // Cost metrics
  {
    name: 'bellwether_cost_usd_total',
    type: 'counter',
    help: 'Total cost in USD',
    labels: ['provider'],
  },

  // Operation timing metrics
  {
    name: 'bellwether_operation_duration_seconds',
    type: 'histogram',
    help: 'Duration of operations in seconds',
    labels: ['operation', 'status'],
  },
  {
    name: 'bellwether_operation_total',
    type: 'counter',
    help: 'Total number of operations',
    labels: ['operation', 'status'],
  },

  // Error metrics
  {
    name: 'bellwether_errors_total',
    type: 'counter',
    help: 'Total number of errors',
    labels: ['category', 'retryable'],
  },

  // Interview metrics
  {
    name: 'bellwether_interview_tools_discovered',
    type: 'gauge',
    help: 'Number of tools discovered in current interview',
  },
  {
    name: 'bellwether_interview_questions_generated',
    type: 'gauge',
    help: 'Number of questions generated in current interview',
  },
  {
    name: 'bellwether_interview_tool_calls_total',
    type: 'counter',
    help: 'Total tool calls in current interview',
    labels: ['status'],
  },
  {
    name: 'bellwether_interview_duration_seconds',
    type: 'gauge',
    help: 'Duration of current/last interview in seconds',
  },
  {
    name: 'bellwether_interview_progress_ratio',
    type: 'gauge',
    help: 'Progress of current interview (0-1)',
  },
];

/**
 * Export metrics in Prometheus text format.
 */
export function exportPrometheusMetrics(collector: MetricsCollector): string {
  const lines: string[] = [];
  const aggregated = collector.getAggregatedMetrics();
  const interview = collector.getInterviewMetrics();

  // Helper to add metric header
  const addHeader = (metric: PrometheusMetric): void => {
    lines.push(`# HELP ${metric.name} ${metric.help}`);
    lines.push(`# TYPE ${metric.name} ${metric.type}`);
  };

  // Helper to format labels
  const formatLabels = (labels?: Record<string, string>): string => {
    if (!labels || Object.keys(labels).length === 0) return '';
    const pairs = Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`);
    return `{${pairs.join(',')}}`;
  };

  // Helper to add metric value
  const addValue = (name: string, value: number, labels?: Record<string, string>): void => {
    lines.push(`${name}${formatLabels(labels)} ${value}`);
  };

  // Token usage metrics
  const tokenMetric = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_llm_tokens_total')!;
  addHeader(tokenMetric);
  for (const usage of aggregated.tokenUsage) {
    addValue(tokenMetric.name, usage.totalInputTokens, {
      provider: usage.provider,
      model: usage.model,
      direction: 'input',
    });
    addValue(tokenMetric.name, usage.totalOutputTokens, {
      provider: usage.provider,
      model: usage.model,
      direction: 'output',
    });
  }

  // LLM calls metric
  const callsMetric = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_llm_calls_total')!;
  addHeader(callsMetric);
  for (const usage of aggregated.tokenUsage) {
    addValue(callsMetric.name, usage.callCount, {
      provider: usage.provider,
      model: usage.model,
    });
  }

  // Cost metrics
  const costMetric = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_cost_usd_total')!;
  addHeader(costMetric);
  for (const cost of aggregated.costByProvider) {
    addValue(costMetric.name, cost.costUSD, { provider: cost.provider });
  }

  // Operation duration histogram
  const durationMetric = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_operation_duration_seconds')!;
  addHeader(durationMetric);
  for (const stat of aggregated.operationStats) {
    // Add histogram buckets
    const buckets = calculateHistogramBuckets(
      collector.getRawRecords().timing
        .filter(r => r.operation === stat.operation)
        .map(r => r.durationMs / 1000), // Convert to seconds
      DEFAULT_LATENCY_BUCKETS.map(b => b / 1000)
    );

    for (let i = 0; i < buckets.le.length; i++) {
      addValue(`${durationMetric.name}_bucket`, buckets.counts[i], {
        operation: stat.operation,
        status: 'all',
        le: buckets.le[i] === Infinity ? '+Inf' : String(buckets.le[i]),
      });
    }
    addValue(`${durationMetric.name}_sum`, buckets.sum, { operation: stat.operation, status: 'all' });
    addValue(`${durationMetric.name}_count`, buckets.count, { operation: stat.operation, status: 'all' });
  }

  // Operation total counter
  const opTotalMetric = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_operation_total')!;
  addHeader(opTotalMetric);
  for (const stat of aggregated.operationStats) {
    addValue(opTotalMetric.name, stat.successCount, { operation: stat.operation, status: 'success' });
    addValue(opTotalMetric.name, stat.failureCount, { operation: stat.operation, status: 'failure' });
  }

  // Error metrics
  const errorMetric = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_errors_total')!;
  addHeader(errorMetric);
  for (const stat of aggregated.errorStats) {
    addValue(errorMetric.name, stat.retryableCount, { category: stat.category, retryable: 'true' });
    addValue(errorMetric.name, stat.terminalCount, { category: stat.category, retryable: 'false' });
  }

  // Interview-specific metrics
  if (interview) {
    const toolsMetric = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_interview_tools_discovered')!;
    addHeader(toolsMetric);
    addValue(toolsMetric.name, interview.toolsDiscovered);

    const questionsMetric = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_interview_questions_generated')!;
    addHeader(questionsMetric);
    addValue(questionsMetric.name, interview.questionsGenerated);

    const toolCallsMetric = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_interview_tool_calls_total')!;
    addHeader(toolCallsMetric);
    addValue(toolCallsMetric.name, interview.toolCallsSucceeded, { status: 'success' });
    addValue(toolCallsMetric.name, interview.toolCallsFailed, { status: 'failure' });

    const durationGauge = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_interview_duration_seconds')!;
    addHeader(durationGauge);
    const durationSec = interview.totalDurationMs
      ? interview.totalDurationMs / 1000
      : (Date.now() - interview.startedAt.getTime()) / 1000;
    addValue(durationGauge.name, durationSec);

    const progressMetric = METRIC_DEFINITIONS.find(m => m.name === 'bellwether_interview_progress_ratio')!;
    addHeader(progressMetric);
    const expectedCalls = interview.toolsDiscovered * 5;
    const progress = expectedCalls > 0 ? Math.min(1, interview.toolCallsMade / expectedCalls) : 0;
    addValue(progressMetric.name, progress);
  }

  return lines.join('\n');
}

/**
 * Calculate histogram buckets from raw values.
 */
function calculateHistogramBuckets(values: number[], boundaries: number[]): HistogramBuckets {
  const bucketBoundaries = [...boundaries, Infinity];
  const counts = new Array(bucketBoundaries.length).fill(0);
  let sum = 0;

  for (const value of values) {
    sum += value;
    for (let i = 0; i < bucketBoundaries.length; i++) {
      if (value <= bucketBoundaries[i]) {
        counts[i]++;
      }
    }
  }

  // Make counts cumulative
  for (let i = 1; i < counts.length; i++) {
    counts[i] += counts[i - 1];
  }

  return {
    le: bucketBoundaries,
    counts,
    sum,
    count: values.length,
  };
}

/**
 * Escape label value for Prometheus format.
 */
function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Export metrics as JSON for dashboard consumption.
 */
export function exportMetricsJSON(collector: MetricsCollector): string {
  return JSON.stringify(collector.getDashboardMetrics(), null, 2);
}

/**
 * Get metric definitions for documentation.
 */
export function getMetricDefinitions(): PrometheusMetric[] {
  return [...METRIC_DEFINITIONS];
}
