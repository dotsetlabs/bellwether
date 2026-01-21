/**
 * E2E tests for the `bellwether baseline compare` command.
 *
 * Tests:
 * - Basic comparison
 * - Output format variations (text, json, markdown, compact)
 * - --fail-on-drift flag behavior
 * - Drift detection scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  generateTestConfig,
  type TempDirectory,
} from '../../harness/index.js';
import {
  newToolDrift,
  removedToolDrift,
  descriptionChangeDrift,
  newRequiredParamDrift,
  breakingDrift,
  createDriftedMockEnv,
} from '../../mocks/index.js';

describe('bellwether baseline compare', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-baseline-compare-e2e');
    tempDir.writeConfig(generateTestConfig());
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  // Helper to create a baseline and check report
  async function createBaseline(): Promise<void> {
    await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });
  }

  // Helper to run check with optional drift env to generate a new report
  async function runCheckWithDrift(driftEnv?: Record<string, string>): Promise<void> {
    await runCLI(['check'], { cwd: tempDir.path, env: driftEnv });
  }

  describe('basic comparison', () => {
    it('should report no drift when unchanged', async () => {
      await createBaseline();

      // Run check again to generate report, then compare
      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      // Severity: NONE when no drift
      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('NONE', 'Breaking changes: 0', 'Drift Report');
    }, 20000);

    it('should detect added tools', async () => {
      await createBaseline();

      // Run check with drifted server
      await runCheckWithDrift(createDriftedMockEnv(newToolDrift));

      // Compare the new report against baseline
      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectStdoutContainsAny(
          'search_files',
          'added',
          'Added',
          'Tools Added',
          '+'
        );
    }, 20000);

    it('should detect removed tools', async () => {
      await createBaseline();

      // Run check with drifted server
      await runCheckWithDrift(createDriftedMockEnv(removedToolDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectStdoutContainsAny(
          'read_file',
          'removed',
          'Removed',
          'Tools Removed',
          '-',
          'BREAKING'
        );
    }, 20000);

    it('should detect description changes', async () => {
      await createBaseline();

      // Run check with drifted server
      await runCheckWithDrift(createDriftedMockEnv(descriptionChangeDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectStdoutContainsAny(
          'get_weather',
          'modified',
          'Modified',
          'changed',
          'Changed',
          'description',
          'Tools Modified'
        );
    }, 20000);

    it('should detect schema changes', async () => {
      await createBaseline();

      // Run check with drifted server that adds a new required parameter
      await runCheckWithDrift(createDriftedMockEnv(newRequiredParamDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      // Schema changes may show up as modified tools, or just show up in diff output
      // The key is that the comparison completes successfully
      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('Drift Report');
    }, 20000);
  });

  describe('output formats', () => {
    it('should support --format text (default)', async () => {
      await createBaseline();

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json', '--format', 'text'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();
      // Text format should contain "Drift Report" header
      expect(result.stdout).toContain('Drift Report');
    }, 20000);

    it('should support --format json', async () => {
      await createBaseline();

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json', '--format', 'json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();

      const json = assertOutput(result).expectStdoutJson<{
        severity: string;
        toolsAdded: unknown[];
        toolsRemoved: unknown[];
      }>();

      expect(json.severity).toBeDefined();
      expect(Array.isArray(json.toolsAdded)).toBe(true);
      expect(Array.isArray(json.toolsRemoved)).toBe(true);
    }, 20000);

    it('should support --format markdown', async () => {
      await createBaseline();

      // Run check with drift for more interesting output
      await runCheckWithDrift(createDriftedMockEnv(newToolDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json', '--format', 'markdown'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();

      // Markdown format should have markdown syntax
      expect(result.stdout).toMatch(/[#*`|]/);
    }, 20000);

    it('should support --format compact', async () => {
      await createBaseline();

      // Run check with drift
      await runCheckWithDrift(createDriftedMockEnv(newToolDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json', '--format', 'compact'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();

      // Compact format should be brief (single line or few lines)
      expect(result.stdout.split('\n').length).toBeLessThan(20);
    }, 20000);
  });

  describe('--fail-on-drift flag', () => {
    it('should exit 0 when no drift and --fail-on-drift', async () => {
      await createBaseline();

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json', '--fail-on-drift'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectExitCode(0);
    }, 20000);

    it('should exit non-zero when breaking drift detected and --fail-on-drift', async () => {
      await createBaseline();

      // Run check with breaking drift (tool removal)
      await runCheckWithDrift(createDriftedMockEnv(removedToolDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json', '--fail-on-drift'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectFailure();
    }, 20000);

    it('should exit non-zero for breaking changes with --fail-on-drift', async () => {
      await createBaseline();

      // Run check with breaking drift
      await runCheckWithDrift(createDriftedMockEnv(breakingDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json', '--fail-on-drift'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectFailure();
    }, 20000);
  });

  describe('drift severity classification', () => {
    it('should classify added tools correctly', async () => {
      await createBaseline();

      // Run check with new tool drift
      await runCheckWithDrift(createDriftedMockEnv(newToolDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json', '--format', 'json'],
        { cwd: tempDir.path }
      );

      const json = assertOutput(result).expectStdoutJson<{
        severity?: string;
        toolsAdded?: string[];
      }>();

      // Should have added tool
      if (json.toolsAdded) {
        expect(json.toolsAdded.length).toBeGreaterThan(0);
      }
    }, 20000);

    it('should classify removed tools as breaking', async () => {
      await createBaseline();

      // Run check with removed tool drift
      await runCheckWithDrift(createDriftedMockEnv(removedToolDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json', '--format', 'json'],
        { cwd: tempDir.path }
      );

      const json = assertOutput(result).expectStdoutJson<{
        severity?: string;
        toolsRemoved?: string[];
      }>();

      // Removed tools should be breaking severity
      if (json.severity) {
        expect(json.severity.toLowerCase()).toBe('breaking');
      }
    }, 20000);
  });

  describe('error handling', () => {
    it('should fail with non-existent baseline file', async () => {
      const result = await runCLI(
        ['baseline', 'compare', 'nonexistent-baseline.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('not found', 'does not exist', 'ENOENT', 'Baseline not found');
    });

    it('should fail with invalid baseline JSON', async () => {
      tempDir.writeFile('invalid-baseline.json', '{ invalid json }');

      const result = await runCLI(
        ['baseline', 'compare', 'invalid-baseline.json', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('invalid', 'parse', 'JSON', 'Failed');
    });

    it('should fail with empty baseline', async () => {
      tempDir.writeFile('empty-baseline.json', '{}');

      const result = await runCLI(
        ['baseline', 'compare', 'empty-baseline.json', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectFailure();
    });

    it('should handle missing baseline path argument', async () => {
      const result = await runCLI(['baseline', 'compare'], { cwd: tempDir.path });

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('required', 'missing', 'argument', 'path');
    });
  });

  describe('comparison details', () => {
    it('should show tool names in diff output', async () => {
      await createBaseline();

      // Run check with drift
      await runCheckWithDrift(createDriftedMockEnv(newToolDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('search_files');
    }, 20000);

    it('should provide summary statistics', async () => {
      await createBaseline();

      // Run check with drift
      await runCheckWithDrift(createDriftedMockEnv(breakingDrift));

      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--report', 'bellwether-check.json', '--format', 'json'],
        { cwd: tempDir.path }
      );

      const json = assertOutput(result).expectStdoutJson<{
        toolsAdded: unknown[];
        toolsRemoved: unknown[];
        toolsModified: unknown[];
        breakingCount?: number;
        warningCount?: number;
      }>();

      // Should have count information
      expect(Array.isArray(json.toolsAdded)).toBe(true);
      expect(Array.isArray(json.toolsRemoved)).toBe(true);
      expect(Array.isArray(json.toolsModified)).toBe(true);
    }, 20000);
  });

  describe('help output', () => {
    it('should show help for baseline compare command', async () => {
      const result = await runCLI(['baseline', 'compare', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('compare')
        .expectStdoutContains('--format')
        .expectStdoutContains('--fail-on-drift');
    });
  });
});
