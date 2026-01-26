/**
 * Baseline versioning using CLI package version.
 *
 * Compatibility Rules:
 * - Same CLI major version = COMPATIBLE (can compare baselines)
 * - Different CLI major version = INCOMPATIBLE (requires migration)
 *
 * This aligns with semantic versioning: major version changes signal
 * breaking changes, including baseline format changes.
 */

import { VERSION } from '../version.js';

/**
 * Get the current CLI version for baseline creation.
 */
export function getBaselineVersion(): string {
  return VERSION;
}

/**
 * Parsed semantic version components.
 */
export interface FormatVersion {
  /** Major version - breaking changes require new major version */
  major: number;
  /** Minor version - additive/backwards-compatible changes */
  minor: number;
  /** Patch version - bug fixes */
  patch: number;
  /** Original raw version string */
  raw: string;
}

/**
 * Result of a version compatibility check.
 */
export interface VersionCompatibility {
  /** Whether the versions are compatible for comparison */
  compatible: boolean;
  /** Warning message if versions differ (null if identical) */
  warning: string | null;
  /** Source baseline version */
  sourceVersion: string;
  /** Target baseline version */
  targetVersion: string;
}

/**
 * Error thrown when baseline versions are incompatible.
 */
export class BaselineVersionError extends Error {
  constructor(
    message: string,
    public readonly sourceVersion: string,
    public readonly targetVersion: string
  ) {
    super(message);
    this.name = 'BaselineVersionError';
  }
}

/**
 * Parse a version string into its semantic components.
 *
 * Handles:
 * - Full semver: "1.0.0" -> { major: 1, minor: 0, patch: 0 }
 * - Partial semver: "1.0" -> { major: 1, minor: 0, patch: 0 }
 * - Legacy numeric: 1 -> { major: 1, minor: 0, patch: 0 }
 *
 * @param version - Version string or number to parse
 * @returns Parsed version components
 */
export function parseVersion(version: string | number | undefined): FormatVersion {
  // Handle undefined/null - treat as current version
  if (version === undefined || version === null) {
    return parseVersion(VERSION);
  }

  // Handle legacy numeric version (e.g., version: 1)
  if (typeof version === 'number') {
    return {
      major: version,
      minor: 0,
      patch: 0,
      raw: `${version}.0.0`,
    };
  }

  // Parse semver string
  const parts = version.split('.').map(Number);

  // Validate parsed numbers
  const major = Number.isNaN(parts[0]) ? 0 : parts[0];
  const minor = Number.isNaN(parts[1]) ? 0 : (parts[1] ?? 0);
  const patch = Number.isNaN(parts[2]) ? 0 : (parts[2] ?? 0);

  return {
    major,
    minor,
    patch,
    raw: `${major}.${minor}.${patch}`,
  };
}

/**
 * Check if two versions are compatible for baseline comparison.
 *
 * Versions are compatible if they share the same major version.
 *
 * @param v1 - First version
 * @param v2 - Second version
 * @returns true if compatible, false otherwise
 */
export function areVersionsCompatible(v1: FormatVersion, v2: FormatVersion): boolean {
  return v1.major === v2.major;
}

/**
 * Compare two versions and return -1, 0, or 1.
 *
 * @param v1 - First version
 * @param v2 - Second version
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(v1: FormatVersion, v2: FormatVersion): -1 | 0 | 1 {
  if (v1.major !== v2.major) {
    return v1.major < v2.major ? -1 : 1;
  }
  if (v1.minor !== v2.minor) {
    return v1.minor < v2.minor ? -1 : 1;
  }
  if (v1.patch !== v2.patch) {
    return v1.patch < v2.patch ? -1 : 1;
  }
  return 0;
}

/**
 * Get a warning message for version differences, or null if versions are identical.
 *
 * @param v1 - First version (source/baseline)
 * @param v2 - Second version (target/current)
 * @returns Warning message or null
 */
export function getCompatibilityWarning(v1: FormatVersion, v2: FormatVersion): string | null {
  if (v1.major !== v2.major) {
    return (
      `Baseline CLI versions are incompatible: v${v1.raw} vs v${v2.raw}. ` +
      `Major version mismatch may cause incorrect comparison results. ` +
      `Recreate the older baseline with the current CLI version.`
    );
  }

  if (v1.minor !== v2.minor || v1.patch !== v2.patch) {
    return (
      `Baseline CLI versions differ: v${v1.raw} vs v${v2.raw}. ` +
      `Comparison should work correctly, but some newer fields may not be present in the older baseline.`
    );
  }

  return null;
}

/**
 * Check version compatibility and return detailed result.
 *
 * @param sourceVersion - Version of the source/baseline
 * @param targetVersion - Version of the target/current
 * @returns Compatibility result with details
 */
export function checkVersionCompatibility(
  sourceVersion: string | number | undefined,
  targetVersion: string | number | undefined
): VersionCompatibility {
  const v1 = parseVersion(sourceVersion);
  const v2 = parseVersion(targetVersion);

  return {
    compatible: areVersionsCompatible(v1, v2),
    warning: getCompatibilityWarning(v1, v2),
    sourceVersion: v1.raw,
    targetVersion: v2.raw,
  };
}

/**
 * Assert that two versions are compatible, throwing an error if not.
 *
 * @param sourceVersion - Version of the source/baseline
 * @param targetVersion - Version of the target/current
 * @throws BaselineVersionError if versions are incompatible
 */
export function assertVersionCompatibility(
  sourceVersion: string | number | undefined,
  targetVersion: string | number | undefined
): void {
  const v1 = parseVersion(sourceVersion);
  const v2 = parseVersion(targetVersion);

  if (!areVersionsCompatible(v1, v2)) {
    throw new BaselineVersionError(
      `Cannot compare baselines with incompatible CLI versions: v${v1.raw} vs v${v2.raw}. ` +
        `Recreate the older baseline with the current CLI version, ` +
        `or use --ignore-version-mismatch to force comparison (results may be incorrect).`,
      v1.raw,
      v2.raw
    );
  }
}

/**
 * Format a version for display.
 *
 * @param version - Version to format
 * @returns Formatted version string like "v1.0.0"
 */
export function formatVersion(version: string | number | undefined): string {
  const parsed = parseVersion(version);
  return `v${parsed.raw}`;
}

/**
 * Check if a version is the current CLI version.
 *
 * @param version - Version to check
 * @returns true if version matches current CLI version
 */
export function isCurrentVersion(version: string | number | undefined): boolean {
  const parsed = parseVersion(version);
  const current = parseVersion(VERSION);
  return compareVersions(parsed, current) === 0;
}

/**
 * Check if a version is older than the current CLI version.
 *
 * @param version - Version to check
 * @returns true if version is older than current
 */
export function isOlderVersion(version: string | number | undefined): boolean {
  const parsed = parseVersion(version);
  const current = parseVersion(VERSION);
  return compareVersions(parsed, current) < 0;
}

/**
 * Check if a version is newer than the current CLI version.
 *
 * @param version - Version to check
 * @returns true if version is newer than current
 */
export function isNewerVersion(version: string | number | undefined): boolean {
  const parsed = parseVersion(version);
  const current = parseVersion(VERSION);
  return compareVersions(parsed, current) > 0;
}

/**
 * Check if a baseline version requires migration (different major version).
 *
 * @param version - Version to check
 * @returns true if baseline needs migration to be compatible
 */
export function requiresMigration(version: string | number | undefined): boolean {
  const parsed = parseVersion(version);
  const current = parseVersion(VERSION);
  return parsed.major !== current.major;
}
