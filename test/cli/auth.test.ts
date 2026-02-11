/**
 * Tests for the auth CLI command.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('auth command', () => {
  let testDir: string;
  let originalHome: string | undefined;
  let consoleOutput: string[];
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `bellwether-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });

    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    mkdirSync(join(testDir, '.bellwether'), { recursive: true });

    // Save and clear env vars
    originalEnv = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    consoleOutput = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }

    // Restore env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }

    vi.restoreAllMocks();
    vi.resetModules();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('auth status', () => {
    it('should show status for all providers', async () => {
      const { authCommand } = await import('../../src/cli/commands/auth.js');
      await authCommand.parseAsync(['node', 'test', 'status']);

      expect(consoleOutput.some((line) => line.includes('Authentication Status'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('OpenAI'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('Anthropic'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('Ollama'))).toBe(true);
    });

    it('should show configured status when env var set', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      const { authCommand } = await import('../../src/cli/commands/auth.js');
      await authCommand.parseAsync(['node', 'test', 'status']);

      expect(consoleOutput.some((line) => line.includes('Configured'))).toBe(true);
    });

    it('should show not configured status', async () => {
      const { authCommand } = await import('../../src/cli/commands/auth.js');
      await authCommand.parseAsync(['node', 'test', 'status']);

      expect(consoleOutput.some((line) => line.includes('Not configured'))).toBe(true);
    });

    it('should show credential resolution order', async () => {
      const { authCommand } = await import('../../src/cli/commands/auth.js');
      await authCommand.parseAsync(['node', 'test', 'status']);

      expect(consoleOutput.some((line) => line.includes('Credential resolution order'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('Environment variables'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('System keychain'))).toBe(true);
    });
  });

  describe('auth clear', () => {
    it('should clear all stored credentials', async () => {
      // First store some credentials
      const { getKeychainService } = await import('../../src/auth/keychain.js');
      const keychain = getKeychainService();
      keychain.enableFileBackend();
      await keychain.setApiKey('openai', 'sk-test');

      const { authCommand } = await import('../../src/cli/commands/auth.js');
      await authCommand.parseAsync(['node', 'test', 'clear']);

      expect(consoleOutput.some((line) => line.includes('removed'))).toBe(true);

      // Verify cleared
      const key = await keychain.getApiKey('openai');
      expect(key).toBeNull();
    });
  });
});
