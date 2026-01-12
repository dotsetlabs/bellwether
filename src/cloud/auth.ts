/**
 * Authentication module for Inquest Cloud.
 *
 * Handles token storage, retrieval, and management.
 * Tokens are stored in ~/.inquest/auth.json with restricted permissions.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AuthConfig, ProjectLink } from './types.js';

/**
 * Directory for inquest configuration.
 */
export const CONFIG_DIR = join(homedir(), '.inquest');

/**
 * Path to auth configuration file.
 */
export const AUTH_FILE = join(CONFIG_DIR, 'auth.json');

/**
 * Default API base URL.
 */
export const DEFAULT_BASE_URL = 'https://api.inquest.dev';

/**
 * Environment variable name for API token.
 */
export const TOKEN_ENV_VAR = 'INQUEST_TOKEN';

/**
 * Environment variable name for API base URL.
 */
export const BASE_URL_ENV_VAR = 'INQUEST_API_URL';

/**
 * Token prefix for validation.
 */
export const TOKEN_PREFIX = 'iqt_';

/**
 * Mock token prefix for development.
 */
export const MOCK_TOKEN_PREFIX = 'iqt_mock_';

/**
 * Ensure the config directory exists.
 */
export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Get the stored auth configuration.
 */
export function getAuthConfig(): AuthConfig {
  if (!existsSync(AUTH_FILE)) {
    return {};
  }

  try {
    const content = readFileSync(AUTH_FILE, 'utf-8');
    return JSON.parse(content) as AuthConfig;
  } catch {
    // If file is corrupted, return empty config
    return {};
  }
}

/**
 * Save auth configuration to disk.
 * File is created with 0600 permissions (owner read/write only).
 */
export function saveAuthConfig(config: AuthConfig): void {
  ensureConfigDir();
  writeFileSync(AUTH_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Get the API token.
 *
 * Priority:
 * 1. INQUEST_TOKEN environment variable
 * 2. Stored token in ~/.inquest/auth.json
 */
export function getToken(): string | undefined {
  // Check environment variable first
  const envToken = process.env[TOKEN_ENV_VAR];
  if (envToken) {
    return envToken;
  }

  // Fall back to stored config
  return getAuthConfig().token;
}

/**
 * Set and store the API token.
 */
export function setToken(token: string): void {
  const config = getAuthConfig();
  config.token = token;
  saveAuthConfig(config);
}

/**
 * Clear the stored API token.
 */
export function clearToken(): void {
  const config = getAuthConfig();
  delete config.token;
  saveAuthConfig(config);
}

/**
 * Get the API base URL.
 *
 * Priority:
 * 1. INQUEST_API_URL environment variable
 * 2. Stored baseUrl in ~/.inquest/auth.json
 * 3. Default: https://api.inquest.dev
 */
export function getBaseUrl(): string {
  // Check environment variable first
  const envUrl = process.env[BASE_URL_ENV_VAR];
  if (envUrl) {
    return envUrl;
  }

  // Check stored config
  const config = getAuthConfig();
  if (config.baseUrl) {
    return config.baseUrl;
  }

  // Return default
  return DEFAULT_BASE_URL;
}

/**
 * Set the API base URL override.
 */
export function setBaseUrl(baseUrl: string): void {
  const config = getAuthConfig();
  config.baseUrl = baseUrl;
  saveAuthConfig(config);
}

/**
 * Clear the API base URL override.
 */
export function clearBaseUrl(): void {
  const config = getAuthConfig();
  delete config.baseUrl;
  saveAuthConfig(config);
}

/**
 * Check if a token appears valid (basic format check).
 */
export function isValidTokenFormat(token: string): boolean {
  // Token should start with our prefix and have reasonable length
  return (
    token.startsWith(TOKEN_PREFIX) &&
    token.length >= TOKEN_PREFIX.length + 8
  );
}

/**
 * Check if a token is a mock token (for development).
 */
export function isMockToken(token: string): boolean {
  return token.startsWith(MOCK_TOKEN_PREFIX);
}

/**
 * Check if currently authenticated.
 */
export function isAuthenticated(): boolean {
  const token = getToken();
  return token !== undefined && isValidTokenFormat(token);
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
