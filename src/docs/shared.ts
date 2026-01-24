import type { ToolProfile } from '../interview/types.js';
import type { PerformanceConfidence } from '../baseline/types.js';
import { PERFORMANCE_CONFIDENCE } from '../constants.js';

/**
 * Performance metrics for a single tool.
 */
export interface ToolPerformanceMetrics {
  toolName: string;
  callCount: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  stdDevMs: number;
  errorRate: number;
  /** Average time for tool execution only (MCP transport) */
  avgToolMs?: number;
  /** Average time for LLM analysis only */
  avgAnalysisMs?: number;
  /** Statistical confidence metrics */
  confidence?: PerformanceConfidence;
}

/**
 * Extract parameter list from schema.
 */
export function extractParameters(schema: Record<string, unknown> | undefined): string {
  if (!schema || typeof schema !== 'object') {
    return '*none*';
  }

  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties || Object.keys(properties).length === 0) {
    return '*none*';
  }

  const required = (schema.required as string[]) || [];

  const params = Object.entries(properties).map(([name, prop]) => {
    const propObj = prop as Record<string, unknown>;
    const type = propObj.type as string || 'any';
    const isRequired = required.includes(name);
    return `\`${name}\`${isRequired ? '*' : ''}: ${type}`;
  });

  return params.slice(0, 3).join(', ') + (params.length > 3 ? ', ...' : '');
}

/**
 * Heuristic detection of error responses for summarization.
 */
export function looksLikeError(text: string): boolean {
  const errorPatterns = [
    /^error\s*[-:]/i,
    /:\s*error\s*-/i,
    /access denied/i,
    /permission denied/i,
    /not allowed/i,
    /outside allowed/i,
    /outside.*(predefined|allowed)/i,
    /path outside/i,
    /invalid path/i,
    /failed to/i,
    /could not/i,
    /unable to/i,
    /cannot\s+(access|read|write|create)/i,
    /restricted to/i,
  ];
  return errorPatterns.some((pattern) => pattern.test(text));
}

/**
 * Calculate performance metrics for all tools.
 */
export function calculatePerformanceMetrics(profiles: ToolProfile[]): ToolPerformanceMetrics[] {
  const metrics: ToolPerformanceMetrics[] = [];

  for (const profile of profiles) {
    const interactions = profile.interactions.filter(i => !i.mocked);
    if (interactions.length === 0) {
      continue;
    }

    const durations = interactions.map(i => i.durationMs);
    const errorCount = interactions.filter(i => i.error || i.response?.isError).length;

    // Sort durations for percentile calculations
    const sortedDurations = [...durations].sort((a, b) => a - b);

    const p50Index = Math.floor(sortedDurations.length * 0.5);
    const p95Index = Math.floor(sortedDurations.length * 0.95);

    // Calculate separate averages for tool execution and LLM analysis
    const toolDurations = interactions
      .map(i => i.toolExecutionMs)
      .filter((d): d is number => d !== undefined && d > 0);
    const analysisDurations = interactions
      .map(i => i.llmAnalysisMs)
      .filter((d): d is number => d !== undefined && d > 0);

    const avgToolMs = toolDurations.length > 0
      ? Math.round(toolDurations.reduce((a, b) => a + b, 0) / toolDurations.length)
      : undefined;
    const avgAnalysisMs = analysisDurations.length > 0
      ? Math.round(analysisDurations.reduce((a, b) => a + b, 0) / analysisDurations.length)
      : undefined;

    // Calculate average and standard deviation
    const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    const squaredDiffs = durations.map(d => Math.pow(d - avgMs, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / durations.length;
    const stdDevMs = Math.sqrt(variance);

    // Calculate coefficient of variation and confidence using successful tool executions only
    const successfulToolDurations = interactions
      .filter(i => i.toolExecutionMs !== undefined && !i.error && !i.response?.isError)
      .map(i => i.toolExecutionMs!);

    let confidenceCV: number;
    let confidenceStdDev: number;
    let confidenceSampleCount: number;

    if (successfulToolDurations.length === 0) {
      // All calls failed - low confidence
      confidenceCV = 0;
      confidenceStdDev = 0;
      confidenceSampleCount = 0;
    } else {
      const successMean = successfulToolDurations.reduce((a, b) => a + b, 0) / successfulToolDurations.length;
      const successVariance = successfulToolDurations.reduce((sum, d) => sum + Math.pow(d - successMean, 2), 0) / successfulToolDurations.length;
      confidenceStdDev = Math.sqrt(successVariance);
      confidenceCV = successMean > 0 ? confidenceStdDev / successMean : 0;
      confidenceSampleCount = successfulToolDurations.length;
    }

    const confidence = calculateConfidenceFromMetrics(
      confidenceSampleCount,
      confidenceCV,
      confidenceStdDev
    );

    metrics.push({
      toolName: profile.name,
      callCount: interactions.length,
      avgMs: Math.round(avgMs),
      minMs: Math.min(...durations),
      maxMs: Math.max(...durations),
      p50Ms: sortedDurations[p50Index] ?? 0,
      p95Ms: sortedDurations[Math.min(p95Index, sortedDurations.length - 1)] ?? 0,
      stdDevMs: Math.round(stdDevMs),
      errorRate: errorCount / interactions.length,
      avgToolMs,
      avgAnalysisMs,
      confidence,
    });
  }

  // Sort by avg response time (slowest first)
  return metrics.sort((a, b) => b.avgMs - a.avgMs);
}

function calculateConfidenceFromMetrics(
  sampleCount: number,
  coefficientOfVariation: number,
  standardDeviation: number,
  totalTests?: number
): PerformanceConfidence {
  // Handle no samples case
  if (sampleCount === 0) {
    return {
      sampleCount: 0,
      successfulSamples: 0,
      validationSamples: 0,
      totalTests: totalTests ?? 0,
      standardDeviation: 0,
      coefficientOfVariation: 0,
      confidenceLevel: 'low',
      recommendation: PERFORMANCE_CONFIDENCE.RECOMMENDATIONS.NO_SAMPLES,
    };
  }

  // Determine confidence level
  let confidenceLevel: 'high' | 'medium' | 'low';
  let recommendation: string | undefined;

  if (
    sampleCount >= PERFORMANCE_CONFIDENCE.HIGH.MIN_SAMPLES &&
    coefficientOfVariation <= PERFORMANCE_CONFIDENCE.HIGH.MAX_CV
  ) {
    confidenceLevel = 'high';
  } else if (
    sampleCount >= PERFORMANCE_CONFIDENCE.MEDIUM.MIN_SAMPLES &&
    coefficientOfVariation <= PERFORMANCE_CONFIDENCE.MEDIUM.MAX_CV
  ) {
    confidenceLevel = 'medium';
  } else {
    confidenceLevel = 'low';
    if (sampleCount < PERFORMANCE_CONFIDENCE.HIGH.MIN_SAMPLES) {
      recommendation = PERFORMANCE_CONFIDENCE.RECOMMENDATIONS.LOW_SAMPLES(
        sampleCount,
        PERFORMANCE_CONFIDENCE.HIGH.MIN_SAMPLES
      );
    } else {
      recommendation = PERFORMANCE_CONFIDENCE.RECOMMENDATIONS.HIGH_VARIABILITY;
    }
  }

  return {
    sampleCount,
    successfulSamples: sampleCount, // Assumes passed in count is successful samples
    validationSamples: 0, // Not tracked at this level, set to 0
    totalTests: totalTests ?? sampleCount,
    standardDeviation,
    coefficientOfVariation,
    confidenceLevel,
    recommendation,
  };
}
