import type { JSONRPCMessage } from './types.js';
import { BaseTransport, type BaseTransportConfig } from './base-transport.js';

// Type for event listener functions
type SSEEventListener = (event: Event) => void;

// Type for EventSource-like objects
interface EventSourceLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: SSEEventListener): void;
  close(): void;
  readyState: number;
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
  private eventSource: EventSourceLike | null = null;
  private abortController: AbortController | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private readonly baseUrl: string;
  private readonly sessionId?: string;
  private readonly headers: Record<string, string>;
  private readonly reconnectDelay: number;
  private readonly maxReconnectAttempts: number;
  private readonly timeout: number;
  private messageEndpoint: string | null = null;

  constructor(config: SSETransportConfig) {
    super(config);
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.sessionId = config.sessionId;
    this.headers = config.headers ?? {};
    this.reconnectDelay = config.reconnectDelay ?? 1000;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
    this.timeout = config.timeout ?? 30000;

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

    // Check if EventSource is available (browser or Node.js 18+)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const EventSourceImpl = (globalThis as any).EventSource as (new (url: string) => EventSourceLike) | undefined;
    if (!EventSourceImpl) {
      throw new Error(
        'EventSource is not available. ' +
        'SSE transport requires Node.js 18+ or a browser environment. ' +
        'For older Node.js versions, consider using streamable-http transport instead.'
      );
    }

    return new Promise((resolve, reject) => {
      const sseUrl = `${this.baseUrl}/sse`;
      this.log('Connecting to SSE endpoint:', sseUrl);

      try {
        // Create EventSource - headers need to be passed via URL params or custom implementation
        // Note: Standard EventSource doesn't support custom headers
        // For authenticated endpoints, session ID should be passed via URL param
        let url = sseUrl;
        if (this.sessionId) {
          const separator = url.includes('?') ? '&' : '?';
          url = `${url}${separator}sessionId=${encodeURIComponent(this.sessionId)}`;
        }

        this.eventSource = new EventSourceImpl(url);

        this.eventSource.onopen = () => {
          this.log('SSE connection opened');
          this.connected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.eventSource.onmessage = (event: MessageEvent) => {
          this.handleSSEMessage(event);
        };

        // Handle specific event types from MCP SSE protocol
        this.eventSource.addEventListener('endpoint', (event: Event) => {
          // Server tells us where to send messages
          const messageEvent = event as MessageEvent;
          this.messageEndpoint = messageEvent.data;
          this.log('Received message endpoint:', this.messageEndpoint);
        });

        this.eventSource.addEventListener('message', (event: Event) => {
          this.handleSSEMessage(event as MessageEvent);
        });

        this.eventSource.onerror = (error: Event) => {
          this.log('SSE error:', error);

          if (!this.connected) {
            // Connection failed on initial connect
            reject(new Error('Failed to connect to SSE endpoint'));
            return;
          }

          // Handle reconnection for established connections
          this.handleReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle an incoming SSE message.
   */
  private handleSSEMessage(event: MessageEvent): void {
    try {
      const data = event.data;

      // Skip empty messages or heartbeats
      if (!data || data === ':') {
        return;
      }

      this.log('Received SSE message:', data);
      const message = JSON.parse(data) as JSONRPCMessage;
      this.emit('message', message);
    } catch (error) {
      this.log('Failed to parse SSE message:', error);
      // Don't emit error for parse failures - just log
    }
  }

  /**
   * Handle reconnection after a connection error.
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('Max reconnect attempts reached');
      this.connected = false;
      this.emit('error', new Error('Max reconnection attempts exceeded'));
      this.emit('close');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        this.handleReconnect();
      }
    }, delay);
  }

  /**
   * Send a JSON-RPC message to the server via HTTP POST.
   */
  send(message: JSONRPCMessage): void {
    if (!this.connected) {
      this.emit('error', new Error('Transport not connected'));
      return;
    }

    // Use the endpoint provided by the server, or default to /message
    const endpoint = this.messageEndpoint || `${this.baseUrl}/message`;

    this.log('Sending message to:', endpoint, JSON.stringify(message));

    // Create a new abort controller for this request
    this.abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.timeout);

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(message),
      signal: this.abortController.signal,
    })
      .then(async (response) => {
        clearTimeout(timeoutId);

        if (!response.ok) {
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
   */
  close(): void {
    this.log('Closing SSE transport');
    this.connected = false;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.messageEndpoint = null;
    this.emit('close');
  }

  /**
   * Check if the transport is connected.
   */
  isConnected(): boolean {
    return this.connected;
  }
}
