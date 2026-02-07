/**
 * Watch command - watch for file changes and auto-check.
 *
 * Uses bellwether.yaml for configuration.
 * Only watch-specific options are available as flags.
 *
 * Note: Watch mode only runs schema validation (check mode).
 * For LLM-powered exploration, use 'bellwether explore' directly.
 */

import { Command } from 'commander';
import { existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { Interviewer } from '../../interview/interviewer.js';
import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../config/loader.js';
import { validateConfigForCheck } from '../../config/validator.js';
import type { InterviewProgress } from '../../interview/interviewer.js';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  compareBaselines,
  formatDiffText,
} from '../../baseline/index.js';
import { EXIT_CODES } from '../../constants.js';
import * as output from '../output.js';

export const watchCommand = new Command('watch')
  .description('Watch for file changes and auto-check (uses bellwether.yaml)')
  .argument('[server-command]', 'Server command (overrides config)')
  .argument('[args...]', 'Server arguments')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (serverCommandArg: string | undefined, serverArgs: string[], options) => {
    // Load configuration (required)
    let config: BellwetherConfig;
    try {
      config = loadConfig(options.config);
    } catch (error) {
      if (error instanceof ConfigNotFoundError) {
        output.error(error.message);
        process.exit(EXIT_CODES.ERROR);
      }
      throw error;
    }

    // Determine server command (CLI arg overrides config)
    const serverCommand = serverCommandArg || config.server.command;
    const args = serverArgs.length > 0 ? serverArgs : config.server.args;
    const transport = config.server.transport ?? 'stdio';
    const remoteUrl = config.server.url?.trim();
    const remoteSessionId = config.server.sessionId?.trim();

    // Validate config for check mode (watch only does check, not explore)
    try {
      validateConfigForCheck(config, serverCommand);
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.ERROR);
    }

    // Get watch settings from config
    const watchPath = resolve(config.watch.path);
    const interval = config.watch.interval;
    const extensions = config.watch.extensions;
    const onDriftCommand = config.watch.onDrift;
    const minSamples = config.check.sampling.minSamples;

    // Baseline path for watch mode (use savePath or baseline default)
    const baselinePathValue = config.baseline.savePath ?? config.baseline.path;
    const baselinePath = baselinePathValue.startsWith('/')
      ? baselinePathValue
      : resolve(join(config.output.dir, baselinePathValue));

    // Extract settings from config
    const timeout = config.server.timeout;
    const verbose = config.logging.verbose;

    output.info('Bellwether Watch Mode\n');
    const serverIdentifier =
      transport === 'stdio'
        ? `${serverCommand} ${args.join(' ')}`.trim()
        : (remoteUrl ?? 'unknown');
    output.info(`Server: ${serverIdentifier}`);
    output.info(`Mode: check (schema validation)`);
    output.info(`Watching: ${watchPath}`);
    output.info(`Baseline: ${baselinePath}`);
    output.info(`Poll interval: ${interval}ms`);
    output.info('');
    output.info(
      'Note: Watch mode runs schema validation only. Use "bellwether explore" for LLM analysis.'
    );
    output.info('');

    // Track last baseline hash to detect changes
    let lastBaselineHash: string | null = null;
    if (existsSync(baselinePath)) {
      const baseline = loadBaseline(baselinePath);
      lastBaselineHash = baseline.hash;
      output.info(`Loaded existing baseline: ${lastBaselineHash.slice(0, 8)}`);
    }

    // Track watched file modification times
    const fileModTimes = new Map<string, number>();

    async function runTest(): Promise<void> {
      const mcpClient = new MCPClient({ timeout, transport });

      try {
        output.info('\n--- Running Test ---');
        output.info(`[${new Date().toLocaleTimeString()}] Starting test...`);

        if (transport === 'stdio') {
          await mcpClient.connect(serverCommand, args, config.server.env);
        } else {
          await mcpClient.connectRemote(remoteUrl!, {
            transport,
            sessionId: remoteSessionId || undefined,
          });
        }
        const discovery = await discover(
          mcpClient,
          transport === 'stdio' ? serverCommand : (remoteUrl ?? serverCommand),
          transport === 'stdio' ? args : []
        );
        output.info(`Found ${discovery.tools.length} tools`);

        if (discovery.tools.length === 0) {
          output.info('No tools found. Skipping.');
          await mcpClient.disconnect();
          return;
        }

        const fullServerCommand = serverIdentifier;
        // Watch mode uses check (no LLM) for fast, deterministic drift detection
        const interviewer = new Interviewer(null, {
          maxQuestionsPerTool: minSamples,
          timeout,
          skipErrorTests: false,
          model: 'check',
          personas: [],
          checkMode: true, // Required when passing null for LLM
          parallelTools: config.check.parallel,
          toolConcurrency: config.check.parallelWorkers,
          serverCommand: fullServerCommand,
        });

        const progressCallback = (progress: InterviewProgress) => {
          process.stdout.write(
            `\rChecking: ${progress.toolsCompleted + 1}/${progress.totalTools} tools`.padEnd(60)
          );
        };

        const result = await interviewer.interview(mcpClient, discovery, progressCallback);
        output.info('\n');

        // Create and compare baseline
        const newBaseline = createBaseline(result, fullServerCommand);

        if (lastBaselineHash && existsSync(baselinePath)) {
          const previousBaseline = loadBaseline(baselinePath);
          const diff = compareBaselines(previousBaseline, newBaseline, {});

          if (diff.severity !== 'none') {
            output.info('\n--- Behavioral Drift Detected ---');
            output.info(formatDiffText(diff));

            // Run on-drift command if configured
            if (onDriftCommand) {
              output.info(`\nRunning: ${onDriftCommand}`);
              const { spawnSync } = await import('child_process');
              try {
                // Parse command safely - split on spaces but respect quoted strings
                const parts = onDriftCommand.match(/(?:[^\s"]+|"[^"]*")+/g);
                if (!parts || parts.length === 0) {
                  throw new Error('Empty on-drift command');
                }
                const [cmd, ...rest] = parts;
                const cmdArgs = rest.map((arg: string) => arg.replace(/^"|"$/g, ''));
                // Use spawnSync without shell to prevent command injection
                const cmdResult = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
                if (cmdResult.error) {
                  throw cmdResult.error;
                }
                if (cmdResult.status !== 0) {
                  output.error(`On-drift command exited with code ${cmdResult.status}`);
                }
              } catch (e) {
                output.error(
                  `On-drift command failed: ${e instanceof Error ? e.message : String(e)}`
                );
              }
            }
          } else {
            output.info('No drift detected.');
          }
        }

        // Save new baseline
        saveBaseline(newBaseline, baselinePath);
        lastBaselineHash = newBaseline.hash;
        output.info(`Baseline updated: ${newBaseline.hash.slice(0, 8)}`);
      } catch (error) {
        output.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await mcpClient.disconnect();
      }
    }

    function checkForChanges(): boolean {
      // Simple file watcher - check if any source files changed
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
              if (extensions.some((ext) => entry.name.endsWith(ext))) {
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
          if (verbose) {
            output.error(
              `Warning: Error scanning ${dir}: ${error instanceof Error ? error.message : String(error)}`
            );
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
        output.error(
          `Watch polling error: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        isRunningInterview = false;
      }
    }

    // Start polling interval
    currentInterval = setInterval(() => {
      pollForChanges().catch((error) => {
        output.error(
          `Unexpected polling error: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }, interval);

    // Handle exit
    const cleanup = (): void => {
      // Remove signal handlers first to prevent re-entry
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
      output.info('\n\nExiting watch mode.');
      if (currentInterval) {
        clearInterval(currentInterval);
        currentInterval = null;
      }
      process.exit(EXIT_CODES.CLEAN);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
