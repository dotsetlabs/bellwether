/**
 * Cloud client factory.
 *
 * Creates the appropriate cloud client implementation based on configuration.
 * Supports:
 * - MockCloudClient (local development/testing)
 * - HttpCloudClient (production API)
 */

import type { InquestCloudClient, CloudConfig } from './types.js';
import { MockCloudClient } from './mock-client.js';
import { HttpCloudClient } from './http-client.js';
import { getToken, getBaseUrl, isMockToken } from './auth.js';

/**
 * Create a cloud client with the given configuration.
 *
 * If no token is provided, attempts to get one from environment/storage.
 * Automatically selects mock client for development or HTTP client for production.
 */
export function createCloudClient(config?: Partial<CloudConfig>): InquestCloudClient {
  const token = config?.token ?? getToken();
  const baseUrl = config?.baseUrl ?? getBaseUrl();
  const timeout = config?.timeout ?? 30000;

  // Determine which client to use
  const useMock = shouldUseMockClient(baseUrl, token);

  if (useMock) {
    return new MockCloudClient(token);
  }

  // Use HTTP client for production
  if (!token) {
    throw new Error('Token required for HTTP client');
  }
  return new HttpCloudClient(baseUrl, token, timeout);
}

/**
 * Determine if we should use the mock client.
 *
 * Uses mock client when:
 * - Token is a mock token (iqt_mock_*)
 * - No token is provided (unauthenticated mode)
 *
 * Uses HTTP client when:
 * - A real token is provided (even for localhost - allows local server testing)
 */
function shouldUseMockClient(_baseUrl: string, token?: string): boolean {
  // Use mock if token is a mock token
  if (token && isMockToken(token)) {
    return true;
  }

  // Use mock if no token (unauthenticated mock mode)
  if (!token) {
    return true;
  }

  // Use HTTP client for real tokens (works with localhost or production)
  return false;
}

/**
 * Create a cloud client with explicit token.
 *
 * Convenience function for when you already have a token.
 */
export function createCloudClientWithToken(token: string): InquestCloudClient {
  return createCloudClient({ token });
}

// Re-export types for convenience
export type { InquestCloudClient, CloudConfig } from './types.js';
