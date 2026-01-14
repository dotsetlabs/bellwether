import { spawn, type ChildProcess } from 'child_process';
import { StdioTransport } from './stdio-transport.js';
import { SSETransport, type SSETransportConfig } from './sse-transport.js';
import { HTTPTransport, type HTTPTransportConfig } from './http-transport.js';
import { type BaseTransport, type TransportType } from './base-transport.js';
import type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeResult,
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPToolCallResult,
  MCPToolsListResult,
  MCPPromptsListResult,
  MCPResourcesListResult,
  MCPResourceReadResult,
  MCPPromptGetResult,
  MCPServerCapabilities,
} from './types.js';
import { getLogger, startTiming } from '../logging/logger.js';
import { TIMEOUTS } from '../constants.js';

/**
 * Environment variables to filter out when spawning MCP server processes.
 * These may contain sensitive credentials that should not be exposed.
 */
const FILTERED_ENV_VARS = new Set([
  // LLM API keys
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'COHERE_API_KEY',
  'HUGGINGFACE_API_KEY',
  'REPLICATE_API_TOKEN',
  // Bellwether-specific
  'BELLWETHER_SESSION',
  // Cloud provider credentials
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_CLIENT_SECRET',
  'GOOGLE_APPLICATION_CREDENTIALS',
  // SCM/CI tokens
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITLAB_TOKEN',
  'BITBUCKET_TOKEN',
  'NPM_TOKEN',
  'PYPI_TOKEN',
  // Database credentials
  'DATABASE_URL',
  'DATABASE_PASSWORD',
  'POSTGRES_PASSWORD',
  'MYSQL_PASSWORD',
  'REDIS_PASSWORD',
  'MONGODB_URI',
  // Application secrets
  'COOKIE_SECRET',
  'SESSION_SECRET',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'PRIVATE_KEY',
]);

/**
 * Patterns for environment variable names that should be filtered.
 * Matches common naming conventions for secrets.
 */
const FILTERED_ENV_PATTERNS = [
  /_API_KEY$/i,
  /_SECRET$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /_PRIVATE_KEY$/i,
  /_CREDENTIALS$/i,
  /^SECRET_/i,
  /^PRIVATE_/i,
];

export interface MCPClientOptions {
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Environment variables for the server process */
  env?: Record<string, string>;
  /** Delay before sending first request to allow server startup (default: 500ms) */
  startupDelay?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Transport type to use (default: stdio) */
  transport?: TransportType;
  /** Configuration for SSE transport */
  sseConfig?: Omit<SSETransportConfig, 'debug'>;
  /** Configuration for HTTP transport */
  httpConfig?: Omit<HTTPTransportConfig, 'debug'>;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT = TIMEOUTS.DEFAULT;
const DEFAULT_STARTUP_DELAY = TIMEOUTS.SERVER_STARTUP;

/**
 * MCPClient connects to an MCP server via various transports and provides
 * methods to interact with the server's capabilities.
 *
 * Supported transports:
 * - stdio: Local subprocess communication (default)
 * - sse: Server-Sent Events for remote servers
 * - streamable-http: HTTP POST with streaming responses
 */
export class MCPClient {
  private process: ChildProcess | null = null;
  private transport: BaseTransport | null = null;
  private requestId = 0;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private serverCapabilities: MCPServerCapabilities | null = null;
  private timeout: number;
  private startupDelay: number;
  private serverReady = false;
  private readyPromise: Promise<void> | null = null;
  private debug: boolean;
  private transportType: TransportType;
  private sseConfig?: Omit<SSETransportConfig, 'debug'>;
  private httpConfig?: Omit<HTTPTransportConfig, 'debug'>;
  private logger = getLogger('mcp-client');

  constructor(options?: MCPClientOptions) {
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    this.startupDelay = options?.startupDelay ?? DEFAULT_STARTUP_DELAY;
    this.debug = options?.debug ?? false;
    this.transportType = options?.transport ?? 'stdio';
    this.sseConfig = options?.sseConfig;
    this.httpConfig = options?.httpConfig;
  }

  /**
   * Get the current transport type.
   */
  getTransportType(): TransportType {
    return this.transportType;
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      this.logger.debug({ args }, 'MCP Debug');
    }
  }

  /**
   * Check if an environment variable name looks like a secret.
   */
  private isSensitiveEnvVar(name: string): boolean {
    // Check explicit list
    if (FILTERED_ENV_VARS.has(name)) {
      return true;
    }

    // Check patterns
    return FILTERED_ENV_PATTERNS.some(pattern => pattern.test(name));
  }

  /**
   * Filter sensitive environment variables before passing to subprocess.
   * Uses both explicit list and pattern matching to catch common secret naming conventions.
   */
  private filterEnv(baseEnv: NodeJS.ProcessEnv, additionalEnv?: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};

    // Copy process.env, filtering out sensitive variables
    for (const [key, value] of Object.entries(baseEnv)) {
      if (value !== undefined && !this.isSensitiveEnvVar(key)) {
        filtered[key] = value;
      }
    }

    // Add additional env vars (these are explicitly provided, so allow them)
    if (additionalEnv) {
      Object.assign(filtered, additionalEnv);
    }

    return filtered;
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

    // Filter out sensitive environment variables before spawning subprocess
    const filteredEnv = this.filterEnv(process.env, env);

    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: filteredEnv,
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
   * Connect to a remote MCP server via SSE or HTTP.
   *
   * @param url - The base URL of the MCP server
   * @param options - Optional configuration overrides
   */
  async connectRemote(
    url: string,
    options?: {
      transport?: 'sse' | 'streamable-http';
      sessionId?: string;
      headers?: Record<string, string>;
    }
  ): Promise<void> {
    const transport = options?.transport ?? (this.transportType === 'stdio' ? 'sse' : this.transportType as 'sse' | 'streamable-http');
    this.transportType = transport;

    this.logger.info({ url, transport }, 'Connecting to remote MCP server');

    if (transport === 'sse') {
      const sseTransport = new SSETransport({
        baseUrl: url,
        sessionId: options?.sessionId ?? this.sseConfig?.sessionId,
        headers: options?.headers ?? this.sseConfig?.headers,
        timeout: this.timeout,
        debug: this.debug,
        ...this.sseConfig,
      });

      await sseTransport.connect();
      this.transport = sseTransport;
    } else if (transport === 'streamable-http') {
      const httpTransport = new HTTPTransport({
        baseUrl: url,
        sessionId: options?.sessionId ?? this.httpConfig?.sessionId,
        headers: options?.headers ?? this.httpConfig?.headers,
        timeout: this.timeout,
        debug: this.debug,
        ...this.httpConfig,
      });

      await httpTransport.connect();
      this.transport = httpTransport;
    } else {
      throw new Error(`Unsupported transport type: ${transport}`);
    }

    this.setupTransportHandlers();

    // For remote transports, server is ready immediately
    this.serverReady = true;
  }

  /**
   * Set up event handlers for the transport.
   */
  private setupTransportHandlers(): void {
    if (!this.transport) return;

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
  }

  /**
   * Wait for the server to be ready before sending requests.
   */
  private async waitForReady(): Promise<void> {
    // Wait for either stderr output or the startup delay
    const startTime = Date.now();
    const maxWait = Math.max(this.startupDelay, TIMEOUTS.MIN_SERVER_STARTUP_WAIT); // At least 5s for npx

    while (!this.serverReady && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.SERVER_READY_POLL));
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
        name: 'bellwether',
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
   * List all resources available on the server.
   */
  async listResources(): Promise<MCPResource[]> {
    const result = await this.sendRequest<MCPResourcesListResult>('resources/list', {});
    return result.resources;
  }

  /**
   * Read a resource from the server by URI.
   */
  async readResource(uri: string): Promise<MCPResourceReadResult> {
    const done = startTiming(this.logger, `readResource:${uri}`);
    try {
      const result = await this.sendRequest<MCPResourceReadResult>('resources/read', {
        uri,
      });
      done();
      return result;
    } catch (error) {
      done();
      throw error;
    }
  }

  /**
   * Get a prompt from the server with the given arguments.
   */
  async getPrompt(name: string, args: Record<string, string> = {}): Promise<MCPPromptGetResult> {
    const done = startTiming(this.logger, `getPrompt:${name}`);
    try {
      const result = await this.sendRequest<MCPPromptGetResult>('prompts/get', {
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
        }, TIMEOUTS.SHUTDOWN_KILL);

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
