export const URLS = {
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

// ==================== External URLs ====================

export const EXTERNAL_URLS = {
  /** Shields.io badge service */
  SHIELDS_BADGE: 'https://img.shields.io/badge',
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
