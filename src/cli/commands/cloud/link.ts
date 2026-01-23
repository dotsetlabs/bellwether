/**
 * Link command for connecting current directory to a Bellwether Cloud project.
 */

import { Command } from 'commander';
import { basename } from 'path';
import {
  getLinkedProject,
  saveProjectLink,
  removeProjectLink,
  getActiveTeam,
  getTeamId,
} from '../../../cloud/auth.js';
import type { ProjectLink } from '../../../cloud/types.js';
import { EXIT_CODES } from '../../../constants.js';
import { loadConfigOrExit, getSessionTokenOrExit, createAuthenticatedClient } from './shared.js';
import * as output from '../../output.js';

export const linkCommand = new Command('link')
  .description('Link current directory to a Bellwether Cloud project')
  .argument('[project-id]', 'Project ID to link to (creates new if not specified)')
  .option('-n, --name <name>', 'Project name (for new projects)')
  .option('-c, --command <cmd>', 'Server command (for new projects)')
  .option('--config <path>', 'Path to config file')
  .option('--unlink', 'Remove the project link from current directory')
  .option('--status', 'Show current link status')
  .action(async (projectIdArg: string | undefined, options) => {
    const config = loadConfigOrExit(options.config);

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
    const sessionToken = getSessionTokenOrExit();
    const client = createAuthenticatedClient(sessionToken);

    let project;

    if (projectIdArg) {
      // Link to existing project
      output.info(`Looking up project ${projectIdArg}...`);

      project = await client.getProject(projectIdArg);

      if (!project) {
        output.error(`Project not found: ${projectIdArg}`);
        output.error('\nUse `bellwether link` without an ID to create a new project.');
        process.exit(EXIT_CODES.ERROR);
      }

      output.info(`Found project: ${project.name}`);
    } else {
      // Create new project
      const projectName = options.name ?? inferProjectName();
      const serverCommand = options.command ?? config.link.defaultServerCommand;

      output.info(`Creating project "${projectName}"...`);

      try {
        project = await client.createProject(projectName, serverCommand);
        output.info(`Project created: ${project.id}`);
      } catch (error) {
        output.error('Failed to create project: ' + (error instanceof Error ? error.message : String(error)));
        process.exit(EXIT_CODES.ERROR);
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
    output.info('  bellwether check <server> --save-baseline');
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
