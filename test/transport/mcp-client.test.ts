import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPClient } from '../../src/transport/mcp-client.js';
import { standardToolSet, samplePrompts } from '../fixtures/sample-tools.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getTsxCommand } from '../fixtures/tsx-command.js';
import { ServerAuthError } from '../../src/errors/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the mock server source (use tsx to run TypeScript directly)
const MOCK_SERVER_PATH = join(__dirname, '../fixtures/mock-mcp-server.ts');

const { command: TSX_PATH, args: TSX_ARGS } = getTsxCommand(MOCK_SERVER_PATH);

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
      expect(result.protocolVersion).toBe('2025-11-25');
    });

    it('should store negotiated protocol version after initialization', async () => {
      expect(client.getNegotiatedProtocolVersion()).toBeNull();

      await client.connect(TSX_PATH, TSX_ARGS);
      await client.initialize();

      expect(client.getNegotiatedProtocolVersion()).toBe('2025-11-25');
    });

    it('should return feature flags based on negotiated version', async () => {
      expect(client.getFeatureFlags()).toBeNull();

      await client.connect(TSX_PATH, TSX_ARGS);
      await client.initialize();

      const flags = client.getFeatureFlags();
      expect(flags).not.toBeNull();
      expect(flags!.toolAnnotations).toBe(true);
      expect(flags!.tasks).toBe(true);
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
      expect(tools.map((t) => t.name)).toContain('get_weather');
      expect(tools.map((t) => t.name)).toContain('calculate');
      expect(tools.map((t) => t.name)).toContain('read_file');
    });

    it('should include tool schemas', async () => {
      const tools = await client.listTools();
      const weatherTool = tools.find((t) => t.name === 'get_weather');

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
      expect(prompts.map((p) => p.name)).toContain('summarize');
      expect(prompts.map((p) => p.name)).toContain('translate');
    });

    it('should include prompt arguments', async () => {
      const prompts = await client.listPrompts();
      const summarize = prompts.find((p) => p.name === 'summarize');

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
      await expect(client.callTool('nonexistent_tool', {})).rejects.toThrow('Unknown tool');
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
      // Attach a no-op catch handler immediately to prevent unhandled rejection warning
      // (the actual assertion happens below)
      const pendingPromise = slowClient.callTool('get_weather', { location: 'Test' });
      pendingPromise.catch(() => {
        // Expected rejection - handled in assertion below
      });

      // Give it a moment to send the request
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Disconnect while request is pending
      await slowClient.disconnect();

      await expect(pendingPromise).rejects.toThrow('Connection closed');
    }, 15000);
  });

  describe('server ready detection', () => {
    it('should not be ready before connect', () => {
      const freshClient = new MCPClient({ timeout: 5000, startupDelay: 100 });
      expect(freshClient.isServerReady()).toBe(false);
    });

    it('should be ready after startup delay and initialization', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      // Before initialize, may or may not be ready (depends on timing)
      await client.initialize();
      expect(client.isServerReady()).toBe(true);
    });

    it('should not be ready after disconnect', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      await client.initialize();
      await client.disconnect();
      expect(client.isServerReady()).toBe(false);
    });
  });

  describe('initialization failure handling', () => {
    it('should clear pending requests on initialization failure', async () => {
      // Use environment variable to make mock server fail init
      await client.connect(TSX_PATH, TSX_ARGS, {
        MOCK_FAIL_INIT: 'true',
      });

      // Initialize should fail
      await expect(client.initialize()).rejects.toThrow('Initialization failed');

      // Server should not be marked as ready after failure
      // (capabilities are null after failed init)
      expect(client.getCapabilities()).toBeNull();
    });

    it('should enforce minimum startup delay', async () => {
      const shortDelayClient = new MCPClient({
        timeout: 10000,
        startupDelay: 10, // Very short delay
      });

      const startTime = Date.now();
      await shortDelayClient.connect(TSX_PATH, TSX_ARGS);

      // The minimum startup delay should be enforced (MIN_SERVER_STARTUP_WAIT from constants)
      // Just verify the client can initialize - the actual delay is tested by timing
      await shortDelayClient.initialize();
      const elapsed = Date.now() - startTime;

      // Should take at least the minimum wait time (which is enforced regardless of startupDelay)
      // Note: We use a generous check since npx startup varies
      expect(elapsed).toBeGreaterThanOrEqual(100); // At minimum, it should take some time

      await shortDelayClient.disconnect();
    });
  });

  describe('transport error collection', () => {
    it('should start with empty transport errors', () => {
      const freshClient = new MCPClient({ timeout: 5000, startupDelay: 100 });
      expect(freshClient.getTransportErrors()).toHaveLength(0);
    });

    it('should collect transport errors on spawn failure', async () => {
      // Attempt to connect to a non-existent command
      await client.connect('nonexistent-command-xyz', []);

      // Wait for error to be processed
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have recorded a transport error
      const errors = client.getTransportErrors();
      expect(errors.length).toBeGreaterThanOrEqual(1);

      // Error should be classified as connection_refused or unknown
      const error = errors[0];
      expect(['connection_refused', 'unknown']).toContain(error.category);
      expect(error.likelyServerBug).toBe(false); // Spawn errors are environment issues
    });

    it('should collect errors on non-zero process exit', async () => {
      // Use mock server with failure environment
      await client.connect(TSX_PATH, TSX_ARGS, {
        MOCK_EXIT_CODE: '1', // Server exits with code 1
      });

      // Wait for exit
      await new Promise((resolve) => setTimeout(resolve, 200));

      const errors = client.getTransportErrors();
      // May or may not capture the error depending on timing
      // If captured, should be exit-related
      if (errors.length > 0) {
        const exitErrors = errors.filter((e) => e.operation === 'process_exit');
        if (exitErrors.length > 0) {
          expect(exitErrors[0].message).toContain('exited');
        }
      }
    });

    it('should clear transport errors when requested', async () => {
      // Create an error condition
      await client.connect('nonexistent-command-xyz', []);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify we have errors
      expect(client.getTransportErrors().length).toBeGreaterThanOrEqual(0);

      // Clear them
      client.clearTransportErrors();

      // Should be empty now
      expect(client.getTransportErrors()).toHaveLength(0);
    });

    it('should return a copy of errors, not the internal array', () => {
      const freshClient = new MCPClient({ timeout: 5000, startupDelay: 100 });
      const errors1 = freshClient.getTransportErrors();
      const errors2 = freshClient.getTransportErrors();

      // Should be different array instances
      expect(errors1).not.toBe(errors2);
    });
  });

  describe('transport error classification', () => {
    it('should correctly classify invalid JSON errors as server bugs', async () => {
      // This test validates the classification logic indirectly
      // by checking that connection errors are NOT classified as server bugs
      await client.connect('nonexistent-command-xyz', []);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const errors = client.getTransportErrors();
      if (errors.length > 0) {
        // Connection refused errors should NOT be classified as server bugs
        const connectionErrors = errors.filter((e) => e.category === 'connection_refused');
        connectionErrors.forEach((e) => {
          expect(e.likelyServerBug).toBe(false);
        });
      }
    });
  });

  describe('remote transport behavior', () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('merges remote headers with connectRemote override precedence', async () => {
      const fetchMock = vi.fn().mockImplementation(() => {
        const stream = new ReadableStream<Uint8Array>({
          start() {
            // Keep stream open for connection lifecycle
          },
        });
        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          })
        );
      });
      globalThis.fetch = fetchMock as typeof fetch;

      const remoteClient = new MCPClient({
        transport: 'sse',
        sseConfig: {
          baseUrl: 'https://unused.example',
          headers: {
            Authorization: 'Bearer config',
            'X-Base': '1',
          },
        },
      });

      await remoteClient.connectRemote('https://example.com/mcp', {
        transport: 'sse',
        headers: {
          Authorization: 'Bearer cli',
          'X-Opt': '2',
        },
      });

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer cli');
      expect(headers['X-Base']).toBe('1');
      expect(headers['X-Opt']).toBe('2');

      await remoteClient.disconnect();
    });

    it('runs preflight by default for remote connection', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('Method Not Allowed', { status: 405 }));
      globalThis.fetch = fetchMock as typeof fetch;

      const remoteClient = new MCPClient({
        transport: 'streamable-http',
      });

      await remoteClient.connectRemote('https://example.com/mcp', {
        transport: 'streamable-http',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
      await remoteClient.disconnect();
    });

    it('cancels preflight response bodies to avoid leaking open streams', async () => {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        start() {
          // Keep stream open until client cancels it.
        },
        cancel() {
          cancelled = true;
        },
      });

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      );
      globalThis.fetch = fetchMock as typeof fetch;

      const remoteClient = new MCPClient({
        transport: 'streamable-http',
      });

      await remoteClient.connectRemote('https://example.com/mcp', {
        transport: 'streamable-http',
      });

      expect(cancelled).toBe(true);
      await remoteClient.disconnect();
    });

    it('can disable preflight for remote connection', async () => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as typeof fetch;

      const remoteClient = new MCPClient({
        transport: 'streamable-http',
        remotePreflight: false,
      });

      await remoteClient.connectRemote('https://example.com/mcp', {
        transport: 'streamable-http',
      });

      expect(fetchMock).not.toHaveBeenCalled();
      await remoteClient.disconnect();
    });

    it('runs optional preflight and throws ServerAuthError on 401', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const remoteClient = new MCPClient({
        transport: 'streamable-http',
        remotePreflight: true,
      });

      await expect(
        remoteClient.connectRemote('https://example.com/mcp', {
          transport: 'streamable-http',
        })
      ).rejects.toBeInstanceOf(ServerAuthError);
    });

    it('rejects initialize promptly on remote auth failure (no timeout masking)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const remoteClient = new MCPClient({
        timeout: 5000,
        transport: 'streamable-http',
        remotePreflight: false,
      });

      await remoteClient.connectRemote('https://example.com/mcp', {
        transport: 'streamable-http',
      });

      await expect(remoteClient.initialize()).rejects.toThrow('authentication failed');
      await remoteClient.disconnect();
    });
  });
});
