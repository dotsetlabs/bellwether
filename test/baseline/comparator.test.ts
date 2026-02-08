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
import type {
  BehavioralBaseline,
  ToolFingerprint,
  BehaviorChange,
  WorkflowSignature,
} from '../../src/baseline/types.js';
import type {
  ToolCapability,
  ResourceTemplateCapability,
  PromptCapability,
  ResourceCapability,
} from '../../src/baseline/baseline-format.js';

/**
 * Extended tool options for test helper, combining ToolFingerprint fields
 * with ToolCapability-specific fields (annotations, outputSchemaHash, title).
 */
interface TestToolOptions extends Partial<ToolFingerprint> {
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  outputSchema?: Record<string, unknown>;
  outputSchemaHash?: string;
  title?: string;
  execution?: { taskSupport?: string };
}

/**
 * Helper to create a minimal valid baseline for testing.
 * This creates the minimum structure needed for comparison tests.
 */
function createTestBaseline(options: {
  version?: string;
  serverName?: string;
  protocolVersion?: string;
  capabilities?: string[];
  tools?: TestToolOptions[];
  workflows?: Array<{ id: string; name: string; succeeded: boolean; toolSequence?: string[] }>;
  resourceTemplates?: ResourceTemplateCapability[];
  prompts?: PromptCapability[];
  resources?: ResourceCapability[];
  serverInstructions?: string;
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
    annotations: t.annotations,
    outputSchema: t.outputSchema,
    outputSchemaHash: t.outputSchemaHash,
    title: t.title,
    execution: t.execution,
    baselineP99Ms: t.baselineP99Ms,
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
      protocolVersion: options.protocolVersion || '2025-11-25',
      capabilities: options.capabilities || ['tools'],
      instructions: options.serverInstructions,
    },
    capabilities: {
      tools,
      prompts: options.prompts || [],
      resources: options.resources || [],
      resourceTemplates: options.resourceTemplates,
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
      const schemaV1 = {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      };
      const schemaV2 = {
        type: 'object',
        properties: {
          value: { type: 'integer' },
        },
      };
      const baseline1 = createTestBaseline({
        tools: [{ name: 'test_tool', inputSchema: schemaV1 }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'test_tool', inputSchema: schemaV2 }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsModified).toHaveLength(1);
      expect(diff.toolsModified[0].schemaChanged).toBe(true);
    });

    it('should classify schema changes as breaking by default', () => {
      const schemaV1 = {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      };
      const schemaV2 = {
        type: 'object',
        properties: {
          value: { type: 'integer' },
        },
      };
      const baseline1 = createTestBaseline({
        tools: [{ name: 'test_tool', inputSchema: schemaV1 }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'test_tool', inputSchema: schemaV2 }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const schemaChange = diff.behaviorChanges.find((c) => c.aspect === 'schema');
      expect(schemaChange).toBeDefined();
      // Schema changes where we can't determine specific changes default to breaking
      expect(schemaChange?.severity).toBe('breaking');
    });

    it('should ignore schema changes when ignoreSchemaChanges is true', () => {
      const schemaV1 = {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      };
      const schemaV2 = {
        type: 'object',
        properties: {
          value: { type: 'integer' },
        },
      };
      const baseline1 = createTestBaseline({
        tools: [{ name: 'test_tool', inputSchema: schemaV1 }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'test_tool', inputSchema: schemaV2 }],
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
        tools: [{ name: 'removed_tool' }, { name: 'modified_tool', description: 'Original' }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'modified_tool', description: 'Changed' }, { name: 'added_tool' }],
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
        tools: [
          {
            name: 'test_tool',
            securityFingerprint: {
              tested: true,
              categoriesTested: ['sql_injection'],
              riskScore: 0,
              findings: [],
              testedAt: new Date().toISOString(),
              findingsHash: 'hash1',
            },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'test_tool',
            securityFingerprint: {
              tested: true,
              categoriesTested: ['sql_injection'],
              riskScore: 50,
              findings: [
                {
                  tool: 'test_tool',
                  category: 'sql_injection',
                  parameter: 'input',
                  riskLevel: 'high',
                  title: 'SQL Injection',
                  description: 'Possible SQL injection',
                  cweId: 'CWE-89',
                  evidence: 'test',
                  remediation: 'Use parameterized queries',
                },
              ],
              testedAt: new Date().toISOString(),
              findingsHash: 'hash2',
            },
          },
        ],
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
      const schemaV1 = {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      };
      const schemaV2 = {
        type: 'object',
        properties: {
          value: { type: 'integer' },
        },
      };
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool', inputSchema: schemaV1 }],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool', inputSchema: schemaV2 }],
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

    it('should handle baselines with resourceTemplates', () => {
      const baseline1 = createTestBaseline({
        tools: [],
        resourceTemplates: [{ uriTemplate: '/items/{id}', name: 'item', description: 'Get item' }],
      });
      const baseline2 = createTestBaseline({
        tools: [],
        resourceTemplates: [{ uriTemplate: '/items/{id}', name: 'item', description: 'Get item' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.severity).toBe('none');
    });

    it('should handle tools with same name but completely different content', () => {
      const schemaV1 = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const schemaV2 = {
        type: 'object',
        properties: {
          count: { type: 'integer' },
        },
      };
      const baseline1 = createTestBaseline({
        tools: [
          {
            name: 'multi_change_tool',
            description: 'Original',
            inputSchema: schemaV1,
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'multi_change_tool',
            description: 'Completely rewritten',
            inputSchema: schemaV2,
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsModified).toHaveLength(1);
      expect(diff.toolsModified[0].schemaChanged).toBe(true);
      expect(diff.toolsModified[0].descriptionChanged).toBe(true);
    });
  });

  describe('compareBaselines - tool annotations drift detection', () => {
    it('should detect readOnlyHint change as breaking', () => {
      const baseline1 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            annotations: { readOnlyHint: true },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            annotations: { readOnlyHint: false },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const annotationChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'tool_annotations' && c.description.includes('readOnlyHint')
      );
      expect(annotationChange).toBeDefined();
      expect(annotationChange?.severity).toBe('breaking');
    });

    it('should detect destructiveHint change as warning', () => {
      const baseline1 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            annotations: { destructiveHint: false },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            annotations: { destructiveHint: true },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const annotationChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'tool_annotations' && c.description.includes('destructiveHint')
      );
      expect(annotationChange).toBeDefined();
      expect(annotationChange?.severity).toBe('warning');
    });

    it('should detect idempotentHint change as warning', () => {
      const baseline1 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            annotations: { idempotentHint: true },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            annotations: { idempotentHint: false },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const annotationChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'tool_annotations' && c.description.includes('idempotentHint')
      );
      expect(annotationChange).toBeDefined();
      expect(annotationChange?.severity).toBe('warning');
    });

    it('should detect openWorldHint change as info', () => {
      const baseline1 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            annotations: { openWorldHint: false },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            annotations: { openWorldHint: true },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const annotationChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'tool_annotations' && c.description.includes('openWorldHint')
      );
      expect(annotationChange).toBeDefined();
      expect(annotationChange?.severity).toBe('info');
    });

    it('should detect tool title change as info', () => {
      const baseline1 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            title: 'Old Title',
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            title: 'New Title',
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const titleChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'tool_annotations' && c.description.includes('title')
      );
      expect(titleChange).toBeDefined();
      expect(titleChange?.severity).toBe('info');
    });

    it('should not report unchanged annotations', () => {
      const baseline1 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const annotationChanges = diff.behaviorChanges.filter((c) => c.aspect === 'tool_annotations');
      expect(annotationChanges).toHaveLength(0);
    });
  });

  describe('compareBaselines - output schema drift detection', () => {
    it('should detect outputSchema change as breaking', () => {
      const baseline1 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            outputSchemaHash: 'hash-v1',
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            outputSchemaHash: 'hash-v2',
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const schemaChange = diff.behaviorChanges.find((c) => c.aspect === 'output_schema');
      expect(schemaChange).toBeDefined();
      expect(schemaChange?.severity).toBe('breaking');
    });

    it('should detect outputSchema added as warning', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool' }],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            outputSchemaHash: 'hash-v1',
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const schemaChange = diff.behaviorChanges.find((c) => c.aspect === 'output_schema');
      expect(schemaChange).toBeDefined();
      expect(schemaChange?.severity).toBe('warning');
    });

    it('should detect outputSchema removed as warning', () => {
      const baseline1 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            outputSchemaHash: 'hash-v1',
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const schemaChange = diff.behaviorChanges.find((c) => c.aspect === 'output_schema');
      expect(schemaChange).toBeDefined();
      expect(schemaChange?.severity).toBe('warning');
    });

    it('should not report unchanged outputSchema', () => {
      const baseline1 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            outputSchemaHash: 'same-hash',
          },
        ],
      });
      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'tool',
            outputSchemaHash: 'same-hash',
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const schemaChanges = diff.behaviorChanges.filter((c) => c.aspect === 'output_schema');
      expect(schemaChanges).toHaveLength(0);
    });
  });

  describe('compareBaselines - resource template drift detection', () => {
    it('should detect resource template removed as breaking', () => {
      const baseline1 = createTestBaseline({
        tools: [],
        resourceTemplates: [{ uriTemplate: '/items/{id}', name: 'item', description: 'Get item' }],
      });
      const baseline2 = createTestBaseline({
        tools: [],
        resourceTemplates: [],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const templateChange = diff.behaviorChanges.find((c) => c.aspect === 'resource_template');
      expect(templateChange).toBeDefined();
      expect(templateChange?.severity).toBe('breaking');
    });

    it('should detect resource template added as info', () => {
      const baseline1 = createTestBaseline({
        tools: [],
        resourceTemplates: [],
      });
      const baseline2 = createTestBaseline({
        tools: [],
        resourceTemplates: [{ uriTemplate: '/items/{id}', name: 'item', description: 'Get item' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const templateChange = diff.behaviorChanges.find((c) => c.aspect === 'resource_template');
      expect(templateChange).toBeDefined();
      expect(templateChange?.severity).toBe('info');
    });

    it('should not report unchanged resource templates', () => {
      const templates: ResourceTemplateCapability[] = [
        { uriTemplate: '/items/{id}', name: 'item', description: 'Get item' },
      ];
      const baseline1 = createTestBaseline({
        tools: [],
        resourceTemplates: templates,
      });
      const baseline2 = createTestBaseline({
        tools: [],
        resourceTemplates: templates,
      });

      const diff = compareBaselines(baseline1, baseline2);

      const templateChanges = diff.behaviorChanges.filter((c) => c.aspect === 'resource_template');
      expect(templateChanges).toHaveLength(0);
    });
  });

  describe('version-gated comparison', () => {
    it('should compare annotations when both baselines are on 2025-11-25', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool1',
            annotations: { readOnlyHint: true },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool1',
            annotations: { readOnlyHint: false },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const annotationChanges = diff.behaviorChanges.filter((c) => c.aspect === 'tool_annotations');
      expect(annotationChanges.length).toBeGreaterThan(0);
    });

    it('should NOT compare annotations when one baseline is on 2024-11-05', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2024-11-05',
        tools: [
          {
            name: 'tool1',
            annotations: { readOnlyHint: true },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool1',
            annotations: { readOnlyHint: false },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const annotationChanges = diff.behaviorChanges.filter((c) => c.aspect === 'tool_annotations');
      expect(annotationChanges).toHaveLength(0);
    });

    it('should NOT compare outputSchema when one baseline is on 2025-03-26', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-03-26',
        tools: [
          {
            name: 'tool1',
            outputSchemaHash: 'abc123',
          },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-06-18',
        tools: [
          {
            name: 'tool1',
            outputSchemaHash: 'def456',
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const outputSchemaChanges = diff.behaviorChanges.filter((c) => c.aspect === 'output_schema');
      expect(outputSchemaChanges).toHaveLength(0);
    });

    it('should compare outputSchema when both baselines support structured output', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-06-18',
        tools: [
          {
            name: 'tool1',
            outputSchemaHash: 'abc123',
          },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool1',
            outputSchemaHash: 'def456',
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const outputSchemaChanges = diff.behaviorChanges.filter((c) => c.aspect === 'output_schema');
      expect(outputSchemaChanges.length).toBeGreaterThan(0);
    });

    it('should compare annotations when both baselines are on 2025-03-26+', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-03-26',
        tools: [
          {
            name: 'tool1',
            annotations: { destructiveHint: true },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-06-18',
        tools: [
          {
            name: 'tool1',
            annotations: { destructiveHint: false },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const annotationChanges = diff.behaviorChanges.filter((c) => c.aspect === 'tool_annotations');
      expect(annotationChanges.length).toBeGreaterThan(0);
    });

    it('should still flag protocol version change as warning', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2024-11-05',
        tools: [{ name: 'tool1' }],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [{ name: 'tool1' }],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const versionChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'server' && c.description.includes('Protocol version changed')
      );
      expect(versionChanges).toHaveLength(1);
      expect(versionChanges[0].severity).toBe('warning');
    });

    it('should NOT flag version-gated capability removal when versions differ', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-11-25',
        capabilities: ['tools', 'tasks'],
        tools: [{ name: 'tool1' }],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
        tools: [{ name: 'tool1' }],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const capabilityRemovals = diff.behaviorChanges.filter(
        (c) => c.aspect === 'capability' && c.after === 'removed' && c.before === 'tasks'
      );
      // 'tasks' capability removal should be skipped because 2024-11-05 doesn't support tasks
      expect(capabilityRemovals).toHaveLength(0);
    });

    it('should NOT flag resource annotation changes when one version is 2024-11-05', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2024-11-05',
        tools: [],
      });
      // Add resource with annotations to previous
      baseline1.capabilities.resources = [
        {
          uri: 'test://resource',
          name: 'test',
          annotations: { audience: ['user'] },
          size: 100,
        },
      ];

      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
      });
      baseline2.capabilities.resources = [
        {
          uri: 'test://resource',
          name: 'test',
          annotations: { audience: ['admin'] },
          size: 200,
        },
      ];

      const diff = compareBaselines(baseline1, baseline2);
      const annotationChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'resource_annotations'
      );
      expect(annotationChanges).toHaveLength(0);
    });
  });

  describe('version-gated prompt title comparison', () => {
    it('should detect prompt title change when both baselines on 2025-11-25', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        prompts: [{ name: 'my_prompt', description: 'A prompt', title: 'Old Title' }],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        prompts: [{ name: 'my_prompt', description: 'A prompt', title: 'New Title' }],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const titleChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'prompt' && c.description.includes('title')
      );
      expect(titleChange).toBeDefined();
      expect(titleChange?.severity).toBe('info');
      expect(titleChange?.before).toBe('Old Title');
      expect(titleChange?.after).toBe('New Title');
    });

    it('should NOT detect prompt title change when one baseline on 2024-11-05', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2024-11-05',
        tools: [],
        prompts: [{ name: 'my_prompt', description: 'A prompt', title: 'Old Title' }],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        prompts: [{ name: 'my_prompt', description: 'A prompt', title: 'New Title' }],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const titleChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'prompt' && c.description.includes('title')
      );
      expect(titleChange).toBeUndefined();
    });
  });

  describe('version-gated resource template title comparison', () => {
    it('should detect resource template title change when both on 2025-11-25', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        resourceTemplates: [
          { uriTemplate: '/items/{id}', name: 'item', title: 'Old Title', description: 'Get item' },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        resourceTemplates: [
          { uriTemplate: '/items/{id}', name: 'item', title: 'New Title', description: 'Get item' },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const titleChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'resource_template' && c.description.includes('title')
      );
      expect(titleChange).toBeDefined();
      expect(titleChange?.severity).toBe('info');
    });

    it('should NOT detect resource template title change when one on 2024-11-05', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2024-11-05',
        tools: [],
        resourceTemplates: [
          { uriTemplate: '/items/{id}', name: 'item', title: 'Old Title', description: 'Get item' },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        resourceTemplates: [
          { uriTemplate: '/items/{id}', name: 'item', title: 'New Title', description: 'Get item' },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const titleChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'resource_template' && c.description.includes('title')
      );
      expect(titleChange).toBeUndefined();
    });
  });

  describe('version-gated resource title comparison', () => {
    it('should detect resource title change when both on 2025-11-25', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        resources: [{ uri: 'test://res', name: 'res', title: 'Old Title' }],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        resources: [{ uri: 'test://res', name: 'res', title: 'New Title' }],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const titleChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'resource' && c.description.includes('title')
      );
      expect(titleChange).toBeDefined();
      expect(titleChange?.severity).toBe('info');
    });

    it('should NOT detect resource title change when one on 2024-11-05', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2024-11-05',
        tools: [],
        resources: [{ uri: 'test://res', name: 'res', title: 'Old Title' }],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        resources: [{ uri: 'test://res', name: 'res', title: 'New Title' }],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const titleChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'resource' && c.description.includes('title')
      );
      expect(titleChange).toBeUndefined();
    });
  });

  describe('version-gated execution/task support comparison', () => {
    it('should detect execution taskSupport change when both on 2025-11-25', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool',
            execution: { taskSupport: 'sync' },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool',
            execution: { taskSupport: 'async' },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const execChange = diff.behaviorChanges.find((c) => c.description.includes('task support'));
      expect(execChange).toBeDefined();
      expect(execChange?.severity).toBe('warning');
      expect(execChange?.before).toBe('sync');
      expect(execChange?.after).toBe('async');
    });

    it('should NOT detect execution change when one on 2024-11-05', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2024-11-05',
        tools: [
          {
            name: 'tool',
            execution: { taskSupport: 'sync' },
          },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool',
            execution: { taskSupport: 'async' },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const execChange = diff.behaviorChanges.find((c) => c.description.includes('task support'));
      expect(execChange).toBeUndefined();
    });
  });

  describe('version-gated server instructions comparison', () => {
    it('should detect server instructions change when both on 2025-06-18+', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-06-18',
        tools: [],
        serverInstructions: 'Old instructions for the server',
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        serverInstructions: 'New instructions for the server',
      });

      const diff = compareBaselines(baseline1, baseline2);
      const instrChange = diff.behaviorChanges.find((c) =>
        c.description.includes('Server instructions changed')
      );
      expect(instrChange).toBeDefined();
      expect(instrChange?.severity).toBe('info');
    });

    it('should NOT detect server instructions change when one on 2024-11-05', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2024-11-05',
        tools: [],
        serverInstructions: 'Old instructions',
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [],
        serverInstructions: 'New instructions',
      });

      const diff = compareBaselines(baseline1, baseline2);
      const instrChange = diff.behaviorChanges.find((c) =>
        c.description.includes('Server instructions changed')
      );
      expect(instrChange).toBeUndefined();
    });
  });

  describe('tool title uses entityTitles flag', () => {
    it('should detect tool title change with entityTitles=true independently from annotations', () => {
      // 2025-03-26 has entityTitles=true AND toolAnnotations=true
      // Verify title comparison uses entityTitles, not toolAnnotations
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-03-26',
        tools: [
          {
            name: 'tool',
            title: 'Old Tool Title',
            // No annotations
          },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-03-26',
        tools: [
          {
            name: 'tool',
            title: 'New Tool Title',
            // No annotations
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const titleChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'tool_annotations' && c.description.includes('title changed')
      );
      expect(titleChange).toBeDefined();
      expect(titleChange?.severity).toBe('info');
      expect(titleChange?.before).toBe('Old Tool Title');
      expect(titleChange?.after).toBe('New Tool Title');
    });

    it('should detect title added (undefined -> value)', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool',
            // No title
          },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool',
            title: 'New Title',
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const titleChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'tool_annotations' && c.description.includes('title changed')
      );
      expect(titleChange).toBeDefined();
      expect(titleChange?.before).toBe('none');
      expect(titleChange?.after).toBe('New Title');
    });

    it('should detect title removed (value -> undefined)', () => {
      const baseline1 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool',
            title: 'Old Title',
          },
        ],
      });
      const baseline2 = createTestBaseline({
        protocolVersion: '2025-11-25',
        tools: [
          {
            name: 'tool',
            // No title
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);
      const titleChange = diff.behaviorChanges.find(
        (c) => c.aspect === 'tool_annotations' && c.description.includes('title changed')
      );
      expect(titleChange).toBeDefined();
      expect(titleChange?.before).toBe('Old Title');
      expect(titleChange?.after).toBe('none');
    });
  });

  describe('undefined vs missing-key behavior', () => {
    it('should produce no drift when optional fields are undefined vs absent', () => {
      // Baseline where optional fields are explicitly set to undefined
      const withUndefined = createTestBaseline({
        tools: [
          {
            name: 'tool_a',
            responseFingerprint: undefined,
            errorPatterns: undefined,
            securityFingerprint: undefined,
            performanceConfidence: undefined,
            responseSchemaEvolution: undefined,
          },
        ],
      });

      // Baseline where optional fields are simply not present (missing keys)
      const withMissing = createTestBaseline({
        tools: [{ name: 'tool_a' }],
      });

      const diff = compareBaselines(withUndefined, withMissing);

      expect(diff.toolsModified).toHaveLength(0);
      expect(diff.behaviorChanges).toHaveLength(0);
      expect(diff.severity).toBe('none');
    });

    it('should produce no drift when errorPatterns is undefined vs empty array', () => {
      const withUndefined = createTestBaseline({
        tools: [{ name: 'tool_a', errorPatterns: undefined }],
      });

      const withEmpty = createTestBaseline({
        tools: [{ name: 'tool_a', errorPatterns: [] }],
      });

      const diff = compareBaselines(withUndefined, withEmpty);

      const errorChanges = diff.behaviorChanges.filter((c) => c.aspect === 'error_pattern');
      expect(errorChanges).toHaveLength(0);
    });

    it('should produce no drift when responseFingerprint is undefined on both sides', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool_a', responseFingerprint: undefined }],
      });

      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool_a' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const fpChanges = diff.behaviorChanges.filter((c) => c.aspect === 'response_structure');
      expect(fpChanges).toHaveLength(0);
    });

    it('should produce no drift when securityFingerprint is undefined on both sides', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool_a', securityFingerprint: undefined }],
      });

      const baseline2 = createTestBaseline({
        tools: [{ name: 'tool_a' }],
      });

      const diff = compareBaselines(baseline1, baseline2);

      const secChanges = diff.behaviorChanges.filter((c) => c.aspect === 'security');
      expect(secChanges).toHaveLength(0);
    });

    it('should detect changes when going from undefined to populated', () => {
      const baseline1 = createTestBaseline({
        tools: [{ name: 'tool_a' }],
      });

      const baseline2 = createTestBaseline({
        tools: [
          {
            name: 'tool_a',
            responseFingerprint: {
              structureHash: 'new-hash',
              contentType: 'object',
              fields: ['a'],
              size: 'small',
              isEmpty: false,
              sampleCount: 1,
              confidence: 1,
            },
          },
        ],
      });

      const diff = compareBaselines(baseline1, baseline2);

      // Going from no fingerprint to having one should be detected
      const fpChanges = diff.behaviorChanges.filter((c) => c.aspect === 'response_structure');
      expect(fpChanges.length).toBeGreaterThan(0);
    });
  });
});
