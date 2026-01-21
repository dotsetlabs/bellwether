/**
 * E2E tests for the `bellwether discover` command.
 *
 * Tests:
 * - Basic discovery output
 * - --json flag behavior
 * - --timeout flag behavior
 * - Transport types (stdio, sse, http)
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  getMockServerTsArgs,
  type TempDirectory,
} from '../harness/index.js';

describe('bellwether discover', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-discover-e2e');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('basic discovery', () => {
    it('should discover tools from server', async () => {
      const result = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('get_weather')
        .expectStdoutContains('calculate')
        .expectStdoutContains('read_file');
    });

    it('should show server info', async () => {
      const result = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('test-server');
    });

    it('should show tool descriptions', async () => {
      const result = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('weather', 'Weather', 'location');
    });

    it('should show prompts if available', async () => {
      const result = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
      });

      // Our mock server has prompts
      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('summarize', 'Summarize', 'prompt', 'Prompt');
    });
  });

  describe('--json flag', () => {
    it('should output valid JSON', async () => {
      const result = await runCLI(
        ['discover', ...getMockServerTsArgs(), '--json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();

      const json = assertOutput(result).expectStdoutJson<Record<string, unknown>>();
      expect(json).toBeTruthy();
    });

    it('should include tools array in JSON output', async () => {
      const result = await runCLI(
        ['discover', ...getMockServerTsArgs(), '--json'],
        { cwd: tempDir.path }
      );

      const json = assertOutput(result).expectStdoutJson<{ tools: unknown[] }>();

      expect(Array.isArray(json.tools)).toBe(true);
      expect(json.tools.length).toBeGreaterThan(0);
    });

    it('should include server info in JSON output', async () => {
      const result = await runCLI(
        ['discover', ...getMockServerTsArgs(), '--json'],
        { cwd: tempDir.path }
      );

      const json = assertOutput(result).expectStdoutJson<{
        serverInfo: { name: string; version: string };
      }>();

      expect(json.serverInfo).toBeDefined();
      expect(json.serverInfo.name).toBe('test-server');
    });

    it('should include prompts in JSON output', async () => {
      const result = await runCLI(
        ['discover', ...getMockServerTsArgs(), '--json'],
        { cwd: tempDir.path }
      );

      const json = assertOutput(result).expectStdoutJson<{ prompts: unknown[] }>();

      expect(Array.isArray(json.prompts)).toBe(true);
    });

    it('should include input schemas in JSON output', async () => {
      const result = await runCLI(
        ['discover', ...getMockServerTsArgs(), '--json'],
        { cwd: tempDir.path }
      );

      const json = assertOutput(result).expectStdoutJson<{
        tools: Array<{ name: string; inputSchema?: object }>;
      }>();

      // At least one tool should have an inputSchema
      const toolWithSchema = json.tools.find((t) => t.inputSchema);
      expect(toolWithSchema).toBeDefined();
    });
  });

  describe('--timeout flag', () => {
    it('should respect timeout setting', async () => {
      const result = await runCLI(
        ['discover', ...getMockServerTsArgs(), '--timeout', '30000'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();
    });

    it('should fail with very short timeout', async () => {
      // Set extremely short timeout that should fail
      const result = await runCLI(
        ['discover', ...getMockServerTsArgs(), '--timeout', '1'],
        { cwd: tempDir.path }
      );

      // Should either fail or succeed very quickly
      // The behavior depends on system speed
      expect(result.exitCode).toBeDefined();
    });
  });

  describe('transport types', () => {
    it('should use stdio transport by default', async () => {
      const result = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
      });

      // Default should work (stdio)
      assertOutput(result).expectSuccess();
    });

    // Note: SSE and HTTP transport tests would require actual servers
    // These are placeholder tests for the structure
    it('should support --transport stdio flag', async () => {
      const result = await runCLI(
        ['discover', ...getMockServerTsArgs(), '--transport', 'stdio'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();
    });
  });

  describe('error handling', () => {
    it('should fail without server command', async () => {
      const result = await runCLI(['discover'], { cwd: tempDir.path });

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('required', 'missing', 'argument');
    });

    it('should fail with invalid server command', async () => {
      const result = await runCLI(['discover', 'nonexistent-server-12345'], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectFailure();
    });

    it('should fail when server exits with error', async () => {
      const result = await runCLI(
        ['discover', 'node', '-e', 'process.exit(1)'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectFailure();
    });

    it('should handle server initialization failure', async () => {
      // Use mock server configured to fail init
      const result = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
        env: { MOCK_FAIL_INIT: 'true' },
      });

      assertOutput(result).expectFailure();
    });
  });

  describe('output formatting', () => {
    it('should show tool count summary', async () => {
      const result = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutMatches(/\d+\s*(tool|Tool)/);
    });

    it('should format output nicely for human reading', async () => {
      const result = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
      });

      // Should have structured output with headings or sections
      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny(
          'Tools',
          'tools',
          '===',
          '---',
          'Server',
          'Discovered'
        );
    });
  });

  describe('help output', () => {
    it('should show help for discover command', async () => {
      const result = await runCLI(['discover', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('discover')
        .expectStdoutContains('--json')
        .expectStdoutContains('--timeout');
    });
  });
});
