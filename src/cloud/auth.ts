/**
 * Authentication module for Inquest Cloud.
 *
 * Handles session storage, retrieval, and management.
 * Sessions are stored in ~/.inquest/session.json with restricted permissions.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { StoredSession, ProjectLink } from './types.js';

/**
 * Directory for inquest configuration.
 */
export const CONFIG_DIR = join(homedir(), '.inquest');

/**
 * Path to session file.
 */
export const SESSION_FILE = join(CONFIG_DIR, 'session.json');

/**
 * Default API base URL.
 */
export const DEFAULT_BASE_URL = 'https://api.inquest.dev';

/**
 * Environment variable name for session token.
 */
export const SESSION_ENV_VAR = 'INQUEST_SESSION';

/**
 * Environment variable name for API base URL.
 */
export const BASE_URL_ENV_VAR = 'INQUEST_API_URL';

/**
 * Session token prefix for validation.
 */
export const SESSION_PREFIX = 'sess_';

/**
 * Mock session prefix for development.
 */
export const MOCK_SESSION_PREFIX = 'sess_mock_';

/**
 * Ensure the config directory exists.
 */
export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Get the stored session.
 */
export function getStoredSession(): StoredSession | null {
  if (!existsSync(SESSION_FILE)) {
    return null;
  }

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
 * 1. INQUEST_SESSION environment variable
 * 2. Stored session in ~/.inquest/session.json
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
 * 1. INQUEST_API_URL environment variable
 * 2. Default: https://api.inquest.dev
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
 * Check if a session token appears valid (basic format check).
 */
export function isValidSessionFormat(token: string): boolean {
  return token.startsWith(SESSION_PREFIX) && token.length >= 40;
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
 * Directory name for per-project inquest config.
 */
export const PROJECT_CONFIG_DIR = '.inquest';

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
