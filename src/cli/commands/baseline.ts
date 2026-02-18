/**
 * Baseline commands - manage baselines for drift detection.
 *
 * Subcommands:
 *   - save [path]          Save test results as baseline
 *   - compare <path>       Compare test results against baseline
 *   - show [path]          Display baseline contents
 *   - diff <path1> <path2> Compare two baseline files
 *   - accept               Accept detected drift as intentional
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  compareBaselines,
  formatDiffText,
  formatDiffJson,
  formatDiffMarkdown,
  formatDiffCompact,
  verifyBaselineHash,
  getBaselineGeneratedAt,
  getBaselineMode,
  getBaselineServerCommand,
  getToolFingerprints,
} from '../../baseline/index.js';
import { BaselineVersionError } from '../../baseline/version.js';
import { EXIT_CODES, MCP } from '../../constants.js';
import { getExcludedFeatureNames } from '../../protocol/index.js';
import { acceptCommand } from './baseline-accept.js';
import * as output from '../output.js';
import { loadConfigOrExit } from '../utils/config-loader.js';
import { loadCheckInterviewResult } from '../utils/report-loader.js';
import {
  resolvePathFromOutputDir,
  resolvePathFromOutputDirOrCwd,
} from '../utils/path-resolution.js';
export const baselineCommand = new Command('baseline')
  .description('Manage baselines for drift detection')
  .addHelpText(
    'after',
    `
Examples:
  $ bellwether baseline save                    # Save baseline from last test
  $ bellwether baseline save ./my-baseline.json # Save to specific path
  $ bellwether baseline compare ./baseline.json # Compare test against baseline
  $ bellwether baseline show                    # Show current baseline
  $ bellwether baseline diff v1.json v2.json    # Compare two baselines
  $ bellwether baseline accept                  # Accept drift as intentional
  $ bellwether baseline accept --reason "Added new feature"
`
  );

baselineCommand.addCommand(acceptCommand);

// baseline save

baselineCommand
  .command('save')
  .description('Save test results as a baseline for drift detection')
  .argument('[path]', 'Output path for baseline file')
  .option('-c, --config <path>', 'Path to config file')
  .option('--report <path>', 'Path to test report JSON file')
  .option('-f, --force', 'Overwrite existing baseline without prompting')
  .action(async (baselinePath: string | undefined, options) => {
    const config = loadConfigOrExit(options.config);
    const outputDir = config.output.dir;
    const defaultBaselinePath = config.baseline.savePath ?? config.baseline.path;
    const resolvedBaselinePath = baselinePath ?? defaultBaselinePath;

    if (!resolvedBaselinePath) {
      output.error(
        'No baseline path provided. Set baseline.path or baseline.savePath in config, or pass a path argument.'
      );
      process.exit(EXIT_CODES.ERROR);
    }

    // Find the report file
    const reportPath = options.report || join(outputDir, config.output.files.checkReport);

    // Load interview result
    let result;
    try {
      result = loadCheckInterviewResult(reportPath, {
        invalidModeMessage: (model) =>
          `Baseline operations only work with check mode results.\n\n` +
          `The report at ${reportPath} was created with explore mode (model: ${model}).\n` +
          `Explore results are for documentation only and cannot be used for baselines.\n\n` +
          'To create a baseline:\n' +
          '  1. Run `bellwether check` to generate a check mode report\n' +
          '  2. Run `bellwether baseline save` to create the baseline',
      });
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.ERROR);
    }

    // Determine baseline path (relative to output dir if not absolute)
    const finalPath = resolvePathFromOutputDir(resolvedBaselinePath, outputDir);

    // Check for existing baseline
    if (existsSync(finalPath) && !options.force) {
      output.error(`Baseline already exists: ${finalPath}`);
      output.error('Use --force to overwrite.');
      process.exit(EXIT_CODES.ERROR);
    }

    // Extract server command from result metadata
    const serverCommand = result.metadata.serverCommand || 'unknown';

    const baseline = createBaseline(result, serverCommand);
    saveBaseline(baseline, finalPath);
    output.success(`Baseline saved: ${finalPath}`);

    // Show summary
    const assertionCount = result.toolProfiles.reduce(
      (sum, p) => sum + p.behavioralNotes.length + p.limitations.length + p.securityNotes.length,
      0
    );
    output.info(
      `  Server: ${result.discovery.serverInfo.name} v${result.discovery.serverInfo.version}`
    );
    output.info(`  Tools: ${result.toolProfiles.length}`);
    output.info(`  Assertions: ${assertionCount}`);
  });

// baseline compare

baselineCommand
  .command('compare')
  .description('Compare test results against a baseline')
  .argument('[baseline-path]', 'Path to baseline file to compare against')
  .option('-c, --config <path>', 'Path to config file')
  .option('--report <path>', 'Path to test report JSON file')
  .option('--format <format>', 'Output format: text, json, markdown, compact')
  .option('--fail-on-drift', 'Exit with error if drift is detected')
  .option('--ignore-version-mismatch', 'Force comparison even if format versions are incompatible')
  .action(async (baselinePath: string | undefined, options) => {
    const config = loadConfigOrExit(options.config);
    const outputDir = config.output.dir;
    const format = options.format ?? config.baseline.outputFormat;
    const failOnDrift = options.failOnDrift ? true : config.baseline.failOnDrift;
    const resolvedBaselinePath =
      baselinePath ?? config.baseline.comparePath ?? config.baseline.path;

    // Load baseline
    if (!resolvedBaselinePath) {
      output.error(
        'No baseline path provided. Set baseline.path or baseline.comparePath in config, or pass a path argument.'
      );
      process.exit(EXIT_CODES.ERROR);
    }

    const fullBaselinePath = resolvePathFromOutputDirOrCwd(resolvedBaselinePath, outputDir);

    if (!existsSync(fullBaselinePath)) {
      output.error(`Baseline not found: ${fullBaselinePath}`);
      output.error('\nRun `bellwether baseline save` to create a baseline.');
      process.exit(EXIT_CODES.ERROR);
    }

    let previousBaseline;
    try {
      previousBaseline = loadBaseline(fullBaselinePath);
    } catch (error) {
      output.error(`Failed to load baseline: ${error instanceof Error ? error.message : error}`);
      process.exit(EXIT_CODES.ERROR);
    }

    // Find and load the report file
    const reportPath = options.report || join(outputDir, config.output.files.checkReport);
    let result;
    try {
      result = loadCheckInterviewResult(reportPath, {
        invalidModeMessage: (model) =>
          `Baseline operations only work with check mode results.\n\n` +
          `The report at ${reportPath} was created with explore mode (model: ${model}).\n` +
          `Explore results are for documentation only and cannot be used for baselines.\n\n` +
          'To create a baseline:\n' +
          '  1. Run `bellwether check` to generate a check mode report\n' +
          '  2. Run `bellwether baseline save` to create the baseline',
      });
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.ERROR);
    }

    // Create current baseline for comparison
    const serverCommand = result.metadata.serverCommand || 'unknown';
    const currentBaseline = createBaseline(result, serverCommand);

    // Compare baselines
    let diff;
    try {
      diff = compareBaselines(previousBaseline, currentBaseline, {
        ignoreVersionMismatch: options.ignoreVersionMismatch,
      });
    } catch (error) {
      if (error instanceof BaselineVersionError) {
        output.error('Version Compatibility Error:');
        output.error(error.message);
        output.error(`\nBaseline version: ${error.sourceVersion}`);
        output.error(`Current version: ${error.targetVersion}`);
        output.error('\nTo fix this, either:');
        output.error('  1. Recreate the baseline with this CLI version');
        output.error('  2. Use: --ignore-version-mismatch (results may be incorrect)');
        process.exit(EXIT_CODES.ERROR);
      }
      throw error;
    }

    // Format and output
    switch (format) {
      case 'json':
        output.info(formatDiffJson(diff));
        break;
      case 'markdown':
        // Show version compatibility warning if applicable
        if (diff.versionCompatibility?.warning) {
          output.warn(`Version Warning: ${diff.versionCompatibility.warning}`);
          output.newline();
        }
        output.info(formatDiffMarkdown(diff));
        break;
      case 'compact':
        // Show version compatibility warning if applicable
        if (diff.versionCompatibility?.warning) {
          output.warn(`Version Warning: ${diff.versionCompatibility.warning}`);
          output.newline();
        }
        output.info(formatDiffCompact(diff));
        break;
      default: {
        // Show version compatibility warning if applicable
        if (diff.versionCompatibility?.warning) {
          output.warn(`Version Warning: ${diff.versionCompatibility.warning}`);
          output.newline();
        }
        output.info('--- Drift Report ---');
        output.info(formatDiffText(diff));

        // Show summary (text format only)
        const totalChanges =
          diff.toolsAdded.length + diff.toolsRemoved.length + diff.toolsModified.length;
        output.newline();
        output.info(`Changes: ${totalChanges} tools affected`);
        output.info(`Severity: ${diff.severity}`);
        if (diff.versionCompatibility) {
          output.info(
            `Format versions: ${diff.versionCompatibility.sourceVersion} -> ${diff.versionCompatibility.targetVersion}`
          );
        }
        break;
      }
    }

    // Exit with error if drift detected and --fail-on-drift
    if (failOnDrift) {
      if (diff.severity === 'breaking') {
        output.error('\nBreaking changes detected!');
        process.exit(EXIT_CODES.ERROR);
      } else if (diff.severity === 'warning') {
        output.warn('\nWarning-level changes detected.');
        process.exit(EXIT_CODES.ERROR);
      }
    }
  });

// baseline show

baselineCommand
  .command('show')
  .description('Display baseline contents')
  .argument('[path]', 'Path to baseline file')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output raw JSON')
  .option('--tools', 'Show only tool fingerprints')
  .option('--assertions', 'Show only assertions')
  .action(async (baselinePath: string | undefined, options) => {
    const config = loadConfigOrExit(options.config);
    const outputDir = config.output.dir;
    const resolvedBaselinePath =
      baselinePath ?? config.baseline.comparePath ?? config.baseline.path;

    if (!resolvedBaselinePath) {
      output.error(
        'No baseline path provided. Set baseline.path or baseline.comparePath in config, or pass a path argument.'
      );
      process.exit(EXIT_CODES.ERROR);
    }

    // Determine full path
    const fullPath = resolvePathFromOutputDirOrCwd(resolvedBaselinePath, outputDir);

    if (!existsSync(fullPath)) {
      output.error(`Baseline not found: ${fullPath}`);
      output.error('\nRun `bellwether baseline save` to create a baseline.');
      process.exit(EXIT_CODES.ERROR);
    }

    let baseline;
    try {
      baseline = loadBaseline(fullPath);
    } catch (error) {
      output.error(`Failed to load baseline: ${error instanceof Error ? error.message : error}`);
      process.exit(EXIT_CODES.ERROR);
    }

    // Raw JSON output
    if (options.json) {
      output.info(JSON.stringify(baseline, null, 2));
      return;
    }

    // Formatted output
    output.info('=== Baseline ===');
    output.info(`File: ${fullPath}`);
    output.info(`Format Version: ${baseline.version}`);
    output.info(`Created: ${getBaselineGeneratedAt(baseline).toISOString()}`);
    output.info(`Mode: ${getBaselineMode(baseline) || 'check'}`);
    output.info(`Server Command: ${getBaselineServerCommand(baseline)}`);
    output.newline();

    output.info('--- Server ---');
    output.info(`Name: ${baseline.server.name}`);
    output.info(`Version: ${baseline.server.version}`);
    output.info(`Protocol: ${baseline.server.protocolVersion}`);
    if (baseline.server.protocolVersion !== MCP.PROTOCOL_VERSION) {
      const excluded = getExcludedFeatureNames(baseline.server.protocolVersion);
      if (excluded.length > 0) {
        output.info(`  Version-gated features excluded: ${excluded.join(', ')}`);
      }
    }
    output.info(`Capabilities: ${baseline.server.capabilities.join(', ')}`);
    output.newline();

    // Tools
    const tools = getToolFingerprints(baseline);
    if (!options.assertions) {
      output.info(`--- Tools (${tools.length}) ---`);
      for (const tool of tools) {
        output.info(`\n  ${tool.name}`);
        output.info(
          `    Description: ${tool.description.slice(0, 80)}${tool.description.length > 80 ? '...' : ''}`
        );
        output.info(`    Schema Hash: ${tool.schemaHash}`);
        if (tool.securityNotes.length > 0) {
          output.info(`    Security Notes: ${tool.securityNotes.length}`);
        }
        if (tool.limitations.length > 0) {
          output.info(`    Limitations: ${tool.limitations.length}`);
        }
      }
      output.newline();
    }

    // Assertions
    if (!options.tools) {
      output.info(`--- Assertions (${baseline.assertions.length}) ---`);
      const byTool = new Map<string, typeof baseline.assertions>();
      for (const assertion of baseline.assertions) {
        const tool = assertion.tool ?? 'server';
        const existing = byTool.get(tool) || [];
        existing.push(assertion);
        byTool.set(tool, existing);
      }

      for (const [tool, assertions] of byTool) {
        output.info(`\n  ${tool}:`);
        for (const a of assertions.slice(0, 5)) {
          output.info(
            `    [${a.type}] ${a.condition.slice(0, 60)}${a.condition.length > 60 ? '...' : ''}`
          );
        }
        if (assertions.length > 5) {
          output.info(`    ... and ${assertions.length - 5} more`);
        }
      }
      output.newline();
    }

    // Workflows
    if (baseline.workflows && baseline.workflows.length > 0) {
      output.info(`--- Workflows (${baseline.workflows.length}) ---`);
      for (const wf of baseline.workflows) {
        const icon = wf.succeeded ? '[PASS]' : '[FAIL]';
        output.info(`  ${icon} ${wf.name}: ${wf.toolSequence.join(' -> ')}`);
      }
      output.newline();
    }

    // Summary
    output.info('--- Summary ---');
    output.info(baseline.summary.slice(0, 500) + (baseline.summary.length > 500 ? '...' : ''));

    // Integrity check
    output.newline();
    const isValid = verifyBaselineHash(baseline);
    if (isValid) {
      output.success('Integrity: Valid');
    } else {
      output.warn('Integrity: INVALID - file may have been modified');
    }
  });

// baseline diff

baselineCommand
  .command('diff')
  .description('Compare two baseline files')
  .argument('<path1>', 'Path to first baseline file')
  .argument('<path2>', 'Path to second baseline file')
  .option('-c, --config <path>', 'Path to config file')
  .option('--format <format>', 'Output format: text, json, markdown, compact')
  .option('--ignore-version-mismatch', 'Force comparison even if format versions are incompatible')
  .action(async (path1: string, path2: string, options) => {
    const config = loadConfigOrExit(options.config);
    const format = options.format ?? config.baseline.outputFormat;
    // Load both baselines
    if (!existsSync(path1)) {
      output.error(`Baseline not found: ${path1}`);
      process.exit(EXIT_CODES.ERROR);
    }
    if (!existsSync(path2)) {
      output.error(`Baseline not found: ${path2}`);
      process.exit(EXIT_CODES.ERROR);
    }

    let baseline1, baseline2;
    try {
      baseline1 = loadBaseline(path1);
      baseline2 = loadBaseline(path2);
    } catch (error) {
      output.error(`Failed to load baseline: ${error instanceof Error ? error.message : error}`);
      process.exit(EXIT_CODES.ERROR);
    }

    // Compare
    let diff;
    try {
      diff = compareBaselines(baseline1, baseline2, {
        ignoreVersionMismatch: options.ignoreVersionMismatch,
      });
    } catch (error) {
      if (error instanceof BaselineVersionError) {
        output.error('Version Compatibility Error:');
        output.error(error.message);
        output.error(`\nBaseline 1 version: ${error.sourceVersion}`);
        output.error(`Baseline 2 version: ${error.targetVersion}`);
        output.error('\nTo fix this, either:');
        output.error('  1. Recreate the baseline with this CLI version');
        output.error('  2. Use: --ignore-version-mismatch (results may be incorrect)');
        process.exit(EXIT_CODES.ERROR);
      }
      throw error;
    }

    // Format and output
    switch (format) {
      case 'json':
        output.info(formatDiffJson(diff));
        break;
      case 'markdown':
        output.info(`Comparing baselines:`);
        output.info(
          `  Old: ${basename(path1)} (${getBaselineGeneratedAt(baseline1).toISOString().split('T')[0]}) [${baseline1.version}]`
        );
        output.info(
          `  New: ${basename(path2)} (${getBaselineGeneratedAt(baseline2).toISOString().split('T')[0]}) [${baseline2.version}]`
        );
        output.newline();
        if (diff.versionCompatibility?.warning) {
          output.warn(`Version Warning: ${diff.versionCompatibility.warning}`);
          output.newline();
        }
        output.info(formatDiffMarkdown(diff));
        break;
      case 'compact':
        output.info(`Comparing baselines:`);
        output.info(
          `  Old: ${basename(path1)} (${getBaselineGeneratedAt(baseline1).toISOString().split('T')[0]}) [${baseline1.version}]`
        );
        output.info(
          `  New: ${basename(path2)} (${getBaselineGeneratedAt(baseline2).toISOString().split('T')[0]}) [${baseline2.version}]`
        );
        output.newline();
        if (diff.versionCompatibility?.warning) {
          output.warn(`Version Warning: ${diff.versionCompatibility.warning}`);
          output.newline();
        }
        output.info(formatDiffCompact(diff));
        break;
      default: {
        output.info(`Comparing baselines:`);
        output.info(
          `  Old: ${basename(path1)} (${getBaselineGeneratedAt(baseline1).toISOString().split('T')[0]}) [${baseline1.version}]`
        );
        output.info(
          `  New: ${basename(path2)} (${getBaselineGeneratedAt(baseline2).toISOString().split('T')[0]}) [${baseline2.version}]`
        );
        output.newline();
        if (diff.versionCompatibility?.warning) {
          output.warn(`Version Warning: ${diff.versionCompatibility.warning}`);
          output.newline();
        }
        output.info(formatDiffText(diff));

        // Summary (text format only)
        output.newline();
        output.info(`Severity: ${diff.severity}`);
        output.info(`Tools added: ${diff.toolsAdded.length}`);
        output.info(`Tools removed: ${diff.toolsRemoved.length}`);
        output.info(`Tools modified: ${diff.toolsModified.length}`);
        if (diff.versionCompatibility) {
          output.info(
            `Format versions: ${diff.versionCompatibility.sourceVersion} -> ${diff.versionCompatibility.targetVersion}`
          );
        }
        break;
      }
    }
  });
