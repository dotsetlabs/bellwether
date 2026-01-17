import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BellwetherError } from '../../src/errors/index.js';

/**
 * Tests for Anthropic refusal detection.
 * These tests verify that the AnthropicClient correctly detects and throws
 * errors when Claude refuses to generate content.
 *
 * Note: LLMRefusalError is wrapped by withRetry into BellwetherError,
 * so we check for BellwetherError with code 'LLM_REFUSED'.
 */

// Create mock functions first
const mockCreate = vi.fn();
const mockStream = vi.fn();

// Mock the Anthropic SDK before imports
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
        stream: mockStream,
      };
    },
  };
});

// Import after mock setup
import { AnthropicClient } from '../../src/llm/anthropic.js';

/**
 * Helper to check if an error is a wrapped LLM refusal error.
 */
function isRefusalError(error: unknown): boolean {
  return error instanceof BellwetherError && error.code === 'LLM_REFUSED';
}

describe('AnthropicClient Refusal Detection', () => {
  let client: AnthropicClient;

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

    // Reset mocks
    mockCreate.mockReset();
    mockStream.mockReset();

    client = new AnthropicClient({ apiKey: 'test-key' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('stop_reason detection', () => {
    it('should throw refusal error when stop_reason is content_filter', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Some text' }],
        stop_reason: 'content_filter',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isRefusalError(error)).toBe(true);
        expect((error as BellwetherError).message).toContain('Content was filtered');
      }
    });

    it('should throw refusal error when stop_reason is safety', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Some text' }],
        stop_reason: 'safety',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isRefusalError(error)).toBe(true);
        expect((error as BellwetherError).message).toContain('safety concerns');
      }
    });

    it('should not throw when stop_reason is end_turn', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Normal response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const result = await client.chat([{ role: 'user', content: 'test' }]);
      expect(result).toBe('Normal response');
    });

    it('should not throw when stop_reason is max_tokens', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Truncated response' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 10, output_tokens: 100 },
      });

      const result = await client.chat([{ role: 'user', content: 'test' }]);
      expect(result).toBe('Truncated response');
    });
  });

  describe('content pattern detection', () => {
    const refusalPatterns: [string, string][] = [
      ['i cannot help with', 'I cannot help with that request.'],
      ['i am not able to', 'I am not able to assist with this.'],
      ["i can't assist with", "I can't assist with generating that content."],
      ['i cannot assist with', 'I cannot assist with this type of request.'],
      ['i am unable to', 'I am unable to provide that information.'],
      ["i won't be able to", "I won't be able to help with that."],
      ['i must decline', 'I must decline this request.'],
      ['i need to refuse', 'I need to refuse to engage with this topic.'],
      ['against my guidelines', 'This request goes against my guidelines.'],
      ['violates my ethical guidelines', 'This violates my ethical guidelines.'],
      ['goes against my values', 'That goes against my values as an AI.'],
      ['i cannot provide', 'I cannot provide that kind of content.'],
      ['i cannot generate', 'I cannot generate this type of content.'],
      ['harmful content', 'I will not create harmful content.'],
      ['dangerous content', 'Generating dangerous content is not something I do.'],
      ['illegal content', 'I refuse to produce illegal content.'],
    ];

    it.each(refusalPatterns)(
      'should detect refusal pattern: "%s"',
      async (pattern, text) => {
        mockCreate.mockResolvedValue({
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        });

        try {
          await client.chat([{ role: 'user', content: 'test' }]);
          expect.fail(`Should have thrown for pattern: ${pattern}`);
        } catch (error) {
          expect(isRefusalError(error)).toBe(true);
        }
      }
    );

    it('should be case-insensitive for pattern matching', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'I CANNOT HELP WITH that request.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isRefusalError(error)).toBe(true);
      }
    });

    it('should include context in error message', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'I am sorry, but I cannot help with generating malicious code.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isRefusalError(error)).toBe(true);
        expect((error as BellwetherError).message).toContain('Model declined');
        expect((error as BellwetherError).message).toContain('cannot help with');
      }
    });
  });

  describe('non-refusal responses', () => {
    it('should not flag normal helpful responses', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Here is how you can solve that problem: First, let me explain...' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 30 },
      });

      const result = await client.chat([{ role: 'user', content: 'How do I solve this?' }]);
      expect(result).toContain('Here is how you can solve that problem');
    });

    it('should not flag responses mentioning limitations in context', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'The API has limitations: it processes files up to 10MB.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const result = await client.chat([{ role: 'user', content: 'What are the API limits?' }]);
      expect(result).toContain('limitations');
    });

    it('should not flag normal responses about error handling', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Here is an example of good error handling for your application.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const result = await client.chat([{ role: 'user', content: 'test' }]);
      expect(result).toContain('error handling');
    });
  });

  describe('streaming refusal detection', () => {
    it('should detect refusal in streaming finalMessage', async () => {
      const mockStreamObj = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'I ' } };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'cannot ' } };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'help with that.' } };
        },
        finalMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'I cannot help with that.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      };

      mockStream.mockResolvedValue(mockStreamObj);

      try {
        await client.streamChat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isRefusalError(error)).toBe(true);
      }
    });

    it('should detect content_filter stop_reason in streaming', async () => {
      const mockStreamObj = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Starting...' } };
        },
        finalMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Starting...' }],
          stop_reason: 'content_filter',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      };

      mockStream.mockResolvedValue(mockStreamObj);

      try {
        await client.streamChat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isRefusalError(error)).toBe(true);
        expect((error as BellwetherError).message).toContain('Content was filtered');
      }
    });

    it('should allow normal streaming responses', async () => {
      const mockStreamObj = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello, ' } };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'how can I help?' } };
        },
        finalMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Hello, how can I help?' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      };

      mockStream.mockResolvedValue(mockStreamObj);

      const result = await client.streamChat([{ role: 'user', content: 'test' }]);
      expect(result.text).toBe('Hello, how can I help?');
      expect(result.completed).toBe(true);
    });
  });

  describe('error information', () => {
    it('should include provider info in error context', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'I cannot help with that.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      try {
        await client.chat([{ role: 'user', content: 'test' }]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isRefusalError(error)).toBe(true);
        expect((error as BellwetherError).context?.component).toBe('anthropic');
      }
    });

    it('should include model in error context', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'I cannot help with that.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      try {
        await client.chat([{ role: 'user', content: 'test' }], { model: 'claude-3-opus' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isRefusalError(error)).toBe(true);
        expect((error as BellwetherError).context?.metadata?.model).toBe('claude-3-opus');
      }
    });
  });
});
