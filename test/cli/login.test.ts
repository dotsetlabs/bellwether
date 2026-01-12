/**
 * Integration tests for the login CLI command.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock readline before imports
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((prompt: string, callback: (answer: string) => void) => {
      callback('iqt_mock_test_1234567890');
    }),
    close: vi.fn(),
  })),
}));

// Mock the cloud client
const mockWhoami = vi.fn();
const mockIsAuthenticated = vi.fn();

vi.mock('../../src/cloud/client.js', () => ({
  createCloudClient: vi.fn(() => ({
    isAuthenticated: mockIsAuthenticated,
    whoami: mockWhoami,
  })),
}));

// Auth functions will be imported dynamically in tests
let getToken: () => string | undefined;
let setToken: (token: string) => void;
let clearToken: () => void;
let isValidTokenFormat: (token: string) => boolean;
let isMockToken: (token: string) => boolean;
let generateMockToken: () => string;

describe('login command', () => {
  let testDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];
  let processExitSpy: MockInstance;
  let originalExit: typeof process.exit;

  beforeEach(async () => {
    // Create temp directory for test config
    testDir = join(tmpdir(), `inquest-login-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Override HOME to use test directory
    originalHome = process.env.HOME;
    process.env.HOME = testDir;

    // Create .inquest directory
    mkdirSync(join(testDir, '.inquest'), { recursive: true });

    // Reset modules so auth module picks up new HOME
    vi.resetModules();

    // Dynamically import auth functions after HOME is set
    const auth = await import('../../src/cloud/auth.js');
    getToken = auth.getToken;
    setToken = auth.setToken;
    clearToken = auth.clearToken;
    isValidTokenFormat = auth.isValidTokenFormat;
    isMockToken = auth.isMockToken;

    const mockClient = await import('../../src/cloud/mock-client.js');
    generateMockToken = mockClient.generateMockToken;

    // Capture console output
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.join(' '));
    });

    // Mock process.exit
    originalExit = process.exit;
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process exit: ${code}`);
    });

    // Reset mocks
    mockWhoami.mockReset();
    mockIsAuthenticated.mockReset();
    clearToken();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    process.exit = originalExit;
    vi.restoreAllMocks();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('--mock flag', () => {
    it('should generate and save a mock token', async () => {
      // Dynamically import to avoid issues with mocks
      const { loginCommand } = await import('../../src/cli/commands/login.js');

      await loginCommand.parseAsync(['node', 'test', '--mock']);

      const token = getToken();
      expect(token).toBeDefined();
      expect(token).toMatch(/^iqt_mock_dev_/);
      expect(consoleOutput.some(line => line.includes('Mock token generated'))).toBe(true);
    });
  });

  describe('--logout flag', () => {
    it('should clear stored credentials', async () => {
      setToken('iqt_existing_token_123');
      expect(getToken()).toBe('iqt_existing_token_123');

      const { loginCommand } = await import('../../src/cli/commands/login.js');
      await loginCommand.parseAsync(['node', 'test', '--logout']);

      expect(getToken()).toBeUndefined();
      expect(consoleOutput.some(line => line.includes('Logged out successfully'))).toBe(true);
    });
  });

  describe('--status flag', () => {
    it('should show not logged in when no token', async () => {
      clearToken();
      const { loginCommand } = await import('../../src/cli/commands/login.js');

      await loginCommand.parseAsync(['node', 'test', '--status']);

      expect(consoleOutput.some(line => line.includes('Not logged in'))).toBe(true);
    });

    it('should show user info when logged in', async () => {
      setToken('iqt_valid_token_12345');
      mockIsAuthenticated.mockReturnValue(true);
      mockWhoami.mockResolvedValue({ email: 'test@example.com', plan: 'pro' });

      const { loginCommand } = await import('../../src/cli/commands/login.js');
      await loginCommand.parseAsync(['node', 'test', '--status']);

      expect(consoleOutput.some(line => line.includes('test@example.com'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('pro'))).toBe(true);
    });

    it('should indicate mock mode for mock tokens', async () => {
      const mockToken = generateMockToken('test');
      setToken(mockToken);
      mockIsAuthenticated.mockReturnValue(true);
      mockWhoami.mockResolvedValue({ email: 'test@example.com', plan: 'free' });

      const { loginCommand } = await import('../../src/cli/commands/login.js');
      await loginCommand.parseAsync(['node', 'test', '--status']);

      expect(consoleOutput.some(line => line.includes('Mock'))).toBe(true);
    });
  });

  describe('--token flag', () => {
    it('should accept valid token and store it', async () => {
      mockIsAuthenticated.mockReturnValue(true);
      mockWhoami.mockResolvedValue({ email: 'user@test.com', plan: 'team' });

      const { loginCommand } = await import('../../src/cli/commands/login.js');
      await loginCommand.parseAsync(['node', 'test', '--token', 'iqt_valid_token_123456']);

      expect(getToken()).toBe('iqt_valid_token_123456');
      expect(consoleOutput.some(line => line.includes('Logged in as'))).toBe(true);
    });

    it('should reject invalid token format', async () => {
      const { loginCommand } = await import('../../src/cli/commands/login.js');

      await expect(
        loginCommand.parseAsync(['node', 'test', '--token', 'invalid'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('Invalid token format'))).toBe(true);
    });

    it('should reject too short tokens', async () => {
      const { loginCommand } = await import('../../src/cli/commands/login.js');

      await expect(
        loginCommand.parseAsync(['node', 'test', '--token', 'iqt_short'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('Invalid token format'))).toBe(true);
    });

    it('should handle authentication failure', async () => {
      mockIsAuthenticated.mockReturnValue(true);
      mockWhoami.mockResolvedValue(null);

      const { loginCommand } = await import('../../src/cli/commands/login.js');

      await expect(
        loginCommand.parseAsync(['node', 'test', '--token', 'iqt_invalid_token_123'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('Failed to authenticate'))).toBe(true);
    });
  });

  describe('already logged in', () => {
    it('should show current user if already authenticated', async () => {
      setToken('iqt_existing_token_123');
      mockIsAuthenticated.mockReturnValue(true);
      mockWhoami.mockResolvedValue({ email: 'existing@test.com', plan: 'free' });

      const { loginCommand } = await import('../../src/cli/commands/login.js');
      await loginCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('Already logged in'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('existing@test.com'))).toBe(true);
    });
  });

  describe('token validation functions', () => {
    it('should validate correct token formats', () => {
      expect(isValidTokenFormat('iqt_abcdef123456')).toBe(true);
      expect(isValidTokenFormat('iqt_mock_dev_1234')).toBe(true);
      expect(isValidTokenFormat('iqt_1234567890ab')).toBe(true);
    });

    it('should reject invalid token formats', () => {
      expect(isValidTokenFormat('invalid')).toBe(false);
      expect(isValidTokenFormat('abc_123456')).toBe(false);
      expect(isValidTokenFormat('')).toBe(false);
      expect(isValidTokenFormat('iqt_short')).toBe(false);
      expect(isValidTokenFormat('IQT_uppercase')).toBe(false);
    });

    it('should identify mock tokens correctly', () => {
      expect(isMockToken('iqt_mock_dev_1234567890')).toBe(true);
      expect(isMockToken('iqt_mock_test_abcd')).toBe(true);
      expect(isMockToken('iqt_real_token_here')).toBe(false);
      expect(isMockToken('iqt_production_1234')).toBe(false);
    });
  });

  describe('mock token generation', () => {
    it('should generate valid mock tokens', () => {
      const token = generateMockToken('testuser');

      expect(token).toMatch(/^iqt_mock_testuser_/);
      expect(isValidTokenFormat(token)).toBe(true);
      expect(isMockToken(token)).toBe(true);
    });

    it('should generate unique tokens each time', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateMockToken('test'));
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('token storage', () => {
    it('should persist token to filesystem', () => {
      setToken('iqt_persistent_token123');

      const authFile = join(testDir, '.inquest', 'auth.json');
      expect(existsSync(authFile)).toBe(true);

      const content = JSON.parse(readFileSync(authFile, 'utf-8'));
      expect(content.token).toBe('iqt_persistent_token123');
    });

    it('should retrieve persisted token', () => {
      setToken('iqt_test_token_abcdef');

      // Clear in-memory state and retrieve from disk
      const retrieved = getToken();
      expect(retrieved).toBe('iqt_test_token_abcdef');
    });
  });
});
