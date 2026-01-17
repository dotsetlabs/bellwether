import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FallbackLLMClient, createFallbackClient } from '../../src/llm/fallback.js';
import type { LLMClient, ProviderInfo, Message, CompletionOptions } from '../../src/llm/client.js';
import { LLMRateLimitError, LLMAuthError, LLMConnectionError } from '../../src/errors/types.js';

// Mock LLM client for testing
class MockLLMClient implements LLMClient {
  constructor(
    private providerId: string,
    private shouldFail: boolean = false,
    private failureError?: Error,
    private response: string = '{"test": true}'
  ) {}

  getProviderInfo(): ProviderInfo {
    return {
      id: this.providerId,
      name: `Mock ${this.providerId}`,
      supportsJSON: true,
      supportsStreaming: false,
      defaultModel: 'mock-model',
    };
  }

  async chat(_messages: Message[], _options?: CompletionOptions): Promise<string> {
    if (this.shouldFail) {
      throw this.failureError ?? new Error(`${this.providerId} failed`);
    }
    return this.response;
  }

  async complete(_prompt: string, _options?: CompletionOptions): Promise<string> {
    if (this.shouldFail) {
      throw this.failureError ?? new Error(`${this.providerId} failed`);
    }
    return this.response;
  }

  parseJSON<T>(response: string): T {
    return JSON.parse(response) as T;
  }

  setFailing(fail: boolean, error?: Error): void {
    this.shouldFail = fail;
    this.failureError = error;
  }
}

describe('FallbackLLMClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should use primary provider when healthy', async () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [
          { provider: 'openai', apiKey: 'test-key' },
          { provider: 'anthropic', apiKey: 'test-key' },
        ],
        useOllamaFallback: false,
      });

      // Mock the internal clients
      const mockOpenAI = new MockLLMClient('openai', false, undefined, '{"provider": "openai"}');
      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('openai', mockOpenAI);

      const result = await fallbackClient.complete('test prompt');
      expect(result).toBe('{"provider": "openai"}');
    });

    it('should return combined provider info', () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [
          { provider: 'openai', apiKey: 'test-key' },
        ],
        useOllamaFallback: false,
      });

      const info = fallbackClient.getProviderInfo();
      expect(info.id).toContain('fallback');
      expect(info.name).toContain('Fallback');
    });
  });

  describe('failover behavior', () => {
    it('should failover to next provider on connection error', async () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [
          { provider: 'openai', apiKey: 'test-key' },
          { provider: 'anthropic', apiKey: 'test-key' },
        ],
        useOllamaFallback: false,
      });

      // Mock clients
      const mockOpenAI = new MockLLMClient('openai', true, new LLMConnectionError('openai'));
      const mockAnthropic = new MockLLMClient('anthropic', false, undefined, '{"provider": "anthropic"}');

      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('openai', mockOpenAI);
      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('anthropic', mockAnthropic);

      const result = await fallbackClient.complete('test prompt');
      expect(result).toBe('{"provider": "anthropic"}');
    });

    it('should failover on rate limit error', async () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [
          { provider: 'openai', apiKey: 'test-key' },
          { provider: 'anthropic', apiKey: 'test-key' },
        ],
        useOllamaFallback: false,
      });

      const mockOpenAI = new MockLLMClient('openai', true, new LLMRateLimitError('openai'));
      const mockAnthropic = new MockLLMClient('anthropic', false, undefined, '{"provider": "anthropic"}');

      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('openai', mockOpenAI);
      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('anthropic', mockAnthropic);

      const result = await fallbackClient.complete('test prompt');
      expect(result).toBe('{"provider": "anthropic"}');
    });

    it('should failover on auth error', async () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [
          { provider: 'openai', apiKey: 'test-key' },
          { provider: 'anthropic', apiKey: 'test-key' },
        ],
        useOllamaFallback: false,
      });

      const mockOpenAI = new MockLLMClient('openai', true, new LLMAuthError('openai'));
      const mockAnthropic = new MockLLMClient('anthropic', false, undefined, '{"provider": "anthropic"}');

      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('openai', mockOpenAI);
      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('anthropic', mockAnthropic);

      const result = await fallbackClient.complete('test prompt');
      expect(result).toBe('{"provider": "anthropic"}');
    });

    it('should throw when all providers fail', async () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [
          { provider: 'openai', apiKey: 'test-key' },
          { provider: 'anthropic', apiKey: 'test-key' },
        ],
        useOllamaFallback: false,
      });

      const mockOpenAI = new MockLLMClient('openai', true, new LLMConnectionError('openai'));
      const mockAnthropic = new MockLLMClient('anthropic', true, new LLMConnectionError('anthropic'));

      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('openai', mockOpenAI);
      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('anthropic', mockAnthropic);

      await expect(fallbackClient.complete('test prompt')).rejects.toThrow('All LLM providers failed');
    });
  });

  describe('health tracking', () => {
    it('should mark provider unhealthy after consecutive failures', async () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [
          { provider: 'openai', apiKey: 'test-key' },
          { provider: 'anthropic', apiKey: 'test-key' },
        ],
        maxConsecutiveFailures: 2,
        useOllamaFallback: false,
      });

      const mockOpenAI = new MockLLMClient('openai', true, new LLMConnectionError('openai'));
      const mockAnthropic = new MockLLMClient('anthropic', false, undefined, '{"ok": true}');

      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('openai', mockOpenAI);
      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('anthropic', mockAnthropic);

      // First two failures should mark OpenAI unhealthy
      await fallbackClient.complete('test 1');
      await fallbackClient.complete('test 2');

      const health = fallbackClient.getProviderHealth();
      const openaiHealth = health.find(h => h.provider === 'openai');
      expect(openaiHealth?.healthy).toBe(false);
      expect(openaiHealth?.consecutiveFailures).toBe(2);
    });

    it('should reset health on success', async () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [
          { provider: 'openai', apiKey: 'test-key' },
        ],
        maxConsecutiveFailures: 3,
        useOllamaFallback: false,
      });

      const mockOpenAI = new MockLLMClient('openai', false, undefined, '{"ok": true}');
      (fallbackClient as unknown as { clients: Map<string, LLMClient> }).clients.set('openai', mockOpenAI);

      // First make it fail once
      mockOpenAI.setFailing(true, new LLMConnectionError('openai'));
      try {
        await fallbackClient.complete('test');
      } catch {
        // Expected to fail
      }

      // Now succeed
      mockOpenAI.setFailing(false);
      await fallbackClient.complete('test');

      const health = fallbackClient.getProviderHealth();
      const openaiHealth = health.find(h => h.provider === 'openai');
      expect(openaiHealth?.healthy).toBe(true);
      expect(openaiHealth?.consecutiveFailures).toBe(0);
    });

    it('should allow manual provider disable/enable', () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [
          { provider: 'openai', apiKey: 'test-key' },
        ],
        useOllamaFallback: false,
      });

      fallbackClient.disableProvider('openai');
      let health = fallbackClient.getProviderHealth();
      expect(health.find(h => h.provider === 'openai')?.healthy).toBe(false);

      fallbackClient.enableProvider('openai');
      health = fallbackClient.getProviderHealth();
      expect(health.find(h => h.provider === 'openai')?.healthy).toBe(true);
    });
  });

  describe('provider order', () => {
    it('should return providers in configured order', () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [
          { provider: 'anthropic', apiKey: 'test-key' },
          { provider: 'openai', apiKey: 'test-key' },
        ],
        useOllamaFallback: false,
      });

      const order = fallbackClient.getProviderOrder();
      expect(order[0]).toBe('anthropic');
      expect(order[1]).toBe('openai');
    });
  });

  describe('parseJSON', () => {
    it('should parse JSON correctly', () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [{ provider: 'openai', apiKey: 'test-key' }],
        useOllamaFallback: false,
      });

      const result = fallbackClient.parseJSON<{ test: number }>('{"test": 42}');
      expect(result).toEqual({ test: 42 });
    });

    it('should handle markdown code blocks', () => {
      const fallbackClient = new FallbackLLMClient({
        providers: [{ provider: 'openai', apiKey: 'test-key' }],
        useOllamaFallback: false,
      });

      const result = fallbackClient.parseJSON<{ test: number }>('```json\n{"test": 42}\n```');
      expect(result).toEqual({ test: 42 });
    });
  });
});

describe('createFallbackClient', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create client with available providers', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const client = createFallbackClient({
      useOllamaFallback: false,
    });

    const order = client.getProviderOrder();
    expect(order).toContain('anthropic');
    expect(order).toContain('openai');
  });

  it('should respect preferred order', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const client = createFallbackClient({
      preferredOrder: ['openai', 'anthropic'],
      useOllamaFallback: false,
    });

    const order = client.getProviderOrder();
    expect(order[0]).toBe('openai');
    expect(order[1]).toBe('anthropic');
  });
});
