/**
 * Tests for performance confidence scoring.
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePerformanceConfidence,
  calculateConfidenceFromMetrics,
  formatConfidenceLevel,
  hasReliableConfidence,
  type ToolPerformanceMetrics,
  type LatencySample,
  type PerformanceBaseline,
} from '../../src/baseline/performance-tracker.js';
import { PERFORMANCE_CONFIDENCE } from '../../src/constants.js';

describe('calculatePerformanceConfidence', () => {
  describe('with no samples', () => {
    it('should return low confidence with recommendation', () => {
      const result = calculatePerformanceConfidence([]);

      expect(result.sampleCount).toBe(0);
      expect(result.standardDeviation).toBe(0);
      expect(result.coefficientOfVariation).toBe(0);
      expect(result.confidenceLevel).toBe('low');
      expect(result.recommendation).toBe(PERFORMANCE_CONFIDENCE.RECOMMENDATIONS.NO_SAMPLES);
    });
  });

  describe('with all failed samples', () => {
    it('should return low confidence', () => {
      const samples: LatencySample[] = [
        { toolName: 'test', durationMs: 100, success: false, timestamp: new Date() },
        { toolName: 'test', durationMs: 200, success: false, timestamp: new Date() },
      ];

      const result = calculatePerformanceConfidence(samples);

      // sampleCount is 0 because no samples succeeded (for performance confidence)
      expect(result.sampleCount).toBe(0);
      expect(result.totalTests).toBe(2);
      expect(result.confidenceLevel).toBe('low');
      expect(result.recommendation).toContain('successful');
    });
  });

  describe('with few samples', () => {
    it('should return low confidence with recommendation for more samples', () => {
      const samples: LatencySample[] = [
        { toolName: 'test', durationMs: 100, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 110, success: true, timestamp: new Date() },
      ];

      const result = calculatePerformanceConfidence(samples);

      expect(result.sampleCount).toBe(2);
      expect(result.confidenceLevel).toBe('low');
      expect(result.recommendation).toContain('samples');
    });

    it('should meet medium confidence with 5+ samples and low variability', () => {
      const samples: LatencySample[] = Array.from({ length: 5 }, (_, i) => ({
        toolName: 'test',
        durationMs: 100 + i * 2, // Very consistent: 100, 102, 104, 106, 108
        success: true,
        timestamp: new Date(),
      }));

      const result = calculatePerformanceConfidence(samples);

      expect(result.sampleCount).toBe(5);
      expect(result.confidenceLevel).toBe('medium');
      expect(result.recommendation).toBeUndefined();
    });
  });

  describe('with sufficient samples', () => {
    it('should return high confidence with 10+ samples and low variability', () => {
      const samples: LatencySample[] = Array.from({ length: 12 }, (_, i) => ({
        toolName: 'test',
        durationMs: 100 + i * 2, // Very consistent
        success: true,
        timestamp: new Date(),
      }));

      const result = calculatePerformanceConfidence(samples);

      expect(result.sampleCount).toBe(12);
      expect(result.confidenceLevel).toBe('high');
      expect(result.recommendation).toBeUndefined();
    });

    it('should downgrade to low confidence with high variability', () => {
      // Create samples with very high variability (CV > 0.5)
      const samples: LatencySample[] = [
        { toolName: 'test', durationMs: 50, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 500, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 100, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 800, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 200, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 1000, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 50, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 600, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 150, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 900, success: true, timestamp: new Date() },
      ];

      const result = calculatePerformanceConfidence(samples);

      expect(result.sampleCount).toBe(10);
      expect(result.coefficientOfVariation).toBeGreaterThan(PERFORMANCE_CONFIDENCE.HIGH.MAX_CV);
      expect(result.confidenceLevel).toBe('low');
      expect(result.recommendation).toBe(PERFORMANCE_CONFIDENCE.RECOMMENDATIONS.HIGH_VARIABILITY);
    });
  });

  describe('coefficient of variation calculation', () => {
    it('should calculate CV correctly', () => {
      // Mean = 100, all same values -> stdDev = 0, CV = 0
      const consistentSamples: LatencySample[] = Array.from({ length: 10 }, () => ({
        toolName: 'test',
        durationMs: 100,
        success: true,
        timestamp: new Date(),
      }));

      const result = calculatePerformanceConfidence(consistentSamples);

      expect(result.standardDeviation).toBe(0);
      expect(result.coefficientOfVariation).toBe(0);
      expect(result.confidenceLevel).toBe('high');
    });

    it('should handle zero mean edge case', () => {
      // All 0ms durations (edge case)
      const zeroSamples: LatencySample[] = Array.from({ length: 10 }, () => ({
        toolName: 'test',
        durationMs: 0,
        success: true,
        timestamp: new Date(),
      }));

      const result = calculatePerformanceConfidence(zeroSamples);

      // When mean is 0, CV should be treated as 0
      expect(result.coefficientOfVariation).toBe(0);
    });
  });

  describe('filters out failed samples', () => {
    it('should only calculate from successful samples', () => {
      const samples: LatencySample[] = [
        { toolName: 'test', durationMs: 100, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 100, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 100, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 100, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 100, success: true, timestamp: new Date() },
        { toolName: 'test', durationMs: 9999, success: false, timestamp: new Date() }, // Should be ignored
        { toolName: 'test', durationMs: 9999, success: false, timestamp: new Date() }, // Should be ignored
      ];

      const result = calculatePerformanceConfidence(samples);

      expect(result.sampleCount).toBe(5); // Only successful samples counted
      expect(result.standardDeviation).toBe(0); // All successful samples have same duration
    });
  });
});

describe('calculateConfidenceFromMetrics', () => {
  it('should calculate confidence from pre-computed metrics', () => {
    const metrics: ToolPerformanceMetrics = {
      toolName: 'test',
      p50Ms: 100,
      p95Ms: 150,
      p99Ms: 200,
      successRate: 0.95,
      sampleCount: 15,
      avgMs: 100,
      minMs: 80,
      maxMs: 200,
      stdDevMs: 20,
      collectedAt: new Date(),
    };

    const result = calculateConfidenceFromMetrics(metrics);

    expect(result.sampleCount).toBe(15);
    expect(result.standardDeviation).toBe(20);
    expect(result.coefficientOfVariation).toBe(0.2); // 20/100
    expect(result.confidenceLevel).toBe('high');
  });

  it('should return low confidence for insufficient samples', () => {
    const metrics: ToolPerformanceMetrics = {
      toolName: 'test',
      p50Ms: 100,
      p95Ms: 150,
      p99Ms: 200,
      successRate: 1.0,
      sampleCount: 2,
      avgMs: 100,
      minMs: 90,
      maxMs: 110,
      stdDevMs: 10,
      collectedAt: new Date(),
    };

    const result = calculateConfidenceFromMetrics(metrics);

    expect(result.confidenceLevel).toBe('low');
    expect(result.recommendation).toContain('samples');
  });

  it('should handle zero sample count', () => {
    const metrics: ToolPerformanceMetrics = {
      toolName: 'test',
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      successRate: 0,
      sampleCount: 0,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      stdDevMs: 0,
      collectedAt: new Date(),
    };

    const result = calculateConfidenceFromMetrics(metrics);

    expect(result.confidenceLevel).toBe('low');
    expect(result.recommendation).toBe(PERFORMANCE_CONFIDENCE.RECOMMENDATIONS.NO_SAMPLES);
  });
});

describe('formatConfidenceLevel', () => {
  it('should format high confidence', () => {
    const confidence = {
      sampleCount: 15,
      successfulSamples: 15,
      validationSamples: 0,
      totalTests: 15,
      standardDeviation: 10,
      coefficientOfVariation: 0.1,
      confidenceLevel: 'high' as const,
    };

    const result = formatConfidenceLevel(confidence);

    expect(result).toContain('HIGH');
    expect(result).toContain('n=15');
    expect(result).toContain(PERFORMANCE_CONFIDENCE.INDICATORS.high);
  });

  it('should format medium confidence', () => {
    const confidence = {
      sampleCount: 7,
      successfulSamples: 7,
      validationSamples: 0,
      totalTests: 7,
      standardDeviation: 30,
      coefficientOfVariation: 0.3,
      confidenceLevel: 'medium' as const,
    };

    const result = formatConfidenceLevel(confidence);

    expect(result).toContain('MEDIUM');
    expect(result).toContain('n=7');
    expect(result).toContain(PERFORMANCE_CONFIDENCE.INDICATORS.medium);
  });

  it('should format low confidence with recommendation', () => {
    const confidence = {
      sampleCount: 3,
      successfulSamples: 3,
      validationSamples: 0,
      totalTests: 3,
      standardDeviation: 50,
      coefficientOfVariation: 0.5,
      confidenceLevel: 'low' as const,
      recommendation: 'Run with more samples',
    };

    const result = formatConfidenceLevel(confidence);

    expect(result).toContain('LOW');
    expect(result).toContain('n=3');
    expect(result).toContain('Run with more samples');
    expect(result).toContain(PERFORMANCE_CONFIDENCE.INDICATORS.low);
  });

  it('should optionally exclude indicator', () => {
    const confidence = {
      sampleCount: 15,
      successfulSamples: 15,
      validationSamples: 0,
      totalTests: 15,
      standardDeviation: 10,
      coefficientOfVariation: 0.1,
      confidenceLevel: 'high' as const,
    };

    const result = formatConfidenceLevel(confidence, false);

    expect(result).toContain('HIGH');
    expect(result).not.toContain(PERFORMANCE_CONFIDENCE.INDICATORS.high);
  });
});

describe('hasReliableConfidence', () => {
  it('should return true for high confidence', () => {
    const confidence = {
      sampleCount: 15,
      successfulSamples: 15,
      validationSamples: 0,
      totalTests: 15,
      standardDeviation: 10,
      coefficientOfVariation: 0.1,
      confidenceLevel: 'high' as const,
    };

    expect(hasReliableConfidence(confidence)).toBe(true);
  });

  it('should return true for medium confidence', () => {
    const confidence = {
      sampleCount: 7,
      successfulSamples: 7,
      validationSamples: 0,
      totalTests: 7,
      standardDeviation: 30,
      coefficientOfVariation: 0.3,
      confidenceLevel: 'medium' as const,
    };

    expect(hasReliableConfidence(confidence)).toBe(true);
  });

  it('should return false for low confidence', () => {
    const confidence = {
      sampleCount: 3,
      successfulSamples: 3,
      validationSamples: 0,
      totalTests: 3,
      standardDeviation: 50,
      coefficientOfVariation: 0.5,
      confidenceLevel: 'low' as const,
      recommendation: 'Need more samples',
    };

    expect(hasReliableConfidence(confidence)).toBe(false);
  });
});

describe('confidence thresholds', () => {
  it('should have correct HIGH threshold values', () => {
    expect(PERFORMANCE_CONFIDENCE.HIGH.MIN_SAMPLES).toBe(10);
    expect(PERFORMANCE_CONFIDENCE.HIGH.MAX_CV).toBe(0.3);
  });

  it('should have correct MEDIUM threshold values', () => {
    expect(PERFORMANCE_CONFIDENCE.MEDIUM.MIN_SAMPLES).toBe(5);
    expect(PERFORMANCE_CONFIDENCE.MEDIUM.MAX_CV).toBe(0.5);
  });

  it('should have correct labels', () => {
    expect(PERFORMANCE_CONFIDENCE.LABELS.high).toBe('HIGH');
    expect(PERFORMANCE_CONFIDENCE.LABELS.medium).toBe('MEDIUM');
    expect(PERFORMANCE_CONFIDENCE.LABELS.low).toBe('LOW');
  });

  it('should have correct indicators', () => {
    expect(PERFORMANCE_CONFIDENCE.INDICATORS.high).toBe('✓');
    expect(PERFORMANCE_CONFIDENCE.INDICATORS.medium).toBe('~');
    expect(PERFORMANCE_CONFIDENCE.INDICATORS.low).toBe('!');
  });
});

describe('confidence in metrics calculation', () => {
  it('should include confidence in calculateMetrics result', async () => {
    // Import calculateMetrics to test integration
    const { calculateMetrics } = await import('../../src/baseline/performance-tracker.js');

    const samples: LatencySample[] = Array.from({ length: 12 }, (_, i) => ({
      toolName: 'test',
      durationMs: 100 + i * 2,
      success: true,
      timestamp: new Date(),
    }));

    const metrics = calculateMetrics(samples);

    expect(metrics).not.toBeNull();
    expect(metrics!.confidence).toBeDefined();
    expect(metrics!.confidence!.confidenceLevel).toBe('high');
  });
});

describe('confidence in performance comparison', () => {
  it('should include confidence and isReliable in comparison result', async () => {
    const { comparePerformance } = await import('../../src/baseline/performance-tracker.js');

    const current: ToolPerformanceMetrics = {
      toolName: 'test',
      p50Ms: 100,
      p95Ms: 150,
      p99Ms: 200,
      successRate: 1.0,
      sampleCount: 15,
      avgMs: 100,
      minMs: 80,
      maxMs: 200,
      stdDevMs: 10,
      collectedAt: new Date(),
      confidence: {
        sampleCount: 15,
        successfulSamples: 15,
        validationSamples: 0,
        totalTests: 15,
        standardDeviation: 10,
        coefficientOfVariation: 0.1,
        confidenceLevel: 'high' as const,
      },
    };

    const baseline: PerformanceBaseline = {
      toolName: 'test',
      baselineP50: 90,
      baselineP95: 140,
      baselineP99: 180,
      baselineSuccessRate: 1.0,
      maxAllowedRegression: 0.1,
      establishedAt: new Date(),
    };

    const comparison = comparePerformance(current, baseline);

    expect(comparison.confidence).toBeDefined();
    expect(comparison.confidence!.confidenceLevel).toBe('high');
    expect(comparison.isReliable).toBe(true);
  });

  it('should mark comparison as unreliable with low confidence', async () => {
    const { comparePerformance } = await import('../../src/baseline/performance-tracker.js');

    const current: ToolPerformanceMetrics = {
      toolName: 'test',
      p50Ms: 100,
      p95Ms: 150,
      p99Ms: 200,
      successRate: 1.0,
      sampleCount: 2,
      avgMs: 100,
      minMs: 80,
      maxMs: 200,
      stdDevMs: 50,
      collectedAt: new Date(),
      confidence: {
        sampleCount: 2,
        successfulSamples: 2,
        validationSamples: 0,
        totalTests: 2,
        standardDeviation: 50,
        coefficientOfVariation: 0.5,
        confidenceLevel: 'low' as const,
        recommendation: 'Need more samples',
      },
    };

    const baseline: PerformanceBaseline = {
      toolName: 'test',
      baselineP50: 90,
      baselineP95: 140,
      baselineP99: 180,
      baselineSuccessRate: 1.0,
      maxAllowedRegression: 0.1,
      establishedAt: new Date(),
    };

    const comparison = comparePerformance(current, baseline);

    expect(comparison.confidence).toBeDefined();
    expect(comparison.confidence!.confidenceLevel).toBe('low');
    expect(comparison.isReliable).toBe(false);
  });
});

describe('confidence in performance report', () => {
  it('should track low confidence tools in report', async () => {
    const { generatePerformanceReport } = await import('../../src/baseline/performance-tracker.js');

    const currentMetrics = new Map<string, ToolPerformanceMetrics>([
      ['reliable-tool', {
        toolName: 'reliable-tool',
        p50Ms: 100,
        p95Ms: 150,
        p99Ms: 200,
        successRate: 1.0,
        sampleCount: 15,
        avgMs: 100,
        minMs: 80,
        maxMs: 200,
        stdDevMs: 10,
        collectedAt: new Date(),
        confidence: {
          sampleCount: 15,
          successfulSamples: 15,
          validationSamples: 0,
          totalTests: 15,
          standardDeviation: 10,
          coefficientOfVariation: 0.1,
          confidenceLevel: 'high' as const,
        },
      }],
      ['unreliable-tool', {
        toolName: 'unreliable-tool',
        p50Ms: 100,
        p95Ms: 150,
        p99Ms: 200,
        successRate: 1.0,
        sampleCount: 2,
        avgMs: 100,
        minMs: 80,
        maxMs: 200,
        stdDevMs: 50,
        collectedAt: new Date(),
        confidence: {
          sampleCount: 2,
          successfulSamples: 2,
          validationSamples: 0,
          totalTests: 2,
          standardDeviation: 50,
          coefficientOfVariation: 0.5,
          confidenceLevel: 'low' as const,
          recommendation: 'Need more samples',
        },
      }],
    ]);

    const report = generatePerformanceReport(currentMetrics, new Map());

    expect(report.lowConfidenceCount).toBe(1);
    expect(report.lowConfidenceTools).toContain('unreliable-tool');
    expect(report.lowConfidenceTools).not.toContain('reliable-tool');
  });
});

// ==================== expectedOutcome-based Confidence ====================
describe('calculatePerformanceConfidence with expectedOutcome', () => {
  describe('separates happy_path from validation tests', () => {
    it('should only count happy_path tests for confidence when expectedOutcome is provided', () => {
      // Mix of happy_path (success expected) and validation (error expected) tests
      const samples: LatencySample[] = [
        // 5 happy_path tests (success expected) - these should count for confidence
        { toolName: 'test', durationMs: 100, success: true, timestamp: new Date(), expectedOutcome: 'success' },
        { toolName: 'test', durationMs: 102, success: true, timestamp: new Date(), expectedOutcome: 'success' },
        { toolName: 'test', durationMs: 98, success: true, timestamp: new Date(), expectedOutcome: 'success' },
        { toolName: 'test', durationMs: 101, success: true, timestamp: new Date(), expectedOutcome: 'success' },
        { toolName: 'test', durationMs: 99, success: true, timestamp: new Date(), expectedOutcome: 'success' },
        // 10 validation tests (error expected) - these should NOT count for performance confidence
        { toolName: 'test', durationMs: 50, success: false, timestamp: new Date(), expectedOutcome: 'error' },
        { toolName: 'test', durationMs: 51, success: false, timestamp: new Date(), expectedOutcome: 'error' },
        { toolName: 'test', durationMs: 52, success: false, timestamp: new Date(), expectedOutcome: 'error' },
        { toolName: 'test', durationMs: 53, success: false, timestamp: new Date(), expectedOutcome: 'error' },
        { toolName: 'test', durationMs: 54, success: false, timestamp: new Date(), expectedOutcome: 'error' },
        { toolName: 'test', durationMs: 55, success: false, timestamp: new Date(), expectedOutcome: 'error' },
        { toolName: 'test', durationMs: 56, success: false, timestamp: new Date(), expectedOutcome: 'error' },
        { toolName: 'test', durationMs: 57, success: false, timestamp: new Date(), expectedOutcome: 'error' },
        { toolName: 'test', durationMs: 58, success: false, timestamp: new Date(), expectedOutcome: 'error' },
        { toolName: 'test', durationMs: 59, success: false, timestamp: new Date(), expectedOutcome: 'error' },
      ];

      const result = calculatePerformanceConfidence(samples);

      // Should have 15 total samples
      expect(result.totalTests).toBe(15);
      // Should only have 5 successful happy_path samples counted for confidence
      expect(result.successfulSamples).toBe(5);
      // Validation samples tracked separately
      expect(result.validationSamples).toBe(10);
      // With only 5 happy_path samples, confidence should be medium (not high)
      expect(result.confidenceLevel).toBe('medium');
    });

    it('should only count success-expected samples for confidence', () => {
      // Currently, 'either' outcome samples are not counted for confidence calculation
      // because confidence metrics should be based on deterministic happy_path tests
      const samples: LatencySample[] = [
        // 3 happy_path tests (expectedOutcome: 'success')
        { toolName: 'test', durationMs: 100, success: true, timestamp: new Date(), expectedOutcome: 'success' },
        { toolName: 'test', durationMs: 102, success: true, timestamp: new Date(), expectedOutcome: 'success' },
        { toolName: 'test', durationMs: 98, success: true, timestamp: new Date(), expectedOutcome: 'success' },
        // 7 "either" outcome tests - these are ambiguous and don't count for confidence
        { toolName: 'test', durationMs: 105, success: true, timestamp: new Date(), expectedOutcome: 'either' },
        { toolName: 'test', durationMs: 106, success: true, timestamp: new Date(), expectedOutcome: 'either' },
        { toolName: 'test', durationMs: 107, success: true, timestamp: new Date(), expectedOutcome: 'either' },
        { toolName: 'test', durationMs: 108, success: true, timestamp: new Date(), expectedOutcome: 'either' },
        { toolName: 'test', durationMs: 109, success: true, timestamp: new Date(), expectedOutcome: 'either' },
        { toolName: 'test', durationMs: 110, success: true, timestamp: new Date(), expectedOutcome: 'either' },
        { toolName: 'test', durationMs: 111, success: true, timestamp: new Date(), expectedOutcome: 'either' },
      ];

      const result = calculatePerformanceConfidence(samples);

      // Only 3 success-expected samples count for confidence
      expect(result.successfulSamples).toBe(3);
      expect(result.totalTests).toBe(10);
      // With only 3 samples, confidence is low
      expect(result.confidenceLevel).toBe('low');
    });

    it('should treat samples without expectedOutcome as happy_path (legacy behavior)', () => {
      // Legacy samples without expectedOutcome
      const samples: LatencySample[] = Array.from({ length: 12 }, (_, i) => ({
        toolName: 'test',
        durationMs: 100 + i * 2,
        success: true,
        timestamp: new Date(),
        // No expectedOutcome - should be treated as happy_path
      }));

      const result = calculatePerformanceConfidence(samples);

      expect(result.sampleCount).toBe(12);
      expect(result.successfulSamples).toBe(12);
      expect(result.validationSamples).toBe(0);
      expect(result.confidenceLevel).toBe('high');
    });
  });

  describe('outcomeCorrect tracking', () => {
    it('should track correct outcomes in latency samples', () => {
      const samples: LatencySample[] = [
        // Correct happy_path outcome (expected success, got success)
        { toolName: 'test', durationMs: 100, success: true, timestamp: new Date(), expectedOutcome: 'success', outcomeCorrect: true },
        // Correct validation outcome (expected error, got error)
        { toolName: 'test', durationMs: 50, success: false, timestamp: new Date(), expectedOutcome: 'error', outcomeCorrect: true },
        // Incorrect outcome (expected success, got error)
        { toolName: 'test', durationMs: 60, success: false, timestamp: new Date(), expectedOutcome: 'success', outcomeCorrect: false },
      ];

      const result = calculatePerformanceConfidence(samples);

      // Total tests
      expect(result.totalTests).toBe(3);
      // Only 1 successful happy_path sample
      expect(result.successfulSamples).toBe(1);
    });
  });
});
