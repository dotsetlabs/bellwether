/**
 * Tests for the mock cloud client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Mock the output module
vi.mock('../../src/cli/output.js', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));

// Mock the auth module
vi.mock('../../src/cloud/auth.js', () => ({
  isMockSession: vi.fn((token: string) => token?.startsWith('sess_mock_')),
  MOCK_SESSION_PREFIX: 'sess_mock_',
}));

describe('MockCloudClient', () => {
  const mockDataDir = join(homedir(), '.bellwether', 'mock-cloud');
  let originalMockData: string[];

  beforeEach(() => {
    // Clear any existing mock data before each test
    if (existsSync(mockDataDir)) {
      // Save file list for restoration
      originalMockData = [];
    }
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up test data
    const { clearMockData } = await import('../../src/cloud/mock-client.js');
    clearMockData();
  });

  describe('constructor', () => {
    it('should create client without session token', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const client = new MockCloudClient();
      expect(client).toBeDefined();
      expect(client.isAuthenticated()).toBe(false);
    });

    it('should create client with mock session token', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const client = new MockCloudClient('sess_mock_testuser_abc123');
      expect(client).toBeDefined();
      expect(client.isAuthenticated()).toBe(true);
    });

    it('should warn when using non-mock session token', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const output = await import('../../src/cli/output.js');

      new MockCloudClient('sess_real_token_123');

      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('MockCloudClient instantiated with non-mock session token')
      );
    });

    it('should create data directory if it does not exist', async () => {
      // Remove directory first
      if (existsSync(mockDataDir)) {
        rmSync(mockDataDir, { recursive: true, force: true });
      }

      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      new MockCloudClient('sess_mock_test_123');

      expect(existsSync(mockDataDir)).toBe(true);
    });
  });

  describe('isAuthenticated', () => {
    it('should return false without session token', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const client = new MockCloudClient();
      expect(client.isAuthenticated()).toBe(false);
    });

    it('should return true with mock session token', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const client = new MockCloudClient('sess_mock_user_abc');
      expect(client.isAuthenticated()).toBe(true);
    });

    it('should return false with non-mock session token', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const client = new MockCloudClient('sess_real_user_abc');
      expect(client.isAuthenticated()).toBe(false);
    });
  });

  describe('whoami', () => {
    it('should return null when not authenticated', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const client = new MockCloudClient();
      const user = await client.whoami();
      expect(user).toBeNull();
    });

    it('should return user info when authenticated', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const client = new MockCloudClient('sess_mock_testuser_abc123');
      const user = await client.whoami();

      expect(user).not.toBeNull();
      expect(user?.email).toBe('testuser@localhost');
      expect(user?.githubLogin).toBe('testuser');
      expect(user?.plan).toBe('free');
    });

    it('should extract username from session token', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const client = new MockCloudClient('sess_mock_johndoe_xyz789');
      const user = await client.whoami();

      expect(user?.id).toBe('usr_mock_johndoe');
      expect(user?.email).toBe('johndoe@localhost');
    });
  });

  describe('project management', () => {
    it('should throw when listing projects while not authenticated', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const client = new MockCloudClient();

      await expect(client.listProjects()).rejects.toThrow('Not authenticated');
    });

    it('should return empty array when no projects exist', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const projects = await client.listProjects();

      expect(projects).toEqual([]);
    });

    it('should create and list projects', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');

      const project = await client.createProject('Test Project', 'npx test-server');

      expect(project).toBeDefined();
      expect(project.id).toMatch(/^proj_/);
      expect(project.name).toBe('Test Project');
      expect(project.serverCommand).toBe('npx test-server');
      expect(project.baselineCount).toBe(0);

      const projects = await client.listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(project.id);
    });

    it('should get project by ID', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const created = await client.createProject('My Project', 'npx my-server');

      const project = await client.getProject(created.id);

      expect(project).not.toBeNull();
      expect(project?.name).toBe('My Project');
    });

    it('should return null for non-existent project', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.getProject('proj_nonexistent_123');

      expect(project).toBeNull();
    });

    it('should delete project', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('To Delete', 'npx server');

      await client.deleteProject(project.id);

      const projects = await client.listProjects();
      expect(projects).toHaveLength(0);
    });

    it('should throw when deleting non-existent project', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');

      await expect(client.deleteProject('proj_nonexistent_123')).rejects.toThrow('Project not found');
    });
  });

  describe('baseline management', () => {
    const sampleBaseline = {
      version: '1.0.0',
      hash: 'abc123def456',
      metadata: {
        mode: 'check' as const,
        generatedAt: new Date().toISOString(),
        cliVersion: '1.0.0',
        serverCommand: 'npx test-server',
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
            name: 'read_file',
            description: 'Read a file',
            schemaHash: 'schema123',
            inputSchema: { type: 'object' },
          },
        ],
        prompts: [],
        resources: [],
      },
      interviews: [],
      toolProfiles: [],
      assertions: [],
      summary: 'Test baseline',
    };

    it('should upload baseline to project', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const result = await client.uploadBaseline(project.id, sampleBaseline as any);

      expect(result).toBeDefined();
      expect(result.baselineId).toMatch(/^bl_/);
      expect(result.version).toBe(1);
      expect(result.projectId).toBe(project.id);
      expect(result.viewUrl).toContain('file://');
    });

    it('should increment version on subsequent uploads', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const result1 = await client.uploadBaseline(project.id, sampleBaseline as any);
      const result2 = await client.uploadBaseline(project.id, sampleBaseline as any);

      expect(result1.version).toBe(1);
      expect(result2.version).toBe(2);
    });

    it('should provide diff URL for versions > 1', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const result1 = await client.uploadBaseline(project.id, sampleBaseline as any);
      const result2 = await client.uploadBaseline(project.id, sampleBaseline as any);

      expect(result1.diffUrl).toBeUndefined();
      expect(result2.diffUrl).toBeDefined();
    });

    it('should throw when uploading to non-existent project', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');

      await expect(client.uploadBaseline('proj_nonexistent_123', sampleBaseline as any)).rejects.toThrow(
        'Project not found'
      );
    });

    it('should get baseline by ID', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');
      const uploaded = await client.uploadBaseline(project.id, sampleBaseline as any);

      const baseline = await client.getBaseline(uploaded.baselineId);

      expect(baseline).not.toBeNull();
      expect(baseline?.hash).toBe('abc123def456');
    });

    it('should return null for non-existent baseline', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const baseline = await client.getBaseline('bl_nonexistent_123');

      expect(baseline).toBeNull();
    });
  });

  describe('history', () => {
    const sampleBaseline = {
      version: '1.0.0',
      hash: 'abc123',
      metadata: {
        mode: 'check' as const,
        generatedAt: new Date().toISOString(),
        cliVersion: '1.0.0',
        serverCommand: 'npx test-server',
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
        tools: [],
        prompts: [],
        resources: [],
      },
      interviews: [],
      toolProfiles: [],
      assertions: [],
      summary: 'Test baseline',
    };

    it('should return empty history for new project', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const history = await client.getHistory(project.id);

      expect(history).toEqual([]);
    });

    it('should return history in reverse chronological order', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      await client.uploadBaseline(project.id, sampleBaseline as any);
      await client.uploadBaseline(project.id, { ...sampleBaseline, hash: 'xyz789' } as any);

      const history = await client.getHistory(project.id);

      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(2); // Most recent first
      expect(history[1].version).toBe(1);
    });

    it('should respect limit parameter', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      // Upload 5 baselines
      for (let i = 0; i < 5; i++) {
        await client.uploadBaseline(project.id, { ...sampleBaseline, hash: `hash${i}` } as any);
      }

      const history = await client.getHistory(project.id, 3);

      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(5);
    });

    it('should throw for non-existent project', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');

      await expect(client.getHistory('proj_nonexistent_123')).rejects.toThrow('Project not found');
    });
  });

  describe('diff computation', () => {
    it('should return no changes for identical baselines', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const baseline = {
        version: '1.0.0',
        hash: 'same_hash',
        metadata: {
          mode: 'check' as const,
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'npx server',
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
          tools: [{ name: 'tool1', description: 'desc', schemaHash: 'sch1', inputSchema: {} }],
          prompts: [],
          resources: [],
        },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'Test baseline',
      };

      await client.uploadBaseline(project.id, baseline as any);
      await client.uploadBaseline(project.id, baseline as any);

      const diff = await client.getDiff(project.id, 1, 2);

      expect(diff.severity).toBe('none');
      expect(diff.toolsAdded).toBe(0);
      expect(diff.toolsRemoved).toBe(0);
      expect(diff.toolsModified).toBe(0);
    });

    it('should detect added tools', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const baseline1 = {
        version: '1.0.0',
        hash: 'hash1',
        metadata: {
          mode: 'check' as const,
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'npx server',
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
          tools: [{ name: 'tool1', description: 'desc', schemaHash: 'sch1', inputSchema: {} }],
          prompts: [],
          resources: [],
        },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'Test baseline',
      };

      const baseline2 = {
        version: '1.0.0',
        hash: 'hash2',
        metadata: {
          mode: 'check' as const,
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'npx server',
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
            { name: 'tool1', description: 'desc', schemaHash: 'sch1', inputSchema: {} },
            { name: 'tool2', description: 'new tool', schemaHash: 'sch2', inputSchema: {} },
          ],
          prompts: [],
          resources: [],
        },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'Test baseline',
      };

      await client.uploadBaseline(project.id, baseline1 as any);
      await client.uploadBaseline(project.id, baseline2 as any);

      const diff = await client.getDiff(project.id, 1, 2);

      expect(diff.toolsAdded).toBe(1);
      expect(diff.toolsRemoved).toBe(0);
      expect(diff.severity).toBe('info');
    });

    it('should detect removed tools as breaking', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const baseline1 = {
        version: '1.0.0',
        hash: 'hash1',
        metadata: {
          mode: 'check' as const,
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'npx server',
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
            { name: 'tool1', description: 'desc', schemaHash: 'sch1', inputSchema: {} },
            { name: 'tool2', description: 'to remove', schemaHash: 'sch2', inputSchema: {} },
          ],
          prompts: [],
          resources: [],
        },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'Test baseline',
      };

      const baseline2 = {
        version: '1.0.0',
        hash: 'hash2',
        metadata: {
          mode: 'check' as const,
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'npx server',
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
          tools: [{ name: 'tool1', description: 'desc', schemaHash: 'sch1', inputSchema: {} }],
          prompts: [],
          resources: [],
        },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'Test baseline',
      };

      await client.uploadBaseline(project.id, baseline1 as any);
      await client.uploadBaseline(project.id, baseline2 as any);

      const diff = await client.getDiff(project.id, 1, 2);

      expect(diff.toolsRemoved).toBe(1);
      expect(diff.severity).toBe('breaking');
    });

    it('should detect modified tools', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const baseline1 = {
        version: '1.0.0',
        hash: 'hash1',
        metadata: {
          mode: 'check' as const,
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'npx server',
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
          tools: [{ name: 'tool1', description: 'desc', schemaHash: 'sch1', inputSchema: {} }],
          prompts: [],
          resources: [],
        },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'Test baseline',
      };

      const baseline2 = {
        version: '1.0.0',
        hash: 'hash2',
        metadata: {
          mode: 'check' as const,
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'npx server',
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
          tools: [{ name: 'tool1', description: 'desc', schemaHash: 'sch_modified', inputSchema: {} }],
          prompts: [],
          resources: [],
        },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'Test baseline',
      };

      await client.uploadBaseline(project.id, baseline1 as any);
      await client.uploadBaseline(project.id, baseline2 as any);

      const diff = await client.getDiff(project.id, 1, 2);

      expect(diff.toolsModified).toBe(1);
      expect(diff.severity).toBe('warning');
    });

    it('should throw for invalid version numbers', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      await expect(client.getDiff(project.id, 1, 2)).rejects.toThrow('Baseline version not found');
    });

    it('should get latest diff', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const baseline = {
        version: '1.0.0',
        hash: 'hash1',
        metadata: {
          mode: 'check' as const,
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'npx server',
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
        capabilities: { tools: [], prompts: [], resources: [] },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'Test baseline',
      };

      await client.uploadBaseline(project.id, baseline as any);
      await client.uploadBaseline(project.id, { ...baseline, hash: 'hash2' } as any);

      const diff = await client.getLatestDiff(project.id);

      expect(diff).not.toBeNull();
    });

    it('should return null for latest diff with < 2 baselines', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const diff = await client.getLatestDiff(project.id);

      expect(diff).toBeNull();
    });
  });

  describe('badge info', () => {
    it('should return null for non-existent project', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const badge = await client.getBadgeInfo('proj_nonexistent_123');

      expect(badge).toBeNull();
    });

    it('should return unknown status for project with no baselines', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const badge = await client.getBadgeInfo(project.id);

      expect(badge).not.toBeNull();
      expect(badge?.status).toBe('unknown');
      expect(badge?.statusText).toBe('No baseline');
    });

    it('should return verified status for project with one baseline', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const baseline = {
        version: '1.0.0',
        hash: 'hash1',
        metadata: {
          mode: 'check' as const,
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'npx server',
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
        capabilities: { tools: [], prompts: [], resources: [] },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'Test baseline',
      };

      await client.uploadBaseline(project.id, baseline as any);

      const badge = await client.getBadgeInfo(project.id);

      expect(badge?.status).toBe('passed');
      expect(badge?.statusText).toBe('Passed');
    });

    it('should include badge URL and markdown', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test Project', 'npx server');

      const badge = await client.getBadgeInfo(project.id);

      expect(badge?.badgeUrl).toContain('shields.io');
      expect(badge?.markdown).toContain('[![Bellwether]');
      expect(badge?.projectName).toBe('Test Project');
    });
  });

  describe('benchmark submission', () => {
    it('should throw when not authenticated', async () => {
      const { MockCloudClient } = await import('../../src/cloud/mock-client.js');
      const client = new MockCloudClient();

      await expect(
        client.submitBenchmark('proj_123', {
          serverId: 'test-server',
          version: '1.0.0',
          status: 'passed',
          tier: 'bronze',
          testedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          toolsTested: 5,
          testsPassed: 5,
          testsTotal: 5,
          passRate: 100,
          reportHash: 'abc123',
          bellwetherVersion: '1.0.0',
        })
      ).rejects.toThrow('Not authenticated');
    });

    it('should throw for non-existent project', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');

      await expect(
        client.submitBenchmark('proj_nonexistent_123', {
          serverId: 'test-server',
          version: '1.0.0',
          status: 'passed',
          tier: 'bronze',
          testedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          toolsTested: 5,
          testsPassed: 5,
          testsTotal: 5,
          passRate: 100,
          reportHash: 'abc123',
          bellwetherVersion: '1.0.0',
        })
      ).rejects.toThrow('Project not found');
    });

    it('should successfully submit benchmark', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const result = await client.submitBenchmark(project.id, {
        serverId: 'test-server',
        version: '1.0.0',
        status: 'passed',
        tier: 'silver',
        testedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        toolsTested: 10,
        testsPassed: 9,
        testsTotal: 10,
        passRate: 90,
        reportHash: 'def456',
        bellwetherVersion: '1.0.0',
      });

      expect(result).toBeDefined();
      expect(result.benchmarkId).toMatch(/^bench_/);
      expect(result.projectId).toBe(project.id);
      expect(result.viewUrl).toContain('file://');
    });

    it('should accept optional report data', async () => {
      const { MockCloudClient, clearMockData } = await import('../../src/cloud/mock-client.js');
      clearMockData();

      const client = new MockCloudClient('sess_mock_test_123');
      const project = await client.createProject('Test', 'npx server');

      const result = await client.submitBenchmark(
        project.id,
        {
          serverId: 'test-server',
          version: '1.0.0',
          status: 'passed',
          tier: 'gold',
          testedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          toolsTested: 15,
          testsPassed: 14,
          testsTotal: 15,
          passRate: 93,
          reportHash: 'ghi789',
          bellwetherVersion: '1.0.0',
        },
        { details: 'some report data' }
      );

      expect(result.benchmarkId).toBeDefined();
    });
  });

  describe('helper functions', () => {
    it('should generate mock session', async () => {
      const { generateMockSession } = await import('../../src/cloud/mock-client.js');

      const session = generateMockSession('testuser');

      expect(session.sessionToken).toMatch(/^sess_mock_testuser_/);
      expect(session.user.email).toBe('testuser@localhost');
      expect(session.user.githubLogin).toBe('testuser');
      expect(session.expiresAt).toBeDefined();
    });

    it('should generate mock session with default username', async () => {
      const { generateMockSession } = await import('../../src/cloud/mock-client.js');

      const session = generateMockSession();

      expect(session.sessionToken).toMatch(/^sess_mock_dev_/);
      expect(session.user.email).toBe('dev@localhost');
    });

    it('should get mock data directory', async () => {
      const { getMockDataDir } = await import('../../src/cloud/mock-client.js');

      const dir = getMockDataDir();

      expect(dir).toContain('.bellwether');
      expect(dir).toContain('mock-cloud');
    });

    it('should clear mock data', async () => {
      const { MockCloudClient, clearMockData, getMockDataDir } = await import('../../src/cloud/mock-client.js');

      // Create some data first
      const client = new MockCloudClient('sess_mock_test_123');
      await client.createProject('Test', 'npx server');

      // Clear it
      clearMockData();

      // Verify projects are gone
      const projects = await client.listProjects();
      expect(projects).toHaveLength(0);
    });
  });
});
