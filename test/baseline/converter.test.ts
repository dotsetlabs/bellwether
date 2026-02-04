/**
 * Unit tests for baseline/converter.ts
 *
 * Tests the conversion of local interview results to baseline format.
 * Following TDD principles - testing expected behavior based on rational assumptions.
 */

import { describe, it, expect } from 'vitest';
import {
  CHANGE_TO_BASELINE_SEVERITY,
  BASELINE_TO_CHANGE_SEVERITY,
  convertAssertions,
  createBaselineFromInterview,
} from '../../src/baseline/converter.js';
import type { BehavioralAssertion } from '../../src/baseline/types.js';
import type { InterviewResult, ToolProfile } from '../../src/interview/types.js';

/**
 * Helper to create a minimal interview result for testing.
 */
function createTestInterviewResult(options: {
  serverName?: string;
  tools?: Partial<ToolProfile>[];
  model?: string;
  limitations?: string[];
}): InterviewResult {
  const tools = (options.tools || []).map((t) => ({
    name: t.name || 'test_tool',
    description: t.description ?? 'A test tool',
    interactions: t.interactions || [],
    behavioralNotes: t.behavioralNotes || [],
    limitations: t.limitations || [],
    securityNotes: t.securityNotes || [],
  })) as ToolProfile[];

  const discoveryTools = tools.map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: { type: 'object', properties: {} },
  }));

  return {
    discovery: {
      serverInfo: {
        name: options.serverName || 'test-server',
        version: '1.0.0',
      },
      protocolVersion: '0.1.0',
      capabilities: {
        tools: {},
        prompts: undefined,
        resources: undefined,
        logging: undefined,
      },
      tools: discoveryTools,
      prompts: [],
      resources: [],
      timestamp: new Date(),
      serverCommand: 'npx test-server',
      serverArgs: [],
    },
    toolProfiles: tools,
    summary: 'Test interview completed',
    limitations: options.limitations || [],
    recommendations: [],
    metadata: {
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 1000,
      toolCallCount: 1,
      errorCount: 0,
      model: options.model || 'check',
    },
  };
}

describe('converter', () => {
  describe('severity mapping constants', () => {
    describe('CHANGE_TO_BASELINE_SEVERITY', () => {
      it('should map "none" to "info"', () => {
        expect(CHANGE_TO_BASELINE_SEVERITY.none).toBe('info');
      });

      it('should map "info" to "low"', () => {
        expect(CHANGE_TO_BASELINE_SEVERITY.info).toBe('low');
      });

      it('should map "warning" to "medium"', () => {
        expect(CHANGE_TO_BASELINE_SEVERITY.warning).toBe('medium');
      });

      it('should map "breaking" to "critical"', () => {
        expect(CHANGE_TO_BASELINE_SEVERITY.breaking).toBe('critical');
      });
    });

    describe('BASELINE_TO_CHANGE_SEVERITY', () => {
      it('should map "info" to "info"', () => {
        expect(BASELINE_TO_CHANGE_SEVERITY.info).toBe('info');
      });

      it('should map "low" to "info"', () => {
        expect(BASELINE_TO_CHANGE_SEVERITY.low).toBe('info');
      });

      it('should map "medium" to "warning"', () => {
        expect(BASELINE_TO_CHANGE_SEVERITY.medium).toBe('warning');
      });

      it('should map "high" to "warning"', () => {
        // Note: high maps to warning, not breaking
        // This is a lossy conversion - high and medium both become warning
        expect(BASELINE_TO_CHANGE_SEVERITY.high).toBe('warning');
      });

      it('should map "critical" to "breaking"', () => {
        expect(BASELINE_TO_CHANGE_SEVERITY.critical).toBe('breaking');
      });
    });
  });

  describe('convertAssertions', () => {
    it('should convert positive non-security assertions to "expects" type', () => {
      const assertions: BehavioralAssertion[] = [
        {
          tool: 'test_tool',
          aspect: 'response_format',
          assertion: 'Returns JSON response',
          isPositive: true,
        },
      ];

      const result = convertAssertions(assertions);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('expects');
      expect(result[0].condition).toBe('Returns JSON response');
      expect(result[0].tool).toBe('test_tool');
    });

    it('should convert positive security assertions to "requires" type', () => {
      const assertions: BehavioralAssertion[] = [
        {
          tool: 'auth_tool',
          aspect: 'security',
          assertion: 'Requires authentication',
          isPositive: true,
        },
      ];

      const result = convertAssertions(assertions);

      expect(result[0].type).toBe('requires');
    });

    it('should convert negative non-security assertions to "notes" type', () => {
      const assertions: BehavioralAssertion[] = [
        {
          tool: 'test_tool',
          aspect: 'error_handling',
          assertion: 'May timeout on large inputs',
          isPositive: false,
        },
      ];

      const result = convertAssertions(assertions);

      expect(result[0].type).toBe('notes');
    });

    it('should convert negative security assertions to "warns" type', () => {
      const assertions: BehavioralAssertion[] = [
        {
          tool: 'file_tool',
          aspect: 'security',
          assertion: 'Vulnerable to path traversal',
          isPositive: false,
        },
      ];

      const result = convertAssertions(assertions);

      expect(result[0].type).toBe('warns');
    });

    describe('severity classification', () => {
      it('should classify security assertions with "critical" keyword as critical', () => {
        const assertions: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'security',
            assertion: 'Critical vulnerability found',
            isPositive: false,
          },
        ];

        const result = convertAssertions(assertions);

        expect(result[0].severity).toBe('critical');
      });

      it('should classify security assertions with "injection" keyword as critical', () => {
        const assertions: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'security',
            assertion: 'SQL injection possible',
            isPositive: false,
          },
        ];

        const result = convertAssertions(assertions);

        expect(result[0].severity).toBe('critical');
      });

      it('should classify security assertions with "rce" keyword as critical', () => {
        const assertions: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'security',
            assertion: 'RCE vulnerability detected',
            isPositive: false,
          },
        ];

        const result = convertAssertions(assertions);

        expect(result[0].severity).toBe('critical');
      });

      it('should classify security assertions with "high" keyword as high', () => {
        const assertions: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'security',
            assertion: 'High risk vulnerability',
            isPositive: false,
          },
        ];

        const result = convertAssertions(assertions);

        expect(result[0].severity).toBe('high');
      });

      it('should classify security assertions with "dangerous" keyword as high', () => {
        const assertions: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'security',
            assertion: 'Dangerous operation allowed',
            isPositive: false,
          },
        ];

        const result = convertAssertions(assertions);

        expect(result[0].severity).toBe('high');
      });

      it('should classify security assertions with "medium" keyword as medium', () => {
        const assertions: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'security',
            assertion: 'Medium risk issue',
            isPositive: false,
          },
        ];

        const result = convertAssertions(assertions);

        expect(result[0].severity).toBe('medium');
      });

      it('should classify security assertions with "leak" keyword as medium', () => {
        const assertions: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'security',
            assertion: 'Information leak possible',
            isPositive: false,
          },
        ];

        const result = convertAssertions(assertions);

        expect(result[0].severity).toBe('medium');
      });

      it('should classify generic security assertions as low', () => {
        const assertions: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'security',
            assertion: 'Security consideration noted',
            isPositive: false,
          },
        ];

        const result = convertAssertions(assertions);

        expect(result[0].severity).toBe('low');
      });

      it('should classify error_handling assertions based on isPositive', () => {
        const positive: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'error_handling',
            assertion: 'Handles errors gracefully',
            isPositive: true,
          },
        ];

        const negative: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'error_handling',
            assertion: 'May fail on edge cases',
            isPositive: false,
          },
        ];

        expect(convertAssertions(positive)[0].severity).toBe('info');
        expect(convertAssertions(negative)[0].severity).toBe('low');
      });

      it('should classify performance assertions as medium', () => {
        const assertions: BehavioralAssertion[] = [
          {
            tool: 'tool',
            aspect: 'performance',
            assertion: 'Response time varies',
            isPositive: true,
          },
        ];

        const result = convertAssertions(assertions);

        expect(result[0].severity).toBe('medium');
      });
    });

    it('should handle empty assertions array', () => {
      const result = convertAssertions([]);

      expect(result).toHaveLength(0);
    });

    it('should convert multiple assertions', () => {
      const assertions: BehavioralAssertion[] = [
        { tool: 'tool1', aspect: 'response_format', assertion: 'a', isPositive: true },
        { tool: 'tool2', aspect: 'security', assertion: 'b', isPositive: false },
        { tool: 'tool3', aspect: 'error_handling', assertion: 'c', isPositive: false },
      ];

      const result = convertAssertions(assertions);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('expects');
      expect(result[1].type).toBe('warns');
      expect(result[2].type).toBe('notes');
    });
  });

  describe('createBaselineFromInterview', () => {
    it('should create a baseline with correct version', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaselineFromInterview(result, 'npx test-server');

      expect(baseline.version).toBeDefined();
      expect(typeof baseline.version).toBe('string');
    });

    it('should set mode to "check" for check mode results', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        model: 'check',
      });
      const baseline = createBaselineFromInterview(result, 'npx test-server');

      expect(baseline.metadata.mode).toBe('check');
    });

    it('should set mode to "explore" for LLM-powered results', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        model: 'gpt-4',
      });
      const baseline = createBaselineFromInterview(result, 'npx test-server');

      expect(baseline.metadata.mode).toBe('explore');
    });

    it('should include server command in metadata', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaselineFromInterview(result, 'npx @mcp/server');

      expect(baseline.metadata.serverCommand).toBe('npx @mcp/server');
    });

    it('should build server fingerprint from discovery', () => {
      const result = createTestInterviewResult({
        serverName: 'my-server',
        tools: [{ name: 'tool' }],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.server.name).toBe('my-server');
      expect(baseline.server.version).toBe('1.0.0');
      expect(baseline.server.protocolVersion).toBe('0.1.0');
      expect(baseline.server.capabilities).toContain('tools');
    });

    it('should extract tool capabilities', () => {
      const result = createTestInterviewResult({
        tools: [
          { name: 'tool_a', description: 'Tool A description' },
          { name: 'tool_b', description: 'Tool B description' },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools).toHaveLength(2);
      expect(baseline.capabilities.tools[0].name).toBe('tool_a');
      expect(baseline.capabilities.tools[0].description).toBe('Tool A description');
      expect(baseline.capabilities.tools[1].name).toBe('tool_b');
    });

    it('should include schema hash for each tool', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool' }],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].schemaHash).toBeDefined();
      expect(typeof baseline.capabilities.tools[0].schemaHash).toBe('string');
    });

    it('should extract tool profiles with converted assertions', () => {
      const result = createTestInterviewResult({
        tools: [
          {
            name: 'test_tool',
            behavioralNotes: ['Returns JSON'],
            limitations: ['Max 1MB files'],
            securityNotes: ['Requires auth'],
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.toolProfiles).toHaveLength(1);
      expect(baseline.toolProfiles[0].behavioralNotes).toContain('Returns JSON');
      expect(baseline.toolProfiles[0].limitations).toContain('Max 1MB files');
      expect(baseline.toolProfiles[0].securityNotes).toContain('Requires auth');
      expect(baseline.toolProfiles[0].assertions.length).toBeGreaterThan(0);
    });

    it('should include overall limitations as server assertions', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        limitations: ['Server has limited memory'],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      const serverAssertions = baseline.assertions.filter((a) => a.tool === 'server');
      expect(serverAssertions.length).toBeGreaterThan(0);
      expect(serverAssertions.some((a) => a.condition.includes('limited memory'))).toBe(true);
    });

    it('should calculate and include hash', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.hash).toBeDefined();
      expect(typeof baseline.hash).toBe('string');
      expect(baseline.hash.length).toBeGreaterThan(0);
    });

    it('should include summary from interview result', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.summary).toBe('Test interview completed');
    });

    it('should set personas to empty array for check mode', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        model: 'check',
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.metadata.personas).toEqual([]);
    });

    it('should set model to "none" for check mode', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        model: 'check',
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.metadata.model).toBe('none');
    });

    it('should include duration from metadata', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.metadata.durationMs).toBe(1000);
    });

    it('should include documentation score', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool', description: 'A well-documented tool' }],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.documentationScore).toBeDefined();
      expect(baseline.documentationScore?.grade).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle tool with empty description', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool', description: '' }],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].description).toBe('');
    });

    it('should handle empty tool profiles', () => {
      const result = createTestInterviewResult({ tools: [] });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools).toHaveLength(0);
      expect(baseline.toolProfiles).toHaveLength(0);
    });

    it('should handle tool with empty arrays', () => {
      const result = createTestInterviewResult({
        tools: [
          {
            name: 'tool',
            behavioralNotes: [],
            limitations: [],
            securityNotes: [],
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.toolProfiles[0].behavioralNotes).toHaveLength(0);
      expect(baseline.toolProfiles[0].limitations).toHaveLength(0);
      expect(baseline.toolProfiles[0].securityNotes).toHaveLength(0);
    });
  });
});
