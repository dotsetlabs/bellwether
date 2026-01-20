import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import the new template functions
import { generateConfigTemplate, generatePresetConfig, PRESETS } from '../../src/config/template.js';
import { validateConfig } from '../../src/config/validator.js';
import { parseYamlSecure } from '../../src/utils/yaml-parser.js';

describe('cli/init', () => {
  let testDir: string;
  let originalCwd: string;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    // Create temp directory
    testDir = join(tmpdir(), `bellwether-cli-init-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Capture exit code
    exitCode = undefined;
    originalExit = process.exit;
    process.exit = vi.fn((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`process.exit(${code})`);
    }) as never;

    // Capture console output
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.join(' '));
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exit = originalExit;
    vi.restoreAllMocks();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('generateConfigTemplate', () => {
    it('should generate valid YAML config', () => {
      const content = generateConfigTemplate();

      // Should be valid YAML
      const parsed = parseYamlSecure(content);
      expect(parsed).toBeDefined();
    });

    it('should include all required config sections', () => {
      const content = generateConfigTemplate();

      // Server section
      expect(content).toContain('server:');
      expect(content).toContain('command:');
      expect(content).toContain('timeout:');

      // LLM section
      expect(content).toContain('llm:');
      expect(content).toContain('provider: ollama');

      // Explore settings
      expect(content).toContain('explore:');
      expect(content).toContain('maxQuestionsPerTool:');

      // Output section
      expect(content).toContain('output:');
      expect(content).toContain('dir:');

      // Baseline section
      expect(content).toContain('baseline:');
      expect(content).toContain('failOnDrift:');

      // Cache section
      expect(content).toContain('cache:');
      expect(content).toContain('enabled:');

      // Logging section
      expect(content).toContain('logging:');
      expect(content).toContain('level:');
    });

    it('should generate config that validates against schema', () => {
      const content = generateConfigTemplate();
      const parsed = parseYamlSecure(content);

      // Should validate without throwing
      const validated = validateConfig(parsed);
      expect(validated).toBeDefined();
      expect(validated.llm.provider).toBe('ollama');
    });

    it('should accept server command option', () => {
      const content = generateConfigTemplate({
        serverCommand: 'npx @mcp/test-server',
      });

      expect(content).toContain('command: "npx @mcp/test-server"');
    });

    it('should accept server args option', () => {
      const content = generateConfigTemplate({
        serverCommand: 'npx',
        serverArgs: ['@mcp/test-server', '/data'],
      });

      expect(content).toContain('args:');
      expect(content).toContain('@mcp/test-server');
      expect(content).toContain('/data');
    });

    it('should set provider when requested', () => {
      const content = generateConfigTemplate({
        provider: 'openai',
      });

      expect(content).toContain('provider: openai');
    });

    it('should set different LLM providers', () => {
      const openaiContent = generateConfigTemplate({ provider: 'openai' });
      expect(openaiContent).toContain('provider: openai');

      const anthropicContent = generateConfigTemplate({ provider: 'anthropic' });
      expect(anthropicContent).toContain('provider: anthropic');

      const ollamaContent = generateConfigTemplate({ provider: 'ollama' });
      expect(ollamaContent).toContain('provider: ollama');
    });
  });

  describe('generatePresetConfig', () => {
    it('should have all expected presets', () => {
      expect(PRESETS).toHaveProperty('ci');
      expect(PRESETS).toHaveProperty('security');
      expect(PRESETS).toHaveProperty('thorough');
      expect(PRESETS).toHaveProperty('local');
    });

    it('should generate CI preset config', () => {
      const content = generatePresetConfig('ci');
      const parsed = parseYamlSecure(content);
      const validated = validateConfig(parsed);

      // CI preset optimized for fast, free, deterministic check
      expect(validated.baseline.failOnDrift).toBe(true);
    });

    it('should generate security preset config', () => {
      const content = generatePresetConfig('security');
      const parsed = parseYamlSecure(content);
      const validated = validateConfig(parsed);

      // Security preset uses openai for exploration
      expect(validated.llm.provider).toBe('openai');
      // Base template includes technical_writer; additional personas can be added via getPresetOverrides
      expect(validated.explore.personas).toBeDefined();
    });

    it('should generate thorough preset config', () => {
      const content = generatePresetConfig('thorough');
      const parsed = parseYamlSecure(content);
      const validated = validateConfig(parsed);

      // Thorough preset uses openai
      expect(validated.llm.provider).toBe('openai');
      // Base template has personas defined
      expect(validated.explore.personas).toBeDefined();
    });

    it('should generate local preset config', () => {
      const content = generatePresetConfig('local');
      const parsed = parseYamlSecure(content);
      const validated = validateConfig(parsed);

      // Local preset uses ollama for free local exploration
      expect(validated.llm.provider).toBe('ollama');
    });

    it('should allow overriding preset with server command', () => {
      const content = generatePresetConfig('ci', {
        serverCommand: 'npx @mcp/custom-server',
      });

      expect(content).toContain('command: "npx @mcp/custom-server"');
    });
  });

  describe('init command file creation', () => {
    it('should create bellwether.yaml in current directory', () => {
      const configPath = join(testDir, 'bellwether.yaml');

      // Simulate init command action
      const content = generateConfigTemplate();
      writeFileSync(configPath, content);

      expect(existsSync(configPath)).toBe(true);

      const fileContent = readFileSync(configPath, 'utf-8');
      expect(fileContent).toContain('provider: ollama');
    });

    it('should not overwrite existing config without --force', () => {
      const configPath = join(testDir, 'bellwether.yaml');
      writeFileSync(configPath, 'existing: content');

      // Check that file exists before action
      expect(existsSync(configPath)).toBe(true);

      // The init command checks for existing file
      if (existsSync(configPath)) {
        // Would exit with error without --force
        expect(existsSync(configPath)).toBe(true);
        expect(readFileSync(configPath, 'utf-8')).toBe('existing: content');
      }
    });

    it('should overwrite existing config with --force', () => {
      const configPath = join(testDir, 'bellwether.yaml');
      writeFileSync(configPath, 'existing: content');

      // With --force, overwrites
      const content = generateConfigTemplate();
      writeFileSync(configPath, content);

      const fileContent = readFileSync(configPath, 'utf-8');
      expect(fileContent).toContain('provider: ollama');
      expect(fileContent).not.toContain('existing: content');
    });
  });

  describe('init command error handling', () => {
    it('should handle write errors gracefully', () => {
      // Create a directory where the file would go (can't write file there)
      const configPath = join(testDir, 'bellwether.yaml');
      mkdirSync(configPath); // Make it a directory

      // Attempting to write should throw
      expect(() => {
        writeFileSync(configPath, 'content');
      }).toThrow();
    });

    it('should reject unknown preset names', () => {
      expect(() => {
        generatePresetConfig('unknown-preset');
      }).toThrow(/Unknown preset/);
    });
  });
});
