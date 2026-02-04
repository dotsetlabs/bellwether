/**
 * Registry-related constants.
 */
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
