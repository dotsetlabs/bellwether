/**
 * Check command - Schema validation and drift detection for MCP servers.
 *
 * Purpose: Fast, free, deterministic checking of MCP server contracts.
 * Output: CONTRACT.md, bellwether-check.json
 * Baseline: Full support (save, compare, diff)
 * LLM: None required
 */

import { Command } from 'commander';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { Interviewer } from '../../interview/interviewer.js';
import type { InterviewProgress } from '../../interview/interviewer.js';
import { generateContractMd, generateJsonReport } from '../../docs/generator.js';
import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../config/loader.js';
import { validateConfigForCheck } from '../../config/validator.js';
import {
  createBaseline,
  loadBaseline,
  saveBaseline,
  compareBaselines,
  acceptDrift,
  formatDiffText,
} from '../../baseline/index.js';
import { getMetricsCollector, resetMetricsCollector } from '../../metrics/collector.js';
import { getGlobalCache, resetGlobalCache } from '../../cache/response-cache.js';
import { InterviewProgressBar, formatCheckBanner } from '../utils/progress.js';
import { loadScenariosFromFile, tryLoadDefaultScenarios, DEFAULT_SCENARIOS_FILE } from '../../scenarios/index.js';
import * as output from '../output.js';
import { extractServerContextFromArgs } from './shared.js';


export const checkCommand = new Command('check')
  .description('Check MCP server schema and detect drift (free, fast, deterministic)')
  .argument('[server-command]', 'Server command (overrides config)')
  .argument('[args...]', 'Server arguments')
  .option('-c, --config <path>', 'Path to config file', 'bellwether.yaml')
  .option('--fail-on-drift', 'Exit with error if drift detected (overrides config)')
  .option('--accept-drift', 'Accept detected drift as intentional and update baseline')
  .option('--accept-reason <reason>', 'Reason for accepting drift (used with --accept-drift)')
  .action(async (serverCommandArg: string | undefined, serverArgs: string[], options) => {
    // Load configuration
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

    // Validate config for check
    try {
      validateConfigForCheck(config, serverCommand);
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    // Extract settings from config
    const timeout = config.server.timeout;
    const outputDir = config.output.dir;
    const docsDir = config.output.docsDir;
    const cacheEnabled = config.cache.enabled;
    const verbose = config.logging.verbose;
    const logLevel = config.logging.level;

    // Resolve baseline options from config (--fail-on-drift CLI flag can override)
    const baselinePath = config.baseline.comparePath;
    const saveBaselinePath = config.baseline.savePath;
    const failOnDrift = options.failOnDrift || config.baseline.failOnDrift;

    // Display startup banner
    const banner = formatCheckBanner({
      serverCommand: `${serverCommand} ${args.join(' ')}`,
    });
    output.info(banner);
    output.newline();
    output.info('Check: Schema validation and drift detection (free, deterministic)');
    output.newline();

    // Initialize metrics collector
    resetMetricsCollector();
    const metricsCollector = getMetricsCollector();
    metricsCollector.startInterview();

    // Initialize cache
    resetGlobalCache();
    const cache = getGlobalCache({ enabled: cacheEnabled });
    if (cacheEnabled && verbose) {
      output.info('Response caching enabled');
    }

    // Initialize MCP client
    const mcpClient = new MCPClient({
      timeout,
      debug: logLevel === 'debug',
      transport: 'stdio',
    });

    try {
      // Connect to MCP server
      output.info('Connecting to MCP server...');
      await mcpClient.connect(serverCommand, args, config.server.env);

      // Discovery phase
      output.info('Discovering capabilities...');
      const discovery = await discover(mcpClient, serverCommand, args);
      const resourceCount = discovery.resources?.length ?? 0;
      const discoveryParts = [`${discovery.tools.length} tools`, `${discovery.prompts.length} prompts`];
      if (resourceCount > 0) {
        discoveryParts.push(`${resourceCount} resources`);
      }
      output.info(`Found ${discoveryParts.join(', ')}\n`);

      // Update metrics
      metricsCollector.updateInterviewCounters({
        toolsDiscovered: discovery.tools.length,
        personasUsed: 0, // No personas in check mode
      });

      if (discovery.tools.length === 0) {
        output.info('No tools found. Nothing to check.');
        metricsCollector.endInterview();
        await mcpClient.disconnect();
        return;
      }

      // Load custom scenarios (work in check mode too)
      let customScenarios: ReturnType<typeof loadScenariosFromFile> | undefined;
      if (config.scenarios.path) {
        try {
          customScenarios = loadScenariosFromFile(config.scenarios.path);
          output.info(`Loaded ${customScenarios.toolScenarios.length} tool scenarios from ${config.scenarios.path}`);
        } catch (error) {
          output.error(`Failed to load scenarios: ${error instanceof Error ? error.message : error}`);
          process.exit(1);
        }
      } else {
        const defaultScenarios = tryLoadDefaultScenarios(outputDir);
        if (defaultScenarios) {
          customScenarios = defaultScenarios;
          output.info(`Auto-loaded ${customScenarios.toolScenarios.length} scenarios from ${DEFAULT_SCENARIOS_FILE}`);
        }
      }

      // Create interviewer for check mode (no LLM required)
      const fullServerCommand = `${serverCommand} ${args.join(' ')}`.trim();
      const interviewer = new Interviewer(null, {
        maxQuestionsPerTool: 3, // Default for schema-based tests
        timeout,
        skipErrorTests: false,
        model: 'check', // Marker for check mode
        personas: [],
        customScenarios,
        customScenariosOnly: config.scenarios.only,
        enableStreaming: false,
        parallelPersonas: false,
        cache,
        checkMode: true, // Required when passing null for LLM
        serverCommand: fullServerCommand,
      });

      // Extract server context
      const serverContext = extractServerContextFromArgs(serverCommand, args);
      if (serverContext.allowedDirectories && serverContext.allowedDirectories.length > 0) {
        output.info(`Detected allowed directories: ${serverContext.allowedDirectories.join(', ')}`);
      }
      interviewer.setServerContext(serverContext);

      // Set up progress display
      const progressBar = new InterviewProgressBar({ enabled: !verbose });

      const progressCallback = (progress: InterviewProgress) => {
        if (verbose) {
          switch (progress.phase) {
            case 'starting':
              output.info('Starting check...');
              progressBar.start(progress.totalTools, 0, progress.totalPrompts ?? 0, progress.totalResources ?? 0);
              break;
            case 'interviewing':
              output.info(`Checking: ${progress.currentTool} (${progress.toolsCompleted + 1}/${progress.totalTools})`);
              break;
            case 'complete':
              output.info('Check complete!');
              break;
          }
        } else {
          if (progress.phase === 'starting') {
            progressBar.start(progress.totalTools, 0, progress.totalPrompts ?? 0, progress.totalResources ?? 0);
          } else if (['interviewing', 'prompts', 'resources'].includes(progress.phase)) {
            progressBar.update(progress);
          } else if (progress.phase === 'complete') {
            progressBar.stop();
          }
        }
      };

      output.info('Checking schemas...\n');
      const result = await interviewer.interview(mcpClient, discovery, progressCallback);

      progressBar.stop();
      if (!verbose) {
        output.newline();
      }

      // Generate documentation
      output.info('Generating documentation...');
      mkdirSync(outputDir, { recursive: true });
      if (docsDir !== outputDir) {
        mkdirSync(docsDir, { recursive: true });
      }

      const contractMd = generateContractMd(result);
      const contractMdPath = join(docsDir, 'CONTRACT.md');
      writeFileSync(contractMdPath, contractMd);
      output.info(`Written: ${contractMdPath}`);

      // Always generate JSON report for check command
      const jsonReport = generateJsonReport(result);
      const jsonPath = join(outputDir, 'bellwether-check.json');
      writeFileSync(jsonPath, jsonReport);
      output.info(`Written: ${jsonPath}`);

      // End metrics
      metricsCollector.endInterview();

      output.info('\nCheck complete!');
      output.info(`Duration: ${(result.metadata.durationMs / 1000).toFixed(1)}s`);
      output.info(`Tools verified: ${result.toolProfiles.length}`);

      // Display scenario results
      if (result.scenarioResults && result.scenarioResults.length > 0) {
        const passed = result.scenarioResults.filter((r) => r.passed).length;
        const failed = result.scenarioResults.length - passed;
        const statusIcon = failed === 0 ? '\u2713' : '\u2717';
        output.info(`\nCustom scenarios: ${passed}/${result.scenarioResults.length} passed ${statusIcon}`);

        if (failed > 0) {
          output.info('\nFailed scenarios:');
          for (const scenarioResult of result.scenarioResults.filter((r) => !r.passed)) {
            const scenario = scenarioResult.scenario;
            const toolOrPrompt = 'tool' in scenario ? scenario.tool : scenario.prompt;
            output.info(`  - ${toolOrPrompt}: ${scenario.description}`);
            if (scenarioResult.error) {
              output.info(`    Error: ${scenarioResult.error}`);
            }
          }
        }
      }

      // Create baseline from results
      const currentBaseline = createBaseline(result, fullServerCommand);

      // Save baseline if configured
      if (saveBaselinePath) {
        writeFileSync(saveBaselinePath, JSON.stringify(currentBaseline, null, 2));
        output.info(`\nBaseline saved: ${saveBaselinePath}`);
      }

      // Handle baseline comparison
      if (baselinePath) {
        if (!existsSync(baselinePath)) {
          output.error(`\nBaseline file not found: ${baselinePath}`);
          process.exit(1);
        }

        const previousBaseline = loadBaseline(baselinePath);
        const diff = compareBaselines(previousBaseline, currentBaseline, {});

        output.info('\n--- Drift Report ---');
        output.info(formatDiffText(diff));

        // Handle --accept-drift flag
        if (options.acceptDrift && diff.severity !== 'none') {
          const acceptedBaseline = acceptDrift(currentBaseline, diff, {
            reason: options.acceptReason,
          });
          saveBaseline(acceptedBaseline, baselinePath);
          output.success(`\nDrift accepted and baseline updated: ${baselinePath}`);
          if (options.acceptReason) {
            output.info(`Reason: ${options.acceptReason}`);
          }
          output.info('Future checks will compare against this new baseline.');
        } else if (failOnDrift && !options.acceptDrift) {
          if (diff.severity === 'breaking') {
            output.error('\nBreaking changes detected!');
            output.error('Use --accept-drift to accept these changes as intentional.');
            process.exit(1);
          } else if (diff.severity === 'warning') {
            output.warn('\nWarning-level changes detected.');
            output.warn('Use --accept-drift to accept these changes as intentional.');
            process.exit(1);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      output.error('\n--- Check Failed ---');
      output.error(`Error: ${errorMessage}`);

      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection refused')) {
        output.error('\nPossible causes:');
        output.error('  - The MCP server is not running');
        output.error('  - The server address/port is incorrect');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        output.error('\nPossible causes:');
        output.error('  - The MCP server is taking too long to respond');
        output.error('  - Increase server.timeout in bellwether.yaml');
      } else if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
        output.error('\nPossible causes:');
        output.error('  - The server command was not found');
        output.error('  - Check that the command is installed and in PATH');
      }

      process.exit(1);
    } finally {
      await mcpClient.disconnect();
    }
  });
