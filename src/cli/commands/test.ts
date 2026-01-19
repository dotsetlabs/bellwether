/**
 * Test command - the simplified, config-driven MCP server testing command.
 *
 * All settings are read from bellwether.yaml (created by `bellwether init`).
 * The only optional argument is the server command, which can also be in config.
 */

import { Command } from 'commander';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { createLLMClient, type LLMClient } from '../../llm/index.js';
import { Interviewer } from '../../interview/interviewer.js';
import type { ServerContext } from '../../interview/types.js';
import { generateAgentsMd, generateJsonReport } from '../../docs/generator.js';
import { loadConfigNew, ConfigNotFoundError, type BellwetherConfigNew } from '../../config/loader.js';
import { validateConfigForTest } from '../../config/validator.js';
import type { InterviewProgress } from '../../interview/interviewer.js';
import {
  createBaseline,
  loadBaseline,
  compareBaselines,
  formatDiffText,
} from '../../baseline/index.js';
import {
  CostTracker,
  estimateInterviewCost,
  estimateInterviewTime,
  formatCostAndTimeEstimate,
  suggestOptimizations,
  formatOptimizationSuggestions,
} from '../../cost/index.js';
import { getMetricsCollector, resetMetricsCollector } from '../../metrics/collector.js';
import { FallbackLLMClient } from '../../llm/fallback.js';
import { getGlobalCache, resetGlobalCache } from '../../cache/response-cache.js';
import { INTERVIEW, WORKFLOW } from '../../constants.js';
import { InterviewProgressBar, formatStartupBanner } from '../utils/progress.js';
import { parsePersonas } from '../../persona/builtins.js';
import {
  loadScenariosFromFile,
  tryLoadDefaultScenarios,
  DEFAULT_SCENARIOS_FILE,
} from '../../scenarios/index.js';
import {
  loadWorkflowsFromFile,
  tryLoadDefaultWorkflows,
  DEFAULT_WORKFLOWS_FILE,
} from '../../workflow/loader.js';
import type { WorkflowConfig } from '../../interview/types.js';
import * as output from '../output.js';
import { StreamingDisplay } from '../output.js';
import type { InterviewStreamingCallbacks } from '../../interview/types.js';
import { suppressLogs, restoreLogLevel } from '../../logging/logger.js';

/**
 * Wrapper to parse personas with warning output.
 */
function parsePersonasWithWarning(personaList: string[]) {
  return parsePersonas(personaList, (unknownName, validNames) => {
    output.warn(`Unknown persona: ${unknownName}. Available: ${validNames.join(', ')}`);
  });
}

/**
 * Extract server context from command and arguments.
 */
function extractServerContextFromArgs(command: string, args: string[]): ServerContext {
  const context: ServerContext = {
    allowedDirectories: [],
    constraints: [],
    hints: [],
  };

  const fullCommand = `${command} ${args.join(' ')}`.toLowerCase();
  const pathArgs = args.filter((arg) => arg.startsWith('/') && !arg.startsWith('--'));

  if (fullCommand.includes('filesystem') || fullCommand.includes('file-system')) {
    context.allowedDirectories = pathArgs;
    if (context.allowedDirectories.length > 0) {
      context.hints!.push(`Filesystem server with allowed directories: ${context.allowedDirectories.join(', ')}`);
    }
    context.constraints!.push('Operations limited to specified directories');
  } else if (fullCommand.includes('postgres') || fullCommand.includes('mysql') || fullCommand.includes('sqlite')) {
    context.hints!.push('Database server - SQL operations expected');
    context.constraints!.push('Database operations only');
  } else if (fullCommand.includes('git')) {
    context.allowedDirectories = pathArgs;
    context.hints!.push('Git server - repository operations expected');
  } else {
    context.allowedDirectories = pathArgs;
  }

  return context;
}

/**
 * Detect if running in a CI environment.
 */
function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.JENKINS_URL ||
    process.env.TRAVIS ||
    process.env.BUILDKITE
  );
}

export const testCommand = new Command('test')
  .description('Test an MCP server using settings from bellwether.yaml')
  .argument('[server-command]', 'Server command (overrides config)')
  .argument('[args...]', 'Server arguments')
  .option('-c, --config <path>', 'Path to config file (default: ./bellwether.yaml)')
  .action(async (serverCommandArg: string | undefined, serverArgs: string[], options) => {
    // Load configuration (required)
    let config: BellwetherConfigNew;
    try {
      config = loadConfigNew(options.config);
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

    // Extract settings from config
    const isStructuralMode = config.mode === 'structural';
    const timeout = config.server.timeout;
    const outputDir = config.output.dir;
    const wantsJson = config.output.format === 'json' || config.output.format === 'both';
    const cacheEnabled = config.cache.enabled;
    const verbose = config.logging.verbose;
    const logLevel = config.logging.level;

    // Parse personas from config
    const selectedPersonas = parsePersonasWithWarning(config.test.personas);
    const maxQuestions = config.test.maxQuestionsPerTool;
    const parallelPersonas = config.test.parallelPersonas;

    // Get LLM settings
    const provider = config.llm.provider;
    const model = config.llm.model || undefined; // Empty string means use default

    // Display startup banner
    const banner = formatStartupBanner({
      serverCommand: `${serverCommand} ${args.join(' ')}`,
      provider,
      model: model || 'default',
      isQuality: false,
      personas: selectedPersonas.map((p) => p.name),
      questionsPerTool: maxQuestions,
    });
    output.info(banner);
    output.newline();

    if (isStructuralMode) {
      output.info('Mode: structural (free, deterministic - no LLM calls)');
    } else {
      output.info(`Mode: full (LLM-powered using ${provider})`);
    }
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
      transport: 'stdio',
    });

    // Initialize LLM client (only for full mode)
    let llmClient: LLMClient | undefined;

    if (!isStructuralMode) {
      const onUsageCallback = (inputTokens: number, outputTokens: number) => {
        costTracker.addUsage(inputTokens, outputTokens);
        metricsCollector.recordTokenUsage(provider, model || 'default', inputTokens, outputTokens, 'llm_call');
      };

      try {
        // Use fallback client for robustness
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
        process.exit(1);
      }
    }

    // For structural mode, create a minimal LLM client that won't be used
    if (!llmClient) {
      llmClient = createLLMClient({
        provider: 'ollama',
        model: 'llama3.2', // Default model; not actually used in structural mode
        baseUrl: 'http://localhost:11434',
      });
    }

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
        personasUsed: selectedPersonas.length,
      });

      if (discovery.tools.length === 0) {
        output.info('No tools found. Nothing to test.');
        metricsCollector.endInterview();
        await mcpClient.disconnect();
        return;
      }

      // Show cost/time estimate (unless in structural mode or CI)
      if (!isStructuralMode && !isCI()) {
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
          isUsingCiPreset: isStructuralMode,
          hasScenariosFile,
        });
        if (suggestions.length > 0) {
          output.newline();
          output.info(formatOptimizationSuggestions(suggestions));
        }
        output.newline();
      }

      // Load custom scenarios
      let customScenarios: ReturnType<typeof loadScenariosFromFile> | undefined;
      if (config.scenarios.path) {
        try {
          customScenarios = loadScenariosFromFile(config.scenarios.path);
          output.info(`Loaded ${customScenarios.toolScenarios.length} tool scenarios from ${config.scenarios.path}`);
        } catch (error) {
          output.error(`Failed to load scenarios: ${error instanceof Error ? error.message : error}`);
          process.exit(1);
        }
      } else if (!isStructuralMode) {
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
        };

        if (config.workflows.path) {
          try {
            const workflows = loadWorkflowsFromFile(config.workflows.path);
            workflowConfig.workflows = workflows;
            workflowConfig.workflowsFile = config.workflows.path;
            output.info(`Loaded ${workflows.length} workflow(s) from ${config.workflows.path}`);
          } catch (error) {
            output.error(`Failed to load workflows: ${error instanceof Error ? error.message : error}`);
            process.exit(1);
          }
        }
      } else if (!isStructuralMode) {
        const defaultWorkflows = tryLoadDefaultWorkflows(outputDir);
        if (defaultWorkflows && defaultWorkflows.length > 0) {
          workflowConfig = {
            discoverWorkflows: false,
            maxDiscoveredWorkflows: WORKFLOW.MAX_DISCOVERED_WORKFLOWS,
            enableStateTracking: config.workflows.trackState,
            workflows: defaultWorkflows,
            workflowsFile: `${outputDir}/${DEFAULT_WORKFLOWS_FILE}`,
          };
          output.info(`Auto-loaded ${defaultWorkflows.length} workflow(s) from ${DEFAULT_WORKFLOWS_FILE}`);
        }
      }

      // Set up streaming display
      let streamingDisplay: StreamingDisplay | null = null;
      let streamingCallbacks: InterviewStreamingCallbacks | undefined;

      if (!isStructuralMode && !isCI() && logLevel !== 'silent') {
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

      // Create interviewer
      const fullServerCommand = `${serverCommand} ${args.join(' ')}`.trim();
      const interviewer = new Interviewer(llmClient!, {
        maxQuestionsPerTool: maxQuestions,
        timeout,
        skipErrorTests: config.test.skipErrorTests,
        model: model || 'default',
        personas: selectedPersonas,
        customScenarios,
        customScenariosOnly: config.scenarios.only,
        enableStreaming: !!streamingCallbacks,
        streamingCallbacks,
        parallelPersonas,
        personaConcurrency: INTERVIEW.DEFAULT_PERSONA_CONCURRENCY,
        cache,
        workflowConfig,
        structuralOnly: isStructuralMode,
        serverCommand: fullServerCommand,
      });

      // Extract server context
      const serverContext = extractServerContextFromArgs(serverCommand, args);
      if (serverContext.allowedDirectories && serverContext.allowedDirectories.length > 0) {
        output.info(`Detected allowed directories: ${serverContext.allowedDirectories.join(', ')}`);
      }
      interviewer.setServerContext(serverContext);

      // Set up progress display
      const progressBar = new InterviewProgressBar({ enabled: !verbose && !streamingCallbacks });

      const progressCallback = (progress: InterviewProgress) => {
        if (verbose) {
          switch (progress.phase) {
            case 'starting':
              output.info('Starting test...');
              progressBar.start(progress.totalTools, progress.totalPersonas, progress.totalPrompts ?? 0, progress.totalResources ?? 0);
              break;
            case 'interviewing':
              output.info(`[${progress.currentPersona}] Testing: ${progress.currentTool} (${progress.toolsCompleted + 1}/${progress.totalTools})`);
              break;
            case 'synthesizing':
              output.info('Synthesizing findings...');
              break;
            case 'complete':
              output.info('Test complete!');
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

      output.info('Starting test...\n');
      const result = await interviewer.interview(mcpClient, discovery, progressCallback);

      progressBar.stop();
      if (!verbose) {
        output.newline();
      }

      // Generate documentation
      output.info('Generating documentation...');
      mkdirSync(outputDir, { recursive: true });

      const agentsMd = generateAgentsMd(result);
      const agentsMdPath = join(outputDir, 'AGENTS.md');
      writeFileSync(agentsMdPath, agentsMd);
      output.info(`Written: ${agentsMdPath}`);

      if (wantsJson) {
        const jsonReport = generateJsonReport(result);
        const jsonPath = join(outputDir, 'bellwether-report.json');
        writeFileSync(jsonPath, jsonReport);
        output.info(`Written: ${jsonPath}`);
      }

      // End metrics
      metricsCollector.endInterview();

      output.info('\nTest complete!');
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

      // Handle baseline comparison from config
      if (config.baseline.comparePath) {
        const compareBaselinePath = config.baseline.comparePath;
        if (!existsSync(compareBaselinePath)) {
          output.error(`\nBaseline file not found: ${compareBaselinePath}`);
          process.exit(1);
        }

        const previousBaseline = loadBaseline(compareBaselinePath);
        const baselineMode = isStructuralMode ? 'structural' : 'full';
        const currentBaseline = createBaseline(result, fullServerCommand, baselineMode);

        const diff = compareBaselines(previousBaseline, currentBaseline, {});

        output.info('\n--- Drift Report ---');
        output.info(formatDiffText(diff));

        if (config.baseline.failOnDrift) {
          if (diff.severity === 'breaking') {
            output.error('\nBreaking changes detected!');
            process.exit(1);
          } else if (diff.severity === 'warning') {
            output.warn('\nWarning-level changes detected.');
            process.exit(1);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      output.error('\n--- Test Failed ---');
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
      restoreLogLevel();
      await mcpClient.disconnect();
    }
  });
