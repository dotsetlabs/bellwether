/**
 * Rich error analysis with remediation suggestions.
 *
 * This module provides enhanced error analysis capabilities:
 * - HTTP status code parsing and categorization
 * - Root cause inference from error messages
 * - Remediation suggestion generation
 * - Related parameter extraction
 * - Transient error detection
 * - Error trend analysis across baselines
 */

import type { ErrorPattern } from './response-fingerprint.js';
import type { ErrorTrend, ErrorTrendReport } from './types.js';

// Re-export types from types.ts for convenience
export type { ErrorTrend, ErrorTrendReport };

// ==================== Types ====================

/** HTTP status code categories for error classification */
export type HttpStatusCategory =
  | 'client_error_validation'  // 400
  | 'client_error_auth'        // 401, 403
  | 'client_error_not_found'   // 404
  | 'client_error_conflict'    // 409
  | 'client_error_rate_limit'  // 429
  | 'server_error'             // 5xx
  | 'unknown';

/** Severity level for error analysis */
export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Enhanced error analysis result */
export interface EnhancedErrorAnalysis {
  /** Original error pattern */
  pattern: ErrorPattern;
  /** HTTP status code if detected */
  httpStatus?: number;
  /** Status category */
  statusCategory: HttpStatusCategory;
  /** Root cause analysis */
  rootCause: string;
  /** Remediation suggestion */
  remediation: string;
  /** Related parameters (if identifiable) */
  relatedParameters: string[];
  /** Whether this error is likely transient */
  transient: boolean;
  /** Severity assessment */
  severity: ErrorSeverity;
}

/** Error analysis summary for a tool */
export interface ErrorAnalysisSummary {
  /** Tool name */
  tool: string;
  /** Total errors analyzed */
  totalErrors: number;
  /** Enhanced analyses */
  analyses: EnhancedErrorAnalysis[];
  /** Most common error category */
  dominantCategory: HttpStatusCategory;
  /** Count of transient errors */
  transientErrors: number;
  /** Count of actionable errors (with clear remediation) */
  actionableCount: number;
  /** Unique remediations suggested */
  remediations: string[];
  /** Counts by error category */
  categoryCounts: Map<string, number>;
  /** Top root causes (most common) */
  topRootCauses: string[];
  /** Top remediations (most actionable) */
  topRemediations: string[];
  /** Related parameters across all errors */
  relatedParameters: string[];
}

// ==================== Analysis Functions ====================

/**
 * Analyze an error message for enhanced information.
 *
 * @param errorMessage - The error message to analyze
 * @returns Enhanced error analysis with root cause and remediation
 */
export function analyzeError(errorMessage: string): EnhancedErrorAnalysis {
  const httpStatus = extractHttpStatus(errorMessage);
  const statusCategory = categorizeHttpStatus(httpStatus);
  const rootCause = inferRootCause(errorMessage, statusCategory);
  const remediation = generateRemediation(statusCategory, errorMessage);
  const relatedParameters = extractRelatedParameters(errorMessage);
  const transient = isTransientError(statusCategory, errorMessage);
  const severity = assessErrorSeverity(statusCategory, errorMessage);

  return {
    pattern: {
      category: mapStatusToErrorCategory(statusCategory),
      patternHash: '',
      example: errorMessage,
      count: 1,
    },
    httpStatus,
    statusCategory,
    rootCause,
    remediation,
    relatedParameters,
    transient,
    severity,
  };
}

/**
 * Analyze multiple error patterns and return enhanced analyses.
 *
 * @param patterns - Array of error patterns to analyze
 * @returns Array of enhanced error analyses
 */
export function analyzeErrorPatterns(patterns: ErrorPattern[]): EnhancedErrorAnalysis[] {
  return patterns.map((pattern) => {
    const analysis = analyzeError(pattern.example);
    return {
      ...analysis,
      pattern,
    };
  });
}

/**
 * Generate an error analysis summary for a tool.
 *
 * @param toolName - Name of the tool
 * @param patterns - Error patterns for the tool
 * @returns Error analysis summary
 */
export function generateErrorSummary(
  toolName: string,
  patterns: ErrorPattern[]
): ErrorAnalysisSummary {
  const analyses = analyzeErrorPatterns(patterns);
  const totalErrors = patterns.reduce((sum, p) => sum + p.count, 0);

  // Find dominant category and build category counts
  const categoryCounts = new Map<string, number>();
  for (const analysis of analyses) {
    const count = categoryCounts.get(analysis.statusCategory) ?? 0;
    categoryCounts.set(analysis.statusCategory, count + analysis.pattern.count);
  }

  let dominantCategory: HttpStatusCategory = 'unknown';
  let maxCount = 0;
  for (const [category, count] of categoryCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantCategory = category as HttpStatusCategory;
    }
  }

  // Count transient and actionable errors
  const transientErrors = analyses.filter((a) => a.transient).reduce((sum, a) => sum + a.pattern.count, 0);
  const actionableCount = analyses.filter(
    (a) => a.remediation && !a.remediation.includes('Review')
  ).length;

  // Collect unique remediations with frequency
  const remediationCounts = new Map<string, number>();
  for (const analysis of analyses) {
    if (analysis.remediation) {
      const count = remediationCounts.get(analysis.remediation) ?? 0;
      remediationCounts.set(analysis.remediation, count + analysis.pattern.count);
    }
  }

  // Get top remediations sorted by frequency
  const topRemediations = Array.from(remediationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([remediation]) => remediation);

  // Collect root causes with frequency
  const rootCauseCounts = new Map<string, number>();
  for (const analysis of analyses) {
    if (analysis.rootCause) {
      const count = rootCauseCounts.get(analysis.rootCause) ?? 0;
      rootCauseCounts.set(analysis.rootCause, count + analysis.pattern.count);
    }
  }

  // Get top root causes sorted by frequency
  const topRootCauses = Array.from(rootCauseCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cause]) => cause);

  // Collect all related parameters
  const relatedParamsSet = new Set<string>();
  for (const analysis of analyses) {
    for (const param of analysis.relatedParameters) {
      relatedParamsSet.add(param);
    }
  }

  return {
    tool: toolName,
    totalErrors,
    analyses,
    dominantCategory,
    transientErrors,
    actionableCount,
    remediations: Array.from(remediationCounts.keys()),
    categoryCounts,
    topRootCauses,
    topRemediations,
    relatedParameters: Array.from(relatedParamsSet).slice(0, 10),
  };
}

/**
 * Compare error patterns and identify trends.
 *
 * @param previous - Error patterns from previous baseline
 * @param current - Error patterns from current baseline
 * @returns Error trend report
 */
export function analyzeErrorTrends(
  previous: ErrorPattern[],
  current: ErrorPattern[]
): ErrorTrendReport {
  const trends: ErrorTrend[] = [];

  const prevByCategory = new Map<string, number>();
  const currByCategory = new Map<string, number>();

  for (const p of previous) {
    prevByCategory.set(p.category, (prevByCategory.get(p.category) ?? 0) + p.count);
  }
  for (const c of current) {
    currByCategory.set(c.category, (currByCategory.get(c.category) ?? 0) + c.count);
  }

  const allCategories = new Set([...prevByCategory.keys(), ...currByCategory.keys()]);

  const increasingCategories: string[] = [];
  const decreasingCategories: string[] = [];
  const newCategories: string[] = [];
  const resolvedCategories: string[] = [];

  for (const category of allCategories) {
    const prevCount = prevByCategory.get(category) ?? 0;
    const currCount = currByCategory.get(category) ?? 0;

    let trend: ErrorTrend['trend'];
    let significance: ErrorTrend['significance'];
    let changePercent = 0;

    if (prevCount === 0 && currCount > 0) {
      trend = 'new';
      significance = 'high';
      changePercent = 100;
      newCategories.push(category);
    } else if (currCount === 0 && prevCount > 0) {
      trend = 'resolved';
      significance = 'medium';
      changePercent = -100;
      resolvedCategories.push(category);
    } else if (prevCount > 0) {
      changePercent = ((currCount - prevCount) / prevCount) * 100;

      if (currCount > prevCount * 1.5) {
        trend = 'increasing';
        significance = 'high';
        increasingCategories.push(category);
      } else if (currCount < prevCount * 0.5) {
        trend = 'decreasing';
        significance = 'low';
        decreasingCategories.push(category);
      } else {
        trend = 'stable';
        significance = 'low';
      }
    } else {
      trend = 'stable';
      significance = 'low';
    }

    trends.push({
      category,
      previousCount: prevCount,
      currentCount: currCount,
      trend,
      significance,
      changePercent: Math.round(changePercent),
    });
  }

  // Filter out stable trends with zero counts
  const significantTrends = trends.filter((t) => t.trend !== 'stable' || t.currentCount > 0);

  // Determine if there's a significant change
  const significantChange =
    newCategories.length > 0 ||
    increasingCategories.length > 0 ||
    trends.some((t) => t.significance === 'high');

  // Generate summary
  const summary = generateTrendSummary(
    newCategories,
    resolvedCategories,
    increasingCategories,
    decreasingCategories
  );

  return {
    trends: significantTrends,
    significantChange,
    summary,
    increasingCategories,
    decreasingCategories,
    newCategories,
    resolvedCategories,
  };
}

// ==================== HTTP Status Parsing ====================

/**
 * Extract HTTP status code from error message.
 *
 * @param message - Error message to parse
 * @returns HTTP status code if found, undefined otherwise
 */
export function extractHttpStatus(message: string): number | undefined {
  // Match patterns like "status code 400", "HTTP 404", "Error 500", "(404)", "[500]"
  const patterns = [
    /status\s*(?:code)?\s*[:\s]?\s*(\d{3})/i,
    /HTTP\s*(?:\/\d\.\d)?\s*(\d{3})/i,
    /Error\s*(\d{3})/i,
    /\[(\d{3})\]/,
    /\((\d{3})\)/,
    /\b([45]\d{2})\b(?:\s+(?:error|bad|not|forbidden|unauthorized|internal))/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const status = parseInt(match[1], 10);
      // Validate it's a reasonable HTTP status
      if (status >= 100 && status < 600) {
        return status;
      }
    }
  }

  return undefined;
}

/**
 * Categorize HTTP status code into a category.
 *
 * @param status - HTTP status code
 * @returns HTTP status category
 */
export function categorizeHttpStatus(status: number | undefined): HttpStatusCategory {
  if (!status) return 'unknown';

  if (status === 400) return 'client_error_validation';
  if (status === 401 || status === 403) return 'client_error_auth';
  if (status === 404) return 'client_error_not_found';
  if (status === 409) return 'client_error_conflict';
  if (status === 429) return 'client_error_rate_limit';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error_validation';

  return 'unknown';
}

// ==================== Root Cause Analysis ====================

/**
 * Infer root cause from error message and category.
 *
 * @param message - Error message
 * @param category - HTTP status category
 * @returns Root cause description
 */
export function inferRootCause(message: string, category: HttpStatusCategory): string {
  const lower = message.toLowerCase();

  // Check for specific patterns first (most specific)
  if (lower.includes('required') && lower.includes('missing')) {
    return 'Missing required parameter or field';
  }
  if (lower.includes('required')) {
    const paramMatch = message.match(/['"`](\w+)['"`].*(?:is )?required/i);
    if (paramMatch) {
      return `Required parameter "${paramMatch[1]}" is missing`;
    }
    return 'Missing required parameter or field';
  }
  if (lower.includes('missing')) {
    const fieldMatch = message.match(/missing\s+(?:required\s+)?(?:field|parameter|property)?\s*['"`]?(\w+)['"`]?/i);
    if (fieldMatch) {
      return `Missing required field "${fieldMatch[1]}"`;
    }
    return 'Missing required parameter or field';
  }
  if (lower.includes('invalid') && lower.includes('format')) {
    return 'Invalid input format - value does not match expected format';
  }
  if (lower.includes('invalid') && lower.includes('type')) {
    return 'Invalid input type - value type does not match expected type';
  }
  if (lower.includes('invalid') || lower.includes('malformed')) {
    return 'Invalid input format or value';
  }
  if (lower.includes('not found') || lower.includes('does not exist') || lower.includes("doesn't exist")) {
    return 'Referenced resource does not exist';
  }
  if (lower.includes('already exists') || lower.includes('duplicate')) {
    return 'Resource already exists - duplicate creation attempted';
  }
  if (lower.includes('unauthorized') || lower.includes('authentication')) {
    return 'Authentication credentials missing or invalid';
  }
  if (lower.includes('forbidden') || lower.includes('permission') || lower.includes('access denied')) {
    return 'Insufficient permissions for this operation';
  }
  if (lower.includes('rate') || lower.includes('throttl') || lower.includes('too many')) {
    return 'Request rate limit exceeded';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'Operation timed out';
  }
  if (lower.includes('conflict') || lower.includes('concurrent')) {
    return 'Resource state conflict (concurrent modification)';
  }
  if (lower.includes('connection') && (lower.includes('refused') || lower.includes('failed'))) {
    return 'Connection to external service failed';
  }
  if (lower.includes('network') || lower.includes('dns')) {
    return 'Network connectivity issue';
  }
  if (lower.includes('internal') && lower.includes('error')) {
    return 'Internal server error occurred';
  }
  if (lower.includes('unavailable') || lower.includes('maintenance')) {
    return 'Service temporarily unavailable';
  }

  // Fall back to category-based inference
  switch (category) {
    case 'client_error_validation':
      return 'Client request validation failed';
    case 'client_error_auth':
      return 'Authentication or authorization failure';
    case 'client_error_not_found':
      return 'Requested resource not found';
    case 'client_error_conflict':
      return 'Resource conflict detected';
    case 'client_error_rate_limit':
      return 'Rate limit exceeded';
    case 'server_error':
      return 'Server-side error occurred';
    default:
      return 'Unknown error cause';
  }
}

// ==================== Remediation Generation ====================

/**
 * Generate remediation suggestion based on category and message.
 *
 * @param category - HTTP status category
 * @param message - Error message
 * @returns Remediation suggestion
 */
export function generateRemediation(category: HttpStatusCategory, message: string): string {
  const lower = message.toLowerCase();

  // Specific remediations based on message content
  if (lower.includes('required')) {
    const paramMatch = message.match(/['"`](\w+)['"`]/);
    if (paramMatch) {
      return `Ensure the "${paramMatch[1]}" parameter is provided with a valid value`;
    }
    return 'Ensure all required parameters are provided';
  }

  if (lower.includes('invalid') && lower.includes('format')) {
    return 'Verify input format matches the expected pattern (check documentation for format requirements)';
  }

  if (lower.includes('invalid') && lower.includes('type')) {
    return 'Check that parameter types match the schema (string, number, boolean, etc.)';
  }

  if (lower.includes('not found')) {
    const resourceMatch = message.match(/['"`]?(\w+)['"`]?\s+(?:not found|does not exist)/i);
    if (resourceMatch) {
      return `Verify the ${resourceMatch[1]} exists before accessing it`;
    }
    return 'Verify the resource exists before accessing';
  }

  if (lower.includes('already exists')) {
    return 'Check if resource exists before creation, or use upsert if available';
  }

  if (lower.includes('timeout')) {
    return 'Consider increasing timeout or breaking operation into smaller chunks';
  }

  if (lower.includes('rate') || lower.includes('throttl')) {
    return 'Implement exponential backoff and respect rate limits (Retry-After header)';
  }

  // Category-based remediations
  switch (category) {
    case 'client_error_validation':
      return 'Check input parameters against the schema requirements';
    case 'client_error_auth':
      return 'Verify authentication credentials and ensure proper permissions are granted';
    case 'client_error_not_found':
      return 'Verify the resource exists before accessing (check IDs and paths)';
    case 'client_error_conflict':
      return 'Implement optimistic locking or retry with conflict resolution';
    case 'client_error_rate_limit':
      return 'Implement exponential backoff and rate limiting';
    case 'server_error':
      return 'Retry with exponential backoff; contact server administrator if persistent';
    default:
      return 'Review error message and API documentation';
  }
}

// ==================== Parameter Extraction ====================

/**
 * Extract parameter names mentioned in error message.
 *
 * @param message - Error message
 * @returns Array of parameter names
 */
export function extractRelatedParameters(message: string): string[] {
  const params: string[] = [];
  const seen = new Set<string>();

  // Match quoted strings that look like parameter names
  const quotedMatches = message.matchAll(/['"`](\w+)['"`]/g);
  for (const match of quotedMatches) {
    const param = match[1];
    if (param.length > 1 && param.length < 30 && !seen.has(param)) {
      // Filter out common non-parameter words
      if (!isCommonWord(param)) {
        params.push(param);
        seen.add(param);
      }
    }
  }

  // Match "parameter X" or "field X" patterns
  const paramMatches = message.matchAll(/(?:parameter|field|property|argument|key)\s+['"`]?(\w+)['"`]?/gi);
  for (const match of paramMatches) {
    const param = match[1];
    if (!seen.has(param) && !isCommonWord(param)) {
      params.push(param);
      seen.add(param);
    }
  }

  // Match "X is required" or "missing X" patterns
  const requiredMatches = message.matchAll(/(\w+)\s+(?:is\s+)?(?:required|missing|invalid)/gi);
  for (const match of requiredMatches) {
    const param = match[1].toLowerCase();
    if (param.length > 2 && !seen.has(param) && !isCommonWord(param)) {
      params.push(param);
      seen.add(param);
    }
  }

  return params;
}

/**
 * Check if a word is a common English word (not a parameter).
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can',
    'need', 'not', 'and', 'but', 'or', 'if', 'then', 'else',
    'for', 'with', 'from', 'this', 'that', 'these', 'those',
    'error', 'message', 'failed', 'invalid', 'missing', 'required',
    'found', 'exist', 'exists', 'value', 'input', 'output', 'type',
    'string', 'number', 'boolean', 'object', 'array', 'null', 'undefined',
    'field', 'parameter', 'property', 'argument', 'key',
  ]);
  return commonWords.has(word.toLowerCase());
}

// ==================== Transient Error Detection ====================

/**
 * Determine if error is likely transient (temporary).
 *
 * @param category - HTTP status category
 * @param message - Error message
 * @returns Whether the error is likely transient
 */
export function isTransientError(category: HttpStatusCategory, message: string): boolean {
  const lower = message.toLowerCase();

  // Rate limiting is always transient
  if (category === 'client_error_rate_limit') return true;

  // Server errors are usually transient
  if (category === 'server_error') return true;

  // Check for transient keywords
  const transientKeywords = [
    'timeout', 'timed out', 'temporarily', 'retry', 'unavailable',
    'connection', 'network', 'service unavailable', 'too many requests',
    'try again', 'overloaded', 'busy', 'maintenance',
  ];

  return transientKeywords.some((keyword) => lower.includes(keyword));
}

// ==================== Severity Assessment ====================

/**
 * Assess error severity based on category and message.
 *
 * @param category - HTTP status category
 * @param message - Error message
 * @returns Error severity level
 */
export function assessErrorSeverity(category: HttpStatusCategory, message: string): ErrorSeverity {
  const lower = message.toLowerCase();

  // Critical severity indicators
  if (lower.includes('fatal') || lower.includes('crash') || lower.includes('corrupt')) {
    return 'critical';
  }

  // High severity
  if (category === 'server_error') {
    return 'high';
  }
  if (category === 'client_error_auth') {
    return 'high';
  }

  // Medium severity
  if (category === 'client_error_validation') {
    return 'medium';
  }
  if (category === 'client_error_conflict') {
    return 'medium';
  }

  // Low severity
  if (category === 'client_error_not_found') {
    return 'low';
  }
  if (category === 'client_error_rate_limit') {
    return 'low';
  }

  // Default
  return 'info';
}

// ==================== Helper Functions ====================

/**
 * Map HTTP status category to ErrorPattern category.
 */
export function mapStatusToErrorCategory(
  category: HttpStatusCategory
): 'validation' | 'not_found' | 'permission' | 'timeout' | 'internal' | 'unknown' {
  switch (category) {
    case 'client_error_validation':
    case 'client_error_conflict':
    case 'client_error_rate_limit':
      return 'validation';
    case 'client_error_not_found':
      return 'not_found';
    case 'client_error_auth':
      return 'permission';
    case 'server_error':
      return 'internal';
    default:
      return 'unknown';
  }
}

/**
 * Generate a summary of error trends.
 */
function generateTrendSummary(
  newCategories: string[],
  resolvedCategories: string[],
  increasingCategories: string[],
  decreasingCategories: string[]
): string {
  const parts: string[] = [];

  if (newCategories.length > 0) {
    parts.push(`${newCategories.length} new error type(s): ${newCategories.join(', ')}`);
  }
  if (resolvedCategories.length > 0) {
    parts.push(`${resolvedCategories.length} resolved: ${resolvedCategories.join(', ')}`);
  }
  if (increasingCategories.length > 0) {
    parts.push(`${increasingCategories.length} increasing: ${increasingCategories.join(', ')}`);
  }
  if (decreasingCategories.length > 0) {
    parts.push(`${decreasingCategories.length} decreasing: ${decreasingCategories.join(', ')}`);
  }

  if (parts.length === 0) {
    return 'Error patterns stable';
  }

  return parts.join('; ');
}

// ==================== Formatting Functions ====================

/**
 * Format enhanced error analysis for display.
 *
 * @param analysis - Enhanced error analysis
 * @param useColors - Whether to use ANSI colors
 * @returns Formatted string
 */
export function formatEnhancedError(analysis: EnhancedErrorAnalysis, useColors: boolean = false): string {
  const lines: string[] = [];
  const { yellow, cyan, dim } = useColors ? getColors() : getNoColors();

  // Category and status
  const statusText = analysis.httpStatus ? `HTTP ${analysis.httpStatus}` : 'Unknown status';
  lines.push(`${cyan(formatCategoryName(analysis.statusCategory))} (${statusText})`);

  // Root cause
  lines.push(`  ${dim('Cause:')} ${analysis.rootCause}`);

  // Remediation
  lines.push(`  ${dim('Fix:')} ${analysis.remediation}`);

  // Related parameters
  if (analysis.relatedParameters.length > 0) {
    lines.push(`  ${dim('Parameters:')} ${analysis.relatedParameters.join(', ')}`);
  }

  // Transient indicator
  if (analysis.transient) {
    lines.push(`  ${yellow('Transient - may resolve with retry')}`);
  }

  return lines.join('\n');
}

/**
 * Format error trend report for display.
 *
 * @param report - Error trend report
 * @param useColors - Whether to use ANSI colors
 * @returns Formatted string
 */
export function formatErrorTrendReport(report: ErrorTrendReport, useColors: boolean = false): string {
  const lines: string[] = [];
  const { red, green, yellow, cyan, dim } = useColors ? getColors() : getNoColors();

  lines.push(cyan('Error Trend Analysis'));
  lines.push('');

  if (!report.significantChange) {
    lines.push(green('  No significant changes in error patterns'));
    return lines.join('\n');
  }

  // New errors (high priority)
  if (report.newCategories.length > 0) {
    lines.push(red(`  New error types: ${report.newCategories.join(', ')}`));
  }

  // Resolved errors
  if (report.resolvedCategories.length > 0) {
    lines.push(green(`  Resolved: ${report.resolvedCategories.join(', ')}`));
  }

  // Increasing errors
  if (report.increasingCategories.length > 0) {
    lines.push(yellow(`  Increasing: ${report.increasingCategories.join(', ')}`));
  }

  // Decreasing errors
  if (report.decreasingCategories.length > 0) {
    lines.push(dim(`  Decreasing: ${report.decreasingCategories.join(', ')}`));
  }

  // Trend details
  lines.push('');
  lines.push('  Trend details:');
  for (const trend of report.trends.filter((t) => t.trend !== 'stable')) {
    const arrow = getTrendArrow(trend.trend);
    const changeText = trend.changePercent !== 0 ? ` (${trend.changePercent > 0 ? '+' : ''}${trend.changePercent}%)` : '';
    lines.push(`    ${arrow} ${trend.category}: ${trend.previousCount} → ${trend.currentCount}${changeText}`);
  }

  return lines.join('\n');
}

/**
 * Format category name for display.
 */
export function formatCategoryName(category: HttpStatusCategory): string {
  const names: Record<HttpStatusCategory, string> = {
    client_error_validation: 'Validation Error',
    client_error_auth: 'Authentication Error',
    client_error_not_found: 'Not Found',
    client_error_conflict: 'Conflict',
    client_error_rate_limit: 'Rate Limited',
    server_error: 'Server Error',
    unknown: 'Unknown Error',
  };
  return names[category] ?? category;
}

/**
 * Get trend arrow for display.
 */
function getTrendArrow(trend: ErrorTrend['trend']): string {
  switch (trend) {
    case 'increasing':
      return '↑';
    case 'decreasing':
      return '↓';
    case 'new':
      return '+';
    case 'resolved':
      return '✓';
    case 'stable':
      return '→';
  }
}

// ==================== Color Helpers ====================

interface Colors {
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  cyan: (s: string) => string;
  dim: (s: string) => string;
}

function getColors(): Colors {
  return {
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  };
}

function getNoColors(): Colors {
  const identity = (s: string) => s;
  return {
    red: identity,
    green: identity,
    yellow: identity,
    cyan: identity,
    dim: identity,
  };
}
