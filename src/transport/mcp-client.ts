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
import type { TransportErrorRecord, TransportErrorCategory } from '../discovery/types.js';
import { getLogger, startTiming } from '../logging/logger.js';
import { TIMEOUTS, MCP, TRANSPORT_ERRORS } from '../constants.js';
import { VERSION } from '../version.js';

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

/**
 * Connection state for diagnostic error messages.
 * Tracks details about connection attempts and failures.
 */
interface ConnectionState {
  /** Whether a connection was attempted */
  attempted: boolean;
  /** Command used to start the server (stdio transport) */
  command?: string;
  /** Arguments passed to the server */
  args?: string[];
  /** URL for remote connections */
  url?: string;
  /** Error from spawn/connection attempt */
  spawnError?: Error;
  /** Exit code from server process */
  exitCode?: number;
  /** Captured stderr output (first 500 chars) */
  stderrOutput?: string;
  /** Whether server timed out during startup */
  startupTimeout?: boolean;
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
  /** Flag to prevent race condition during cleanup - ignore messages when true */
  private cleaningUp = false;
  /** Collected transport-level errors for reporting */
  private transportErrors: TransportErrorRecord[] = [];
  /** Connection state for diagnostic error messages */
  private connectionState: ConnectionState = { attempted: false };

  constructor(options?: MCPClientOptions) {
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    this.startupDelay = options?.startupDelay ?? DEFAULT_STARTUP_DELAY;
    this.debug = options?.debug ?? false;
    this.transportType = options?.transport ?? 'stdio';
    this.sseConfig = options?.sseConfig;
    this.httpConfig = options?.httpConfig;
  }

  /**
   * Classify a transport error based on its message.
   */
  private classifyTransportError(errorMessage: string): {
    category: TransportErrorCategory;
    likelyServerBug: boolean;
  } {
    const msg = errorMessage.toLowerCase();

    // Check for invalid JSON (likely server bug)
    for (const pattern of TRANSPORT_ERRORS.INVALID_JSON_PATTERNS) {
      if (pattern.test(msg)) {
        return { category: 'invalid_json', likelyServerBug: true };
      }
    }

    // Check for buffer overflow
    for (const pattern of TRANSPORT_ERRORS.BUFFER_OVERFLOW_PATTERNS) {
      if (pattern.test(msg)) {
        return { category: 'buffer_overflow', likelyServerBug: true };
      }
    }

    // Check for connection refused (environment issue)
    for (const pattern of TRANSPORT_ERRORS.CONNECTION_REFUSED_PATTERNS) {
      if (pattern.test(msg)) {
        return { category: 'connection_refused', likelyServerBug: false };
      }
    }

    // Check for connection lost
    for (const pattern of TRANSPORT_ERRORS.CONNECTION_LOST_PATTERNS) {
      if (pattern.test(msg)) {
        return { category: 'connection_lost', likelyServerBug: false };
      }
    }

    // Check for protocol violations (likely server bug)
    for (const pattern of TRANSPORT_ERRORS.PROTOCOL_VIOLATION_PATTERNS) {
      if (pattern.test(msg)) {
        return { category: 'protocol_violation', likelyServerBug: true };
      }
    }

    // Check for timeout
    for (const pattern of TRANSPORT_ERRORS.TIMEOUT_PATTERNS) {
      if (pattern.test(msg)) {
        return { category: 'timeout', likelyServerBug: false };
      }
    }

    // Check for shutdown errors
    for (const pattern of TRANSPORT_ERRORS.SHUTDOWN_PATTERNS) {
      if (pattern.test(msg)) {
        return { category: 'shutdown_error', likelyServerBug: false };
      }
    }

    // Check if it's likely a server bug using indicator patterns
    for (const pattern of TRANSPORT_ERRORS.SERVER_BUG_INDICATORS) {
      if (pattern.test(msg)) {
        return { category: 'unknown', likelyServerBug: true };
      }
    }

    return { category: 'unknown', likelyServerBug: false };
  }

  /**
   * Record a transport error for later reporting.
   */
  private recordTransportError(
    error: Error | string,
    operation?: string
  ): void {
    if (this.transportErrors.length >= TRANSPORT_ERRORS.MAX_ERRORS_TO_COLLECT) {
      return; // Prevent unbounded growth
    }

    const errorMessage = typeof error === 'string' ? error : error.message;
    const { category, likelyServerBug } = this.classifyTransportError(errorMessage);

    const record: TransportErrorRecord = {
      timestamp: new Date(),
      category,
      message: this.formatTransportErrorMessage(category, errorMessage),
      rawError: errorMessage,
      operation,
      likelyServerBug,
    };

    this.transportErrors.push(record);
    this.logger.debug({ record }, 'Transport error recorded');
  }

  /**
   * Format a user-friendly error message based on category.
   */
  private formatTransportErrorMessage(
    category: TransportErrorCategory,
    rawError: string
  ): string {
    switch (category) {
      case 'invalid_json':
        return 'Server output invalid JSON on stdout (possible logging interference)';
      case 'buffer_overflow':
        return 'Server response exceeded buffer limits';
      case 'connection_refused':
        return 'Failed to connect to server process';
      case 'connection_lost':
        return 'Connection to server was lost unexpectedly';
      case 'protocol_violation':
        return 'Server sent invalid MCP protocol message';
      case 'timeout':
        return 'Request timed out waiting for server response';
      case 'shutdown_error':
        return 'Error occurred during server shutdown';
      default:
        return rawError.length > 100 ? rawError.slice(0, 97) + '...' : rawError;
    }
  }

  /**
   * Get all collected transport errors.
   */
  getTransportErrors(): TransportErrorRecord[] {
    return [...this.transportErrors];
  }

  /**
   * Clear collected transport errors.
   */
  clearTransportErrors(): void {
    this.transportErrors = [];
  }

  /**
   * Check if a stderr message looks like a transport error worth recording.
   * Filters out normal debug/info output that servers commonly emit.
   */
  private looksLikeTransportError(msg: string): boolean {
    const lower = msg.toLowerCase();

    // Skip common informational messages
    if (
      lower.includes('listening') ||
      lower.includes('starting') ||
      lower.includes('connected') ||
      lower.includes('debug:') ||
      lower.includes('info:')
    ) {
      return false;
    }

    // Check for actual error patterns
    return (
      lower.includes('error') ||
      lower.includes('exception') ||
      lower.includes('failed') ||
      lower.includes('invalid') ||
      lower.includes('syntax') ||
      lower.includes('unexpected')
    );
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

    // Reset cleanup flag for new connection
    this.cleaningUp = false;

    // Track connection state for diagnostic error messages
    this.connectionState = {
      attempted: true,
      command,
      args,
    };

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
      this.recordTransportError(error, 'stdio_transport');
    });

    this.transport.on('close', () => {
      this.logger.debug('Transport closed');
      this.cleanup();
    });

    this.process.on('error', (error) => {
      this.logger.error({ error: error.message }, 'Process error');
      this.connectionState.spawnError = error;
      this.recordTransportError(error, 'process_spawn');
      this.cleanup();
    });

    this.process.on('exit', (code) => {
      this.connectionState.exitCode = code ?? undefined;
      if (code !== 0) {
        this.logger.warn({ exitCode: code }, 'Server process exited with non-zero code');
        this.recordTransportError(
          `Server process exited with code ${code}`,
          'process_exit'
        );
      }
      this.cleanup();
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        this.logger.debug({ stderr: msg }, 'Server stderr');
        // Capture stderr for diagnostic messages (limit to 500 chars)
        const currentStderr = this.connectionState.stderrOutput ?? '';
        if (currentStderr.length < 500) {
          this.connectionState.stderrOutput = (currentStderr + '\n' + msg).trim().slice(0, 500);
        }
        // Check if stderr contains error indicators that suggest transport issues
        if (this.looksLikeTransportError(msg)) {
          this.recordTransportError(msg, 'stderr');
        }
      }
    });

    this.readyPromise = this.waitForStartup();
    this.logger.debug('Startup delay complete, connection established');
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

    // Reset cleanup flag for new connection
    this.cleaningUp = false;

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
      this.recordTransportError(error, 'remote_transport');
    });

    this.transport.on('close', () => {
      this.logger.debug('Transport closed');
      this.cleanup();
    });
  }

  /**
   * Wait for minimum startup delay before sending requests.
   * The actual "ready" state is confirmed by successful initialization.
   * This delay allows the server process to fully start before we attempt communication.
   */
  private async waitForStartup(): Promise<void> {
    // Enforce minimum startup delay to allow server to fully start
    // npx-based servers often need significant time to download and start
    const delay = Math.max(this.startupDelay, TIMEOUTS.MIN_SERVER_STARTUP_WAIT);

    this.logger.debug({ delay }, 'Waiting for server startup');
    await new Promise(resolve => setTimeout(resolve, delay));

    // Mark server as ready (startup delay complete)
    // Note: This only means we can *try* to initialize - actual readiness
    // is confirmed by successful initialization response
    this.serverReady = true;
  }

  /**
   * Initialize the MCP connection with the server.
   * This is the explicit confirmation that the server is ready.
   * On failure, all pending requests are cleared.
   */
  async initialize(): Promise<MCPInitializeResult> {
    // Wait for startup delay to complete
    if (this.readyPromise) {
      await this.readyPromise;
      this.readyPromise = null;
    }

    try {
      const result = await this.sendRequest<MCPInitializeResult>('initialize', {
        protocolVersion: MCP.PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'bellwether',
          version: VERSION,
        },
      });

      this.serverCapabilities = result.capabilities;

      // Send initialized notification
      this.sendNotification('notifications/initialized', {});

      this.logger.info({ capabilities: result.capabilities }, 'MCP server initialized successfully');
      return result;
    } catch (error) {
      // Clear all pending requests on initialization failure
      // This prevents stale requests from hanging around
      this.clearPendingRequests(
        error instanceof Error ? error.message : 'Initialization failed'
      );

      // Re-throw the error for the caller to handle
      throw error;
    }
  }

  /**
   * Clear all pending requests with an error.
   * Used when initialization fails or connection is lost.
   */
  private clearPendingRequests(reason: string): void {
    const pendingCount = this.pendingRequests.size;
    if (pendingCount > 0) {
      this.logger.debug({ count: pendingCount, reason }, 'Clearing pending requests');
    }

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Request ${id} cancelled: ${reason}`));
    }
    this.pendingRequests.clear();
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
   * Check if the server is ready (startup delay complete and initialized).
   * Note: This only indicates if startup delay has passed - true readiness
   * is confirmed by successful initialization.
   */
  isServerReady(): boolean {
    return this.serverReady;
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
        reject(new Error(this.buildConnectionErrorMessage()));
        return;
      }

      const id = ++this.requestId;
      const request: JSONRPCRequest = {
        jsonrpc: MCP.JSONRPC_VERSION,
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
      jsonrpc: MCP.JSONRPC_VERSION,
      method,
      params,
    });
  }

  private handleMessage(msg: JSONRPCMessage): void {
    // Ignore messages during cleanup to prevent race conditions
    // This avoids double-rejecting promises or accessing cleared timers
    if (this.cleaningUp) {
      this.log('Ignoring message during cleanup:', JSON.stringify(msg));
      return;
    }

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

  /**
   * Build a detailed error message for connection failures.
   * Includes command, exit code, stderr output, and suggestions.
   */
  private buildConnectionErrorMessage(): string {
    const state = this.connectionState;
    const parts: string[] = ['Not connected to server'];

    if (!state.attempted) {
      parts.push('Connection was never attempted');
      return parts.join('\n  ');
    }

    // Include command info
    if (state.command) {
      const argsStr = state.args?.length ? ` ${state.args.join(' ')}` : '';
      parts.push(`Command: ${state.command}${argsStr}`);
    } else if (state.url) {
      parts.push(`URL: ${state.url}`);
    }

    // Check for spawn errors
    if (state.spawnError) {
      const errMsg = state.spawnError.message;
      if (errMsg.includes('ENOENT')) {
        parts.push(`Command not found: "${state.command}"`);
        parts.push('Tip: Ensure the command is installed and in your PATH');
      } else if (errMsg.includes('EACCES')) {
        parts.push('Permission denied');
        parts.push('Tip: Check file permissions or run with appropriate access');
      } else {
        parts.push(`Spawn error: ${errMsg}`);
      }
    }

    // Include exit code
    if (state.exitCode !== undefined && state.exitCode !== 0) {
      parts.push(`Server exited with code ${state.exitCode}`);
    }

    // Include stderr output
    if (state.stderrOutput) {
      const truncated = state.stderrOutput.length >= 500 ? '...' : '';
      parts.push(`Server stderr: ${state.stderrOutput}${truncated}`);

      // Detect common issues and suggest fixes
      const suggestion = this.suggestFix(state.stderrOutput);
      if (suggestion) {
        parts.push(`Tip: ${suggestion}`);
      }
    }

    // Check for startup timeout
    if (state.startupTimeout) {
      parts.push('Server did not respond within timeout period');
      parts.push('Tip: Increase server.timeout in bellwether.yaml');
    }

    return parts.join('\n  ');
  }

  /**
   * Suggest a fix based on stderr output patterns.
   */
  private suggestFix(stderrOutput: string): string | null {
    const lower = stderrOutput.toLowerCase();

    // Missing shebang (Node.js script run directly)
    if (lower.includes('syntax error') || lower.includes('unexpected token')) {
      return 'The server script may be missing a shebang (#!/usr/bin/env node)';
    }

    // NPX package not found
    if (lower.includes('not found') && lower.includes('npm')) {
      return 'The npm package may not exist or requires authentication';
    }

    // Module not found
    if (lower.includes('cannot find module') || lower.includes('module not found')) {
      return 'Missing dependency - try running npm install in the server directory';
    }

    // TypeScript errors
    if (lower.includes('ts-node') || lower.includes('typescript')) {
      return 'TypeScript compilation error - ensure ts-node is installed or compile first';
    }

    // Python errors
    if (lower.includes('modulenotfounderror') || lower.includes('no module named')) {
      return 'Missing Python module - try pip install or check virtual environment';
    }

    return null;
  }

  private cleanup(): void {
    if (this.cleaningUp) {
      return;
    }

    // Set cleanup flag to prevent race conditions with handleMessage
    // Any messages arriving after this point will be ignored
    this.cleaningUp = true;

    // Clear all pending requests with appropriate error
    this.clearPendingRequests('Connection closed');

    this.transport?.close();
    this.transport = null;
    this.process = null;
    this.serverCapabilities = null;
    this.serverReady = false;
  }
}
