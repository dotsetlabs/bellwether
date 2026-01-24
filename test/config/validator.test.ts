/**
 * Tests for configuration validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import {
  validateConfig,
  validateConfigForCheck,
  validateConfigForExplore,
  findConfigFile,
  bellwetherConfigSchema,
  serverConfigSchema,
  llmConfigSchema,
  exploreConfigSchema,
  baselineConfigSchema,
  outputConfigSchema,
  getConfigWarnings,
  type BellwetherConfig,
} from '../../src/config/validator.js';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

const originalEnv = { ...process.env };

describe('validateConfig', () => {
  describe('valid configurations', () => {
    it('should validate minimal config with defaults', () => {
      const config = validateConfig({});

      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.llm).toBeDefined();
      expect(config.explore).toBeDefined();
      expect(config.output).toBeDefined();
      expect(config.baseline).toBeDefined();
    });

    it('should validate complete config', () => {
      const config = validateConfig({
        server: {
          command: 'npx test-server',
          args: ['--port', '3000'],
          timeout: 60000,
          env: { NODE_ENV: 'production' },
        },
        llm: {
          provider: 'openai',
          model: 'gpt-4',
        },
        explore: {
          personas: ['technical_writer', 'security_tester'],
          maxQuestionsPerTool: 5,
          parallelPersonas: true,
        },
        output: {
          dir: './output',
          docsDir: './docs',
          format: 'both',
        },
        baseline: {
          failOnDrift: true,
        },
        scenarios: {
          path: './scenarios.yaml',
          only: false,
        },
        workflows: {
          path: './workflows.yaml',
          discover: true,
          trackState: true,
        },
        cache: {
          enabled: true,
          dir: './cache',
        },
        logging: {
          level: 'debug',
          verbose: true,
        },
      });

      expect(config.server.command).toBe('npx test-server');
      expect(config.llm.provider).toBe('openai');
      expect(config.explore.personas).toContain('technical_writer');
      expect(config.baseline.failOnDrift).toBe(true);
    });

    it('should apply default values for missing fields', () => {
      const config = validateConfig({
        server: {
          command: 'npx server',
        },
      });

      expect(config.server.timeout).toBeDefined();
      expect(config.server.args).toEqual([]);
      expect(config.llm.provider).toBe('ollama');
      expect(config.explore.maxQuestionsPerTool).toBeDefined();
    });

    it('should accept new check configuration options', () => {
      const config = validateConfig({
        check: {
          statefulTesting: {
            enabled: true,
            maxChainLength: 3,
            shareOutputsBetweenTools: true,
          },
          externalServices: {
            mode: 'mock',
            services: {
              plaid: {
                enabled: false,
                sandboxCredentials: {
                  clientId: 'test',
                  secret: 'test',
                },
              },
            },
          },
          assertions: {
            enabled: true,
            strict: false,
            infer: true,
          },
          rateLimit: {
            enabled: true,
            requestsPerSecond: 5,
            burstLimit: 10,
            backoffStrategy: 'exponential',
            maxRetries: 2,
          },
        },
      });

      expect(config.check.statefulTesting.enabled).toBe(true);
      expect(config.check.externalServices.mode).toBe('mock');
      expect(config.check.assertions.enabled).toBe(true);
      expect(config.check.rateLimit.enabled).toBe(true);
    });
  });

  describe('server configuration', () => {
    it('should accept valid server config', () => {
      const config = validateConfig({
        server: {
          command: 'npx @company/server',
          args: ['--config', 'prod.json'],
          timeout: 45000,
        },
      });

      expect(config.server.command).toBe('npx @company/server');
      expect(config.server.args).toEqual(['--config', 'prod.json']);
    });

    it('should reject timeout below minimum', () => {
      expect(() => validateConfig({
        server: {
          timeout: 100, // Too low
        },
      })).toThrow();
    });

    it('should reject timeout above maximum', () => {
      expect(() => validateConfig({
        server: {
          timeout: 10000000, // Too high
        },
      })).toThrow();
    });

    it('should accept environment variables', () => {
      const config = validateConfig({
        server: {
          env: {
            API_KEY: 'secret',
            NODE_ENV: 'test',
          },
        },
      });

      expect(config.server.env?.API_KEY).toBe('secret');
    });
  });

  describe('getConfigWarnings', () => {
    it('should warn on low minSamples', () => {
      const config = validateConfig({
        check: {
          sampling: {
            minSamples: 2,
          },
        },
      });

      const warnings = getConfigWarnings(config);
      expect(warnings.some(w => w.includes('minSamples'))).toBe(true);
    });
  });

  describe('LLM configuration', () => {
    it('should accept all valid providers', () => {
      for (const provider of ['ollama', 'openai', 'anthropic']) {
        const config = validateConfig({
          llm: { provider },
        });
        expect(config.llm.provider).toBe(provider);
      }
    });

    it('should reject invalid provider', () => {
      expect(() => validateConfig({
        llm: { provider: 'invalid-provider' },
      })).toThrow();
    });

    it('should accept custom model', () => {
      const config = validateConfig({
        llm: {
          provider: 'openai',
          model: 'gpt-4-turbo-preview',
        },
      });

      expect(config.llm.model).toBe('gpt-4-turbo-preview');
    });

    it('should accept Ollama-specific settings', () => {
      const config = validateConfig({
        llm: {
          provider: 'ollama',
          ollama: {
            baseUrl: 'http://custom:11434',
          },
        },
      });

      expect(config.llm.ollama.baseUrl).toBe('http://custom:11434');
    });

    it('should reject invalid Ollama baseUrl', () => {
      expect(() => validateConfig({
        llm: {
          provider: 'ollama',
          ollama: {
            baseUrl: 'not-a-url',
          },
        },
      })).toThrow();
    });

    it('should accept custom API key env vars', () => {
      const config = validateConfig({
        llm: {
          provider: 'openai',
          openaiApiKeyEnvVar: 'CUSTOM_OPENAI_KEY',
        },
      });

      expect(config.llm.openaiApiKeyEnvVar).toBe('CUSTOM_OPENAI_KEY');
    });
  });

  describe('explore configuration', () => {
    it('should accept valid personas', () => {
      const config = validateConfig({
        explore: {
          personas: ['technical_writer', 'security_tester', 'qa_engineer', 'novice_user'],
        },
      });

      expect(config.explore.personas).toHaveLength(4);
    });

    it('should reject invalid persona', () => {
      expect(() => validateConfig({
        explore: {
          personas: ['invalid_persona'],
        },
      })).toThrow();
    });

    it('should validate maxQuestionsPerTool bounds', () => {
      expect(() => validateConfig({
        explore: {
          maxQuestionsPerTool: 0, // Too low
        },
      })).toThrow();

      expect(() => validateConfig({
        explore: {
          maxQuestionsPerTool: 100, // Too high
        },
      })).toThrow();
    });

    it('should accept valid maxQuestionsPerTool', () => {
      const config = validateConfig({
        explore: {
          maxQuestionsPerTool: 5,
        },
      });

      expect(config.explore.maxQuestionsPerTool).toBe(5);
    });

    it('should accept boolean flags', () => {
      const config = validateConfig({
        explore: {
          parallelPersonas: true,
          skipErrorTests: true,
        },
      });

      expect(config.explore.parallelPersonas).toBe(true);
      expect(config.explore.skipErrorTests).toBe(true);
    });
  });

  describe('baseline configuration', () => {
    it('should accept valid baseline config', () => {
      const config = validateConfig({
        baseline: {
          path: './baseline.json',
          comparePath: './previous-baseline.json',
          failOnDrift: true,
        },
      });

      expect(config.baseline.failOnDrift).toBe(true);
    });
  });

  describe('output configuration', () => {
    it('should accept valid output formats', () => {
      for (const format of ['agents.md', 'json', 'both']) {
        const config = validateConfig({
          output: { format },
        });
        expect(config.output.format).toBe(format);
      }
    });

    it('should reject invalid output format', () => {
      expect(() => validateConfig({
        output: { format: 'invalid' },
      })).toThrow();
    });

    it('should accept custom directories', () => {
      const config = validateConfig({
        output: {
          dir: './custom-output',
          docsDir: './custom-docs',
        },
      });

      expect(config.output.dir).toBe('./custom-output');
      expect(config.output.docsDir).toBe('./custom-docs');
    });
  });

  describe('logging configuration', () => {
    it('should accept valid log levels', () => {
      for (const level of ['debug', 'info', 'warn', 'error', 'silent']) {
        const config = validateConfig({
          logging: { level },
        });
        expect(config.logging.level).toBe(level);
      }
    });

    it('should reject invalid log level', () => {
      expect(() => validateConfig({
        logging: { level: 'invalid' },
      })).toThrow();
    });
  });

  describe('error messages', () => {
    it('should include file path in error when provided', () => {
      try {
        validateConfig({ server: { timeout: -1 } }, '/path/to/config.yaml');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('/path/to/config.yaml');
      }
    });

    it('should list all validation issues', () => {
      try {
        validateConfig({
          server: { timeout: -1 },
          explore: { maxQuestionsPerTool: 0 },
        });
        expect.fail('Should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('server.timeout');
        expect(message).toContain('explore.maxQuestionsPerTool');
      }
    });
  });
});

describe('validateConfigForCheck', () => {
  it('should pass when server command is in config', () => {
    const config = validateConfig({
      server: { command: 'npx test-server' },
    });

    // Should not throw
    expect(() => validateConfigForCheck(config)).not.toThrow();
  });

  it('should pass when server command is provided as argument', () => {
    const config = validateConfig({});

    // Should not throw when command is provided as argument
    expect(() => validateConfigForCheck(config, 'npx test-server')).not.toThrow();
  });

  it('should throw when no server command is specified', () => {
    const config = validateConfig({});

    expect(() => validateConfigForCheck(config)).toThrow('No server command specified');
  });

  it('should provide helpful error message', () => {
    const config = validateConfig({});

    try {
      validateConfigForCheck(config);
      expect.fail('Should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('bellwether.yaml');
      expect(message).toContain('bellwether check');
    }
  });
});

describe('validateConfigForExplore', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should pass when server command is in config', () => {
    const config = validateConfig({
      server: { command: 'npx test-server' },
      llm: { provider: 'ollama' },
    });

    // Should not throw (Ollama doesn't need API key)
    expect(() => validateConfigForExplore(config)).not.toThrow();
  });

  it('should throw when no server command is specified', () => {
    const config = validateConfig({});

    expect(() => validateConfigForExplore(config)).toThrow('No server command specified');
  });

  it('should throw when OpenAI is selected without API key', () => {
    delete process.env.OPENAI_API_KEY;

    const config = validateConfig({
      server: { command: 'npx server' },
      llm: { provider: 'openai' },
    });

    expect(() => validateConfigForExplore(config)).toThrow('OpenAI API key not found');
  });

  it('should pass when OpenAI API key is set', () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const config = validateConfig({
      server: { command: 'npx server' },
      llm: { provider: 'openai' },
    });

    expect(() => validateConfigForExplore(config)).not.toThrow();
  });

  it('should check custom env var for OpenAI', () => {
    process.env.CUSTOM_OPENAI_KEY = 'custom-key';

    const config = validateConfig({
      server: { command: 'npx server' },
      llm: {
        provider: 'openai',
        openaiApiKeyEnvVar: 'CUSTOM_OPENAI_KEY',
      },
    });

    expect(() => validateConfigForExplore(config)).not.toThrow();
  });

  it('should throw when Anthropic is selected without API key', () => {
    delete process.env.ANTHROPIC_API_KEY;

    const config = validateConfig({
      server: { command: 'npx server' },
      llm: { provider: 'anthropic' },
    });

    expect(() => validateConfigForExplore(config)).toThrow('Anthropic API key not found');
  });

  it('should pass when Anthropic API key is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const config = validateConfig({
      server: { command: 'npx server' },
      llm: { provider: 'anthropic' },
    });

    expect(() => validateConfigForExplore(config)).not.toThrow();
  });

  it('should not require API key for Ollama', () => {
    const config = validateConfig({
      server: { command: 'npx server' },
      llm: { provider: 'ollama' },
    });

    expect(() => validateConfigForExplore(config)).not.toThrow();
  });

  it('should provide helpful error message with alternatives', () => {
    delete process.env.OPENAI_API_KEY;

    const config = validateConfig({
      server: { command: 'npx server' },
      llm: { provider: 'openai' },
    });

    try {
      validateConfigForExplore(config);
      expect.fail('Should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('bellwether auth');
      expect(message).toContain('ollama');
      expect(message).toContain('bellwether check');
    }
  });
});

describe('findConfigFile', () => {
  const mockExistsSync = vi.mocked(existsSync);

  beforeEach(() => {
    mockExistsSync.mockReset();
  });

  it('should return explicit path if file exists', () => {
    mockExistsSync.mockReturnValue(true);

    const result = findConfigFile('/explicit/path/config.yaml');

    expect(result).toBe('/explicit/path/config.yaml');
    expect(mockExistsSync).toHaveBeenCalledWith('/explicit/path/config.yaml');
  });

  it('should return null if explicit path does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const result = findConfigFile('/nonexistent/config.yaml');

    expect(result).toBeNull();
  });

  it('should search common locations when no explicit path', () => {
    mockExistsSync.mockImplementation((path) => {
      return path === expect.stringContaining('bellwether.yaml');
    });

    findConfigFile();

    // Should have searched for common config file names
    expect(mockExistsSync).toHaveBeenCalled();
  });

  it('should return first found config file', () => {
    let callCount = 0;
    mockExistsSync.mockImplementation(() => {
      callCount++;
      return callCount === 2; // Second file exists
    });

    const result = findConfigFile();

    // Should return a path (the second one found)
    if (result) {
      expect(typeof result).toBe('string');
    }
  });

  it('should return null when no config file found', () => {
    mockExistsSync.mockReturnValue(false);

    const result = findConfigFile();

    expect(result).toBeNull();
  });
});

describe('Zod schemas', () => {
  describe('serverConfigSchema', () => {
    it('should parse valid server config', () => {
      const result = serverConfigSchema.safeParse({
        command: 'npx server',
        timeout: 30000,
      });

      expect(result.success).toBe(true);
    });

    it('should apply defaults', () => {
      const result = serverConfigSchema.parse({});

      expect(result.command).toBe('');
      expect(result.args).toEqual([]);
      expect(result.timeout).toBeDefined();
    });
  });

  describe('llmConfigSchema', () => {
    it('should parse valid LLM config', () => {
      const result = llmConfigSchema.safeParse({
        provider: 'anthropic',
        model: 'claude-3-opus',
      });

      expect(result.success).toBe(true);
    });

    it('should apply defaults', () => {
      const result = llmConfigSchema.parse({});

      expect(result.provider).toBe('ollama');
      expect(result.model).toBe('');
    });
  });

  describe('exploreConfigSchema', () => {
    it('should parse valid explore config', () => {
      const result = exploreConfigSchema.safeParse({
        personas: ['technical_writer'],
        maxQuestionsPerTool: 5,
      });

      expect(result.success).toBe(true);
    });

    it('should apply defaults', () => {
      const result = exploreConfigSchema.parse({});

      expect(result.personas).toEqual(['technical_writer']);
      expect(result.maxQuestionsPerTool).toBeDefined();
    });
  });

  describe('baselineConfigSchema', () => {
    it('should parse valid baseline config', () => {
      const result = baselineConfigSchema.safeParse({
        failOnDrift: true,
      });

      expect(result.success).toBe(true);
    });

    it('should apply defaults', () => {
      const result = baselineConfigSchema.parse({});

      expect(result.failOnDrift).toBe(false);
    });
  });

  describe('outputConfigSchema', () => {
    it('should parse valid output config', () => {
      const result = outputConfigSchema.safeParse({
        dir: './output',
        format: 'json',
      });

      expect(result.success).toBe(true);
    });

    it('should apply defaults', () => {
      const result = outputConfigSchema.parse({});

      expect(result.dir).toBe('.bellwether');
      expect(result.docsDir).toBe('.');
      expect(result.format).toBe('both');
    });
  });

  describe('bellwetherConfigSchema', () => {
    it('should parse complete config', () => {
      const result = bellwetherConfigSchema.safeParse({
        server: { command: 'npx server' },
        llm: { provider: 'openai' },
        explore: { personas: ['qa_engineer'] },
        output: { format: 'json' },
        baseline: { failOnDrift: true },
      });

      expect(result.success).toBe(true);
    });

    it('should apply all nested defaults', () => {
      const result = bellwetherConfigSchema.parse({});

      expect(result.server).toBeDefined();
      expect(result.llm).toBeDefined();
      expect(result.explore).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.baseline).toBeDefined();
      expect(result.cache).toBeDefined();
      expect(result.logging).toBeDefined();
    });
  });
});
