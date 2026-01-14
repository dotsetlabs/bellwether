/**
 * Tests for credential resolution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('credentials', () => {
  let testDir: string;
  let originalHome: string | undefined;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-creds-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    originalHome = process.env.HOME;
    process.env.HOME = testDir;

    // Save original env vars
    originalEnv = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };

    // Clear env vars for tests
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }

    // Restore original env vars
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

  describe('resolveCredentials', () => {
    it('should return config apiKey first', async () => {
      const { resolveCredentials } = await import('../../src/auth/credentials.js');

      const result = await resolveCredentials({
        provider: 'openai',
        apiKey: 'sk-direct-key',
      });

      expect(result.apiKey).toBe('sk-direct-key');
      expect(result.source).toBe('config');
    });

    it('should return env var when no config key', async () => {
      process.env.OPENAI_API_KEY = 'sk-env-key';

      const { resolveCredentials } = await import('../../src/auth/credentials.js');

      const result = await resolveCredentials({
        provider: 'openai',
      });

      expect(result.apiKey).toBe('sk-env-key');
      expect(result.source).toBe('env');
      expect(result.envVar).toBe('OPENAI_API_KEY');
    });

    it('should use custom apiKeyEnvVar', async () => {
      process.env.MY_CUSTOM_KEY = 'sk-custom-key';

      const { resolveCredentials } = await import('../../src/auth/credentials.js');

      const result = await resolveCredentials({
        provider: 'openai',
        apiKeyEnvVar: 'MY_CUSTOM_KEY',
      });

      expect(result.apiKey).toBe('sk-custom-key');
      expect(result.source).toBe('env');
      expect(result.envVar).toBe('MY_CUSTOM_KEY');

      delete process.env.MY_CUSTOM_KEY;
    });

    it('should return none when no credentials found', async () => {
      const { resolveCredentials } = await import('../../src/auth/credentials.js');

      const result = await resolveCredentials({
        provider: 'openai',
      });

      expect(result.apiKey).toBeUndefined();
      expect(result.source).toBe('none');
    });

    it('should check keychain when env not set', async () => {
      const { resolveCredentials } = await import('../../src/auth/credentials.js');
      const { getKeychainService } = await import('../../src/auth/keychain.js');

      // Store key in keychain
      const keychain = getKeychainService();
      keychain.enableFileBackend();
      await keychain.setApiKey('openai', 'sk-keychain-key');

      const result = await resolveCredentials({
        provider: 'openai',
      });

      expect(result.apiKey).toBe('sk-keychain-key');
      expect(result.source).toBe('keychain');
    });
  });

  describe('resolveApiKeySync', () => {
    it('should return config apiKey', async () => {
      const { resolveApiKeySync } = await import('../../src/auth/credentials.js');

      const key = resolveApiKeySync({
        provider: 'openai',
        apiKey: 'sk-sync-key',
      });

      expect(key).toBe('sk-sync-key');
    });

    it('should return env var', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-sync';

      const { resolveApiKeySync } = await import('../../src/auth/credentials.js');

      const key = resolveApiKeySync({
        provider: 'anthropic',
      });

      expect(key).toBe('sk-ant-sync');
    });

    it('should return undefined when not found', async () => {
      const { resolveApiKeySync } = await import('../../src/auth/credentials.js');

      const key = resolveApiKeySync({
        provider: 'openai',
      });

      expect(key).toBeUndefined();
    });
  });

  describe('hasCredentials', () => {
    it('should return true for ollama (no key needed)', async () => {
      const { hasCredentials } = await import('../../src/auth/credentials.js');

      const has = await hasCredentials('ollama');
      expect(has).toBe(true);
    });

    it('should return true when env var set', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      const { hasCredentials } = await import('../../src/auth/credentials.js');

      const has = await hasCredentials('openai');
      expect(has).toBe(true);
    });

    it('should return false when not configured', async () => {
      const { hasCredentials } = await import('../../src/auth/credentials.js');

      const has = await hasCredentials('openai');
      expect(has).toBe(false);
    });
  });

  describe('getAuthStatus', () => {
    it('should return status for all providers', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      const { getAuthStatus } = await import('../../src/auth/credentials.js');

      const status = await getAuthStatus();

      expect(status.length).toBe(3);

      const openai = status.find(s => s.provider === 'openai');
      expect(openai?.configured).toBe(true);
      expect(openai?.source).toBe('env');

      const anthropic = status.find(s => s.provider === 'anthropic');
      expect(anthropic?.configured).toBe(false);

      const ollama = status.find(s => s.provider === 'ollama');
      expect(ollama?.configured).toBe(true);
    });
  });

  describe('describeCredentialSource', () => {
    it('should describe env source', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      const { describeCredentialSource } = await import('../../src/auth/credentials.js');

      const desc = await describeCredentialSource('openai');
      expect(desc).toContain('Environment variable');
      expect(desc).toContain('OPENAI_API_KEY');
    });

    it('should describe not configured', async () => {
      const { describeCredentialSource } = await import('../../src/auth/credentials.js');

      const desc = await describeCredentialSource('openai');
      expect(desc).toBe('Not configured');
    });

    it('should describe ollama', async () => {
      const { describeCredentialSource } = await import('../../src/auth/credentials.js');

      const desc = await describeCredentialSource('ollama');
      expect(desc).toContain('no API key required');
    });
  });

  describe('DEFAULT_ENV_VARS', () => {
    it('should have correct defaults', async () => {
      const { DEFAULT_ENV_VARS } = await import('../../src/auth/credentials.js');

      expect(DEFAULT_ENV_VARS.openai).toBe('OPENAI_API_KEY');
      expect(DEFAULT_ENV_VARS.anthropic).toBe('ANTHROPIC_API_KEY');
      expect(DEFAULT_ENV_VARS.ollama).toBe('');
    });
  });
});
