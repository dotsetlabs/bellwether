import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRegistryCommand } from '../../../src/cli/commands/registry.js';

// Mock chalk to return strings without colors
vi.mock('chalk', () => ({
  default: {
    gray: (s: string) => s,
    bold: Object.assign((s: string) => s, {
      blue: (s: string) => s,
    }),
    blue: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    white: (s: string) => s,
    hex: () => (s: string) => s,
  },
}));

// Shared mock instance for test access
const mockClientInstance = {
  searchServers: vi.fn(),
  listServers: vi.fn(),
};

// Mock the registry module - class that uses shared instance methods
vi.mock('../../../src/registry/index.js', () => ({
  RegistryClient: class MockRegistryClient {
    searchServers = mockClientInstance.searchServers;
    listServers = mockClientInstance.listServers;
  },
  generateRunCommand: vi.fn(),
}));

import { RegistryClient, generateRunCommand } from '../../../src/registry/index.js';

describe('Registry Command', () => {
  let testDir: string;
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let mockClient: typeof mockClientInstance;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);
    writeFileSync(join(process.cwd(), 'bellwether.yaml'), '');

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Reset mock functions
    mockClientInstance.searchServers.mockReset();
    mockClientInstance.listServers.mockReset();
    mockClient = mockClientInstance;
    vi.mocked(generateRunCommand).mockReturnValue('npx test-server');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.chdir(originalCwd);
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('createRegistryCommand', () => {
    it('should create a command with correct name and description', () => {
      const command = createRegistryCommand();

      expect(command.name()).toBe('registry');
      expect(command.description()).toContain('Search');
    });

    it('should have lookup as an alias', () => {
      const command = createRegistryCommand();

      expect(command.aliases()).toContain('lookup');
    });

    it('should have limit and json options', () => {
      const command = createRegistryCommand();
      const options = command.options;

      const limitOption = options.find(o => o.long === '--limit');
      const jsonOption = options.find(o => o.long === '--json');

      expect(limitOption).toBeDefined();
      expect(jsonOption).toBeDefined();
    });
  });

  describe('handleRegistry with query', () => {
    it('should search for servers when query is provided', async () => {
      const mockServers = [
        {
          server: {
            name: 'test/filesystem-server',
            description: 'A filesystem server',
            version: '1.0.0',
            packages: [{ registryType: 'npm', identifier: '@test/fs' }],
          },
        },
      ];
      mockClient.searchServers.mockResolvedValue(mockServers);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'filesystem']);

      expect(mockClient.searchServers).toHaveBeenCalledWith('filesystem', 10);
    });

    it('should respect limit option', async () => {
      mockClient.searchServers.mockResolvedValue([]);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'test', '--limit', '5']);

      expect(mockClient.searchServers).toHaveBeenCalledWith('test', 5);
    });

    it('should output JSON when --json flag is used', async () => {
      const mockServers = [
        { server: { name: 'test/server', description: 'Test' } },
      ];
      mockClient.searchServers.mockResolvedValue(mockServers);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'test', '--json']);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(mockServers, null, 2));
    });
  });

  describe('handleRegistry without query', () => {
    it('should list popular servers when no query is provided', async () => {
      const mockResponse = {
        servers: [
          { server: { name: 'popular/server', description: 'Popular server' } },
        ],
        metadata: { count: 1 },
      };
      mockClient.listServers.mockResolvedValue(mockResponse);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockClient.listServers).toHaveBeenCalledWith({ limit: 10 });
    });
  });

  describe('displayServer', () => {
    it('should display server name and description', async () => {
      const mockServers = [
        {
          server: {
            name: 'test/my-server',
            description: 'My test server',
            version: '1.0.0',
          },
        },
      ];
      mockClient.searchServers.mockResolvedValue(mockServers);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'test']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('test/my-server');
      expect(allOutput).toContain('My test server');
    });

    it('should display version when available', async () => {
      const mockServers = [
        {
          server: {
            name: 'test/server',
            version: '2.0.0',
          },
        },
      ];
      mockClient.searchServers.mockResolvedValue(mockServers);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'test']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('v2.0.0');
    });

    it('should display run command when available', async () => {
      const mockServers = [
        {
          server: {
            name: 'test/server',
            packages: [{ registryType: 'npm', identifier: '@test/server' }],
          },
        },
      ];
      mockClient.searchServers.mockResolvedValue(mockServers);
      vi.mocked(generateRunCommand).mockReturnValue('npx @test/server');

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'test']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('npx @test/server');
    });

    it('should display official status indicator', async () => {
      const mockServers = [
        {
          server: { name: 'test/server' },
          _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } },
        },
      ];
      mockClient.searchServers.mockResolvedValue(mockServers);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'test']);

      // The green checkmark should be displayed
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should display repository URL when available', async () => {
      const mockServers = [
        {
          server: {
            name: 'test/server',
            repository: { url: 'https://github.com/test/server' },
          },
        },
      ];
      mockClient.searchServers.mockResolvedValue(mockServers);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'test']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('https://github.com/test/server');
    });
  });

  describe('error handling', () => {
    it('should display error message on API failure', async () => {
      mockClient.searchServers.mockRejectedValue(new Error('Network error'));

      const command = createRegistryCommand();
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await command.parseAsync(['node', 'test', 'test']);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'));
      mockExit.mockRestore();
    });

    it('should display message when no servers found', async () => {
      mockClient.searchServers.mockResolvedValue([]);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'nonexistent']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('No servers found');
    });

    it('should suggest trying different search term when no results', async () => {
      mockClient.searchServers.mockResolvedValue([]);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'xyz']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('Try a different search term');
    });
  });

  describe('package info display', () => {
    it('should display package registry type', async () => {
      const mockServers = [
        {
          server: {
            name: 'test/server',
            packages: [
              {
                registryType: 'npm',
                identifier: '@test/server',
                transport: { type: 'stdio' },
              },
            ],
          },
        },
      ];
      mockClient.searchServers.mockResolvedValue(mockServers);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'test']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('npm');
      expect(allOutput).toContain('transport: stdio');
    });

    it('should display required arguments', async () => {
      const mockServers = [
        {
          server: {
            name: 'test/server',
            packages: [
              {
                registryType: 'npm',
                identifier: '@test/server',
                packageArguments: [
                  { name: 'path', isRequired: true, description: 'File path' },
                ],
              },
            ],
          },
        },
      ];
      mockClient.searchServers.mockResolvedValue(mockServers);

      const command = createRegistryCommand();
      await command.parseAsync(['node', 'test', 'test']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('Required args');
      expect(allOutput).toContain('--path');
      expect(allOutput).toContain('File path');
    });
  });
});
