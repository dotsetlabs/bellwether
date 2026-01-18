import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadConfigNew,
  ConfigNotFoundError,
  CONFIG_NAMES,
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

  describe('loadConfigNew', () => {
    it('should throw ConfigNotFoundError when no config file exists', () => {
      expect(() => loadConfigNew()).toThrow(ConfigNotFoundError);
    });

    it('should load config from explicit path', () => {
      const configPath = join(testDir, 'custom-config.yaml');
      writeFileSync(
        configPath,
        `
mode: structural
llm:
  provider: openai
  model: gpt-4-turbo
test:
  maxQuestionsPerTool: 5
`
      );

      const config = loadConfigNew(configPath);

      expect(config.llm.model).toBe('gpt-4-turbo');
      expect(config.test.maxQuestionsPerTool).toBe(5);
      expect(config.mode).toBe('structural');
    });

    it('should throw error for non-existent explicit path', () => {
      expect(() => loadConfigNew('/nonexistent/path/config.yaml')).toThrow(
        ConfigNotFoundError
      );
    });

    it('should find bellwether.yaml in current directory', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: full
llm:
  provider: anthropic
  model: claude-haiku-4-5
`
      );

      const config = loadConfigNew();
      expect(config.llm.model).toBe('claude-haiku-4-5');
      expect(config.llm.provider).toBe('anthropic');
    });

    it('should find bellwether.yml in current directory', () => {
      writeFileSync(
        join(testDir, 'bellwether.yml'),
        `
mode: structural
server:
  timeout: 60000
`
      );

      const config = loadConfigNew();
      expect(config.server.timeout).toBe(60000);
    });

    it('should find .bellwether.yaml (dotfile) in current directory', () => {
      writeFileSync(
        join(testDir, '.bellwether.yaml'),
        `
mode: structural
output:
  format: json
`
      );

      const config = loadConfigNew();
      expect(config.output.format).toBe('json');
    });

    it('should prefer bellwether.yaml over bellwether.yml', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: structural
llm:
  model: preferred-model
`
      );
      writeFileSync(
        join(testDir, 'bellwether.yml'),
        `
mode: structural
llm:
  model: other-model
`
      );

      const config = loadConfigNew();
      expect(config.llm.model).toBe('preferred-model');
    });

    it('should apply defaults for unspecified values', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: full
test:
  maxQuestionsPerTool: 10
`
      );

      const config = loadConfigNew();

      // Specified value
      expect(config.test.maxQuestionsPerTool).toBe(10);
      // Defaults for unspecified values
      expect(config.server.timeout).toBe(30000);
      expect(config.llm.provider).toBe('ollama');
      expect(config.cache.enabled).toBe(true);
    });

    it('should handle empty config file gracefully', () => {
      writeFileSync(join(testDir, 'bellwether.yaml'), '');

      // Empty YAML parses to null, loader should apply defaults
      const config = loadConfigNew();
      expect(config.mode).toBe('structural');
      expect(config.llm.provider).toBe('ollama');
    });

    it('should handle config with only mode', () => {
      writeFileSync(join(testDir, 'bellwether.yaml'), 'mode: full');

      const config = loadConfigNew();
      expect(config.mode).toBe('full');
      expect(config.llm.provider).toBe('ollama');
    });

    it('should handle output format variations', () => {
      const formats = ['agents.md', 'json', 'both'] as const;

      for (const format of formats) {
        writeFileSync(
          join(testDir, 'bellwether.yaml'),
          `
mode: structural
output:
  format: ${format}
`
        );

        const config = loadConfigNew();
        expect(config.output.format).toBe(format);
      }
    });

    it('should parse server configuration', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: structural
server:
  command: npx @mcp/my-server
  args:
    - --verbose
  timeout: 45000
`
      );

      const config = loadConfigNew();
      expect(config.server.command).toBe('npx @mcp/my-server');
      expect(config.server.args).toEqual(['--verbose']);
      expect(config.server.timeout).toBe(45000);
    });

    it('should parse baseline configuration', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: structural
baseline:
  failOnDrift: true
  minConfidence: 50
  confidenceThreshold: 90
`
      );

      const config = loadConfigNew();
      expect(config.baseline.failOnDrift).toBe(true);
      expect(config.baseline.minConfidence).toBe(50);
      expect(config.baseline.confidenceThreshold).toBe(90);
    });

    it('should handle skipErrorTests boolean', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: full
test:
  skipErrorTests: true
`
      );

      const config = loadConfigNew();
      expect(config.test.skipErrorTests).toBe(true);
    });

    it('should reject config with API keys stored directly', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: full
llm:
  provider: openai
  apiKey: sk-secret-key
`
      );

      expect(() => loadConfigNew()).toThrow(/Security Error.*API key/);
    });

    it('should parse personas as array', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: full
test:
  personas:
    - technical_writer
    - security_tester
`
      );

      const config = loadConfigNew();
      expect(config.test.personas).toEqual(['technical_writer', 'security_tester']);
    });

    it('should parse cache configuration', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: structural
cache:
  enabled: false
  dir: .custom-cache
`
      );

      const config = loadConfigNew();
      expect(config.cache.enabled).toBe(false);
      expect(config.cache.dir).toBe('.custom-cache');
    });

    it('should parse logging configuration', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: structural
logging:
  level: debug
  verbose: true
`
      );

      const config = loadConfigNew();
      expect(config.logging.level).toBe('debug');
      expect(config.logging.verbose).toBe(true);
    });

    it('should validate mode values', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: invalid-mode
`
      );

      expect(() => loadConfigNew()).toThrow();
    });

    it('should validate provider values', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
mode: full
llm:
  provider: invalid-provider
`
      );

      expect(() => loadConfigNew()).toThrow();
    });
  });

  describe('CONFIG_NAMES', () => {
    it('should include expected config file names', () => {
      expect(CONFIG_NAMES).toContain('bellwether.yaml');
      expect(CONFIG_NAMES).toContain('bellwether.yml');
      expect(CONFIG_NAMES).toContain('.bellwether.yaml');
      expect(CONFIG_NAMES).toContain('.bellwether.yml');
    });
  });

  describe('ConfigNotFoundError', () => {
    it('should have helpful error message', () => {
      const error = new ConfigNotFoundError();
      expect(error.message).toContain('bellwether init');
      expect(error.name).toBe('ConfigNotFoundError');
    });

    it('should include searched paths when provided', () => {
      const paths = ['/path/one', '/path/two'];
      const error = new ConfigNotFoundError(paths);
      expect(error.message).toContain('/path/one');
      expect(error.message).toContain('/path/two');
    });
  });
});
