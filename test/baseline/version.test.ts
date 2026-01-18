/**
 * Tests for baseline format versioning utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  BASELINE_FORMAT_VERSION,
  parseVersion,
  areVersionsCompatible,
  compareVersions,
  getCompatibilityWarning,
  checkVersionCompatibility,
  formatVersion,
  isCurrentVersion,
  isOlderVersion,
  isNewerVersion,
  BaselineVersionError,
} from '../../src/baseline/version.js';

describe('Version Constants', () => {
  it('should have a valid format version', () => {
    expect(BASELINE_FORMAT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(BASELINE_FORMAT_VERSION).toBe('1.0.0');
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

  it('should handle undefined', () => {
    const result = parseVersion(undefined);
    expect(result).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      raw: '1.0.0',
    });
  });

  it('should handle null', () => {
    const result = parseVersion(null as unknown as undefined);
    expect(result).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      raw: '1.0.0',
    });
  });

  it('should handle invalid strings', () => {
    const result = parseVersion('invalid');
    expect(result).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      raw: '1.0.0',
    });
  });
});

describe('areVersionsCompatible', () => {
  it('should return true for same major version', () => {
    const v1 = parseVersion('1.0.0');
    const v2 = parseVersion('1.2.3');
    expect(areVersionsCompatible(v1, v2)).toBe(true);
  });

  it('should return false for different major versions', () => {
    const v1 = parseVersion('1.0.0');
    const v2 = parseVersion('2.0.0');
    expect(areVersionsCompatible(v1, v2)).toBe(false);
  });

  it('should return true for identical versions', () => {
    const v1 = parseVersion('1.0.0');
    const v2 = parseVersion('1.0.0');
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
    const v1 = parseVersion('1.0.0');
    const v2 = parseVersion('2.0.0');
    expect(compareVersions(v1, v2)).toBe(-1);
  });

  it('should return 1 when v1 > v2 (major)', () => {
    const v1 = parseVersion('2.0.0');
    const v2 = parseVersion('1.0.0');
    expect(compareVersions(v1, v2)).toBe(1);
  });

  it('should return -1 when v1 < v2 (minor)', () => {
    const v1 = parseVersion('1.1.0');
    const v2 = parseVersion('1.2.0');
    expect(compareVersions(v1, v2)).toBe(-1);
  });

  it('should return 1 when v1 > v2 (minor)', () => {
    const v1 = parseVersion('1.2.0');
    const v2 = parseVersion('1.1.0');
    expect(compareVersions(v1, v2)).toBe(1);
  });

  it('should return -1 when v1 < v2 (patch)', () => {
    const v1 = parseVersion('1.1.1');
    const v2 = parseVersion('1.1.2');
    expect(compareVersions(v1, v2)).toBe(-1);
  });

  it('should return 1 when v1 > v2 (patch)', () => {
    const v1 = parseVersion('1.1.2');
    const v2 = parseVersion('1.1.1');
    expect(compareVersions(v1, v2)).toBe(1);
  });
});

describe('getCompatibilityWarning', () => {
  it('should return null for identical versions', () => {
    const v1 = parseVersion('1.0.0');
    const v2 = parseVersion('1.0.0');
    expect(getCompatibilityWarning(v1, v2)).toBeNull();
  });

  it('should return warning for different major versions', () => {
    const v1 = parseVersion('1.0.0');
    const v2 = parseVersion('2.0.0');
    const warning = getCompatibilityWarning(v1, v2);
    expect(warning).toContain('incompatible');
    expect(warning).toContain('v1.0.0');
    expect(warning).toContain('v2.0.0');
  });

  it('should return warning for different minor versions', () => {
    const v1 = parseVersion('1.0.0');
    const v2 = parseVersion('1.1.0');
    const warning = getCompatibilityWarning(v1, v2);
    expect(warning).toContain('differ');
    expect(warning).not.toContain('incompatible');
  });

  it('should return warning for different patch versions', () => {
    const v1 = parseVersion('1.0.0');
    const v2 = parseVersion('1.0.1');
    const warning = getCompatibilityWarning(v1, v2);
    expect(warning).toContain('differ');
    expect(warning).not.toContain('incompatible');
  });
});

describe('checkVersionCompatibility', () => {
  it('should return compatible for same major version', () => {
    const result = checkVersionCompatibility('1.0.0', '1.2.0');
    expect(result.compatible).toBe(true);
    expect(result.sourceVersion).toBe('1.0.0');
    expect(result.targetVersion).toBe('1.2.0');
  });

  it('should return incompatible for different major versions', () => {
    const result = checkVersionCompatibility('1.0.0', '2.0.0');
    expect(result.compatible).toBe(false);
    expect(result.warning).toContain('incompatible');
  });

  it('should handle undefined versions', () => {
    const result = checkVersionCompatibility(undefined, undefined);
    expect(result.compatible).toBe(true);
    expect(result.sourceVersion).toBe('1.0.0');
    expect(result.targetVersion).toBe('1.0.0');
  });
});

describe('formatVersion', () => {
  it('should format string version', () => {
    expect(formatVersion('1.2.3')).toBe('v1.2.3');
  });

  it('should format numeric version', () => {
    expect(formatVersion(1)).toBe('v1.0.0');
  });

  it('should format undefined', () => {
    expect(formatVersion(undefined)).toBe('v1.0.0');
  });
});

describe('isCurrentVersion', () => {
  it('should return true for current version', () => {
    expect(isCurrentVersion(BASELINE_FORMAT_VERSION)).toBe(true);
  });

  it('should return false for older version', () => {
    expect(isCurrentVersion('0.9.0')).toBe(false);
  });

  it('should return false for newer version', () => {
    expect(isCurrentVersion('2.0.0')).toBe(false);
  });
});

describe('isOlderVersion', () => {
  it('should return false for current version', () => {
    expect(isOlderVersion(BASELINE_FORMAT_VERSION)).toBe(false);
  });

  it('should return true for older version', () => {
    expect(isOlderVersion('0.9.0')).toBe(true);
  });

  it('should return false for newer version', () => {
    expect(isNewerVersion('2.0.0')).toBe(true);
  });
});

describe('isNewerVersion', () => {
  it('should return false for current version', () => {
    expect(isNewerVersion(BASELINE_FORMAT_VERSION)).toBe(false);
  });

  it('should return false for older version', () => {
    expect(isNewerVersion('0.9.0')).toBe(false);
  });

  it('should return true for newer version', () => {
    expect(isNewerVersion('2.0.0')).toBe(true);
  });
});

describe('BaselineVersionError', () => {
  it('should create error with version info', () => {
    const error = new BaselineVersionError('Test message', '1.0.0', '2.0.0');
    expect(error.message).toBe('Test message');
    expect(error.sourceVersion).toBe('1.0.0');
    expect(error.targetVersion).toBe('2.0.0');
    expect(error.name).toBe('BaselineVersionError');
  });

  it('should be instance of Error', () => {
    const error = new BaselineVersionError('Test', '1.0.0', '2.0.0');
    expect(error).toBeInstanceOf(Error);
  });
});
