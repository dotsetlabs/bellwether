/**
 * Drift Detection Evaluation Framework
 *
 * Provides tools for measuring the accuracy of semantic comparison
 * algorithms used in behavioral drift detection.
 *
 * Usage:
 *   import { evaluate, formatEvaluationReport } from './evaluation';
 *   const result = evaluate();
 *   console.log(formatEvaluationReport(result));
 */

export * from './types.js';
export * from './golden-dataset.js';
export * from './evaluator.js';
