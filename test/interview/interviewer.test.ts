/**
 * Tests for the Interviewer class - core interview orchestration.
 *
 * Note: The Interviewer class has complex dependencies on the Orchestrator,
 * LLMClient, and various scenario/persona types. These tests focus on
 * check mode behavior which doesn't require LLM calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Interviewer, DEFAULT_CONFIG, DEFAULT_PERSONAS, type InterviewProgress } from '../../src/interview/interviewer.js';
import type { InterviewConfig, ServerContext } from '../../src/interview/types.js';
import type { DiscoveryResult } from '../../src/discovery/types.js';
import type { MCPClient } from '../../src/transport/mcp-client.js';
import type { MCPToolCallResult } from '../../src/transport/types.js';
import { MockLLMClient, createQuestionGeneratorMock } from '../fixtures/mock-llm-client.js';
import { standardToolSet, samplePrompts, mockServerInfo, createMockToolResult } from '../fixtures/sample-tools.js';

// Helper to create a mock MCP client
function createMockMCPClient(toolResults: Map<string, MCPToolCallResult> = new Map()): MCPClient {
  return {
    callTool: vi.fn(async (name: string) => {
      const result = toolResults.get(name);
      if (result) return result;
      return createMockToolResult(JSON.stringify({ tool: name, success: true }));
    }),
    getPrompt: vi.fn(async (name: string) => {
      return {
        description: `Prompt ${name}`,
        messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `Prompt content for ${name}` } }],
      };
    }),
    readResource: vi.fn(async (uri: string) => {
      return {
        contents: [{ uri, text: `Resource content for ${uri}` }],
      };
    }),
    listTools: vi.fn(async () => ({ tools: standardToolSet })),
    listPrompts: vi.fn(async () => ({ prompts: samplePrompts })),
    listResources: vi.fn(async () => ({ resources: [] })),
    close: vi.fn(),
  } as unknown as MCPClient;
}

// Helper to create a mock discovery result
function createMockDiscovery(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    serverInfo: mockServerInfo,
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
      prompts: {},
    },
    tools: standardToolSet,
    prompts: [],
    resources: [],
    timestamp: new Date(),
    serverCommand: 'npx test-server',
    serverArgs: [],
    ...overrides,
  };
}

describe('Interviewer', () => {
  let mockLLM: MockLLMClient;
  let mockClient: MCPClient;
  let interviewer: Interviewer;

  beforeEach(() => {
    mockLLM = createQuestionGeneratorMock();
    mockClient = createMockMCPClient();
    // Use check mode for fast tests (no LLM calls)
    interviewer = new Interviewer(mockLLM, { checkMode: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const interviewerDefault = new Interviewer(mockLLM);
      expect(interviewerDefault).toBeDefined();
    });

    it('should merge provided config with defaults', () => {
      const customConfig: Partial<InterviewConfig> = {
        maxQuestionsPerTool: 5,
        timeout: 60000,
      };
      const interviewerCustom = new Interviewer(mockLLM, customConfig);
      expect(interviewerCustom).toBeDefined();
    });

    it('should use default personas when none specified', () => {
      const interviewerDefault = new Interviewer(mockLLM);
      expect(interviewerDefault).toBeDefined();
      expect(DEFAULT_PERSONAS.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_CONFIG.maxQuestionsPerTool).toBeDefined();
      expect(DEFAULT_CONFIG.timeout).toBeDefined();
      expect(DEFAULT_CONFIG.skipErrorTests).toBe(false);
    });
  });

  describe('interview (check mode)', () => {
    it('should complete a basic interview in check mode', async () => {
      const discovery = createMockDiscovery();

      const result = await interviewer.interview(mockClient, discovery);

      expect(result).toBeDefined();
      expect(result.discovery).toBe(discovery);
      expect(result.toolProfiles).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should interview all discovered tools', async () => {
      const discovery = createMockDiscovery({
        tools: [
          { name: 'tool_a', description: 'Tool A' },
          { name: 'tool_b', description: 'Tool B' },
          { name: 'tool_c', description: 'Tool C' },
        ],
      });

      const result = await interviewer.interview(mockClient, discovery);

      expect(result.toolProfiles).toHaveLength(3);
      expect(result.toolProfiles.map(p => p.name)).toContain('tool_a');
      expect(result.toolProfiles.map(p => p.name)).toContain('tool_b');
      expect(result.toolProfiles.map(p => p.name)).toContain('tool_c');
    });

    it('should call progress callback', async () => {
      const discovery = createMockDiscovery();
      const progressCallback = vi.fn();

      await interviewer.interview(mockClient, discovery, progressCallback);

      expect(progressCallback).toHaveBeenCalled();
    });

    it('should track progress through phases', async () => {
      const discovery = createMockDiscovery();
      const progressUpdates: InterviewProgress[] = [];

      await interviewer.interview(mockClient, discovery, (progress) => {
        progressUpdates.push({ ...progress });
      });

      // Check that progress was tracked
      const completeProgress = progressUpdates.find(p => p.phase === 'complete');
      expect(completeProgress).toBeDefined();
    });

    it('should handle empty tool list', async () => {
      const discovery = createMockDiscovery({ tools: [] });

      const result = await interviewer.interview(mockClient, discovery);

      expect(result.toolProfiles).toHaveLength(0);
      expect(result.metadata).toBeDefined();
    });

    it('should record metadata about the interview', async () => {
      const discovery = createMockDiscovery();

      const result = await interviewer.interview(mockClient, discovery);

      expect(result.metadata.startTime).toBeInstanceOf(Date);
      expect(result.metadata.endTime).toBeInstanceOf(Date);
      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.toolCallCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle tool call errors gracefully', async () => {
      const errorClient = createMockMCPClient();
      (errorClient.callTool as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Tool call failed'));

      const discovery = createMockDiscovery({
        tools: [{ name: 'failing_tool', description: 'This tool fails' }],
      });

      const result = await interviewer.interview(errorClient, discovery);

      // Should complete despite errors
      expect(result).toBeDefined();
      expect(result.metadata.errorCount).toBeGreaterThan(0);
    }, 30000);

    it('should not make LLM calls in check mode', async () => {
      const discovery = createMockDiscovery();

      await interviewer.interview(mockClient, discovery);

      // In check mode, LLM should not be called
      expect(mockLLM.getCallCount()).toBe(0);
    });
  });

  describe('extractServerContext', () => {
    it('should extract allowed directories from constraint discovery tools', async () => {
      const clientWithDirectories = createMockMCPClient(new Map([
        ['list_allowed_directories', createMockToolResult('["/home/user", "/tmp"]')],
      ]));

      const discovery = createMockDiscovery({
        tools: [
          { name: 'list_allowed_directories', description: 'Lists allowed directories' },
        ],
      });

      const context = await interviewer.extractServerContext(clientWithDirectories, discovery);

      expect(context.allowedDirectories).toContain('/home/user');
      expect(context.allowedDirectories).toContain('/tmp');
    });

    it('should extract allowed hosts from tool descriptions', async () => {
      const discovery = createMockDiscovery({
        tools: [
          { name: 'fetch_url', description: 'Fetch data from https://api.example.com/v1' },
        ],
      });

      const context = await interviewer.extractServerContext(mockClient, discovery);

      expect(context.allowedHosts).toContain('https://api.example.com');
    });

    it('should handle tool probe failures gracefully', async () => {
      const failingClient = createMockMCPClient();
      (failingClient.callTool as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Probe failed'));

      const discovery = createMockDiscovery({
        tools: [
          { name: 'list_allowed_directories', description: 'Lists allowed directories' },
        ],
      });

      // Should not throw
      const context = await interviewer.extractServerContext(failingClient, discovery);
      expect(context).toBeDefined();
    });

    it('should parse allowed directories from line-by-line format', async () => {
      const clientLineFormat = createMockMCPClient(new Map([
        ['list_allowed_directories', createMockToolResult('/home/user\n/var/data\n/tmp')],
      ]));

      const discovery = createMockDiscovery({
        tools: [
          { name: 'list_allowed_directories', description: 'Lists allowed directories' },
        ],
      });

      const context = await interviewer.extractServerContext(clientLineFormat, discovery);

      expect(context.allowedDirectories).toContain('/home/user');
      expect(context.allowedDirectories).toContain('/var/data');
      expect(context.allowedDirectories).toContain('/tmp');
    });
  });

  describe('setServerContext', () => {
    it('should allow setting server context directly', async () => {
      const context: ServerContext = {
        allowedDirectories: ['/custom/path'],
        allowedHosts: ['https://custom.host'],
        constraints: ['Custom constraint'],
        hints: ['Custom hint'],
      };

      interviewer.setServerContext(context);

      // Context should be used in subsequent interviews
      const discovery = createMockDiscovery();
      const result = await interviewer.interview(mockClient, discovery);

      expect(result).toBeDefined();
    });
  });

  describe('prompt interviews (check mode)', () => {
    it('should interview prompts when available', async () => {
      const discovery = createMockDiscovery({
        prompts: [
          {
            name: 'summarize',
            description: 'Summarize text',
            arguments: [{ name: 'text', required: true }],
          },
        ],
      });

      const result = await interviewer.interview(mockClient, discovery);

      expect(result.promptProfiles).toBeDefined();
      expect(result.promptProfiles?.length).toBe(1);
    });

    it('should handle prompt execution errors', async () => {
      const failingClient = createMockMCPClient();
      (failingClient.getPrompt as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Prompt failed'));

      const discovery = createMockDiscovery({
        prompts: [{ name: 'failing_prompt', description: 'This prompt fails' }],
      });

      const result = await interviewer.interview(failingClient, discovery);

      // Should complete despite errors
      expect(result.promptProfiles).toBeDefined();
    });
  });
});

describe('executeToolScenarios', () => {
  let mockLLM: MockLLMClient;
  let mockClient: MCPClient;
  let interviewer: Interviewer;

  beforeEach(() => {
    mockLLM = createQuestionGeneratorMock();
    mockClient = createMockMCPClient();
    interviewer = new Interviewer(mockLLM, { checkMode: true });
  });

  it('should execute multiple scenarios', async () => {
    const scenarios = [
      { tool: 'test', description: 'Scenario 1', category: 'happy_path' as const, args: { a: 1 } },
      { tool: 'test', description: 'Scenario 2', category: 'error_handling' as const, args: { a: 2 } },
    ];

    const results = await interviewer.executeToolScenarios(mockClient, 'test', scenarios);

    expect(results).toHaveLength(2);
  });

  it('should evaluate assertions correctly', async () => {
    const clientWithResponse = createMockMCPClient(new Map([
      ['test', createMockToolResult(JSON.stringify({ value: 42 }))],
    ]));

    const scenarios = [
      {
        tool: 'test',
        description: 'Test with assertions',
        category: 'happy_path' as const,
        args: {},
        assertions: [
          { path: 'value', condition: 'equals' as const, value: 42 },
        ],
      },
    ];

    const results = await interviewer.executeToolScenarios(clientWithResponse, 'test', scenarios);

    expect(results[0].passed).toBe(true);
    expect(results[0].assertionResults).toHaveLength(1);
    expect(results[0].assertionResults[0].passed).toBe(true);
  });

  it('should handle error responses for error_handling category', async () => {
    const errorClient = createMockMCPClient(new Map([
      ['test', createMockToolResult('Expected error', true)],
    ]));

    const scenarios = [
      {
        tool: 'test',
        description: 'Error scenario',
        category: 'error_handling' as const,
        args: {},
      },
    ];

    const results = await interviewer.executeToolScenarios(errorClient, 'test', scenarios);

    // Error handling scenarios pass when an error is returned
    expect(results[0].passed).toBe(true);
  });

  it('should record scenario duration', async () => {
    const scenarios = [
      { tool: 'test', description: 'Timed scenario', category: 'happy_path' as const, args: {} },
    ];

    const results = await interviewer.executeToolScenarios(mockClient, 'test', scenarios);

    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should skip scenarios marked as skip', async () => {
    const scenarios = [
      { tool: 'test', description: 'Skipped', category: 'happy_path' as const, args: {}, skip: true },
      { tool: 'test', description: 'Active', category: 'happy_path' as const, args: {} },
    ];

    const results = await interviewer.executeToolScenarios(mockClient, 'test', scenarios);

    expect(results).toHaveLength(1);
    expect(results[0].scenario.description).toBe('Active');
  });
});

describe('executePromptScenarios', () => {
  let mockLLM: MockLLMClient;
  let mockClient: MCPClient;
  let interviewer: Interviewer;

  beforeEach(() => {
    mockLLM = createQuestionGeneratorMock();
    mockClient = createMockMCPClient();
    interviewer = new Interviewer(mockLLM, { checkMode: true });
  });

  it('should execute prompt scenarios', async () => {
    const scenarios = [
      { prompt: 'test', description: 'Prompt scenario', args: { text: 'input' } },
    ];

    const results = await interviewer.executePromptScenarios(mockClient, 'test', scenarios);

    expect(results).toHaveLength(1);
  });

  it('should handle prompt execution errors', async () => {
    const failingClient = createMockMCPClient();
    (failingClient.getPrompt as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Prompt failed'));

    const scenarios = [
      { prompt: 'test', description: 'Failing prompt', args: {} },
    ];

    const results = await interviewer.executePromptScenarios(failingClient, 'test', scenarios);

    expect(results[0].error).toBeDefined();
    expect(results[0].passed).toBe(false);
  });

  it('should skip scenarios marked as skip', async () => {
    const scenarios = [
      { prompt: 'test', description: 'Skipped', args: {}, skip: true },
      { prompt: 'test', description: 'Active', args: {} },
    ];

    const results = await interviewer.executePromptScenarios(mockClient, 'test', scenarios);

    expect(results).toHaveLength(1);
    expect(results[0].scenario.description).toBe('Active');
  });
});

describe('parallel tool testing (check mode)', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = createMockMCPClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should complete interview with parallelTools enabled', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      parallelTools: true,
      toolConcurrency: 2,
    });

    const discovery = createMockDiscovery({
      tools: [
        { name: 'tool_a', description: 'Tool A', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool_b', description: 'Tool B', inputSchema: { type: 'object', properties: {} } },
        { name: 'tool_c', description: 'Tool C', inputSchema: { type: 'object', properties: {} } },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result).toBeDefined();
    expect(result.toolProfiles).toHaveLength(3);
    expect(result.toolProfiles.map(p => p.name)).toContain('tool_a');
    expect(result.toolProfiles.map(p => p.name)).toContain('tool_b');
    expect(result.toolProfiles.map(p => p.name)).toContain('tool_c');
  });

  it('should test all tools with parallel execution', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      parallelTools: true,
      toolConcurrency: 4,
    });

    const tools = Array.from({ length: 10 }, (_, i) => ({
      name: `tool_${i}`,
      description: `Tool ${i}`,
      inputSchema: { type: 'object', properties: {} },
    }));

    const discovery = createMockDiscovery({ tools });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result.toolProfiles).toHaveLength(10);
  });

  it('should handle tool errors in parallel mode', async () => {
    const errorClient = createMockMCPClient();
    let callCount = 0;
    (errorClient.callTool as ReturnType<typeof vi.fn>).mockImplementation(async (name: string) => {
      callCount++;
      if (name === 'failing_tool') {
        throw new Error('Tool call failed');
      }
      return createMockToolResult(JSON.stringify({ tool: name, success: true }));
    });

    const interviewer = new Interviewer(null, {
      checkMode: true,
      parallelTools: true,
      toolConcurrency: 2,
    });

    const discovery = createMockDiscovery({
      tools: [
        { name: 'working_tool', description: 'Works' },
        { name: 'failing_tool', description: 'Fails' },
      ],
    });

    const result = await interviewer.interview(errorClient, discovery);

    // Should complete despite error
    expect(result).toBeDefined();
    expect(result.toolProfiles).toHaveLength(2);
    expect(result.metadata.errorCount).toBeGreaterThan(0);
  });

  it('should call progress callback in parallel mode', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      parallelTools: true,
      toolConcurrency: 2,
    });

    const discovery = createMockDiscovery({
      tools: [
        { name: 'tool_a', description: 'Tool A' },
        { name: 'tool_b', description: 'Tool B' },
      ],
    });

    const progressUpdates: InterviewProgress[] = [];
    await interviewer.interview(mockClient, discovery, (progress) => {
      progressUpdates.push({ ...progress });
    });

    // Verify progress was tracked
    expect(progressUpdates.length).toBeGreaterThan(0);
    const completeProgress = progressUpdates.find(p => p.phase === 'complete');
    expect(completeProgress).toBeDefined();
  });

  it('should respect toolConcurrency setting', async () => {
    // This test verifies the concurrency setting is used, not its exact behavior
    // (which would require mocking internal parallelLimit function)
    const interviewer = new Interviewer(null, {
      checkMode: true,
      parallelTools: true,
      toolConcurrency: 1, // Single worker
    });

    const discovery = createMockDiscovery({
      tools: [
        { name: 'tool_a', description: 'Tool A' },
        { name: 'tool_b', description: 'Tool B' },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    // All tools should still be tested
    expect(result.toolProfiles).toHaveLength(2);
  });

  it('should generate fallback questions for tools with required params', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      parallelTools: true,
    });

    const discovery = createMockDiscovery({
      tools: [
        {
          name: 'tool_with_params',
          description: 'Tool with params',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              count: { type: 'number' },
            },
            required: ['name'],
          },
        },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result.toolProfiles).toHaveLength(1);
    // Should have interactions from fallback questions
    expect(result.toolProfiles[0].interactions.length).toBeGreaterThan(0);
  });

  it('should work with empty tool list in parallel mode', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      parallelTools: true,
    });

    const discovery = createMockDiscovery({ tools: [] });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result.toolProfiles).toHaveLength(0);
    expect(result.metadata).toBeDefined();
  });
});

/**
 * Tests for check mode WITHOUT parallelTools (the default configuration).
 * This is critical because bellwether check runs with parallelTools=false by default.
 */
describe('check mode without parallelTools (default config)', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = createMockMCPClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should complete interview with checkMode=true and no parallelTools (default)', async () => {
    // This is the EXACT configuration used by bellwether check without --parallel flag
    const interviewer = new Interviewer(null, {
      checkMode: true,
      // parallelTools NOT set (defaults to false/undefined)
    });

    const discovery = createMockDiscovery({
      tools: [
        { name: 'tool_a', description: 'Tool A' },
        { name: 'tool_b', description: 'Tool B' },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result).toBeDefined();
    expect(result.toolProfiles).toHaveLength(2);
    expect(result.metadata.model).toBe('check');
  });

  it('should complete interview with checkMode=true and parallelTools=false explicitly', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      parallelTools: false, // Explicitly false
    });

    const discovery = createMockDiscovery({
      tools: [
        { name: 'tool_a', description: 'Tool A' },
        { name: 'tool_b', description: 'Tool B' },
        { name: 'tool_c', description: 'Tool C' },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result).toBeDefined();
    expect(result.toolProfiles).toHaveLength(3);
  });

  it('should work with tools that have required parameters in sequential mode', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      // parallelTools NOT set
    });

    const discovery = createMockDiscovery({
      tools: [
        {
          name: 'parameterized_tool',
          description: 'Tool with required params',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              limit: { type: 'number' },
            },
            required: ['query'],
          },
        },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result).toBeDefined();
    expect(result.toolProfiles).toHaveLength(1);
    expect(result.toolProfiles[0].interactions.length).toBeGreaterThan(0);
  });
});

/**
 * Tests for check mode with prompts (ensures orchestrator is not required).
 */
describe('check mode with prompts', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = createMockMCPClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle prompts in check mode without parallelTools', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      // parallelTools NOT set
    });

    const discovery = createMockDiscovery({
      tools: [{ name: 'test_tool', description: 'Test tool' }],
      prompts: [
        {
          name: 'summarize',
          description: 'Summarize text',
          arguments: [{ name: 'text', required: true }],
        },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result).toBeDefined();
    expect(result.toolProfiles).toHaveLength(1);
    expect(result.promptProfiles).toBeDefined();
    expect(result.promptProfiles?.length).toBe(1);
    // In check mode, prompts should still be profiled with simple analysis
    expect(result.promptProfiles?.[0].name).toBe('summarize');
  });

  it('should handle multiple prompts in check mode', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      parallelTools: true, // Test with parallel too
    });

    const discovery = createMockDiscovery({
      tools: [{ name: 'test_tool', description: 'Test tool' }],
      prompts: [
        { name: 'prompt_a', description: 'Prompt A' },
        { name: 'prompt_b', description: 'Prompt B' },
        { name: 'prompt_c', description: 'Prompt C', arguments: [{ name: 'input' }] },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result).toBeDefined();
    expect(result.promptProfiles).toBeDefined();
    expect(result.promptProfiles?.length).toBe(3);
  });
});

/**
 * Tests for check mode with resources (ensures orchestrator is not required).
 */
describe('check mode with resources', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = createMockMCPClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle resources in check mode without parallelTools', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      // parallelTools NOT set
    });

    const discovery = createMockDiscovery({
      tools: [{ name: 'test_tool', description: 'Test tool' }],
      resources: [
        {
          uri: 'file:///test/doc.txt',
          name: 'Test Document',
          description: 'A test document',
          mimeType: 'text/plain',
        },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result).toBeDefined();
    expect(result.toolProfiles).toHaveLength(1);
    expect(result.resourceProfiles).toBeDefined();
    expect(result.resourceProfiles?.length).toBe(1);
    expect(result.resourceProfiles?.[0].name).toBe('Test Document');
  });

  it('should handle multiple resources in check mode', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      parallelTools: true,
    });

    const discovery = createMockDiscovery({
      tools: [{ name: 'test_tool', description: 'Test tool' }],
      resources: [
        { uri: 'file:///a.txt', name: 'Resource A', mimeType: 'text/plain' },
        { uri: 'file:///b.json', name: 'Resource B', mimeType: 'application/json' },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    expect(result).toBeDefined();
    expect(result.resourceProfiles).toBeDefined();
    expect(result.resourceProfiles?.length).toBe(2);
  });
});

/**
 * Tests for check mode with tools, prompts, AND resources together.
 * This is the comprehensive integration test for check mode.
 */
describe('check mode comprehensive (tools + prompts + resources)', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = createMockMCPClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle full discovery result in check mode without parallelTools', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
      // parallelTools NOT set - this is the critical test case
    });

    const discovery = createMockDiscovery({
      tools: [
        { name: 'tool_a', description: 'Tool A' },
        { name: 'tool_b', description: 'Tool B', inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } },
      ],
      prompts: [
        { name: 'prompt_a', description: 'Prompt A' },
      ],
      resources: [
        { uri: 'file:///test.txt', name: 'Test Resource', mimeType: 'text/plain' },
      ],
    });

    const result = await interviewer.interview(mockClient, discovery);

    // Verify all components were processed
    expect(result).toBeDefined();
    expect(result.toolProfiles).toHaveLength(2);
    expect(result.promptProfiles).toBeDefined();
    expect(result.promptProfiles?.length).toBe(1);
    expect(result.resourceProfiles).toBeDefined();
    expect(result.resourceProfiles?.length).toBe(1);
    expect(result.metadata.model).toBe('check');
  });

  it('should complete with progress callbacks in check mode', async () => {
    const interviewer = new Interviewer(null, {
      checkMode: true,
    });

    const discovery = createMockDiscovery({
      tools: [{ name: 'tool_a', description: 'Tool A' }],
      prompts: [{ name: 'prompt_a', description: 'Prompt A' }],
      resources: [{ uri: 'file:///test.txt', name: 'Test', mimeType: 'text/plain' }],
    });

    const progressUpdates: string[] = [];
    const result = await interviewer.interview(mockClient, discovery, (progress) => {
      progressUpdates.push(progress.phase);
    });

    expect(result).toBeDefined();
    expect(progressUpdates).toContain('starting');
    expect(progressUpdates).toContain('complete');
  });
});
