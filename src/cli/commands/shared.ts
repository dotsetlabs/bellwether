/**
 * Shared utilities for check and explore commands.
 *
 * This module contains code that is common to both commands to avoid duplication
 * and ensure consistent behavior.
 */

import { mkdirSync } from 'fs';
import type { ServerContext } from '../../interview/types.js';
import type { BellwetherConfig } from '../../config/loader.js';
import type { DiscoveryResult } from '../../discovery/types.js';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { getMetricsCollector, resetMetricsCollector, type MetricsCollector } from '../../metrics/collector.js';
import { getGlobalCache, resetGlobalCache, type ResponseCache } from '../../cache/response-cache.js';
import { loadScenariosFromFile, tryLoadDefaultScenarios, DEFAULT_SCENARIOS_FILE, type LoadedScenarios } from '../../scenarios/index.js';
import * as output from '../output.js';

/**
 * Extract server context from command and arguments.
 *
 * Analyzes the server command to provide hints about the server type
 * (filesystem, database, git, etc.) and extracts path arguments for
 * allowed directories.
 */
export function extractServerContextFromArgs(command: string, args: string[]): ServerContext {
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
export function isCI(): boolean {
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

/**
 * Common setup context for both check and explore commands.
 */
export interface CommandSetupContext {
  mcpClient: MCPClient;
  discovery: DiscoveryResult;
  metricsCollector: MetricsCollector;
  cache: ResponseCache;
  fullServerCommand: string;
  customScenarios?: LoadedScenarios;
}

/**
 * Options for setting up a command.
 */
export interface SetupCommandOptions {
  serverCommand: string;
  args: string[];
  config: BellwetherConfig;
  verbose: boolean;
  personaCount?: number; // For metrics tracking
}

/**
 * Set up common infrastructure for check and explore commands.
 *
 * This handles the shared setup logic:
 * - Initializing metrics collector
 * - Initializing cache
 * - Creating MCP client
 * - Connecting to server
 * - Discovering capabilities
 * - Loading custom scenarios
 */
export async function setupCommandInfrastructure(options: SetupCommandOptions): Promise<CommandSetupContext> {
  const { serverCommand, args, config, verbose, personaCount = 0 } = options;

  // Initialize metrics collector
  resetMetricsCollector();
  const metricsCollector = getMetricsCollector();
  metricsCollector.startInterview();

  // Initialize cache
  resetGlobalCache();
  const cacheEnabled = config.cache.enabled;
  const cache = getGlobalCache({ enabled: cacheEnabled });
  if (cacheEnabled && verbose) {
    output.info('Response caching enabled');
  }

  // Initialize MCP client
  const mcpClient = new MCPClient({
    timeout: config.server.timeout,
    debug: config.logging.level === 'debug',
    transport: 'stdio',
  });

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
    personasUsed: personaCount,
  });

  // Load custom scenarios
  const outputDir = config.output.dir;
  let customScenarios: LoadedScenarios | undefined;
  if (config.scenarios.path) {
    customScenarios = loadScenariosFromFile(config.scenarios.path);
    output.info(`Loaded ${customScenarios.toolScenarios.length} tool scenarios from ${config.scenarios.path}`);
  } else {
    const defaultScenarios = tryLoadDefaultScenarios(outputDir);
    if (defaultScenarios) {
      customScenarios = defaultScenarios;
      output.info(`Auto-loaded ${customScenarios.toolScenarios.length} scenarios from ${DEFAULT_SCENARIOS_FILE}`);
    }
  }

  const fullServerCommand = `${serverCommand} ${args.join(' ')}`.trim();

  return {
    mcpClient,
    discovery,
    metricsCollector,
    cache,
    fullServerCommand,
    customScenarios,
  };
}

/**
 * Ensure output directories exist.
 */
export function ensureOutputDirs(outputDir: string, docsDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  if (docsDir !== outputDir) {
    mkdirSync(docsDir, { recursive: true });
  }
}

/**
 * Display scenario results summary.
 */
export function displayScenarioResults(scenarioResults: Array<{ passed: boolean; scenario: { tool?: string; prompt?: string; description: string }; error?: string }>): void {
  if (!scenarioResults || scenarioResults.length === 0) {
    return;
  }

  const passed = scenarioResults.filter((r) => r.passed).length;
  const failed = scenarioResults.length - passed;
  const statusIcon = failed === 0 ? '\u2713' : '\u2717';
  output.info(`\nCustom scenarios: ${passed}/${scenarioResults.length} passed ${statusIcon}`);

  if (failed > 0) {
    output.info('\nFailed scenarios:');
    for (const scenarioResult of scenarioResults.filter((r) => !r.passed)) {
      const scenario = scenarioResult.scenario;
      const toolOrPrompt = scenario.tool || scenario.prompt || 'unknown';
      output.info(`  - ${toolOrPrompt}: ${scenario.description}`);
      if (scenarioResult.error) {
        output.info(`    Error: ${scenarioResult.error}`);
      }
    }
  }
}

/**
 * Handle common error messages and provide helpful diagnostics.
 */
export function handleCommandError(error: unknown, commandName: 'check' | 'explore'): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const title = commandName === 'check' ? 'Check Failed' : 'Exploration Failed';

  output.error(`\n--- ${title} ---`);
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

  process.exit(1);
}
