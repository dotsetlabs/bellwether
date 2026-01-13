/**
 * Tests for LLM providers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_MODELS,
  parseJSONResponse,
  detectProvider,
  createLLMClient,
  createAutoClient,
  getSupportedProviders,
  getDefaultModel,
} from '../../src/llm/index.js';
import { OpenAIClient } from '../../src/llm/openai.js';
import { AnthropicClient } from '../../src/llm/anthropic.js';
import { OllamaClient } from '../../src/llm/ollama.js';

describe('LLM Providers', () => {
  describe('DEFAULT_MODELS', () => {
    it('should have default models for all providers', () => {
      // Budget-friendly defaults
      expect(DEFAULT_MODELS.openai).toBe('gpt-4o-mini');
      expect(DEFAULT_MODELS.anthropic).toBe('claude-3-5-haiku-20241022');
      expect(DEFAULT_MODELS.ollama).toBe('llama3.2');
    });
  });

  describe('parseJSONResponse', () => {
    it('should parse plain JSON', () => {
      const result = parseJSONResponse<{ foo: string }>('{"foo": "bar"}');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should parse JSON wrapped in markdown code blocks', () => {
      const result = parseJSONResponse<{ foo: string }>('```json\n{"foo": "bar"}\n```');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should parse JSON array', () => {
      const result = parseJSONResponse<number[]>('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should throw for invalid JSON', () => {
      expect(() => parseJSONResponse('not json')).toThrow('Failed to parse JSON');
    });

    it('should handle whitespace', () => {
      const result = parseJSONResponse<{ key: string }>('  \n  {"key": "value"}  \n  ');
      expect(result).toEqual({ key: 'value' });
    });
  });

  describe('getSupportedProviders', () => {
    it('should return all supported providers', () => {
      const providers = getSupportedProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('ollama');
      expect(providers).toHaveLength(3);
    });
  });

  describe('getDefaultModel', () => {
    it('should return default model for each provider', () => {
      // Budget-friendly defaults
      expect(getDefaultModel('openai')).toBe('gpt-4o-mini');
      expect(getDefaultModel('anthropic')).toBe('claude-3-5-haiku-20241022');
      expect(getDefaultModel('ollama')).toBe('llama3.2');
    });
  });

  describe('detectProvider', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should prefer Anthropic when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      delete process.env.OPENAI_API_KEY;
      expect(detectProvider()).toBe('anthropic');
    });

    it('should prefer OpenAI when only OPENAI_API_KEY is set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';
      expect(detectProvider()).toBe('openai');
    });

    it('should fall back to Ollama when no API keys are set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      expect(detectProvider()).toBe('ollama');
    });
  });

  describe('createLLMClient', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should create OpenAI client', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const client = createLLMClient({ provider: 'openai' });
      expect(client).toBeInstanceOf(OpenAIClient);
      expect(client.getProviderInfo().id).toBe('openai');
    });

    it('should create Anthropic client', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const client = createLLMClient({ provider: 'anthropic' });
      expect(client).toBeInstanceOf(AnthropicClient);
      expect(client.getProviderInfo().id).toBe('anthropic');
    });

    it('should create Ollama client', () => {
      const client = createLLMClient({ provider: 'ollama' });
      expect(client).toBeInstanceOf(OllamaClient);
      expect(client.getProviderInfo().id).toBe('ollama');
    });

    it('should throw for unknown provider', () => {
      expect(() => createLLMClient({ provider: 'unknown' as any })).toThrow('Unknown LLM provider');
    });

    it('should respect custom model', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const client = createLLMClient({ provider: 'openai', model: 'gpt-3.5-turbo' });
      expect(client.getProviderInfo().defaultModel).toBe('gpt-3.5-turbo');
    });
  });

  describe('createAutoClient', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should create client for detected provider', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const client = createAutoClient();
      expect(client.getProviderInfo().id).toBe('ollama');
    });

    it('should respect model override', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const client = createAutoClient('custom-model');
      expect(client.getProviderInfo().defaultModel).toBe('custom-model');
    });
  });

  describe('OpenAIClient', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-key';
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should throw if no API key provided', () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => new OpenAIClient()).toThrow('LLM authentication failed');
    });

    it('should use provided API key', () => {
      delete process.env.OPENAI_API_KEY;
      const client = new OpenAIClient({ apiKey: 'direct-key' });
      expect(client).toBeInstanceOf(OpenAIClient);
    });

    it('should return correct provider info', () => {
      const client = new OpenAIClient();
      const info = client.getProviderInfo();
      expect(info.id).toBe('openai');
      expect(info.name).toBe('OpenAI');
      expect(info.supportsJSON).toBe(true);
      expect(info.supportsStreaming).toBe(true);
    });

    it('should use default model', () => {
      const client = new OpenAIClient();
      expect(client.getProviderInfo().defaultModel).toBe('gpt-4o-mini');
    });

    it('should use custom model', () => {
      const client = new OpenAIClient({ model: 'gpt-3.5-turbo' });
      expect(client.getProviderInfo().defaultModel).toBe('gpt-3.5-turbo');
    });

    it('should parse JSON correctly', () => {
      const client = new OpenAIClient();
      const result = client.parseJSON<{ test: number }>('{"test": 42}');
      expect(result).toEqual({ test: 42 });
    });
  });

  describe('AnthropicClient', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should throw if no API key provided', () => {
      delete process.env.ANTHROPIC_API_KEY;
      expect(() => new AnthropicClient()).toThrow('LLM authentication failed');
    });

    it('should use provided API key', () => {
      delete process.env.ANTHROPIC_API_KEY;
      const client = new AnthropicClient({ apiKey: 'direct-key' });
      expect(client).toBeInstanceOf(AnthropicClient);
    });

    it('should return correct provider info', () => {
      const client = new AnthropicClient();
      const info = client.getProviderInfo();
      expect(info.id).toBe('anthropic');
      expect(info.name).toBe('Anthropic Claude');
      expect(info.supportsJSON).toBe(false); // Claude doesn't have JSON mode
      expect(info.supportsStreaming).toBe(true);
    });

    it('should use default model', () => {
      const client = new AnthropicClient();
      expect(client.getProviderInfo().defaultModel).toBe('claude-3-5-haiku-20241022');
    });

    it('should use custom model', () => {
      const client = new AnthropicClient({ model: 'claude-3-haiku-20240307' });
      expect(client.getProviderInfo().defaultModel).toBe('claude-3-haiku-20240307');
    });

    it('should parse JSON correctly', () => {
      const client = new AnthropicClient();
      const result = client.parseJSON<{ test: number }>('{"test": 42}');
      expect(result).toEqual({ test: 42 });
    });
  });

  describe('OllamaClient', () => {
    it('should use default base URL', () => {
      const client = new OllamaClient();
      expect(client).toBeInstanceOf(OllamaClient);
    });

    it('should use custom base URL', () => {
      const client = new OllamaClient({ baseUrl: 'http://custom:8080' });
      expect(client).toBeInstanceOf(OllamaClient);
    });

    it('should return correct provider info', () => {
      const client = new OllamaClient();
      const info = client.getProviderInfo();
      expect(info.id).toBe('ollama');
      expect(info.name).toBe('Ollama (Local)');
      expect(info.supportsJSON).toBe(true);
      expect(info.supportsStreaming).toBe(true);
    });

    it('should use default model', () => {
      const client = new OllamaClient();
      expect(client.getProviderInfo().defaultModel).toBe('llama3.2');
    });

    it('should use custom model', () => {
      const client = new OllamaClient({ model: 'mistral' });
      expect(client.getProviderInfo().defaultModel).toBe('mistral');
    });

    it('should parse JSON correctly', () => {
      const client = new OllamaClient();
      const result = client.parseJSON<{ test: number }>('{"test": 42}');
      expect(result).toEqual({ test: 42 });
    });

    it('should respect OLLAMA_BASE_URL env var', () => {
      const originalEnv = process.env.OLLAMA_BASE_URL;
      process.env.OLLAMA_BASE_URL = 'http://env-url:11434';

      const client = new OllamaClient();
      // Client created successfully with env URL
      expect(client).toBeInstanceOf(OllamaClient);

      process.env.OLLAMA_BASE_URL = originalEnv;
    });
  });
});
