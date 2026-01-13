/**
 * Authentication module for Bellwether Cloud.
 *
 * Handles session storage, retrieval, and management.
 * Sessions are stored in ~/.bellwether/session.json with restricted permissions.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import type { StoredSession, ProjectLink } from './types.js';

/**
 * Directory for bellwether configuration.
 */
export const CONFIG_DIR = join(homedir(), '.bellwether');

/**
 * Path to session file.
 */
export const SESSION_FILE = join(CONFIG_DIR, 'session.json');

/**
 * Default API base URL.
 */
export const DEFAULT_BASE_URL = 'https://api.bellwether.sh';

/**
 * Environment variable name for session token.
 */
export const SESSION_ENV_VAR = 'BELLWETHER_SESSION';

/**
 * Environment variable name for API base URL.
 */
export const BASE_URL_ENV_VAR = 'BELLWETHER_API_URL';

/**
 * Session token prefix for validation.
 */
export const SESSION_PREFIX = 'sess_';

/**
 * Mock session prefix for development.
 */
export const MOCK_SESSION_PREFIX = 'sess_mock_';

/**
 * Session token pattern: sess_ followed by 64 hex characters.
 * Mock sessions use sess_mock_ prefix with additional characters.
 */
const SESSION_TOKEN_PATTERN = /^sess_[a-f0-9]{64}$/;
const MOCK_SESSION_TOKEN_PATTERN = /^sess_mock_[a-f0-9]+$/;

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
  // Skip permission checks on Windows
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
        // Could not fix permissions - warn user
        console.warn('Warning: Session file has insecure permissions and could not be fixed.');
        console.warn(`Please run: chmod 600 ${SESSION_FILE}`);
        return false;
      }
    }

    return true;
  } catch {
    return true; // If we can't check, proceed anyway
  }
}

/**
 * Get the stored session.
 */
export function getStoredSession(): StoredSession | null {
  if (!existsSync(SESSION_FILE)) {
    return null;
  }

  // Verify file permissions before reading sensitive data
  verifySessionPermissions();

  try {
    const content = readFileSync(SESSION_FILE, 'utf-8');
    const session = JSON.parse(content) as StoredSession;

    // Check if session is expired
    if (new Date(session.expiresAt) <= new Date()) {
      // Session expired, clear it
      clearSession();
      return null;
    }

    return session;
  } catch {
    // If file is corrupted, return null
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
 */
export function getBaseUrl(): string {
  // Check environment variable first
  const envUrl = process.env[BASE_URL_ENV_VAR];
  if (envUrl) {
    return envUrl;
  }

  // Return default
  return DEFAULT_BASE_URL;
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
 * Get the stored user info (if authenticated).
 */
export function getStoredUser(): StoredSession['user'] | null {
  const session = getStoredSession();
  return session?.user ?? null;
}

// ============================================================================
// Project Link Management
// ============================================================================

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
