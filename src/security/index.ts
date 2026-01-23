/**
 * Security testing module for bellwether check mode.
 *
 * This module provides deterministic security testing capabilities that can
 * detect common vulnerability patterns in MCP tools without requiring LLM.
 *
 * Usage:
 *   bellwether check --security           # Run security tests with default categories
 *   bellwether check --security --security-categories sql_injection,xss
 *
 * The security baseline is stored in the baseline file and can be compared
 * across runs to detect security posture changes.
 */

// Type exports
export type {
  SecurityCategory,
  RiskLevel,
  SecurityPayload,
  SecurityTestResult,
  SecurityFinding,
  SecurityFingerprint,
  SecurityDiff,
  SecurityTestOptions,
  SecurityTestContext,
  SecurityToolCallResult,
  SecurityReport,
} from './types.js';

// Payload exports
export {
  SQL_INJECTION_PAYLOADS,
  XSS_PAYLOADS,
  PATH_TRAVERSAL_PAYLOADS,
  COMMAND_INJECTION_PAYLOADS,
  SSRF_PAYLOADS,
  getPayloadsForCategory,
  getAllSecurityPayloads,
  getAllSecurityCategories,
} from './payloads.js';

// Security tester exports
export {
  runSecurityTests,
  compareSecurityFingerprints,
  getRiskLevelFromScore,
  parseSecurityCategories,
} from './security-tester.js';
