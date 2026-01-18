/**
 * Baseline format migrations.
 *
 * This module handles upgrading baselines from older formats to the current format.
 * Each migration function transforms a baseline from one version to the next.
 *
 * Migration Strategy:
 * - Migrations are keyed by their TARGET version
 * - Each migration upgrades from the immediately previous version
 * - Migrations are applied sequentially in version order
 * - Downgrading is not supported
 */

import type { BehavioralBaseline } from './types.js';
import {
  BASELINE_FORMAT_VERSION,
  parseVersion,
  compareVersions,
  type FormatVersion,
} from './version.js';

/**
 * A migration function that transforms a baseline from one version to the next.
 * The input is the raw baseline object (may have any shape from older versions).
 * The output should conform to the target version's expected shape.
 */
type MigrationFn = (baseline: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registry of migrations keyed by target version.
 *
 * When adding a new migration:
 * 1. Add an entry with the target version as the key
 * 2. Implement the migration function to transform from previous version
 * 3. Update BASELINE_FORMAT_VERSION in version.ts
 *
 * Example for future migration from 1.x to 2.0.0:
 *
 * '2.0.0': (baseline) => {
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
  // Migration from legacy numeric version (1) to semver (1.0.0)
  '1.0.0': (baseline) => {
    const version = baseline.version;

    // Already at 1.0.0 or newer semver format
    if (typeof version === 'string' && version.includes('.')) {
      return baseline;
    }

    // Migrate from legacy numeric version
    return {
      ...baseline,
      version: '1.0.0',
    };
  },

  // Future migrations would be added here:
  // '2.0.0': (baseline) => { ... },
  // '2.1.0': (baseline) => { ... },
};

/**
 * Get all migration versions in sorted order.
 */
function getMigrationVersions(): FormatVersion[] {
  return Object.keys(MIGRATIONS)
    .map(parseVersion)
    .sort(compareVersions);
}

/**
 * Check if a baseline can be migrated to the target version.
 *
 * Migration is possible if:
 * - Source version is older than target version
 * - All intermediate migrations exist
 *
 * @param fromVersion - Source version (string, number, or undefined)
 * @param toVersion - Target version (defaults to current format version)
 * @returns true if migration is possible
 */
export function canMigrate(
  fromVersion: string | number | undefined,
  toVersion: string = BASELINE_FORMAT_VERSION
): boolean {
  const from = parseVersion(fromVersion);
  const to = parseVersion(toVersion);

  // Cannot migrate to older or same version
  if (compareVersions(from, to) >= 0) {
    return false;
  }

  // Check that we have migrations for all required major version jumps
  const migrations = getMigrationVersions();

  for (const migration of migrations) {
    // Skip migrations older than or equal to source
    if (compareVersions(migration, from) <= 0) {
      continue;
    }

    // Stop if we've passed the target
    if (compareVersions(migration, to) > 0) {
      break;
    }

    // Check migration exists for this major version
    if (migration.major > from.major && !MIGRATIONS[migration.raw]) {
      return false;
    }
  }

  return true;
}

/**
 * Get the list of migrations that would be applied.
 *
 * @param fromVersion - Source version
 * @param toVersion - Target version (defaults to current format version)
 * @returns Array of version strings for migrations that would be applied
 */
export function getMigrationsToApply(
  fromVersion: string | number | undefined,
  toVersion: string = BASELINE_FORMAT_VERSION
): string[] {
  const from = parseVersion(fromVersion);
  const to = parseVersion(toVersion);

  const migrations = getMigrationVersions();
  const toApply: string[] = [];

  for (const migration of migrations) {
    // Skip migrations older than or equal to source
    if (compareVersions(migration, from) <= 0) {
      continue;
    }

    // Stop if we've passed the target
    if (compareVersions(migration, to) > 0) {
      break;
    }

    toApply.push(migration.raw);
  }

  return toApply;
}

/**
 * Migrate a baseline to the target version.
 *
 * Applies all necessary migrations in sequence from the source version
 * to the target version.
 *
 * @param baseline - The baseline object to migrate (can be any version)
 * @param targetVersion - Target version (defaults to current format version)
 * @returns Migrated baseline conforming to BehavioralBaseline interface
 * @throws Error if migration is not possible (e.g., downgrade attempt)
 */
export function migrateBaseline(
  baseline: Record<string, unknown>,
  targetVersion: string = BASELINE_FORMAT_VERSION
): BehavioralBaseline {
  const sourceVersion = baseline.version as string | number | undefined;
  const from = parseVersion(sourceVersion);
  const to = parseVersion(targetVersion);

  // Already at target version - but still normalize if version format differs
  // (e.g., numeric 1 should become string '1.0.0')
  if (compareVersions(from, to) === 0) {
    // Check if version needs normalization
    if (baseline.version !== to.raw) {
      return {
        ...baseline,
        version: to.raw,
      } as unknown as BehavioralBaseline;
    }
    return baseline as unknown as BehavioralBaseline;
  }

  // Cannot downgrade
  if (compareVersions(from, to) > 0) {
    throw new Error(
      `Cannot downgrade baseline from v${from.raw} to v${to.raw}. ` +
        `Downgrading baselines is not supported.`
    );
  }

  // Apply migrations in sequence
  let current = { ...baseline };
  const migrationsToApply = getMigrationsToApply(sourceVersion, targetVersion);

  for (const version of migrationsToApply) {
    const migration = MIGRATIONS[version];
    if (migration) {
      current = migration(current);
    }
  }

  // Ensure version is set to target
  current.version = to.raw;

  return current as unknown as BehavioralBaseline;
}

/**
 * Check if a baseline needs migration.
 *
 * @param baseline - The baseline to check
 * @returns true if the baseline version is older than the current format version
 */
export function needsMigration(baseline: Record<string, unknown>): boolean {
  const version = baseline.version as string | number | undefined;
  const from = parseVersion(version);
  const current = parseVersion(BASELINE_FORMAT_VERSION);

  return compareVersions(from, current) < 0;
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
  const to = parseVersion(BASELINE_FORMAT_VERSION);

  return {
    currentVersion: from.raw,
    targetVersion: to.raw,
    needsMigration: compareVersions(from, to) < 0,
    migrationsToApply: getMigrationsToApply(version, BASELINE_FORMAT_VERSION),
    canMigrate: canMigrate(version, BASELINE_FORMAT_VERSION),
  };
}
