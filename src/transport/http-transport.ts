import type { JSONRPCMessage, JSONRPCResponse } from './types.js';
import { BaseTransport, type BaseTransportConfig } from './base-transport.js';

/**
 * Configuration for HTTP Transport.
 */
export interface HTTPTransportConfig extends BaseTransportConfig {
  /** Base URL of the MCP server (e.g., https://api.example.com/mcp) */
  baseUrl: string;
  /** Optional session ID for authenticated connections */
  sessionId?: string;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * HTTPTransport connects to MCP servers over HTTP using POST requests.
 *
 * This transport is used for remote MCP servers that expose a simple
 * HTTP endpoint. Each request is sent as a POST and the response is
 * returned directly.
 *
 * This is a request-response pattern, unlike SSE which supports
 * server-initiated messages.
 *
 * Expected server endpoint:
 * - POST {baseUrl} - JSON-RPC endpoint
 */
export class HTTPTransport extends BaseTransport {
  private connected = false;
  private abortController: AbortController | null = null;
  private readonly baseUrl: string;
  private readonly sessionId?: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;

  constructor(config: HTTPTransportConfig) {
    super(config);
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.sessionId = config.sessionId;
    this.headers = config.headers ?? {};
    this.timeout = config.timeout ?? 30000;

    // Add session ID to headers if provided
    if (this.sessionId) {
      this.headers['X-Session-Id'] = this.sessionId;
    }
  }

  /**
   * Initialize the HTTP transport.
   * For HTTP, there's no persistent connection, so this just validates the URL.
   */
  async connect(): Promise<void> {
    this.log('Initializing HTTP transport for:', this.baseUrl);

    // Optionally, we could do a health check here
    // For now, just mark as connected
    this.connected = true;
  }

  /**
   * Send a JSON-RPC message to the server via HTTP POST.
   *
   * Unlike SSE transport, this method handles the response synchronously
   * and emits a 'message' event with the response.
   */
  send(message: JSONRPCMessage): void {
    if (!this.connected) {
      this.emit('error', new Error('Transport not connected'));
      return;
    }

    this.sendAsync(message).catch((error) => {
      this.emit('error', error);
    });
  }

  /**
   * Send a JSON-RPC message and wait for the response.
   */
  async sendAsync(message: JSONRPCMessage): Promise<JSONRPCResponse | null> {
    this.log('Sending message:', JSON.stringify(message));

    this.abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(message),
        signal: this.abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('content-type');

      // Handle streaming response (for streamable HTTP)
      if (contentType?.includes('text/event-stream')) {
        await this.handleStreamingResponse(response);
        return null;
      }

      // Handle JSON response
      if (contentType?.includes('application/json')) {
        const responseData = (await response.json()) as JSONRPCResponse;
        this.emit('message', responseData);
        return responseData;
      }

      // No content or unexpected content type
      return null;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Handle a streaming HTTP response (text/event-stream).
   */
  private async handleStreamingResponse(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();

          // Skip empty lines and comments
          if (!trimmedLine || trimmedLine.startsWith(':')) {
            continue;
          }

          // Parse SSE format: "data: {...}"
          if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.substring(5).trim();
            try {
              const message = JSON.parse(data) as JSONRPCMessage;
              this.emit('message', message);
            } catch {
              this.log('Failed to parse streaming message:', data);
            }
          } else {
            // Try to parse as direct JSON
            try {
              const message = JSON.parse(trimmedLine) as JSONRPCMessage;
              this.emit('message', message);
            } catch {
              // Not JSON, ignore
            }
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        try {
          const message = JSON.parse(buffer.trim()) as JSONRPCMessage;
          this.emit('message', message);
        } catch {
          // Ignore incomplete data
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Close the HTTP transport.
   */
  close(): void {
    this.log('Closing HTTP transport');
    this.connected = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.emit('close');
  }

  /**
   * Check if the transport is connected.
   */
  isConnected(): boolean {
    return this.connected;
  }
}
