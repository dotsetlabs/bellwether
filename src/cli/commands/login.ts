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
import type { DeviceAuthorizationResponse, DevicePollResponse, StoredSession } from '../../cloud/types.js';

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
      console.log('Logged out successfully.');
      console.log('Stored credentials removed from ~/.bellwether/session.json');
      return;
    }

    // Handle --mock
    if (options.mock) {
      const mockSession = generateMockSession();
      saveSession(mockSession);
      console.log('Mock session generated and saved.');
      console.log(`Logged in as: ${mockSession.user.githubLogin} (mock)`);
      console.log('\nYou can now use cloud commands in mock mode.');
      console.log('Data will be stored locally in ~/.bellwether/mock-cloud/');
      return;
    }

    // Check if already logged in
    const existing = getStoredSession();
    if (existing) {
      console.log(`Already logged in as ${existing.user.githubLogin}`);
      console.log(`Email: ${existing.user.email || 'N/A'}`);
      console.log(`Plan: ${existing.user.plan}`);
      if (isMockSession(existing.sessionToken)) {
        console.log('\nUsing mock session - data stored locally.');
      }
      console.log('\nUse --logout to sign out.');
      return;
    }

    // Start OAuth device flow
    console.log('Bellwether Cloud Authentication\n');
    console.log('Signing in with GitHub...\n');

    try {
      // Step 1: Start device flow
      const deviceAuth = await startDeviceFlow();

      console.log('To authenticate, visit:\n');
      console.log(`  ${deviceAuth.verification_uri}\n`);
      console.log(`Enter code: ${deviceAuth.user_code}\n`);

      // Try to open browser automatically
      if (options.browser !== false) {
        await openBrowser(deviceAuth.verification_uri);
      }

      // Step 2: Poll for completion
      console.log('Waiting for authorization...');
      const result = await pollForCompletion(
        deviceAuth.device_code,
        deviceAuth.interval,
        deviceAuth.expires_in
      );

      if (!result.session_token || !result.user) {
        console.error('\nAuthorization failed or expired.');
        process.exit(1);
      }

      // Step 3: Save session
      const session: StoredSession = {
        sessionToken: result.session_token,
        user: result.user,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      };
      saveSession(session);

      console.log(`\nLogged in as ${result.user.githubLogin}`);
      if (result.user.email) {
        console.log(`Email: ${result.user.email}`);
      }
      console.log(`Plan: ${result.user.plan}`);
      console.log(`\nSession saved to ${CONFIG_DIR}/session.json`);
    } catch (err) {
      console.error('Authentication failed:', err instanceof Error ? err.message : String(err));
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
 * Open URL in default browser.
 * Uses execFile to prevent command injection via malicious URLs.
 */
async function openBrowser(url: string): Promise<void> {
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
        console.log('(Could not open browser automatically)');
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
    console.log('Not logged in.');
    console.log('\nRun `bellwether login` to authenticate with GitHub.');
    return;
  }

  console.log('Authentication Status');
  console.log('---------------------');
  console.log(`GitHub: ${session.user.githubLogin}`);
  if (session.user.githubName) {
    console.log(`Name:   ${session.user.githubName}`);
  }
  if (session.user.email) {
    console.log(`Email:  ${session.user.email}`);
  }
  console.log(`Plan:   ${session.user.plan}`);
  console.log(`Mode:   ${isMockSession(session.sessionToken) ? 'Mock (local storage)' : 'Cloud'}`);

  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  console.log(`Session expires in ${daysRemaining} days`);

  if (isMockSession(session.sessionToken)) {
    console.log('\nData is stored locally in ~/.bellwether/mock-cloud/');
  }
}
