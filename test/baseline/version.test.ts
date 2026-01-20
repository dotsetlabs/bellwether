/**
 * Tests for baseline versioning utilities using CLI version.
 */

import { describe, it, expect } from 'vitest';
import {
  getBaselineVersion,
  parseVersion,
  areVersionsCompatible,
  compareVersions,
  getCompatibilityWarning,
  checkVersionCompatibility,
  formatVersion,
  isCurrentVersion,
  isOlderVersion,
  isNewerVersion,
  requiresMigration,
  BaselineVersionError,
} from '../../src/baseline/version.js';

describe('getBaselineVersion', () => {
  it('should return CLI version', () => {
    const version = getBaselineVersion();
    // CLI version should be semver format
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    // Currently CLI is 0.x.x
    expect(version.startsWith('0.')).toBe(true);
  });
});

describe('parseVersion', () => {
  it('should parse full semver string', () => {
    const result = parseVersion('1.2.3');
    expect(result).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      raw: '1.2.3',
    });
  });

  it('should parse partial semver string', () => {
    const result = parseVersion('1.2');
    expect(result).toEqual({
      major: 1,
      minor: 2,
      patch: 0,
      raw: '1.2.0',
    });
  });

  it('should parse single number string', () => {
    const result = parseVersion('2');
    expect(result).toEqual({
      major: 2,
      minor: 0,
      patch: 0,
      raw: '2.0.0',
    });
  });

  it('should handle legacy numeric version', () => {
    const result = parseVersion(1);
    expect(result).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      raw: '1.0.0',
    });
  });

  it('should handle undefined by returning current CLI version', () => {
    const result = parseVersion(undefined);
    const cliVersion = getBaselineVersion();
    const parsed = parseVersion(cliVersion);
    expect(result.major).toBe(parsed.major);
    expect(result.minor).toBe(parsed.minor);
    expect(result.patch).toBe(parsed.patch);
  });

  it('should handle null', () => {
    const result = parseVersion(null as unknown as undefined);
    const cliVersion = getBaselineVersion();
    const parsed = parseVersion(cliVersion);
    expect(result.major).toBe(parsed.major);
  });

  it('should handle invalid strings', () => {
    const result = parseVersion('invalid');
    expect(result).toEqual({
      major: 0,
      minor: 0,
      patch: 0,
      raw: '0.0.0',
    });
  });
});

describe('areVersionsCompatible', () => {
  it('should return true for same major version', () => {
    const v1 = parseVersion('0.5.0');
    const v2 = parseVersion('0.6.3');
    expect(areVersionsCompatible(v1, v2)).toBe(true);
  });

  it('should return false for different major versions', () => {
    const v1 = parseVersion('0.5.0');
    const v2 = parseVersion('1.0.0');
    expect(areVersionsCompatible(v1, v2)).toBe(false);
  });

  it('should return true for identical versions', () => {
    const v1 = parseVersion('0.5.4');
    const v2 = parseVersion('0.5.4');
    expect(areVersionsCompatible(v1, v2)).toBe(true);
  });
});

describe('compareVersions', () => {
  it('should return 0 for equal versions', () => {
    const v1 = parseVersion('1.2.3');
    const v2 = parseVersion('1.2.3');
    expect(compareVersions(v1, v2)).toBe(0);
  });

  it('should return -1 when v1 < v2 (major)', () => {
    const v1 = parseVersion('0.5.0');
    const v2 = parseVersion('1.0.0');
    expect(compareVersions(v1, v2)).toBe(-1);
  });

  it('should return 1 when v1 > v2 (major)', () => {
    const v1 = parseVersion('2.0.0');
    const v2 = parseVersion('1.0.0');
    expect(compareVersions(v1, v2)).toBe(1);
  });

  it('should return -1 when v1 < v2 (minor)', () => {
    const v1 = parseVersion('0.5.0');
    const v2 = parseVersion('0.6.0');
    expect(compareVersions(v1, v2)).toBe(-1);
  });

  it('should return 1 when v1 > v2 (minor)', () => {
    const v1 = parseVersion('0.6.0');
    const v2 = parseVersion('0.5.0');
    expect(compareVersions(v1, v2)).toBe(1);
  });

  it('should return -1 when v1 < v2 (patch)', () => {
    const v1 = parseVersion('0.5.1');
    const v2 = parseVersion('0.5.2');
    expect(compareVersions(v1, v2)).toBe(-1);
  });

  it('should return 1 when v1 > v2 (patch)', () => {
    const v1 = parseVersion('0.5.2');
    const v2 = parseVersion('0.5.1');
    expect(compareVersions(v1, v2)).toBe(1);
  });
});

describe('getCompatibilityWarning', () => {
  it('should return null for identical versions', () => {
    const v1 = parseVersion('0.5.4');
    const v2 = parseVersion('0.5.4');
    expect(getCompatibilityWarning(v1, v2)).toBeNull();
  });

  it('should return warning for different major versions', () => {
    const v1 = parseVersion('0.5.0');
    const v2 = parseVersion('1.0.0');
    const warning = getCompatibilityWarning(v1, v2);
    expect(warning).toContain('incompatible');
    expect(warning).toContain('v0.5.0');
    expect(warning).toContain('v1.0.0');
  });

  it('should return warning for different minor versions', () => {
    const v1 = parseVersion('0.5.0');
    const v2 = parseVersion('0.6.0');
    const warning = getCompatibilityWarning(v1, v2);
    expect(warning).toContain('differ');
    expect(warning).not.toContain('incompatible');
  });

  it('should return warning for different patch versions', () => {
    const v1 = parseVersion('0.5.0');
    const v2 = parseVersion('0.5.1');
    const warning = getCompatibilityWarning(v1, v2);
    expect(warning).toContain('differ');
    expect(warning).not.toContain('incompatible');
  });
});

describe('checkVersionCompatibility', () => {
  it('should return compatible for same major version', () => {
    const result = checkVersionCompatibility('0.5.0', '0.6.0');
    expect(result.compatible).toBe(true);
    expect(result.sourceVersion).toBe('0.5.0');
    expect(result.targetVersion).toBe('0.6.0');
  });

  it('should return incompatible for different major versions', () => {
    const result = checkVersionCompatibility('0.5.0', '1.0.0');
    expect(result.compatible).toBe(false);
    expect(result.warning).toContain('incompatible');
  });

  it('should handle undefined versions (uses CLI version)', () => {
    const result = checkVersionCompatibility(undefined, undefined);
    expect(result.compatible).toBe(true);
    // Both should resolve to CLI version
    const cliVersion = getBaselineVersion();
    expect(result.sourceVersion).toBe(parseVersion(cliVersion).raw);
    expect(result.targetVersion).toBe(parseVersion(cliVersion).raw);
  });
});

describe('formatVersion', () => {
  it('should format string version', () => {
    expect(formatVersion('0.5.4')).toBe('v0.5.4');
  });

  it('should format numeric version', () => {
    expect(formatVersion(1)).toBe('v1.0.0');
  });

  it('should format undefined as CLI version', () => {
    const result = formatVersion(undefined);
    expect(result.startsWith('v')).toBe(true);
    expect(result).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});

describe('isCurrentVersion', () => {
  it('should return true for current CLI version', () => {
    const cliVersion = getBaselineVersion();
    expect(isCurrentVersion(cliVersion)).toBe(true);
  });

  it('should return false for older version', () => {
    // Use a definitely older version than any CLI version
    expect(isCurrentVersion('0.0.1')).toBe(false);
  });

  it('should return false for newer version', () => {
    expect(isCurrentVersion('99.0.0')).toBe(false);
  });
});

describe('isOlderVersion', () => {
  it('should return false for current CLI version', () => {
    const cliVersion = getBaselineVersion();
    expect(isOlderVersion(cliVersion)).toBe(false);
  });

  it('should return true for older version', () => {
    expect(isOlderVersion('0.0.1')).toBe(true);
  });

  it('should return false for newer version', () => {
    expect(isOlderVersion('99.0.0')).toBe(false);
  });
});

describe('isNewerVersion', () => {
  it('should return false for current CLI version', () => {
    const cliVersion = getBaselineVersion();
    expect(isNewerVersion(cliVersion)).toBe(false);
  });

  it('should return false for older version', () => {
    expect(isNewerVersion('0.0.1')).toBe(false);
  });

  it('should return true for newer version', () => {
    expect(isNewerVersion('99.0.0')).toBe(true);
  });
});

describe('requiresMigration', () => {
  it('should return false for current CLI major version', () => {
    const cliVersion = getBaselineVersion();
    expect(requiresMigration(cliVersion)).toBe(false);
  });

  it('should return true for different major version', () => {
    // Major version 99 is different from current CLI (0.x.x)
    expect(requiresMigration('99.0.0')).toBe(true);
  });

  it('should return false for same major different minor', () => {
    const cliVersion = getBaselineVersion();
    const parsed = parseVersion(cliVersion);
    const sameMinorDifferentPatch = `${parsed.major}.${parsed.minor + 1}.0`;
    expect(requiresMigration(sameMinorDifferentPatch)).toBe(false);
  });
});

describe('BaselineVersionError', () => {
  it('should create error with version info', () => {
    const error = new BaselineVersionError('Test message', '0.5.0', '1.0.0');
    expect(error.message).toBe('Test message');
    expect(error.sourceVersion).toBe('0.5.0');
    expect(error.targetVersion).toBe('1.0.0');
    expect(error.name).toBe('BaselineVersionError');
  });

  it('should be instance of Error', () => {
    const error = new BaselineVersionError('Test', '0.5.0', '1.0.0');
    expect(error).toBeInstanceOf(Error);
  });
});
