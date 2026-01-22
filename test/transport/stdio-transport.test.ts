import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter, Readable, Writable } from 'stream';
import { StdioTransport } from '../../src/transport/stdio-transport.js';
import type { JSONRPCMessage } from '../../src/transport/types.js';

/**
 * Create a mock readable stream.
 */
function createMockReadable(): Readable & { push: (data: string | null) => void } {
  const stream = new EventEmitter() as Readable & { push: (data: string | null) => void };
  stream.push = (data: string | null) => {
    if (data === null) {
      stream.emit('end');
    } else {
      stream.emit('data', Buffer.from(data));
    }
  };
  return stream;
}

/**
 * Create a mock writable stream.
 */
function createMockWritable(): Writable & { chunks: string[]; write: (chunk: string) => boolean } {
  const chunks: string[] = [];
  const stream = {
    chunks,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
  } as Writable & { chunks: string[] };
  return stream;
}

describe('StdioTransport', () => {
  let input: ReturnType<typeof createMockReadable>;
  let output: ReturnType<typeof createMockWritable>;
  let transport: StdioTransport;

  beforeEach(() => {
    input = createMockReadable();
    output = createMockWritable();
  });

  describe('newline-delimited JSON mode (default)', () => {
    beforeEach(() => {
      transport = new StdioTransport(input, output);
    });

    it('should parse a single JSON-RPC message', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      };
      input.push(JSON.stringify(message) + '\n');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should parse multiple messages in sequence', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const msg1: JSONRPCMessage = { jsonrpc: '2.0', id: 1, method: 'first' };
      const msg2: JSONRPCMessage = { jsonrpc: '2.0', id: 2, method: 'second' };

      input.push(JSON.stringify(msg1) + '\n');
      input.push(JSON.stringify(msg2) + '\n');

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, msg1);
      expect(handler).toHaveBeenNthCalledWith(2, msg2);
    });

    it('should parse multiple messages in single chunk', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const msg1: JSONRPCMessage = { jsonrpc: '2.0', id: 1, method: 'first' };
      const msg2: JSONRPCMessage = { jsonrpc: '2.0', id: 2, method: 'second' };

      input.push(JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n');

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should handle fragmented messages', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const message: JSONRPCMessage = { jsonrpc: '2.0', id: 1, method: 'test' };
      const json = JSON.stringify(message);

      // Send in fragments
      input.push(json.substring(0, 10));
      expect(handler).not.toHaveBeenCalled();

      input.push(json.substring(10) + '\n');
      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should emit error for invalid JSON lines', () => {
      const messageHandler = vi.fn();
      const errorHandler = vi.fn();
      transport.on('message', messageHandler);
      transport.on('error', errorHandler);

      input.push('invalid json\n');
      input.push('{"jsonrpc":"2.0","id":1,"method":"valid"}\n');

      // Invalid JSON emits error (consistent with Content-Length mode)
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0].message).toContain('Invalid JSON');
      // Valid message still processed
      expect(messageHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle empty lines', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      input.push('\n\n{"jsonrpc":"2.0","id":1,"method":"test"}\n\n');

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should send messages with newline delimiter', () => {
      const message: JSONRPCMessage = { jsonrpc: '2.0', id: 1, method: 'test' };
      transport.send(message);

      expect(output.chunks).toHaveLength(1);
      expect(output.chunks[0]).toBe(JSON.stringify(message) + '\n');
    });
  });

  describe('Content-Length framing mode', () => {
    beforeEach(() => {
      transport = new StdioTransport(input, output, { useNewlineDelimited: false });
    });

    it('should parse Content-Length framed message', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const message: JSONRPCMessage = { jsonrpc: '2.0', id: 1, method: 'test' };
      const content = JSON.stringify(message);
      const framed = `Content-Length: ${content.length}\r\n\r\n${content}`;

      input.push(framed);

      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should parse multiple Content-Length framed messages', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const msg1: JSONRPCMessage = { jsonrpc: '2.0', id: 1, method: 'first' };
      const msg2: JSONRPCMessage = { jsonrpc: '2.0', id: 2, method: 'second' };

      const content1 = JSON.stringify(msg1);
      const content2 = JSON.stringify(msg2);

      input.push(
        `Content-Length: ${content1.length}\r\n\r\n${content1}` +
        `Content-Length: ${content2.length}\r\n\r\n${content2}`
      );

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should handle fragmented Content-Length messages when split at header end', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const message: JSONRPCMessage = { jsonrpc: '2.0', id: 1, method: 'test' };
      const content = JSON.stringify(message);

      // Send header complete, content fragmented
      input.push(`Content-Length: ${content.length}\r\n\r\n`);
      expect(handler).not.toHaveBeenCalled();

      input.push(content);
      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should send messages with Content-Length framing', () => {
      const message: JSONRPCMessage = { jsonrpc: '2.0', id: 1, method: 'test' };
      transport.send(message);

      const content = JSON.stringify(message);
      expect(output.chunks).toHaveLength(1);
      expect(output.chunks[0]).toBe(`Content-Length: ${content.length}\r\n\r\n${content}`);
    });

    it('should emit error for invalid JSON in Content-Length message', () => {
      const errorHandler = vi.fn();
      transport.on('error', errorHandler);

      // Valid Content-Length but invalid JSON content
      input.push('Content-Length: 5\r\n\r\n{bad}');

      expect(errorHandler).toHaveBeenCalled();
      expect(errorHandler.mock.calls[0][0].message).toContain('Invalid JSON');
    });
  });

  describe('size limits', () => {
    it('should error when buffer size exceeded', () => {
      transport = new StdioTransport(input, output, { maxBufferSize: 50 });
      const errorHandler = vi.fn();
      transport.on('error', errorHandler);

      // Send data larger than buffer
      input.push('x'.repeat(100));

      expect(errorHandler).toHaveBeenCalled();
      expect(errorHandler.mock.calls[0][0].message).toContain('Buffer size limit exceeded');
    });

    it('should error when message size exceeded', () => {
      transport = new StdioTransport(input, output, { maxMessageSize: 20 });
      const errorHandler = vi.fn();
      transport.on('error', errorHandler);

      // Send a message larger than limit
      const largeMessage = { jsonrpc: '2.0', id: 1, method: 'x'.repeat(50) };
      input.push(JSON.stringify(largeMessage) + '\n');

      expect(errorHandler).toHaveBeenCalled();
      expect(errorHandler.mock.calls[0][0].message).toContain('Message size limit exceeded');
    });

    it('should error when Content-Length exceeds limit', () => {
      transport = new StdioTransport(input, output, {
        maxMessageSize: 20,
        useNewlineDelimited: false,
      });
      const errorHandler = vi.fn();
      transport.on('error', errorHandler);

      input.push('Content-Length: 1000\r\n\r\n');

      expect(errorHandler).toHaveBeenCalled();
      expect(errorHandler.mock.calls[0][0].message).toContain('exceeds maximum allowed size');
    });
  });

  describe('events', () => {
    beforeEach(() => {
      transport = new StdioTransport(input, output);
    });

    it('should emit close on stream end', () => {
      const closeHandler = vi.fn();
      transport.on('close', closeHandler);

      input.push(null); // Signal end

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should emit error on stream error', () => {
      const errorHandler = vi.fn();
      transport.on('error', errorHandler);

      input.emit('error', new Error('Stream error'));

      expect(errorHandler).toHaveBeenCalled();
      expect(errorHandler.mock.calls[0][0].message).toBe('Stream error');
    });

    it('should remove listeners on close', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      transport.close();

      // After close, messages should not be processed
      input.push('{"jsonrpc":"2.0","id":1,"method":"test"}\n');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('JSON-RPC message types', () => {
    beforeEach(() => {
      transport = new StdioTransport(input, output);
    });

    it('should parse request messages', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const request: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: { filter: 'all' },
      };
      input.push(JSON.stringify(request) + '\n');

      expect(handler).toHaveBeenCalledWith(request);
    });

    it('should parse response messages', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const response: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: { tools: [] },
      };
      input.push(JSON.stringify(response) + '\n');

      expect(handler).toHaveBeenCalledWith(response);
    });

    it('should parse error response messages', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const errorResponse: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32600, message: 'Invalid request' },
      };
      input.push(JSON.stringify(errorResponse) + '\n');

      expect(handler).toHaveBeenCalledWith(errorResponse);
    });

    it('should parse notification messages', () => {
      const handler = vi.fn();
      transport.on('message', handler);

      const notification: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      };
      input.push(JSON.stringify(notification) + '\n');

      expect(handler).toHaveBeenCalledWith(notification);
    });
  });

  describe('debug mode', () => {
    it('should process messages when debug is enabled', () => {
      // Debug mode now uses pino structured logging instead of console.log
      // This test verifies the transport still processes messages correctly with debug enabled
      const handler = vi.fn();
      transport = new StdioTransport(input, output, { debug: true });
      transport.on('message', handler);

      input.push('{"jsonrpc":"2.0","id":1,"method":"test"}\n');

      expect(handler).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });
    });

    it('should process messages when debug is disabled', () => {
      const handler = vi.fn();
      transport = new StdioTransport(input, output, { debug: false });
      transport.on('message', handler);

      input.push('{"jsonrpc":"2.0","id":1,"method":"test"}\n');

      expect(handler).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });
    });
  });
});
