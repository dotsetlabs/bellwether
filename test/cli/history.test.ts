/**
 * Integration tests for the history CLI command.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the cloud client
const mockGetHistory = vi.fn();
const mockGetProject = vi.fn();
const mockGetLatestDiff = vi.fn();
const mockIsAuthenticated = vi.fn();

vi.mock('../../src/cloud/client.js', () => ({
  createCloudClient: vi.fn(() => ({
    isAuthenticated: mockIsAuthenticated,
    getHistory: mockGetHistory,
    getProject: mockGetProject,
    getLatestDiff: mockGetLatestDiff,
  })),
}));

// Import types only - auth functions are imported dynamically after HOME is set
import type { ProjectLink, StoredSession } from '../../src/cloud/types.js';

// Auth functions will be imported dynamically in tests
let saveSession: (session: StoredSession) => void;
let clearSession: () => void;
let saveProjectLink: (link: ProjectLink, projectDir?: string) => void;
let removeProjectLink: (projectDir?: string) => boolean;

// Helper to create a test session
function createTestSession(token: string = 'sess_test_token_12345678901234567890'): StoredSession {
  return {
    sessionToken: token,
    user: {
      id: 'usr_test',
      email: 'test@example.com',
      githubLogin: 'testuser',
      githubAvatarUrl: null,
    },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
  };
}

describe('history command', () => {
  let testDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];
  let processExitSpy: MockInstance;
  let originalExit: typeof process.exit;

  const sampleHistory = [
    {
      version: 3,
      uploadedAt: '2024-01-15T14:30:00Z',
      cliVersion: '1.2.0',
      hash: 'abc123def456789012345678',
    },
    {
      version: 2,
      uploadedAt: '2024-01-10T10:00:00Z',
      cliVersion: '1.1.0',
      hash: 'def456abc123789012345678',
    },
    {
      version: 1,
      uploadedAt: '2024-01-01T00:00:00Z',
      cliVersion: '1.0.0',
      hash: '789012abc123def456345678',
    },
  ];

  beforeEach(async () => {
    testDir = join(tmpdir(), `bellwether-history-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);
    writeFileSync(join(process.cwd(), 'bellwether.yaml'), '');

    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    mkdirSync(join(testDir, '.bellwether'), { recursive: true });

    // Reset modules so auth module picks up new HOME
    vi.resetModules();

    // Dynamically import auth functions after HOME is set
    const auth = await import('../../src/cloud/auth.js');
    saveSession = auth.saveSession;
    clearSession = auth.clearSession;
    saveProjectLink = auth.saveProjectLink;
    removeProjectLink = auth.removeProjectLink;

    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.join(' '));
    });

    originalExit = process.exit;
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process exit: ${code}`);
    });

    mockGetHistory.mockReset();
    mockGetProject.mockReset();
    mockGetLatestDiff.mockReset();
    mockIsAuthenticated.mockReset();

    clearSession();
    removeProjectLink();
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
      // Ignore
    }
  });

  describe('authentication', () => {
    it('should fail when not authenticated', async () => {
      clearSession();

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');

      await expect(
        historyCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('Not authenticated'))).toBe(true);
    });

    it('should fail when token is invalid', async () => {
      saveSession(createTestSession('sess_invalid_token_1234567890123456'));
      mockIsAuthenticated.mockReturnValue(false);

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');

      await expect(
        historyCommand.parseAsync(['node', 'test', 'proj_123'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('Authentication failed'))).toBe(true);
    });
  });

  describe('project resolution', () => {
    it('should use linked project', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetHistory.mockResolvedValue(sampleHistory);
      mockGetProject.mockResolvedValue({ name: 'Linked Project' });
      saveProjectLink({ projectId: 'proj_linked', projectName: 'Linked Project', linkedAt: new Date().toISOString() });

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');
      await historyCommand.parseAsync(['node', 'test']);

      expect(mockGetHistory).toHaveBeenCalledWith('proj_linked', 10);
    });

    it('should use project ID argument', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetHistory.mockResolvedValue(sampleHistory);
      mockGetProject.mockResolvedValue({ name: 'Explicit Project' });

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');
      await historyCommand.parseAsync(['node', 'test', 'proj_explicit']);

      expect(mockGetHistory).toHaveBeenCalledWith('proj_explicit', 10);
    });

    it('should fail when no project specified', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      removeProjectLink();

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');

      await expect(
        historyCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('No project specified'))).toBe(true);
    });
  });

  describe('history display', () => {
    it('should display history in table format', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetHistory.mockResolvedValue(sampleHistory);
      mockGetProject.mockResolvedValue({ name: 'Test Project' });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test Project', linkedAt: new Date().toISOString() });

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');
      await historyCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('Test Project'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('3 version'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('1.2.0'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('abc123def4567890'))).toBe(true);
    });

    it('should respect --limit option', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetHistory.mockResolvedValue([sampleHistory[0]]);
      mockGetProject.mockResolvedValue({ name: 'Test' });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');
      await historyCommand.parseAsync(['node', 'test', '--limit', '1']);

      expect(mockGetHistory).toHaveBeenCalledWith('proj_123', 1);
    });

    it('should show empty state when no baselines', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetHistory.mockResolvedValue([]);
      saveProjectLink({ projectId: 'proj_123', projectName: 'Empty Project', linkedAt: new Date().toISOString() });

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');
      await historyCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('No baselines'))).toBe(true);
    });

    it('should show latest diff when multiple versions exist', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetHistory.mockResolvedValue(sampleHistory);
      mockGetProject.mockResolvedValue({ name: 'Test' });
      mockGetLatestDiff.mockResolvedValue({
        severity: 'warning',
        toolsAdded: 1,
        toolsRemoved: 0,
        toolsModified: 2,
        behaviorChanges: 3,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');
      await historyCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('Latest changes'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('warning'))).toBe(true);
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json flag is set', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetHistory.mockResolvedValue(sampleHistory);
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');
      await historyCommand.parseAsync(['node', 'test', '--json']);

      const jsonOutput = consoleOutput.find(line => line.startsWith('['));
      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput!);
      expect(parsed.length).toBe(3);
      expect(parsed[0].version).toBe(3);
    });
  });

  describe('error handling', () => {
    it('should handle API errors', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetHistory.mockRejectedValue(new Error('API unavailable'));
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { historyCommand } = await import('../../src/cli/commands/cloud/history.js');

      await expect(
        historyCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('Failed to fetch'))).toBe(true);
    });
  });
});

describe('diff command', () => {
  let testDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];
  let originalExit: typeof process.exit;

  const mockGetDiff = vi.fn();

  beforeEach(async () => {
    testDir = join(tmpdir(), `bellwether-diff-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);
    writeFileSync(join(process.cwd(), 'bellwether.yaml'), '');

    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    mkdirSync(join(testDir, '.bellwether'), { recursive: true });

    // Reset modules so auth module picks up new HOME
    vi.resetModules();

    // Dynamically import auth functions after HOME is set
    const auth = await import('../../src/cloud/auth.js');
    saveSession = auth.saveSession;
    clearSession = auth.clearSession;
    saveProjectLink = auth.saveProjectLink;
    removeProjectLink = auth.removeProjectLink;

    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.join(' '));
    });

    originalExit = process.exit;
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process exit: ${code}`);
    });

    mockGetDiff.mockReset();
    mockIsAuthenticated.mockReset();

    // Re-mock client to include getDiff
    vi.doMock('../../src/cloud/client.js', () => ({
      createCloudClient: vi.fn(() => ({
        isAuthenticated: mockIsAuthenticated,
        getDiff: mockGetDiff,
      })),
    }));

    clearSession();
    removeProjectLink();
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
      // Ignore
    }
  });

  describe('authentication', () => {
    it('should fail when not authenticated', async () => {
      clearSession();

      const { diffCommand } = await import('../../src/cli/commands/cloud/diff.js');

      await expect(
        diffCommand.parseAsync(['node', 'test', '1', '2'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('Not authenticated'))).toBe(true);
    });
  });

  describe('version validation', () => {
    it('should fail with invalid version numbers', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { diffCommand } = await import('../../src/cli/commands/cloud/diff.js');

      await expect(
        diffCommand.parseAsync(['node', 'test', 'abc', '2'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('Invalid version'))).toBe(true);
    });
  });

  describe('diff display', () => {
    beforeEach(() => {
      // Setup mock for diff tests
      vi.doMock('../../src/cloud/client.js', () => ({
        createCloudClient: vi.fn(() => ({
          isAuthenticated: () => true,
          getDiff: mockGetDiff,
        })),
      }));
    });

    it('should display diff summary', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetDiff.mockResolvedValue({
        severity: 'warning',
        toolsAdded: 2,
        toolsRemoved: 1,
        toolsModified: 3,
        behaviorChanges: 5,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { diffCommand } = await import('../../src/cli/commands/cloud/diff.js');
      await diffCommand.parseAsync(['node', 'test', '1', '2']);

      expect(consoleOutput.some(line => line.includes('v1 → v2'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('WARNING'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('+2'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('-1'))).toBe(true);
    });

    it('should show breaking change warning', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetDiff.mockResolvedValue({
        severity: 'breaking',
        toolsAdded: 0,
        toolsRemoved: 3,
        toolsModified: 0,
        behaviorChanges: 0,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { diffCommand } = await import('../../src/cli/commands/cloud/diff.js');
      await diffCommand.parseAsync(['node', 'test', '1', '2']);

      expect(consoleOutput.some(line => line.includes('Breaking changes'))).toBe(true);
    });

    it('should indicate no changes', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetDiff.mockResolvedValue({
        severity: 'none',
        toolsAdded: 0,
        toolsRemoved: 0,
        toolsModified: 0,
        behaviorChanges: 0,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { diffCommand } = await import('../../src/cli/commands/cloud/diff.js');
      await diffCommand.parseAsync(['node', 'test', '1', '2']);

      expect(consoleOutput.some(line => line.includes('No changes'))).toBe(true);
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json flag is set', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      const diffData = {
        severity: 'info',
        toolsAdded: 1,
        toolsRemoved: 0,
        toolsModified: 0,
        behaviorChanges: 0,
      };
      mockGetDiff.mockResolvedValue(diffData);
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { diffCommand } = await import('../../src/cli/commands/cloud/diff.js');
      await diffCommand.parseAsync(['node', 'test', '1', '2', '--json']);

      const jsonOutput = consoleOutput.find(line => line.startsWith('{'));
      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput!);
      expect(parsed.severity).toBe('info');
    });
  });

  describe('project resolution', () => {
    it('should use --project flag', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetDiff.mockResolvedValue({
        severity: 'none',
        toolsAdded: 0,
        toolsRemoved: 0,
        toolsModified: 0,
        behaviorChanges: 0,
      });

      const { diffCommand } = await import('../../src/cli/commands/cloud/diff.js');
      await diffCommand.parseAsync(['node', 'test', '1', '2', '--project', 'proj_explicit']);

      expect(mockGetDiff).toHaveBeenCalledWith('proj_explicit', 1, 2);
    });

    it('should fail when no project specified', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      removeProjectLink();

      const { diffCommand } = await import('../../src/cli/commands/cloud/diff.js');

      await expect(
        diffCommand.parseAsync(['node', 'test', '1', '2'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('No project specified'))).toBe(true);
    });
  });
});
