/**
 * Tests for LLM streaming functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LLMClient, StreamingOptions, StreamingResult } from '../../src/llm/client.js';
import { FallbackLLMClient } from '../../src/llm/fallback.js';
import { LLMConnectionError } from '../../src/errors/types.js';

// Mock streaming LLM client for testing
class MockStreamingClient implements LLMClient {
  private chunks: string[];
  private shouldFail: boolean = false;
  private failAfterChunks: number = -1;

  constructor(chunks: string[] = ['Hello', ' ', 'World', '!']) {
    this.chunks = chunks;
  }

  getProviderInfo() {
    return {
      id: 'mock',
      name: 'Mock Provider',
      supportsJSON: true,
      supportsStreaming: true,
      defaultModel: 'mock-model',
    };
  }

  async chat(): Promise<string> {
    return this.chunks.join('');
  }

  async complete(): Promise<string> {
    return this.chunks.join('');
  }

  parseJSON<T>(response: string): T {
    return JSON.parse(response) as T;
  }

  async stream(_prompt: string, options?: StreamingOptions): Promise<StreamingResult> {
    return this.streamChat([], options);
  }

  async streamChat(_messages: unknown[], options?: StreamingOptions): Promise<StreamingResult> {
    let fullText = '';

    for (let i = 0; i < this.chunks.length; i++) {
      if (this.shouldFail && i === this.failAfterChunks) {
        const error = new Error('Streaming failed');
        options?.onError?.(error);
        throw error;
      }

      const chunk = this.chunks[i];
      fullText += chunk;
      options?.onChunk?.(chunk);

      // Simulate async delay
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    options?.onComplete?.(fullText);
    return { text: fullText, completed: true };
  }

  setChunks(chunks: string[]): void {
    this.chunks = chunks;
  }

  setFailing(fail: boolean, afterChunks: number = -1): void {
    this.shouldFail = fail;
    this.failAfterChunks = afterChunks;
  }
}

describe('LLM Streaming', () => {
  describe('StreamingOptions callbacks', () => {
    let client: MockStreamingClient;

    beforeEach(() => {
      client = new MockStreamingClient();
    });

    it('should call onChunk for each chunk', async () => {
      const chunks: string[] = [];
      const onChunk = vi.fn((chunk: string) => chunks.push(chunk));

      await client.stream('test prompt', { onChunk });

      expect(onChunk).toHaveBeenCalledTimes(4);
      expect(chunks).toEqual(['Hello', ' ', 'World', '!']);
    });

    it('should call onComplete with full text', async () => {
      const onComplete = vi.fn();

      await client.stream('test prompt', { onComplete });

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith('Hello World!');
    });

    it('should call onError on failure', async () => {
      client.setFailing(true, 2);
      const onError = vi.fn();

      await expect(client.stream('test prompt', { onError })).rejects.toThrow('Streaming failed');
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return complete text in result', async () => {
      const result = await client.stream('test prompt');

      expect(result.text).toBe('Hello World!');
      expect(result.completed).toBe(true);
    });
  });

  describe('StreamingResult', () => {
    let client: MockStreamingClient;

    beforeEach(() => {
      client = new MockStreamingClient();
    });

    it('should accumulate all chunks into text', async () => {
      client.setChunks(['{"', 'key":', ' "value"', '}']);

      const result = await client.stream('generate json');

      expect(result.text).toBe('{"key": "value"}');
      expect(result.completed).toBe(true);
    });

    it('should handle empty chunks', async () => {
      client.setChunks(['a', '', 'b', '', 'c']);

      const result = await client.stream('test');

      expect(result.text).toBe('abc');
    });

    it('should handle single large chunk', async () => {
      const largeText = 'x'.repeat(10000);
      client.setChunks([largeText]);

      const result = await client.stream('test');

      expect(result.text).toBe(largeText);
      expect(result.text.length).toBe(10000);
    });
  });

  describe('Streaming with callbacks order', () => {
    let client: MockStreamingClient;

    beforeEach(() => {
      client = new MockStreamingClient(['a', 'b', 'c']);
    });

    it('should call callbacks in order: onChunk -> onComplete', async () => {
      const callOrder: string[] = [];

      await client.stream('test', {
        onChunk: () => callOrder.push('chunk'),
        onComplete: () => callOrder.push('complete'),
      });

      expect(callOrder).toEqual(['chunk', 'chunk', 'chunk', 'complete']);
    });

    it('should call onError before throwing', async () => {
      client.setFailing(true, 1);
      const callOrder: string[] = [];

      try {
        await client.stream('test', {
          onChunk: () => callOrder.push('chunk'),
          onError: () => callOrder.push('error'),
          onComplete: () => callOrder.push('complete'),
        });
      } catch {
        callOrder.push('thrown');
      }

      expect(callOrder).toEqual(['chunk', 'error', 'thrown']);
    });
  });
});

describe('FallbackLLMClient streaming', () => {
  let mockClient: MockStreamingClient;

  beforeEach(() => {
    mockClient = new MockStreamingClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should support streaming through fallback client', async () => {
    const fallbackClient = new FallbackLLMClient({
      providers: [{ provider: 'openai', apiKey: 'test-key' }],
      useOllamaFallback: false,
    });

    // Inject mock client
    (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('openai', mockClient);

    const chunks: string[] = [];
    const result = await fallbackClient.stream('test', {
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(result.text).toBe('Hello World!');
    expect(chunks).toEqual(['Hello', ' ', 'World', '!']);
  });

  it('should fallback on streaming connection error', async () => {
    // Create a failing client that throws a connection error (which triggers failover)
    const failingClient: LLMClient = {
      getProviderInfo: () => ({
        id: 'openai',
        name: 'OpenAI',
        supportsJSON: true,
        supportsStreaming: true,
        defaultModel: 'gpt-4',
      }),
      chat: async () => { throw new LLMConnectionError('openai'); },
      complete: async () => { throw new LLMConnectionError('openai'); },
      stream: async () => { throw new LLMConnectionError('openai'); },
      streamChat: async () => { throw new LLMConnectionError('openai'); },
      parseJSON: <T>(s: string) => JSON.parse(s) as T,
    };

    const workingClient = new MockStreamingClient(['backup', ' response']);

    const fallbackClient = new FallbackLLMClient({
      providers: [
        { provider: 'openai', apiKey: 'test-key' },
        { provider: 'anthropic', apiKey: 'test-key' },
      ],
      useOllamaFallback: false,
    });

    // Inject mock clients
    const clients = (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients;
    clients.set('openai', failingClient);
    clients.set('anthropic', workingClient);

    const result = await fallbackClient.stream('test');

    expect(result.text).toBe('backup response');
  });
});

describe('Streaming JSON responses', () => {
  let client: MockStreamingClient;

  beforeEach(() => {
    client = new MockStreamingClient();
  });

  it('should stream JSON and parse complete result', async () => {
    client.setChunks(['[', '{"id":', '1}', ',', '{"id":', '2}', ']']);

    const result = await client.stream('generate json array');

    expect(result.text).toBe('[{"id":1},{"id":2}]');

    const parsed = client.parseJSON<Array<{ id: number }>>(result.text);
    expect(parsed).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('should handle markdown-wrapped JSON', async () => {
    client.setChunks(['```json\n', '{"test":', ' true', '}\n', '```']);

    const result = await client.stream('generate json');
    const text = result.text.replace(/```json\n?/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(text);
    expect(parsed).toEqual({ test: true });
  });
});
