/**
 * Script to analyze false negatives in the evaluation results.
 */

import { evaluate } from '../src/baseline/evaluation/index.js';

const result = evaluate({ includeFactors: true });

console.log('=== FALSE NEGATIVE ANALYSIS ===');
console.log('Total false negatives:', result.falseNegatives);
console.log('Total test cases:', result.totalCases);
console.log('');

// Group by category
const fnByCategory: Record<string, typeof result.failures> = {};
for (const failure of result.failures) {
  if (failure.failureType === 'false_negative') {
    const cat = failure.testCase.category;
    if (!fnByCategory[cat]) fnByCategory[cat] = [];
    fnByCategory[cat].push(failure);
  }
}

for (const [cat, failures] of Object.entries(fnByCategory)) {
  console.log('\n=== ' + cat.toUpperCase() + ' FALSE NEGATIVES (' + failures.length + ') ===');
  for (const f of failures) {
    console.log('\nID:', f.testCase.id);
    console.log('Text1:', f.testCase.text1.substring(0, 100));
    console.log('Text2:', f.testCase.text2.substring(0, 100));
    console.log('Confidence:', f.actualConfidence + '%');
    console.log('Reasoning:', f.testCase.reasoning);
    if (f.confidenceFactors) {
      console.log('Factors:');
      for (const factor of f.confidenceFactors) {
        console.log('  -', factor.name + ':', factor.value, '(' + factor.description + ')');
      }
    }
    console.log('---');
  }
}

// Summary
console.log('\n=== SUMMARY ===');
for (const [cat, failures] of Object.entries(fnByCategory)) {
  console.log(cat + ':', failures.length, 'false negatives');
}

// Full metrics
console.log('\n=== FULL EVALUATION METRICS ===');
console.log('Total test cases:', result.totalCases);
console.log('True Positives:', result.truePositives);
console.log('True Negatives:', result.trueNegatives);
console.log('False Positives:', result.falsePositives);
console.log('False Negatives:', result.falseNegatives);
console.log('');
// The evaluator already returns percentages (0-100)
console.log('Precision:', result.precision.toFixed(1) + '%');
console.log('Recall:', result.recall.toFixed(1) + '%');
console.log('F1 Score:', result.f1Score.toFixed(1) + '%');
console.log('Accuracy:', result.accuracy.toFixed(1) + '%');

// Also show false positives
console.log('\n=== FALSE POSITIVES (' + result.falsePositives + ') ===');
for (const failure of result.failures) {
  if (failure.failureType === 'false_positive') {
    console.log('\nID:', failure.testCase.id);
    console.log('Text1:', failure.testCase.text1.substring(0, 80));
    console.log('Text2:', failure.testCase.text2.substring(0, 80));
    console.log('Expected: NO match, Got:', failure.actualConfidence + '% match');
    console.log('Reasoning:', failure.testCase.reasoning);
    console.log('---');
  }
}
