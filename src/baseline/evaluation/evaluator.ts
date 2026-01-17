/**
 * Evaluation Framework for Drift Detection
 *
 * Runs semantic comparison algorithms against the golden dataset
 * and produces accuracy metrics including precision, recall, F1,
 * and confidence calibration analysis.
 */

import type {
  GoldenTestCase,
  TestCaseResult,
  EvaluationResult,
  EvaluationSummary,
  EvaluationOptions,
  CategoryMetrics,
  CalibrationBucket,
  SemanticComparator,
} from './types.js';
import { GOLDEN_DATASET, DATASET_VERSION, getDatasetStatistics } from './golden-dataset.js';
import {
  structureSecurityNotes,
  structureLimitations,
  securityFindingsMatchWithConfidence,
  limitationsMatchWithConfidence,
  assertionsMatchWithConfidence,
  createFingerprint,
  type NormalizedAssertion,
} from '../semantic.js';

/**
 * Default semantic comparator using existing implementation.
 */
export class DefaultSemanticComparator implements SemanticComparator {
  compare(
    text1: string,
    text2: string,
    toolName: string,
    category: 'security' | 'limitation' | 'assertion'
  ): {
    matches: boolean;
    confidence: number;
    factors?: Array<{ name: string; weight: number; value: number; description: string }>;
  } {
    if (category === 'security') {
      const findings1 = structureSecurityNotes(toolName, [text1]);
      const findings2 = structureSecurityNotes(toolName, [text2]);

      if (findings1.length === 0 || findings2.length === 0) {
        return { matches: text1 === text2, confidence: text1 === text2 ? 100 : 0 };
      }

      const result = securityFindingsMatchWithConfidence(findings1[0], findings2[0]);
      return {
        matches: result.matches,
        confidence: result.confidence.score,
        factors: result.confidence.factors,
      };
    }

    if (category === 'limitation') {
      const lim1 = structureLimitations(toolName, [text1]);
      const lim2 = structureLimitations(toolName, [text2]);

      if (lim1.length === 0 || lim2.length === 0) {
        return { matches: text1 === text2, confidence: text1 === text2 ? 100 : 0 };
      }

      const result = limitationsMatchWithConfidence(lim1[0], lim2[0]);
      return {
        matches: result.matches,
        confidence: result.confidence.score,
        factors: result.confidence.factors,
      };
    }

    // Assertion comparison using normalized assertions with qualifier checking
    const assertion1: NormalizedAssertion = {
      tool: toolName,
      aspect: 'behavior',
      fingerprint: createFingerprint(toolName, 'behavior', text1),
      description: text1,
      isPositive: !text1.toLowerCase().includes('not ') && !text1.toLowerCase().includes('no '),
    };
    const assertion2: NormalizedAssertion = {
      tool: toolName,
      aspect: 'behavior',
      fingerprint: createFingerprint(toolName, 'behavior', text2),
      description: text2,
      isPositive: !text2.toLowerCase().includes('not ') && !text2.toLowerCase().includes('no '),
    };

    const result = assertionsMatchWithConfidence(assertion1, assertion2);
    return {
      matches: result.matches,
      confidence: result.confidence.score,
      factors: result.confidence.factors,
    };
  }
}

/**
 * Run a single test case.
 */
function runTestCase(
  testCase: GoldenTestCase,
  comparator: SemanticComparator,
  options: EvaluationOptions
): TestCaseResult {
  const startTime = performance.now();

  const result = comparator.compare(
    testCase.text1,
    testCase.text2,
    testCase.toolName,
    testCase.category
  );

  const durationMs = performance.now() - startTime;

  // Determine if test passed
  const matchCorrect = result.matches === testCase.expectedMatch;
  let confidenceCorrect = true;

  if (testCase.expectedConfidence && matchCorrect) {
    confidenceCorrect =
      result.confidence >= testCase.expectedConfidence.min &&
      result.confidence <= testCase.expectedConfidence.max;
  }

  const passed = matchCorrect && confidenceCorrect;

  // Determine failure type
  let failureType: TestCaseResult['failureType'];
  if (!passed) {
    if (!matchCorrect) {
      failureType = testCase.expectedMatch ? 'false_negative' : 'false_positive';
    } else {
      failureType = 'confidence_out_of_range';
    }
  }

  return {
    testCase,
    actualMatch: result.matches,
    actualConfidence: result.confidence,
    passed,
    failureType,
    durationMs,
    confidenceFactors: options.includeFactors ? result.factors : undefined,
  };
}

/**
 * Calculate metrics for a category.
 */
function calculateCategoryMetrics(
  categoryName: string,
  results: TestCaseResult[]
): CategoryMetrics {
  const tp = results.filter((r) => r.actualMatch && r.testCase.expectedMatch).length;
  const tn = results.filter((r) => !r.actualMatch && !r.testCase.expectedMatch).length;
  const fp = results.filter((r) => r.actualMatch && !r.testCase.expectedMatch).length;
  const fn = results.filter((r) => !r.actualMatch && r.testCase.expectedMatch).length;

  const total = results.length;
  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    category: categoryName,
    totalCases: total,
    accuracy: Math.round(accuracy * 1000) / 10,
    precision: Math.round(precision * 1000) / 10,
    recall: Math.round(recall * 1000) / 10,
    f1Score: Math.round(f1Score * 1000) / 10,
    truePositives: tp,
    trueNegatives: tn,
    falsePositives: fp,
    falseNegatives: fn,
  };
}

/**
 * Calculate calibration buckets.
 */
function calculateCalibrationBuckets(results: TestCaseResult[]): CalibrationBucket[] {
  const bucketRanges = [
    { min: 90, max: 100 },
    { min: 80, max: 90 },
    { min: 70, max: 80 },
    { min: 60, max: 70 },
    { min: 50, max: 60 },
    { min: 0, max: 50 },
  ];

  return bucketRanges.map((range) => {
    const bucketResults = results.filter(
      (r) => r.actualConfidence >= range.min && r.actualConfidence < range.max
    );

    if (bucketResults.length === 0) {
      return {
        predictedRange: range,
        actualAccuracy: 0,
        sampleCount: 0,
        calibrationError: 0,
      };
    }

    const correct = bucketResults.filter((r) => r.actualMatch === r.testCase.expectedMatch).length;
    const actualAccuracy = (correct / bucketResults.length) * 100;
    const midpoint = (range.min + range.max) / 2;
    const calibrationError = Math.abs(midpoint - actualAccuracy);

    return {
      predictedRange: range,
      actualAccuracy: Math.round(actualAccuracy * 10) / 10,
      sampleCount: bucketResults.length,
      calibrationError: Math.round(calibrationError * 10) / 10,
    };
  });
}

/**
 * Calculate Brier score for confidence calibration.
 */
function calculateBrierScore(results: TestCaseResult[]): number {
  if (results.length === 0) return 0;

  const sumSquaredError = results.reduce((sum, r) => {
    const predicted = r.actualConfidence / 100;
    const actual = r.actualMatch === r.testCase.expectedMatch ? 1 : 0;
    return sum + Math.pow(predicted - actual, 2);
  }, 0);

  return Math.round((sumSquaredError / results.length) * 1000) / 1000;
}

/**
 * Run full evaluation against golden dataset.
 */
export function evaluate(
  options: EvaluationOptions = {},
  comparator: SemanticComparator = new DefaultSemanticComparator()
): EvaluationResult {
  const startTime = performance.now();

  // Filter dataset by options
  let dataset = GOLDEN_DATASET;

  if (options.categories && options.categories.length > 0) {
    dataset = dataset.filter((tc) => options.categories!.includes(tc.category));
  }

  if (options.tags && options.tags.length > 0) {
    dataset = dataset.filter(
      (tc) => tc.tags && tc.tags.some((tag) => options.tags!.includes(tag))
    );
  }

  // Run all test cases
  const testResults = dataset.map((tc) => runTestCase(tc, comparator, options));

  // Calculate overall metrics
  const tp = testResults.filter((r) => r.actualMatch && r.testCase.expectedMatch).length;
  const tn = testResults.filter((r) => !r.actualMatch && !r.testCase.expectedMatch).length;
  const fp = testResults.filter((r) => r.actualMatch && !r.testCase.expectedMatch).length;
  const fn = testResults.filter((r) => !r.actualMatch && r.testCase.expectedMatch).length;

  const total = testResults.length;
  const accuracy = total > 0 ? ((tp + tn) / total) * 100 : 0;
  const precision = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;
  const recall = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Calculate calibration
  const calibrationBuckets = calculateCalibrationBuckets(testResults);
  const calibrationError =
    calibrationBuckets.reduce((sum, b) => sum + b.calibrationError * b.sampleCount, 0) /
    Math.max(1, testResults.length);
  const brierScore = calculateBrierScore(testResults);

  // Calculate category metrics
  const categoryMetrics = [
    calculateCategoryMetrics(
      'security',
      testResults.filter((r) => r.testCase.category === 'security')
    ),
    calculateCategoryMetrics(
      'limitation',
      testResults.filter((r) => r.testCase.category === 'limitation')
    ),
    calculateCategoryMetrics(
      'assertion',
      testResults.filter((r) => r.testCase.category === 'assertion')
    ),
  ].filter((m) => m.totalCases > 0);

  const totalDurationMs = performance.now() - startTime;
  const averageComparisonMs = total > 0 ? totalDurationMs / total : 0;

  return {
    timestamp: new Date(),
    algorithmVersion: '1.0.0',
    datasetVersion: DATASET_VERSION,
    totalCases: total,

    accuracy: Math.round(accuracy * 10) / 10,
    precision: Math.round(precision * 10) / 10,
    recall: Math.round(recall * 10) / 10,
    f1Score: Math.round(f1Score * 10) / 10,

    truePositives: tp,
    trueNegatives: tn,
    falsePositives: fp,
    falseNegatives: fn,

    calibrationError: Math.round(calibrationError * 10) / 10,
    brierScore,
    calibrationBuckets,

    categoryMetrics,
    testResults,
    failures: testResults.filter((r) => !r.passed),

    totalDurationMs: Math.round(totalDurationMs),
    averageComparisonMs: Math.round(averageComparisonMs * 100) / 100,
  };
}

/**
 * Create a summary for display.
 */
export function createSummary(result: EvaluationResult): EvaluationSummary {
  const fpRate = result.totalCases > 0 ? (result.falsePositives / result.totalCases) * 100 : 0;
  const fnRate = result.totalCases > 0 ? (result.falseNegatives / result.totalCases) * 100 : 0;

  return {
    accuracy: `${result.accuracy}%`,
    precision: `${result.precision}%`,
    recall: `${result.recall}%`,
    f1Score: `${result.f1Score}%`,
    falsePositiveRate: `${Math.round(fpRate * 10) / 10}%`,
    falseNegativeRate: `${Math.round(fnRate * 10) / 10}%`,
    calibrationError: `${result.calibrationError}%`,
    totalCases: result.totalCases,
    passedCases: result.totalCases - result.failures.length,
    failedCases: result.failures.length,
  };
}

/**
 * Format evaluation result for console output.
 */
export function formatEvaluationReport(result: EvaluationResult): string {
  const summary = createSummary(result);
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('               DRIFT DETECTION EVALUATION REPORT               ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Dataset Version: ${result.datasetVersion}`);
  lines.push(`  Total Test Cases: ${result.totalCases}`);
  lines.push('');
  lines.push('  ACCURACY METRICS');
  lines.push('  ────────────────────────────────────────────────────────────');
  lines.push(`  ├── Accuracy:  ${summary.accuracy.padStart(6)} (${result.truePositives + result.trueNegatives}/${result.totalCases} correct)`);
  lines.push(`  ├── Precision: ${summary.precision.padStart(6)} (low false positive rate)`);
  lines.push(`  ├── Recall:    ${summary.recall.padStart(6)} (catches most real drift)`);
  lines.push(`  └── F1 Score:  ${summary.f1Score.padStart(6)}`);
  lines.push('');
  lines.push('  CONFUSION MATRIX');
  lines.push('  ────────────────────────────────────────────────────────────');
  lines.push('  ┌─────────────┬──────────┬──────────┐');
  lines.push('  │             │ Predicted│ Predicted│');
  lines.push('  │             │  Match   │ Different│');
  lines.push('  ├─────────────┼──────────┼──────────┤');
  lines.push(`  │ Actual Match│ ${String(result.truePositives).padStart(5)} TP │ ${String(result.falseNegatives).padStart(5)} FN │`);
  lines.push(`  │ Actual Diff │ ${String(result.falsePositives).padStart(5)} FP │ ${String(result.trueNegatives).padStart(5)} TN │`);
  lines.push('  └─────────────┴──────────┴──────────┘');
  lines.push('');
  lines.push('  CONFIDENCE CALIBRATION');
  lines.push('  ────────────────────────────────────────────────────────────');
  lines.push(`  ├── Calibration Error: ${summary.calibrationError}`);
  lines.push(`  └── Brier Score: ${result.brierScore}`);
  lines.push('');

  if (result.categoryMetrics.length > 0) {
    lines.push('  CATEGORY BREAKDOWN');
    lines.push('  ────────────────────────────────────────────────────────────');
    for (const cat of result.categoryMetrics) {
      lines.push(`  ├── ${cat.category.padEnd(12)}: ${cat.accuracy}% accuracy (${cat.truePositives + cat.trueNegatives}/${cat.totalCases})`);
    }
    lines.push('');
  }

  if (result.failures.length > 0) {
    lines.push(`  FAILURES (${result.failures.length} cases)`);
    lines.push('  ────────────────────────────────────────────────────────────');
    const fpCount = result.failures.filter((f) => f.failureType === 'false_positive').length;
    const fnCount = result.failures.filter((f) => f.failureType === 'false_negative').length;
    const confCount = result.failures.filter((f) => f.failureType === 'confidence_out_of_range').length;
    if (fpCount > 0) lines.push(`  ├── ${fpCount} False Positives (flagged drift when none)`);
    if (fnCount > 0) lines.push(`  ├── ${fnCount} False Negatives (missed real drift)`);
    if (confCount > 0) lines.push(`  └── ${confCount} Confidence Miscalibrations`);
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}

/**
 * Export results as JSON for external analysis.
 */
export function exportResultsAsJson(result: EvaluationResult): string {
  return JSON.stringify(result, null, 2);
}

// Re-export for convenience
export { GOLDEN_DATASET, getDatasetStatistics };
