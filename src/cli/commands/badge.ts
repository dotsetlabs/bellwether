import { Command } from 'commander';
import { createCloudClient } from '../../cloud/client.js';
import { getLinkedProject } from '../../cloud/auth.js';

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
        console.error('No project specified and no linked project found.');
        console.error('Run `bellwether link <project>` first or use --project <id>');
        process.exit(1);
      }
      projectId = link.projectId;
    }

    // Create cloud client
    const client = createCloudClient();

    try {
      const badge = await client.getBadgeInfo(projectId);

      if (!badge) {
        console.error(`Project not found: ${projectId}`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(badge, null, 2));
        return;
      }

      if (options.markdown) {
        console.log(badge.markdown);
        return;
      }

      if (options.url) {
        console.log(badge.badgeUrl);
        return;
      }

      // Default: formatted output
      console.log('');
      console.log(`Project: ${badge.projectName}`);
      console.log(`Status:  ${badge.statusText}`);
      if (badge.lastVerified) {
        console.log(`Verified: ${new Date(badge.lastVerified).toLocaleString()}`);
      }
      if (badge.latestVersion) {
        console.log(`Version: v${badge.latestVersion}`);
      }
      console.log('');
      console.log('Badge URL:');
      console.log(`  ${badge.badgeUrl}`);
      console.log('');
      console.log('Add to your README.md:');
      console.log('');
      console.log(`  ${badge.markdown}`);
      console.log('');
      console.log('Or with HTML:');
      console.log('');
      console.log(`  <a href="https://bellwether.sh/projects/${projectId}"><img src="${badge.badgeUrl}" alt="Bellwether"></a>`);
      console.log('');
    } catch (error) {
      console.error('Failed to get badge info:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
