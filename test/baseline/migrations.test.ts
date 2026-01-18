/**
 * Tests for baseline format migrations.
 */

import { describe, it, expect } from 'vitest';
import {
  canMigrate,
  getMigrationsToApply,
  migrateBaseline,
  needsMigration,
  getMigrationInfo,
} from '../../src/baseline/migrations.js';
import { BASELINE_FORMAT_VERSION } from '../../src/baseline/version.js';

describe('canMigrate', () => {
  it('should return true when source is older than target', () => {
    expect(canMigrate('0.9.0', '1.0.0')).toBe(true);
  });

  it('should return false when source equals target', () => {
    expect(canMigrate('1.0.0', '1.0.0')).toBe(false);
  });

  it('should return false when source is newer than target', () => {
    expect(canMigrate('2.0.0', '1.0.0')).toBe(false);
  });

  it('should handle undefined source version', () => {
    expect(canMigrate(undefined, '1.0.0')).toBe(false);
  });

  it('should handle legacy numeric version', () => {
    expect(canMigrate(1, '2.0.0')).toBe(true);
  });
});

describe('getMigrationsToApply', () => {
  it('should return empty array when already at target', () => {
    const migrations = getMigrationsToApply('1.0.0', '1.0.0');
    expect(migrations).toEqual([]);
  });

  it('should return migrations for version upgrade', () => {
    const migrations = getMigrationsToApply('0.9.0', '1.0.0');
    expect(migrations).toContain('1.0.0');
  });

  it('should return empty array when downgrading', () => {
    const migrations = getMigrationsToApply('2.0.0', '1.0.0');
    expect(migrations).toEqual([]);
  });

  it('should handle undefined version', () => {
    const migrations = getMigrationsToApply(undefined, '1.0.0');
    expect(migrations).toEqual([]);
  });
});

describe('migrateBaseline', () => {
  it('should return unchanged baseline when already at target version', () => {
    const baseline = {
      version: '1.0.0',
      metadata: { formatVersion: '1.0.0' },
      server: { name: 'test', version: '1.0.0', protocolVersion: '2024-11-05' },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      assertions: [],
      summary: 'test',
      hash: 'abc123',
    };

    const result = migrateBaseline(baseline, '1.0.0');
    expect(result.version).toBe('1.0.0');
  });

  it('should migrate from legacy numeric version to semver', () => {
    const baseline = {
      version: 1,
      metadata: { formatVersion: '1' },
      server: { name: 'test', version: '1.0.0', protocolVersion: '2024-11-05' },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      assertions: [],
      summary: 'test',
      hash: 'abc123',
    };

    const result = migrateBaseline(baseline as Record<string, unknown>, '1.0.0');
    expect(result.version).toBe('1.0.0');
  });

  it('should throw error when attempting to downgrade', () => {
    const baseline = {
      version: '2.0.0',
      metadata: { formatVersion: '2.0.0' },
      server: { name: 'test', version: '1.0.0', protocolVersion: '2024-11-05' },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      assertions: [],
      summary: 'test',
      hash: 'abc123',
    };

    expect(() => migrateBaseline(baseline, '1.0.0')).toThrow(/Cannot downgrade/);
  });
});

describe('needsMigration', () => {
  it('should return false when at current version', () => {
    const baseline = { version: BASELINE_FORMAT_VERSION };
    expect(needsMigration(baseline)).toBe(false);
  });

  it('should return true when at older version', () => {
    const baseline = { version: '0.9.0' };
    expect(needsMigration(baseline)).toBe(true);
  });

  it('should return false when at newer version', () => {
    const baseline = { version: '99.0.0' };
    expect(needsMigration(baseline)).toBe(false);
  });

  it('should handle legacy numeric version', () => {
    // Legacy numeric 1 should be treated as 1.0.0 which is current
    const baseline = { version: 1 };
    expect(needsMigration(baseline)).toBe(false);
  });
});

describe('getMigrationInfo', () => {
  it('should return info for current version baseline', () => {
    const baseline = { version: BASELINE_FORMAT_VERSION };
    const info = getMigrationInfo(baseline);

    expect(info.currentVersion).toBe(BASELINE_FORMAT_VERSION);
    expect(info.targetVersion).toBe(BASELINE_FORMAT_VERSION);
    expect(info.needsMigration).toBe(false);
    expect(info.migrationsToApply).toEqual([]);
    expect(info.canMigrate).toBe(false);
  });

  it('should return info for older version baseline', () => {
    const baseline = { version: '0.9.0' };
    const info = getMigrationInfo(baseline);

    expect(info.currentVersion).toBe('0.9.0');
    expect(info.targetVersion).toBe(BASELINE_FORMAT_VERSION);
    expect(info.needsMigration).toBe(true);
    expect(info.canMigrate).toBe(true);
  });

  it('should return info for undefined version', () => {
    const baseline = {};
    const info = getMigrationInfo(baseline);

    expect(info.currentVersion).toBe('1.0.0');
    expect(info.needsMigration).toBe(false);
  });
});
