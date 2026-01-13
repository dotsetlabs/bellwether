/**
 * Link command for connecting current directory to an Inquest Cloud project.
 */

import { Command } from 'commander';
import { basename } from 'path';
import {
  getSessionToken,
  getLinkedProject,
  saveProjectLink,
  removeProjectLink,
} from '../../cloud/auth.js';
import { createCloudClient } from '../../cloud/client.js';
import type { ProjectLink } from '../../cloud/types.js';

export const linkCommand = new Command('link')
  .description('Link current directory to an Inquest Cloud project')
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
        console.log('Project link removed.');
      } else {
        console.log('No project link to remove.');
      }
      return;
    }

    // Check authentication
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      console.error('Not authenticated. Run `inquest login` first.');
      process.exit(1);
    }

    const client = createCloudClient({ sessionToken });

    if (!client.isAuthenticated()) {
      console.error('Authentication failed. Run `inquest login` to re-authenticate.');
      process.exit(1);
    }

    let project;

    if (projectIdArg) {
      // Link to existing project
      console.log(`Looking up project ${projectIdArg}...`);

      project = await client.getProject(projectIdArg);

      if (!project) {
        console.error(`Project not found: ${projectIdArg}`);
        console.error('\nUse `inquest link` without an ID to create a new project.');
        process.exit(1);
      }

      console.log(`Found project: ${project.name}`);
    } else {
      // Create new project
      const projectName = options.name ?? inferProjectName();
      const serverCommand = options.command;

      console.log(`Creating project "${projectName}"...`);

      try {
        project = await client.createProject(projectName, serverCommand);
        console.log(`Project created: ${project.id}`);
      } catch (error) {
        console.error(
          'Failed to create project:',
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    }

    // Save link
    const link: ProjectLink = {
      projectId: project.id,
      projectName: project.name,
      linkedAt: new Date().toISOString(),
    };

    saveProjectLink(link);

    console.log(`\nLinked to project: ${project.name}`);
    console.log(`Project ID: ${project.id}`);
    console.log(`Server command: ${project.serverCommand}`);
    console.log('\nSaved to .inquest/link.json');
    console.log('\nYou can now run:');
    console.log('  inquest interview <server> --save-baseline');
    console.log('  inquest upload');
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
    console.log('Not linked to any project.');
    console.log('\nRun `inquest link` to create or link to a project.');
    return;
  }

  console.log('Project Link Status');
  console.log('───────────────────');
  console.log(`Project: ${link.projectName}`);
  console.log(`ID:      ${link.projectId}`);
  console.log(`Linked:  ${new Date(link.linkedAt).toLocaleString()}`);
  console.log(`Config:  .inquest/link.json`);
}

/**
 * Projects command for listing projects.
 */
export const projectsCommand = new Command('projects')
  .description('List Inquest Cloud projects')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      console.error('Not authenticated. Run `inquest login` first.');
      process.exit(1);
    }

    const client = createCloudClient({ sessionToken });

    if (!client.isAuthenticated()) {
      console.error('Authentication failed. Run `inquest login` to re-authenticate.');
      process.exit(1);
    }

    const projects = await client.listProjects();

    if (options.json) {
      console.log(JSON.stringify(projects, null, 2));
      return;
    }

    if (projects.length === 0) {
      console.log('No projects found.');
      console.log('\nRun `inquest link` to create a project.');
      return;
    }

    // Get current link for highlighting
    const currentLink = getLinkedProject();

    console.log('Your Projects\n');
    console.log('ID                    Name                 Baselines  Last Upload');
    console.log('────────────────────  ───────────────────  ─────────  ───────────────────');

    for (const project of projects) {
      const isLinked = currentLink?.projectId === project.id;
      const marker = isLinked ? '* ' : '  ';
      const lastUpload = project.lastUploadAt
        ? new Date(project.lastUploadAt).toLocaleDateString()
        : 'Never';

      console.log(
        `${marker}${project.id.padEnd(20)}  ` +
          `${project.name.slice(0, 19).padEnd(19)}  ` +
          `${project.baselineCount.toString().padStart(9)}  ` +
          `${lastUpload}`
      );
    }

    if (currentLink) {
      console.log('\n* = Currently linked project');
    }
  });
