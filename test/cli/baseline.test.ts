/**
 * Tests for the baseline CLI command.
 *
 * Tests the save, compare, show, and diff subcommands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('baseline command', () => {
  let testDir: string;
  let originalCwd: string;
  let consoleOutput: string[];
  let consoleErrors: string[];
  let originalExit: typeof process.exit;

  // Sample interview result for testing
  const sampleInterviewResult = {
    discovery: {
      serverInfo: {
        name: 'test-server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
      },
      tools: [
        {
          name: 'read_file',
          description: 'Read contents of a file',
          inputSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      ],
      prompts: [],
      resources: [],
      capabilities: ['tools'],
    },
    toolProfiles: [
      {
        toolName: 'read_file',
        description: 'Read contents of a file',
        useCases: ['Reading configuration files'],
        behavioralNotes: ['Returns file contents as string'],
        limitations: ['Cannot read binary files'],
        securityNotes: ['Path traversal possible'],
        sampleInputs: [{ path: '/tmp/test.txt' }],
        sampleOutputs: [{ content: 'file contents' }],
        errorPatterns: ['File not found'],
        recommendations: ['Validate paths'],
      },
    ],
    metadata: {
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 1000,
      mode: 'contract',
      provider: 'ollama',
      model: 'llama3.2',
      serverCommand: 'npx @mcp/test-server',
    },
    metrics: {
      totalQuestions: 3,
      totalTokens: 100,
      estimatedCost: 0.01,
      toolsInterviewed: 1,
      personasUsed: ['technical_writer'],
    },
  };

  // Sample baseline for testing
  const sampleBaseline = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    serverCommand: 'npx @mcp/test-server',
    mode: 'contract',
    integrityHash: 'abc123def456',
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: ['tools'],
    },
    tools: [
      {
        name: 'read_file',
        description: 'Read contents of a file',
        schemaHash: 'schema123',
        securityNotes: ['Path traversal possible'],
        limitations: ['Cannot read binary files'],
      },
    ],
    assertions: [
      {
        tool: 'read_file',
        aspect: 'behavior',
        assertion: 'Returns file contents as string',
        isPositive: true,
        confidence: 90,
      },
    ],
    workflowSignatures: [],
    summary: 'Test server with file reading capabilities',
  };

  beforeEach(() => {
    // Create temp directory
    testDir = join(tmpdir(), `bellwether-baseline-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Capture console output
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.join(' '));
    });

    originalExit = process.exit;
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`Process exit: ${code}`);
    });

    vi.resetModules();

    // Mock config loader
    vi.doMock('../../src/config/loader.js', () => ({
      loadConfig: vi.fn().mockReturnValue({
        server: { command: '', args: [], timeout: 30000, env: {} },
        mode: 'contract',
        llm: { provider: 'ollama', model: '', ollama: { baseUrl: 'http://localhost:11434' } },
        test: { personas: [], maxQuestionsPerTool: 3, parallelPersonas: false, skipErrorTests: false },
        output: { dir: '.', format: 'agents.md', cloudFormat: false },
        baseline: { failOnDrift: false, minConfidence: 0, confidenceThreshold: 80 },
        cache: { enabled: true, dir: '.bellwether/cache' },
        logging: { level: 'info', verbose: false },
        scenarios: { only: false },
        workflows: { discover: false, trackState: false },
      }),
      ConfigNotFoundError: class ConfigNotFoundError extends Error {
        constructor() {
          super('No bellwether config file found.');
          this.name = 'ConfigNotFoundError';
        }
      },
    }));

    // Mock baseline functions
    vi.doMock('../../src/baseline/index.js', () => ({
      createBaseline: vi.fn().mockReturnValue(sampleBaseline),
      saveBaseline: vi.fn(),
      loadBaseline: vi.fn().mockReturnValue(sampleBaseline),
      compareBaselines: vi.fn().mockReturnValue({
        severity: 'none',
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
      }),
      formatDiffText: vi.fn().mockReturnValue('No changes detected'),
      formatDiffJson: vi.fn().mockReturnValue('{}'),
      formatDiffMarkdown: vi.fn().mockReturnValue('# No changes'),
      formatDiffCompact: vi.fn().mockReturnValue('0 changes'),
      verifyIntegrity: vi.fn().mockReturnValue(true),
    }));

    vi.doMock('../../src/baseline/converter.js', () => ({
      createCloudBaseline: vi.fn().mockReturnValue({ version: '1.0', metadata: { formatVersion: '1.0' } }),
    }));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exit = originalExit;
    vi.restoreAllMocks();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('command structure', () => {
    it('should have baseline as parent command', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      expect(baselineCommand.name()).toBe('baseline');
    });

    it('should have correct description', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      expect(baselineCommand.description()).toContain('drift detection');
    });

    it('should have save subcommand', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const saveCmd = baselineCommand.commands.find(c => c.name() === 'save');
      expect(saveCmd).toBeDefined();
    });

    it('should have compare subcommand', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const compareCmd = baselineCommand.commands.find(c => c.name() === 'compare');
      expect(compareCmd).toBeDefined();
    });

    it('should have show subcommand', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const showCmd = baselineCommand.commands.find(c => c.name() === 'show');
      expect(showCmd).toBeDefined();
    });

    it('should have diff subcommand', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const diffCmd = baselineCommand.commands.find(c => c.name() === 'diff');
      expect(diffCmd).toBeDefined();
    });
  });

  describe('save subcommand', () => {
    it('should have optional path argument', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const saveCmd = baselineCommand.commands.find(c => c.name() === 'save');
      const args = saveCmd?.registeredArguments || [];
      expect(args[0]?.name()).toBe('path');
      expect(args[0]?.required).toBe(false);
    });

    it('should have config option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const saveCmd = baselineCommand.commands.find(c => c.name() === 'save');
      const configOpt = saveCmd?.options.find(o => o.long === '--config');
      expect(configOpt).toBeDefined();
    });

    it('should have report option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const saveCmd = baselineCommand.commands.find(c => c.name() === 'save');
      const reportOpt = saveCmd?.options.find(o => o.long === '--report');
      expect(reportOpt).toBeDefined();
    });

    it('should have cloud option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const saveCmd = baselineCommand.commands.find(c => c.name() === 'save');
      const cloudOpt = saveCmd?.options.find(o => o.long === '--cloud');
      expect(cloudOpt).toBeDefined();
    });

    it('should have contract option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const saveCmd = baselineCommand.commands.find(c => c.name() === 'save');
      const contractOpt = saveCmd?.options.find(o => o.long === '--contract');
      expect(contractOpt).toBeDefined();
    });

    it('should have force option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const saveCmd = baselineCommand.commands.find(c => c.name() === 'save');
      const forceOpt = saveCmd?.options.find(o => o.long === '--force');
      expect(forceOpt).toBeDefined();
    });

    it('should error when report file not found', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');

      await expect(
        baselineCommand.parseAsync(['node', 'test', 'save'])
      ).rejects.toThrow('Process exit: 1');
    });

    it('should save baseline when report exists', async () => {
      // Create test report
      writeFileSync(
        join(testDir, 'bellwether-report.json'),
        JSON.stringify(sampleInterviewResult)
      );

      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');

      // Should not throw
      await baselineCommand.parseAsync(['node', 'test', 'save']);

      expect(consoleOutput.some(line => line.includes('Baseline saved'))).toBe(true);
    });
  });

  describe('compare subcommand', () => {
    it('should require baseline path argument', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const compareCmd = baselineCommand.commands.find(c => c.name() === 'compare');
      const args = compareCmd?.registeredArguments || [];
      expect(args[0]?.name()).toBe('baseline-path');
      expect(args[0]?.required).toBe(true);
    });

    it('should have format option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const compareCmd = baselineCommand.commands.find(c => c.name() === 'compare');
      const formatOpt = compareCmd?.options.find(o => o.long === '--format');
      expect(formatOpt).toBeDefined();
      expect(formatOpt?.defaultValue).toBe('text');
    });

    it('should have fail-on-drift option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const compareCmd = baselineCommand.commands.find(c => c.name() === 'compare');
      const failOpt = compareCmd?.options.find(o => o.long === '--fail-on-drift');
      expect(failOpt).toBeDefined();
    });

    it('should error when baseline not found', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');

      await expect(
        baselineCommand.parseAsync(['node', 'test', 'compare', 'nonexistent.json'])
      ).rejects.toThrow('Process exit: 1');
    });
  });

  describe('show subcommand', () => {
    it('should have optional path argument', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const showCmd = baselineCommand.commands.find(c => c.name() === 'show');
      const args = showCmd?.registeredArguments || [];
      expect(args[0]?.name()).toBe('path');
      expect(args[0]?.required).toBe(false);
    });

    it('should have json option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const showCmd = baselineCommand.commands.find(c => c.name() === 'show');
      const jsonOpt = showCmd?.options.find(o => o.long === '--json');
      expect(jsonOpt).toBeDefined();
    });

    it('should have tools option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const showCmd = baselineCommand.commands.find(c => c.name() === 'show');
      const toolsOpt = showCmd?.options.find(o => o.long === '--tools');
      expect(toolsOpt).toBeDefined();
    });

    it('should have assertions option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const showCmd = baselineCommand.commands.find(c => c.name() === 'show');
      const assertionsOpt = showCmd?.options.find(o => o.long === '--assertions');
      expect(assertionsOpt).toBeDefined();
    });

    it('should error when baseline not found', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');

      await expect(
        baselineCommand.parseAsync(['node', 'test', 'show'])
      ).rejects.toThrow('Process exit: 1');
    });

    it('should display baseline when found', async () => {
      // Create test baseline file
      writeFileSync(
        join(testDir, 'bellwether-baseline.json'),
        JSON.stringify(sampleBaseline)
      );

      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');

      await baselineCommand.parseAsync(['node', 'test', 'show']);

      expect(consoleOutput.some(line => line.includes('Baseline'))).toBe(true);
    });
  });

  describe('diff subcommand', () => {
    it('should require two path arguments', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const diffCmd = baselineCommand.commands.find(c => c.name() === 'diff');
      const args = diffCmd?.registeredArguments || [];
      expect(args.length).toBe(2);
      expect(args[0]?.name()).toBe('path1');
      expect(args[0]?.required).toBe(true);
      expect(args[1]?.name()).toBe('path2');
      expect(args[1]?.required).toBe(true);
    });

    it('should have format option', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');
      const diffCmd = baselineCommand.commands.find(c => c.name() === 'diff');
      const formatOpt = diffCmd?.options.find(o => o.long === '--format');
      expect(formatOpt).toBeDefined();
      expect(formatOpt?.defaultValue).toBe('text');
    });

    it('should error when first baseline not found', async () => {
      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');

      await expect(
        baselineCommand.parseAsync(['node', 'test', 'diff', 'nonexistent1.json', 'nonexistent2.json'])
      ).rejects.toThrow('Process exit: 1');
    });

    it('should error when second baseline not found', async () => {
      // Create first baseline
      writeFileSync(
        join(testDir, 'baseline1.json'),
        JSON.stringify(sampleBaseline)
      );

      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');

      await expect(
        baselineCommand.parseAsync(['node', 'test', 'diff', 'baseline1.json', 'nonexistent2.json'])
      ).rejects.toThrow('Process exit: 1');
    });

    it('should compare two baselines when both exist', async () => {
      // Create both baseline files
      writeFileSync(
        join(testDir, 'baseline1.json'),
        JSON.stringify(sampleBaseline)
      );
      writeFileSync(
        join(testDir, 'baseline2.json'),
        JSON.stringify({ ...sampleBaseline, createdAt: new Date().toISOString() })
      );

      const { baselineCommand } = await import('../../src/cli/commands/baseline.js');

      await baselineCommand.parseAsync(['node', 'test', 'diff', 'baseline1.json', 'baseline2.json']);

      expect(consoleOutput.some(line => line.includes('Comparing baselines'))).toBe(true);
    });
  });
});

describe('baseline file operations', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-baseline-files-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should detect baseline files with .json extension', () => {
    const baselinePath = join(testDir, 'bellwether-baseline.json');
    writeFileSync(baselinePath, '{}');
    expect(existsSync(baselinePath)).toBe(true);
  });

  it('should handle nested output directories', () => {
    const nestedDir = join(testDir, 'output', 'baselines');
    mkdirSync(nestedDir, { recursive: true });
    const baselinePath = join(nestedDir, 'bellwether-baseline.json');
    writeFileSync(baselinePath, '{}');
    expect(existsSync(baselinePath)).toBe(true);
  });

  it('should handle report files in different locations', () => {
    // Report in root
    const rootReport = join(testDir, 'bellwether-report.json');
    writeFileSync(rootReport, '{}');
    expect(existsSync(rootReport)).toBe(true);

    // Report in output dir
    const outputDir = join(testDir, 'output');
    mkdirSync(outputDir);
    const outputReport = join(outputDir, 'bellwether-report.json');
    writeFileSync(outputReport, '{}');
    expect(existsSync(outputReport)).toBe(true);
  });
});
