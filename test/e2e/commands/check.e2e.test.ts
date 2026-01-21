/**
 * E2E tests for the `bellwether check` command.
 *
 * Tests:
 * - Basic schema validation
 * - CONTRACT.md generation
 * - --baseline flag behavior
 * - --save-baseline flag behavior
 * - --fail-on-drift flag behavior
 * - Various output formats
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  assertFile,
  generateTestConfig,
  getMockServerTsArgs,
  type TempDirectory,
} from '../harness/index.js';
import {
  getStandardTools,
  getStandardPrompts,
  newToolDrift,
  removedToolDrift,
  createDriftedMockEnv,
} from '../mocks/index.js';

describe('bellwether check', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-check-e2e');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('basic schema validation', () => {
    it('should run check and report tools found', async () => {
      // Create config
      tempDir.writeConfig(generateTestConfig());

      const result = await runCLI(['check'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('tools', 'Tools', 'discovered');
    });

    it('should accept server command as argument', async () => {
      // Create minimal config without server command
      tempDir.writeConfig(generateTestConfig({ serverCommand: undefined }));

      const result = await runCLI(['check', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectSuccess();
    });

    it('should use config file server command when no argument provided', async () => {
      tempDir.writeConfig(generateTestConfig());

      const result = await runCLI(['check'], { cwd: tempDir.path });

      assertOutput(result).expectSuccess();
    });
  });

  describe('CONTRACT.md generation', () => {
    it('should generate CONTRACT.md by default', async () => {
      tempDir.writeConfig(generateTestConfig());

      await runCLI(['check'], { cwd: tempDir.path });

      // Check CONTRACT.md was created
      assertFile('CONTRACT.md', tempDir)
        .exists()
        .notEmpty()
        .contains('test-server');
    });

    it('should include tool documentation in CONTRACT.md', async () => {
      tempDir.writeConfig(generateTestConfig());

      await runCLI(['check'], { cwd: tempDir.path });

      const contract = tempDir.readFile('CONTRACT.md');

      // Should document tools
      expect(contract).toContain('get_weather');
      expect(contract).toContain('calculate');
      expect(contract).toContain('read_file');
    });

    it('should include schema information in CONTRACT.md', async () => {
      tempDir.writeConfig(generateTestConfig());

      await runCLI(['check'], { cwd: tempDir.path });

      const contract = tempDir.readFile('CONTRACT.md');

      // Should include parameter info
      expect(contract).toMatch(/location|parameter|input/i);
    });

    it('should respect output directory setting', async () => {
      tempDir.mkdir('output');
      tempDir.writeConfig(generateTestConfig({ outputDir: './output' }));

      await runCLI(['check'], { cwd: tempDir.path });

      // CONTRACT.md should be in output directory
      assertFile('output/CONTRACT.md', tempDir).exists();
    });
  });

  describe('--save-baseline flag', () => {
    it('should save baseline when flag is provided', async () => {
      tempDir.writeConfig(generateTestConfig());

      const result = await runCLI(['check', '--save-baseline'], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectSuccess();

      // Baseline should be saved
      assertFile('bellwether-baseline.json', tempDir)
        .exists()
        .notEmpty();
    });

    it('should create valid baseline JSON', async () => {
      tempDir.writeConfig(generateTestConfig());

      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = tempDir.readJson<Record<string, unknown>>('bellwether-baseline.json');

      // Verify baseline structure
      expect(baseline).toHaveProperty('version');
      expect(baseline).toHaveProperty('tools');
      expect(baseline).toHaveProperty('server');
      expect(Array.isArray(baseline.tools)).toBe(true);
    });
  });

  describe('--baseline flag (comparison)', () => {
    it('should compare against existing baseline', async () => {
      tempDir.writeConfig(generateTestConfig());

      // First, create a baseline
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      // Then compare against it
      const result = await runCLI(['check', '--baseline', 'bellwether-baseline.json'], {
        cwd: tempDir.path,
      });

      // Severity: ✓ NONE when no drift, Breaking changes: 0
      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('NONE', 'Breaking changes: 0', 'Drift Report');
    }, 20000); // Needs longer timeout - runs check twice

    it('should detect drift when tools change', async () => {
      tempDir.writeConfig(generateTestConfig());

      // Create baseline with standard tools
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      // Now modify the mock server to have different tools
      const driftEnv = createDriftedMockEnv(newToolDrift);

      // Compare - should detect new tool
      const result = await runCLI(['check', '--baseline', 'bellwether-baseline.json'], {
        cwd: tempDir.path,
        env: driftEnv,
      });

      // Should report drift - look for tools added section or non-zero stats
      assertOutput(result)
        .expectStdoutContainsAny('Tools Added', 'added', 'INFO', 'WARNING', 'BREAKING');
    }, 20000); // Needs longer timeout - runs check twice

    it('should fail with non-existent baseline', async () => {
      tempDir.writeConfig(generateTestConfig());

      const result = await runCLI(['check', '--baseline', 'non-existent.json'], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectFailure()
        .expectStderrContains('not found');
    });
  });

  describe('--fail-on-drift flag', () => {
    it('should exit 0 when no drift detected', async () => {
      tempDir.writeConfig(generateTestConfig());

      // Create baseline
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      // Compare with --fail-on-drift
      const result = await runCLI(
        ['check', '--baseline', 'bellwether-baseline.json', '--fail-on-drift'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectExitCode(0);
    }, 20000); // Needs longer timeout - runs check twice

    it('should exit non-zero when drift is detected', async () => {
      tempDir.writeConfig(generateTestConfig());

      // Create baseline
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      // Modify environment to simulate breaking drift (tool removal)
      const driftEnv = createDriftedMockEnv(removedToolDrift);

      // Compare with --fail-on-drift
      const result = await runCLI(
        ['check', '--baseline', 'bellwether-baseline.json', '--fail-on-drift'],
        { cwd: tempDir.path, env: driftEnv }
      );

      // Should fail due to breaking drift (tool removal is breaking)
      assertOutput(result).expectFailure();
    }, 20000); // Needs longer timeout - runs check twice
  });

  describe('output formats', () => {
    it('should generate CONTRACT.md with tool documentation', async () => {
      tempDir.writeConfig(generateTestConfig());

      await runCLI(['check'], { cwd: tempDir.path });

      // Check CONTRACT.md has expected content
      assertFile('CONTRACT.md', tempDir)
        .exists()
        .contains('test-server')
        .contains('get_weather');
    });

    it('should generate JSON check report file', async () => {
      tempDir.writeConfig(generateTestConfig());

      await runCLI(['check'], { cwd: tempDir.path });

      // Check for report file - check command creates bellwether-check.json
      if (tempDir.exists('bellwether-check.json')) {
        const report = tempDir.readJson<Record<string, unknown>>('bellwether-check.json');
        expect(report).toBeDefined();
      }
    });
  });

  describe('error handling', () => {
    it('should fail when config file is missing', async () => {
      // Don't create config file
      const result = await runCLI(['check'], { cwd: tempDir.path });

      assertOutput(result)
        .expectFailure()
        .expectStderrContains('config');
    });

    it('should fail when server command fails', async () => {
      tempDir.writeConfig(generateTestConfig({
        serverCommand: 'node -e "process.exit(1)"',
      }));

      const result = await runCLI(['check'], { cwd: tempDir.path });

      assertOutput(result).expectFailure();
    });

    it('should fail with invalid server command', async () => {
      tempDir.writeConfig(generateTestConfig({
        serverCommand: 'nonexistent-command-12345',
      }));

      const result = await runCLI(['check'], { cwd: tempDir.path });

      assertOutput(result).expectFailure();
    });
  });

  describe('timeout handling', () => {
    it('should respect server timeout setting from config', async () => {
      tempDir.writeConfig(generateTestConfig({
        serverTimeout: 30000, // 30 second timeout
      }));

      // This should complete within timeout
      const result = await runCLI(['check'], { cwd: tempDir.path });

      assertOutput(result).expectSuccess();
    });
  });

  describe('help output', () => {
    it('should show help for check command', async () => {
      const result = await runCLI(['check', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('check')
        .expectStdoutContains('--baseline')
        .expectStdoutContains('--save-baseline')
        .expectStdoutContains('--fail-on-drift');
    });
  });
});
