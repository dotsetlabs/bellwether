import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import auth functions for testing
import {
  getSessionToken,
  saveSession,
  clearSession,
  isValidSessionFormat,
  isMockSession,
  getLinkedProject,
  saveProjectLink,
  removeProjectLink,
  getTeamId,
  getActiveTeam,
  getSessionTeams,
  setActiveTeam,
  getStoredSession,
  TEAM_ID_ENV_VAR,
} from '../../src/cloud/auth.js';
import { generateMockSession } from '../../src/cloud/mock-client.js';
import type { ProjectLink, SessionTeam, StoredSession } from '../../src/cloud/types.js';

describe('cli/cloud-commands', () => {
  let testDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    // Create temp directory for test config
    testDir = join(tmpdir(), `bellwether-cloud-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Override HOME to use test directory
    originalHome = process.env.HOME;
    process.env.HOME = testDir;

    // Create .bellwether directory
    mkdirSync(join(testDir, '.bellwether'), { recursive: true });

    // Capture console output
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.join(' '));
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    vi.restoreAllMocks();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('login command - auth functions', () => {
    // Valid test tokens: sess_ + 64 hex characters
    const VALID_TOKEN = 'sess_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    describe('session validation', () => {
      it('should validate correct session format', () => {
        // Valid: sess_ + 64 hex chars
        expect(isValidSessionFormat(VALID_TOKEN)).toBe(true);
        // Mock sessions are also valid
        expect(isValidSessionFormat('sess_mock_dev_0123456789abcdef')).toBe(true);
      });

      it('should reject invalid session format', () => {
        expect(isValidSessionFormat('invalid')).toBe(false);
        expect(isValidSessionFormat('abc_123456')).toBe(false);
        expect(isValidSessionFormat('')).toBe(false);
        expect(isValidSessionFormat('sess_short')).toBe(false); // Too short
        expect(isValidSessionFormat('iqt_oldformat123456')).toBe(false); // Old format
        // Wrong length (not 64 hex chars)
        expect(isValidSessionFormat('sess_abcdef123456789012345678901234567890')).toBe(false);
      });

      it('should identify mock sessions', () => {
        expect(isMockSession('sess_mock_dev_0123456789abcdef')).toBe(true);
        expect(isMockSession(VALID_TOKEN)).toBe(false);
      });
    });

    describe('mock session generation', () => {
      it('should generate valid mock session', () => {
        const session = generateMockSession('dev');

        expect(session.sessionToken).toMatch(/^sess_mock_dev_/);
        expect(isValidSessionFormat(session.sessionToken)).toBe(true);
        expect(isMockSession(session.sessionToken)).toBe(true);
        expect(session.user).toBeDefined();
        expect(session.user.githubLogin).toBe('dev');
        expect(session.expiresAt).toBeDefined();
      });

      it('should generate unique sessions', () => {
        const session1 = generateMockSession('test');
        const session2 = generateMockSession('test');

        expect(session1.sessionToken).not.toBe(session2.sessionToken);
      });
    });

    describe('session storage', () => {
      it('should store and retrieve session', () => {
        const session = generateMockSession('test');
        saveSession(session);

        const retrieved = getSessionToken();
        expect(retrieved).toBe(session.sessionToken);
      });

      it('should clear stored session', () => {
        const session = generateMockSession('test');
        saveSession(session);
        clearSession();

        const retrieved = getSessionToken();
        expect(retrieved).toBeUndefined();
      });

      it('should return undefined when no session stored', () => {
        clearSession();
        const token = getSessionToken();
        expect(token).toBeUndefined();
      });
    });
  });

  describe('link command - project linking', () => {
    describe('saveProjectLink', () => {
      it('should save project link to .bellwether/link.json', () => {
        const link: ProjectLink = {
          projectId: 'proj_123',
          projectName: 'My Project',
          linkedAt: new Date().toISOString(),
        };

        saveProjectLink(link);

        const retrieved = getLinkedProject();
        expect(retrieved).toEqual(link);
      });

      it('should overwrite existing link', () => {
        const link1: ProjectLink = {
          projectId: 'proj_123',
          projectName: 'First Project',
          linkedAt: new Date().toISOString(),
        };
        const link2: ProjectLink = {
          projectId: 'proj_456',
          projectName: 'Second Project',
          linkedAt: new Date().toISOString(),
        };

        saveProjectLink(link1);
        saveProjectLink(link2);

        const retrieved = getLinkedProject();
        expect(retrieved?.projectId).toBe('proj_456');
      });
    });

    describe('getLinkedProject', () => {
      it('should return null when no link exists', () => {
        removeProjectLink();
        const link = getLinkedProject();
        expect(link).toBeNull();
      });

      it('should return stored link', () => {
        const link: ProjectLink = {
          projectId: 'proj_test',
          projectName: 'Test Project',
          linkedAt: '2024-01-01T00:00:00Z',
        };

        saveProjectLink(link);

        const retrieved = getLinkedProject();
        expect(retrieved?.projectId).toBe('proj_test');
        expect(retrieved?.projectName).toBe('Test Project');
      });
    });

    describe('removeProjectLink', () => {
      it('should remove existing link', () => {
        const link: ProjectLink = {
          projectId: 'proj_123',
          projectName: 'To Remove',
          linkedAt: new Date().toISOString(),
        };

        saveProjectLink(link);
        const removed = removeProjectLink();

        expect(removed).toBe(true);
        expect(getLinkedProject()).toBeNull();
      });

      it('should return false when no link to remove', () => {
        removeProjectLink(); // Ensure clean state
        const removed = removeProjectLink();

        expect(removed).toBe(false);
      });
    });
  });


  describe('history command - formatting', () => {
    it('should format date correctly', () => {
      const isoDate = '2024-06-15T14:30:00Z';
      const date = new Date(isoDate);

      // The formatDate function formats to locale string
      const formatted = date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      expect(formatted).toContain('2024');
      expect(formatted).toContain('Jun');
      expect(formatted).toContain('15');
    });
  });

  describe('diff command - severity display', () => {
    it('should map severity levels correctly', () => {
      const severityIcons: Record<string, string> = {
        none: '✓',
        info: 'ℹ',
        warning: '⚠',
        breaking: '✗',
      };

      expect(severityIcons['none']).toBe('✓');
      expect(severityIcons['info']).toBe('ℹ');
      expect(severityIcons['warning']).toBe('⚠');
      expect(severityIcons['breaking']).toBe('✗');
    });

    it('should format diff summary parts', () => {
      const diff = {
        severity: 'warning',
        toolsAdded: 2,
        toolsRemoved: 1,
        toolsModified: 3,
        behaviorChanges: 5,
      };

      const parts: string[] = [];
      if (diff.toolsAdded > 0) parts.push(`+${diff.toolsAdded} tools`);
      if (diff.toolsRemoved > 0) parts.push(`-${diff.toolsRemoved} tools`);
      if (diff.toolsModified > 0) parts.push(`~${diff.toolsModified} modified`);
      if (diff.behaviorChanges > 0) parts.push(`${diff.behaviorChanges} behavior changes`);

      expect(parts).toContain('+2 tools');
      expect(parts).toContain('-1 tools');
      expect(parts).toContain('~3 modified');
      expect(parts).toContain('5 behavior changes');
    });

    it('should handle empty diff', () => {
      const diff = {
        severity: 'none',
        toolsAdded: 0,
        toolsRemoved: 0,
        toolsModified: 0,
        behaviorChanges: 0,
      };

      const hasChanges =
        diff.toolsAdded > 0 ||
        diff.toolsRemoved > 0 ||
        diff.toolsModified > 0 ||
        diff.behaviorChanges > 0;

      expect(hasChanges).toBe(false);
    });
  });

  describe('projects command - output formatting', () => {
    it('should truncate long project names', () => {
      const longName = 'this-is-a-very-long-project-name-that-exceeds-limit';
      const truncated = longName.slice(0, 19);

      expect(truncated).toBe('this-is-a-very-long');
      expect(truncated.length).toBeLessThanOrEqual(19);
    });

    it('should pad project fields correctly', () => {
      const projectId = 'proj_123';
      const padded = projectId.padEnd(20);

      expect(padded.length).toBe(20);
      expect(padded.startsWith('proj_123')).toBe(true);
    });

    it('should handle missing last upload date', () => {
      const lastUploadAt: string | null = null;
      const displayDate = lastUploadAt
        ? new Date(lastUploadAt).toLocaleDateString()
        : 'Never';

      expect(displayDate).toBe('Never');
    });
  });

  describe('team management', () => {
    const mockTeams: SessionTeam[] = [
      { id: 'team_personal', name: 'Personal', plan: 'free', role: 'owner' },
      { id: 'team_work', name: 'Work Team', plan: 'team', role: 'member' },
      { id: 'team_client', name: 'Client Project', plan: 'solo', role: 'admin' },
    ];

    const createSessionWithTeams = (teams: SessionTeam[], activeTeamId?: string): StoredSession => ({
      sessionToken: 'sess_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      user: {
        id: 'usr_test',
        email: 'test@example.com',
        githubLogin: 'testuser',
        githubAvatarUrl: null,
        githubName: 'Test User',
        plan: 'free',
      },
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      activeTeamId,
      teams,
    });

    describe('getSessionTeams', () => {
      it('should return empty array when no session', () => {
        clearSession();
        const teams = getSessionTeams();
        expect(teams).toEqual([]);
      });

      it('should return teams from session', () => {
        const session = createSessionWithTeams(mockTeams, 'team_personal');
        saveSession(session);

        const teams = getSessionTeams();
        expect(teams).toHaveLength(3);
        expect(teams[0].name).toBe('Personal');
        expect(teams[1].name).toBe('Work Team');
      });

      it('should return empty array when session has no teams', () => {
        const session = generateMockSession('test');
        saveSession(session);

        const teams = getSessionTeams();
        expect(teams).toEqual([]);
      });
    });

    describe('getTeamId', () => {
      let originalEnvTeamId: string | undefined;

      beforeEach(() => {
        originalEnvTeamId = process.env[TEAM_ID_ENV_VAR];
        delete process.env[TEAM_ID_ENV_VAR];
      });

      afterEach(() => {
        if (originalEnvTeamId !== undefined) {
          process.env[TEAM_ID_ENV_VAR] = originalEnvTeamId;
        } else {
          delete process.env[TEAM_ID_ENV_VAR];
        }
      });

      it('should return undefined when no session', () => {
        clearSession();
        const teamId = getTeamId();
        expect(teamId).toBeUndefined();
      });

      it('should return activeTeamId from session', () => {
        const session = createSessionWithTeams(mockTeams, 'team_work');
        saveSession(session);

        const teamId = getTeamId();
        expect(teamId).toBe('team_work');
      });

      it('should prioritize environment variable over session', () => {
        const session = createSessionWithTeams(mockTeams, 'team_personal');
        saveSession(session);
        process.env[TEAM_ID_ENV_VAR] = 'team_env_override';

        const teamId = getTeamId();
        expect(teamId).toBe('team_env_override');
      });

      it('should prioritize project link over session', () => {
        const session = createSessionWithTeams(mockTeams, 'team_personal');
        saveSession(session);

        const link: ProjectLink = {
          projectId: 'proj_123',
          projectName: 'Test Project',
          linkedAt: new Date().toISOString(),
          teamId: 'team_project_link',
        };
        saveProjectLink(link);

        const teamId = getTeamId();
        expect(teamId).toBe('team_project_link');
      });

      it('should prioritize env var over project link', () => {
        const session = createSessionWithTeams(mockTeams, 'team_personal');
        saveSession(session);

        const link: ProjectLink = {
          projectId: 'proj_123',
          projectName: 'Test Project',
          linkedAt: new Date().toISOString(),
          teamId: 'team_project_link',
        };
        saveProjectLink(link);
        process.env[TEAM_ID_ENV_VAR] = 'team_env_override';

        const teamId = getTeamId();
        expect(teamId).toBe('team_env_override');
      });
    });

    describe('getActiveTeam', () => {
      it('should return undefined when no session', () => {
        clearSession();
        const team = getActiveTeam();
        expect(team).toBeUndefined();
      });

      it('should return the active team details', () => {
        const session = createSessionWithTeams(mockTeams, 'team_work');
        saveSession(session);

        const team = getActiveTeam();
        expect(team).toBeDefined();
        expect(team?.id).toBe('team_work');
        expect(team?.name).toBe('Work Team');
        expect(team?.plan).toBe('team');
        expect(team?.role).toBe('member');
      });

      it('should return undefined when active team not in teams list', () => {
        const session = createSessionWithTeams(mockTeams, 'team_nonexistent');
        saveSession(session);

        const team = getActiveTeam();
        expect(team).toBeUndefined();
      });
    });

    describe('setActiveTeam', () => {
      it('should return false when no session', () => {
        clearSession();
        const result = setActiveTeam('team_work');
        expect(result).toBe(false);
      });

      it('should return false when team not in session', () => {
        const session = createSessionWithTeams(mockTeams, 'team_personal');
        saveSession(session);

        const result = setActiveTeam('team_nonexistent');
        expect(result).toBe(false);

        // Active team should remain unchanged
        const stored = getStoredSession();
        expect(stored?.activeTeamId).toBe('team_personal');
      });

      it('should switch to valid team', () => {
        const session = createSessionWithTeams(mockTeams, 'team_personal');
        saveSession(session);

        const result = setActiveTeam('team_work');
        expect(result).toBe(true);

        const stored = getStoredSession();
        expect(stored?.activeTeamId).toBe('team_work');
      });

      it('should persist team switch across session reads', () => {
        const session = createSessionWithTeams(mockTeams, 'team_personal');
        saveSession(session);

        setActiveTeam('team_client');

        // Clear any caching and re-read
        const teams = getSessionTeams();
        const activeTeam = getActiveTeam();

        expect(teams).toHaveLength(3);
        expect(activeTeam?.id).toBe('team_client');
        expect(activeTeam?.name).toBe('Client Project');
      });
    });

    describe('project link with team context', () => {
      it('should store team context in project link', () => {
        const link: ProjectLink = {
          projectId: 'proj_123',
          projectName: 'Test Project',
          linkedAt: new Date().toISOString(),
          teamId: 'team_work',
          teamName: 'Work Team',
        };

        saveProjectLink(link);
        const retrieved = getLinkedProject();

        expect(retrieved?.teamId).toBe('team_work');
        expect(retrieved?.teamName).toBe('Work Team');
      });

      it('should work without team context for backwards compatibility', () => {
        const link: ProjectLink = {
          projectId: 'proj_123',
          projectName: 'Old Project',
          linkedAt: new Date().toISOString(),
        };

        saveProjectLink(link);
        const retrieved = getLinkedProject();

        expect(retrieved?.projectId).toBe('proj_123');
        expect(retrieved?.teamId).toBeUndefined();
        expect(retrieved?.teamName).toBeUndefined();
      });
    });
  });

  describe('CI mode behavior', () => {
    it('should use minimal output format in CI mode', () => {
      const isCiMode = true;
      const result = {
        version: 1,
        viewUrl: 'https://bellwether.sh/p/proj_123/v/1',
      };

      if (isCiMode) {
        // CI mode outputs only URL
        consoleOutput.push(result.viewUrl);
      }

      expect(consoleOutput).toContain('https://bellwether.sh/p/proj_123/v/1');
    });

    it('should check for breaking changes in CI mode', () => {
      const diff = { severity: 'breaking' };
      const shouldFail = diff.severity === 'breaking';

      expect(shouldFail).toBe(true);
    });

    it('should check for any drift with --fail-on-drift', () => {
      const diff = { severity: 'info' };
      const failOnDrift = true;
      const shouldFail = failOnDrift && diff.severity !== 'none';

      expect(shouldFail).toBe(true);
    });
  });
});
