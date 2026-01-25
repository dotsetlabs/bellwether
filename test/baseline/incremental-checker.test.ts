/**
 * Tests for incremental checking functionality.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeForIncremental,
  mergeFingerprints,
  formatIncrementalSummary,
  isIncrementalWorthwhile,
  addIncrementalMetadata,
} from '../../src/baseline/incremental-checker.js';
import { computeSchemaHash } from '../../src/baseline/schema-compare.js';
import type { MCPTool } from '../../src/transport/types.js';
import type { BehavioralBaseline, ToolFingerprint } from '../../src/baseline/types.js';

describe('Incremental Checker', () => {
  describe('analyzeForIncremental', () => {
    it('should test all tools when no baseline exists', () => {
      const tools: MCPTool[] = [
        createMockTool('tool_a'),
        createMockTool('tool_b'),
      ];

      const result = analyzeForIncremental(tools, null);

      expect(result.toolsToTest).toEqual(['tool_a', 'tool_b']);
      expect(result.toolsToSkip).toEqual([]);
      expect(result.cachedFingerprints).toEqual([]);
      expect(result.changeSummary.newTools).toBe(2);
    });

    it('should test all tools when forceRetest is true', () => {
      const tools: MCPTool[] = [createMockTool('tool_a')];
      const baseline = createMockBaseline(['tool_a']);

      const result = analyzeForIncremental(tools, baseline, { forceRetest: true });

      expect(result.toolsToTest).toEqual(['tool_a']);
      expect(result.toolsToSkip).toEqual([]);
    });

    it('should identify new tools', () => {
      const tools: MCPTool[] = [
        createMockTool('tool_a'),
        createMockTool('tool_b'),
        createMockTool('tool_c'),
      ];
      const baseline = createMockBaseline(['tool_a']);

      const result = analyzeForIncremental(tools, baseline);

      expect(result.changeSummary.newToolNames).toEqual(['tool_b', 'tool_c']);
      expect(result.toolsToTest).toContain('tool_b');
      expect(result.toolsToTest).toContain('tool_c');
    });

    it('should identify tools with changed schemas', () => {
      const tools: MCPTool[] = [
        createMockTool('tool_a', { newProperty: { type: 'string' } }),
      ];
      const baseline = createMockBaseline(['tool_a']);

      const result = analyzeForIncremental(tools, baseline);

      expect(result.changeSummary.changedToolNames).toEqual(['tool_a']);
      expect(result.toolsToTest).toContain('tool_a');
    });

    it('should skip tools with unchanged schemas', () => {
      const tools: MCPTool[] = [createMockTool('tool_a')];
      const baseline = createMockBaseline(['tool_a']);

      const result = analyzeForIncremental(tools, baseline);

      expect(result.toolsToSkip).toEqual(['tool_a']);
      expect(result.cachedFingerprints).toHaveLength(1);
      expect(result.changeSummary.unchangedTools).toBe(1);
    });

    it('should identify removed tools', () => {
      const tools: MCPTool[] = [createMockTool('tool_a')];
      const baseline = createMockBaseline(['tool_a', 'tool_b', 'tool_c']);

      const result = analyzeForIncremental(tools, baseline);

      expect(result.changeSummary.removedToolNames).toEqual(['tool_b', 'tool_c']);
      expect(result.changeSummary.removedTools).toBe(2);
    });

    it('should always retest tools in alwaysRetest list', () => {
      const tools: MCPTool[] = [
        createMockTool('tool_a'),
        createMockTool('tool_b'),
      ];
      const baseline = createMockBaseline(['tool_a', 'tool_b']);

      const result = analyzeForIncremental(tools, baseline, {
        alwaysRetest: ['tool_a'],
      });

      expect(result.toolsToTest).toContain('tool_a');
      expect(result.toolsToSkip).toContain('tool_b');
    });

    it('should retest tools with expired cache', () => {
      const tools: MCPTool[] = [createMockTool('tool_a')];
      const baseline = createMockBaseline(['tool_a']);
      // Set lastTestedAt to 200 hours ago
      baseline.capabilities.tools[0].lastTestedAt = new Date(
        Date.now() - 200 * 60 * 60 * 1000
      ).toISOString();

      const result = analyzeForIncremental(tools, baseline, {
        maxCacheAgeHours: 168, // 1 week
      });

      expect(result.toolsToTest).toContain('tool_a');
      expect(result.toolsToSkip).toEqual([]);
    });
  });

  describe('mergeFingerprints', () => {
    it('should merge and sort fingerprints by name', () => {
      const newFingerprints: ToolFingerprint[] = [
        createMockFingerprint('zulu'),
        createMockFingerprint('alpha'),
      ];
      const cachedFingerprints: ToolFingerprint[] = [
        createMockFingerprint('mike'),
        createMockFingerprint('bravo'),
      ];

      const merged = mergeFingerprints(newFingerprints, cachedFingerprints);

      expect(merged.map(f => f.name)).toEqual(['alpha', 'bravo', 'mike', 'zulu']);
    });

    it('should handle empty arrays', () => {
      const merged = mergeFingerprints([], []);
      expect(merged).toEqual([]);
    });
  });

  describe('formatIncrementalSummary', () => {
    it('should format summary with all change types', () => {
      const summary = formatIncrementalSummary({
        newTools: 2,
        changedTools: 1,
        unchangedTools: 5,
        removedTools: 1,
        newToolNames: ['a', 'b'],
        changedToolNames: ['c'],
        removedToolNames: ['d'],
      });

      expect(summary).toContain('2 new tools');
      expect(summary).toContain('1 changed');
      expect(summary).toContain('5 cached');
      expect(summary).toContain('1 removed');
    });

    it('should handle empty summary', () => {
      const summary = formatIncrementalSummary({
        newTools: 0,
        changedTools: 0,
        unchangedTools: 0,
        removedTools: 0,
        newToolNames: [],
        changedToolNames: [],
        removedToolNames: [],
      });

      expect(summary).toBe('No tools to check');
    });
  });

  describe('isIncrementalWorthwhile', () => {
    it('should return true when > 20% can be skipped', () => {
      const result = {
        toolsToTest: ['a', 'b', 'c'],
        toolsToSkip: ['d', 'e'],
        cachedFingerprints: [],
        changeSummary: {
          newTools: 0,
          changedTools: 0,
          unchangedTools: 0,
          removedTools: 0,
          newToolNames: [],
          changedToolNames: [],
          removedToolNames: [],
        },
      };

      expect(isIncrementalWorthwhile(result)).toBe(true);
    });

    it('should return false when < 20% can be skipped', () => {
      const result = {
        toolsToTest: ['a', 'b', 'c', 'd', 'e'],
        toolsToSkip: ['f'],
        cachedFingerprints: [],
        changeSummary: {
          newTools: 0,
          changedTools: 0,
          unchangedTools: 0,
          removedTools: 0,
          newToolNames: [],
          changedToolNames: [],
          removedToolNames: [],
        },
      };

      expect(isIncrementalWorthwhile(result)).toBe(false);
    });
  });

  describe('addIncrementalMetadata', () => {
    it('should add lastTestedAt and inputSchemaHashAtTest', () => {
      const fingerprint = createMockFingerprint('test_tool');
      const before = Date.now();

      const updated = addIncrementalMetadata(fingerprint, 'hash123');

      expect(updated.lastTestedAt).toBeDefined();
      expect(updated.lastTestedAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(updated.inputSchemaHashAtTest).toBe('hash123');
    });

    it('should preserve existing properties', () => {
      const fingerprint = createMockFingerprint('test_tool');
      fingerprint.description = 'Custom description';

      const updated = addIncrementalMetadata(fingerprint, 'hash123');

      expect(updated.name).toBe('test_tool');
      expect(updated.description).toBe('Custom description');
    });
  });
});

// ==================== Helper Functions ====================

function createMockTool(name: string, additionalProperties?: Record<string, unknown>): MCPTool {
  return {
    name,
    description: `${name} description`,
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
        ...additionalProperties,
      },
    },
  };
}

function createMockFingerprint(name: string): ToolFingerprint {
  return {
    name,
    description: `${name} description`,
    schemaHash: `hash_${name}`,
    assertions: [],
    securityNotes: [],
    limitations: [],
  };
}

function createMockBaseline(toolNames: string[]): BehavioralBaseline {
  const tools = toolNames.map(name => {
    const tool = createMockTool(name);
    const fingerprint = createMockFingerprint(name);
    // Compute a consistent schema hash for the default tool schema
    fingerprint.schemaHash = computeSchemaHash(tool.inputSchema);
    return {
      name: fingerprint.name,
      description: fingerprint.description,
      inputSchema: tool.inputSchema,
      schemaHash: fingerprint.schemaHash,
    };
  });

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
      capabilities: ['tools'],
    },
    capabilities: { tools },
    interviews: [],
    toolProfiles: [],
    summary: 'Test baseline',
    assertions: [],
    hash: 'test-hash',
  };
}
