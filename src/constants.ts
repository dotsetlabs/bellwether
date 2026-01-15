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

// ==================== URLs ====================

/**
 * External URLs used by the CLI.
 */
export const URLS = {
  /** Default cloud API base URL */
  CLOUD_API: 'https://api.bellwether.sh',
  /** Bellwether documentation base URL */
  DOCS_BASE: 'https://github.com/dotsetlabs/bellwether',
  /** Placeholder host for URL generation */
  PLACEHOLDER_HOST: 'https://example.com',
} as const;
