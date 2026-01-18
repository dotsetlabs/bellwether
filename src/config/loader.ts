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
  type BellwetherConfigNew,
} from './validator.js';

// Re-export the new config type
export type { BellwetherConfigNew };

/**
 * Config file names to search for.
 */
export const CONFIG_NAMES = [
  'bellwether.yaml',
  'bellwether.yml',
  '.bellwether.yaml',
  '.bellwether.yml',
];

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
export function loadConfigNew(explicitPath?: string): BellwetherConfigNew {
  // Find config file
  const configPath = findConfigFile(explicitPath);

  if (!configPath) {
    // Build list of searched paths for helpful error message
    const searchedPaths = explicitPath
      ? [explicitPath]
      : CONFIG_NAMES.map((name) => join(process.cwd(), name));
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

