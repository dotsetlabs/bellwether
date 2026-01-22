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
  formatDiffJson,
  formatDiffCompact,
  formatDiffGitHubActions,
  formatDiffMarkdown,
  formatDiffJUnit,
  formatDiffSarif,
  applySeverityConfig,
  shouldFailOnDiff,
  analyzeForIncremental,
  formatIncrementalSummary,
  type BehavioralDiff,
  type SeverityConfig,
  type ChangeSeverity,
  type BehavioralBaseline,
} from '../../baseline/index.js';
import { getMetricsCollector, resetMetricsCollector } from '../../metrics/collector.js';
import { getGlobalCache, resetGlobalCache } from '../../cache/response-cache.js';
import { InterviewProgressBar, formatCheckBanner } from '../utils/progress.js';
import { loadScenariosFromFile, tryLoadDefaultScenarios, DEFAULT_SCENARIOS_FILE } from '../../scenarios/index.js';
import * as output from '../output.js';
import { extractServerContextFromArgs } from './shared.js';
import { EXIT_CODES, SEVERITY_TO_EXIT_CODE, PATHS } from '../../constants.js';


export const checkCommand = new Command('check')
  .description('Check MCP server schema and detect drift (free, fast, deterministic)')
  .argument('[server-command]', 'Server command (overrides config)')
  .argument('[args...]', 'Server arguments')
  .option('-c, --config <path>', 'Path to config file', PATHS.DEFAULT_CONFIG_FILENAME)
  .option('--fail-on-drift', 'Exit with error if drift detected (overrides config)')
  .option('--accept-drift', 'Accept detected drift as intentional and update baseline')
  .option('--accept-reason <reason>', 'Reason for accepting drift (used with --accept-drift)')
  .option('--format <format>', 'Diff output format: text, json, compact, github, markdown, junit, sarif', 'text')
  .option('--min-severity <level>', 'Minimum severity to report: none, info, warning, breaking')
  .option('--fail-on-severity <level>', 'Fail threshold: none, info, warning, breaking')
  .option('--incremental', 'Only test tools with changed schemas (requires baseline)')
  .option('--incremental-cache-hours <hours>', 'Max age of cached results in hours', '168')
  .option('--parallel', 'Enable parallel tool testing for faster checks')
  .option('--parallel-workers <n>', 'Number of concurrent tool workers (1-10)', '4')
  .option('--performance-threshold <n>', 'Performance regression threshold percentage (default: 10)', '10')
  .action(async (serverCommandArg: string | undefined, serverArgs: string[], options) => {
    // Load configuration
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

    // Validate config for check
    try {
      validateConfigForCheck(config, serverCommand);
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.ERROR);
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

    // Build severity config (CLI options override config file)
    const severityConfig: SeverityConfig = {
      minimumSeverity: (options.minSeverity as ChangeSeverity) || config.baseline.severity.minimumSeverity,
      failOnSeverity: (options.failOnSeverity as ChangeSeverity) || config.baseline.severity.failOnSeverity,
      suppressWarnings: config.baseline.severity.suppressWarnings,
      aspectOverrides: config.baseline.severity.aspectOverrides as SeverityConfig['aspectOverrides'],
    };

    // Resolve check options (CLI flags override config file)
    const incrementalEnabled = options.incremental ?? config.check.incremental;
    const incrementalCacheHours = options.incrementalCacheHours
      ? parseInt(options.incrementalCacheHours, 10)
      : config.check.incrementalCacheHours;
    const parallelEnabled = options.parallel ?? config.check.parallel;
    const parallelWorkers = options.parallelWorkers
      ? parseInt(options.parallelWorkers, 10)
      : config.check.parallelWorkers;
    const performanceThreshold = options.performanceThreshold
      ? parseFloat(options.performanceThreshold) / 100
      : config.check.performanceThreshold / 100;

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

      // Incremental checking - load baseline and determine which tools to test
      let incrementalBaseline: BehavioralBaseline | null = null;
      let incrementalResult: ReturnType<typeof analyzeForIncremental> | null = null;

      if (incrementalEnabled) {
        if (!baselinePath || !existsSync(baselinePath)) {
          output.warn('Incremental mode requires a baseline. Testing all tools.');
        } else {
          incrementalBaseline = loadBaseline(baselinePath);
          incrementalResult = analyzeForIncremental(
            discovery.tools,
            incrementalBaseline,
            { maxCacheAgeHours: incrementalCacheHours }
          );

          const summary = formatIncrementalSummary(incrementalResult.changeSummary);
          output.info(`Incremental analysis: ${summary}`);

          if (incrementalResult.toolsToTest.length === 0) {
            output.info('All tools unchanged. Using cached results.');
            // Still need to generate output with cached data
            // Skip to comparison section
          } else {
            output.info(`Testing ${incrementalResult.toolsToTest.length} tools (${incrementalResult.toolsToSkip.length} cached)\n`);
            // Filter discovery to only include tools that need testing
            discovery.tools = discovery.tools.filter(t =>
              incrementalResult!.toolsToTest.includes(t.name)
            );
          }
        }
      }

      // Load custom scenarios (work in check mode too)
      let customScenarios: ReturnType<typeof loadScenariosFromFile> | undefined;
      if (config.scenarios.path) {
        try {
          customScenarios = loadScenariosFromFile(config.scenarios.path);
          output.info(`Loaded ${customScenarios.toolScenarios.length} tool scenarios from ${config.scenarios.path}`);
        } catch (error) {
          output.error(`Failed to load scenarios: ${error instanceof Error ? error.message : error}`);
          process.exit(EXIT_CODES.ERROR);
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

      // Validate parallel workers (already resolved from config + CLI override)
      let toolConcurrency = parallelWorkers;
      if (toolConcurrency < 1) {
        toolConcurrency = 4;
      } else if (toolConcurrency > 10) {
        output.warn('Tool concurrency capped at 10');
        toolConcurrency = 10;
      }

      if (parallelEnabled) {
        output.info(`Parallel tool testing enabled (${toolConcurrency} workers)`);
      }

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
        parallelTools: parallelEnabled,
        toolConcurrency,
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
      let currentBaseline = createBaseline(result, fullServerCommand);

      // Merge cached fingerprints in incremental mode
      if (incrementalResult && incrementalResult.cachedFingerprints.length > 0) {
        // Merge new fingerprints with cached ones
        const mergedTools = [
          ...currentBaseline.tools,
          ...incrementalResult.cachedFingerprints,
        ].sort((a, b) => a.name.localeCompare(b.name));

        currentBaseline = {
          ...currentBaseline,
          tools: mergedTools,
        };

        output.info(`Merged ${incrementalResult.cachedFingerprints.length} cached tool fingerprints`);
      }

      // Save baseline if configured
      if (saveBaselinePath) {
        writeFileSync(saveBaselinePath, JSON.stringify(currentBaseline, null, 2));
        output.info(`\nBaseline saved: ${saveBaselinePath}`);
      }

      // Handle baseline comparison
      if (baselinePath) {
        if (!existsSync(baselinePath)) {
          output.error(`\nBaseline file not found: ${baselinePath}`);
          process.exit(EXIT_CODES.ERROR);
        }

        const previousBaseline = loadBaseline(baselinePath);

        const rawDiff = compareBaselines(previousBaseline, currentBaseline, {
          performanceThreshold, // Already resolved from config + CLI override
        });

        // Apply severity configuration (filtering, overrides)
        const diff = applySeverityConfig(rawDiff, severityConfig);

        output.info('\n--- Drift Report ---');

        // Select formatter based on --format option
        const formattedDiff = formatDiff(diff, options.format, baselinePath);
        output.info(formattedDiff);

        // Report performance regressions if detected
        if (diff.performanceReport?.hasRegressions) {
          output.warn('\n--- Performance Regressions ---');
          for (const regression of diff.performanceReport.regressions) {
            const percentStr = (regression.regressionPercent * 100).toFixed(1);
            output.warn(
              `  ${regression.toolName}: p50 ${regression.previousP50Ms.toFixed(0)}ms → ` +
                `${regression.currentP50Ms.toFixed(0)}ms (+${percentStr}%)`
            );
          }
        } else if (diff.performanceReport?.improvementCount ?? 0 > 0) {
          output.info(
            `\nPerformance: ${diff.performanceReport?.improvementCount} tool(s) improved`
          );
        }

        // Handle --accept-drift flag
        if (options.acceptDrift && diff.severity !== 'none') {
          const acceptedBaseline = acceptDrift(currentBaseline, rawDiff, {
            reason: options.acceptReason,
          });
          saveBaseline(acceptedBaseline, baselinePath);
          output.success(`\nDrift accepted and baseline updated: ${baselinePath}`);
          if (options.acceptReason) {
            output.info(`Reason: ${options.acceptReason}`);
          }
          output.info('Future checks will compare against this new baseline.');
        } else if (!options.acceptDrift) {
          // Check if diff meets failure threshold based on severity config
          const shouldFail = shouldFailOnDiff(diff, severityConfig.failOnSeverity);
          const exitCode = SEVERITY_TO_EXIT_CODE[diff.severity] ?? EXIT_CODES.CLEAN;

          if (diff.severity === 'breaking') {
            output.error('\nBreaking changes detected!');
            output.error('Use --accept-drift to accept these changes as intentional.');
            if (failOnDrift || shouldFail) {
              process.exit(exitCode);
            }
          } else if (diff.severity === 'warning') {
            output.warn('\nWarning-level changes detected.');
            output.warn('Use --accept-drift to accept these changes as intentional.');
            if (failOnDrift || shouldFail) {
              process.exit(exitCode);
            }
          } else if (diff.severity === 'info') {
            output.info('\nInfo-level changes detected (non-breaking).');
            if (shouldFail) {
              process.exit(exitCode);
            }
          }

          // Exit with appropriate code based on severity
          // This provides semantic exit codes for CI/CD even when not failing
          process.exit(exitCode);
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

      process.exit(EXIT_CODES.ERROR);
    } finally {
      await mcpClient.disconnect();
    }
  });

/**
 * Format a diff using the specified output format.
 *
 * @param diff - The behavioral diff to format
 * @param format - Output format: text, json, compact, github, markdown, junit, sarif
 * @param baselinePath - Path to baseline file (used for SARIF location references)
 * @returns Formatted string
 */
function formatDiff(diff: BehavioralDiff, format: string, baselinePath: string): string {
  switch (format.toLowerCase()) {
    case 'json':
      return formatDiffJson(diff);
    case 'compact':
      return formatDiffCompact(diff);
    case 'github':
      return formatDiffGitHubActions(diff);
    case 'markdown':
    case 'md':
      return formatDiffMarkdown(diff);
    case 'junit':
    case 'junit-xml':
    case 'xml':
      return formatDiffJUnit(diff, 'bellwether-check');
    case 'sarif':
      return formatDiffSarif(diff, baselinePath);
    case 'text':
    default:
      return formatDiffText(diff);
  }
}
