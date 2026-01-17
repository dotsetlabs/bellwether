/**
 * Eval command - evaluate drift detection algorithm accuracy.
 *
 * Runs the semantic comparison algorithm against a golden dataset
 * to measure precision, recall, and calibration metrics.
 */

import { Command } from 'commander';
import { writeFileSync } from 'fs';
import chalk from 'chalk';
import {
  evaluate,
  formatEvaluationReport,
  getDatasetStatistics,
  createSummary,
} from '../../baseline/evaluation/index.js';
import type { EvaluationOptions } from '../../baseline/evaluation/index.js';
import {
  updateCalibrationModel,
  calculateCalibrationError,
  type CalibrationBucket,
} from '../../baseline/calibration.js';
import { checkOllamaEmbeddings } from '../../baseline/embeddings.js';

export function createEvalCommand(): Command {
  const evalCmd = new Command('eval')
    .description('Evaluate drift detection algorithm accuracy')
    .option('-c, --category <categories...>', 'Filter by category (security, limitation, assertion)')
    .option('-t, --tags <tags...>', 'Filter by tags')
    .option('--json', 'Output results as JSON')
    .option('--verbose', 'Show individual test case results')
    .option('--failures', 'Only show failed test cases')
    .option('--stats', 'Show dataset statistics only')
    .option('--update-calibration', 'Update calibration model from results')
    .option('--export-calibration <path>', 'Export new calibration model to file')
    .option('--check-embeddings', 'Check if Ollama embeddings are available')
    .action(async (options) => {
      await handleEval(options);
    });

  return evalCmd;
}

interface EvalCommandOptions {
  category?: string[];
  tags?: string[];
  json?: boolean;
  verbose?: boolean;
  failures?: boolean;
  stats?: boolean;
  updateCalibration?: boolean;
  exportCalibration?: string;
  checkEmbeddings?: boolean;
}

async function handleEval(options: EvalCommandOptions): Promise<void> {
  // Check embeddings availability
  if (options.checkEmbeddings) {
    console.log(chalk.gray('Checking Ollama embeddings availability...'));
    const status = await checkOllamaEmbeddings();

    console.log('');
    console.log(chalk.bold('Ollama Embedding Status'));
    console.log('─'.repeat(40));
    console.log(`  Ollama available: ${status.available ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`  Model: ${status.modelName}`);
    console.log(`  Model available: ${status.hasModel ? chalk.green('Yes') : chalk.yellow('No')}`);

    if (status.error) {
      console.log(`  ${chalk.red('Error')}: ${status.error}`);
    }

    if (status.available && !status.hasModel) {
      console.log('');
      console.log(chalk.gray('To enable embeddings, run:'));
      console.log(chalk.cyan('  ollama pull nomic-embed-text'));
    }

    console.log('');
    return;
  }

  // Show dataset statistics only
  if (options.stats) {
    const stats = getDatasetStatistics();
    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log('');
      console.log(chalk.bold('Golden Dataset Statistics'));
      console.log('─'.repeat(40));
      console.log(`  Total Cases:      ${stats.totalCases}`);
      console.log(`  True Positives:   ${stats.truePositives}`);
      console.log(`  True Negatives:   ${stats.trueNegatives}`);
      console.log('');
      console.log(chalk.gray('  By Category:'));
      console.log(`    Security:     ${stats.byCategory.security}`);
      console.log(`    Limitation:   ${stats.byCategory.limitation}`);
      console.log(`    Assertion:    ${stats.byCategory.assertion}`);
      console.log('');
    }
    return;
  }

  // Build evaluation options
  const evalOptions: EvaluationOptions = {
    includeFactors: options.verbose,
  };

  if (options.category) {
    evalOptions.categories = options.category as Array<'security' | 'limitation' | 'assertion'>;
  }

  if (options.tags) {
    evalOptions.tags = options.tags;
  }

  // Run evaluation
  console.log(chalk.gray('Running evaluation...'));
  const result = evaluate(evalOptions);

  // Output as JSON
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Display formatted report
  console.log(formatEvaluationReport(result));

  // Show failures detail
  if (options.failures || options.verbose) {
    if (result.failures.length > 0) {
      console.log(chalk.bold('\n  Failure Details'));
      console.log('  ' + '─'.repeat(58));

      for (const failure of result.failures) {
        const tc = failure.testCase;
        const icon = failure.failureType === 'false_positive' ? '⚠️' : '❌';
        const typeColor = failure.failureType === 'false_positive' ? chalk.yellow : chalk.red;

        console.log('');
        console.log(`  ${icon} ${chalk.bold(tc.id)} - ${typeColor(failure.failureType || 'unknown')}`);
        console.log(chalk.gray(`     Category: ${tc.category} | Tool: ${tc.toolName}`));
        console.log(chalk.gray(`     Expected: ${tc.expectedMatch ? 'match' : 'no match'} | Got: ${failure.actualMatch ? 'match' : 'no match'}`));
        console.log(chalk.gray(`     Confidence: ${failure.actualConfidence}%`));
        console.log('');
        console.log(`     Text 1: "${truncate(tc.text1, 60)}"`);
        console.log(`     Text 2: "${truncate(tc.text2, 60)}"`);
        console.log(chalk.gray(`     Reasoning: ${tc.reasoning}`));

        if (options.verbose && failure.confidenceFactors) {
          console.log(chalk.gray('\n     Confidence Factors:'));
          for (const factor of failure.confidenceFactors) {
            console.log(chalk.gray(`       - ${factor.name}: ${factor.value} (weight: ${factor.weight})`));
          }
        }
      }
      console.log('');
    }
  }

  // Summary line for CI
  const summary = createSummary(result);
  const passedAll = result.failures.length === 0;
  const statusLine = passedAll
    ? chalk.green(`✓ All ${result.totalCases} test cases passed`)
    : chalk.yellow(`⚠ ${result.failures.length}/${result.totalCases} test cases failed`);

  console.log(statusLine);
  console.log(chalk.gray(`  Accuracy: ${summary.accuracy} | Precision: ${summary.precision} | Recall: ${summary.recall}`));
  console.log('');

  // Update calibration model from results
  if (options.updateCalibration || options.exportCalibration) {
    // Convert test results to calibration format
    const calibrationData = result.testResults.map(tr => ({
      predictedConfidence: tr.actualConfidence,
      wasCorrect: tr.actualMatch === tr.testCase.expectedMatch,
    }));

    const newCalibration = updateCalibrationModel(calibrationData);
    const calibrationError = calculateCalibrationError(newCalibration);

    console.log(chalk.bold('Calibration Update'));
    console.log('─'.repeat(40));
    console.log(`  Calibration error: ${calibrationError}%`);
    console.log('');
    console.log('  New calibration buckets:');

    for (const bucket of newCalibration) {
      const range = `${bucket.min}-${bucket.max}%`;
      console.log(`    ${range.padEnd(10)} → ${bucket.calibratedAccuracy}% accuracy (n=${bucket.sampleCount})`);
    }

    if (options.exportCalibration) {
      const calibrationContent = generateCalibrationCode(newCalibration);
      writeFileSync(options.exportCalibration, calibrationContent);
      console.log('');
      console.log(chalk.green(`✓ Calibration exported to: ${options.exportCalibration}`));
    }

    console.log('');
  }

  // Exit with error code if failures and in CI mode
  if (process.env.CI && result.failures.length > 0) {
    process.exit(1);
  }
}

/**
 * Generate TypeScript code for a new calibration model.
 */
function generateCalibrationCode(buckets: CalibrationBucket[]): string {
  const lines: string[] = [];
  lines.push('/**');
  lines.push(' * Updated Calibration Model');
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(' */');
  lines.push('');
  lines.push('import type { CalibrationBucket } from \'./calibration.js\';');
  lines.push('');
  lines.push('export const UPDATED_CALIBRATION_MODEL: CalibrationBucket[] = [');

  for (const bucket of buckets) {
    lines.push(`  { min: ${bucket.min}, max: ${bucket.max}, calibratedAccuracy: ${bucket.calibratedAccuracy}, sampleCount: ${bucket.sampleCount} },`);
  }

  lines.push('];');
  lines.push('');
  return lines.join('\n');
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
