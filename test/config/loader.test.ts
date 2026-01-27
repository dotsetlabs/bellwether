import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadConfig,
  ConfigNotFoundError,
  parseCommandString,
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
    it('should throw ConfigNotFoundError when no config file exists', () => {
      expect(() => loadConfig()).toThrow(ConfigNotFoundError);
    });

    it('should load config from explicit path', () => {
      const configPath = join(testDir, 'custom-config.yaml');
      writeFileSync(
        configPath,
        `
llm:
  provider: openai
  model: gpt-4-turbo
explore:
  maxQuestionsPerTool: 5
`
      );

      const config = loadConfig(configPath);

      expect(config.llm.model).toBe('gpt-4-turbo');
      expect(config.explore.maxQuestionsPerTool).toBe(5);
    });

    it('should throw error for non-existent explicit path', () => {
      expect(() => loadConfig('/nonexistent/path/config.yaml')).toThrow(
        ConfigNotFoundError
      );
    });

    it('should find bellwether.yaml in current directory', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
llm:
  provider: anthropic
  model: claude-haiku-4-5
`
      );

      const config = loadConfig();
      expect(config.llm.model).toBe('claude-haiku-4-5');
      expect(config.llm.provider).toBe('anthropic');
    });

    it('should find bellwether.yml in current directory', () => {
      writeFileSync(
        join(testDir, 'bellwether.yml'),
        `
server:
  timeout: 60000
`
      );

      const config = loadConfig();
      expect(config.server.timeout).toBe(60000);
    });

    it('should find .bellwether.yaml (dotfile) in current directory', () => {
      writeFileSync(
        join(testDir, '.bellwether.yaml'),
        `
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

    it('should apply defaults for unspecified values', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
explore:
  maxQuestionsPerTool: 10
`
      );

      const config = loadConfig();

      // Specified value
      expect(config.explore.maxQuestionsPerTool).toBe(10);
      // Defaults for unspecified values
      expect(config.server.timeout).toBe(30000);
      expect(config.llm.provider).toBe('ollama');
      expect(config.cache.enabled).toBe(true);
    });

    it('should handle empty config file gracefully', () => {
      writeFileSync(join(testDir, 'bellwether.yaml'), '');

      // Empty YAML parses to null, loader should apply defaults
      const config = loadConfig();
      expect(config.llm.provider).toBe('ollama');
    });

    it('should handle config with defaults', () => {
      writeFileSync(join(testDir, 'bellwether.yaml'), 'llm:\n  provider: openai');

      const config = loadConfig();
      expect(config.llm.provider).toBe('openai');
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

    it('should parse server configuration', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
server:
  command: npx @mcp/my-server
  args:
    - --verbose
  timeout: 45000
`
      );

      const config = loadConfig();
      expect(config.server.command).toBe('npx @mcp/my-server');
      expect(config.server.args).toEqual(['--verbose']);
      expect(config.server.timeout).toBe(45000);
    });

    it('should parse baseline configuration', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
baseline:
  failOnDrift: true
`
      );

      const config = loadConfig();
      expect(config.baseline.failOnDrift).toBe(true);
    });

    it('should handle skipErrorTests boolean', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
explore:
  skipErrorTests: true
`
      );

      const config = loadConfig();
      expect(config.explore.skipErrorTests).toBe(true);
    });

    it('should reject config with API keys stored directly', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
llm:
  provider: openai
  apiKey: sk-secret-key
`
      );

      expect(() => loadConfig()).toThrow(/Security Error.*API key/);
    });

    it('should parse personas as array', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
explore:
  personas:
    - technical_writer
    - security_tester
`
      );

      const config = loadConfig();
      expect(config.explore.personas).toEqual(['technical_writer', 'security_tester']);
    });

    it('should parse cache configuration', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
cache:
  enabled: false
  dir: .custom-cache
`
      );

      const config = loadConfig();
      expect(config.cache.enabled).toBe(false);
      expect(config.cache.dir).toBe('.custom-cache');
    });

    it('should parse logging configuration', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
logging:
  level: debug
  verbose: true
`
      );

      const config = loadConfig();
      expect(config.logging.level).toBe('debug');
      expect(config.logging.verbose).toBe(true);
    });

    it('should validate provider values', () => {
      writeFileSync(
        join(testDir, 'bellwether.yaml'),
        `
llm:
  provider: invalid-provider
`
      );

      expect(() => loadConfig()).toThrow();
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

  describe('parseCommandString', () => {
    it('should parse simple command with no args', () => {
      const result = parseCommandString('npx');
      expect(result.command).toBe('npx');
      expect(result.args).toEqual([]);
    });

    it('should parse command with single argument', () => {
      const result = parseCommandString('npx @gitkraken/gk@latest');
      expect(result.command).toBe('npx');
      expect(result.args).toEqual(['@gitkraken/gk@latest']);
    });

    it('should parse command with multiple arguments', () => {
      const result = parseCommandString('node ./server.js --port 3000');
      expect(result.command).toBe('node');
      expect(result.args).toEqual(['./server.js', '--port', '3000']);
    });

    it('should handle double-quoted arguments with spaces', () => {
      const result = parseCommandString('my-cmd "path with spaces"');
      expect(result.command).toBe('my-cmd');
      expect(result.args).toEqual(['path with spaces']);
    });

    it('should handle single-quoted arguments with spaces', () => {
      const result = parseCommandString("my-cmd 'path with spaces'");
      expect(result.command).toBe('my-cmd');
      expect(result.args).toEqual(['path with spaces']);
    });

    it('should handle mixed quoted and unquoted arguments', () => {
      const result = parseCommandString('cmd arg1 "arg 2" arg3');
      expect(result.command).toBe('cmd');
      expect(result.args).toEqual(['arg1', 'arg 2', 'arg3']);
    });

    it('should handle escaped quotes inside quotes', () => {
      const result = parseCommandString('cmd "say \\"hello\\""');
      expect(result.command).toBe('cmd');
      expect(result.args).toEqual(['say "hello"']);
    });

    it('should handle empty string', () => {
      const result = parseCommandString('');
      expect(result.command).toBe('');
      expect(result.args).toEqual([]);
    });

    it('should handle multiple spaces between arguments', () => {
      const result = parseCommandString('cmd   arg1    arg2');
      expect(result.command).toBe('cmd');
      expect(result.args).toEqual(['arg1', 'arg2']);
    });

    it('should handle command with flags (npx -y pattern)', () => {
      const result = parseCommandString('npx -y @package/name');
      expect(result.command).toBe('npx');
      expect(result.args).toEqual(['-y', '@package/name']);
    });

    it('should handle complex npx command', () => {
      const result = parseCommandString('npx -y @modelcontextprotocol/server-filesystem /tmp');
      expect(result.command).toBe('npx');
      expect(result.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp']);
    });
  });
});
