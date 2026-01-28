/**
 * Unit tests for baseline/comparator.ts
 *
 * These tests follow TDD principles - testing expected behavior based on
 * rational assumptions about what drift detection SHOULD do.
 */

import { describe, it, expect } from 'vitest';
import {
  compareBaselines,
  hasBreakingChanges,
  hasSecurityChanges,
  filterByMinimumSeverity,
  compareSeverity,
  severityMeetsThreshold,
  applyAspectOverride,
  applySeverityConfig,
  shouldFailOnDiff,
  checkBaselineVersionCompatibility,
} from '../../src/baseline/comparator.js';
import { BaselineVersionError } from '../../src/baseline/version.js';
import type { BehavioralBaseline, ToolFingerprint, BehaviorChange, WorkflowSignature } from '../../src/baseline/types.js';
import type { ToolCapability } from '../../src/baseline/cloud-types.js';

/**
 * Helper to create a minimal valid baseline for testing.
 * This creates the minimum structure needed for comparison tests.
 */
function createTestBaseline(options: {
  version?: string;
  serverName?: string;
  tools?: Partial<ToolFingerprint>[];
  workflows?: Array<{ id: string; name: string; succeeded: boolean; toolSequence?: string[] }>;
}): BehavioralBaseline {
  const tools = (options.tools || []).map((t) => ({
    name: t.name || 'test_tool',
    description: t.description || 'A test tool',
    schemaHash: t.schemaHash || 'hash123',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
    assertions: t.assertions || [],
    securityNotes: t.securityNotes || [],
    limitations: t.limitations || [],
    responseFingerprint: t.responseFingerprint,
    errorPatterns: t.errorPatterns,
    securityFingerprint: t.securityFingerprint,
    responseSchemaEvolution: t.responseSchemaEvolution,
    baselineP50Ms: t.baselineP50Ms,
    baselineP95Ms: t.baselineP95Ms,
    performanceConfidence: t.performanceConfidence,
  })) as ToolCapability[];

  const workflows: WorkflowSignature[] | undefined = options.workflows?.map((w) => ({
    id: w.id,
    name: w.name,
    succeeded: w.succeeded,
    toolSequence: w.toolSequence || [],
  }));

  return {
    version: options.version || '1.0.0',
    metadata: {
      mode: 'check',
      generatedAt: new Date().toISOString(),
      serverCommand: 'npx test-server',
      cliVersion: '0.11.0',
      durationMs: 1000,
      personas: [],
      model: 'none',
    },
    server: {
      name: options.serverName || 'test-server',
      version: '1.0.0',
      protocolVersion: '0.1.0',
      capabilities: ['tools'],
    },
    capabilities: {
      tools,
      prompts: [],
      resources: [],
    },
    interviews: [],
    toolProfiles: [],
    assertions: [],
    summary: 'Test baseline',
    hash: 'test-hash',
    workflows,
  };
}

describe('comparator', () => {
  describe('compareBaselines - version compatibility', () => {
    it('should throw BaselineVersionError when major versions differ', () => {
      const baseline1 = createTestBaseline({ version: '1.0.0', tools: [] });
      const baseline2 = createTestBaseline({ version: '2.0.0', tools: [] });

      expect(() => compareBaselines(baseline1, baseline2)).toThrow(BaselineVersionError);
    });

    it('should allow comparison when ignoreVersionMismatch is true', () => {
      const baseline1 = createTestBaseline({ version: '1.0.0', tools: [] });
      const baseline2 = createTestBaseline({ version: '2.0.0', tools: [] });

      const diff = compareBaselines(baseline1, baseline2, { ignoreVersionMismatch: true });

      expect(diff.versionCompatibility?.compatible).toBe(false);
      expect(diff.versionCompatibility?.warning).toBeTruthy();
    });

    it('should allow comparison between compatible versions (same major)', () => {
      const baseline1 = createTestBaseline({ version: '1.0.0', tools: [] });
      const baseline2 = createTestBaseline({ version: '1.1.0', tools: [] });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.versionCompatibility?.compatible).toBe(true);
    });

    it('should include version info in diff result', () => {
      const baseline1 = createTestBaseline({ version: '1.0.0', tools: [] });
      const baseline2 = createTestBaseline({ version: '1.2.0', tools: [] });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.versionCompatibility).toBeDefined();
      expect(diff.versionCompatibility?.sourceVersion).toBe('1.0.0');
      expect(diff.versionCompatibility?.targetVersion).toBe('1.2.0');
    });
  });

  describe('compareBaselines - tool presence detection', () => {
    it('should detect added tools', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'existing_tool' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'existing_tool' }, { name: 'new_tool' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsAdded).toContain('new_tool');
      expect(diff.toolsAdded).not.toContain('existing_tool');
    });

    it('should detect removed tools', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool_a' }, { name: 'tool_b' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool_a' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsRemoved).toContain('tool_b');
      expect(diff.toolsRemoved).not.toContain('tool_a');
    });

    it('should not report unchanged tools as added or removed', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'stable_tool', description: 'Same desc', schemaHash: 'same' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'stable_tool', description: 'Same desc', schemaHash: 'same' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsAdded).toHaveLength(0);
      expect(diff.toolsRemoved).toHaveLength(0);
    });

    it('should respect tools filter option', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool_a' }, { name: 'tool_b' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool_a' }], // tool_b removed
      });

      // Only check tool_a, ignore tool_b
      const diff = compareBaselines(baseline1, baseline2, { tools: ['tool_a'] });

      expect(diff.toolsRemoved).not.toContain('tool_b');
    });
  });

  describe('compareBaselines - schema change detection', () => {
    it('should detect schema changes when hash differs', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'test_tool', schemaHash: 'hash_v1' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'test_tool', schemaHash: 'hash_v2' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsModified).toHaveLength(1);
      expect(diff.toolsModified[0].schemaChanged).toBe(true);
    });

    it('should classify schema changes as breaking by default', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'test_tool', schemaHash: 'hash_v1' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'test_tool', schemaHash: 'hash_v2' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const schemaChange = diff.behaviorChanges.find((c) => c.aspect === 'schema');
      expect(schemaChange).toBeDefined();
      // Schema changes where we can't determine specific changes default to breaking
      expect(schemaChange?.severity).toBe('breaking');
    });

    it('should ignore schema changes when ignoreSchemaChanges is true', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'test_tool', schemaHash: 'hash_v1' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'test_tool', schemaHash: 'hash_v2' }],
      });

      const diff = compareBaselines(baseline1, baseline2, { ignoreSchemaChanges: true });

      expect(diff.toolsModified).toHaveLength(0);
      expect(diff.behaviorChanges.filter((c) => c.aspect === 'schema')).toHaveLength(0);
    });
  });

  describe('compareBaselines - description change detection', () => {
    it('should detect description changes', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'test_tool', description: 'Original description' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'test_tool', description: 'Updated description' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsModified).toHaveLength(1);
      expect(diff.toolsModified[0].descriptionChanged).toBe(true);
    });

    it('should classify description changes as info severity', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'test_tool', description: 'Original' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'test_tool', description: 'Updated' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const descChange = diff.behaviorChanges.find((c) => c.aspect === 'description');
      expect(descChange).toBeDefined();
      expect(descChange?.severity).toBe('info');
    });

    it('should ignore description changes when ignoreDescriptionChanges is true', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'test_tool', description: 'Original' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'test_tool', description: 'Updated' }],
      });

      const diff = compareBaselines(baseline1, baseline2, { ignoreDescriptionChanges: true });

      expect(diff.toolsModified).toHaveLength(0);
    });
  });

  describe('compareBaselines - workflow comparison', () => {
    it('should detect workflow regression (succeeded -> failed)', () => {
      const baseline1 = createTestBaseline({
        tools: [],
        workflows: [{ id: 'wf1', name: 'Login Flow', succeeded: true }],
      });
      const baseline2 = createTestBaseline({
        tools: [],
        workflows: [{ id: 'wf1', name: 'Login Flow', succeeded: false }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const workflowChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'error_handling' && c.tool === 'Login Flow'
      );
      expect(workflowChange).toBeDefined();
      expect(workflowChange?.severity).toBe('breaking');
      expect(workflowChange?.before).toBe('succeeded');
      expect(workflowChange?.after).toBe('failed');
    });

    it('should detect workflow improvement (failed -> succeeded)', () => {
      const baseline1 = createTestBaseline({
        tools: [],
        workflows: [{ id: 'wf1', name: 'Checkout Flow', succeeded: false }],
      });
      const baseline2 = createTestBaseline({
        tools: [],
        workflows: [{ id: 'wf1', name: 'Checkout Flow', succeeded: true }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const workflowChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'error_handling' && c.tool === 'Checkout Flow'
      );
      expect(workflowChange).toBeDefined();
      expect(workflowChange?.severity).toBe('info');
      expect(workflowChange?.before).toBe('failed');
      expect(workflowChange?.after).toBe('succeeded');
    });

    it('should not report unchanged workflows', () => {
      const baseline1 = createTestBaseline({
        tools: [],
        workflows: [{ id: 'wf1', name: 'Stable Flow', succeeded: true }],
      });
      const baseline2 = createTestBaseline({
        tools: [],
        workflows: [{ id: 'wf1', name: 'Stable Flow', succeeded: true }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.behaviorChanges.filter((c) => c.tool === 'Stable Flow')).toHaveLength(0);
    });
  });

  describe('compareBaselines - severity calculation', () => {
    it('should return severity "none" when no changes', () => {
      const baseline = createTestBaseline({ tools: [{ name: 'tool' }] });

      const diff = compareBaselines(baseline, baseline);

      expect(diff.severity).toBe('none');
    });

    it('should return severity "info" when only tools added', () => {
      const baseline1 = createTestBaseline({ tools: [] });
      const baseline2 = createTestBaseline({ tools: [{ name: 'new_tool' }] });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.severity).toBe('info');
      expect(diff.infoCount).toBe(1);
    });

    it('should return severity "breaking" when tools removed', () => {
      const baseline1 = createTestBaseline({ tools: [{ name: 'old_tool' }] });
      const baseline2 = createTestBaseline({ tools: [] });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.severity).toBe('breaking');
      expect(diff.breakingCount).toBe(1);
    });

    it('should count breaking, warning, and info changes correctly', () => {
      const baseline1 = createTestBaseline({
        tools: [
          { name: 'removed_tool' },
          { name: 'modified_tool', description: 'Original' },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          { name: 'modified_tool', description: 'Changed' },
          { name: 'added_tool' },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      // removed_tool = 1 breaking
      // modified_tool description change = 1 info
      // added_tool = 1 info
      expect(diff.breakingCount).toBe(1);
      expect(diff.infoCount).toBe(2);
    });
  });

  describe('compareBaselines - summary generation', () => {
    it('should generate "No changes detected" for identical baselines', () => {
      const baseline = createTestBaseline({ tools: [{ name: 'tool' }] });

      const diff = compareBaselines(baseline, baseline);

      expect(diff.summary).toBe('No changes detected.');
    });

    it('should include tool counts in summary', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'removed' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'added' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.summary).toContain('1 tool(s) removed');
      expect(diff.summary).toContain('1 tool(s) added');
    });
  });

  describe('severity utilities', () => {
    describe('compareSeverity', () => {
      it('should order severities correctly: none < info < warning < breaking', () => {
        expect(compareSeverity('none', 'info')).toBeLessThan(0);
        expect(compareSeverity('info', 'warning')).toBeLessThan(0);
        expect(compareSeverity('warning', 'breaking')).toBeLessThan(0);
      });

      it('should return 0 for equal severities', () => {
        expect(compareSeverity('warning', 'warning')).toBe(0);
      });

      it('should return positive when first is higher severity', () => {
        expect(compareSeverity('breaking', 'info')).toBeGreaterThan(0);
      });
    });

    describe('severityMeetsThreshold', () => {
      it('should return true when severity meets or exceeds threshold', () => {
        expect(severityMeetsThreshold('breaking', 'warning')).toBe(true);
        expect(severityMeetsThreshold('warning', 'warning')).toBe(true);
      });

      it('should return false when severity is below threshold', () => {
        expect(severityMeetsThreshold('info', 'warning')).toBe(false);
        expect(severityMeetsThreshold('none', 'info')).toBe(false);
      });
    });
  });

  describe('hasBreakingChanges', () => {
    it('should return true when diff has breaking severity', () => {
      const baseline1 = createTestBaseline({ tools: [{ name: 'tool' }] });
      const baseline2 = createTestBaseline({ tools: [] });

      const diff = compareBaselines(baseline1, baseline2);

      expect(hasBreakingChanges(diff)).toBe(true);
    });

    it('should return false for non-breaking diffs', () => {
      const baseline1 = createTestBaseline({ tools: [] });
      const baseline2 = createTestBaseline({ tools: [{ name: 'new' }] });

      const diff = compareBaselines(baseline1, baseline2);

      expect(hasBreakingChanges(diff)).toBe(false);
    });
  });

  describe('hasSecurityChanges', () => {
    it('should return true when diff has security aspect changes', () => {
      // Security changes require securityFingerprint data
      const baseline1 = createTestBaseline({
        tools: [{
          name: 'test_tool',
          securityFingerprint: {
            tested: true,
            categoriesTested: ['sql_injection'],
            riskScore: 0,
            findings: [],
            testedAt: new Date().toISOString(),
            findingsHash: 'hash1',
          },
        }],
      });
      const baseline2 = createTestBaseline({
        tools: [{
          name: 'test_tool',
          securityFingerprint: {
            tested: true,
            categoriesTested: ['sql_injection'],
            riskScore: 50,
            findings: [{
              tool: 'test_tool',
              category: 'sql_injection',
              parameter: 'input',
              riskLevel: 'high',
              title: 'SQL Injection',
              description: 'Possible SQL injection',
              cweId: 'CWE-89',
              evidence: 'test',
              remediation: 'Use parameterized queries',
            }],
            testedAt: new Date().toISOString(),
            findingsHash: 'hash2',
          },
        }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(hasSecurityChanges(diff)).toBe(true);
    });

    it('should return false when no security changes', () => {
      const baseline = createTestBaseline({ tools: [{ name: 'tool' }] });

      const diff = compareBaselines(baseline, baseline);

      expect(hasSecurityChanges(diff)).toBe(false);
    });
  });

  describe('filterByMinimumSeverity', () => {
    it('should filter out changes below minimum severity', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool', description: 'v1' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool', description: 'v2' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      // Description change is 'info' severity
      const filtered = filterByMinimumSeverity(diff, 'warning');
      expect(filtered).toHaveLength(0);

      const unfiltered = filterByMinimumSeverity(diff, 'info');
      expect(unfiltered.length).toBeGreaterThan(0);
    });
  });

  describe('applyAspectOverride', () => {
    it('should return original severity when no override', () => {
      const change: BehaviorChange = {
        tool: 'test',
        aspect: 'description',
        before: 'a',
        after: 'b',
        severity: 'info',
        description: 'test',
      };

      expect(applyAspectOverride(change, undefined)).toBe('info');
      expect(applyAspectOverride(change, {})).toBe('info');
    });

    it('should apply override for matching aspect', () => {
      const change: BehaviorChange = {
        tool: 'test',
        aspect: 'description',
        before: 'a',
        after: 'b',
        severity: 'info',
        description: 'test',
      };

      expect(applyAspectOverride(change, { description: 'breaking' })).toBe('breaking');
    });

    it('should not affect non-matching aspects', () => {
      const change: BehaviorChange = {
        tool: 'test',
        aspect: 'description',
        before: 'a',
        after: 'b',
        severity: 'info',
        description: 'test',
      };

      expect(applyAspectOverride(change, { schema: 'none' })).toBe('info');
    });
  });

  describe('applySeverityConfig', () => {
    it('should filter by minimumSeverity', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool', description: 'v1' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool', description: 'v2' }],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const filtered = applySeverityConfig(diff, { minimumSeverity: 'warning' });

      expect(filtered.behaviorChanges.filter((c) => c.severity === 'info')).toHaveLength(0);
    });

    it('should suppress warnings when configured', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool', schemaHash: 'v1' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool', schemaHash: 'v2' }],
      });

      const diff = compareBaselines(baseline1, baseline2);
      // First apply override to make it a warning instead of breaking
      const withWarning = applySeverityConfig(diff, {
        aspectOverrides: { schema: 'warning' },
      });
      expect(withWarning.warningCount).toBeGreaterThan(0);

      const suppressed = applySeverityConfig(diff, {
        aspectOverrides: { schema: 'warning' },
        suppressWarnings: true,
      });
      expect(suppressed.behaviorChanges.filter((c) => c.severity === 'warning')).toHaveLength(0);
    });

    it('should recalculate severity counts after filtering', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool', description: 'v1' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool', description: 'v2' }],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const original = diff.infoCount;

      const filtered = applySeverityConfig(diff, { minimumSeverity: 'warning' });
      expect(filtered.infoCount).toBeLessThan(original);
    });
  });

  describe('shouldFailOnDiff', () => {
    it('should return true when diff severity meets fail threshold', () => {
      const baseline1 = createTestBaseline({ tools: [{ name: 'tool' }] });
      const baseline2 = createTestBaseline({ tools: [] });

      const diff = compareBaselines(baseline1, baseline2); // breaking

      expect(shouldFailOnDiff(diff, 'breaking')).toBe(true);
      expect(shouldFailOnDiff(diff, 'warning')).toBe(true);
      expect(shouldFailOnDiff(diff, 'info')).toBe(true);
    });

    it('should return false when diff severity is below fail threshold', () => {
      const baseline1 = createTestBaseline({ tools: [] });
      const baseline2 = createTestBaseline({ tools: [{ name: 'new' }] });

      const diff = compareBaselines(baseline1, baseline2); // info

      expect(shouldFailOnDiff(diff, 'breaking')).toBe(false);
      expect(shouldFailOnDiff(diff, 'warning')).toBe(false);
      expect(shouldFailOnDiff(diff, 'info')).toBe(true);
    });

    it('should default to breaking threshold', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool', description: 'v1' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool', description: 'v2' }],
      });

      const diff = compareBaselines(baseline1, baseline2); // info (description change)

      expect(shouldFailOnDiff(diff)).toBe(false);
    });
  });

  describe('checkBaselineVersionCompatibility', () => {
    it('should return compatibility info for two baselines', () => {
      const baseline1 = createTestBaseline({ version: '1.0.0', tools: [] });
      const baseline2 = createTestBaseline({ version: '1.1.0', tools: [] });

      const info = checkBaselineVersionCompatibility(baseline1, baseline2);

      expect(info.compatible).toBe(true);
      expect(info.sourceVersion).toBe('1.0.0');
      expect(info.targetVersion).toBe('1.1.0');
    });

    it('should indicate incompatibility for major version differences', () => {
      const baseline1 = createTestBaseline({ version: '1.0.0', tools: [] });
      const baseline2 = createTestBaseline({ version: '2.0.0', tools: [] });

      const info = checkBaselineVersionCompatibility(baseline1, baseline2);

      expect(info.compatible).toBe(false);
      expect(info.warning).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('should handle empty baselines', () => {
      const baseline1 = createTestBaseline({ tools: [] });
      const baseline2 = createTestBaseline({ tools: [] });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.severity).toBe('none');
      expect(diff.toolsAdded).toHaveLength(0);
      expect(diff.toolsRemoved).toHaveLength(0);
    });

    it('should handle baselines with no workflows', () => {
      const baseline1 = createTestBaseline({ tools: [], workflows: undefined });
      const baseline2 = createTestBaseline({ tools: [], workflows: undefined });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.behaviorChanges.filter((c) => c.aspect === 'error_handling')).toHaveLength(0);
    });

    it('should handle tools with same name but completely different content', () => {
      const baseline1 = createTestBaseline({
        tools: [{
          name: 'multi_change_tool',
          description: 'Original',
          schemaHash: 'hash_v1',
        }],
      });
      const baseline2 = createTestBaseline({
        tools: [{
          name: 'multi_change_tool',
          description: 'Completely rewritten',
          schemaHash: 'hash_v2',
        }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsModified).toHaveLength(1);
      expect(diff.toolsModified[0].schemaChanged).toBe(true);
      expect(diff.toolsModified[0].descriptionChanged).toBe(true);
    });
  });
});
