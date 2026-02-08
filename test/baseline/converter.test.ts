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
import type { InterviewResult, ToolProfile, ToolInteraction } from '../../src/interview/types.js';
import type {
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPResourceTemplate,
} from '../../src/transport/types.js';
import type { WorkflowResult } from '../../src/workflow/types.js';

/**
 * Helper to create a minimal interview result for testing.
 */
function createTestInterviewResult(options: {
  serverName?: string;
  tools?: Partial<ToolProfile>[];
  model?: string;
  limitations?: string[];
  protocolVersion?: string;
  discoveryTools?: Partial<MCPTool>[];
  prompts?: Partial<MCPPrompt>[];
  resources?: Partial<MCPResource>[];
  resourceTemplates?: Partial<MCPResourceTemplate>[];
  workflowResults?: WorkflowResult[];
  instructions?: string;
}): InterviewResult {
  const tools = (options.tools || []).map((t) => ({
    name: t.name || 'test_tool',
    description: t.description ?? 'A test tool',
    interactions: t.interactions || [],
    behavioralNotes: t.behavioralNotes || [],
    limitations: t.limitations || [],
    securityNotes: t.securityNotes || [],
  })) as ToolProfile[];

  // Allow overriding discovery tools independently from tool profiles
  const discoveryTools = (
    options.discoveryTools ||
    tools.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: { type: 'object', properties: {} },
    }))
  ).map((dt: Partial<MCPTool>) => ({
    name: dt.name!,
    description: dt.description || '',
    inputSchema: dt.inputSchema || { type: 'object', properties: {} },
    title: dt.title,
    outputSchema: dt.outputSchema,
    annotations: dt.annotations,
    execution: dt.execution,
  })) as MCPTool[];

  return {
    discovery: {
      serverInfo: {
        name: options.serverName || 'test-server',
        version: '1.0.0',
      },
      protocolVersion: options.protocolVersion || '0.1.0',
      capabilities: {
        tools: {},
        prompts: undefined,
        resources: undefined,
        logging: undefined,
      },
      tools: discoveryTools,
      prompts: (options.prompts || []) as MCPPrompt[],
      resources: (options.resources || []) as MCPResource[],
      resourceTemplates: (options.resourceTemplates || []) as MCPResourceTemplate[],
      instructions: options.instructions,
      timestamp: new Date(),
      serverCommand: 'npx test-server',
      serverArgs: [],
    },
    toolProfiles: tools,
    summary: 'Test interview completed',
    limitations: options.limitations || [],
    recommendations: [],
    workflowResults: options.workflowResults,
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

/**
 * Helper to create a tool interaction with response data.
 */
function createToolInteraction(options: {
  toolName?: string;
  response?: { content: Array<{ type: 'text'; text: string }>; isError?: boolean } | null;
  error?: string | null;
  toolExecutionMs?: number;
  mocked?: boolean;
  expectedOutcome?: 'success' | 'error' | 'either';
}): ToolInteraction {
  return {
    toolName: options.toolName || 'test_tool',
    question: {
      description: 'Test question',
      category: 'happy_path',
      args: { input: 'test' },
      expectedOutcome: options.expectedOutcome,
    },
    response:
      options.response !== undefined
        ? options.response
        : {
            content: [{ type: 'text', text: '{"result": "ok"}' }],
          },
    error: options.error !== undefined ? options.error : null,
    analysis: 'Test analysis',
    durationMs: options.toolExecutionMs || 100,
    toolExecutionMs: options.toolExecutionMs,
    mocked: options.mocked,
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

  describe('Runtime field population', () => {
    it('should populate responseFingerprint from tool responses', () => {
      const result = createTestInterviewResult({
        tools: [
          {
            name: 'json_tool',
            interactions: [
              createToolInteraction({
                toolName: 'json_tool',
                response: { content: [{ type: 'text', text: '{"name":"Alice","age":30}' }] },
                toolExecutionMs: 50,
              }),
              createToolInteraction({
                toolName: 'json_tool',
                response: { content: [{ type: 'text', text: '{"name":"Bob","age":25}' }] },
                toolExecutionMs: 60,
              }),
            ],
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].responseFingerprint).toBeDefined();
      expect(baseline.capabilities.tools[0].responseFingerprint!.structureHash).toBeDefined();
      expect(typeof baseline.capabilities.tools[0].responseFingerprint!.structureHash).toBe(
        'string'
      );
    });

    it('should populate inferredOutputSchema from tool responses', () => {
      const result = createTestInterviewResult({
        tools: [
          {
            name: 'json_tool',
            interactions: [
              createToolInteraction({
                toolName: 'json_tool',
                response: { content: [{ type: 'text', text: '{"status":"ok","count":42}' }] },
                toolExecutionMs: 50,
              }),
            ],
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].inferredOutputSchema).toBeDefined();
    });

    it('should populate errorPatterns from error responses', () => {
      const result = createTestInterviewResult({
        tools: [
          {
            name: 'error_tool',
            interactions: [
              createToolInteraction({
                toolName: 'error_tool',
                response: {
                  content: [{ type: 'text', text: 'Error 400: Invalid input' }],
                  isError: true,
                },
                toolExecutionMs: 30,
              }),
              createToolInteraction({
                toolName: 'error_tool',
                response: null,
                error: 'Connection refused',
                toolExecutionMs: 10,
              }),
            ],
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].errorPatterns).toBeDefined();
      expect(baseline.capabilities.tools[0].errorPatterns!.length).toBeGreaterThan(0);
    });

    it('should set errorPatterns undefined when no errors', () => {
      const result = createTestInterviewResult({
        tools: [
          {
            name: 'clean_tool',
            interactions: [
              createToolInteraction({
                toolName: 'clean_tool',
                response: { content: [{ type: 'text', text: '{"ok":true}' }] },
                toolExecutionMs: 50,
              }),
            ],
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].errorPatterns).toBeUndefined();
    });

    it('should populate responseSchemaEvolution from multiple responses', () => {
      const result = createTestInterviewResult({
        tools: [
          {
            name: 'evolving_tool',
            interactions: [
              createToolInteraction({
                toolName: 'evolving_tool',
                response: { content: [{ type: 'text', text: '{"x":1}' }] },
                toolExecutionMs: 50,
              }),
              createToolInteraction({
                toolName: 'evolving_tool',
                response: { content: [{ type: 'text', text: '{"x":2,"y":3}' }] },
                toolExecutionMs: 60,
              }),
            ],
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].responseSchemaEvolution).toBeDefined();
      expect(baseline.capabilities.tools[0].responseSchemaEvolution!.currentHash).toBeDefined();
    });

    it('should populate baselineP50Ms/P95Ms/P99Ms from latency samples', () => {
      const interactions = Array.from({ length: 5 }, (_, i) =>
        createToolInteraction({
          toolName: 'perf_tool',
          response: { content: [{ type: 'text', text: `{"i":${i}}` }] },
          toolExecutionMs: 100 + i * 20,
        })
      );

      const result = createTestInterviewResult({
        tools: [{ name: 'perf_tool', interactions }],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');
      const tool = baseline.capabilities.tools[0];

      expect(tool.baselineP50Ms).toBeDefined();
      expect(typeof tool.baselineP50Ms).toBe('number');
      expect(tool.baselineP95Ms).toBeDefined();
      expect(tool.baselineP99Ms).toBeDefined();
    });

    it('should populate performanceConfidence', () => {
      const interactions = Array.from({ length: 5 }, (_, i) =>
        createToolInteraction({
          toolName: 'conf_tool',
          response: { content: [{ type: 'text', text: `{"i":${i}}` }] },
          toolExecutionMs: 100 + i * 10,
        })
      );

      const result = createTestInterviewResult({
        tools: [{ name: 'conf_tool', interactions }],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');
      const tool = baseline.capabilities.tools[0];

      expect(tool.performanceConfidence).toBeDefined();
      expect(tool.performanceConfidence!.confidenceLevel).toBeDefined();
      expect(tool.performanceConfidence!.sampleCount).toBeGreaterThan(0);
    });

    it('should exclude mocked responses from runtime analysis', () => {
      const result = createTestInterviewResult({
        tools: [
          {
            name: 'mock_tool',
            interactions: [
              createToolInteraction({
                toolName: 'mock_tool',
                response: { content: [{ type: 'text', text: '{"mocked":true}' }] },
                toolExecutionMs: 1,
                mocked: true,
              }),
              createToolInteraction({
                toolName: 'mock_tool',
                response: { content: [{ type: 'text', text: '{"real":true}' }] },
                toolExecutionMs: 200,
                mocked: false,
              }),
            ],
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');
      const tool = baseline.capabilities.tools[0];

      // Mocked response should not affect latency — only the real 200ms should count
      expect(tool.baselineP50Ms).toBe(200);
    });
  });

  describe('Protocol version gating', () => {
    it('should include annotations for protocol >= 2025-03-26', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'annotated_tool' }],
        protocolVersion: '2025-11-25',
        discoveryTools: [
          {
            name: 'annotated_tool',
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].annotations).toBeDefined();
      expect(baseline.capabilities.tools[0].annotations!.readOnlyHint).toBe(true);
    });

    it('should exclude annotations for protocol 2024-11-05', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'annotated_tool' }],
        protocolVersion: '2024-11-05',
        discoveryTools: [
          {
            name: 'annotated_tool',
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
            },
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].annotations).toBeUndefined();
    });

    it('should include outputSchema for protocol >= 2025-06-18', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'schema_tool' }],
        protocolVersion: '2025-11-25',
        discoveryTools: [
          {
            name: 'schema_tool',
            outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].outputSchema).toBeDefined();
      expect(baseline.capabilities.tools[0].outputSchemaHash).toBeDefined();
    });

    it('should exclude outputSchema for protocol 2025-03-26', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'schema_tool' }],
        protocolVersion: '2025-03-26',
        discoveryTools: [
          {
            name: 'schema_tool',
            outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].outputSchema).toBeUndefined();
      expect(baseline.capabilities.tools[0].outputSchemaHash).toBeUndefined();
    });

    it('should include execution/taskSupport for protocol 2025-11-25', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'task_tool' }],
        protocolVersion: '2025-11-25',
        discoveryTools: [
          {
            name: 'task_tool',
            execution: { taskSupport: 'optional' },
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].execution).toBeDefined();
      expect(baseline.capabilities.tools[0].execution!.taskSupport).toBe('optional');
    });

    it('should exclude execution for protocol 2025-06-18', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'task_tool' }],
        protocolVersion: '2025-06-18',
        discoveryTools: [
          {
            name: 'task_tool',
            execution: { taskSupport: 'optional' },
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.tools[0].execution).toBeUndefined();
    });

    it('should include entity titles based on protocol version', () => {
      const resultWithTitles = createTestInterviewResult({
        tools: [{ name: 'titled_tool' }],
        protocolVersion: '2025-03-26',
        discoveryTools: [{ name: 'titled_tool', title: 'My Tool Title' }],
        prompts: [{ name: 'titled_prompt', title: 'My Prompt Title', description: 'A prompt' }],
        resources: [{ uri: 'file:///test', name: 'titled_resource', title: 'My Resource Title' }],
      });
      const baselineWith = createBaselineFromInterview(resultWithTitles, 'npx test');

      expect(baselineWith.capabilities.tools[0].title).toBe('My Tool Title');
      expect(baselineWith.capabilities.prompts![0].title).toBe('My Prompt Title');
      expect(baselineWith.capabilities.resources![0].title).toBe('My Resource Title');

      // Without titles (old protocol)
      const resultWithout = createTestInterviewResult({
        tools: [{ name: 'titled_tool' }],
        protocolVersion: '2024-11-05',
        discoveryTools: [{ name: 'titled_tool', title: 'My Tool Title' }],
        prompts: [{ name: 'titled_prompt', title: 'My Prompt Title', description: 'A prompt' }],
        resources: [{ uri: 'file:///test', name: 'titled_resource', title: 'My Resource Title' }],
      });
      const baselineWithout = createBaselineFromInterview(resultWithout, 'npx test');

      expect(baselineWithout.capabilities.tools[0].title).toBeUndefined();
      expect(baselineWithout.capabilities.prompts![0].title).toBeUndefined();
      expect(baselineWithout.capabilities.resources![0].title).toBeUndefined();
    });

    it('should include serverInstructions only when feature flag is true', () => {
      const result2025 = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        protocolVersion: '2025-06-18',
        instructions: 'Server instructions text',
      });
      const baseline2025 = createBaselineFromInterview(result2025, 'npx test');
      expect(baseline2025.server.instructions).toBe('Server instructions text');

      const result2024 = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        protocolVersion: '2024-11-05',
        instructions: 'Server instructions text',
      });
      const baseline2024 = createBaselineFromInterview(result2024, 'npx test');
      expect(baseline2024.server.instructions).toBeUndefined();
    });

    it('should include resource annotations only when feature flag is true', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        protocolVersion: '2025-03-26',
        resources: [
          {
            uri: 'file:///test',
            name: 'annotated_res',
            annotations: { audience: ['user'], priority: 0.8 },
            size: 1024,
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');
      expect(baseline.capabilities.resources![0].annotations).toBeDefined();
      expect(baseline.capabilities.resources![0].size).toBe(1024);

      // Without resource annotations
      const resultOld = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        protocolVersion: '2024-11-05',
        resources: [
          {
            uri: 'file:///test',
            name: 'annotated_res',
            annotations: { audience: ['user'], priority: 0.8 },
            size: 1024,
          },
        ],
      });
      const baselineOld = createBaselineFromInterview(resultOld, 'npx test');
      expect(baselineOld.capabilities.resources![0].annotations).toBeUndefined();
      expect(baselineOld.capabilities.resources![0].size).toBeUndefined();
    });
  });

  describe('Workflow and capability extraction', () => {
    it('should extract workflows from workflowResults', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        workflowResults: [
          {
            workflow: {
              id: 'wf-1',
              name: 'Login Flow',
              description: 'Login workflow',
              expectedOutcome: 'User logged in',
              steps: [
                { tool: 'auth', description: 'Authenticate', args: {} },
                { tool: 'login', description: 'Login', args: {} },
              ],
            },
            success: true,
            summary: 'Flow completed',
            steps: [],
            durationMs: 500,
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.workflows).toBeDefined();
      expect(baseline.workflows).toHaveLength(1);
      expect(baseline.workflows![0].id).toBe('wf-1');
      expect(baseline.workflows![0].name).toBe('Login Flow');
      expect(baseline.workflows![0].toolSequence).toEqual(['auth', 'login']);
      expect(baseline.workflows![0].succeeded).toBe(true);
    });

    it('should extract prompts with arguments', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        protocolVersion: '2025-03-26',
        prompts: [
          {
            name: 'summarize',
            description: 'Summarize text',
            title: 'Summarize',
            arguments: [
              { name: 'text', description: 'The text to summarize', required: true },
              { name: 'length', description: 'Target length', required: false },
            ],
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.prompts).toBeDefined();
      expect(baseline.capabilities.prompts).toHaveLength(1);
      expect(baseline.capabilities.prompts![0].name).toBe('summarize');
      expect(baseline.capabilities.prompts![0].arguments).toHaveLength(2);
      expect(baseline.capabilities.prompts![0].arguments![0].name).toBe('text');
      expect(baseline.capabilities.prompts![0].arguments![0].required).toBe(true);
    });

    it('should extract resources and resourceTemplates', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool' }],
        protocolVersion: '2025-03-26',
        resources: [
          {
            uri: 'file:///config.json',
            name: 'config',
            description: 'Configuration file',
            mimeType: 'application/json',
          },
        ],
        resourceTemplates: [
          {
            uriTemplate: 'file:///logs/{date}',
            name: 'daily_logs',
            description: 'Daily log files',
            mimeType: 'text/plain',
          },
        ],
      });
      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.capabilities.resources).toBeDefined();
      expect(baseline.capabilities.resources).toHaveLength(1);
      expect(baseline.capabilities.resources![0].uri).toBe('file:///config.json');
      expect(baseline.capabilities.resources![0].name).toBe('config');

      expect(baseline.capabilities.resourceTemplates).toBeDefined();
      expect(baseline.capabilities.resourceTemplates).toHaveLength(1);
      expect(baseline.capabilities.resourceTemplates![0].uriTemplate).toBe('file:///logs/{date}');
      expect(baseline.capabilities.resourceTemplates![0].name).toBe('daily_logs');
    });
  });

  describe('explore mode with personas', () => {
    function createExploreResultWithPersonas(options: {
      personas: Array<{ id: string; name: string; questionsAsked: number; toolCallCount?: number }>;
      tools: Partial<ToolProfile>[];
    }): InterviewResult {
      const tools = options.tools.map((t) => ({
        name: t.name || 'test_tool',
        description: t.description ?? 'A test tool',
        interactions: t.interactions || [],
        behavioralNotes: t.behavioralNotes || [],
        limitations: t.limitations || [],
        securityNotes: t.securityNotes || [],
        findingsByPersona: t.findingsByPersona,
      })) as ToolProfile[];

      const discoveryTools = tools.map((t) => ({
        name: t.name,
        description: t.description || '',
        inputSchema: { type: 'object' as const, properties: {} },
      }));

      return {
        discovery: {
          serverInfo: { name: 'test-server', version: '1.0.0' },
          protocolVersion: '0.1.0',
          capabilities: { tools: {}, prompts: undefined, resources: undefined, logging: undefined },
          tools: discoveryTools,
          prompts: [],
          resources: [],
          resourceTemplates: [],
          timestamp: new Date(),
          serverCommand: 'npx test-server',
          serverArgs: [],
        },
        toolProfiles: tools,
        summary: 'Test interview completed',
        limitations: [],
        recommendations: [],
        metadata: {
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 1000,
          toolCallCount: 1,
          errorCount: 0,
          model: 'test-model',
          personas: options.personas.map((p) => ({
            id: p.id,
            name: p.name,
            questionsAsked: p.questionsAsked,
            toolCallCount: p.toolCallCount ?? 0,
            errorCount: 0,
          })),
        },
      };
    }

    it('should extract findings per persona with security severity classification', () => {
      const result = createExploreResultWithPersonas({
        personas: [{ id: 'security', name: 'Security Tester', questionsAsked: 5 }],
        tools: [
          {
            name: 'search_tool',
            findingsByPersona: [
              {
                personaId: 'security',
                personaName: 'Security Tester',
                behavioralNotes: ['Tool accepts arbitrary input'],
                limitations: ['Cannot handle large payloads'],
                securityNotes: [
                  'Critical SQL injection vulnerability found',
                  'High risk: exploit possible via parameter bypass',
                  'Medium sensitivity data leak detected',
                  'Low risk potential issue with input validation',
                  'Informational: uses HTTPS for connections',
                ],
              },
            ],
          },
        ],
      });

      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.interviews).toBeDefined();
      expect(baseline.interviews!.length).toBe(1);
      expect(baseline.interviews![0].persona).toBe('security');

      const findings = baseline.interviews![0].findings;

      // Security notes classified by severity
      const securityFindings = findings.filter((f) => f.category === 'security');
      expect(securityFindings.length).toBe(5);

      // Check severity classification
      expect(securityFindings[0].severity).toBe('critical'); // "Critical SQL injection"
      expect(securityFindings[1].severity).toBe('high'); // "exploit possible via parameter bypass"
      expect(securityFindings[2].severity).toBe('medium'); // "sensitivity data leak"
      expect(securityFindings[3].severity).toBe('low'); // "Low risk potential"
      expect(securityFindings[4].severity).toBe('info'); // No keyword match

      // Limitation findings
      const reliabilityFindings = findings.filter((f) => f.category === 'reliability');
      expect(reliabilityFindings.length).toBe(1);
      expect(reliabilityFindings[0].severity).toBe('low');

      // Behavioral findings (capped at 3)
      const behaviorFindings = findings.filter((f) => f.category === 'behavior');
      expect(behaviorFindings.length).toBe(1);
      expect(behaviorFindings[0].severity).toBe('info');
    });

    it('should classify severity for bypass keyword as high', () => {
      const result = createExploreResultWithPersonas({
        personas: [{ id: 'edge', name: 'Edge Case', questionsAsked: 3 }],
        tools: [
          {
            name: 'auth_tool',
            findingsByPersona: [
              {
                personaId: 'edge',
                personaName: 'Edge Case',
                behavioralNotes: [],
                limitations: [],
                securityNotes: ['Authentication bypass detected'],
              },
            ],
          },
        ],
      });

      const baseline = createBaselineFromInterview(result, 'npx test');

      const secFindings = baseline.interviews![0].findings.filter((f) => f.category === 'security');
      expect(secFindings[0].severity).toBe('high');
    });

    it('should classify severity for moderate keyword as medium', () => {
      const result = createExploreResultWithPersonas({
        personas: [{ id: 'qa', name: 'QA', questionsAsked: 2 }],
        tools: [
          {
            name: 'data_tool',
            findingsByPersona: [
              {
                personaId: 'qa',
                personaName: 'QA',
                behavioralNotes: [],
                limitations: [],
                securityNotes: ['Moderate risk of data exposure'],
              },
            ],
          },
        ],
      });

      const baseline = createBaselineFromInterview(result, 'npx test');

      const secFindings = baseline.interviews![0].findings.filter((f) => f.category === 'security');
      expect(secFindings[0].severity).toBe('medium');
    });

    it('should skip tools without findings for the persona', () => {
      const result = createExploreResultWithPersonas({
        personas: [{ id: 'security', name: 'Security', questionsAsked: 3 }],
        tools: [
          {
            name: 'tool_with_findings',
            findingsByPersona: [
              {
                personaId: 'security',
                personaName: 'Security',
                behavioralNotes: [],
                limitations: [],
                securityNotes: ['Found an issue with dangerous input handling'],
              },
            ],
          },
          {
            name: 'tool_without_findings',
            // No findingsByPersona
          },
        ],
      });

      const baseline = createBaselineFromInterview(result, 'npx test');

      const findings = baseline.interviews![0].findings;
      // Only the tool with findings contributes
      expect(findings.every((f) => f.tool === 'tool_with_findings')).toBe(true);
    });

    it('should cap behavioral notes at 3 per tool', () => {
      const result = createExploreResultWithPersonas({
        personas: [{ id: 'writer', name: 'Writer', questionsAsked: 5 }],
        tools: [
          {
            name: 'verbose_tool',
            findingsByPersona: [
              {
                personaId: 'writer',
                personaName: 'Writer',
                behavioralNotes: ['Note 1', 'Note 2', 'Note 3', 'Note 4', 'Note 5'],
                limitations: [],
                securityNotes: [],
              },
            ],
          },
        ],
      });

      const baseline = createBaselineFromInterview(result, 'npx test');

      const behaviorFindings = baseline.interviews![0].findings.filter(
        (f) => f.category === 'behavior'
      );
      expect(behaviorFindings.length).toBe(3);
    });

    it('should build interviews for multiple personas', () => {
      const result = createExploreResultWithPersonas({
        personas: [
          { id: 'security', name: 'Security', questionsAsked: 3 },
          { id: 'edge_case', name: 'Edge Case', questionsAsked: 5 },
        ],
        tools: [
          {
            name: 'test_tool',
            findingsByPersona: [
              {
                personaId: 'security',
                personaName: 'Security',
                behavioralNotes: [],
                limitations: [],
                securityNotes: ['Injection vulnerability found'],
              },
              {
                personaId: 'edge_case',
                personaName: 'Edge Case',
                behavioralNotes: ['Handles edge cases well'],
                limitations: ['Fails with empty input'],
                securityNotes: [],
              },
            ],
          },
        ],
      });

      const baseline = createBaselineFromInterview(result, 'npx test');

      expect(baseline.interviews).toHaveLength(2);
      expect(baseline.interviews![0].persona).toBe('security');
      expect(baseline.interviews![1].persona).toBe('edge_case');

      // Security persona has security finding
      const secFindings = baseline.interviews![0].findings.filter((f) => f.category === 'security');
      expect(secFindings.length).toBe(1);

      // Edge case persona has reliability + behavior findings
      const edgeFindings = baseline.interviews![1].findings;
      expect(edgeFindings.some((f) => f.category === 'reliability')).toBe(true);
      expect(edgeFindings.some((f) => f.category === 'behavior')).toBe(true);
    });
  });
});
