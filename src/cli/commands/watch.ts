/**
 * Watch command - watch for file changes and auto-test.
 *
 * Uses bellwether.yaml for all test configuration.
 * Only watch-specific options are available as flags.
 */

import { Command } from 'commander';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { createLLMClient, type LLMClient } from '../../llm/index.js';
import { Interviewer } from '../../interview/interviewer.js';
import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../config/loader.js';
import { validateConfigForTest } from '../../config/validator.js';
import type { InterviewProgress } from '../../interview/interviewer.js';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  compareBaselines,
  formatDiffText,
} from '../../baseline/index.js';
import { parsePersonas } from '../../persona/builtins.js';
import * as output from '../output.js';

export const watchCommand = new Command('watch')
  .description('Watch for file changes and auto-test (uses bellwether.yaml)')
  .argument('[server-command]', 'Server command (overrides config)')
  .argument('[args...]', 'Server arguments')
  .option('-c, --config <path>', 'Path to config file')
  .option('-w, --watch-path <path>', 'Path to watch for changes', '.')
  .option('-i, --interval <ms>', 'Polling interval in milliseconds', '5000')
  .option('--baseline <path>', 'Baseline file path', 'bellwether-baseline.json')
  .option('--on-change <command>', 'Command to run after detecting drift')
  .option('--debug', 'Show debug output for file scanning')
  .action(async (serverCommandArg: string | undefined, serverArgs: string[], options) => {
    // Load configuration (required)
    let config: BellwetherConfig;
    try {
      config = loadConfig(options.config);
    } catch (error) {
      if (error instanceof ConfigNotFoundError) {
        output.error(error.message);
        process.exit(1);
      }
      throw error;
    }

    // Determine server command (CLI arg overrides config)
    const serverCommand = serverCommandArg || config.server.command;
    const args = serverArgs.length > 0 ? serverArgs : config.server.args;

    // Validate config for running tests
    try {
      validateConfigForTest(config, serverCommand);
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    const watchPath = resolve(options.watchPath);
    const interval = parseInt(options.interval, 10);
    const baselinePath = resolve(options.baseline);

    // Extract settings from config
    const isStructuralMode = config.mode === 'structural';
    const timeout = config.server.timeout;
    const maxQuestions = config.test.maxQuestionsPerTool;
    const selectedPersonas = parsePersonas(config.test.personas);

    output.info('Bellwether Watch Mode\n');
    output.info(`Server: ${serverCommand} ${args.join(' ')}`);
    output.info(`Mode: ${isStructuralMode ? 'structural' : 'full'}`);
    output.info(`Watching: ${watchPath}`);
    output.info(`Baseline: ${baselinePath}`);
    output.info(`Poll interval: ${interval}ms`);
    output.info('');

    // Initialize LLM client (only for full mode)
    let llmClient: LLMClient;

    if (!isStructuralMode) {
      try {
        llmClient = createLLMClient({
          provider: config.llm.provider,
          model: config.llm.model || undefined,
          baseUrl: config.llm.provider === 'ollama' ? config.llm.ollama.baseUrl : undefined,
        });
      } catch (error) {
        output.error('Failed to initialize LLM client: ' + (error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    } else {
      // For structural mode, create a minimal LLM client that won't be used
      llmClient = createLLMClient({
        provider: 'ollama',
        model: 'llama3.2', // Default model; not actually used in structural mode
        baseUrl: 'http://localhost:11434',
      });
    }

    // Track last baseline hash to detect changes
    let lastBaselineHash: string | null = null;
    if (existsSync(baselinePath)) {
      const baseline = loadBaseline(baselinePath);
      lastBaselineHash = baseline.integrityHash;
      output.info(`Loaded existing baseline: ${lastBaselineHash.slice(0, 8)}`);
    }

    // Track watched file modification times
    const fileModTimes = new Map<string, number>();

    async function runTest(): Promise<void> {
      const mcpClient = new MCPClient({ timeout });

      try {
        output.info('\n--- Running Test ---');
        output.info(`[${new Date().toLocaleTimeString()}] Starting test...`);

        await mcpClient.connect(serverCommand, args, config.server.env);
        const discovery = await discover(mcpClient, serverCommand, args);
        output.info(`Found ${discovery.tools.length} tools`);

        if (discovery.tools.length === 0) {
          output.info('No tools found. Skipping.');
          await mcpClient.disconnect();
          return;
        }

        const fullServerCommand = `${serverCommand} ${args.join(' ')}`.trim();
        const interviewer = new Interviewer(llmClient, {
          maxQuestionsPerTool: maxQuestions,
          timeout,
          skipErrorTests: config.test.skipErrorTests,
          model: config.llm.model || 'default',
          personas: selectedPersonas,
          structuralOnly: isStructuralMode,
          serverCommand: fullServerCommand,
        });

        const progressCallback = (progress: InterviewProgress) => {
          const totalTools = progress.totalTools * progress.totalPersonas;
          const toolsDone = (progress.personasCompleted * progress.totalTools) + progress.toolsCompleted;
          process.stdout.write(`\rTesting: ${toolsDone}/${totalTools} tools`.padEnd(60));
        };

        const result = await interviewer.interview(mcpClient, discovery, progressCallback);
        output.info('\n');

        // Create and compare baseline
        const mode = isStructuralMode ? 'structural' : 'full';
        const newBaseline = createBaseline(result, fullServerCommand, mode);

        if (lastBaselineHash && existsSync(baselinePath)) {
          const previousBaseline = loadBaseline(baselinePath);
          const diff = compareBaselines(previousBaseline, newBaseline, {});

          if (diff.severity !== 'none') {
            output.info('\n--- Behavioral Drift Detected ---');
            output.info(formatDiffText(diff));

            // Run on-change command if specified
            if (options.onChange) {
              output.info(`\nRunning: ${options.onChange}`);
              const { spawnSync } = await import('child_process');
              try {
                // Parse command safely - split on spaces but respect quoted strings
                const parts = options.onChange.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
                const cmd = parts[0];
                const cmdArgs = parts.slice(1).map((arg: string) => arg.replace(/^"|"$/g, ''));
                // Use spawnSync without shell to prevent command injection
                const cmdResult = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
                if (cmdResult.error) {
                  throw cmdResult.error;
                }
                if (cmdResult.status !== 0) {
                  output.error(`On-change command exited with code ${cmdResult.status}`);
                }
              } catch (e) {
                output.error('On-change command failed: ' + (e instanceof Error ? e.message : String(e)));
              }
            }
          } else {
            output.info('No drift detected.');
          }
        }

        // Save new baseline
        saveBaseline(newBaseline, baselinePath);
        lastBaselineHash = newBaseline.integrityHash;
        output.info(`Baseline updated: ${newBaseline.integrityHash.slice(0, 8)}`);

      } catch (error) {
        output.error('Test failed: ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        await mcpClient.disconnect();
      }
    }

    function checkForChanges(): boolean {
      // Simple file watcher - check if any source files changed
      const extensions = ['.ts', '.js', '.json', '.py', '.go'];
      let changed = false;

      function walkDir(dir: string): void {
        try {
          const entries = readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            // Skip common directories
            if (entry.isDirectory()) {
              if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
                continue;
              }
              walkDir(fullPath);
            } else if (entry.isFile()) {
              if (extensions.some(ext => entry.name.endsWith(ext))) {
                const stat = statSync(fullPath);
                const modTime = stat.mtimeMs;
                const lastMod = fileModTimes.get(fullPath);

                if (lastMod === undefined) {
                  fileModTimes.set(fullPath, modTime);
                } else if (modTime > lastMod) {
                  fileModTimes.set(fullPath, modTime);
                  output.info(`\nFile changed: ${fullPath}`);
                  changed = true;
                }
              }
            }
          }
        } catch (error) {
          if (options.debug) {
            output.error(`Warning: Error scanning ${dir}: ` + (error instanceof Error ? error.message : String(error)));
          }
        }
      }

      walkDir(watchPath);
      return changed;
    }

    // Initial test run
    await runTest();

    output.info('\nWatching for changes... (Press Ctrl+C to exit)\n');

    // Track current interval for proper cleanup
    let currentInterval: NodeJS.Timeout | null = null;
    let isRunningInterview = false;

    /**
     * Poll for file changes and run test when changes detected.
     */
    async function pollForChanges(): Promise<void> {
      if (isRunningInterview) {
        return;
      }

      try {
        if (checkForChanges()) {
          isRunningInterview = true;
          await runTest();
          output.info('\nWatching for changes... (Press Ctrl+C to exit)\n');
        }
      } catch (error) {
        output.error('Watch polling error: ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        isRunningInterview = false;
      }
    }

    // Start polling interval
    currentInterval = setInterval(() => {
      pollForChanges().catch((error) => {
        output.error('Unexpected polling error: ' + (error instanceof Error ? error.message : String(error)));
      });
    }, interval);

    // Handle exit
    const cleanup = (): void => {
      output.info('\n\nExiting watch mode.');
      if (currentInterval) {
        clearInterval(currentInterval);
        currentInterval = null;
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
