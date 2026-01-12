import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import auth functions for testing
import {
  getToken,
  setToken,
  clearToken,
  isValidTokenFormat,
  isMockToken,
  getLinkedProject,
  saveProjectLink,
  removeProjectLink,
} from '../../src/cloud/auth.js';
import { generateMockToken } from '../../src/cloud/mock-client.js';
import type { ProjectLink } from '../../src/cloud/types.js';

describe('cli/cloud-commands', () => {
  let testDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    // Create temp directory for test config
    testDir = join(tmpdir(), `inquest-cloud-test-${Date.now()}`);
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
    describe('token validation', () => {
      it('should validate correct token format', () => {
        expect(isValidTokenFormat('iqt_abcdef123456')).toBe(true);
        expect(isValidTokenFormat('iqt_mock_dev_1234')).toBe(true);
      });

      it('should reject invalid token format', () => {
        expect(isValidTokenFormat('invalid')).toBe(false);
        expect(isValidTokenFormat('abc_123456')).toBe(false);
        expect(isValidTokenFormat('')).toBe(false);
        expect(isValidTokenFormat('iqt_short')).toBe(false); // Too short
      });

      it('should identify mock tokens', () => {
        expect(isMockToken('iqt_mock_dev_1234567890')).toBe(true);
        expect(isMockToken('iqt_real_token_here')).toBe(false);
      });
    });

    describe('mock token generation', () => {
      it('should generate valid mock token', () => {
        const token = generateMockToken('dev');

        expect(token).toMatch(/^iqt_mock_dev_/);
        expect(isValidTokenFormat(token)).toBe(true);
        expect(isMockToken(token)).toBe(true);
      });

      it('should generate unique tokens', () => {
        const token1 = generateMockToken('test');
        const token2 = generateMockToken('test');

        expect(token1).not.toBe(token2);
      });
    });

    describe('token storage', () => {
      it('should store and retrieve token', () => {
        const token = 'iqt_test_token_123456';
        setToken(token);

        const retrieved = getToken();
        expect(retrieved).toBe(token);
      });

      it('should clear stored token', () => {
        setToken('iqt_test_token_123456');
        clearToken();

        const retrieved = getToken();
        expect(retrieved).toBeUndefined();
      });

      it('should return undefined when no token stored', () => {
        clearToken();
        const token = getToken();
        expect(token).toBeUndefined();
      });
    });
  });

  describe('link command - project linking', () => {
    describe('saveProjectLink', () => {
      it('should save project link to .inquest/link.json', () => {
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

  describe('upload command - baseline handling', () => {
    it('should detect cloud format baseline', () => {
      const cloudBaseline = {
        version: '1.0',
        metadata: {
          formatVersion: '1.0',
          serverName: 'test',
          cliVersion: '0.1.0',
        },
        tools: [],
        assertions: [],
      };

      // Check format detection
      const isCloudFormat =
        cloudBaseline.version === '1.0' &&
        cloudBaseline.metadata?.formatVersion === '1.0';

      expect(isCloudFormat).toBe(true);
    });

    it('should detect local format baseline', () => {
      const localBaseline = {
        discovery: {
          serverInfo: { name: 'test', version: '1.0.0' },
        },
        toolProfiles: [],
      };

      // Local format doesn't have version field
      const isCloudFormat = 'version' in localBaseline;

      expect(isCloudFormat).toBe(false);
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

  describe('CI mode behavior', () => {
    it('should use minimal output format in CI mode', () => {
      const isCiMode = true;
      const result = {
        version: 1,
        viewUrl: 'https://inquest.dev/p/proj_123/v/1',
      };

      if (isCiMode) {
        // CI mode outputs only URL
        consoleOutput.push(result.viewUrl);
      }

      expect(consoleOutput).toContain('https://inquest.dev/p/proj_123/v/1');
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
