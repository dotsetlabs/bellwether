/**
 * Integration tests for the upload CLI command.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the cloud client
const mockUploadBaseline = vi.fn();
const mockGetLatestDiff = vi.fn();
const mockIsAuthenticated = vi.fn();
const mockLoadBaseline = vi.fn();
const mockConvertToCloudBaseline = vi.fn();

vi.mock('../../src/cloud/client.js', () => ({
  createCloudClient: vi.fn(() => ({
    isAuthenticated: mockIsAuthenticated,
    uploadBaseline: mockUploadBaseline,
    getLatestDiff: mockGetLatestDiff,
  })),
}));

vi.mock('../../src/baseline/saver.js', () => ({
  loadBaseline: (...args: unknown[]) => mockLoadBaseline(...args),
}));

vi.mock('../../src/baseline/converter.js', () => ({
  convertToCloudBaseline: (...args: unknown[]) => mockConvertToCloudBaseline(...args),
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

describe('upload command', () => {
  let testDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];
  let processExitSpy: MockInstance;
  let originalExit: typeof process.exit;

  // Sample baselines
  const cloudFormatBaseline = {
    version: '0.10.1',
    metadata: {
      mode: 'check',
      generatedAt: '2024-01-01T00:00:00Z',
      cliVersion: '0.10.1',
      serverCommand: 'npx test-server',
      serverName: 'test-server',
      durationMs: 1000,
      personas: [],
      model: 'none',
    },
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: ['tools'],
    },
    capabilities: {
      tools: [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: { type: 'object', properties: {} },
          schemaHash: 'hash123',
        },
      ],
    },
    interviews: [],
    toolProfiles: [],
    assertions: [],
    summary: 'Test baseline',
    hash: 'abc123def456',
  };

  const localFormatBaseline = {
    discovery: {
      serverInfo: { name: 'test-server', version: '1.0.0' },
      tools: [{ name: 'local_tool', description: 'A local tool' }],
    },
    toolProfiles: [],
    behaviorSignatures: [],
    timestamp: '2024-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    // Create temp directory for test
    testDir = join(tmpdir(), `bellwether-upload-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);
    writeFileSync(
      join(process.cwd(), 'bellwether.yaml'),
      [
        'output:',
        '  dir: "."',
        'baseline:',
        '  path: "bellwether-baseline.json"',
        '',
      ].join('\n')
    );

    // Override HOME to use test directory
    originalHome = process.env.HOME;
    process.env.HOME = testDir;

    // Create .bellwether directory
    mkdirSync(join(testDir, '.bellwether'), { recursive: true });

    // Reset modules so auth module picks up new HOME
    vi.resetModules();

    // Dynamically import auth functions after HOME is set
    const auth = await import('../../src/cloud/auth.js');
    saveSession = auth.saveSession;
    clearSession = auth.clearSession;
    saveProjectLink = auth.saveProjectLink;
    removeProjectLink = auth.removeProjectLink;

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
    mockUploadBaseline.mockReset();
    mockGetLatestDiff.mockReset();
    mockIsAuthenticated.mockReset();
    mockLoadBaseline.mockReset();
    mockConvertToCloudBaseline.mockReset();

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
      // Ignore cleanup errors
    }
  });

  describe('authentication', () => {
    it('should fail when not authenticated', async () => {
      clearSession();
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('Not authenticated'))).toBe(true);
    });

  });

  describe('baseline file handling', () => {
    it('should fail when baseline file not found', async () => {
      saveSession(createTestSession());
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('not found'))).toBe(true);
    });

    it('should use default baseline filename', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://bellwether.sh/view/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(mockUploadBaseline).toHaveBeenCalled();
    });

    it('should accept custom baseline path', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://bellwether.sh/view/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'custom-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');
      await uploadCommand.parseAsync(['node', 'test', 'custom-baseline.json']);

      expect(mockUploadBaseline).toHaveBeenCalled();
    });

    it('should handle cloud format baseline', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://bellwether.sh/view/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      // Should pass through cloud format without conversion
      expect(mockUploadBaseline).toHaveBeenCalledWith(
        'proj_123',
        expect.objectContaining({ version: '0.10.1' })
      );
    });

    it('should handle invalid JSON', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), 'not valid json');

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('Failed to load baseline'))).toBe(true);
    });
  });

  describe('project handling', () => {
    it('should use linked project', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://bellwether.sh/view/1',
      });
      saveProjectLink({ projectId: 'proj_linked', projectName: 'Linked Project', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(mockUploadBaseline).toHaveBeenCalledWith(
        'proj_linked',
        expect.any(Object)
      );
      expect(consoleOutput.some(line => line.includes('Linked Project'))).toBe(true);
    });

    it('should use --project flag', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://bellwether.sh/view/1',
      });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');
      await uploadCommand.parseAsync(['node', 'test', '--project', 'proj_explicit']);

      expect(mockUploadBaseline).toHaveBeenCalledWith(
        'proj_explicit',
        expect.any(Object)
      );
    });

    it('should fail when no project specified', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));
      removeProjectLink();

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('No project specified'))).toBe(true);
    });
  });

  describe('upload success', () => {
    it('should treat cloud-format baselines as already converted', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://bellwether.sh/view/1',
      });
      mockLoadBaseline.mockImplementation(() => {
        throw new Error('loadBaseline should not be called for cloud baselines');
      });
      mockConvertToCloudBaseline.mockImplementation(() => {
        throw new Error('convertToCloudBaseline should not be called for cloud baselines');
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(mockLoadBaseline).not.toHaveBeenCalled();
      expect(mockConvertToCloudBaseline).not.toHaveBeenCalled();
    });

    it('should show success message with version', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 5,
        viewUrl: 'https://bellwether.sh/p/proj/v/5',
        diffUrl: 'https://bellwether.sh/p/proj/diff/4/5',
      });
      mockGetLatestDiff.mockResolvedValue({
        severity: 'info',
        toolsAdded: 1,
        toolsRemoved: 0,
        toolsModified: 2,
        behaviorChanges: 3,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('Upload successful'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Version: 5'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('View:'))).toBe(true);
    });

    it('should show diff summary when available', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 2,
        viewUrl: 'https://bellwether.sh/view/2',
        diffUrl: 'https://bellwether.sh/diff/1/2',
      });
      mockGetLatestDiff.mockResolvedValue({
        severity: 'warning',
        toolsAdded: 0,
        toolsRemoved: 1,
        toolsModified: 0,
        behaviorChanges: 2,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('Changes from previous'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('-1'))).toBe(true);
    });

    it('should indicate first baseline', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://bellwether.sh/view/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('first baseline'))).toBe(true);
    });
  });

  describe('CI mode', () => {
    it('should output only URL in CI mode', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://bellwether.sh/p/proj/v/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');
      await uploadCommand.parseAsync(['node', 'test', '--ci']);

      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toBe('https://bellwether.sh/p/proj/v/1');
    });

    it('should exit 1 on breaking changes in CI mode', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 2,
        viewUrl: 'https://bellwether.sh/view/2',
      });
      mockGetLatestDiff.mockResolvedValue({
        severity: 'breaking',
        toolsAdded: 0,
        toolsRemoved: 2,
        toolsModified: 0,
        behaviorChanges: 0,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test', '--ci'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('Breaking changes'))).toBe(true);
    });

    it('should exit 1 with --fail-on-drift for any drift', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 2,
        viewUrl: 'https://bellwether.sh/view/2',
      });
      mockGetLatestDiff.mockResolvedValue({
        severity: 'info',
        toolsAdded: 1,
        toolsRemoved: 0,
        toolsModified: 0,
        behaviorChanges: 0,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test', '--ci', '--fail-on-drift'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('drift detected'))).toBe(true);
    });

    it('should show minimal error in CI mode', async () => {
      clearSession();
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test', '--ci'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors[0]).toBe('BELLWETHER_SESSION not set');
    });
  });

  describe('upload failure', () => {
    it('should handle upload API error', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockRejectedValue(new Error('Network error'));
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'bellwether-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/cloud/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 4');

      expect(consoleErrors.some(line => line.includes('Upload failed'))).toBe(true);
    });
  });
});
