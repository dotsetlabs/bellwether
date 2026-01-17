/**
 * Upload command for uploading baselines to Bellwether Cloud.
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { getSessionToken, getLinkedProject } from '../../cloud/auth.js';
import { createCloudClient } from '../../cloud/client.js';
import { loadBaseline } from '../../baseline/saver.js';
import { convertToCloudBaseline } from '../../baseline/converter.js';
import type { BellwetherBaseline } from '../../cloud/types.js';
import * as output from '../output.js';

/**
 * Default baseline file name.
 */
const DEFAULT_BASELINE_FILE = 'bellwether-baseline.json';

export const uploadCommand = new Command('upload')
  .description('Upload a baseline to Bellwether Cloud')
  .argument('[baseline]', `Path to baseline JSON file (default: ${DEFAULT_BASELINE_FILE})`)
  .option('-p, --project <id>', 'Project ID to upload to (uses linked project if not specified)')
  .option('--ci', 'CI mode - output URL only, exit 1 on breaking drift')
  .option('--session <session>', 'Session token (overrides stored/env session)')
  .option('--fail-on-drift', 'Exit with error if any behavioral drift detected')
  .action(async (baselineArg: string | undefined, options) => {
    const baselinePath = baselineArg ?? DEFAULT_BASELINE_FILE;
    const isCiMode = options.ci;

    // Get session
    const sessionToken = options.session ?? getSessionToken();
    if (!sessionToken) {
      if (isCiMode) {
        output.error('BELLWETHER_SESSION not set');
        process.exit(1);
      }
      output.error('Not authenticated. Run `bellwether login` first or set BELLWETHER_SESSION.');
      process.exit(1);
    }

    // Check baseline file exists
    if (!existsSync(baselinePath)) {
      if (isCiMode) {
        output.error(`Baseline not found: ${baselinePath}`);
        process.exit(1);
      }
      output.error(`Baseline file not found: ${baselinePath}`);
      output.error('\nRun `bellwether interview <server> --save-baseline` first.');
      process.exit(1);
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
        process.exit(1);
      }
      output.error('No project specified.');
      output.error('\nEither:');
      output.error('  - Use --project <id> to specify a project');
      output.error('  - Run `bellwether link` to link this directory to a project');
      process.exit(1);
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
        process.exit(1);
      }
      output.error('Failed to load baseline: ' + (error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }

    // Create client and upload
    const client = createCloudClient({ sessionToken });

    if (!client.isAuthenticated()) {
      if (isCiMode) {
        output.error('Authentication failed');
        process.exit(1);
      }
      output.error('Authentication failed. Run `bellwether login` to re-authenticate.');
      process.exit(1);
    }

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
              process.exit(1);
            }

            if (options.failOnDrift && diff.severity !== 'none') {
              output.error(`Behavioral drift detected: ${diff.severity}`);
              process.exit(1);
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
        process.exit(1);
      }
      output.error('Upload failed: ' + (error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Print a diff summary in human-readable format.
 */
function printDiffSummary(diff: {
  severity: string;
  toolsAdded: number;
  toolsRemoved: number;
  toolsModified: number;
  behaviorChanges: number;
}): void {
  const severityIcon: Record<string, string> = {
    none: '✓',
    info: 'ℹ',
    warning: '⚠',
    breaking: '✗',
  };

  output.info(`  Severity: ${severityIcon[diff.severity] ?? '?'} ${diff.severity}`);

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
