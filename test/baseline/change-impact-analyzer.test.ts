/**
 * Tests for change impact analyzer.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeToolChangeImpact,
  analyzeDiffImpact,
  analyzeSchemaChanges,
  isBreakingChange,
  getBreakingChangeSummary,
} from '../../src/baseline/change-impact-analyzer.js';
import type {
  ToolFingerprint,
  BehavioralBaseline,
  BehavioralDiff,
  BehaviorChange,
  WorkflowSignature,
} from '../../src/baseline/types.js';
import { CHANGE_IMPACT } from '../../src/constants.js';

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
function createMockBaseline(overrides: Partial<BehavioralBaseline> = {}): BehavioralBaseline {
  return {
    version: '1.0.0',
    createdAt: new Date(),
    serverCommand: 'npx test-server',
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: [],
    },
    tools: [],
    summary: 'Test baseline',
    assertions: [],
    integrityHash: 'hash123',
    ...overrides,
  };
}

// Helper to create a mock diff
function createMockDiff(overrides: Partial<BehavioralDiff> = {}): BehavioralDiff {
  return {
    toolsAdded: [],
    toolsRemoved: [],
    toolsModified: [],
    behaviorChanges: [],
    severity: 'none',
    breakingCount: 0,
    warningCount: 0,
    infoCount: 0,
    summary: 'No changes detected.',
    ...overrides,
  };
}

describe('Change Impact Analyzer', () => {
  describe('analyzeSchemaChanges', () => {
    it('should detect no changes for identical schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };

      const changes = analyzeSchemaChanges(schema, schema);
      expect(changes).toHaveLength(0);
    });

    it('should detect removed parameter', () => {
      const oldSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      const newSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const changes = analyzeSchemaChanges(oldSchema, newSchema);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('parameter_removed');
      expect(changes[0].parameterPath).toBe('age');
      expect(changes[0].breaking).toBe(true);
    });

    it('should detect added optional parameter as non-breaking', () => {
      const oldSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const newSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const changes = analyzeSchemaChanges(oldSchema, newSchema);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('parameter_added');
      expect(changes[0].breaking).toBe(false);
    });

    it('should detect added required parameter as breaking', () => {
      const oldSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const newSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['age'],
      };

      const changes = analyzeSchemaChanges(oldSchema, newSchema);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('parameter_required_added');
      expect(changes[0].breaking).toBe(true);
    });

    it('should detect type change as breaking', () => {
      const oldSchema = {
        type: 'object',
        properties: {
          age: { type: 'string' },
        },
      };
      const newSchema = {
        type: 'object',
        properties: {
          age: { type: 'number' },
        },
      };

      const changes = analyzeSchemaChanges(oldSchema, newSchema);
      expect(changes.some(c => c.type === 'parameter_type_changed')).toBe(true);
      expect(changes.find(c => c.type === 'parameter_type_changed')?.breaking).toBe(true);
    });

    it('should detect enum value removal as breaking', () => {
      const oldSchema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
        },
      };
      const newSchema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      };

      const changes = analyzeSchemaChanges(oldSchema, newSchema);
      expect(changes.some(c => c.type === 'enum_value_removed')).toBe(true);
    });

    it('should detect enum value addition as non-breaking', () => {
      const oldSchema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      };
      const newSchema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
        },
      };

      const changes = analyzeSchemaChanges(oldSchema, newSchema);
      const addedEnum = changes.find(c => c.type === 'enum_value_added');
      expect(addedEnum).toBeDefined();
      expect(addedEnum?.breaking).toBe(false);
    });

    it('should detect constraint tightening as breaking', () => {
      const oldSchema = {
        type: 'object',
        properties: {
          count: { type: 'number', minimum: 0, maximum: 100 },
        },
      };
      const newSchema = {
        type: 'object',
        properties: {
          count: { type: 'number', minimum: 10, maximum: 100 },
        },
      };

      const changes = analyzeSchemaChanges(oldSchema, newSchema);
      const tightened = changes.find(c => c.type === 'constraint_tightened');
      expect(tightened).toBeDefined();
      expect(tightened?.breaking).toBe(true);
    });

    it('should detect constraint relaxation as non-breaking', () => {
      const oldSchema = {
        type: 'object',
        properties: {
          count: { type: 'number', minimum: 10, maximum: 100 },
        },
      };
      const newSchema = {
        type: 'object',
        properties: {
          count: { type: 'number', minimum: 0, maximum: 100 },
        },
      };

      const changes = analyzeSchemaChanges(oldSchema, newSchema);
      const relaxed = changes.find(c => c.type === 'constraint_relaxed');
      expect(relaxed).toBeDefined();
      expect(relaxed?.breaking).toBe(false);
    });

    it('should handle undefined schemas', () => {
      const changes1 = analyzeSchemaChanges(undefined, undefined);
      expect(changes1).toHaveLength(0);

      const changes2 = analyzeSchemaChanges(undefined, { type: 'object' });
      expect(changes2).toHaveLength(0);

      const changes3 = analyzeSchemaChanges({ type: 'object' }, undefined);
      expect(changes3).toHaveLength(1);
      expect(changes3[0].type).toBe('parameter_removed');
    });
  });

  describe('analyzeToolChangeImpact', () => {
    it('should return non-breaking for identical tools', () => {
      const tool = createMockTool({
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      });

      const impact = analyzeToolChangeImpact(tool, tool);
      expect(impact.backwardsCompatible).toBe(true);
      expect(impact.severity).toBe('none');
      expect(impact.riskScore).toBe(0);
    });

    it('should detect breaking changes from schema modifications', () => {
      const oldTool = createMockTool({
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      });
      const newTool = createMockTool({
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' }, id: { type: 'number' } },
          required: ['id'],
        },
      });

      const impact = analyzeToolChangeImpact(oldTool, newTool);
      expect(impact.backwardsCompatible).toBe(false);
      expect(impact.severity).toBe('breaking');
      expect(impact.riskScore).toBeGreaterThan(0);
    });

    it('should identify affected workflows', () => {
      const oldTool = createMockTool({ name: 'get_user' });
      const newTool = createMockTool({ name: 'get_user' });

      const workflows: WorkflowSignature[] = [
        { id: 'wf1', name: 'User flow', toolSequence: ['get_user', 'update_user'], succeeded: true },
        { id: 'wf2', name: 'Other flow', toolSequence: ['list_items'], succeeded: true },
      ];

      const impact = analyzeToolChangeImpact(oldTool, newTool, workflows);
      expect(impact.affectedWorkflows).toContain('wf1');
      expect(impact.affectedWorkflows).not.toContain('wf2');
    });

    it('should calculate migration complexity', () => {
      const oldTool = createMockTool({
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'string' },
            b: { type: 'string' },
            c: { type: 'string' },
            d: { type: 'string' },
          },
        },
      });
      const newTool = createMockTool({
        inputSchema: {
          type: 'object',
          properties: {},
        },
      });

      const impact = analyzeToolChangeImpact(oldTool, newTool);
      // Removing 4 parameters should be moderate or complex
      expect(['moderate', 'complex']).toContain(impact.migrationComplexity);
    });
  });

  describe('analyzeDiffImpact', () => {
    it('should handle empty diff', () => {
      const diff = createMockDiff();
      const oldBaseline = createMockBaseline();
      const newBaseline = createMockBaseline();

      const analysis = analyzeDiffImpact(diff, oldBaseline, newBaseline);
      expect(analysis.breakingChangesCount).toBe(0);
      expect(analysis.overallSeverity).toBe('none');
    });

    it('should detect removed tools as breaking', () => {
      const oldTool = createMockTool({ name: 'removed_tool' });
      const diff = createMockDiff({
        toolsRemoved: ['removed_tool'],
        severity: 'breaking',
        breakingCount: 1,
      });
      const oldBaseline = createMockBaseline({ tools: [oldTool] });
      const newBaseline = createMockBaseline({ tools: [] });

      const analysis = analyzeDiffImpact(diff, oldBaseline, newBaseline);
      expect(analysis.breakingChangesCount).toBeGreaterThan(0);
      expect(analysis.overallSeverity).toBe('breaking');
      expect(analysis.toolImpacts.has('removed_tool')).toBe(true);
      expect(analysis.toolImpacts.get('removed_tool')?.backwardsCompatible).toBe(false);
    });

    it('should detect added tools as non-breaking', () => {
      const newTool = createMockTool({ name: 'new_tool' });
      const diff = createMockDiff({
        toolsAdded: ['new_tool'],
        severity: 'info',
        infoCount: 1,
      });
      const oldBaseline = createMockBaseline({ tools: [] });
      const newBaseline = createMockBaseline({ tools: [newTool] });

      const analysis = analyzeDiffImpact(diff, oldBaseline, newBaseline);
      expect(analysis.toolImpacts.has('new_tool')).toBe(true);
      expect(analysis.toolImpacts.get('new_tool')?.backwardsCompatible).toBe(true);
    });

    it('should generate action items', () => {
      const oldTool = createMockTool({ name: 'removed_tool' });
      const diff = createMockDiff({
        toolsRemoved: ['removed_tool'],
        severity: 'breaking',
        breakingCount: 1,
      });
      const oldBaseline = createMockBaseline({ tools: [oldTool] });
      const newBaseline = createMockBaseline({ tools: [] });

      const analysis = analyzeDiffImpact(diff, oldBaseline, newBaseline);
      expect(analysis.actionItems.length).toBeGreaterThan(0);
      expect(analysis.actionItems[0].priority).toBe('critical');
    });
  });

  describe('isBreakingChange', () => {
    it('should identify schema changes as potentially breaking', () => {
      const change: BehaviorChange = {
        tool: 'test_tool',
        aspect: 'schema',
        before: 'old',
        after: 'new',
        severity: 'breaking',
        description: 'Schema changed',
      };

      expect(isBreakingChange(change)).toBe(true);
    });

    it('should not flag description-only changes as breaking', () => {
      const change: BehaviorChange = {
        tool: 'test_tool',
        aspect: 'schema',
        before: 'old description',
        after: 'new description',
        severity: 'info',
        description: 'Description updated in schema',
      };

      expect(isBreakingChange(change)).toBe(false);
    });

    it('should identify error handling regression as breaking', () => {
      const change: BehaviorChange = {
        tool: 'test_tool',
        aspect: 'error_handling',
        before: 'succeeded',
        after: 'failed',
        severity: 'breaking',
        description: 'Tool started failing',
      };

      expect(isBreakingChange(change)).toBe(true);
    });
  });

  describe('getBreakingChangeSummary', () => {
    it('should return message for no breaking changes', () => {
      const analysis = {
        overallSeverity: 'none' as const,
        breakingChangesCount: 0,
        toolImpacts: new Map(),
        brokenWorkflows: [],
        overallMigrationComplexity: 'trivial' as const,
        summary: 'No changes',
        actionItems: [],
      };

      const summary = getBreakingChangeSummary(analysis);
      expect(summary).toContain('No breaking changes');
    });

    it('should list breaking changes', () => {
      const analysis = {
        overallSeverity: 'breaking' as const,
        breakingChangesCount: 1,
        toolImpacts: new Map(),
        brokenWorkflows: ['wf1'],
        overallMigrationComplexity: 'moderate' as const,
        summary: 'Breaking changes detected',
        actionItems: [
          {
            priority: 'critical' as const,
            tool: 'broken_tool',
            description: 'Tool has breaking changes',
            suggestedAction: 'Fix it',
          },
        ],
      };

      const summary = getBreakingChangeSummary(analysis);
      expect(summary).toContain('Breaking Changes');
      expect(summary).toContain('broken_tool');
      expect(summary).toContain('Affected Workflows');
    });
  });

  describe('CHANGE_IMPACT constants', () => {
    it('should have risk weights for all change types', () => {
      const changeTypes = [
        'parameter_removed',
        'parameter_added',
        'parameter_type_changed',
        'parameter_required_added',
        'parameter_required_removed',
        'enum_value_removed',
        'enum_value_added',
        'constraint_added',
        'constraint_removed',
        'constraint_tightened',
        'constraint_relaxed',
        'description_changed',
        'default_changed',
        'format_changed',
      ];

      for (const type of changeTypes) {
        expect(CHANGE_IMPACT.RISK_WEIGHTS[type as keyof typeof CHANGE_IMPACT.RISK_WEIGHTS]).toBeDefined();
      }
    });

    it('should have severity thresholds', () => {
      expect(CHANGE_IMPACT.SEVERITY_THRESHOLDS.info).toBeDefined();
      expect(CHANGE_IMPACT.SEVERITY_THRESHOLDS.warning).toBeDefined();
      expect(CHANGE_IMPACT.SEVERITY_THRESHOLDS.breaking).toBeDefined();
    });
  });
});
