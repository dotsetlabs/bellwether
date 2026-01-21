/**
 * Mock Registry Server for E2E tests.
 *
 * Creates an HTTP server that mimics the MCP Registry API
 * for testing the registry command.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';

/**
 * Server definition matching the registry API format.
 */
export interface RegistryServer {
  name: string;
  description?: string;
  repository?: {
    url: string;
    source: string;
  };
  version?: string;
  packages?: Array<{
    registryType: string;
    identifier: string;
    transport?: {
      type: 'stdio' | 'sse' | 'streamable-http';
    };
  }>;
  homepage?: string;
  license?: string;
}

/**
 * Server entry wrapper matching the registry API format.
 */
export interface RegistryServerEntry {
  server: RegistryServer;
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: {
      status?: string;
    };
  };
}

export interface MockRegistryConfig {
  /** Servers to return in search results */
  servers?: RegistryServerEntry[];
  /** Fail all requests */
  failRequests?: boolean;
  /** Error message when failing */
  errorMessage?: string;
  /** Artificial latency in ms */
  latencyMs?: number;
}

export interface MockRegistryServer {
  /** Server URL */
  url: string;
  /** Port number */
  port: number;
  /** Close the server */
  close: () => Promise<void>;
  /** Update configuration */
  updateConfig: (config: Partial<MockRegistryConfig>) => void;
}

// Default mock servers for testing - matching the real registry API format
const defaultServers: RegistryServerEntry[] = [
  {
    server: {
      name: '@modelcontextprotocol/server-filesystem',
      description: 'MCP server for filesystem operations',
      repository: {
        url: 'https://github.com/modelcontextprotocol/servers',
        source: 'github',
      },
      homepage: 'https://modelcontextprotocol.io',
      license: 'MIT',
      packages: [
        {
          registryType: 'npm',
          identifier: '@modelcontextprotocol/server-filesystem',
          transport: { type: 'stdio' },
        },
      ],
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': { status: 'active' },
    },
  },
  {
    server: {
      name: '@modelcontextprotocol/server-postgres',
      description: 'MCP server for PostgreSQL database access',
      repository: {
        url: 'https://github.com/modelcontextprotocol/servers',
        source: 'github',
      },
      homepage: 'https://modelcontextprotocol.io',
      license: 'MIT',
      packages: [
        {
          registryType: 'npm',
          identifier: '@modelcontextprotocol/server-postgres',
          transport: { type: 'stdio' },
        },
      ],
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': { status: 'active' },
    },
  },
  {
    server: {
      name: '@modelcontextprotocol/server-sqlite',
      description: 'MCP server for SQLite database access',
      repository: {
        url: 'https://github.com/modelcontextprotocol/servers',
        source: 'github',
      },
      license: 'MIT',
      packages: [
        {
          registryType: 'npm',
          identifier: '@modelcontextprotocol/server-sqlite',
          transport: { type: 'stdio' },
        },
      ],
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': { status: 'active' },
    },
  },
  {
    server: {
      name: '@modelcontextprotocol/server-memory',
      description: 'MCP server for in-memory storage',
      repository: {
        url: 'https://github.com/modelcontextprotocol/servers',
        source: 'github',
      },
      license: 'MIT',
      packages: [
        {
          registryType: 'npm',
          identifier: '@modelcontextprotocol/server-memory',
          transport: { type: 'stdio' },
        },
      ],
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': { status: 'active' },
    },
  },
  {
    server: {
      name: 'mcp-server-git',
      description: 'MCP server for git repository operations',
      repository: {
        url: 'https://github.com/example/mcp-server-git',
        source: 'github',
      },
      license: 'Apache-2.0',
      packages: [
        {
          registryType: 'npm',
          identifier: 'mcp-server-git',
          transport: { type: 'stdio' },
        },
      ],
    },
  },
  {
    server: {
      name: 'mcp-server-slack',
      description: 'MCP server for Slack integration',
      repository: {
        url: 'https://github.com/example/mcp-server-slack',
        source: 'github',
      },
      license: 'MIT',
      packages: [
        {
          registryType: 'npm',
          identifier: 'mcp-server-slack',
          transport: { type: 'stdio' },
        },
      ],
    },
  },
  {
    server: {
      name: 'mcp-server-github',
      description: 'MCP server for GitHub API access',
      repository: {
        url: 'https://github.com/example/mcp-server-github',
        source: 'github',
      },
      homepage: 'https://example.com/mcp-server-github',
      license: 'MIT',
      packages: [
        {
          registryType: 'npm',
          identifier: 'mcp-server-github',
          transport: { type: 'stdio' },
        },
      ],
    },
  },
  {
    server: {
      name: 'file-search-server',
      description: 'MCP server for advanced file searching',
      repository: {
        url: 'https://github.com/example/file-search-server',
        source: 'github',
      },
      license: 'BSD-3-Clause',
      packages: [
        {
          registryType: 'npm',
          identifier: 'file-search-server',
          transport: { type: 'stdio' },
        },
      ],
    },
  },
];

/**
 * Create a mock registry server.
 */
export async function createMockRegistryServer(
  config: MockRegistryConfig = {}
): Promise<MockRegistryServer> {
  let currentConfig: MockRegistryConfig = {
    servers: defaultServers,
    ...config,
  };

  const server = createServer((req, res) => {
    handleRequest(req, res, currentConfig);
  });

  // Find an available port
  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address !== 'string') {
        resolve(address.port);
      } else {
        reject(new Error('Failed to get server port'));
      }
    });

    server.on('error', reject);
  });

  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    port,
    close: () => {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
    updateConfig: (newConfig) => {
      currentConfig = { ...currentConfig, ...newConfig };
    },
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: MockRegistryConfig
): Promise<void> {
  // Apply latency
  if (config.latencyMs && config.latencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, config.latencyMs));
  }

  // Check if we should fail
  if (config.failRequests) {
    sendError(res, 500, config.errorMessage ?? 'Internal server error');
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;

  // Handle different endpoints - support both /v0/servers and /servers
  if (path === '/servers' || path === '/api/servers' || path === '/v0/servers') {
    handleSearch(url, res, config);
  } else if (path.startsWith('/servers/') || path.startsWith('/api/servers/') || path.startsWith('/v0/servers/')) {
    handleGetServer(path, res, config);
  } else if (path === '/health' || path === '/api/health') {
    handleHealth(res);
  } else {
    sendError(res, 404, 'Not found');
  }
}

function handleSearch(
  url: URL,
  res: ServerResponse,
  config: MockRegistryConfig
): void {
  const query = url.searchParams.get('search') ?? url.searchParams.get('q') ?? url.searchParams.get('query') ?? '';
  const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);

  const servers = config.servers ?? defaultServers;

  // Filter servers by query - now using RegistryServerEntry structure
  let results = servers;
  if (query) {
    const lowerQuery = query.toLowerCase();
    results = servers.filter(
      (entry) =>
        entry.server.name.toLowerCase().includes(lowerQuery) ||
        (entry.server.description?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  // Apply limit
  results = results.slice(0, limit);

  // Return in RegistryServersResponse format
  sendJson(res, {
    servers: results,
    metadata: {
      count: results.length,
    },
  });
}

function handleGetServer(
  path: string,
  res: ServerResponse,
  config: MockRegistryConfig
): void {
  // Extract server name from path
  const parts = path.split('/');
  const serverName = decodeURIComponent(parts[parts.length - 1]);

  const servers = config.servers ?? defaultServers;
  const entry = servers.find(
    (e) => e.server.name === serverName || e.server.name === `@${serverName}`
  );

  if (entry) {
    sendJson(res, entry);
  } else {
    sendError(res, 404, `Server not found: ${serverName}`);
  }
}

function handleHealth(res: ServerResponse): void {
  sendJson(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
}

function sendJson(res: ServerResponse, data: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(
    JSON.stringify({
      error: message,
      status,
    })
  );
}

/**
 * Create a registry server with custom servers.
 */
export async function createCustomRegistryServer(
  servers: RegistryServerEntry[]
): Promise<MockRegistryServer> {
  return createMockRegistryServer({ servers });
}

/**
 * Create a registry server that returns empty results.
 */
export async function createEmptyRegistryServer(): Promise<MockRegistryServer> {
  return createMockRegistryServer({ servers: [] });
}

/**
 * Create a registry server that fails all requests.
 */
export async function createFailingRegistryServer(
  errorMessage = 'Registry unavailable'
): Promise<MockRegistryServer> {
  return createMockRegistryServer({
    failRequests: true,
    errorMessage,
  });
}

// Export default servers for use in tests
export { defaultServers };
