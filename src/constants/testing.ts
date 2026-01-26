/**
 * Change impact analysis configuration.
 * Used by change-impact-analyzer.ts for semantic breaking change detection.
 */
export const CHANGE_IMPACT = {
  /** Risk weights for different schema change types (0-100 scale) */
  RISK_WEIGHTS: {
    parameter_removed: 100,
    parameter_required_added: 90,
    parameter_type_changed: 85,
    enum_value_removed: 80,
    constraint_tightened: 60,
    format_changed: 50,
    constraint_added: 40,
    default_changed: 30,
    constraint_removed: 20,
    parameter_required_removed: 15,
    enum_value_added: 10,
    parameter_added: 10,
    description_changed: 5,
    constraint_relaxed: 5,
  },
  /** Migration complexity thresholds (number of breaking changes) */
  COMPLEXITY_THRESHOLDS: {
    /** 0-1 breaking changes = trivial migration */
    trivial: 1,
    /** 2-3 breaking changes = simple migration */
    simple: 3,
    /** 4-6 breaking changes = moderate migration */
    moderate: 6,
    // 7+ breaking changes = complex migration
  },
  /** Risk score thresholds for severity classification */
  SEVERITY_THRESHOLDS: {
    info: 20,
    warning: 50,
    breaking: 70,
  },
} as const;

/**
 * Check command configuration defaults.
 * Used by check.ts and incremental-checker.ts.
 */

export const CHECK = {
  /** Default cache age for incremental checking (1 week in hours) */
  DEFAULT_INCREMENTAL_CACHE_HOURS: 168,
  /** Minimum cache age (1 hour) */
  MIN_INCREMENTAL_CACHE_HOURS: 1,
  /** Maximum cache age (30 days in hours) */
  MAX_INCREMENTAL_CACHE_HOURS: 720,
} as const;

/**
 * Performance tracking configuration.
 * Used by performance-tracker.ts for latency regression detection.
 */

export const PERFORMANCE_TRACKING = {
  /** Default regression threshold (10% = tool is 10% slower) */
  DEFAULT_REGRESSION_THRESHOLD: 0.10,
  /** Warning threshold for minor regressions (5%) */
  WARNING_THRESHOLD: 0.05,
  /** Minimum samples required for reliable metrics */
  MIN_SAMPLES: 3,
  /** Trend detection thresholds */
  TREND_THRESHOLDS: {
    /** Performance is "improving" if p50 is at least 5% faster */
    improving: -0.05,
    /** Performance is "degrading" if p50 is at least 5% slower */
    degrading: 0.05,
  },
  /** Percentiles to calculate for latency analysis */
  PERCENTILES: [50, 95, 99] as readonly number[],
} as const;

/**
 * Performance confidence scoring configuration.
 * Used by performance-tracker.ts for statistical validity assessment.
 *
 * Confidence levels indicate how reliable performance baselines are:
 * - HIGH: Enough samples with low variability - baselines are reliable
 * - MEDIUM: Moderate samples or variability - use with caution
 * - LOW: Few samples or high variability - consider collecting more data
 */

export const PERFORMANCE_CONFIDENCE = {
  /** Thresholds for high confidence level */
  HIGH: {
    /** Minimum samples required for high confidence */
    MIN_SAMPLES: 10,
    /** Maximum coefficient of variation for high confidence (0.3 = 30%) */
    MAX_CV: 0.3,
  } as const,

  /** Thresholds for medium confidence level */
  MEDIUM: {
    /** Minimum samples required for medium confidence */
    MIN_SAMPLES: 5,
    /** Maximum coefficient of variation for medium confidence (0.5 = 50%) */
    MAX_CV: 0.5,
  } as const,

  /** Warmup configuration for excluding cold-start overhead from variance */
  WARMUP: {
    /** Default number of warmup runs before timing (0 = include first sample in variance) */
    DEFAULT_RUNS: 1,
    /** Whether to exclude warmup from variance calculation by default */
    EXCLUDE_FROM_VARIANCE: true,
  } as const,

  /** Display labels for confidence levels */
  LABELS: {
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
  } as const,

  /** Emoji indicators for confidence levels (used in Markdown) */
  INDICATORS: {
    high: '✓',
    medium: '~',
    low: '!',
  } as const,

  /** Recommendation messages for low confidence */
  RECOMMENDATIONS: {
    /** Message when sample count is too low */
    LOW_SAMPLES: (current: number, target: number) =>
      `Run with --samples ${target - current + current} for reliable baseline`,
    /** Message when variability is too high */
    HIGH_VARIABILITY:
      'High variability in response times; consider investigating causes',
    /** Message when no samples collected */
    NO_SAMPLES: 'No performance samples collected',
  } as const,
} as const;

/**
 * Deprecation lifecycle configuration.
 * Used by deprecation-tracker.ts for tool deprecation management.
 */

export const DEPRECATION = {
  /** Default configuration values */
  DEFAULTS: {
    /** Warn when using deprecated tools */
    warnOnUsage: true,
    /** Fail when using tools past their removal date */
    failOnExpired: true,
    /** Default grace period in days after removal date */
    gracePeriodDays: 90,
  },
  /** Days thresholds for warning levels */
  THRESHOLDS: {
    /** Warn about upcoming removal within this many days */
    upcomingRemovalDays: 30,
    /** Critical warning within this many days */
    criticalRemovalDays: 7,
  },
} as const;

/**
 * Verification tier thresholds for the Verified by Bellwether program.
 * Used by verifier.ts to determine verification tier based on test coverage.
 */

export const SCHEMA_EVOLUTION = {
  // Timeline tracking settings (schema-evolution.ts)
  /** Default maximum versions to keep per tool */
  DEFAULT_MAX_VERSIONS_PER_TOOL: 50,
  /** Default limit for "most active tools" queries */
  DEFAULT_ACTIVE_TOOLS_LIMIT: 10,
  /** Default number of versions to display in formatted output */
  DEFAULT_DISPLAY_VERSIONS: 10,
  /** Default number of changes to display per version */
  DEFAULT_DISPLAY_CHANGES: 5,
  /** Default width for visual timeline */
  DEFAULT_VISUAL_TIMELINE_WIDTH: 80,
  /** Maximum versions to show in visual timeline */
  MAX_VISUAL_TIMELINE_VERSIONS: 20,

  // Stability analysis settings (response-schema-tracker.ts)
  /** Minimum samples required for meaningful stability assessment */
  MIN_SAMPLES_FOR_STABILITY: 3,
  /** Minimum samples for high confidence stability assessment */
  HIGH_CONFIDENCE_MIN_SAMPLES: 10,
  /** Stability confidence threshold for flagging issues (0-1) */
  STABILITY_THRESHOLD: 0.7,

  /** Grade thresholds for schema stability scoring */
  GRADE_THRESHOLDS: {
    /** Minimum confidence for grade A */
    A: 0.95,
    /** Minimum confidence for grade B */
    B: 0.85,
    /** Minimum confidence for grade C */
    C: 0.7,
    /** Minimum confidence for grade D */
    D: 0.5,
    // Below D threshold = grade F
  } as const,

  /** Display labels for stability states */
  STABILITY_LABELS: {
    STABLE: 'Stable',
    UNSTABLE: 'Unstable',
    UNKNOWN: 'Unknown',
    INSUFFICIENT_DATA: 'Insufficient Data',
  } as const,

  /** Display labels for change types */
  CHANGE_LABELS: {
    FIELDS_ADDED: 'Fields Added',
    FIELDS_REMOVED: 'Fields Removed',
    TYPE_CHANGED: 'Type Changed',
    REQUIRED_CHANGED: 'Required Changed',
    STRUCTURE_CHANGED: 'Structure Changed',
  } as const,
} as const;

/**
 * Error analysis configuration.
 * Used by error-analyzer.ts for enhanced error analysis and remediation.
 */

export const ERROR_ANALYSIS = {
  /** Trend significance thresholds */
  TREND_THRESHOLDS: {
    /** Multiplier threshold for "increasing" trend (current > previous * 1.5) */
    INCREASING: 1.5,
    /** Multiplier threshold for "decreasing" trend (current < previous * 0.5) */
    DECREASING: 0.5,
  } as const,

  /** Severity weights for error analysis */
  SEVERITY_WEIGHTS: {
    critical: 100,
    high: 75,
    medium: 50,
    low: 25,
    info: 10,
  } as const,

  /** Category display labels */
  CATEGORY_LABELS: {
    client_error_validation: 'Validation Error',
    client_error_auth: 'Authentication Error',
    client_error_not_found: 'Not Found',
    client_error_conflict: 'Conflict',
    client_error_rate_limit: 'Rate Limited',
    server_error: 'Server Error',
    unknown: 'Unknown Error',
  } as const,

  /** Trend display labels */
  TREND_LABELS: {
    increasing: 'Increasing',
    decreasing: 'Decreasing',
    stable: 'Stable',
    new: 'New',
    resolved: 'Resolved',
  } as const,

  /** Maximum remediations to display per tool */
  MAX_REMEDIATIONS_DISPLAY: 5,

  /** Maximum related parameters to extract */
  MAX_RELATED_PARAMETERS: 5,
} as const;

/**
 * Migration guide generation configuration.
 * Used by migration-generator.ts for auto-generating migration guides.
 */

export const MIGRATION_GUIDE = {
  /** Maximum code examples per migration step */
  MAX_CODE_EXAMPLES_PER_STEP: 3,
  /** Maximum steps in a migration guide */
  MAX_MIGRATION_STEPS: 20,
  /** Minimum changes required to generate a guide */
  MIN_CHANGES_FOR_GUIDE: 1,
  /** Effort estimation thresholds (number of breaking changes) */
  EFFORT_THRESHOLDS: {
    /** 0-1 breaking changes = trivial */
    trivial: 1,
    /** 2-3 breaking changes = minor */
    minor: 3,
    /** 4-6 breaking changes = moderate */
    moderate: 6,
    // 7+ breaking changes = major
  },
} as const;

/**
 * Auto-generated test scenario configuration.
 * Used by scenario-generator.ts for generating test scenarios.
 */

export const SCENARIO_GENERATION = {
  /** Maximum happy path scenarios per tool */
  MAX_HAPPY_PATH_SCENARIOS: 5,
  /** Maximum edge case scenarios per tool */
  MAX_EDGE_CASE_SCENARIOS: 10,
  /** Maximum error case scenarios per tool */
  MAX_ERROR_CASE_SCENARIOS: 5,
  /** Maximum security test scenarios per tool */
  MAX_SECURITY_SCENARIOS: 5,
  /** Default minimum coverage percentage */
  DEFAULT_MIN_COVERAGE: 80,
  /** Common SQL injection payloads for testing */
  SQL_INJECTION_PAYLOADS: [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "1; SELECT * FROM users",
  ] as readonly string[],
  /** Common XSS payloads for testing */
  XSS_PAYLOADS: [
    '<script>alert("xss")</script>',
    '"><img src=x onerror=alert(1)>',
    "javascript:alert('xss')",
  ] as readonly string[],
  /** Common path traversal payloads for testing */
  PATH_TRAVERSAL_PAYLOADS: [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    '/etc/passwd',
  ] as readonly string[],
  /** Categories of test scenarios */
  CATEGORIES: ['happy_path', 'edge_cases', 'error_handling', 'security'] as readonly string[],
} as const;

/**
 * PR comment formatting configuration.
 * Used by pr-comment-generator.ts for generating GitHub PR comments.
 */

export const PR_COMMENTS = {
  /** Maximum tools to show in detailed section */
  MAX_DETAILED_TOOLS: 10,
  /** Maximum changes to show per tool */
  MAX_CHANGES_PER_TOOL: 5,
  /** Maximum workflows to show in affected section */
  MAX_AFFECTED_WORKFLOWS: 5,
  /** Maximum code examples in migration section */
  MAX_MIGRATION_EXAMPLES: 3,
  /** Truncation length for long values */
  VALUE_TRUNCATE_LENGTH: 50,
  /** Badge colors for different severity levels */
  BADGE_COLORS: {
    breaking: 'red',
    warning: 'orange',
    info: 'blue',
    none: 'green',
  } as const,
} as const;

// ==================== Schema Testing (Check Mode) ====================

/**
 * Schema-based test generation configuration for check mode.
 * Used by schema-test-generator.ts for deterministic test case creation.
 * These tests are generated from JSON Schema without requiring LLM.
 */

export const SCHEMA_TESTING = {
  /** Maximum tests per test category to prevent explosion */
  MAX_TESTS_PER_CATEGORY: 3,
  /** Maximum total tests per tool (across all categories) */
  MAX_TESTS_PER_TOOL: 12,
  /** Minimum tests to generate even for simple tools */
  MIN_TESTS_PER_TOOL: 3,
  
  /** Boundary test values for various types */
  BOUNDARY_VALUES: {
    /** Empty string for string boundary testing */
    EMPTY_STRING: '',
    /** Long string length for boundary testing */
    LONG_STRING_LENGTH: 150,
    /** Zero value for number boundary */
    ZERO: 0,
    /** Negative value for number boundary */
    NEGATIVE_ONE: -1,
    /** Large negative value */
    LARGE_NEGATIVE: -999999999,
    /** Very large number for boundary testing */
    LARGE_POSITIVE: 999999999,
    /** Maximum safe integer */
    MAX_SAFE_INT: Number.MAX_SAFE_INTEGER,
    /** Minimum safe integer */
    MIN_SAFE_INT: Number.MIN_SAFE_INTEGER,
    /** Decimal value for integer field testing */
    DECIMAL: 1.5,
    /** Empty array */
    EMPTY_ARRAY: [] as unknown[],
    /** Empty object */
    EMPTY_OBJECT: {} as Record<string, unknown>,
  },
  
  /** Values for type coercion testing */
  TYPE_COERCION: {
    /** String that looks like a number */
    NUMERIC_STRING: '123',
    /** String that looks like boolean */
    TRUE_STRING: 'true',
    /** String that looks like boolean */
    FALSE_STRING: 'false',
    /** Empty string for coercion testing */
    EMPTY_STRING: '',
    /** String "null" for null coercion testing */
    NULL_STRING: 'null',
    /** String "undefined" */
    UNDEFINED_STRING: 'undefined',
  },
  
  /** Invalid enum value to use when testing enum violations */
  INVALID_ENUM_VALUES: [
    'INVALID_ENUM_VALUE_12345',
    '__not_a_valid_option__',
  ] as readonly string[],
  
  /** Test names for different test categories (used in descriptions) */
  CATEGORY_DESCRIPTIONS: {
    HAPPY_PATH: 'Happy path test',
    BOUNDARY: 'Boundary value test',
    TYPE_COERCION: 'Type coercion test',
    ENUM_VIOLATION: 'Enum validation test',
    NULL_HANDLING: 'Null/undefined handling test',
    ARRAY_HANDLING: 'Array handling test',
    NESTED_OBJECT: 'Nested object test',
    ERROR_HANDLING: 'Error handling test',
    MISSING_REQUIRED: 'Missing required parameter test',
  } as const,
  
  /** Array test configuration */
  ARRAY_TESTS: {
    /** Number of items for "many items" test */
    MANY_ITEMS_COUNT: 10,
  },
} as const;

// ==================== Test Outcome Assessment ====================

/**
 * Configuration for test outcome assessment.
 * Used by interviewer.ts and schema-test-generator.ts to properly
 * categorize test results and calculate meaningful metrics.
 *
 * Key insight: Tests that expect errors (validation tests) should be
 * counted as "success" when they correctly reject invalid input.
 * This prevents misleading low success rates for tools that properly
 * validate their inputs.
 */
export const OUTCOME_ASSESSMENT = {
  /**
   * Test categories that expect errors (validation tests).
   * Tools should reject these inputs - rejection counts as success.
   */
  EXPECTS_ERROR_CATEGORIES: [
    'error_handling',
  ] as const,

  /**
   * Test descriptions that indicate error-expectation.
   * Matched case-insensitively against test descriptions.
   */
  EXPECTS_ERROR_PATTERNS: [
    /missing required/i,
    /invalid.*type/i,
    /type coercion/i,
    /enum validation/i,
    /null.*handling/i,
    /boundary.*invalid/i,
    /should.*reject/i,
    /should.*fail/i,
    /expects.*error/i,
    /error handling/i,
  ] as const,

  /**
   * Categories where tests always expect success (happy path).
   * Errors on these tests indicate actual tool problems.
   */
  EXPECTS_SUCCESS_CATEGORIES: [
    'happy_path',
  ] as const,

  /**
   * Categories where outcome is unpredictable (edge cases).
   * Either success or error is acceptable.
   */
  EITHER_OUTCOME_CATEGORIES: [
    'edge_case',
    'boundary',
  ] as const,

  /**
   * Reliability metrics calculation.
   * These control how success/failure rates are computed.
   */
  METRICS: {
    /**
     * Whether to count correct rejection as success.
     * When true: validation tests that correctly reject count as success.
     * When false: only actual successes count (misleading for validators).
     * @default true
     */
    COUNT_REJECTION_AS_SUCCESS: true,

    /**
     * Whether to separate validation metrics from reliability metrics.
     * When true: separate "Validation Rate" from "Success Rate".
     * @default true
     */
    SEPARATE_VALIDATION_METRICS: true,
  },

  /**
   * Labels for different metrics in output.
   */
  LABELS: {
    /** Label for happy path success rate */
    HAPPY_PATH_SUCCESS: 'Reliability',
    /** Label for validation test success (correct rejections) */
    VALIDATION_SUCCESS: 'Validation',
    /** Label for overall combined metric */
    OVERALL: 'Overall',
    /** Label for unexpected errors */
    UNEXPECTED_ERRORS: 'Bugs',
  },

  /**
   * Icons/indicators for outcome assessment results.
   */
  INDICATORS: {
    /** Correct outcome (success or expected error) */
    correct: '✓',
    /** Incorrect outcome (unexpected behavior) */
    incorrect: '✗',
    /** Ambiguous outcome (either was acceptable) */
    ambiguous: '~',
  },
} as const;

// ==================== Rate Limiting ====================

/**
 * Rate limiting configuration defaults and detection patterns.
 */
export const RATE_LIMITING = {
  /** Error patterns indicating rate limiting */
  ERROR_PATTERNS: [
    /rate limit/i,
    /too many requests/i,
    /429\b/,
    /throttle/i,
    /slow down/i,
  ] as readonly RegExp[],
  /** Base delay for backoff (ms) */
  BASE_DELAY_MS: 500,
  /** Maximum backoff delay (ms) */
  MAX_DELAY_MS: 10000,
  /** Jitter ratio (0-1) */
  JITTER_RATIO: 0.2,
} as const;

// ==================== Stateful Testing ====================

/**
 * Stateful testing configuration.
 */
export const STATEFUL_TESTING = {
  /** Parameter patterns that should use state from previous tools */
  PREFERRED_PARAM_PATTERNS: [
    /_?id$/i,
    /token/i,
    /session/i,
    /cursor/i,
    /account/i,
    /resource/i,
  ] as readonly RegExp[],
  /** Maximum number of stored values across tool calls */
  MAX_STORED_VALUES: 50,
} as const;

// ==================== Security Testing (Check Mode) ====================

/**
 * Security testing configuration for check mode.
 * Used by security-tester.ts for deterministic vulnerability detection.
 *
 * Security testing is opt-in via the --security flag and runs deterministic
 * payload tests without requiring LLM. This enables detection of common
 * vulnerability patterns like SQL injection, XSS, path traversal, etc.
 */

export const SECURITY_TESTING = {
  /** Maximum payloads per category to test (limits test time) */
  MAX_PAYLOADS_PER_CATEGORY: 3,

  /** Timeout for each security test in milliseconds */
  TEST_TIMEOUT_MS: 5000,

  /** Maximum parameters to test per tool (for tools with many params) */
  MAX_PARAMS_PER_TOOL: 5,

  /** Risk score weights by risk level (for calculating overall risk) */
  RISK_WEIGHTS: {
    critical: 40,
    high: 25,
    medium: 15,
    low: 5,
    info: 1,
  } as const,

  /** Risk score thresholds for severity classification */
  RISK_THRESHOLDS: {
    /** Score >= this is critical severity */
    critical: 70,
    /** Score >= this is high severity */
    high: 50,
    /** Score >= this is medium severity */
    medium: 25,
    /** Score >= this is low severity */
    low: 10,
    // Score < 10 is info severity
  } as const,

  /** Default categories to test when --security is used without --security-categories */
  DEFAULT_CATEGORIES: [
    'sql_injection',
    'xss',
    'path_traversal',
    'command_injection',
    'ssrf',
    'error_disclosure',
  ] as const,

  /** Parameter name patterns that suggest security-relevant parameters */
  SECURITY_RELEVANT_PARAM_PATTERNS: [
    /path/i,
    /file/i,
    /dir/i,
    /directory/i,
    /url/i,
    /uri/i,
    /link/i,
    /href/i,
    /query/i,
    /sql/i,
    /command/i,
    /cmd/i,
    /exec/i,
    /script/i,
    /code/i,
    /input/i,
    /data/i,
    /content/i,
    /text/i,
    /message/i,
    /name/i,
    /value/i,
    /param/i,
    /arg/i,
  ] as const,

  /** CWE (Common Weakness Enumeration) IDs for each category */
  CWE_IDS: {
    sql_injection: 'CWE-89',
    xss: 'CWE-79',
    path_traversal: 'CWE-22',
    command_injection: 'CWE-78',
    ssrf: 'CWE-918',
    error_disclosure: 'CWE-209',
  } as const,

  /** Patterns that indicate a security rejection (good behavior) */
  REJECTION_PATTERNS: [
    /invalid/i,
    /rejected/i,
    /not allowed/i,
    /forbidden/i,
    /denied/i,
    /blocked/i,
    /malicious/i,
    /unsafe/i,
    /security/i,
    /validation failed/i,
    /illegal/i,
    /prohibited/i,
  ] as const,

  /** Patterns that indicate error information disclosure */
  ERROR_DISCLOSURE_PATTERNS: {
    /** Stack trace patterns */
    stackTrace: [
      /at\s+[\w.]+\s+\([^)]+\.js:\d+:\d+\)/,
      /at\s+[\w.]+\s+\([^)]+\.ts:\d+:\d+\)/,
      /Error:.*\n\s+at\s+/,
      /Traceback \(most recent call last\)/,
    ] as const,
    /** File path patterns */
    filePath: [
      /\/[\w./\-_]+\.(js|ts|py|rb|java|go|rs|cpp|c|h)/,
      /[A-Z]:\\[\w\\.\-_]+\.(js|ts|py|rb|java|go|rs|cpp|c|h)/i,
    ] as const,
    /** Database patterns */
    database: [
      /\bSQL\b/i,
      /\bpostgres/i,
      /\bmysql/i,
      /\bmongodb/i,
      /\bredis/i,
      /\bsqlite/i,
      /SQLSTATE/i,
    ] as const,
    /** Internal IP patterns */
    internalIp: [
      /\b(10|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/,
      /\blocalhost\b/i,
      /\b127\.0\.0\.1\b/,
    ] as const,
  } as const,
} as const;

// ==================== Semantic Validation ====================

/**
 * Semantic validation configuration for check mode.
 * Used by validation module for semantic type inference and testing.
 *
 * Semantic validation infers types (dates, emails, URLs, etc.) from
 * parameter names and descriptions, then generates targeted tests
 * to verify proper input validation.
 */

export const SEMANTIC_VALIDATION = {
  /** Minimum confidence threshold for generating semantic tests (0-1) */
  MIN_CONFIDENCE_THRESHOLD: 0.5,

  /** Maximum invalid values to test per parameter */
  MAX_INVALID_VALUES_PER_PARAM: 2,

  /** Maximum semantic tests per tool */
  MAX_SEMANTIC_TESTS_PER_TOOL: 6,

  /** Confidence scores for different inference sources */
  CONFIDENCE: {
    /** Confidence when schema format explicitly specifies type */
    SCHEMA_FORMAT: 0.95,
    /** Confidence boost from parameter name pattern match */
    NAME_PATTERN_MATCH: 0.4,
    /** Confidence boost from description pattern match */
    DESCRIPTION_PATTERN_MATCH: 0.5,
  } as const,

  /** Semantic type display names for documentation */
  TYPE_DISPLAY_NAMES: {
    date_iso8601: 'ISO 8601 Date',
    date_month: 'Year-Month',
    datetime: 'DateTime',
    timestamp: 'Unix Timestamp',
    amount_currency: 'Currency Amount',
    percentage: 'Percentage',
    identifier: 'Identifier',
    email: 'Email Address',
    url: 'URL',
    phone: 'Phone Number',
    ip_address: 'IP Address',
    file_path: 'File Path',
    json: 'JSON String',
    base64: 'Base64 Encoded',
    regex: 'Regular Expression',
    unknown: 'Unknown',
  } as const,

  /** Example valid values for documentation */
  EXAMPLE_VALUES: {
    date_iso8601: '2024-01-15',
    date_month: '2024-01',
    datetime: '2024-01-15T14:30:00Z',
    timestamp: '1705330200',
    amount_currency: '99.99',
    percentage: '75',
    identifier: 'user-123-abc',
    email: 'user@example.com',
    url: 'https://example.com',
    phone: '+1-555-123-4567',
    ip_address: '192.168.1.1',
    file_path: '/path/to/file.txt',
    json: '{"key": "value"}',
    base64: 'SGVsbG8gV29ybGQ=',
    regex: '^[a-z]+$',
    unknown: '',
  } as const,
} as const;

// ==================== Exit Codes ====================

/**
 * Granular exit codes for CI/CD integration.
 *
 * Enables semantic responses to drift detection, allowing CI pipelines
 * to differentiate between severity levels and take appropriate action.
 *
 * Usage in CI:
 *   bellwether check ...
 *   case $? in
 *     0) echo "No changes" ;;
 *     1) echo "Info-level changes" ;;
 *     2) echo "Warning-level changes" ;;
 *     3) echo "Breaking changes" ;;
 *     4) echo "Runtime error" ;;
 *     5) echo "Low confidence warning" ;;
 *   esac
 */

export const EXIT_CODES = {
  /** No changes detected - baseline matches current state */
  CLEAN: 0,
  /** Info-level changes only (non-breaking additions, description changes) */
  INFO: 1,
  /** Warning-level changes (potential issues, new error patterns) */
  WARNING: 2,
  /** Breaking changes detected (schema changes, removed tools) */
  BREAKING: 3,
  /** Runtime error (connection failed, timeout, configuration error) */
  ERROR: 4,
  /** Low confidence warning - metrics have insufficient statistical confidence */
  LOW_CONFIDENCE: 5,
} as const;

/**
 * Map severity level to exit code.
 * Used by check command to determine appropriate exit status.
 */

export const SEVERITY_TO_EXIT_CODE: Record<string, number> = {
  none: EXIT_CODES.CLEAN,
  info: EXIT_CODES.INFO,
  warning: EXIT_CODES.WARNING,
  breaking: EXIT_CODES.BREAKING,
} as const;

// ==================== Payload Limits ====================

/**
 * Payload size limits for protection against resource exhaustion.
 *
 * These limits prevent DoS scenarios where malformed or malicious
 * MCP servers could cause memory exhaustion or infinite loops.
 */

export const PAYLOAD_LIMITS = {
  /** Maximum schema size in bytes (1MB) */
  MAX_SCHEMA_SIZE: 1024 * 1024,
  /** Maximum baseline file size in bytes (10MB) */
  MAX_BASELINE_SIZE: 10 * 1024 * 1024,
  /** Maximum response content size in bytes (5MB) */
  MAX_RESPONSE_SIZE: 5 * 1024 * 1024,
  /** Maximum array items to process in fingerprinting */
  MAX_ARRAY_ITEMS: 10000,
  /** Maximum object properties to process */
  MAX_OBJECT_PROPERTIES: 1000,
  /** Maximum schema depth for circular reference protection */
  MAX_SCHEMA_DEPTH: 50,
} as const;

// ==================== Documentation Quality Scoring ====================

// ==================== Check Mode Sampling ====================

/**
 * Statistical sampling configuration for check mode.
 * Used by check.ts and interviewer.ts for confidence-based testing.
 *
 * Controls minimum sample counts for reliable performance baselines
 * and enables adaptive sample escalation for high-variability tools.
 */

export const CHECK_SAMPLING = {
  /** Default minimum samples per tool */
  DEFAULT_MIN_SAMPLES: 10,
  /** Recommended minimum samples for production baselines */
  RECOMMENDED_MIN_SAMPLES: 10,
  /** Maximum samples when auto-escalating for high variability */
  MAX_AUTO_ESCALATE_SAMPLES: 15,
  /** Coefficient of variation threshold that triggers auto-escalation (50%) */
  HIGH_VARIABILITY_THRESHOLD: 0.5,
  /** Number of additional samples to add when escalating */
  AUTO_ESCALATE_INCREMENT: 2,
  /** Target confidence levels (maps to PERFORMANCE_CONFIDENCE thresholds) */
  TARGET_CONFIDENCE: {
    low: 'low',
    medium: 'medium',
    high: 'high',
  } as const,
  /** Minimum samples required for each target confidence level */
  SAMPLES_FOR_CONFIDENCE: {
    low: 1,
    medium: 5,
    high: 10,
  } as const,
} as const;

// ==================== External Dependency Detection ====================

/**
 * External dependency detection configuration.
 * Used by external-dependency-detector.ts for categorizing errors
 * from known external services vs code bugs.
 *
 * Helps distinguish between:
 * - Environment misconfiguration (missing credentials)
 * - External API failures (service down, rate limited)
 * - Actual code bugs
 */

export const EXTERNAL_DEPENDENCIES = {
  /** Known external service fingerprints */
  SERVICES: {
    plaid: {
      name: 'Plaid',
      /** Patterns in tool names/descriptions that indicate Plaid usage */
      toolPatterns: [
        /plaid/i,
        /link_create/i,
        /link_exchange/i,
        /link_token/i,
        /public_token/i,
        /access_token.*item/i,
      ] as readonly RegExp[],
      /** Patterns in error messages that indicate Plaid errors */
      errorPatterns: [
        /INVALID_LINK_TOKEN/i,
        /ITEM_LOGIN_REQUIRED/i,
        /SANDBOX/i,
        /INVALID_PUBLIC_TOKEN/i,
        /PLAID_ERROR/i,
        /INVALID_ACCESS_TOKEN/i,
        /plaid\.com/i,
      ] as readonly RegExp[],
      /** HTTP status codes typical of Plaid errors */
      statusCodes: [400, 401, 403] as readonly number[],
      /** Remediation suggestion for Plaid errors */
      remediation: 'Configure Plaid sandbox credentials (PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV=sandbox)',
      /** Credential expectations for configuration checks */
      credentials: {
        requiredEnv: ['PLAID_CLIENT_ID', 'PLAID_SECRET'],
        optionalEnv: ['PLAID_ENV'],
        requiredConfigKeys: ['clientId', 'secret'],
        sandboxAvailable: true,
        mockAvailable: true,
      },
    },
    stripe: {
      name: 'Stripe',
      toolPatterns: [
        /stripe/i,
        /payment/i,
        /charge/i,
        /customer.*create/i,
        /subscription/i,
      ] as readonly RegExp[],
      errorPatterns: [
        /sk_test_/i,
        /pk_test_/i,
        /api_key_invalid/i,
        /stripe\.com/i,
        /StripeError/i,
        /invalid_request_error/i,
      ] as readonly RegExp[],
      statusCodes: [401, 402, 429] as readonly number[],
      remediation: 'Configure Stripe API keys (STRIPE_SECRET_KEY)',
      credentials: {
        requiredEnv: ['STRIPE_SECRET_KEY'],
        optionalEnv: ['STRIPE_PUBLISHABLE_KEY'],
        requiredConfigKeys: ['secretKey'],
        sandboxAvailable: true,
        mockAvailable: true,
      },
    },
    aws: {
      name: 'AWS',
      toolPatterns: [
        /aws/i,
        /s3/i,
        /dynamo/i,
        /lambda/i,
        /cloudwatch/i,
        /sqs/i,
        /sns/i,
      ] as readonly RegExp[],
      errorPatterns: [
        /amazonaws\.com/i,
        /AccessDenied/i,
        /NoSuchBucket/i,
        /NoSuchKey/i,
        /InvalidAccessKeyId/i,
        /SignatureDoesNotMatch/i,
        /ExpiredToken/i,
        /CredentialsError/i,
      ] as readonly RegExp[],
      statusCodes: [403, 404, 400] as readonly number[],
      remediation: 'Configure AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)',
      credentials: {
        requiredEnv: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
        optionalEnv: ['AWS_REGION'],
        requiredConfigKeys: ['accessKeyId', 'secretAccessKey'],
        sandboxAvailable: false,
        mockAvailable: true,
      },
    },
    openai: {
      name: 'OpenAI',
      toolPatterns: [
        /openai/i,
        /gpt/i,
        /chatgpt/i,
        /completion/i,
        /embedding/i,
      ] as readonly RegExp[],
      errorPatterns: [
        /openai\.com/i,
        /rate_limit_exceeded/i,
        /insufficient_quota/i,
        /invalid_api_key/i,
        /model_not_found/i,
        /context_length_exceeded/i,
      ] as readonly RegExp[],
      statusCodes: [401, 429, 400] as readonly number[],
      remediation: 'Configure OpenAI API key (OPENAI_API_KEY)',
      credentials: {
        requiredEnv: ['OPENAI_API_KEY'],
        optionalEnv: [],
        requiredConfigKeys: ['apiKey'],
        sandboxAvailable: false,
        mockAvailable: true,
      },
    },
    anthropic: {
      name: 'Anthropic',
      toolPatterns: [
        /anthropic/i,
        /claude/i,
      ] as readonly RegExp[],
      errorPatterns: [
        /anthropic\.com/i,
        /invalid_api_key/i,
        /rate_limit/i,
        /overloaded/i,
      ] as readonly RegExp[],
      statusCodes: [401, 429, 529] as readonly number[],
      remediation: 'Configure Anthropic API key (ANTHROPIC_API_KEY)',
      credentials: {
        requiredEnv: ['ANTHROPIC_API_KEY'],
        optionalEnv: [],
        requiredConfigKeys: ['apiKey'],
        sandboxAvailable: false,
        mockAvailable: true,
      },
    },
    firebase: {
      name: 'Firebase',
      toolPatterns: [
        /firebase/i,
        /firestore/i,
        /realtime.*database/i,
      ] as readonly RegExp[],
      errorPatterns: [
        /firebase/i,
        /firestore/i,
        /PERMISSION_DENIED/i,
        /INVALID_ARGUMENT/i,
      ] as readonly RegExp[],
      statusCodes: [403, 400] as readonly number[],
      remediation: 'Configure Firebase credentials (FIREBASE_CONFIG or service account)',
      credentials: {
        requiredEnv: ['FIREBASE_CONFIG'],
        optionalEnv: ['GOOGLE_APPLICATION_CREDENTIALS'],
        requiredConfigKeys: ['config'],
        sandboxAvailable: false,
        mockAvailable: true,
      },
    },
    twilio: {
      name: 'Twilio',
      toolPatterns: [
        /twilio/i,
        /sms/i,
        /phone.*send/i,
      ] as readonly RegExp[],
      errorPatterns: [
        /twilio\.com/i,
        /INVALID_ACCOUNT_SID/i,
        /INVALID_AUTH_TOKEN/i,
      ] as readonly RegExp[],
      statusCodes: [401, 400] as readonly number[],
      remediation: 'Configure Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)',
      credentials: {
        requiredEnv: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
        optionalEnv: [],
        requiredConfigKeys: ['accountSid', 'authToken'],
        sandboxAvailable: true,
        mockAvailable: true,
      },
    },
    sendgrid: {
      name: 'SendGrid',
      toolPatterns: [
        /sendgrid/i,
        /email.*send/i,
      ] as readonly RegExp[],
      errorPatterns: [
        /sendgrid\.com/i,
        /api\.sendgrid/i,
        /INVALID_API_KEY/i,
      ] as readonly RegExp[],
      statusCodes: [401, 403] as readonly number[],
      remediation: 'Configure SendGrid API key (SENDGRID_API_KEY)',
      credentials: {
        requiredEnv: ['SENDGRID_API_KEY'],
        optionalEnv: [],
        requiredConfigKeys: ['apiKey'],
        sandboxAvailable: false,
        mockAvailable: true,
      },
    },
    github: {
      name: 'GitHub',
      toolPatterns: [
        /github/i,
        /gh_/i,
        /repository/i,
        /pull.*request/i,
      ] as readonly RegExp[],
      errorPatterns: [
        /api\.github\.com/i,
        /Bad credentials/i,
        /rate limit/i,
        /Resource not accessible/i,
      ] as readonly RegExp[],
      statusCodes: [401, 403, 404] as readonly number[],
      remediation: 'Configure GitHub token (GITHUB_TOKEN)',
      credentials: {
        requiredEnv: ['GITHUB_TOKEN'],
        optionalEnv: [],
        requiredConfigKeys: ['token'],
        sandboxAvailable: false,
        mockAvailable: true,
      },
    },
    database: {
      name: 'Database',
      toolPatterns: [
        /database/i,
        /postgres/i,
        /mysql/i,
        /mongodb/i,
        /redis/i,
        /sql/i,
      ] as readonly RegExp[],
      errorPatterns: [
        /ECONNREFUSED/i,
        /connection.*refused/i,
        /authentication failed/i,
        /database.*not.*exist/i,
        /role.*not.*exist/i,
        /no.*pg_hba\.conf/i,
        /ER_ACCESS_DENIED/i,
        /ETIMEDOUT/i,
      ] as readonly RegExp[],
      statusCodes: [] as readonly number[], // Database errors typically don't use HTTP status
      remediation: 'Check database connection string and ensure database server is running',
      credentials: {
        requiredEnv: [],
        optionalEnv: ['DATABASE_URL'],
        requiredConfigKeys: ['connectionString'],
        sandboxAvailable: false,
        mockAvailable: false,
      },
    },
  } as const,

  /** Error source categories */
  ERROR_SOURCES: {
    /** Error is from external service API */
    external_dependency: 'external_dependency',
    /** Error is from missing/invalid environment configuration */
    environment: 'environment',
    /** Error appears to be a code bug */
    code_bug: 'code_bug',
    /** Cannot determine error source */
    unknown: 'unknown',
  } as const,

  /** Patterns that indicate environment/configuration issues */
  ENVIRONMENT_PATTERNS: [
    /missing.*credentials/i,
    /missing.*api.*key/i,
    /missing.*token/i,
    /environment.*variable/i,
    /not.*configured/i,
    /invalid.*configuration/i,
    /ENOENT/i,
    /config.*not.*found/i,
    /credentials.*not.*found/i,
  ] as readonly RegExp[],

  /** Patterns that indicate transient/temporary issues (should retry) */
  TRANSIENT_PATTERNS: [
    /timeout/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /temporarily.*unavailable/i,
    /service.*unavailable/i,
    /rate.*limit/i,
    /too.*many.*requests/i,
    /overloaded/i,
    /retry/i,
    /503/i,
    /504/i,
    /429/i,
  ] as readonly RegExp[],
} as const;

// ==================== Example Output Configuration ====================

/**
 * Example output configuration for documentation generation.
 * Used by docs/contract.ts for CONTRACT.md example formatting.
 *
 * Controls truncation behavior and provides configurable limits
 * for different output modes (default, full, AI-optimized).
 */

export const EXAMPLE_OUTPUT = {
  /** Default example length (backwards compatible) */
  DEFAULT_LENGTH: 300,
  /** Full example length (with --full-examples) */
  FULL_LENGTH: 5000,
  /** AI-optimized example length (balanced for context windows) */
  AI_OPTIMIZED_LENGTH: 2000,
  /** Maximum examples per tool in documentation */
  MAX_EXAMPLES_PER_TOOL: 3,
  /** Default examples per tool */
  DEFAULT_EXAMPLES_PER_TOOL: 2,
  /** Minimum length to show truncation indicator */
  MIN_TRUNCATION_INDICATOR_LENGTH: 50,
  /** Truncation indicators for different content types */
  TRUNCATION_INDICATORS: {
    json: '... (truncated)',
    markdown: '\n\n... (content truncated)',
    text: '...',
  } as const,
  /** Smart truncation settings */
  SMART_TRUNCATE: {
    /** Preserve JSON structure when truncating */
    preserveJsonStructure: true,
    /** Preserve markdown headers when truncating */
    preserveMarkdownHeaders: true,
    /** Minimum items to show in truncated arrays */
    minArrayItems: 2,
    /** Message template for omitted array items */
    arrayOmittedTemplate: '... ({count} more items)',
    /** Message template for omitted object keys */
    objectOmittedTemplate: '... ({count} more fields)',
  } as const,
} as const;

// ==================== Reliability Display ====================

/**
 * Display thresholds and symbols for reliability metrics.
 */
export const RELIABILITY_DISPLAY = {
  /** High reliability threshold (percentage) */
  HIGH_THRESHOLD: 90,
  /** Medium reliability threshold (percentage) */
  MEDIUM_THRESHOLD: 50,
  /** Status symbols for reliability and validation summaries */
  SYMBOLS: {
    PASS: '✓',
    WARN: '⚠',
    FAIL: '✗',
  } as const,
} as const;

/**
 * Confidence indicators for terminal and documentation output.
 */
export const CONFIDENCE_INDICATORS = {
  high: '🟢',
  medium: '🟡',
  low: '🔴',
} as const;

// ==================== Documentation Quality Scoring ====================

/**
 * Documentation quality scoring configuration.
 * Used by documentation-scorer.ts for tool documentation assessment.
 *
 * Scoring evaluates four key components:
 * - Description coverage: percentage of tools with descriptions
 * - Description quality: depth and clarity of descriptions
 * - Parameter documentation: percentage of parameters documented
 * - Example coverage: percentage of tools with examples
 */

export const DOCUMENTATION_SCORING = {
  /** Component weights for overall score (should sum to 1.0) */
  WEIGHTS: {
    descriptionCoverage: 0.30,
    descriptionQuality: 0.30,
    parameterDocumentation: 0.25,
    exampleCoverage: 0.15,
  } as const,

  /** Grade thresholds (minimum score for each grade) */
  GRADE_THRESHOLDS: {
    A: 90,
    B: 80,
    C: 70,
    D: 60,
    F: 0,
  } as const,

  /** Description quality scoring criteria */
  DESCRIPTION: {
    /** Minimum length for a "good" description */
    MIN_GOOD_LENGTH: 50,
    /** Minimum length for an "acceptable" description */
    MIN_ACCEPTABLE_LENGTH: 20,
    /** Score for good length (>= MIN_GOOD_LENGTH) */
    GOOD_LENGTH_SCORE: 40,
    /** Score for acceptable length (>= MIN_ACCEPTABLE_LENGTH) */
    ACCEPTABLE_LENGTH_SCORE: 20,
    /** Score bonus for starting with imperative verb */
    IMPERATIVE_VERB_BONUS: 20,
    /** Score bonus for describing behavior/returns */
    BEHAVIOR_DESCRIPTION_BONUS: 20,
    /** Score bonus for including examples or specifics */
    EXAMPLES_BONUS: 20,
  } as const,

  /** Penalties for documentation issues */
  PENALTIES: {
    /** Penalty for missing tool description */
    missingDescription: 30,
    /** Penalty for short description (< MIN_ACCEPTABLE_LENGTH) */
    shortDescription: 15,
    /** Penalty multiplier for undocumented parameters (applied per-param) */
    undocumentedParamMultiplier: 25,
  } as const,

  /** Pattern to detect imperative verb at start of description */
  IMPERATIVE_PATTERN: /^[A-Z][a-z]+s?\s/,

  /** Pattern to detect behavior/return value description */
  BEHAVIOR_PATTERN: /returns?|provides?|gets?|creates?|deletes?|updates?|retrieves?|sends?|fetches?/i,

  /** Pattern to detect examples or specific details */
  EXAMPLES_PATTERN: /e\.g\.|example|such as|like|for instance/i,

  /** Issue severity levels */
  SEVERITY: {
    missingDescription: 'error' as const,
    shortDescription: 'warning' as const,
    missingParamDescription: 'warning' as const,
    noExamples: 'info' as const,
  } as const,

  /** Maximum suggestions to include in report */
  MAX_SUGGESTIONS: 5,

  /** Threshold for suggesting examples (tools without examples / total tools) */
  EXAMPLES_SUGGESTION_THRESHOLD: 0.5,
} as const;

// ==================== AI Agent Compatibility Scoring ====================

/**
 * AI Agent Compatibility scoring configuration.
 * Used by ai-compatibility-scorer.ts for evaluating how well
 * an MCP server is designed for AI agent consumption.
 *
 * Scoring factors:
 * - Description clarity (20%): LLM understanding
 * - Parameter naming (15%): Semantic inference
 * - Error message quality (15%): Actionable errors
 * - Example completeness (20%): Non-truncated examples
 * - Workflow documentation (15%): Multi-step guidance
 * - Response predictability (15%): Schema stability
 */

export const AI_COMPATIBILITY = {
  /** Component weights for overall score (should sum to 1.0) */
  WEIGHTS: {
    descriptionClarity: 0.20,
    parameterNaming: 0.15,
    errorMessageQuality: 0.15,
    exampleCompleteness: 0.20,
    workflowDocumentation: 0.15,
    responsePredictability: 0.15,
  } as const,

  /** Grade thresholds (minimum score for each grade) */
  GRADE_THRESHOLDS: {
    A: 90,
    B: 80,
    C: 70,
    D: 60,
    F: 0,
  } as const,

  /** Description quality scoring */
  DESCRIPTION: {
    /** Minimum acceptable description length */
    MIN_LENGTH: 50,
    /** Good description length */
    GOOD_LENGTH: 100,
    /** Pattern to detect action verb at start */
    ACTION_VERB_PATTERN: /^(Get|Create|Update|Delete|List|Search|Find|Fetch|Send|Post|Retrieve|Query|Export|Import|Generate|Calculate|Validate|Check|Convert|Parse|Format|Transform|Add|Remove|Set|Clear|Reset|Initialize|Connect|Disconnect|Start|Stop|Enable|Disable|Sync|Refresh|Load|Save|Upload|Download|Process|Execute|Run|Call|Invoke|Register|Unregister|Subscribe|Unsubscribe|Publish)\s/i,
    /** Pattern to detect purpose/behavior explanation */
    PURPOSE_PATTERN: /returns?|provides?|retrieves?|generates?|creates?|enables?|allows?|performs?/i,
    /** Pattern to detect input/output mentions */
    IO_PATTERN: /takes?|accepts?|requires?|outputs?|returns?|produces?/i,
    /** Points for various description qualities */
    POINTS: {
      /** Points for minimum length */
      MIN_LENGTH: 20,
      /** Points for good length */
      GOOD_LENGTH: 30,
      /** Points for action verb */
      ACTION_VERB: 25,
      /** Points for purpose explanation */
      PURPOSE: 25,
      /** Points for I/O mention */
      IO_MENTION: 20,
    } as const,
  } as const,

  /** Parameter naming quality scoring */
  PARAMETER: {
    /** Generic/bad parameter names to flag */
    BAD_NAMES: ['data', 'value', 'input', 'output', 'param', 'arg', 'x', 'y', 'n', 'i', 'val', 'obj', 'item', 'thing', 'stuff'] as readonly string[],
    /** Minimum acceptable parameter name length */
    MIN_NAME_LENGTH: 2,
  } as const,

  /** Error message quality scoring */
  ERROR: {
    /** Minimum error message length for quality */
    MIN_MESSAGE_LENGTH: 20,
    /** Pattern to detect actionable error content */
    ACTIONABLE_PATTERN: /try|use|provide|specify|check|ensure|make sure|should|must|need|require|expected|format|valid/i,
    /** Pattern to detect remediation hints */
    REMEDIATION_PATTERN: /example|e\.g\.|such as|instead|correct|fix|solution|hint/i,
    /** Default score when no errors observed */
    DEFAULT_SCORE: 70,
  } as const,

  /** Example completeness scoring */
  EXAMPLE: {
    /** Weight for coverage in score */
    COVERAGE_WEIGHT: 0.6,
    /** Weight for quality (non-truncated) in score */
    QUALITY_WEIGHT: 0.4,
  } as const,

  /** Workflow documentation scoring */
  WORKFLOW: {
    /** Pattern to detect sequence hints */
    SEQUENCE_PATTERN: /first|then|after|before|next|followed by|prior to|subsequently|finally|once|when/i,
    /** Pattern to detect dependency hints */
    DEPENDENCY_PATTERN: /requires?|needs?|depends? on|must have|expects?|assumes?|prerequisite/i,
  } as const,

  /** Response predictability scoring */
  RESPONSE: {
    /** Default score when no evolution data */
    DEFAULT_SCORE: 80,
  } as const,

  /** Maximum recommendations to generate */
  MAX_RECOMMENDATIONS: 5,

  /** Score threshold below which to recommend improvements */
  RECOMMENDATION_THRESHOLD: 80,
} as const;

// ==================== Contract Testing ====================

/**
 * Contract-as-code testing configuration.
 * Used by contract validator for verifying MCP server behavior
 * against defined expectations.
 */

export const CONTRACT_TESTING = {
  /** Default contract file names (in order of preference) */
  CONTRACT_FILENAMES: [
    'contract.bellwether.yaml',
    'contract.bellwether.yml',
    '.bellwether-contract.yaml',
    '.bellwether-contract.yml',
  ] as readonly string[],

  /** Current contract schema version */
  SCHEMA_VERSION: '1',

  /** Maximum number of output assertions per tool */
  MAX_OUTPUT_ASSERTIONS: 20,

  /** Maximum validation errors to report before truncating */
  MAX_VALIDATION_ERRORS: 50,

  /** Validation modes */
  MODES: {
    /** Strict mode - fail on any contract violation */
    STRICT: 'strict',
    /** Lenient mode - warn on non-breaking violations */
    LENIENT: 'lenient',
    /** Report mode - report violations without failing */
    REPORT: 'report',
  } as const,

  /** Severity levels for contract violations */
  VIOLATION_SEVERITY: {
    /** Tool is missing from server */
    MISSING_TOOL: 'breaking',
    /** Required parameter is missing */
    MISSING_REQUIRED_PARAM: 'breaking',
    /** Parameter type mismatch */
    TYPE_MISMATCH: 'breaking',
    /** Output assertion failed */
    OUTPUT_ASSERTION_FAILED: 'warning',
    /** Extra unexpected tool found */
    UNEXPECTED_TOOL: 'info',
    /** Extra unexpected field in output */
    UNEXPECTED_FIELD: 'info',
  } as const,

  /** JSONPath patterns for output validation */
  JSONPATH: {
    /** Maximum depth for JSONPath evaluation */
    MAX_DEPTH: 20,
    /** Timeout for JSONPath evaluation (ms) */
    TIMEOUT: 1000,
  } as const,
} as const;

// ==================== Regression Risk Scoring ====================

/**
 * Regression risk scoring configuration.
 * Used by risk-scorer.ts for prioritizing fixes based on
 * weighted risk factors.
 */

export const REGRESSION_RISK = {
  /** Risk factor weights (should sum to 1.0) */
  WEIGHTS: {
    /** Weight for breaking change severity */
    breakingChangeSeverity: 0.35,
    /** Weight for affected tool importance */
    toolImportance: 0.25,
    /** Weight for error rate delta */
    errorRateDelta: 0.15,
    /** Weight for performance regression */
    performanceRegression: 0.15,
    /** Weight for security posture changes */
    securityPosture: 0.10,
  } as const,

  /** Risk level thresholds (minimum score for each level) */
  LEVEL_THRESHOLDS: {
    critical: 80,
    high: 60,
    medium: 40,
    low: 20,
    info: 0,
  } as const,

  /** Breaking change severity scores */
  BREAKING_SCORES: {
    /** Score for removed tool */
    toolRemoved: 100,
    /** Score for removed required parameter */
    requiredParamRemoved: 90,
    /** Score for type change */
    typeChanged: 80,
    /** Score for removed enum value */
    enumValueRemoved: 70,
    /** Score for tightened constraint */
    constraintTightened: 50,
    /** Score for added required parameter */
    requiredParamAdded: 40,
  } as const,

  /** Tool importance indicators (patterns in descriptions) */
  IMPORTANCE_PATTERNS: {
    /** Patterns indicating high-frequency tools */
    highFrequency: [/primary|main|core|essential|critical|frequently/i],
    /** Patterns indicating low-frequency tools */
    lowFrequency: [/rarely|admin|debug|internal|deprecated/i],
  } as const,

  /** Error rate change thresholds */
  ERROR_RATE: {
    /** Threshold for significant increase (%) */
    SIGNIFICANT_INCREASE: 10,
    /** Threshold for critical increase (%) */
    CRITICAL_INCREASE: 25,
    /** Base score for error rate calculation */
    BASE_SCORE: 50,
  } as const,

  /** Performance regression scoring */
  PERFORMANCE: {
    /** Threshold for minor regression (%) */
    MINOR_REGRESSION: 10,
    /** Threshold for major regression (%) */
    MAJOR_REGRESSION: 25,
    /** Threshold for critical regression (%) */
    CRITICAL_REGRESSION: 50,
    /** Scores for each threshold */
    SCORES: {
      minor: 30,
      major: 60,
      critical: 90,
    } as const,
  } as const,

  /** Security change scoring */
  SECURITY: {
    /** Score for new vulnerability */
    NEW_VULNERABILITY: 100,
    /** Score for resolved vulnerability */
    RESOLVED_VULNERABILITY: -20,
    /** Score for severity increase */
    SEVERITY_INCREASE: 50,
  } as const,

  /** Maximum recommendations to include */
  MAX_RECOMMENDATIONS: 5,
} as const;

// ==================== Smart Value Generation ====================

/**
 * Smart value generation configuration for check mode.
 * Used by smart-value-generator.ts for intelligent test value creation.
 *
 * Provides realistic default values for common semantic types like
 * coordinates, search queries, and identifiers instead of generic "test" values.
 */

export const SMART_VALUE_GENERATION = {
  /** Geographic coordinate patterns and defaults */
  COORDINATES: {
    /** Patterns that indicate latitude fields */
    LATITUDE_PATTERNS: [
      /^lat(itude)?$/i,
      /_lat$/i,
      /lat_/i,
    ] as readonly RegExp[],

    /** Patterns that indicate longitude fields */
    LONGITUDE_PATTERNS: [
      /^lon(g|gitude)?$/i,
      /^lng$/i,
      /_lon$/i,
      /_lng$/i,
      /lon_/i,
      /lng_/i,
    ] as readonly RegExp[],

    /** Default coordinate values (San Francisco - commonly used in examples) */
    DEFAULTS: {
      latitude: 37.7749,
      longitude: -122.4194,
    } as const,

    /** Valid ranges for coordinates */
    RANGES: {
      latitude: { min: -90, max: 90 },
      longitude: { min: -180, max: 180 },
    } as const,
  } as const,

  /** Search/query field patterns and defaults */
  SEARCH_QUERY: {
    /** Patterns that indicate search/query fields */
    PATTERNS: [
      /^query$/i,
      /^search$/i,
      /^q$/i,
      /^term$/i,
      /^keyword/i,
      /search_query/i,
      /search_term/i,
    ] as readonly RegExp[],

    /** Context-aware search values */
    VALUES: {
      /** For location-related queries */
      location: 'San Francisco, CA',
      /** For weather-related queries */
      weather: 'New York',
      /** For product-related queries */
      product: 'laptop',
      /** For general searches */
      general: 'example search query',
    } as const,

    /** Description patterns to detect context */
    CONTEXT_PATTERNS: {
      location: /location|city|address|place|geo/i,
      weather: /weather|temperature|forecast|climate/i,
      product: /product|item|sku|merchandise/i,
    } as const,
  } as const,

  /** Enhanced ID field patterns and defaults */
  IDENTIFIERS: {
    /** Patterns that indicate UUID format */
    UUID_PATTERNS: [
      /uuid$/i,
      /guid$/i,
      /format.*uuid/i,
    ] as readonly RegExp[],

    /** Patterns that indicate numeric IDs */
    NUMERIC_ID_PATTERNS: [
      /^\d+$/,
      /numeric.*id/i,
      /integer.*id/i,
    ] as readonly RegExp[],

    /** Default ID values for different formats */
    DEFAULTS: {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      numeric: '12345',
      prefixed: 'id_example123',
      generic: 'test-id-123',
    } as const,
  } as const,

  /** Resource name patterns */
  RESOURCE_NAMES: {
    /** Patterns that indicate file names */
    FILE_PATTERNS: [
      /^file(name)?$/i,
      /_file$/i,
      /^filename$/i,
    ] as readonly RegExp[],

    /** Patterns that indicate directory/path */
    PATH_PATTERNS: [
      /^path$/i,
      /^dir(ectory)?$/i,
      /_path$/i,
      /_dir$/i,
    ] as readonly RegExp[],

    /** Default values */
    DEFAULTS: {
      filename: 'example.txt',
      directory: '/tmp/test',
      path: '/tmp/test/example.txt',
    } as const,
  } as const,

  /** Account/user patterns */
  ACCOUNT: {
    /** Patterns for account identifiers */
    PATTERNS: [
      /^account/i,
      /^user/i,
      /_account$/i,
      /_user$/i,
    ] as readonly RegExp[],

    /** Default values */
    DEFAULTS: {
      accountId: 'acct_123456789',
      userId: 'user_123456789',
    } as const,
  } as const,

  /** Limit/count patterns for pagination */
  PAGINATION: {
    /** Patterns for limit fields */
    LIMIT_PATTERNS: [
      /^limit$/i,
      /^count$/i,
      /^size$/i,
      /^page_size$/i,
      /^per_page$/i,
    ] as readonly RegExp[],

    /** Patterns for offset/page fields */
    OFFSET_PATTERNS: [
      /^offset$/i,
      /^skip$/i,
      /^page$/i,
      /^start$/i,
    ] as readonly RegExp[],

    /** Default values */
    DEFAULTS: {
      limit: 10,
      offset: 0,
      page: 1,
    } as const,
  } as const,
} as const;

// ==================== Intelligent Test Pruning ====================

/**
 * Intelligent test pruning configuration.
 * Used to skip unnecessary tests based on tool characteristics
 * and testing history.
 */

export const TEST_PRUNING = {
  /** Test categories that can be pruned */
  CATEGORIES: {
    boundary: 'boundary',
    enum: 'enum',
    optionalCombinations: 'optional_combinations',
    errorHandling: 'error_handling',
    happyPath: 'happy_path',
    security: 'security',
    semantic: 'semantic',
  } as const,

  /** Categories that should always run */
  ALWAYS_RUN: ['happy_path', 'error_handling'] as readonly string[],

  /** Tool prioritization weights */
  PRIORITY_WEIGHTS: {
    /** Weight for previous error history */
    errorHistory: 0.30,
    /** Weight for external dependencies */
    externalDependency: 0.25,
    /** Weight for schema complexity */
    schemaComplexity: 0.20,
    /** Weight for time since last test */
    timeSinceLastTest: 0.15,
    /** Weight for change frequency */
    changeFrequency: 0.10,
  } as const,

  /** Schema complexity thresholds */
  SCHEMA_COMPLEXITY: {
    /** Number of parameters for "complex" classification */
    HIGH_PARAM_COUNT: 10,
    /** Number of nested levels for "complex" classification */
    HIGH_NESTING_DEPTH: 3,
    /** Number of required params for priority boost */
    MANY_REQUIRED_PARAMS: 5,
  } as const,

  /** Historical success thresholds */
  SUCCESS_HISTORY: {
    /** Success rate threshold to reduce testing (%) */
    HIGH_SUCCESS_THRESHOLD: 95,
    /** Number of consecutive successes to consider stable */
    STABLE_RUN_COUNT: 5,
  } as const,

  /** Time-based thresholds */
  TIME_THRESHOLDS: {
    /** Hours since last test to increase priority */
    STALE_HOURS: 168, // 1 week
    /** Hours since last test for maximum priority */
    VERY_STALE_HOURS: 720, // 30 days
  } as const,

  /** Maximum tests to skip per tool (safety limit) */
  MAX_SKIPPED_CATEGORIES_PER_TOOL: 3,
} as const;
