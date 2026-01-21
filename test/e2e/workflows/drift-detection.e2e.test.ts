/**
 * E2E Workflow Test: Drift Detection
 *
 * Tests the drift detection workflow using the baseline compare and diff commands.
 *
 * Note: The baseline commands require properly formatted baseline files.
 * Synthetic baselines must include all required fields (server, tools with assertions, etc.)
 * so tests primarily use baseline files created from actual check runs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  assertFile,
  generateTestConfig,
  type TempDirectory,
} from '../harness/index.js';

describe('Drift Detection Workflow', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-drift-workflow-e2e');
    tempDir.writeConfig(generateTestConfig());
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('baseline creation', () => {
    it('should create baseline with --save-baseline flag', async () => {
      const result = await runCLI(['check', '--save-baseline'], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectSuccess();
      assertFile('bellwether-baseline.json', tempDir).exists();
    }, 15000);

    it('should create valid JSON baseline', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = JSON.parse(tempDir.readFile('bellwether-baseline.json'));
      expect(baseline.tools).toBeDefined();
      expect(baseline.integrityHash).toBeDefined();
    }, 15000);

    it('should include server info in baseline', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = JSON.parse(tempDir.readFile('bellwether-baseline.json'));
      expect(baseline.server).toBeDefined();
      expect(baseline.server.name).toBe('test-server');
    }, 15000);
  });

  describe('check --baseline inline comparison', () => {
    it('should compare against saved baseline inline', async () => {
      // First create a baseline
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      // Compare current state against baseline using check --baseline
      const result = await runCLI(
        ['check', '--baseline', 'bellwether-baseline.json'],
        { cwd: tempDir.path }
      );

      // Should succeed - no drift expected
      assertOutput(result).expectSuccess();
    }, 20000);

    it('should show drift report in output', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const result = await runCLI(
        ['check', '--baseline', 'bellwether-baseline.json'],
        { cwd: tempDir.path }
      );

      // Output should mention drift report
      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('Drift', 'drift', 'No changes', 'No drift');
    }, 20000);
  });

  describe('baseline diff command', () => {
    it('should show no changes when comparing same baseline', async () => {
      // Create a baseline
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      // Copy to another file
      const baseline = tempDir.readFile('bellwether-baseline.json');
      tempDir.writeFile('baseline-copy.json', baseline);

      const result = await runCLI(
        ['baseline', 'diff', 'bellwether-baseline.json', 'baseline-copy.json'],
        { cwd: tempDir.path }
      );

      // Should show no drift
      assertOutput(result).expectSuccess();
    }, 15000);

    it('should detect changes between different baselines', async () => {
      // Create first baseline
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      // Modify the baseline to simulate drift
      const baseline = JSON.parse(tempDir.readFile('bellwether-baseline.json'));

      // Add a tool to simulate drift
      baseline.tools.push({
        name: 'new_tool',
        description: 'A newly added tool',
        schemaHash: 'hash-new-tool',
        assertions: [],
        securityNotes: [],
        limitations: [],
      });
      // Note: Modified baselines fail integrity check, so we use text format
      // JSON format has output pollution from dotenv messages

      tempDir.writeFile('baseline-modified.json', JSON.stringify(baseline, null, 2));

      const result = await runCLI(
        ['baseline', 'diff', 'bellwether-baseline.json', 'baseline-modified.json', '--format', 'text'],
        { cwd: tempDir.path }
      );

      // Should succeed and show drift (text format handles output cleaner)
      assertOutput(result).expectSuccess();
      // Verify it detected the new tool
      assertOutput(result).expectStdoutContainsAny('new_tool', 'added', 'Tools added');
    }, 15000);

    it('should support text format', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = tempDir.readFile('bellwether-baseline.json');
      tempDir.writeFile('baseline-copy.json', baseline);

      const result = await runCLI(
        ['baseline', 'diff', 'bellwether-baseline.json', 'baseline-copy.json', '--format', 'text'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();
    }, 15000);
  });

  describe('baseline show command', () => {
    it('should display baseline contents', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const result = await runCLI(['baseline', 'show'], { cwd: tempDir.path });

      assertOutput(result).expectSuccess();
    }, 15000);

    it('should support JSON output', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const result = await runCLI(['baseline', 'show', '--json'], { cwd: tempDir.path });

      assertOutput(result).expectSuccess();
      // Use expectStdoutJson to handle dotenv message pollution
      const json = assertOutput(result).expectStdoutJson<{ tools: unknown[] }>();
      expect(json.tools).toBeDefined();
    }, 15000);
  });

  describe('error handling', () => {
    it('should fail when check uses nonexistent baseline', async () => {
      const result = await runCLI(
        ['check', '--baseline', 'nonexistent-baseline.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectFailure();
    });

    it('should fail when diff uses invalid baseline JSON', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });
      tempDir.writeFile('invalid-baseline.json', 'not valid json');

      const result = await runCLI(
        ['baseline', 'diff', 'bellwether-baseline.json', 'invalid-baseline.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectFailure();
    });

    it('should fail when diff has missing file', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const result = await runCLI(
        ['baseline', 'diff', 'bellwether-baseline.json', 'nonexistent.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectFailure();
    });
  });

  describe('help output', () => {
    it('should show help for baseline command', async () => {
      const result = await runCLI(['baseline', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('baseline')
        .expectStdoutContainsAny('compare', 'diff', 'show', 'save');
    });

    it('should show help for baseline compare', async () => {
      const result = await runCLI(['baseline', 'compare', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('compare');
    });

    it('should show help for baseline diff', async () => {
      const result = await runCLI(['baseline', 'diff', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('diff');
    });
  });
});
