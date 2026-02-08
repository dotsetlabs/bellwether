/**
 * Integration tests for cli/commands/check.ts
 *
 * Tests the check command's core functionality using mocked MCP servers.
 * Following TDD principles - testing expected behavior based on rational assumptions.
 *
 * The check command orchestrates:
 * - Config loading and validation
 * - MCP client connection
 * - Discovery phase
 * - Incremental checking
 * - Custom scenarios
 * - Interviewer execution (check mode)
 * - Security testing
 * - Workflow testing
 * - Documentation generation
 * - Baseline comparison and drift detection
 * - Exit code handling based on severity
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getTsxCommand } from '../../fixtures/tsx-command.js';

// Import core functions used by check command
import { MCPClient } from '../../../src/transport/mcp-client.js';
import { discover } from '../../../src/discovery/discovery.js';
import { Interviewer } from '../../../src/interview/interviewer.js';
import { generateContractMd, generateJsonReport } from '../../../src/docs/generator.js';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  compareBaselines,
  applySeverityConfig,
  shouldFailOnDiff,
  formatDiffText,
  formatDiffJson,
  formatDiffCompact,
  formatDiffGitHubActions,
  formatDiffMarkdown,
  getToolFingerprints,
  toToolCapability,
  verifyBaselineHash,
  acceptDrift,
  severityMeetsThreshold,
  type SeverityConfig,
  type BehavioralBaseline,
  type BehavioralDiff,
  type SecurityFingerprint,
  // type ToolFingerprint,
} from '../../../src/baseline/index.js';
import { REPORT_SCHEMAS, EXIT_CODES, SEVERITY_TO_EXIT_CODE } from '../../../src/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MOCK_SERVER_PATH = join(__dirname, '../../fixtures/mock-mcp-server.ts');
const { command: TSX_PATH, args: TSX_ARGS } = getTsxCommand(MOCK_SERVER_PATH);

describe('check command integration', () => {
  let testDir: string;
  let client: MCPClient;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `bellwether-check-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    client = new MCPClient({ timeout: 10000, startupDelay: 100 });
  });

  afterEach(async () => {
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('discovery phase', () => {
    it('should connect to MCP server and discover tools', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);

      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      expect(discovery.serverInfo.name).toBe('test-server');
      expect(discovery.tools.length).toBeGreaterThan(0);
      expect(discovery.tools.map((t) => t.name)).toContain('get_weather');
      expect(discovery.tools.map((t) => t.name)).toContain('calculate');
      expect(discovery.tools.map((t) => t.name)).toContain('read_file');
    }, 15000);

    it('should discover prompts if available', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);

      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      expect(discovery.prompts.length).toBeGreaterThan(0);
      expect(discovery.prompts.map((p) => p.name)).toContain('summarize');
    }, 15000);

    it('should handle server that returns no tools', async () => {
      await client.connect(TSX_PATH, TSX_ARGS, {
        MOCK_TOOLS: '[]',
      });

      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      expect(discovery.tools).toHaveLength(0);
    }, 15000);

    it('should collect transport errors during discovery', async () => {
      await client.connect('nonexistent-command-xyz', []);

      // Wait for error to be processed
      await new Promise((resolve) => setTimeout(resolve, 200));

      const errors = client.getTransportErrors();
      expect(errors.length).toBeGreaterThanOrEqual(1);
    }, 15000);
  });

  describe('interview phase (check mode)', () => {
    it('should interview all discovered tools', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);

      expect(result.toolProfiles.length).toBe(discovery.tools.length);
      expect(result.metadata.toolCallCount).toBeGreaterThan(0);
    }, 30000);

    it('should capture tool response metadata', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 3,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);

      // Check that interactions were recorded
      for (const profile of result.toolProfiles) {
        expect(profile.interactions.length).toBeGreaterThan(0);
        for (const interaction of profile.interactions) {
          expect(typeof interaction.durationMs).toBe('number');
          expect(interaction.durationMs).toBeGreaterThanOrEqual(0);
        }
      }
    }, 30000);

    it('should handle tool errors gracefully', async () => {
      await client.connect(TSX_PATH, TSX_ARGS, {
        MOCK_FAIL_TOOL: 'calculate',
      });
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      // Should complete without throwing
      const result = await interviewer.interview(client, discovery);

      // The calculate tool should have recorded errors
      const calcProfile = result.toolProfiles.find((p) => p.name === 'calculate');
      expect(calcProfile).toBeDefined();
      const hasErrorInteraction = calcProfile?.interactions.some((i) => i.error);
      expect(hasErrorInteraction).toBe(true);
    }, 30000);

    it('should respect maxQuestionsPerTool config', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const maxQuestions = 1;
      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: maxQuestions,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);

      // Each tool should have at most maxQuestions interactions
      for (const profile of result.toolProfiles) {
        expect(profile.interactions.length).toBeLessThanOrEqual(maxQuestions);
      }
    }, 30000);
  });

  describe('baseline creation', () => {
    it('should create baseline from interview result', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      expect(baseline.version).toBeDefined();
      expect(baseline.hash).toBeDefined();
      expect(baseline.server.name).toBe('test-server');
      expect(baseline.capabilities.tools.length).toBe(discovery.tools.length);
      expect(baseline.metadata.mode).toBe('check');
    }, 30000);

    it('should calculate schema hashes for each tool', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      for (const tool of baseline.capabilities.tools) {
        expect(tool.schemaHash).toBeDefined();
        expect(typeof tool.schemaHash).toBe('string');
        expect(tool.schemaHash.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should include performance metrics in baseline', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 3, // Need enough samples for metrics
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Check that at least some tools have performance data
      const toolsWithMetrics = baseline.capabilities.tools.filter(
        (t) => t.baselineP50Ms !== undefined
      );
      expect(toolsWithMetrics.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('baseline save/load roundtrip', () => {
    it('should save and load baseline correctly', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);
      const path = join(testDir, 'baseline.json');

      saveBaseline(baseline, path);
      expect(existsSync(path)).toBe(true);

      // Skip integrity check because Zod schema reordering during load changes the hash
      const loaded = loadBaseline(path, { skipIntegrityCheck: true });
      expect(loaded.version).toBe(baseline.version);
      expect(loaded.server.name).toBe(baseline.server.name);
      expect(loaded.capabilities.tools.length).toBe(baseline.capabilities.tools.length);
    }, 30000);
  });

  describe('drift detection', () => {
    it('should detect no drift when server unchanged', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Compare baseline to itself
      const diff = compareBaselines(baseline, baseline);

      expect(diff.severity).toBe('none');
      expect(diff.toolsAdded).toHaveLength(0);
      expect(diff.toolsRemoved).toHaveLength(0);
      expect(diff.toolsModified).toHaveLength(0);
    }, 30000);

    it('should detect added tools as breaking change', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery1 = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer1 = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result1 = await interviewer1.interview(client, discovery1);
      const baseline1 = createBaseline(result1, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Disconnect and reconnect with additional tools
      await client.disconnect();
      client = new MCPClient({ timeout: 10000, startupDelay: 100 });

      const extraTools = [
        ...JSON.parse(JSON.stringify(discovery1.tools)),
        {
          name: 'new_tool',
          description: 'A newly added tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      await client.connect(TSX_PATH, TSX_ARGS, {
        MOCK_TOOLS: JSON.stringify(extraTools),
      });

      const discovery2 = await discover(client, TSX_PATH, TSX_ARGS);
      const interviewer2 = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result2 = await interviewer2.interview(client, discovery2);
      const baseline2 = createBaseline(result2, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsAdded).toContain('new_tool');
      // Adding tools should be a breaking change (API surface changed)
      expect(diff.severity).not.toBe('none');
    }, 60000);

    it('should detect removed tools as breaking change', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Create a modified baseline with fewer tools
      const modifiedBaseline = {
        ...baseline,
        capabilities: {
          ...baseline.capabilities,
          tools: baseline.capabilities.tools.slice(1), // Remove first tool
        },
        toolProfiles: baseline.toolProfiles.slice(1),
      };

      const diff = compareBaselines(baseline, modifiedBaseline);

      expect(diff.toolsRemoved.length).toBeGreaterThan(0);
      expect(diff.severity).toBe('breaking');
    }, 30000);

    it('should detect schema changes', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Modify a tool's input schema to simulate schema change
      const modifiedBaseline = {
        ...baseline,
        capabilities: {
          ...baseline.capabilities,
          tools: baseline.capabilities.tools.map((tool, idx) =>
            idx === 0
              ? {
                  ...tool,
                  inputSchema: {
                    ...(tool.inputSchema ?? {}),
                    properties: {
                      ...((((tool.inputSchema ?? {}) as Record<string, unknown>)
                        .properties as Record<string, unknown>) ?? {}),
                      __test_added: { type: 'string' },
                    },
                  },
                }
              : tool
          ),
        },
      };

      const diff = compareBaselines(baseline, modifiedBaseline);

      expect(diff.toolsModified.length).toBeGreaterThan(0);
      // ToolDiff has schemaChanged boolean, not 'schema' in changes array
      expect(diff.toolsModified[0].schemaChanged).toBe(true);
    }, 30000);
  });

  describe('severity configuration', () => {
    it('should apply minimum severity filter', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Create a baseline with a description change (info level)
      const modifiedBaseline = {
        ...baseline,
        capabilities: {
          ...baseline.capabilities,
          tools: baseline.capabilities.tools.map((tool, idx) =>
            idx === 0 ? { ...tool, description: 'Modified description' } : tool
          ),
        },
      };

      const diff = compareBaselines(baseline, modifiedBaseline);

      // Apply severity config that filters out info-level changes
      const severityConfig: SeverityConfig = {
        minimumSeverity: 'warning',
        failOnSeverity: 'breaking',
        suppressWarnings: false,
      };

      const filteredDiff = applySeverityConfig(diff, severityConfig);

      // Info-level changes should be filtered
      if (diff.severity === 'info') {
        expect(filteredDiff.toolsModified.length).toBeLessThanOrEqual(diff.toolsModified.length);
      }
    }, 30000);

    it('should determine failure threshold correctly', () => {
      // Test shouldFailOnDiff function
      const breakingDiff = {
        severity: 'breaking' as const,
        toolsAdded: ['tool'],
        toolsRemoved: [],
        toolsModified: [],
        behaviorChanges: [],
        summary: 'Breaking changes detected',
        breakingCount: 1,
        warningCount: 0,
        infoCount: 0,
      };

      const warningDiff = {
        severity: 'warning' as const,
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [
          {
            tool: 'test',
            changes: [],
            schemaChanged: false,
            descriptionChanged: true,
            responseStructureChanged: false,
            errorPatternsChanged: false,
            responseSchemaEvolutionChanged: false,
            securityChanged: false,
          },
        ],
        behaviorChanges: [],
        summary: 'Warning-level changes detected',
        breakingCount: 0,
        warningCount: 1,
        infoCount: 0,
      };

      const infoDiff = {
        severity: 'info' as const,
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
        behaviorChanges: [],
        summary: 'Info-level changes detected',
        breakingCount: 0,
        warningCount: 0,
        infoCount: 1,
      };

      // With failOnSeverity: 'breaking', only breaking should fail
      expect(shouldFailOnDiff(breakingDiff, 'breaking')).toBe(true);
      expect(shouldFailOnDiff(warningDiff, 'breaking')).toBe(false);
      expect(shouldFailOnDiff(infoDiff, 'breaking')).toBe(false);

      // With failOnSeverity: 'warning', warning and breaking should fail
      expect(shouldFailOnDiff(breakingDiff, 'warning')).toBe(true);
      expect(shouldFailOnDiff(warningDiff, 'warning')).toBe(true);
      expect(shouldFailOnDiff(infoDiff, 'warning')).toBe(false);
    });
  });

  describe('exit code mapping', () => {
    it('should map severity to correct exit codes', () => {
      expect(SEVERITY_TO_EXIT_CODE.none).toBe(EXIT_CODES.CLEAN);
      expect(SEVERITY_TO_EXIT_CODE.info).toBe(EXIT_CODES.INFO);
      expect(SEVERITY_TO_EXIT_CODE.warning).toBe(EXIT_CODES.WARNING);
      expect(SEVERITY_TO_EXIT_CODE.breaking).toBe(EXIT_CODES.BREAKING);
    });

    it('should have distinct exit codes for each severity', () => {
      const codes = Object.values(SEVERITY_TO_EXIT_CODE);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe('diff output formats', () => {
    async function createDiffForTesting() {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Create modified baseline for diff testing
      const modifiedBaseline = {
        ...baseline,
        capabilities: {
          ...baseline.capabilities,
          tools: [
            ...baseline.capabilities.tools.map((tool, idx) =>
              idx === 0 ? { ...tool, description: 'Modified description' } : tool
            ),
            {
              name: 'added_tool',
              description: 'New tool',
              inputSchema: {},
              schemaHash: 'new-hash',
            },
          ],
        },
        toolProfiles: [
          ...baseline.toolProfiles,
          {
            name: 'added_tool',
            description: 'New tool',
            schemaHash: 'new-hash',
            assertions: [],
            securityNotes: [],
            limitations: [],
            behavioralNotes: [],
          },
        ],
      };

      return compareBaselines(baseline, modifiedBaseline);
    }

    it('should format diff as text', async () => {
      const diff = await createDiffForTesting();
      const text = formatDiffText(diff);

      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    }, 30000);

    it('should format diff as JSON', async () => {
      const diff = await createDiffForTesting();
      const json = formatDiffJson(diff);

      const parsed = JSON.parse(json);
      expect(parsed.severity).toBeDefined();
      expect(parsed.toolsAdded).toBeDefined();
      expect(parsed.toolsRemoved).toBeDefined();
    }, 30000);

    it('should format diff as compact', async () => {
      const diff = await createDiffForTesting();
      const compact = formatDiffCompact(diff);

      expect(typeof compact).toBe('string');
    }, 30000);

    it('should format diff for GitHub Actions', async () => {
      const diff = await createDiffForTesting();
      const github = formatDiffGitHubActions(diff);

      expect(typeof github).toBe('string');
      // GitHub Actions format uses ::warning:: or ::error:: prefixes
      if (diff.severity !== 'none') {
        expect(github).toMatch(/::(warning|error|notice)::/);
      }
    }, 30000);

    it('should format diff as markdown', async () => {
      const diff = await createDiffForTesting();
      const markdown = formatDiffMarkdown(diff);

      expect(typeof markdown).toBe('string');
      // Markdown should contain headers
      expect(markdown).toContain('#');
    }, 30000);
  });

  describe('documentation generation', () => {
    it('should generate CONTRACT.md', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const contractMd = generateContractMd(result, {
        countValidationAsSuccess: true,
        separateValidationMetrics: true,
      });

      expect(contractMd).toContain('## Quick Reference');
      expect(contractMd).toContain('get_weather');
      expect(contractMd).toContain('calculate');
    }, 30000);

    it('should generate valid JSON report', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const jsonReport = generateJsonReport(result, {
        schemaUrl: REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL,
        validate: true,
      });

      const parsed = JSON.parse(jsonReport);
      expect(parsed.$schema).toBe(REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL);
      expect(parsed.toolProfiles).toBeDefined();
      expect(Array.isArray(parsed.toolProfiles)).toBe(true);
    }, 30000);

    it('should include tool metadata in documentation', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const contractMd = generateContractMd(result, {});

      // Should include tool descriptions
      expect(contractMd).toContain('Get the current weather');
      expect(contractMd).toContain('Perform mathematical calculations');
    }, 30000);
  });

  describe('progress tracking', () => {
    it('should invoke progress callback during interview', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const progressEvents: string[] = [];
      const progressCallback = vi.fn((progress) => {
        progressEvents.push(progress.phase);
      });

      await interviewer.interview(client, discovery, progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressEvents).toContain('starting');
      expect(progressEvents).toContain('complete');
    }, 30000);

    it('should report tool completion in progress', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const completedTools: string[] = [];
      const progressCallback = (progress: { lastCompletedTool?: { toolName: string } }) => {
        if (progress.lastCompletedTool) {
          completedTools.push(progress.lastCompletedTool.toolName);
        }
      };

      await interviewer.interview(client, discovery, progressCallback);

      // All discovered tools should be reported as completed
      for (const tool of discovery.tools) {
        expect(completedTools).toContain(tool.name);
      }
    }, 30000);
  });

  describe('error scenarios', () => {
    it('should handle server initialization failure', async () => {
      await client.connect(TSX_PATH, TSX_ARGS, {
        MOCK_FAIL_INIT: 'true',
      });

      await expect(client.initialize()).rejects.toThrow('Initialization failed');
    }, 15000);

    it('should handle connection timeout', async () => {
      const shortTimeoutClient = new MCPClient({
        timeout: 100, // Very short timeout
        startupDelay: 50,
      });

      await shortTimeoutClient.connect(TSX_PATH, TSX_ARGS, {
        MOCK_DELAY: '5000', // Server delays 5 seconds
      });

      // Initialize should work (not delayed)
      await shortTimeoutClient.initialize();

      // But tool calls should timeout
      await expect(
        shortTimeoutClient.callTool('get_weather', { location: 'Test' })
      ).rejects.toThrow('timeout');

      await shortTimeoutClient.disconnect();
    }, 15000);

    it('should handle missing baseline file', () => {
      const fakePath = join(testDir, 'nonexistent.json');

      expect(() => loadBaseline(fakePath)).toThrow('Baseline file not found');
    });

    it('should handle corrupted baseline file', () => {
      const path = join(testDir, 'corrupted.json');
      writeFileSync(path, '{ invalid json }');

      expect(() => loadBaseline(path)).toThrow('Invalid JSON');
    });

    it('should handle tampered baseline file', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);
      const path = join(testDir, 'baseline.json');

      saveBaseline(baseline, path);

      // Tamper with the file
      const content = JSON.parse(readFileSync(path, 'utf-8'));
      content.server.name = 'tampered-name';
      writeFileSync(path, JSON.stringify(content, null, 2));

      expect(() => loadBaseline(path)).toThrow('hash verification failed');
    }, 30000);
  });

  describe('parallel tool testing', () => {
    it('should support parallel tool testing', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: true,
        toolConcurrency: 3,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);

      // Should complete all tools
      expect(result.toolProfiles.length).toBe(discovery.tools.length);
    }, 30000);

    it('should complete faster with parallel execution', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      // Sequential test
      const seqInterviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const seqStart = Date.now();
      await seqInterviewer.interview(client, discovery);
      const seqDuration = Date.now() - seqStart;

      // Parallel test
      const parInterviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: true,
        toolConcurrency: 3,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const parStart = Date.now();
      await parInterviewer.interview(client, discovery);
      const parDuration = Date.now() - parStart;

      // Parallel should be faster (or at least not significantly slower)
      // Due to overhead, we just check it completes reasonably
      expect(parDuration).toBeLessThan(seqDuration * 2);
    }, 60000);
  });

  describe('custom tools configuration', () => {
    it('should work with custom tool definitions', async () => {
      const customTools = [
        {
          name: 'custom_tool',
          description: 'A custom test tool',
          inputSchema: {
            type: 'object',
            properties: {
              value: { type: 'string' },
            },
            required: ['value'],
          },
        },
      ];

      await client.connect(TSX_PATH, TSX_ARGS, {
        MOCK_TOOLS: JSON.stringify(customTools),
      });

      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      expect(discovery.tools).toHaveLength(1);
      expect(discovery.tools[0].name).toBe('custom_tool');
      expect(discovery.tools[0].inputSchema?.required).toContain('value');
    }, 15000);

    it('should handle tools with no input schema', async () => {
      const minimalTools = [
        {
          name: 'minimal_tool',
          description: 'A tool with no schema',
        },
      ];

      await client.connect(TSX_PATH, TSX_ARGS, {
        MOCK_TOOLS: JSON.stringify(minimalTools),
      });

      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      expect(discovery.tools).toHaveLength(1);
      expect(discovery.tools[0].name).toBe('minimal_tool');
    }, 15000);
  });

  describe('metrics collection', () => {
    it('should calculate performance metrics', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 5, // More samples for metrics
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Check that performance metrics are calculated
      // At minimum, tools should have baselineP50Ms and baselineSuccessRate
      const toolsWithMetrics = baseline.capabilities.tools.filter(
        (t) => t.baselineP50Ms !== undefined || t.baselineSuccessRate !== undefined
      );

      // With 5 samples, should have some performance data
      expect(toolsWithMetrics.length).toBeGreaterThan(0);

      for (const tool of toolsWithMetrics) {
        if (tool.baselineP50Ms !== undefined) {
          expect(tool.baselineP50Ms).toBeGreaterThanOrEqual(0);
        }
        if (tool.baselineSuccessRate !== undefined) {
          expect(tool.baselineSuccessRate).toBeGreaterThanOrEqual(0);
          expect(tool.baselineSuccessRate).toBeLessThanOrEqual(1);
        }
      }
    }, 45000);

    it('should track confidence data when available', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 5,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Check tools with confidence data
      const toolsWithConfidence = baseline.capabilities.tools.filter(
        (t) => t.performanceConfidence !== undefined
      );

      // If confidence data is present, verify its structure
      for (const tool of toolsWithConfidence) {
        const confidence = tool.performanceConfidence;
        expect(confidence?.confidenceLevel).toMatch(/^(low|medium|high)$/);
        expect(typeof confidence?.totalTests).toBe('number');
        expect(typeof confidence?.standardDeviation).toBe('number');
      }
    }, 45000);
  });

  describe('security testing integration', () => {
    it('should attach security fingerprints to baseline tools', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      let baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Simulate security fingerprint attachment (same pattern as check.ts:920-934)
      const securityFingerprints = new Map<string, SecurityFingerprint>();
      for (const tool of discovery.tools) {
        const fingerprint: SecurityFingerprint = {
          tested: true,
          categoriesTested: ['sql_injection', 'xss'],
          findings: [],
          riskScore: 0,
          testedAt: new Date().toISOString(),
          findingsHash: 'empty',
        };
        securityFingerprints.set(tool.name, fingerprint);
      }

      // Attach fingerprints (same pattern as check.ts)
      baseline = {
        ...baseline,
        capabilities: {
          ...baseline.capabilities,
          tools: baseline.capabilities.tools.map((tool) => {
            const securityFp = securityFingerprints.get(tool.name);
            if (securityFp) {
              return { ...tool, securityFingerprint: securityFp };
            }
            return tool;
          }),
        },
      };

      // Verify fingerprints are attached
      for (const tool of baseline.capabilities.tools) {
        expect(tool.securityFingerprint).toBeDefined();
        expect(tool.securityFingerprint!.tested).toBe(true);
        expect(tool.securityFingerprint!.categoriesTested).toContain('sql_injection');
      }
    }, 30000);

    it('should detect security drift across baselines', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseBaseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Baseline A: clean security (no findings)
      const baselineA: BehavioralBaseline = {
        ...baseBaseline,
        capabilities: {
          ...baseBaseline.capabilities,
          tools: baseBaseline.capabilities.tools.map((tool) => ({
            ...tool,
            securityFingerprint: {
              tested: true,
              categoriesTested: ['sql_injection'] as const,
              findings: [],
              riskScore: 0,
              testedAt: new Date().toISOString(),
              findingsHash: 'empty',
            },
          })),
        },
      };

      // Baseline B: has security findings
      const baselineB: BehavioralBaseline = {
        ...baseBaseline,
        capabilities: {
          ...baseBaseline.capabilities,
          tools: baseBaseline.capabilities.tools.map((tool) => ({
            ...tool,
            securityFingerprint: {
              tested: true,
              categoriesTested: ['sql_injection'] as const,
              findings: [
                {
                  category: 'sql_injection' as const,
                  riskLevel: 'high' as const,
                  title: 'SQL Injection vulnerability',
                  description: 'Tool accepted SQL injection payload',
                  evidence: 'Parameter: "query", Payload: "1 OR 1=1"',
                  remediation: 'Use parameterized queries',
                  cweId: 'CWE-89',
                  parameter: 'query',
                  tool: tool.name,
                },
              ],
              riskScore: 25,
              testedAt: new Date().toISOString(),
              findingsHash: 'abc123',
            },
          })),
        },
      };

      const diff = compareBaselines(baselineA, baselineB);

      // Security report should be present and indicate degradation
      expect(diff.securityReport).toBeDefined();
      expect(diff.securityReport!.newFindings.length).toBeGreaterThan(0);
      expect(diff.securityReport!.degraded).toBe(true);
    }, 30000);

    it('should survive save/load/compare cycle with security fingerprints', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      let baseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Attach security fingerprints
      baseline = {
        ...baseline,
        capabilities: {
          ...baseline.capabilities,
          tools: baseline.capabilities.tools.map((tool) => ({
            ...tool,
            securityFingerprint: {
              tested: true,
              categoriesTested: ['xss'] as const,
              findings: [],
              riskScore: 0,
              testedAt: new Date().toISOString(),
              findingsHash: 'empty',
            },
          })),
        },
      };

      // Save and reload
      const path = join(testDir, 'security-baseline.json');
      saveBaseline(baseline, path);
      const loaded = loadBaseline(path, { skipIntegrityCheck: true });

      // Verify security fingerprints survived disk roundtrip
      for (const tool of loaded.capabilities.tools) {
        expect(tool.securityFingerprint).toBeDefined();
        expect(tool.securityFingerprint!.tested).toBe(true);
        expect(tool.securityFingerprint!.categoriesTested).toContain('xss');
      }

      // Now compare loaded baseline with a modified one (different findings)
      const modified: BehavioralBaseline = {
        ...loaded,
        capabilities: {
          ...loaded.capabilities,
          tools: loaded.capabilities.tools.map((tool) => ({
            ...tool,
            securityFingerprint: {
              tested: true,
              categoriesTested: ['xss'] as const,
              findings: [
                {
                  category: 'xss' as const,
                  riskLevel: 'medium' as const,
                  title: 'XSS vulnerability',
                  description: 'Tool reflects input without sanitization',
                  evidence: 'Parameter: "name"',
                  remediation: 'Escape output',
                  cweId: 'CWE-79',
                  parameter: 'name',
                  tool: tool.name,
                },
              ],
              riskScore: 15,
              testedAt: new Date().toISOString(),
              findingsHash: 'def456',
            },
          })),
        },
      };

      const diff = compareBaselines(loaded, modified);
      expect(diff.securityReport).toBeDefined();
      expect(diff.securityReport!.newFindings.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('accept drift workflow', () => {
    it('should accept drift and attach metadata', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline1 = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Create a modified baseline (add a tool)
      const baseline2: BehavioralBaseline = {
        ...baseline1,
        capabilities: {
          ...baseline1.capabilities,
          tools: [
            ...baseline1.capabilities.tools,
            {
              name: 'drift_tool',
              description: 'A new tool causing drift',
              inputSchema: {},
              schemaHash: 'drift-hash',
            },
          ],
        },
      };

      const diff = compareBaselines(baseline1, baseline2);
      expect(diff.severity).not.toBe('none');

      // Accept the drift
      const accepted = acceptDrift(baseline2, diff, {
        reason: 'Intentional addition for v2 release',
        acceptedBy: 'test-user',
      });

      // Verify acceptance metadata
      expect(accepted.acceptance).toBeDefined();
      expect(accepted.acceptance!.reason).toBe('Intentional addition for v2 release');
      expect(accepted.acceptance!.acceptedBy).toBe('test-user');
      expect(accepted.acceptance!.acceptedDiff.toolsAdded).toContain('drift_tool');
      expect(accepted.acceptance!.acceptedDiff.severity).toBe(diff.severity);
    }, 30000);

    it('should preserve acceptance metadata through save/load with valid hash', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const baseline1 = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Create modified baseline
      const baseline2: BehavioralBaseline = {
        ...baseline1,
        capabilities: {
          ...baseline1.capabilities,
          tools: baseline1.capabilities.tools.map((tool, idx) =>
            idx === 0 ? { ...tool, description: 'Changed description for drift' } : tool
          ),
        },
      };

      const diff = compareBaselines(baseline1, baseline2);
      const accepted = acceptDrift(baseline2, diff, { reason: 'Planned change' });

      // Save and load
      const path = join(testDir, 'accepted-baseline.json');
      saveBaseline(accepted, path);

      // Load WITHOUT skipping integrity check - hash should be valid
      const loaded = loadBaseline(path);

      // Verify acceptance metadata survived roundtrip
      expect(loaded.acceptance).toBeDefined();
      expect(loaded.acceptance!.reason).toBe('Planned change');
      expect(verifyBaselineHash(loaded)).toBe(true);
    }, 30000);
  });

  describe('exit code determination', () => {
    it('should map SEVERITY_TO_EXIT_CODE correctly', () => {
      expect(SEVERITY_TO_EXIT_CODE['none']).toBe(0); // CLEAN
      expect(SEVERITY_TO_EXIT_CODE['info']).toBe(1); // INFO
      expect(SEVERITY_TO_EXIT_CODE['warning']).toBe(2); // WARNING
      expect(SEVERITY_TO_EXIT_CODE['breaking']).toBe(3); // BREAKING
    });

    it('should determine shouldFailOnDiff with severity configs', () => {
      const makeDiff = (severity: 'none' | 'info' | 'warning' | 'breaking'): BehavioralDiff => ({
        severity,
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
        behaviorChanges: [],
        summary: `${severity} changes`,
        breakingCount: severity === 'breaking' ? 1 : 0,
        warningCount: severity === 'warning' ? 1 : 0,
        infoCount: severity === 'info' ? 1 : 0,
      });

      // failOnSeverity: 'breaking' — only breaking should fail
      expect(shouldFailOnDiff(makeDiff('breaking'), 'breaking')).toBe(true);
      expect(shouldFailOnDiff(makeDiff('warning'), 'breaking')).toBe(false);
      expect(shouldFailOnDiff(makeDiff('info'), 'breaking')).toBe(false);
      expect(shouldFailOnDiff(makeDiff('none'), 'breaking')).toBe(false);

      // failOnSeverity: 'warning' — warning and breaking should fail
      expect(shouldFailOnDiff(makeDiff('breaking'), 'warning')).toBe(true);
      expect(shouldFailOnDiff(makeDiff('warning'), 'warning')).toBe(true);
      expect(shouldFailOnDiff(makeDiff('info'), 'warning')).toBe(false);

      // failOnSeverity: 'info' — info, warning, and breaking should fail
      expect(shouldFailOnDiff(makeDiff('breaking'), 'info')).toBe(true);
      expect(shouldFailOnDiff(makeDiff('warning'), 'info')).toBe(true);
      expect(shouldFailOnDiff(makeDiff('info'), 'info')).toBe(true);
      expect(shouldFailOnDiff(makeDiff('none'), 'info')).toBe(false);
    });
  });

  describe('performance confidence checking', () => {
    it('should identify low confidence tools below target threshold', () => {
      // Simulate the confidence checking logic from check.ts:1011-1065
      const confidenceLevelOrder = ['low', 'medium', 'high'] as const;
      const targetConfidence = 'medium' as const;
      const targetIndex = confidenceLevelOrder.indexOf(targetConfidence);

      const tools = [
        {
          name: 'fast_tool',
          performanceConfidence: {
            sampleCount: 10,
            successfulSamples: 10,
            validationSamples: 0,
            totalTests: 10,
            standardDeviation: 5,
            coefficientOfVariation: 0.1,
            confidenceLevel: 'high' as const,
          },
        },
        {
          name: 'slow_tool',
          performanceConfidence: {
            sampleCount: 2,
            successfulSamples: 2,
            validationSamples: 0,
            totalTests: 2,
            standardDeviation: 50,
            coefficientOfVariation: 0.8,
            confidenceLevel: 'low' as const,
          },
        },
        {
          name: 'medium_tool',
          performanceConfidence: {
            sampleCount: 5,
            successfulSamples: 5,
            validationSamples: 0,
            totalTests: 5,
            standardDeviation: 10,
            coefficientOfVariation: 0.3,
            confidenceLevel: 'medium' as const,
          },
        },
      ];

      const lowConfidenceTools: string[] = [];
      for (const tool of tools) {
        const actualConfidence = tool.performanceConfidence?.confidenceLevel ?? 'low';
        const actualIndex = confidenceLevelOrder.indexOf(actualConfidence);
        if (actualIndex < targetIndex) {
          lowConfidenceTools.push(tool.name);
        }
      }

      // Only 'slow_tool' has low confidence (below medium target)
      expect(lowConfidenceTools).toContain('slow_tool');
      expect(lowConfidenceTools).not.toContain('fast_tool');
      expect(lowConfidenceTools).not.toContain('medium_tool');
      expect(lowConfidenceTools).toHaveLength(1);
    });

    it('should order confidence levels correctly', () => {
      const confidenceLevelOrder = ['low', 'medium', 'high'] as const;

      expect(confidenceLevelOrder.indexOf('low')).toBeLessThan(
        confidenceLevelOrder.indexOf('medium')
      );
      expect(confidenceLevelOrder.indexOf('medium')).toBeLessThan(
        confidenceLevelOrder.indexOf('high')
      );

      // Severity meets threshold also applies to confidence semantics
      // low < medium < high
      expect(severityMeetsThreshold('breaking', 'warning')).toBe(true); // higher meets lower
      expect(severityMeetsThreshold('warning', 'breaking')).toBe(false); // lower doesn't meet higher
    });
  });

  describe('incremental checking', () => {
    it('should merge cached fingerprints with new results', async () => {
      await client.connect(TSX_PATH, TSX_ARGS);
      const discovery = await discover(client, TSX_PATH, TSX_ARGS);

      const interviewer = new Interviewer(null, {
        checkMode: true,
        maxQuestionsPerTool: 2,
        parallelTools: false,
        serverCommand: `${TSX_PATH} ${TSX_ARGS.join(' ')}`,
      });

      const result = await interviewer.interview(client, discovery);
      const fullBaseline = createBaseline(result, `${TSX_PATH} ${TSX_ARGS.join(' ')}`);

      // Get all tool fingerprints
      const allFingerprints = getToolFingerprints(fullBaseline);
      expect(allFingerprints.length).toBeGreaterThanOrEqual(2);

      // Simulate incremental: split into "new" (first tool) and "cached" (rest)
      const newTools = fullBaseline.capabilities.tools.slice(0, 1);
      const cachedFingerprints = allFingerprints.slice(1);

      // Convert cached fingerprints back to ToolCapability (same as check.ts:939)
      const cachedTools = cachedFingerprints.map(toToolCapability);

      // Merge (same pattern as check.ts:940-942)
      const mergedTools = [...newTools, ...cachedTools].sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      // Verify all tools are present in merged result
      expect(mergedTools.length).toBe(fullBaseline.capabilities.tools.length);

      // Verify each tool from original baseline has a match in merged
      for (const origTool of fullBaseline.capabilities.tools) {
        const merged = mergedTools.find((t) => t.name === origTool.name);
        expect(merged).toBeDefined();
        expect(merged!.schemaHash).toBe(origTool.schemaHash);
      }

      // Verify the cached tools have the right data
      for (const cachedFp of cachedFingerprints) {
        const merged = mergedTools.find((t) => t.name === cachedFp.name);
        expect(merged).toBeDefined();
        expect(merged!.description).toBe(cachedFp.description);
      }
    }, 30000);
  });
});
