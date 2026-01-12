import { spawn, type ChildProcess } from 'child_process';
import { StdioTransport } from './stdio-transport.js';
import type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeResult,
  MCPTool,
  MCPPrompt,
  MCPToolCallResult,
  MCPToolsListResult,
  MCPPromptsListResult,
  MCPServerCapabilities,
} from './types.js';
import { getLogger, startTiming } from '../logging/logger.js';

export interface MCPClientOptions {
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Environment variables for the server process */
  env?: Record<string, string>;
  /** Delay before sending first request to allow server startup (default: 500ms) */
  startupDelay?: number;
  /** Enable debug logging */
  debug?: boolean;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_STARTUP_DELAY = 500;

/**
 * MCPClient connects to an MCP server via stdio and provides
 * methods to interact with the server's capabilities.
 */
export class MCPClient {
  private process: ChildProcess | null = null;
  private transport: StdioTransport | null = null;
  private requestId = 0;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private serverCapabilities: MCPServerCapabilities | null = null;
  private timeout: number;
  private startupDelay: number;
  private serverReady = false;
  private readyPromise: Promise<void> | null = null;
  private debug: boolean;
  private logger = getLogger('mcp-client');

  constructor(options?: MCPClientOptions) {
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    this.startupDelay = options?.startupDelay ?? DEFAULT_STARTUP_DELAY;
    this.debug = options?.debug ?? false;
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      this.logger.debug({ args }, 'MCP Debug');
    }
  }

  /**
   * Connect to an MCP server by spawning it as a subprocess.
   */
  async connect(
    command: string,
    args: string[] = [],
    env?: Record<string, string>
  ): Promise<void> {
    this.logger.info({ command, args: args.length }, 'Connecting to MCP server');

    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to create stdio streams for server process');
    }

    this.transport = new StdioTransport(
      this.process.stdout,
      this.process.stdin,
      { debug: this.debug }
    );

    this.transport.on('message', (msg: JSONRPCMessage) => {
      this.log('Received:', JSON.stringify(msg));
      this.handleMessage(msg);
    });

    this.transport.on('error', (error: Error) => {
      this.logger.error({ error: error.message }, 'Transport error');
    });

    this.transport.on('close', () => {
      this.logger.debug('Transport closed');
      this.cleanup();
    });

    this.process.on('error', (error) => {
      this.logger.error({ error: error.message }, 'Process error');
      this.cleanup();
    });

    this.process.on('exit', (code) => {
      if (code !== 0) {
        this.logger.warn({ exitCode: code }, 'Server process exited with non-zero code');
      }
      this.cleanup();
    });

    // Capture stderr for debugging and detect server ready
    this.process.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        this.logger.debug({ stderr: msg }, 'Server stderr');
      }
      // Mark server as ready when we see any stderr output (server is running)
      if (!this.serverReady) {
        this.serverReady = true;
      }
    });

    // Wait for server to be ready (either stderr output or startup delay)
    this.readyPromise = this.waitForReady();
    this.logger.debug('Server ready, connection established');
  }

  /**
   * Wait for the server to be ready before sending requests.
   */
  private async waitForReady(): Promise<void> {
    // Wait for either stderr output or the startup delay
    const startTime = Date.now();
    const maxWait = Math.max(this.startupDelay, 5000); // At least 5s for npx

    while (!this.serverReady && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Additional small delay to ensure server is fully ready
    await new Promise(resolve => setTimeout(resolve, this.startupDelay));
  }

  /**
   * Initialize the MCP connection with the server.
   */
  async initialize(): Promise<MCPInitializeResult> {
    // Wait for server to be ready
    if (this.readyPromise) {
      await this.readyPromise;
      this.readyPromise = null;
    }

    const result = await this.sendRequest<MCPInitializeResult>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'inquest',
        version: '0.1.0',
      },
    });

    this.serverCapabilities = result.capabilities;

    // Send initialized notification
    this.sendNotification('notifications/initialized', {});

    return result;
  }

  /**
   * List all tools available on the server.
   */
  async listTools(): Promise<MCPTool[]> {
    const result = await this.sendRequest<MCPToolsListResult>('tools/list', {});
    return result.tools;
  }

  /**
   * List all prompts available on the server.
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    const result = await this.sendRequest<MCPPromptsListResult>('prompts/list', {});
    return result.prompts;
  }

  /**
   * Call a tool on the server.
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<MCPToolCallResult> {
    const done = startTiming(this.logger, `callTool:${name}`);
    try {
      const result = await this.sendRequest<MCPToolCallResult>('tools/call', {
        name,
        arguments: args,
      });
      done();
      return result;
    } catch (error) {
      done();
      throw error;
    }
  }

  /**
   * Get server capabilities.
   */
  getCapabilities(): MCPServerCapabilities | null {
    return this.serverCapabilities;
  }

  /**
   * Disconnect from the server.
   */
  async disconnect(): Promise<void> {
    if (this.process) {
      // Send graceful shutdown signal
      this.process.kill('SIGTERM');

      // Wait for process to exit or force kill after timeout
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.process?.kill('SIGKILL');
          resolve();
        }, 5000);

        this.process?.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    this.cleanup();
  }

  private sendRequest<T>(method: string, params: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.transport) {
        reject(new Error('Not connected to server'));
        return;
      }

      const id = ++this.requestId;
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timer,
      });

      this.log('Sending:', JSON.stringify(request));
      this.transport.send(request);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.transport) return;

    this.transport.send({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  private handleMessage(msg: JSONRPCMessage): void {
    // Check if it's a response to a pending request
    if ('id' in msg && msg.id !== undefined) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id);

        const response = msg as JSONRPCResponse;
        if (response.error) {
          pending.reject(new Error(
            `${response.error.message} (code: ${response.error.code})`
          ));
        } else {
          pending.resolve(response.result);
        }
      }
    }
    // Notifications from server are logged but not processed
  }

  private cleanup(): void {
    // Clear all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    this.transport?.close();
    this.transport = null;
    this.process = null;
    this.serverCapabilities = null;
  }
}
