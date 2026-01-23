/**
 * Security testing types for deterministic vulnerability detection.
 *
 * This module defines types for the security baseline feature, which runs
 * deterministic security tests in check mode without requiring LLM.
 */

/**
 * Categories of security vulnerabilities tested.
 * Each category maps to a specific class of attack vectors.
 */
export type SecurityCategory =
  | 'sql_injection'
  | 'xss'
  | 'path_traversal'
  | 'command_injection'
  | 'ssrf'
  | 'error_disclosure';

/**
 * Risk level classification for security findings.
 * Based on potential impact and exploitability.
 */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * A security test payload used to probe for vulnerabilities.
 */
export interface SecurityPayload {
  /** Category of vulnerability being tested */
  category: SecurityCategory;
  /** The actual payload string */
  payload: string;
  /** Human-readable description of the test */
  description: string;
  /** Expected tool behavior when receiving this payload */
  expectedBehavior: 'reject' | 'sanitize' | 'accept';
}

/**
 * Result of a single security test execution.
 */
export interface SecurityTestResult {
  /** Category of vulnerability tested */
  category: SecurityCategory;
  /** Payload that was tested */
  payload: string;
  /** Parameter that was tested */
  parameter: string;
  /** Whether the test passed (tool behaved safely) */
  passed: boolean;
  /** Risk level if a finding was discovered */
  riskLevel: RiskLevel;
  /** Finding details if a vulnerability was detected */
  finding?: SecurityFinding;
  /** Response behavior observed */
  behavior: 'rejected' | 'sanitized' | 'accepted' | 'error';
}

/**
 * A security finding discovered during testing.
 */
export interface SecurityFinding {
  /** Category of vulnerability */
  category: SecurityCategory;
  /** Risk level assessment */
  riskLevel: RiskLevel;
  /** Short title for the finding */
  title: string;
  /** Detailed description of the issue */
  description: string;
  /** Evidence supporting the finding */
  evidence: string;
  /** Suggested remediation steps */
  remediation: string;
  /** Common Weakness Enumeration ID (e.g., "CWE-89") */
  cweId: string;
  /** Parameter where the vulnerability was found */
  parameter: string;
  /** Tool where the vulnerability was found */
  tool: string;
}

/**
 * Security fingerprint for a tool, stored in the baseline.
 * Captures the security testing state and findings for comparison.
 */
export interface SecurityFingerprint {
  /** Whether security testing was performed */
  tested: boolean;
  /** Categories that were tested */
  categoriesTested: SecurityCategory[];
  /** Findings discovered during testing */
  findings: SecurityFinding[];
  /** Overall risk score (0-100, higher = more risk) */
  riskScore: number;
  /** When security testing was last run */
  testedAt: string;
  /** Hash of findings for quick comparison */
  findingsHash: string;
}

/**
 * Security baseline comparison result.
 * Shows how security posture changed between baselines.
 */
export interface SecurityDiff {
  /** New findings that didn't exist in the previous baseline */
  newFindings: SecurityFinding[];
  /** Findings that were resolved (existed before, not now) */
  resolvedFindings: SecurityFinding[];
  /** Previous risk score */
  previousRiskScore: number;
  /** Current risk score */
  currentRiskScore: number;
  /** Risk score change (positive = worse, negative = better) */
  riskScoreChange: number;
  /** Whether security posture degraded */
  degraded: boolean;
  /** Summary of security changes */
  summary: string;
}

/**
 * Options for running security tests.
 */
export interface SecurityTestOptions {
  /** Categories to test (default: all) */
  categories?: SecurityCategory[];
  /** Maximum payloads per category (default from constants) */
  maxPayloadsPerCategory?: number;
  /** Timeout per test in ms (default from constants) */
  timeout?: number;
  /** Whether to test for error disclosure */
  testErrorDisclosure?: boolean;
}

/**
 * Context required to run security tests on a tool.
 */
export interface SecurityTestContext {
  /** The tool being tested */
  toolName: string;
  /** Tool description */
  toolDescription: string;
  /** Tool input schema */
  inputSchema?: Record<string, unknown>;
  /** Function to call the tool with arguments */
  callTool: (args: Record<string, unknown>) => Promise<SecurityToolCallResult>;
}

/**
 * Result from calling a tool during security testing.
 */
export interface SecurityToolCallResult {
  /** Whether the call resulted in an error */
  isError: boolean;
  /** Text content of the response */
  content: string;
  /** Raw error message if isError is true */
  errorMessage?: string;
}

/**
 * Aggregate security results for an entire server.
 */
export interface SecurityReport {
  /** When the security test was run */
  testedAt: string;
  /** Total tools tested */
  toolsTested: number;
  /** Total findings across all tools */
  totalFindings: number;
  /** Findings by risk level */
  findingsByRiskLevel: Record<RiskLevel, number>;
  /** Findings by category */
  findingsByCategory: Record<SecurityCategory, number>;
  /** Overall server risk score (0-100) */
  overallRiskScore: number;
  /** Per-tool security fingerprints */
  toolFingerprints: Map<string, SecurityFingerprint>;
}
