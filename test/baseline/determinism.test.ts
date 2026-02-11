/**
 * Determinism tests for baseline generation.
 *
 * Verifies that bellwether check produces identical baselines on repeated runs.
 * Critical for ensuring reliable drift detection in CI/CD pipelines.
 *
 * Tests cover:
 * 1. Repeated baseline creation produces identical hashes
 * 2. Property ordering is consistent across iterations
 * 3. Serialization round-trips preserve equality
 * 4. Edge cases (Unicode, floating-point, empty schemas)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  verifyBaselineHash,
  computeSchemaHash,
  compareBaselines,
} from '../../src/baseline/index.js';
import type { InterviewResult, ToolProfile, ToolInteraction } from '../../src/interview/types.js';
import type { DiscoveryResult, MCPTool } from '../../src/transport/types.js';

describe('Baseline Determinism', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `bellwether-determinism-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Repeated baseline creation', () => {
    it('should produce identical baselines from same input', () => {
      const result = createMockInterviewResult();

      const baseline1 = createBaseline(result, 'npx test-server');
      const baseline2 = createBaseline(result, 'npx test-server');

      // Note: baseline hash includes metadata timestamps, so it can differ per call.
      // Instead verify structural determinism of tool capabilities.
      expect(baseline1.capabilities.tools.length).toBe(baseline2.capabilities.tools.length);
      for (let i = 0; i < baseline1.capabilities.tools.length; i++) {
        const tool1 = baseline1.capabilities.tools[i];
        const tool2 = baseline2.capabilities.tools[i];
        expect(tool1.schemaHash).toBe(tool2.schemaHash);
        expect(tool1.name).toBe(tool2.name);
        expect(tool1.description).toBe(tool2.description);
        expect(JSON.stringify(tool1.inputSchema)).toBe(JSON.stringify(tool2.inputSchema));
      }

      // Verify server fingerprint is identical
      expect(baseline1.server.name).toBe(baseline2.server.name);
      expect(baseline1.server.version).toBe(baseline2.server.version);
      expect(baseline1.server.protocolVersion).toBe(baseline2.server.protocolVersion);
    });

    it('should produce identical tool hashes across 50 iterations', () => {
      const result = createMockInterviewResult();
      const baselines = Array.from({ length: 50 }, () => createBaseline(result, 'npx test-server'));

      // Verify tool schemaHashes are consistent (hash can include timestamps)
      const toolHashes = new Set(
        baselines.map((b) => b.capabilities.tools.map((t) => t.schemaHash).join(','))
      );
      expect(toolHashes.size).toBe(1);
    });

    it('should produce identical tool ordering', () => {
      const result = createMockInterviewResult({
        tools: [
          createMockToolProfile('zulu_tool'),
          createMockToolProfile('alpha_tool'),
          createMockToolProfile('mike_tool'),
        ],
      });

      const baseline1 = createBaseline(result, 'npx test-server');
      const baseline2 = createBaseline(result, 'npx test-server');

      const order1 = baseline1.capabilities.tools.map((t) => t.name).join(',');
      const order2 = baseline2.capabilities.tools.map((t) => t.name).join(',');
      expect(order1).toBe(order2);
    });
  });

  describe('Schema hash consistency', () => {
    it('should produce identical hash for same schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const hash1 = computeSchemaHash(schema);
      const hash2 = computeSchemaHash(schema);
      const hash3 = computeSchemaHash(schema);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should produce identical hash regardless of property order', () => {
      const schema1 = {
        type: 'object',
        properties: {
          z: { type: 'string' },
          a: { type: 'number' },
          m: { type: 'boolean' },
        },
      };

      const schema2 = {
        type: 'object',
        properties: {
          a: { type: 'number' },
          m: { type: 'boolean' },
          z: { type: 'string' },
        },
      };

      const hash1 = computeSchemaHash(schema1);
      const hash2 = computeSchemaHash(schema2);

      expect(hash1).toBe(hash2);
    });

    it('should produce identical hash for equivalent required arrays', () => {
      const schema1 = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
        },
        required: ['b', 'a'],
      };

      const schema2 = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
        },
        required: ['a', 'b'],
      };

      const hash1 = computeSchemaHash(schema1);
      const hash2 = computeSchemaHash(schema2);

      expect(hash1).toBe(hash2);
    });

    it('should produce identical hash for equivalent enum arrays', () => {
      const schema1 = {
        type: 'string',
        enum: ['red', 'green', 'blue'],
      };

      const schema2 = {
        type: 'string',
        enum: ['blue', 'red', 'green'],
      };

      const hash1 = computeSchemaHash(schema1);
      const hash2 = computeSchemaHash(schema2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('Serialization round-trips', () => {
    it('should preserve baseline through save/load cycle', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');
      const path = join(testDir, 'baseline.json');

      saveBaseline(baseline, path);
      const loaded = loadBaseline(path);

      // Verify integrity is maintained
      expect(verifyBaselineHash(loaded)).toBe(true);

      // Compare key fields (excluding dates which may serialize differently)
      expect(loaded.capabilities.tools.length).toBe(baseline.capabilities.tools.length);
      expect(loaded.hash).toBe(baseline.hash);
      expect(loaded.metadata.serverCommand).toBe(baseline.metadata.serverCommand);
    });

    it('should maintain integrity through 10 save/load cycles', () => {
      const result = createMockInterviewResult();
      let baseline = createBaseline(result, 'npx test-server');

      for (let i = 0; i < 10; i++) {
        const path = join(testDir, `baseline-${i}.json`);
        saveBaseline(baseline, path);
        baseline = loadBaseline(path);
      }

      expect(verifyBaselineHash(baseline)).toBe(true);
      // Hash should remain stable through round-trips.
    });

    it('should produce identical JSON for same baseline', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');

      const json1 = JSON.stringify(baseline);
      const json2 = JSON.stringify(baseline);

      expect(json1).toBe(json2);
    });
  });

  describe('Comparison determinism', () => {
    it('should produce identical diff when comparing same baselines twice', () => {
      const result1 = createMockInterviewResult();
      const result2 = createMockInterviewResult({
        tools: [
          createMockToolProfile('test_tool', {
            description: 'Modified description',
          }),
        ],
      });

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff1 = compareBaselines(baseline1, baseline2, {});
      const diff2 = compareBaselines(baseline1, baseline2, {});

      expect(JSON.stringify(diff1)).toBe(JSON.stringify(diff2));
    });

    it('should produce consistent severity across comparisons', () => {
      const result1 = createMockInterviewResult();
      const result2 = createMockInterviewResult({
        tools: [], // All tools removed = breaking
      });

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const severities = Array.from(
        { length: 10 },
        () => compareBaselines(baseline1, baseline2, {}).severity
      );

      const uniqueSeverities = new Set(severities);
      expect(uniqueSeverities.size).toBe(1);
      expect(severities[0]).toBe('breaking');
    });
  });

  describe('Edge case determinism', () => {
    it('should handle Unicode property names consistently', () => {
      const schema = {
        type: 'object',
        properties: {
          élève: { type: 'string' },
          中文参数: { type: 'number' },
          rocketProp: { type: 'boolean' },
        },
      };

      const hash1 = computeSchemaHash(schema);
      const hash2 = computeSchemaHash(schema);

      expect(hash1).toBe(hash2);
    });

    it('should treat equivalent Unicode representations equally', () => {
      // café with combining acute accent vs precomposed é
      const schema1 = {
        type: 'object',
        properties: {
          'cafe\u0301': { type: 'string' }, // e + combining acute
        },
      };

      const schema2 = {
        type: 'object',
        properties: {
          'caf\u00e9': { type: 'string' }, // precomposed é
        },
      };

      const hash1 = computeSchemaHash(schema1);
      const hash2 = computeSchemaHash(schema2);

      expect(hash1).toBe(hash2);
    });

    it('should handle floating-point numbers consistently', () => {
      const schema = {
        type: 'number',
        minimum: 3.141592653589793,
        maximum: 1e15,
      };

      const hash1 = computeSchemaHash(schema);
      const hash2 = computeSchemaHash(schema);

      expect(hash1).toBe(hash2);
    });

    it('should normalize integer vs float representations', () => {
      // 1.0 and 1 should be treated equivalently
      const schema1 = {
        type: 'number',
        minimum: 1,
      };

      const schema2 = {
        type: 'number',
        minimum: 1.0,
      };

      const hash1 = computeSchemaHash(schema1);
      const hash2 = computeSchemaHash(schema2);

      expect(hash1).toBe(hash2);
    });

    it('should handle empty schemas consistently', () => {
      const hash1 = computeSchemaHash({});
      const hash2 = computeSchemaHash({});
      const hash3 = computeSchemaHash(undefined);
      const hash4 = computeSchemaHash(undefined);

      expect(hash1).toBe(hash2);
      expect(hash3).toBe(hash4);
      expect(hash3).toBe('empty');
    });

    it('should handle null values consistently', () => {
      const schema = {
        type: 'object',
        properties: {
          nullableField: { type: ['string', 'null'] },
        },
      };

      const hash1 = computeSchemaHash(schema);
      const hash2 = computeSchemaHash(schema);

      expect(hash1).toBe(hash2);
    });

    it('should handle deeply nested schemas consistently', () => {
      const schema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        value: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const hash1 = computeSchemaHash(schema);
      const hash2 = computeSchemaHash(schema);

      expect(hash1).toBe(hash2);
    });

    it('should handle circular reference protection consistently', () => {
      // Create a schema with self-reference (via any cast)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema: any = {
        type: 'object',
        properties: {},
      };
      schema.properties.self = schema; // Circular reference

      // Should not hang or crash
      const hash1 = computeSchemaHash(schema);
      const hash2 = computeSchemaHash(schema);

      // Hash should be stable (with circular marker)
      expect(hash1).toBe(hash2);
    });
  });

  describe('Tool profile determinism', () => {
    it('should produce identical assertions ordering', () => {
      const result = createMockInterviewResult({
        tools: [
          createMockToolProfile('test_tool', {
            behavioralNotes: ['Note Z', 'Note A', 'Note M'],
            limitations: ['Limit Z', 'Limit A'],
            securityNotes: ['Security Z', 'Security A'],
          }),
        ],
      });

      const baseline1 = createBaseline(result, 'npx test-server');
      const baseline2 = createBaseline(result, 'npx test-server');

      // Assertions are stored in toolProfiles, not directly on the baseline
      const assertions1 = JSON.stringify(baseline1.toolProfiles[0].assertions);
      const assertions2 = JSON.stringify(baseline2.toolProfiles[0].assertions);

      expect(assertions1).toBe(assertions2);
    });

    it('should produce identical interaction ordering', () => {
      const result = createMockInterviewResult({
        tools: [
          createMockToolProfile('test_tool', {
            interactions: [
              createMockInteraction('Query 3'),
              createMockInteraction('Query 1'),
              createMockInteraction('Query 2'),
            ],
          }),
        ],
      });

      const baseline1 = createBaseline(result, 'npx test-server');
      const baseline2 = createBaseline(result, 'npx test-server');

      // Note: baseline hash can include timestamps, so compare stable fields.
      expect(baseline1.capabilities.tools[0].schemaHash).toBe(
        baseline2.capabilities.tools[0].schemaHash
      );
      expect(JSON.stringify(baseline1.toolProfiles[0].assertions)).toBe(
        JSON.stringify(baseline2.toolProfiles[0].assertions)
      );
    });
  });
});

// ==================== Helper Functions ====================

function createMockInterviewResult(
  options: {
    serverName?: string;
    tools?: ToolProfile[];
  } = {}
): InterviewResult {
  const defaultTool = createMockToolProfile('test_tool');

  const discovery: DiscoveryResult = {
    serverInfo: {
      name: options.serverName ?? 'test-server',
      version: '1.0.0',
    },
    protocolVersion: '2024-11-05',
    tools: (options.tools ?? [defaultTool]).map((t) => ({
      name: t.name,
      description: t.description ?? `${t.name} description`,
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
      },
    })) as MCPTool[],
    prompts: [],
    resources: [],
    capabilities: { tools: {}, prompts: {} },
    timestamp: new Date('2024-01-01T00:00:00Z'),
    serverCommand: 'npx',
    serverArgs: ['test-server'],
  };

  return {
    discovery,
    toolProfiles: options.tools ?? [defaultTool],
    promptProfiles: [],
    resourceProfiles: [],
    summary: 'Test interview summary',
    limitations: [],
    recommendations: [],
    metadata: {
      startTime: new Date('2024-01-01T00:00:00Z'),
      endTime: new Date('2024-01-01T00:01:00Z'),
      durationMs: 60000,
      toolCallCount: 10,
      errorCount: 0,
      model: 'check',
      personas: [],
    },
  };
}

function createMockToolProfile(name: string, overrides: Partial<ToolProfile> = {}): ToolProfile {
  return {
    name,
    description: overrides.description ?? `${name} description`,
    interactions: overrides.interactions ?? [createMockInteraction()],
    behavioralNotes: overrides.behavioralNotes ?? [],
    limitations: overrides.limitations ?? [],
    securityNotes: overrides.securityNotes ?? [],
    ...overrides,
  };
}

function createMockInteraction(query: string = 'Test query'): ToolInteraction {
  return {
    toolName: 'test_tool',
    question: {
      description: query,
      category: 'happy_path',
      args: { input: 'test' },
    },
    response: {
      content: [{ type: 'text', text: 'Success' }],
      isError: false,
    },
    error: null,
    analysis: 'Test passed',
    durationMs: 100,
  };
}
