/**
 * baseline accept command - accept detected drift as intentional changes.
 *
 * This command allows users to acknowledge that detected drift was intentional
 * (e.g., when adding new features, updating tool behavior, etc.) and update
 * the baseline to reflect the new expected state.
 *
 * Usage:
 *   bellwether baseline accept              # Accept drift and update baseline
 *   bellwether baseline accept --reason "Added new delete tool"
 *   bellwether baseline accept --dry-run    # Show what would be accepted
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  compareBaselines,
  acceptDrift,
  formatDiffText,
} from '../../baseline/index.js';
import { EXIT_CODES } from '../../constants.js';
import * as output from '../output.js';
import { loadConfigOrExit } from '../utils/config-loader.js';
import { loadCheckInterviewResult } from '../utils/report-loader.js';
import { resolvePathFromOutputDirOrCwd } from '../utils/path-resolution.js';

export const acceptCommand = new Command('accept')
  .description('Accept detected drift as intentional and update the baseline')
  .option('-c, --config <path>', 'Path to config file')
  .option('--report <path>', 'Path to test report JSON file')
  .option('--baseline <path>', 'Path to baseline file')
  .option('--reason <reason>', 'Reason for accepting the drift')
  .option('--accepted-by <name>', 'Who is accepting the drift (for audit trail)')
  .option('--dry-run', 'Show what would be accepted without making changes')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (options) => {
    const config = loadConfigOrExit(options.config);
    const outputDir = config.output.dir;
    const resolvedBaselinePath =
      options.baseline ?? config.baseline.comparePath ?? config.baseline.path;

    if (!resolvedBaselinePath) {
      output.error(
        'No baseline path provided. Set baseline.path or baseline.comparePath in config, or pass --baseline.'
      );
      process.exit(EXIT_CODES.ERROR);
    }

    // Determine paths
    const baselinePath = resolvePathFromOutputDirOrCwd(resolvedBaselinePath, outputDir);
    const reportPath = options.report || join(outputDir, config.output.files.checkReport);

    // Load the existing baseline
    if (!existsSync(baselinePath)) {
      output.error(`Baseline not found: ${baselinePath}`);
      output.error('\nNo baseline exists to compare against.');
      output.error('Run `bellwether check` followed by `bellwether baseline save` first.');
      process.exit(EXIT_CODES.ERROR);
    }

    let previousBaseline;
    try {
      previousBaseline = loadBaseline(baselinePath);
    } catch (error) {
      output.error(`Failed to load baseline: ${error instanceof Error ? error.message : error}`);
      process.exit(EXIT_CODES.ERROR);
    }

    // Load the current test results
    let result;
    try {
      result = loadCheckInterviewResult(reportPath, {
        missingReportMessage:
          'Run `bellwether check` first to generate a report.\n' +
          'Configure in bellwether.yaml:\n' +
          '  output:\n' +
          '    format: json  # or "both" for JSON + markdown',
        invalidModeMessage: () =>
          `Baseline operations only work with check mode results.\n\n` +
          `The report at ${reportPath} was created with explore mode.\n` +
          'Run `bellwether check` to generate a check mode report first.',
      });
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.ERROR);
    }

    // Create current baseline from test results
    const serverCommand = result.metadata.serverCommand || 'unknown';
    const currentBaseline = createBaseline(result, serverCommand);

    // Compare baselines
    const diff = compareBaselines(previousBaseline, currentBaseline);

    // Check if there's any drift to accept
    if (diff.severity === 'none') {
      output.success('No drift detected. Baseline is already up to date.');
      return;
    }

    // Show the drift that will be accepted
    output.info('=== Drift to Accept ===');
    output.newline();
    output.info(formatDiffText(diff));
    output.newline();

    // Show summary
    output.info('--- Summary ---');
    output.info(`Severity: ${diff.severity}`);
    if (diff.toolsAdded.length > 0) {
      output.info(`Tools added: ${diff.toolsAdded.join(', ')}`);
    }
    if (diff.toolsRemoved.length > 0) {
      output.warn(`Tools removed: ${diff.toolsRemoved.join(', ')}`);
    }
    if (diff.toolsModified.length > 0) {
      output.info(`Tools modified: ${diff.toolsModified.map((t) => t.tool).join(', ')}`);
    }
    output.info(`Breaking changes: ${diff.breakingCount}`);
    output.info(`Warnings: ${diff.warningCount}`);
    output.info(`Info: ${diff.infoCount}`);
    output.newline();

    // Dry run mode - just show what would happen
    if (options.dryRun) {
      output.info('--- Dry Run Mode ---');
      output.info('Would update baseline with acceptance metadata:');
      output.info(`  Accepted by: ${options.acceptedBy || '(not specified)'}`);
      output.info(`  Reason: ${options.reason || '(not specified)'}`);
      output.info(`  Baseline path: ${baselinePath}`);
      return;
    }

    // For breaking changes without --force, show a warning
    if (diff.severity === 'breaking' && !options.force) {
      output.warn('');
      output.warn('WARNING: This will accept BREAKING changes!');
      output.warn('');
      output.warn('Breaking changes may affect downstream consumers of this MCP server.');
      output.warn('Make sure you have updated any dependent systems accordingly.');
      output.warn('');
      output.warn('To proceed, run again with --force');
      process.exit(EXIT_CODES.ERROR);
    }

    // Accept the drift
    const acceptedBaseline = acceptDrift(currentBaseline, diff, {
      acceptedBy: options.acceptedBy,
      reason: options.reason,
    });

    // Save the updated baseline
    saveBaseline(acceptedBaseline, baselinePath);

    output.success(`Drift accepted and baseline updated: ${baselinePath}`);
    output.newline();

    // Show acceptance details
    output.info('Acceptance recorded:');
    output.info(`  Accepted at: ${acceptedBaseline.acceptance?.acceptedAt}`);
    if (options.acceptedBy) {
      output.info(`  Accepted by: ${options.acceptedBy}`);
    }
    if (options.reason) {
      output.info(`  Reason: ${options.reason}`);
    }
    output.newline();

    output.info('The baseline now reflects the current server state.');
    output.info('Future `bellwether check` runs will compare against this new baseline.');
  });
