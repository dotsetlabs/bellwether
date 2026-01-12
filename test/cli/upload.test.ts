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

vi.mock('../../src/cloud/client.js', () => ({
  createCloudClient: vi.fn(() => ({
    isAuthenticated: mockIsAuthenticated,
    uploadBaseline: mockUploadBaseline,
    getLatestDiff: mockGetLatestDiff,
  })),
}));

import {
  setToken,
  clearToken,
  saveProjectLink,
  removeProjectLink,
} from '../../src/cloud/auth.js';

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
    version: '1.0',
    metadata: {
      formatVersion: '1.0',
      serverName: 'test-server',
      cliVersion: '1.0.0',
      generatedAt: '2024-01-01T00:00:00Z',
    },
    tools: [
      {
        name: 'test_tool',
        schema: { type: 'object', properties: {} },
      },
    ],
    assertions: [],
    security: [],
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

  beforeEach(() => {
    // Create temp directory for test
    testDir = join(tmpdir(), `inquest-upload-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Override HOME to use test directory
    originalHome = process.env.HOME;
    process.env.HOME = testDir;

    // Create .inquest directory
    mkdirSync(join(testDir, '.inquest'), { recursive: true });

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

    clearToken();
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
      clearToken();
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('Not authenticated'))).toBe(true);
    });

    it('should use --token flag for authentication', async () => {
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://inquest.dev/p/proj/v/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test', '--token', 'iqt_override_token']);

      expect(consoleOutput.some(line => line.includes('Upload successful'))).toBe(true);
    });
  });

  describe('baseline file handling', () => {
    it('should fail when baseline file not found', async () => {
      setToken('iqt_valid_token_123456');
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('not found'))).toBe(true);
    });

    it('should use default baseline filename', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://inquest.dev/view/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(mockUploadBaseline).toHaveBeenCalled();
    });

    it('should accept custom baseline path', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://inquest.dev/view/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'custom-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test', 'custom-baseline.json']);

      expect(mockUploadBaseline).toHaveBeenCalled();
    });

    it('should handle cloud format baseline', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://inquest.dev/view/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      // Should pass through cloud format without conversion
      expect(mockUploadBaseline).toHaveBeenCalledWith(
        'proj_123',
        expect.objectContaining({ version: '1.0' }),
        expect.any(Object)
      );
    });

    it('should handle invalid JSON', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), 'not valid json');

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('Failed to load baseline'))).toBe(true);
    });
  });

  describe('project handling', () => {
    it('should use linked project', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://inquest.dev/view/1',
      });
      saveProjectLink({ projectId: 'proj_linked', projectName: 'Linked Project', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(mockUploadBaseline).toHaveBeenCalledWith(
        'proj_linked',
        expect.any(Object),
        expect.any(Object)
      );
      expect(consoleOutput.some(line => line.includes('Linked Project'))).toBe(true);
    });

    it('should use --project flag', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://inquest.dev/view/1',
      });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test', '--project', 'proj_explicit']);

      expect(mockUploadBaseline).toHaveBeenCalledWith(
        'proj_explicit',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should fail when no project specified', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));
      removeProjectLink();

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('No project specified'))).toBe(true);
    });
  });

  describe('upload success', () => {
    it('should show success message with version', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 5,
        viewUrl: 'https://inquest.dev/p/proj/v/5',
        diffUrl: 'https://inquest.dev/p/proj/diff/4/5',
      });
      mockGetLatestDiff.mockResolvedValue({
        severity: 'info',
        toolsAdded: 1,
        toolsRemoved: 0,
        toolsModified: 2,
        behaviorChanges: 3,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('Upload successful'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Version: 5'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('View:'))).toBe(true);
    });

    it('should show diff summary when available', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 2,
        viewUrl: 'https://inquest.dev/view/2',
        diffUrl: 'https://inquest.dev/diff/1/2',
      });
      mockGetLatestDiff.mockResolvedValue({
        severity: 'warning',
        toolsAdded: 0,
        toolsRemoved: 1,
        toolsModified: 0,
        behaviorChanges: 2,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('Changes from previous'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('-1'))).toBe(true);
    });

    it('should indicate first baseline', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://inquest.dev/view/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('first baseline'))).toBe(true);
    });
  });

  describe('CI mode', () => {
    it('should output only URL in CI mode', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://inquest.dev/p/proj/v/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test', '--ci']);

      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toBe('https://inquest.dev/p/proj/v/1');
    });

    it('should exit 1 on breaking changes in CI mode', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 2,
        viewUrl: 'https://inquest.dev/view/2',
      });
      mockGetLatestDiff.mockResolvedValue({
        severity: 'breaking',
        toolsAdded: 0,
        toolsRemoved: 2,
        toolsModified: 0,
        behaviorChanges: 0,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test', '--ci'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('Breaking changes'))).toBe(true);
    });

    it('should exit 1 with --fail-on-drift for any drift', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 2,
        viewUrl: 'https://inquest.dev/view/2',
      });
      mockGetLatestDiff.mockResolvedValue({
        severity: 'info',
        toolsAdded: 1,
        toolsRemoved: 0,
        toolsModified: 0,
        behaviorChanges: 0,
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test', '--ci', '--fail-on-drift'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('drift detected'))).toBe(true);
    });

    it('should show minimal error in CI mode', async () => {
      clearToken();
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test', '--ci'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors[0]).toBe('INQUEST_TOKEN not set');
    });
  });

  describe('--public flag', () => {
    it('should pass public option to upload', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockResolvedValue({
        version: 1,
        viewUrl: 'https://inquest.dev/view/1',
      });
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');
      await uploadCommand.parseAsync(['node', 'test', '--public']);

      expect(mockUploadBaseline).toHaveBeenCalledWith(
        'proj_123',
        expect.any(Object),
        { public: true }
      );
    });
  });

  describe('upload failure', () => {
    it('should handle upload API error', async () => {
      setToken('iqt_valid_token_123456');
      mockIsAuthenticated.mockReturnValue(true);
      mockUploadBaseline.mockRejectedValue(new Error('Network error'));
      saveProjectLink({ projectId: 'proj_123', projectName: 'Test', linkedAt: new Date().toISOString() });
      writeFileSync(join(testDir, 'inquest-baseline.json'), JSON.stringify(cloudFormatBaseline));

      const { uploadCommand } = await import('../../src/cli/commands/upload.js');

      await expect(
        uploadCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('Upload failed'))).toBe(true);
    });
  });
});
