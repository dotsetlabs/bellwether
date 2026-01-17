import { Command } from 'commander';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { createLLMClient, type LLMClient, PREMIUM_MODELS } from '../../llm/index.js';
import { Interviewer } from '../../interview/interviewer.js';
import type { ServerContext } from '../../interview/types.js';
import { generateAgentsMd, generateJsonReport } from '../../docs/generator.js';
import { loadConfig } from '../../config/loader.js';
import type { InterviewProgress } from '../../interview/interviewer.js';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  compareBaselines,
  formatDiffText,
  meetsConfidenceRequirements,
  CONFIDENCE_THRESHOLDS,
} from '../../baseline/index.js';
import type { CompareOptions } from '../../baseline/types.js';
import { createCloudBaseline } from '../../baseline/converter.js';
import {
  CostTracker,
  estimateInterviewCost,
  formatCostEstimate,
} from '../../cost/index.js';
import { getMetricsCollector, resetMetricsCollector } from '../../metrics/collector.js';
import { FallbackLLMClient } from '../../llm/fallback.js';
import { withTokenBudget } from '../../llm/token-budget.js';
import { getGlobalCache, resetGlobalCache } from '../../cache/response-cache.js';
import { INTERVIEW } from '../../constants.js';
import {
  promptForConfig,
  displayConfigSummary,
  type InteractiveConfig,
} from '../interactive.js';
import {
  InterviewProgressBar,
  formatStartupBanner,
} from '../utils/progress.js';
import {
  DEFAULT_PERSONA,
  securityTesterPersona,
  qaEngineerPersona,
  noviceUserPersona,
} from '../../persona/builtins.js';
import type { Persona } from '../../persona/types.js';
import {
  loadScenariosFromFile,
  tryLoadDefaultScenarios,
  generateSampleScenariosYaml,
  DEFAULT_SCENARIOS_FILE,
} from '../../scenarios/index.js';
import {
  loadWorkflowsFromFile,
  generateSampleWorkflowYaml,
} from '../../workflow/loader.js';
import { WORKFLOW } from '../../constants.js';
import type { WorkflowConfig } from '../../interview/types.js';
import * as output from '../output.js';
import { StreamingDisplay } from '../output.js';
import type { InterviewStreamingCallbacks } from '../../interview/types.js';
import { suppressLogs, restoreLogLevel } from '../../logging/logger.js';

/**
 * Map of persona names to persona objects.
 */
const PERSONA_MAP: Record<string, Persona> = {
  technical: DEFAULT_PERSONA,
  security: securityTesterPersona,
  qa: qaEngineerPersona,
  novice: noviceUserPersona,
};

/**
 * Preset configurations for common interview scenarios.
 */
interface PresetConfig {
  personas: Persona[];
  maxQuestions: number;
  description: string;
}

const PRESETS: Record<string, PresetConfig> = {
  docs: {
    personas: [DEFAULT_PERSONA],
    maxQuestions: 3,
    description: 'Documentation-focused: Technical Writer persona, 3 questions/tool',
  },
  security: {
    personas: [DEFAULT_PERSONA, securityTesterPersona],
    maxQuestions: 3,
    description: 'Security audit: Technical + Security personas, 3 questions/tool',
  },
  thorough: {
    personas: [DEFAULT_PERSONA, securityTesterPersona, qaEngineerPersona, noviceUserPersona],
    maxQuestions: 5,
    description: 'Comprehensive: All 4 personas, 5 questions/tool',
  },
  ci: {
    personas: [DEFAULT_PERSONA],
    maxQuestions: 1,
    description: 'CI/CD optimized: Technical Writer only, 1 question/tool (fastest)',
  },
};

/**
 * Parse persona list from CLI option.
 */
function parsePersonas(personaList: string): Persona[] {
  if (personaList === 'all') {
    return Object.values(PERSONA_MAP);
  }

  const names = personaList.split(',').map((s) => s.trim().toLowerCase());
  const personas: Persona[] = [];

  for (const name of names) {
    const persona = PERSONA_MAP[name];
    if (persona) {
      personas.push(persona);
    } else {
      output.warn(`Unknown persona: ${name}. Available: ${Object.keys(PERSONA_MAP).join(', ')}, all`);
    }
  }

  return personas.length > 0 ? personas : [DEFAULT_PERSONA];
}

/**
 * Extract server context from command and arguments.
 * Looks for common patterns like directory paths that indicate server constraints.
 */
function extractServerContextFromArgs(command: string, args: string[]): ServerContext {
  const context: ServerContext = {
    allowedDirectories: [],
    constraints: [],
    hints: [],
  };

  // Check if this is a known server type
  const fullCommand = `${command} ${args.join(' ')}`.toLowerCase();

  // Extract any arguments that look like absolute paths
  const pathArgs = args.filter(arg => arg.startsWith('/') && !arg.startsWith('--'));

  // Filesystem servers - look for directory arguments
  if (fullCommand.includes('filesystem') || fullCommand.includes('file-system')) {
    context.allowedDirectories = pathArgs;
    if (context.allowedDirectories.length > 0) {
      context.hints!.push(`Filesystem server with allowed directories: ${context.allowedDirectories.join(', ')}`);
    }
    context.constraints!.push('Operations limited to specified directories');
  }
  // Database servers - might have connection strings
  else if (fullCommand.includes('postgres') || fullCommand.includes('mysql') || fullCommand.includes('sqlite')) {
    context.hints!.push('Database server - SQL operations expected');
    context.constraints!.push('Database operations only');
  }
  // Git servers
  else if (fullCommand.includes('git')) {
    context.allowedDirectories = pathArgs;
    context.hints!.push('Git server - repository operations expected');
  }
  // Generic case - any path arguments are potential allowed directories
  else {
    context.allowedDirectories = pathArgs;
  }

  return context;
}

export const interviewCommand = new Command('interview')
  .description('Interview an MCP server and generate behavioral documentation')
  .argument('[command]', 'Command to start the MCP server')
  .argument('[args...]', 'Arguments to pass to the server')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('-c, --config <path>', 'Path to config file')
  .option('--model <model>', 'LLM model to use')
  .option('--max-questions <n>', 'Max questions per tool')
  .option('--timeout <ms>', 'Timeout for tool calls in milliseconds', String(INTERVIEW.CLI_TIMEOUT))
  .option('--json', 'Also output JSON report')
  .option('--verbose', 'Verbose output')
  .option('--debug', 'Debug MCP protocol')
  .option('--save-baseline [path]', 'Save baseline for drift detection (default: bellwether-baseline.json)')
  .option('--compare-baseline <path>', 'Compare against existing baseline')
  .option('--fail-on-drift', 'Exit with error if behavioral drift detected')
  .option('--cloud-format', 'Save baseline in cloud-ready format')
  .option('--estimate-cost', 'Estimate cost before running interview')
  .option('--show-cost', 'Show cost summary after interview')
  .option('-i, --interactive', 'Run in interactive mode with prompts')
  .option('-q, --quick', 'Quick mode for CI: 1 question per tool')
  .option('-Q, --quality', 'Use premium LLM models for higher quality output')
  .option('-p, --preset <name>', 'Use a preset configuration: docs, security, thorough, ci')
  .option('--personas <list>', 'Comma-separated persona list: technical,security,qa,novice,all', 'technical')
  .option('--security', 'Include security testing persona (shorthand for --personas technical,security)')
  .option('--transport <type>', 'Transport type: stdio, sse, streamable-http', 'stdio')
  .option('--url <url>', 'URL for remote MCP server (requires --transport sse or streamable-http)')
  .option('--session-id <id>', 'Session ID for remote server authentication')
  .option('--scenarios <path>', 'Path to custom test scenarios YAML file')
  .option('--scenarios-only', 'Only run custom scenarios (skip LLM-generated questions)')
  .option('--init-scenarios', 'Generate a sample bellwether-tests.yaml file and exit')
  .option('--strict', 'Strict mode: only report structural (deterministic) changes for CI')
  .option('--min-confidence <n>', 'Minimum confidence score (0-100) to report a change', '0')
  .option('--confidence-threshold <n>', 'Confidence threshold (0-100) for CI to fail on breaking changes')
  .option('--stream', 'Enable streaming output to show LLM responses in real-time')
  .option('--quiet', 'Suppress streaming output (use with --stream to only log final results)')
  .option('--parallel-personas', 'Run persona interviews in parallel for faster execution')
  .option('--persona-concurrency <n>', `Max concurrent persona interviews (default: ${INTERVIEW.DEFAULT_PERSONA_CONCURRENCY}, requires --parallel-personas)`, String(INTERVIEW.DEFAULT_PERSONA_CONCURRENCY))
  .option('--show-metrics', 'Show detailed metrics after interview (token usage, timing, costs)')
  .option('--fallback', 'Enable automatic Ollama fallback if primary LLM provider fails')
  .option('--max-tokens <n>', 'Maximum total tokens to use (prevents runaway costs)')
  .option('--cache', 'Enable response caching to avoid redundant tool calls and LLM analysis (default: enabled)')
  .option('--no-cache', 'Disable response caching')
  .option('--resource-timeout <ms>', `Timeout for resource reads in milliseconds (default: ${INTERVIEW.RESOURCE_TIMEOUT})`, String(INTERVIEW.RESOURCE_TIMEOUT))
  .option('--workflows <path>', 'Path to workflow definitions YAML file')
  .option('--discover-workflows', 'Enable LLM-based workflow discovery')
  .option('--max-workflows <n>', `Maximum workflows to discover (default: ${WORKFLOW.MAX_DISCOVERED_WORKFLOWS})`, String(WORKFLOW.MAX_DISCOVERED_WORKFLOWS))
  .option('--init-workflows', 'Generate a sample bellwether-workflows.yaml file and exit')
  .option('--workflow-state-tracking', 'Enable state tracking during workflow execution')
  .action(async (command: string | undefined, args: string[], options) => {
    // Handle --init-scenarios: generate sample file and exit
    if (options.initScenarios) {
      const outputPath = options.scenarios ?? DEFAULT_SCENARIOS_FILE;
      const content = generateSampleScenariosYaml();
      writeFileSync(outputPath, content);
      output.info(`Generated sample scenarios file: ${outputPath}`);
      output.info('\nEdit this file to add custom test scenarios for your MCP server.');
      output.info('Then run: bellwether interview <command> --scenarios ' + outputPath);
      return;
    }

    // Handle --init-workflows: generate sample file and exit
    if (options.initWorkflows) {
      const outputPath = options.workflows ?? 'bellwether-workflows.yaml';
      const content = generateSampleWorkflowYaml();
      writeFileSync(outputPath, content);
      output.info(`Generated sample workflows file: ${outputPath}`);
      output.info('\nEdit this file to define custom workflow tests for your MCP server.');
      output.info('Then run: bellwether interview <command> --workflows ' + outputPath);
      return;
    }
    // Load configuration
    const config = loadConfig(options.config);

    // Handle interactive mode
    let interactiveConfig: InteractiveConfig | undefined;

    if (options.interactive || !command) {
      // If no command provided, enter interactive mode
      if (!command && !options.interactive) {
        output.info('No server command provided. Entering interactive mode...\n');
      }

      interactiveConfig = await promptForConfig(config, command, args);
      displayConfigSummary(interactiveConfig);

      // Update command and args from interactive config
      command = interactiveConfig.serverCommand;
      args = interactiveConfig.serverArgs;
    }

    // Ensure we have a command at this point
    if (!command) {
      output.error('Error: Server command is required.');
      output.error('Usage: bellwether interview <command> [args...] or bellwether interview --interactive');
      process.exit(1);
    }

    // Determine model: --quality uses premium models, otherwise defaults (now budget-friendly)
    const isQualityMode = options.quality;
    const model = options.model
      ?? (isQualityMode ? PREMIUM_MODELS[config.llm.provider] : undefined)
      ?? config.llm.model;

    // Handle preset configurations
    let presetConfig: PresetConfig | undefined;
    if (options.preset) {
      presetConfig = PRESETS[options.preset.toLowerCase()];
      if (!presetConfig) {
        output.error(`Unknown preset: ${options.preset}`);
        output.error(`Available presets: ${Object.keys(PRESETS).join(', ')}`);
        output.error('\nPreset descriptions:');
        for (const [name, cfg] of Object.entries(PRESETS)) {
          output.error(`  ${name}: ${cfg.description}`);
        }
        process.exit(1);
      }
      output.info(`Using preset: ${options.preset} (${presetConfig.description})\n`);
    }

    // Quick mode: 1 question per tool for fast CI runs
    // Preset overrides quick mode if specified
    const maxQuestions = presetConfig?.maxQuestions
      ?? (options.quick
        ? 1
        : (interactiveConfig?.maxQuestions
          ?? (options.maxQuestions ? parseInt(options.maxQuestions, 10) : config.interview.maxQuestionsPerTool)));
    const timeout = options.timeout
      ? parseInt(options.timeout, 10)
      : config.interview.timeout;
    const outputDir = interactiveConfig?.outputDir ?? options.output ?? config.output.outputDir ?? '.';

    // Determine personas: preset > --security > --personas
    let selectedPersonas: Persona[];
    if (presetConfig) {
      selectedPersonas = presetConfig.personas;
    } else {
      const personaList = options.security ? 'technical,security' : (options.personas ?? 'technical');
      selectedPersonas = parsePersonas(personaList);
    }

    // Determine output format
    const wantsJson = interactiveConfig
      ? (interactiveConfig.outputFormat === 'json' || interactiveConfig.outputFormat === 'both')
      : (options.json || config.output.format === 'json' || config.output.format === 'both');

    // Determine baseline options
    const shouldSaveBaseline = interactiveConfig?.saveBaseline ?? !!options.saveBaseline;
    const baselinePath = interactiveConfig?.baselinePath
      ?? (typeof options.saveBaseline === 'string' ? options.saveBaseline : undefined);
    const compareBaselinePath = interactiveConfig?.compareBaseline ?? options.compareBaseline;

    // Display startup banner with all settings
    const serverCommand = `${command} ${args.join(' ')}`;
    const personaNames = selectedPersonas.map((p) => p.name);
    const banner = formatStartupBanner({
      serverCommand,
      provider: config.llm.provider,
      model,
      isQuality: isQualityMode,
      personas: personaNames,
      questionsPerTool: maxQuestions,
    });
    output.info(banner);
    output.newline();

    // Validate transport options
    const transportType = options.transport as 'stdio' | 'sse' | 'streamable-http';
    const isRemoteTransport = transportType === 'sse' || transportType === 'streamable-http';

    if (isRemoteTransport && !options.url) {
      output.error(`Error: --url is required when using --transport ${transportType}`);
      process.exit(1);
    }

    if (options.url && !isRemoteTransport) {
      output.error('Error: --url requires --transport sse or --transport streamable-http');
      process.exit(1);
    }

    // Initialize cost tracker for real usage tracking
    const costTracker = new CostTracker(model);

    // Initialize metrics collector for comprehensive observability
    resetMetricsCollector();
    const metricsCollector = getMetricsCollector();
    metricsCollector.startInterview();

    // Initialize cache for tool responses and LLM analysis
    // Cache is enabled by default unless --no-cache is specified
    const cacheEnabled = options.cache !== false;
    resetGlobalCache();
    const cache = getGlobalCache({ enabled: cacheEnabled });
    if (cacheEnabled) {
      output.info('Response caching enabled');
    }

    // Initialize clients
    const mcpClient = new MCPClient({
      timeout,
      debug: options.debug,
      transport: transportType,
    });
    let llmClient: LLMClient;

    // Create usage callback for cost and metrics tracking
    const onUsageCallback = (inputTokens: number, outputTokens: number) => {
      costTracker.addUsage(inputTokens, outputTokens);
      // Also record in metrics collector for comprehensive tracking
      metricsCollector.recordTokenUsage(
        config.llm.provider,
        model,
        inputTokens,
        outputTokens,
        'llm_call'
      );
    };

    try {
      // Use the LLM factory to create the appropriate provider client
      const baseLLMClient = createLLMClient({
        provider: config.llm.provider,
        model,
        apiKey: config.llm.apiKey,
        apiKeyEnvVar: config.llm.apiKeyEnvVar,
        baseUrl: config.llm.baseUrl,
        onUsage: onUsageCallback,
      });

      // Wrap with fallback client if enabled
      if (options.fallback) {
        output.info('Fallback mode enabled - will use Ollama if primary provider fails');
        llmClient = new FallbackLLMClient({
          providers: [
            {
              provider: config.llm.provider,
              model,
              apiKey: config.llm.apiKey,
              apiKeyEnvVar: config.llm.apiKeyEnvVar,
              baseUrl: config.llm.baseUrl,
            },
          ],
          useOllamaFallback: true,
          onUsage: onUsageCallback,
        });
      } else {
        llmClient = baseLLMClient;
      }

      // Wrap with token budget enforcement if max-tokens specified
      if (options.maxTokens) {
        const maxTokens = parseInt(options.maxTokens, 10);
        if (isNaN(maxTokens) || maxTokens < 1000) {
          output.error('Invalid --max-tokens value: must be a positive integer >= 1000');
          process.exit(1);
        }
        output.info(`Token budget enabled: ${maxTokens.toLocaleString()} tokens max`);
        llmClient = withTokenBudget(llmClient, {
          maxTotalTokens: maxTokens,
          onBudgetWarning: (used, total, pct) => {
            output.warn(`Token budget warning: ${pct.toFixed(0)}% used (${used.toLocaleString()}/${total.toLocaleString()})`);
          },
          onBudgetExceeded: (used, total) => {
            output.error(`Token budget exceeded: ${used.toLocaleString()}/${total.toLocaleString()} tokens`);
          },
        });
      }
    } catch (error) {
      output.error('Failed to initialize LLM client: ' + (error instanceof Error ? error.message : String(error)));
      output.error(`\nProvider: ${config.llm.provider}`);
      output.error('Make sure the appropriate API key environment variable is set:');
      output.error('  - OpenAI: OPENAI_API_KEY');
      output.error('  - Anthropic: ANTHROPIC_API_KEY');
      output.error('  - Ollama: No API key needed (ensure Ollama is running)');
      process.exit(1);
    }

    // Determine streaming early so we can suppress logs before MCP connection
    const enableStreaming = options.stream && !options.quiet;
    if (enableStreaming) {
      // Suppress JSON logs during streaming to keep output clean
      suppressLogs();
    }

    try {
      // Connect to MCP server
      if (isRemoteTransport) {
        output.info(`Connecting to remote MCP server via ${transportType}...`);
        await mcpClient.connectRemote(options.url, {
          transport: transportType,
          sessionId: options.sessionId,
        });
      } else {
        output.info('Connecting to MCP server...');
        await mcpClient.connect(command, args);
      }

      // Discovery phase
      output.info('Discovering capabilities...');
      const discovery = await discover(mcpClient, command, args);
      output.info(`Found ${discovery.tools.length} tools, ${discovery.prompts.length} prompts\n`);

      // Update metrics with discovery counts
      metricsCollector.updateInterviewCounters({
        toolsDiscovered: discovery.tools.length,
        personasUsed: selectedPersonas.length,
      });

      if (discovery.tools.length === 0) {
        output.info('No tools found. Nothing to interview.');
        metricsCollector.endInterview();
        await mcpClient.disconnect();
        return;
      }

      // Cost estimation
      if (options.estimateCost) {
        const estimate = estimateInterviewCost(
          model,
          discovery.tools.length,
          maxQuestions,
          selectedPersonas.length
        );
        output.info(formatCostEstimate(estimate));
        output.newline();
      }

      // Load custom scenarios if provided
      let customScenarios: ReturnType<typeof loadScenariosFromFile> | undefined;
      if (options.scenarios) {
        try {
          customScenarios = loadScenariosFromFile(options.scenarios);
          output.info(`Loaded ${customScenarios.toolScenarios.length} tool scenarios, ${customScenarios.promptScenarios.length} prompt scenarios from ${options.scenarios}`);
        } catch (error) {
          output.error(`Failed to load scenarios: ${error instanceof Error ? error.message : error}`);
          process.exit(1);
        }
      } else {
        // Try loading default scenarios file from output directory
        const defaultScenarios = tryLoadDefaultScenarios(outputDir);
        if (defaultScenarios) {
          customScenarios = defaultScenarios;
          output.info(`Auto-loaded ${customScenarios.toolScenarios.length} tool scenarios from ${DEFAULT_SCENARIOS_FILE}`);
        }
      }

      // Build workflow configuration
      let workflowConfig: WorkflowConfig | undefined;
      if (options.workflows || options.discoverWorkflows) {
        workflowConfig = {
          discoverWorkflows: options.discoverWorkflows,
          maxDiscoveredWorkflows: options.maxWorkflows
            ? parseInt(options.maxWorkflows, 10)
            : WORKFLOW.MAX_DISCOVERED_WORKFLOWS,
          enableStateTracking: options.workflowStateTracking,
        };

        // Load workflows from file if provided
        if (options.workflows) {
          try {
            const workflows = loadWorkflowsFromFile(options.workflows);
            workflowConfig.workflows = workflows;
            workflowConfig.workflowsFile = options.workflows;
            output.info(`Loaded ${workflows.length} workflow(s) from ${options.workflows}`);
          } catch (error) {
            output.error(`Failed to load workflows: ${error instanceof Error ? error.message : error}`);
            process.exit(1);
          }
        }

        if (options.discoverWorkflows) {
          output.info('Workflow discovery enabled - will analyze tools for workflow patterns');
        }
      }

      // Set up streaming display if enabled
      let streamingDisplay: StreamingDisplay | null = null;
      let streamingCallbacks: InterviewStreamingCallbacks | undefined;

      if (enableStreaming) {
        streamingDisplay = new StreamingDisplay({
          style: 'dim',
          maxWidth: 100,
        });

        streamingCallbacks = {
          onStart: (operation: string, _context?: string) => {
            // Parse operation to get a human-readable description
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
              case 'generate-prompt-questions':
              case 'analyze-prompt':
              case 'synthesize-prompt':
                prefix = context ? `\n  Processing prompt ${context}... ` : '\n  Processing prompt... ';
                break;
              case 'generate-resource-questions':
              case 'analyze-resource':
              case 'synthesize-resource':
                prefix = context ? `\n  Processing resource ${context}... ` : '\n  Processing resource... ';
                break;
              default:
                prefix = '\n  Processing... ';
            }
            streamingDisplay?.start(prefix);
          },
          onChunk: (chunk: string, _operation: string) => {
            streamingDisplay?.write(chunk);
          },
          onComplete: (_text: string, _operation: string) => {
            streamingDisplay?.finish(' [done]');
          },
          onError: (error: Error, _operation: string) => {
            streamingDisplay?.abort(`[error: ${error.message}]`);
          },
        };

        output.info('Streaming mode enabled - showing LLM output in real-time\n');
      }

      // Parse and validate persona concurrency
      let personaConcurrency: number | undefined;
      if (options.personaConcurrency) {
        personaConcurrency = parseInt(options.personaConcurrency, 10);
        if (isNaN(personaConcurrency) || personaConcurrency < 1) {
          output.error('Invalid --persona-concurrency value: must be a positive integer');
          process.exit(1);
        }
        if (personaConcurrency > INTERVIEW.MAX_PERSONA_CONCURRENCY) {
          output.warn(`High persona concurrency (${personaConcurrency}) may cause rate limiting or memory issues`);
        }
      }

      // Parse resource timeout option
      const resourceTimeout = options.resourceTimeout
        ? parseInt(options.resourceTimeout, 10)
        : undefined;

      // Interview phase
      const interviewer = new Interviewer(llmClient, {
        maxQuestionsPerTool: maxQuestions,
        timeout,
        skipErrorTests: config.interview.skipErrorTests ?? false,
        model,
        personas: selectedPersonas,
        customScenarios,
        customScenariosOnly: options.scenariosOnly,
        enableStreaming,
        streamingCallbacks,
        parallelPersonas: options.parallelPersonas,
        personaConcurrency,
        cache,
        resourceTimeout,
        workflowConfig,
      });

      // Extract server context from command line arguments
      const serverContext = extractServerContextFromArgs(command, args);
      if (serverContext.allowedDirectories && serverContext.allowedDirectories.length > 0) {
        output.info(`Detected allowed directories: ${serverContext.allowedDirectories.join(', ')}`);
      }
      interviewer.setServerContext(serverContext);

      // Set up progress display - disable progress bar when streaming to avoid display conflicts
      const progressBar = new InterviewProgressBar({ enabled: !options.verbose && !enableStreaming });

      const progressCallback = (progress: InterviewProgress) => {
        if (options.verbose) {
          switch (progress.phase) {
            case 'starting':
              output.info('Starting interview...');
              progressBar.start(progress.totalTools, progress.totalPersonas);
              break;
            case 'interviewing':
              output.info(`[${progress.currentPersona}] Interviewing: ${progress.currentTool} (${progress.toolsCompleted + 1}/${progress.totalTools})`);
              break;
            case 'workflows':
              if (progress.currentWorkflow) {
                output.info(`Executing workflow: ${progress.currentWorkflow} (${(progress.workflowsCompleted ?? 0) + 1}/${progress.totalWorkflows})`);
              } else {
                output.info('Executing workflows...');
              }
              break;
            case 'synthesizing':
              output.info('Synthesizing findings...');
              break;
            case 'complete':
              output.info('Interview complete!');
              break;
          }
        } else {
          // Use progress bar for non-verbose mode
          if (progress.phase === 'starting') {
            progressBar.start(progress.totalTools, progress.totalPersonas);
          } else if (progress.phase === 'interviewing' || progress.phase === 'workflows') {
            progressBar.update(progress);
          } else if (progress.phase === 'complete' || progress.phase === 'synthesizing') {
            progressBar.stop();
          }
        }
      };

      output.info('Starting interview...\n');
      const result = await interviewer.interview(mcpClient, discovery, progressCallback);

      // Ensure progress bar is stopped
      progressBar.stop();
      if (!options.verbose) {
        output.newline();
      }

      // Generate documentation
      output.info('Generating documentation...');

      // Ensure output directory exists
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

      // End metrics tracking
      const interviewMetrics = metricsCollector.endInterview();

      output.info('\nInterview complete!');
      output.info(`Duration: ${(result.metadata.durationMs / 1000).toFixed(1)}s`);
      output.info(`Tool calls: ${result.metadata.toolCallCount} (${result.metadata.errorCount} errors)`);

      // Display scenario results summary if scenarios were run
      if (result.scenarioResults && result.scenarioResults.length > 0) {
        const passed = result.scenarioResults.filter(r => r.passed).length;
        const failed = result.scenarioResults.length - passed;
        const statusIcon = failed === 0 ? '\u2713' : '\u2717';
        output.info(`\nCustom scenarios: ${passed}/${result.scenarioResults.length} passed ${statusIcon}`);

        // Show failed scenarios
        if (failed > 0) {
          output.info('\nFailed scenarios:');
          for (const scenarioResult of result.scenarioResults.filter(r => !r.passed)) {
            const scenario = scenarioResult.scenario;
            const toolOrPrompt = 'tool' in scenario ? scenario.tool : scenario.prompt;
            output.info(`  - ${toolOrPrompt}: ${scenario.description}`);
            if (scenarioResult.error) {
              output.info(`    Error: ${scenarioResult.error}`);
            }
            for (const assertion of scenarioResult.assertionResults.filter(a => !a.passed)) {
              output.info(`    Assertion failed: ${assertion.error}`);
            }
          }
        }
      }

      // Display workflow results summary if workflows were executed
      if (result.workflowResults && result.workflowResults.length > 0) {
        const successful = result.workflowResults.filter(wr => wr.success).length;
        const failed = result.workflowResults.length - successful;
        const statusIcon = failed === 0 ? '\u2713' : '\u2717';
        output.info(`\nWorkflows: ${successful}/${result.workflowResults.length} passed ${statusIcon}`);

        // Show failed workflows
        if (failed > 0) {
          output.info('\nFailed workflows:');
          for (const wr of result.workflowResults.filter(w => !w.success)) {
            output.info(`  - ${wr.workflow.name}: ${wr.failureReason ?? 'Unknown error'}`);
            if (wr.failedStepIndex !== undefined) {
              const failedStep = wr.workflow.steps[wr.failedStepIndex];
              output.info(`    Failed at step ${wr.failedStepIndex + 1}: ${failedStep?.tool ?? 'unknown'}`);
            }
          }
        }

        // Show workflow metadata summary
        if (result.metadata.workflows) {
          const wfMeta = result.metadata.workflows;
          if (wfMeta.discoveredCount > 0) {
            output.info(`  Discovered: ${wfMeta.discoveredCount} workflow(s)`);
          }
          if (wfMeta.loadedCount > 0) {
            output.info(`  Loaded from file: ${wfMeta.loadedCount} workflow(s)`);
          }
        }
      }

      // Show cost summary if requested (uses real token counts from API responses)
      if (options.showCost || options.estimateCost) {
        output.info('\n' + costTracker.formatSummary());
      }

      // Show detailed metrics if requested
      if (options.showMetrics && interviewMetrics) {
        output.info('\n--- Interview Metrics ---');
        output.info(`Tools discovered: ${interviewMetrics.toolsDiscovered}`);
        output.info(`Personas used: ${interviewMetrics.personasUsed}`);
        output.info(`LLM calls made: ${interviewMetrics.llmCallsMade}`);
        output.info(`Total input tokens: ${interviewMetrics.totalInputTokens.toLocaleString()}`);
        output.info(`Total output tokens: ${interviewMetrics.totalOutputTokens.toLocaleString()}`);
        if (interviewMetrics.totalDurationMs) {
          output.info(`Total duration: ${(interviewMetrics.totalDurationMs / 1000).toFixed(1)}s`);
        }
        if (interviewMetrics.totalCostUSD > 0) {
          output.info(`Estimated cost: $${interviewMetrics.totalCostUSD.toFixed(4)}`);
        }
      }

      // Show cache statistics if caching is enabled
      if (cacheEnabled) {
        const cacheStats = cache.getStats();
        const totalCacheOps = cacheStats.hits + cacheStats.misses;
        if (totalCacheOps > 0) {
          output.info('\n--- Cache Statistics ---');
          output.info(`Cache hits: ${cacheStats.hits}`);
          output.info(`Cache misses: ${cacheStats.misses}`);
          output.info(`Hit rate: ${cacheStats.hitRate.toFixed(1)}%`);
          output.info(`Entries stored: ${cacheStats.entries}`);
          if (cacheStats.hits > 0) {
            output.info(`Estimated savings: ${cacheStats.hits} LLM/tool calls avoided`);
          }
        }
      }

      // Save baseline if requested
      if (shouldSaveBaseline) {
        const serverCommand = `${command} ${args.join(' ')}`;
        const finalBaselinePath = baselinePath ?? join(outputDir, 'bellwether-baseline.json');

        if (options.cloudFormat) {
          // Save in cloud-ready format
          const cloudBaseline = createCloudBaseline(result, serverCommand);
          writeFileSync(finalBaselinePath, JSON.stringify(cloudBaseline, null, 2));
          output.info(`\nCloud baseline saved: ${finalBaselinePath}`);
        } else {
          // Save in local format
          const baseline = createBaseline(result, serverCommand);
          saveBaseline(baseline, finalBaselinePath);
          output.info(`\nBaseline saved: ${finalBaselinePath}`);
        }
      }

      // Compare against baseline if requested
      if (compareBaselinePath) {
        if (!existsSync(compareBaselinePath)) {
          output.error(`\nBaseline file not found: ${compareBaselinePath}`);
          process.exit(1);
        }

        const serverCommand = `${command} ${args.join(' ')}`;
        const previousBaseline = loadBaseline(compareBaselinePath);
        const currentBaseline = createBaseline(result, serverCommand);

        // Build compare options from CLI flags (with config file fallbacks)
        const compareOptions: CompareOptions = {
          strict: options.strict ?? config.drift?.strict ?? false,
          minConfidence: options.minConfidence
            ? parseInt(options.minConfidence, 10)
            : config.drift?.minConfidence,
          confidenceThreshold: options.confidenceThreshold
            ? parseInt(options.confidenceThreshold, 10)
            : config.drift?.confidenceThreshold ?? CONFIDENCE_THRESHOLDS.ci,
        };

        const diff = compareBaselines(previousBaseline, currentBaseline, compareOptions);

        output.info('\n--- Behavioral Diff ---');
        if (options.strict) {
          output.info('(Strict mode: only structural changes reported)\n');
        }
        output.info(formatDiffText(diff));

        // Show confidence summary
        if (diff.confidence) {
          output.info('\n--- Confidence Summary ---');
          output.info(`Overall: ${diff.confidence.overallScore}% (min: ${diff.confidence.minScore}%, max: ${diff.confidence.maxScore}%)`);
          output.info(`Structural changes: ${diff.confidence.structuralCount}`);
          output.info(`Semantic changes: ${diff.confidence.semanticCount}`);
        }

        const shouldFailOnDrift = options.failOnDrift ?? config.drift?.failOnDrift ?? false;
        if (shouldFailOnDrift) {
          // Get the effective confidence threshold
          const confThreshold = compareOptions.confidenceThreshold ?? CONFIDENCE_THRESHOLDS.ci;

          if (diff.severity === 'breaking') {
            // Check if breaking changes meet confidence threshold
            if (meetsConfidenceRequirements(diff, confThreshold)) {
              output.error(`\nBreaking changes detected (confidence >= ${confThreshold}%)!`);
              process.exit(1);
            } else {
              output.warn(`\nBreaking changes detected but confidence < ${confThreshold}%`);
              output.warn('Consider these changes may be LLM non-determinism. Use --strict for deterministic results.');
              // Still exit with error for breaking changes, but different code
              process.exit(1);
            }
          } else if (diff.severity === 'warning') {
            output.warn('\nWarning-level changes detected.');
            process.exit(1);
          }
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      output.error('\n--- Interview Failed ---');
      output.error(`Error: ${errorMessage}`);

      // Provide helpful context for common errors
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection refused')) {
        output.error('\nPossible causes:');
        output.error('  - The MCP server is not running');
        output.error('  - The server address/port is incorrect');
        output.error('  - A firewall is blocking the connection');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        output.error('\nPossible causes:');
        output.error('  - The MCP server is taking too long to respond');
        output.error('  - Try increasing --timeout value');
        output.error('  - The server may be overloaded or stuck');
      } else if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
        output.error('\nPossible causes:');
        output.error('  - The server command was not found');
        output.error('  - Check that the command is installed and in PATH');
        output.error('  - Try using an absolute path to the server executable');
      } else if (errorMessage.includes('API') || errorMessage.includes('API_KEY')) {
        output.error('\nPossible causes:');
        output.error('  - Missing or invalid API key');
        output.error('  - Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable');
        output.error('  - Or configure apiKeyEnvVar in bellwether.yaml');
      }

      process.exit(1);
    } finally {
      // Restore log level if it was suppressed for streaming
      // (restoreLogLevel is safe to call even if logs weren't suppressed)
      restoreLogLevel();
      await mcpClient.disconnect();
    }
  });
