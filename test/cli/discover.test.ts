import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { discover, summarizeDiscovery } from '../../src/discovery/discovery.js';
import type { MCPClient } from '../../src/transport/mcp-client.js';
import type { DiscoveryResult } from '../../src/discovery/types.js';
import { resetLogger, configureLogger } from '../../src/logging/logger.js';

// Mock the discovery module to test CLI behavior
describe('cli/discover', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    // Silence logger during tests
    configureLogger({ level: 'silent' });

    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.join(' '));
    });
  });

  afterEach(() => {
    resetLogger();
    vi.restoreAllMocks();
  });

  // Helper to create mock client - uses initialize() not connect()
  function createMockClient(config?: {
    tools?: Array<{ name: string; description?: string; inputSchema?: object }>;
    prompts?: Array<{ name: string; description?: string }>;
    resources?: Array<{ name: string; description?: string }>;
    serverInfo?: { name: string; version: string };
    capabilities?: Record<string, unknown>;
    throwOnInitialize?: boolean;
    throwOnListTools?: boolean;
  }): MCPClient {
    const tools = config?.tools ?? [
      {
        name: 'get_weather',
        description: 'Get weather for a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
        },
      },
    ];

    const prompts = config?.prompts ?? [];

    return {
      initialize: config?.throwOnInitialize
        ? vi.fn().mockRejectedValue(new Error('Initialize failed'))
        : vi.fn().mockResolvedValue({
            serverInfo: config?.serverInfo ?? { name: 'test-server', version: '1.0.0' },
            capabilities: config?.capabilities ?? { tools: {} },
            protocolVersion: '1.0',
          }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      listTools: config?.throwOnListTools
        ? vi.fn().mockRejectedValue(new Error('List tools failed'))
        : vi.fn().mockResolvedValue(tools),
      listPrompts: vi.fn().mockResolvedValue(prompts),
      listResources: vi.fn().mockResolvedValue([]),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] }),
      getPrompt: vi.fn().mockResolvedValue({ messages: [] }),
      getTransportErrors: vi.fn().mockReturnValue([]),
    } as unknown as MCPClient;
  }

  describe('discover functionality', () => {
    it('should discover tools from MCP server', async () => {
      const client = createMockClient({
        tools: [
          { name: 'tool1', description: 'First tool' },
          { name: 'tool2', description: 'Second tool' },
        ],
      });

      const result = await discover(client, 'npx', ['@test/server']);

      expect(result.tools).toHaveLength(2);
      expect(result.tools[0].name).toBe('tool1');
      expect(result.tools[1].name).toBe('tool2');
    });

    it('should discover prompts from MCP server', async () => {
      const client = createMockClient({
        prompts: [
          { name: 'prompt1', description: 'First prompt' },
        ],
        capabilities: { tools: {}, prompts: {} },
      });

      const result = await discover(client, 'npx', ['@test/server']);

      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0].name).toBe('prompt1');
    });

    it('should handle server with no tools', async () => {
      const client = createMockClient({
        tools: [],
      });

      const result = await discover(client, 'npx', ['@test/server']);

      expect(result.tools).toHaveLength(0);
    });

    it('should include server info in discovery result', async () => {
      const client = createMockClient({
        serverInfo: { name: 'my-server', version: '2.0.0' },
      });

      const result = await discover(client, 'npx', ['@test/server']);

      expect(result.serverInfo.name).toBe('my-server');
      expect(result.serverInfo.version).toBe('2.0.0');
    });

    it('should handle tool listing errors gracefully', async () => {
      const client = createMockClient({
        throwOnListTools: true,
        capabilities: { tools: {} },
      });

      const result = await discover(client, 'npx', ['@test/server']);

      // Should return empty tools array on error
      expect(result.tools).toHaveLength(0);
    });
  });

  describe('summarizeDiscovery', () => {
    const baseDiscovery: DiscoveryResult = {
      serverInfo: { name: 'test-server', version: '1.0.0' },
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      tools: [
        {
          name: 'get_weather',
          description: 'Get current weather',
          inputSchema: {
            type: 'object',
            properties: { location: { type: 'string' } },
          },
        },
      ],
      prompts: [],
      serverCommand: 'npx',
      serverArgs: ['@test/server'],
      timestamp: new Date(),
    };

    it('should include server name and version', () => {
      const summary = summarizeDiscovery(baseDiscovery);

      expect(summary).toContain('test-server');
      expect(summary).toContain('1.0.0');
    });

    it('should list discovered tools', () => {
      const summary = summarizeDiscovery(baseDiscovery);

      expect(summary).toContain('get_weather');
      expect(summary).toContain('Get current weather');
    });

    it('should show tool count', () => {
      const discoveryWithMultipleTools: DiscoveryResult = {
        ...baseDiscovery,
        tools: [
          { name: 'tool1', description: 'Tool 1' },
          { name: 'tool2', description: 'Tool 2' },
          { name: 'tool3', description: 'Tool 3' },
        ],
      };

      const summary = summarizeDiscovery(discoveryWithMultipleTools);

      expect(summary).toContain('3 Tools');
    });

    it('should handle discovery with prompts', () => {
      const discoveryWithPrompts: DiscoveryResult = {
        ...baseDiscovery,
        capabilities: { tools: {}, prompts: {} },
        prompts: [
          { name: 'my-prompt', description: 'A helpful prompt' },
        ],
      };

      const summary = summarizeDiscovery(discoveryWithPrompts);

      expect(summary).toContain('my-prompt');
    });

    it('should handle empty discovery', () => {
      const emptyDiscovery: DiscoveryResult = {
        serverInfo: { name: 'empty-server', version: '0.0.0' },
        protocolVersion: '2024-11-05',
        capabilities: {},
        tools: [],
        prompts: [],
        serverCommand: 'npx',
        serverArgs: ['@test/server'],
        timestamp: new Date(),
      };

      const summary = summarizeDiscovery(emptyDiscovery);

      expect(summary).toContain('empty-server');
      // Empty capabilities still shows in summary
      expect(summary).toContain('CAPABILITIES');
    });
  });

  describe('discover command options', () => {
    it('should support JSON output format', async () => {
      const client = createMockClient({
        tools: [{ name: 'test_tool', description: 'Test' }],
      });

      const result = await discover(client, 'npx', ['@test/server']);

      // JSON output should be valid JSON
      const jsonOutput = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(jsonOutput);

      expect(parsed.tools).toHaveLength(1);
      expect(parsed.serverInfo).toBeDefined();
    });

    it('should include input schema in discovery result', async () => {
      const schema = {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', default: 10 },
        },
        required: ['query'],
      };

      const client = createMockClient({
        tools: [
          { name: 'search', description: 'Search items', inputSchema: schema },
        ],
      });

      const result = await discover(client, 'npx', ['@test/server']);

      expect(result.tools[0].inputSchema).toEqual(schema);
    });
  });
});
