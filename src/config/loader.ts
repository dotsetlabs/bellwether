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
  // Note: apiKey is intentionally NOT allowed in config files for security
  // Users must use apiKeyEnvVar to reference environment variables
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
 * Zod schema for drift detection configuration.
 */
const driftConfigSchema = z.object({
  /** Strict mode: only report structural (deterministic) changes */
  strict: z.boolean().optional().default(false),
  /** Minimum confidence score (0-100) to report a change */
  minConfidence: z.number().int().min(0).max(100).optional(),
  /** Confidence threshold (0-100) for CI to fail on breaking changes */
  confidenceThreshold: z.number().int().min(0).max(100).optional().default(80),
  /** Fail on drift in CI mode */
  failOnDrift: z.boolean().optional().default(false),
});

/**
 * Complete Zod schema for bellwether configuration.
 * Note: We allow any positive version number for forward compatibility,
 * but only version 1 is currently supported.
 */
const bellwetherConfigSchema = z.object({
  version: z.number().int().min(1),
  llm: llmConfigSchema,
  interview: interviewConfigSchema,
  output: outputConfigSchema,
  drift: driftConfigSchema.optional(),
});

/**
 * LLM configuration.
 */
export interface LLMConfigSection {
  /** LLM provider: openai, anthropic, or ollama */
  provider: LLMProviderId;
  /** Model to use (provider-specific) */
  model: string;
  /** Environment variable containing API key (recommended) */
  apiKeyEnvVar?: string;
  /**
   * Direct API key - NOT ALLOWED in config files for security.
   * This field is only used for programmatic API calls.
   * For config files, use apiKeyEnvVar to reference environment variables.
   */
  apiKey?: string;
  /** Base URL for API (for proxies/self-hosted) */
  baseUrl?: string;
}

/**
 * Bellwether configuration file structure.
 */
export interface BellwetherConfig {
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
  drift?: {
    /** Strict mode: only report structural (deterministic) changes */
    strict?: boolean;
    /** Minimum confidence score (0-100) to report a change */
    minConfidence?: number;
    /** Confidence threshold (0-100) for CI to fail on breaking changes */
    confidenceThreshold?: number;
    /** Fail on drift in CI mode */
    failOnDrift?: boolean;
  };
}

/**
 * Create default configuration based on detected provider.
 */
function createDefaultConfig(): BellwetherConfig {
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
    drift: {
      strict: false,
      confidenceThreshold: 80,
      failOnDrift: false,
    },
  };
}

/**
 * Default configuration (lazily evaluated to allow env detection after dotenv loads).
 */
export function getDefaultConfig(): BellwetherConfig {
  return createDefaultConfig();
}


/**
 * Config file names to search for.
 */
const CONFIG_NAMES = ['bellwether.yaml', 'bellwether.yml', '.bellwether.yaml', '.bellwether.yml'];

/**
 * Load configuration from file or return defaults.
 */
export function loadConfig(explicitPath?: string): BellwetherConfig {
  if (explicitPath) {
    return loadConfigFile(explicitPath);
  }

  // Search for config file
  const searchPaths = [
    process.cwd(),
    join(process.env.HOME ?? '', '.bellwether'),
  ];

  for (const dir of searchPaths) {
    for (const name of CONFIG_NAMES) {
      const configPath = join(dir, name);
      if (existsSync(configPath)) {
        return loadConfigFile(configPath);
      }
    }
  }

  return getDefaultConfig();
}

/**
 * Load and parse a specific config file.
 */
function loadConfigFile(path: string): BellwetherConfig {
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
    return getDefaultConfig();
  }

  // SECURITY: Reject API keys stored directly in config files
  const rawConfig = parsed as Record<string, unknown>;
  const llmConfig = rawConfig.llm as Record<string, unknown> | undefined;
  if (llmConfig?.apiKey) {
    throw new Error(
      `Security Error: API key found in config file "${path}".\n` +
      `Storing API keys in config files is a security risk.\n` +
      `Please use apiKeyEnvVar instead to reference an environment variable.\n\n` +
      `Example:\n` +
      `  llm:\n` +
      `    provider: openai\n` +
      `    apiKeyEnvVar: OPENAI_API_KEY  # References $OPENAI_API_KEY\n\n` +
      `Remove the 'apiKey' field from your config file and set the API key\n` +
      `as an environment variable instead.`
    );
  }

  // Merge with defaults first
  const defaults = getDefaultConfig();
  const merged = mergeConfig(defaults, parsed as Partial<BellwetherConfig>);

  // Validate merged config
  const result = bellwetherConfigSchema.safeParse(merged);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path}: ${issue.message}`;
    });
    throw new Error(`Invalid configuration in ${path}:\n${issues.join('\n')}`);
  }

  return result.data as BellwetherConfig;
}

/**
 * Deep merge config with defaults.
 */
function mergeConfig(defaults: BellwetherConfig, overrides: Partial<BellwetherConfig>): BellwetherConfig {
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
    drift: {
      ...defaults.drift,
      ...overrides.drift,
    },
  };
}

/**
 * Generate default config file content.
 */
export function generateDefaultConfig(): string {
  return `# Bellwether Configuration
version: 1

# LLM Provider Configuration
# Supported providers: openai, anthropic, ollama
llm:
  provider: openai
  model: gpt-5-mini  # Budget-friendly default (~$0.02/interview)

  # Cost comparison (10 tools, 3 questions each):
  # - gpt-5.2: ~$0.12 per interview (best quality)
  # - gpt-5-mini: ~$0.02 per interview (recommended for CI)
  # - claude-sonnet-4-5: ~$0.13 per interview
  # - claude-haiku-4-5: ~$0.04 per interview (fast, cheap)
  # - ollama: free (local, no API key needed)

  # Anthropic Claude example:
  # provider: anthropic
  # model: claude-haiku-4-5  # Fast and cheap
  # apiKeyEnvVar: ANTHROPIC_API_KEY

  # Ollama (local, free) example:
  # provider: ollama
  # model: llama3.2
  # baseUrl: http://localhost:11434

interview:
  maxQuestionsPerTool: 3  # Use --quick flag for CI (1 question per tool)
  timeout: 30000
  # skipErrorTests: false
  # personas: technical_writer,security_tester  # comma-separated

output:
  format: agents.md
  # outputDir: ./docs

# Drift Detection Configuration
drift:
  # Strict mode: only report structural (deterministic) changes
  # Use this in CI for 100% reproducible results
  strict: false

  # Minimum confidence score (0-100) to report a change
  # Changes below this threshold are filtered out
  # minConfidence: 50

  # Confidence threshold (0-100) for CI to fail on breaking changes
  # Breaking changes with confidence below this are still reported
  # but may be LLM non-determinism rather than actual drift
  confidenceThreshold: 80

  # Fail on drift in CI mode
  failOnDrift: false
`;
}
