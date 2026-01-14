import { describe, it, expect, vi } from 'vitest';
import { BaseTransport, type TransportType } from '../../src/transport/base-transport.js';
import type { JSONRPCMessage } from '../../src/transport/types.js';

/**
 * Concrete implementation of BaseTransport for testing.
 */
class TestTransport extends BaseTransport {
  private _connected = false;
  private sentMessages: JSONRPCMessage[] = [];

  send(message: JSONRPCMessage): void {
    this.sentMessages.push(message);
  }

  close(): void {
    this._connected = false;
    this.emit('close');
  }

  isConnected(): boolean {
    return this._connected;
  }

  // Test helpers
  connect(): void {
    this._connected = true;
  }

  getSentMessages(): JSONRPCMessage[] {
    return this.sentMessages;
  }

  simulateMessage(message: JSONRPCMessage): void {
    this.emit('message', message);
  }

  simulateError(error: Error): void {
    this.emit('error', error);
  }
}

describe('BaseTransport', () => {
  describe('event emission', () => {
    it('should emit message events', () => {
      const transport = new TestTransport();
      const messageHandler = vi.fn();

      transport.on('message', messageHandler);

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      };
      transport.simulateMessage(message);

      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should emit error events', () => {
      const transport = new TestTransport();
      const errorHandler = vi.fn();

      transport.on('error', errorHandler);

      const error = new Error('Test error');
      transport.simulateError(error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should emit close events', () => {
      const transport = new TestTransport();
      const closeHandler = vi.fn();

      transport.on('close', closeHandler);
      transport.connect();
      transport.close();

      expect(closeHandler).toHaveBeenCalled();
    });
  });

  describe('abstract method enforcement', () => {
    it('should require send method implementation', () => {
      const transport = new TestTransport();
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      };

      transport.send(message);

      expect(transport.getSentMessages()).toHaveLength(1);
      expect(transport.getSentMessages()[0]).toBe(message);
    });

    it('should require close method implementation', () => {
      const transport = new TestTransport();
      transport.connect();

      expect(transport.isConnected()).toBe(true);
      transport.close();
      expect(transport.isConnected()).toBe(false);
    });

    it('should require isConnected method implementation', () => {
      const transport = new TestTransport();

      expect(transport.isConnected()).toBe(false);
      transport.connect();
      expect(transport.isConnected()).toBe(true);
    });
  });

  describe('debug mode', () => {
    it('should accept debug option in config', () => {
      const transport = new TestTransport({ debug: true });
      expect(transport).toBeDefined();
    });

    it('should default debug to false', () => {
      const transport = new TestTransport();
      expect(transport).toBeDefined();
    });
  });
});

describe('TransportType', () => {
  it('should support stdio type', () => {
    const type: TransportType = 'stdio';
    expect(type).toBe('stdio');
  });

  it('should support sse type', () => {
    const type: TransportType = 'sse';
    expect(type).toBe('sse');
  });

  it('should support streamable-http type', () => {
    const type: TransportType = 'streamable-http';
    expect(type).toBe('streamable-http');
  });
});
