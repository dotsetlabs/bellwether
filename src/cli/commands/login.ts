/**
 * Login command for Inquest Cloud authentication.
 */

import { Command } from 'commander';
import { createInterface } from 'readline';
import {
  getToken,
  setToken,
  clearToken,
  isValidTokenFormat,
  isMockToken,
  CONFIG_DIR,
} from '../../cloud/auth.js';
import { createCloudClient } from '../../cloud/client.js';
import { generateMockToken } from '../../cloud/mock-client.js';

export const loginCommand = new Command('login')
  .description('Authenticate with Inquest Cloud')
  .option('--token <token>', 'API token (or set INQUEST_TOKEN env var)')
  .option('--logout', 'Remove stored credentials')
  .option('--mock', 'Generate and use a mock token for development')
  .option('--status', 'Show current authentication status')
  .action(async (options) => {
    // Handle --status
    if (options.status) {
      await showStatus();
      return;
    }

    // Handle --logout
    if (options.logout) {
      clearToken();
      console.log('Logged out successfully.');
      console.log('Stored credentials removed from ~/.inquest/auth.json');
      return;
    }

    // Handle --mock
    if (options.mock) {
      const mockToken = generateMockToken('dev');
      setToken(mockToken);
      console.log('Mock token generated and saved.');
      console.log(`Token: ${mockToken}`);
      console.log('\nYou can now use cloud commands in mock mode.');
      console.log('Data will be stored locally in ~/.inquest/mock-cloud/');
      return;
    }

    let token = options.token;

    if (!token) {
      // Check if already logged in
      const existing = getToken();
      if (existing) {
        const client = createCloudClient({ token: existing });
        if (client.isAuthenticated()) {
          const user = await client.whoami();
          if (user) {
            console.log(`Already logged in as ${user.email} (${user.plan} plan)`);
            if (isMockToken(existing)) {
              console.log('\nUsing mock token - data stored locally.');
            }
            console.log('\nUse --logout to remove credentials.');
            return;
          }
        }
      }

      // Interactive prompt for token
      console.log('Inquest Cloud Authentication\n');
      console.log('Enter your API token to authenticate.');
      console.log('Get a token at: https://inquest.dev/settings/tokens');
      console.log('\nOr use --mock to generate a development token.\n');

      token = await promptForToken();
    }

    if (!token) {
      console.error('No token provided.');
      process.exit(1);
    }

    // Validate token format
    if (!isValidTokenFormat(token)) {
      console.error('Invalid token format.');
      console.error('Tokens should start with "iqt_" and be at least 12 characters.');
      process.exit(1);
    }

    // Validate token with server
    const client = createCloudClient({ token });

    if (!client.isAuthenticated()) {
      console.error('Invalid or expired token.');
      process.exit(1);
    }

    const user = await client.whoami();

    if (!user) {
      console.error('Failed to authenticate. Please check your token.');
      process.exit(1);
    }

    // Store token
    setToken(token);

    console.log(`\nLogged in as ${user.email} (${user.plan} plan)`);
    console.log(`Token saved to ${CONFIG_DIR}/auth.json`);

    if (isMockToken(token)) {
      console.log('\nNote: Using mock token - data stored locally in ~/.inquest/mock-cloud/');
    }
  });

/**
 * Prompt user for token interactively.
 */
async function promptForToken(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Token: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Show current authentication status.
 */
async function showStatus(): Promise<void> {
  const token = getToken();

  if (!token) {
    console.log('Not logged in.');
    console.log('\nRun `inquest login` to authenticate.');
    return;
  }

  const client = createCloudClient({ token });

  if (!client.isAuthenticated()) {
    console.log('Token stored but invalid.');
    console.log('\nRun `inquest login --logout` then `inquest login` to re-authenticate.');
    return;
  }

  const user = await client.whoami();

  if (!user) {
    console.log('Token stored but authentication failed.');
    return;
  }

  console.log('Authentication Status');
  console.log('─────────────────────');
  console.log(`Email: ${user.email}`);
  console.log(`Plan:  ${user.plan}`);
  console.log(`Mode:  ${isMockToken(token) ? 'Mock (local storage)' : 'Cloud'}`);

  if (isMockToken(token)) {
    console.log('\nData is stored locally in ~/.inquest/mock-cloud/');
  }
}
