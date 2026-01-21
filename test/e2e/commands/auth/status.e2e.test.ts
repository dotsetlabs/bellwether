/**
 * E2E tests for the `bellwether auth` command - status subcommand.
 *
 * Tests:
 * - Basic auth status display
 * - Shows configured providers
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  type TempDirectory,
} from '../../harness/index.js';

describe('bellwether auth', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-auth-e2e');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('auth status', () => {
    it('should show auth status', async () => {
      // Use 'auth status' subcommand, not bare 'auth' which runs interactive setup
      const result = await runCLI(['auth', 'status'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny(
          'auth',
          'Auth',
          'key',
          'Key',
          'provider',
          'Provider',
          'configured',
          'Configured',
          'Status'
        );
    });

    it('should list available providers', async () => {
      const result = await runCLI(['auth', 'status'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('openai', 'OpenAI', 'anthropic', 'Anthropic', 'ollama', 'Ollama');
    });

    it('should indicate if keys are configured', async () => {
      const result = await runCLI(['auth', 'status'], { cwd: tempDir.path });

      // Should show status for each provider
      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny(
          'configured',
          'Configured',
          'not set',
          'Not set',
          'Not configured',
          'missing',
          'Missing',
          'available',
          'Available'
        );
    });
  });

  describe('auth status with env vars', () => {
    it('should detect OPENAI_API_KEY from environment', async () => {
      const result = await runCLI(['auth', 'status'], {
        cwd: tempDir.path,
        env: { OPENAI_API_KEY: 'sk-test-key-12345' },
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('openai', 'OpenAI');
    });

    it('should detect ANTHROPIC_API_KEY from environment', async () => {
      const result = await runCLI(['auth', 'status'], {
        cwd: tempDir.path,
        env: { ANTHROPIC_API_KEY: 'sk-ant-test-key' },
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('anthropic', 'Anthropic');
    });
  });

  describe('help output', () => {
    it('should show help for auth command', async () => {
      const result = await runCLI(['auth', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('auth')
        .expectStdoutContainsAny('add', 'remove', 'clear', 'status');
    });
  });
});
