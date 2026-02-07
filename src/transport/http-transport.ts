import type { JSONRPCMessage, JSONRPCResponse } from './types.js';
import { BaseTransport, type BaseTransportConfig } from './base-transport.js';
import { TIMEOUTS, DISPLAY_LIMITS, MCP } from '../constants.js';

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
  private sessionId?: string;
  private readonly customHeaders: Record<string, string>;
  private readonly timeout: number;
  /** Protocol version negotiated with the server (set after initialization) */
  private negotiatedVersion?: string;

  constructor(config: HTTPTransportConfig) {
    super(config);
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.sessionId = config.sessionId;
    this.customHeaders = config.headers ?? {};
    this.timeout = config.timeout ?? TIMEOUTS.DEFAULT;
  }

  /**
   * Build request headers, including session ID and protocol version.
   * Per MCP 2025-11-25 streamable-http spec:
   * - MCP-Protocol-Version must be included on all requests after initialization
   * - Mcp-Session-Id must be included if we have one from initialization
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // MCP streamable-http spec requires accepting both JSON and SSE
      Accept: 'application/json, text/event-stream',
      // MCP spec: Include protocol version on all HTTP requests
      'MCP-Protocol-Version': this.negotiatedVersion ?? MCP.PROTOCOL_VERSION,
      ...this.customHeaders,
    };

    // Add session ID if we have one (per MCP streamable-http spec)
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    return headers;
  }

  /**
   * Initialize the HTTP transport.
   * For HTTP, there's no persistent connection, so this just validates the URL.
   */
  async connect(): Promise<void> {
    this.log('Initializing HTTP transport', { baseUrl: this.baseUrl });

    // Optionally, we could do a health check here
    // For now, just mark as connected
    this.connected = true;
  }

  /**
   * Set the negotiated protocol version to use in subsequent request headers.
   * Called by MCPClient after successful initialization.
   */
  setNegotiatedVersion(version: string): void {
    this.negotiatedVersion = version;
  }

  /**
   * Send a JSON-RPC message to the server via HTTP POST.
   *
   * Unlike SSE transport, this method handles the response synchronously
   * and emits a 'message' event with the response.
   */
  send(message: JSONRPCMessage, signal?: AbortSignal): void {
    if (!this.connected) {
      this.emit('error', new Error('Transport not connected'));
      return;
    }

    this.sendAsync(message, signal).catch((error) => {
      this.emit('error', error);
    });
  }

  /**
   * Send a JSON-RPC message and wait for the response.
   */
  async sendAsync(message: JSONRPCMessage, signal?: AbortSignal): Promise<JSONRPCResponse | null> {
    this.log('Sending message', { message });

    this.abortController = new AbortController();
    const controller = this.abortController;
    let abortListener: (() => void) | undefined;

    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        abortListener = () => controller.abort();
        signal.addEventListener('abort', abortListener, { once: true });
      }
    }

    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // MCP 2025-11-25: 404 means session expired, clear session ID
        if (response.status === 404 && this.sessionId) {
          this.log('Session expired (404), clearing session ID');
          this.sessionId = undefined;
        }
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Capture session ID from response (per MCP streamable-http spec)
      const responseSessionId = response.headers.get('Mcp-Session-Id');
      if (responseSessionId && !this.sessionId) {
        this.log('Captured session ID from server', { sessionId: responseSessionId });
        this.sessionId = responseSessionId;
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
    } finally {
      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
    }
  }

  /**
   * Handle a streaming HTTP response (text/event-stream).
   * Includes timeout handling to prevent indefinite hangs.
   */
  private async handleStreamingResponse(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let readerLocked = true;

    /**
     * Read with timeout to prevent indefinite hangs.
     * Returns the read result or throws on timeout.
     */
    const readWithTimeout = async (): Promise<{ value?: Uint8Array; done: boolean }> => {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Streaming read timeout'));
        }, this.timeout);

        reader.read().then(
          (result) => {
            clearTimeout(timeoutId);
            resolve(result);
          },
          (error) => {
            clearTimeout(timeoutId);
            reject(error);
          }
        );
      });
    };

    try {
      let done = false;
      while (!done) {
        // Use timeout-wrapped read to prevent indefinite blocking
        const result = await readWithTimeout();
        done = result.done;

        if (done) {
          break;
        }

        const value = result.value;

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
            } catch (error) {
              // Log streaming parse errors for visibility
              const preview =
                data.length > DISPLAY_LIMITS.TRANSPORT_DATA_PREVIEW
                  ? `${data.substring(0, DISPLAY_LIMITS.TRANSPORT_DATA_PREVIEW)}...`
                  : data;
              this.logger.warn(
                { preview, error: error instanceof Error ? error.message : String(error) },
                'Failed to parse SSE message'
              );
            }
          } else {
            // Try to parse as direct JSON
            try {
              const message = JSON.parse(trimmedLine) as JSONRPCMessage;
              this.emit('message', message);
            } catch {
              // Not JSON - this is common for non-JSON lines in streams, log only in debug
              this.log('Skipping non-JSON line', {
                preview: trimmedLine.substring(0, DISPLAY_LIMITS.RESPONSE_DATA_PREVIEW),
              });
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
    } catch (error) {
      // On timeout or other errors, cancel the reader to release the lock
      if (readerLocked) {
        try {
          await reader.cancel();
        } catch {
          // Ignore cancel errors - reader may already be closed
        }
      }
      throw error;
    } finally {
      // Release the lock if still held
      if (readerLocked) {
        try {
          reader.releaseLock();
          readerLocked = false;
        } catch {
          // Ignore releaseLock errors - lock may already be released by cancel
        }
      }
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
