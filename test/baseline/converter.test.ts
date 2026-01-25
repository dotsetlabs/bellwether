/**
 * Tests for baseline format converter (local <-> cloud).
 */

import { describe, it, expect } from 'vitest';
import {
  convertToCloudBaseline,
  createCloudBaseline,
} from '../../src/baseline/converter.js';
import type { BehavioralBaseline, BehavioralAssertion, ToolFingerprint } from '../../src/baseline/types.js';
import type { InterviewResult, ToolProfile, ToolInteraction } from '../../src/interview/types.js';
import type { DiscoveryResult } from '../../src/discovery/types.js';
import type { ResponseFingerprint } from '../../src/baseline/response-fingerprint.js';

// Helper to create a minimal tool fingerprint
function createToolFingerprint(overrides: Partial<ToolFingerprint> = {}): ToolFingerprint {
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

// Helper to create a behavioral assertion
function createAssertion(overrides: Partial<BehavioralAssertion> = {}): BehavioralAssertion {
  return {
    tool: 'test_tool',
    aspect: 'response_format',
    assertion: 'Returns valid JSON',
    isPositive: true,
    ...overrides,
  };
}

// Helper to create a minimal baseline
function createBaseline(overrides: Partial<BehavioralBaseline> = {}): BehavioralBaseline {
  return {
    version: '1.0.0',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    serverCommand: 'npx test-server',
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: ['tools'],
    },
    tools: [createToolFingerprint()],
    summary: 'Test server summary',
    assertions: [],
    integrityHash: 'integrity123',
    ...overrides,
  };
}

// Helper to create a mock discovery result
function createDiscoveryResult(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    serverInfo: {
      name: 'test-server',
      version: '1.0.0',
    },
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
      prompts: {},
    },
    tools: [
      {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: { input: { type: 'string' } },
          required: ['input'],
        },
      },
    ],
    prompts: [],
    ...overrides,
  };
}

// Helper to create a mock tool interaction
function createToolInteraction(overrides: Partial<ToolInteraction> = {}): ToolInteraction {
  return {
    toolName: 'test_tool',
    question: {
      description: 'Test question',
      category: 'happy_path',
      args: { input: 'test' },
    },
    response: {
      content: [{ type: 'text', text: '{"result": "success"}' }],
      isError: false,
    },
    error: null,
    analysis: 'Tool executed successfully',
    durationMs: 100,
    ...overrides,
  };
}

// Helper to create a mock tool profile
function createToolProfile(overrides: Partial<ToolProfile> = {}): ToolProfile {
  return {
    name: 'test_tool',
    description: 'A test tool',
    interactions: [createToolInteraction()],
    behavioralNotes: ['Returns JSON responses'],
    limitations: ['Does not handle empty input'],
    securityNotes: ['Validates input before processing'],
    ...overrides,
  };
}

// Helper to create a mock interview result
function createInterviewResult(overrides: Partial<InterviewResult> = {}): InterviewResult {
  return {
    discovery: createDiscoveryResult(),
    toolProfiles: [createToolProfile()],
    summary: 'Test server exploration complete',
    limitations: ['Server limitation 1'],
    recommendations: ['Consider adding more tools'],
    metadata: {
      startTime: new Date('2024-01-15T10:00:00Z'),
      endTime: new Date('2024-01-15T10:05:00Z'),
      durationMs: 300000,
      toolCallCount: 5,
      errorCount: 0,
      model: 'gpt-4',
      personas: [
        { id: 'technical_writer', name: 'Technical Writer', questionsAsked: 3, toolCallCount: 3, errorCount: 0 },
      ],
    },
    ...overrides,
  };
}

describe('convertToCloudBaseline', () => {
  describe('basic conversion', () => {
    it('should convert a simple baseline to cloud format', () => {
      const baseline = createBaseline();
      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.version).toBeDefined();
      expect(cloudBaseline.metadata).toBeDefined();
      expect(cloudBaseline.server).toBeDefined();
      expect(cloudBaseline.capabilities).toBeDefined();
      expect(cloudBaseline.hash).toBeDefined();
    });

    it('should preserve server information', () => {
      const baseline = createBaseline({
        server: {
          name: 'my-mcp-server',
          version: '2.0.0',
          protocolVersion: '2024-11-05',
          capabilities: ['tools', 'prompts'],
        },
      });

      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.server.name).toBe('my-mcp-server');
      expect(cloudBaseline.server.version).toBe('2.0.0');
      expect(cloudBaseline.server.protocolVersion).toBe('2024-11-05');
      expect(cloudBaseline.server.capabilities).toEqual(['tools', 'prompts']);
    });

    it('should preserve server command in metadata', () => {
      const baseline = createBaseline({ serverCommand: 'npx @company/mcp-server --port 3000' });
      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.metadata.serverCommand).toBe('npx @company/mcp-server --port 3000');
    });

    it('should generate consistent hash for same content', () => {
      const baseline = createBaseline();
      const hash1 = convertToCloudBaseline(baseline).hash;
      const hash2 = convertToCloudBaseline(baseline).hash;

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different content', () => {
      const baseline1 = createBaseline({ summary: 'Summary 1' });
      const baseline2 = createBaseline({ summary: 'Summary 2' });

      const hash1 = convertToCloudBaseline(baseline1).hash;
      const hash2 = convertToCloudBaseline(baseline2).hash;

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('mode derivation', () => {
    it('should use "check" mode when interview result model is "check"', () => {
      const baseline = createBaseline({ mode: 'check' });
      const interviewResult = createInterviewResult({
        metadata: {
          ...createInterviewResult().metadata,
          model: 'check',
        },
      });
      const cloudBaseline = convertToCloudBaseline(baseline, undefined, interviewResult);

      expect(cloudBaseline.metadata.mode).toBe('check');
    });

    it('should derive mode from interview result model', () => {
      const baseline = createBaseline({ mode: undefined });
      const interviewResult = createInterviewResult({
        metadata: {
          ...createInterviewResult().metadata,
          model: 'check',
        },
      });

      const cloudBaseline = convertToCloudBaseline(baseline, undefined, interviewResult);

      expect(cloudBaseline.metadata.mode).toBe('check');
    });

    it('should default to "check" when no interview result is provided', () => {
      const baseline = createBaseline({ mode: 'check' });
      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.metadata.mode).toBe('check');
      expect(cloudBaseline.metadata.model).toBe('none');
      expect(cloudBaseline.metadata.personas).toEqual([]);
      expect(cloudBaseline.interviews).toEqual([]);
    });

    it('should default to "explore" when model is an LLM name (not "check")', () => {
      const baseline = createBaseline({ mode: undefined });
      const interviewResult = createInterviewResult({
        metadata: {
          ...createInterviewResult().metadata,
          model: 'gpt-4', // LLM model name indicates explore mode
        },
      });
      const cloudBaseline = convertToCloudBaseline(baseline, undefined, interviewResult);

      expect(cloudBaseline.metadata.mode).toBe('explore');
    });
  });

  describe('assertion conversion', () => {
    it('should convert positive response_format assertions to "expects"', () => {
      const baseline = createBaseline({
        assertions: [
          createAssertion({ aspect: 'response_format', isPositive: true, assertion: 'Returns valid JSON' }),
        ],
      });

      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.assertions[0].type).toBe('expects');
      expect(cloudBaseline.assertions[0].condition).toBe('Returns valid JSON');
    });

    it('should convert positive security assertions to "requires"', () => {
      const baseline = createBaseline({
        assertions: [
          createAssertion({ aspect: 'security', isPositive: true, assertion: 'Validates all user input' }),
        ],
      });

      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.assertions[0].type).toBe('requires');
    });

    it('should convert negative security assertions to "warns"', () => {
      const baseline = createBaseline({
        assertions: [
          createAssertion({ aspect: 'security', isPositive: false, assertion: 'Potential SQL injection risk' }),
        ],
      });

      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.assertions[0].type).toBe('warns');
    });

    it('should convert negative non-security assertions to "notes"', () => {
      const baseline = createBaseline({
        assertions: [
          createAssertion({ aspect: 'error_handling', isPositive: false, assertion: 'Does not handle timeouts gracefully' }),
        ],
      });

      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.assertions[0].type).toBe('notes');
    });

    it('should classify security assertion severity based on keywords', () => {
      const criticalAssertion = createAssertion({
        aspect: 'security',
        assertion: 'Critical RCE vulnerability detected',
      });
      const highAssertion = createAssertion({
        aspect: 'security',
        assertion: 'Dangerous exploit possible',
      });
      const mediumAssertion = createAssertion({
        aspect: 'security',
        assertion: 'Sensitive data leak potential',
      });
      const lowAssertion = createAssertion({
        aspect: 'security',
        assertion: 'Security check passes',
      });

      const baseline = createBaseline({
        assertions: [criticalAssertion, highAssertion, mediumAssertion, lowAssertion],
      });

      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.assertions[0].severity).toBe('critical');
      expect(cloudBaseline.assertions[1].severity).toBe('high');
      expect(cloudBaseline.assertions[2].severity).toBe('medium');
      expect(cloudBaseline.assertions[3].severity).toBe('low');
    });

    it('should preserve tool association in assertions', () => {
      const baseline = createBaseline({
        assertions: [
          createAssertion({ tool: 'my_special_tool' }),
        ],
      });

      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.assertions[0].tool).toBe('my_special_tool');
    });
  });

  describe('tool capability conversion', () => {
    it('should convert tool fingerprints to capabilities', () => {
      const baseline = createBaseline({
        tools: [
          createToolFingerprint({
            name: 'get_weather',
            description: 'Get weather for a location',
            schemaHash: 'weatherhash',
          }),
        ],
      });

      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.capabilities.tools).toHaveLength(1);
      expect(cloudBaseline.capabilities.tools[0].name).toBe('get_weather');
      expect(cloudBaseline.capabilities.tools[0].description).toBe('Get weather for a location');
      expect(cloudBaseline.capabilities.tools[0].schemaHash).toBe('weatherhash');
    });

    it('should use discovery schema when available', () => {
      const baseline = createBaseline();
      const discovery = createDiscoveryResult({
        tools: [
          {
            name: 'test_tool',
            description: 'Test tool from discovery',
            inputSchema: { type: 'object', properties: { foo: { type: 'string' } } },
          },
        ],
      });

      const cloudBaseline = convertToCloudBaseline(baseline, discovery);

      expect(cloudBaseline.capabilities.tools[0].inputSchema).toEqual({
        type: 'object',
        properties: { foo: { type: 'string' } },
      });
    });

    it('should preserve response fingerprinting data', () => {
      const responseFingerprint: ResponseFingerprint = {
        structureHash: 'struct123',
        contentType: 'object',
        fields: ['id', 'name'],
        size: 'small',
        isEmpty: false,
        sampleCount: 3,
        confidence: 0.95,
      };

      const baseline = createBaseline({
        tools: [
          createToolFingerprint({
            responseFingerprint,
            inferredOutputSchema: { type: 'object', properties: { id: { type: 'integer' } } },
            errorPatterns: [{ category: 'validation', patternHash: 'err123', example: 'Invalid', count: 2 }],
          }),
        ],
      });

      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.capabilities.tools[0].responseFingerprint).toEqual(responseFingerprint);
      expect(cloudBaseline.capabilities.tools[0].inferredOutputSchema).toBeDefined();
      expect(cloudBaseline.capabilities.tools[0].errorPatterns).toHaveLength(1);
    });
  });

  describe('prompt capability conversion', () => {
    it('should convert prompts from discovery', () => {
      const baseline = createBaseline();
      const discovery = createDiscoveryResult({
        prompts: [
          {
            name: 'summarize',
            description: 'Summarize text',
            arguments: [
              { name: 'text', description: 'Text to summarize', required: true },
              { name: 'length', description: 'Max length', required: false },
            ],
          },
        ],
      });

      const cloudBaseline = convertToCloudBaseline(baseline, discovery);

      expect(cloudBaseline.capabilities.prompts).toHaveLength(1);
      expect(cloudBaseline.capabilities.prompts![0].name).toBe('summarize');
      expect(cloudBaseline.capabilities.prompts![0].arguments).toHaveLength(2);
    });

    it('should not include prompts when discovery has none', () => {
      const baseline = createBaseline();
      const discovery = createDiscoveryResult({ prompts: [] });

      const cloudBaseline = convertToCloudBaseline(baseline, discovery);

      expect(cloudBaseline.capabilities.prompts).toBeUndefined();
    });
  });

  describe('workflow signature preservation', () => {
    it('should preserve workflow signatures', () => {
      const baseline = createBaseline({
        workflowSignatures: [
          {
            id: 'wf1',
            name: 'Search and Get',
            toolSequence: ['search', 'get_details'],
            succeeded: true,
            summary: 'Workflow completed successfully',
          },
        ],
      });

      const cloudBaseline = convertToCloudBaseline(baseline);

      expect(cloudBaseline.workflows).toHaveLength(1);
      expect(cloudBaseline.workflows![0].id).toBe('wf1');
      expect(cloudBaseline.workflows![0].toolSequence).toEqual(['search', 'get_details']);
    });
  });

  describe('interview data extraction', () => {
    it('should extract persona information from interview result', () => {
      const interviewResult = createInterviewResult({
        metadata: {
          ...createInterviewResult().metadata,
          personas: [
            { id: 'technical_writer', name: 'Technical Writer', questionsAsked: 5, toolCallCount: 5, errorCount: 0 },
            { id: 'security_tester', name: 'Security Tester', questionsAsked: 3, toolCallCount: 3, errorCount: 1 },
          ],
        },
      });

      const baseline = createBaseline();
      const cloudBaseline = convertToCloudBaseline(baseline, undefined, interviewResult);

      expect(cloudBaseline.metadata.personas).toEqual(['technical_writer', 'security_tester']);
    });

    it('should default to technical_writer when no personas in explore result', () => {
      const interviewResult = createInterviewResult({
        metadata: {
          ...createInterviewResult().metadata,
          personas: undefined,
          model: 'gpt-4',
        },
      });
      const baseline = createBaseline();
      const cloudBaseline = convertToCloudBaseline(baseline, undefined, interviewResult);

      expect(cloudBaseline.metadata.personas).toEqual(['technical_writer']);
    });
  });
});

describe('createCloudBaseline', () => {
  describe('basic creation', () => {
    it('should create a cloud baseline from interview result', () => {
      const result = createInterviewResult();
      const cloudBaseline = createCloudBaseline(result, 'npx test-server');

      expect(cloudBaseline.version).toBeDefined();
      expect(cloudBaseline.metadata).toBeDefined();
      expect(cloudBaseline.server).toBeDefined();
      expect(cloudBaseline.capabilities).toBeDefined();
      expect(cloudBaseline.interviews).toBeDefined();
      expect(cloudBaseline.toolProfiles).toBeDefined();
      expect(cloudBaseline.hash).toBeDefined();
    });

    it('should include server command in metadata', () => {
      const result = createInterviewResult();
      const cloudBaseline = createCloudBaseline(result, 'npx @company/mcp-server --port 3000');

      expect(cloudBaseline.metadata.serverCommand).toBe('npx @company/mcp-server --port 3000');
    });

    it('should include server name from discovery', () => {
      const result = createInterviewResult({
        discovery: createDiscoveryResult({
          serverInfo: { name: 'my-awesome-server', version: '2.0.0' },
        }),
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.metadata.serverName).toBe('my-awesome-server');
    });
  });

  describe('capabilities from discovery', () => {
    it('should build tool capabilities with schema hashes', () => {
      const result = createInterviewResult({
        discovery: createDiscoveryResult({
          tools: [
            {
              name: 'tool_a',
              description: 'Tool A',
              inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
            },
            {
              name: 'tool_b',
              description: 'Tool B',
              inputSchema: { type: 'object', properties: { y: { type: 'number' } } },
            },
          ],
        }),
        toolProfiles: [
          createToolProfile({ name: 'tool_a' }),
          createToolProfile({ name: 'tool_b' }),
        ],
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.capabilities.tools).toHaveLength(2);
      expect(cloudBaseline.capabilities.tools[0].name).toBe('tool_a');
      expect(cloudBaseline.capabilities.tools[0].schemaHash).toBeDefined();
      expect(cloudBaseline.capabilities.tools[1].name).toBe('tool_b');
    });

    it('should generate response fingerprints from tool profiles', () => {
      const result = createInterviewResult({
        toolProfiles: [
          createToolProfile({
            name: 'test_tool',
            interactions: [
              createToolInteraction({
                response: { content: [{ type: 'text', text: '{"id": 1, "name": "test"}' }], isError: false },
              }),
              createToolInteraction({
                response: { content: [{ type: 'text', text: '{"id": 2, "name": "other"}' }], isError: false },
              }),
            ],
          }),
        ],
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      // Response fingerprint should be generated from interactions
      expect(cloudBaseline.capabilities.tools[0].responseFingerprint).toBeDefined();
    });

    it('should include prompt capabilities when present', () => {
      const result = createInterviewResult({
        discovery: createDiscoveryResult({
          prompts: [
            {
              name: 'translate',
              description: 'Translate text',
              arguments: [{ name: 'text', required: true }],
            },
          ],
        }),
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.capabilities.prompts).toHaveLength(1);
      expect(cloudBaseline.capabilities.prompts![0].name).toBe('translate');
    });
  });

  describe('interview summaries', () => {
    it('should build interview summaries per persona', () => {
      const result = createInterviewResult({
        metadata: {
          ...createInterviewResult().metadata,
          personas: [
            { id: 'technical_writer', name: 'Technical Writer', questionsAsked: 5, toolCallCount: 5, errorCount: 0 },
            { id: 'qa_engineer', name: 'QA Engineer', questionsAsked: 3, toolCallCount: 4, errorCount: 1 },
          ],
        },
        toolProfiles: [
          createToolProfile({
            interactions: [
              createToolInteraction({ personaId: 'technical_writer' }),
              createToolInteraction({ personaId: 'technical_writer' }),
              createToolInteraction({ personaId: 'qa_engineer' }),
            ],
          }),
        ],
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.interviews).toHaveLength(2);
      expect(cloudBaseline.interviews[0].persona).toBe('technical_writer');
      expect(cloudBaseline.interviews[0].questionsAsked).toBe(5);
      expect(cloudBaseline.interviews[1].persona).toBe('qa_engineer');
    });

    it('should create default interview when no personas in metadata', () => {
      const result = createInterviewResult({
        metadata: {
          ...createInterviewResult().metadata,
          personas: undefined,
        },
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.interviews).toHaveLength(1);
      expect(cloudBaseline.interviews[0].persona).toBe('technical_writer');
    });

    it('should extract findings from tool profiles', () => {
      const result = createInterviewResult({
        toolProfiles: [
          createToolProfile({
            securityNotes: ['Input validation implemented'],
            limitations: ['Does not support batch operations'],
            behavioralNotes: ['Returns JSON responses', 'Supports pagination'],
          }),
        ],
        metadata: {
          ...createInterviewResult().metadata,
          personas: undefined,
        },
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');
      const findings = cloudBaseline.interviews[0].findings;

      // Should include security, reliability, and behavior findings
      expect(findings.some(f => f.category === 'security')).toBe(true);
      expect(findings.some(f => f.category === 'reliability')).toBe(true);
      expect(findings.some(f => f.category === 'behavior')).toBe(true);
    });
  });

  describe('tool profile conversion', () => {
    it('should convert tool profiles with assertions', () => {
      const result = createInterviewResult({
        toolProfiles: [
          createToolProfile({
            name: 'my_tool',
            description: 'My tool description',
            behavioralNotes: ['Behavior 1', 'Behavior 2'],
            limitations: ['Limitation 1'],
            securityNotes: ['Security note 1'],
          }),
        ],
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.toolProfiles).toHaveLength(1);
      expect(cloudBaseline.toolProfiles[0].name).toBe('my_tool');
      expect(cloudBaseline.toolProfiles[0].behavioralNotes).toContain('Behavior 1');
      expect(cloudBaseline.toolProfiles[0].limitations).toContain('Limitation 1');
      expect(cloudBaseline.toolProfiles[0].securityNotes).toContain('Security note 1');
    });

    it('should generate schema hash for each tool profile', () => {
      const result = createInterviewResult();
      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.toolProfiles[0].schemaHash).toBeDefined();
      expect(cloudBaseline.toolProfiles[0].schemaHash.length).toBe(16);
    });
  });

  describe('workflow results conversion', () => {
    it('should convert workflow results', () => {
      const result = createInterviewResult({
        workflowResults: [
          {
            workflow: {
              id: 'wf1',
              name: 'Test Workflow',
              description: 'A test workflow',
              expectedOutcome: 'Success',
              steps: [
                { tool: 'step1', description: 'Step 1' },
                { tool: 'step2', description: 'Step 2' },
              ],
              discovered: false,
            },
            steps: [],
            success: true,
            summary: 'Workflow executed successfully',
            durationMs: 500,
            dataFlow: [],
          },
        ],
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.workflows).toHaveLength(1);
      expect(cloudBaseline.workflows![0].id).toBe('wf1');
      expect(cloudBaseline.workflows![0].name).toBe('Test Workflow');
      expect(cloudBaseline.workflows![0].toolSequence).toEqual(['step1', 'step2']);
      expect(cloudBaseline.workflows![0].succeeded).toBe(true);
    });

    it('should not include workflows when none present', () => {
      const result = createInterviewResult({ workflowResults: undefined });
      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.workflows).toBeUndefined();
    });
  });

  describe('assertion extraction', () => {
    it('should extract assertions from tool profiles', () => {
      const result = createInterviewResult({
        toolProfiles: [
          createToolProfile({
            behavioralNotes: ['Returns valid JSON'],
            limitations: ['Timeout on large inputs'],
            securityNotes: ['Validates user input'],
          }),
        ],
        limitations: ['Server has rate limits'],
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      // Should have assertions from tool and server
      expect(cloudBaseline.assertions.length).toBeGreaterThan(0);
    });

    it('should include server-level limitations as assertions', () => {
      const result = createInterviewResult({
        limitations: ['Server requires authentication', 'Rate limited to 100 req/min'],
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      const serverAssertions = cloudBaseline.assertions.filter(a => a.tool === 'server');
      expect(serverAssertions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('capability list building', () => {
    it('should build capability list from discovery', () => {
      const result = createInterviewResult({
        discovery: createDiscoveryResult({
          capabilities: {
            tools: {},
            prompts: {},
            resources: {},
            logging: {},
          },
        }),
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.server.capabilities).toContain('tools');
      expect(cloudBaseline.server.capabilities).toContain('prompts');
      expect(cloudBaseline.server.capabilities).toContain('resources');
      expect(cloudBaseline.server.capabilities).toContain('logging');
    });

    it('should only include enabled capabilities', () => {
      const result = createInterviewResult({
        discovery: createDiscoveryResult({
          capabilities: {
            tools: {},
          },
        }),
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      expect(cloudBaseline.server.capabilities).toContain('tools');
      expect(cloudBaseline.server.capabilities).not.toContain('prompts');
    });
  });

  describe('severity classification', () => {
    it('should classify critical severity for injection keywords', () => {
      const result = createInterviewResult({
        toolProfiles: [
          createToolProfile({
            securityNotes: ['SQL injection vulnerability detected'],
          }),
        ],
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      const securityAssertion = cloudBaseline.assertions.find(a =>
        a.condition.includes('injection')
      );
      expect(securityAssertion?.severity).toBe('critical');
    });

    it('should classify high severity for dangerous keywords', () => {
      const result = createInterviewResult({
        toolProfiles: [
          createToolProfile({
            securityNotes: ['Dangerous file access possible'],
          }),
        ],
      });

      const cloudBaseline = createCloudBaseline(result, 'npx server');

      const securityAssertion = cloudBaseline.assertions.find(a =>
        a.condition.includes('Dangerous')
      );
      expect(securityAssertion?.severity).toBe('high');
    });
  });
});

describe('edge cases', () => {
  it('should handle baseline with no tools', () => {
    const baseline = createBaseline({ tools: [] });
    const cloudBaseline = convertToCloudBaseline(baseline);

    expect(cloudBaseline.capabilities.tools).toHaveLength(0);
    expect(cloudBaseline.toolProfiles).toHaveLength(0);
  });

  it('should handle baseline with no assertions', () => {
    const baseline = createBaseline({ assertions: [] });
    const cloudBaseline = convertToCloudBaseline(baseline);

    expect(cloudBaseline.assertions).toHaveLength(0);
  });

  it('should handle interview result with no tool profiles', () => {
    const result = createInterviewResult({ toolProfiles: [] });
    const cloudBaseline = createCloudBaseline(result, 'npx server');

    expect(cloudBaseline.toolProfiles).toHaveLength(0);
  });

  it('should handle tools with missing input schema', () => {
    const result = createInterviewResult({
      discovery: createDiscoveryResult({
        tools: [
          { name: 'minimal_tool', description: 'Minimal' },
        ],
      }),
      toolProfiles: [
        createToolProfile({ name: 'minimal_tool' }),
      ],
    });

    const cloudBaseline = createCloudBaseline(result, 'npx server');

    expect(cloudBaseline.capabilities.tools[0].inputSchema).toEqual({});
  });

  it('should handle tools with empty description', () => {
    const baseline = createBaseline({
      tools: [
        createToolFingerprint({ description: '' }),
      ],
    });

    const cloudBaseline = convertToCloudBaseline(baseline);

    expect(cloudBaseline.toolProfiles[0].description).toBe('');
  });

  it('should handle prompts with no arguments', () => {
    const result = createInterviewResult({
      discovery: createDiscoveryResult({
        prompts: [
          { name: 'simple_prompt', description: 'A simple prompt' },
        ],
      }),
    });

    const cloudBaseline = createCloudBaseline(result, 'npx server');

    expect(cloudBaseline.capabilities.prompts![0].arguments).toBeUndefined();
  });
});
