import type { Readable, Writable } from 'stream';
import type { JSONRPCMessage } from './types.js';
import { BaseTransport, type BaseTransportConfig } from './base-transport.js';

/**
 * Configuration for StdioTransport.
 */
export interface StdioTransportConfig extends BaseTransportConfig {
  /** Maximum message size in bytes (default: 10MB) */
  maxMessageSize?: number;
  /** Maximum buffer size in bytes (default: 20MB) */
  maxBufferSize?: number;
  /** Maximum header size in bytes (default: 8KB) */
  maxHeaderSize?: number;
  /** Use newline-delimited JSON instead of Content-Length framing */
  useNewlineDelimited?: boolean;
}


const DEFAULT_MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_BUFFER_SIZE = 20 * 1024 * 1024;  // 20MB
const DEFAULT_MAX_HEADER_SIZE = 8 * 1024;           // 8KB

/**
 * StdioTransport handles JSON-RPC message framing over stdio streams.
 * Uses Content-Length header protocol for message boundaries.
 *
 * Adapted from Overwatch's MCPTransport for client-side usage.
 */
export class StdioTransport extends BaseTransport {
  private buffer = '';
  private contentLength: number | null = null;
  private readonly maxMessageSize: number;
  private readonly maxBufferSize: number;
  private readonly maxHeaderSize: number;
  private readonly useNewlineDelimited: boolean;
  private connected = true;

  constructor(
    private input: Readable,
    private output: Writable,
    config?: StdioTransportConfig
  ) {
    super(config);
    this.maxMessageSize = config?.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
    this.maxBufferSize = config?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
    this.maxHeaderSize = config?.maxHeaderSize ?? DEFAULT_MAX_HEADER_SIZE;
    this.useNewlineDelimited = config?.useNewlineDelimited ?? true; // Default to newline-delimited
    this.setupInputHandler();
  }

  /**
   * Check if the transport is connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  private setupInputHandler(): void {
    this.input.on('data', (chunk: Buffer) => {
      if (this.debug) {
        this.logger.debug({ preview: chunk.toString('utf-8').substring(0, 500) }, 'Raw input received');
      }
      const newSize = this.buffer.length + chunk.length;
      if (newSize > this.maxBufferSize) {
        this.emit('error', new Error(
          `Buffer size limit exceeded: ${newSize} > ${this.maxBufferSize} bytes.`
        ));
        this.buffer = '';
        this.contentLength = null;
        return;
      }

      this.buffer += chunk.toString('utf-8');
      this.processBuffer();
    });

    this.input.on('end', () => {
      this.emit('close');
    });

    this.input.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private processBuffer(): void {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.contentLength === null) {
        // First, try to find Content-Length header
        const headerEnd = this.buffer.indexOf('\r\n\r\n');

        // If no header found, try newline-delimited JSON
        if (headerEnd === -1) {
          // Check if we have a complete line (newline-delimited JSON)
          const newlineIndex = this.buffer.indexOf('\n');
          if (newlineIndex === -1) {
            // No complete message yet
            if (this.buffer.length > this.maxHeaderSize) {
              this.emit('error', new Error(
                `Buffer size limit exceeded without finding message boundary`
              ));
              this.buffer = '';
            }
            return;
          }

          // Process newline-delimited JSON
          const line = this.buffer.substring(0, newlineIndex).trim();
          this.buffer = this.buffer.substring(newlineIndex + 1);

          if (line.length > this.maxMessageSize) {
            this.emit('error', new Error(
              `Message size limit exceeded: ${line.length} > ${this.maxMessageSize} bytes.`
            ));
            continue;
          }

          if (line) {
            try {
              const message = JSON.parse(line) as JSONRPCMessage;
              this.emit('message', message);
            } catch (error) {
              // Invalid JSON - log at warn level for visibility
              // This helps diagnose issues with malformed server responses
              const preview = line.length > 100 ? line.substring(0, 100) + '...' : line;
              this.logger.warn({ preview, error: error instanceof Error ? error.message : String(error) }, 'Skipping invalid JSON message');
            }
          }
          continue;
        }

        const header = this.buffer.substring(0, headerEnd);
        const match = header.match(/Content-Length: (\d+)/i);
        if (!match) {
          // Header found but no Content-Length, try as newline-delimited
          const newlineIndex = this.buffer.indexOf('\n');
          if (newlineIndex === -1) return;

          const line = this.buffer.substring(0, newlineIndex).trim();
          this.buffer = this.buffer.substring(newlineIndex + 1);

          if (line.length > this.maxMessageSize) {
            this.emit('error', new Error(
              `Message size limit exceeded: ${line.length} > ${this.maxMessageSize} bytes.`
            ));
            continue;
          }

          if (line) {
            try {
              const message = JSON.parse(line) as JSONRPCMessage;
              this.emit('message', message);
            } catch (error) {
              // Invalid JSON - log at warn level for visibility
              // This helps diagnose issues with malformed server responses
              const preview = line.length > 100 ? line.substring(0, 100) + '...' : line;
              this.logger.warn({ preview, error: error instanceof Error ? error.message : String(error) }, 'Skipping invalid JSON message');
            }
          }
          continue;
        }

        const contentLength = parseInt(match[1], 10);
        if (!Number.isFinite(contentLength) || contentLength < 0) {
          this.emit('error', new Error(
            `Invalid Content-Length: ${match[1]}. Must be a positive integer.`
          ));
          this.buffer = this.buffer.substring(headerEnd + 4);
          continue;
        }

        if (contentLength > this.maxMessageSize) {
          this.emit('error', new Error(
            `Content-Length ${contentLength} exceeds maximum allowed size of ${this.maxMessageSize} bytes.`
          ));
          this.buffer = this.buffer.substring(headerEnd + 4);
          if (this.buffer.length >= contentLength) {
            this.buffer = this.buffer.substring(contentLength);
          } else {
            this.buffer = '';
          }
          continue;
        }

        this.contentLength = contentLength;
        this.buffer = this.buffer.substring(headerEnd + 4);
      }

      if (this.buffer.length < this.contentLength) return;

      const content = this.buffer.substring(0, this.contentLength);
      this.buffer = this.buffer.substring(this.contentLength);
      this.contentLength = null;

      try {
        const message = JSON.parse(content) as JSONRPCMessage;
        this.emit('message', message);
      } catch (e) {
        this.emit('error', new Error(`Invalid JSON: ${e}`));
      }
    }
  }

  send(message: JSONRPCMessage): void {
    const content = JSON.stringify(message);

    if (this.useNewlineDelimited) {
      // Newline-delimited JSON format
      if (this.debug) {
        this.logger.debug({ format: 'newline', content }, 'Sending message');
      }
      this.output.write(content + '\n');
    } else {
      // Content-Length framing
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
      if (this.debug) {
        this.logger.debug({ format: 'content-length', content: header + content }, 'Sending message');
      }
      this.output.write(header + content);
    }
  }

  close(): void {
    this.connected = false;
    this.input.removeAllListeners();
    this.removeAllListeners();
  }
}
