/**
 * Diff command for comparing specific versions.
 */

import { Command } from 'commander';
import { EXIT_CODES } from '../../../constants.js';
import { loadConfigOrExit, getSessionTokenOrExit, createAuthenticatedClient, resolveProjectId } from './shared.js';
import * as output from '../../output.js';

export const diffCommand = new Command('diff')
  .description('Compare two baseline versions')
  .argument('<from>', 'From version number')
  .argument('<to>', 'To version number')
  .option('-c, --config <path>', 'Path to config file')
  .option('-p, --project <id>', 'Project ID (uses linked project if not specified)')
  .option('--json', 'Output as JSON')
  .option('--session <session>', 'Session token (overrides stored/env session)')
  .action(async (fromArg: string, toArg: string, options) => {
    const config = loadConfigOrExit(options.config);

    // Get session
    const sessionToken = getSessionTokenOrExit(options.session);

    // Determine project ID
    const projectId = resolveProjectId(undefined, options.project);
    if (!projectId) {
      output.error('No project specified. Use --project <id> or run `bellwether link`.');
      process.exit(EXIT_CODES.ERROR);
    }

    // Parse versions
    const fromVersion = parseInt(fromArg, 10);
    const toVersion = parseInt(toArg, 10);

    if (isNaN(fromVersion) || isNaN(toVersion)) {
      output.error('Invalid version numbers. Provide integers (e.g., `bellwether diff 1 2`).');
      process.exit(EXIT_CODES.ERROR);
    }

    // Create client and fetch diff
    const client = createAuthenticatedClient(sessionToken);

    try {
      const diff = await client.getDiff(projectId, fromVersion, toVersion);

      const outputJson = options.json ? true : config.history.json;
      if (outputJson) {
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
      output.error('Failed to fetch diff: ' + (error instanceof Error ? error.message : String(error)));
      process.exit(EXIT_CODES.ERROR);
    }
  });
