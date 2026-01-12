/**
 * Upload command for uploading baselines to Inquest Cloud.
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { getToken, getLinkedProject } from '../../cloud/auth.js';
import { createCloudClient } from '../../cloud/client.js';
import { loadBaseline } from '../../baseline/saver.js';
import { convertToCloudBaseline } from '../../baseline/converter.js';
import type { InquestBaseline } from '../../cloud/types.js';

/**
 * Default baseline file name.
 */
const DEFAULT_BASELINE_FILE = 'inquest-baseline.json';

export const uploadCommand = new Command('upload')
  .description('Upload a baseline to Inquest Cloud')
  .argument('[baseline]', `Path to baseline JSON file (default: ${DEFAULT_BASELINE_FILE})`)
  .option('-p, --project <id>', 'Project ID to upload to (uses linked project if not specified)')
  .option('--public', 'Make baseline publicly viewable')
  .option('--ci', 'CI mode - output URL only, exit 1 on breaking drift')
  .option('--token <token>', 'API token (overrides stored/env token)')
  .option('--fail-on-drift', 'Exit with error if any behavioral drift detected')
  .action(async (baselineArg: string | undefined, options) => {
    const baselinePath = baselineArg ?? DEFAULT_BASELINE_FILE;
    const isCiMode = options.ci;

    // Get token
    const token = options.token ?? getToken();
    if (!token) {
      if (isCiMode) {
        console.error('INQUEST_TOKEN not set');
        process.exit(1);
      }
      console.error('Not authenticated. Run `inquest login` first or set INQUEST_TOKEN.');
      process.exit(1);
    }

    // Check baseline file exists
    if (!existsSync(baselinePath)) {
      if (isCiMode) {
        console.error(`Baseline not found: ${baselinePath}`);
        process.exit(1);
      }
      console.error(`Baseline file not found: ${baselinePath}`);
      console.error('\nRun `inquest interview <server> --save-baseline` first.');
      process.exit(1);
    }

    // Determine project ID
    let projectId = options.project;

    if (!projectId) {
      const link = getLinkedProject();
      if (link) {
        projectId = link.projectId;
        if (!isCiMode) {
          console.log(`Using linked project: ${link.projectName}`);
        }
      }
    }

    if (!projectId) {
      if (isCiMode) {
        console.error('No project specified');
        process.exit(1);
      }
      console.error('No project specified.');
      console.error('\nEither:');
      console.error('  - Use --project <id> to specify a project');
      console.error('  - Run `inquest link` to link this directory to a project');
      process.exit(1);
    }

    // Load and convert baseline
    let cloudBaseline: InquestBaseline;

    try {
      // Try loading as cloud baseline first
      const content = readFileSync(baselinePath, 'utf-8');
      const parsed = JSON.parse(content);

      if (parsed.version === '1.0' && parsed.metadata?.formatVersion === '1.0') {
        // Already in cloud format
        cloudBaseline = parsed as InquestBaseline;
      } else {
        // Convert from local format
        const localBaseline = loadBaseline(baselinePath);
        cloudBaseline = convertToCloudBaseline(localBaseline);
      }
    } catch (error) {
      if (isCiMode) {
        console.error(`Failed to load baseline: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
      console.error('Failed to load baseline:', error instanceof Error ? error.message : error);
      process.exit(1);
    }

    // Create client and upload
    const client = createCloudClient({ token });

    if (!client.isAuthenticated()) {
      if (isCiMode) {
        console.error('Authentication failed');
        process.exit(1);
      }
      console.error('Authentication failed. Run `inquest login` to re-authenticate.');
      process.exit(1);
    }

    if (!isCiMode) {
      console.log(`Uploading baseline to project ${projectId}...`);
    }

    try {
      const result = await client.uploadBaseline(projectId, cloudBaseline, {
        public: options.public,
      });

      if (isCiMode) {
        // CI mode - minimal output
        console.log(result.viewUrl);

        // Check for drift
        if (result.version > 1) {
          const diff = await client.getLatestDiff(projectId);

          if (diff) {
            if (diff.severity === 'breaking') {
              console.error('Breaking changes detected');
              process.exit(1);
            }

            if (options.failOnDrift && diff.severity !== 'none') {
              console.error(`Behavioral drift detected: ${diff.severity}`);
              process.exit(1);
            }
          }
        }
      } else {
        // Interactive mode - detailed output
        console.log(`\nUpload successful!`);
        console.log(`Version: ${result.version}`);
        console.log(`View:    ${result.viewUrl}`);

        if (result.diffUrl) {
          console.log(`Diff:    ${result.diffUrl}`);

          // Show diff summary
          const diff = await client.getLatestDiff(projectId);
          if (diff) {
            console.log('\nChanges from previous version:');
            printDiffSummary(diff);

            if (diff.severity === 'breaking') {
              console.log('\n⚠️  Breaking changes detected!');
            }
          }
        } else {
          console.log('\nThis is the first baseline for this project.');
        }
      }
    } catch (error) {
      if (isCiMode) {
        console.error(`Upload failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
      console.error('Upload failed:', error instanceof Error ? error.message : error);
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

  console.log(`  Severity: ${severityIcon[diff.severity] ?? '?'} ${diff.severity}`);

  if (diff.toolsAdded > 0) {
    console.log(`  Tools added: +${diff.toolsAdded}`);
  }
  if (diff.toolsRemoved > 0) {
    console.log(`  Tools removed: -${diff.toolsRemoved}`);
  }
  if (diff.toolsModified > 0) {
    console.log(`  Tools modified: ~${diff.toolsModified}`);
  }
  if (diff.behaviorChanges > 0) {
    console.log(`  Behavior changes: ${diff.behaviorChanges}`);
  }

  if (
    diff.toolsAdded === 0 &&
    diff.toolsRemoved === 0 &&
    diff.toolsModified === 0 &&
    diff.behaviorChanges === 0
  ) {
    console.log('  No changes detected');
  }
}
