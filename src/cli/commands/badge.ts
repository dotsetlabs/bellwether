import { Command } from 'commander';
import { createCloudClient } from '../../cloud/client.js';
import { getLinkedProject } from '../../cloud/auth.js';
import { EXIT_CODES } from '../../constants.js';
import * as output from '../output.js';

export const badgeCommand = new Command('badge')
  .description('Get embeddable badge for your project')
  .option('-p, --project <id>', 'Project ID (uses linked project if not specified)')
  .option('--json', 'Output as JSON')
  .option('--markdown', 'Output markdown only')
  .option('--url', 'Output badge URL only')
  .action(async (options) => {
    // Get project ID
    let projectId = options.project;

    if (!projectId) {
      const link = getLinkedProject();
      if (!link) {
        output.error('No project specified and no linked project found.');
        output.error('Run `bellwether link <project>` first or use --project <id>');
        process.exit(EXIT_CODES.ERROR);
      }
      projectId = link.projectId;
    }

    // Create cloud client
    const client = createCloudClient();

    try {
      const badge = await client.getBadgeInfo(projectId);

      if (!badge) {
        output.error(`Project not found: ${projectId}`);
        process.exit(EXIT_CODES.ERROR);
      }

      if (options.json) {
        output.info(JSON.stringify(badge, null, 2));
        return;
      }

      if (options.markdown) {
        output.info(badge.markdown);
        return;
      }

      if (options.url) {
        output.info(badge.badgeUrl);
        return;
      }

      // Default: formatted output
      output.info('');
      output.info(`Project: ${badge.projectName}`);
      output.info(`Status:  ${badge.statusText}`);
      if (badge.lastVerified) {
        output.info(`Verified: ${new Date(badge.lastVerified).toLocaleString()}`);
      }
      if (badge.latestVersion) {
        output.info(`Version: v${badge.latestVersion}`);
      }
      output.info('');
      output.info('Badge URL:');
      output.info(`  ${badge.badgeUrl}`);
      output.info('');
      output.info('Add to your README.md:');
      output.info('');
      output.info(`  ${badge.markdown}`);
      output.info('');
      output.info('Or with HTML:');
      output.info('');
      // Extract base URL from badge URL for consistency
      const baseUrl = badge.badgeUrl.replace(/\/badge\/.*$/, '');
      output.info(`  <a href="${baseUrl}/projects/${projectId}"><img src="${badge.badgeUrl}" alt="Bellwether"></a>`);
      output.info('');
    } catch (error) {
      output.error('Failed to get badge info: ' + (error instanceof Error ? error.message : String(error)));
      process.exit(EXIT_CODES.ERROR);
    }
  });
