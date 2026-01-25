import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockCloudClient, generateMockSession, clearMockData } from '../../src/cloud/mock-client.js';
import type { BellwetherBaseline } from '../../src/cloud/types.js';

describe('cli/badge', () => {
  let client: MockCloudClient;

  beforeEach(() => {
    clearMockData();
    const session = generateMockSession('testuser');
    client = new MockCloudClient(session.sessionToken);
  });

  afterEach(() => {
    clearMockData();
    vi.restoreAllMocks();
  });

  describe('getBadgeInfo', () => {
    it('should return null for non-existent project', async () => {
      const badge = await client.getBadgeInfo('non-existent-id');
      expect(badge).toBeNull();
    });

    it('should return badge info for project with no baselines', async () => {
      const project = await client.createProject('test-project', 'npx test-server');

      const badge = await client.getBadgeInfo(project.id);

      expect(badge).not.toBeNull();
      expect(badge!.projectId).toBe(project.id);
      expect(badge!.projectName).toBe('test-project');
      expect(badge!.status).toBe('unknown');
      expect(badge!.statusText).toBe('No baseline');
    });

    it('should return passing status for project with one baseline', async () => {
      const project = await client.createProject('test-project', 'npx test-server');

      // Upload a baseline
      const baseline = createMockBaseline();
      await client.uploadBaseline(project.id, baseline);

      const badge = await client.getBadgeInfo(project.id);

      expect(badge).not.toBeNull();
      expect(badge!.status).toBe('verified');
      expect(badge!.statusText).toBe('Verified');
      expect(badge!.latestVersion).toBe(1);
    });

    it('should return stable status when no drift between versions', async () => {
      const project = await client.createProject('test-project', 'npx test-server');

      // Upload same baseline twice (no drift)
      const baseline = createMockBaseline();
      await client.uploadBaseline(project.id, baseline);
      await client.uploadBaseline(project.id, baseline);

      const badge = await client.getBadgeInfo(project.id);

      expect(badge).not.toBeNull();
      expect(badge!.status).toBe('verified');
      expect(badge!.statusText).toBe('Stable');
      expect(badge!.latestVersion).toBe(2);
    });

    it('should return drift status when tools modified', async () => {
      const project = await client.createProject('test-project', 'npx test-server');

      // Upload first baseline
      const baseline1 = createMockBaseline();
      await client.uploadBaseline(project.id, baseline1);

      // Upload second baseline with modified tool schema
      const baseline2 = createMockBaseline();
      baseline2.capabilities.tools[0].schemaHash = 'different-hash';
      baseline2.hash = 'different-overall-hash';
      await client.uploadBaseline(project.id, baseline2);

      const badge = await client.getBadgeInfo(project.id);

      expect(badge).not.toBeNull();
      expect(badge!.status).toBe('drift');
      expect(badge!.statusText).toBe('Drift detected');
    });

    it('should return failing status when tools removed', async () => {
      const project = await client.createProject('test-project', 'npx test-server');

      // Upload first baseline with tools
      const baseline1 = createMockBaseline();
      await client.uploadBaseline(project.id, baseline1);

      // Upload second baseline with tools removed
      const baseline2 = createMockBaseline();
      baseline2.capabilities.tools = [];
      baseline2.hash = 'different-hash';
      await client.uploadBaseline(project.id, baseline2);

      const badge = await client.getBadgeInfo(project.id);

      expect(badge).not.toBeNull();
      expect(badge!.status).toBe('failing');
      expect(badge!.statusText).toBe('Breaking changes');
    });

    it('should include badge URL with shields.io format', async () => {
      const project = await client.createProject('test-project', 'npx test-server');
      const baseline = createMockBaseline();
      await client.uploadBaseline(project.id, baseline);

      const badge = await client.getBadgeInfo(project.id);

      expect(badge!.badgeUrl).toContain('https://img.shields.io/badge/bellwether');
      expect(badge!.badgeUrl).toContain('brightgreen'); // passing color
    });

    it('should include markdown for README', async () => {
      const project = await client.createProject('test-project', 'npx test-server');
      const baseline = createMockBaseline();
      await client.uploadBaseline(project.id, baseline);

      const badge = await client.getBadgeInfo(project.id);

      expect(badge!.markdown).toContain('[![Bellwether]');
      expect(badge!.markdown).toContain(project.id);
    });

    it('should include lastVerified timestamp', async () => {
      const project = await client.createProject('test-project', 'npx test-server');
      const baseline = createMockBaseline();
      await client.uploadBaseline(project.id, baseline);

      const badge = await client.getBadgeInfo(project.id);

      expect(badge!.lastVerified).toBeDefined();
      expect(new Date(badge!.lastVerified!)).toBeInstanceOf(Date);
    });
  });
});

/**
 * Create a mock baseline for testing.
 */
function createMockBaseline(): BellwetherBaseline {
  return {
    version: '1.0.0',
    metadata: {
      generatedAt: new Date().toISOString(),
      cliVersion: '1.0.0',
      serverCommand: 'npx test-server',
      serverName: 'test-server',
      durationMs: 1000,
      personas: [],
      model: 'none',
      mode: 'check',
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
          name: 'get_weather',
          description: 'Get weather',
          inputSchema: { type: 'object' },
          schemaHash: 'abc123',
        },
      ],
    },
    interviews: [],
    toolProfiles: [],
    assertions: [],
    summary: 'Test summary',
    hash: 'test-hash-12345',
  };
}
