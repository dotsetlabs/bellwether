/**
 * Tests for the keychain service.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('KeychainService', () => {
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-keychain-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    originalHome = process.env.HOME;
    process.env.HOME = testDir;
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    vi.restoreAllMocks();
    vi.resetModules();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('file-based fallback', () => {
    it('should store and retrieve API key using file backend', async () => {
      const { KeychainService } = await import('../../src/auth/keychain.js');
      const keychain = new KeychainService();

      // Force file backend (keytar likely not available in test)
      keychain.enableFileBackend();

      const testKey = 'sk-test-key-12345';
      await keychain.setApiKey('openai', testKey);

      const retrieved = await keychain.getApiKey('openai');
      expect(retrieved).toBe(testKey);

      // Check file was created with correct permissions
      const envPath = join(testDir, '.bellwether', '.env');
      const keyPath = join(testDir, '.bellwether', '.env.key');
      expect(existsSync(envPath)).toBe(true);
      expect(existsSync(keyPath)).toBe(true);
    });

    it('should delete API key', async () => {
      const { KeychainService } = await import('../../src/auth/keychain.js');
      const keychain = new KeychainService();
      keychain.enableFileBackend();

      await keychain.setApiKey('openai', 'sk-test-key');
      expect(await keychain.getApiKey('openai')).toBe('sk-test-key');

      const deleted = await keychain.deleteApiKey('openai');
      expect(deleted).toBe(true);

      const afterDelete = await keychain.getApiKey('openai');
      expect(afterDelete).toBeNull();
    });

    it('should return false when deleting non-existent key', async () => {
      const { KeychainService } = await import('../../src/auth/keychain.js');
      const keychain = new KeychainService();
      keychain.enableFileBackend();

      const deleted = await keychain.deleteApiKey('openai');
      expect(deleted).toBe(false);
    });

    it('should list stored providers', async () => {
      const { KeychainService } = await import('../../src/auth/keychain.js');
      const keychain = new KeychainService();
      keychain.enableFileBackend();

      await keychain.setApiKey('openai', 'sk-openai');
      await keychain.setApiKey('anthropic', 'sk-ant-anthropic');

      const providers = await keychain.getStoredProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers.length).toBe(2);
    });

    it('should clear all credentials', async () => {
      const { KeychainService } = await import('../../src/auth/keychain.js');
      const keychain = new KeychainService();
      keychain.enableFileBackend();

      await keychain.setApiKey('openai', 'sk-openai');
      await keychain.setApiKey('anthropic', 'sk-ant-anthropic');

      await keychain.clearAll();

      const openai = await keychain.getApiKey('openai');
      const anthropic = await keychain.getApiKey('anthropic');
      expect(openai).toBeNull();
      expect(anthropic).toBeNull();
    });

    it('should throw for ollama provider', async () => {
      const { KeychainService } = await import('../../src/auth/keychain.js');
      const keychain = new KeychainService();
      keychain.enableFileBackend();

      await expect(keychain.setApiKey('ollama', 'not-needed')).rejects.toThrow(
        'does not use API keys'
      );
    });

    it('should return null for ollama getApiKey', async () => {
      const { KeychainService } = await import('../../src/auth/keychain.js');
      const keychain = new KeychainService();
      keychain.enableFileBackend();

      const key = await keychain.getApiKey('ollama');
      expect(key).toBeNull();
    });

    it('should store credentials in encrypted env format', async () => {
      const { KeychainService } = await import('../../src/auth/keychain.js');
      const keychain = new KeychainService();
      keychain.enableFileBackend();

      await keychain.setApiKey('openai', 'sk-test-123');

      const envPath = join(testDir, '.bellwether', '.env');
      const content = readFileSync(envPath, 'utf-8');

      expect(content).toContain('OPENAI_API_KEY=enc:');
      expect(content).not.toContain('sk-test-123');
    });
  });

  describe('getKeychainService singleton', () => {
    it('should return same instance', async () => {
      const { getKeychainService } = await import('../../src/auth/keychain.js');

      const instance1 = getKeychainService();
      const instance2 = getKeychainService();

      expect(instance1).toBe(instance2);
    });
  });

  describe('backend detection', () => {
    it('should report backend type', async () => {
      const { KeychainService } = await import('../../src/auth/keychain.js');
      const keychain = new KeychainService();

      // Will be 'file' in test environment without keytar
      const backendType = await keychain.getBackendType();
      expect(['keychain', 'file']).toContain(backendType);
    });
  });
});
