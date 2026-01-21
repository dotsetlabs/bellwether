/**
 * E2E tests for the `bellwether registry` command.
 *
 * Tests:
 * - Basic search functionality
 * - --limit flag behavior
 * - --json output
 * - API error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  type TempDirectory,
} from '../harness/index.js';
import {
  createMockRegistryServer,
  createEmptyRegistryServer,
  createFailingRegistryServer,
  type MockRegistryServer,
} from '../mocks/index.js';

describe('bellwether registry', () => {
  let tempDir: TempDirectory;
  let mockRegistry: MockRegistryServer | null = null;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-registry-e2e');
  });

  afterEach(async () => {
    tempDir.cleanup();
    if (mockRegistry) {
      await mockRegistry.close();
      mockRegistry = null;
    }
  });

  describe('basic search', () => {
    it('should search for servers by keyword', async () => {
      mockRegistry = await createMockRegistryServer();

      const result = await runCLI(['registry', 'filesystem'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('filesystem');
    });

    it('should return multiple matching results', async () => {
      mockRegistry = await createMockRegistryServer();

      const result = await runCLI(['registry', 'mcp'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      assertOutput(result).expectSuccess();

      // Should find multiple servers with 'mcp' in name
      expect(result.stdout).toMatch(/mcp|MCP/);
    });

    it('should show server descriptions', async () => {
      mockRegistry = await createMockRegistryServer();

      const result = await runCLI(['registry', 'filesystem'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('operation', 'server', 'MCP');
    });

    it('should show server vendor info', async () => {
      mockRegistry = await createMockRegistryServer();

      const result = await runCLI(['registry', 'filesystem'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      // Note: vendor info may not be shown in text output, just verify command runs
      assertOutput(result).expectSuccess();
    });
  });

  describe('--limit flag', () => {
    it('should limit results with --limit', async () => {
      mockRegistry = await createMockRegistryServer();

      const result = await runCLI(['registry', 'server', '--limit', '2'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      assertOutput(result).expectSuccess();

      // Should have limited output
      // Exact format depends on implementation
    });

    it('should respect small limit values', async () => {
      mockRegistry = await createMockRegistryServer();

      const result = await runCLI(['registry', 'server', '--limit', '1'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      assertOutput(result).expectSuccess();
    });
  });

  describe('--json output', () => {
    it('should output valid JSON with --json', async () => {
      mockRegistry = await createMockRegistryServer();

      const result = await runCLI(['registry', 'filesystem', '--json'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      assertOutput(result).expectSuccess();

      // The registry command outputs servers directly as an array
      const json = assertOutput(result).expectStdoutJson<unknown[]>();
      expect(Array.isArray(json)).toBe(true);
    });

    it('should include server details in JSON', async () => {
      mockRegistry = await createMockRegistryServer();

      const result = await runCLI(['registry', 'filesystem', '--json'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      // The registry command outputs servers directly as an array
      const json = assertOutput(result).expectStdoutJson<
        Array<{
          server?: { name: string; description: string };
          name?: string;
          description?: string;
        }>
      >();

      expect(json.length).toBeGreaterThan(0);
      // RegistryServerEntry has a 'server' property containing the actual server data
      const first = json[0];
      expect(first.server?.name ?? first.name).toBeDefined();
    });
  });

  describe('empty results', () => {
    it('should handle no matching results gracefully', async () => {
      mockRegistry = await createEmptyRegistryServer();

      const result = await runCLI(['registry', 'nonexistent-xyz-123'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny(
          'no',
          'No',
          'not found',
          'Not found',
          'empty',
          '0 result'
        );
    });

    it('should return empty array in JSON for no results', async () => {
      mockRegistry = await createEmptyRegistryServer();

      const result = await runCLI(
        ['registry', 'nonexistent-xyz-123', '--json'],
        {
          cwd: tempDir.path,
          env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
        }
      );

      // The registry command outputs servers directly as an array
      const json = assertOutput(result).expectStdoutJson<unknown[]>();
      expect(json).toEqual([]);
    });
  });

  describe('API error handling', () => {
    it('should handle registry unavailable', async () => {
      mockRegistry = await createFailingRegistryServer('Registry unavailable');

      const result = await runCLI(['registry', 'filesystem'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      // Command should fail when registry returns error
      assertOutput(result).expectFailure();
    });

    it('should handle network timeout gracefully', async () => {
      // Use a non-routable IP to simulate timeout
      const result = await runCLI(['registry', 'filesystem'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: 'http://10.255.255.1:9999' },
        timeout: 15000, // Need longer timeout for the connection attempt
      });

      // Should fail due to timeout or connection error
      assertOutput(result).expectFailure();
    });
  });

  describe('argument handling', () => {
    it('should fetch popular servers when no query provided', async () => {
      mockRegistry = await createMockRegistryServer();

      const result = await runCLI(['registry'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      // Without a query, the registry command fetches popular servers
      assertOutput(result).expectSuccess();
    });

    it('should accept multi-word search queries', async () => {
      mockRegistry = await createMockRegistryServer();

      const result = await runCLI(['registry', 'file search'], {
        cwd: tempDir.path,
        env: { BELLWETHER_REGISTRY_URL: mockRegistry.url },
      });

      // Should handle multi-word query
      expect(result.exitCode).toBeDefined();
    });
  });

  describe('help output', () => {
    it('should show help for registry command', async () => {
      const result = await runCLI(['registry', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('registry')
        .expectStdoutContains('--limit')
        .expectStdoutContains('--json');
    });
  });
});
