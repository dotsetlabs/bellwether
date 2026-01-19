/**
 * Configuration validation using Zod schemas.
 *
 * Provides comprehensive validation with helpful error messages
 * for all bellwether.yaml configuration options.
 */

import { z } from 'zod';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  TIMEOUTS,
  LLM_DEFAULTS,
  PATHS,
  VALIDATION_BOUNDS,
  CONFIDENCE,
} from '../constants.js';

/**
 * Server configuration schema.
 */
export const serverConfigSchema = z.object({
  /** Command to start the MCP server */
  command: z.string().default(''),
  /** Arguments to pass to the server command */
  args: z.array(z.string()).default([]),
  /** Timeout for server startup and tool calls (ms) */
  timeout: z
    .number()
    .int()
    .min(VALIDATION_BOUNDS.TIMEOUT.MIN_MS)
    .max(VALIDATION_BOUNDS.TIMEOUT.MAX_MS)
    .default(TIMEOUTS.DEFAULT),
  /** Additional environment variables */
  env: z.record(z.string()).optional(),
}).default({});

/**
 * LLM Ollama-specific settings.
 */
export const ollamaConfigSchema = z.object({
  /** Ollama server base URL */
  baseUrl: z.string().url().default(LLM_DEFAULTS.OLLAMA_BASE_URL),
}).default({});

/**
 * LLM configuration schema.
 */
export const llmConfigSchema = z.object({
  /** LLM provider */
  provider: z.enum(['ollama', 'openai', 'anthropic']).default('ollama'),
  /** Model to use (empty = provider default) */
  model: z.string().default(''),
  /** Ollama-specific settings */
  ollama: ollamaConfigSchema,
  /** Environment variable for OpenAI API key */
  openaiApiKeyEnvVar: z.string().optional(),
  /** Environment variable for Anthropic API key */
  anthropicApiKeyEnvVar: z.string().optional(),
}).default({});

/**
 * Test configuration schema (for full mode).
 */
export const testConfigSchema = z.object({
  /** Personas to use for testing */
  personas: z.array(z.enum([
    'technical_writer',
    'security_tester',
    'qa_engineer',
    'novice_user',
  ])).default(['technical_writer']),
  /** Maximum questions per tool */
  maxQuestionsPerTool: z
    .number()
    .int()
    .min(VALIDATION_BOUNDS.QUESTIONS_PER_TOOL.MIN)
    .max(VALIDATION_BOUNDS.QUESTIONS_PER_TOOL.MAX)
    .default(3),
  /** Run personas in parallel */
  parallelPersonas: z.boolean().default(false),
  /** Skip error/edge case testing */
  skipErrorTests: z.boolean().default(false),
}).default({});

/**
 * Scenarios configuration schema.
 */
export const scenariosConfigSchema = z.object({
  /** Path to scenarios YAML file */
  path: z.string().optional(),
  /** Run only scenarios (no LLM tests) */
  only: z.boolean().default(false),
}).default({});

/**
 * Workflows configuration schema.
 */
export const workflowsConfigSchema = z.object({
  /** Path to workflows YAML file */
  path: z.string().optional(),
  /** Enable LLM-based workflow discovery */
  discover: z.boolean().default(false),
  /** Track state between workflow steps */
  trackState: z.boolean().default(false),
}).default({});

/**
 * Output configuration schema.
 */
export const outputConfigSchema = z.object({
  /** Output directory */
  dir: z.string().default('.'),
  /** Output format */
  format: z.enum(['agents.md', 'json', 'both']).default('both'),
  /** Generate cloud-compatible format */
  cloudFormat: z.boolean().default(false),
}).default({});

/**
 * Baseline configuration schema.
 */
export const baselineConfigSchema = z.object({
  /** Path to baseline for comparison */
  comparePath: z.string().optional(),
  /** Fail if drift is detected */
  failOnDrift: z.boolean().default(false),
  /** Minimum confidence to report (0-100) */
  minConfidence: z
    .number()
    .int()
    .min(VALIDATION_BOUNDS.CONFIDENCE.MIN)
    .max(VALIDATION_BOUNDS.CONFIDENCE.MAX)
    .default(0),
  /** Confidence threshold for CI failure (0-100) */
  confidenceThreshold: z
    .number()
    .int()
    .min(VALIDATION_BOUNDS.CONFIDENCE.MIN)
    .max(VALIDATION_BOUNDS.CONFIDENCE.MAX)
    .default(CONFIDENCE.CI_FAILURE_THRESHOLD),
}).default({});

/**
 * Cache configuration schema.
 */
export const cacheConfigSchema = z.object({
  /** Enable response caching */
  enabled: z.boolean().default(true),
  /** Cache directory */
  dir: z.string().default(PATHS.DEFAULT_CACHE_DIR),
}).default({});

/**
 * Logging configuration schema.
 */
export const loggingConfigSchema = z.object({
  /** Log level */
  level: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  /** Verbose output */
  verbose: z.boolean().default(false),
}).default({});

/**
 * Complete bellwether.yaml configuration schema.
 */
export const bellwetherConfigSchema = z.object({
  /** Server configuration */
  server: serverConfigSchema,
  /** Test mode: structural (free) or full (LLM) */
  mode: z.enum(['structural', 'full']).default('structural'),
  /** LLM configuration */
  llm: llmConfigSchema,
  /** Test settings (for full mode) */
  test: testConfigSchema,
  /** Custom scenarios */
  scenarios: scenariosConfigSchema,
  /** Workflow testing */
  workflows: workflowsConfigSchema,
  /** Output settings */
  output: outputConfigSchema,
  /** Baseline comparison */
  baseline: baselineConfigSchema,
  /** Caching */
  cache: cacheConfigSchema,
  /** Logging */
  logging: loggingConfigSchema,
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
 * Validate that required fields are present for running tests.
 */
export function validateConfigForTest(config: BellwetherConfig, serverCommand?: string): void {
  // Server command must be provided either in config or as argument
  const effectiveCommand = serverCommand || config.server.command;
  if (!effectiveCommand) {
    throw new Error(
      'No server command specified.\n\n' +
      'Either add it to bellwether.yaml:\n' +
      '  server:\n' +
      '    command: "npx @your/mcp-server"\n\n' +
      'Or pass it as an argument:\n' +
      '  bellwether test npx @your/mcp-server'
    );
  }

  // In full mode, check LLM provider requirements
  if (config.mode === 'full') {
    const provider = config.llm.provider;

    if (provider === 'openai') {
      const envVar = config.llm.openaiApiKeyEnvVar || 'OPENAI_API_KEY';
      if (!process.env[envVar]) {
        throw new Error(
          `OpenAI API key not found.\n\n` +
          `Set the ${envVar} environment variable or run:\n` +
          `  bellwether auth\n\n` +
          `Or switch to local Ollama (free) by setting:\n` +
          `  mode: structural  (recommended for CI)\n` +
          `  # or\n` +
          `  llm:\n` +
          `    provider: ollama`
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
          `  mode: structural  (recommended for CI)\n` +
          `  # or\n` +
          `  llm:\n` +
          `    provider: ollama`
        );
      }
    }
    // Ollama doesn't require API keys
  }
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
