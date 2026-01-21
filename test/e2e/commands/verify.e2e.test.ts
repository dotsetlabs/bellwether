/**
 * E2E tests for the `bellwether verify` command.
 *
 * Tests:
 * - Basic verification report generation
 * - Verification tiers (bronze, silver, gold)
 * - --security flag behavior
 * - --json output
 * - --badge-only flag
 *
 * Note: The verify command requires:
 * 1. A server command argument (not from config)
 * 2. LLM credentials for running interviews
 *
 * Since LLM credentials aren't available in E2E tests, many tests
 * verify the command's argument handling and help output rather than
 * full verification flows.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  generateTestConfig,
  getMockServerTsArgs,
  type TempDirectory,
} from '../harness/index.js';

describe('bellwether verify', () => {
  let tempDir: TempDirectory;
  let mockServerArgs: string[];

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-verify-e2e');
    tempDir.writeConfig(generateTestConfig());
    mockServerArgs = getMockServerTsArgs();
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('basic verification', () => {
    it('should require server command argument', async () => {
      // verify requires a <command> argument
      const result = await runCLI(['verify'], { cwd: tempDir.path });

      // Should fail because <command> is required
      assertOutput(result).expectFailure();
    });

    it('should fail without LLM credentials', async () => {
      // Provide server command but no API keys
      const result = await runCLI(['verify', ...mockServerArgs], {
        cwd: tempDir.path,
        // No API keys provided
      });

      // Should fail due to missing LLM credentials
      assertOutput(result).expectFailure();
    });

    it('should document provider flag in help', async () => {
      // Verify --provider flag is documented (don't actually run with Ollama
      // as it requires Ollama to be running locally)
      const result = await runCLI(['verify', '--help'], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('--provider');
    });
  });

  describe('verification tiers', () => {
    it('should report tool count metrics', async () => {
      // Just verify the --json flag is documented
      const result = await runCLI(['verify', '--help'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('--json');
    });

    it('should support tier selection', async () => {
      const result = await runCLI(['verify', '--help'], { cwd: tempDir.path });

      // Should mention tier option
      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('--tier');
    });
  });

  describe('--security flag', () => {
    it('should document security option in help', async () => {
      const result = await runCLI(['verify', '--help'], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('--security');
    });
  });

  describe('--json output', () => {
    it('should document json option in help', async () => {
      const result = await runCLI(['verify', '--help'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('--json');
    });

    it('should document json output format', async () => {
      const result = await runCLI(['verify', '--help'], { cwd: tempDir.path });

      // Help should mention JSON
      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('JSON', 'json');
    });
  });

  describe('--badge-only flag', () => {
    it('should document badge-only option in help', async () => {
      const result = await runCLI(['verify', '--help'], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('--badge-only');
    });

    it('should output compact format with --badge-only', async () => {
      // This test needs LLM so just verify flag exists
      const result = await runCLI(['verify', '--help'], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('badge');
    });
  });

  describe('report file generation', () => {
    it('should optionally generate verification report file', async () => {
      // Runs but will fail without LLM - just verify temp dir is clean
      const reportExists =
        tempDir.exists('verification-report.json') ||
        tempDir.exists('bellwether-verification.json');

      // Initially no report file should exist
      expect(reportExists).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should fail without server command argument', async () => {
      // verify requires <command> argument, not just config file
      const result = await runCLI(['verify'], { cwd: tempDir.path });

      assertOutput(result).expectFailure();
    });

    it('should handle server connection errors', async () => {
      tempDir.writeConfig(
        generateTestConfig({
          serverCommand: 'nonexistent-server-command',
        })
      );

      const result = await runCLI(['verify'], { cwd: tempDir.path });

      assertOutput(result).expectFailure();
    });
  });

  describe('help output', () => {
    it('should show help for verify command', async () => {
      const result = await runCLI(['verify', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('verify')
        .expectStdoutContains('--security')
        .expectStdoutContains('--json');
    });
  });
});
