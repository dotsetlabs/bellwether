/**
 * Types for the drift detection evaluation framework.
 *
 * This framework enables systematic measurement of semantic comparison
 * accuracy, including precision, recall, and confidence calibration.
 */

/**
 * A labeled test case for evaluating semantic comparison accuracy.
 */
export interface GoldenTestCase {
  /** Unique identifier for this test case */
  id: string;

  /** Category of comparison being tested */
  category: 'security' | 'limitation' | 'assertion';

  /** First text to compare */
  text1: string;

  /** Second text to compare */
  text2: string;

  /** Tool name for context (affects fingerprinting) */
  toolName: string;

  /** Whether these should be considered semantically equivalent */
  expectedMatch: boolean;

  /** Expected confidence range (optional) */
  expectedConfidence?: {
    min: number;
    max: number;
  };

  /** Human reasoning for why this is the expected outcome */
  reasoning: string;

  /** Source of this test case */
  source: 'manual' | 'llm-generated' | 'production' | 'user-feedback';

  /** Tags for filtering and analysis */
  tags?: string[];
}

/**
 * Result of evaluating a single test case.
 */
export interface TestCaseResult {
  /** The test case that was evaluated */
  testCase: GoldenTestCase;

  /** Whether the comparison returned match */
  actualMatch: boolean;

  /** The confidence score returned */
  actualConfidence: number;

  /** Whether this test passed */
  passed: boolean;

  /** Type of failure if not passed */
  failureType?: 'false_positive' | 'false_negative' | 'confidence_out_of_range';

  /** Time taken for this comparison (ms) */
  durationMs: number;

  /** Detailed confidence factors */
  confidenceFactors?: Array<{
    name: string;
    weight: number;
    value: number;
    description: string;
  }>;
}

/**
 * Metrics for a specific category of comparisons.
 */
export interface CategoryMetrics {
  /** Category name */
  category: string;

  /** Number of test cases */
  totalCases: number;

  /** Accuracy for this category */
  accuracy: number;

  /** Precision for this category */
  precision: number;

  /** Recall for this category */
  recall: number;

  /** F1 score for this category */
  f1Score: number;

  /** Confusion matrix counts */
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
}

/**
 * Calibration bucket for analyzing confidence score accuracy.
 */
export interface CalibrationBucket {
  /** Range of predicted confidence scores */
  predictedRange: {
    min: number;
    max: number;
  };

  /** Actual accuracy for predictions in this range */
  actualAccuracy: number;

  /** Number of samples in this bucket */
  sampleCount: number;

  /** Calibration error (|predicted - actual|) */
  calibrationError: number;
}

/**
 * Complete evaluation result for a drift detection algorithm.
 */
export interface EvaluationResult {
  /** Timestamp of evaluation */
  timestamp: Date;

  /** Algorithm version being evaluated */
  algorithmVersion: string;

  /** Dataset version used */
  datasetVersion: string;

  /** Total number of test cases */
  totalCases: number;

  // === Core Accuracy Metrics ===

  /** Overall accuracy: (TP + TN) / Total */
  accuracy: number;

  /** Precision: TP / (TP + FP) - low false positive rate */
  precision: number;

  /** Recall: TP / (TP + FN) - catches real drift */
  recall: number;

  /** F1 Score: harmonic mean of precision and recall */
  f1Score: number;

  // === Confusion Matrix ===

  /** Correctly identified as matching */
  truePositives: number;

  /** Correctly identified as different */
  trueNegatives: number;

  /** Incorrectly flagged as different (noise/false alarm) */
  falsePositives: number;

  /** Missed real differences (dangerous) */
  falseNegatives: number;

  // === Confidence Calibration ===

  /** Average |predicted_confidence - actual_accuracy| */
  calibrationError: number;

  /** Mean squared error of probabilistic predictions */
  brierScore: number;

  /** Calibration buckets for detailed analysis */
  calibrationBuckets: CalibrationBucket[];

  // === Breakdown by Category ===

  /** Metrics per category */
  categoryMetrics: CategoryMetrics[];

  // === Detailed Results ===

  /** All individual test results */
  testResults: TestCaseResult[];

  /** Failed test cases for analysis */
  failures: TestCaseResult[];

  // === Performance ===

  /** Total evaluation time (ms) */
  totalDurationMs: number;

  /** Average comparison time (ms) */
  averageComparisonMs: number;
}

/**
 * Summary for display/reporting.
 */
export interface EvaluationSummary {
  accuracy: string;
  precision: string;
  recall: string;
  f1Score: string;
  falsePositiveRate: string;
  falseNegativeRate: string;
  calibrationError: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
}

/**
 * Options for running evaluation.
 */
export interface EvaluationOptions {
  /** Filter to specific categories */
  categories?: Array<'security' | 'limitation' | 'assertion'>;

  /** Filter to specific tags */
  tags?: string[];

  /** Verbose output */
  verbose?: boolean;

  /** Include detailed confidence factors in results */
  includeFactors?: boolean;
}

/**
 * Semantic comparator interface for pluggable algorithms.
 */
export interface SemanticComparator {
  /** Compare two texts and return match result with confidence */
  compare(
    text1: string,
    text2: string,
    toolName: string,
    category: 'security' | 'limitation' | 'assertion'
  ): {
    matches: boolean;
    confidence: number;
    factors?: Array<{
      name: string;
      weight: number;
      value: number;
      description: string;
    }>;
  };
}
