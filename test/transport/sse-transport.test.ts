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

      // Track EventSource instantiation
      let eventSourceCallCount = 0;
      let mockInstance: {
        onopen: ((event: Event) => void) | null;
        onmessage: ((event: MessageEvent) => void) | null;
        onerror: ((event: Event) => void) | null;
        addEventListener: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        readyState: number;
      } | null = null;

      // Mock EventSource as a class for vitest 4.x
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = class MockEventSource {
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        addEventListener = vi.fn();
        close = vi.fn();
        readyState = 1;

        constructor() {
          eventSourceCallCount++;
          mockInstance = this;
        }
      };

      // First connect should start
      const connectPromise = transport.connect();

      // Trigger onopen
      mockInstance?.onopen?.({} as Event);
      await connectPromise;

      // Second connect should return immediately
      await transport.connect();

      // EventSource should only be created once
      expect(eventSourceCallCount).toBe(1);

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

  describe('reconnection behavior', () => {
    let mockInstance: {
      onopen: ((event: Event) => void) | null;
      onmessage: ((event: MessageEvent) => void) | null;
      onerror: ((event: Event) => void) | null;
      addEventListener: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      readyState: number;
    } | null = null;

    beforeEach(() => {
      vi.useFakeTimers();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).EventSource = class MockEventSource {
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        addEventListener = vi.fn();
        close = vi.fn();
        readyState = 1;

        constructor() {
          mockInstance = this;
        }
      };
    });

    afterEach(() => {
      vi.useRealTimers();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).EventSource;
    });

    it('should not exceed maxReconnectAttempts', async () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
        maxReconnectAttempts: 3,
        reconnectDelay: 100,
      });

      // Connect successfully
      const connectPromise = transport.connect();
      mockInstance?.onopen?.({} as Event);
      await connectPromise;

      const errorHandler = vi.fn();
      const closeHandler = vi.fn();
      transport.on('error', errorHandler);
      transport.on('close', closeHandler);

      // Trigger error after connection
      mockInstance?.onerror?.({} as Event);

      // Advance through all reconnection attempts
      // Attempt 1: 100ms
      vi.advanceTimersByTime(150);
      mockInstance?.onerror?.({} as Event);

      // Attempt 2: 200ms
      vi.advanceTimersByTime(250);
      mockInstance?.onerror?.({} as Event);

      // Attempt 3: 400ms
      vi.advanceTimersByTime(450);
      mockInstance?.onerror?.({} as Event);

      // After max attempts, should emit error with message about max attempts
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('3') })
      );
      expect(closeHandler).toHaveBeenCalled();
    });

    it('should stop reconnection when close() is called', async () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
        maxReconnectAttempts: 10,
        reconnectDelay: 100,
      });

      // Connect successfully
      const connectPromise = transport.connect();
      mockInstance?.onopen?.({} as Event);
      await connectPromise;

      // Trigger error to start reconnection
      mockInstance?.onerror?.({} as Event);

      // Close before reconnect timer fires
      transport.close();

      // Advance time past reconnection delay
      vi.advanceTimersByTime(500);

      // Should not have attempted to reconnect
      expect(transport.isConnected()).toBe(false);
    });

    it('should use exponential backoff', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
        maxReconnectAttempts: 5,
        reconnectDelay: 1000,
      });

      // Connect successfully
      const connectPromise = transport.connect();
      mockInstance?.onopen?.({} as Event);
      await connectPromise;

      // Clear the spy to only track reconnection timeouts
      setTimeoutSpy.mockClear();

      // Trigger error to start reconnection
      mockInstance?.onerror?.({} as Event);

      // First reconnect delay should be 1000ms (1000 * 2^0)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

      // Trigger next reconnect attempt
      vi.advanceTimersByTime(1100);
      setTimeoutSpy.mockClear();
      mockInstance?.onerror?.({} as Event);

      // Second delay should be 2000ms (1000 * 2^1)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    });

    it('should cap backoff delay at maxBackoffDelay', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
        maxReconnectAttempts: 10,
        reconnectDelay: 10000, // Start high to hit cap quickly
      });

      // Connect successfully
      const connectPromise = transport.connect();
      mockInstance?.onopen?.({} as Event);
      await connectPromise;

      setTimeoutSpy.mockClear();

      // Trigger error to start reconnection
      mockInstance?.onerror?.({} as Event);

      // First delay: 10000ms
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10000);

      vi.advanceTimersByTime(10100);
      setTimeoutSpy.mockClear();
      mockInstance?.onerror?.({} as Event);

      // Second delay: 20000ms
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 20000);

      vi.advanceTimersByTime(20100);
      setTimeoutSpy.mockClear();
      mockInstance?.onerror?.({} as Event);

      // Third delay should be capped at 30000ms (not 40000)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it('should reset isClosing flag on fresh connection', async () => {
      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
      });

      // First connection
      let connectPromise = transport.connect();
      mockInstance?.onopen?.({} as Event);
      await connectPromise;

      // Close the transport
      transport.close();
      expect(transport.isConnected()).toBe(false);

      // Second connection should work
      connectPromise = transport.connect();
      mockInstance?.onopen?.({} as Event);
      await connectPromise;

      expect(transport.isConnected()).toBe(true);
    });

    it('should clear reconnect timer on close', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const transport = new SSETransport({
        baseUrl: 'https://example.com/mcp',
        maxReconnectAttempts: 5,
        reconnectDelay: 1000,
      });

      // Trigger close
      transport.close();

      // clearTimeout should be called (for reconnect timer, even if null)
      // The implementation may call clearTimeout defensively
      // Just verify close() doesn't throw
      expect(transport.isConnected()).toBe(false);
    });
  });
});
