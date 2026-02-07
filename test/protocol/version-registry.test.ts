import { describe, it, expect } from 'vitest';
import {
  getFeatureFlags,
  getSharedFeatureFlags,
  isKnownProtocolVersion,
  getFeatureIntroducedVersion,
  getExcludedFeatureNames,
  MCP_PROTOCOL_VERSIONS,
} from '../../src/protocol/index.js';

describe('version-registry', () => {
  describe('isKnownProtocolVersion', () => {
    it('returns true for known versions', () => {
      expect(isKnownProtocolVersion('2024-11-05')).toBe(true);
      expect(isKnownProtocolVersion('2025-03-26')).toBe(true);
      expect(isKnownProtocolVersion('2025-06-18')).toBe(true);
      expect(isKnownProtocolVersion('2025-11-25')).toBe(true);
    });

    it('returns false for unknown versions', () => {
      expect(isKnownProtocolVersion('2023-01-01')).toBe(false);
      expect(isKnownProtocolVersion('2026-01-01')).toBe(false);
      expect(isKnownProtocolVersion('invalid')).toBe(false);
    });
  });

  describe('getFeatureFlags', () => {
    it('returns all false for base features at 2024-11-05', () => {
      const flags = getFeatureFlags('2024-11-05');
      expect(flags.toolAnnotations).toBe(false);
      expect(flags.entityTitles).toBe(false);
      expect(flags.completions).toBe(false);
      expect(flags.resourceAnnotations).toBe(false);
      expect(flags.structuredOutput).toBe(false);
      expect(flags.serverInstructions).toBe(false);
      expect(flags.httpVersionHeader).toBe(false);
      expect(flags.tasks).toBe(false);
      expect(flags.icons).toBe(false);
    });

    it('returns correct flags for 2025-03-26', () => {
      const flags = getFeatureFlags('2025-03-26');
      expect(flags.toolAnnotations).toBe(true);
      expect(flags.entityTitles).toBe(true);
      expect(flags.completions).toBe(true);
      expect(flags.resourceAnnotations).toBe(true);
      expect(flags.structuredOutput).toBe(false);
      expect(flags.serverInstructions).toBe(false);
      expect(flags.httpVersionHeader).toBe(false);
      expect(flags.tasks).toBe(false);
      expect(flags.icons).toBe(false);
    });

    it('returns correct flags for 2025-06-18', () => {
      const flags = getFeatureFlags('2025-06-18');
      expect(flags.toolAnnotations).toBe(true);
      expect(flags.entityTitles).toBe(true);
      expect(flags.completions).toBe(true);
      expect(flags.resourceAnnotations).toBe(true);
      expect(flags.structuredOutput).toBe(true);
      expect(flags.serverInstructions).toBe(true);
      expect(flags.httpVersionHeader).toBe(true);
      expect(flags.tasks).toBe(false);
      expect(flags.icons).toBe(false);
    });

    it('returns all true for 2025-11-25', () => {
      const flags = getFeatureFlags('2025-11-25');
      expect(flags.toolAnnotations).toBe(true);
      expect(flags.entityTitles).toBe(true);
      expect(flags.completions).toBe(true);
      expect(flags.resourceAnnotations).toBe(true);
      expect(flags.structuredOutput).toBe(true);
      expect(flags.serverInstructions).toBe(true);
      expect(flags.httpVersionHeader).toBe(true);
      expect(flags.tasks).toBe(true);
      expect(flags.icons).toBe(true);
    });

    it('falls back to oldest flags for unknown older version', () => {
      const flags = getFeatureFlags('2023-01-01');
      const oldest = getFeatureFlags('2024-11-05');
      expect(flags).toEqual(oldest);
    });

    it('falls back to latest flags for unknown newer version', () => {
      const flags = getFeatureFlags('2026-12-31');
      const latest = getFeatureFlags('2025-11-25');
      expect(flags).toEqual(latest);
    });

    it('returns a copy (not a reference) of feature flags', () => {
      const flags1 = getFeatureFlags('2025-11-25');
      const flags2 = getFeatureFlags('2025-11-25');
      expect(flags1).toEqual(flags2);
      expect(flags1).not.toBe(flags2);
    });
  });

  describe('getSharedFeatureFlags', () => {
    it('returns intersection of two versions (oldest wins)', () => {
      const shared = getSharedFeatureFlags('2024-11-05', '2025-11-25');
      const oldest = getFeatureFlags('2024-11-05');
      expect(shared).toEqual(oldest);
    });

    it('returns full flags when both versions are the same', () => {
      const shared = getSharedFeatureFlags('2025-11-25', '2025-11-25');
      const latest = getFeatureFlags('2025-11-25');
      expect(shared).toEqual(latest);
    });

    it('returns correct intersection for adjacent versions', () => {
      const shared = getSharedFeatureFlags('2025-03-26', '2025-06-18');
      // Both support toolAnnotations, entityTitles, completions, resourceAnnotations
      expect(shared.toolAnnotations).toBe(true);
      expect(shared.entityTitles).toBe(true);
      expect(shared.completions).toBe(true);
      expect(shared.resourceAnnotations).toBe(true);
      // Only 2025-06-18 supports these
      expect(shared.structuredOutput).toBe(false);
      expect(shared.serverInstructions).toBe(false);
      expect(shared.httpVersionHeader).toBe(false);
      // Neither supports tasks/icons
      expect(shared.tasks).toBe(false);
      expect(shared.icons).toBe(false);
    });

    it('is commutative (order does not matter)', () => {
      const shared1 = getSharedFeatureFlags('2024-11-05', '2025-06-18');
      const shared2 = getSharedFeatureFlags('2025-06-18', '2024-11-05');
      expect(shared1).toEqual(shared2);
    });
  });

  describe('getFeatureIntroducedVersion', () => {
    it('returns 2025-03-26 for toolAnnotations', () => {
      expect(getFeatureIntroducedVersion('toolAnnotations')).toBe('2025-03-26');
    });

    it('returns 2025-03-26 for entityTitles', () => {
      expect(getFeatureIntroducedVersion('entityTitles')).toBe('2025-03-26');
    });

    it('returns 2025-06-18 for structuredOutput', () => {
      expect(getFeatureIntroducedVersion('structuredOutput')).toBe('2025-06-18');
    });

    it('returns 2025-11-25 for tasks', () => {
      expect(getFeatureIntroducedVersion('tasks')).toBe('2025-11-25');
    });
  });

  describe('getExcludedFeatureNames', () => {
    it('returns all features for oldest version', () => {
      const excluded = getExcludedFeatureNames('2024-11-05');
      expect(excluded).toContain('tool annotations');
      expect(excluded).toContain('structured output');
      expect(excluded).toContain('tasks');
      expect(excluded.length).toBe(9);
    });

    it('returns empty for latest version', () => {
      const excluded = getExcludedFeatureNames('2025-11-25');
      expect(excluded).toEqual([]);
    });

    it('returns only newer features for middle version', () => {
      const excluded = getExcludedFeatureNames('2025-03-26');
      expect(excluded).not.toContain('tool annotations');
      expect(excluded).toContain('structured output');
      expect(excluded).toContain('tasks');
    });
  });

  describe('MCP_PROTOCOL_VERSIONS', () => {
    it('contains exactly 4 versions', () => {
      expect(MCP_PROTOCOL_VERSIONS).toHaveLength(4);
    });

    it('is sorted chronologically', () => {
      for (let i = 1; i < MCP_PROTOCOL_VERSIONS.length; i++) {
        expect(MCP_PROTOCOL_VERSIONS[i] > MCP_PROTOCOL_VERSIONS[i - 1]).toBe(true);
      }
    });
  });
});
