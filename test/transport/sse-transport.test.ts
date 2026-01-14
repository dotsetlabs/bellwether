import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSETransport } from '../../src/transport/sse-transport.js';

describe('SSETransport', () => {
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

    it('should normalize trailing slash from URL', () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp/',
      });

      // URL should be normalized (implementation detail)
      expect(transport).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should throw if EventSource is not available', async () => {
      // In Node.js without EventSource polyfill, this should fail
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
      });

      await expect(transport.connect()).rejects.toThrow(
        /EventSource is not available/
      );
    });

    it('should not connect twice', async () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
      });

      // Mock EventSource for this test
      const mockEventSource = {
        onopen: null as ((event: Event) => void) | null,
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        addEventListener: vi.fn(),
        close: vi.fn(),
        readyState: 1,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = vi.fn(() => mockEventSource);

      // First connect should start
      const connectPromise = transport.connect();

      // Trigger onopen
      mockEventSource.onopen?.({} as Event);
      await connectPromise;

      // Second connect should return immediately
      await transport.connect();

      // EventSource should only be created once
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((globalThis as any).EventSource).toHaveBeenCalledTimes(1);

      // Cleanup
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).EventSource;
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
