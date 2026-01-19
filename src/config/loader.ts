/**
 * Configuration loader.
 *
 * Loads bellwether.yaml configuration. Config file is REQUIRED for running tests.
 * Use `bellwether init` to create a config file with all options documented.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseYamlSecure } from '../utils/yaml-parser.js';
import {
  validateConfig,
  findConfigFile,
  type BellwetherConfig,
} from './validator.js';
import { PATHS } from '../constants.js';

/**
 * Interpolate environment variables in a string.
 * Supports ${VAR} and $VAR syntax.
 *
 * @param value - String that may contain env var references
 * @returns String with env vars replaced with their values
 */
function interpolateEnvVars(value: string): string {
  // Match ${VAR} or ${VAR:-default} syntax
  return value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    // Check for default value syntax: ${VAR:-default}
    const [varName, defaultValue] = expr.split(':-');
    const envValue = process.env[varName.trim()];
    if (envValue !== undefined) {
      return envValue;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    // Return original if no value and no default
    return match;
  });
}

/**
 * Recursively interpolate environment variables in a config object.
 * Only interpolates string values.
 *
 * @param obj - Object to interpolate
 * @returns New object with env vars interpolated
 */
function interpolateConfig<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return interpolateEnvVars(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateConfig(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateConfig(value);
    }
    return result as T;
  }

  return obj;
}

// Re-export the config type
export type { BellwetherConfig };

/**
 * Error thrown when no config file is found.
 */
export class ConfigNotFoundError extends Error {
  constructor(searchedPaths?: string[]) {
    const message = searchedPaths
      ? `No bellwether config file found.\n\nSearched:\n${searchedPaths.map((p) => `  - ${p}`).join('\n')}\n\nRun \`bellwether init\` to create a config file.`
      : 'No bellwether config file found.\n\nRun `bellwether init` to create a config file.';
    super(message);
    this.name = 'ConfigNotFoundError';
  }
}

/**
 * Load configuration from file. Config file is REQUIRED.
 *
 * @param explicitPath - Optional explicit path to config file
 * @returns Validated configuration
 * @throws ConfigNotFoundError if no config file is found
 * @throws Error if config file is invalid
 */
export function loadConfig(explicitPath?: string): BellwetherConfig {
  // Find config file
  const configPath = findConfigFile(explicitPath);

  if (!configPath) {
    // Build list of searched paths for helpful error message
    const searchedPaths = explicitPath
      ? [explicitPath]
      : PATHS.CONFIG_FILENAMES.map((name) => join(process.cwd(), name));
    throw new ConfigNotFoundError(searchedPaths);
  }

  // Load and parse the file
  const content = readFileSync(configPath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = parseYamlSecure(content);
  } catch (error) {
    throw new Error(
      `Invalid YAML in config file ${configPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Handle empty config files - treat as minimal valid config
  if (parsed === null || parsed === undefined) {
    parsed = {};
  }

  // Interpolate environment variables (e.g., ${PLEX_TOKEN})
  parsed = interpolateConfig(parsed);

  // SECURITY: Reject API keys stored directly in config files
  const rawConfig = parsed as Record<string, unknown>;
  const llmConfig = rawConfig.llm as Record<string, unknown> | undefined;
  if (llmConfig?.apiKey || llmConfig?.openaiApiKey || llmConfig?.anthropicApiKey) {
    throw new Error(
      `Security Error: API key found in config file "${configPath}".\n` +
        `Storing API keys in config files is a security risk.\n\n` +
        `Use environment variables instead:\n` +
        `  export OPENAI_API_KEY=sk-xxx\n` +
        `  export ANTHROPIC_API_KEY=sk-ant-xxx\n\n` +
        `Or use the secure credential store:\n` +
        `  bellwether auth\n\n` +
        `Remove any API key fields from your config file.`
    );
  }

  // Validate and apply defaults using the new schema
  return validateConfig(parsed, configPath);
}

