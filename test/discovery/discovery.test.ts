import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discover, parseToolDetail, summarizeDiscovery } from '../../src/discovery/discovery.js';
import type { DiscoveryResult } from '../../src/discovery/types.js';
import type { MCPClient } from '../../src/transport/mcp-client.js';
import {
  weatherTool,
  calculatorTool,
  noParamsTool,
  minimalTool,
  samplePrompts,
  mockServerInfo,
  mockCapabilities,
} from '../fixtures/sample-tools.js';

/**
 * Create a mock MCP client for testing.
 */
function createMockClient(config?: {
  tools?: (typeof weatherTool)[];
  prompts?: typeof samplePrompts;
  capabilities?: typeof mockCapabilities;
  throwOnListTools?: boolean;
  throwOnListPrompts?: boolean;
  transportErrors?: Array<{
    timestamp: Date;
    category: string;
    message: string;
    likelyServerBug: boolean;
  }>;
  instructions?: string;
}): MCPClient {
  const tools = config?.tools ?? [weatherTool, calculatorTool];
  const prompts = config?.prompts ?? samplePrompts;
  const capabilities = config?.capabilities ?? { tools: {}, prompts: {} };
  const transportErrors = config?.transportErrors ?? [];

  return {
    initialize: vi.fn().mockResolvedValue({
      protocolVersion: '2025-11-25',
      capabilities,
      serverInfo: mockServerInfo,
      instructions: config?.instructions,
    }),
    listTools: config?.throwOnListTools
      ? vi.fn().mockRejectedValue(new Error('List tools failed'))
      : vi.fn().mockResolvedValue(tools),
    listPrompts: config?.throwOnListPrompts
      ? vi.fn().mockRejectedValue(new Error('List prompts failed'))
      : vi.fn().mockResolvedValue(prompts),
    listResources: vi.fn().mockResolvedValue([]),
    listResourceTemplates: vi.fn().mockResolvedValue([]),
    getTransportErrors: vi.fn().mockReturnValue(transportErrors),
    getInstructions: vi.fn().mockReturnValue(config?.instructions),
  } as unknown as MCPClient;
}

describe('discovery', () => {
  describe('discover', () => {
    it('should discover server info and capabilities', async () => {
      const client = createMockClient();

      const result = await discover(client, 'test-cmd', ['--arg']);

      expect(result.serverInfo.name).toBe('test-server');
      expect(result.serverInfo.version).toBe('1.0.0');
      expect(result.protocolVersion).toBe('2025-11-25');
      expect(result.serverCommand).toBe('test-cmd');
      expect(result.serverArgs).toEqual(['--arg']);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should discover tools when capability exists', async () => {
      const client = createMockClient({
        tools: [weatherTool, calculatorTool],
        capabilities: { tools: {} },
      });

      const result = await discover(client, 'cmd', []);

      expect(result.tools).toHaveLength(2);
      expect(result.tools.map((t) => t.name)).toContain('get_weather');
      expect(result.tools.map((t) => t.name)).toContain('calculate');
    });

    it('should not list tools when capability is missing', async () => {
      const client = createMockClient({
        capabilities: { prompts: {} }, // No tools capability
      });

      const result = await discover(client, 'cmd', []);

      expect(result.tools).toHaveLength(0);
      expect(client.listTools).not.toHaveBeenCalled();
    });

    it('should discover prompts when capability exists', async () => {
      const client = createMockClient({
        prompts: samplePrompts,
        capabilities: { prompts: {} },
      });

      const result = await discover(client, 'cmd', []);

      expect(result.prompts).toHaveLength(2);
      expect(result.prompts.map((p) => p.name)).toContain('summarize');
    });

    it('should not list prompts when capability is missing', async () => {
      const client = createMockClient({
        capabilities: { tools: {} }, // No prompts capability
      });

      const result = await discover(client, 'cmd', []);

      expect(result.prompts).toHaveLength(0);
      expect(client.listPrompts).not.toHaveBeenCalled();
    });

    it('should handle tool listing errors gracefully', async () => {
      const client = createMockClient({
        capabilities: { tools: {} },
        throwOnListTools: true,
      });

      const result = await discover(client, 'cmd', []);

      // Should not throw and should return empty tools array
      expect(result.tools).toHaveLength(0);
    });

    it('should handle prompt listing errors gracefully', async () => {
      const client = createMockClient({
        capabilities: { prompts: {} },
        throwOnListPrompts: true,
      });

      const result = await discover(client, 'cmd', []);

      // Should not throw and should return empty prompts array
      expect(result.prompts).toHaveLength(0);
    });
  });

  describe('parseToolDetail', () => {
    it('should parse tool with required and optional params', () => {
      const detail = parseToolDetail(weatherTool);

      expect(detail.name).toBe('get_weather');
      expect(detail.description).toBe('Get the current weather for a location');
      expect(detail.requiredParams).toContain('location');
      expect(detail.optionalParams).toContain('units');
    });

    it('should parse tool with no required params', () => {
      const detail = parseToolDetail(noParamsTool);

      expect(detail.name).toBe('get_timestamp');
      expect(detail.requiredParams).toHaveLength(0);
      expect(detail.optionalParams).toHaveLength(0);
    });

    it('should handle tool with no schema', () => {
      const detail = parseToolDetail(minimalTool);

      expect(detail.name).toBe('ping');
      expect(detail.description).toBe('Check server health');
      expect(detail.inputSchema).toBeNull();
      expect(detail.requiredParams).toHaveLength(0);
      expect(detail.optionalParams).toHaveLength(0);
    });

    it('should handle tool with no description', () => {
      const toolWithoutDesc = { ...weatherTool, description: undefined };
      const detail = parseToolDetail(toolWithoutDesc);

      expect(detail.description).toBe('No description provided');
    });

    it('should categorize all params correctly', () => {
      const detail = parseToolDetail(calculatorTool);

      expect(detail.requiredParams).toContain('expression');
      expect(detail.optionalParams).toContain('precision');
      expect(detail.requiredParams).not.toContain('precision');
      expect(detail.optionalParams).not.toContain('expression');
    });
  });

  describe('summarizeDiscovery', () => {
    let mockResult: DiscoveryResult;

    beforeEach(() => {
      mockResult = {
        serverInfo: mockServerInfo,
        protocolVersion: '2025-11-25',
        capabilities: { tools: {}, prompts: {} },
        tools: [weatherTool, calculatorTool],
        prompts: samplePrompts,
        resources: [],
        resourceTemplates: [],
        timestamp: new Date(),
        serverCommand: 'test-server',
        serverArgs: [],
      };
    });

    it('should include server info in header', () => {
      const summary = summarizeDiscovery(mockResult);

      expect(summary).toContain('test-server v1.0.0');
      expect(summary).toContain('Protocol Version: 2025-11-25');
    });

    it('should list tool count in capabilities', () => {
      const summary = summarizeDiscovery(mockResult);

      expect(summary).toContain('2 Tools');
    });

    it('should list prompt count in capabilities', () => {
      const summary = summarizeDiscovery(mockResult);

      expect(summary).toContain('2 Prompts');
    });

    it('should list tool signatures', () => {
      const summary = summarizeDiscovery(mockResult);

      expect(summary).toContain('get_weather(location, units?)');
      expect(summary).toContain('calculate(expression, precision?)');
    });

    it('should include tool descriptions', () => {
      const summary = summarizeDiscovery(mockResult);

      expect(summary).toContain('Get the current weather for a location');
    });

    it('should include prompt names with signatures', () => {
      const summary = summarizeDiscovery(mockResult);

      expect(summary).toContain('summarize(text, max_length?)');
      expect(summary).toContain('translate(text, target_language)');
    });

    it('should handle empty tools list', () => {
      mockResult.tools = [];
      mockResult.capabilities = { prompts: {} };

      const summary = summarizeDiscovery(mockResult);

      expect(summary).not.toContain('TOOLS');
      expect(summary).toContain('PROMPTS');
    });

    it('should handle empty prompts list', () => {
      mockResult.prompts = [];
      mockResult.capabilities = { tools: {} };

      const summary = summarizeDiscovery(mockResult);

      expect(summary).toContain('TOOLS');
      expect(summary).not.toContain('PROMPTS');
    });

    it('should show resources capability when present', () => {
      mockResult.capabilities = { ...mockResult.capabilities, resources: {} };

      const summary = summarizeDiscovery(mockResult);

      // Resources shown in capabilities line
      expect(summary).toMatch(/2 Tools.*Resources|Resources.*2 Tools/);
    });

    it('should show logging capability when present', () => {
      mockResult.capabilities = { ...mockResult.capabilities, logging: {} };

      const summary = summarizeDiscovery(mockResult);

      // Logging shown in capabilities line
      expect(summary).toMatch(/2 Tools.*Logging|Logging.*2 Tools/);
    });

    it('should include quick start section with commands', () => {
      const summary = summarizeDiscovery(mockResult);

      expect(summary).toContain('QUICK START');
      expect(summary).toContain('bellwether check');
      expect(summary).toContain('bellwether explore');
      expect(summary).toContain('Schema validation and drift detection');
      expect(summary).toContain('LLM-powered behavioral exploration');
    });

    it('should include server command in quick start', () => {
      const summary = summarizeDiscovery(mockResult);

      expect(summary).toContain('bellwether check test-server');
      expect(summary).toContain('bellwether explore test-server');
    });
  });
});
