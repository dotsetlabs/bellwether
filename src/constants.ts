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
  /** MCP Registry base URL */
  MCP_REGISTRY: 'https://registry.modelcontextprotocol.io',
} as const;

// ==================== Registry ====================

/**
 * MCP Registry configuration.
 */
export const REGISTRY = {
  /** Default request timeout (10 seconds) */
  TIMEOUT: 10000,
  /** API version */
  API_VERSION: 'v0',
} as const;

// ==================== MCP Protocol ====================

/**
 * MCP (Model Context Protocol) configuration.
 */
export const MCP = {
  /** Current MCP protocol version */
  PROTOCOL_VERSION: '2024-11-05',
  /** JSON-RPC version used by MCP */
  JSONRPC_VERSION: '2.0',
} as const;

// ==================== Interview Configuration ====================

/**
 * Interview process configuration defaults.
 */
export const INTERVIEW = {
  /** Default number of questions per tool */
  MAX_QUESTIONS_PER_TOOL: 3,
  /** Default tool call timeout in ms */
  TOOL_TIMEOUT: 30000,
  /** Default CLI timeout in ms (more generous than tool timeout) */
  CLI_TIMEOUT: 60000,
  /** Default persona concurrency for parallel execution */
  DEFAULT_PERSONA_CONCURRENCY: 3,
  /** Maximum allowed persona concurrency (to prevent rate limiting) */
  MAX_PERSONA_CONCURRENCY: 10,
  /** Default resource read timeout in ms */
  RESOURCE_TIMEOUT: 15000,
} as const;

// ==================== Workflow Configuration ====================

/**
 * Workflow discovery and execution configuration defaults.
 */
export const WORKFLOW = {
  /** Maximum workflows to discover via LLM */
  MAX_DISCOVERED_WORKFLOWS: 3,
  /** Minimum steps required for a valid workflow */
  MIN_WORKFLOW_STEPS: 2,
  /** Maximum steps allowed in a workflow */
  MAX_WORKFLOW_STEPS: 5,
  /** Default timeout for workflow step execution in ms */
  STEP_TIMEOUT: 30000,
  /** Default timeout for state snapshot operations in ms */
  STATE_SNAPSHOT_TIMEOUT: 10000,
  /** Default timeout for probe tool operations in ms */
  PROBE_TOOL_TIMEOUT: 5000,
  /** Default timeout for LLM analysis of workflow steps in ms */
  LLM_ANALYSIS_TIMEOUT: 30000,
  /** Default timeout for LLM summary generation in ms */
  LLM_SUMMARY_TIMEOUT: 60000,
} as const;

// ==================== Display Limits ====================

/**
 * String truncation and preview limits for CLI output and logging.
 */
export const DISPLAY_LIMITS = {
  /** Maximum length for tool/prompt descriptions in CLI output */
  DESCRIPTION_MAX_LENGTH: 70,
  /** Truncation point for descriptions (with ellipsis) */
  DESCRIPTION_TRUNCATE_AT: 67,
  /** Preview length for tool responses in logs */
  TOOL_RESPONSE_PREVIEW: 100,
  /** Maximum length for example output in documentation */
  EXAMPLE_OUTPUT_LENGTH: 500,
  /** Preview length for content in documentation */
  CONTENT_PREVIEW_LENGTH: 200,
  /** Preview length for content text (resources, etc.) */
  CONTENT_TEXT_PREVIEW: 500,
  /** Truncation length for error constraints */
  ERROR_CONSTRAINT_LENGTH: 100,
  /** Default max width for table cells */
  TABLE_CELL_MAX_WIDTH: 50,
  /** Max width for CLI output formatting */
  OUTPUT_MAX_WIDTH: 100,
  /** Length of hash substrings for display */
  HASH_DISPLAY_LENGTH: 16,
  /** Preview length for transport data logging */
  TRANSPORT_DATA_PREVIEW: 100,
  /** Preview length for transport input data */
  TRANSPORT_INPUT_PREVIEW: 500,
  /** Smaller preview for response data */
  RESPONSE_DATA_PREVIEW: 50,
  /** Example output length in generated docs */
  DOCS_EXAMPLE_LENGTH: 300,
  /** Banner command max length */
  BANNER_COMMAND_MAX_LENGTH: 45,
} as const;

// ==================== Confidence Thresholds ====================

/**
 * Confidence scoring thresholds for baseline comparison and drift detection.
 */
export const CONFIDENCE = {
  /** Threshold for CI failure (changes above this are significant) */
  CI_FAILURE_THRESHOLD: 80,
  /** Minimum confidence to report a change */
  REPORTING_THRESHOLD: 50,
  /** Score considered "high confidence" */
  HIGH_CONFIDENCE: 85,
  /** Score considered "medium confidence" */
  MEDIUM_CONFIDENCE: 60,
  /** Score considered "low confidence" */
  LOW_CONFIDENCE: 40,
  /** Category match threshold for security findings */
  CATEGORY_MATCH_HIGH: 80,
  /** Category partial match threshold */
  CATEGORY_MATCH_MEDIUM: 60,
  /** Minimum category match for consideration */
  CATEGORY_MATCH_LOW: 20,
  /** Statistical confidence level for A/B testing (95%) */
  STATISTICAL_CONFIDENCE: 0.95,
  /** Maximum acceptable false positive rate (5%) */
  MAX_FALSE_POSITIVE_RATE: 5,
} as const;

// ==================== Semantic Comparison Weights ====================

/**
 * Weight factors for semantic comparison algorithms.
 * Weights in each category should generally sum to 1.0 for normalization.
 */
export const SEMANTIC_WEIGHTS = {
  // Security finding comparison weights
  SECURITY: {
    SHARED_TERMS: 0.25,
    SYNONYM_SIMILARITY: 0.15,
    CATEGORY_MATCH: 0.25,
    TOOL_MATCH: 0.1,
    SEVERITY_MATCH: 0.15,
    SPECIFICITY: 0.1,
  },
  // Response format comparison weights
  RESPONSE_FORMAT: {
    STRUCTURE: 0.25,
    CONTENT_TYPE: 0.2,
    FIELD_OVERLAP: 0.25,
    VALUE_SIMILARITY: 0.15,
    SCHEMA_MATCH: 0.15,
  },
  // Error handling comparison weights
  ERROR_HANDLING: {
    ERROR_TYPE: 0.25,
    MESSAGE_SIMILARITY: 0.2,
    RECOVERY_BEHAVIOR: 0.2,
    CONTEXT_MATCH: 0.15,
    SEVERITY: 0.2,
  },
  // Performance comparison weights
  PERFORMANCE: {
    LATENCY: 0.25,
    THROUGHPUT: 0.2,
    ERROR_RATE: 0.25,
    CONSISTENCY: 0.15,
    RESOURCE_USAGE: 0.15,
  },
  // Description comparison weights
  DESCRIPTION: {
    SEMANTIC_SIMILARITY: 0.3,
    KEYWORD_OVERLAP: 0.2,
    LENGTH_SIMILARITY: 0.1,
    STRUCTURE: 0.2,
    SPECIFICITY: 0.2,
  },
  // Confidence scoring component weights (tuned for paraphrase detection)
  CONFIDENCE_SCORING: {
    keywordOverlap: 0.35,
    structuralAlignment: 0.15,
    semanticSimilarity: 0.30,
    categoryConsistency: 0.20,
  },
} as const;

// ==================== Mathematical Factors ====================

/**
 * Mathematical ratios, multipliers, and thresholds used in calculations.
 */
export const MATH_FACTORS = {
  /** Safety margin for token budget calculations (95% of limit) */
  TOKEN_SAFETY_MARGIN: 0.95,
  /** Threshold for word boundary truncation */
  WORD_BOUNDARY_THRESHOLD: 0.8,
  /** Multiplier for special character adjustment in token counting */
  SPECIAL_CHAR_MULTIPLIER: 0.5,
  /** Threshold for consecutive failures in state tracking (50% of probes) */
  PROBE_FAILURE_THRESHOLD: 0.5,
  /** Jitter range for retry delays (±25%) */
  JITTER_RANGE: 0.25,
  /** Weight for embedding similarity */
  EMBEDDING_WEIGHT: 0.3,
  /** Threshold for embedding match */
  EMBEDDING_MATCH_THRESHOLD: 0.75,
  /** Minimum ratio tolerance for comparison (99%) */
  RATIO_TOLERANCE_MIN: 0.99,
  /** Maximum ratio tolerance for comparison (101%) */
  RATIO_TOLERANCE_MAX: 1.01,
  /** Default question bias weight (equal distribution across 4 categories) */
  DEFAULT_QUESTION_BIAS: 0.25,
  /** Multiplier for shared terms score (per term) */
  SHARED_TERMS_MULTIPLIER: 50,
  /** Maximum score cap for calculations */
  MAX_SCORE_CAP: 100,
  /** Minimum threshold for common constraints in docs */
  MIN_COMMON_CONSTRAINT_THRESHOLD: 2,
} as const;

// ==================== Time Constants ====================

/**
 * Time-related constants for sessions, polling, and calculations.
 */
export const TIME_CONSTANTS = {
  /** Session expiration duration (30 days in ms) */
  SESSION_EXPIRATION_MS: 30 * 24 * 60 * 60 * 1000,
  /** Milliseconds per day (for calculations) */
  MS_PER_DAY: 1000 * 60 * 60 * 24,
  /** Milliseconds per minute */
  MS_PER_MINUTE: 60000,
  /** Milliseconds per second */
  MS_PER_SECOND: 1000,
  /** Health check interval for LLM providers (1 minute) */
  HEALTH_CHECK_INTERVAL: 60000,
  /** Delay before retrying unhealthy provider (5 minutes) */
  UNHEALTHY_RETRY_DELAY: 300000,
  /** Default reconnect delay for SSE (1 second) */
  SSE_RECONNECT_DELAY: 1000,
  /** Maximum backoff delay for SSE reconnection (30 seconds) */
  SSE_MAX_BACKOFF: 30000,
  /** Default cache TTL (1 hour) */
  DEFAULT_CACHE_TTL: 3600000,
  /** Verification validity period in days */
  VERIFICATION_VALIDITY_DAYS: 90,
  /** Embedding timeout (5 seconds) */
  EMBEDDING_TIMEOUT: 5000,
} as const;

// ==================== Retry Configuration ====================

/**
 * Retry and backoff configuration.
 */
export const RETRY = {
  /** Initial delay for exponential backoff (1 second) */
  INITIAL_DELAY: 1000,
  /** Maximum delay for exponential backoff (10 seconds) */
  MAX_DELAY: 10000,
  /** Default number of retry attempts */
  DEFAULT_ATTEMPTS: 3,
  /** Maximum retry attempts for LLM operations */
  MAX_LLM_ATTEMPTS: 3,
} as const;

// ==================== Formatting ====================

/**
 * Number formatting precision values.
 */
export const FORMATTING = {
  /** Decimal places for price display */
  PRICE_PRECISION: 4,
  /** Decimal places for duration display */
  DURATION_PRECISION: 1,
  /** Decimal places for percentage display */
  PERCENTAGE_PRECISION: 1,
  /** Decimal places for confidence level display */
  CONFIDENCE_PRECISION: 0,
} as const;

// ==================== Cache Configuration ====================

/**
 * Cache configuration limits.
 */
export const CACHE = {
  /** Maximum number of entries in response cache */
  MAX_ENTRIES: 1000,
} as const;

// ==================== Validation Limits ====================

/**
 * Validation boundaries for user input.
 */
export const VALIDATION = {
  /** Minimum allowed max-tokens value */
  MIN_MAX_TOKENS: 1000,
  /** Minimum confidence score */
  MIN_CONFIDENCE_SCORE: 0,
  /** Maximum confidence score */
  MAX_CONFIDENCE_SCORE: 100,
  /** Maximum YAML alias resolution depth */
  MAX_ALIAS_DEPTH: 100,
} as const;

// ==================== Percentiles ====================

/**
 * Percentile values for metrics calculations.
 */
export const PERCENTILES = {
  P50: 0.5,
  P95: 0.95,
  P99: 0.99,
} as const;

// ==================== Cost Thresholds ====================

/**
 * Cost thresholds for CI/CD optimization features.
 */
export const COST_THRESHOLDS = {
  /** Cost threshold ($) for prompting confirmation in interactive mode */
  CONFIRMATION_THRESHOLD: 0.10,
  /** Cost threshold ($) for suggesting --ci flag */
  SUGGEST_CI_THRESHOLD: 0.05,
  /** Cost threshold ($) for suggesting --scenarios-only */
  SUGGEST_SCENARIOS_ONLY_THRESHOLD: 0.15,
  /** Tool count threshold for suggesting --parallel-personas */
  PARALLEL_PERSONAS_TOOL_THRESHOLD: 30,
  /** Tool count threshold for suggesting removing --quality */
  QUALITY_TOOL_THRESHOLD: 20,
} as const;

// ==================== Time Estimation ====================

/**
 * Time estimation factors for interview duration prediction.
 */
export const TIME_ESTIMATION = {
  /** Base seconds per question (cloud APIs) */
  SECONDS_PER_QUESTION: 3,
  /** Overhead seconds per tool for schema processing */
  SECONDS_PER_TOOL_OVERHEAD: 1,
  /** Parallel persona efficiency factor (0-1, 1 = perfect parallelism) */
  PARALLEL_EFFICIENCY: 0.6,
  /** Fixed overhead for discovery phase in seconds */
  DISCOVERY_OVERHEAD_SECONDS: 10,
  /** Fixed overhead for synthesis phase in seconds */
  SYNTHESIS_OVERHEAD_SECONDS: 15,
  /** Time multiplier for local/Ollama models (slower than cloud APIs) */
  LOCAL_MODEL_MULTIPLIER: 3.5,
  /** Seconds per prompt interview */
  SECONDS_PER_PROMPT: 4,
  /** Seconds per resource interview */
  SECONDS_PER_RESOURCE: 3,
} as const;

// ==================== Retry Strategies ====================

/**
 * Detailed retry configurations for different operation types.
 * These provide more specific settings than the basic RETRY constants.
 */
export const RETRY_STRATEGIES = {
  /** LLM API calls - more tolerant due to rate limiting */
  LLM: {
    maxAttempts: 3,
    initialDelayMs: 2000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitter: true,
  },
  /** Transport/connection operations - faster retries */
  TRANSPORT: {
    maxAttempts: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitter: true,
  },
  /** Tool call operations */
  TOOL_CALL: {
    maxAttempts: 2,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitter: false,
  },
  /** Default strategy for general operations */
  DEFAULT: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitter: true,
  },
} as const;

// ==================== Circuit Breaker ====================

/**
 * Circuit breaker configuration for fault tolerance.
 */
export const CIRCUIT_BREAKER = {
  /** Number of failures before circuit opens */
  FAILURE_THRESHOLD: 5,
  /** Time to wait before attempting to close circuit (ms) */
  RESET_TIME_MS: 30000,
  /** Window in which failures are counted (ms) */
  FAILURE_WINDOW_MS: 60000,
} as const;

// ==================== Validation Bounds ====================

/**
 * Min/max validation boundaries for configuration values.
 */
export const VALIDATION_BOUNDS = {
  /** Timeout bounds in milliseconds */
  TIMEOUT: {
    MIN_MS: 1000,
    MAX_MS: 600000,
  },
  /** Questions per tool bounds */
  QUESTIONS_PER_TOOL: {
    MIN: 1,
    MAX: 10,
  },
  /** Confidence score bounds */
  CONFIDENCE: {
    MIN: 0,
    MAX: 100,
  },
  /** Persona concurrency bounds */
  PERSONA_CONCURRENCY: {
    MIN: 1,
    MAX: 10,
  },
  /** Max workflows bounds */
  MAX_WORKFLOWS: {
    MIN: 1,
    MAX: 20,
  },
} as const;

// ==================== File Paths ====================

/**
 * Default file and directory paths used by the CLI.
 */
export const PATHS = {
  /** User config directory name (under home) */
  CONFIG_DIR: '.bellwether',
  /** Session storage file name */
  SESSION_FILE: 'session.json',
  /** Mock data directory for testing */
  MOCK_DATA_DIR: 'mock-cloud',
  /** Possible config file names (in order of preference) */
  CONFIG_FILENAMES: [
    'bellwether.yaml',
    'bellwether.yml',
    '.bellwether.yaml',
    '.bellwether.yml',
  ],
  /** Default baseline output file */
  DEFAULT_BASELINE_FILE: 'bellwether-baseline.json',
  /** Default test report file */
  DEFAULT_REPORT_FILE: 'bellwether-report.json',
  /** Default test scenarios file */
  DEFAULT_SCENARIOS_FILE: 'bellwether-tests.yaml',
  /** Default workflows file */
  DEFAULT_WORKFLOWS_FILE: 'bellwether-workflows.yaml',
  /** Default AGENTS.md output file */
  DEFAULT_AGENTS_FILE: 'AGENTS.md',
} as const;

// ==================== Patterns ====================

/**
 * Regex patterns for validation and parsing.
 */
export const PATTERNS = {
  /** Valid session token format (64 hex chars after prefix) */
  SESSION_TOKEN: /^sess_[a-f0-9]{64}$/,
  /** Mock session token format for testing */
  MOCK_SESSION_TOKEN: /^sess_mock_[a-zA-Z0-9]+_[a-f0-9]+$/,
  /** Semver version format */
  SEMVER: /^\d+\.\d+\.\d+$/,
  /** Partial semver (major.minor) */
  SEMVER_PARTIAL: /^\d+\.\d+$/,
  /** Major version only */
  SEMVER_MAJOR: /^\d+$/,
} as const;

// ==================== Security ====================

/**
 * CLI_SECURITY: Security-related constants for CLI operations.
 */
export const CLI_SECURITY = {
  /** Hostnames considered localhost (skip TLS verification) */
  LOCALHOST_HOSTS: ['localhost', '127.0.0.1'],
  /** Allowed domains for Bellwether Cloud */
  ALLOWED_DOMAINS: ['bellwether.sh', 'api.bellwether.sh', 'dashboard.bellwether.sh'],
  /** Session token prefix */
  SESSION_PREFIX: 'sess_',
  /** Mock session token prefix for testing */
  MOCK_SESSION_PREFIX: 'sess_mock_',
} as const;

// ==================== External URLs ====================

/**
 * External service URLs.
 */
export const EXTERNAL_URLS = {
  /** Bellwether dashboard base URL */
  DASHBOARD: 'https://bellwether.sh',
  /** Shields.io badge service */
  SHIELDS_BADGE: 'https://img.shields.io/badge',
} as const;

// ==================== Token Estimation ====================

/**
 * Token estimation factors for cost prediction.
 */
export const TOKEN_ESTIMATION = {
  /** Average input tokens per question */
  AVG_INPUT_PER_QUESTION: 500,
  /** Average output tokens per question */
  AVG_OUTPUT_PER_QUESTION: 300,
  /** Schema overhead tokens per tool */
  SCHEMA_OVERHEAD_PER_TOOL: 200,
  /** Character to token ratio (approximate) */
  CHARS_PER_TOKEN: 4,
  /** Word adjustment factor */
  WORD_ADJUSTMENT: 0.3,
  /** Role/message overhead tokens */
  MESSAGE_OVERHEAD_TOKENS: 4,
  /** Default context window when model unknown */
  DEFAULT_CONTEXT_WINDOW: 16000,
} as const;

// ==================== Token Budget ====================

/**
 * Default token budget limits.
 */
export const TOKEN_BUDGET = {
  /** Maximum total tokens for an interview */
  MAX_TOTAL_TOKENS: 1000000,
  /** Maximum input tokens per request */
  MAX_INPUT_PER_REQUEST: 100000,
  /** Maximum output tokens per request */
  MAX_OUTPUT_PER_REQUEST: 8000,
  /** Reserved tokens for output in context */
  OUTPUT_RESERVE: 4000,
} as const;

// ==================== Metrics ====================

/**
 * Metrics collection configuration.
 */
export const METRICS_CONFIG = {
  /** Maximum entries in metrics store */
  MAX_ENTRIES: 10000,
  /** Latency histogram buckets (ms) */
  LATENCY_BUCKETS: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  /** Metric name prefix */
  PREFIX: 'bellwether_',
} as const;

// ==================== LLM Models ====================

/**
 * Default model configurations per provider.
 * Uses budget-friendly models by default for cost efficiency.
 */
export const DEFAULT_MODELS = {
  openai: 'gpt-5-mini',
  anthropic: 'claude-haiku-4-5',
  ollama: 'llama3.2',
} as const;

/**
 * Premium model configurations for --quality flag.
 * Higher quality output but more expensive.
 */
export const PREMIUM_MODELS = {
  openai: 'gpt-5.2',
  anthropic: 'claude-sonnet-4-5',
  ollama: 'llama3.2:70b',
} as const;
