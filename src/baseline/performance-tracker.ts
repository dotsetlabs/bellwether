/**
 * Performance Regression Detection
 *
 * Tracks response times across tool executions and detects performance regressions.
 * Provides percentile-based metrics (p50, p95, p99) for comprehensive latency analysis.
 */

import type { BehavioralBaseline, ChangeSeverity } from './types.js';
import { PERFORMANCE_TRACKING } from '../constants.js';
/**
 * Latency trend direction.
 */
export type LatencyTrend = 'improving' | 'stable' | 'degrading';

/**
 * Performance metrics for a single tool.
 */
export interface ToolPerformanceMetrics {
  /** Tool name */
  toolName: string;
  /** 50th percentile latency in milliseconds */
  p50Ms: number;
  /** 95th percentile latency in milliseconds */
  p95Ms: number;
  /** 99th percentile latency in milliseconds */
  p99Ms: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Total number of executions */
  sampleCount: number;
  /** Average latency in milliseconds */
  avgMs: number;
  /** Minimum latency in milliseconds */
  minMs: number;
  /** Maximum latency in milliseconds */
  maxMs: number;
  /** Standard deviation of latency */
  stdDevMs: number;
  /** Timestamp of when metrics were collected */
  collectedAt: Date;
}

/**
 * Performance baseline for a tool (stored in baseline file).
 */
export interface PerformanceBaseline {
  /** Tool name */
  toolName: string;
  /** Baseline 50th percentile latency */
  baselineP50: number;
  /** Baseline 95th percentile latency */
  baselineP95: number;
  /** Baseline 99th percentile latency */
  baselineP99: number;
  /** Baseline success rate */
  baselineSuccessRate: number;
  /** Maximum allowed regression percentage (default from config) */
  maxAllowedRegression: number;
  /** When the baseline was established */
  establishedAt: Date;
}

/**
 * Performance comparison result for a single tool.
 */
export interface PerformanceComparison {
  /** Tool name */
  toolName: string;
  /** Current metrics */
  current: ToolPerformanceMetrics;
  /** Baseline metrics (if available) */
  baseline?: PerformanceBaseline;
  /** Latency trend */
  trend: LatencyTrend;
  /** Regression percentage for p50 (positive = slower, negative = faster) */
  p50RegressionPercent: number | null;
  /** Regression percentage for p95 */
  p95RegressionPercent: number | null;
  /** Regression percentage for p99 */
  p99RegressionPercent: number | null;
  /** Whether this tool has regressed beyond threshold */
  hasRegression: boolean;
  /** Severity of the regression */
  severity: ChangeSeverity;
  /** Human-readable summary */
  summary: string;
}

/**
 * Overall performance report for a baseline comparison.
 */
export interface PerformanceReport {
  /** Individual tool comparisons */
  toolComparisons: PerformanceComparison[];
  /** Number of tools with performance regressions */
  regressionCount: number;
  /** Number of tools with improved performance */
  improvementCount: number;
  /** Number of tools with stable performance */
  stableCount: number;
  /** Overall performance trend */
  overallTrend: LatencyTrend;
  /** Overall severity */
  overallSeverity: ChangeSeverity;
  /** Human-readable summary */
  summary: string;
}

/**
 * Raw latency sample for calculating metrics.
 */
export interface LatencySample {
  toolName: string;
  durationMs: number;
  success: boolean;
  timestamp: Date;
}

// Re-export centralized constant for backwards compatibility
export { PERFORMANCE_TRACKING as PERFORMANCE } from '../constants.js';
/**
 * Calculate performance metrics from raw latency samples.
 */
export function calculateMetrics(samples: LatencySample[]): ToolPerformanceMetrics | null {
  if (samples.length === 0) {
    return null;
  }

  const toolName = samples[0].toolName;
  const successfulSamples = samples.filter(s => s.success);
  const durations = successfulSamples.map(s => s.durationMs).sort((a, b) => a - b);

  if (durations.length === 0) {
    // All calls failed
    return {
      toolName,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      successRate: 0,
      sampleCount: samples.length,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      stdDevMs: 0,
      collectedAt: new Date(),
    };
  }

  const p50Ms = calculatePercentile(durations, 50);
  const p95Ms = calculatePercentile(durations, 95);
  const p99Ms = calculatePercentile(durations, 99);

  const avgMs = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const minMs = durations[0];
  const maxMs = durations[durations.length - 1];

  // Calculate standard deviation
  const squaredDiffs = durations.map(d => Math.pow(d - avgMs, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, d) => sum + d, 0) / squaredDiffs.length;
  const stdDevMs = Math.sqrt(avgSquaredDiff);

  return {
    toolName,
    p50Ms,
    p95Ms,
    p99Ms,
    successRate: successfulSamples.length / samples.length,
    sampleCount: samples.length,
    avgMs,
    minMs,
    maxMs,
    stdDevMs,
    collectedAt: new Date(),
  };
}

/**
 * Calculate a specific percentile from sorted values.
 */
function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  // Linear interpolation
  const fraction = index - lower;
  return sortedValues[lower] + fraction * (sortedValues[upper] - sortedValues[lower]);
}
/**
 * Create a performance baseline from metrics.
 */
export function createPerformanceBaseline(
  metrics: ToolPerformanceMetrics,
  maxAllowedRegression: number = PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD
): PerformanceBaseline {
  return {
    toolName: metrics.toolName,
    baselineP50: metrics.p50Ms,
    baselineP95: metrics.p95Ms,
    baselineP99: metrics.p99Ms,
    baselineSuccessRate: metrics.successRate,
    maxAllowedRegression,
    establishedAt: new Date(),
  };
}

/**
 * Extract performance baselines from a behavioral baseline.
 * Uses the performance metrics stored in tool fingerprints.
 */
export function extractPerformanceBaselines(
  baseline: BehavioralBaseline,
  regressionThreshold: number = PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD
): Map<string, PerformanceBaseline> {
  const baselines = new Map<string, PerformanceBaseline>();

  for (const tool of baseline.tools) {
    // Only create baseline if performance data exists
    if (tool.baselineP50Ms !== undefined && tool.baselineP95Ms !== undefined) {
      baselines.set(tool.name, {
        toolName: tool.name,
        baselineP50: tool.baselineP50Ms,
        baselineP95: tool.baselineP95Ms,
        baselineP99: tool.baselineP95Ms * 1.2, // Estimate p99 from p95 if not stored
        baselineSuccessRate: tool.baselineSuccessRate ?? 1.0,
        maxAllowedRegression: regressionThreshold,
        establishedAt: baseline.createdAt,
      });
    }
  }

  return baselines;
}
/**
 * Compare current metrics against baseline.
 */
export function comparePerformance(
  current: ToolPerformanceMetrics,
  baseline: PerformanceBaseline | undefined,
  regressionThreshold: number = PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD
): PerformanceComparison {
  // No baseline - can't compare
  if (!baseline) {
    return {
      toolName: current.toolName,
      current,
      baseline: undefined,
      trend: 'stable',
      p50RegressionPercent: null,
      p95RegressionPercent: null,
      p99RegressionPercent: null,
      hasRegression: false,
      severity: 'none',
      summary: `No baseline for "${current.toolName}" - metrics recorded for future comparison.`,
    };
  }

  // Calculate regression percentages
  const p50Regression = calculateRegression(baseline.baselineP50, current.p50Ms);
  const p95Regression = calculateRegression(baseline.baselineP95, current.p95Ms);
  const p99Regression = calculateRegression(baseline.baselineP99, current.p99Ms);

  // Determine trend (based on p50 as primary metric)
  const trend = determineTrend(p50Regression);

  // Check for regression
  const maxRegression = baseline.maxAllowedRegression ?? regressionThreshold;
  const hasRegression =
    p50Regression !== null && p50Regression > maxRegression ||
    p95Regression !== null && p95Regression > maxRegression;

  // Determine severity
  const severity = determinePerformanceSeverity(p50Regression, p95Regression, maxRegression);

  // Generate summary
  const summary = generateComparisonSummary(
    current.toolName,
    trend,
    p50Regression,
    p95Regression,
    hasRegression,
    maxRegression
  );

  return {
    toolName: current.toolName,
    current,
    baseline,
    trend,
    p50RegressionPercent: p50Regression,
    p95RegressionPercent: p95Regression,
    p99RegressionPercent: p99Regression,
    hasRegression,
    severity,
    summary,
  };
}

/**
 * Calculate regression percentage.
 * Returns positive for slower (regression), negative for faster (improvement).
 */
function calculateRegression(baseline: number, current: number): number | null {
  if (baseline === 0) {
    return null;
  }

  return (current - baseline) / baseline;
}

/**
 * Determine latency trend from regression percentage.
 */
function determineTrend(regression: number | null): LatencyTrend {
  if (regression === null) {
    return 'stable';
  }

  if (regression <= PERFORMANCE_TRACKING.TREND_THRESHOLDS.improving) {
    return 'improving';
  }

  if (regression >= PERFORMANCE_TRACKING.TREND_THRESHOLDS.degrading) {
    return 'degrading';
  }

  return 'stable';
}

/**
 * Determine severity based on regression percentages.
 */
function determinePerformanceSeverity(
  p50Regression: number | null,
  p95Regression: number | null,
  threshold: number
): ChangeSeverity {
  // Check if any significant regression
  const maxRegression = Math.max(
    p50Regression ?? 0,
    p95Regression ?? 0
  );

  if (maxRegression > threshold) {
    return 'breaking';
  }

  if (maxRegression > PERFORMANCE_TRACKING.WARNING_THRESHOLD) {
    return 'warning';
  }

  if (maxRegression > 0) {
    return 'info';
  }

  return 'none';
}

/**
 * Generate human-readable comparison summary.
 */
function generateComparisonSummary(
  toolName: string,
  trend: LatencyTrend,
  p50Regression: number | null,
  p95Regression: number | null,
  hasRegression: boolean,
  threshold: number
): string {
  if (p50Regression === null) {
    return `No baseline performance data for "${toolName}".`;
  }

  const p50Percent = (p50Regression * 100).toFixed(1);
  const p95Percent = p95Regression !== null ? (p95Regression * 100).toFixed(1) : 'N/A';
  const thresholdPercent = (threshold * 100).toFixed(0);

  if (hasRegression) {
    return `"${toolName}" performance REGRESSION: p50 ${p50Percent}% slower, p95 ${p95Percent}% slower (threshold: ${thresholdPercent}%)`;
  }

  if (trend === 'improving') {
    return `"${toolName}" performance improved: p50 ${Math.abs(parseFloat(p50Percent))}% faster`;
  }

  if (trend === 'degrading') {
    return `"${toolName}" performance slightly degraded: p50 ${p50Percent}% slower (within threshold)`;
  }

  return `"${toolName}" performance stable: p50 ${p50Percent}% change`;
}
/**
 * Generate a complete performance report comparing current and baseline.
 */
export function generatePerformanceReport(
  currentMetrics: Map<string, ToolPerformanceMetrics>,
  baselines: Map<string, PerformanceBaseline>,
  regressionThreshold: number = PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD
): PerformanceReport {
  const comparisons: PerformanceComparison[] = [];
  let regressionCount = 0;
  let improvementCount = 0;
  let stableCount = 0;

  // Compare each tool
  for (const [toolName, metrics] of currentMetrics) {
    const baseline = baselines.get(toolName);
    const comparison = comparePerformance(metrics, baseline, regressionThreshold);
    comparisons.push(comparison);

    if (comparison.hasRegression) {
      regressionCount++;
    } else if (comparison.trend === 'improving') {
      improvementCount++;
    } else {
      stableCount++;
    }
  }

  // Determine overall trend
  let overallTrend: LatencyTrend = 'stable';
  if (regressionCount > 0) {
    overallTrend = 'degrading';
  } else if (improvementCount > stableCount) {
    overallTrend = 'improving';
  }

  // Determine overall severity
  const overallSeverity = comparisons.reduce<ChangeSeverity>((max, c) => {
    const severityOrder: ChangeSeverity[] = ['none', 'info', 'warning', 'breaking'];
    return severityOrder.indexOf(c.severity) > severityOrder.indexOf(max) ? c.severity : max;
  }, 'none');

  // Generate summary
  const summary = generateReportSummary(regressionCount, improvementCount, stableCount, comparisons.length);

  return {
    toolComparisons: comparisons,
    regressionCount,
    improvementCount,
    stableCount,
    overallTrend,
    overallSeverity,
    summary,
  };
}

/**
 * Generate report summary.
 */
function generateReportSummary(
  regressions: number,
  improvements: number,
  stable: number,
  total: number
): string {
  const parts: string[] = [];

  if (regressions > 0) {
    parts.push(`${regressions} tool(s) with performance regression`);
  }
  if (improvements > 0) {
    parts.push(`${improvements} tool(s) with improved performance`);
  }
  if (stable > 0) {
    parts.push(`${stable} tool(s) with stable performance`);
  }

  if (parts.length === 0) {
    return `No performance data for ${total} tool(s).`;
  }

  return parts.join(', ') + '.';
}
/**
 * Format performance metrics for display.
 */
export function formatMetrics(metrics: ToolPerformanceMetrics): string {
  return [
    `Tool: ${metrics.toolName}`,
    `  p50: ${metrics.p50Ms.toFixed(1)}ms`,
    `  p95: ${metrics.p95Ms.toFixed(1)}ms`,
    `  p99: ${metrics.p99Ms.toFixed(1)}ms`,
    `  avg: ${metrics.avgMs.toFixed(1)}ms`,
    `  success: ${(metrics.successRate * 100).toFixed(1)}%`,
    `  samples: ${metrics.sampleCount}`,
  ].join('\n');
}

/**
 * Format performance comparison for display.
 */
export function formatComparison(comparison: PerformanceComparison): string {
  const lines = [
    `Tool: ${comparison.toolName}`,
    `  Trend: ${comparison.trend.toUpperCase()}`,
  ];

  if (comparison.p50RegressionPercent !== null) {
    const sign = comparison.p50RegressionPercent >= 0 ? '+' : '';
    lines.push(`  p50 change: ${sign}${(comparison.p50RegressionPercent * 100).toFixed(1)}%`);
  }

  if (comparison.p95RegressionPercent !== null) {
    const sign = comparison.p95RegressionPercent >= 0 ? '+' : '';
    lines.push(`  p95 change: ${sign}${(comparison.p95RegressionPercent * 100).toFixed(1)}%`);
  }

  if (comparison.hasRegression) {
    lines.push(`  ⚠️ REGRESSION DETECTED`);
  }

  return lines.join('\n');
}

/**
 * Check if metrics indicate acceptable performance.
 */
export function isPerformanceAcceptable(
  comparison: PerformanceComparison,
  failOnRegression: boolean = false
): boolean {
  if (!failOnRegression) {
    return true;
  }

  return !comparison.hasRegression;
}

/**
 * Aggregate multiple samples into metrics grouped by tool.
 */
export function aggregateSamplesByTool(
  samples: LatencySample[]
): Map<string, ToolPerformanceMetrics> {
  const metrics = new Map<string, ToolPerformanceMetrics>();

  // Group samples by tool
  const groupedSamples = new Map<string, LatencySample[]>();
  for (const sample of samples) {
    const existing = groupedSamples.get(sample.toolName) || [];
    existing.push(sample);
    groupedSamples.set(sample.toolName, existing);
  }

  // Calculate metrics for each tool
  for (const [toolName, toolSamples] of groupedSamples) {
    const toolMetrics = calculateMetrics(toolSamples);
    if (toolMetrics) {
      metrics.set(toolName, toolMetrics);
    }
  }

  return metrics;
}
