/**
 * Upload command for uploading baselines to Bellwether Cloud.
 *
 * Can read baseline path from bellwether.yaml config.
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getLinkedProject } from '../../../cloud/auth.js';
import { loadBaseline } from '../../../baseline/saver.js';
import { convertToCloudBaseline } from '../../../baseline/converter.js';
import type { BellwetherBaseline } from '../../../cloud/types.js';
import { EXIT_CODES } from '../../../constants.js';
import * as output from '../../output.js';
import { getSeverityIcon, type DiffSummary } from '../../output.js';
import { loadConfigOrExit, getSessionTokenOrExit, createAuthenticatedClient } from './shared.js';

function resolveBaselinePath(pathValue: string, outputDir: string): string {
  return pathValue.startsWith('/') ? pathValue : join(outputDir, pathValue);
}

export const uploadCommand = new Command('upload')
  .description('Upload a baseline to Bellwether Cloud')
  .argument('[baseline]', 'Path to baseline JSON file (defaults to baseline.path in config)')
  .option('-b, --baseline <path>', 'Path to baseline JSON file')
  .option('-c, --config <path>', 'Path to config file')
  .option('-p, --project <id>', 'Project ID to upload to (uses linked project if not specified)')
  .option('--ci', 'CI mode - output URL only, exit 1 on breaking drift')
  .option('--session <session>', 'Session token (overrides stored/env session)')
  .option('--fail-on-drift', 'Exit with error if any behavioral drift detected')
  .action(async (baselineArg: string | undefined, options) => {
    // Get config settings
    const config = loadConfigOrExit(options.config);
    const outputDir = config.output.dir;

    // Determine baseline path with priority:
    // 1. Positional argument
    // 2. --baseline flag
    // 3. baseline.path from config
    let baselinePath = baselineArg ?? options.baseline;
    if (!baselinePath) {
      baselinePath = resolveBaselinePath(config.baseline.path, outputDir);
    }
    const isCiMode = options.ci;

    // Get session
    const sessionToken = getSessionTokenOrExit(
      options.session,
      isCiMode ? 'BELLWETHER_SESSION not set' : 'Not authenticated. Run `bellwether login` first or set BELLWETHER_SESSION.'
    );

    // Check baseline file exists
    if (!existsSync(baselinePath)) {
      if (isCiMode) {
        output.error(`Baseline not found: ${baselinePath}`);
        process.exit(EXIT_CODES.ERROR);
      }
      output.error(`Baseline file not found: ${baselinePath}`);
      output.error('\nCreate a baseline first:');
      output.error('  1. Run `bellwether check` (with output.format: json in config)');
      output.error('  2. Run `bellwether baseline save`');
      process.exit(EXIT_CODES.ERROR);
    }

    // Determine project ID
    let projectId = options.project;

    if (!projectId) {
      const link = getLinkedProject();
      if (link) {
        projectId = link.projectId;
        if (!isCiMode) {
          output.info(`Using linked project: ${link.projectName}`);
        }
      }
    }

    if (!projectId) {
      if (isCiMode) {
        output.error('No project specified');
        process.exit(EXIT_CODES.ERROR);
      }
      output.error('No project specified.');
      output.error('\nEither:');
      output.error('  - Use --project <id> to specify a project');
      output.error('  - Run `bellwether link` to link this directory to a project');
      process.exit(EXIT_CODES.ERROR);
    }

    // Load and convert baseline
    let cloudBaseline: BellwetherBaseline;

    try {
      // Try loading as cloud baseline first
      const content = readFileSync(baselinePath, 'utf-8');
      const parsed = JSON.parse(content);

      if (parsed.version === '1.0' && parsed.metadata?.formatVersion === '1.0') {
        // Already in cloud format
        cloudBaseline = parsed as BellwetherBaseline;
      } else {
        // Convert from local format
        const localBaseline = loadBaseline(baselinePath);
        cloudBaseline = convertToCloudBaseline(localBaseline);
      }
    } catch (error) {
      if (isCiMode) {
        output.error(`Failed to load baseline: ${error instanceof Error ? error.message : error}`);
        process.exit(EXIT_CODES.ERROR);
      }
      output.error('Failed to load baseline: ' + (error instanceof Error ? error.message : String(error)));
      process.exit(EXIT_CODES.ERROR);
    }

    // Create client and upload
    const client = createAuthenticatedClient(
      sessionToken,
      isCiMode ? 'Authentication failed' : 'Authentication failed. Run `bellwether login` to re-authenticate.'
    );

    if (!isCiMode) {
      output.info(`Uploading baseline to project ${projectId}...`);
    }

    try {
      const result = await client.uploadBaseline(projectId, cloudBaseline);

      if (isCiMode) {
        // CI mode - minimal output
        output.info(result.viewUrl);

        // Check for drift
        if (result.version > 1) {
          const diff = await client.getLatestDiff(projectId);

          if (diff) {
            if (diff.severity === 'breaking') {
              output.error('Breaking changes detected');
              process.exit(EXIT_CODES.ERROR);
            }

            if (options.failOnDrift && diff.severity !== 'none') {
              output.error(`Behavioral drift detected: ${diff.severity}`);
              process.exit(EXIT_CODES.ERROR);
            }
          }
        }
      } else {
        // Interactive mode - detailed output
        output.info(`\nUpload successful!`);
        output.info(`Version: ${result.version}`);
        output.info(`View:    ${result.viewUrl}`);

        if (result.diffUrl) {
          output.info(`Diff:    ${result.diffUrl}`);

          // Show diff summary
          const diff = await client.getLatestDiff(projectId);
          if (diff) {
            output.info('\nChanges from previous version:');
            printDiffSummary(diff);

            if (diff.severity === 'breaking') {
              output.info('\n⚠️  Breaking changes detected!');
            }
          }
        } else {
          output.info('\nThis is the first baseline for this project.');
        }
      }
    } catch (error) {
      if (isCiMode) {
        output.error(`Upload failed: ${error instanceof Error ? error.message : error}`);
        process.exit(EXIT_CODES.ERROR);
      }
      output.error('Upload failed: ' + (error instanceof Error ? error.message : String(error)));
      process.exit(EXIT_CODES.ERROR);
    }
  });

/**
 * Print a diff summary in human-readable format (verbose format).
 */
function printDiffSummary(diff: DiffSummary): void {
  output.info(`  Severity: ${getSeverityIcon(diff.severity)} ${diff.severity}`);

  if (diff.toolsAdded > 0) {
    output.info(`  Tools added: +${diff.toolsAdded}`);
  }
  if (diff.toolsRemoved > 0) {
    output.info(`  Tools removed: -${diff.toolsRemoved}`);
  }
  if (diff.toolsModified > 0) {
    output.info(`  Tools modified: ~${diff.toolsModified}`);
  }
  if (diff.behaviorChanges > 0) {
    output.info(`  Behavior changes: ${diff.behaviorChanges}`);
  }

  if (
    diff.toolsAdded === 0 &&
    diff.toolsRemoved === 0 &&
    diff.toolsModified === 0 &&
    diff.behaviorChanges === 0
  ) {
    output.info('  No changes detected');
  }
}
