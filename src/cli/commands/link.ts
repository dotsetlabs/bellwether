/**
 * Link command for connecting current directory to a Bellwether Cloud project.
 */

import { Command } from 'commander';
import { basename } from 'path';
import {
  getSessionToken,
  getLinkedProject,
  saveProjectLink,
  removeProjectLink,
  getActiveTeam,
  getTeamId,
} from '../../cloud/auth.js';
import { createCloudClient } from '../../cloud/client.js';
import type { ProjectLink } from '../../cloud/types.js';
import * as output from '../output.js';

export const linkCommand = new Command('link')
  .description('Link current directory to a Bellwether Cloud project')
  .argument('[project-id]', 'Project ID to link to (creates new if not specified)')
  .option('-n, --name <name>', 'Project name (for new projects)')
  .option('-c, --command <cmd>', 'Server command (for new projects)', 'node dist/server.js')
  .option('--unlink', 'Remove the project link from current directory')
  .option('--status', 'Show current link status')
  .action(async (projectIdArg: string | undefined, options) => {
    // Handle --status
    if (options.status) {
      showLinkStatus();
      return;
    }

    // Handle --unlink
    if (options.unlink) {
      if (removeProjectLink()) {
        output.info('Project link removed.');
      } else {
        output.info('No project link to remove.');
      }
      return;
    }

    // Check authentication
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      output.error('Not authenticated. Run `bellwether login` first.');
      process.exit(1);
    }

    const client = createCloudClient({ sessionToken });

    if (!client.isAuthenticated()) {
      output.error('Authentication failed. Run `bellwether login` to re-authenticate.');
      process.exit(1);
    }

    let project;

    if (projectIdArg) {
      // Link to existing project
      output.info(`Looking up project ${projectIdArg}...`);

      project = await client.getProject(projectIdArg);

      if (!project) {
        output.error(`Project not found: ${projectIdArg}`);
        output.error('\nUse `bellwether link` without an ID to create a new project.');
        process.exit(1);
      }

      output.info(`Found project: ${project.name}`);
    } else {
      // Create new project
      const projectName = options.name ?? inferProjectName();
      const serverCommand = options.command;

      output.info(`Creating project "${projectName}"...`);

      try {
        project = await client.createProject(projectName, serverCommand);
        output.info(`Project created: ${project.id}`);
      } catch (error) {
        output.error('Failed to create project: ' + (error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    }

    // Get active team for the link
    const activeTeam = getActiveTeam();
    const teamId = getTeamId();

    // Save link with team context
    const link: ProjectLink = {
      projectId: project.id,
      projectName: project.name,
      linkedAt: new Date().toISOString(),
      teamId,
      teamName: activeTeam?.name,
    };

    saveProjectLink(link);

    output.info(`\nLinked to project: ${project.name}`);
    output.info(`Project ID: ${project.id}`);
    if (activeTeam) {
      output.info(`Team: ${activeTeam.name}`);
    }
    output.info(`Server command: ${project.serverCommand}`);
    output.info('\nSaved to .bellwether/link.json');
    output.info('\nYou can now run:');
    output.info('  bellwether test <server> --save-baseline');
    output.info('  bellwether upload');
  });

/**
 * Infer project name from current directory.
 */
function inferProjectName(): string {
  return basename(process.cwd());
}

/**
 * Show current link status.
 */
function showLinkStatus(): void {
  const link = getLinkedProject();

  if (!link) {
    output.info('Not linked to any project.');
    output.info('\nRun `bellwether link` to create or link to a project.');
    return;
  }

  output.info('Project Link Status');
  output.info('───────────────────');
  output.info(`Project: ${link.projectName}`);
  output.info(`ID:      ${link.projectId}`);
  if (link.teamName) {
    output.info(`Team:    ${link.teamName}`);
  }
  if (link.teamId) {
    output.info(`Team ID: ${link.teamId}`);
  }
  output.info(`Linked:  ${new Date(link.linkedAt).toLocaleString()}`);
  output.info(`Config:  .bellwether/link.json`);
}

/**
 * Projects command for listing projects.
 */
export const projectsCommand = new Command('projects')
  .description('List Bellwether Cloud projects')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      output.error('Not authenticated. Run `bellwether login` first.');
      process.exit(1);
    }

    const client = createCloudClient({ sessionToken });

    if (!client.isAuthenticated()) {
      output.error('Authentication failed. Run `bellwether login` to re-authenticate.');
      process.exit(1);
    }

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
