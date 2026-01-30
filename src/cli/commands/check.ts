/**
 * Check command - Schema validation and drift detection for MCP servers.
 *
 * Purpose: Fast, free, deterministic checking of MCP server contracts.
 * Output: Documentation and/or JSON report (controlled by output.format)
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
import { loadConfig, ConfigNotFoundError, parseCommandString, type BellwetherConfig } from '../../config/loader.js';
import { validateConfigForCheck, getConfigWarnings } from '../../config/validator.js';
import {
  createBaseline,
  loadBaseline,
  saveBaseline,
  getToolFingerprints,
  toToolCapability,
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
  runSecurityTests,
  parseSecurityCategories,
  getAllSecurityCategories,
  type BehavioralDiff,
  type SeverityConfig,
  type ChangeSeverity,
  type BehavioralBaseline,
  type SecurityCategory,
  type SecurityFingerprint,
} from '../../baseline/index.js';
import { convertAssertions } from '../../baseline/converter.js';
import { getMetricsCollector, resetMetricsCollector } from '../../metrics/collector.js';
import { getGlobalCache, resetGlobalCache } from '../../cache/response-cache.js';
import { InterviewProgressBar, formatCheckBanner } from '../utils/progress.js';
import {
  buildCheckSummary,
  colorizeConfidence,
  formatConfidenceLevel,
  formatToolResultLine,
} from '../output/terminal-reporter.js';
import { loadScenariosFromFile, tryLoadDefaultScenarios, DEFAULT_SCENARIOS_FILE } from '../../scenarios/index.js';
import {
  loadWorkflowsFromFile,
  tryLoadDefaultWorkflows,
  DEFAULT_WORKFLOWS_FILE,
  WorkflowExecutor,
  generateWorkflowsFromTools,
  generateWorkflowYamlContent,
  type Workflow,
  type WorkflowResult,
} from '../../workflow/index.js';
import * as output from '../output.js';
import { extractServerContextFromArgs } from '../utils/server-context.js';
import { configureLogger, type LogLevel } from '../../logging/logger.js';
import {
  EXIT_CODES,
  SEVERITY_TO_EXIT_CODE,
  PATHS,
  SECURITY_TESTING,
  CHECK_SAMPLING,
  WORKFLOW,
  REPORT_SCHEMAS,
  PERCENTAGE_CONVERSION,
} from '../../constants.js';


export const checkCommand = new Command('check')
  .description('Check MCP server schema and detect drift (free, fast, deterministic)')
  .allowUnknownOption() // Allow server flags like -y for npx to pass through
  .argument('[server-command]', 'Server command (overrides config)')
  .argument('[args...]', 'Server arguments')
  .option('-c, --config <path>', 'Path to config file', PATHS.DEFAULT_CONFIG_FILENAME)
  .option('--fail-on-drift', 'Exit with error if drift detected (overrides config)')
  .option('--accept-drift', 'Accept detected drift as intentional and update baseline')
  .option('--accept-reason <reason>', 'Reason for accepting drift (used with --accept-drift)')
  .option('--format <format>', 'Diff output format: text, json, compact, github, markdown, junit, sarif')
  .option('--min-severity <level>', 'Minimum severity to report (overrides config): none, info, warning, breaking')
  .option('--fail-on-severity <level>', 'Fail threshold (overrides config): none, info, warning, breaking')
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
    // If command string contains spaces and no separate args, parse it
    let serverCommand = serverCommandArg || config.server.command;
    let args = serverArgs.length > 0 ? serverArgs : config.server.args;

    // Handle command strings like "npx @package" in config when args is empty
    if (!serverCommandArg && args.length === 0 && serverCommand.includes(' ')) {
      const parsed = parseCommandString(serverCommand);
      serverCommand = parsed.command;
      args = parsed.args;
    }

    const transport = config.server.transport ?? 'stdio';
    const remoteUrl = config.server.url?.trim();
    const remoteSessionId = config.server.sessionId?.trim();

    // Validate config for check
    try {
      validateConfigForCheck(config, serverCommand);
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.ERROR);
    }

    const warnings = getConfigWarnings(config);
    if (warnings.length > 0) {
      output.warn('Configuration warnings:');
      for (const warning of warnings) {
        output.warn(`  - ${warning}`);
      }
      output.newline();
    }

    // Extract settings from config
    const timeout = config.server.timeout;
    const outputDir = config.output.dir;
    const docsDir = config.output.docsDir;
    const cacheEnabled = config.cache.enabled;
    const verbose = config.logging.verbose;
    const logLevel = config.logging.level;
    const outputFormat = config.output.format;

    if (!process.env.BELLWETHER_LOG_OVERRIDE) {
      // Configure logger based on config settings
      // For CLI output, suppress internal pino logs unless verbose mode is on
      // User-facing output uses the output module, not pino
      const effectiveLogLevel: LogLevel = verbose ? (logLevel as LogLevel) : 'silent';
      configureLogger({ level: effectiveLogLevel });
    }

    // Resolve baseline options from config (--fail-on-drift CLI flag can override)
    const baselinePath = config.baseline.comparePath;
    const saveBaselinePath = config.baseline.savePath;
    const failOnDrift = options.failOnDrift ? true : config.baseline.failOnDrift;

    // Build severity config (CLI options override config file)
    const severityConfig: SeverityConfig = {
      minimumSeverity: (options.minSeverity as ChangeSeverity) ?? config.baseline.severity.minimumSeverity,
      failOnSeverity: (options.failOnSeverity as ChangeSeverity) ?? config.baseline.severity.failOnSeverity,
      suppressWarnings: config.baseline.severity.suppressWarnings,
      aspectOverrides: config.baseline.severity.aspectOverrides as SeverityConfig['aspectOverrides'],
    };

    // Resolve check options from config (no CLI overrides for these)
    const incrementalEnabled = config.check.incremental;
    const incrementalCacheHours = config.check.incrementalCacheHours;
    const parallelEnabled = config.check.parallel;
    const parallelWorkers = config.check.parallelWorkers;
    const performanceThreshold = config.check.performanceThreshold / PERCENTAGE_CONVERSION.DIVISOR;
    const diffFormat = options.format ?? config.check.diffFormat;

    // Resolve security options from config
    const securityEnabled = config.check.security.enabled;
    let securityCategories: SecurityCategory[] = config.check.security.categories as SecurityCategory[];
    // Validate security categories
    try {
      securityCategories = parseSecurityCategories(securityCategories.join(','));
    } catch (error) {
      output.error(`Invalid security categories in config: ${error instanceof Error ? error.message : error}`);
      output.info(`Valid categories: ${getAllSecurityCategories().join(', ')}`);
      process.exit(EXIT_CODES.ERROR);
    }

    // Resolve sampling and confidence options from config
    // Honor user's minSamples exactly - don't override with targetConfidence minimum
    // If minSamples is below confidence threshold, the confidence level will reflect that
    // but the user's choice is respected
    const targetConfidence = config.check.sampling.targetConfidence as 'low' | 'medium' | 'high';
    const minSamples = config.check.sampling.minSamples;
    const failOnLowConfidence = config.check.sampling.failOnLowConfidence;

    // Resolve example output options from config
    const fullExamples = config.output.examples.full;
    const exampleLength = config.output.examples.maxLength;
    const maxExamplesPerTool = config.output.examples.maxPerTool;

    const serverIdentifier = transport === 'stdio'
      ? `${serverCommand} ${args.join(' ')}`.trim()
      : (remoteUrl ?? 'unknown');

    // Display startup banner
    const banner = formatCheckBanner({
      serverCommand: serverIdentifier,
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
      transport,
    });

    try {
      // Connect to MCP server
      output.info('Connecting to MCP server...');
      if (transport === 'stdio') {
        await mcpClient.connect(serverCommand, args, config.server.env);
      } else {
        if (!remoteUrl) {
          output.error('No server URL specified for remote transport');
          process.exit(EXIT_CODES.ERROR);
        }
        await mcpClient.connectRemote(remoteUrl, {
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

      // Output discovery warnings (Issue D: anomaly detection)
      if (discovery.warnings && discovery.warnings.length > 0) {
        for (const warning of discovery.warnings) {
          output.warn(`⚠ ${warning.message}`);
        }
        output.newline();
      }

      // Output transport errors from discovery
      if (discovery.transportErrors && discovery.transportErrors.length > 0) {
        output.warn('Transport errors during discovery:');
        for (const err of discovery.transportErrors.slice(0, 3)) {
          const typeLabel = err.category.replace(/_/g, ' ');
          output.warn(`  ✗ ${typeLabel}: ${err.message.substring(0, 100)}`);
        }
        if (discovery.transportErrors.length > 3) {
          output.warn(`  ... and ${discovery.transportErrors.length - 3} more`);
        }
        output.newline();
      }

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
          const result = analyzeForIncremental(
            discovery.tools,
            incrementalBaseline,
            { maxCacheAgeHours: incrementalCacheHours }
          );
          incrementalResult = result;

          const summary = formatIncrementalSummary(result.changeSummary);
          output.info(`Incremental analysis: ${summary}`);

          if (result.toolsToTest.length === 0) {
            output.info('All tools unchanged. Using cached results.');
            // Still need to generate output with cached data
            // Skip to comparison section
          } else {
            output.info(`Testing ${result.toolsToTest.length} tools (${result.toolsToSkip.length} cached)\n`);
            // Filter discovery to only include tools that need testing
            discovery.tools = discovery.tools.filter(t =>
              result.toolsToTest.includes(t.name)
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
      const fullServerCommand = serverIdentifier;

      // Validate parallel workers (already resolved from config + CLI override)
      let toolConcurrency = parallelWorkers;
      if (toolConcurrency < 1) {
        toolConcurrency = 4;
      } else if (toolConcurrency > 10) {
        output.warn('Tool concurrency capped at 10');
        toolConcurrency = 10;
      }

      if (parallelEnabled && !config.check.statefulTesting.enabled) {
        output.info(`Parallel tool testing enabled (${toolConcurrency} workers)`);
      }

      if (securityEnabled) {
        output.info(`Security testing enabled (${securityCategories.length} categories)`);
      }

      if (config.check.rateLimit.enabled) {
        output.info(`Rate limiting enabled (${config.check.rateLimit.requestsPerSecond} req/s, burst ${config.check.rateLimit.burstLimit})`);
      }

      if (config.check.assertions.enabled) {
        output.info(`Response assertions enabled (strict: ${config.check.assertions.strict ? 'on' : 'off'})`);
      }

      if (config.check.statefulTesting.enabled) {
        output.info(`Stateful testing enabled (max chain length: ${config.check.statefulTesting.maxChainLength})`);
      }

      const interviewer = new Interviewer(null, {
        maxQuestionsPerTool: minSamples, // Use configured min samples for test count
        timeout,
        skipErrorTests: false,
        model: 'check', // Marker for check mode
        // Note: personas defaults to DEFAULT_PERSONAS, which is needed for stats tracking
        customScenarios,
        customScenariosOnly: config.scenarios.only,
        enableStreaming: false,
        parallelPersonas: false,
        parallelTools: parallelEnabled,
        toolConcurrency,
        cache,
        checkMode: true, // Required when passing null for LLM
        serverCommand: fullServerCommand,
        warmupRuns: config.check.warmupRuns,
        statefulTesting: config.check.statefulTesting,
        externalServices: config.check.externalServices,
        assertions: config.check.assertions,
        rateLimit: config.check.rateLimit,
      });

      // Log sampling configuration
      if (minSamples > CHECK_SAMPLING.DEFAULT_MIN_SAMPLES) {
        output.info(`Sampling: ${minSamples} samples per tool (target confidence: ${targetConfidence})`);
      }

      // Extract server context
      if (transport === 'stdio') {
        const serverContext = extractServerContextFromArgs(serverCommand, args);
        if (serverContext.allowedDirectories && serverContext.allowedDirectories.length > 0) {
          output.info(`Detected allowed directories: ${serverContext.allowedDirectories.join(', ')}`);
        }
        interviewer.setServerContext(serverContext);
      }

      // Set up progress display
      const progressBar = new InterviewProgressBar({ enabled: !verbose });

      const reportedTools = new Set<string>();
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

        const toolSummary = progress.lastCompletedTool;
        if (toolSummary && !reportedTools.has(toolSummary.toolName)) {
          const line = formatToolResultLine(toolSummary);
          if (verbose) {
            output.info(line);
          } else {
            progressBar.log(line);
          }
          reportedTools.add(toolSummary.toolName);
        }
      };

      output.info('Checking schemas...\n');
      const result = await interviewer.interview(mcpClient, discovery, progressCallback);

      progressBar.stop();
      if (!verbose) {
        output.newline();
      }

      // Ensure output directories exist
      mkdirSync(outputDir, { recursive: true });
      if (docsDir !== outputDir) {
        mkdirSync(docsDir, { recursive: true });
      }

      // End metrics (before security testing)
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

      // External service handling summary
      if (result.metadata.externalServices) {
        const ext = result.metadata.externalServices;
        if (ext.unconfiguredServices.length > 0) {
          output.warn(`\nExternal services not configured: ${ext.unconfiguredServices.join(', ')}`);
        }
        if (ext.skippedTools.length > 0) {
          output.warn(`Tools skipped (${ext.skippedTools.length}): ${ext.skippedTools.slice(0, 5).join(', ')}${ext.skippedTools.length > 5 ? ' ...' : ''}`);
        }
        if (ext.mockedTools.length > 0) {
          output.info(`Tools mocked (${ext.mockedTools.length}): ${ext.mockedTools.slice(0, 5).join(', ')}${ext.mockedTools.length > 5 ? ' ...' : ''}`);
        }
      }

      if (result.metadata.statefulTesting?.enabled) {
        output.info(`\nStateful testing: ${result.metadata.statefulTesting.dependencyCount} dependency edge(s)`);
      }

      // Assertion summary
      if (result.metadata.assertions && result.metadata.assertions.total > 0) {
        const assertions = result.metadata.assertions;
        if (assertions.failed > 0) {
          output.warn(`\nResponse assertions failed: ${assertions.failed}/${assertions.total}`);
        } else {
          output.success(`\nResponse assertions: ${assertions.total} passed`);
        }
      }

      // Rate limit summary
      if (result.metadata.rateLimit) {
        const rateLimit = result.metadata.rateLimit;
        output.warn(`\nRate limit events: ${rateLimit.totalEvents} (retries: ${rateLimit.totalRetries})`);
        if (rateLimit.tools.length > 0) {
          output.info(`Rate-limited tools: ${rateLimit.tools.slice(0, 5).join(', ')}${rateLimit.tools.length > 5 ? ' ...' : ''}`);
        }
      }

      const checkSummary = buildCheckSummary(result);
      output.newline();
      output.lines(...checkSummary.lines);
      if (checkSummary.nextSteps.length > 0) {
        output.newline();
        output.info('Next steps:');
        output.numberedList(checkSummary.nextSteps);
      }

      // Run security testing if enabled
      const securityFingerprints = new Map<string, SecurityFingerprint>();
      if (securityEnabled) {
        output.info('\n--- Security Testing ---');
        output.info(`Testing categories: ${securityCategories.join(', ')}`);
        output.newline();

        let totalFindings = 0;
        let criticalHighFindings = 0;

        for (const toolProfile of result.toolProfiles) {
          const tool = discovery.tools.find((t) => t.name === toolProfile.name);
          if (!tool) continue;

          if (verbose) {
            output.info(`Security testing: ${tool.name}`);
          }

          const fingerprint = await runSecurityTests(
            {
              toolName: tool.name,
              toolDescription: tool.description || '',
              inputSchema: tool.inputSchema ?? {},
              callTool: async (args: Record<string, unknown>) => {
                try {
                  const response = await mcpClient.callTool(tool.name, args);
                  const content = response.content
                    .map((c: { type: string; text?: string }) => c.type === 'text' ? c.text : '')
                    .join('\n');
                  return {
                    isError: response.isError ?? false,
                    content,
                    errorMessage: response.isError ? content : undefined,
                  };
                } catch (error) {
                  return {
                    isError: true,
                    content: '',
                    errorMessage: error instanceof Error ? error.message : String(error),
                  };
                }
              },
            },
            {
              categories: securityCategories,
              timeout: SECURITY_TESTING.TEST_TIMEOUT_MS,
              maxPayloadsPerCategory: SECURITY_TESTING.MAX_PAYLOADS_PER_CATEGORY,
            }
          );

          securityFingerprints.set(tool.name, fingerprint);
          totalFindings += fingerprint.findings.length;
          criticalHighFindings += fingerprint.findings.filter(
            (f) => f.riskLevel === 'critical' || f.riskLevel === 'high'
          ).length;

          if (verbose && fingerprint.findings.length > 0) {
            for (const finding of fingerprint.findings) {
              const color = finding.riskLevel === 'critical' || finding.riskLevel === 'high'
                ? output.error
                : finding.riskLevel === 'medium'
                  ? output.warn
                  : output.info;
              color(`  [${finding.riskLevel.toUpperCase()}] ${finding.title}`);
            }
          }
        }

        // Summary
        if (totalFindings > 0) {
          output.warn(`Security testing complete: ${totalFindings} finding(s) detected`);
          if (criticalHighFindings > 0) {
            output.error(`  ${criticalHighFindings} critical/high severity finding(s)`);
          }
        } else {
          output.success('Security testing complete: No vulnerabilities detected');
        }
        output.newline();
      }

      // Workflow testing (stateful multi-step testing)
      const workflowResults: WorkflowResult[] = [];
      const workflowTimeout = config.workflows.stepTimeout;
      const workflowTimeouts = config.workflows.timeouts;

      // Load workflows from file or auto-discover from defaults
      let workflows: Workflow[] = [];
      if (config.workflows.path) {
        try {
          workflows = loadWorkflowsFromFile(config.workflows.path);
          output.info(`Loaded ${workflows.length} workflow(s) from ${config.workflows.path}`);
        } catch (error) {
          output.error(`Failed to load workflows: ${error instanceof Error ? error.message : error}`);
          process.exit(EXIT_CODES.ERROR);
        }
      } else {
        // Try to load default workflows
        const defaultWorkflows = tryLoadDefaultWorkflows(outputDir);
        if (defaultWorkflows) {
          workflows = defaultWorkflows;
          output.info(`Auto-loaded ${workflows.length} workflow(s) from ${DEFAULT_WORKFLOWS_FILE}`);
        }
      }

      // Generate workflows if configured
      if (config.workflows.autoGenerate) {
        const generatedPath = join(outputDir, DEFAULT_WORKFLOWS_FILE);
        const existingWorkflows = workflows.length > 0;

        const generated = generateWorkflowsFromTools(discovery.tools, {
          maxWorkflows: WORKFLOW.MAX_DISCOVERED_WORKFLOWS,
          minSteps: WORKFLOW.MIN_WORKFLOW_STEPS,
          maxSteps: WORKFLOW.MAX_WORKFLOW_STEPS,
        });

        if (generated.length > 0) {
          if (existingWorkflows) {
            output.info(`Generated ${generated.length} additional workflow(s)`);
            workflows = [...workflows, ...generated];
          } else {
            workflows = generated;
          }

          // Save generated workflows to file
          const workflowYaml = generateWorkflowYamlContent(generated);
          writeFileSync(generatedPath, workflowYaml);
          output.info(`Generated workflow file: ${generatedPath}`);
        } else {
          output.info('No workflows could be auto-generated from tool patterns');
        }
      }

      // Execute workflows if any are loaded
      if (workflows.length > 0) {
        output.info('\n--- Workflow Testing ---');
        output.info(`Executing ${workflows.length} workflow(s)...\n`);

        // Create a minimal executor for check mode (no LLM analysis)
        const workflowExecutor = new WorkflowExecutor(
          mcpClient,
          null, // No LLM in check mode
          discovery.tools,
          {
            stepTimeout: workflowTimeout,
            analyzeSteps: false, // No LLM analysis in check mode
            generateSummary: false, // No LLM summary in check mode
            continueOnError: false,
            timeouts: workflowTimeouts,
          }
        );

        for (const workflow of workflows) {
          if (verbose) {
            output.info(`Executing workflow: ${workflow.name}`);
          }

          try {
            const workflowResult = await workflowExecutor.execute(workflow);
            workflowResults.push(workflowResult);

            const statusIcon = workflowResult.success ? '\u2713' : '\u2717';
            const stepsInfo = `${workflowResult.steps.filter(s => s.success).length}/${workflow.steps.length} steps`;

            if (workflowResult.success) {
              output.success(`  ${statusIcon} ${workflow.name} (${stepsInfo}) - ${workflowResult.durationMs}ms`);
            } else {
              const failedStep = workflowResult.failedStepIndex !== undefined
                ? workflow.steps[workflowResult.failedStepIndex]
                : undefined;
              output.error(`  ${statusIcon} ${workflow.name} (${stepsInfo}) - Failed at: ${failedStep?.tool ?? 'unknown'}`);
              if (verbose && workflowResult.failureReason) {
                output.info(`      Reason: ${workflowResult.failureReason}`);
              }
            }
          } catch (error) {
            output.error(`  \u2717 ${workflow.name} - Error: ${error instanceof Error ? error.message : error}`);
          }
        }

        // Workflow summary
        const passed = workflowResults.filter(r => r.success).length;
        const failed = workflowResults.length - passed;
        output.newline();
        if (failed === 0) {
          output.success(`Workflow testing complete: ${passed}/${workflowResults.length} passed`);
        } else {
          output.warn(`Workflow testing complete: ${passed}/${workflowResults.length} passed, ${failed} failed`);
        }
        output.newline();
      }

      // Generate documentation (after security testing so findings can be included)
      output.info('Generating documentation...');
      const writeDocs = outputFormat === 'both' || outputFormat === 'agents.md';
      const writeJson = outputFormat === 'both' || outputFormat === 'json';

      if (writeDocs) {
        const contractMd = generateContractMd(result, {
          securityFingerprints: securityEnabled ? securityFingerprints : undefined,
          workflowResults: workflowResults.length > 0 ? workflowResults : undefined,
          exampleLength,
          fullExamples,
          maxExamplesPerTool,
          targetConfidence,
          countValidationAsSuccess: config.check.metrics.countValidationAsSuccess,
          separateValidationMetrics: config.check.metrics.separateValidationMetrics,
        });
        const contractMdPath = join(docsDir, config.output.files.contractDoc);
        writeFileSync(contractMdPath, contractMd);
        output.info(`Written: ${contractMdPath}`);
      }

      if (writeJson) {
        // Add workflow results to the result object for the JSON report
        const resultWithWorkflows = workflowResults.length > 0
          ? { ...result, workflowResults }
          : result;
        let jsonReport: string;
        try {
          jsonReport = generateJsonReport(resultWithWorkflows, {
            schemaUrl: REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL,
            validate: true,
          });
        } catch (error) {
          output.error(error instanceof Error ? error.message : String(error));
          process.exit(EXIT_CODES.ERROR);
        }
        const jsonPath = join(outputDir, config.output.files.checkReport);
        writeFileSync(jsonPath, jsonReport);
        output.info(`Written: ${jsonPath}`);
      }

      // Create baseline from results
      let currentBaseline = createBaseline(result, fullServerCommand);

      // Attach security fingerprints to tool fingerprints if security testing was run
      if (securityEnabled && securityFingerprints.size > 0) {
        currentBaseline = {
          ...currentBaseline,
          capabilities: {
            ...currentBaseline.capabilities,
            tools: currentBaseline.capabilities.tools.map((tool) => {
              const securityFp = securityFingerprints.get(tool.name);
              if (securityFp) {
                return { ...tool, securityFingerprint: securityFp };
              }
              return tool;
            }),
          },
        };
      }

      // Merge cached fingerprints in incremental mode
      if (incrementalResult && incrementalResult.cachedFingerprints.length > 0) {
        // Merge new fingerprints with cached ones
        const cachedTools = incrementalResult.cachedFingerprints.map(toToolCapability);
        const mergedTools = [
          ...currentBaseline.capabilities.tools,
          ...cachedTools,
        ].sort((a, b) => a.name.localeCompare(b.name));

        currentBaseline = {
          ...currentBaseline,
          capabilities: {
            ...currentBaseline.capabilities,
            tools: mergedTools,
          },
        };

        if (incrementalBaseline) {
          const cachedToolNames = new Set(incrementalResult.cachedFingerprints.map((fp) => fp.name));
          const profileMap = new Map(
            (currentBaseline.toolProfiles ?? []).map((profile) => [profile.name, profile])
          );

          for (const profile of incrementalBaseline.toolProfiles ?? []) {
            if (cachedToolNames.has(profile.name) && !profileMap.has(profile.name)) {
              profileMap.set(profile.name, profile);
            }
          }

          for (const fingerprint of incrementalResult.cachedFingerprints) {
            if (!profileMap.has(fingerprint.name)) {
              profileMap.set(fingerprint.name, {
                name: fingerprint.name,
                description: fingerprint.description,
                schemaHash: fingerprint.schemaHash,
                assertions: convertAssertions(fingerprint.assertions ?? []),
                securityNotes: fingerprint.securityNotes,
                limitations: fingerprint.limitations,
                behavioralNotes: [],
              });
            }
          }

          const assertionMap = new Map(
            (currentBaseline.assertions ?? []).map((assertion) => [
              `${assertion.type}|${assertion.condition}|${assertion.tool ?? ''}|${assertion.severity ?? ''}`,
              assertion,
            ])
          );

          for (const assertion of incrementalBaseline.assertions ?? []) {
            if (!assertion.tool || !cachedToolNames.has(assertion.tool)) {
              continue;
            }
            const key = `${assertion.type}|${assertion.condition}|${assertion.tool ?? ''}|${assertion.severity ?? ''}`;
            if (!assertionMap.has(key)) {
              assertionMap.set(key, assertion);
            }
          }

          currentBaseline = {
            ...currentBaseline,
            toolProfiles: Array.from(profileMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
            assertions: Array.from(assertionMap.values()),
          };
        }

        output.info(`Merged ${incrementalResult.cachedFingerprints.length} cached tool fingerprints`);
      }

      // Check statistical confidence of performance metrics
      // Count tools that don't meet the target confidence level
      const lowConfidenceTools: string[] = [];
      const confidenceLevelOrder = ['low', 'medium', 'high'] as const;
      const targetIndex = confidenceLevelOrder.indexOf(targetConfidence);

      for (const tool of currentBaseline.capabilities.tools) {
        // Use the actual computed confidence level (accounts for samples AND CV)
        const actualConfidence = tool.performanceConfidence?.confidenceLevel ?? 'low';
        const actualIndex = confidenceLevelOrder.indexOf(actualConfidence);

        // Tool is "low confidence" if its actual confidence is below target
        if (actualIndex < targetIndex) {
          lowConfidenceTools.push(tool.name);
        }
      }

      // Report confidence status
      if (lowConfidenceTools.length > 0) {
        const totalTools = getToolFingerprints(currentBaseline).length;
        const pct = Math.round((lowConfidenceTools.length / totalTools) * 100);
        const confidenceLabel = colorizeConfidence(
          formatConfidenceLevel(targetConfidence),
          targetConfidence
        );
        output.warn(`\n--- Confidence Warning ---`);
        output.warn(
          `${lowConfidenceTools.length}/${totalTools} tool(s) (${pct}%) have low statistical confidence`
        );
        output.warn(`Target confidence: ${confidenceLabel} (requires ${CHECK_SAMPLING.SAMPLES_FOR_CONFIDENCE[targetConfidence]}+ samples)`);
        if (lowConfidenceTools.length <= 5) {
          output.warn(`Affected tools: ${lowConfidenceTools.join(', ')}`);
        } else {
          output.warn(`Affected tools: ${lowConfidenceTools.slice(0, 5).join(', ')} +${lowConfidenceTools.length - 5} more`);
        }
        output.info(`Tip: Run multiple times or increase check.sampling.minSamples for more stable metrics`);

        // Exit with low confidence code if configured
        if (failOnLowConfidence) {
          output.error('\nFailing due to check.sampling.failOnLowConfidence: true');
          process.exit(EXIT_CODES.LOW_CONFIDENCE);
        }
      } else {
        const confidenceLabel = colorizeConfidence(
          formatConfidenceLevel(targetConfidence),
          targetConfidence
        );
        output.info(`\nConfidence: All tools meet ${confidenceLabel} confidence threshold`);
      }

      // Save baseline if configured
      if (saveBaselinePath) {
        saveBaseline(currentBaseline, saveBaselinePath);
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
        const formattedDiff = formatDiff(diff, diffFormat, baselinePath);
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

        // Report security changes if detected
        if (diff.securityReport) {
          const secReport = diff.securityReport;
          if (secReport.newFindings.length > 0) {
            output.error('\n--- New Security Findings ---');
            for (const finding of secReport.newFindings) {
              const icon = finding.riskLevel === 'critical' || finding.riskLevel === 'high'
                ? '!'
                : finding.riskLevel === 'medium'
                  ? '*'
                  : '-';
              output.error(
                `  ${icon} [${finding.riskLevel.toUpperCase()}] ${finding.tool}: ${finding.title}`
              );
              output.info(`    ${finding.cweId}: ${finding.description}`);
            }
          }
          if (secReport.resolvedFindings.length > 0) {
            output.success(`\nSecurity: ${secReport.resolvedFindings.length} finding(s) resolved`);
          }
          if (secReport.degraded) {
            output.error(
              `\nSecurity posture degraded: Risk score ${secReport.previousRiskScore} → ${secReport.currentRiskScore}`
            );
          }
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

      if (config.check.assertions.strict && (result.metadata.assertions?.failed ?? 0) > 0) {
        output.error('\nAssertion failures detected and check.assertions.strict is enabled.');
        process.exit(EXIT_CODES.ERROR);
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
