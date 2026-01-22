/**
 * Tests for LLM error handling across all providers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BellwetherError } from '../../src/errors/index.js';

// Create mock functions
const mockOpenAICreate = vi.fn();
const mockAnthropicCreate = vi.fn();
const mockAnthropicStream = vi.fn();

// Mock OpenAI SDK
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockOpenAICreate,
      },
    };
  },
}));

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockAnthropicCreate,
      stream: mockAnthropicStream,
    };
  },
}));

// Import clients after mocks
import { OpenAIClient } from '../../src/llm/openai.js';
import { AnthropicClient } from '../../src/llm/anthropic.js';

/**
 * Helper to check error code
 */
function getErrorCode(error: unknown): string | undefined {
  if (error instanceof BellwetherError) {
    return error.code;
  }
  return undefined;
}

describe('LLM Error Handling', () => {
  describe('OpenAIClient error conversion', () => {
    let client: OpenAIClient;

    beforeEach(() => {
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      mockOpenAICreate.mockReset();
      client = new OpenAIClient({ apiKey: 'test-key' });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('should throw LLM_AUTH_ERROR on 401', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('401 Unauthorized'));

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_AUTH_FAILED');
        expect((error as BellwetherError).context?.component).toBe('openai');
      }
    });

    it('should throw LLM_RATE_LIMITED on 429', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('429 Too Many Requests'));

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_RATE_LIMITED');
      }
    });

    it('should throw LLM_QUOTA_EXHAUSTED on insufficient_quota', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('insufficient_quota'));

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_QUOTA_EXHAUSTED');
      }
    });

    it('should throw LLM_CONNECTION_FAILED on ECONNREFUSED', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_CONNECTION_FAILED');
      }
    });

    it('should throw LLM_CONNECTION_FAILED on fetch failed', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('fetch failed'));

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_CONNECTION_FAILED');
      }
    });

    it('should throw LLM_REFUSED when response has refusal', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: null,
            refusal: 'I cannot help with that request.',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_REFUSED');
      }
    });

    it('should extract JSON from refusal field when model makes mistake', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: null,
            refusal: '```json\n{"result": "test"}\n```',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const result = await client.chat([{ role: 'user', content: 'test' }]);
      expect(result).toContain('result');
    });

    it('should handle successful response correctly', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Hello, this is a test response.',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 8 },
      });

      const result = await client.chat([{ role: 'user', content: 'test' }]);
      expect(result).toBe('Hello, this is a test response.');
    });

    it('should track token usage via callback', async () => {
      const usageCallback = vi.fn();
      const clientWithUsage = new OpenAIClient({ apiKey: 'test-key', onUsage: usageCallback });

      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: { content: 'test' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      await clientWithUsage.chat([{ role: 'user', content: 'test' }]);

      expect(usageCallback).toHaveBeenCalledWith(100, 50);
    });
  });

  describe('OpenAIClient reasoning model handling', () => {
    let client: OpenAIClient;

    beforeEach(() => {
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      mockOpenAICreate.mockReset();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('should use max_completion_tokens for o1 models', async () => {
      client = new OpenAIClient({ apiKey: 'test-key', model: 'o1' });

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await client.chat([{ role: 'user', content: 'test' }]);

      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_completion_tokens: expect.any(Number),
        })
      );
      // Should NOT have max_tokens
      expect(mockOpenAICreate).not.toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: expect.any(Number),
        })
      );
    });

    it('should use max_tokens for standard gpt-4 models', async () => {
      client = new OpenAIClient({ apiKey: 'test-key', model: 'gpt-4' });

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await client.chat([{ role: 'user', content: 'test' }]);

      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: expect.any(Number),
          temperature: expect.any(Number),
        })
      );
    });

    it('should not include temperature for o1 models', async () => {
      client = new OpenAIClient({ apiKey: 'test-key', model: 'o1-mini' });

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await client.chat([{ role: 'user', content: 'test' }]);

      const callArgs = mockOpenAICreate.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('temperature');
    });

    it('should ensure minimum tokens for reasoning models', async () => {
      client = new OpenAIClient({ apiKey: 'test-key', model: 'o3' });

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      // Request a low max_tokens
      await client.chat([{ role: 'user', content: 'test' }], { maxTokens: 100 });

      const callArgs = mockOpenAICreate.mock.calls[0][0];
      // Should be at least 8192 for reasoning models
      expect(callArgs.max_completion_tokens).toBeGreaterThanOrEqual(8192);
    });
  });

  describe('AnthropicClient error conversion', () => {
    let client: AnthropicClient;

    beforeEach(() => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
      mockAnthropicCreate.mockReset();
      mockAnthropicStream.mockReset();
      client = new AnthropicClient({ apiKey: 'test-key' });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('should throw LLM_AUTH_FAILED on 401', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('401 authentication failed'));

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_AUTH_FAILED');
        expect((error as BellwetherError).context?.component).toBe('anthropic');
      }
    });

    it('should throw LLM_RATE_LIMITED on 429', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('429 rate limit exceeded'));

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_RATE_LIMITED');
      }
    });

    it('should throw LLM_QUOTA_EXHAUSTED on insufficient credit', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('insufficient credit balance'));

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_QUOTA_EXHAUSTED');
      }
    });

    it('should throw LLM_CONNECTION_FAILED on ECONNREFUSED', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_CONNECTION_FAILED');
      }
    });

    it('should handle successful response correctly', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello from Claude!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const result = await client.chat([{ role: 'user', content: 'test' }]);
      expect(result).toBe('Hello from Claude!');
    });

    it('should track token usage via callback', async () => {
      const usageCallback = vi.fn();
      const clientWithUsage = new AnthropicClient({ apiKey: 'test-key', onUsage: usageCallback });

      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'test' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 200, output_tokens: 100 },
      });

      await clientWithUsage.chat([{ role: 'user', content: 'test' }]);

      expect(usageCallback).toHaveBeenCalledWith(200, 100);
    });
  });

  describe('AnthropicClient message normalization', () => {
    let client: AnthropicClient;

    beforeEach(() => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
      mockAnthropicCreate.mockReset();
      client = new AnthropicClient({ apiKey: 'test-key' });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('should handle assistant-first message by adding placeholder', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await client.chat([{ role: 'assistant', content: 'Previous response' }]);

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      // Should have added a placeholder user message first
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[1].role).toBe('assistant');
    });

    it('should merge consecutive same-role messages', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await client.chat([
        { role: 'user', content: 'Message 1' },
        { role: 'user', content: 'Message 2' },
      ]);

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      // Should have merged into single message
      expect(callArgs.messages).toHaveLength(1);
      expect(callArgs.messages[0].content).toContain('Message 1');
      expect(callArgs.messages[0].content).toContain('Message 2');
    });

    it('should extract system message from first position', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await client.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ]);

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('You are helpful');
      expect(callArgs.messages[0].role).toBe('user');
    });

    it('should combine systemPrompt option with system message', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await client.chat(
        [
          { role: 'system', content: 'From message' },
          { role: 'user', content: 'Hello' },
        ],
        { systemPrompt: 'From options' }
      );

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('From options');
      expect(callArgs.system).toContain('From message');
    });
  });

  describe('OpenAIClient streaming errors', () => {
    let client: OpenAIClient;

    beforeEach(() => {
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      mockOpenAICreate.mockReset();
      client = new OpenAIClient({ apiKey: 'test-key' });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('should handle 401 in streaming mode', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('401 Unauthorized'));

      try {
        await client.streamChat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_AUTH_FAILED');
      }
    });

    it('should call onError callback on streaming failure', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('429 Rate limited'));
      const onError = vi.fn();

      try {
        await client.streamChat([{ role: 'user', content: 'test' }], { onError });
      } catch {
        // Expected
      }

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('AnthropicClient streaming errors', () => {
    let client: AnthropicClient;

    beforeEach(() => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
      mockAnthropicStream.mockReset();
      client = new AnthropicClient({ apiKey: 'test-key' });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('should handle 401 in streaming mode', async () => {
      mockAnthropicStream.mockRejectedValue(new Error('401 authentication failed'));

      try {
        await client.streamChat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(getErrorCode(error)).toBe('LLM_AUTH_FAILED');
      }
    });

    it('should call onError callback on streaming failure', async () => {
      mockAnthropicStream.mockRejectedValue(new Error('Network error'));
      const onError = vi.fn();

      try {
        await client.streamChat([{ role: 'user', content: 'test' }], { onError });
      } catch {
        // Expected
      }

      expect(onError).toHaveBeenCalled();
    });

    it('should track token usage in streaming mode', async () => {
      const usageCallback = vi.fn();
      const clientWithUsage = new AnthropicClient({ apiKey: 'test-key', onUsage: usageCallback });

      const mockStreamObj = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
        },
        finalMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Hello' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 50, output_tokens: 25 },
        }),
      };
      mockAnthropicStream.mockResolvedValue(mockStreamObj);

      await clientWithUsage.streamChat([{ role: 'user', content: 'test' }]);

      expect(usageCallback).toHaveBeenCalledWith(50, 25);
    });
  });

  describe('Client initialization errors', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should throw LLM_AUTH_ERROR when OpenAI API key missing', () => {
      vi.stubEnv('OPENAI_API_KEY', '');
      delete process.env.OPENAI_API_KEY;

      expect(() => new OpenAIClient()).toThrow('LLM authentication failed');
    });

    it('should throw LLM_AUTH_ERROR when Anthropic API key missing', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      delete process.env.ANTHROPIC_API_KEY;

      expect(() => new AnthropicClient()).toThrow('LLM authentication failed');
    });

    it('should accept API key via options', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      // Should not throw when API key provided via options
      const openai = new OpenAIClient({ apiKey: 'provided-key' });
      const anthropic = new AnthropicClient({ apiKey: 'provided-key' });

      expect(openai).toBeDefined();
      expect(anthropic).toBeDefined();
    });
  });
});
