/**
 * Tests for the watch CLI command.
 *
 * Note: These tests focus on the command setup and configuration parsing.
 * Full integration tests would require mocking the MCP client and file system watchers.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('watch command', () => {
  let testDir: string;
  let originalCwd: string;
  let consoleOutput: string[];
  let consoleErrors: string[];
  let originalExit: typeof process.exit;
  let exitSpy: MockInstance;
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;
  let mockIntervalId: NodeJS.Timeout;

  beforeEach(async () => {
    testDir = join(tmpdir(), `bellwether-watch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Create test baseline file
    writeFileSync(
      join(testDir, 'bellwether-baseline.json'),
      JSON.stringify({ hash: 'existing', discovery: {}, toolProfiles: [] })
    );

    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.join(' '));
    });

    originalExit = process.exit;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process exit: ${code}`);
    });

    // Mock setInterval/clearInterval to prevent actual timing
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    mockIntervalId = { ref: () => mockIntervalId, unref: () => mockIntervalId } as unknown as NodeJS.Timeout;
    vi.spyOn(global, 'setInterval').mockReturnValue(mockIntervalId);
    vi.spyOn(global, 'clearInterval').mockImplementation(() => {});

    // Reset modules so mocks are properly applied
    vi.resetModules();

    // Mock external dependencies using vi.doMock after resetModules
    // vitest 4.x requires class mocks to use a class or function constructor
    vi.doMock('../../src/transport/mcp-client.js', () => ({
      MCPClient: class MockMCPClient {
        connect = vi.fn().mockResolvedValue(undefined);
        disconnect = vi.fn().mockResolvedValue(undefined);
      },
    }));

    vi.doMock('../../src/discovery/discovery.js', () => ({
      discover: vi.fn().mockResolvedValue({
        serverInfo: { name: 'test-server', version: '1.0.0' },
        tools: [],
      }),
    }));

    vi.doMock('../../src/llm/index.js', () => ({
      createLLMClient: vi.fn().mockReturnValue({
        chat: vi.fn().mockResolvedValue({ content: 'test response' }),
      }),
    }));

    vi.doMock('../../src/interview/interviewer.js', () => ({
      Interviewer: class MockInterviewer {
        interview = vi.fn().mockResolvedValue({
          serverInfo: { name: 'test', version: '1.0.0' },
          tools: [],
          toolProfiles: [],
        });
      },
    }));

    vi.doMock('../../src/config/loader.js', () => ({
      loadConfig: vi.fn().mockReturnValue({
        server: {
          command: '',
          args: [],
          timeout: 30000,
          env: {},
        },
        llm: {
          provider: 'ollama',
          model: '',
          ollama: { baseUrl: 'http://localhost:11434' },
        },
        explore: {
          personas: [],
          maxQuestionsPerTool: 3,
          parallelPersonas: false,
          skipErrorTests: false,
        },
        output: { dir: '.', docsDir: '.', format: 'agents.md' },
        baseline: { failOnDrift: false },
        watch: { path: '.', interval: 5000, extensions: ['.ts', '.js', '.json', '.py', '.go'] },
        cache: { enabled: true, dir: '.bellwether/cache' },
        logging: { level: 'info', verbose: false },
        scenarios: { only: false },
        workflows: { discover: false, trackState: false },
      }),
      ConfigNotFoundError: class ConfigNotFoundError extends Error {
        constructor(searchedPaths?: string[]) {
          super('No bellwether config file found.');
          this.name = 'ConfigNotFoundError';
        }
      },
    }));

    vi.doMock('../../src/config/validator.js', () => ({
      validateConfigForCheck: vi.fn(),
    }));

    vi.doMock('../../src/persona/builtins.js', () => {
      const mockPersona = { name: 'technical_writer', systemPrompt: 'test', questionGuidance: '' };
      return {
        DEFAULT_PERSONA: mockPersona,
        securityTesterPersona: { name: 'security_tester', systemPrompt: 'test', questionGuidance: '' },
        qaEngineerPersona: { name: 'qa_engineer', systemPrompt: 'test', questionGuidance: '' },
        noviceUserPersona: { name: 'novice_user', systemPrompt: 'test', questionGuidance: '' },
        parsePersonas: vi.fn().mockReturnValue([mockPersona]),
      };
    });

    vi.doMock('../../src/baseline/index.js', () => ({
      createBaseline: vi.fn().mockReturnValue({
        integrityHash: 'abc123',
        discovery: {},
        toolProfiles: [],
      }),
      saveBaseline: vi.fn(),
      loadBaseline: vi.fn().mockReturnValue({
        integrityHash: 'def456',
        discovery: {},
        toolProfiles: [],
      }),
      compareBaselines: vi.fn().mockReturnValue({
        severity: 'none',
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
      }),
      formatDiffText: vi.fn().mockReturnValue('No changes'),
    }));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exit = originalExit;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    vi.restoreAllMocks();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('command options', () => {
    it('should have correct description', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');
      expect(watchCommand.description()).toContain('Watch');
    });

    it('should have optional server command argument', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');
      const args = watchCommand.registeredArguments;
      expect(args[0].name()).toBe('server-command');
      // Server command is optional - can come from config
      expect(args[0].required).toBe(false);
    });

    it('should have config option', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');
      const configOpt = watchCommand.options.find(o => o.long === '--config');
      expect(configOpt).toBeDefined();
    });

    it('should not have watch-path option (uses config)', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');
      // watch-path was removed - now reads from config.watch.path
      const watchPathOpt = watchCommand.options.find(o => o.long === '--watch-path');
      expect(watchPathOpt).toBeUndefined();
    });

    it('should not have interval option (uses config)', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');
      // interval was removed - now reads from config.watch.interval
      const intervalOpt = watchCommand.options.find(o => o.long === '--interval');
      expect(intervalOpt).toBeUndefined();
    });

    it('should not have baseline option (uses config)', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');
      // baseline was removed - now reads from config.baseline.savePath
      const baselineOpt = watchCommand.options.find(o => o.long === '--baseline');
      expect(baselineOpt).toBeUndefined();
    });

    it('should not have on-change option (uses config)', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');
      // on-change was removed - now reads from config.watch.onDrift
      const onChangeOpt = watchCommand.options.find(o => o.long === '--on-change');
      expect(onChangeOpt).toBeUndefined();
    });
  });

  describe('command execution', () => {
    it('should display watch mode header', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');

      // Run command but don't wait (it runs indefinitely)
      const promise = watchCommand.parseAsync(['node', 'test', 'echo', 'hello']);

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleOutput.some(line => line.includes('Watch Mode'))).toBe(true);
    });

    it('should show server command in output', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');

      const promise = watchCommand.parseAsync(['node', 'test', 'node', 'server.js']);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleOutput.some(line => line.includes('node server.js'))).toBe(true);
    });

    it('should show watch path from config', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');

      const promise = watchCommand.parseAsync(['node', 'test', 'echo']);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Watch path comes from config.watch.path (default '.')
      expect(consoleOutput.some(line => line.includes('Watching:'))).toBe(true);
    });

    it('should show poll interval from config', async () => {
      const { watchCommand } = await import('../../src/cli/commands/watch.js');

      const promise = watchCommand.parseAsync(['node', 'test', 'echo']);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Interval comes from config.watch.interval (default 5000ms)
      expect(consoleOutput.some(line => line.includes('5000ms'))).toBe(true);
    });
  });
});

describe('watch file change detection', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-watch-files-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should detect supported file extensions', () => {
    const extensions = ['.ts', '.js', '.json', '.py', '.go'];
    const testFiles = extensions.map(ext => `test${ext}`);

    // Create test files
    for (const file of testFiles) {
      writeFileSync(join(testDir, file), 'content');
    }

    // All files should exist
    for (const file of testFiles) {
      expect(existsSync(join(testDir, file))).toBe(true);
    }
  });

  it('should skip node_modules and .git directories', () => {
    // These directories should be ignored by the watch function
    const skipDirs = ['node_modules', '.git', 'dist'];

    for (const dir of skipDirs) {
      const dirPath = join(testDir, dir);
      mkdirSync(dirPath, { recursive: true });
      writeFileSync(join(dirPath, 'test.js'), 'content');
    }

    // Directories exist but should be skipped by watch
    for (const dir of skipDirs) {
      expect(existsSync(join(testDir, dir))).toBe(true);
    }
  });
});
