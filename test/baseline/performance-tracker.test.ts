/**
 * Tests for performance tracker.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMetrics,
  createPerformanceBaseline,
  comparePerformance,
  generatePerformanceReport,
  formatMetrics,
  formatComparison,
  isPerformanceAcceptable,
  aggregateSamplesByTool,
} from '../../src/baseline/performance-tracker.js';
import type {
  LatencySample,
  ToolPerformanceMetrics,
  PerformanceBaseline,
} from '../../src/baseline/performance-tracker.js';
import { PERFORMANCE_TRACKING } from '../../src/constants.js';

// Helper to create latency samples
function createSamples(
  toolName: string,
  durations: number[],
  successRate: number = 1.0
): LatencySample[] {
  return durations.map((duration, i) => ({
    toolName,
    durationMs: duration,
    success: i < durations.length * successRate,
    timestamp: new Date(),
  }));
}

describe('Performance Tracker', () => {
  describe('calculateMetrics', () => {
    it('should return null for empty samples', () => {
      const metrics = calculateMetrics([]);
      expect(metrics).toBeNull();
    });

    it('should calculate correct percentiles', () => {
      // 10 samples from 100ms to 1000ms
      const samples = createSamples('test_tool', [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
      const metrics = calculateMetrics(samples);

      expect(metrics).not.toBeNull();
      expect(metrics!.toolName).toBe('test_tool');
      expect(metrics!.p50Ms).toBeCloseTo(550, 0); // 50th percentile
      expect(metrics!.p95Ms).toBeGreaterThan(metrics!.p50Ms);
      expect(metrics!.p99Ms).toBeGreaterThan(metrics!.p95Ms);
    });

    it('should calculate average correctly', () => {
      const samples = createSamples('test_tool', [100, 200, 300]);
      const metrics = calculateMetrics(samples);

      expect(metrics!.avgMs).toBe(200);
    });

    it('should calculate min and max correctly', () => {
      const samples = createSamples('test_tool', [100, 500, 200, 800]);
      const metrics = calculateMetrics(samples);

      expect(metrics!.minMs).toBe(100);
      expect(metrics!.maxMs).toBe(800);
    });

    it('should calculate success rate correctly', () => {
      // 8 successes, 2 failures
      const samples: LatencySample[] = [
        ...createSamples('test_tool', [100, 200, 300, 400, 500, 600, 700, 800]),
        { toolName: 'test_tool', durationMs: 900, success: false, timestamp: new Date() },
        { toolName: 'test_tool', durationMs: 1000, success: false, timestamp: new Date() },
      ];
      const metrics = calculateMetrics(samples);

      expect(metrics!.successRate).toBe(0.8);
    });

    it('should handle all failures', () => {
      const samples: LatencySample[] = [
        { toolName: 'test_tool', durationMs: 100, success: false, timestamp: new Date() },
        { toolName: 'test_tool', durationMs: 200, success: false, timestamp: new Date() },
      ];
      const metrics = calculateMetrics(samples);

      expect(metrics!.successRate).toBe(0);
      expect(metrics!.p50Ms).toBe(0);
    });

    it('should calculate standard deviation', () => {
      const samples = createSamples('test_tool', [100, 100, 100, 100]);
      const metrics = calculateMetrics(samples);

      expect(metrics!.stdDevMs).toBe(0); // No variation
    });
  });

  describe('createPerformanceBaseline', () => {
    it('should create baseline from metrics', () => {
      const metrics: ToolPerformanceMetrics = {
        toolName: 'test_tool',
        p50Ms: 100,
        p95Ms: 200,
        p99Ms: 300,
        successRate: 0.99,
        sampleCount: 100,
        avgMs: 120,
        minMs: 50,
        maxMs: 500,
        stdDevMs: 50,
        collectedAt: new Date(),
      };

      const baseline = createPerformanceBaseline(metrics);

      expect(baseline.toolName).toBe('test_tool');
      expect(baseline.baselineP50).toBe(100);
      expect(baseline.baselineP95).toBe(200);
      expect(baseline.baselineP99).toBe(300);
      expect(baseline.baselineSuccessRate).toBe(0.99);
      expect(baseline.maxAllowedRegression).toBe(PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD);
    });

    it('should allow custom regression threshold', () => {
      const metrics: ToolPerformanceMetrics = {
        toolName: 'test_tool',
        p50Ms: 100,
        p95Ms: 200,
        p99Ms: 300,
        successRate: 0.99,
        sampleCount: 100,
        avgMs: 120,
        minMs: 50,
        maxMs: 500,
        stdDevMs: 50,
        collectedAt: new Date(),
      };

      const baseline = createPerformanceBaseline(metrics, 0.20);

      expect(baseline.maxAllowedRegression).toBe(0.20);
    });
  });

  describe('comparePerformance', () => {
    it('should handle missing baseline', () => {
      const current: ToolPerformanceMetrics = {
        toolName: 'test_tool',
        p50Ms: 100,
        p95Ms: 200,
        p99Ms: 300,
        successRate: 0.99,
        sampleCount: 100,
        avgMs: 120,
        minMs: 50,
        maxMs: 500,
        stdDevMs: 50,
        collectedAt: new Date(),
      };

      const comparison = comparePerformance(current, undefined);

      expect(comparison.trend).toBe('stable');
      expect(comparison.hasRegression).toBe(false);
      expect(comparison.p50RegressionPercent).toBeNull();
    });

    it('should detect regression', () => {
      const current: ToolPerformanceMetrics = {
        toolName: 'test_tool',
        p50Ms: 150, // 50% slower
        p95Ms: 300, // 50% slower
        p99Ms: 450,
        successRate: 0.99,
        sampleCount: 100,
        avgMs: 170,
        minMs: 75,
        maxMs: 750,
        stdDevMs: 75,
        collectedAt: new Date(),
      };

      const baseline: PerformanceBaseline = {
        toolName: 'test_tool',
        baselineP50: 100,
        baselineP95: 200,
        baselineP99: 300,
        baselineSuccessRate: 0.99,
        maxAllowedRegression: 0.10, // 10% threshold
        establishedAt: new Date(),
      };

      const comparison = comparePerformance(current, baseline);

      expect(comparison.hasRegression).toBe(true);
      expect(comparison.trend).toBe('degrading');
      expect(comparison.p50RegressionPercent).toBe(0.5); // 50%
      expect(comparison.severity).toBe('breaking');
    });

    it('should detect improvement', () => {
      const current: ToolPerformanceMetrics = {
        toolName: 'test_tool',
        p50Ms: 80, // 20% faster
        p95Ms: 160, // 20% faster
        p99Ms: 240,
        successRate: 0.99,
        sampleCount: 100,
        avgMs: 96,
        minMs: 40,
        maxMs: 400,
        stdDevMs: 40,
        collectedAt: new Date(),
      };

      const baseline: PerformanceBaseline = {
        toolName: 'test_tool',
        baselineP50: 100,
        baselineP95: 200,
        baselineP99: 300,
        baselineSuccessRate: 0.99,
        maxAllowedRegression: 0.10,
        establishedAt: new Date(),
      };

      const comparison = comparePerformance(current, baseline);

      expect(comparison.hasRegression).toBe(false);
      expect(comparison.trend).toBe('improving');
      expect(comparison.p50RegressionPercent).toBe(-0.2); // -20%
    });

    it('should detect stable performance', () => {
      const current: ToolPerformanceMetrics = {
        toolName: 'test_tool',
        p50Ms: 102, // 2% slower (within threshold)
        p95Ms: 204,
        p99Ms: 306,
        successRate: 0.99,
        sampleCount: 100,
        avgMs: 122,
        minMs: 51,
        maxMs: 510,
        stdDevMs: 51,
        collectedAt: new Date(),
      };

      const baseline: PerformanceBaseline = {
        toolName: 'test_tool',
        baselineP50: 100,
        baselineP95: 200,
        baselineP99: 300,
        baselineSuccessRate: 0.99,
        maxAllowedRegression: 0.10,
        establishedAt: new Date(),
      };

      const comparison = comparePerformance(current, baseline);

      expect(comparison.hasRegression).toBe(false);
      expect(comparison.trend).toBe('stable');
    });
  });

  describe('generatePerformanceReport', () => {
    it('should generate report for multiple tools', () => {
      const currentMetrics = new Map<string, ToolPerformanceMetrics>();
      currentMetrics.set('tool1', {
        toolName: 'tool1',
        p50Ms: 150, // Regression
        p95Ms: 300,
        p99Ms: 450,
        successRate: 0.99,
        sampleCount: 100,
        avgMs: 170,
        minMs: 75,
        maxMs: 750,
        stdDevMs: 75,
        collectedAt: new Date(),
      });
      currentMetrics.set('tool2', {
        toolName: 'tool2',
        p50Ms: 80, // Improvement
        p95Ms: 160,
        p99Ms: 240,
        successRate: 0.99,
        sampleCount: 100,
        avgMs: 96,
        minMs: 40,
        maxMs: 400,
        stdDevMs: 40,
        collectedAt: new Date(),
      });

      const baselines = new Map<string, PerformanceBaseline>();
      baselines.set('tool1', {
        toolName: 'tool1',
        baselineP50: 100,
        baselineP95: 200,
        baselineP99: 300,
        baselineSuccessRate: 0.99,
        maxAllowedRegression: 0.10,
        establishedAt: new Date(),
      });
      baselines.set('tool2', {
        toolName: 'tool2',
        baselineP50: 100,
        baselineP95: 200,
        baselineP99: 300,
        baselineSuccessRate: 0.99,
        maxAllowedRegression: 0.10,
        establishedAt: new Date(),
      });

      const report = generatePerformanceReport(currentMetrics, baselines);

      expect(report.toolComparisons).toHaveLength(2);
      expect(report.regressionCount).toBe(1);
      expect(report.improvementCount).toBe(1);
      expect(report.stableCount).toBe(0);
      expect(report.overallTrend).toBe('degrading'); // Has regression
    });

    it('should handle empty metrics', () => {
      const report = generatePerformanceReport(new Map(), new Map());

      expect(report.toolComparisons).toHaveLength(0);
      expect(report.regressionCount).toBe(0);
      expect(report.summary).toContain('No performance data');
    });
  });

  describe('formatMetrics', () => {
    it('should format metrics for display', () => {
      const metrics: ToolPerformanceMetrics = {
        toolName: 'test_tool',
        p50Ms: 100,
        p95Ms: 200,
        p99Ms: 300,
        successRate: 0.99,
        sampleCount: 100,
        avgMs: 120,
        minMs: 50,
        maxMs: 500,
        stdDevMs: 50,
        collectedAt: new Date(),
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('test_tool');
      expect(formatted).toContain('p50');
      expect(formatted).toContain('p95');
      expect(formatted).toContain('p99');
      expect(formatted).toContain('success');
      expect(formatted).toContain('99.0%');
    });
  });

  describe('formatComparison', () => {
    it('should format comparison with regression', () => {
      const comparison = {
        toolName: 'test_tool',
        current: {
          toolName: 'test_tool',
          p50Ms: 150,
          p95Ms: 300,
          p99Ms: 450,
          successRate: 0.99,
          sampleCount: 100,
          avgMs: 170,
          minMs: 75,
          maxMs: 750,
          stdDevMs: 75,
          collectedAt: new Date(),
        },
        baseline: {
          toolName: 'test_tool',
          baselineP50: 100,
          baselineP95: 200,
          baselineP99: 300,
          baselineSuccessRate: 0.99,
          maxAllowedRegression: 0.10,
          establishedAt: new Date(),
        },
        trend: 'degrading' as const,
        p50RegressionPercent: 0.5,
        p95RegressionPercent: 0.5,
        p99RegressionPercent: 0.5,
        hasRegression: true,
        severity: 'breaking' as const,
        summary: 'Regression detected',
      };

      const formatted = formatComparison(comparison);

      expect(formatted).toContain('test_tool');
      expect(formatted).toContain('DEGRADING');
      expect(formatted).toContain('REGRESSION');
    });
  });

  describe('isPerformanceAcceptable', () => {
    it('should return true when not failing on regression', () => {
      const comparison = {
        toolName: 'test_tool',
        current: {} as ToolPerformanceMetrics,
        trend: 'degrading' as const,
        p50RegressionPercent: 0.5,
        p95RegressionPercent: 0.5,
        p99RegressionPercent: 0.5,
        hasRegression: true,
        severity: 'breaking' as const,
        summary: 'Regression',
      };

      expect(isPerformanceAcceptable(comparison, false)).toBe(true);
    });

    it('should return false when failing on regression', () => {
      const comparison = {
        toolName: 'test_tool',
        current: {} as ToolPerformanceMetrics,
        trend: 'degrading' as const,
        p50RegressionPercent: 0.5,
        p95RegressionPercent: 0.5,
        p99RegressionPercent: 0.5,
        hasRegression: true,
        severity: 'breaking' as const,
        summary: 'Regression',
      };

      expect(isPerformanceAcceptable(comparison, true)).toBe(false);
    });
  });

  describe('aggregateSamplesByTool', () => {
    it('should group samples by tool name', () => {
      const samples: LatencySample[] = [
        { toolName: 'tool1', durationMs: 100, success: true, timestamp: new Date() },
        { toolName: 'tool1', durationMs: 200, success: true, timestamp: new Date() },
        { toolName: 'tool2', durationMs: 150, success: true, timestamp: new Date() },
      ];

      const metrics = aggregateSamplesByTool(samples);

      expect(metrics.size).toBe(2);
      expect(metrics.has('tool1')).toBe(true);
      expect(metrics.has('tool2')).toBe(true);
      expect(metrics.get('tool1')!.sampleCount).toBe(2);
      expect(metrics.get('tool2')!.sampleCount).toBe(1);
    });
  });

  describe('PERFORMANCE_TRACKING constants', () => {
    it('should have valid threshold values', () => {
      expect(PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD).toBeGreaterThan(0);
      expect(PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD).toBeLessThan(1);
      expect(PERFORMANCE_TRACKING.WARNING_THRESHOLD).toBeLessThan(PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD);
    });

    it('should have trend thresholds', () => {
      expect(PERFORMANCE_TRACKING.TREND_THRESHOLDS.improving).toBeLessThan(0);
      expect(PERFORMANCE_TRACKING.TREND_THRESHOLDS.degrading).toBeGreaterThan(0);
    });
  });
});
