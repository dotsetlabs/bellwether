/**
 * Cloud client factory.
 *
 * Creates the appropriate cloud client implementation based on configuration.
 * Supports:
 * - MockCloudClient (local development/testing)
 * - HttpCloudClient (production API)
 */

import type { BellwetherCloudClient, CloudConfig } from './types.js';
import { MockCloudClient } from './mock-client.js';
import { HttpCloudClient } from './http-client.js';
import { getSessionToken, getBaseUrl, isMockSession, getTeamId } from './auth.js';
import { TIMEOUTS } from '../constants.js';

/**
 * Create a cloud client with the given configuration.
 *
 * If no session token is provided, attempts to get one from environment/storage.
 * Automatically selects mock client for development or HTTP client for production.
 */
export function createCloudClient(config?: Partial<CloudConfig>): BellwetherCloudClient {
  const sessionToken = config?.sessionToken ?? getSessionToken();
  const baseUrl = config?.baseUrl ?? getBaseUrl();
  const timeout = config?.timeout ?? TIMEOUTS.CLOUD_API;

  // Determine which client to use
  const useMock = shouldUseMockClient(sessionToken);

  if (useMock) {
    return new MockCloudClient(sessionToken);
  }

  // Use HTTP client for production
  if (!sessionToken) {
    throw new Error('Session required for HTTP client. Run `bellwether login` first.');
  }
  const teamId = getTeamId();
  return new HttpCloudClient(baseUrl, sessionToken, timeout, teamId);
}

/**
 * Determine if we should use the mock client.
 *
 * Uses mock client when:
 * - Session is a mock session (sess_mock_*)
 * - No session is provided (unauthenticated mode)
 *
 * Uses HTTP client when:
 * - A real session is provided (even for localhost - allows local server testing)
 */
function shouldUseMockClient(sessionToken?: string): boolean {
  // Use mock if session is a mock session
  if (sessionToken && isMockSession(sessionToken)) {
    return true;
  }

  // Use mock if no session (unauthenticated mock mode)
  if (!sessionToken) {
    return true;
  }

  // Use HTTP client for real sessions (works with localhost or production)
  return false;
}

/**
 * Create a cloud client with explicit session token.
 *
 * Convenience function for when you already have a session token.
 */
export function createCloudClientWithSession(sessionToken: string): BellwetherCloudClient {
  return createCloudClient({ sessionToken });
}

// Re-export types for convenience
export type { BellwetherCloudClient, CloudConfig } from './types.js';
