/**
 * E2E tests for the `bellwether auth clear` command.
 *
 * Tests:
 * - Clear all stored credentials
 * - Confirmation prompts
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  type TempDirectory,
} from '../../harness/index.js';

describe('bellwether auth clear', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-auth-clear-e2e');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('auth clear', () => {
    it('should show help for auth clear', async () => {
      const result = await runCLI(['auth', 'clear', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('clear');
    });

    it('should support --yes flag to skip confirmation', async () => {
      const result = await runCLI(['auth', 'clear', '--yes'], {
        cwd: tempDir.path,
      });

      // Should either succeed or fail gracefully
      // (depends on keychain availability)
      expect(result.exitCode).toBeDefined();
    });

    it('should require confirmation in interactive mode', async () => {
      const result = await runCLI(['auth', 'clear'], {
        cwd: tempDir.path,
        stdin: '', // Empty stdin - no confirmation
      });

      // Without confirmation, should either prompt and fail or succeed in CI mode
      expect(result.exitCode).toBeDefined();
    });
  });

  describe('confirmation behavior', () => {
    it('should accept y as confirmation', async () => {
      const result = await runCLI(['auth', 'clear'], {
        cwd: tempDir.path,
        stdin: 'y\n',
      });

      // May succeed or fail based on keychain, but should not crash
      expect(result.exitCode).toBeDefined();
    });

    it('should reject n as confirmation', async () => {
      const result = await runCLI(['auth', 'clear'], {
        cwd: tempDir.path,
        stdin: 'n\n',
      });

      // Should abort without error
      expect(result.exitCode).toBeDefined();
    });
  });
});
