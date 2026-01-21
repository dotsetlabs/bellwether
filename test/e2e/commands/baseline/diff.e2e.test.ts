/**
 * E2E tests for the `bellwether baseline diff` command.
 *
 * Tests:
 * - Compare two baseline files
 * - Output format options
 * - Diff output content
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  generateTestConfig,
  type TempDirectory,
} from '../../harness/index.js';
import { newToolDrift, createDriftedMockEnv } from '../../mocks/index.js';

describe('bellwether baseline diff', () => {
  let tempDir: TempDirectory;

  // Setup takes ~15 seconds due to two check runs
  beforeEach(async () => {
    tempDir = createTempDirectory('bellwether-baseline-diff-e2e');
    tempDir.writeConfig(generateTestConfig());

    // Create first baseline (v1)
    await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

    // Copy to v1
    const baseline = tempDir.readFile('bellwether-baseline.json');
    tempDir.writeFile('baseline-v1.json', baseline);

    // Create second baseline with drift (v2)
    const driftEnv = createDriftedMockEnv(newToolDrift);
    await runCLI(['check', '--save-baseline'], { cwd: tempDir.path, env: driftEnv });

    // Copy to v2
    const baseline2 = tempDir.readFile('bellwether-baseline.json');
    tempDir.writeFile('baseline-v2.json', baseline2);
  }, 20000); // Increase hook timeout for two check runs

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('basic diff', () => {
    it('should compare two baseline files', async () => {
      const result = await runCLI(
        ['baseline', 'diff', 'baseline-v1.json', 'baseline-v2.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('diff', 'Diff', 'change', 'Change', 'added', 'Added');
    });

    it('should show added tools', async () => {
      const result = await runCLI(
        ['baseline', 'diff', 'baseline-v1.json', 'baseline-v2.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('search_files');
    });

    it('should show no changes when comparing same file', async () => {
      const result = await runCLI(
        ['baseline', 'diff', 'baseline-v1.json', 'baseline-v1.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny(
          'no diff',
          'No diff',
          'identical',
          'same',
          'no change',
          'No change'
        );
    });
  });

  describe('output formats', () => {
    it('should support --format text', async () => {
      const result = await runCLI(
        ['baseline', 'diff', 'baseline-v1.json', 'baseline-v2.json', '--format', 'text'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();
      // Text format should be human-readable
      expect(result.stdout).not.toMatch(/^\s*\{/);
    });

    it('should support --format json', async () => {
      const result = await runCLI(
        ['baseline', 'diff', 'baseline-v1.json', 'baseline-v2.json', '--format', 'json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();

      const json = assertOutput(result).expectStdoutJson<{
        toolsAdded: unknown[];
        toolsRemoved: unknown[];
      }>();

      expect(Array.isArray(json.toolsAdded)).toBe(true);
      expect(Array.isArray(json.toolsRemoved)).toBe(true);
    });

    it('should support --format markdown', async () => {
      const result = await runCLI(
        ['baseline', 'diff', 'baseline-v1.json', 'baseline-v2.json', '--format', 'markdown'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();
      // Markdown should have markdown syntax
      expect(result.stdout).toMatch(/[#\-*`]/);
    });
  });

  describe('diff content', () => {
    it('should show diff direction (before/after)', async () => {
      const result = await runCLI(
        ['baseline', 'diff', 'baseline-v1.json', 'baseline-v2.json', '--format', 'json'],
        { cwd: tempDir.path }
      );

      const json = assertOutput(result).expectStdoutJson<{
        toolsAdded: string[];
      }>();

      // search_files was added in v2
      expect(json.toolsAdded).toContain('search_files');
    });

    it('should provide summary statistics', async () => {
      const result = await runCLI(
        ['baseline', 'diff', 'baseline-v1.json', 'baseline-v2.json', '--format', 'json'],
        { cwd: tempDir.path }
      );

      const json = assertOutput(result).expectStdoutJson<{
        toolsAdded: unknown[];
        toolsRemoved: unknown[];
        toolsModified: unknown[];
        hasDrift?: boolean;
      }>();

      // Should have counts
      expect(typeof json.toolsAdded.length).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should require both baseline arguments', async () => {
      const result = await runCLI(['baseline', 'diff', 'baseline-v1.json'], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('required', 'missing', 'argument');
    });

    it('should fail with non-existent first baseline', async () => {
      const result = await runCLI(
        ['baseline', 'diff', 'nonexistent.json', 'baseline-v2.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('not found', 'ENOENT', 'does not exist');
    });

    it('should fail with non-existent second baseline', async () => {
      const result = await runCLI(
        ['baseline', 'diff', 'baseline-v1.json', 'nonexistent.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('not found', 'ENOENT', 'does not exist');
    });

    it('should fail with invalid baseline JSON', async () => {
      tempDir.writeFile('invalid.json', '{ invalid json }');

      const result = await runCLI(
        ['baseline', 'diff', 'baseline-v1.json', 'invalid.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('invalid', 'parse', 'JSON');
    });
  });

  describe('help output', () => {
    it('should show help for baseline diff command', async () => {
      const result = await runCLI(['baseline', 'diff', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('diff')
        .expectStdoutContains('--format');
    });
  });
});
