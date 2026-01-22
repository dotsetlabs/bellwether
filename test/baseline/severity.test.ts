/**
 * Tests for baseline severity configuration and filtering.
 */

import { describe, it, expect } from 'vitest';
import {
  compareSeverity,
  severityMeetsThreshold,
  applyAspectOverride,
  applySeverityConfig,
  shouldFailOnDiff,
  filterByMinimumSeverity,
  type BehavioralDiff,
  type BehaviorChange,
  type SeverityConfig,
  type ChangeSeverity,
} from '../../src/baseline/index.js';

// Helper to create a mock diff
function createMockDiff(changes: Partial<BehaviorChange>[] = []): BehavioralDiff {
  const behaviorChanges: BehaviorChange[] = changes.map((c, i) => ({
    tool: c.tool ?? `tool_${i}`,
    aspect: c.aspect ?? 'schema',
    before: c.before ?? 'before',
    after: c.after ?? 'after',
    severity: c.severity ?? 'info',
    description: c.description ?? `Change ${i}`,
  }));

  let breakingCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const change of behaviorChanges) {
    switch (change.severity) {
      case 'breaking':
        breakingCount++;
        break;
      case 'warning':
        warningCount++;
        break;
      case 'info':
        infoCount++;
        break;
    }
  }

  const severity: ChangeSeverity =
    breakingCount > 0 ? 'breaking' : warningCount > 0 ? 'warning' : infoCount > 0 ? 'info' : 'none';

  return {
    toolsAdded: [],
    toolsRemoved: [],
    toolsModified: [],
    behaviorChanges,
    severity,
    breakingCount,
    warningCount,
    infoCount,
    summary: 'Test diff',
    versionCompatibility: {
      compatible: true,
      sourceVersion: '1.0.0',
      targetVersion: '1.0.0',
    },
  };
}

describe('compareSeverity', () => {
  it('should return negative when a < b', () => {
    expect(compareSeverity('none', 'info')).toBeLessThan(0);
    expect(compareSeverity('info', 'warning')).toBeLessThan(0);
    expect(compareSeverity('warning', 'breaking')).toBeLessThan(0);
    expect(compareSeverity('none', 'breaking')).toBeLessThan(0);
  });

  it('should return positive when a > b', () => {
    expect(compareSeverity('info', 'none')).toBeGreaterThan(0);
    expect(compareSeverity('warning', 'info')).toBeGreaterThan(0);
    expect(compareSeverity('breaking', 'warning')).toBeGreaterThan(0);
    expect(compareSeverity('breaking', 'none')).toBeGreaterThan(0);
  });

  it('should return zero when a equals b', () => {
    expect(compareSeverity('none', 'none')).toBe(0);
    expect(compareSeverity('info', 'info')).toBe(0);
    expect(compareSeverity('warning', 'warning')).toBe(0);
    expect(compareSeverity('breaking', 'breaking')).toBe(0);
  });
});

describe('severityMeetsThreshold', () => {
  it('should return true when severity meets threshold', () => {
    expect(severityMeetsThreshold('breaking', 'breaking')).toBe(true);
    expect(severityMeetsThreshold('breaking', 'warning')).toBe(true);
    expect(severityMeetsThreshold('breaking', 'info')).toBe(true);
    expect(severityMeetsThreshold('breaking', 'none')).toBe(true);
  });

  it('should return false when severity is below threshold', () => {
    expect(severityMeetsThreshold('warning', 'breaking')).toBe(false);
    expect(severityMeetsThreshold('info', 'warning')).toBe(false);
    expect(severityMeetsThreshold('none', 'info')).toBe(false);
  });

  it('should return true when severity equals threshold', () => {
    expect(severityMeetsThreshold('warning', 'warning')).toBe(true);
    expect(severityMeetsThreshold('info', 'info')).toBe(true);
  });
});

describe('applyAspectOverride', () => {
  const change: BehaviorChange = {
    tool: 'test_tool',
    aspect: 'schema',
    before: 'old',
    after: 'new',
    severity: 'breaking',
    description: 'Schema changed',
  };

  it('should return original severity when no overrides', () => {
    expect(applyAspectOverride(change, undefined)).toBe('breaking');
    expect(applyAspectOverride(change, {})).toBe('breaking');
  });

  it('should apply override when aspect matches', () => {
    expect(applyAspectOverride(change, { schema: 'warning' })).toBe('warning');
    expect(applyAspectOverride(change, { schema: 'info' })).toBe('info');
    expect(applyAspectOverride(change, { schema: 'none' })).toBe('none');
  });

  it('should not apply override for different aspect', () => {
    expect(applyAspectOverride(change, { description: 'warning' })).toBe('breaking');
    expect(applyAspectOverride(change, { error_handling: 'info' })).toBe('breaking');
  });

  it('should handle all aspect types', () => {
    const descriptionChange: BehaviorChange = { ...change, aspect: 'description' };
    const errorChange: BehaviorChange = { ...change, aspect: 'error_handling' };
    const securityChange: BehaviorChange = { ...change, aspect: 'security' };

    expect(applyAspectOverride(descriptionChange, { description: 'info' })).toBe('info');
    expect(applyAspectOverride(errorChange, { error_handling: 'warning' })).toBe('warning');
    expect(applyAspectOverride(securityChange, { security: 'breaking' })).toBe('breaking');
  });
});

describe('applySeverityConfig', () => {
  it('should filter by minimum severity', () => {
    const diff = createMockDiff([
      { severity: 'breaking', aspect: 'schema' },
      { severity: 'warning', aspect: 'description' },
      { severity: 'info', aspect: 'description' },
    ]);

    const config: SeverityConfig = {
      minimumSeverity: 'warning',
      failOnSeverity: 'breaking',
    };

    const filtered = applySeverityConfig(diff, config);

    expect(filtered.behaviorChanges.length).toBe(2);
    expect(filtered.behaviorChanges.some(c => c.severity === 'info')).toBe(false);
  });

  it('should suppress warnings when configured', () => {
    const diff = createMockDiff([
      { severity: 'breaking', aspect: 'schema' },
      { severity: 'warning', aspect: 'description' },
      { severity: 'warning', aspect: 'error_handling' },
      { severity: 'info', aspect: 'description' },
    ]);

    const config: SeverityConfig = {
      minimumSeverity: 'none',
      failOnSeverity: 'breaking',
      suppressWarnings: true,
    };

    const filtered = applySeverityConfig(diff, config);

    expect(filtered.behaviorChanges.some(c => c.severity === 'warning')).toBe(false);
    expect(filtered.warningCount).toBe(0);
    expect(filtered.breakingCount).toBe(1);
  });

  it('should apply aspect overrides', () => {
    const diff = createMockDiff([
      { severity: 'breaking', aspect: 'schema', tool: 'tool1' },
      { severity: 'breaking', aspect: 'description', tool: 'tool2' },
    ]);

    const config: SeverityConfig = {
      minimumSeverity: 'none',
      failOnSeverity: 'breaking',
      aspectOverrides: {
        description: 'info', // Downgrade description changes
      },
    };

    const filtered = applySeverityConfig(diff, config);

    const schemaChange = filtered.behaviorChanges.find(c => c.aspect === 'schema');
    const descChange = filtered.behaviorChanges.find(c => c.aspect === 'description');

    expect(schemaChange?.severity).toBe('breaking');
    expect(descChange?.severity).toBe('info');
  });

  it('should recalculate severity counts after filtering', () => {
    const diff = createMockDiff([
      { severity: 'breaking', aspect: 'schema' },
      { severity: 'warning', aspect: 'description' },
      { severity: 'info', aspect: 'description' },
    ]);

    const config: SeverityConfig = {
      minimumSeverity: 'warning',
      failOnSeverity: 'breaking',
    };

    const filtered = applySeverityConfig(diff, config);

    expect(filtered.breakingCount).toBe(1);
    expect(filtered.warningCount).toBe(1);
    expect(filtered.infoCount).toBe(0);
    expect(filtered.severity).toBe('breaking');
  });

  it('should update overall severity based on remaining changes', () => {
    const diff = createMockDiff([
      { severity: 'breaking', aspect: 'description' },
      { severity: 'warning', aspect: 'schema' },
      { severity: 'info', aspect: 'error_handling' },
    ]);

    // Downgrade all breaking description changes to info
    const config: SeverityConfig = {
      minimumSeverity: 'none',
      failOnSeverity: 'breaking',
      aspectOverrides: {
        description: 'info',
      },
    };

    const filtered = applySeverityConfig(diff, config);

    // Original had breaking from description, now downgraded to info
    // Only warning remains as highest
    expect(filtered.severity).toBe('warning');
  });

  it('should return none severity when all changes filtered', () => {
    const diff = createMockDiff([
      { severity: 'info', aspect: 'description' },
      { severity: 'info', aspect: 'error_handling' },
    ]);

    const config: SeverityConfig = {
      minimumSeverity: 'warning', // Filter out all info changes
      failOnSeverity: 'breaking',
    };

    const filtered = applySeverityConfig(diff, config);

    expect(filtered.behaviorChanges.length).toBe(0);
    expect(filtered.severity).toBe('none');
  });

  it('should handle empty diff', () => {
    const diff = createMockDiff([]);

    const config: SeverityConfig = {
      minimumSeverity: 'none',
      failOnSeverity: 'breaking',
    };

    const filtered = applySeverityConfig(diff, config);

    expect(filtered.severity).toBe('none');
    expect(filtered.behaviorChanges.length).toBe(0);
  });
});

describe('shouldFailOnDiff', () => {
  it('should fail when diff severity meets threshold', () => {
    const breakingDiff = createMockDiff([{ severity: 'breaking' }]);
    const warningDiff = createMockDiff([{ severity: 'warning' }]);
    const infoDiff = createMockDiff([{ severity: 'info' }]);

    expect(shouldFailOnDiff(breakingDiff, 'breaking')).toBe(true);
    expect(shouldFailOnDiff(warningDiff, 'warning')).toBe(true);
    expect(shouldFailOnDiff(infoDiff, 'info')).toBe(true);
  });

  it('should not fail when diff severity is below threshold', () => {
    const warningDiff = createMockDiff([{ severity: 'warning' }]);
    const infoDiff = createMockDiff([{ severity: 'info' }]);

    expect(shouldFailOnDiff(warningDiff, 'breaking')).toBe(false);
    expect(shouldFailOnDiff(infoDiff, 'warning')).toBe(false);
    expect(shouldFailOnDiff(infoDiff, 'breaking')).toBe(false);
  });

  it('should default to breaking threshold', () => {
    const breakingDiff = createMockDiff([{ severity: 'breaking' }]);
    const warningDiff = createMockDiff([{ severity: 'warning' }]);

    expect(shouldFailOnDiff(breakingDiff)).toBe(true);
    expect(shouldFailOnDiff(warningDiff)).toBe(false);
  });

  it('should handle none threshold (always fail on any change)', () => {
    const infoDiff = createMockDiff([{ severity: 'info' }]);
    const noneDiff = createMockDiff([]);

    expect(shouldFailOnDiff(infoDiff, 'none')).toBe(true);
    expect(shouldFailOnDiff(noneDiff, 'none')).toBe(true); // none meets none
  });
});

describe('filterByMinimumSeverity', () => {
  it('should filter changes below minimum severity', () => {
    const diff = createMockDiff([
      { severity: 'breaking', tool: 'tool1' },
      { severity: 'warning', tool: 'tool2' },
      { severity: 'info', tool: 'tool3' },
    ]);

    const filtered = filterByMinimumSeverity(diff, 'warning');

    expect(filtered.length).toBe(2);
    expect(filtered.some(c => c.tool === 'tool3')).toBe(false);
  });

  it('should return all changes when minimum is none', () => {
    const diff = createMockDiff([
      { severity: 'breaking' },
      { severity: 'warning' },
      { severity: 'info' },
    ]);

    const filtered = filterByMinimumSeverity(diff, 'none');

    expect(filtered.length).toBe(3);
  });

  it('should return only breaking changes when minimum is breaking', () => {
    const diff = createMockDiff([
      { severity: 'breaking', tool: 'tool1' },
      { severity: 'breaking', tool: 'tool2' },
      { severity: 'warning', tool: 'tool3' },
      { severity: 'info', tool: 'tool4' },
    ]);

    const filtered = filterByMinimumSeverity(diff, 'breaking');

    expect(filtered.length).toBe(2);
    expect(filtered.every(c => c.severity === 'breaking')).toBe(true);
  });

  it('should return empty array when no changes meet minimum', () => {
    const diff = createMockDiff([
      { severity: 'info' },
      { severity: 'info' },
    ]);

    const filtered = filterByMinimumSeverity(diff, 'breaking');

    expect(filtered.length).toBe(0);
  });
});

describe('severity configuration integration', () => {
  it('should handle complex configuration scenarios', () => {
    const diff = createMockDiff([
      { severity: 'breaking', aspect: 'schema', tool: 'important_tool' },
      { severity: 'breaking', aspect: 'description', tool: 'docs_only' },
      { severity: 'warning', aspect: 'error_handling', tool: 'minor_tool' },
      { severity: 'info', aspect: 'description', tool: 'trivial' },
    ]);

    // Scenario: Downgrade description changes, suppress warnings
    const config: SeverityConfig = {
      minimumSeverity: 'none',
      failOnSeverity: 'breaking',
      suppressWarnings: true,
      aspectOverrides: {
        description: 'info',
      },
    };

    const result = applySeverityConfig(diff, config);

    // Breaking schema change remains
    // Breaking description downgraded to info
    // Warning suppressed
    // Info description remains
    expect(result.behaviorChanges.length).toBe(3); // warning filtered out
    expect(result.breakingCount).toBe(1); // only schema breaking
    expect(result.infoCount).toBe(2); // description downgraded + original info
    expect(result.warningCount).toBe(0);
    expect(result.severity).toBe('breaking');
  });

  it('should determine correct fail behavior based on filtered diff', () => {
    const diff = createMockDiff([
      { severity: 'breaking', aspect: 'description' },
      { severity: 'warning', aspect: 'schema' },
    ]);

    const config: SeverityConfig = {
      minimumSeverity: 'none',
      failOnSeverity: 'breaking',
      aspectOverrides: {
        description: 'info', // Downgrade breaking description to info
      },
    };

    const filtered = applySeverityConfig(diff, config);

    // After filtering, highest severity is warning (from schema change)
    expect(filtered.severity).toBe('warning');
    expect(shouldFailOnDiff(filtered, 'breaking')).toBe(false);
    expect(shouldFailOnDiff(filtered, 'warning')).toBe(true);
  });
});
