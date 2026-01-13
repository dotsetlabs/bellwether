import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadConfig,
  generateDefaultConfig,
  DEFAULT_CONFIG,
} from '../../src/config/loader.js';

describe('config/loader', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Create a temporary directory for tests
    testDir = join(tmpdir(), `bellwether-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadConfig', () => {
    it('should return default config when no config file exists', () => {
      const config = loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should load config from explicit path', () => {
      const configPath = join(testDir, 'custom-config.yaml');
      writeFileSync(
        configPath,
        `
version: 1
llm:
  provider: openai
  model: gpt-4-turbo
interview:
  maxQuestionsPerTool: 5
`
      );

      const config = loadConfig(configPath);

      expect(config.llm.model).toBe('gpt-4-turbo');
      expect(config.interview.maxQuestionsPerTool).toBe(5);
      // Should still have defaults for unspecified fields
      expect(config.interview.timeout).toBe(DEFAULT_CONFIG.interview.timeout);
    });

    it('should throw error for non-existent explicit path', () => {
      expect(() => loadConfig('/nonexistent/path/config.yaml')).toThrow(
        'Config file not found'
      );
    });

    it('should find bellwether.yaml in current directory', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
version: 1
llm:
  model: gpt-3.5-turbo
`
      );

      const config = loadConfig();
      expect(config.llm.model).toBe('gpt-3.5-turbo');
    });

    it('should find bellwether.yml in current directory', () => {
      writeFileSync(
        join(testDir, 'bellwether.yml'),
        `
version: 1
interview:
  timeout: 60000
`
      );

      const config = loadConfig();
      expect(config.interview.timeout).toBe(60000);
    });

    it('should find .bellwether.yaml (dotfile) in current directory', () => {
      writeFileSync(
        join(testDir, '.bellwether.yaml'),
        `
version: 1
output:
  format: json
`
      );

      const config = loadConfig();
      expect(config.output.format).toBe('json');
    });

    it('should prefer bellwether.yaml over bellwether.yml', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
llm:
  model: preferred-model
`
      );
      writeFileSync(
        join(testDir, 'bellwether.yml'),
        `
llm:
  model: other-model
`
      );

      const config = loadConfig();
      expect(config.llm.model).toBe('preferred-model');
    });

    it('should merge nested config with defaults', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
version: 1
interview:
  maxQuestionsPerTool: 10
`
      );

      const config = loadConfig();

      // Specified value
      expect(config.interview.maxQuestionsPerTool).toBe(10);
      // Defaults for unspecified values
      expect(config.interview.timeout).toBe(DEFAULT_CONFIG.interview.timeout);
      expect(config.interview.skipErrorTests).toBe(DEFAULT_CONFIG.interview.skipErrorTests);
      expect(config.llm.provider).toBe(DEFAULT_CONFIG.llm.provider);
      expect(config.llm.model).toBe(DEFAULT_CONFIG.llm.model);
    });

    it('should handle empty config file gracefully', () => {
      writeFileSync(join(testDir, 'bellwether.yaml'), '');

      // Empty YAML parses to null, loader should return defaults
      const config = loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should handle config with only version', () => {
      writeFileSync(join(testDir, 'bellwether.yaml'), 'version: 2');

      const config = loadConfig();
      expect(config.version).toBe(2);
      expect(config.llm).toEqual(DEFAULT_CONFIG.llm);
    });

    it('should handle output format variations', () => {
      const formats = ['agents.md', 'json', 'both'] as const;

      for (const format of formats) {
        writeFileSync(
          join(testDir, 'bellwether.yaml'),
          `
output:
  format: ${format}
`
        );

        const config = loadConfig();
        expect(config.output.format).toBe(format);
      }
    });

    it('should parse apiKeyEnvVar', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
llm:
  apiKeyEnvVar: CUSTOM_API_KEY
`
      );

      const config = loadConfig();
      expect(config.llm.apiKeyEnvVar).toBe('CUSTOM_API_KEY');
    });

    it('should parse outputDir', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
output:
  outputDir: ./my-docs
`
      );

      const config = loadConfig();
      expect(config.output.outputDir).toBe('./my-docs');
    });

    it('should handle skipErrorTests boolean', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
interview:
  skipErrorTests: true
`
      );

      const config = loadConfig();
      expect(config.interview.skipErrorTests).toBe(true);
    });
  });

  describe('generateDefaultConfig', () => {
    it('should generate valid YAML', () => {
      const yaml = generateDefaultConfig();

      expect(yaml).toContain('version: 1');
      expect(yaml).toContain('provider: openai');
      expect(yaml).toContain('model: gpt-4o');
      expect(yaml).toContain('maxQuestionsPerTool: 3');
      expect(yaml).toContain('timeout: 30000');
      expect(yaml).toContain('format: agents.md');
    });

    it('should include commented options', () => {
      const yaml = generateDefaultConfig();

      expect(yaml).toContain('# apiKeyEnvVar');
      expect(yaml).toContain('# skipErrorTests');
      expect(yaml).toContain('# outputDir');
    });

    it('should be parseable and loadable', () => {
      const yaml = generateDefaultConfig();
      writeFileSync(join(testDir, 'bellwether.yaml'), yaml);

      const config = loadConfig();
      expect(config.version).toBe(1);
      expect(config.llm.model).toBe('gpt-4o');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CONFIG.version).toBe(1);
      // Provider is auto-detected based on environment
      expect(['openai', 'anthropic', 'ollama']).toContain(DEFAULT_CONFIG.llm.provider);
      expect(DEFAULT_CONFIG.llm.model).toBeDefined();
      expect(DEFAULT_CONFIG.interview.maxQuestionsPerTool).toBe(3);
      expect(DEFAULT_CONFIG.interview.timeout).toBe(30000);
      expect(DEFAULT_CONFIG.interview.skipErrorTests).toBe(false);
      expect(DEFAULT_CONFIG.output.format).toBe('agents.md');
    });

    it('should not have undefined required fields', () => {
      expect(DEFAULT_CONFIG.llm.provider).toBeDefined();
      expect(DEFAULT_CONFIG.llm.model).toBeDefined();
      expect(DEFAULT_CONFIG.interview.maxQuestionsPerTool).toBeDefined();
      expect(DEFAULT_CONFIG.interview.timeout).toBeDefined();
      expect(DEFAULT_CONFIG.output.format).toBeDefined();
    });
  });
});
