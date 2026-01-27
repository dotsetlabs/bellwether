import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HTTPTransport } from '../../src/transport/http-transport.js';

describe('HTTPTransport', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should accept required configuration', () => {
      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      expect(transport).toBeDefined();
      expect(transport.isConnected()).toBe(false);
    });

    it('should accept optional configuration', () => {
      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
        sessionId: 'session-123',
        headers: { Authorization: 'Bearer token' },
        timeout: 60000,
        debug: true,
      });

      expect(transport).toBeDefined();
    });

    it('should normalize trailing slash from URL', () => {
      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp/',
      });

      expect(transport).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should mark transport as connected', async () => {
      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      expect(transport.isConnected()).toBe(false);
      await transport.connect();
      expect(transport.isConnected()).toBe(true);
    });
  });

  describe('send', () => {
    it('should error if not connected', () => {
      const transport = new HTTPTransport({
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

    it('should send message via fetch when connected', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: 'ok' }),
      });
      globalThis.fetch = mockFetch;

      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      await transport.connect();

      const message = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'test',
      };

      transport.send(message);

      // Wait for async send
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/mcp',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(message),
        })
      );
    });

    it('should include custom headers in request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: () => Promise.resolve({}),
      });
      globalThis.fetch = mockFetch;

      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer token' },
        sessionId: 'session-123',
      });

      await transport.connect();

      transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });

      // Wait for async send
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer token',
            'Mcp-Session-Id': 'session-123',
          }),
        })
      );
    });

    it('should emit message event on JSON response', async () => {
      const responseData = { jsonrpc: '2.0', id: 1, result: 'success' };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(responseData),
      });
      globalThis.fetch = mockFetch;

      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      await transport.connect();

      const messageHandler = vi.fn();
      transport.on('message', messageHandler);

      transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });

      // Wait for async response
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messageHandler).toHaveBeenCalledWith(responseData);
    });

    it('should capture session ID from response and include in subsequent requests', async () => {
      const responseData = { jsonrpc: '2.0', id: 1, result: 'success' };
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          headers: new Headers({
            'content-type': 'application/json',
            // First response includes session ID
            'Mcp-Session-Id': callCount === 1 ? 'server-session-abc' : '',
          }),
          json: () => Promise.resolve(responseData),
        });
      });
      globalThis.fetch = mockFetch;

      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      await transport.connect();

      // First request - server returns session ID
      transport.send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second request - should include captured session ID
      transport.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second call should include the session ID from first response
      const secondCallArgs = mockFetch.mock.calls[1];
      expect(secondCallArgs[1].headers['Mcp-Session-Id']).toBe('server-session-abc');
    });

    it('should emit error on HTTP error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
      globalThis.fetch = mockFetch;

      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      await transport.connect();

      const errorHandler = vi.fn();
      transport.on('error', errorHandler);

      transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });

      // Wait for async error
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('HTTP 500'),
        })
      );
    });
  });

  describe('sendAsync', () => {
    it('should return response data', async () => {
      const responseData = { jsonrpc: '2.0', id: 1, result: 'success' };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(responseData),
      });
      globalThis.fetch = mockFetch;

      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      await transport.connect();

      const response = await transport.sendAsync({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });

      expect(response).toEqual(responseData);
    });

    it('should throw on HTTP error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });
      globalThis.fetch = mockFetch;

      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      await transport.connect();

      await expect(
        transport.sendAsync({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
        })
      ).rejects.toThrow('HTTP 404');
    });
  });

  describe('close', () => {
    it('should emit close event', () => {
      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      const closeHandler = vi.fn();
      transport.on('close', closeHandler);

      transport.close();

      expect(closeHandler).toHaveBeenCalled();
      expect(transport.isConnected()).toBe(false);
    });

    it('should mark transport as disconnected', async () => {
      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      await transport.connect();
      expect(transport.isConnected()).toBe(true);

      transport.close();
      expect(transport.isConnected()).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      expect(transport.isConnected()).toBe(false);
    });

    it('should return true after connect', async () => {
      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      await transport.connect();

      expect(transport.isConnected()).toBe(true);
    });

    it('should return false after close', async () => {
      const transport = new HTTPTransport({
        baseUrl: 'https://example.com/mcp',
      });

      await transport.connect();
      transport.close();

      expect(transport.isConnected()).toBe(false);
    });
  });
});
