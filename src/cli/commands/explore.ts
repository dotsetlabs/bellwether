/**
 * Explore command - LLM-powered behavioral exploration for MCP servers.
 *
 * Purpose: Deep exploration and documentation of MCP server behavior.
 * Output: Documentation and/or JSON report (controlled by output.format)
 * Baseline: None (use 'bellwether check' for drift detection)
 * LLM: Required (OpenAI, Anthropic, or Ollama)
 */

import { Command } from 'commander';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import type { LLMClient } from '../../llm/index.js';
import { Interviewer } from '../../interview/interviewer.js';
import type { WorkflowConfig, InterviewStreamingCallbacks } from '../../interview/types.js';
import type { InterviewProgress } from '../../interview/interviewer.js';
import { generateAgentsMd, generateJsonReport } from '../../docs/generator.js';
import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../config/loader.js';
import { validateConfigForExplore } from '../../config/validator.js';
import {
  CostTracker,
  estimateInterviewCost,
  estimateInterviewTime,
  formatCostAndTimeEstimate,
  suggestOptimizations,
  formatOptimizationSuggestions,
} from '../../cost/index.js';
import { getMetricsCollector, resetMetricsCollector } from '../../metrics/collector.js';
import { EXIT_CODES, WORKFLOW, PATHS } from '../../constants.js';
import { FallbackLLMClient } from '../../llm/fallback.js';
import { getGlobalCache, resetGlobalCache } from '../../cache/response-cache.js';
import { InterviewProgressBar, formatExploreBanner } from '../utils/progress.js';
import { parsePersonas } from '../../persona/builtins.js';
import { loadScenariosFromFile, tryLoadDefaultScenarios, DEFAULT_SCENARIOS_FILE } from '../../scenarios/index.js';
import { loadWorkflowsFromFile, tryLoadDefaultWorkflows, DEFAULT_WORKFLOWS_FILE } from '../../workflow/loader.js';
import * as output from '../output.js';
import { StreamingDisplay } from '../output.js';
import { suppressLogs, restoreLogLevel, configureLogger, type LogLevel } from '../../logging/logger.js';
import { extractServerContextFromArgs } from '../utils/server-context.js';
import { isCI } from '../utils/env.js';

/**
 * Wrapper to parse personas with warning output.
 */
function parsePersonasWithWarning(personaList: string[]) {
  return parsePersonas(personaList, (unknownName, validNames) => {
    output.warn(`Unknown persona: ${unknownName}. Available: ${validNames.join(', ')}`);
  });
}

export const exploreCommand = new Command('explore')
  .description('Explore MCP server behavior with LLM-powered testing')
  .argument('[server-command]', 'Server command (overrides config)')
  .argument('[args...]', 'Server arguments')
  .option('-c, --config <path>', 'Path to config file', PATHS.DEFAULT_CONFIG_FILENAME)
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
    const transport = config.server.transport ?? 'stdio';
    const remoteUrl = config.server.url?.trim();
    const remoteSessionId = config.server.sessionId?.trim();

    // Validate config for explore
    try {
      validateConfigForExplore(config, serverCommand);
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.ERROR);
    }

    // Extract settings from config (CLI options override config)
    const timeout = config.server.timeout;
    const outputDir = config.output.dir;
    const docsDir = config.output.docsDir;
    const cacheEnabled = config.cache.enabled;
    const verbose = config.logging.verbose;
    const logLevel = config.logging.level;
    const outputFormat = config.output.format;

    if (!process.env.BELLWETHER_LOG_OVERRIDE) {
      const effectiveLogLevel: LogLevel = verbose ? (logLevel as LogLevel) : 'silent';
      configureLogger({ level: effectiveLogLevel });
    }

    // Parse personas from config (using explore section)
    const selectedPersonas = parsePersonasWithWarning(config.explore.personas);
    const maxQuestions = config.explore.maxQuestionsPerTool;
    const parallelPersonas = config.explore.parallelPersonas;
    const personaConcurrency = config.explore.personaConcurrency;

    // Get LLM settings from config
    const provider = config.llm.provider;
    const model = config.llm.model || undefined;

    // Display startup banner
    const serverIdentifier = transport === 'stdio'
      ? `${serverCommand} ${args.join(' ')}`.trim()
      : (remoteUrl ?? 'unknown');

    const banner = formatExploreBanner({
      serverCommand: serverIdentifier,
      provider,
      model: model || 'default',
      personas: selectedPersonas.map((p) => p.name),
      questionsPerTool: maxQuestions,
    });
    output.info(banner);
    output.newline();
    output.info(`Explore: LLM-powered behavioral exploration (using ${provider})`);
    output.newline();

    // Initialize cost tracker
    const costTracker = new CostTracker(model || 'default');

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
      transport,
    });

    // Initialize LLM client
    let llmClient: LLMClient;
    const onUsageCallback = (inputTokens: number, outputTokens: number) => {
      costTracker.addUsage(inputTokens, outputTokens);
      metricsCollector.recordTokenUsage(provider, model || 'default', inputTokens, outputTokens, 'llm_call');
    };

    try {
      llmClient = new FallbackLLMClient({
        providers: [{ provider, model, baseUrl: provider === 'ollama' ? config.llm.ollama.baseUrl : undefined }],
        useOllamaFallback: true,
        onUsage: onUsageCallback,
      });
    } catch (error) {
      output.error('Failed to initialize LLM client: ' + (error instanceof Error ? error.message : String(error)));
      output.error(`\nProvider: ${provider}`);
      output.error('Make sure the appropriate API key environment variable is set:');
      output.error('  - OpenAI: OPENAI_API_KEY');
      output.error('  - Anthropic: ANTHROPIC_API_KEY');
      output.error('  - Ollama: No API key needed (ensure Ollama is running)');
      process.exit(EXIT_CODES.ERROR);
    }

    try {
      // Connect to MCP server
      output.info('Connecting to MCP server...');
      if (transport === 'stdio') {
        await mcpClient.connect(serverCommand, args, config.server.env);
      } else {
        await mcpClient.connectRemote(remoteUrl!, {
          transport,
          sessionId: remoteSessionId || undefined,
        });
      }

      // Discovery phase
      output.info('Discovering capabilities...');
      const discovery = await discover(
        mcpClient,
        transport === 'stdio' ? serverCommand : remoteUrl ?? serverCommand,
        transport === 'stdio' ? args : []
      );
      const resourceCount = discovery.resources?.length ?? 0;
      const discoveryParts = [`${discovery.tools.length} tools`, `${discovery.prompts.length} prompts`];
      if (resourceCount > 0) {
        discoveryParts.push(`${resourceCount} resources`);
      }
      output.info(`Found ${discoveryParts.join(', ')}\n`);

      // Update metrics
      metricsCollector.updateInterviewCounters({
        toolsDiscovered: discovery.tools.length,
        personasUsed: selectedPersonas.length,
      });

      if (discovery.tools.length === 0) {
        output.info('No tools found. Nothing to explore.');
        metricsCollector.endInterview();
        await mcpClient.disconnect();
        return;
      }

      // Show cost/time estimate (unless in CI)
      if (!isCI()) {
        const costEstimate = estimateInterviewCost(model || 'default', discovery.tools.length, maxQuestions, selectedPersonas.length);
        const timeEstimate = estimateInterviewTime(
          discovery.tools.length,
          maxQuestions,
          selectedPersonas.length,
          parallelPersonas,
          provider,
          discovery.prompts.length,
          resourceCount,
          false
        );
        output.info(formatCostAndTimeEstimate(costEstimate, timeEstimate));

        // Show optimization suggestions
        const hasScenariosFile = !!(config.scenarios.path || existsSync(join(outputDir, DEFAULT_SCENARIOS_FILE)));
        const suggestions = suggestOptimizations({
          estimatedCost: costEstimate.costUSD,
          toolCount: discovery.tools.length,
          personaCount: selectedPersonas.length,
          isParallelPersonas: parallelPersonas,
          isPremiumModel: false,
          isUsingCiPreset: false,
          hasScenariosFile,
        });
        if (suggestions.length > 0) {
          output.newline();
          output.info(formatOptimizationSuggestions(suggestions));
        }
        output.newline();
      }

      // Load custom scenarios (work in explore mode too)
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

      // Build workflow configuration
      let workflowConfig: WorkflowConfig | undefined;
      if (config.workflows.path || config.workflows.discover) {
        workflowConfig = {
          discoverWorkflows: config.workflows.discover,
          maxDiscoveredWorkflows: WORKFLOW.MAX_DISCOVERED_WORKFLOWS,
          enableStateTracking: config.workflows.trackState,
          stepTimeout: config.workflows.stepTimeout,
          timeouts: config.workflows.timeouts,
        };

        if (config.workflows.path) {
          try {
            const workflows = loadWorkflowsFromFile(config.workflows.path);
            workflowConfig.workflows = workflows;
            workflowConfig.workflowsFile = config.workflows.path;
            output.info(`Loaded ${workflows.length} workflow(s) from ${config.workflows.path}`);
          } catch (error) {
            output.error(`Failed to load workflows: ${error instanceof Error ? error.message : error}`);
            process.exit(EXIT_CODES.ERROR);
          }
        }
      } else {
        const defaultWorkflows = tryLoadDefaultWorkflows(outputDir);
        if (defaultWorkflows && defaultWorkflows.length > 0) {
          workflowConfig = {
            discoverWorkflows: false,
            maxDiscoveredWorkflows: WORKFLOW.MAX_DISCOVERED_WORKFLOWS,
            enableStateTracking: config.workflows.trackState,
            stepTimeout: config.workflows.stepTimeout,
            timeouts: config.workflows.timeouts,
            workflows: defaultWorkflows,
            workflowsFile: `${outputDir}/${DEFAULT_WORKFLOWS_FILE}`,
          };
          output.info(`Auto-loaded ${defaultWorkflows.length} workflow(s) from ${DEFAULT_WORKFLOWS_FILE}`);
        }
      }

      // Set up streaming display
      let streamingDisplay: StreamingDisplay | null = null;
      let streamingCallbacks: InterviewStreamingCallbacks | undefined;

      if (!isCI() && logLevel !== 'silent') {
        suppressLogs();
        streamingDisplay = new StreamingDisplay({ style: 'dim', maxWidth: 100 });

        streamingCallbacks = {
          onStart: (operation: string) => {
            const parts = operation.split(':');
            const opType = parts[0];
            const context = parts[1];
            let prefix = '';
            switch (opType) {
              case 'generate-questions':
                prefix = context ? `\n  Generating questions for ${context}... ` : '\n  Generating questions... ';
                break;
              case 'analyze':
                prefix = context ? `\n  Analyzing ${context}... ` : '\n  Analyzing... ';
                break;
              case 'synthesize-tool':
                prefix = context ? `\n  Synthesizing profile for ${context}... ` : '\n  Synthesizing profile... ';
                break;
              case 'synthesize-overall':
                prefix = '\n  Synthesizing overall findings... ';
                break;
              default:
                prefix = '\n  Processing... ';
            }
            streamingDisplay?.start(prefix);
          },
          onChunk: (chunk: string) => {
            streamingDisplay?.write(chunk);
          },
          onComplete: () => {
            streamingDisplay?.finish(' [done]');
          },
          onError: (error: Error) => {
            streamingDisplay?.abort(`[error: ${error.message}]`);
          },
        };
      }

      // Create interviewer for explore mode
      const fullServerCommand = `${serverCommand} ${args.join(' ')}`.trim();
      const interviewer = new Interviewer(llmClient, {
        maxQuestionsPerTool: maxQuestions,
        timeout,
        skipErrorTests: config.explore.skipErrorTests,
        model: model || 'default',
        personas: selectedPersonas,
        customScenarios,
        customScenariosOnly: config.scenarios.only,
        enableStreaming: !!streamingCallbacks,
        streamingCallbacks,
        parallelPersonas,
        personaConcurrency,
        cache,
        workflowConfig,
        checkMode: false, // Full exploration mode with LLM
        serverCommand: fullServerCommand,
      });

      // Extract server context
      if (transport === 'stdio') {
        const serverContext = extractServerContextFromArgs(serverCommand, args);
        if (serverContext.allowedDirectories && serverContext.allowedDirectories.length > 0) {
          output.info(`Detected allowed directories: ${serverContext.allowedDirectories.join(', ')}`);
        }
        interviewer.setServerContext(serverContext);
      }

      // Set up progress display
      const progressBar = new InterviewProgressBar({ enabled: !verbose && !streamingCallbacks });

      const progressCallback = (progress: InterviewProgress) => {
        if (verbose) {
          switch (progress.phase) {
            case 'starting':
              output.info('Starting exploration...');
              progressBar.start(progress.totalTools, progress.totalPersonas, progress.totalPrompts ?? 0, progress.totalResources ?? 0);
              break;
            case 'interviewing':
              output.info(`[${progress.currentPersona}] Exploring: ${progress.currentTool} (${progress.toolsCompleted + 1}/${progress.totalTools})`);
              break;
            case 'synthesizing':
              output.info('Synthesizing findings...');
              break;
            case 'complete':
              output.info('Exploration complete!');
              break;
          }
        } else {
          if (progress.phase === 'starting') {
            progressBar.start(progress.totalTools, progress.totalPersonas, progress.totalPrompts ?? 0, progress.totalResources ?? 0);
          } else if (['interviewing', 'prompts', 'resources', 'workflows'].includes(progress.phase)) {
            progressBar.update(progress);
          } else if (progress.phase === 'complete' || progress.phase === 'synthesizing') {
            progressBar.stop();
          }
        }
      };

      output.info('Starting exploration...\n');
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

      const writeDocs = outputFormat === 'both' || outputFormat === 'agents.md';
      const writeJson = outputFormat === 'both' || outputFormat === 'json';

      if (writeDocs) {
        const agentsMd = generateAgentsMd(result);
        const agentsMdPath = join(docsDir, config.output.files.agentsDoc);
        writeFileSync(agentsMdPath, agentsMd);
        output.info(`Written: ${agentsMdPath}`);
      }

      if (writeJson) {
        const jsonReport = generateJsonReport(result);
        const jsonPath = join(outputDir, config.output.files.exploreReport);
        writeFileSync(jsonPath, jsonReport);
        output.info(`Written: ${jsonPath}`);
      }

      // End metrics
      metricsCollector.endInterview();

      output.info('\nExploration complete!');
      output.info(`Duration: ${(result.metadata.durationMs / 1000).toFixed(1)}s`);
      output.info(`Tools explored: ${result.toolProfiles.length}`);

      // Display cost summary
      const costEstimate = costTracker.getCost();
      if (costEstimate.costUSD > 0) {
        output.info(`Estimated cost: $${costEstimate.costUSD.toFixed(4)}`);
      }

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

      // Display workflow results
      if (result.workflowResults && result.workflowResults.length > 0) {
        const successful = result.workflowResults.filter((wr) => wr.success).length;
        const failed = result.workflowResults.length - successful;
        const statusIcon = failed === 0 ? '\u2713' : '\u2717';
        output.info(`\nWorkflows: ${successful}/${result.workflowResults.length} passed ${statusIcon}`);

        if (failed > 0) {
          output.info('\nFailed workflows:');
          for (const wr of result.workflowResults.filter((w) => !w.success)) {
            output.info(`  - ${wr.workflow.name}: ${wr.failureReason ?? 'Unknown error'}`);
          }
        }
      }

      // Note about baselines
      output.info('\nTip: For drift detection, use "bellwether check" to create and compare baselines.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      output.error('\n--- Exploration Failed ---');
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
      } else if (errorMessage.includes('API key') || errorMessage.includes('authentication')) {
        output.error('\nPossible causes:');
        output.error('  - Missing or invalid API key');
        output.error('  - Run "bellwether auth" to configure API keys');
      }

      process.exit(EXIT_CODES.ERROR);
    } finally {
      restoreLogLevel();
      await mcpClient.disconnect();
    }
  });
