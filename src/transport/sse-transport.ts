import type { JSONRPCMessage } from './types.js';
import { BaseTransport, type BaseTransportConfig } from './base-transport.js';
import { TIME_CONSTANTS, TIMEOUTS } from '../constants.js';
import { isLocalhost } from '../utils/index.js';
import { createServerAuthError } from './auth-errors.js';

/**
 * Validate that a URL uses HTTPS in production contexts.
 * Allows HTTP only for localhost/127.0.0.1 for local development.
 */
function validateSecureUrl(url: string): void {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:' && !isLocalhost(parsed.hostname)) {
      throw new Error(
        `SSE transport requires HTTPS for remote servers. ` +
          `Got: ${parsed.protocol}//. Use HTTPS to protect session tokens in transit.`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('SSE transport')) {
      throw error;
    }
    throw new Error(`Invalid SSE URL: ${url}`);
  }
}

interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Configuration for SSE Transport.
 */
export interface SSETransportConfig extends BaseTransportConfig {
  /** Base URL of the MCP server (e.g., https://api.example.com/mcp) */
  baseUrl: string;
  /** Optional session ID for authenticated connections */
  sessionId?: string;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
  /** Reconnect delay in milliseconds (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnect attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Minimal SSE parser for streaming responses.
 */
class SSEParser {
  private buffer = '';
  private eventName = 'message';
  private dataLines: string[] = [];

  feed(chunk: string): SSEEvent[] {
    const events: SSEEvent[] = [];
    this.buffer += chunk;

    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const rawLine = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const line = rawLine.replace(/\r$/, '');

      // Empty line signals end of event
      if (line === '') {
        if (this.dataLines.length > 0) {
          events.push({
            event: this.eventName || 'message',
            data: this.dataLines.join('\n'),
          });
        }
        this.eventName = 'message';
        this.dataLines = [];
        newlineIndex = this.buffer.indexOf('\n');
        continue;
      }

      // Comment/heartbeat
      if (line.startsWith(':')) {
        newlineIndex = this.buffer.indexOf('\n');
        continue;
      }

      if (line.startsWith('event:')) {
        this.eventName = line.slice('event:'.length).trim() || 'message';
      } else if (line.startsWith('data:')) {
        this.dataLines.push(line.slice('data:'.length).trimStart());
      }

      newlineIndex = this.buffer.indexOf('\n');
    }

    return events;
  }

  flush(): SSEEvent[] {
    const events: SSEEvent[] = [];

    if (this.buffer.length > 0) {
      const line = this.buffer.replace(/\r$/, '');
      this.buffer = '';

      if (line.startsWith(':')) {
        // Ignore comments
      } else if (line.startsWith('event:')) {
        this.eventName = line.slice('event:'.length).trim() || 'message';
      } else if (line.startsWith('data:')) {
        this.dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    if (this.dataLines.length > 0) {
      events.push({
        event: this.eventName || 'message',
        data: this.dataLines.join('\n'),
      });
      this.eventName = 'message';
      this.dataLines = [];
    }

    return events;
  }
}

/**
 * SSETransport connects to MCP servers over HTTP using Server-Sent Events.
 *
 * This transport is used for remote MCP servers that expose an SSE endpoint.
 * Messages from the server are received via SSE, while requests are sent
 * via HTTP POST.
 *
 * Expected server endpoints:
 * - GET  {baseUrl}/sse     - SSE endpoint for receiving messages
 * - POST {baseUrl}/message - Endpoint for sending messages
 */
export class SSETransport extends BaseTransport {
  private streamAbortController: AbortController | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private readonly baseUrl: string;
  private readonly sessionId?: string;
  private readonly headers: Record<string, string>;
  private readonly reconnectDelay: number;
  private readonly maxReconnectAttempts: number;
  private readonly timeout: number;
  private messageEndpoint: string | null = null;
  /** Timer ID for reconnection delay - allows cancellation */
  private reconnectTimer: NodeJS.Timeout | null = null;
  /** Flag to prevent reconnection after close() is called */
  private isClosing = false;
  /** Maximum backoff delay in milliseconds */
  private readonly maxBackoffDelay = TIME_CONSTANTS.SSE_MAX_BACKOFF;

  constructor(config: SSETransportConfig) {
    super(config);
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.sessionId = config.sessionId;
    this.headers = config.headers ?? {};
    this.reconnectDelay = config.reconnectDelay ?? TIME_CONSTANTS.SSE_RECONNECT_DELAY;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
    this.timeout = config.timeout ?? TIMEOUTS.DEFAULT;

    // Add session ID to headers if provided
    if (this.sessionId) {
      this.headers['X-Session-Id'] = this.sessionId;
    }
  }

  /**
   * Connect to the SSE endpoint.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    // SECURITY: Validate URL uses HTTPS for remote servers
    // This protects session tokens that may be passed via URL parameters
    validateSecureUrl(this.baseUrl);

    // Reset closing flag on fresh connection
    this.isClosing = false;

    const sseUrl = `${this.baseUrl}/sse`;
    this.log('Connecting to SSE endpoint', { url: sseUrl });

    // Build URL with sessionId as query param for compatibility
    let url = sseUrl;
    if (this.sessionId) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}sessionId=${encodeURIComponent(this.sessionId)}`;
    }

    this.streamAbortController = new AbortController();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...this.headers,
      },
      signal: this.streamAbortController.signal,
    });

    if (!response.ok) {
      const authError = createServerAuthError(response.status, {
        unauthorizedMessage: 'Remote MCP SSE authentication failed (401 Unauthorized)',
        forbiddenMessage: 'Remote MCP SSE authorization failed (403 Forbidden)',
      });
      if (authError) {
        throw authError;
      }
      throw new Error(`Failed to connect to SSE endpoint: HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('SSE response body is empty');
    }

    this.connected = true;
    this.reconnectAttempts = 0;

    // Start streaming in background
    this.readSSEStream(response).catch((error) => {
      this.log('SSE stream error', { error: String(error) });
      if (!this.isClosing) {
        this.handleReconnect();
      }
    });
  }

  /**
   * Handle an incoming SSE message.
   */
  private handleSSEMessage(event: SSEEvent): void {
    try {
      const data = event.data;

      // Skip empty messages or heartbeats
      if (!data || data === ':') {
        return;
      }

      if (event.event === 'endpoint') {
        this.messageEndpoint = data;
        this.log('Received message endpoint', { endpoint: this.messageEndpoint ?? '' });
        return;
      }

      this.log('Received SSE message', { data });
      const message = JSON.parse(data) as JSONRPCMessage;
      this.emit('message', message);
    } catch (error) {
      this.log('Failed to parse SSE message', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't emit error for parse failures - just log
    }
  }

  /**
   * Stream and parse SSE events from a fetch response.
   */
  private async readSSEStream(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('SSE stream reader unavailable');
    }

    const decoder = new TextDecoder();
    const parser = new SSEParser();

    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      const chunk = decoder.decode(value, { stream: true });
      const events = parser.feed(chunk);
      for (const event of events) {
        this.handleSSEMessage(event);
      }
    }

    const tail = decoder.decode();
    if (tail) {
      const tailEvents = parser.feed(tail);
      for (const event of tailEvents) {
        this.handleSSEMessage(event);
      }
    }

    const flushed = parser.flush();
    for (const event of flushed) {
      this.handleSSEMessage(event);
    }

    // Stream ended
    this.connected = false;
    if (!this.isClosing) {
      this.handleReconnect();
    }
  }

  /**
   * Handle reconnection after a connection error.
   *
   * RELIABILITY IMPROVEMENTS:
   * - Prevents unbounded recursion with max attempts check
   * - Uses capped exponential backoff
   * - Clears reconnect timer on close
   * - Checks isClosing flag to prevent reconnection after close()
   * - Explicitly aborts SSE stream on max attempts
   */
  private handleReconnect(): void {
    // Don't reconnect if we're closing
    if (this.isClosing) {
      this.log('Reconnection skipped - transport is closing');
      return;
    }

    // Check max attempts BEFORE incrementing
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('Max reconnect attempts reached', { attempts: this.reconnectAttempts });
      this.connected = false;

      // Explicitly abort the SSE stream to clean up resources
      if (this.streamAbortController) {
        try {
          this.streamAbortController.abort();
        } catch {
          // Ignore abort errors
        }
        this.streamAbortController = null;
      }

      this.emit(
        'error',
        new Error(`Max reconnection attempts (${this.maxReconnectAttempts}) exceeded`)
      );
      this.emit('close');
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff with cap
    const exponentialDelay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    const delay = Math.min(exponentialDelay, this.maxBackoffDelay);

    this.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Store the timer so it can be cancelled by close()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      // Double-check we're not closing before attempting reconnect
      if (this.isClosing) {
        return;
      }

      // Non-recursive approach: use .then/.catch instead of async/await in setTimeout
      this.connect()
        .then(() => {
          this.log('Reconnection successful');
        })
        .catch((error: Error) => {
          this.log('Reconnection failed', { error: error.message });
          // Schedule next attempt (not recursive - just schedules another timer)
          this.handleReconnect();
        });
    }, delay);
  }

  /**
   * Send a JSON-RPC message to the server via HTTP POST.
   */
  send(message: JSONRPCMessage, _signal?: AbortSignal): void {
    if (!this.connected) {
      this.emit('error', new Error('Transport not connected'));
      return;
    }

    // Use the endpoint provided by the server, or default to /message
    const endpoint = this.messageEndpoint || `${this.baseUrl}/message`;

    this.log('Sending message', { endpoint, message });

    // Create a local abort controller for this request to avoid overwriting
    // the instance controller and leaking previous controllers
    const requestController = new AbortController();

    const timeoutId = setTimeout(() => {
      requestController.abort();
    }, this.timeout);

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(message),
      signal: requestController.signal,
    })
      .then(async (response) => {
        clearTimeout(timeoutId);

        if (!response.ok) {
          const authError = createServerAuthError(response.status, {
            unauthorizedMessage: 'Remote MCP message authentication failed (401 Unauthorized)',
            forbiddenMessage: 'Remote MCP message authorization failed (403 Forbidden)',
          });
          if (authError) {
            throw authError;
          }
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Some servers may return a response directly (for request/response pattern)
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const responseData = await response.json();
          if (responseData && typeof responseData === 'object') {
            this.emit('message', responseData as JSONRPCMessage);
          }
        }
      })
      .catch((error: Error) => {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          this.emit('error', new Error('Request timeout'));
        } else {
          this.emit('error', error);
        }
      });
  }

  /**
   * Close the SSE connection.
   *
   * RELIABILITY: Properly cleans up all resources including:
   * - SSE stream connection
   * - Pending HTTP requests (via abort controller)
   * - Reconnection timer
   * - Sets isClosing flag to prevent reconnection attempts
   */
  close(): void {
    this.log('Closing SSE transport');

    // Set closing flag FIRST to prevent any reconnection attempts
    this.isClosing = true;
    this.connected = false;

    // Cancel any pending reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Abort SSE stream
    if (this.streamAbortController) {
      try {
        this.streamAbortController.abort();
      } catch {
        // Ignore abort errors
      }
      this.streamAbortController = null;
    }

    this.messageEndpoint = null;
    this.reconnectAttempts = 0;
    this.emit('close');
  }

  /**
   * Check if the transport is connected.
   */
  isConnected(): boolean {
    return this.connected;
  }
}
