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

export const BENCHMARK_TIERS = {
  /** Platinum tier requirements: security testing + all personas + high pass rate */
  PLATINUM: {
    MIN_PERSONAS: 4,
    MIN_PASS_RATE: 90,
    REQUIRES_SECURITY: true,
  },
  /** Gold tier requirements: multiple personas + good coverage + high pass rate */
  GOLD: {
    MIN_PERSONAS: 3,
    MIN_PASS_RATE: 85,
    REQUIRES_PROMPTS_OR_RESOURCES: true,
  },
  /** Silver tier requirements: error handling tested + decent pass rate */
  SILVER: {
    MIN_PERSONAS: 2,
    MIN_PASS_RATE: 75,
  },
  /** Bronze tier is the default when other thresholds aren't met */
  BRONZE: {
    MIN_PERSONAS: 1,
    MIN_PASS_RATE: 0,
  },
  /** Minimum pass rate required for any benchmark to pass */
  MIN_PASS_RATE_FOR_BENCHMARK: 50,
} as const;

/**
 * Health scoring configuration.
 * Used by health-scorer.ts for comprehensive server health assessment.
 */

export const HEALTH_SCORING = {
  /** Component weights (should sum to 1.0) */
  WEIGHTS: {
    testCoverage: 0.25,
    errorRate: 0.25,
    performanceScore: 0.15,
    deprecationScore: 0.10,
    breakingChangeScore: 0.15,
    documentationScore: 0.10,
  },
  /** Grade thresholds (minimum score for each grade) */
  GRADE_THRESHOLDS: {
    A: 90,
    B: 80,
    C: 70,
    D: 60,
    F: 0,
  },
  /** Severity thresholds (minimum score for each severity level) */
  SEVERITY_THRESHOLDS: {
    none: 90,
    info: 70,
    warning: 50,
    breaking: 0,
  },
  /** Penalty values for various issues (deducted from 100) */
  PENALTIES: {
    /** Penalty per deprecated tool */
    deprecatedTool: 10,
    /** Penalty per tool past removal date */
    expiredTool: 25,
    /** Penalty per breaking change */
    breakingChange: 15,
    /** Penalty per warning-level change */
    warningChange: 5,
    /** Penalty for tools without descriptions */
    missingDescription: 5,
    /** Penalty for short descriptions (<20 chars) */
    shortDescription: 2,
    /** Penalty per performance regression */
    performanceRegression: 10,
  },
  /** Minimum description length to avoid shortDescription penalty */
  MIN_DESCRIPTION_LENGTH: 20,
  /** Trend detection thresholds */
  TREND_THRESHOLD: 5,
  /** Maximum action items to display */
  MAX_ACTION_ITEMS_DISPLAY: 5,
} as const;
