/**
 * Network utility functions.
 */

import { CLI_SECURITY } from '../constants.js';

/**
 * Check if a hostname is localhost.
 *
 * Uses the centralized LOCALHOST_HOSTS constant to ensure consistent
 * localhost detection across the codebase.
 *
 * @param hostname - The hostname to check (from URL.hostname)
 * @returns true if the hostname is localhost
 */
export function isLocalhost(hostname: string): boolean {
  return (CLI_SECURITY.LOCALHOST_HOSTS as readonly string[]).includes(hostname);
}
