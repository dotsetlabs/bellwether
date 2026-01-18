/**
 * Login command for Bellwether Cloud authentication using GitHub OAuth.
 */

import { Command } from 'commander';
import { execFile } from 'child_process';
import { platform } from 'os';
import {
  getStoredSession,
  saveSession,
  clearSession,
  getBaseUrl,
  isMockSession,
  CONFIG_DIR,
} from '../../cloud/auth.js';
import { generateMockSession } from '../../cloud/mock-client.js';
import type { DeviceAuthorizationResponse, DevicePollResponse, StoredSession, AuthMeResponse, SessionTeam } from '../../cloud/types.js';
import * as output from '../output.js';
import { TIME_CONSTANTS } from '../../constants.js';

export const loginCommand = new Command('login')
  .description('Authenticate with Bellwether Cloud via GitHub')
  .option('--logout', 'Remove stored credentials')
  .option('--mock', 'Generate a mock session for development')
  .option('--status', 'Show current authentication status')
  .option('--no-browser', 'Do not automatically open browser')
  .action(async (options) => {
    // Handle --status
    if (options.status) {
      await showStatus();
      return;
    }

    // Handle --logout
    if (options.logout) {
      clearSession();
      output.info('Logged out successfully.');
      output.info('Stored credentials removed from ~/.bellwether/session.json');
      return;
    }

    // Handle --mock
    if (options.mock) {
      const mockSession = generateMockSession();
      saveSession(mockSession);
      output.info('Mock session generated and saved.');
      output.info(`Logged in as: ${mockSession.user.githubLogin} (mock)`);
      output.info('\nYou can now use cloud commands in mock mode.');
      output.info('Data will be stored locally in ~/.bellwether/mock-cloud/');
      return;
    }

    // Check if already logged in
    const existing = getStoredSession();
    if (existing) {
      output.info(`Already logged in as ${existing.user.githubLogin}`);
      output.info(`Email: ${existing.user.email || 'N/A'}`);
      output.info(`Plan: ${existing.user.plan}`);
      if (isMockSession(existing.sessionToken)) {
        output.info('\nUsing mock session - data stored locally.');
      }
      output.info('\nUse --logout to sign out.');
      return;
    }

    // Start OAuth device flow
    output.info('Bellwether Cloud Authentication\n');
    output.info('Signing in with GitHub...\n');

    try {
      // Step 1: Start device flow
      const deviceAuth = await startDeviceFlow();

      output.info('To authenticate, visit:\n');
      output.info(`  ${deviceAuth.verification_uri}\n`);
      output.info(`Enter code: ${deviceAuth.user_code}\n`);

      // Try to open browser automatically
      if (options.browser !== false) {
        await openBrowser(deviceAuth.verification_uri);
      }

      // Step 2: Poll for completion
      output.info('Waiting for authorization...');
      const result = await pollForCompletion(
        deviceAuth.device_code,
        deviceAuth.interval,
        deviceAuth.expires_in
      );

      if (!result.session_token || !result.user) {
        output.error('\nAuthorization failed or expired.');
        process.exit(1);
      }

      // Step 3: Fetch teams from /auth/me
      const authMe = await fetchAuthMe(result.session_token);
      const teams: SessionTeam[] = authMe?.teams ?? [];

      // Auto-select first team as active (usually personal team)
      const activeTeamId = teams.length > 0 ? teams[0].id : undefined;
      const activeTeam = teams.find(t => t.id === activeTeamId);

      // Step 4: Save session with teams
      const session: StoredSession = {
        sessionToken: result.session_token,
        user: result.user,
        expiresAt: new Date(Date.now() + TIME_CONSTANTS.SESSION_EXPIRATION_MS).toISOString(), // 30 days
        activeTeamId,
        teams,
      };
      saveSession(session);

      output.info(`\nLogged in as ${result.user.githubLogin}`);
      if (result.user.email) {
        output.info(`Email: ${result.user.email}`);
      }
      if (activeTeam) {
        output.info(`Team: ${activeTeam.name} (${activeTeam.plan})`);
        if (teams.length > 1) {
          output.info(`\nYou have access to ${teams.length} teams. Use \`bellwether teams\` to switch.`);
        }
      }
      output.info(`\nSession saved to ${CONFIG_DIR}/session.json`);
    } catch (err) {
      output.error('Authentication failed: ' + (err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

/**
 * Start OAuth device flow.
 */
async function startDeviceFlow(): Promise<DeviceAuthorizationResponse> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/auth/github/device`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start device flow: ${error}`);
  }

  return response.json() as Promise<DeviceAuthorizationResponse>;
}

/**
 * Poll for device authorization completion.
 */
async function pollForCompletion(
  deviceCode: string,
  intervalSec: number,
  expiresInSec: number
): Promise<DevicePollResponse> {
  const baseUrl = getBaseUrl();
  const deadline = Date.now() + expiresInSec * 1000;
  let dots = 0;

  while (Date.now() < deadline) {
    // Wait for interval
    await sleep(intervalSec * 1000);

    // Clear previous line and show progress
    process.stdout.write(`\rWaiting for authorization${'...'.slice(0, (dots % 3) + 1)}   `);
    dots++;

    // Poll for status
    const response = await fetch(`${baseUrl}/auth/github/device/poll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_code: deviceCode }),
    });

    if (!response.ok) {
      throw new Error(`Poll request failed: ${response.status}`);
    }

    const result = await response.json() as DevicePollResponse;

    if (result.error === 'authorization_pending') {
      // Still waiting, continue polling
      continue;
    }

    if (result.error === 'expired_token') {
      throw new Error('Authorization expired. Please try again.');
    }

    if (result.error === 'access_denied') {
      throw new Error('Authorization denied by user.');
    }

    if (result.session_token && result.user) {
      // Clear the waiting line
      process.stdout.write('\r                                    \r');
      return result;
    }

    // Unknown response
    throw new Error('Unexpected response from server');
  }

  throw new Error('Authorization timed out. Please try again.');
}

/**
 * Sleep for a number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch user and teams from /auth/me endpoint.
 */
async function fetchAuthMe(sessionToken: string): Promise<AuthMeResponse | null> {
  const baseUrl = getBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<AuthMeResponse>;
  } catch {
    return null;
  }
}

/**
 * Validate a URL is safe to open in the browser.
 * Only allows HTTPS URLs from trusted domains.
 */
function isValidBrowserUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS (or HTTP for localhost during development)
    if (parsed.protocol !== 'https:') {
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (!isLocalhost) {
        return false;
      }
    }

    // Block javascript: and data: URLs
    if (parsed.protocol === 'javascript:' || parsed.protocol === 'data:') {
      return false;
    }

    // Allow bellwether.sh and github.com domains
    const trustedDomains = [
      'bellwether.sh',
      'api.bellwether.sh',
      'github.com',
      'localhost',
      '127.0.0.1',
    ];

    const isDomainTrusted = trustedDomains.some(domain =>
      parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );

    return isDomainTrusted;
  } catch {
    return false;
  }
}

/**
 * Open URL in default browser.
 * Uses execFile to prevent command injection via malicious URLs.
 * Validates URL before opening for additional security.
 */
async function openBrowser(url: string): Promise<void> {
  // Validate URL before opening
  if (!isValidBrowserUrl(url)) {
    output.warn('Warning: Skipping browser open for untrusted URL.');
    output.warn(`URL: ${url}`);
    return;
  }

  const plat = platform();
  let command: string;
  let args: string[];

  switch (plat) {
    case 'darwin':
      command = 'open';
      args = [url];
      break;
    case 'win32':
      command = 'cmd';
      args = ['/c', 'start', '', url];
      break;
    default:
      // Linux and others
      command = 'xdg-open';
      args = [url];
      break;
  }

  return new Promise((resolve) => {
    // Use execFile instead of exec to prevent shell injection
    execFile(command, args, (error) => {
      if (error) {
        // Silently fail - user can open URL manually
        output.info('(Could not open browser automatically)');
      }
      resolve();
    });
  });
}

/**
 * Show current authentication status.
 */
async function showStatus(): Promise<void> {
  const session = getStoredSession();

  if (!session) {
    output.info('Not logged in.');
    output.info('\nRun `bellwether login` to authenticate with GitHub.');
    return;
  }

  output.info('Authentication Status');
  output.info('---------------------');
  output.info(`GitHub: ${session.user.githubLogin}`);
  if (session.user.githubName) {
    output.info(`Name:   ${session.user.githubName}`);
  }
  if (session.user.email) {
    output.info(`Email:  ${session.user.email}`);
  }
  output.info(`Mode:   ${isMockSession(session.sessionToken) ? 'Mock (local storage)' : 'Cloud'}`);

  // Show team information
  if (session.teams && session.teams.length > 0) {
    const activeTeam = session.teams.find(t => t.id === session.activeTeamId);
    if (activeTeam) {
      output.info(`Team:   ${activeTeam.name} (${activeTeam.plan})`);
    }
    if (session.teams.length > 1) {
      output.info(`\nAvailable teams (${session.teams.length}):`);
      for (const team of session.teams) {
        const marker = team.id === session.activeTeamId ? ' (active)' : '';
        output.info(`  - ${team.name} [${team.role}]${marker}`);
      }
      output.info('\nUse `bellwether teams switch` to change active team.');
    }
  }

  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / TIME_CONSTANTS.MS_PER_DAY);
  output.info(`\nSession expires in ${daysRemaining} days`);

  if (isMockSession(session.sessionToken)) {
    output.info('\nData is stored locally in ~/.bellwether/mock-cloud/');
  }
}
