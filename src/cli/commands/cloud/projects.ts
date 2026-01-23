/**
 * Projects command for listing projects.
 */

import { Command } from 'commander';
import { getLinkedProject } from '../../../cloud/auth.js';
import { getSessionTokenOrExit, createAuthenticatedClient } from './shared.js';
import * as output from '../../output.js';

export const projectsCommand = new Command('projects')
  .description('List Bellwether Cloud projects')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const sessionToken = getSessionTokenOrExit();
    const client = createAuthenticatedClient(sessionToken);

    const projects = await client.listProjects();

    if (options.json) {
      output.info(JSON.stringify(projects, null, 2));
      return;
    }

    if (projects.length === 0) {
      output.info('No projects found.');
      output.info('\nRun `bellwether link` to create a project.');
      return;
    }

    // Get current link for highlighting
    const currentLink = getLinkedProject();

    output.info('Your Projects\n');
    output.info('ID                    Name                 Baselines  Last Upload');
    output.info('────────────────────  ───────────────────  ─────────  ───────────────────');

    for (const project of projects) {
      const isLinked = currentLink?.projectId === project.id;
      const marker = isLinked ? '* ' : '  ';
      const lastUpload = project.lastUploadAt
        ? new Date(project.lastUploadAt).toLocaleDateString()
        : 'Never';

      output.info(
        `${marker}${project.id.padEnd(20)}  ` +
        `${project.name.slice(0, 19).padEnd(19)}  ` +
        `${project.baselineCount.toString().padStart(9)}  ` +
        `${lastUpload}`
      );
    }

    if (currentLink) {
      output.info('\n* = Currently linked project');
    }
  });
