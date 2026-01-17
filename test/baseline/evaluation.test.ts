/**
 * Tests for the drift detection evaluation framework.
 *
 * These tests verify that:
 * 1. The evaluation framework correctly calculates metrics
 * 2. The golden dataset produces expected results
 * 3. The current algorithm meets minimum accuracy thresholds
 */

import { describe, it, expect } from 'vitest';
import {
  evaluate,
  createSummary,
  formatEvaluationReport,
  GOLDEN_DATASET,
  getDatasetStatistics,
  DefaultSemanticComparator,
} from '../../src/baseline/evaluation/index.js';

describe('Evaluation Framework', () => {
  describe('Golden Dataset', () => {
    it('should have minimum required test cases', () => {
      const stats = getDatasetStatistics();

      expect(stats.totalCases).toBeGreaterThanOrEqual(40);
      expect(stats.byCategory.security).toBeGreaterThanOrEqual(15);
      expect(stats.byCategory.limitation).toBeGreaterThanOrEqual(10);
    });

    it('should have balanced true positives and true negatives', () => {
      const stats = getDatasetStatistics();

      // Should have both matching and non-matching cases
      expect(stats.truePositives).toBeGreaterThan(0);
      expect(stats.trueNegatives).toBeGreaterThan(0);

      // Ratio should be reasonably balanced (not more than 3:1)
      const ratio = Math.max(stats.truePositives, stats.trueNegatives) /
                    Math.min(stats.truePositives, stats.trueNegatives);
      expect(ratio).toBeLessThan(3);
    });

    it('should have valid test case structure', () => {
      for (const testCase of GOLDEN_DATASET) {
        expect(testCase.id).toBeDefined();
        expect(testCase.id).not.toBe('');
        expect(testCase.category).toMatch(/^(security|limitation|assertion)$/);
        expect(typeof testCase.text1).toBe('string');
        expect(typeof testCase.text2).toBe('string');
        expect(typeof testCase.expectedMatch).toBe('boolean');
        expect(testCase.reasoning).toBeDefined();
      }
    });

    it('should have unique test case IDs', () => {
      const ids = GOLDEN_DATASET.map((tc) => tc.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Evaluation Metrics', () => {
    it('should calculate accuracy correctly', () => {
      const result = evaluate();

      // Verify accuracy calculation
      const manualAccuracy =
        ((result.truePositives + result.trueNegatives) / result.totalCases) * 100;
      expect(result.accuracy).toBeCloseTo(manualAccuracy, 0);
    });

    it('should calculate precision correctly', () => {
      const result = evaluate();

      // Precision = TP / (TP + FP)
      const manualPrecision =
        result.truePositives + result.falsePositives > 0
          ? (result.truePositives / (result.truePositives + result.falsePositives)) * 100
          : 0;
      expect(result.precision).toBeCloseTo(manualPrecision, 0);
    });

    it('should calculate recall correctly', () => {
      const result = evaluate();

      // Recall = TP / (TP + FN)
      const manualRecall =
        result.truePositives + result.falseNegatives > 0
          ? (result.truePositives / (result.truePositives + result.falseNegatives)) * 100
          : 0;
      expect(result.recall).toBeCloseTo(manualRecall, 0);
    });

    it('should calculate F1 score correctly', () => {
      const result = evaluate();

      // F1 = 2 * (precision * recall) / (precision + recall)
      const p = result.precision / 100;
      const r = result.recall / 100;
      const manualF1 = p + r > 0 ? ((2 * p * r) / (p + r)) * 100 : 0;
      expect(result.f1Score).toBeCloseTo(manualF1, 0);
    });

    it('should have confusion matrix that sums to total', () => {
      const result = evaluate();

      const confusionSum =
        result.truePositives +
        result.trueNegatives +
        result.falsePositives +
        result.falseNegatives;

      expect(confusionSum).toBe(result.totalCases);
    });
  });

  describe('Algorithm Accuracy Requirements', () => {
    // These tests define the minimum acceptable accuracy for the algorithm
    // They serve as regression tests to catch any algorithm degradation
    //
    // CURRENT BASELINE (v1.2.0 - Phase 3 improvements):
    // - Overall Accuracy: 63.8%
    // - Precision: 97.4% (Excellent - almost no false positives!)
    // - Recall: 43% (Lower due to stricter edge case handling)
    // - False Positive Rate: 0.7%
    // - False Negative Rate: 35.5%
    //
    // Phase 3 improvements:
    // - Expanded dataset to 138 test cases (was 50)
    // - Added negation detection for security findings
    // - Added qualifier extraction (SQL vs NoSQL, upload vs download)
    // - Added opposite term detection (sync vs async, enabled vs disabled)
    // - Stricter edge case handling (severity, rate time units, timeout types)
    //
    // TRADE-OFF: Phase 3 prioritized precision over recall to eliminate
    // false positives. The expanded dataset with challenging paraphrases
    // reduced recall but dramatically improved precision.
    //
    // TARGET METRICS (for future improvement):
    // - Overall Accuracy: 80%+
    // - Precision: 95%+ (maintain high precision)
    // - Recall: 70%+
    // - False Positive Rate: <2%
    // - False Negative Rate: <25%

    it('should achieve minimum 60% overall accuracy (current baseline)', () => {
      const result = evaluate();
      // Current: 63.8%, Target: 80%
      expect(result.accuracy).toBeGreaterThanOrEqual(60);
    });

    it('should achieve minimum 85% precision', () => {
      const result = evaluate();
      // Current: 89.2% - balanced precision after recall improvements
      expect(result.precision).toBeGreaterThanOrEqual(85);
    });

    it('should achieve minimum 75% recall', () => {
      const result = evaluate();
      // Current: 76.7% - improved from 43% via synonym expansion
      expect(result.recall).toBeGreaterThanOrEqual(75);
    });

    it('should have false positive rate under 10%', () => {
      const result = evaluate();
      const fpRate = (result.falsePositives / result.totalCases) * 100;
      // Current: 5.8% - balanced after recall improvements
      expect(fpRate).toBeLessThan(10);
    });

    it('should have false negative rate under 20%', () => {
      const result = evaluate();
      const fnRate = (result.falseNegatives / result.totalCases) * 100;
      // Current: 14.5% - improved from 35.5%
      expect(fnRate).toBeLessThan(20);
    });

    it('should log current metrics for tracking', () => {
      const result = evaluate();
      // Log metrics for visibility - useful for tracking improvements
      console.log(`
        ═══════════════════════════════════════════
        CURRENT ALGORITHM METRICS
        ═══════════════════════════════════════════
        Accuracy:  ${result.accuracy}% (target: 90%)
        Precision: ${result.precision}% (target: 90%)
        Recall:    ${result.recall}% (target: 85%)
        F1 Score:  ${result.f1Score}%
        ───────────────────────────────────────────
        True Positives:  ${result.truePositives}
        True Negatives:  ${result.trueNegatives}
        False Positives: ${result.falsePositives} (${((result.falsePositives / result.totalCases) * 100).toFixed(1)}%)
        False Negatives: ${result.falseNegatives} (${((result.falseNegatives / result.totalCases) * 100).toFixed(1)}%)
        ═══════════════════════════════════════════
      `);
      expect(result).toBeDefined();
    });
  });

  describe('Category-Specific Accuracy', () => {
    it('should achieve minimum 55% accuracy on security findings (current baseline)', () => {
      const result = evaluate({ categories: ['security'] });
      // Current: ~60%, Target: 80%
      // Lower due to expanded dataset with challenging security paraphrases
      expect(result.accuracy).toBeGreaterThanOrEqual(55);
    });

    it('should achieve minimum 60% accuracy on limitations (current baseline)', () => {
      const result = evaluate({ categories: ['limitation'] });
      // Current: ~70%, Target: 85%
      expect(result.accuracy).toBeGreaterThanOrEqual(60);
    });
  });

  describe('Evaluation Output', () => {
    it('should create valid summary', () => {
      const result = evaluate();
      const summary = createSummary(result);

      expect(summary.totalCases).toBe(result.totalCases);
      expect(summary.passedCases + summary.failedCases).toBe(result.totalCases);
      expect(summary.accuracy).toMatch(/^\d+(\.\d+)?%$/);
    });

    it('should format report without errors', () => {
      const result = evaluate();
      const report = formatEvaluationReport(result);

      expect(report).toContain('DRIFT DETECTION EVALUATION REPORT');
      expect(report).toContain('ACCURACY METRICS');
      expect(report).toContain('CONFUSION MATRIX');
    });

    it('should include category breakdown in report', () => {
      const result = evaluate();
      const report = formatEvaluationReport(result);

      expect(report).toContain('CATEGORY BREAKDOWN');
    });

    it('should track evaluation duration', () => {
      const result = evaluate();

      // Duration might be 0 if tests are very fast
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.averageComparisonMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Filtering', () => {
    it('should filter by category', () => {
      const securityOnly = evaluate({ categories: ['security'] });
      const limitationOnly = evaluate({ categories: ['limitation'] });

      expect(securityOnly.totalCases).toBeLessThan(GOLDEN_DATASET.length);
      expect(limitationOnly.totalCases).toBeLessThan(GOLDEN_DATASET.length);
      expect(securityOnly.totalCases + limitationOnly.totalCases).toBeLessThanOrEqual(
        GOLDEN_DATASET.length
      );
    });

    it('should filter by tags', () => {
      const paraphraseOnly = evaluate({ tags: ['paraphrase'] });

      expect(paraphraseOnly.totalCases).toBeGreaterThan(0);
      expect(paraphraseOnly.totalCases).toBeLessThan(GOLDEN_DATASET.length);
    });
  });

  describe('Calibration', () => {
    it('should calculate calibration buckets', () => {
      const result = evaluate();

      expect(result.calibrationBuckets).toBeDefined();
      expect(result.calibrationBuckets.length).toBeGreaterThan(0);

      for (const bucket of result.calibrationBuckets) {
        expect(bucket.predictedRange.min).toBeLessThan(bucket.predictedRange.max);
        expect(bucket.actualAccuracy).toBeGreaterThanOrEqual(0);
        expect(bucket.actualAccuracy).toBeLessThanOrEqual(100);
      }
    });

    it('should calculate Brier score', () => {
      const result = evaluate();

      expect(result.brierScore).toBeGreaterThanOrEqual(0);
      expect(result.brierScore).toBeLessThanOrEqual(1);
    });
  });
});

describe('Specific Semantic Matching Cases', () => {
  const comparator = new DefaultSemanticComparator();

  describe('Security Finding Paraphrases', () => {
    it('should match path traversal paraphrases', () => {
      const result = comparator.compare(
        'Path traversal vulnerability allows reading files outside base directory',
        'The tool is vulnerable to directory traversal attacks via ../ sequences',
        'read_file',
        'security'
      );

      expect(result.matches).toBe(true);
      // Confidence may vary due to different paraphrase structures
      expect(result.confidence).toBeGreaterThan(50);
    });

    it('should not match different vulnerability types', () => {
      const result = comparator.compare(
        'Path traversal vulnerability',
        'SQL injection vulnerability',
        'test_tool',
        'security'
      );

      expect(result.matches).toBe(false);
    });
  });

  describe('Limitation Paraphrases', () => {
    it('should match same size limit with different wording', () => {
      const result = comparator.compare(
        'Maximum file size is 10MB',
        'Files larger than 10 megabytes will be rejected',
        'upload_file',
        'limitation'
      );

      expect(result.matches).toBe(true);
    });

    it('should not match different size limits', () => {
      // Fixed: Algorithm now compares constraint values, not just categories
      // 10MB vs 100MB differ significantly (ratio 0.1) so they don't match
      const result = comparator.compare(
        'Maximum file size is 10MB',
        'Maximum file size is 100MB',
        'upload_file',
        'limitation'
      );

      expect(result.matches).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const result = comparator.compare('', '', 'test_tool', 'security');
      expect(result.matches).toBe(true);
    });

    it('should be case insensitive', () => {
      const result = comparator.compare(
        'PATH TRAVERSAL VULNERABILITY',
        'path traversal vulnerability',
        'test_tool',
        'security'
      );

      expect(result.matches).toBe(true);
    });
  });
});
