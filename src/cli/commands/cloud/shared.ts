import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../../config/loader.js';
import { getSessionToken, getLinkedProject } from '../../../cloud/auth.js';
import { createCloudClient } from '../../../cloud/client.js';
import type { BellwetherCloudClient } from '../../../cloud/types.js';
import { EXIT_CODES } from '../../../constants.js';
import * as output from '../../output.js';

export function loadConfigOrExit(configPath?: string): BellwetherConfig {
  try {
    return loadConfig(configPath);
  } catch (error) {
    if (error instanceof ConfigNotFoundError) {
      output.error(error.message);
      process.exit(EXIT_CODES.ERROR);
    }
    throw error;
  }
}

export function getSessionTokenOrExit(sessionOverride?: string, message?: string): string {
  const sessionToken = sessionOverride ?? getSessionToken();
  if (!sessionToken) {
    output.error(message ?? 'Not authenticated. Run `bellwether login` first.');
    process.exit(EXIT_CODES.ERROR);
  }
  return sessionToken;
}

export function createAuthenticatedClient(sessionToken: string, message?: string): BellwetherCloudClient {
  const client = createCloudClient({ sessionToken });
  if (!client.isAuthenticated()) {
    output.error(message ?? 'Authentication failed. Run `bellwether login` to re-authenticate.');
    process.exit(EXIT_CODES.ERROR);
  }
  return client;
}

export function resolveProjectId(
  projectIdArg?: string,
  projectOption?: string
): string | undefined {
  const explicit = projectOption ?? projectIdArg;
  if (explicit) {
    return explicit;
  }
  const link = getLinkedProject();
  return link?.projectId;
}
