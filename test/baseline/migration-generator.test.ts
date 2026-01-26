/**
 * Tests for migration guide generator.
 */

import { describe, it, expect } from 'vitest';
import {
  generateMigrationGuide,
  formatMigrationGuideMarkdown,
  formatMigrationGuideText,
  hasBreakingMigrationChanges,
  getBreakingTools,
} from '../../src/baseline/migration-generator.js';
import type { BehavioralBaseline, ToolFingerprint } from '../../src/baseline/types.js';

// Helper to create a mock tool
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
function createMockBaseline(
  tools: ToolFingerprint[] = [],
  overrides: (Partial<BehavioralBaseline> & { createdAt?: Date }) = {}
): BehavioralBaseline {
  const { createdAt, ...restOverrides } = overrides;
  const capabilityTools = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? {},
    schemaHash: tool.schemaHash,
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
  const generatedAt = restOverrides.metadata?.generatedAt ??
    (createdAt ? createdAt.toISOString() : new Date().toISOString());

  return {
    version: '1.0.0',
    metadata: {
      mode: 'check',
      generatedAt,
      cliVersion: '1.0.0',
      serverCommand: 'npx test-server',
      durationMs: 1000,
      personas: [],
      model: 'none',
      ...restOverrides.metadata,
    },
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: [],
      ...restOverrides.server,
    },
    capabilities: {
      tools: capabilityTools,
      ...restOverrides.capabilities,
    },
    interviews: restOverrides.interviews ?? [],
    toolProfiles: restOverrides.toolProfiles ?? toolProfiles,
    summary: 'Test baseline',
    assertions: [],
    hash: 'hash123',
    ...restOverrides,
  };
}

describe('Migration Guide Generator', () => {
  describe('generateMigrationGuide', () => {
    it('should generate guide for identical baselines', () => {
      const baseline = createMockBaseline([createMockTool({ name: 'tool1' })]);

      const guide = generateMigrationGuide(baseline, baseline);

      expect(guide.breakingChanges.length).toBe(0);
      expect(guide.estimatedEffort).toBe('trivial');
    });

    it('should detect removed tools', () => {
      const oldBaseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
        createMockTool({ name: 'tool2' }),
      ]);
      const newBaseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
      ]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      expect(guide.removedTools).toContain('tool2');
      expect(guide.breakingChanges.length).toBe(1);
      expect(guide.breakingChanges[0].toolName).toBe('tool2');
    });

    it('should detect added tools', () => {
      const oldBaseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
      ]);
      const newBaseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
        createMockTool({ name: 'tool2' }),
      ]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      expect(guide.addedTools).toContain('tool2');
      expect(guide.steps.some(s => s.type === 'tool_addition')).toBe(true);
    });

    it('should detect schema changes', () => {
      const oldBaseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          schemaHash: 'hash1',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        }),
      ]);
      const newBaseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          schemaHash: 'hash2',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
            required: ['name', 'age'],
          },
        }),
      ]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      expect(guide.stats.toolsAffected).toBeGreaterThan(0);
    });

    // Note: Deprecation detection in migration guides relies on getToolFingerprints
    // which doesn't extract deprecation fields from baseline.capabilities.tools.
    // Deprecation tracking is not currently supported via baselines.

    it('should estimate effort based on breaking changes', () => {
      // No breaking changes = trivial
      const trivialGuide = generateMigrationGuide(
        createMockBaseline([createMockTool({ name: 'tool1' })]),
        createMockBaseline([createMockTool({ name: 'tool1' })])
      );
      expect(trivialGuide.estimatedEffort).toBe('trivial');

      // Many breaking changes = higher effort
      const manyTools: ToolFingerprint[] = [];
      for (let i = 0; i < 10; i++) {
        manyTools.push(createMockTool({ name: `tool${i}` }));
      }
      const oldWithMany = createMockBaseline(manyTools);
      const newEmpty = createMockBaseline([]);
      const majorGuide = generateMigrationGuide(oldWithMany, newEmpty);
      expect(majorGuide.estimatedEffort).toBe('major');
    });

    it('should generate summary', () => {
      const oldBaseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
        createMockTool({ name: 'tool2' }),
      ]);
      const newBaseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
        createMockTool({ name: 'tool3' }),
      ]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      expect(guide.summary).toBeTruthy();
      expect(guide.summary.length).toBeGreaterThan(0);
    });

    it('should include version info', () => {
      const oldBaseline = createMockBaseline([], { version: '1.0.0' });
      const newBaseline = createMockBaseline([], { version: '2.0.0' });

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      expect(guide.fromVersion).toBe('1.0.0');
      expect(guide.toVersion).toBe('2.0.0');
    });

    it('should include date range', () => {
      const date1 = new Date('2025-01-01');
      const date2 = new Date('2025-01-15');

      const oldBaseline = createMockBaseline([], { createdAt: date1 });
      const newBaseline = createMockBaseline([], { createdAt: date2 });

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      expect(guide.dateRange.from).toEqual(date1);
      expect(guide.dateRange.to).toEqual(date2);
    });
  });

  describe('formatMigrationGuideMarkdown', () => {
    it('should format guide as markdown', () => {
      const oldBaseline = createMockBaseline([createMockTool({ name: 'tool1' })]);
      const newBaseline = createMockBaseline([createMockTool({ name: 'tool2' })]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);
      const markdown = formatMigrationGuideMarkdown(guide);

      expect(markdown).toContain('# Migration Guide');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## Statistics');
    });

    it('should include breaking changes section', () => {
      const oldBaseline = createMockBaseline([createMockTool({ name: 'tool1' })]);
      const newBaseline = createMockBaseline([]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);
      const markdown = formatMigrationGuideMarkdown(guide);

      expect(markdown).toContain('## Breaking Changes');
      expect(markdown).toContain('tool1');
    });

    it('should include migration steps', () => {
      const oldBaseline = createMockBaseline([createMockTool({ name: 'tool1' })]);
      const newBaseline = createMockBaseline([createMockTool({ name: 'tool2' })]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);
      const markdown = formatMigrationGuideMarkdown(guide);

      expect(markdown).toContain('## Migration Steps');
    });

    // Note: Deprecation warnings in migration guide markdown rely on deprecation
    // fields which are not currently extracted from baselines.

    it('should include new and removed tools sections', () => {
      const oldBaseline = createMockBaseline([createMockTool({ name: 'old_tool' })]);
      const newBaseline = createMockBaseline([createMockTool({ name: 'new_tool' })]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);
      const markdown = formatMigrationGuideMarkdown(guide);

      expect(markdown).toContain('New Tools Available');
      expect(markdown).toContain('new_tool');
      expect(markdown).toContain('Removed Tools');
      expect(markdown).toContain('old_tool');
    });
  });

  describe('formatMigrationGuideText', () => {
    it('should format guide as plain text', () => {
      const oldBaseline = createMockBaseline([createMockTool({ name: 'tool1' })]);
      const newBaseline = createMockBaseline([]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);
      const text = formatMigrationGuideText(guide);

      expect(text).toContain('Migration Guide');
      expect(text).toContain('Estimated Effort');
      expect(text).toContain('Breaking Changes');
    });

    it('should show effort level', () => {
      const oldBaseline = createMockBaseline([]);
      const newBaseline = createMockBaseline([]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);
      const text = formatMigrationGuideText(guide);

      expect(text).toContain('TRIVIAL');
    });
  });

  describe('hasBreakingMigrationChanges', () => {
    it('should return false for guide with no breaking changes', () => {
      const baseline = createMockBaseline([createMockTool({ name: 'tool1' })]);
      const guide = generateMigrationGuide(baseline, baseline);

      expect(hasBreakingMigrationChanges(guide)).toBe(false);
    });

    it('should return true for guide with breaking changes', () => {
      const oldBaseline = createMockBaseline([createMockTool({ name: 'tool1' })]);
      const newBaseline = createMockBaseline([]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      expect(hasBreakingMigrationChanges(guide)).toBe(true);
    });
  });

  describe('getBreakingTools', () => {
    it('should return empty array when no breaking tools', () => {
      const baseline = createMockBaseline([createMockTool({ name: 'tool1' })]);
      const guide = generateMigrationGuide(baseline, baseline);

      expect(getBreakingTools(guide)).toEqual([]);
    });

    it('should return list of tools with breaking changes', () => {
      const oldBaseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
        createMockTool({ name: 'tool2' }),
      ]);
      const newBaseline = createMockBaseline([]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);
      const breakingTools = getBreakingTools(guide);

      expect(breakingTools).toContain('tool1');
      expect(breakingTools).toContain('tool2');
    });
  });

  describe('schema change detection', () => {
    it('should detect parameter removal', () => {
      const oldBaseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          schemaHash: 'hash1',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
            required: ['name'],
          },
        }),
      ]);
      const newBaseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          schemaHash: 'hash2',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        }),
      ]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      // Should have a step about removed parameter
      expect(guide.steps.some(s => s.type === 'remove_parameter')).toBe(true);
    });

    it('should detect new required parameter', () => {
      const oldBaseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          schemaHash: 'hash1',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        }),
      ]);
      const newBaseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          schemaHash: 'hash2',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
            required: ['name', 'email'],
          },
        }),
      ]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      expect(guide.steps.some(s => s.type === 'add_parameter' && s.isBreaking)).toBe(true);
    });

    it('should detect type changes', () => {
      const oldBaseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          schemaHash: 'hash1',
          inputSchema: {
            type: 'object',
            properties: {
              count: { type: 'number' },
            },
          },
        }),
      ]);
      const newBaseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          schemaHash: 'hash2',
          inputSchema: {
            type: 'object',
            properties: {
              count: { type: 'string' },
            },
          },
        }),
      ]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      expect(guide.steps.some(s => s.type === 'change_type')).toBe(true);
    });
  });

  describe('code examples', () => {
    it('should generate code examples for tool removal', () => {
      const oldBaseline = createMockBaseline([createMockTool({ name: 'my_tool' })]);
      const newBaseline = createMockBaseline([]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);
      const removalStep = guide.steps.find(s => s.type === 'tool_removal');

      expect(removalStep).toBeDefined();
      expect(removalStep!.codeExamples.length).toBeGreaterThan(0);
      expect(removalStep!.codeExamples[0].before).toContain('my_tool');
    });

    it('should generate code examples for tool addition', () => {
      const oldBaseline = createMockBaseline([]);
      const newBaseline = createMockBaseline([
        createMockTool({
          name: 'new_tool',
          inputSchema: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
            },
          },
        }),
      ]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);
      const additionStep = guide.steps.find(s => s.type === 'tool_addition');

      expect(additionStep).toBeDefined();
      expect(additionStep!.codeExamples.length).toBeGreaterThan(0);
      expect(additionStep!.codeExamples[0].after).toContain('new_tool');
    });
  });

  describe('statistics', () => {
    it('should calculate correct statistics', () => {
      const oldBaseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
        createMockTool({ name: 'tool2' }),
      ]);
      const newBaseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
        createMockTool({ name: 'tool3' }),
      ]);

      const guide = generateMigrationGuide(oldBaseline, newBaseline);

      expect(guide.stats.breakingChangesCount).toBe(1); // tool2 removed
      expect(guide.stats.toolsAffected).toBe(2); // tool2 removed, tool3 added
    });
  });
});
