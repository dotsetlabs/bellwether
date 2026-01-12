/**
 * History command for viewing baseline history in Inquest Cloud.
 */

import { Command } from 'commander';
import { getToken, getLinkedProject } from '../../cloud/auth.js';
import { createCloudClient } from '../../cloud/client.js';

export const historyCommand = new Command('history')
  .description('View baseline history for a project')
  .argument('[project-id]', 'Project ID (uses linked project if not specified)')
  .option('-n, --limit <n>', 'Number of versions to show', '10')
  .option('--json', 'Output as JSON')
  .option('--token <token>', 'API token (overrides stored/env token)')
  .action(async (projectIdArg: string | undefined, options) => {
    // Get token
    const token = options.token ?? getToken();
    if (!token) {
      console.error('Not authenticated. Run `inquest login` first.');
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
      console.error('No project specified.');
      console.error('\nEither:');
      console.error('  - Provide a project ID as argument');
      console.error('  - Run `inquest link` to link this directory to a project');
      process.exit(1);
    }

    // Create client and fetch history
    const client = createCloudClient({ token });

    if (!client.isAuthenticated()) {
      console.error('Authentication failed. Run `inquest login` to re-authenticate.');
      process.exit(1);
    }

    const limit = parseInt(options.limit, 10);

    try {
      const history = await client.getHistory(projectId, limit);

      if (options.json) {
        console.log(JSON.stringify(history, null, 2));
        return;
      }

      if (history.length === 0) {
        console.log('No baselines uploaded yet.');
        console.log('\nRun `inquest interview <server> --save-baseline` then `inquest upload`.');
        return;
      }

      // Get project info for display
      const project = await client.getProject(projectId);
      const projectName = project?.name ?? projectId;

      console.log(`Baseline History: ${projectName}`);
      console.log(`Showing ${history.length} version(s)\n`);

      console.log('Ver  Uploaded                 CLI Version  Hash');
      console.log('───  ───────────────────────  ───────────  ────────────────');

      for (const baseline of history) {
        const date = formatDate(baseline.uploadedAt);
        const cliVersion = baseline.cliVersion.padEnd(11);
        const hash = baseline.hash.slice(0, 16);

        console.log(
          `${baseline.version.toString().padStart(3)}  ` +
            `${date.padEnd(23)}  ` +
            `${cliVersion}  ` +
            hash
        );
      }

      // Show diff summary if multiple versions
      if (history.length >= 2) {
        console.log('\nLatest changes:');

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
      console.error('Failed to fetch history:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Format a date string for display.
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Print a diff summary.
 */
function printDiffSummary(diff: {
  severity: string;
  toolsAdded: number;
  toolsRemoved: number;
  toolsModified: number;
  behaviorChanges: number;
}): void {
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
    console.log('  No changes from previous version');
  } else {
    const severityIcon: Record<string, string> = {
      none: '✓',
      info: 'ℹ',
      warning: '⚠',
      breaking: '✗',
    };
    const icon = severityIcon[diff.severity] ?? '?';
    console.log(`  ${icon} ${diff.severity}: ${parts.join(', ')}`);
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
  .option('--token <token>', 'API token (overrides stored/env token)')
  .action(async (fromArg: string, toArg: string, options) => {
    // Get token
    const token = options.token ?? getToken();
    if (!token) {
      console.error('Not authenticated. Run `inquest login` first.');
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
      console.error('No project specified. Use --project <id> or run `inquest link`.');
      process.exit(1);
    }

    // Parse versions
    const fromVersion = parseInt(fromArg, 10);
    const toVersion = parseInt(toArg, 10);

    if (isNaN(fromVersion) || isNaN(toVersion)) {
      console.error('Invalid version numbers. Provide integers (e.g., `inquest diff 1 2`).');
      process.exit(1);
    }

    // Create client and fetch diff
    const client = createCloudClient({ token });

    if (!client.isAuthenticated()) {
      console.error('Authentication failed. Run `inquest login` to re-authenticate.');
      process.exit(1);
    }

    try {
      const diff = await client.getDiff(projectId, fromVersion, toVersion);

      if (options.json) {
        console.log(JSON.stringify(diff, null, 2));
        return;
      }

      console.log(`Comparing v${fromVersion} → v${toVersion}\n`);

      const severityIcon: Record<string, string> = {
        none: '✓',
        info: 'ℹ',
        warning: '⚠',
        breaking: '✗',
      };

      console.log(`Severity: ${severityIcon[diff.severity] ?? '?'} ${diff.severity.toUpperCase()}`);
      console.log('');

      if (diff.toolsAdded > 0) {
        console.log(`Tools added:     +${diff.toolsAdded}`);
      }
      if (diff.toolsRemoved > 0) {
        console.log(`Tools removed:   -${diff.toolsRemoved}`);
      }
      if (diff.toolsModified > 0) {
        console.log(`Tools modified:  ~${diff.toolsModified}`);
      }
      if (diff.behaviorChanges > 0) {
        console.log(`Behavior changes: ${diff.behaviorChanges}`);
      }

      if (
        diff.toolsAdded === 0 &&
        diff.toolsRemoved === 0 &&
        diff.toolsModified === 0 &&
        diff.behaviorChanges === 0
      ) {
        console.log('No changes detected between these versions.');
      }

      if (diff.severity === 'breaking') {
        console.log('\n⚠️  Breaking changes detected!');
        console.log('   Tools were removed or modified in incompatible ways.');
      }
    } catch (error) {
      console.error('Failed to compute diff:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
