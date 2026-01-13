import { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { createLLMClient, type LLMClient } from '../../llm/index.js';
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
} from '../../baseline/index.js';
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

  // Filesystem servers - look for directory arguments
  if (fullCommand.includes('filesystem') || fullCommand.includes('file-system')) {
    // Arguments that look like absolute paths are likely allowed directories
    for (const arg of args) {
      if (arg.startsWith('/') && !arg.startsWith('--')) {
        context.allowedDirectories!.push(arg);
      }
    }
    if (context.allowedDirectories!.length > 0) {
      context.hints!.push(`Filesystem server with allowed directories: ${context.allowedDirectories!.join(', ')}`);
    }
  }

  // Database servers - might have connection strings
  if (fullCommand.includes('postgres') || fullCommand.includes('mysql') || fullCommand.includes('sqlite')) {
    context.hints!.push('Database server - SQL operations expected');
  }

  // Any argument that looks like an absolute path could be a constraint
  if (context.allowedDirectories!.length === 0) {
    for (const arg of args) {
      if (arg.startsWith('/') && !arg.startsWith('--')) {
        context.allowedDirectories!.push(arg);
      }
    }
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
  .option('-q, --quick', 'Quick mode for CI: 1 question per tool, cheaper model')
  .action(async (command: string | undefined, args: string[], options) => {
    // Load configuration
    const config = loadConfig(options.config);

    // Handle interactive mode
    let interactiveConfig: InteractiveConfig | undefined;
    let cleanupKeyboard: (() => void) | undefined;

    if (options.interactive || !command) {
      // If no command provided, enter interactive mode
      if (!command && !options.interactive) {
        console.log('No server command provided. Entering interactive mode...\n');
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
      console.error('Error: Server command is required.');
      console.error('Usage: bellwether interview <command> [args...] or bellwether interview --interactive');
      process.exit(1);
    }

    // Quick mode defaults for CI: cheap models, minimal questions
    const QUICK_MODE_MODELS: Record<string, string> = {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-5-haiku-20241022',
      ollama: 'llama3.2',
    };

    // Override with CLI options or interactive config
    const model = options.quick
      ? (QUICK_MODE_MODELS[config.llm.provider] ?? config.llm.model)
      : (options.model ?? config.llm.model);
    const maxQuestions = options.quick
      ? 1
      : (interactiveConfig?.maxQuestions
        ?? (options.maxQuestions ? parseInt(options.maxQuestions, 10) : config.interview.maxQuestionsPerTool));
    const timeout = options.timeout
      ? parseInt(options.timeout, 10)
      : config.interview.timeout;
    const outputDir = interactiveConfig?.outputDir ?? options.output ?? config.output.outputDir ?? '.';

    // Determine output format
    const wantsJson = interactiveConfig
      ? (interactiveConfig.outputFormat === 'json' || interactiveConfig.outputFormat === 'both')
      : (options.json || config.output.format === 'json' || config.output.format === 'both');

    // Determine baseline options
    const shouldSaveBaseline = interactiveConfig?.saveBaseline ?? !!options.saveBaseline;
    const baselinePath = interactiveConfig?.baselinePath
      ?? (typeof options.saveBaseline === 'string' ? options.saveBaseline : undefined);
    const compareBaselinePath = interactiveConfig?.compareBaseline ?? options.compareBaseline;

    console.log('Bellwether - MCP Server Documentation Generator\n');
    if (options.quick) {
      console.log('Quick mode enabled (fast CI mode)\n');
    }
    console.log(`Server: ${command} ${args.join(' ')}`);
    console.log(`Provider: ${config.llm.provider}`);
    console.log(`Model: ${model}`);
    console.log(`Max questions per tool: ${maxQuestions}`);
    if (interactiveConfig?.selectedPersonas) {
      console.log(`Personas: ${interactiveConfig.selectedPersonas.join(', ')}`);
    }
    console.log('');

    // Initialize cost tracker for real usage tracking
    const costTracker = new CostTracker(model);

    // Initialize clients
    const mcpClient = new MCPClient({ timeout, debug: options.debug });
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
      console.error('Failed to initialize LLM client:', error instanceof Error ? error.message : error);
      console.error(`\nProvider: ${config.llm.provider}`);
      console.error('Make sure the appropriate API key environment variable is set:');
      console.error('  - OpenAI: OPENAI_API_KEY');
      console.error('  - Anthropic: ANTHROPIC_API_KEY');
      console.error('  - Ollama: No API key needed (ensure Ollama is running)');
      process.exit(1);
    }

    try {
      // Connect to MCP server
      console.log('Connecting to MCP server...');
      await mcpClient.connect(command, args);

      // Discovery phase
      console.log('Discovering capabilities...');
      const discovery = await discover(mcpClient, command, args);
      console.log(`Found ${discovery.tools.length} tools, ${discovery.prompts.length} prompts\n`);

      if (discovery.tools.length === 0) {
        console.log('No tools found. Nothing to interview.');
        await mcpClient.disconnect();
        return;
      }

      // Cost estimation
      if (options.estimateCost) {
        const personas = config.interview.personas?.length ?? 3;
        const estimate = estimateInterviewCost(
          model,
          discovery.tools.length,
          maxQuestions,
          personas
        );
        console.log(formatCostEstimate(estimate));
        console.log('');
      }

      // Interview phase
      const interviewer = new Interviewer(llmClient, {
        maxQuestionsPerTool: maxQuestions,
        timeout,
        skipErrorTests: config.interview.skipErrorTests ?? false,
        model,
      });

      // Extract server context from command line arguments
      const serverContext = extractServerContextFromArgs(command, args);
      if (serverContext.allowedDirectories && serverContext.allowedDirectories.length > 0) {
        console.log(`Detected allowed directories: ${serverContext.allowedDirectories.join(', ')}`);
      }
      interviewer.setServerContext(serverContext);

      const progressCallback = (progress: InterviewProgress) => {
        if (options.verbose) {
          switch (progress.phase) {
            case 'starting':
              console.log('Starting interview...');
              break;
            case 'interviewing':
              console.log(`Interviewing tool: ${progress.currentTool} (${progress.toolsCompleted + 1}/${progress.totalTools})`);
              break;
            case 'synthesizing':
              console.log('Synthesizing findings...');
              break;
            case 'complete':
              console.log('Interview complete!');
              break;
          }
        } else {
          // Simple progress indicator - clear line fully to avoid leftover characters
          const totalTools = progress.totalTools * progress.totalPersonas;
          const toolsDone = (progress.personasCompleted * progress.totalTools) + progress.toolsCompleted;
          const message = `\rInterviewing: ${toolsDone}/${totalTools} tools, ${progress.questionsAsked} questions asked`;
          process.stdout.write(message.padEnd(80));
        }
      };

      console.log('Starting interview...\n');
      const result = await interviewer.interview(mcpClient, discovery, progressCallback);

      if (!options.verbose) {
        console.log('\n');
      }

      // Generate documentation
      console.log('Generating documentation...');

      const agentsMd = generateAgentsMd(result);
      const agentsMdPath = join(outputDir, 'AGENTS.md');
      writeFileSync(agentsMdPath, agentsMd);
      console.log(`Written: ${agentsMdPath}`);

      if (wantsJson) {
        const jsonReport = generateJsonReport(result);
        const jsonPath = join(outputDir, 'bellwether-report.json');
        writeFileSync(jsonPath, jsonReport);
        console.log(`Written: ${jsonPath}`);
      }

      console.log('\nInterview complete!');
      console.log(`Duration: ${(result.metadata.durationMs / 1000).toFixed(1)}s`);
      console.log(`Tool calls: ${result.metadata.toolCallCount} (${result.metadata.errorCount} errors)`);

      // Show cost summary if requested (uses real token counts from API responses)
      if (options.showCost || options.estimateCost) {
        console.log('\n' + costTracker.formatSummary());
      }

      // Save baseline if requested
      if (shouldSaveBaseline) {
        const serverCommand = `${command} ${args.join(' ')}`;
        const finalBaselinePath = baselinePath ?? join(outputDir, 'bellwether-baseline.json');

        if (options.cloudFormat) {
          // Save in cloud-ready format
          const cloudBaseline = createCloudBaseline(result, serverCommand);
          writeFileSync(finalBaselinePath, JSON.stringify(cloudBaseline, null, 2));
          console.log(`\nCloud baseline saved: ${finalBaselinePath}`);
        } else {
          // Save in local format
          const baseline = createBaseline(result, serverCommand);
          saveBaseline(baseline, finalBaselinePath);
          console.log(`\nBaseline saved: ${finalBaselinePath}`);
        }
      }

      // Compare against baseline if requested
      if (compareBaselinePath) {
        if (!existsSync(compareBaselinePath)) {
          console.error(`\nBaseline file not found: ${compareBaselinePath}`);
          process.exit(1);
        }

        const serverCommand = `${command} ${args.join(' ')}`;
        const previousBaseline = loadBaseline(compareBaselinePath);
        const currentBaseline = createBaseline(result, serverCommand);
        const diff = compareBaselines(previousBaseline, currentBaseline);

        console.log('\n--- Behavioral Diff ---');
        console.log(formatDiffText(diff));

        if (options.failOnDrift) {
          if (diff.severity === 'breaking') {
            console.error('\nBreaking changes detected!');
            process.exit(1);
          } else if (diff.severity === 'warning') {
            console.error('\nWarning-level changes detected.');
            process.exit(1);
          }
        }
      }

    } catch (error) {
      console.error('\nInterview failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      await mcpClient.disconnect();
      // Clean up interactive keyboard listener
      if (cleanupKeyboard) {
        cleanupKeyboard();
      }
    }
  });
