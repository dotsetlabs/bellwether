/**
 * Tests for baseline save/load and comparison functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  verifyIntegrity,
  baselineExists,
  BASELINE_VERSION,
  compareBaselines,
  compareWithBaseline,
  hasBreakingChanges,
  hasSecurityChanges,
  filterByMinimumSeverity,
} from '../../src/baseline/index.js';
import type { InterviewResult, ToolProfile } from '../../src/interview/types.js';
import type { BehavioralBaseline } from '../../src/baseline/types.js';

// Helper to create mock interview result
function createMockInterviewResult(options: {
  serverName?: string;
  tools?: Partial<ToolProfile>[];
} = {}): InterviewResult {
  const tools = options.tools || [
    {
      name: 'test_tool',
      description: 'A test tool',
      interactions: [
        {
          toolName: 'test_tool',
          question: {
            description: 'Test question',
            category: 'happy_path' as const,
            args: { input: 'test' },
          },
          response: { content: [{ type: 'text', text: 'success' }] },
          error: null,
          analysis: 'Tool executed successfully',
          durationMs: 100,
        },
      ],
      behavioralNotes: ['Handles input correctly'],
      limitations: ['Cannot process empty input'],
      securityNotes: ['Requires authentication'],
    },
  ];

  return {
    discovery: {
      serverInfo: {
        name: options.serverName || 'test-server',
        version: '1.0.0',
      },
      protocolVersion: '0.1.0',
      capabilities: {
        tools: true,
        prompts: false,
        resources: false,
        logging: false,
      },
      tools: tools.map((t) => ({
        name: t.name || 'test_tool',
        description: t.description || 'A test tool',
        inputSchema: { type: 'object', properties: {} },
      })),
      prompts: [],
      resources: [],
    },
    toolProfiles: tools as ToolProfile[],
    summary: 'Test interview completed',
    limitations: ['Server limitation 1'],
    recommendations: ['Recommendation 1'],
    metadata: {
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 1000,
      toolCallCount: 1,
      errorCount: 0,
      model: 'test-model',
    },
  };
}

describe('Baseline Module', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `inquest-baseline-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createBaseline', () => {
    it('should create a baseline from interview result', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');

      expect(baseline.version).toBe(BASELINE_VERSION);
      expect(baseline.serverCommand).toBe('npx test-server');
      expect(baseline.server.name).toBe('test-server');
      expect(baseline.server.version).toBe('1.0.0');
      expect(baseline.tools).toHaveLength(1);
      expect(baseline.tools[0].name).toBe('test_tool');
      expect(baseline.integrityHash).toBeDefined();
    });

    it('should extract behavioral assertions', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');

      expect(baseline.assertions.length).toBeGreaterThan(0);

      const toolAssertions = baseline.assertions.filter((a) => a.tool === 'test_tool');
      expect(toolAssertions.length).toBeGreaterThan(0);
    });

    it('should extract tool fingerprints', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');

      const toolFingerprint = baseline.tools[0];
      expect(toolFingerprint.name).toBe('test_tool');
      expect(toolFingerprint.description).toBe('A test tool');
      expect(toolFingerprint.schemaHash).toBeDefined();
      expect(toolFingerprint.limitations).toContain('Cannot process empty input');
      expect(toolFingerprint.securityNotes).toContain('Requires authentication');
    });

    it('should capture server capabilities', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');

      expect(baseline.server.capabilities).toContain('tools');
      expect(baseline.server.capabilities).not.toContain('prompts');
    });
  });

  describe('saveBaseline / loadBaseline', () => {
    it('should save and load baseline correctly', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');
      const path = join(testDir, 'baseline.json');

      saveBaseline(baseline, path);
      expect(existsSync(path)).toBe(true);

      const loaded = loadBaseline(path);
      expect(loaded.version).toBe(baseline.version);
      expect(loaded.server.name).toBe(baseline.server.name);
      expect(loaded.tools).toHaveLength(baseline.tools.length);
      expect(loaded.integrityHash).toBe(baseline.integrityHash);
    });

    it('should throw for non-existent file', () => {
      expect(() => loadBaseline('/nonexistent/path.json')).toThrow('Baseline file not found');
    });

    it('should restore Date objects', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');
      const path = join(testDir, 'baseline.json');

      saveBaseline(baseline, path);
      const loaded = loadBaseline(path);

      expect(loaded.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('verifyIntegrity', () => {
    it('should verify valid baseline', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');

      expect(verifyIntegrity(baseline)).toBe(true);
    });

    it('should detect tampered baseline', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');

      // Tamper with the baseline
      baseline.server.name = 'tampered-server';

      expect(verifyIntegrity(baseline)).toBe(false);
    });
  });

  describe('baselineExists', () => {
    it('should return true for existing file', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');
      const path = join(testDir, 'baseline.json');

      saveBaseline(baseline, path);
      expect(baselineExists(path)).toBe(true);
    });

    it('should return false for non-existent file', () => {
      expect(baselineExists('/nonexistent/path.json')).toBe(false);
    });
  });
});

describe('Baseline Comparison', () => {
  describe('compareBaselines', () => {
    it('should detect no changes between identical baselines', () => {
      const result = createMockInterviewResult();
      const baseline1 = createBaseline(result, 'npx test-server');
      const baseline2 = createBaseline(result, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.severity).toBe('none');
      expect(diff.toolsAdded).toHaveLength(0);
      expect(diff.toolsRemoved).toHaveLength(0);
      expect(diff.toolsModified).toHaveLength(0);
    });

    it('should detect added tools', () => {
      // Use explicit tool profiles with identical content for test_tool
      const baseTool = {
        name: 'test_tool',
        description: 'A test tool',
        interactions: [],
        behavioralNotes: [],
        limitations: [],
        securityNotes: [],
      };

      const result1 = createMockInterviewResult({
        tools: [baseTool],
      });
      const result2 = createMockInterviewResult({
        tools: [
          baseTool,
          {
            name: 'new_tool',
            description: 'A new tool',
            interactions: [],
            behavioralNotes: [],
            limitations: [],
            securityNotes: [],
          },
        ],
      });

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsAdded).toContain('new_tool');
      expect(diff.severity).toBe('info');
    });

    it('should detect removed tools', () => {
      const result1 = createMockInterviewResult({
        tools: [
          {
            name: 'tool_a',
            description: 'Tool A',
            interactions: [],
            behavioralNotes: [],
            limitations: [],
            securityNotes: [],
          },
          {
            name: 'tool_b',
            description: 'Tool B',
            interactions: [],
            behavioralNotes: [],
            limitations: [],
            securityNotes: [],
          },
        ],
      });
      const result2 = createMockInterviewResult({
        tools: [
          {
            name: 'tool_a',
            description: 'Tool A',
            interactions: [],
            behavioralNotes: [],
            limitations: [],
            securityNotes: [],
          },
        ],
      });

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsRemoved).toContain('tool_b');
      expect(diff.severity).toBe('breaking');
    });

    it('should detect description changes', () => {
      const result1 = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Original description',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        }],
      });
      const result2 = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Updated description',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        }],
      });

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsModified).toHaveLength(1);
      expect(diff.toolsModified[0].descriptionChanged).toBe(true);
    });

    it('should detect security note changes', () => {
      const result1 = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test tool',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: ['Original security note'],
        }],
      });
      const result2 = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test tool',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: ['New security vulnerability found'],
        }],
      });

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.behaviorChanges.some((c) => c.aspect === 'security')).toBe(true);
    });

    it('should filter by specific tools', () => {
      const result1 = createMockInterviewResult({
        tools: [
          { name: 'tool_a', description: 'A', interactions: [], behavioralNotes: [], limitations: [], securityNotes: [] },
          { name: 'tool_b', description: 'B', interactions: [], behavioralNotes: [], limitations: [], securityNotes: [] },
        ],
      });
      const result2 = createMockInterviewResult({
        tools: [
          { name: 'tool_a', description: 'A modified', interactions: [], behavioralNotes: [], limitations: [], securityNotes: [] },
          { name: 'tool_b', description: 'B modified', interactions: [], behavioralNotes: [], limitations: [], securityNotes: [] },
        ],
      });

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2, { tools: ['tool_a'] });

      expect(diff.toolsModified).toHaveLength(1);
      expect(diff.toolsModified[0].tool).toBe('tool_a');
    });
  });

  describe('compareWithBaseline', () => {
    it('should compare interview result against baseline', () => {
      const result1 = createMockInterviewResult();
      const result2 = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'A test tool - updated',
          interactions: [],
          behavioralNotes: ['New behavior'],
          limitations: [],
          securityNotes: [],
        }],
      });

      const baseline = createBaseline(result1, 'npx test-server');
      const diff = compareWithBaseline(baseline, result2, 'npx test-server');

      expect(diff.toolsModified.length).toBeGreaterThan(0);
    });
  });

  describe('hasBreakingChanges', () => {
    it('should return true for breaking severity', () => {
      const result1 = createMockInterviewResult({
        tools: [
          { name: 'tool_a', description: 'A', interactions: [], behavioralNotes: [], limitations: [], securityNotes: [] },
        ],
      });
      const result2 = createMockInterviewResult({
        tools: [],
      });

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);

      expect(hasBreakingChanges(diff)).toBe(true);
    });

    it('should return false for non-breaking changes', () => {
      const result1 = createMockInterviewResult();
      const result2 = createMockInterviewResult();

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);

      expect(hasBreakingChanges(diff)).toBe(false);
    });
  });

  describe('hasSecurityChanges', () => {
    it('should detect security-related changes', () => {
      const result1 = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test tool',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        }],
      });
      const result2 = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test tool',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: ['Security risk identified'],
        }],
      });

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);

      expect(hasSecurityChanges(diff)).toBe(true);
    });
  });

  describe('filterByMinimumSeverity', () => {
    it('should filter changes by minimum severity', () => {
      const result1 = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Original',
          interactions: [],
          behavioralNotes: [],
          limitations: ['Original limitation'],
          securityNotes: ['Security issue'],
        }],
      });
      const result2 = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Updated',
          interactions: [],
          behavioralNotes: ['New behavior'],
          limitations: ['New limitation'],
          securityNotes: ['New security issue'],
        }],
      });

      const baseline1 = createBaseline(result1, 'npx test-server');
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);

      // Filter for warning or higher
      const warningAndAbove = filterByMinimumSeverity(diff, 'warning');
      const allChanges = filterByMinimumSeverity(diff, 'info');

      expect(warningAndAbove.length).toBeLessThanOrEqual(allChanges.length);
    });
  });
});
