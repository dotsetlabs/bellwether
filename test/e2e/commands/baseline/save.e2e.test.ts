/**
 * E2E tests for the `bellwether baseline save` command.
 *
 * Tests:
 * - Basic baseline saving via check --save-baseline
 * - baseline save command with --report flag
 * - --force flag behavior
 * - Baseline file structure validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  assertFile,
  generateTestConfig,
  type TempDirectory,
} from '../../harness/index.js';

describe('bellwether baseline save', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-baseline-save-e2e');
    // Create a valid config for baseline operations
    tempDir.writeConfig(generateTestConfig());
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('basic baseline saving', () => {
    it('should save baseline via check --save-baseline', async () => {
      // Use check --save-baseline which is the primary way to save baselines
      const result = await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      assertOutput(result).expectSuccess();

      // Verify baseline file exists
      assertFile('bellwether-baseline.json', tempDir).exists();
    });

    it('should create valid JSON baseline', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      assertFile('bellwether-baseline.json', tempDir).exists();

      const baseline = tempDir.readJson<Record<string, unknown>>('bellwether-baseline.json');

      // Validate baseline structure
      expect(baseline).toHaveProperty('version');
      expect(baseline).toHaveProperty('createdAt');
      expect(baseline).toHaveProperty('tools');
      expect(baseline).toHaveProperty('server');
    });

    it('should include all discovered tools in baseline', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = tempDir.readJson<{
        tools: Array<{ name: string }>;
      }>('bellwether-baseline.json');

      // Should have our mock server tools
      const toolNames = baseline.tools.map((t) => t.name);
      expect(toolNames).toContain('get_weather');
      expect(toolNames).toContain('calculate');
      expect(toolNames).toContain('read_file');
    });

    it('should include schema hashes in baseline', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = tempDir.readJson<{
        tools: Array<{ name: string; schemaHash?: string }>;
      }>('bellwether-baseline.json');

      // At least one tool should have a schema hash
      const toolWithHash = baseline.tools.find((t) => t.schemaHash);
      expect(toolWithHash).toBeDefined();
    });
  });

  describe('baseline save with --report flag', () => {
    it('should save baseline from check report', async () => {
      // First run check to generate bellwether-check.json
      await runCLI(['check'], { cwd: tempDir.path });

      // Then use baseline save with the report
      const result = await runCLI(
        ['baseline', 'save', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();
      assertFile('bellwether-baseline.json', tempDir).exists();
    });

    it('should save baseline to specified path', async () => {
      await runCLI(['check'], { cwd: tempDir.path });

      // Path is a positional argument, not --output flag
      const result = await runCLI(
        ['baseline', 'save', 'custom-baseline.json', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();
      assertFile('custom-baseline.json', tempDir).exists();
    });

    it('should support nested paths', async () => {
      await runCLI(['check'], { cwd: tempDir.path });

      tempDir.mkdir('baselines/v1');

      const result = await runCLI(
        ['baseline', 'save', 'baselines/v1/baseline.json', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();
      assertFile('baselines/v1/baseline.json', tempDir).exists();
    });
  });

  describe('--force flag', () => {
    it('should overwrite existing baseline with --force', async () => {
      // Create initial baseline
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const initialBaseline = tempDir.readJson<{ createdAt: string }>('bellwether-baseline.json');
      const initialTimestamp = initialBaseline.createdAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Overwrite with --force using baseline save command
      const result = await runCLI(
        ['baseline', 'save', '--force', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();

      const newBaseline = tempDir.readJson<{ createdAt: string }>('bellwether-baseline.json');
      expect(newBaseline.createdAt).not.toBe(initialTimestamp);
    });

    it('should fail without --force when baseline exists', async () => {
      // Create initial baseline
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      // Try to save again without --force (but with required --report)
      const result = await runCLI(
        ['baseline', 'save', '--report', 'bellwether-check.json'],
        { cwd: tempDir.path }
      );

      // Should fail because baseline already exists
      assertOutput(result).expectFailure();
    });
  });

  describe('baseline content validation', () => {
    it('should include server metadata', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = tempDir.readJson<{
        server: { name: string; version?: string };
      }>('bellwether-baseline.json');

      expect(baseline.server).toBeDefined();
      expect(baseline.server.name).toBe('test-server');
    });

    it('should include version number', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = tempDir.readJson<{ version: string }>('bellwether-baseline.json');

      expect(baseline.version).toBeDefined();
      expect(typeof baseline.version).toBe('string');
    });

    it('should include tool descriptions', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = tempDir.readJson<{
        tools: Array<{ name: string; description: string }>;
      }>('bellwether-baseline.json');

      const weatherTool = baseline.tools.find((t) => t.name === 'get_weather');
      expect(weatherTool?.description).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should fail when no report exists', async () => {
      // Don't run check first - no report exists
      const result = await runCLI(['baseline', 'save'], { cwd: tempDir.path });

      // Should fail because no report file
      assertOutput(result).expectFailure();
    });

    it('should fail with missing report file', async () => {
      const result = await runCLI(
        ['baseline', 'save', '--report', 'nonexistent-report.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectFailure();
    });
  });

  describe('help output', () => {
    it('should show help for baseline save command', async () => {
      const result = await runCLI(['baseline', 'save', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('save')
        .expectStdoutContainsAny('--force', '-f', '--report');
    });
  });
});
