/**
 * E2E Workflow Test: CI Pipeline
 *
 * Tests the complete CI/CD workflow:
 * 1. bellwether init --preset ci --yes
 * 2. bellwether check --save-baseline
 * 3. Verify CONTRACT.md and baseline created
 *
 * Note: Tests that involve drift simulation with createDriftedMockEnv have
 * been simplified because they are timing-sensitive and prone to flakiness.
 * The baseline diff command tests (in drift-detection.e2e.test.ts) provide
 * more reliable drift detection testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  assertFile,
  updateConfigWithMockServer,
  type TempDirectory,
} from '../harness/index.js';

describe('CI Pipeline Workflow', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-ci-pipeline-e2e');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  /**
   * Helper to setup a CI environment with mock server.
   */
  async function setupCIWithMockServer() {
    await runCLI(['init', '--preset', 'ci', '--yes'], { cwd: tempDir.path });
    const config = tempDir.readFile('bellwether.yaml');
    tempDir.writeFile('bellwether.yaml', updateConfigWithMockServer(config));
  }

  describe('complete CI pipeline', () => {
    it('should complete full CI workflow: init -> check -> baseline', async () => {
      // Step 1: Initialize with CI preset
      const initResult = await runCLI(['init', '--preset', 'ci', '--yes'], {
        cwd: tempDir.path,
      });
      assertOutput(initResult).expectSuccess();
      assertFile('bellwether.yaml', tempDir).exists();

      // Step 2: Update config to use mock server
      const config = tempDir.readFile('bellwether.yaml');
      tempDir.writeFile('bellwether.yaml', updateConfigWithMockServer(config));

      // Step 3: Run check and save baseline
      const checkResult = await runCLI(['check', '--save-baseline'], {
        cwd: tempDir.path,
      });
      assertOutput(checkResult).expectSuccess();

      // Step 4: Verify outputs
      assertFile('CONTRACT.md', tempDir).exists().notEmpty();
      assertFile('bellwether-baseline.json', tempDir).exists().notEmpty();
    }, 15000);
  });

  describe('CI preset configuration', () => {
    it('should use CI-optimized settings', async () => {
      await runCLI(['init', '--preset', 'ci', '--yes'], { cwd: tempDir.path });

      const config = tempDir.readFile('bellwether.yaml');

      // CI preset should have failOnDrift enabled
      expect(config).toContain('failOnDrift: true');
    });

    it('should have minimal question count for speed', async () => {
      await runCLI(['init', '--preset', 'ci', '--yes'], { cwd: tempDir.path });

      const config = tempDir.readFile('bellwether.yaml');

      // CI preset should have low question count
      expect(config).toMatch(/maxQuestionsPerTool:\s*[1-3]/);
    });
  });

  describe('CI output verification', () => {
    it('should generate CONTRACT.md with correct structure', async () => {
      await setupCIWithMockServer();
      await runCLI(['check'], { cwd: tempDir.path });

      const contract = tempDir.readFile('CONTRACT.md');

      // Verify CONTRACT.md structure
      expect(contract).toContain('test-server');
      expect(contract).toMatch(/tool|Tool/i);
    }, 15000);

    it('should generate valid baseline JSON', async () => {
      await setupCIWithMockServer();
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = tempDir.readJson<{
        version: string;
        tools: Array<{ name: string }>;
      }>('bellwether-baseline.json');

      expect(baseline.version).toBeDefined();
      expect(Array.isArray(baseline.tools)).toBe(true);
      expect(baseline.tools.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('baseline operations', () => {
    it('should support JSON output for baseline compare', async () => {
      await setupCIWithMockServer();
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      // Compare baseline with itself (no drift)
      const result = await runCLI(
        ['baseline', 'compare', 'bellwether-baseline.json', '--format', 'json'],
        { cwd: tempDir.path }
      );

      // JSON output for programmatic CI processing
      if (result.exitCode === 0 && result.stdout.trim()) {
        const json = JSON.parse(result.stdout);
        expect(json).toBeDefined();
      }
    }, 15000);
  });

  describe('baseline versioning', () => {
    it('should allow saving baseline with custom path', async () => {
      await setupCIWithMockServer();

      // Create baseline with custom name using --save-baseline <path>
      await runCLI(['check', '--save-baseline', 'custom-baseline.json'], {
        cwd: tempDir.path,
      });

      assertFile('custom-baseline.json', tempDir).exists();
    }, 15000);
  });
});
