/**
 * Configuration validation using Zod schemas.
 *
 * Provides comprehensive validation with helpful error messages
 * for all bellwether.yaml configuration options.
 */

import { z } from 'zod';
import { existsSync } from 'fs';
import { join } from 'path';
import { PATHS, VALIDATION_BOUNDS, EXTERNAL_DEPENDENCIES } from '../constants.js';
import { CONFIG_DEFAULTS } from './defaults.js';
import { getExternalServiceStatus } from '../baseline/external-dependency-detector.js';

/**
 * Server configuration schema.
 */
export const serverConfigSchema = z.object({
  /** Command to start the MCP server */
  command: z.string().default(CONFIG_DEFAULTS.server.command),
  /** Arguments to pass to the server command */
  args: z.array(z.string()).default(CONFIG_DEFAULTS.server.args),
  /** Timeout for server startup and tool calls (ms) */
  timeout: z
    .number()
    .int()
    .min(VALIDATION_BOUNDS.TIMEOUT.MIN_MS)
    .max(VALIDATION_BOUNDS.TIMEOUT.MAX_MS)
    .default(CONFIG_DEFAULTS.server.timeout),
  /** Additional environment variables */
  env: z.record(z.string()).optional(),
}).default(CONFIG_DEFAULTS.server);

/**
 * LLM Ollama-specific settings.
 */
export const ollamaConfigSchema = z.object({
  /** Ollama server base URL */
  baseUrl: z.string().url().default(CONFIG_DEFAULTS.llm.ollama.baseUrl),
}).default(CONFIG_DEFAULTS.llm.ollama);

/**
 * LLM configuration schema.
 */
export const llmConfigSchema = z.object({
  /** LLM provider */
  provider: z.enum(['ollama', 'openai', 'anthropic']).default(CONFIG_DEFAULTS.llm.provider),
  /** Model to use (empty = provider default) */
  model: z.string().default(CONFIG_DEFAULTS.llm.model),
  /** Ollama-specific settings */
  ollama: ollamaConfigSchema,
  /** Environment variable for OpenAI API key */
  openaiApiKeyEnvVar: z.string().optional(),
  /** Environment variable for Anthropic API key */
  anthropicApiKeyEnvVar: z.string().optional(),
}).default(CONFIG_DEFAULTS.llm);

/**
 * Explore configuration schema (for bellwether explore command).
 */
export const exploreConfigSchema = z.object({
  /** Personas to use for exploration */
  personas: z.array(z.enum([
    'technical_writer',
    'security_tester',
    'qa_engineer',
    'novice_user',
  ])).default([...CONFIG_DEFAULTS.explore.personas]),
  /** Maximum questions per tool */
  maxQuestionsPerTool: z
    .number()
    .int()
    .min(VALIDATION_BOUNDS.QUESTIONS_PER_TOOL.MIN)
    .max(VALIDATION_BOUNDS.QUESTIONS_PER_TOOL.MAX)
    .default(CONFIG_DEFAULTS.explore.maxQuestionsPerTool),
  /** Run personas in parallel */
  parallelPersonas: z.boolean().default(CONFIG_DEFAULTS.explore.parallelPersonas),
  /** Maximum concurrent persona interviews */
  personaConcurrency: z
    .number()
    .int()
    .min(VALIDATION_BOUNDS.PERSONA_CONCURRENCY.MIN)
    .max(VALIDATION_BOUNDS.PERSONA_CONCURRENCY.MAX)
    .default(CONFIG_DEFAULTS.explore.personaConcurrency),
  /** Skip error/edge case testing */
  skipErrorTests: z.boolean().default(CONFIG_DEFAULTS.explore.skipErrorTests),
}).default(() => ({
  personas: [...CONFIG_DEFAULTS.explore.personas],
  maxQuestionsPerTool: CONFIG_DEFAULTS.explore.maxQuestionsPerTool,
  parallelPersonas: CONFIG_DEFAULTS.explore.parallelPersonas,
  personaConcurrency: CONFIG_DEFAULTS.explore.personaConcurrency,
  skipErrorTests: CONFIG_DEFAULTS.explore.skipErrorTests,
}));

/**
 * Scenarios configuration schema.
 */
export const scenariosConfigSchema = z.object({
  /** Path to scenarios YAML file */
  path: z.string().optional(),
  /** Run only scenarios (no LLM tests) */
  only: z.boolean().default(CONFIG_DEFAULTS.scenarios.only),
}).default(CONFIG_DEFAULTS.scenarios);

/**
 * Workflows configuration schema.
 */
export const workflowsConfigSchema = z.object({
  /** Path to workflows YAML file */
  path: z.string().optional(),
  /** Enable LLM-based workflow discovery */
  discover: z.boolean().default(CONFIG_DEFAULTS.workflows.discover),
  /** Track state between workflow steps */
  trackState: z.boolean().default(CONFIG_DEFAULTS.workflows.trackState),
  /** Auto-generate workflows from discovered tools */
  autoGenerate: z.boolean().default(CONFIG_DEFAULTS.workflows.autoGenerate),
  /** Skip steps whose dependencies (previous steps providing data) have failed */
  requireSuccessfulDependencies: z.boolean().default(CONFIG_DEFAULTS.workflows.requireSuccessfulDependencies),
  /** Timeout per workflow step in milliseconds */
  stepTimeout: z.number().int().min(1000).max(300000).default(CONFIG_DEFAULTS.workflows.stepTimeout),
  /** Timeout configuration for workflow operations */
  timeouts: z.object({
    toolCall: z.number().int().min(1000).max(300000).default(CONFIG_DEFAULTS.workflows.timeouts.toolCall),
    stateSnapshot: z.number().int().min(1000).max(300000).default(CONFIG_DEFAULTS.workflows.timeouts.stateSnapshot),
    probeTool: z.number().int().min(1000).max(300000).default(CONFIG_DEFAULTS.workflows.timeouts.probeTool),
    llmAnalysis: z.number().int().min(1000).max(300000).default(CONFIG_DEFAULTS.workflows.timeouts.llmAnalysis),
    llmSummary: z.number().int().min(1000).max(300000).default(CONFIG_DEFAULTS.workflows.timeouts.llmSummary),
  }).default(CONFIG_DEFAULTS.workflows.timeouts),
}).default(CONFIG_DEFAULTS.workflows);

/**
 * Example output configuration schema.
 */
export const examplesConfigSchema = z.object({
  /** Include full (non-truncated) examples */
  full: z.boolean().default(CONFIG_DEFAULTS.output.examples.full),
  /** Maximum example length in characters */
  maxLength: z.number().int().min(100).max(50000).default(CONFIG_DEFAULTS.output.examples.maxLength),
  /** Maximum examples per tool */
  maxPerTool: z.number().int().min(1).max(20).default(CONFIG_DEFAULTS.output.examples.maxPerTool),
}).default(CONFIG_DEFAULTS.output.examples);

/**
 * Output file name configuration schema.
 */
export const outputFilesConfigSchema = z.object({
  /** Check report JSON file name */
  checkReport: z.string().default(CONFIG_DEFAULTS.output.files.checkReport),
  /** Explore report JSON file name */
  exploreReport: z.string().default(CONFIG_DEFAULTS.output.files.exploreReport),
  /** Contract documentation file name */
  contractDoc: z.string().default(CONFIG_DEFAULTS.output.files.contractDoc),
  /** Agents documentation file name */
  agentsDoc: z.string().default(CONFIG_DEFAULTS.output.files.agentsDoc),
  /** Verification report JSON file name */
  verificationReport: z.string().default(CONFIG_DEFAULTS.output.files.verificationReport),
}).default(CONFIG_DEFAULTS.output.files);

/**
 * Output configuration schema.
 */
export const outputConfigSchema = z.object({
  /** Output directory for JSON files (bellwether-check.json, etc.) */
  dir: z.string().default(CONFIG_DEFAULTS.output.dir),
  /** Output directory for documentation files (CONTRACT.md, AGENTS.md) */
  docsDir: z.string().default(CONFIG_DEFAULTS.output.docsDir),
  /** Output format */
  format: z.enum(['agents.md', 'json', 'both']).default(CONFIG_DEFAULTS.output.format),
  /** Example output settings */
  examples: examplesConfigSchema,
  /** Output file names */
  files: outputFilesConfigSchema,
}).default(CONFIG_DEFAULTS.output);

/**
 * Severity levels for configuration.
 */
const severityLevels = ['none', 'info', 'warning', 'breaking'] as const;

/**
 * Behavior aspects that can have severity overrides.
 */
const behaviorAspects = [
  'response_format',
  'response_structure',
  'error_handling',
  'error_pattern',
  'security',
  'performance',
  'schema',
  'description',
] as const;

/**
 * Severity configuration schema.
 * Allows customizing how changes are classified and reported.
 */
export const severityConfigSchema = z.object({
  /** Minimum severity level to include in reports */
  minimumSeverity: z.enum(severityLevels).default(CONFIG_DEFAULTS.baseline.severity.minimumSeverity),
  /** Severity level at which to fail CI checks */
  failOnSeverity: z.enum(severityLevels).default(CONFIG_DEFAULTS.baseline.severity.failOnSeverity),
  /** Suppress warning-level changes from output */
  suppressWarnings: z.boolean().default(CONFIG_DEFAULTS.baseline.severity.suppressWarnings),
  /** Custom severity overrides per aspect */
  aspectOverrides: z.record(
    z.enum(behaviorAspects),
    z.enum(severityLevels)
  ).optional(),
}).default(CONFIG_DEFAULTS.baseline.severity);

/**
 * Security testing configuration schema.
 */
export const securityConfigSchema = z.object({
  /** Enable security vulnerability testing */
  enabled: z.boolean().default(CONFIG_DEFAULTS.check.security.enabled),
  /** Security categories to test */
  categories: z.array(z.enum([
    'sql_injection',
    'xss',
    'path_traversal',
    'command_injection',
    'ssrf',
    'error_disclosure',
  ])).default([...CONFIG_DEFAULTS.check.security.categories]),
}).default(() => ({
  enabled: CONFIG_DEFAULTS.check.security.enabled,
  categories: [...CONFIG_DEFAULTS.check.security.categories],
}));

/**
 * Statistical sampling configuration schema.
 */
export const samplingConfigSchema = z.object({
  /** Minimum samples per tool for statistical confidence */
  minSamples: z.number().int().min(1).max(50).default(CONFIG_DEFAULTS.check.sampling.minSamples),
  /** Target confidence level */
  targetConfidence: z.enum(['low', 'medium', 'high']).default(CONFIG_DEFAULTS.check.sampling.targetConfidence),
  /** Fail if confidence is below target */
  failOnLowConfidence: z.boolean().default(CONFIG_DEFAULTS.check.sampling.failOnLowConfidence),
}).default(CONFIG_DEFAULTS.check.sampling);

/**
 * Metrics configuration schema.
 */
export const metricsConfigSchema = z.object({
  /** Count validation rejections as success */
  countValidationAsSuccess: z.boolean().default(CONFIG_DEFAULTS.check.metrics.countValidationAsSuccess),
  /** Separate validation metrics from reliability metrics */
  separateValidationMetrics: z.boolean().default(CONFIG_DEFAULTS.check.metrics.separateValidationMetrics),
}).default(CONFIG_DEFAULTS.check.metrics);

/**
 * Stateful testing configuration schema.
 */
export const statefulTestingConfigSchema = z.object({
  /** Enable stateful tool testing */
  enabled: z.boolean().default(CONFIG_DEFAULTS.check.statefulTesting.enabled),
  /** Maximum dependency chain length */
  maxChainLength: z
    .number()
    .int()
    .min(VALIDATION_BOUNDS.STATEFUL_CHAIN.MIN)
    .max(VALIDATION_BOUNDS.STATEFUL_CHAIN.MAX)
    .default(CONFIG_DEFAULTS.check.statefulTesting.maxChainLength),
  /** Share outputs between dependent tools */
  shareOutputsBetweenTools: z.boolean().default(CONFIG_DEFAULTS.check.statefulTesting.shareOutputsBetweenTools),
}).default(CONFIG_DEFAULTS.check.statefulTesting);

/**
 * External service configuration schema.
 */
export const externalServiceConfigSchema = z.object({
  /** Enable this external service */
  enabled: z.boolean().optional(),
  /** Sandbox credentials for this service */
  sandboxCredentials: z.record(z.string()).optional(),
});

/**
 * External services handling configuration schema.
 */
export const externalServicesConfigSchema = z.object({
  /** Mode for unconfigured services */
  mode: z.enum(['skip', 'mock', 'fail']).default(CONFIG_DEFAULTS.check.externalServices.mode),
  /** Per-service configuration overrides */
  services: z.record(externalServiceConfigSchema).optional(),
}).default(CONFIG_DEFAULTS.check.externalServices);

/**
 * Response assertion configuration schema.
 */
export const assertionsConfigSchema = z.object({
  /** Enable response assertions */
  enabled: z.boolean().default(CONFIG_DEFAULTS.check.assertions.enabled),
  /** Strict mode fails on assertion violations */
  strict: z.boolean().default(CONFIG_DEFAULTS.check.assertions.strict),
  /** Infer schemas from responses */
  infer: z.boolean().default(CONFIG_DEFAULTS.check.assertions.infer),
}).default(CONFIG_DEFAULTS.check.assertions);

/**
 * Rate limiting configuration schema.
 */
export const rateLimitConfigSchema = z.object({
  /** Enable rate limiting */
  enabled: z.boolean().default(CONFIG_DEFAULTS.check.rateLimit.enabled),
  /** Requests per second */
  requestsPerSecond: z
    .number()
    .min(VALIDATION_BOUNDS.RATE_LIMIT.REQUESTS_PER_SECOND.MIN)
    .max(VALIDATION_BOUNDS.RATE_LIMIT.REQUESTS_PER_SECOND.MAX)
    .default(CONFIG_DEFAULTS.check.rateLimit.requestsPerSecond),
  /** Burst limit */
  burstLimit: z
    .number()
    .int()
    .min(VALIDATION_BOUNDS.RATE_LIMIT.BURST_LIMIT.MIN)
    .max(VALIDATION_BOUNDS.RATE_LIMIT.BURST_LIMIT.MAX)
    .default(CONFIG_DEFAULTS.check.rateLimit.burstLimit),
  /** Backoff strategy */
  backoffStrategy: z.enum(['linear', 'exponential']).default(CONFIG_DEFAULTS.check.rateLimit.backoffStrategy),
  /** Maximum retries on rate limit */
  maxRetries: z
    .number()
    .int()
    .min(VALIDATION_BOUNDS.RATE_LIMIT.MAX_RETRIES.MIN)
    .max(VALIDATION_BOUNDS.RATE_LIMIT.MAX_RETRIES.MAX)
    .default(CONFIG_DEFAULTS.check.rateLimit.maxRetries),
}).default(CONFIG_DEFAULTS.check.rateLimit);

/**
 * Test fixture pattern schema.
 * Allows matching parameter names by regex pattern.
 */
export const testFixturePatternSchema = z.object({
  /** Regex pattern to match parameter names */
  match: z.string(),
  /** Value to use for matching parameters */
  value: z.unknown(),
});

/**
 * Test fixtures configuration schema.
 * Allows users to customize test values for production server testing.
 */
export const testFixturesConfigSchema = z.object({
  /** Custom values for specific parameter names (exact match) */
  parameterValues: z.record(z.unknown()).optional(),
  /** Custom values for parameters matching regex patterns */
  patterns: z.array(testFixturePatternSchema).optional(),
}).optional();

/**
 * Check command configuration schema.
 * Controls behavior of `bellwether check`.
 */
export const checkConfigSchema = z.object({
  /** Enable incremental checking (only test tools with changed schemas) */
  incremental: z.boolean().default(CONFIG_DEFAULTS.check.incremental),
  /** Maximum age of cached results in hours (for incremental checking) */
  incrementalCacheHours: z.number().int().min(1).max(720).default(CONFIG_DEFAULTS.check.incrementalCacheHours),
  /** Enable parallel tool testing (faster checks) */
  parallel: z.boolean().default(CONFIG_DEFAULTS.check.parallel),
  /** Number of concurrent tool workers (1-10) */
  parallelWorkers: z.number().int().min(1).max(10).default(CONFIG_DEFAULTS.check.parallelWorkers),
  /** Performance regression threshold percentage (0-100, e.g., 25 = 25% slower triggers warning) */
  performanceThreshold: z.number().min(0).max(100).default(CONFIG_DEFAULTS.check.performanceThreshold),
  /** Default diff output format */
  diffFormat: z.enum(['text', 'json', 'compact', 'github', 'markdown', 'junit', 'sarif']).default(CONFIG_DEFAULTS.check.diffFormat),
  /** Number of warmup runs before timing samples (excluded from variance calculation) */
  warmupRuns: z.number().int().min(0).max(5).default(CONFIG_DEFAULTS.check.warmupRuns),
  /** Enable smart test value generation from schema descriptions (e.g., YYYY-MM-DD dates) */
  smartTestValues: z.boolean().default(CONFIG_DEFAULTS.check.smartTestValues),
  /** Stateful testing settings */
  statefulTesting: statefulTestingConfigSchema,
  /** External services handling */
  externalServices: externalServicesConfigSchema,
  /** Response assertions */
  assertions: assertionsConfigSchema,
  /** Rate limit settings */
  rateLimit: rateLimitConfigSchema,
  /** Metrics configuration */
  metrics: metricsConfigSchema,
  /** Security testing settings */
  security: securityConfigSchema,
  /** Statistical sampling settings */
  sampling: samplingConfigSchema,
  /** Test fixtures for production server testing */
  testFixtures: testFixturesConfigSchema,
}).default(() => ({
  incremental: CONFIG_DEFAULTS.check.incremental,
  incrementalCacheHours: CONFIG_DEFAULTS.check.incrementalCacheHours,
  parallel: CONFIG_DEFAULTS.check.parallel,
  parallelWorkers: CONFIG_DEFAULTS.check.parallelWorkers,
  performanceThreshold: CONFIG_DEFAULTS.check.performanceThreshold,
  diffFormat: CONFIG_DEFAULTS.check.diffFormat,
  warmupRuns: CONFIG_DEFAULTS.check.warmupRuns,
  smartTestValues: CONFIG_DEFAULTS.check.smartTestValues,
  statefulTesting: { ...CONFIG_DEFAULTS.check.statefulTesting },
  externalServices: { ...CONFIG_DEFAULTS.check.externalServices },
  assertions: { ...CONFIG_DEFAULTS.check.assertions },
  rateLimit: { ...CONFIG_DEFAULTS.check.rateLimit },
  metrics: { ...CONFIG_DEFAULTS.check.metrics },
  security: {
    enabled: CONFIG_DEFAULTS.check.security.enabled,
    categories: [...CONFIG_DEFAULTS.check.security.categories],
  },
  sampling: { ...CONFIG_DEFAULTS.check.sampling },
}));

/**
 * Baseline configuration schema.
 */
export const baselineConfigSchema = z.object({
  /** Default baseline file path (relative to output.dir or absolute) */
  path: z.string().default(CONFIG_DEFAULTS.baseline.path),
  /** Path to save baseline after check (enables auto-save) */
  savePath: z.string().optional(),
  /** Path to baseline for comparison (drift detection) */
  comparePath: z.string().optional(),
  /** Fail if drift is detected */
  failOnDrift: z.boolean().default(CONFIG_DEFAULTS.baseline.failOnDrift),
  /** Default output format for baseline comparisons */
  outputFormat: z.enum(['text', 'json', 'markdown', 'compact']).default(CONFIG_DEFAULTS.baseline.outputFormat),
  /** Severity thresholds for filtering and CI failure */
  severity: severityConfigSchema,
}).default(CONFIG_DEFAULTS.baseline);

/**
 * Cache configuration schema.
 */
export const cacheConfigSchema = z.object({
  /** Enable response caching */
  enabled: z.boolean().default(CONFIG_DEFAULTS.cache.enabled),
  /** Cache directory */
  dir: z.string().default(CONFIG_DEFAULTS.cache.dir),
}).default(CONFIG_DEFAULTS.cache);

/**
 * Logging configuration schema.
 */
export const loggingConfigSchema = z.object({
  /** Log level */
  level: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default(CONFIG_DEFAULTS.logging.level),
  /** Verbose output */
  verbose: z.boolean().default(CONFIG_DEFAULTS.logging.verbose),
}).default(CONFIG_DEFAULTS.logging);

/**
 * Watch mode configuration schema.
 */
export const watchConfigSchema = z.object({
  /** Path to watch for changes */
  path: z.string().default(CONFIG_DEFAULTS.watch.path),
  /** Polling interval in milliseconds */
  interval: z.number().int().min(1000).max(60000).default(CONFIG_DEFAULTS.watch.interval),
  /** File extensions to watch */
  extensions: z.array(z.string()).default([...CONFIG_DEFAULTS.watch.extensions]),
  /** Command to run when drift is detected */
  onDrift: z.string().optional(),
}).default(() => ({
  path: CONFIG_DEFAULTS.watch.path,
  interval: CONFIG_DEFAULTS.watch.interval,
  extensions: [...CONFIG_DEFAULTS.watch.extensions],
}));

/**
 * Discovery configuration schema.
 */
export const discoveryConfigSchema = z.object({
  /** Output as JSON */
  json: z.boolean().default(CONFIG_DEFAULTS.discovery.json),
  /** Connection timeout in ms */
  timeout: z.number().int().min(VALIDATION_BOUNDS.TIMEOUT.MIN_MS).max(VALIDATION_BOUNDS.TIMEOUT.MAX_MS).default(CONFIG_DEFAULTS.discovery.timeout),
  /** Transport type */
  transport: z.enum(['stdio', 'sse', 'streamable-http']).default(CONFIG_DEFAULTS.discovery.transport),
  /** Remote MCP server URL */
  url: z.string().optional(),
  /** Session ID for remote auth */
  sessionId: z.string().optional(),
}).default(CONFIG_DEFAULTS.discovery);

/**
 * Registry configuration schema.
 */
export const registryConfigSchema = z.object({
  /** Maximum results to show */
  limit: z.number().int().min(1).max(1000).default(CONFIG_DEFAULTS.registry.limit),
  /** Output as JSON */
  json: z.boolean().default(CONFIG_DEFAULTS.registry.json),
}).default(CONFIG_DEFAULTS.registry);

/**
 * History command configuration schema.
 */
export const historyConfigSchema = z.object({
  /** Number of versions to show */
  limit: z.number().int().min(1).max(1000).default(CONFIG_DEFAULTS.history.limit),
  /** Output as JSON */
  json: z.boolean().default(CONFIG_DEFAULTS.history.json),
}).default(CONFIG_DEFAULTS.history);

/**
 * Link command configuration schema.
 */
export const linkConfigSchema = z.object({
  /** Default server command when creating new projects */
  defaultServerCommand: z.string().default(CONFIG_DEFAULTS.link.defaultServerCommand),
}).default(CONFIG_DEFAULTS.link);

/**
 * Golden command configuration schema.
 */
export const goldenConfigSchema = z.object({
  /** Default JSON args for golden save */
  defaultArgs: z.string().default(CONFIG_DEFAULTS.golden.defaultArgs),
  /** Default comparison mode for golden save */
  mode: z.enum(['exact', 'structural', 'semantic']).default(CONFIG_DEFAULTS.golden.mode),
  /** Output format for compare */
  compareFormat: z.enum(['text', 'json', 'markdown']).default(CONFIG_DEFAULTS.golden.compareFormat),
  /** Output format for list */
  listFormat: z.enum(['text', 'json']).default(CONFIG_DEFAULTS.golden.listFormat),
  /** Normalize timestamps by default */
  normalizeTimestamps: z.boolean().default(CONFIG_DEFAULTS.golden.normalizeTimestamps),
  /** Normalize UUIDs by default */
  normalizeUuids: z.boolean().default(CONFIG_DEFAULTS.golden.normalizeUuids),
}).default(CONFIG_DEFAULTS.golden);

/**
 * Verify command configuration schema.
 */
export const verifyConfigSchema = z.object({
  /** Default verification tier */
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']).default(CONFIG_DEFAULTS.verify.tier),
  /** Include security testing by default */
  security: z.boolean().default(CONFIG_DEFAULTS.verify.security),
  /** Output as JSON */
  json: z.boolean().default(CONFIG_DEFAULTS.verify.json),
  /** Output badge URL only */
  badgeOnly: z.boolean().default(CONFIG_DEFAULTS.verify.badgeOnly),
}).default(CONFIG_DEFAULTS.verify);

/**
 * Contract command configuration schema.
 */
export const contractConfigSchema = z.object({
  /** Default contract file path */
  path: z.string().optional(),
  /** Validation mode */
  mode: z.enum(['strict', 'lenient', 'report']).default(CONFIG_DEFAULTS.contract.mode),
  /** Output format */
  format: z.enum(['text', 'json', 'markdown']).default(CONFIG_DEFAULTS.contract.format),
  /** Server startup timeout */
  timeout: z.number().int().min(VALIDATION_BOUNDS.TIMEOUT.MIN_MS).max(VALIDATION_BOUNDS.TIMEOUT.MAX_MS).default(CONFIG_DEFAULTS.contract.timeout),
  /** Exit with error when violations are found */
  failOnViolation: z.boolean().default(CONFIG_DEFAULTS.contract.failOnViolation),
}).default(CONFIG_DEFAULTS.contract);

/**
 * Complete bellwether.yaml configuration schema.
 *
 * This config is used by both 'bellwether check' and 'bellwether explore' commands.
 * Each command uses the relevant sections.
 */
export const bellwetherConfigSchema = z.object({
  /** Server configuration (used by both commands) */
  server: serverConfigSchema,
  /** LLM configuration (used by explore command) */
  llm: llmConfigSchema,
  /** Explore settings (used by explore command) */
  explore: exploreConfigSchema,
  /** Check settings (used by check command) */
  check: checkConfigSchema,
  /** Custom scenarios (used by both commands) */
  scenarios: scenariosConfigSchema,
  /** Workflow testing (used by explore command) */
  workflows: workflowsConfigSchema,
  /** Output settings (used by both commands) */
  output: outputConfigSchema,
  /** Baseline comparison (used by check command) */
  baseline: baselineConfigSchema,
  /** Watch mode settings (used by watch command) */
  watch: watchConfigSchema,
  /** Caching (used by both commands) */
  cache: cacheConfigSchema,
  /** Logging (used by both commands) */
  logging: loggingConfigSchema,
  /** Discovery defaults (used by discover command) */
  discovery: discoveryConfigSchema,
  /** Registry defaults (used by registry command) */
  registry: registryConfigSchema,
  /** History defaults (used by history command) */
  history: historyConfigSchema,
  /** Link defaults (used by link command) */
  link: linkConfigSchema,
  /** Golden command defaults */
  golden: goldenConfigSchema,
  /** Verify command defaults */
  verify: verifyConfigSchema,
  /** Contract command defaults */
  contract: contractConfigSchema,
});

/**
 * Inferred TypeScript type from the schema.
 */
export type BellwetherConfig = z.infer<typeof bellwetherConfigSchema>;

/**
 * Validate a configuration object.
 * Returns the validated config with defaults applied, or throws with helpful errors.
 */
export function validateConfig(config: unknown, filePath?: string): BellwetherConfig {
  const result = bellwetherConfigSchema.safeParse(config);

  if (!result.success) {
    const location = filePath ? ` in ${filePath}` : '';
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path || 'root'}: ${issue.message}`;
    });
    throw new Error(`Invalid configuration${location}:\n${issues.join('\n')}`);
  }

  return result.data;
}

/**
 * Generate configuration warnings for potentially problematic settings.
 */
export function getConfigWarnings(config: BellwetherConfig): string[] {
  const warnings: string[] = [];

  if (config.check.sampling.minSamples < 5) {
    warnings.push('check.sampling.minSamples < 5 may result in unreliable confidence metrics');
  }

  if (config.check.parallel && config.check.parallelWorkers > 4) {
    warnings.push('check.parallelWorkers > 4 may trigger rate limits on some servers');
  }

  if (config.check.externalServices.mode === 'fail') {
    const unconfigured = Object.keys(EXTERNAL_DEPENDENCIES.SERVICES).filter((service) => {
      const status = getExternalServiceStatus(service as keyof typeof EXTERNAL_DEPENDENCIES.SERVICES, config.check.externalServices);
      return !status.configured;
    });
    if (unconfigured.length === Object.keys(EXTERNAL_DEPENDENCIES.SERVICES).length) {
      warnings.push('External services mode is set to "fail" but no credentials detected');
    }
  }

  return warnings;
}

/**
 * Validate that required fields are present for the check command.
 */
export function validateConfigForCheck(config: BellwetherConfig, serverCommand?: string): void {
  // Server command must be provided either in config or as argument
  const effectiveCommand = serverCommand || config.server.command;
  if (!effectiveCommand) {
    throw new Error(
      'No server command specified.\n\n' +
      'Either add it to bellwether.yaml:\n' +
      '  server:\n' +
      '    command: "npx @your/mcp-server"\n\n' +
      'Or pass it as an argument:\n' +
      '  bellwether check npx @your/mcp-server'
    );
  }
  // Check command doesn't require LLM - it's free and deterministic
}

/**
 * Validate that required fields are present for the explore command.
 */
export function validateConfigForExplore(config: BellwetherConfig, serverCommand?: string): void {
  // Server command must be provided either in config or as argument
  const effectiveCommand = serverCommand || config.server.command;
  if (!effectiveCommand) {
    throw new Error(
      'No server command specified.\n\n' +
      'Either add it to bellwether.yaml:\n' +
      '  server:\n' +
      '    command: "npx @your/mcp-server"\n\n' +
      'Or pass it as an argument:\n' +
      '  bellwether explore npx @your/mcp-server'
    );
  }

  // Explore command requires LLM - check provider requirements
  const provider = config.llm.provider;

  if (provider === 'openai') {
    const envVar = config.llm.openaiApiKeyEnvVar || 'OPENAI_API_KEY';
    if (!process.env[envVar]) {
      throw new Error(
        `OpenAI API key not found.\n\n` +
        `Set the ${envVar} environment variable or run:\n` +
        `  bellwether auth\n\n` +
        `Or switch to local Ollama (free) by setting:\n` +
        `  llm:\n` +
        `    provider: ollama\n\n` +
        `For drift detection without LLM, use:\n` +
        `  bellwether check`
      );
    }
  } else if (provider === 'anthropic') {
    const envVar = config.llm.anthropicApiKeyEnvVar || 'ANTHROPIC_API_KEY';
    if (!process.env[envVar]) {
      throw new Error(
        `Anthropic API key not found.\n\n` +
        `Set the ${envVar} environment variable or run:\n` +
        `  bellwether auth\n\n` +
        `Or switch to local Ollama (free) by setting:\n` +
        `  llm:\n` +
        `    provider: ollama\n\n` +
        `For drift detection without LLM, use:\n` +
        `  bellwether check`
      );
    }
  }
  // Ollama doesn't require API keys
}

/**
 * Check if a config file exists at the given path or in common locations.
 */
export function findConfigFile(explicitPath?: string): string | null {
  if (explicitPath) {
    return existsSync(explicitPath) ? explicitPath : null;
  }

  const searchNames = PATHS.CONFIG_FILENAMES;

  for (const name of searchNames) {
    const path = join(process.cwd(), name);
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}
