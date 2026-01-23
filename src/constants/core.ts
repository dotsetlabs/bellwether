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
  /** Max tokens for analysis prompts (must be high enough for reasoning models) */
  ANALYSIS_MAX_TOKENS: 1024,
  /** Default Ollama base URL */
  OLLAMA_BASE_URL: 'http://localhost:11434',
} as const;

// ==================== URLs ====================

/**
 * External URLs used by the CLI.
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
  /** Default tool concurrency for parallel tool testing (check mode) */
  DEFAULT_TOOL_CONCURRENCY: 4,
  /** Maximum allowed tool concurrency (to prevent overwhelming MCP servers) */
  MAX_TOOL_CONCURRENCY: 10,
  /** Default resource read timeout in ms */
  RESOURCE_TIMEOUT: 15000,
  /** Tool names that reveal server constraints (directories, permissions, etc.) */
  CONSTRAINT_DISCOVERY_TOOLS: [
    'list_allowed_directories',
    'get_allowed_paths',
    'list_permissions',
  ] as readonly string[],
} as const;

// ==================== Orchestrator Configuration ====================

/**
 * Orchestrator test generation configuration.
 * Controls limits for structural test case generation.
 */

export const ORCHESTRATOR = {
  /** Maximum schema-level examples to use for test generation */
  MAX_SCHEMA_EXAMPLES: 2,
  /** Maximum enum value tests to generate per parameter */
  MAX_ENUM_TESTS: 3,
  /** Maximum boundary tests (min/max/zero) to generate */
  MAX_BOUNDARY_TESTS: 2,
  /** Maximum optional parameter combination tests */
  MAX_OPTIONAL_TESTS: 2,
  /** Maximum invalid type tests for error handling */
  MAX_INVALID_TYPE_TESTS: 2,
  /** Maximum recursion depth for schema traversal (prevents infinite loops) */
  MAX_SCHEMA_RECURSION_DEPTH: 10,
  /** Default numeric range minimum when not specified in schema */
  DEFAULT_NUMBER_MIN: 0,
  /** Default numeric range maximum when not specified in schema */
  DEFAULT_NUMBER_MAX: 100,
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
  /** Default config file name (first in CONFIG_FILENAMES) */
  DEFAULT_CONFIG_FILENAME: 'bellwether.yaml',
  /** Default baseline output file (for upload command) */
  DEFAULT_BASELINE_FILE: 'bellwether-baseline.json',
  /** Default check report file */
  DEFAULT_CHECK_REPORT_FILE: 'bellwether-check.json',
  /** Default explore report file */
  DEFAULT_EXPLORE_REPORT_FILE: 'bellwether-explore.json',
  /** Default verification report file */
  DEFAULT_VERIFICATION_REPORT_FILE: 'bellwether-verification.json',
  /** Default test scenarios file */
  DEFAULT_SCENARIOS_FILE: 'bellwether-tests.yaml',
  /** Default workflows file */
  DEFAULT_WORKFLOWS_FILE: 'bellwether-workflows.yaml',
  /** Default AGENTS.md output file (explore command) */
  DEFAULT_AGENTS_FILE: 'AGENTS.md',
  /** Default CONTRACT.md output file (check command) */
  DEFAULT_CONTRACT_FILE: 'CONTRACT.md',
  /** Default cache directory */
  DEFAULT_CACHE_DIR: '.bellwether/cache',
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
  LOCALHOST_HOSTS: ['localhost', '127.0.0.1', '::1'],
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
 * Uses budget-friendly, non-reasoning models by default for cost efficiency.
 * Note: gpt-4.1-nano is preferred over gpt-5-nano because GPT-5 models use
 * reasoning tokens that increase costs unpredictably.
 */

export const DEFAULT_MODELS = {
  openai: 'gpt-4.1-nano',
  anthropic: 'claude-haiku-4-5',
  ollama: 'qwen3:8b',
} as const;

/**
 * Premium model configurations for --quality flag.
 * Higher quality output but more expensive.
 */

export const PREMIUM_MODELS = {
  openai: 'gpt-4.1',
  anthropic: 'claude-sonnet-4-5',
  ollama: 'llama3.2:70b',
} as const;
