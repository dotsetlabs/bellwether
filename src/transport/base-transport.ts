import { EventEmitter } from 'events';
import type { JSONRPCMessage } from './types.js';

/**
 * Base configuration for all transports.
 */
export interface BaseTransportConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Events emitted by transports.
 */
export interface TransportEvents {
  message: (msg: JSONRPCMessage) => void;
  error: (error: Error) => void;
  close: () => void;
}

/**
 * Abstract base class for MCP transports.
 *
 * Transports handle the low-level communication with MCP servers,
 * including message framing and connection management.
 *
 * All transports emit:
 * - 'message': When a JSON-RPC message is received
 * - 'error': When an error occurs
 * - 'close': When the connection is closed
 */
export abstract class BaseTransport extends EventEmitter {
  protected debug: boolean;

  constructor(config?: BaseTransportConfig) {
    super();
    this.debug = config?.debug ?? false;
  }

  /**
   * Send a JSON-RPC message to the server.
   */
  abstract send(message: JSONRPCMessage): void;

  /**
   * Close the transport connection.
   */
  abstract close(): void;

  /**
   * Check if the transport is connected.
   */
  abstract isConnected(): boolean;

  /**
   * Log a debug message if debug mode is enabled.
   */
  protected log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[Transport]', ...args);
    }
  }

  // Type-safe event methods
  override on<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof TransportEvents>(
    event: K,
    ...args: Parameters<TransportEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

/**
 * Transport type identifier.
 */
export type TransportType = 'stdio' | 'sse' | 'streamable-http';
