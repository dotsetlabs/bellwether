/**
 * Centralized version management.
 *
 * All version references should import from this module rather than
 * hardcoding the version string.
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

/**
 * Get the package version.
 *
 * This reads from package.json at runtime, which works correctly
 * whether running in development or as an installed global package.
 */
function getPackageVersion(): string {
  try {
    // First try npm_package_version (works when run via npm scripts)
    if (process.env.npm_package_version) {
      return process.env.npm_package_version;
    }

    // Otherwise read from package.json relative to this module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // In dist/, we need to go up one level to find package.json
    // In src/, we also need to go up one level
    const packagePath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

    return packageJson.version;
  } catch {
    // Fallback version - should match package.json
    return '0.7.0';
  }
}

/**
 * The current Bellwether version.
 */
export const VERSION = getPackageVersion();

/**
 * Package name.
 */
export const PACKAGE_NAME = '@dotsetlabs/bellwether';

/**
 * User-Agent string for HTTP requests.
 */
export const USER_AGENT = `bellwether/${VERSION}`;
