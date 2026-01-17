/**
 * Feedback command - submit feedback on drift detection decisions.
 *
 * Allows users to report false positives, false negatives, and
 * confidence calibration issues for algorithm improvement.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  getDecisionLogger,
  getFeedbackManager,
  type FeedbackReport,
} from '../../baseline/telemetry.js';

export function createFeedbackCommand(): Command {
  const feedbackCmd = new Command('feedback')
    .description('Submit feedback on drift detection decisions')
    .argument('[decision-id]', 'ID of the comparison decision to report')
    .option('-t, --type <type>', 'Feedback type: false_positive, false_negative, confidence_wrong')
    .option('-m, --message <message>', 'Comment explaining the issue')
    .option('--correct <answer>', 'What the correct answer should have been (true/false)')
    .option('--list', 'List recent decisions that can receive feedback')
    .option('--stats', 'Show feedback statistics')
    .option('--analyze', 'Analyze all feedback for patterns')
    .option('--export <path>', 'Export decisions to file for analysis')
    .option('--clear', 'Clear all logged decisions and feedback')
    .action(async (decisionId: string | undefined, options) => {
      await handleFeedback(decisionId, options);
    });

  return feedbackCmd;
}

interface FeedbackCommandOptions {
  type?: string;
  message?: string;
  correct?: string;
  list?: boolean;
  stats?: boolean;
  analyze?: boolean;
  export?: string;
  clear?: boolean;
}

async function handleFeedback(
  decisionId: string | undefined,
  options: FeedbackCommandOptions
): Promise<void> {
  const logger = getDecisionLogger();
  const feedbackManager = getFeedbackManager();

  // List recent decisions
  if (options.list) {
    const decisions = logger.loadAllDecisions();
    if (decisions.length === 0) {
      console.log(chalk.gray('No logged decisions found.'));
      console.log(chalk.gray('Decisions are logged when running baseline comparisons.'));
      return;
    }

    console.log('');
    console.log(chalk.bold('Recent Comparison Decisions'));
    console.log('─'.repeat(60));

    // Show last 20 decisions
    const recent = decisions.slice(-20).reverse();
    for (const decision of recent) {
      const time = new Date(decision.timestamp).toLocaleString();
      const match = decision.matchDecision ? chalk.green('match') : chalk.red('no-match');
      console.log('');
      console.log(`  ${chalk.cyan(decision.id.slice(0, 8))}`);
      console.log(`    Time: ${chalk.gray(time)}`);
      console.log(`    Type: ${decision.type} | Tool: ${decision.toolName}`);
      console.log(`    Decision: ${match} (confidence: ${decision.rawConfidence}%)`);
      console.log(`    Text 1: "${truncate(decision.text1, 50)}"`);
      console.log(`    Text 2: "${truncate(decision.text2, 50)}"`);
    }

    console.log('');
    console.log(chalk.gray(`Total decisions: ${decisions.length}`));
    console.log(chalk.gray('Use: bellwether feedback <id> --type false_positive'));
    return;
  }

  // Show statistics
  if (options.stats) {
    const stats = logger.getStatistics();
    const feedbackAnalysis = feedbackManager.analyze();

    console.log('');
    console.log(chalk.bold('Telemetry Statistics'));
    console.log('─'.repeat(40));
    console.log(`  Total decisions logged: ${stats.totalDecisions}`);
    console.log(`  Average confidence: ${stats.averageConfidence}%`);
    console.log(`  Match rate: ${stats.matchRate}%`);
    console.log('');
    console.log(chalk.gray('  By type:'));
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`    ${type}: ${count}`);
    }
    console.log('');
    console.log(chalk.bold('Feedback Statistics'));
    console.log('─'.repeat(40));
    console.log(`  Total feedback reports: ${feedbackAnalysis.totalReports}`);
    console.log(`  False positive rate: ${feedbackAnalysis.falsePositiveRate}%`);
    console.log(`  False negative rate: ${feedbackAnalysis.falseNegativeRate}%`);
    console.log(`  Confidence issues: ${feedbackAnalysis.confidenceIssueRate}%`);
    console.log('');
    return;
  }

  // Analyze feedback patterns
  if (options.analyze) {
    const analysis = feedbackManager.analyze();

    console.log('');
    console.log(chalk.bold('Feedback Pattern Analysis'));
    console.log('─'.repeat(40));

    if (analysis.totalReports === 0) {
      console.log(chalk.gray('  No feedback submitted yet.'));
      console.log(chalk.gray('  Use: bellwether feedback <id> --type <type>'));
      return;
    }

    console.log(`  Total reports: ${analysis.totalReports}`);
    console.log('');
    console.log('  Issue breakdown:');
    console.log(`    False positives: ${analysis.falsePositiveRate}%`);
    console.log(`    False negatives: ${analysis.falseNegativeRate}%`);
    console.log(`    Confidence issues: ${analysis.confidenceIssueRate}%`);

    if (analysis.commonPatterns.length > 0) {
      console.log('');
      console.log('  Common patterns in feedback:');
      for (const pattern of analysis.commonPatterns) {
        console.log(`    "${pattern.pattern}": ${pattern.count} occurrences (${pattern.feedbackType})`);
      }
    }

    console.log('');
    return;
  }

  // Export decisions
  if (options.export) {
    logger.exportToFile(options.export);
    console.log(chalk.green(`Decisions exported to: ${options.export}`));
    return;
  }

  // Clear all data
  if (options.clear) {
    logger.clear();
    feedbackManager.clear();
    console.log(chalk.green('Cleared all decisions and feedback.'));
    return;
  }

  // Submit feedback
  if (!decisionId) {
    console.log(chalk.red('Error: Decision ID required'));
    console.log(chalk.gray('Use: bellwether feedback --list to see recent decisions'));
    process.exit(1);
  }

  if (!options.type) {
    console.log(chalk.red('Error: Feedback type required'));
    console.log(chalk.gray('Options: false_positive, false_negative, confidence_wrong'));
    process.exit(1);
  }

  const validTypes = ['false_positive', 'false_negative', 'confidence_wrong'];
  if (!validTypes.includes(options.type)) {
    console.log(chalk.red(`Error: Invalid feedback type "${options.type}"`));
    console.log(chalk.gray(`Valid types: ${validTypes.join(', ')}`));
    process.exit(1);
  }

  // Find the decision
  const decision = logger.getDecision(decisionId) ??
    logger.loadAllDecisions().find(d => d.id.startsWith(decisionId));

  if (!decision) {
    console.log(chalk.red(`Error: Decision not found: ${decisionId}`));
    console.log(chalk.gray('Use: bellwether feedback --list to see recent decisions'));
    process.exit(1);
  }

  // Submit feedback
  const feedback: Omit<FeedbackReport, 'timestamp'> = {
    decisionId: decision.id,
    feedbackType: options.type as 'false_positive' | 'false_negative' | 'confidence_wrong',
    userComment: options.message,
  };

  if (options.correct !== undefined) {
    feedback.correctAnswer = options.correct === 'true';
  }

  feedbackManager.submit(feedback);

  console.log('');
  console.log(chalk.green('✓ Feedback submitted'));
  console.log(`  Decision: ${decision.id.slice(0, 8)}`);
  console.log(`  Type: ${options.type}`);
  if (options.message) {
    console.log(`  Comment: ${options.message}`);
  }
  console.log('');
  console.log(chalk.gray('Thank you for helping improve drift detection accuracy!'));
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
