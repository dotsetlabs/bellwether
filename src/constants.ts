/**
 * Centralized constants for the Bellwether CLI.
 *
 * This file consolidates magic numbers and configuration values
 * to improve maintainability and provide a single source of truth.
 */

// ==================== Timeouts ====================

/**
 * Default timeout values in milliseconds.
 */
export const TIMEOUTS = {
  /** Default request timeout (30 seconds) */
  DEFAULT: 30000,
  /** Interview timeout (60 seconds) */
  INTERVIEW: 60000,
  /** Watch mode interval (5 seconds) */
  WATCH_INTERVAL: 5000,
  /** Server startup delay (500ms) */
  SERVER_STARTUP: 500,
  /** Minimum server startup wait (5 seconds) */
  MIN_SERVER_STARTUP_WAIT: 5000,
  /** Server ready poll interval (100ms) */
  SERVER_READY_POLL: 100,
  /** Process shutdown SIGKILL timeout (5 seconds) */
  SHUTDOWN_KILL: 5000,
  /** Cloud API timeout (30 seconds) */
  CLOUD_API: 30000,
} as const;

// ==================== LLM Configuration ====================

/**
 * Default LLM parameters.
 */
export const LLM_DEFAULTS = {
  /** Default max tokens for completions */
  MAX_TOKENS: 4096,
  /** Default temperature for completions */
  TEMPERATURE: 0.7,
  /** Max tokens for analysis prompts */
  ANALYSIS_MAX_TOKENS: 200,
  /** Default Ollama base URL */
  OLLAMA_BASE_URL: 'http://localhost:11434',
} as const;

/**
 * Token estimation values for cost tracking.
 */
export const TOKEN_ESTIMATION = {
  /** Average input tokens per question */
  AVG_INPUT_PER_QUESTION: 500,
  /** Average output tokens per question */
  AVG_OUTPUT_PER_QUESTION: 300,
  /** Schema overhead tokens */
  SCHEMA_OVERHEAD: 200,
  /** Pricing unit (tokens per dollar unit) */
  PRICING_UNIT: 1_000_000,
} as const;

// ==================== Display Formatting ====================

/**
 * Hash display lengths for different contexts.
 */
export const HASH_LENGTH = {
  /** Full hash display (16 characters) */
  FULL: 16,
  /** Short hash display (8 characters) */
  SHORT: 8,
} as const;

/**
 * Truncation limits for displaying lists.
 */
export const TRUNCATION = {
  /** Number of items to show before truncating */
  ITEMS: 3,
  /** Number of error examples to show */
  ERROR_EXAMPLES: 3,
  /** Preview length for raw responses */
  PREVIEW_LENGTH: 200,
  /** Maximum description length before truncating */
  DESCRIPTION_LENGTH: 500,
} as const;

/**
 * CLI column widths for table formatting.
 */
export const COLUMN_WIDTHS = {
  /** Project name column */
  PROJECT_NAME: 19,
  /** Hash column */
  HASH: 11,
  /** Timestamp column */
  TIMESTAMP: 23,
  /** Progress bar width */
  PROGRESS_BAR: 60,
  /** Info box column width */
  INFO_BOX: 38,
} as const;

// ==================== Interview Configuration ====================

/**
 * Default interview settings.
 */
export const INTERVIEW_DEFAULTS = {
  /** Default questions per tool */
  QUESTIONS_PER_TOOL: 3,
  /** Default timeout in ms */
  TIMEOUT: 30000,
} as const;

/**
 * Test type distribution weights for persona-based testing.
 */
export const TEST_TYPE_WEIGHTS = {
  NORMAL: 0.25,
  EDGE: 0.25,
  ERROR: 0.25,
  SECURITY: 0.25,
} as const;

// ==================== Error Rate Thresholds ====================

/**
 * Error rate thresholds for documentation generation.
 */
export const ERROR_THRESHOLDS = {
  /** High error rate threshold (70%) */
  HIGH: 0.7,
  /** Critical error rate threshold (80%) */
  CRITICAL: 0.8,
  /** Access error ratio threshold (50%) */
  ACCESS_ERROR_RATIO: 0.5,
} as const;

// ==================== URLs ====================

/**
 * External URLs used by the CLI.
 */
export const URLS = {
  /** Default cloud API base URL */
  CLOUD_API: 'https://api.bellwether.sh',
  /** SARIF schema URL */
  SARIF_SCHEMA: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
  /** Bellwether documentation base URL */
  DOCS_BASE: 'https://github.com/dotsetlabs/bellwether',
  /** Placeholder host for URL generation */
  PLACEHOLDER_HOST: 'https://example.com',
} as const;

// ==================== Buffer Sizes ====================

/**
 * Buffer and message size limits.
 */
export const BUFFER_SIZES = {
  /** Maximum message size (10 MB) */
  MAX_MESSAGE: 10 * 1024 * 1024,
  /** Maximum buffer size (20 MB) */
  MAX_BUFFER: 20 * 1024 * 1024,
  /** Chunk size for reading (8 KB) */
  CHUNK_SIZE: 8 * 1024,
} as const;

// ==================== Jitter Configuration ====================

/**
 * Jitter range for retry delays.
 */
export const JITTER_RANGE_PERCENT = 0.25;
