/**
 * External Dependency Detection
 *
 * Detects and categorizes errors from known external services (Plaid, Stripe, AWS, etc.)
 * to distinguish between:
 * - Environment misconfiguration (missing credentials)
 * - External API failures (service down, rate limited)
 * - Actual code bugs
 *
 * This helps users understand whether test failures are due to their MCP server code
 * or external factors beyond their control.
 */

import { EXTERNAL_DEPENDENCIES } from '../constants.js';
import type { ErrorPattern } from './response-fingerprint.js';

// ==================== Types ====================

/** Known external service names */
export type ExternalServiceName = keyof typeof EXTERNAL_DEPENDENCIES.SERVICES;

/** Error source classification */
export type ErrorSource = keyof typeof EXTERNAL_DEPENDENCIES.ERROR_SOURCES;

/** Information about a detected external dependency */
export interface ExternalDependencyInfo {
  /** Name of the external service (e.g., 'plaid', 'stripe') */
  serviceName: ExternalServiceName;
  /** Display name of the service (e.g., 'Plaid', 'Stripe') */
  displayName: string;
  /** Confidence level of the detection (0-1) */
  confidence: number;
  /** Whether this appears to be a transient/temporary error */
  isTransient: boolean;
  /** Suggested remediation for this error */
  remediation: string;
  /** Matched patterns that led to detection */
  matchedPatterns: string[];
}

/** Result of analyzing an error for external dependencies */
export interface ExternalDependencyAnalysis {
  /** The error source classification */
  source: ErrorSource;
  /** Detected external dependency info (if source is 'external_dependency') */
  dependency?: ExternalDependencyInfo;
  /** Whether the error appears transient */
  isTransient: boolean;
  /** Human-readable explanation of the classification */
  explanation: string;
  /** Remediation suggestion */
  remediation?: string;
}

/** Summary of external dependencies across all tools */
export interface ExternalDependencySummary {
  /** Services detected across all tools */
  services: Map<ExternalServiceName, ExternalServiceSummary>;
  /** Total number of external dependency errors */
  totalExternalErrors: number;
  /** Total number of environment configuration errors */
  totalEnvironmentErrors: number;
  /** Total number of likely code bugs */
  totalCodeBugErrors: number;
  /** Total number of unclassified errors */
  totalUnknownErrors: number;
  /** Tools affected by external dependencies */
  affectedTools: Map<string, ExternalServiceName[]>;
}

/** Summary for a single external service */
export interface ExternalServiceSummary {
  /** Display name of the service */
  displayName: string;
  /** Number of errors from this service */
  errorCount: number;
  /** Tools that use this service */
  tools: string[];
  /** Whether errors appear to be transient */
  hasTransientErrors: boolean;
  /** Primary remediation suggestion */
  remediation: string;
}

// ==================== Detection Functions ====================

/**
 * Detect if an error message indicates an external dependency.
 *
 * @param errorMessage - The error message to analyze
 * @param toolName - Optional tool name for context
 * @param toolDescription - Optional tool description for context
 * @returns External dependency info if detected, null otherwise
 */
export function detectExternalDependency(
  errorMessage: string,
  toolName?: string,
  toolDescription?: string
): ExternalDependencyInfo | null {
  const matchedServices: Array<{
    serviceName: ExternalServiceName;
    confidence: number;
    matchedPatterns: string[];
  }> = [];

  // Check each known service
  for (const [serviceName, service] of Object.entries(EXTERNAL_DEPENDENCIES.SERVICES)) {
    let confidence = 0;
    const matchedPatterns: string[] = [];

    // Check error message patterns (highest weight)
    for (const pattern of service.errorPatterns) {
      if (pattern.test(errorMessage)) {
        confidence += 0.5;
        matchedPatterns.push(`error: ${pattern.source}`);
      }
    }

    // Check tool name patterns (medium weight)
    if (toolName) {
      for (const pattern of service.toolPatterns) {
        if (pattern.test(toolName)) {
          confidence += 0.3;
          matchedPatterns.push(`tool: ${pattern.source}`);
        }
      }
    }

    // Check tool description patterns (lower weight)
    if (toolDescription) {
      for (const pattern of service.toolPatterns) {
        if (pattern.test(toolDescription)) {
          confidence += 0.2;
          matchedPatterns.push(`desc: ${pattern.source}`);
        }
      }
    }

    // Check for HTTP status codes in error message
    const statusMatch = errorMessage.match(/status\s*(?:code)?\s*[:\s]?\s*(\d{3})/i);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      if (service.statusCodes.includes(status as (typeof service.statusCodes)[number])) {
        confidence += 0.2;
        matchedPatterns.push(`status: ${status}`);
      }
    }

    if (confidence > 0) {
      matchedServices.push({
        serviceName: serviceName as ExternalServiceName,
        confidence: Math.min(confidence, 1),
        matchedPatterns,
      });
    }
  }

  // Return the highest confidence match
  if (matchedServices.length > 0) {
    const best = matchedServices.sort((a, b) => b.confidence - a.confidence)[0];
    const service = EXTERNAL_DEPENDENCIES.SERVICES[best.serviceName];

    // Check if this is a transient error
    const isTransient = isTransientError(errorMessage);

    return {
      serviceName: best.serviceName,
      displayName: service.name,
      confidence: best.confidence,
      isTransient,
      remediation: service.remediation,
      matchedPatterns: best.matchedPatterns,
    };
  }

  return null;
}

/**
 * Categorize the source of an error.
 *
 * @param errorMessage - The error message to analyze
 * @param toolName - Optional tool name for context
 * @param toolDescription - Optional tool description for context
 * @returns Analysis of the error source
 */
export function categorizeErrorSource(
  errorMessage: string,
  toolName?: string,
  toolDescription?: string
): ExternalDependencyAnalysis {
  // First check for external dependency
  const dependency = detectExternalDependency(errorMessage, toolName, toolDescription);
  if (dependency && dependency.confidence >= 0.4) {
    return {
      source: 'external_dependency',
      dependency,
      isTransient: dependency.isTransient,
      explanation: `Error from external service: ${dependency.displayName}`,
      remediation: dependency.remediation,
    };
  }

  // Check for environment/configuration issues
  for (const pattern of EXTERNAL_DEPENDENCIES.ENVIRONMENT_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return {
        source: 'environment',
        isTransient: false,
        explanation: 'Error appears to be an environment or configuration issue',
        remediation: 'Check environment variables and configuration files',
      };
    }
  }

  // Check for transient errors (could be external but unidentified service)
  if (isTransientError(errorMessage)) {
    return {
      source: dependency ? 'external_dependency' : 'unknown',
      dependency: dependency ?? undefined,
      isTransient: true,
      explanation: 'Error appears to be transient (timeout, connection issue)',
      remediation: 'Consider retrying the operation or checking network connectivity',
    };
  }

  // If we have a low-confidence dependency match, mention it
  if (dependency) {
    return {
      source: 'external_dependency',
      dependency,
      isTransient: false,
      explanation: `Possibly related to external service: ${dependency.displayName}`,
      remediation: dependency.remediation,
    };
  }

  // Check for patterns that suggest a code bug
  const codeBugPatterns = [
    /TypeError/i,
    /ReferenceError/i,
    /SyntaxError/i,
    /undefined is not/i,
    /null is not/i,
    /cannot read propert/i,
    /is not a function/i,
    /is not defined/i,
  ];

  for (const pattern of codeBugPatterns) {
    if (pattern.test(errorMessage)) {
      return {
        source: 'code_bug',
        isTransient: false,
        explanation: 'Error appears to be a code bug',
        remediation: 'Review the MCP server implementation',
      };
    }
  }

  // Unknown source
  return {
    source: 'unknown',
    isTransient: false,
    explanation: 'Could not determine error source',
    remediation: 'Review the error message and MCP server logs',
  };
}

/**
 * Check if an error appears to be transient (temporary).
 *
 * @param errorMessage - The error message to check
 * @returns True if the error appears transient
 */
export function isTransientError(errorMessage: string): boolean {
  for (const pattern of EXTERNAL_DEPENDENCIES.TRANSIENT_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return true;
    }
  }
  return false;
}

/**
 * Analyze multiple error patterns and generate a summary.
 *
 * @param errors - Array of tool names and their error patterns
 * @returns Summary of external dependencies
 */
export function analyzeExternalDependencies(
  errors: Array<{ toolName: string; toolDescription?: string; patterns: ErrorPattern[] }>
): ExternalDependencySummary {
  const services = new Map<ExternalServiceName, ExternalServiceSummary>();
  const affectedTools = new Map<string, ExternalServiceName[]>();
  let totalExternalErrors = 0;
  let totalEnvironmentErrors = 0;
  let totalCodeBugErrors = 0;
  let totalUnknownErrors = 0;

  for (const { toolName, toolDescription, patterns } of errors) {
    const toolServices: ExternalServiceName[] = [];

    for (const pattern of patterns) {
      const analysis = categorizeErrorSource(pattern.example, toolName, toolDescription);

      switch (analysis.source) {
        case 'external_dependency':
          totalExternalErrors += pattern.count;
          if (analysis.dependency) {
            const { serviceName, displayName, isTransient, remediation } = analysis.dependency;
            toolServices.push(serviceName);

            const existing = services.get(serviceName);
            if (existing) {
              existing.errorCount += pattern.count;
              if (!existing.tools.includes(toolName)) {
                existing.tools.push(toolName);
              }
              existing.hasTransientErrors = existing.hasTransientErrors || isTransient;
            } else {
              services.set(serviceName, {
                displayName,
                errorCount: pattern.count,
                tools: [toolName],
                hasTransientErrors: isTransient,
                remediation,
              });
            }
          }
          break;
        case 'environment':
          totalEnvironmentErrors += pattern.count;
          break;
        case 'code_bug':
          totalCodeBugErrors += pattern.count;
          break;
        default:
          totalUnknownErrors += pattern.count;
      }
    }

    if (toolServices.length > 0) {
      // Deduplicate services for this tool
      const uniqueServices = [...new Set(toolServices)];
      affectedTools.set(toolName, uniqueServices);
    }
  }

  return {
    services,
    totalExternalErrors,
    totalEnvironmentErrors,
    totalCodeBugErrors,
    totalUnknownErrors,
    affectedTools,
  };
}

// ==================== Formatting Functions ====================

/**
 * Format external dependency summary for display.
 *
 * @param summary - The summary to format
 * @param useColors - Whether to use ANSI colors
 * @returns Formatted string
 */
export function formatExternalDependencySummary(
  summary: ExternalDependencySummary,
  useColors: boolean = false
): string {
  const lines: string[] = [];
  const { cyan, yellow, dim } = useColors ? getColors() : getNoColors();

  if (summary.services.size === 0) {
    return dim('No external dependencies detected');
  }

  lines.push(cyan('External Dependencies Detected'));
  lines.push('');

  for (const [, service] of summary.services) {
    const transientNote = service.hasTransientErrors ? ' (some errors may be transient)' : '';
    lines.push(`  ${service.displayName}${transientNote}`);
    lines.push(`    ${dim('Errors:')} ${service.errorCount}`);
    lines.push(`    ${dim('Tools:')} ${service.tools.join(', ')}`);
    lines.push(`    ${yellow('Fix:')} ${service.remediation}`);
    lines.push('');
  }

  // Summary counts
  const totalErrors =
    summary.totalExternalErrors +
    summary.totalEnvironmentErrors +
    summary.totalCodeBugErrors +
    summary.totalUnknownErrors;

  lines.push(dim('Error Classification:'));
  lines.push(`  External Services: ${summary.totalExternalErrors}/${totalErrors}`);
  lines.push(`  Environment Issues: ${summary.totalEnvironmentErrors}/${totalErrors}`);
  lines.push(`  Code Bugs: ${summary.totalCodeBugErrors}/${totalErrors}`);
  lines.push(`  Unknown: ${summary.totalUnknownErrors}/${totalErrors}`);

  return lines.join('\n');
}

/**
 * Generate markdown table for external dependencies.
 *
 * @param summary - The summary to format
 * @returns Markdown string
 */
export function formatExternalDependenciesMarkdown(summary: ExternalDependencySummary): string {
  if (summary.services.size === 0) {
    return '';
  }

  const lines: string[] = [];

  lines.push('### External Dependencies Detected');
  lines.push('');
  lines.push('| Service | Errors | Affected Tools | Status | Recommendation |');
  lines.push('|---------|--------|----------------|--------|----------------|');

  for (const [, service] of summary.services) {
    const status = service.hasTransientErrors ? 'Transient' : 'Configuration';
    const tools = service.tools.map((t) => `\`${t}\``).join(', ');
    lines.push(`| ${service.displayName} | ${service.errorCount} | ${tools} | ${status} | ${service.remediation} |`);
  }

  lines.push('');

  // Add error classification summary
  const totalErrors =
    summary.totalExternalErrors +
    summary.totalEnvironmentErrors +
    summary.totalCodeBugErrors +
    summary.totalUnknownErrors;

  if (totalErrors > 0) {
    lines.push('**Error Classification:**');
    lines.push('');
    if (summary.totalExternalErrors > 0) {
      const pct = Math.round((summary.totalExternalErrors / totalErrors) * 100);
      lines.push(`- External Services: ${summary.totalExternalErrors} (${pct}%)`);
    }
    if (summary.totalEnvironmentErrors > 0) {
      const pct = Math.round((summary.totalEnvironmentErrors / totalErrors) * 100);
      lines.push(`- Environment Issues: ${summary.totalEnvironmentErrors} (${pct}%)`);
    }
    if (summary.totalCodeBugErrors > 0) {
      const pct = Math.round((summary.totalCodeBugErrors / totalErrors) * 100);
      lines.push(`- Code Bugs: ${summary.totalCodeBugErrors} (${pct}%)`);
    }
    if (summary.totalUnknownErrors > 0) {
      const pct = Math.round((summary.totalUnknownErrors / totalErrors) * 100);
      lines.push(`- Unclassified: ${summary.totalUnknownErrors} (${pct}%)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ==================== Color Helpers ====================

interface Colors {
  cyan: (s: string) => string;
  yellow: (s: string) => string;
  dim: (s: string) => string;
}

function getColors(): Colors {
  return {
    cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  };
}

function getNoColors(): Colors {
  const identity = (s: string) => s;
  return {
    cyan: identity,
    yellow: identity,
    dim: identity,
  };
}
