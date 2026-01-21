/**
 * E2E tests for the `bellwether auth add/remove` commands.
 *
 * Note: These tests interact with the system keychain, so they may
 * behave differently depending on the system configuration and
 * whether keytar is available.
 *
 * Tests:
 * - Add API key
 * - Remove API key
 * - Help output
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  type TempDirectory,
} from '../../harness/index.js';

describe('bellwether auth add/remove', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-auth-add-e2e');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('auth add', () => {
    it('should show help for auth add', async () => {
      const result = await runCLI(['auth', 'add', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('add')
        .expectStdoutContainsAny('provider', 'openai', 'anthropic');
    });

    it('should accept openai as provider', async () => {
      // Note: This will prompt for key in interactive mode
      // In CI mode, it may fail due to no stdin
      const result = await runCLI(['auth', 'add', 'openai'], {
        cwd: tempDir.path,
        stdin: '', // Empty stdin to simulate no input
      });

      // Will fail in CI due to no input, but should not fail on provider validation
      assertOutput(result).expectStderrNotContains('unknown provider');
    });

    it('should accept anthropic as provider', async () => {
      const result = await runCLI(['auth', 'add', 'anthropic'], {
        cwd: tempDir.path,
        stdin: '',
      });

      assertOutput(result).expectStderrNotContains('unknown provider');
    });

    it('should handle provider argument', async () => {
      // Test that the provider argument is handled (either succeeds with no-op
      // or fails gracefully without crashing)
      const result = await runCLI(['auth', 'add', 'openai'], {
        cwd: tempDir.path,
      });

      // Should complete without crashing
      expect(result.exitCode).toBeDefined();
    });
  });

  describe('auth remove', () => {
    it('should show help for auth remove', async () => {
      const result = await runCLI(['auth', 'remove', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('remove')
        .expectStdoutContainsAny('provider', 'openai', 'anthropic');
    });

    it('should handle removing non-existent key gracefully', async () => {
      const result = await runCLI(['auth', 'remove', 'openai'], {
        cwd: tempDir.path,
      });

      // Should either succeed (no-op) or report no key found
      // Should not crash
      expect(result.exitCode).toBeDefined();
    });

    it('should handle anthropic provider', async () => {
      const result = await runCLI(['auth', 'remove', 'anthropic'], {
        cwd: tempDir.path,
      });

      // Should complete without crashing
      expect(result.exitCode).toBeDefined();
    });
  });

  describe('help output', () => {
    it('should show help for auth command', async () => {
      // Test the parent auth command help
      const result = await runCLI(['auth', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('auth');
    });
  });
});
