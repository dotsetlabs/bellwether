/**
 * E2E tests for the `bellwether init` command.
 *
 * Tests:
 * - Default config generation
 * - All preset variations (ci, security, thorough, local)
 * - --force flag behavior
 * - --yes flag behavior
 * - Error handling for existing config
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  assertFile,
  type TempDirectory,
} from '../harness/index.js';

describe('bellwether init', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-init-e2e');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('default config generation', () => {
    it('should create bellwether.yaml with default settings', async () => {
      const result = await runCLI(['init', '--yes'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('bellwether.yaml');

      // Verify file was created
      assertFile('bellwether.yaml', tempDir)
        .exists()
        .notEmpty()
        .contains('llm:')
        .contains('explore:')
        .contains('server:');
    });

    it('should create config with correct YAML structure', async () => {
      await runCLI(['init', '--yes'], { cwd: tempDir.path });

      const content = tempDir.readFile('bellwether.yaml');

      // Check key sections exist
      expect(content).toContain('llm:');
      expect(content).toContain('provider:');
      expect(content).toContain('explore:');
      expect(content).toContain('personas:');
    });
  });

  describe('preset variations', () => {
    it('should create CI preset with appropriate settings', async () => {
      const result = await runCLI(['init', '--preset', 'ci', '--yes'], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectSuccess();

      const content = tempDir.readFile('bellwether.yaml');

      // CI preset should have failOnDrift enabled
      expect(content).toContain('failOnDrift: true');
      // Should use faster settings
      expect(content).toMatch(/maxQuestionsPerTool:\s*[1-3]/);
    });

    it('should create security preset with security-focused settings', async () => {
      const result = await runCLI(['init', '--preset', 'security', '--yes'], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectSuccess();

      const content = tempDir.readFile('bellwether.yaml');

      // Security preset should include security_tester persona
      expect(content).toContain('security_tester');
    });

    it('should create thorough preset with comprehensive settings', async () => {
      const result = await runCLI(['init', '--preset', 'thorough', '--yes'], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectSuccess();

      const content = tempDir.readFile('bellwether.yaml');

      // Thorough preset should have all personas
      expect(content).toContain('technical_writer');
      expect(content).toContain('security_tester');
      expect(content).toContain('qa_engineer');
      expect(content).toContain('novice_user');
    });

    it('should create local preset with Ollama settings', async () => {
      const result = await runCLI(['init', '--preset', 'local', '--yes'], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectSuccess();

      const content = tempDir.readFile('bellwether.yaml');

      // Local preset should use ollama
      expect(content).toContain('provider: ollama');
    });
  });

  describe('--force flag', () => {
    it('should overwrite existing config with --force', async () => {
      // Create initial config
      tempDir.writeFile('bellwether.yaml', 'initial: content');

      // Run init with --force
      const result = await runCLI(['init', '--force', '--yes'], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectSuccess();

      // Verify content was overwritten
      const content = tempDir.readFile('bellwether.yaml');
      expect(content).not.toContain('initial: content');
      expect(content).toContain('llm:');
    });

    it('should not require --yes when using --force with existing config', async () => {
      tempDir.writeFile('bellwether.yaml', 'existing: config');

      const result = await runCLI(['init', '--force'], { cwd: tempDir.path });

      // With --force, should succeed even without --yes
      assertOutput(result).expectSuccess();
    });
  });

  describe('--yes flag', () => {
    it('should skip confirmation prompts with --yes', async () => {
      const result = await runCLI(['init', '--yes'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutNotContains('confirm');

      expect(tempDir.exists('bellwether.yaml')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should fail when config already exists without --force', async () => {
      // Create existing config
      tempDir.writeFile('bellwether.yaml', 'existing: true');

      // Run init without --force
      const result = await runCLI(['init'], { cwd: tempDir.path });

      // Should fail or prompt (with CI=true, it should fail)
      assertOutput(result).expectFailure();
    });

    it('should reject invalid preset names', async () => {
      const result = await runCLI(['init', '--preset', 'invalid-preset', '--yes'], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectFailure()
        .expectStderrContains('invalid');
    });
  });

  describe('output location', () => {
    it('should create config in current directory', async () => {
      await runCLI(['init', '--yes'], { cwd: tempDir.path });

      expect(tempDir.exists('bellwether.yaml')).toBe(true);
      expect(tempDir.exists('subfolder/bellwether.yaml')).toBe(false);
    });

    it('should handle nested directories', async () => {
      const subDir = tempDir.mkdir('project/src');

      const result = await runCLI(['init', '--yes'], { cwd: subDir });

      assertOutput(result).expectSuccess();
      expect(tempDir.exists('project/src/bellwether.yaml')).toBe(true);
    });
  });

  describe('help output', () => {
    it('should show help for init command', async () => {
      const result = await runCLI(['init', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('init')
        .expectStdoutContains('--preset')
        .expectStdoutContains('--force');
    });
  });
});
