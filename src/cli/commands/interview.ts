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
import {
  promptForConfig,
  displayConfigSummary,
  createPauseController,
  setupInteractiveKeyboard,
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
import * as output from '../output.js';

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
  .option('--timeout <ms>', 'Timeout for tool calls in milliseconds', '60000')
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
    // Load configuration
    const config = loadConfig(options.config);

    // Handle interactive mode
    let interactiveConfig: InteractiveConfig | undefined;
    let cleanupKeyboard: (() => void) | undefined;

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

      // Set up keyboard listener for pause/resume
      const pauseController = createPauseController();
      cleanupKeyboard = setupInteractiveKeyboard(pauseController);

      // Store pause controller in options for later use
      (options as Record<string, unknown>)._pauseController = pauseController;
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

    // Initialize clients
    const mcpClient = new MCPClient({
      timeout,
      debug: options.debug,
      transport: transportType,
    });
    let llmClient: LLMClient;

    try {
      // Use the LLM factory to create the appropriate provider client
      // Pass usage callback to track actual token consumption
      llmClient = createLLMClient({
        provider: config.llm.provider,
        model,
        apiKey: config.llm.apiKey,
        apiKeyEnvVar: config.llm.apiKeyEnvVar,
        baseUrl: config.llm.baseUrl,
        onUsage: (inputTokens, outputTokens) => {
          costTracker.addUsage(inputTokens, outputTokens);
        },
      });
    } catch (error) {
      output.error('Failed to initialize LLM client: ' + (error instanceof Error ? error.message : String(error)));
      output.error(`\nProvider: ${config.llm.provider}`);
      output.error('Make sure the appropriate API key environment variable is set:');
      output.error('  - OpenAI: OPENAI_API_KEY');
      output.error('  - Anthropic: ANTHROPIC_API_KEY');
      output.error('  - Ollama: No API key needed (ensure Ollama is running)');
      process.exit(1);
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

      if (discovery.tools.length === 0) {
        output.info('No tools found. Nothing to interview.');
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

      // Interview phase
      const interviewer = new Interviewer(llmClient, {
        maxQuestionsPerTool: maxQuestions,
        timeout,
        skipErrorTests: config.interview.skipErrorTests ?? false,
        model,
        personas: selectedPersonas,
        customScenarios,
        customScenariosOnly: options.scenariosOnly,
      });

      // Extract server context from command line arguments
      const serverContext = extractServerContextFromArgs(command, args);
      if (serverContext.allowedDirectories && serverContext.allowedDirectories.length > 0) {
        output.info(`Detected allowed directories: ${serverContext.allowedDirectories.join(', ')}`);
      }
      interviewer.setServerContext(serverContext);

      // Set up progress display
      const progressBar = new InterviewProgressBar({ enabled: !options.verbose });

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
          } else if (progress.phase === 'interviewing') {
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

      // Show cost summary if requested (uses real token counts from API responses)
      if (options.showCost || options.estimateCost) {
        output.info('\n' + costTracker.formatSummary());
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
      await mcpClient.disconnect();
      // Clean up interactive keyboard listener
      if (cleanupKeyboard) {
        cleanupKeyboard();
      }
    }
  });
