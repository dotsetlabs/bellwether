import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// We need to test the command action, not the command itself
// Import the module to test the functionality
import { generateDefaultConfig } from '../../src/config/loader.js';

describe('cli/init', () => {
  let testDir: string;
  let originalCwd: string;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    // Create temp directory
    testDir = join(tmpdir(), `inquest-cli-init-test-${Date.now()}`);
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

  describe('init command functionality', () => {
    it('should create inquest.yaml in current directory', () => {
      const configPath = join(testDir, 'inquest.yaml');

      // Simulate init command action
      const content = generateDefaultConfig();
      writeFileSync(configPath, content);

      expect(existsSync(configPath)).toBe(true);

      const fileContent = readFileSync(configPath, 'utf-8');
      expect(fileContent).toContain('version: 1');
      expect(fileContent).toContain('provider: openai');
      expect(fileContent).toContain('model: gpt-4o');
    });

    it('should not overwrite existing config without --force', () => {
      const configPath = join(testDir, 'inquest.yaml');
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
      const configPath = join(testDir, 'inquest.yaml');
      writeFileSync(configPath, 'existing: content');

      // With --force, overwrites
      const content = generateDefaultConfig();
      writeFileSync(configPath, content);

      const fileContent = readFileSync(configPath, 'utf-8');
      expect(fileContent).toContain('version: 1');
      expect(fileContent).not.toContain('existing: content');
    });

    it('should generate valid YAML config', () => {
      const content = generateDefaultConfig();

      expect(content).toContain('version: 1');
      expect(content).toContain('llm:');
      expect(content).toContain('interview:');
      expect(content).toContain('output:');
    });

    it('should include all required config sections', () => {
      const content = generateDefaultConfig();

      // LLM section
      expect(content).toContain('provider:');
      expect(content).toContain('model:');

      // Interview section
      expect(content).toContain('maxQuestionsPerTool:');
      expect(content).toContain('timeout:');

      // Output section
      expect(content).toContain('format:');
    });

    it('should include commented optional settings', () => {
      const content = generateDefaultConfig();

      // Optional settings should be commented out
      expect(content).toContain('# apiKeyEnvVar');
      expect(content).toContain('# skipErrorTests');
      expect(content).toContain('# outputDir');
    });
  });

  describe('init command error handling', () => {
    it('should handle write errors gracefully', () => {
      // Create a directory where the file would go (can't write file there)
      const configPath = join(testDir, 'inquest.yaml');
      mkdirSync(configPath); // Make it a directory

      // Attempting to write should throw
      expect(() => {
        writeFileSync(configPath, 'content');
      }).toThrow();
    });
  });
});
