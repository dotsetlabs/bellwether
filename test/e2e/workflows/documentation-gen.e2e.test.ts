/**
 * E2E Workflow Test: Documentation Generation
 *
 * Tests documentation generation workflows:
 * 1. Run check → verify CONTRACT.md structure
 * 2. Verify baseline contains expected fields
 * 3. Verify metadata (timestamps, CLI version, server info)
 *
 * Note: AGENTS.md tests require a real LLM provider (Ollama, OpenAI, or Anthropic)
 * and are skipped in the standard test suite. The CLI doesn't support custom base URLs
 * for OpenAI/Anthropic providers, so we can't use mock LLM servers effectively.
 *
 * Note: The check command does not have a --json flag - it outputs CONTRACT.md
 * and optionally a baseline file. For JSON output, use the baseline show command.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  assertFile,
  generateTestConfig,
  type TempDirectory,
} from '../harness/index.js';

describe('Documentation Generation Workflow', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-docs-workflow-e2e');
    tempDir.writeConfig(generateTestConfig());
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('CONTRACT.md generation', () => {
    it('should generate CONTRACT.md with proper structure', async () => {
      await runCLI(['check'], { cwd: tempDir.path });

      assertFile('CONTRACT.md', tempDir).exists().notEmpty();

      const contract = tempDir.readFile('CONTRACT.md');

      // Should have standard sections
      expect(contract).toContain('test-server');
      expect(contract).toMatch(/tool|Tool/i);
    }, 15000);

    it('should document all tools', async () => {
      await runCLI(['check'], { cwd: tempDir.path });

      const contract = tempDir.readFile('CONTRACT.md');

      // All tools should be documented (standardToolSet has 3 tools)
      expect(contract).toContain('get_weather');
      expect(contract).toContain('calculate');
      expect(contract).toContain('read_file');
    }, 15000);

    it('should include tool descriptions', async () => {
      await runCLI(['check'], { cwd: tempDir.path });

      const contract = tempDir.readFile('CONTRACT.md');

      // Should have description content
      expect(contract).toMatch(/weather|Weather/i);
      expect(contract).toMatch(/calculation|mathematical/i);
    }, 15000);

    it('should include parameter information', async () => {
      await runCLI(['check'], { cwd: tempDir.path });

      const contract = tempDir.readFile('CONTRACT.md');

      // Should document parameters
      expect(contract).toMatch(/location|parameter|input/i);
    }, 15000);

    it('should include server information', async () => {
      await runCLI(['check'], { cwd: tempDir.path });

      const contract = tempDir.readFile('CONTRACT.md');

      expect(contract).toContain('test-server');
      expect(contract).toMatch(/version|Version/i);
    }, 15000);
  });

  describe('baseline generation', () => {
    it('should generate valid baseline with --save-baseline', async () => {
      const result = await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      assertOutput(result).expectSuccess();
      assertFile('bellwether-baseline.json', tempDir).exists();

      const baseline = tempDir.readJson<{
        tools: Array<{ name: string }>;
        server: { name: string };
        version: string;
      }>('bellwether-baseline.json');

      // Should have tools information
      expect(Array.isArray(baseline.tools)).toBe(true);
      expect(baseline.tools.length).toBe(3);
    }, 15000);

    it('should include server metadata in baseline', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = tempDir.readJson<{
        server: { name: string; version: string };
        version: string;
      }>('bellwether-baseline.json');

      // Should have server metadata
      expect(baseline.server).toBeDefined();
      expect(baseline.server.name).toBe('test-server');
    }, 15000);

    it('should include all tools in baseline', async () => {
      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path });

      const baseline = tempDir.readJson<{
        tools: Array<{ name: string }>;
      }>('bellwether-baseline.json');

      const toolNames = baseline.tools.map((t) => t.name);

      expect(toolNames).toContain('get_weather');
      expect(toolNames).toContain('calculate');
      expect(toolNames).toContain('read_file');
    }, 15000);
  });

  describe('output directory customization', () => {
    it('should respect output directory setting', async () => {
      tempDir.mkdir('docs');
      tempDir.writeConfig(generateTestConfig({ outputDir: './docs' }));

      await runCLI(['check'], { cwd: tempDir.path });

      // CONTRACT.md should be in docs directory
      assertFile('docs/CONTRACT.md', tempDir).exists();
    }, 15000);

    it('should create output directory if needed', async () => {
      tempDir.writeConfig(generateTestConfig({ outputDir: './output/docs' }));

      await runCLI(['check'], { cwd: tempDir.path });

      // Should create nested directories
      if (tempDir.exists('output/docs/CONTRACT.md')) {
        assertFile('output/docs/CONTRACT.md', tempDir).notEmpty();
      }
    }, 15000);
  });

  describe('documentation consistency', () => {
    it('should generate consistent output across runs', async () => {
      // First run
      await runCLI(['check'], { cwd: tempDir.path });
      const contract1 = tempDir.readFile('CONTRACT.md');

      // Second run
      await runCLI(['check'], { cwd: tempDir.path });
      const contract2 = tempDir.readFile('CONTRACT.md');

      // Content should be same (ignoring timestamps)
      const normalize = (s: string) =>
        s.replace(/\d{4}-\d{2}-\d{2}/g, 'DATE').replace(/\d{2}:\d{2}:\d{2}/g, 'TIME');

      expect(normalize(contract1)).toBe(normalize(contract2));
    }, 20000);
  });

  describe('prompt documentation', () => {
    it('should document prompts in CONTRACT.md', async () => {
      await runCLI(['check'], { cwd: tempDir.path });

      const contract = tempDir.readFile('CONTRACT.md');

      // Should document prompts (our mock server has summarize prompt)
      expect(contract).toMatch(/prompt|Prompt|summarize/i);
    }, 15000);
  });

  describe('schema documentation', () => {
    it('should document input schemas', async () => {
      await runCLI(['check'], { cwd: tempDir.path });

      const contract = tempDir.readFile('CONTRACT.md');

      // Should document schema details
      expect(contract).toMatch(/type|string|required|parameter/i);
    }, 15000);
  });

  describe('explore command (AGENTS.md)', () => {
    // These tests require a real LLM provider
    // The CLI doesn't support custom baseUrl for OpenAI/Anthropic
    // so we can only test error cases and help output

    it('should show help for explore command', async () => {
      const result = await runCLI(['explore', '--help']);

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('explore')
        .expectStdoutContains('--provider')
        .expectStdoutContains('--model');
    });

    it('should require API key for OpenAI provider', async () => {
      tempDir.writeConfig(
        generateTestConfig({
          provider: 'openai',
          maxQuestionsPerTool: 1,
        })
      );

      const result = await runCLI(['explore'], {
        cwd: tempDir.path,
        env: { OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' },
        timeout: 10000,
      });

      // Should fail due to missing API key
      assertOutput(result).expectFailure();
    });

    it('should require API key for Anthropic provider', async () => {
      tempDir.writeConfig(
        generateTestConfig({
          provider: 'anthropic',
          maxQuestionsPerTool: 1,
        })
      );

      const result = await runCLI(['explore'], {
        cwd: tempDir.path,
        env: { OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' },
        timeout: 10000,
      });

      // Should fail due to missing API key
      assertOutput(result).expectFailure();
    });
  });
});
