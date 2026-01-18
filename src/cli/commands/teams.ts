/**
 * Teams command for managing team selection in Bellwether Cloud.
 *
 * Allows users to list their teams and switch the active team for API requests.
 */

import { Command } from 'commander';
import {
  getStoredSession,
  getSessionTeams,
  setActiveTeam,
  getTeamId,
  TEAM_ID_ENV_VAR,
} from '../../cloud/auth.js';
import * as output from '../output.js';

export const teamsCommand = new Command('teams')
  .description('Manage team selection for cloud operations')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    // List teams by default
    const session = getStoredSession();

    if (!session) {
      output.error('Not logged in.');
      output.error('Run `bellwether login` first.');
      process.exit(1);
    }

    const teams = getSessionTeams();

    if (teams.length === 0) {
      output.warn('No teams found in session.');
      output.info('Try logging out and back in: `bellwether login --logout && bellwether login`');
      return;
    }

    // Check for env var override
    const envTeamId = process.env[TEAM_ID_ENV_VAR];
    const effectiveTeamId = getTeamId();

    if (options.json) {
      output.info(JSON.stringify({
        teams,
        activeTeamId: session.activeTeamId,
        effectiveTeamId,
        envOverride: envTeamId || null,
      }, null, 2));
      return;
    }

    output.info('Your Teams');
    output.info('-----------');

    for (const team of teams) {
      const isActive = team.id === session.activeTeamId;
      const isEffective = team.id === effectiveTeamId;
      const markers: string[] = [];

      if (isActive) markers.push('active');
      if (envTeamId && isEffective) markers.push('env override');

      const suffix = markers.length > 0 ? ` (${markers.join(', ')})` : '';
      const roleStr = `[${team.role}]`;

      output.info(`  ${isEffective ? '>' : ' '} ${team.name} ${roleStr} - ${team.plan}${suffix}`);
      output.info(`      ID: ${team.id}`);
    }

    if (envTeamId) {
      output.info(`\nNote: ${TEAM_ID_ENV_VAR} is set, overriding session team.`);
    }

    if (teams.length > 1) {
      output.info('\nUse `bellwether teams switch <team-id>` to change active team.');
    }
  });

// Subcommand: switch
teamsCommand
  .command('switch [team-id]')
  .description('Switch to a different team')
  .action(async (teamIdArg?: string) => {
    const session = getStoredSession();

    if (!session) {
      output.error('Not logged in.');
      output.error('Run `bellwether login` first.');
      process.exit(1);
    }

    const teams = getSessionTeams();

    if (teams.length === 0) {
      output.warn('No teams found in session.');
      output.info('Try logging out and back in: `bellwether login --logout && bellwether login`');
      return;
    }

    if (teams.length === 1) {
      output.info(`You only have access to one team: ${teams[0].name}`);
      return;
    }

    const targetTeamId = teamIdArg;

    // If no team ID provided, show interactive selection
    if (!targetTeamId) {
      output.info('Select a team:\n');

      for (let i = 0; i < teams.length; i++) {
        const team = teams[i];
        const isActive = team.id === session.activeTeamId;
        const marker = isActive ? ' (current)' : '';
        output.info(`  ${i + 1}. ${team.name} [${team.role}]${marker}`);
        output.info(`     ID: ${team.id}`);
      }

      output.info('\nRun `bellwether teams switch <team-id>` with a team ID from above.');
      return;
    }

    // Find the target team
    const targetTeam = teams.find(t => t.id === targetTeamId || t.name.toLowerCase() === targetTeamId.toLowerCase());

    if (!targetTeam) {
      output.error(`Team not found: ${targetTeamId}`);
      output.error('\nAvailable teams:');
      for (const team of teams) {
        output.error(`  - ${team.name} (${team.id})`);
      }
      process.exit(1);
    }

    // Check if already active
    if (targetTeam.id === session.activeTeamId) {
      output.info(`Already using team: ${targetTeam.name}`);
      return;
    }

    // Switch team
    const success = setActiveTeam(targetTeam.id);

    if (success) {
      output.info(`Switched to team: ${targetTeam.name}`);
      output.info(`\nAll cloud commands will now use this team context.`);

      // Warn about env var override
      const envTeamId = process.env[TEAM_ID_ENV_VAR];
      if (envTeamId && envTeamId !== targetTeam.id) {
        output.warn(`\nNote: ${TEAM_ID_ENV_VAR} is set and will override this selection.`);
        output.warn(`Unset it with: unset ${TEAM_ID_ENV_VAR}`);
      }
    } else {
      output.error('Failed to switch team. Please try logging in again.');
      process.exit(1);
    }
  });

// Subcommand: current
teamsCommand
  .command('current')
  .description('Show the current active team')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const session = getStoredSession();

    if (!session) {
      output.error('Not logged in.');
      process.exit(1);
    }

    const effectiveTeamId = getTeamId();
    const envTeamId = process.env[TEAM_ID_ENV_VAR];
    const teams = getSessionTeams();
    const activeTeam = teams.find(t => t.id === effectiveTeamId);

    if (options.json) {
      output.info(JSON.stringify({
        team: activeTeam || null,
        source: envTeamId ? 'environment' : 'session',
        envVar: envTeamId || null,
      }, null, 2));
      return;
    }

    if (!activeTeam) {
      output.warn('No active team.');
      if (teams.length > 0) {
        output.info('Run `bellwether teams switch` to select a team.');
      } else {
        output.info('Try logging out and back in: `bellwether login --logout && bellwether login`');
      }
      return;
    }

    output.info(`Current team: ${activeTeam.name}`);
    output.info(`  ID:   ${activeTeam.id}`);
    output.info(`  Role: ${activeTeam.role}`);
    output.info(`  Plan: ${activeTeam.plan}`);

    if (envTeamId) {
      output.info(`\nSource: ${TEAM_ID_ENV_VAR} environment variable`);
    }
  });
