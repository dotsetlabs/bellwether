/**
 * Deterministic security tester for check mode.
 *
 * Runs security payloads against MCP tools and analyzes responses to detect
 * potential vulnerabilities. All testing is deterministic (no LLM required)
 * and uses well-known security test patterns.
 *
 * This module is the core of the security baseline feature, enabling users
 * to detect common vulnerability patterns in their MCP servers.
 */

import { createHash } from 'crypto';
import type {
  SecurityCategory,
  SecurityPayload,
  SecurityTestResult,
  SecurityFinding,
  SecurityFingerprint,
  SecurityTestOptions,
  SecurityTestContext,
  SecurityToolCallResult,
  SecurityDiff,
  RiskLevel,
} from './types.js';
import { getPayloadsForCategory } from './payloads.js';
import { SECURITY_TESTING } from '../constants.js';

/**
 * Run security tests for a single tool.
 *
 * @param context - The tool context including call function
 * @param options - Security test configuration options
 * @returns Security fingerprint with findings
 */
export async function runSecurityTests(
  context: SecurityTestContext,
  options: SecurityTestOptions = {}
): Promise<SecurityFingerprint> {
  const {
    categories = SECURITY_TESTING.DEFAULT_CATEGORIES as unknown as SecurityCategory[],
    maxPayloadsPerCategory = SECURITY_TESTING.MAX_PAYLOADS_PER_CATEGORY,
    testErrorDisclosure = true,
  } = options;

  const findings: SecurityFinding[] = [];
  const categoriesTested: SecurityCategory[] = [];
  const allResults: SecurityTestResult[] = [];

  // Identify testable parameters based on schema
  const testableParams = identifyTestableParameters(context.inputSchema);

  // Limit parameters to prevent excessive testing
  const paramsToTest = testableParams.slice(0, SECURITY_TESTING.MAX_PARAMS_PER_TOOL);

  // Test each category
  for (const category of categories) {
    if (category === 'error_disclosure') {
      // Error disclosure is tested separately
      continue;
    }

    const payloads = getPayloadsForCategory(category).slice(0, maxPayloadsPerCategory);
    if (payloads.length === 0) continue;

    categoriesTested.push(category);

    for (const payload of payloads) {
      for (const param of paramsToTest) {
        const result = await testPayload(context, param, payload);
        allResults.push(result);

        if (result.finding) {
          findings.push(result.finding);
        }
      }
    }
  }

  // Test for error disclosure
  if (testErrorDisclosure && categories.includes('error_disclosure')) {
    const errorFindings = await testErrorDisclosure_internal(context);
    findings.push(...errorFindings);
    if (errorFindings.length > 0 || categories.includes('error_disclosure')) {
      categoriesTested.push('error_disclosure');
    }
  }

  // Calculate risk score
  const riskScore = calculateRiskScore(findings);

  // Create findings hash for comparison
  const findingsHash = computeFindingsHash(findings);

  return {
    tested: true,
    categoriesTested,
    findings,
    riskScore,
    testedAt: new Date().toISOString(),
    findingsHash,
  };
}

/**
 * Identify parameters in a tool's schema that should be security tested.
 * Prioritizes parameters that are more likely to be security-relevant.
 *
 * @param inputSchema - Tool's input schema
 * @returns Array of parameter names to test
 */
function identifyTestableParameters(inputSchema?: Record<string, unknown>): string[] {
  if (!inputSchema) return [];

  const properties = inputSchema.properties as Record<string, unknown> | undefined;
  if (!properties) return [];

  const testable: Array<{ name: string; priority: number }> = [];

  for (const [name, prop] of Object.entries(properties)) {
    const propSchema = prop as { type?: string; description?: string } | undefined;
    if (!propSchema) continue;

    const type = propSchema.type;

    // Only test string parameters (most security-relevant)
    if (type !== 'string') continue;

    // Calculate priority based on name patterns
    let priority = 1;
    const nameLower = name.toLowerCase();
    const desc = (propSchema.description ?? '').toLowerCase();

    // Check against security-relevant patterns
    for (const pattern of SECURITY_TESTING.SECURITY_RELEVANT_PARAM_PATTERNS) {
      if (pattern.test(nameLower) || pattern.test(desc)) {
        priority += 2;
        break;
      }
    }

    // Boost priority for path/file/url related names
    if (/path|file|url|uri|query|command/i.test(nameLower)) {
      priority += 3;
    }

    testable.push({ name, priority });
  }

  // Sort by priority (highest first) and return names
  return testable
    .sort((a, b) => b.priority - a.priority)
    .map((p) => p.name);
}

/**
 * Test a single payload against a parameter.
 *
 * @param context - Tool test context
 * @param paramName - Parameter to inject payload into
 * @param payload - Security payload to test
 * @returns Test result
 */
async function testPayload(
  context: SecurityTestContext,
  paramName: string,
  payload: SecurityPayload
): Promise<SecurityTestResult> {
  const args: Record<string, unknown> = {
    [paramName]: payload.payload,
  };

  try {
    const result = await Promise.race([
      context.callTool(args),
      new Promise<SecurityToolCallResult>((_, reject) =>
        setTimeout(() => reject(new Error('Security test timeout')), SECURITY_TESTING.TEST_TIMEOUT_MS)
      ),
    ]);

    // Analyze the response
    return analyzeSecurityResponse(context, paramName, payload, result);
  } catch (error) {
    // Error during call - check if it's a rejection (good) or unexpected
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isRejection = isSecurityRejection(errorMsg);

    if (isRejection) {
      // Tool properly rejected the malicious input
      return {
        category: payload.category,
        payload: payload.payload,
        parameter: paramName,
        passed: true,
        riskLevel: 'info',
        behavior: 'rejected',
      };
    }

    // Unexpected error - might indicate a problem
    return {
      category: payload.category,
      payload: payload.payload,
      parameter: paramName,
      passed: true, // Not conclusive - don't create finding for errors
      riskLevel: 'info',
      behavior: 'error',
    };
  }
}

/**
 * Analyze a tool response for security issues.
 *
 * @param context - Tool test context
 * @param paramName - Parameter that was tested
 * @param payload - Payload that was used
 * @param result - Tool call result
 * @returns Test result with optional finding
 */
function analyzeSecurityResponse(
  context: SecurityTestContext,
  paramName: string,
  payload: SecurityPayload,
  result: SecurityToolCallResult
): SecurityTestResult {
  const { content, isError, errorMessage } = result;

  // Check if tool returned an error
  if (isError) {
    const errorText = errorMessage ?? content;
    const isRejection = isSecurityRejection(errorText);

    return {
      category: payload.category,
      payload: payload.payload,
      parameter: paramName,
      passed: isRejection, // Rejection = passed
      riskLevel: isRejection ? 'info' : 'medium',
      behavior: isRejection ? 'rejected' : 'error',
      finding: isRejection ? undefined : createFinding(
        context,
        paramName,
        payload,
        'Tool returned error but did not explicitly reject potentially dangerous input'
      ),
    };
  }

  // Success response - check based on expected behavior
  if (payload.expectedBehavior === 'reject') {
    // Payload should have been rejected but was accepted
    return {
      category: payload.category,
      payload: payload.payload,
      parameter: paramName,
      passed: false,
      riskLevel: getRiskLevelForCategory(payload.category),
      behavior: 'accepted',
      finding: createFinding(
        context,
        paramName,
        payload,
        `Tool accepted potentially dangerous input without validation: ${payload.description}`
      ),
    };
  }

  if (payload.expectedBehavior === 'sanitize') {
    // Check if payload appears in response (reflection)
    if (content.includes(payload.payload)) {
      return {
        category: payload.category,
        payload: payload.payload,
        parameter: paramName,
        passed: false,
        riskLevel: 'high',
        behavior: 'accepted',
        finding: createFinding(
          context,
          paramName,
          payload,
          'Tool reflects input without sanitization'
        ),
      };
    }

    // Payload was sanitized
    return {
      category: payload.category,
      payload: payload.payload,
      parameter: paramName,
      passed: true,
      riskLevel: 'info',
      behavior: 'sanitized',
    };
  }

  // Default: accept behavior is expected
  return {
    category: payload.category,
    payload: payload.payload,
    parameter: paramName,
    passed: true,
    riskLevel: 'info',
    behavior: 'accepted',
  };
}

/**
 * Test for error disclosure issues.
 *
 * @param context - Tool test context
 * @returns Array of error disclosure findings
 */
async function testErrorDisclosure_internal(
  context: SecurityTestContext
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  // Try to trigger errors with invalid inputs
  const invalidInputs: Record<string, unknown>[] = [
    { __invalid_param_12345__: 'test' },
    { '': null },
    { ['\x00']: 'null byte param' },
  ];

  for (const args of invalidInputs) {
    try {
      const result = await Promise.race([
        context.callTool(args),
        new Promise<SecurityToolCallResult>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), SECURITY_TESTING.TEST_TIMEOUT_MS)
        ),
      ]);

      if (result.isError) {
        const errorText = result.errorMessage ?? result.content;
        const disclosure = analyzeErrorDisclosure(errorText);

        if (disclosure) {
          findings.push({
            category: 'error_disclosure',
            riskLevel: disclosure.riskLevel,
            title: 'Information disclosure in error messages',
            description: disclosure.description,
            evidence: disclosure.evidence,
            remediation: 'Sanitize error messages to remove internal details, stack traces, file paths, and database information',
            cweId: SECURITY_TESTING.CWE_IDS.error_disclosure,
            parameter: 'N/A',
            tool: context.toolName,
          });
          break; // One finding is enough for error disclosure
        }
      }
    } catch {
      // Expected - timeout or other error
    }
  }

  return findings;
}

/**
 * Analyze error text for information disclosure.
 *
 * @param errorText - Error message to analyze
 * @returns Disclosure info if found, null otherwise
 */
function analyzeErrorDisclosure(errorText: string): {
  riskLevel: RiskLevel;
  description: string;
  evidence: string;
} | null {
  const patterns = SECURITY_TESTING.ERROR_DISCLOSURE_PATTERNS;

  // Check for stack traces (most severe)
  for (const pattern of patterns.stackTrace) {
    if (pattern.test(errorText)) {
      return {
        riskLevel: 'medium',
        description: 'Error message includes stack trace with internal file paths',
        evidence: 'Stack trace detected in error response',
      };
    }
  }

  // Check for file paths
  for (const pattern of patterns.filePath) {
    if (pattern.test(errorText)) {
      return {
        riskLevel: 'low',
        description: 'Error message includes internal file paths',
        evidence: 'File path detected in error response',
      };
    }
  }

  // Check for database details
  for (const pattern of patterns.database) {
    if (pattern.test(errorText)) {
      return {
        riskLevel: 'medium',
        description: 'Error message includes database-related information',
        evidence: 'Database information detected in error response',
      };
    }
  }

  // Check for internal IPs
  for (const pattern of patterns.internalIp) {
    if (pattern.test(errorText)) {
      return {
        riskLevel: 'low',
        description: 'Error message includes internal network addresses',
        evidence: 'Internal IP address detected in error response',
      };
    }
  }

  return null;
}

/**
 * Check if error text indicates a security rejection (good behavior).
 *
 * @param text - Error text to check
 * @returns True if text indicates the tool properly rejected input
 */
function isSecurityRejection(text: string): boolean {
  for (const pattern of SECURITY_TESTING.REJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Get the risk level for a security category.
 *
 * @param category - Security category
 * @returns Appropriate risk level
 */
function getRiskLevelForCategory(category: SecurityCategory): RiskLevel {
  switch (category) {
    case 'sql_injection':
    case 'command_injection':
      return 'critical';
    case 'path_traversal':
    case 'ssrf':
      return 'high';
    case 'xss':
      return 'medium';
    case 'error_disclosure':
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Create a security finding.
 *
 * @param context - Tool test context
 * @param paramName - Parameter where vulnerability was found
 * @param payload - Payload that revealed the vulnerability
 * @param description - Description of the issue
 * @returns Security finding
 */
function createFinding(
  context: SecurityTestContext,
  paramName: string,
  payload: SecurityPayload,
  description: string
): SecurityFinding {
  return {
    category: payload.category,
    riskLevel: getRiskLevelForCategory(payload.category),
    title: `Potential ${formatCategoryName(payload.category)} vulnerability`,
    description,
    evidence: `Parameter: "${paramName}", Payload: "${truncate(payload.payload, 50)}"`,
    remediation: getRemediation(payload.category),
    cweId: SECURITY_TESTING.CWE_IDS[payload.category],
    parameter: paramName,
    tool: context.toolName,
  };
}

/**
 * Format a security category name for display.
 *
 * @param category - Security category
 * @returns Human-readable category name
 */
function formatCategoryName(category: SecurityCategory): string {
  return category
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Get remediation advice for a security category.
 *
 * @param category - Security category
 * @returns Remediation advice string
 */
function getRemediation(category: SecurityCategory): string {
  switch (category) {
    case 'sql_injection':
      return 'Use parameterized queries or prepared statements. Never concatenate user input directly into SQL queries.';
    case 'xss':
      return 'Escape or encode all user input before including it in output. Use Content-Security-Policy headers.';
    case 'path_traversal':
      return 'Validate and sanitize file paths. Use allowlists for permitted directories and reject paths containing "../" or absolute paths.';
    case 'command_injection':
      return 'Avoid shell execution with user input. Use safe APIs, input validation, and allowlists for permitted commands.';
    case 'ssrf':
      return 'Validate and allowlist permitted URLs and hosts. Block requests to private IP ranges (10.x, 172.16-31.x, 192.168.x) and localhost.';
    case 'error_disclosure':
      return 'Sanitize error messages to remove internal details. Use generic error messages for users and log detailed errors server-side only.';
    default:
      return 'Implement proper input validation and sanitization for all user-provided data.';
  }
}

/**
 * Truncate a string to a maximum length.
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @returns Truncated string with ellipsis if needed
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Calculate overall risk score from findings.
 *
 * @param findings - Array of security findings
 * @returns Risk score (0-100)
 */
function calculateRiskScore(findings: SecurityFinding[]): number {
  if (findings.length === 0) return 0;

  const weights = SECURITY_TESTING.RISK_WEIGHTS;

  let score = 0;
  for (const finding of findings) {
    score += weights[finding.riskLevel];
  }

  return Math.min(100, score);
}

/**
 * Compute a hash of findings for quick comparison.
 *
 * @param findings - Array of security findings
 * @returns Hash string
 */
function computeFindingsHash(findings: SecurityFinding[]): string {
  if (findings.length === 0) return 'empty';

  // Sort findings for consistent hashing
  const sorted = [...findings].sort((a, b) => {
    if (a.tool !== b.tool) return a.tool.localeCompare(b.tool);
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.parameter.localeCompare(b.parameter);
  });

  const content = sorted
    .map((f) => `${f.tool}:${f.category}:${f.parameter}:${f.riskLevel}`)
    .join('|');

  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Compare two security fingerprints to detect changes.
 *
 * @param previous - Previous security fingerprint (may be undefined)
 * @param current - Current security fingerprint (may be undefined)
 * @returns Security diff showing what changed
 */
export function compareSecurityFingerprints(
  previous: SecurityFingerprint | undefined,
  current: SecurityFingerprint | undefined
): SecurityDiff {
  // Handle missing fingerprints
  if (!previous && !current) {
    return {
      newFindings: [],
      resolvedFindings: [],
      previousRiskScore: 0,
      currentRiskScore: 0,
      riskScoreChange: 0,
      degraded: false,
      summary: 'No security testing data available',
    };
  }

  if (!previous) {
    return {
      newFindings: current!.findings,
      resolvedFindings: [],
      previousRiskScore: 0,
      currentRiskScore: current!.riskScore,
      riskScoreChange: current!.riskScore,
      degraded: current!.findings.length > 0,
      summary: current!.findings.length > 0
        ? `Initial security scan found ${current!.findings.length} finding(s)`
        : 'Initial security scan: no findings',
    };
  }

  if (!current) {
    return {
      newFindings: [],
      resolvedFindings: previous.findings,
      previousRiskScore: previous.riskScore,
      currentRiskScore: 0,
      riskScoreChange: -previous.riskScore,
      degraded: false,
      summary: 'Security testing not performed in current run',
    };
  }

  // Both exist - compare findings
  const prevFindingKeys = new Set(
    previous.findings.map((f) => `${f.tool}:${f.category}:${f.parameter}`)
  );
  const currFindingKeys = new Set(
    current.findings.map((f) => `${f.tool}:${f.category}:${f.parameter}`)
  );

  const newFindings = current.findings.filter(
    (f) => !prevFindingKeys.has(`${f.tool}:${f.category}:${f.parameter}`)
  );
  const resolvedFindings = previous.findings.filter(
    (f) => !currFindingKeys.has(`${f.tool}:${f.category}:${f.parameter}`)
  );

  const riskScoreChange = current.riskScore - previous.riskScore;
  const degraded = newFindings.length > 0 || riskScoreChange > 0;

  // Generate summary
  const parts: string[] = [];
  if (newFindings.length > 0) {
    parts.push(`${newFindings.length} new finding(s)`);
  }
  if (resolvedFindings.length > 0) {
    parts.push(`${resolvedFindings.length} resolved`);
  }
  if (riskScoreChange !== 0) {
    const direction = riskScoreChange > 0 ? 'increased' : 'decreased';
    parts.push(`risk score ${direction} by ${Math.abs(riskScoreChange)}`);
  }

  const summary = parts.length > 0
    ? parts.join(', ')
    : 'No security changes detected';

  return {
    newFindings,
    resolvedFindings,
    previousRiskScore: previous.riskScore,
    currentRiskScore: current.riskScore,
    riskScoreChange,
    degraded,
    summary,
  };
}

/**
 * Get risk level classification from a risk score.
 *
 * @param score - Risk score (0-100)
 * @returns Risk level
 */
export function getRiskLevelFromScore(score: number): RiskLevel {
  const thresholds = SECURITY_TESTING.RISK_THRESHOLDS;

  if (score >= thresholds.critical) return 'critical';
  if (score >= thresholds.high) return 'high';
  if (score >= thresholds.medium) return 'medium';
  if (score >= thresholds.low) return 'low';
  return 'info';
}

/**
 * Parse security categories from a comma-separated string.
 *
 * @param categoriesString - Comma-separated category names
 * @returns Array of valid security categories
 */
export function parseSecurityCategories(categoriesString: string): SecurityCategory[] {
  const validCategories = new Set(SECURITY_TESTING.DEFAULT_CATEGORIES);
  const parsed: SecurityCategory[] = [];

  for (const cat of categoriesString.split(',')) {
    const trimmed = cat.trim().toLowerCase() as SecurityCategory;
    if (validCategories.has(trimmed)) {
      parsed.push(trimmed);
    }
  }

  return parsed.length > 0 ? parsed : [...SECURITY_TESTING.DEFAULT_CATEGORIES] as SecurityCategory[];
}
