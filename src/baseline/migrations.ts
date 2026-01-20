/**
 * Baseline format migrations.
 *
 * This module handles upgrading baselines from older CLI versions to the current version.
 * Migrations are triggered when the CLI major version changes.
 *
 * Migration Strategy:
 * - Migrations are keyed by their TARGET major version
 * - Each migration upgrades from the previous major version
 * - Migrations are applied sequentially in version order
 * - Downgrading is not supported
 */

import { VERSION } from '../version.js';
import type { BehavioralBaseline } from './types.js';
import { parseVersion, compareVersions } from './version.js';

/**
 * A migration function that transforms a baseline from one version to the next.
 * The input is the raw baseline object (may have any shape from older versions).
 * The output should conform to the target version's expected shape.
 */
type MigrationFn = (baseline: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registry of migrations keyed by target major version.
 *
 * When adding a new migration for CLI v2.0.0:
 * 1. Add an entry with '2' as the key (major version)
 * 2. Implement the migration function to transform from v1.x to v2.x format
 *
 * Example for future migration from v1.x to v2.0.0:
 *
 * '2': (baseline) => {
 *   return {
 *     ...baseline,
 *     version: '2.0.0',
 *     // Add new required fields with defaults
 *     newField: baseline.newField ?? 'default',
 *     // Transform renamed fields
 *     renamedField: baseline.oldFieldName,
 *     // Remove deprecated fields (just don't include them)
 *   };
 * },
 */
const MIGRATIONS: Record<string, MigrationFn> = {
  // Migration from legacy format version "1.0.0" to CLI version format
  // This handles baselines created before the versioning simplification
  '0': (baseline) => {
    const version = baseline.version;

    // If version looks like old format version (1.0.0), convert to CLI version
    if (version === '1.0.0' || version === '1.0' || version === 1) {
      return {
        ...baseline,
        version: VERSION, // Use current CLI version
      };
    }

    return baseline;
  },

  // Future migrations would be added here when CLI major version changes:
  // '1': (baseline) => { ... }, // Migrates v0.x baselines to v1.x format
  // '2': (baseline) => { ... }, // Migrates v1.x baselines to v2.x format
};

/**
 * Get the current CLI major version.
 */
function getCurrentMajorVersion(): number {
  return parseVersion(VERSION).major;
}

/**
 * Check if a version is the legacy format version (before CLI version was used).
 * Legacy format versions were "1.0.0", "1.0", or numeric 1.
 * These need special handling because they're not CLI versions.
 */
function isLegacyFormatVersion(version: string | number | undefined): boolean {
  return version === '1.0.0' || version === '1.0' || version === 1;
}

/**
 * Check if a baseline can be migrated to the current CLI version.
 *
 * Migration is possible if:
 * - Source version has a different major version than current
 * - A migration path exists
 *
 * @param fromVersion - Source version (string, number, or undefined)
 * @returns true if migration is possible
 */
export function canMigrate(fromVersion: string | number | undefined): boolean {
  const from = parseVersion(fromVersion);
  const currentMajor = getCurrentMajorVersion();

  // Same major version - no migration needed
  if (from.major === currentMajor) {
    return true;
  }

  // Check if we have a migration for the current major version
  return MIGRATIONS[String(currentMajor)] !== undefined;
}

/**
 * Get the list of migrations that would be applied.
 *
 * @param fromVersion - Source version
 * @returns Array of major version strings for migrations that would be applied
 */
export function getMigrationsToApply(fromVersion: string | number | undefined): string[] {
  const currentMajor = getCurrentMajorVersion();

  // Legacy format version needs the '0' migration
  if (isLegacyFormatVersion(fromVersion)) {
    return MIGRATIONS['0'] ? ['0'] : [];
  }

  const from = parseVersion(fromVersion);

  // Same major version - no migrations needed
  if (from.major === currentMajor) {
    return [];
  }

  // Return migrations from source major to current major
  const toApply: string[] = [];
  for (let major = from.major; major <= currentMajor; major++) {
    if (MIGRATIONS[String(major)]) {
      toApply.push(String(major));
    }
  }

  return toApply;
}

/**
 * Migrate a baseline to the current CLI version format.
 *
 * @param baseline - The baseline object to migrate (can be any version)
 * @returns Migrated baseline conforming to BehavioralBaseline interface
 * @throws Error if migration is not possible (e.g., downgrade attempt)
 */
export function migrateBaseline(baseline: Record<string, unknown>): BehavioralBaseline {
  const sourceVersion = baseline.version as string | number | undefined;
  const current = parseVersion(VERSION);

  // Handle legacy format version specially (not a real CLI version)
  if (isLegacyFormatVersion(sourceVersion)) {
    let migrated = { ...baseline };
    const migration = MIGRATIONS['0'];
    if (migration) {
      migrated = migration(migrated);
    }
    migrated.version = VERSION;
    return migrated as unknown as BehavioralBaseline;
  }

  const from = parseVersion(sourceVersion);

  // Already at current version
  if (compareVersions(from, current) === 0) {
    return baseline as unknown as BehavioralBaseline;
  }

  // Same major version - just update the version string
  if (from.major === current.major) {
    return {
      ...baseline,
      version: VERSION,
    } as unknown as BehavioralBaseline;
  }

  // Cannot downgrade (only applies to actual CLI versions, not legacy format)
  if (from.major > current.major) {
    throw new Error(
      `Cannot downgrade baseline from v${from.raw} to v${current.raw}. ` +
        `Downgrading baselines is not supported.`
    );
  }

  // Apply migrations
  let migrated = { ...baseline };
  const migrationsToApply = getMigrationsToApply(sourceVersion);

  for (const majorVersion of migrationsToApply) {
    const migration = MIGRATIONS[majorVersion];
    if (migration) {
      migrated = migration(migrated);
    }
  }

  // Ensure version is set to current CLI version
  migrated.version = VERSION;

  return migrated as unknown as BehavioralBaseline;
}

/**
 * Check if a baseline needs migration.
 *
 * @param baseline - The baseline to check
 * @returns true if the baseline major version differs from current CLI major version
 */
export function needsMigration(baseline: Record<string, unknown>): boolean {
  const version = baseline.version as string | number | undefined;
  const from = parseVersion(version);
  const currentMajor = getCurrentMajorVersion();

  // Check for legacy format version (1.0.0) which needs migration to CLI version
  if (version === '1.0.0' || version === '1.0' || version === 1) {
    return true;
  }

  return from.major !== currentMajor;
}

/**
 * Get information about what migrations would be applied.
 *
 * @param baseline - The baseline to analyze
 * @returns Object with migration details
 */
export function getMigrationInfo(baseline: Record<string, unknown>): {
  currentVersion: string;
  targetVersion: string;
  needsMigration: boolean;
  migrationsToApply: string[];
  canMigrate: boolean;
} {
  const version = baseline.version as string | number | undefined;
  const from = parseVersion(version);

  return {
    currentVersion: from.raw,
    targetVersion: VERSION,
    needsMigration: needsMigration(baseline),
    migrationsToApply: getMigrationsToApply(version),
    canMigrate: canMigrate(version),
  };
}
