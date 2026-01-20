/**
 * Baseline commands - manage baselines for drift detection.
 *
 * Subcommands:
 *   - save [path]          Save test results as baseline
 *   - compare <path>       Compare test results against baseline
 *   - show [path]          Display baseline contents
 *   - diff <path1> <path2> Compare two baseline files
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
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
  verifyIntegrity,
} from '../../baseline/index.js';
import { createCloudBaseline } from '../../baseline/converter.js';
import { BaselineVersionError } from '../../baseline/version.js';
import { migrateCommand } from './baseline-migrate.js';
import type { InterviewResult } from '../../interview/types.js';
import { loadConfig, ConfigNotFoundError } from '../../config/loader.js';
import { PATHS } from '../../constants.js';
import * as output from '../output.js';

/**
 * Default paths for baseline files.
 */
const DEFAULT_BASELINE_PATH = PATHS.DEFAULT_BASELINE_FILE;
const DEFAULT_REPORT_PATH = PATHS.DEFAULT_REPORT_FILE;

/**
 * Load interview result from JSON report.
 */
function loadInterviewResult(reportPath: string): InterviewResult {
  if (!existsSync(reportPath)) {
    throw new Error(
      `Test report not found: ${reportPath}\n\n` +
      'Run `bellwether check` first with JSON output enabled.\n' +
      'Configure in bellwether.yaml:\n' +
      '  output:\n' +
      '    format: json  # or "both" for JSON + markdown'
    );
  }

  const content = readFileSync(reportPath, 'utf-8');
  try {
    return JSON.parse(content) as InterviewResult;
  } catch (error) {
    throw new Error(
      `Invalid JSON in report file ${reportPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get the output directory from config or use current directory.
 */
function getOutputDir(configPath?: string): string {
  try {
    const config = loadConfig(configPath);
    return config.output.dir;
  } catch (error) {
    if (error instanceof ConfigNotFoundError) {
      return '.';
    }
    throw error;
  }
}
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
  $ bellwether baseline migrate                 # Upgrade baseline to current format
  $ bellwether baseline migrate --info          # Check if migration is needed
`
  );

baselineCommand.addCommand(migrateCommand);

// baseline save

baselineCommand
  .command('save')
  .description('Save test results as a baseline for drift detection')
  .argument('[path]', 'Output path for baseline file', DEFAULT_BASELINE_PATH)
  .option('-c, --config <path>', 'Path to config file')
  .option('--report <path>', 'Path to test report JSON file')
  .option('--cloud', 'Save in cloud-compatible format')
  .option('--contract', 'Create contract-only baseline (no LLM assertions)')
  .option('-f, --force', 'Overwrite existing baseline without prompting')
  .action(async (baselinePath: string, options) => {
    const outputDir = getOutputDir(options.config);

    // Find the report file
    const reportPath = options.report || join(outputDir, DEFAULT_REPORT_PATH);

    // Load interview result
    let result: InterviewResult;
    try {
      result = loadInterviewResult(reportPath);
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    // Determine baseline path (relative to output dir if not absolute)
    const finalPath = baselinePath.startsWith('/')
      ? baselinePath
      : join(outputDir, baselinePath);

    // Check for existing baseline
    if (existsSync(finalPath) && !options.force) {
      output.error(`Baseline already exists: ${finalPath}`);
      output.error('Use --force to overwrite.');
      process.exit(1);
    }

    // Determine mode
    const mode = options.contract ? 'contract' : 'document';

    // Extract server command from result metadata
    const serverCommand = result.metadata.serverCommand || 'unknown';

    // Create and save baseline
    if (options.cloud) {
      const cloudBaseline = createCloudBaseline(result, serverCommand);
      writeFileSync(finalPath, JSON.stringify(cloudBaseline, null, 2));
      output.success(`Cloud baseline saved: ${finalPath}`);
    } else {
      const baseline = createBaseline(result, serverCommand, mode);
      saveBaseline(baseline, finalPath);
      output.success(`Baseline saved: ${finalPath} (mode: ${mode})`);
    }

    // Show summary
    const assertionCount = result.toolProfiles.reduce(
      (sum, p) => sum + p.behavioralNotes.length + p.limitations.length + p.securityNotes.length,
      0
    );
    output.info(`  Server: ${result.discovery.serverInfo.name} v${result.discovery.serverInfo.version}`);
    output.info(`  Tools: ${result.toolProfiles.length}`);
    output.info(`  Assertions: ${assertionCount}`);
  });

// baseline compare

baselineCommand
  .command('compare')
  .description('Compare test results against a baseline')
  .argument('<baseline-path>', 'Path to baseline file to compare against')
  .option('-c, --config <path>', 'Path to config file')
  .option('--report <path>', 'Path to test report JSON file')
  .option('--format <format>', 'Output format: text, json, markdown, compact', 'text')
  .option('--fail-on-drift', 'Exit with error if drift is detected')
  .option('--ignore-version-mismatch', 'Force comparison even if format versions are incompatible')
  .action(async (baselinePath: string, options) => {
    const outputDir = getOutputDir(options.config);

    // Load baseline
    if (!existsSync(baselinePath)) {
      output.error(`Baseline not found: ${baselinePath}`);
      process.exit(1);
    }

    let previousBaseline;
    try {
      previousBaseline = loadBaseline(baselinePath);
    } catch (error) {
      output.error(`Failed to load baseline: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }

    // Find and load the report file
    const reportPath = options.report || join(outputDir, DEFAULT_REPORT_PATH);
    let result: InterviewResult;
    try {
      result = loadInterviewResult(reportPath);
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    // Create current baseline for comparison
    const serverCommand = result.metadata.serverCommand || 'unknown';
    const mode = previousBaseline.mode || 'document';
    const currentBaseline = createBaseline(result, serverCommand, mode);

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
        output.error('  1. Run: bellwether baseline migrate <baseline-path>');
        output.error('  2. Use: --ignore-version-mismatch (results may be incorrect)');
        process.exit(1);
      }
      throw error;
    }

    // Show version compatibility warning if applicable
    if (diff.versionCompatibility?.warning) {
      output.warn(`Version Warning: ${diff.versionCompatibility.warning}`);
      output.newline();
    }

    // Format and output
    switch (options.format) {
      case 'json':
        console.log(formatDiffJson(diff));
        break;
      case 'markdown':
        console.log(formatDiffMarkdown(diff));
        break;
      case 'compact':
        console.log(formatDiffCompact(diff));
        break;
      default:
        output.info('--- Drift Report ---');
        output.info(formatDiffText(diff));
    }

    // Show summary
    const totalChanges = diff.toolsAdded.length + diff.toolsRemoved.length + diff.toolsModified.length;
    output.newline();
    output.info(`Changes: ${totalChanges} tools affected`);
    output.info(`Severity: ${diff.severity}`);
    if (diff.versionCompatibility) {
      output.info(`Format versions: ${diff.versionCompatibility.sourceVersion} -> ${diff.versionCompatibility.targetVersion}`);
    }

    // Exit with error if drift detected and --fail-on-drift
    if (options.failOnDrift) {
      if (diff.severity === 'breaking') {
        output.error('\nBreaking changes detected!');
        process.exit(1);
      } else if (diff.severity === 'warning') {
        output.warn('\nWarning-level changes detected.');
        process.exit(1);
      }
    }
  });

// baseline show

baselineCommand
  .command('show')
  .description('Display baseline contents')
  .argument('[path]', 'Path to baseline file', DEFAULT_BASELINE_PATH)
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output raw JSON')
  .option('--tools', 'Show only tool fingerprints')
  .option('--assertions', 'Show only assertions')
  .action(async (baselinePath: string, options) => {
    const outputDir = getOutputDir(options.config);

    // Determine full path
    const fullPath = baselinePath.startsWith('/')
      ? baselinePath
      : join(outputDir, baselinePath);

    if (!existsSync(fullPath)) {
      output.error(`Baseline not found: ${fullPath}`);
      output.error('\nRun `bellwether baseline save` to create a baseline.');
      process.exit(1);
    }

    let baseline;
    try {
      baseline = loadBaseline(fullPath);
    } catch (error) {
      output.error(`Failed to load baseline: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }

    // Raw JSON output
    if (options.json) {
      console.log(JSON.stringify(baseline, null, 2));
      return;
    }

    // Formatted output
    output.info('=== Baseline ===');
    output.info(`File: ${fullPath}`);
    output.info(`Format Version: ${baseline.version}`);
    output.info(`Created: ${baseline.createdAt instanceof Date ? baseline.createdAt.toISOString() : baseline.createdAt}`);
    output.info(`Mode: ${baseline.mode || 'document'}`);
    output.info(`Server Command: ${baseline.serverCommand}`);
    output.newline();

    output.info('--- Server ---');
    output.info(`Name: ${baseline.server.name}`);
    output.info(`Version: ${baseline.server.version}`);
    output.info(`Protocol: ${baseline.server.protocolVersion}`);
    output.info(`Capabilities: ${baseline.server.capabilities.join(', ')}`);
    output.newline();

    // Tools
    if (!options.assertions) {
      output.info(`--- Tools (${baseline.tools.length}) ---`);
      for (const tool of baseline.tools) {
        output.info(`\n  ${tool.name}`);
        output.info(`    Description: ${tool.description.slice(0, 80)}${tool.description.length > 80 ? '...' : ''}`);
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
        const existing = byTool.get(assertion.tool) || [];
        existing.push(assertion);
        byTool.set(assertion.tool, existing);
      }

      for (const [tool, assertions] of byTool) {
        output.info(`\n  ${tool}:`);
        for (const a of assertions.slice(0, 5)) {
          const icon = a.isPositive ? '+' : '-';
          output.info(`    [${icon}] ${a.aspect}: ${a.assertion.slice(0, 60)}${a.assertion.length > 60 ? '...' : ''}`);
        }
        if (assertions.length > 5) {
          output.info(`    ... and ${assertions.length - 5} more`);
        }
      }
      output.newline();
    }

    // Workflows
    if (baseline.workflowSignatures && baseline.workflowSignatures.length > 0) {
      output.info(`--- Workflows (${baseline.workflowSignatures.length}) ---`);
      for (const wf of baseline.workflowSignatures) {
        const icon = wf.succeeded ? '\u2713' : '\u2717';
        output.info(`  ${icon} ${wf.name}: ${wf.toolSequence.join(' -> ')}`);
      }
      output.newline();
    }

    // Summary
    output.info('--- Summary ---');
    output.info(baseline.summary.slice(0, 500) + (baseline.summary.length > 500 ? '...' : ''));

    // Integrity check
    output.newline();
    const isValid = verifyIntegrity(baseline);
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
  .option('--format <format>', 'Output format: text, json, markdown, compact', 'text')
  .option('--ignore-version-mismatch', 'Force comparison even if format versions are incompatible')
  .action(async (path1: string, path2: string, options) => {
    // Load both baselines
    if (!existsSync(path1)) {
      output.error(`Baseline not found: ${path1}`);
      process.exit(1);
    }
    if (!existsSync(path2)) {
      output.error(`Baseline not found: ${path2}`);
      process.exit(1);
    }

    let baseline1, baseline2;
    try {
      baseline1 = loadBaseline(path1);
      baseline2 = loadBaseline(path2);
    } catch (error) {
      output.error(`Failed to load baseline: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
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
        output.error('  1. Run: bellwether baseline migrate <baseline-path>');
        output.error('  2. Use: --ignore-version-mismatch (results may be incorrect)');
        process.exit(1);
      }
      throw error;
    }

    // Header
    output.info(`Comparing baselines:`);
    output.info(`  Old: ${basename(path1)} (${baseline1.createdAt instanceof Date ? baseline1.createdAt.toISOString().split('T')[0] : 'unknown'}) [${baseline1.version}]`);
    output.info(`  New: ${basename(path2)} (${baseline2.createdAt instanceof Date ? baseline2.createdAt.toISOString().split('T')[0] : 'unknown'}) [${baseline2.version}]`);
    output.newline();

    // Show version compatibility warning if applicable
    if (diff.versionCompatibility?.warning) {
      output.warn(`Version Warning: ${diff.versionCompatibility.warning}`);
      output.newline();
    }

    // Format and output
    switch (options.format) {
      case 'json':
        console.log(formatDiffJson(diff));
        break;
      case 'markdown':
        console.log(formatDiffMarkdown(diff));
        break;
      case 'compact':
        console.log(formatDiffCompact(diff));
        break;
      default:
        output.info(formatDiffText(diff));
    }

    // Summary
    output.newline();
    output.info(`Severity: ${diff.severity}`);
    output.info(`Tools added: ${diff.toolsAdded.length}`);
    output.info(`Tools removed: ${diff.toolsRemoved.length}`);
    output.info(`Tools modified: ${diff.toolsModified.length}`);
    if (diff.versionCompatibility) {
      output.info(`Format versions: ${diff.versionCompatibility.sourceVersion} -> ${diff.versionCompatibility.targetVersion}`);
    }
  });
