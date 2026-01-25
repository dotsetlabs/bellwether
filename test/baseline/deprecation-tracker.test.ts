/**
 * Tests for deprecation tracker.
 */

import { describe, it, expect } from 'vitest';
import {
  checkDeprecations,
  checkToolDeprecation,
  markAsDeprecated,
  clearDeprecation,
  formatDeprecationWarning,
  formatDeprecationReport,
  shouldFailOnDeprecation,
  DEPRECATION_DEFAULTS,
  DEPRECATION_THRESHOLDS,
} from '../../src/baseline/deprecation-tracker.js';
import type { ToolFingerprint, BehavioralBaseline } from '../../src/baseline/types.js';
import { DEPRECATION } from '../../src/constants.js';

// Helper to create a mock tool fingerprint
function createMockTool(overrides: Partial<ToolFingerprint> = {}): ToolFingerprint {
  return {
    name: 'test_tool',
    description: 'A test tool',
    schemaHash: 'abc123',
    assertions: [],
    securityNotes: [],
    limitations: [],
    ...overrides,
  };
}

// Helper to create a mock baseline
function createMockBaseline(tools: ToolFingerprint[] = []): BehavioralBaseline {
  const capabilityTools = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? {},
    schemaHash: tool.schemaHash,
    lastTestedAt: tool.lastTestedAt ? tool.lastTestedAt.toISOString() : undefined,
    inputSchemaHashAtTest: tool.inputSchemaHashAtTest,
  }));
  const toolProfiles = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    schemaHash: tool.schemaHash,
    assertions: tool.assertions ?? [],
    securityNotes: tool.securityNotes ?? [],
    limitations: tool.limitations ?? [],
    behavioralNotes: [],
  }));

  return {
    version: '1.0.0',
    metadata: {
      mode: 'check',
      generatedAt: new Date().toISOString(),
      cliVersion: '1.0.0',
      serverCommand: 'npx test-server',
      durationMs: 1000,
      personas: [],
      model: 'none',
    },
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: [],
    },
    capabilities: { tools: capabilityTools },
    interviews: [],
    toolProfiles,
    summary: 'Test baseline',
    assertions: [],
    hash: 'hash123',
  };
}

// Helper to get date offset
function getDateOffset(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

describe('Deprecation Tracker', () => {
  describe('checkToolDeprecation', () => {
    it('should return null for non-deprecated tools', () => {
      const tool = createMockTool({ deprecated: false });
      const warning = checkToolDeprecation(tool);
      expect(warning).toBeNull();
    });

    it('should return warning for deprecated tool', () => {
      const tool = createMockTool({
        deprecated: true,
        deprecationNotice: 'This tool is deprecated',
      });

      const warning = checkToolDeprecation(tool);

      expect(warning).not.toBeNull();
      expect(warning!.status).toBe('deprecated');
      expect(warning!.toolName).toBe('test_tool');
      expect(warning!.isPastRemoval).toBe(false);
    });

    it('should return warning for tool past removal date', () => {
      const tool = createMockTool({
        deprecated: true,
        removalDate: getDateOffset(-100), // 100 days ago
        deprecationNotice: 'This tool is deprecated',
      });

      const warning = checkToolDeprecation(tool);

      expect(warning).not.toBeNull();
      expect(warning!.status).toBe('removed');
      expect(warning!.isPastRemoval).toBe(true);
      expect(warning!.isInGracePeriod).toBe(false);
    });

    it('should detect tool in grace period', () => {
      const tool = createMockTool({
        deprecated: true,
        removalDate: getDateOffset(-30), // 30 days ago (within 90-day grace period)
        deprecationNotice: 'This tool is deprecated',
      });

      const warning = checkToolDeprecation(tool);

      expect(warning).not.toBeNull();
      expect(warning!.status).toBe('sunset');
      expect(warning!.isPastRemoval).toBe(true);
      expect(warning!.isInGracePeriod).toBe(true);
    });

    it('should calculate days until removal', () => {
      const tool = createMockTool({
        deprecated: true,
        removalDate: getDateOffset(14), // 14 days from now
      });

      const warning = checkToolDeprecation(tool);

      expect(warning).not.toBeNull();
      expect(warning!.daysUntilRemoval).toBe(14);
    });

    it('should include replacement tool suggestion', () => {
      const tool = createMockTool({
        deprecated: true,
        replacementTool: 'new_tool',
      });

      const warning = checkToolDeprecation(tool);

      expect(warning!.replacementTool).toBe('new_tool');
      expect(warning!.message).toContain('new_tool');
    });

    it('should set breaking severity for tools past removal', () => {
      const tool = createMockTool({
        deprecated: true,
        removalDate: getDateOffset(-100),
      });

      const warning = checkToolDeprecation(tool);

      expect(warning!.severity).toBe('breaking');
    });

    it('should set breaking severity for critical removal timeline', () => {
      const tool = createMockTool({
        deprecated: true,
        removalDate: getDateOffset(5), // 5 days (within 7-day critical threshold)
      });

      const warning = checkToolDeprecation(tool);

      expect(warning!.severity).toBe('breaking');
    });
  });

  describe('checkDeprecations', () => {
    it('should return empty report for baseline with no deprecated tools', () => {
      const baseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
        createMockTool({ name: 'tool2' }),
      ]);

      const report = checkDeprecations(baseline);

      expect(report.warnings).toHaveLength(0);
      expect(report.deprecatedCount).toBe(0);
      expect(report.expiredCount).toBe(0);
      expect(report.hasCriticalIssues).toBe(false);
    });

    // Note: checkDeprecations relies on getToolFingerprints which extracts tools from
    // baseline.capabilities.tools. Deprecation fields are not stored in the baseline
    // format, so checkDeprecations on baselines won't detect deprecated tools.
    // Tests for deprecation detection should use checkToolDeprecation directly.
  });

  describe('markAsDeprecated', () => {
    it('should mark tool as deprecated', () => {
      const tool = createMockTool();
      const deprecated = markAsDeprecated(tool, {
        notice: 'This tool is deprecated',
        replacementTool: 'new_tool',
      });

      expect(deprecated.deprecated).toBe(true);
      expect(deprecated.deprecatedAt).toBeInstanceOf(Date);
      expect(deprecated.deprecationNotice).toBe('This tool is deprecated');
      expect(deprecated.replacementTool).toBe('new_tool');
    });

    it('should preserve existing tool properties', () => {
      const tool = createMockTool({
        name: 'my_tool',
        description: 'My description',
      });

      const deprecated = markAsDeprecated(tool);

      expect(deprecated.name).toBe('my_tool');
      expect(deprecated.description).toBe('My description');
    });

    it('should set removal date if provided', () => {
      const tool = createMockTool();
      const removalDate = new Date('2025-12-31');
      const deprecated = markAsDeprecated(tool, { removalDate });

      expect(deprecated.removalDate).toEqual(removalDate);
    });
  });

  describe('clearDeprecation', () => {
    it('should remove deprecation fields', () => {
      const tool = createMockTool({
        deprecated: true,
        deprecatedAt: new Date(),
        deprecationNotice: 'Notice',
        removalDate: new Date(),
        replacementTool: 'new_tool',
      });

      const cleared = clearDeprecation(tool);

      expect(cleared.deprecated).toBeUndefined();
      expect(cleared.deprecatedAt).toBeUndefined();
      expect(cleared.deprecationNotice).toBeUndefined();
      expect(cleared.removalDate).toBeUndefined();
      expect(cleared.replacementTool).toBeUndefined();
    });

    it('should preserve non-deprecation fields', () => {
      const tool = createMockTool({
        name: 'my_tool',
        description: 'Description',
        deprecated: true,
      });

      const cleared = clearDeprecation(tool);

      expect(cleared.name).toBe('my_tool');
      expect(cleared.description).toBe('Description');
    });
  });

  // Note: getDeprecatedTools, getExpiredTools, and getUpcomingRemovals rely on
  // getToolFingerprints which extracts tools from baseline.capabilities.tools.
  // Deprecation fields are not stored in the baseline format.
  // Tests for deprecation filtering should use checkToolDeprecation directly.

  describe('formatDeprecationWarning', () => {
    it('should format warning with replacement', () => {
      const warning = {
        toolName: 'old_tool',
        status: 'deprecated' as const,
        severity: 'warning' as const,
        message: 'Tool "old_tool" is DEPRECATED.',
        replacementTool: 'new_tool',
        isPastRemoval: false,
        isInGracePeriod: false,
      };

      const formatted = formatDeprecationWarning(warning);

      expect(formatted).toContain('old_tool');
      expect(formatted).toContain('DEPRECATED');
      expect(formatted).toContain('new_tool');
    });

    it('should use appropriate icon for status', () => {
      const removedWarning = {
        toolName: 'tool',
        status: 'removed' as const,
        severity: 'breaking' as const,
        message: 'Removed',
        isPastRemoval: true,
        isInGracePeriod: false,
      };

      const deprecatedWarning = {
        toolName: 'tool',
        status: 'deprecated' as const,
        severity: 'warning' as const,
        message: 'Deprecated',
        isPastRemoval: false,
        isInGracePeriod: false,
      };

      const removedFormatted = formatDeprecationWarning(removedWarning);
      const deprecatedFormatted = formatDeprecationWarning(deprecatedWarning);

      // Removed tools (past removal) get ❌
      expect(removedFormatted).toContain('❌');
      // Deprecated tools (not past removal) get 🕐
      expect(deprecatedFormatted).toContain('🕐');
    });
  });

  describe('formatDeprecationReport', () => {
    it('should format report with no warnings', () => {
      const report = {
        warnings: [],
        deprecatedCount: 0,
        expiredCount: 0,
        gracePeriodCount: 0,
        overallSeverity: 'none' as const,
        summary: 'No deprecated tools found.',
        hasCriticalIssues: false,
      };

      const formatted = formatDeprecationReport(report);

      expect(formatted).toContain('Deprecation Report');
      expect(formatted).toContain('No deprecated tools found');
    });

    it('should format report with warnings', () => {
      const report = {
        warnings: [
          {
            toolName: 'tool1',
            status: 'deprecated' as const,
            severity: 'warning' as const,
            message: 'Deprecated',
            isPastRemoval: false,
            isInGracePeriod: false,
          },
        ],
        deprecatedCount: 1,
        expiredCount: 0,
        gracePeriodCount: 0,
        overallSeverity: 'warning' as const,
        summary: '1 deprecated tool(s).',
        hasCriticalIssues: false,
      };

      const formatted = formatDeprecationReport(report);

      expect(formatted).toContain('DEPRECATED');
      expect(formatted).toContain('tool1');
    });
  });

  describe('shouldFailOnDeprecation', () => {
    it('should not fail when failOnExpired is false', () => {
      const report = {
        warnings: [],
        deprecatedCount: 0,
        expiredCount: 5,
        gracePeriodCount: 0,
        overallSeverity: 'breaking' as const,
        summary: 'Issues found',
        hasCriticalIssues: true,
      };

      expect(shouldFailOnDeprecation(report, { failOnExpired: false })).toBe(false);
    });

    it('should fail when there are expired tools', () => {
      const report = {
        warnings: [],
        deprecatedCount: 0,
        expiredCount: 1,
        gracePeriodCount: 0,
        overallSeverity: 'breaking' as const,
        summary: 'Issues found',
        hasCriticalIssues: true,
      };

      expect(shouldFailOnDeprecation(report, { failOnExpired: true })).toBe(true);
    });

    it('should not fail with only deprecated (not expired) tools', () => {
      const report = {
        warnings: [],
        deprecatedCount: 5,
        expiredCount: 0,
        gracePeriodCount: 0,
        overallSeverity: 'warning' as const,
        summary: 'Deprecated tools',
        hasCriticalIssues: false,
      };

      expect(shouldFailOnDeprecation(report, { failOnExpired: true })).toBe(false);
    });
  });

  describe('DEPRECATION constants', () => {
    it('should have valid default configuration', () => {
      expect(DEPRECATION_DEFAULTS.warnOnUsage).toBe(true);
      expect(DEPRECATION_DEFAULTS.failOnExpired).toBe(true);
      expect(DEPRECATION_DEFAULTS.gracePeriodDays).toBeGreaterThan(0);
    });

    it('should have valid thresholds', () => {
      expect(DEPRECATION_THRESHOLDS.UPCOMING_REMOVAL_DAYS).toBeGreaterThan(0);
      expect(DEPRECATION_THRESHOLDS.CRITICAL_REMOVAL_DAYS).toBeGreaterThan(0);
      expect(DEPRECATION_THRESHOLDS.UPCOMING_REMOVAL_DAYS).toBeGreaterThan(
        DEPRECATION_THRESHOLDS.CRITICAL_REMOVAL_DAYS
      );
    });

    it('should use centralized constants', () => {
      expect(DEPRECATION_DEFAULTS.gracePeriodDays).toBe(DEPRECATION.DEFAULTS.gracePeriodDays);
      expect(DEPRECATION_THRESHOLDS.UPCOMING_REMOVAL_DAYS).toBe(DEPRECATION.THRESHOLDS.upcomingRemovalDays);
      expect(DEPRECATION_THRESHOLDS.CRITICAL_REMOVAL_DAYS).toBe(DEPRECATION.THRESHOLDS.criticalRemovalDays);
    });
  });
});
