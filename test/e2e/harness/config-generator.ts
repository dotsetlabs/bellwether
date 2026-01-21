/**
 * Config Generator for E2E tests.
 *
 * Generates bellwether.yaml configuration files for different test scenarios.
 */

import { stringify } from 'yaml';
import { getMockServerTsCommand } from './cli-runner.js';

export interface ServerConfig {
  command?: string;
  args?: string[];
  timeout?: number;
  transport?: 'stdio' | 'sse' | 'streamable-http';
  url?: string;
}

export interface LLMConfig {
  provider?: 'ollama' | 'openai' | 'anthropic';
  model?: string;
  ollamaBaseUrl?: string;
  openaiBaseUrl?: string;
  anthropicBaseUrl?: string;
}

export interface ExploreConfig {
  personas?: string[];
  maxQuestionsPerTool?: number;
}

export interface OutputConfig {
  dir?: string;
  formats?: string[];
}

export interface BaselineConfig {
  path?: string;
  failOnDrift?: boolean;
  saveOnCheck?: boolean;
}

export interface BellwetherConfig {
  server?: ServerConfig;
  llm?: LLMConfig;
  explore?: ExploreConfig;
  output?: OutputConfig;
  baseline?: BaselineConfig;
}

export interface ConfigOptions {
  /** Server command to run */
  serverCommand?: string;
  /** Server arguments */
  serverArgs?: string[];
  /** Server timeout in ms */
  serverTimeout?: number;
  /** Transport type */
  transport?: 'stdio' | 'sse' | 'streamable-http';
  /** Server URL (for SSE/HTTP transports) */
  serverUrl?: string;
  /** LLM provider */
  provider?: 'ollama' | 'openai' | 'anthropic';
  /** LLM model */
  model?: string;
  /** Personas to use for explore */
  personas?: string[];
  /** Max questions per tool */
  maxQuestionsPerTool?: number;
  /** Fail on drift detection */
  failOnDrift?: boolean;
  /** Output directory */
  outputDir?: string;
  /** Baseline path */
  baselinePath?: string;
  /** Save baseline on check */
  saveOnCheck?: boolean;
  /** Ollama base URL */
  ollamaBaseUrl?: string;
  /** OpenAI base URL (for mock LLM server) */
  openaiBaseUrl?: string;
  /** Anthropic base URL (for mock LLM server) */
  anthropicBaseUrl?: string;
}

/**
 * Generate a bellwether.yaml configuration file content.
 */
export function generateTestConfig(options: ConfigOptions = {}): string {
  const config: BellwetherConfig = {};

  // Server configuration - get default from mock server if not provided
  const defaultServer = getMockServerTsCommand();
  config.server = {
    command: options.serverCommand ?? defaultServer.command,
    args: options.serverArgs ?? defaultServer.args,
  };

  if (options.serverTimeout !== undefined) {
    config.server.timeout = options.serverTimeout;
  }

  if (options.transport) {
    config.server.transport = options.transport;
    if (options.serverUrl) {
      config.server.url = options.serverUrl;
    }
  }

  // LLM configuration
  config.llm = {
    provider: options.provider ?? 'ollama',
    model: options.model ?? 'llama3.2',
  };

  if (options.ollamaBaseUrl) {
    config.llm.ollamaBaseUrl = options.ollamaBaseUrl;
  }

  if (options.openaiBaseUrl) {
    config.llm.openaiBaseUrl = options.openaiBaseUrl;
  }

  if (options.anthropicBaseUrl) {
    config.llm.anthropicBaseUrl = options.anthropicBaseUrl;
  }

  // Explore configuration
  config.explore = {
    personas: options.personas ?? ['technical_writer'],
    maxQuestionsPerTool: options.maxQuestionsPerTool ?? 2,
  };

  // Output configuration
  config.output = {
    dir: options.outputDir ?? '.',
  };

  // Baseline configuration
  config.baseline = {
    failOnDrift: options.failOnDrift ?? false,
  };

  if (options.baselinePath) {
    config.baseline.path = options.baselinePath;
  }

  if (options.saveOnCheck !== undefined) {
    config.baseline.saveOnCheck = options.saveOnCheck;
  }

  return stringify(config);
}

/**
 * Generate a minimal config with only required fields.
 */
export function generateMinimalConfig(serverCommand?: string, serverArgs?: string[]): string {
  const defaultServer = getMockServerTsCommand();
  return stringify({
    server: {
      command: serverCommand ?? defaultServer.command,
      args: serverArgs ?? defaultServer.args,
    },
  });
}

/**
 * Generate a config for CI/CD environments.
 */
export function generateCIConfig(options: ConfigOptions = {}): string {
  return generateTestConfig({
    provider: 'openai',
    model: 'gpt-4o-mini',
    personas: ['technical_writer'],
    maxQuestionsPerTool: 1,
    failOnDrift: true,
    ...options,
  });
}

/**
 * Generate a config for local development with Ollama.
 */
export function generateLocalConfig(options: ConfigOptions = {}): string {
  return generateTestConfig({
    provider: 'ollama',
    model: 'llama3.2',
    ollamaBaseUrl: 'http://localhost:11434',
    personas: ['technical_writer', 'security_tester'],
    maxQuestionsPerTool: 3,
    failOnDrift: false,
    ...options,
  });
}

/**
 * Generate a config for security-focused testing.
 */
export function generateSecurityConfig(options: ConfigOptions = {}): string {
  return generateTestConfig({
    provider: 'openai',
    model: 'gpt-4o',
    personas: ['security_tester', 'technical_writer', 'qa_engineer'],
    maxQuestionsPerTool: 5,
    failOnDrift: true,
    ...options,
  });
}

/**
 * Generate a config for thorough testing.
 */
export function generateThoroughConfig(options: ConfigOptions = {}): string {
  return generateTestConfig({
    provider: 'openai',
    model: 'gpt-4o',
    personas: ['technical_writer', 'security_tester', 'qa_engineer', 'novice_user'],
    maxQuestionsPerTool: 10,
    failOnDrift: true,
    ...options,
  });
}

/**
 * Generate a config object (not stringified).
 */
export function generateTestConfigObject(options: ConfigOptions = {}): BellwetherConfig {
  const yamlString = generateTestConfig(options);
  // Parse the YAML back to get the config object
  // This ensures consistency with the YAML output
  const yaml = require('yaml');
  return yaml.parse(yamlString) as BellwetherConfig;
}

/**
 * Update an existing config string to use the mock MCP server.
 * This properly updates both command and args in the server section.
 *
 * @param existingConfig - The existing YAML config content
 * @returns Updated YAML config content
 */
export function updateConfigWithMockServer(existingConfig: string): string {
  const mockServer = getMockServerTsCommand();

  // Replace the command and args lines in the server section
  let updated = existingConfig;

  // Replace command line (preserving indentation)
  updated = updated.replace(
    /^(\s*)command:\s*"[^"]*"/m,
    `$1command: "${mockServer.command}"`
  );

  // Replace args line - handle empty array format (args: [])
  // The indentation should match the parent (server) section plus 2 spaces for list items
  const argsYaml = mockServer.args.map((arg) => `    - "${arg}"`).join('\n');
  updated = updated.replace(
    /^(\s*)args:\s*\[\s*\]/m,
    `$1args:\n${argsYaml}`
  );

  return updated;
}
