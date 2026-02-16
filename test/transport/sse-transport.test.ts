import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSETransport } from '../../src/transport/sse-transport.js';
import { ServerAuthError } from '../../src/errors/types.js';

const encoder = new TextEncoder();

function createControlledStream(): {
  stream: ReadableStream<Uint8Array>;
  controller: ReadableStreamDefaultController<Uint8Array>;
} {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  if (!controller) {
    throw new Error('Failed to initialize stream controller');
  }
  return { stream, controller };
}

function enqueue(controller: ReadableStreamDefaultController<Uint8Array>, data: string): void {
  controller.enqueue(encoder.encode(data));
}

describe('SSETransport', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should accept required configuration', () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
      });

      expect(transport).toBeDefined();
      expect(transport.isConnected()).toBe(false);
    });

    it('should accept optional configuration', () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
        sessionId: 'session-123',
        headers: { Authorization: 'Bearer token' },
        reconnectDelay: 2000,
        maxReconnectAttempts: 10,
        timeout: 60000,
        debug: true,
      });

      expect(transport).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should reject non-https URLs for remote servers', async () => {
      const transport = new SSETransport({
        baseUrl: 'http://example.com/mcp',
      });

      globalThis.fetch = vi.fn();

      await expect(transport.connect()).rejects.toThrow(/requires HTTPS/i);
    });

    it('should throw on non-OK responses', async () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
      });

      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

      await expect(transport.connect()).rejects.toThrow(/Failed to connect/i);
    });

    it('should throw ServerAuthError on 401 during SSE connect', async () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
      });

      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

      await expect(transport.connect()).rejects.toBeInstanceOf(ServerAuthError);
    });

    it('should receive endpoint and message events', async () => {
      const { stream, controller } = createControlledStream();

      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'ok' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      });

      globalThis.fetch = fetchMock as typeof fetch;

      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
        reconnectDelay: 10000,
      });

      const messageHandler = vi.fn();
      transport.on('message', messageHandler);

      const connectPromise = transport.connect();

      enqueue(controller, 'event: endpoint\n');
      enqueue(controller, 'data: https://example.com/mcp/custom\n\n');
      enqueue(controller, 'data: {"jsonrpc":"2.0","id":42,"result":"pong"}\n\n');

      await connectPromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 42, result: 'pong' })
      );

      transport.send({ jsonrpc: '2.0', id: 1, method: 'ping' });

      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(postCall?.[0]).toBe('https://example.com/mcp/custom');

      transport.close();
      controller.close();
    });

    it('should flush trailing data without newline', async () => {
      const { stream, controller } = createControlledStream();

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      );

      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
        reconnectDelay: 10000,
      });

      const messageHandler = vi.fn();
      transport.on('message', messageHandler);

      const connectPromise = transport.connect();

      enqueue(controller, 'data: {"jsonrpc":"2.0","id":7,"result":"tail"}');
      controller.close();

      await connectPromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, result: 'tail' })
      );

      transport.close();
    });
  });

  describe('send', () => {
    it('should error if not connected', () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
      });

      const errorHandler = vi.fn();
      transport.on('error', errorHandler);

      transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Transport not connected' })
      );
    });

    it('should emit ServerAuthError for 403 on message POST', async () => {
      const { stream } = createControlledStream();

      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return new Response('Forbidden', { status: 403 });
        }

        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      });
      globalThis.fetch = fetchMock as typeof fetch;

      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
        reconnectDelay: 10000,
      });
      await transport.connect();

      const errorHandler = vi.fn();
      transport.on('error', errorHandler);

      transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledWith(expect.any(ServerAuthError));

      transport.close();
    });
  });

  describe('reconnection behavior', () => {
    it('should attempt to reconnect when stream ends', async () => {
      vi.useFakeTimers();

      const fetchMock = vi.fn(async () => {
        const { stream, controller } = createControlledStream();
        controller.close();
        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      });

      globalThis.fetch = fetchMock as typeof fetch;

      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
        reconnectDelay: 100,
        maxReconnectAttempts: 1,
      });

      await transport.connect();

      await vi.advanceTimersByTimeAsync(150);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      transport.close();
      vi.useRealTimers();
    });
  });

  describe('close', () => {
    it('should emit close event', () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
      });

      const closeHandler = vi.fn();
      transport.on('close', closeHandler);

      transport.close();

      expect(closeHandler).toHaveBeenCalled();
      expect(transport.isConnected()).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
      });

      expect(transport.isConnected()).toBe(false);
    });

    it('should return false after close', () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
      });

      transport.close();

      expect(transport.isConnected()).toBe(false);
    });
  });
});
