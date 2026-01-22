/**
 * Tests for the baseline accept command.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { recalculateIntegrityHash, type BehavioralBaseline } from '../../../src/baseline/index.js';

// Mock the output module
vi.mock('../../../src/cli/output.js', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  newline: vi.fn(),
}));

// Mock process.exit to throw to stop execution (like real process.exit)
const mockExit = vi.fn((code?: number) => {
  throw new Error(`Process exit: ${code}`);
});
vi.stubGlobal('process', { ...process, exit: mockExit, env: { ...process.env } });

describe('baseline accept command', () => {
  let testDir: string;
  let originalCwd: string;

  /**
   * Create a valid InterviewResult fixture for check mode.
   * This matches the InterviewResult interface requirements.
   */
  function createCheckResult(tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>) {
    return {
      discovery: {
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
        protocolVersion: '2024-11-05',
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        prompts: [],
        resources: [],
        capabilities: { tools: true },
        timestamp: new Date().toISOString(),
        serverCommand: 'npx test-server',
        serverArgs: [],
      },
      toolProfiles: tools.map((t) => ({
        name: t.name,
        description: t.description,
        interactions: [],
        behavioralNotes: [],
        limitations: [],
        securityNotes: [],
      })),
      summary: 'Test MCP server with file operations',
      limitations: [],
      recommendations: [],
      metadata: {
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 1000,
        toolCallCount: tools.length,
        errorCount: 0,
        model: 'check',
        personas: [],
        serverCommand: 'npx test-server',
      },
    };
  }

  /**
   * Create a valid baseline fixture that passes Zod schema validation.
   * Key requirements:
   * - version: semver string (e.g., "0.8.0")
   * - server.capabilities: string[] (not object)
   * - tools[].assertions: BehavioralAssertion[] (not behavioralNotes)
   * - tools[].securityNotes: string[]
   * - tools[].limitations: string[]
   * - summary: string (required)
   * - assertions: BehavioralAssertion[]
   * - integrityHash: computed from baseline data (required for loadBaseline verification)
   *
   * IMPORTANT: Property order MUST match the Zod schema in saver.ts exactly!
   * When loadBaseline parses the JSON, Zod returns properties in schema order.
   * The integrity hash is computed from JSON.stringify, which is property-order sensitive.
   * If the order differs, the hash will not match after load.
   */
  function createBaselineFixture(tools: Array<{ name: string; description: string; schemaHash: string; inputSchema?: Record<string, unknown> }>) {
    // Property order matches the Zod baselineSchema in saver.ts:
    // version, createdAt, mode, serverCommand, server, tools, summary, assertions, workflowSignatures
    const baselineWithoutHash: Omit<BehavioralBaseline, 'integrityHash'> = {
      version: '0.8.0',
      createdAt: new Date(),
      mode: 'check',
      serverCommand: 'npx test-server',
      server: {
        name: 'test-server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        schemaHash: t.schemaHash,
        inputSchema: t.inputSchema,
        assertions: [],
        securityNotes: [],
        limitations: [],
        // responseFingerprint computed from empty interactions by createBaseline
        responseFingerprint: {
          structureHash: 'empty',
          contentType: 'empty',
          size: 'tiny',
          isEmpty: true,
          sampleCount: 0,
          confidence: 0,
        },
      })),
      summary: 'Test MCP server with file operations',
      assertions: [],
    };
    // Use recalculateIntegrityHash to compute a valid hash
    return recalculateIntegrityHash(baselineWithoutHash);
  }

  // Standard tool definitions for reuse
  // Note: schemaHash must be 'empty' to match what computeConsensusSchemaHash returns
  // when createBaseline() processes tools with empty interactions arrays
  const readFileTool = {
    name: 'read_file',
    description: 'Read contents of a file',
    schemaHash: 'empty',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  };

  const writeFileTool = {
    name: 'write_file',
    description: 'Write contents to a file',
    schemaHash: 'empty',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  };

  const deleteFileTool = {
    name: 'delete_file',
    description: 'Delete a file',
    schemaHash: 'empty',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  };

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-test-accept-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getOutputDir helper', () => {
    it('should return current directory when no config exists', async () => {
      // Import dynamically to get fresh module
      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      expect(acceptCommand).toBeDefined();
    });
  });

  describe('loadInterviewResult helper', () => {
    it('should throw when report file does not exist', async () => {
      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');

      // Create baseline but not report
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));

      // Run command - should fail because report doesn't exist
      await expect(acceptCommand.parseAsync(['node', 'test'])).rejects.toThrow();

      const output = await import('../../../src/cli/output.js');
      expect(output.error).toHaveBeenCalled();
    });

    it('should throw when report has invalid JSON', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(reportPath, 'invalid json {{{');

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await expect(acceptCommand.parseAsync(['node', 'test'])).rejects.toThrow();

      const output = await import('../../../src/cli/output.js');
      expect(output.error).toHaveBeenCalled();
    });

    it('should throw when report is from explore mode', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));

      // Create an explore mode result (model !== 'check')
      const exploreResult = createCheckResult([readFileTool]);
      exploreResult.metadata.model = 'gpt-4';
      writeFileSync(reportPath, JSON.stringify(exploreResult, null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await expect(acceptCommand.parseAsync(['node', 'test'])).rejects.toThrow();

      const output = await import('../../../src/cli/output.js');
      expect(output.error).toHaveBeenCalled();
    });
  });

  describe('baseline not found', () => {
    it('should error when baseline file does not exist', async () => {
      const reportPath = join(testDir, '.bellwether', 'bellwether-check.json');
      mkdirSync(join(testDir, '.bellwether'), { recursive: true });
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await expect(acceptCommand.parseAsync(['node', 'test'])).rejects.toThrow();

      const output = await import('../../../src/cli/output.js');
      expect(output.error).toHaveBeenCalledWith(expect.stringContaining('Baseline not found'));
    });
  });

  describe('no drift detected', () => {
    it('should report success when no drift detected', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      // Report path should match DEFAULT_CHECK_REPORT_FILE (bellwether-check.json in output dir)
      const reportPath = join(testDir, 'bellwether-check.json');

      // Create baseline and check result with the same tools
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test']);

      const output = await import('../../../src/cli/output.js');
      expect(output.success).toHaveBeenCalledWith(expect.stringContaining('No drift detected'));
    });
  });

  describe('dry run mode', () => {
    it('should show what would be accepted without making changes', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Create baseline with one tool, check result with two tools (added tool)
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool, writeFileTool]), null, 2));

      const originalContent = readFileSync(baselinePath, 'utf-8');

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test', '--dry-run']);

      const output = await import('../../../src/cli/output.js');
      expect(output.info).toHaveBeenCalledWith(expect.stringContaining('Dry Run'));

      // File should not be modified
      const contentAfter = readFileSync(baselinePath, 'utf-8');
      expect(contentAfter).toBe(originalContent);
    });

    it('should show acceptance metadata in dry run', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Create drift (added tool)
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool, writeFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test', '--dry-run', '--reason', 'Test reason', '--accepted-by', 'Test User']);

      const output = await import('../../../src/cli/output.js');
      const infoCalls = vi.mocked(output.info).mock.calls.flat().join(' ');
      expect(infoCalls).toContain('Test User');
      expect(infoCalls).toContain('Test reason');
    });
  });

  describe('breaking changes require --force', () => {
    it('should require --force flag for breaking changes', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Create breaking change: remove a tool
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool, writeFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await expect(acceptCommand.parseAsync(['node', 'test'])).rejects.toThrow('Process exit');

      const output = await import('../../../src/cli/output.js');
      expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('BREAKING'));
      expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('--force'));
    });

    it('should allow breaking changes with --force flag', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Create breaking change: remove a tool
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool, writeFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test', '--force']);

      const output = await import('../../../src/cli/output.js');
      expect(output.success).toHaveBeenCalledWith(expect.stringContaining('Drift accepted'));
    });
  });

  describe('acceptance metadata', () => {
    it('should record acceptance reason', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Create drift (added tool - not breaking)
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool, writeFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test', '--reason', 'Added write_file tool for new feature']);

      // Read updated baseline and check acceptance metadata
      const updatedBaseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
      expect(updatedBaseline.acceptance).toBeDefined();
      expect(updatedBaseline.acceptance.reason).toBe('Added write_file tool for new feature');
    });

    it('should record accepted-by field', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Create drift (added tool)
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool, writeFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test', '--accepted-by', 'developer@example.com']);

      // Read updated baseline and check acceptance metadata
      const updatedBaseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
      expect(updatedBaseline.acceptance).toBeDefined();
      expect(updatedBaseline.acceptance.acceptedBy).toBe('developer@example.com');
    });

    it('should record acceptance timestamp', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Create drift (added tool)
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool, writeFileTool]), null, 2));

      const beforeTime = new Date();

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test']);

      const afterTime = new Date();

      // Read updated baseline and check acceptance metadata
      const updatedBaseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
      expect(updatedBaseline.acceptance).toBeDefined();
      expect(updatedBaseline.acceptance.acceptedAt).toBeDefined();

      const acceptedAt = new Date(updatedBaseline.acceptance.acceptedAt);
      expect(acceptedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(acceptedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('path handling', () => {
    it('should handle absolute baseline path', async () => {
      const baselinePath = join(testDir, 'custom-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Create files
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test', '--baseline', baselinePath]);

      const output = await import('../../../src/cli/output.js');
      expect(output.success).toHaveBeenCalledWith(expect.stringContaining('No drift detected'));
    });

    it('should handle custom report path', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const customReportPath = join(testDir, 'custom-report.json');

      // Create files (no .bellwether directory needed)
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(customReportPath, JSON.stringify(createCheckResult([readFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test', '--report', customReportPath]);

      const output = await import('../../../src/cli/output.js');
      expect(output.success).toHaveBeenCalledWith(expect.stringContaining('No drift detected'));
    });
  });

  describe('diff information', () => {
    it('should show tools added in drift summary', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Add a new tool
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool, writeFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test']);

      const output = await import('../../../src/cli/output.js');
      const infoCalls = vi.mocked(output.info).mock.calls.flat().join(' ');
      expect(infoCalls).toContain('Tools added');
      expect(infoCalls).toContain('write_file');
    });

    it('should show tools removed in drift summary', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Remove a tool (breaking change)
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool, writeFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await expect(acceptCommand.parseAsync(['node', 'test'])).rejects.toThrow('Process exit');

      const output = await import('../../../src/cli/output.js');
      const warnCalls = vi.mocked(output.warn).mock.calls.flat().join(' ');
      expect(warnCalls).toContain('Tools removed');
      expect(warnCalls).toContain('write_file');
    });

    it('should record accepted diff in baseline', async () => {
      const baselinePath = join(testDir, 'bellwether-baseline.json');
      const reportPath = join(testDir, 'bellwether-check.json');

      // Add a new tool
      writeFileSync(baselinePath, JSON.stringify(createBaselineFixture([readFileTool]), null, 2));
      writeFileSync(reportPath, JSON.stringify(createCheckResult([readFileTool, writeFileTool]), null, 2));

      const { acceptCommand } = await import('../../../src/cli/commands/baseline-accept.js');
      await acceptCommand.parseAsync(['node', 'test']);

      // Read updated baseline and check accepted diff
      const updatedBaseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
      expect(updatedBaseline.acceptance.acceptedDiff).toBeDefined();
      expect(updatedBaseline.acceptance.acceptedDiff.toolsAdded).toContain('write_file');
      expect(updatedBaseline.acceptance.acceptedDiff.toolsRemoved).toEqual([]);
    });
  });
});
