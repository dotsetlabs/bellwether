/**
 * E2E Workflow Test: First-Time User
 *
 * Tests the new user onboarding flow:
 * 1. bellwether init (create config)
 * 2. bellwether discover <mock-server> (explore capabilities)
 * 3. bellwether check (validate server)
 * 4. bellwether baseline save (save baseline)
 * 5. Verify all outputs created successfully
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runCLI,
  createTempDirectory,
  assertOutput,
  assertFile,
  getMockServerTsArgs,
  updateConfigWithMockServer,
  type TempDirectory,
} from '../harness/index.js';

describe('First-Time User Workflow', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = createTempDirectory('bellwether-first-user-e2e');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('complete onboarding flow', () => {
    it('should complete entire first-time user journey', async () => {
      // Step 1: Initialize configuration
      const initResult = await runCLI(['init', '--yes'], { cwd: tempDir.path });
      assertOutput(initResult)
        .expectSuccess()
        .expectStdoutContains('bellwether.yaml');

      assertFile('bellwether.yaml', tempDir).exists();

      // Update config with mock server
      const config = tempDir.readFile('bellwether.yaml');
      tempDir.writeFile('bellwether.yaml', updateConfigWithMockServer(config));

      // Step 2: Discover server capabilities
      const discoverResult = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
        timeout: 15000,
      });
      assertOutput(discoverResult)
        .expectSuccess()
        .expectStdoutContains('test-server')
        .expectStdoutContains('get_weather');

      // Step 3: Run check command
      const checkResult = await runCLI(['check'], { cwd: tempDir.path, timeout: 15000 });
      assertOutput(checkResult).expectSuccess();

      // Step 4: Save baseline
      const baselineResult = await runCLI(['check', '--save-baseline'], {
        cwd: tempDir.path,
        timeout: 15000,
      });
      assertOutput(baselineResult).expectSuccess();

      // Step 5: Verify all outputs
      assertFile('bellwether.yaml', tempDir).exists();
      assertFile('CONTRACT.md', tempDir).exists();
      assertFile('bellwether-baseline.json', tempDir).exists();
    }, 60000);
  });

  describe('discovery step', () => {
    it('should show helpful tool information', async () => {
      const result = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
        timeout: 15000,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('test-server')
        .expectStdoutContainsAny('tool', 'Tool')
        .expectStdoutContains('get_weather')
        .expectStdoutContains('calculate');
    }, 20000);

    it('should show prompts if available', async () => {
      const result = await runCLI(['discover', ...getMockServerTsArgs()], {
        cwd: tempDir.path,
        timeout: 15000,
      });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('prompt', 'Prompt', 'summarize');
    }, 20000);

    it('should provide JSON output for scripting', async () => {
      const result = await runCLI(['discover', ...getMockServerTsArgs(), '--json'], {
        cwd: tempDir.path,
        timeout: 15000,
      });

      const json = assertOutput(result).expectStdoutJson<{
        tools: Array<{ name: string }>;
        serverInfo: { name: string };
      }>();

      expect(json.serverInfo.name).toBe('test-server');
      expect(json.tools.length).toBeGreaterThan(0);
    }, 20000);
  });

  describe('configuration step', () => {
    it('should create valid config with init', async () => {
      await runCLI(['init', '--yes'], { cwd: tempDir.path });

      const config = tempDir.readFile('bellwether.yaml');

      // Should have essential sections
      expect(config).toContain('llm:');
      expect(config).toContain('explore:');
      expect(config).toContain('server:');
    });

    it('should allow preset selection', async () => {
      const result = await runCLI(['init', '--preset', 'local', '--yes'], {
        cwd: tempDir.path,
      });

      assertOutput(result).expectSuccess();

      const config = tempDir.readFile('bellwether.yaml');
      expect(config).toContain('provider: ollama');
    });
  });

  describe('documentation generation', () => {
    it('should generate CONTRACT.md on first check', async () => {
      await runCLI(['init', '--yes'], { cwd: tempDir.path });

      const config = tempDir.readFile('bellwether.yaml');
      tempDir.writeFile('bellwether.yaml', updateConfigWithMockServer(config));

      await runCLI(['check'], { cwd: tempDir.path, timeout: 15000 });

      assertFile('CONTRACT.md', tempDir)
        .exists()
        .notEmpty()
        .contains('test-server');
    }, 25000);

    it('should document all discovered tools', async () => {
      await runCLI(['init', '--yes'], { cwd: tempDir.path });

      const config = tempDir.readFile('bellwether.yaml');
      tempDir.writeFile('bellwether.yaml', updateConfigWithMockServer(config));

      await runCLI(['check'], { cwd: tempDir.path, timeout: 15000 });

      const contract = tempDir.readFile('CONTRACT.md');

      expect(contract).toContain('get_weather');
      expect(contract).toContain('calculate');
      expect(contract).toContain('read_file');
    }, 25000);
  });

  describe('baseline creation', () => {
    it('should create baseline for future comparisons', async () => {
      await runCLI(['init', '--yes'], { cwd: tempDir.path });

      const config = tempDir.readFile('bellwether.yaml');
      tempDir.writeFile('bellwether.yaml', updateConfigWithMockServer(config));

      await runCLI(['check', '--save-baseline'], { cwd: tempDir.path, timeout: 15000 });

      assertFile('bellwether-baseline.json', tempDir).exists();

      const baseline = tempDir.readJson<{
        version: string;
        tools: Array<{ name: string }>;
        server: { name: string };
      }>('bellwether-baseline.json');

      expect(baseline.version).toBeDefined();
      expect(baseline.server.name).toBe('test-server');
      expect(baseline.tools.length).toBe(3);
    }, 25000);
  });

  describe('help and guidance', () => {
    it('should show helpful main help', async () => {
      const result = await runCLI(['--help'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContains('check')
        .expectStdoutContains('explore')
        .expectStdoutContains('discover')
        .expectStdoutContains('init');
    });

    it('should show examples in help', async () => {
      const result = await runCLI(['--help'], { cwd: tempDir.path });

      assertOutput(result)
        .expectSuccess()
        .expectStdoutContainsAny('Example', 'example', '$');
    });

    it('should provide command-specific help', async () => {
      const commands = ['check', 'discover', 'init', 'baseline'];

      for (const cmd of commands) {
        const result = await runCLI([cmd, '--help'], { cwd: tempDir.path });
        assertOutput(result)
          .expectSuccess()
          .expectStdoutContains(cmd);
      }
    });
  });

  describe('error recovery', () => {
    it('should provide helpful error for missing config', async () => {
      // Run check without config
      const result = await runCLI(['check'], { cwd: tempDir.path });

      assertOutput(result)
        .expectFailure()
        .expectStderrContainsAny('config', 'bellwether.yaml', 'init');
    });

    it('should provide helpful error for invalid server', async () => {
      await runCLI(['init', '--yes'], { cwd: tempDir.path });

      const result = await runCLI(['check'], { cwd: tempDir.path, timeout: 15000 });

      // Default config has placeholder server, should fail with helpful message
      assertOutput(result).expectFailure();
    }, 20000);
  });
});
