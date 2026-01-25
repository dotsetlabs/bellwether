/**
 * Tests for auto-generated test scenarios.
 */

import { describe, it, expect } from 'vitest';
import {
  generateToolScenarios,
  generateBaselineScenarios,
  formatScenariosAsYaml,
  formatScenariosReport,
  getScenariosByPriority,
  getScenariosByCategory,
  getCriticalScenarios,
  getSecurityScenarios,
} from '../../src/baseline/scenario-generator.js';
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
  overrides: Partial<BehavioralBaseline> = {}
): BehavioralBaseline {
  const capabilityTools = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    // Don't coerce undefined to {} - preserve undefined so tools without schemas are detected
    inputSchema: tool.inputSchema as Record<string, unknown>,
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
      ...overrides.metadata,
    },
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: [],
    },
    capabilities: {
      tools: capabilityTools,
      ...overrides.capabilities,
    },
    interviews: overrides.interviews ?? [],
    toolProfiles: overrides.toolProfiles ?? toolProfiles,
    summary: 'Test baseline',
    assertions: [],
    hash: 'hash123',
    ...overrides,
  };
}

describe('Scenario Generator', () => {
  describe('generateToolScenarios', () => {
    it('should generate scenarios for tool with schema', () => {
      const tool = createMockTool({
        name: 'search_tool',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['query'],
        },
      });

      const scenarios = generateToolScenarios(tool);

      expect(scenarios.toolName).toBe('search_tool');
      expect(scenarios.happyPath.length).toBeGreaterThan(0);
      expect(scenarios.edgeCases.length).toBeGreaterThan(0);
      expect(scenarios.errorCases.length).toBeGreaterThan(0);
    });

    it('should generate happy path scenarios with valid values', () => {
      const tool = createMockTool({
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            count: { type: 'number' },
          },
          required: ['name'],
        },
      });

      const scenarios = generateToolScenarios(tool);

      expect(scenarios.happyPath.length).toBeGreaterThan(0);
      expect(scenarios.happyPath[0].category).toBe('happy_path');
      expect(scenarios.happyPath[0].input).toHaveProperty('name');
    });

    it('should generate edge case scenarios for boundaries', () => {
      const tool = createMockTool({
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              type: 'number',
              minimum: 0,
              maximum: 100,
            },
          },
        },
      });

      const scenarios = generateToolScenarios(tool);

      expect(scenarios.edgeCases.length).toBeGreaterThan(0);
      // Should include boundary values
      const values = scenarios.edgeCases.map(s => s.input.value);
      expect(values.some(v => v === 0 || v === 100 || v === -1 || v === 101)).toBe(true);
    });

    it('should generate error case scenarios for missing required params', () => {
      const tool = createMockTool({
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['name', 'email'],
        },
      });

      const scenarios = generateToolScenarios(tool);

      expect(scenarios.errorCases.length).toBeGreaterThan(0);
      const missingNameCase = scenarios.errorCases.find(s =>
        s.description.includes('Missing required parameter: name')
      );
      expect(missingNameCase).toBeDefined();
    });

    it('should generate security scenarios for string parameters', () => {
      const tool = createMockTool({
        name: 'query_tool',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
      });

      const scenarios = generateToolScenarios(tool, { includeSecurityPayloads: true });

      expect(scenarios.securityTests.length).toBeGreaterThan(0);
      expect(scenarios.securityTests.some(s => s.tags.includes('sql-injection'))).toBe(true);
      expect(scenarios.securityTests.some(s => s.tags.includes('xss'))).toBe(true);
    });

    it('should generate path traversal tests for file-related parameters', () => {
      const tool = createMockTool({
        name: 'file_tool',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file' },
          },
        },
      });

      const scenarios = generateToolScenarios(tool, { includeSecurityPayloads: true });

      expect(scenarios.securityTests.some(s => s.tags.includes('path-traversal'))).toBe(true);
    });

    it('should respect category filtering', () => {
      const tool = createMockTool({
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      });

      const scenarios = generateToolScenarios(tool, {
        categories: ['happy_path', 'error_handling'],
      });

      expect(scenarios.happyPath.length).toBeGreaterThan(0);
      expect(scenarios.errorCases.length).toBeGreaterThan(0);
      expect(scenarios.edgeCases.length).toBe(0);
      expect(scenarios.securityTests.length).toBe(0);
    });

    it('should respect max scenarios limits', () => {
      const tool = createMockTool({
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {
            p1: { type: 'string' },
            p2: { type: 'string' },
            p3: { type: 'string' },
            p4: { type: 'string' },
          },
        },
      });

      const scenarios = generateToolScenarios(tool, {
        maxHappyPath: 2,
        maxEdgeCases: 3,
      });

      expect(scenarios.happyPath.length).toBeLessThanOrEqual(2);
      expect(scenarios.edgeCases.length).toBeLessThanOrEqual(3);
    });

    it('should calculate coverage estimate', () => {
      const tool = createMockTool({
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        },
      });

      const scenarios = generateToolScenarios(tool);

      expect(scenarios.coverageEstimate).toBeGreaterThan(0);
      expect(scenarios.coverageEstimate).toBeLessThanOrEqual(100);
    });

    it('should track covered and uncovered parameters', () => {
      const tool = createMockTool({
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            count: { type: 'number' },
          },
        },
      });

      const scenarios = generateToolScenarios(tool);

      expect(scenarios.coveredParameters.length).toBeGreaterThan(0);
      expect(Array.isArray(scenarios.uncoveredParameters)).toBe(true);
    });

    it('should handle enum parameters', () => {
      const tool = createMockTool({
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'pending'],
            },
          },
        },
      });

      const scenarios = generateToolScenarios(tool);

      // Should have scenarios for different enum values
      expect(scenarios.happyPath.some(s => s.input.status === 'active')).toBe(true);
    });

    it('should handle format-specific strings', () => {
      const tool = createMockTool({
        name: 'test_tool',
        inputSchema: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            url: { type: 'string', format: 'uri' },
          },
        },
      });

      const scenarios = generateToolScenarios(tool);

      const emailScenario = scenarios.happyPath.find(s => s.input.email);
      if (emailScenario) {
        expect(emailScenario.input.email).toContain('@');
      }
    });

    it('should generate timestamp for scenarios', () => {
      const tool = createMockTool({
        name: 'test_tool',
        inputSchema: { type: 'object', properties: {} },
      });

      const scenarios = generateToolScenarios(tool);

      expect(scenarios.generatedAt).toBeInstanceOf(Date);
    });
  });

  describe('generateBaselineScenarios', () => {
    it('should generate scenarios for all tools in baseline', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: { type: 'object', properties: { a: { type: 'string' } } },
        }),
        createMockTool({
          name: 'tool2',
          inputSchema: { type: 'object', properties: { b: { type: 'number' } } },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);

      expect(result.scenarios.length).toBe(2);
      expect(result.summary.toolsProcessed).toBe(2);
      expect(result.summary.toolsWithScenarios).toBe(2);
    });

    it('should skip tools without schemas', () => {
      const baseline = createMockBaseline([
        createMockTool({ name: 'tool1' }),
        createMockTool({
          name: 'tool2',
          inputSchema: { type: 'object', properties: { a: { type: 'string' } } },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);

      expect(result.summary.toolsSkipped).toBe(1);
      expect(result.summary.toolsWithScenarios).toBe(1);
    });

    it('should filter to specific tools', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: { type: 'object', properties: { a: { type: 'string' } } },
        }),
        createMockTool({
          name: 'tool2',
          inputSchema: { type: 'object', properties: { b: { type: 'string' } } },
        }),
      ]);

      const result = generateBaselineScenarios(baseline, { tools: ['tool1'] });

      expect(result.scenarios.length).toBe(1);
      expect(result.scenarios[0].toolName).toBe('tool1');
    });

    it('should track low coverage tools', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: { type: 'object', properties: {} }, // No parameters
        }),
      ]);

      const result = generateBaselineScenarios(baseline, { minCoverage: 100 });

      expect(result.summary.lowCoverageTools).toContain('tool1');
    });

    it('should calculate statistics by category', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);

      expect(result.summary.scenariosByCategory).toHaveProperty('happy_path');
      expect(result.summary.scenariosByCategory).toHaveProperty('edge_cases');
      expect(result.summary.scenariosByCategory).toHaveProperty('error_handling');
      expect(result.summary.scenariosByCategory).toHaveProperty('security');
    });

    it('should calculate statistics by priority', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);

      expect(result.summary.scenariosByPriority).toHaveProperty('critical');
      expect(result.summary.scenariosByPriority).toHaveProperty('high');
      expect(result.summary.scenariosByPriority).toHaveProperty('medium');
      expect(result.summary.scenariosByPriority).toHaveProperty('low');
    });

    it('should calculate average coverage', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: {
            type: 'object',
            properties: { a: { type: 'string' } },
          },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);

      expect(result.summary.averageCoverage).toBeGreaterThanOrEqual(0);
      expect(result.summary.averageCoverage).toBeLessThanOrEqual(100);
    });
  });

  describe('formatScenariosAsYaml', () => {
    it('should format scenarios as YAML', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);
      const yaml = formatScenariosAsYaml(result);

      expect(yaml).toContain('# Auto-generated test scenarios');
      expect(yaml).toContain('scenarios:');
      expect(yaml).toContain('tool: tool1');
    });

    it('should include all required fields', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'test',
          inputSchema: {
            type: 'object',
            properties: { value: { type: 'number' } },
          },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);
      const yaml = formatScenariosAsYaml(result);

      expect(yaml).toContain('id:');
      expect(yaml).toContain('category:');
      expect(yaml).toContain('description:');
      expect(yaml).toContain('priority:');
      expect(yaml).toContain('input:');
      expect(yaml).toContain('expected:');
      expect(yaml).toContain('tags:');
    });
  });

  describe('formatScenariosReport', () => {
    it('should format scenarios as report', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);
      const report = formatScenariosReport(result);

      expect(report).toContain('AUTO-GENERATED TEST SCENARIOS');
      expect(report).toContain('Summary');
      expect(report).toContain('By Category');
      expect(report).toContain('By Priority');
    });

    it('should show low coverage tools', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'low_coverage_tool',
          inputSchema: { type: 'object', properties: {} },
        }),
      ]);

      const result = generateBaselineScenarios(baseline, { minCoverage: 100 });
      const report = formatScenariosReport(result);

      expect(report).toContain('Low Coverage Tools');
      expect(report).toContain('low_coverage_tool');
    });
  });

  describe('getScenariosByPriority', () => {
    it('should filter scenarios by priority', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);
      const critical = getScenariosByPriority(result, 'critical');

      expect(critical.every(s => s.priority === 'critical')).toBe(true);
    });
  });

  describe('getScenariosByCategory', () => {
    it('should filter scenarios by category', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
          },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);
      const happyPath = getScenariosByCategory(result, 'happy_path');

      expect(happyPath.every(s => s.category === 'happy_path')).toBe(true);
    });
  });

  describe('getCriticalScenarios', () => {
    it('should return only critical priority scenarios', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        }),
      ]);

      const result = generateBaselineScenarios(baseline);
      const critical = getCriticalScenarios(result);

      expect(critical.length).toBeGreaterThan(0);
      expect(critical.every(s => s.priority === 'critical')).toBe(true);
    });
  });

  describe('getSecurityScenarios', () => {
    it('should return only security category scenarios', () => {
      const baseline = createMockBaseline([
        createMockTool({
          name: 'tool1',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
          },
        }),
      ]);

      const result = generateBaselineScenarios(baseline, { includeSecurityPayloads: true });
      const security = getSecurityScenarios(result);

      expect(security.length).toBeGreaterThan(0);
      expect(security.every(s => s.category === 'security')).toBe(true);
    });
  });
});
