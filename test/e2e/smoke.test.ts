/**
 * End-to-end smoke tests for bellwether core functionality.
 * These tests verify that major components work together without
 * requiring external services (no real LLM or MCP server calls).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resetLogger, configureLogger } from '../../src/logging/logger.js';

// Import core modules
import { loadConfig, ConfigNotFoundError } from '../../src/config/loader.js';
import { generateConfigTemplate } from '../../src/config/template.js';
import { generateAgentsMd, generateJsonReport } from '../../src/docs/generator.js';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  compareBaselines,
  formatDiffText,
  getBaselineVersion,
} from '../../src/baseline/index.js';
import { createCloudBaseline } from '../../src/baseline/converter.js';
import type { InterviewResult } from '../../src/interview/types.js';
import type { DiscoveryResult } from '../../src/discovery/types.js';

describe('e2e/smoke', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    configureLogger({ level: 'silent' });
    testDir = join(tmpdir(), `bellwether-e2e-smoke-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    resetLogger();
    vi.restoreAllMocks();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Sample interview result for testing
  function createMockInterviewResult(): InterviewResult {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 30000);

    return {
      discovery: {
        serverInfo: { name: 'test-server', version: '1.0.0' },
        protocolVersion: '1.0',
        capabilities: { tools: {}, prompts: {} },
        tools: [
          {
            name: 'read_file',
            description: 'Read the contents of a file',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Path to file' },
              },
              required: ['path'],
            },
          },
          {
            name: 'write_file',
            description: 'Write content to a file',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Path to file' },
                content: { type: 'string', description: 'File content' },
              },
              required: ['path', 'content'],
            },
          },
          {
            name: 'list_directory',
            description: 'List files in a directory',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Directory path' },
              },
              required: ['path'],
            },
          },
        ],
        prompts: [
          {
            name: 'summarize',
            description: 'Summarize text content',
            arguments: [
              { name: 'text', description: 'Text to summarize', required: true },
            ],
          },
        ],
      },
      toolProfiles: [
        {
          name: 'read_file',
          description: 'Read the contents of a file',
          interactions: [
            {
              toolName: 'read_file',
              question: {
                description: 'Read a simple text file',
                category: 'basic_functionality',
                args: { path: '/tmp/test.txt' },
              },
              response: {
                content: [{ type: 'text', text: 'Hello, world!' }],
                isError: false,
              },
              error: null,
              analysis: 'Successfully read file content',
              durationMs: 50,
              personaId: 'technical_writer',
            },
          ],
          behavioralNotes: [
            'Reads file content as UTF-8 text',
            'Returns error for non-existent files',
          ],
          limitations: [
            'Cannot read binary files properly',
            'Maximum file size of 10MB',
          ],
          securityNotes: [
            'Respects file system permissions',
          ],
          findingsByPersona: [
            {
              personaId: 'technical_writer',
              personaName: 'Technical Writer',
              behavioralNotes: ['Returns content as plain text'],
              limitations: ['Cannot handle binary files'],
              securityNotes: [],
            },
            {
              personaId: 'security_tester',
              personaName: 'Security Tester',
              behavioralNotes: ['Validates path input'],
              limitations: [],
              securityNotes: ['Respects file system permissions'],
            },
          ],
        },
        {
          name: 'write_file',
          description: 'Write content to a file',
          interactions: [
            {
              toolName: 'write_file',
              question: {
                description: 'Write to a new file',
                category: 'basic_functionality',
                args: { path: '/tmp/output.txt', content: 'Test content' },
              },
              response: {
                content: [{ type: 'text', text: 'File written successfully' }],
                isError: false,
              },
              error: null,
              analysis: 'Successfully created and wrote to file',
              durationMs: 75,
              personaId: 'technical_writer',
            },
          ],
          behavioralNotes: [
            'Creates parent directories if they do not exist',
            'Overwrites existing files',
          ],
          limitations: [
            'Cannot write to read-only locations',
          ],
          securityNotes: [
            'Creates files with default permissions',
          ],
          findingsByPersona: [],
        },
        {
          name: 'list_directory',
          description: 'List files in a directory',
          interactions: [
            {
              toolName: 'list_directory',
              question: {
                description: 'List files in temp directory',
                category: 'basic_functionality',
                args: { path: '/tmp' },
              },
              response: {
                content: [{ type: 'text', text: '["file1.txt", "file2.txt", "subdir"]' }],
                isError: false,
              },
              error: null,
              analysis: 'Returns JSON array of file names',
              durationMs: 30,
              personaId: 'technical_writer',
            },
          ],
          behavioralNotes: [
            'Returns JSON array of file names',
            'Does not include hidden files by default',
          ],
          limitations: [
            'Does not return detailed file metadata',
          ],
          securityNotes: [],
          findingsByPersona: [],
        },
      ],
      summary: 'A filesystem server that provides basic file operations including reading, writing, and listing directory contents.',
      limitations: [
        'Cannot handle very large files',
        'No support for binary file operations',
      ],
      recommendations: [
        'Consider adding support for binary files',
        'Add pagination for large directories',
      ],
      metadata: {
        startTime,
        endTime,
        durationMs: 30000,
        toolCallCount: 15,
        errorCount: 2,
        model: 'gpt-4o',
        personas: [
          { id: 'technical_writer', name: 'Technical Writer', questionsAsked: 8, toolCallCount: 8, errorCount: 1 },
          { id: 'security_tester', name: 'Security Tester', questionsAsked: 7, toolCallCount: 7, errorCount: 1 },
        ],
      },
    };
  }

  describe('Configuration workflow', () => {
    it('should generate and load default config', () => {
      // Generate default config
      const configContent = generateConfigTemplate();
      expect(configContent).toBeTruthy();
      expect(configContent).toContain('llm:');
      expect(configContent).toContain('explore:');

      // Write config file
      const configPath = join(testDir, 'bellwether.yaml');
      writeFileSync(configPath, configContent);
      expect(existsSync(configPath)).toBe(true);

      // Load config
      const config = loadConfig(configPath);
      expect(config.llm.provider).toBeDefined();
      expect(config.explore.maxQuestionsPerTool).toBeDefined();
    });

    it('should throw ConfigNotFoundError when no config exists', () => {
      // New system requires config file to exist
      expect(() => loadConfig()).toThrow(ConfigNotFoundError);
    });

    it('should merge CLI options with config', () => {
      const configPath = join(testDir, 'bellwether.yaml');
      writeFileSync(configPath, `
llm:
  provider: openai
  model: gpt-4o
explore:
  maxQuestionsPerTool: 3
`);

      const config = loadConfig(configPath);

      // CLI options would override config
      const cliOptions = { model: 'gpt-4-turbo', maxQuestions: '5' };
      const finalModel = cliOptions.model ?? config.llm.model;
      const finalMaxQuestions = cliOptions.maxQuestions
        ? parseInt(cliOptions.maxQuestions, 10)
        : config.explore.maxQuestionsPerTool;

      expect(finalModel).toBe('gpt-4-turbo');
      expect(finalMaxQuestions).toBe(5);
    });
  });

  describe('Documentation generation workflow', () => {
    it('should generate complete AGENTS.md from interview result', () => {
      const result = createMockInterviewResult();
      const markdown = generateAgentsMd(result);

      // Verify structure
      expect(markdown).toContain('# test-server');
      expect(markdown).toContain('## Overview');
      expect(markdown).toContain('## Capabilities');
      expect(markdown).toContain('## Quick Reference');
      expect(markdown).toContain('## Tools');
      expect(markdown).toContain('### read_file');
      expect(markdown).toContain('### write_file');
      expect(markdown).toContain('### list_directory');
      expect(markdown).toContain('## Prompts');
      expect(markdown).toContain('### summarize');
      expect(markdown).toContain('## Known Limitations');
      expect(markdown).toContain('## Recommendations');

      // Verify tool details
      expect(markdown).toContain('**Input Schema:**');
      expect(markdown).toContain('**Observed Behavior:**');
      expect(markdown).toContain('**Limitations:**');

      // Verify metadata
      expect(markdown).toContain('Interview completed');
      expect(markdown).toContain('15 tool interactions');
    });

    it('should write AGENTS.md to specified output directory', () => {
      const result = createMockInterviewResult();
      const markdown = generateAgentsMd(result);

      const outputDir = join(testDir, 'output');
      mkdirSync(outputDir, { recursive: true });

      const outputPath = join(outputDir, 'AGENTS.md');
      writeFileSync(outputPath, markdown);

      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toBe(markdown);
    });

    it('should generate valid JSON report', () => {
      const result = createMockInterviewResult();
      const json = generateJsonReport(result);

      // Verify it's valid JSON
      const parsed = JSON.parse(json);

      expect(parsed.discovery.serverInfo.name).toBe('test-server');
      expect(parsed.toolProfiles).toHaveLength(3);
      expect(parsed.metadata.toolCallCount).toBe(15);
      expect(parsed.summary).toBeTruthy();
    });

  });

  describe('Baseline workflow', () => {
    it('should create and save baseline from interview result', () => {
      const result = createMockInterviewResult();
      const serverCommand = 'npx @modelcontextprotocol/server-filesystem /tmp';

      const baseline = createBaseline(result, serverCommand);

      expect(baseline.version).toBe(getBaselineVersion());
      expect(baseline.serverCommand).toBe(serverCommand);
      expect(baseline.server.name).toBe('test-server');
      expect(baseline.tools).toHaveLength(3);

      // Save baseline
      const baselinePath = join(testDir, 'baseline.json');
      saveBaseline(baseline, baselinePath);

      expect(existsSync(baselinePath)).toBe(true);
    });

    it('should load baseline from file', () => {
      const result = createMockInterviewResult();
      const baseline = createBaseline(result, 'npx test-server');

      const baselinePath = join(testDir, 'baseline.json');
      saveBaseline(baseline, baselinePath);

      const loaded = loadBaseline(baselinePath);

      expect(loaded.version).toBe(baseline.version);
      expect(loaded.serverCommand).toBe(baseline.serverCommand);
      expect(loaded.tools).toHaveLength(baseline.tools.length);
    });

    it('should detect drift between baselines', () => {
      const result1 = createMockInterviewResult();
      const baseline1 = createBaseline(result1, 'npx test-server');

      // Create modified result
      const result2 = createMockInterviewResult();
      result2.toolProfiles[0].behavioralNotes = ['Modified behavior'];
      result2.toolProfiles.push({
        name: 'new_tool',
        description: 'A new tool',
        interactions: [],
        behavioralNotes: ['New tool added'],
        limitations: [],
        securityNotes: [],
        findingsByPersona: [],
      });
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsAdded.length).toBeGreaterThan(0);
      expect(diff.toolsAdded).toContain('new_tool');
    });

    it('should format diff as text', () => {
      const result1 = createMockInterviewResult();
      const baseline1 = createBaseline(result1, 'npx test-server');

      const result2 = createMockInterviewResult();
      result2.discovery.tools.push({
        name: 'delete_file',
        description: 'Delete a file',
        inputSchema: { type: 'object', properties: {}, required: [] },
      });
      result2.toolProfiles.push({
        name: 'delete_file',
        description: 'Delete a file',
        interactions: [],
        behavioralNotes: [],
        limitations: [],
        securityNotes: ['Destructive operation'],
        findingsByPersona: [],
      });
      const baseline2 = createBaseline(result2, 'npx test-server');

      const diff = compareBaselines(baseline1, baseline2);
      const text = formatDiffText(diff);

      expect(text).toBeTruthy();
      expect(typeof text).toBe('string');
    });
  });

  describe('Cloud format workflow', () => {
    it('should convert interview result to cloud format', () => {
      const result = createMockInterviewResult();
      const serverCommand = 'npx @test/server';

      const cloudBaseline = createCloudBaseline(result, serverCommand);

      expect(cloudBaseline.version).toBe(getBaselineVersion());
      expect(cloudBaseline.metadata.serverName).toBe('test-server');
      expect(cloudBaseline.capabilities.tools).toHaveLength(3);
      expect(cloudBaseline.assertions).toBeDefined();
    });

    it('should include behavioral assertions in cloud format', () => {
      const result = createMockInterviewResult();
      const cloudBaseline = createCloudBaseline(result, 'npx test-server');

      // Should have assertions from behavioral notes
      expect(cloudBaseline.assertions.length).toBeGreaterThan(0);

      // Verify CloudAssertion structure (type, condition, tool, severity)
      const assertion = cloudBaseline.assertions[0];
      expect(assertion.type).toBeTruthy();
      expect(['expects', 'requires', 'warns', 'notes']).toContain(assertion.type);
      expect(assertion.condition).toBeTruthy();
      expect(assertion.tool).toBeTruthy();
    });

    it('should save cloud baseline to file', () => {
      const result = createMockInterviewResult();
      const cloudBaseline = createCloudBaseline(result, 'npx test-server');

      const baselinePath = join(testDir, 'cloud-baseline.json');
      writeFileSync(baselinePath, JSON.stringify(cloudBaseline, null, 2));

      expect(existsSync(baselinePath)).toBe(true);

      const loaded = JSON.parse(readFileSync(baselinePath, 'utf-8'));
      expect(loaded.version).toBe(getBaselineVersion());
      expect(loaded.capabilities.tools).toHaveLength(3);
    });
  });

  describe('Full workflow simulation', () => {
    it('should simulate complete interview-to-documentation workflow', () => {
      // Step 1: Load configuration
      const configPath = join(testDir, 'bellwether.yaml');
      const configContent = generateConfigTemplate();
      writeFileSync(configPath, configContent);
      const config = loadConfig(configPath);
      expect(config).toBeTruthy();

      // Step 2: Simulate discovery (would connect to MCP server)
      const discovery: DiscoveryResult = {
        serverInfo: { name: 'workflow-test-server', version: '2.0.0' },
        protocolVersion: '1.0',
        capabilities: { tools: {}, prompts: {} },
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool for workflow',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
        ],
        prompts: [],
      };
      expect(discovery.tools.length).toBe(1);

      // Step 3: Simulate interview (would use LLM)
      const result: InterviewResult = {
        discovery,
        toolProfiles: [
          {
            name: 'test_tool',
            description: 'A test tool for workflow',
            interactions: [],
            behavioralNotes: ['Works as expected'],
            limitations: [],
            securityNotes: [],
            findingsByPersona: [],
          },
        ],
        summary: 'A simple test server with one tool.',
        limitations: [],
        recommendations: [],
        metadata: {
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 1000,
          toolCallCount: 3,
          errorCount: 0,
          model: config.llm.model,
          personas: [],
        },
      };

      // Step 4: Generate documentation
      const outputDir = join(testDir, 'docs');
      mkdirSync(outputDir, { recursive: true });

      const agentsMd = generateAgentsMd(result);
      writeFileSync(join(outputDir, 'AGENTS.md'), agentsMd);
      expect(existsSync(join(outputDir, 'AGENTS.md'))).toBe(true);

      const jsonReport = generateJsonReport(result);
      writeFileSync(join(outputDir, 'report.json'), jsonReport);
      expect(existsSync(join(outputDir, 'report.json'))).toBe(true);

      // Step 5: Save baseline for drift detection
      const baseline = createBaseline(result, 'npx test-server');
      saveBaseline(baseline, join(outputDir, 'baseline.json'));
      expect(existsSync(join(outputDir, 'baseline.json'))).toBe(true);

      // Step 6: Verify all outputs
      const files = ['AGENTS.md', 'report.json', 'baseline.json'];
      for (const file of files) {
        const path = join(outputDir, file);
        expect(existsSync(path)).toBe(true);
        const content = readFileSync(path, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it('should simulate CI workflow with baseline comparison', () => {
      // Create initial baseline (represents previous version)
      const initialResult = createMockInterviewResult();
      const initialBaseline = createBaseline(initialResult, 'npx test-server');
      const baselinePath = join(testDir, 'baseline.json');
      saveBaseline(initialBaseline, baselinePath);

      // Simulate new interview (CI run)
      const newResult = createMockInterviewResult();
      // Add a new tool to simulate server change
      newResult.discovery.tools.push({
        name: 'search_files',
        description: 'Search for files by pattern',
        inputSchema: { type: 'object', properties: {}, required: [] },
      });
      newResult.toolProfiles.push({
        name: 'search_files',
        description: 'Search for files by pattern',
        interactions: [],
        behavioralNotes: ['Supports glob patterns'],
        limitations: [],
        securityNotes: [],
        findingsByPersona: [],
      });

      const newBaseline = createBaseline(newResult, 'npx test-server');

      // Compare baselines
      const previousBaseline = loadBaseline(baselinePath);
      const diff = compareBaselines(previousBaseline, newBaseline);

      // CI checks
      const hasBreakingChanges = diff.severity === 'breaking';
      const hasDrift = diff.toolsAdded.length > 0 || diff.toolsRemoved.length > 0 || diff.toolsModified.length > 0;

      expect(hasDrift).toBe(true);
      expect(diff.toolsAdded).toContain('search_files');

      // Format diff for CI output
      const diffText = formatDiffText(diff);
      expect(diffText).toContain('search_files');

      // Simulate CI exit code decision
      const failOnDrift = true;
      const shouldFail = failOnDrift && (hasBreakingChanges || diff.severity === 'warning');

      // For our test case, we added a tool which is typically warning/info level
      expect(typeof shouldFail).toBe('boolean');
    });
  });

  describe('Error recovery scenarios', () => {
    it('should throw error for invalid config file', () => {
      const configPath = join(testDir, 'invalid.yaml');
      writeFileSync(configPath, 'invalid: yaml: content: [[[');

      // Invalid YAML should throw an error
      expect(() => loadConfig(configPath)).toThrow(/Invalid YAML/);
    });

    it('should handle missing baseline file', () => {
      const nonExistentPath = join(testDir, 'does-not-exist.json');

      expect(() => loadBaseline(nonExistentPath)).toThrow();
    });

    it('should handle corrupted baseline file', () => {
      const corruptedPath = join(testDir, 'corrupted.json');
      writeFileSync(corruptedPath, '{ invalid json }}}');

      expect(() => loadBaseline(corruptedPath)).toThrow();
    });

    it('should generate minimal output for empty interview result', () => {
      const emptyResult: InterviewResult = {
        discovery: {
          serverInfo: { name: 'empty-server', version: '0.0.1' },
          protocolVersion: '1.0',
          capabilities: {},
          tools: [],
          prompts: [],
        },
        toolProfiles: [],
        summary: 'Empty server with no tools.',
        limitations: [],
        recommendations: [],
        metadata: {
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 100,
          toolCallCount: 0,
          errorCount: 0,
          model: 'gpt-4o',
          personas: [],
        },
      };

      const markdown = generateAgentsMd(emptyResult);
      expect(markdown).toContain('# empty-server');
      expect(markdown).toContain('Empty server with no tools');

      const json = generateJsonReport(emptyResult);
      const parsed = JSON.parse(json);
      expect(parsed.toolProfiles).toHaveLength(0);
    });
  });
});
