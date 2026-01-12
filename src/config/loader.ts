import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { LLMProviderId } from '../llm/client.js';
import { DEFAULT_MODELS, detectProvider } from '../llm/index.js';

/**
 * Zod schema for LLM configuration.
 */
const llmConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'ollama']),
  model: z.string().min(1),
  apiKeyEnvVar: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

/**
 * Zod schema for interview configuration.
 */
const interviewConfigSchema = z.object({
  maxQuestionsPerTool: z.number().int().min(1).max(20).default(3),
  timeout: z.number().int().min(1000).max(300000).default(30000),
  skipErrorTests: z.boolean().optional().default(false),
  personas: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * Zod schema for output configuration.
 */
const outputConfigSchema = z.object({
  format: z.enum(['agents.md', 'json', 'both']).default('agents.md'),
  outputDir: z.string().optional(),
});

/**
 * Complete Zod schema for inquest configuration.
 * Note: We allow any positive version number for forward compatibility,
 * but only version 1 is currently supported.
 */
const inquestConfigSchema = z.object({
  version: z.number().int().min(1),
  llm: llmConfigSchema,
  interview: interviewConfigSchema,
  output: outputConfigSchema,
});

/**
 * LLM configuration.
 */
export interface LLMConfigSection {
  /** LLM provider: openai, anthropic, or ollama */
  provider: LLMProviderId;
  /** Model to use (provider-specific) */
  model: string;
  /** Environment variable containing API key */
  apiKeyEnvVar?: string;
  /** Direct API key (not recommended in config files) */
  apiKey?: string;
  /** Base URL for API (for proxies/self-hosted) */
  baseUrl?: string;
}

/**
 * Inquest configuration file structure.
 */
export interface InquestConfig {
  version: number;
  llm: LLMConfigSection;
  interview: {
    maxQuestionsPerTool: number;
    timeout: number;
    skipErrorTests?: boolean;
    /** Personas to use (comma-separated or array) */
    personas?: string | string[];
  };
  output: {
    format: 'agents.md' | 'json' | 'both';
    outputDir?: string;
  };
}

/**
 * Create default configuration based on detected provider.
 */
function createDefaultConfig(): InquestConfig {
  const provider = detectProvider();
  return {
    version: 1,
    llm: {
      provider,
      model: DEFAULT_MODELS[provider],
    },
    interview: {
      maxQuestionsPerTool: 3,
      timeout: 30000,
      skipErrorTests: false,
    },
    output: {
      format: 'agents.md',
    },
  };
}

/**
 * Default configuration (lazily evaluated to allow env detection).
 */
export const DEFAULT_CONFIG: InquestConfig = createDefaultConfig();

/**
 * Config file names to search for.
 */
const CONFIG_NAMES = ['inquest.yaml', 'inquest.yml', '.inquest.yaml', '.inquest.yml'];

/**
 * Load configuration from file or return defaults.
 */
export function loadConfig(explicitPath?: string): InquestConfig {
  if (explicitPath) {
    return loadConfigFile(explicitPath);
  }

  // Search for config file
  const searchPaths = [
    process.cwd(),
    join(process.env.HOME ?? '', '.inquest'),
  ];

  for (const dir of searchPaths) {
    for (const name of CONFIG_NAMES) {
      const configPath = join(dir, name);
      if (existsSync(configPath)) {
        return loadConfigFile(configPath);
      }
    }
  }

  return DEFAULT_CONFIG;
}

/**
 * Load and parse a specific config file.
 */
function loadConfigFile(path: string): InquestConfig {
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');
  let parsed: unknown;

  try {
    parsed = parseYaml(content);
  } catch (error) {
    throw new Error(
      `Invalid YAML in config file ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Handle empty config files - return defaults
  if (parsed === null || parsed === undefined) {
    return DEFAULT_CONFIG;
  }

  // Merge with defaults first
  const merged = mergeConfig(DEFAULT_CONFIG, parsed as Partial<InquestConfig>);

  // Validate merged config
  const result = inquestConfigSchema.safeParse(merged);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path}: ${issue.message}`;
    });
    throw new Error(`Invalid configuration in ${path}:\n${issues.join('\n')}`);
  }

  return result.data as InquestConfig;
}

/**
 * Deep merge config with defaults.
 */
function mergeConfig(defaults: InquestConfig, overrides: Partial<InquestConfig>): InquestConfig {
  return {
    version: overrides.version ?? defaults.version,
    llm: {
      ...defaults.llm,
      ...overrides.llm,
    },
    interview: {
      ...defaults.interview,
      ...overrides.interview,
    },
    output: {
      ...defaults.output,
      ...overrides.output,
    },
  };
}

/**
 * Generate default config file content.
 */
export function generateDefaultConfig(): string {
  return `# Inquest Configuration
version: 1

# LLM Provider Configuration
# Supported providers: openai, anthropic, ollama
llm:
  provider: openai
  model: gpt-4o
  # apiKeyEnvVar: OPENAI_API_KEY  # default for OpenAI

  # Anthropic Claude example:
  # provider: anthropic
  # model: claude-sonnet-4-20250514
  # apiKeyEnvVar: ANTHROPIC_API_KEY

  # Ollama (local) example:
  # provider: ollama
  # model: llama3.2
  # baseUrl: http://localhost:11434

interview:
  maxQuestionsPerTool: 3
  timeout: 30000
  # skipErrorTests: false
  # personas: technical_writer,security_tester  # comma-separated

output:
  format: agents.md
  # outputDir: ./docs
`;
}
