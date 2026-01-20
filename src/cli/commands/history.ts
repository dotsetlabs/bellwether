/**
 * History command for viewing baseline history in Bellwether Cloud.
 */

import { Command } from 'commander';
import { getSessionToken, getLinkedProject } from '../../cloud/auth.js';
import { createCloudClient } from '../../cloud/client.js';
import { formatDateLocale } from '../../utils/index.js';
import * as output from '../output.js';
import { getSeverityIcon, type DiffSummary } from '../output.js';

export const historyCommand = new Command('history')
  .description('View baseline history for a project')
  .argument('[project-id]', 'Project ID (uses linked project if not specified)')
  .option('-n, --limit <n>', 'Number of versions to show', '10')
  .option('--json', 'Output as JSON')
  .option('--session <session>', 'Session token (overrides stored/env session)')
  .action(async (projectIdArg: string | undefined, options) => {
    // Get session
    const sessionToken = options.session ?? getSessionToken();
    if (!sessionToken) {
      output.error('Not authenticated. Run `bellwether login` first.');
      process.exit(1);
    }

    // Determine project ID
    let projectId = projectIdArg;

    if (!projectId) {
      const link = getLinkedProject();
      if (link) {
        projectId = link.projectId;
      }
    }

    if (!projectId) {
      output.error('No project specified.');
      output.error('\nEither:');
      output.error('  - Provide a project ID as argument');
      output.error('  - Run `bellwether link` to link this directory to a project');
      process.exit(1);
    }

    // Create client and fetch history
    const client = createCloudClient({ sessionToken });

    if (!client.isAuthenticated()) {
      output.error('Authentication failed. Run `bellwether login` to re-authenticate.');
      process.exit(1);
    }

    const limit = parseInt(options.limit, 10);

    try {
      const history = await client.getHistory(projectId, limit);

      if (options.json) {
        output.info(JSON.stringify(history, null, 2));
        return;
      }

      if (history.length === 0) {
        output.info('No baselines uploaded yet.');
        output.info('\nRun `bellwether check <server> --save-baseline` then `bellwether upload`.');
        return;
      }

      // Get project info for display
      const project = await client.getProject(projectId);
      const projectName = project?.name ?? projectId;

      output.info(`Baseline History: ${projectName}`);
      output.info(`Showing ${history.length} version(s)\n`);

      output.info('Ver  Uploaded                 CLI Version  Hash');
      output.info('───  ───────────────────────  ───────────  ────────────────');

      for (const baseline of history) {
        const date = formatDateLocale(baseline.uploadedAt);
        const cliVersion = baseline.cliVersion.padEnd(11);
        const hash = baseline.hash.slice(0, 16);

        output.info(
          `${baseline.version.toString().padStart(3)}  ` +
            `${date.padEnd(23)}  ` +
            `${cliVersion}  ` +
            hash
        );
      }

      // Show diff summary if multiple versions
      if (history.length >= 2) {
        output.info('\nLatest changes:');

        try {
          const diff = await client.getLatestDiff(projectId);
          if (diff) {
            printDiffSummary(diff);
          }
        } catch {
          // Diff failed, just skip
        }
      }
    } catch (error) {
      output.error('Failed to fetch history: ' + (error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });


/**
 * Print a diff summary (compact format).
 */
function printDiffSummary(diff: DiffSummary): void {
  const parts: string[] = [];

  if (diff.toolsAdded > 0) {
    parts.push(`+${diff.toolsAdded} tools`);
  }
  if (diff.toolsRemoved > 0) {
    parts.push(`-${diff.toolsRemoved} tools`);
  }
  if (diff.toolsModified > 0) {
    parts.push(`~${diff.toolsModified} modified`);
  }
  if (diff.behaviorChanges > 0) {
    parts.push(`${diff.behaviorChanges} behavior changes`);
  }

  if (parts.length === 0) {
    output.info('  No changes from previous version');
  } else {
    const icon = getSeverityIcon(diff.severity);
    output.info(`  ${icon} ${diff.severity}: ${parts.join(', ')}`);
  }
}

/**
 * Diff command for comparing specific versions.
 */
export const diffCommand = new Command('diff')
  .description('Compare two baseline versions')
  .argument('<from>', 'From version number')
  .argument('<to>', 'To version number')
  .option('-p, --project <id>', 'Project ID (uses linked project if not specified)')
  .option('--json', 'Output as JSON')
  .option('--session <session>', 'Session token (overrides stored/env session)')
  .action(async (fromArg: string, toArg: string, options) => {
    // Get session
    const sessionToken = options.session ?? getSessionToken();
    if (!sessionToken) {
      output.error('Not authenticated. Run `bellwether login` first.');
      process.exit(1);
    }

    // Determine project ID
    let projectId = options.project;

    if (!projectId) {
      const link = getLinkedProject();
      if (link) {
        projectId = link.projectId;
      }
    }

    if (!projectId) {
      output.error('No project specified. Use --project <id> or run `bellwether link`.');
      process.exit(1);
    }

    // Parse versions
    const fromVersion = parseInt(fromArg, 10);
    const toVersion = parseInt(toArg, 10);

    if (isNaN(fromVersion) || isNaN(toVersion)) {
      output.error('Invalid version numbers. Provide integers (e.g., `bellwether diff 1 2`).');
      process.exit(1);
    }

    // Create client and fetch diff
    const client = createCloudClient({ sessionToken });

    if (!client.isAuthenticated()) {
      output.error('Authentication failed. Run `bellwether login` to re-authenticate.');
      process.exit(1);
    }

    try {
      const diff = await client.getDiff(projectId, fromVersion, toVersion);

      if (options.json) {
        output.info(JSON.stringify(diff, null, 2));
        return;
      }

      output.info(`Comparing v${fromVersion} → v${toVersion}\n`);

      const severityIcon: Record<string, string> = {
        none: '✓',
        info: 'ℹ',
        warning: '⚠',
        breaking: '✗',
      };

      output.info(`Severity: ${severityIcon[diff.severity] ?? '?'} ${diff.severity.toUpperCase()}`);
      output.info('');

      if (diff.toolsAdded > 0) {
        output.info(`Tools added:     +${diff.toolsAdded}`);
      }
      if (diff.toolsRemoved > 0) {
        output.info(`Tools removed:   -${diff.toolsRemoved}`);
      }
      if (diff.toolsModified > 0) {
        output.info(`Tools modified:  ~${diff.toolsModified}`);
      }
      if (diff.behaviorChanges > 0) {
        output.info(`Behavior changes: ${diff.behaviorChanges}`);
      }

      if (
        diff.toolsAdded === 0 &&
        diff.toolsRemoved === 0 &&
        diff.toolsModified === 0 &&
        diff.behaviorChanges === 0
      ) {
        output.info('No changes detected between these versions.');
      }

      if (diff.severity === 'breaking') {
        output.info('\n⚠️  Breaking changes detected!');
        output.info('   Tools were removed or modified in incompatible ways.');
      }
    } catch (error) {
      output.error('Failed to compute diff: ' + (error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
