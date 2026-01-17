/**
 * A/B Testing Framework for Drift Detection Algorithms
 *
 * Enables safe comparison of algorithm variants to measure
 * which performs better on the golden dataset.
 */

import type { EvaluationResult, EvaluationOptions } from './evaluation/types.js';
import { GOLDEN_DATASET } from './evaluation/golden-dataset.js';
import { evaluate, DefaultSemanticComparator } from './evaluation/evaluator.js';
import type { SemanticComparator } from './evaluation/types.js';

/**
 * An algorithm variant to test.
 */
export interface AlgorithmVariant {
  /** Human-readable name */
  name: string;

  /** Version identifier */
  version: string;

  /** Description of what this variant changes */
  description?: string;

  /** The semantic comparator implementation */
  comparator: SemanticComparator;
}

/**
 * Results of an A/B test comparing algorithm variants.
 */
export interface ABTestResult {
  /** Results for each variant */
  variantResults: Map<string, EvaluationResult>;

  /** The winning variant (highest F1 score) */
  winner: AlgorithmVariant | null;

  /** Comparison between variants */
  comparison: VariantComparison[];

  /** Statistical significance analysis */
  significance: SignificanceAnalysis;

  /** Summary recommendations */
  recommendations: string[];
}

/**
 * Comparison between two variants.
 */
export interface VariantComparison {
  variant1: string;
  variant2: string;
  accuracyDiff: number;
  precisionDiff: number;
  recallDiff: number;
  f1Diff: number;
  winner: string;
}

/**
 * Statistical significance analysis.
 */
export interface SignificanceAnalysis {
  /** Whether differences are statistically significant */
  isSignificant: boolean;

  /** Minimum sample size needed for significance */
  recommendedSampleSize: number;

  /** Actual sample size */
  actualSampleSize: number;

  /** Confidence level (e.g., 0.95 for 95%) */
  confidenceLevel: number;

  /** Notes on the analysis */
  notes: string;
}

/**
 * Run an A/B test comparing multiple algorithm variants.
 */
export function runABTest(
  variants: AlgorithmVariant[],
  options: EvaluationOptions = {}
): ABTestResult {
  if (variants.length < 2) {
    throw new Error('A/B test requires at least 2 variants');
  }

  const variantResults = new Map<string, EvaluationResult>();

  // Evaluate each variant
  for (const variant of variants) {
    const result = evaluate(options, variant.comparator);
    variantResults.set(variant.name, result);
  }

  // Generate pairwise comparisons
  const comparison: VariantComparison[] = [];
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const v1 = variants[i];
      const v2 = variants[j];
      const r1 = variantResults.get(v1.name)!;
      const r2 = variantResults.get(v2.name)!;

      comparison.push({
        variant1: v1.name,
        variant2: v2.name,
        accuracyDiff: r1.accuracy - r2.accuracy,
        precisionDiff: r1.precision - r2.precision,
        recallDiff: r1.recall - r2.recall,
        f1Diff: r1.f1Score - r2.f1Score,
        winner: r1.f1Score > r2.f1Score ? v1.name : v2.name,
      });
    }
  }

  // Determine overall winner (highest F1 score)
  let winner: AlgorithmVariant | null = null;
  let highestF1 = -1;

  for (const variant of variants) {
    const result = variantResults.get(variant.name)!;
    if (result.f1Score > highestF1) {
      highestF1 = result.f1Score;
      winner = variant;
    }
  }

  // Calculate statistical significance
  const significance = analyzeSignificance(variantResults, GOLDEN_DATASET.length);

  // Generate recommendations
  const recommendations = generateRecommendations(variantResults, winner, significance);

  return {
    variantResults,
    winner,
    comparison,
    significance,
    recommendations,
  };
}

/**
 * Analyze statistical significance of results.
 */
function analyzeSignificance(
  results: Map<string, EvaluationResult>,
  sampleSize: number
): SignificanceAnalysis {
  // For binary classification with ~50% accuracy, we need ~385 samples
  // for a 5% margin of error at 95% confidence
  const recommendedSampleSize = 385;
  const hasEnoughSamples = sampleSize >= recommendedSampleSize;

  // Calculate variance in results
  const f1Scores = Array.from(results.values()).map(r => r.f1Score);
  const variance = calculateVariance(f1Scores);

  // Results are significant if:
  // 1. We have enough samples
  // 2. The variance between variants is meaningful (> 5%)
  const isSignificant = hasEnoughSamples && variance > 25; // variance of 5% difference

  let notes = '';
  if (!hasEnoughSamples) {
    notes = `Sample size (${sampleSize}) is below recommended (${recommendedSampleSize}). Results may not be statistically significant.`;
  } else if (!isSignificant) {
    notes = 'Differences between variants are small. Consider running more targeted tests.';
  } else {
    notes = 'Results appear statistically significant with the current sample size.';
  }

  return {
    isSignificant,
    recommendedSampleSize,
    actualSampleSize: sampleSize,
    confidenceLevel: 0.95,
    notes,
  };
}

/**
 * Calculate variance of an array of numbers.
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
}

/**
 * Generate recommendations based on A/B test results.
 */
function generateRecommendations(
  results: Map<string, EvaluationResult>,
  winner: AlgorithmVariant | null,
  significance: SignificanceAnalysis
): string[] {
  const recommendations: string[] = [];

  if (!winner) {
    recommendations.push('No clear winner - all variants performed similarly.');
    return recommendations;
  }

  const winnerResult = results.get(winner.name)!;

  // Check precision/recall tradeoff
  if (winnerResult.precision > 90 && winnerResult.recall < 50) {
    recommendations.push(
      `${winner.name} has high precision (${winnerResult.precision}%) but low recall (${winnerResult.recall}%). ` +
      'Consider if missing matches is acceptable for your use case.'
    );
  } else if (winnerResult.recall > 90 && winnerResult.precision < 70) {
    recommendations.push(
      `${winner.name} has high recall (${winnerResult.recall}%) but lower precision (${winnerResult.precision}%). ` +
      'This may result in more false positives.'
    );
  }

  // Check significance
  if (!significance.isSignificant) {
    recommendations.push(
      'Results are not statistically significant. ' +
      `Consider expanding the test dataset to ${significance.recommendedSampleSize}+ cases.`
    );
  }

  // Check false positive rate
  if (winnerResult.falsePositives > 0) {
    const fpRate = (winnerResult.falsePositives / winnerResult.totalCases) * 100;
    if (fpRate > 5) {
      recommendations.push(
        `False positive rate (${fpRate.toFixed(1)}%) is above 5%. ` +
        'Consider tightening matching criteria.'
      );
    }
  }

  // Overall recommendation
  if (significance.isSignificant && winnerResult.f1Score > 70) {
    recommendations.push(
      `Recommend adopting ${winner.name} (F1: ${winnerResult.f1Score}%, Precision: ${winnerResult.precision}%, Recall: ${winnerResult.recall}%).`
    );
  } else {
    recommendations.push(
      'Continue iterating on algorithm improvements before deployment.'
    );
  }

  return recommendations;
}

/**
 * Format A/B test results for display.
 */
export function formatABTestReport(result: ABTestResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    A/B TEST RESULTS                            ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Variant results
  lines.push('  VARIANT PERFORMANCE');
  lines.push('  ────────────────────────────────────────────────────────────');

  for (const [name, evalResult] of result.variantResults) {
    const isWinner = result.winner?.name === name;
    const marker = isWinner ? ' ★ WINNER' : '';
    lines.push(`  ${name}${marker}`);
    lines.push(`    Accuracy:  ${evalResult.accuracy}%`);
    lines.push(`    Precision: ${evalResult.precision}%`);
    lines.push(`    Recall:    ${evalResult.recall}%`);
    lines.push(`    F1 Score:  ${evalResult.f1Score}%`);
    lines.push('');
  }

  // Comparisons
  if (result.comparison.length > 0) {
    lines.push('  PAIRWISE COMPARISONS');
    lines.push('  ────────────────────────────────────────────────────────────');

    for (const comp of result.comparison) {
      const sign = (n: number) => n > 0 ? '+' : '';
      lines.push(`  ${comp.variant1} vs ${comp.variant2}:`);
      lines.push(`    Accuracy:  ${sign(comp.accuracyDiff)}${comp.accuracyDiff.toFixed(1)}%`);
      lines.push(`    Precision: ${sign(comp.precisionDiff)}${comp.precisionDiff.toFixed(1)}%`);
      lines.push(`    Recall:    ${sign(comp.recallDiff)}${comp.recallDiff.toFixed(1)}%`);
      lines.push(`    F1:        ${sign(comp.f1Diff)}${comp.f1Diff.toFixed(1)}%`);
      lines.push(`    → Winner: ${comp.winner}`);
      lines.push('');
    }
  }

  // Significance
  lines.push('  STATISTICAL SIGNIFICANCE');
  lines.push('  ────────────────────────────────────────────────────────────');
  lines.push(`  Sample size: ${result.significance.actualSampleSize} / ${result.significance.recommendedSampleSize} recommended`);
  lines.push(`  Confidence level: ${(result.significance.confidenceLevel * 100).toFixed(0)}%`);
  lines.push(`  Significant: ${result.significance.isSignificant ? 'Yes' : 'No'}`);
  lines.push(`  ${result.significance.notes}`);
  lines.push('');

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push('  RECOMMENDATIONS');
    lines.push('  ────────────────────────────────────────────────────────────');
    for (const rec of result.recommendations) {
      lines.push(`  • ${rec}`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}

/**
 * Create the default algorithm variant (current implementation).
 */
export function createDefaultVariant(): AlgorithmVariant {
  return {
    name: 'default',
    version: '1.2.0',
    description: 'Current production algorithm with negation detection and qualifier extraction',
    comparator: new DefaultSemanticComparator(),
  };
}

/**
 * Quick comparison of two algorithms.
 */
export function compareAlgorithms(
  baseline: SemanticComparator,
  candidate: SemanticComparator,
  options: EvaluationOptions = {}
): ABTestResult {
  return runABTest([
    {
      name: 'baseline',
      version: '1.0.0',
      description: 'Current production algorithm',
      comparator: baseline,
    },
    {
      name: 'candidate',
      version: '2.0.0',
      description: 'New candidate algorithm',
      comparator: candidate,
    },
  ], options);
}
