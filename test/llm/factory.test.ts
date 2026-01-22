/**
 * Tests for LLM provider factory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLLMClient,
  detectProvider,
  createAutoClient,
  checkProviderAvailability,
  getDefaultModel,
  getSupportedProviders,
} from '../../src/llm/factory.js';
import type { LLMConfig, LLMProviderId } from '../../src/llm/client.js';
import { DEFAULT_MODELS } from '../../src/llm/client.js';

// Store original env vars to restore later
const originalEnv = { ...process.env };

describe('createLLMClient', () => {
  beforeEach(() => {
    // Reset env vars before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('OpenAI provider', () => {
    it('should create OpenAI client with API key', () => {
      const config: LLMConfig = {
        provider: 'openai',
        apiKey: 'test-openai-key',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
      expect(client.chat).toBeDefined();
      expect(client.complete).toBeDefined();
    });

    it('should use API key from environment variable', () => {
      process.env.OPENAI_API_KEY = 'env-openai-key';

      const config: LLMConfig = {
        provider: 'openai',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });

    it('should use custom environment variable for API key', () => {
      process.env.CUSTOM_OPENAI_KEY = 'custom-key';

      const config: LLMConfig = {
        provider: 'openai',
        apiKeyEnvVar: 'CUSTOM_OPENAI_KEY',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });

    it('should throw when custom env var is not set', () => {
      delete process.env.MISSING_KEY;

      const config: LLMConfig = {
        provider: 'openai',
        apiKeyEnvVar: 'MISSING_KEY',
      };

      expect(() => createLLMClient(config)).toThrow('Environment variable MISSING_KEY is not set');
    });

    it('should use custom model when provided', () => {
      const config: LLMConfig = {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4-turbo',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });

    it('should use custom base URL when provided', () => {
      const config: LLMConfig = {
        provider: 'openai',
        apiKey: 'test-key',
        baseUrl: 'https://custom-api.example.com/v1',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });

    it('should pass onUsage callback', () => {
      const onUsage = vi.fn();

      const config: LLMConfig = {
        provider: 'openai',
        apiKey: 'test-key',
        onUsage,
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });
  });

  describe('Anthropic provider', () => {
    it('should create Anthropic client with API key', () => {
      const config: LLMConfig = {
        provider: 'anthropic',
        apiKey: 'test-anthropic-key',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
      expect(client.chat).toBeDefined();
    });

    it('should use API key from environment variable', () => {
      process.env.ANTHROPIC_API_KEY = 'env-anthropic-key';

      const config: LLMConfig = {
        provider: 'anthropic',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });

    it('should use custom environment variable for API key', () => {
      process.env.CUSTOM_ANTHROPIC_KEY = 'custom-anthropic-key';

      const config: LLMConfig = {
        provider: 'anthropic',
        apiKeyEnvVar: 'CUSTOM_ANTHROPIC_KEY',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });

    it('should use custom model when provided', () => {
      const config: LLMConfig = {
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-opus-20240229',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });
  });

  describe('Ollama provider', () => {
    it('should create Ollama client without API key', () => {
      const config: LLMConfig = {
        provider: 'ollama',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
      expect(client.chat).toBeDefined();
    });

    it('should use custom base URL for Ollama', () => {
      const config: LLMConfig = {
        provider: 'ollama',
        baseUrl: 'http://custom-ollama:11434',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });

    it('should use custom model when provided', () => {
      const config: LLMConfig = {
        provider: 'ollama',
        model: 'llama3:70b',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });

    it('should work without any configuration', () => {
      const config: LLMConfig = {
        provider: 'ollama',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });
  });

  describe('unknown provider', () => {
    it('should throw for unknown provider', () => {
      const config = {
        provider: 'unknown-provider' as LLMProviderId,
      };

      expect(() => createLLMClient(config)).toThrow('Unknown LLM provider: unknown-provider');
    });
  });

  describe('API key precedence', () => {
    it('should prefer direct API key over environment variable', () => {
      process.env.OPENAI_API_KEY = 'env-key';

      const config: LLMConfig = {
        provider: 'openai',
        apiKey: 'direct-key',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
      // Direct key should be used (can't easily verify, but should not throw)
    });

    it('should prefer custom env var over default env var', () => {
      process.env.OPENAI_API_KEY = 'default-env-key';
      process.env.CUSTOM_KEY = 'custom-env-key';

      const config: LLMConfig = {
        provider: 'openai',
        apiKeyEnvVar: 'CUSTOM_KEY',
      };

      const client = createLLMClient(config);

      expect(client).toBeDefined();
    });
  });
});

describe('detectProvider', () => {
  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should detect Anthropic when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const provider = detectProvider();

    expect(provider).toBe('anthropic');
  });

  it('should detect OpenAI when only OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const provider = detectProvider();

    expect(provider).toBe('openai');
  });

  it('should prefer Anthropic over OpenAI when both are set', () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.OPENAI_API_KEY = 'openai-key';

    const provider = detectProvider();

    expect(provider).toBe('anthropic');
  });

  it('should fall back to Ollama when no API keys are set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const provider = detectProvider();

    expect(provider).toBe('ollama');
  });
});

describe('createAutoClient', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create client with auto-detected provider', () => {
    // With no API keys, should use Ollama
    const client = createAutoClient();

    expect(client).toBeDefined();
  });

  it('should use model override when provided', () => {
    const client = createAutoClient('custom-model');

    expect(client).toBeDefined();
  });

  it('should use default model when no override provided', () => {
    const client = createAutoClient();

    expect(client).toBeDefined();
  });

  it('should create OpenAI client when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const client = createAutoClient();

    expect(client).toBeDefined();
  });

  it('should create Anthropic client when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const client = createAutoClient();

    expect(client).toBeDefined();
  });
});

describe('checkProviderAvailability', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return availability for all providers', async () => {
    const results = await checkProviderAvailability();

    expect(results).toHaveLength(3);
    expect(results.map(r => r.provider)).toContain('openai');
    expect(results.map(r => r.provider)).toContain('anthropic');
    expect(results.map(r => r.provider)).toContain('ollama');
  });

  it('should mark OpenAI as available when API key is set', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const results = await checkProviderAvailability();
    const openai = results.find(r => r.provider === 'openai');

    expect(openai?.available).toBe(true);
    expect(openai?.reason).toBeUndefined();
  });

  it('should mark OpenAI as unavailable when API key is not set', async () => {
    delete process.env.OPENAI_API_KEY;

    const results = await checkProviderAvailability();
    const openai = results.find(r => r.provider === 'openai');

    expect(openai?.available).toBe(false);
    expect(openai?.reason).toBe('OPENAI_API_KEY not set');
  });

  it('should mark Anthropic as available when API key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const results = await checkProviderAvailability();
    const anthropic = results.find(r => r.provider === 'anthropic');

    expect(anthropic?.available).toBe(true);
  });

  it('should mark Anthropic as unavailable when API key is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const results = await checkProviderAvailability();
    const anthropic = results.find(r => r.provider === 'anthropic');

    expect(anthropic?.available).toBe(false);
    expect(anthropic?.reason).toBe('ANTHROPIC_API_KEY not set');
  });

  it('should check Ollama availability by testing connection', async () => {
    const results = await checkProviderAvailability();
    const ollama = results.find(r => r.provider === 'ollama');

    // Ollama availability depends on whether the server is running
    expect(ollama).toBeDefined();
    expect(typeof ollama?.available).toBe('boolean');
  });
});

describe('getDefaultModel', () => {
  it('should return default model for OpenAI', () => {
    const model = getDefaultModel('openai');

    expect(model).toBe(DEFAULT_MODELS.openai);
    expect(model).toBeDefined();
  });

  it('should return default model for Anthropic', () => {
    const model = getDefaultModel('anthropic');

    expect(model).toBe(DEFAULT_MODELS.anthropic);
    expect(model).toBeDefined();
  });

  it('should return default model for Ollama', () => {
    const model = getDefaultModel('ollama');

    expect(model).toBe(DEFAULT_MODELS.ollama);
    expect(model).toBeDefined();
  });
});

describe('getSupportedProviders', () => {
  it('should return list of all supported providers', () => {
    const providers = getSupportedProviders();

    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
    expect(providers).toContain('ollama');
    expect(providers).toHaveLength(3);
  });

  it('should return a new array each time', () => {
    const providers1 = getSupportedProviders();
    const providers2 = getSupportedProviders();

    expect(providers1).not.toBe(providers2);
    expect(providers1).toEqual(providers2);
  });
});

describe('DEFAULT_MODELS', () => {
  it('should have models defined for all providers', () => {
    expect(DEFAULT_MODELS.openai).toBeDefined();
    expect(DEFAULT_MODELS.anthropic).toBeDefined();
    expect(DEFAULT_MODELS.ollama).toBeDefined();
  });

  it('should have non-empty model names', () => {
    expect(DEFAULT_MODELS.openai.length).toBeGreaterThan(0);
    expect(DEFAULT_MODELS.anthropic.length).toBeGreaterThan(0);
    expect(DEFAULT_MODELS.ollama.length).toBeGreaterThan(0);
  });
});
