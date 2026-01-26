/**
 * History command for viewing baseline history in Bellwether Cloud.
 */

import { Command } from 'commander';
import { formatDateLocale } from '../../../utils/index.js';
import { EXIT_CODES } from '../../../constants.js';
import { getSeverityIcon, type DiffSummary } from '../../output.js';
import { loadConfigOrExit, getSessionTokenOrExit, createAuthenticatedClient, resolveProjectId } from './shared.js';
import * as output from '../../output.js';

export const historyCommand = new Command('history')
  .description('View baseline history for a project')
  .argument('[project-id]', 'Project ID (uses linked project if not specified)')
  .option('-c, --config <path>', 'Path to config file')
  .option('-n, --limit <n>', 'Number of versions to show')
  .option('--json', 'Output as JSON')
  .option('--session <session>', 'Session token (overrides stored/env session)')
  .action(async (projectIdArg: string | undefined, options) => {
    const config = loadConfigOrExit(options.config);

    // Get session
    const sessionToken = getSessionTokenOrExit(options.session);

    // Determine project ID
    const projectId = resolveProjectId(projectIdArg);
    if (!projectId) {
      output.error('No project specified.');
      output.error('\nEither:');
      output.error('  - Provide a project ID as argument');
      output.error('  - Run `bellwether link` to link this directory to a project');
      process.exit(EXIT_CODES.ERROR);
    }

    // Create client and fetch history
    const client = createAuthenticatedClient(sessionToken);

    const limit = parseInt(options.limit ?? String(config.history.limit), 10);

    try {
      const history = await client.getHistory(projectId, limit);

      const outputJson = options.json ? true : config.history.json;
      if (outputJson) {
        output.info(JSON.stringify(history, null, 2));
        return;
      }

      if (history.length === 0) {
        output.info('No baselines uploaded yet.');
        output.info('\nRun `bellwether check <server>`, then `bellwether baseline save`, then `bellwether upload`.');
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
      process.exit(EXIT_CODES.ERROR);
    }
  });

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
