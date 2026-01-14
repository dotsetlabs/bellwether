import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RegistryClient,
  generateRunCommand,
  generatePackageCommand,
  formatServerEntry,
} from '../../src/registry/index.js';
import type { RegistryServer, RegistryServerEntry, RegistryPackage } from '../../src/registry/index.js';

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe('RegistryClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ servers: [], metadata: { count: 0 } }),
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('listServers', () => {
    it('should fetch servers from the registry', async () => {
      const client = new RegistryClient();
      const mockResponse = {
        servers: [
          {
            server: {
              name: 'io.github.test/my-server',
              description: 'Test server',
            },
          },
        ],
        metadata: { count: 1 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.listServers();

      expect(mockFetch).toHaveBeenCalled();
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0].server.name).toBe('io.github.test/my-server');
    });

    it('should include search parameter when provided', async () => {
      const client = new RegistryClient();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ servers: [], metadata: { count: 0 } }),
      });

      await client.listServers({ search: 'filesystem' });

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('search=filesystem');
    });

    it('should include limit parameter when provided', async () => {
      const client = new RegistryClient();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ servers: [], metadata: { count: 0 } }),
      });

      await client.listServers({ limit: 5 });

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('limit=5');
    });

    it('should throw error on non-OK response', async () => {
      const client = new RegistryClient();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.listServers()).rejects.toThrow('Registry API error');
    });
  });

  describe('searchServers', () => {
    it('should search for servers by query', async () => {
      const client = new RegistryClient();
      const mockResponse = {
        servers: [
          { server: { name: 'io.github.test/filesystem-server' } },
        ],
        metadata: { count: 1 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const results = await client.searchServers('filesystem', 10);

      expect(results).toHaveLength(1);
      expect(results[0].server.name).toContain('filesystem');
    });
  });

  describe('findServer', () => {
    it('should find server by exact name', async () => {
      const client = new RegistryClient();
      const mockResponse = {
        servers: [
          { server: { name: 'io.github.test/my-server' } },
          { server: { name: 'io.github.other/server' } },
        ],
        metadata: { count: 2 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.findServer('io.github.test/my-server');

      expect(result).not.toBeNull();
      expect(result?.server.name).toBe('io.github.test/my-server');
    });

    it('should find server by short name', async () => {
      const client = new RegistryClient();
      const mockResponse = {
        servers: [
          { server: { name: 'io.github.test/my-server' } },
        ],
        metadata: { count: 1 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.findServer('my-server');

      expect(result).not.toBeNull();
      expect(result?.server.name).toBe('io.github.test/my-server');
    });

    it('should return null when server not found', async () => {
      const client = new RegistryClient();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ servers: [], metadata: { count: 0 } }),
      });

      const result = await client.findServer('nonexistent');

      expect(result).toBeNull();
    });
  });
});

describe('generateRunCommand', () => {
  it('should generate npx command for npm packages', () => {
    const server: RegistryServer = {
      name: 'test/server',
      packages: [
        {
          registryType: 'npm',
          identifier: '@modelcontextprotocol/server-filesystem',
        },
      ],
    };

    const command = generateRunCommand(server);
    expect(command).toBe('npx @modelcontextprotocol/server-filesystem');
  });

  it('should generate uvx command for pip packages with uvx runtime', () => {
    const server: RegistryServer = {
      name: 'test/server',
      packages: [
        {
          registryType: 'pip',
          identifier: 'mcp-server-sqlite',
          runtime: 'uvx',
        },
      ],
    };

    const command = generateRunCommand(server);
    expect(command).toBe('uvx mcp-server-sqlite');
  });

  it('should generate python -m command for pip packages', () => {
    const server: RegistryServer = {
      name: 'test/server',
      packages: [
        {
          registryType: 'pip',
          identifier: 'mcp_server',
        },
      ],
    };

    const command = generateRunCommand(server);
    expect(command).toBe('python -m mcp_server');
  });

  it('should include required arguments', () => {
    const server: RegistryServer = {
      name: 'test/server',
      packages: [
        {
          registryType: 'npm',
          identifier: 'test-server',
          packageArguments: [
            {
              name: 'path',
              type: 'positional',
              isRequired: true,
            },
          ],
        },
      ],
    };

    const command = generateRunCommand(server);
    expect(command).toBe('npx test-server <path>');
  });

  it('should include default values for required args', () => {
    const server: RegistryServer = {
      name: 'test/server',
      packages: [
        {
          registryType: 'npm',
          identifier: 'test-server',
          packageArguments: [
            {
              name: 'port',
              type: 'named',
              isRequired: true,
              default: 3000,
            },
          ],
        },
      ],
    };

    const command = generateRunCommand(server);
    expect(command).toBe('npx test-server --port=3000');
  });

  it('should return null for server without packages', () => {
    const server: RegistryServer = {
      name: 'test/server',
    };

    const command = generateRunCommand(server);
    expect(command).toBeNull();
  });
});

describe('generatePackageCommand', () => {
  it('should generate cargo command', () => {
    const pkg: RegistryPackage = {
      registryType: 'cargo',
      identifier: 'mcp-server',
    };

    const command = generatePackageCommand(pkg);
    expect(command).toBe('cargo run --package mcp-server');
  });

  it('should generate docker command', () => {
    const pkg: RegistryPackage = {
      registryType: 'docker',
      identifier: 'mcp/server:latest',
    };

    const command = generatePackageCommand(pkg);
    expect(command).toBe('docker run mcp/server:latest');
  });
});

describe('formatServerEntry', () => {
  it('should format server entry for display', () => {
    const entry: RegistryServerEntry = {
      server: {
        name: 'io.github.test/my-server',
        description: 'A test MCP server',
        version: '1.0.0',
        packages: [
          {
            registryType: 'npm',
            identifier: '@test/my-server',
          },
        ],
      },
    };

    const output = formatServerEntry(entry);

    expect(output).toContain('io.github.test/my-server');
    expect(output).toContain('A test MCP server');
    expect(output).toContain('1.0.0');
    expect(output).toContain('npx @test/my-server');
  });

  it('should handle server without packages', () => {
    const entry: RegistryServerEntry = {
      server: {
        name: 'test/server',
        description: 'No packages',
      },
    };

    const output = formatServerEntry(entry);

    expect(output).toContain('test/server');
    expect(output).toContain('No packages');
    expect(output).not.toContain('Run:');
  });
});
