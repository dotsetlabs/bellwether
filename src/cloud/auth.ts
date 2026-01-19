/**
 * Authentication module for Bellwether Cloud.
 *
 * Handles session storage, retrieval, and management.
 * Sessions are stored in ~/.bellwether/session.json with restricted permissions.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import type { StoredSession, ProjectLink, SessionTeam } from './types.js';
import { URLS, PATHS, PATTERNS, CLI_SECURITY } from '../constants.js';
import * as output from '../cli/output.js';

/**
 * Directory for bellwether configuration.
 */
export const CONFIG_DIR = join(homedir(), PATHS.CONFIG_DIR);

/**
 * Path to session file.
 */
export const SESSION_FILE = join(CONFIG_DIR, PATHS.SESSION_FILE);

/**
 * Environment variable name for session token.
 */
export const SESSION_ENV_VAR = 'BELLWETHER_SESSION';

/**
 * Environment variable name for API base URL.
 */
export const BASE_URL_ENV_VAR = 'BELLWETHER_API_URL';

/**
 * Environment variable name for team ID override.
 */
export const TEAM_ID_ENV_VAR = 'BELLWETHER_TEAM_ID';

/**
 * Session token prefix for validation.
 */
export const SESSION_PREFIX = CLI_SECURITY.SESSION_PREFIX;

/**
 * Mock session prefix for development.
 */
export const MOCK_SESSION_PREFIX = CLI_SECURITY.MOCK_SESSION_PREFIX;

/**
 * Session token pattern: sess_ followed by 64 hex characters.
 * Mock sessions use sess_mock_ prefix with username and hex characters.
 * Format: sess_mock_<username>_<hex>
 */
const SESSION_TOKEN_PATTERN = PATTERNS.SESSION_TOKEN;
const MOCK_SESSION_TOKEN_PATTERN = PATTERNS.MOCK_SESSION_TOKEN;

/**
 * Ensure the config directory exists.
 */
export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Verify and fix session file permissions.
 * On Unix systems, ensures file is only readable by owner (0600).
 * Returns false if permissions could not be verified/fixed.
 */
function verifySessionPermissions(): boolean {
  // Skip permission checks on Windows (Windows has different ACL system)
  if (platform() === 'win32') {
    return true;
  }

  try {
    if (!existsSync(SESSION_FILE)) {
      return true; // No file to check
    }

    const stats = statSync(SESSION_FILE);
    const mode = stats.mode & 0o777;

    // Check if permissions are too permissive (anyone other than owner can read)
    if (mode & 0o077) {
      // Try to fix permissions
      try {
        chmodSync(SESSION_FILE, 0o600);
        return true;
      } catch {
        // Could not fix permissions
        return false;
      }
    }

    return true;
  } catch (error) {
    // If we can't stat the file, there's a real problem
    output.warn(`Warning: Could not verify session file permissions: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

/**
 * Get the stored session.
 * Returns null if no session exists, session is expired, or file is corrupted.
 */
export function getStoredSession(): StoredSession | null {
  if (!existsSync(SESSION_FILE)) {
    return null;
  }

  // Verify file permissions before reading sensitive data
  const permissionsOk = verifySessionPermissions();
  if (!permissionsOk) {
    // Permissions are insecure and couldn't be fixed - refuse to use session
    output.error('Error: Session file has insecure permissions. Please fix with:');
    output.error(`  chmod 600 ${SESSION_FILE}`);
    return null;
  }

  try {
    const content = readFileSync(SESSION_FILE, 'utf-8');
    const session = JSON.parse(content) as StoredSession;

    // Validate and check if session is expired
    if (!session.expiresAt) {
      output.warn('Warning: Session file missing expiration date, clearing it.');
      clearSession();
      return null;
    }

    const expirationDate = new Date(session.expiresAt);
    if (isNaN(expirationDate.getTime())) {
      output.warn('Warning: Session file has invalid expiration date, clearing it.');
      clearSession();
      return null;
    }

    if (expirationDate <= new Date()) {
      // Session expired, clear it
      clearSession();
      return null;
    }

    return session;
  } catch {
    // If file is corrupted, log and return null
    output.warn('Warning: Session file is corrupted, clearing it.');
    clearSession();
    return null;
  }
}

/**
 * Save session to disk.
 * File is created with 0600 permissions (owner read/write only).
 */
export function saveSession(session: StoredSession): void {
  ensureConfigDir();
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

/**
 * Clear the stored session.
 */
export function clearSession(): void {
  if (existsSync(SESSION_FILE)) {
    try {
      unlinkSync(SESSION_FILE);
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Get the session token.
 *
 * Priority:
 * 1. BELLWETHER_SESSION environment variable
 * 2. Stored session in ~/.bellwether/session.json
 */
export function getSessionToken(): string | undefined {
  // Check environment variable first
  const envSession = process.env[SESSION_ENV_VAR];
  if (envSession) {
    return envSession;
  }

  // Fall back to stored session
  const session = getStoredSession();
  return session?.sessionToken;
}

/**
 * Get the API base URL.
 *
 * Priority:
 * 1. BELLWETHER_API_URL environment variable
 * 2. Default: https://api.bellwether.sh
 *
 * Security: Validates that custom URLs use HTTPS (except localhost for development).
 */
export function getBaseUrl(): string {
  // Check environment variable first
  const envUrl = process.env[BASE_URL_ENV_VAR];
  if (envUrl) {
    // Validate URL format and security
    try {
      const url = new URL(envUrl);

      // Allow HTTP only for localhost/127.0.0.1 (development)
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (url.protocol !== 'https:' && !isLocalhost) {
        output.warn(`Warning: ${BASE_URL_ENV_VAR} uses insecure HTTP protocol.`);
        output.warn('HTTPS is required for production use to protect authentication tokens.');
        output.warn('Use HTTPS or localhost for secure communication.\n');
      }

      return envUrl;
    } catch {
      output.warn(`Warning: Invalid URL in ${BASE_URL_ENV_VAR}: ${envUrl}`);
      output.warn('Falling back to default API URL.\n');
      return URLS.CLOUD_API;
    }
  }

  // Return default
  return URLS.CLOUD_API;
}

/**
 * Check if a session token appears valid (strict format check).
 * Validates against exact patterns to prevent injection.
 */
export function isValidSessionFormat(token: string): boolean {
  return SESSION_TOKEN_PATTERN.test(token) || MOCK_SESSION_TOKEN_PATTERN.test(token);
}

/**
 * Check if a session token is a mock session (for development).
 */
export function isMockSession(token: string): boolean {
  return token.startsWith(MOCK_SESSION_PREFIX);
}

/**
 * Check if currently authenticated.
 */
export function isAuthenticated(): boolean {
  const token = getSessionToken();
  return token !== undefined && isValidSessionFormat(token);
}

/**
 * Get the active team ID.
 *
 * Priority:
 * 1. BELLWETHER_TEAM_ID environment variable
 * 2. Team ID from project link (if in a linked project directory)
 * 3. Active team ID from stored session
 */
export function getTeamId(projectDir: string = process.cwd()): string | undefined {
  // Check environment variable first (for CI/CD)
  const envTeamId = process.env[TEAM_ID_ENV_VAR];
  if (envTeamId) {
    return envTeamId;
  }

  // Check project link for project-specific team
  const projectLink = getLinkedProject(projectDir);
  if (projectLink?.teamId) {
    return projectLink.teamId;
  }

  // Fall back to session's active team
  const session = getStoredSession();
  return session?.activeTeamId;
}

/**
 * Get the active team details.
 * Returns the full team object if available.
 */
export function getActiveTeam(projectDir: string = process.cwd()): SessionTeam | undefined {
  const teamId = getTeamId(projectDir);
  if (!teamId) {
    return undefined;
  }

  const session = getStoredSession();
  return session?.teams?.find(t => t.id === teamId);
}

/**
 * Get all teams from the stored session.
 */
export function getSessionTeams(): SessionTeam[] {
  const session = getStoredSession();
  return session?.teams ?? [];
}

/**
 * Set the active team in the stored session.
 * Returns true if successful, false if team not found in session.
 */
export function setActiveTeam(teamId: string): boolean {
  const session = getStoredSession();
  if (!session) {
    return false;
  }

  // Verify the team exists in the session
  const teamExists = session.teams?.some(t => t.id === teamId);
  if (!teamExists) {
    return false;
  }

  // Update the active team
  session.activeTeamId = teamId;
  saveSession(session);
  return true;
}
/**
 * Directory name for per-project bellwether config.
 */
export const PROJECT_CONFIG_DIR = '.bellwether';

/**
 * File name for project link configuration.
 */
export const LINK_FILE = 'link.json';

/**
 * Get the project link file path for a given directory.
 */
export function getLinkFilePath(projectDir: string = process.cwd()): string {
  return join(projectDir, PROJECT_CONFIG_DIR, LINK_FILE);
}

/**
 * Get the linked project for the current directory.
 */
export function getLinkedProject(projectDir: string = process.cwd()): ProjectLink | null {
  const linkFile = getLinkFilePath(projectDir);

  if (!existsSync(linkFile)) {
    return null;
  }

  try {
    const content = readFileSync(linkFile, 'utf-8');
    return JSON.parse(content) as ProjectLink;
  } catch {
    return null;
  }
}

/**
 * Save a project link for the current directory.
 */
export function saveProjectLink(
  link: ProjectLink,
  projectDir: string = process.cwd()
): void {
  const configDir = join(projectDir, PROJECT_CONFIG_DIR);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const linkFile = getLinkFilePath(projectDir);
  writeFileSync(linkFile, JSON.stringify(link, null, 2));
}

/**
 * Remove the project link for the current directory.
 */
export function removeProjectLink(projectDir: string = process.cwd()): boolean {
  const linkFile = getLinkFilePath(projectDir);

  if (!existsSync(linkFile)) {
    return false;
  }

  try {
    unlinkSync(linkFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the current directory is linked to a project.
 */
export function isLinked(projectDir: string = process.cwd()): boolean {
  return getLinkedProject(projectDir) !== null;
}
