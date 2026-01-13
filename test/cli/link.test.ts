/**
 * Integration tests for the link CLI command.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the cloud client
const mockGetProject = vi.fn();
const mockCreateProject = vi.fn();
const mockListProjects = vi.fn();
const mockIsAuthenticated = vi.fn();

vi.mock('../../src/cloud/client.js', () => ({
  createCloudClient: vi.fn(() => ({
    isAuthenticated: mockIsAuthenticated,
    getProject: mockGetProject,
    createProject: mockCreateProject,
    listProjects: mockListProjects,
  })),
}));

// Import types only - auth functions are imported dynamically after HOME is set
import type { ProjectLink, StoredSession } from '../../src/cloud/types.js';

// Auth functions will be imported dynamically in tests
let saveSession: (session: StoredSession) => void;
let clearSession: () => void;
let getLinkedProject: (projectDir?: string) => ProjectLink | null;
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

describe('link command', () => {
  let testDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];
  let processExitSpy: MockInstance;
  let originalExit: typeof process.exit;

  beforeEach(async () => {
    // Create temp directory for test config
    testDir = join(tmpdir(), `inquest-link-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'my-project'), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(join(testDir, 'my-project'));

    // Override HOME to use test directory
    originalHome = process.env.HOME;
    process.env.HOME = testDir;

    // Create .inquest directory for both global and project config
    mkdirSync(join(testDir, '.inquest'), { recursive: true });
    mkdirSync(join(testDir, 'my-project', '.inquest'), { recursive: true });

    // Reset modules so auth module picks up new HOME
    vi.resetModules();

    // Dynamically import auth functions after HOME is set
    const auth = await import('../../src/cloud/auth.js');
    saveSession = auth.saveSession;
    clearSession = auth.clearSession;
    getLinkedProject = auth.getLinkedProject;
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
    mockGetProject.mockReset();
    mockCreateProject.mockReset();
    mockListProjects.mockReset();
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
      // Ignore cleanup errors
    }
  });

  describe('--status flag', () => {
    it('should show not linked when no link exists', async () => {
      removeProjectLink();

      const { linkCommand } = await import('../../src/cli/commands/link.js');
      await linkCommand.parseAsync(['node', 'test', '--status']);

      expect(consoleOutput.some(line => line.includes('Not linked'))).toBe(true);
    });

    it('should show link info when linked', async () => {
      const link: ProjectLink = {
        projectId: 'proj_123',
        projectName: 'Test Project',
        linkedAt: new Date().toISOString(),
      };
      saveProjectLink(link);

      const { linkCommand } = await import('../../src/cli/commands/link.js');
      await linkCommand.parseAsync(['node', 'test', '--status']);

      expect(consoleOutput.some(line => line.includes('Test Project'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('proj_123'))).toBe(true);
    });
  });

  describe('--unlink flag', () => {
    it('should remove existing link', async () => {
      const link: ProjectLink = {
        projectId: 'proj_123',
        projectName: 'To Unlink',
        linkedAt: new Date().toISOString(),
      };
      saveProjectLink(link);
      expect(getLinkedProject()).not.toBeNull();

      const { linkCommand } = await import('../../src/cli/commands/link.js');
      await linkCommand.parseAsync(['node', 'test', '--unlink']);

      expect(getLinkedProject()).toBeNull();
      expect(consoleOutput.some(line => line.includes('removed'))).toBe(true);
    });

    it('should handle no link to remove', async () => {
      removeProjectLink();

      const { linkCommand } = await import('../../src/cli/commands/link.js');
      await linkCommand.parseAsync(['node', 'test', '--unlink']);

      expect(consoleOutput.some(line => line.includes('No project link'))).toBe(true);
    });
  });

  describe('link to existing project', () => {
    it('should link to existing project by ID', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetProject.mockResolvedValue({
        id: 'proj_existing',
        name: 'Existing Project',
        serverCommand: 'npm start',
      });

      const { linkCommand } = await import('../../src/cli/commands/link.js');
      await linkCommand.parseAsync(['node', 'test', 'proj_existing']);

      const link = getLinkedProject();
      expect(link?.projectId).toBe('proj_existing');
      expect(link?.projectName).toBe('Existing Project');
      expect(consoleOutput.some(line => line.includes('Linked to project'))).toBe(true);
    });

    it('should fail when project not found', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockGetProject.mockResolvedValue(null);

      const { linkCommand } = await import('../../src/cli/commands/link.js');

      await expect(
        linkCommand.parseAsync(['node', 'test', 'proj_nonexistent'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('not found'))).toBe(true);
    });
  });

  describe('create new project', () => {
    it('should create project with inferred name', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockCreateProject.mockResolvedValue({
        id: 'proj_new',
        name: 'my-project', // Inferred from directory name
        serverCommand: 'node dist/server.js',
      });

      const { linkCommand } = await import('../../src/cli/commands/link.js');
      await linkCommand.parseAsync(['node', 'test']);

      expect(mockCreateProject).toHaveBeenCalledWith('my-project', 'node dist/server.js');
      const link = getLinkedProject();
      expect(link?.projectId).toBe('proj_new');
    });

    it('should create project with custom name', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockCreateProject.mockResolvedValue({
        id: 'proj_custom',
        name: 'Custom Name',
        serverCommand: 'npm start',
      });

      const { linkCommand } = await import('../../src/cli/commands/link.js');
      await linkCommand.parseAsync(['node', 'test', '--name', 'Custom Name', '--command', 'npm start']);

      expect(mockCreateProject).toHaveBeenCalledWith('Custom Name', 'npm start');
      const link = getLinkedProject();
      expect(link?.projectName).toBe('Custom Name');
    });

    it('should handle project creation failure', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockCreateProject.mockRejectedValue(new Error('API error'));

      const { linkCommand } = await import('../../src/cli/commands/link.js');

      await expect(
        linkCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('Failed to create'))).toBe(true);
    });
  });

  describe('authentication required', () => {
    it('should fail when not authenticated', async () => {
      clearSession();

      const { linkCommand } = await import('../../src/cli/commands/link.js');

      await expect(
        linkCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('Not authenticated'))).toBe(true);
    });

    it('should fail when token is invalid', async () => {
      saveSession(createTestSession('sess_invalid_token_1234567890123456'));
      mockIsAuthenticated.mockReturnValue(false);

      const { linkCommand } = await import('../../src/cli/commands/link.js');

      await expect(
        linkCommand.parseAsync(['node', 'test'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('Authentication failed'))).toBe(true);
    });
  });

  describe('projects command', () => {
    it('should list projects', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockListProjects.mockResolvedValue([
        {
          id: 'proj_1',
          name: 'Project One',
          baselineCount: 5,
          lastUploadAt: '2024-01-15T10:00:00Z',
        },
        {
          id: 'proj_2',
          name: 'Project Two',
          baselineCount: 0,
          lastUploadAt: null,
        },
      ]);

      const { projectsCommand } = await import('../../src/cli/commands/link.js');
      await projectsCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('Project One'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Project Two'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Never'))).toBe(true);
    });

    it('should output JSON when --json flag is set', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockListProjects.mockResolvedValue([
        { id: 'proj_json', name: 'JSON Project', baselineCount: 1, lastUploadAt: null },
      ]);

      const { projectsCommand } = await import('../../src/cli/commands/link.js');
      await projectsCommand.parseAsync(['node', 'test', '--json']);

      const jsonOutput = consoleOutput.find(line => line.startsWith('['));
      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput!);
      expect(parsed[0].id).toBe('proj_json');
    });

    it('should show empty state when no projects', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockListProjects.mockResolvedValue([]);

      const { projectsCommand } = await import('../../src/cli/commands/link.js');
      await projectsCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('No projects found'))).toBe(true);
    });

    it('should mark currently linked project', async () => {
      saveSession(createTestSession());
      mockIsAuthenticated.mockReturnValue(true);
      mockListProjects.mockResolvedValue([
        { id: 'proj_linked', name: 'Linked', baselineCount: 1, lastUploadAt: null },
        { id: 'proj_other', name: 'Other', baselineCount: 0, lastUploadAt: null },
      ]);
      saveProjectLink({
        projectId: 'proj_linked',
        projectName: 'Linked',
        linkedAt: new Date().toISOString(),
      });

      const { projectsCommand } = await import('../../src/cli/commands/link.js');
      await projectsCommand.parseAsync(['node', 'test']);

      expect(consoleOutput.some(line => line.includes('Currently linked'))).toBe(true);
    });
  });
});

describe('project link functions', () => {
  let testDir: string;
  let originalHome: string | undefined;
  let originalCwd: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `inquest-link-fn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '.inquest'), { recursive: true });
    originalHome = process.env.HOME;
    originalCwd = process.cwd();
    process.env.HOME = testDir;
    process.chdir(testDir);

    // Reset modules so auth module picks up new HOME
    vi.resetModules();

    // Dynamically import auth functions after HOME is set
    const auth = await import('../../src/cloud/auth.js');
    getLinkedProject = auth.getLinkedProject;
    saveProjectLink = auth.saveProjectLink;
    removeProjectLink = auth.removeProjectLink;

    removeProjectLink();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should save and retrieve project link', async () => {
    const link: ProjectLink = {
      projectId: 'proj_test',
      projectName: 'Test',
      linkedAt: '2024-01-01T00:00:00Z',
    };

    saveProjectLink(link);
    const retrieved = getLinkedProject();

    expect(retrieved).toEqual(link);
  });

  it('should overwrite existing link', () => {
    saveProjectLink({ projectId: 'proj_1', projectName: 'First', linkedAt: '2024-01-01T00:00:00Z' });
    saveProjectLink({ projectId: 'proj_2', projectName: 'Second', linkedAt: '2024-01-02T00:00:00Z' });

    const link = getLinkedProject();
    expect(link?.projectId).toBe('proj_2');
  });

  it('should return null when no link exists', () => {
    expect(getLinkedProject()).toBeNull();
  });

  it('should remove link and return true', () => {
    saveProjectLink({ projectId: 'proj_x', projectName: 'X', linkedAt: new Date().toISOString() });

    const result = removeProjectLink();

    expect(result).toBe(true);
    expect(getLinkedProject()).toBeNull();
  });

  it('should return false when no link to remove', () => {
    const result = removeProjectLink();
    expect(result).toBe(false);
  });
});
