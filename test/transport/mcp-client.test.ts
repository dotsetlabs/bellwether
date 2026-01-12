import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPClient } from '../../src/transport/mcp-client.js';
import { standardToolSet, samplePrompts } from '../fixtures/sample-tools.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the mock server source (use tsx to run TypeScript directly)
const MOCK_SERVER_PATH = join(__dirname, '../fixtures/mock-mcp-server.ts');

// Command to run TypeScript directly
const TSX_PATH = 'npx';
const TSX_ARGS = ['tsx', MOCK_SERVER_PATH];

describe('MCPClient', () => {
  let client: MCPClient;

  beforeEach(() => {
    client = new MCPClient({
      timeout: 5000,
      startupDelay: 100,
    });
  });

  afterEach(async () => {
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  });

  describe('connection', () => {
    it('should connect to mock MCP server', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const result = await client.initialize();

      expect(result.serverInfo.name).toBe('test-server');
      expect(result.serverInfo.version).toBe('1.0.0');
      expect(result.protocolVersion).toBe('2024-11-05');
    });

    it('should fail to initialize after spawn error', async () => {
      // connect() doesn't throw on spawn error - it emits events
      await client.connect('nonexistent-command-xyz', []);

      // The subsequent initialize() should fail because there's no connection
      await expect(client.initialize()).rejects.toThrow();
    });

    it('should handle server initialization failure', async () => {
      // Use environment variable to make mock server fail init
      await client.connect(TSX_PATH, TSX_ARGS, {
        MOCK_FAIL_INIT: 'true',
      });

      await expect(client.initialize()).rejects.toThrow('Initialization failed');
    });
  });

  describe('tool discovery', () => {
    beforeEach(async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      await client.initialize();
    });

    it('should list available tools', async () => {
      const tools = await client.listTools();

      expect(tools).toHaveLength(standardToolSet.length);
      expect(tools.map(t => t.name)).toContain('get_weather');
      expect(tools.map(t => t.name)).toContain('calculate');
      expect(tools.map(t => t.name)).toContain('read_file');
    });

    it('should include tool schemas', async () => {
      const tools = await client.listTools();
      const weatherTool = tools.find(t => t.name === 'get_weather');

      expect(weatherTool?.inputSchema).toBeDefined();
      expect(weatherTool?.inputSchema?.properties).toBeDefined();
    });
  });

  describe('prompt discovery', () => {
    beforeEach(async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      await client.initialize();
    });

    it('should list available prompts', async () => {
      const prompts = await client.listPrompts();

      expect(prompts).toHaveLength(samplePrompts.length);
      expect(prompts.map(p => p.name)).toContain('summarize');
      expect(prompts.map(p => p.name)).toContain('translate');
    });

    it('should include prompt arguments', async () => {
      const prompts = await client.listPrompts();
      const summarize = prompts.find(p => p.name === 'summarize');

      expect(summarize?.arguments).toBeDefined();
      expect(summarize?.arguments?.length).toBeGreaterThan(0);
    });
  });

  describe('tool calls', () => {
    beforeEach(async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      await client.initialize();
    });

    it('should call get_weather tool successfully', async () => {
      const result = await client.callTool('get_weather', {
        location: 'New York',
        units: 'celsius',
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.location).toBe('New York');
    });

    it('should call calculate tool with expression', async () => {
      const result = await client.callTool('calculate', {
        expression: '2 + 2',
      });

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.result).toBe(4);
    });

    it('should handle tool errors', async () => {
      const result = await client.callTool('read_file', {
        path: '/etc/passwd',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });

    it('should handle unknown tool', async () => {
      await expect(
        client.callTool('nonexistent_tool', {})
      ).rejects.toThrow('Unknown tool');
    });

    it('should handle tool timeout', async () => {
      // Create client with short timeout for tool calls
      const shortTimeoutClient = new MCPClient({
        timeout: 500, // 500ms timeout - enough for init, too short for delayed tool calls
        startupDelay: 200,
      });

      await shortTimeoutClient.connect(TSX_PATH, TSX_ARGS, {
        MOCK_DELAY: '2000', // Server delays 2 seconds for tool calls
      });

      await shortTimeoutClient.initialize();

      await expect(
        shortTimeoutClient.callTool('get_weather', { location: 'Test' })
      ).rejects.toThrow('timeout');

      await shortTimeoutClient.disconnect();
    }, 15000);
  });

  describe('capabilities', () => {
    it('should return null capabilities before initialization', () => {
      expect(client.getCapabilities()).toBeNull();
    });

    it('should return capabilities after initialization', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      await client.initialize();

      const capabilities = client.getCapabilities();
      expect(capabilities).toBeDefined();
    });
  });

  describe('disconnect', () => {
    it('should gracefully disconnect', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      await client.initialize();

      // Should not throw
      await client.disconnect();
    });

    it('should handle disconnect without connection', async () => {
      // Should not throw
      await client.disconnect();
    });

    it('should reject pending requests on disconnect', async () => {
      // Use longer timeout for init, server will delay tool calls
      const slowClient = new MCPClient({
        timeout: 10000,
        startupDelay: 200,
      });

      await slowClient.connect(TSX_PATH, TSX_ARGS, {
        MOCK_DELAY: '10000', // Server delays tool calls 10 seconds
      });
      await slowClient.initialize();

      // Start a request that will be pending (delayed by server)
      const pendingPromise = slowClient.callTool('get_weather', { location: 'Test' });

      // Give it a moment to send the request
      await new Promise(resolve => setTimeout(resolve, 100));

      // Disconnect while request is pending
      await slowClient.disconnect();

      await expect(pendingPromise).rejects.toThrow('Connection closed');
    }, 15000);
  });
});
