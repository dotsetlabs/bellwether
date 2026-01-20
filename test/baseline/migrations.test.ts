/**
 * Tests for baseline migrations using CLI version.
 */

import { describe, it, expect } from 'vitest';
import {
  canMigrate,
  getMigrationsToApply,
  migrateBaseline,
  needsMigration,
  getMigrationInfo,
} from '../../src/baseline/migrations.js';
import { getBaselineVersion, parseVersion } from '../../src/baseline/version.js';

describe('canMigrate', () => {
  it('should return true when at same major version (no migration needed)', () => {
    const cliVersion = getBaselineVersion();
    const sameMajor = `${parseVersion(cliVersion).major}.0.0`;
    expect(canMigrate(sameMajor)).toBe(true);
  });

  it('should return true for current CLI version (no migration needed)', () => {
    const cliVersion = getBaselineVersion();
    expect(canMigrate(cliVersion)).toBe(true);
  });

  it('should return true for legacy format version 1.0.0 (migration exists)', () => {
    // Legacy format version 1.0.0 has migration to CLI version 0.x.x
    expect(canMigrate('1.0.0')).toBe(true);
  });

  it('should handle undefined source version', () => {
    expect(canMigrate(undefined)).toBe(true);
  });

  it('should handle legacy numeric version', () => {
    expect(canMigrate(1)).toBe(true);
  });
});

describe('getMigrationsToApply', () => {
  it('should return empty array when already at current version', () => {
    const cliVersion = getBaselineVersion();
    const migrations = getMigrationsToApply(cliVersion);
    expect(migrations).toEqual([]);
  });

  it('should return migration for legacy format version', () => {
    // Legacy format version should trigger migration '0' to convert to CLI version
    const migrations = getMigrationsToApply('1.0.0');
    expect(migrations).toContain('0');
  });

  it('should return empty array for same major version', () => {
    const cliVersion = getBaselineVersion();
    const parsed = parseVersion(cliVersion);
    const sameMajor = `${parsed.major}.${parsed.minor + 1}.0`;
    const migrations = getMigrationsToApply(sameMajor);
    expect(migrations).toEqual([]);
  });
});

describe('migrateBaseline', () => {
  it('should return unchanged baseline when already at current version', () => {
    const cliVersion = getBaselineVersion();
    const baseline = {
      version: cliVersion,
      server: { name: 'test', version: '1.0.0', protocolVersion: '2024-11-05' },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      assertions: [],
      summary: 'test',
      hash: 'abc123',
    };

    const result = migrateBaseline(baseline);
    expect(result.version).toBe(cliVersion);
  });

  it('should migrate from legacy format version 1.0.0 to CLI version', () => {
    const baseline = {
      version: '1.0.0',
      server: { name: 'test', version: '1.0.0', protocolVersion: '2024-11-05' },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      assertions: [],
      summary: 'test',
      hash: 'abc123',
    };

    const cliVersion = getBaselineVersion();
    const result = migrateBaseline(baseline);
    expect(result.version).toBe(cliVersion);
  });

  it('should migrate from legacy numeric version 1 to CLI version', () => {
    const baseline = {
      version: 1,
      server: { name: 'test', version: '1.0.0', protocolVersion: '2024-11-05' },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      assertions: [],
      summary: 'test',
      hash: 'abc123',
    };

    const cliVersion = getBaselineVersion();
    const result = migrateBaseline(baseline as Record<string, unknown>);
    expect(result.version).toBe(cliVersion);
  });

  it('should throw error when attempting to downgrade', () => {
    const baseline = {
      version: '99.0.0', // Future version
      server: { name: 'test', version: '1.0.0', protocolVersion: '2024-11-05' },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      assertions: [],
      summary: 'test',
      hash: 'abc123',
    };

    expect(() => migrateBaseline(baseline)).toThrow(/Cannot downgrade/);
  });
});

describe('needsMigration', () => {
  it('should return false when at current CLI version', () => {
    const cliVersion = getBaselineVersion();
    const baseline = { version: cliVersion };
    expect(needsMigration(baseline)).toBe(false);
  });

  it('should return true for legacy format version 1.0.0', () => {
    const baseline = { version: '1.0.0' };
    expect(needsMigration(baseline)).toBe(true);
  });

  it('should return true for legacy numeric version 1', () => {
    const baseline = { version: 1 };
    expect(needsMigration(baseline)).toBe(true);
  });

  it('should return false for same major version as CLI', () => {
    const cliVersion = getBaselineVersion();
    const parsed = parseVersion(cliVersion);
    const sameMajor = `${parsed.major}.${parsed.minor + 1}.0`;
    const baseline = { version: sameMajor };
    expect(needsMigration(baseline)).toBe(false);
  });

  it('should return true for different major version', () => {
    const baseline = { version: '99.0.0' };
    expect(needsMigration(baseline)).toBe(true);
  });
});

describe('getMigrationInfo', () => {
  it('should return info for current version baseline', () => {
    const cliVersion = getBaselineVersion();
    const baseline = { version: cliVersion };
    const info = getMigrationInfo(baseline);

    expect(info.currentVersion).toBe(cliVersion);
    expect(info.targetVersion).toBe(cliVersion);
    expect(info.needsMigration).toBe(false);
    expect(info.migrationsToApply).toEqual([]);
    expect(info.canMigrate).toBe(true);
  });

  it('should return info for legacy format version baseline', () => {
    const baseline = { version: '1.0.0' };
    const info = getMigrationInfo(baseline);

    const cliVersion = getBaselineVersion();
    expect(info.currentVersion).toBe('1.0.0');
    expect(info.targetVersion).toBe(cliVersion);
    expect(info.needsMigration).toBe(true);
    expect(info.canMigrate).toBe(true);
    expect(info.migrationsToApply).toContain('0');
  });

  it('should return info for undefined version', () => {
    const baseline = {};
    const info = getMigrationInfo(baseline);

    const cliVersion = getBaselineVersion();
    expect(info.targetVersion).toBe(cliVersion);
    // Undefined defaults to CLI version, so no migration needed
    expect(info.needsMigration).toBe(false);
  });
});
