/**
 * E2E tests for the `bellwether baseline show` command.
 *
 * Tests:
 * - Display baseline contents
 * - --json output
 * - --tools filter
 * - --assertions filter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  generateTestConfig,
  type TempDirectory,
} from '../../harness/index.js';

describe('bellwether baseline show', () => {
  let tempDir: TempDirectory;

  beforeEach(async () => {
    tempDir = createTempDirectory('bellwether-baseline-show-e2e');
    tempDir.writeConfig(generateTestConfig());

    // Create a baseline to show
    await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('basic display', () => {
    it('should display baseline contents', async () => {
      const result = await runCLI(['baseline', 'show'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('test-server');
    });

    it('should show tool names', async () => {
      const result = await runCLI(['baseline', 'show'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('get_weather')
        .expectStdoutContains('calculate')
        .expectStdoutContains('read_file');
    });

    it('should show version information', async () => {
      const result = await runCLI(['baseline', 'show'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutMatches(/version|Version|v\d/i);
    });

    it('should accept explicit baseline path', async () => {
      const result = await runCLI(
        ['baseline', 'show', 'bellwether-baseline.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result).expectSuccess();
    });
  });

  describe('--json output', () => {
    it('should output valid JSON with --json', async () => {
      const result = await runCLI(['baseline', 'show', '--json'], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectSuccess();

      const json = assertOutput(result).expectStdoutJson<{
        version: string;
        tools: unknown[];
      }>();

      expect(json.version).toBeDefined();
      expect(Array.isArray(json.tools)).toBe(true);
    });

    it('should include full baseline data in JSON', async () => {
      const result = await runCLI(['baseline', 'show', '--json'], {
        cwd: tempDir.path,
      });

      const json = assertOutput(result).expectStdoutJson<{
        server: object;
        tools: Array<{ name: string }>;
        createdAt: string;
      }>();

      expect(json.server).toBeDefined();
      expect(json.tools.length).toBeGreaterThan(0);
    });
  });

  describe('--tools filter', () => {
    it('should show only tools with --tools flag', async () => {
      const result = await runCLI(['baseline', 'show', '--tools'], {
        cwd: tempDir.path,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('get_weather');
    });

    it('should focus output on tool information', async () => {
      const result = await runCLI(['baseline', 'show', '--tools'], {
        cwd: tempDir.path,
      });

      // Should show tool details
      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('tool', 'Tool', 'name', 'Name');
    });
  });

  describe('--assertions filter', () => {
    it('should show assertions with --assertions flag', async () => {
      const result = await runCLI(['baseline', 'show', '--assertions'], {
        cwd: tempDir.path,
      });

      // May or may not have assertions depending on baseline content
      assertOutput(result).expectSuccess();
    });
  });

  describe('error handling', () => {
    it('should fail when no baseline exists', async () => {
      tempDir.cleanup();
      tempDir = createTempDirectory('bellwether-baseline-show-no-baseline');
      tempDir.writeConfig(generateTestConfig());

      const result = await runCLI(['baseline', 'show'], { cwd: tempDir.path });

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('not found', 'does not exist', 'No baseline');
    });

    it('should fail with invalid baseline path', async () => {
      const result = await runCLI(
        ['baseline', 'show', 'nonexistent-baseline.json'],
        { cwd: tempDir.path }
      );

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('not found', 'ENOENT', 'does not exist');
    });
  });

  describe('help output', () => {
    it('should show help for baseline show command', async () => {
      const result = await runCLI(['baseline', 'show', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('show')
        .expectStdoutContains('--json')
        .expectStdoutContains('--tools');
    });
  });
});
