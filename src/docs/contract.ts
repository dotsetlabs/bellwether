import type { InterviewResult, ToolProfile, ExternalServiceSummary, StatefulTestingSummary } from '../interview/types.js';
import type { MCPTool } from '../transport/types.js';
import type { SecurityFingerprint, SecurityFinding } from '../security/types.js';
import type { SemanticInference } from '../validation/semantic-types.js';
import type { ResponseSchemaEvolution } from '../baseline/response-schema-tracker.js';
import type { ErrorAnalysisSummary } from '../baseline/error-analyzer.js';
import type { DocumentationScore } from '../baseline/documentation-scorer.js';
import type { WorkflowResult } from '../workflow/types.js';
import type { TransportErrorRecord, DiscoveryWarning } from '../discovery/types.js';
import {
  analyzeDependencies,
  calculateDependencyStats,
  generateDependencyMarkdown,
} from '../baseline/dependency-analyzer.js';
import { getSchemaStabilityGrade } from '../baseline/response-schema-tracker.js';
import { getGradeIndicator } from '../baseline/documentation-scorer.js';
import {
  formatDateISO,
  formatDuration,
  escapeTableCell,
  mermaidLabel,
  validateJsonForCodeBlock,
} from '../utils/index.js';
import { smartTruncate, getExampleLength } from '../utils/smart-truncate.js';
import { calculatePerformanceMetrics, extractParameters, looksLikeError } from './shared.js';
import {
  analyzeExternalDependencies,
  formatExternalDependenciesMarkdown,
  type ExternalDependencySummary,
} from '../baseline/external-dependency-detector.js';
import type { ErrorPattern } from '../baseline/response-fingerprint.js';
import {
  SEMANTIC_VALIDATION,
  SCHEMA_EVOLUTION,
  ERROR_ANALYSIS,
  PERFORMANCE_CONFIDENCE,
  DOCUMENTATION_SCORING,
  EXAMPLE_OUTPUT,
  EXTERNAL_DEPENDENCIES,
  RELIABILITY_DISPLAY,
  CONFIDENCE_INDICATORS,
  DISPLAY_LIMITS,
  ISSUE_CLASSIFICATION,
} from '../constants.js';
import type { PerformanceConfidence, ConfidenceLevel } from '../baseline/types.js';

/**
 * Options for CONTRACT.md generation.
 */
export interface ContractMdOptions {
  /** Security fingerprints from --security testing */
  securityFingerprints?: Map<string, SecurityFingerprint>;
  /** Semantic type inferences per tool */
  semanticInferences?: Map<string, SemanticInference[]>;
  /** Response schema evolution data per tool */
  schemaEvolution?: Map<string, ResponseSchemaEvolution>;
  /** Enhanced error analysis summaries per tool */
  errorAnalysisSummaries?: Map<string, ErrorAnalysisSummary>;
  /** Documentation quality score */
  documentationScore?: DocumentationScore;
  /** Workflow test results from --workflows flag */
  workflowResults?: WorkflowResult[];
  /** Whether to include dependency analysis (auto-generated from tools) */
  includeDependencyAnalysis?: boolean;
  /** Maximum length for example output (characters) */
  exampleLength?: number;
  /** Whether to include full (non-truncated) examples */
  fullExamples?: boolean;
  /** Maximum number of examples per tool */
  maxExamplesPerTool?: number;
  /** Target confidence level for statistical metrics */
  targetConfidence?: ConfidenceLevel;
  /** Count validation rejections as success */
  countValidationAsSuccess?: boolean;
  /** Separate validation metrics from happy-path reliability */
  separateValidationMetrics?: boolean;
}

// ==================== Issue Classification Types ====================

/**
 * Represents a single classified issue from a tool interaction.
 */
interface ClassifiedIssue {
  /** Name of the tool that produced this issue */
  tool: string;
  /** Human-readable description of the issue */
  description: string;
  /** External service name (if classified as external dependency) */
  service?: string;
  /** The error message (if available) */
  error?: string;
  /** Whether this was a critical issue (accepts invalid input) */
  critical?: boolean;
}

/**
 * Issues grouped by their source classification.
 */
interface ClassifiedIssues {
  /** Total number of issues across all categories */
  total: number;
  /** Issues that appear to be server code bugs */
  serverBug: ClassifiedIssue[];
  /** Issues from external service dependencies (Plaid, Stripe, etc.) */
  externalDependency: ClassifiedIssue[];
  /** Issues from missing environment configuration */
  environment: ClassifiedIssue[];
  /** Expected validation rejections (not real bugs) */
  validation: ClassifiedIssue[];
}

/**
 * Classify issues by their source to help users understand which issues
 * are actual bugs vs expected behavior or environment issues.
 *
 * @param profiles - Tool profiles containing interactions and error classifications
 * @returns Classified issues grouped by source
 */
function classifyIssuesBySource(profiles: ToolProfile[]): ClassifiedIssues {
  const result: ClassifiedIssues = {
    total: 0,
    serverBug: [],
    externalDependency: [],
    environment: [],
    validation: [],
  };

  for (const profile of profiles) {
    const errorClassification = profile.errorClassification;
    const detectedServices = errorClassification?.detectedServices ?? [];

    for (const interaction of profile.interactions) {
      // Skip mocked responses
      if (interaction.mocked) {
        continue;
      }

      // Skip correct outcomes (tool behaved as expected)
      if (interaction.outcomeAssessment?.correct) {
        continue;
      }

      // Skip if no outcome assessment exists
      if (!interaction.outcomeAssessment) {
        continue;
      }

      const expected = interaction.outcomeAssessment.expected;
      const actual = interaction.outcomeAssessment.actual;
      const description = interaction.question.description;
      const errorMsg = interaction.error ?? '';

      // Determine issue classification
      const issue: ClassifiedIssue = {
        tool: profile.name,
        description,
        error: errorMsg,
      };

      result.total++;

      // Check if this is a validation test that passed (expected error, got error)
      // but tool didn't actually reject - this shouldn't happen with outcomeAssessment.correct check above
      // so we classify based on expected outcome and error classification

      // 1. Check for external dependency errors (highest priority for classification)
      if (errorClassification && errorClassification.externalServiceErrors > 0 && detectedServices.length > 0) {
        // Check if the error message matches known external service patterns
        const isExternalError = detectedServices.some(service => {
          const serviceConfig = EXTERNAL_DEPENDENCIES.SERVICES[service as keyof typeof EXTERNAL_DEPENDENCIES.SERVICES];
          if (!serviceConfig) return false;
          return serviceConfig.errorPatterns.some(pattern => pattern.test(errorMsg));
        });

        if (isExternalError) {
          issue.service = detectedServices[0];
          result.externalDependency.push(issue);
          continue;
        }
      }

      // 2. Check for environment configuration errors
      if (errorClassification && errorClassification.environmentErrors > 0) {
        const isEnvironmentError = EXTERNAL_DEPENDENCIES.ENVIRONMENT_PATTERNS.some(
          pattern => pattern.test(errorMsg)
        );

        if (isEnvironmentError) {
          result.environment.push(issue);
          continue;
        }
      }

      // 3. Check if this was a validation test (expected error)
      if (expected === 'error') {
        // Tool failed to reject invalid input - this is a validation issue
        // Since outcomeAssessment.correct is false and expected was 'error',
        // the tool actually succeeded when it should have failed
        if (actual === 'success') {
          issue.critical = true;
          result.serverBug.push(issue);
        } else {
          // Tool errored as expected but outcome wasn't marked correct
          // This is unusual - treat as validation
          result.validation.push(issue);
        }
        continue;
      }

      // 4. Check if this is a happy path failure
      if (expected === 'success' && actual === 'error') {
        // Determine if error is from external service
        if (detectedServices.length > 0) {
          issue.service = detectedServices[0];
          result.externalDependency.push(issue);
          continue;
        }

        // Check if error message indicates environment issue
        const isEnvironmentError = EXTERNAL_DEPENDENCIES.ENVIRONMENT_PATTERNS.some(
          pattern => pattern.test(errorMsg)
        );

        if (isEnvironmentError) {
          result.environment.push(issue);
          continue;
        }

        // Default to server bug
        result.serverBug.push(issue);
        continue;
      }

      // 5. Default classification - unexpected outcome
      result.serverBug.push(issue);
    }
  }

  return result;
}

/**
 * Generate CONTRACT.md documentation from check results.
 * Enhanced with examples, error patterns, and performance data.
 * Used by: bellwether check
 */
export function generateContractMd(result: InterviewResult, options?: ContractMdOptions): string {
  const lines: string[] = [];
  const { discovery, toolProfiles, metadata } = result;
  const securityFingerprints = options?.securityFingerprints;
  const semanticInferences = options?.semanticInferences;
  const schemaEvolution = options?.schemaEvolution;
  const errorAnalysisSummaries = options?.errorAnalysisSummaries;
  const documentationScore = options?.documentationScore;
  const workflowResults = options?.workflowResults;
  const countValidationAsSuccess = options?.countValidationAsSuccess ?? true;
  const separateValidationMetrics = options?.separateValidationMetrics ?? true;

  // Example output configuration
  const fullExamples = options?.fullExamples ?? false;
  const exampleLength = getExampleLength(fullExamples, options?.exampleLength);
  const maxExamplesPerTool = options?.maxExamplesPerTool ?? EXAMPLE_OUTPUT.DEFAULT_EXAMPLES_PER_TOOL;
  // targetConfidence is available for future documentation enhancements
  const _targetConfidence = options?.targetConfidence ?? 'low';
  void _targetConfidence; // Suppress unused variable warning

  // Header
  lines.push(`# ${discovery.serverInfo.name}`);
  lines.push('');
  lines.push(`> Generated by [Bellwether](https://github.com/dotsetlabs/bellwether) on ${formatDateISO(metadata.startTime)}`);
  lines.push('');

  // Overview
  lines.push('## Overview');
  lines.push('');
  lines.push(`**Server Version:** ${discovery.serverInfo.version}`);
  lines.push(`**Protocol Version:** ${discovery.protocolVersion}`);
  lines.push('');

  const performanceMetrics = calculatePerformanceMetrics(toolProfiles);
  const performanceByTool = new Map(performanceMetrics.map(metric => [metric.toolName, metric]));

  // Capabilities summary
  lines.push('## Capabilities');
  lines.push('');
  if (discovery.capabilities.tools) {
    lines.push(`- **Tools:** ${discovery.tools.length} available`);
  }
  if (discovery.capabilities.prompts) {
    lines.push(`- **Prompts:** ${discovery.prompts.length} available`);
  }
  if (discovery.capabilities.resources) {
    lines.push(`- **Resources:** ${(discovery.resources ?? []).length} available`);
  }
  if (discovery.capabilities.logging) {
    lines.push('- **Logging:** Supported');
  }
  lines.push('');

  // Quick Reference section with performance data
  if (toolProfiles.length > 0) {
    lines.push('## Quick Reference');
    lines.push('');
    lines.push('| Tool | Parameters | Reliability | P50 | Confidence | Description |');
    lines.push('|------|------------|-------------|-----|------------|-------------|');

    for (const tool of discovery.tools) {
      const params = extractParameters(tool.inputSchema);
      const desc = tool.description?.substring(0, 50) || 'No description';
      const descDisplay = tool.description && tool.description.length > 50 ? desc + '...' : desc;
      const profile = toolProfiles.find(p => p.name === tool.name);
      const perf = performanceByTool.get(tool.name);
      const successRate = calculateToolSuccessRate(profile, {
        countValidationAsSuccess,
        separateValidationMetrics,
      });
      const p50Display = perf ? `${perf.p50Ms}ms` : '-';
      const confidenceDisplay = formatConfidenceIndicator(perf?.confidence?.confidenceLevel);
      lines.push(`| \`${escapeTableCell(tool.name)}\` | ${escapeTableCell(params)} | ${successRate} | ${p50Display} | ${confidenceDisplay} | ${escapeTableCell(descDisplay)} |`);
    }

    lines.push('');
  }

  const legendSection = generateMetricsLegendSection();
  if (legendSection.length > 0) {
    lines.push(...legendSection);
  }

  const validationSection = generateValidationTestingSection(toolProfiles);
  if (validationSection.length > 0) {
    lines.push(...validationSection);
  }

  const issuesSection = generateIssuesDetectedSection(toolProfiles);
  if (issuesSection.length > 0) {
    lines.push(...issuesSection);
  }

  // Transport Issues section (if transport errors were captured)
  const transportIssuesSection = generateTransportIssuesSection(
    discovery.transportErrors,
    discovery.warnings
  );
  if (transportIssuesSection.length > 0) {
    lines.push(...transportIssuesSection);
  }

  // Performance Baseline section
  const perfSection = generateContractPerformanceSection(toolProfiles, performanceMetrics);
  if (perfSection.length > 0) {
    lines.push(...perfSection);
  }

  // Security Baseline section (if security testing was performed)
  if (securityFingerprints && securityFingerprints.size > 0) {
    const securitySection = generateContractSecuritySection(securityFingerprints);
    if (securitySection.length > 0) {
      lines.push(...securitySection);
    }
  }

  // Workflow Testing section (if workflow testing was performed)
  if (workflowResults && workflowResults.length > 0) {
    const workflowSection = generateWorkflowTestingSection(workflowResults);
    if (workflowSection.length > 0) {
      lines.push(...workflowSection);
    }
  }

  // Stateful Testing section (if enabled)
  const statefulSection = generateStatefulTestingSection(toolProfiles, result.metadata.statefulTesting);
  if (statefulSection.length > 0) {
    lines.push(...statefulSection);
  }

  // Dependency Analysis section (auto-generated from tools)
  const includeDependencyAnalysis = options?.includeDependencyAnalysis ?? true;
  if (includeDependencyAnalysis && discovery.tools.length >= 2) {
    const depGraph = analyzeDependencies(discovery.tools);
    if (depGraph.edges.length > 0) {
      const depStats = calculateDependencyStats(depGraph);
      const depSection = generateDependencyMarkdown(depGraph, depStats);
      lines.push(depSection);
    }
  }

  // Semantic Types section (if semantic inferences were discovered)
  if (semanticInferences && semanticInferences.size > 0) {
    const semanticSection = generateSemanticTypesSection(semanticInferences);
    if (semanticSection.length > 0) {
      lines.push(...semanticSection);
    }
  }

  // Schema Stability section (if schema evolution data available)
  if (schemaEvolution && schemaEvolution.size > 0) {
    const schemaStabilitySection = generateSchemaStabilitySection(schemaEvolution);
    if (schemaStabilitySection.length > 0) {
      lines.push(...schemaStabilitySection);
    }
  }

  // Error Analysis section (if error analysis summaries available)
  if (errorAnalysisSummaries && errorAnalysisSummaries.size > 0) {
    const errorAnalysisSection = generateErrorAnalysisSection(errorAnalysisSummaries);
    if (errorAnalysisSection.length > 0) {
      lines.push(...errorAnalysisSection);
    }
  }

  // External Dependencies section - analyze errors for external service patterns
  const externalDepAnalysis = analyzeToolsForExternalDependencies(toolProfiles, discovery.tools);
  if (externalDepAnalysis && externalDepAnalysis.services.size > 0) {
    const externalDepSection = formatExternalDependenciesMarkdown(externalDepAnalysis);
    if (externalDepSection.length > 0) {
      lines.push(externalDepSection);
      lines.push('');
    }
  }

  // External service configuration section (from config handling)
  const externalConfigSection = generateExternalServiceConfigSection(result.metadata.externalServices);
  if (externalConfigSection.length > 0) {
    lines.push(...externalConfigSection);
  }

  // Response Assertions section
  const assertionSection = generateResponseAssertionsSection(toolProfiles);
  if (assertionSection.length > 0) {
    lines.push(...assertionSection);
  }

  // Documentation Quality section (if documentation score available)
  if (documentationScore) {
    const documentationSection = generateDocumentationQualitySection(documentationScore);
    if (documentationSection.length > 0) {
      lines.push(...documentationSection);
    }
  }

  // Tools section with examples and error patterns
  if (discovery.tools.length > 0) {
    lines.push('## Tools');
    lines.push('');

    for (const tool of discovery.tools) {
      const profile = toolProfiles.find(p => p.name === tool.name);

      lines.push(`### ${tool.name}`);
      lines.push('');
      lines.push(tool.description || 'No description available.');
      lines.push('');

      if (profile?.skipped) {
        lines.push(`*Skipped:* ${profile.skipReason ?? 'External service not configured.'}`);
        lines.push('');
      }

      if (profile?.mocked) {
        const serviceLabel = profile.mockService ? ` (${profile.mockService})` : '';
        lines.push(`*Mocked response used${serviceLabel}.*`);
        lines.push('');
      }

      if (profile?.assertionSummary) {
        lines.push(`*Response assertions:* ${profile.assertionSummary.passed}/${profile.assertionSummary.total} passed`);
        const failures = collectAssertionFailures(profile);
        if (failures.length > 0) {
          lines.push('Failed assertions:');
          for (const failure of failures.slice(0, 3)) {
            lines.push(`- ${failure}`);
          }
          if (failures.length > 3) {
            lines.push(`- ... and ${failures.length - 3} more`);
          }
          lines.push('');
        }
      }

      if (tool.inputSchema) {
        lines.push('**Input Schema:**');
        const schemaJson = validateJsonForCodeBlock(tool.inputSchema);
        lines.push('```json');
        lines.push(schemaJson.content);
        lines.push('```');
        lines.push('');
      }

      // Add example usage from successful interactions
      const examples = generateToolExamples(profile, maxExamplesPerTool, exampleLength);
      if (examples.length > 0) {
        lines.push(...examples);
      }

      // Add error patterns if any were observed
      const errorPatterns = generateToolErrorPatterns(profile);
      if (errorPatterns.length > 0) {
        lines.push(...errorPatterns);
      }
    }
  }

  // Prompts section
  if (discovery.prompts.length > 0) {
    lines.push('## Prompts');
    lines.push('');
    for (const prompt of discovery.prompts) {
      lines.push(`### ${prompt.name}`);
      lines.push('');
      if (prompt.description) {
        lines.push(prompt.description);
        lines.push('');
      }
      if (prompt.arguments && prompt.arguments.length > 0) {
        lines.push('**Arguments:**');
        for (const arg of prompt.arguments) {
          const required = arg.required ? ' (required)' : '';
          lines.push(`- \`${arg.name}\`${required}: ${arg.description ?? 'No description'}`);
        }
        lines.push('');
      }
    }
  }

  // Resources section
  if ((discovery.resources ?? []).length > 0) {
    lines.push('## Resources');
    lines.push('');
    for (const resource of discovery.resources ?? []) {
      lines.push(`### ${resource.name}`);
      lines.push('');
      lines.push(`**URI:** \`${resource.uri}\``);
      if (resource.mimeType) {
        lines.push(`**MIME Type:** ${resource.mimeType}`);
      }
      lines.push('');
      if (resource.description) {
        lines.push(resource.description);
        lines.push('');
      }
    }
  }

  // Error Summary section
  const errorSummary = generateErrorSummarySection(toolProfiles);
  if (errorSummary.length > 0) {
    lines.push(...errorSummary);
  }

  // Metadata footer
  lines.push('---');
  lines.push('');
  lines.push(`*Schema validation completed in ${formatDuration(metadata.durationMs)}.*`);

  return lines.join('\n');
}

/**
 * Detailed reliability metrics for a tool.
 */
interface ReliabilityMetrics {
  /** Total interactions */
  total: number;
  /** Happy path tests that succeeded */
  happyPathSuccesses: number;
  /** Happy path tests total */
  happyPathTotal: number;
  /** Validation tests that correctly rejected */
  validationSuccesses: number;
  /** Validation tests total */
  validationTotal: number;
  /** Overall reliability rate (correct outcomes / total) */
  reliabilityRate: number;
  /** Happy path success rate */
  happyPathRate: number;
  /** Validation success rate (correct rejections) */
  validationRate: number;
}

/**
 * Calculate detailed reliability metrics for a tool.
 * Counts correct rejections (validation tests) as successes.
 */
function calculateReliabilityMetrics(
  profile: ToolProfile | undefined,
  options: { countValidationAsSuccess: boolean; separateValidationMetrics: boolean }
): ReliabilityMetrics | null {
  if (!profile) {
    return null;
  }

  const interactions = profile.interactions.filter(i => !i.mocked);
  if (interactions.length === 0) {
    return null;
  }

  let happyPathSuccesses = 0;
  let happyPathTotal = 0;
  let validationSuccesses = 0;
  let validationTotal = 0;

  for (const interaction of interactions) {
    const expected = interaction.question.expectedOutcome ?? 'success';
    const hasError = interaction.error || interaction.response?.isError;
    const textContent = interaction.response?.content?.find(c => c.type === 'text');
    const hasErrorText = textContent && 'text' in textContent && looksLikeError(String(textContent.text));
    const gotError = hasError || hasErrorText;

    if (expected === 'error') {
      // Validation test - error is the expected/correct outcome
      validationTotal++;
      if (gotError) {
        validationSuccesses++; // Correct rejection!
      }
    } else if (expected === 'success') {
      // Happy path test - success is the expected outcome
      happyPathTotal++;
      if (!gotError) {
        happyPathSuccesses++;
      }
    } else {
      // 'either' - counts as success regardless
      happyPathTotal++;
      happyPathSuccesses++; // Either outcome is acceptable
    }
  }

  const total = interactions.length;
  const countedValidationSuccesses = options.countValidationAsSuccess ? validationSuccesses : 0;
  const correctOutcomes = happyPathSuccesses + countedValidationSuccesses;
  const reliabilityRate = total > 0 ? (correctOutcomes / total) * 100 : 0;
  const happyPathRate = happyPathTotal > 0 ? (happyPathSuccesses / happyPathTotal) * 100 : 100;
  const validationRate = options.separateValidationMetrics
    ? (validationTotal > 0 ? (validationSuccesses / validationTotal) * 100 : 100)
    : 100;

  return {
    total,
    happyPathSuccesses,
    happyPathTotal,
    validationSuccesses,
    validationTotal,
    reliabilityRate,
    happyPathRate,
    validationRate,
  };
}

/**
 * Calculate success rate for a tool from its interactions.
 * Now uses reliability metrics that count correct rejections as success.
 */
function calculateToolSuccessRate(
  profile: ToolProfile | undefined,
  options: { countValidationAsSuccess: boolean; separateValidationMetrics: boolean }
): string {
  const metrics = calculateReliabilityMetrics(profile, options);
  if (!metrics) {
    return '-';
  }

  // Use reliability rate (includes correct rejections as success)
  const rate = metrics.reliabilityRate;
  const emoji = rate >= RELIABILITY_DISPLAY.HIGH_THRESHOLD
    ? RELIABILITY_DISPLAY.SYMBOLS.PASS
    : rate >= RELIABILITY_DISPLAY.MEDIUM_THRESHOLD
      ? RELIABILITY_DISPLAY.SYMBOLS.WARN
      : RELIABILITY_DISPLAY.SYMBOLS.FAIL;
  return `${emoji} ${rate.toFixed(0)}%`;
}

function formatConfidenceIndicator(level?: ConfidenceLevel): string {
  if (!level) {
    return '-';
  }

  const indicator = CONFIDENCE_INDICATORS[level];
  return `${indicator} ${level}`;
}

/**
 * Generate Transport Issues section for CONTRACT.md.
 * Documents transport-level errors and warnings from server communication.
 */
function generateTransportIssuesSection(
  transportErrors?: TransportErrorRecord[],
  warnings?: DiscoveryWarning[]
): string[] {
  const lines: string[] = [];

  // Skip if no transport issues to report
  if (
    (!transportErrors || transportErrors.length === 0) &&
    (!warnings || warnings.length === 0)
  ) {
    return lines;
  }

  lines.push('## Transport Issues');
  lines.push('');

  // Discovery warnings first
  if (warnings && warnings.length > 0) {
    lines.push('### Discovery Warnings');
    lines.push('');
    for (const warning of warnings) {
      const icon = warning.level === 'error' ? '🔴' : warning.level === 'warning' ? '🟡' : 'ℹ️';
      lines.push(`${icon} **${warning.level.toUpperCase()}**: ${warning.message}`);
      if (warning.recommendation) {
        lines.push(`  - ${warning.recommendation}`);
      }
    }
    lines.push('');
  }

  // Transport errors
  if (transportErrors && transportErrors.length > 0) {
    lines.push('### Transport Errors');
    lines.push('');
    lines.push('The following transport-level errors were detected during server communication:');
    lines.push('');

    // Categorize errors
    const serverBugErrors = transportErrors.filter(e => e.likelyServerBug);
    const envErrors = transportErrors.filter(e => !e.likelyServerBug);

    // Server bugs (critical)
    if (serverBugErrors.length > 0) {
      lines.push('#### Likely Server Bugs');
      lines.push('');
      lines.push('These errors indicate potential issues in the MCP server implementation:');
      lines.push('');
      lines.push('| Category | Operation | Message |');
      lines.push('|----------|-----------|---------|');
      for (const error of serverBugErrors.slice(0, 10)) {
        const category = formatTransportErrorCategory(error.category);
        const operation = error.operation ?? 'unknown';
        const message = escapeTableCell(error.message);
        lines.push(`| 🔴 ${category} | ${operation} | ${message} |`);
      }
      if (serverBugErrors.length > 10) {
        lines.push(`| ... | ... | ... and ${serverBugErrors.length - 10} more |`);
      }
      lines.push('');
    }

    // Environment/config issues
    if (envErrors.length > 0) {
      lines.push('#### Environment/Configuration Issues');
      lines.push('');
      lines.push('These errors may be caused by environment setup or configuration:');
      lines.push('');
      lines.push('| Category | Operation | Message |');
      lines.push('|----------|-----------|---------|');
      for (const error of envErrors.slice(0, 10)) {
        const category = formatTransportErrorCategory(error.category);
        const operation = error.operation ?? 'unknown';
        const message = escapeTableCell(error.message);
        lines.push(`| 🟡 ${category} | ${operation} | ${message} |`);
      }
      if (envErrors.length > 10) {
        lines.push(`| ... | ... | ... and ${envErrors.length - 10} more |`);
      }
      lines.push('');
    }

    // Recommendations
    const hasInvalidJson = transportErrors.some(e => e.category === 'invalid_json');
    const hasProtocolError = transportErrors.some(e => e.category === 'protocol_violation');

    if (hasInvalidJson || hasProtocolError) {
      lines.push('### Recommendations');
      lines.push('');
      if (hasInvalidJson) {
        lines.push('- **Invalid JSON**: The server may be writing debug output to stdout. Ensure all non-JSON-RPC output goes to stderr.');
      }
      if (hasProtocolError) {
        lines.push('- **Protocol Violation**: Review the MCP specification and ensure all messages conform to the JSON-RPC 2.0 format.');
      }
      lines.push('');
    }
  }

  return lines;
}

/**
 * Format transport error category for display.
 */
function formatTransportErrorCategory(category: string): string {
  switch (category) {
    case 'invalid_json':
      return 'Invalid JSON';
    case 'buffer_overflow':
      return 'Buffer Overflow';
    case 'connection_refused':
      return 'Connection Refused';
    case 'connection_lost':
      return 'Connection Lost';
    case 'protocol_violation':
      return 'Protocol Violation';
    case 'timeout':
      return 'Timeout';
    case 'shutdown_error':
      return 'Shutdown Error';
    default:
      return 'Unknown';
  }
}

function generateMetricsLegendSection(): string[] {
  const lines: string[] = [];
  lines.push('## Metrics Legend');
  lines.push('');
  lines.push('| Symbol | Meaning |');
  lines.push('|--------|---------|');
  lines.push(`| ${RELIABILITY_DISPLAY.SYMBOLS.PASS} | All tests passed as expected |`);
  lines.push(`| ${RELIABILITY_DISPLAY.SYMBOLS.WARN} | Some unexpected behavior |`);
  lines.push(`| ${RELIABILITY_DISPLAY.SYMBOLS.FAIL} | Critical issues detected |`);
  lines.push(`| ${CONFIDENCE_INDICATORS.high} | High confidence in performance metrics |`);
  lines.push(`| ${CONFIDENCE_INDICATORS.medium} | Medium confidence in performance metrics |`);
  lines.push(`| ${CONFIDENCE_INDICATORS.low} | Low confidence in performance metrics |`);
  lines.push('');
  lines.push('**Reliability Score**: Percentage of tests where the tool behaved as expected');
  lines.push('(correct success or correct rejection of invalid input).');
  lines.push('');
  return lines;
}

function generateValidationTestingSection(profiles: ToolProfile[]): string[] {
  const lines: string[] = [];
  const validationSummary = profiles.map(profile => {
    const buckets = {
      input: summarizeValidationBucket(profile, 'input'),
      type: summarizeValidationBucket(profile, 'type'),
      required: summarizeValidationBucket(profile, 'required'),
    };
    return { profile, buckets };
  });

  const hasValidationTests = validationSummary.some(summary =>
    Object.values(summary.buckets).some(bucket => bucket.total > 0)
  );

  if (!hasValidationTests) {
    return lines;
  }

  lines.push('## Validation Testing');
  lines.push('');
  lines.push('| Tool | Input Validation | Type Checking | Required Params |');
  lines.push('|------|------------------|---------------|-----------------|');

  for (const summary of validationSummary) {
    const toolName = escapeTableCell(summary.profile.name);
    const inputStatus = formatValidationStatus(summary.buckets.input);
    const typeStatus = formatValidationStatus(summary.buckets.type);
    const requiredStatus = formatValidationStatus(summary.buckets.required);
    lines.push(`| \`${toolName}\` | ${inputStatus} | ${typeStatus} | ${requiredStatus} |`);
  }

  lines.push('');
  return lines;
}

function generateIssuesDetectedSection(profiles: ToolProfile[]): string[] {
  const lines: string[] = [];
  const classified = classifyIssuesBySource(profiles);

  lines.push('## Issues Detected');
  lines.push('');

  if (classified.total === 0) {
    lines.push(`${RELIABILITY_DISPLAY.SYMBOLS.PASS} No issues detected in validation or happy-path behavior.`);
    lines.push('');
    return lines;
  }

  // Summary table by category
  const hasServerBugs = classified.serverBug.length > 0;
  const hasExternalDeps = classified.externalDependency.length > 0;
  const hasEnvironment = classified.environment.length > 0;
  const hasValidation = classified.validation.length > 0;

  lines.push('| Category | Count | Description |');
  lines.push('|----------|-------|-------------|');

  if (hasServerBugs) {
    lines.push(`| ${ISSUE_CLASSIFICATION.ICONS.serverBug} ${ISSUE_CLASSIFICATION.CATEGORIES.serverBug} | ${classified.serverBug.length} | ${ISSUE_CLASSIFICATION.DESCRIPTIONS.serverBug} |`);
  }
  if (hasExternalDeps) {
    lines.push(`| ${ISSUE_CLASSIFICATION.ICONS.externalDependency} ${ISSUE_CLASSIFICATION.CATEGORIES.externalDependency} | ${classified.externalDependency.length} | ${ISSUE_CLASSIFICATION.DESCRIPTIONS.externalDependency} |`);
  }
  if (hasEnvironment) {
    lines.push(`| ${ISSUE_CLASSIFICATION.ICONS.environment} ${ISSUE_CLASSIFICATION.CATEGORIES.environment} | ${classified.environment.length} | ${ISSUE_CLASSIFICATION.DESCRIPTIONS.environment} |`);
  }
  if (hasValidation) {
    lines.push(`| ${ISSUE_CLASSIFICATION.ICONS.validation} ${ISSUE_CLASSIFICATION.CATEGORIES.validation} | ${classified.validation.length} | ${ISSUE_CLASSIFICATION.DESCRIPTIONS.validation} |`);
  }

  lines.push('');

  // Server bugs section (highest priority - requires fixing)
  if (hasServerBugs) {
    lines.push(`### ${ISSUE_CLASSIFICATION.ICONS.serverBug} ${ISSUE_CLASSIFICATION.HEADERS.serverBug}`);
    lines.push('');

    // Separate critical (accepts invalid input) from other bugs
    const criticalBugs = classified.serverBug.filter(i => i.critical);
    const otherBugs = classified.serverBug.filter(i => !i.critical);

    if (criticalBugs.length > 0) {
      lines.push('**Critical - Accepts Invalid Input:**');
      for (const issue of criticalBugs.slice(0, DISPLAY_LIMITS.ISSUES_DISPLAY_LIMIT)) {
        lines.push(`- \`${escapeTableCell(issue.tool)}\`: ${issue.description}`);
      }
      if (criticalBugs.length > DISPLAY_LIMITS.ISSUES_DISPLAY_LIMIT) {
        lines.push(`- ... ${criticalBugs.length - DISPLAY_LIMITS.ISSUES_DISPLAY_LIMIT} more`);
      }
      lines.push('');
    }

    if (otherBugs.length > 0) {
      if (criticalBugs.length > 0) {
        lines.push('**Other Failures:**');
      }
      for (const issue of otherBugs.slice(0, DISPLAY_LIMITS.ISSUES_DISPLAY_LIMIT)) {
        lines.push(`- \`${escapeTableCell(issue.tool)}\`: ${issue.description}`);
      }
      if (otherBugs.length > DISPLAY_LIMITS.ISSUES_DISPLAY_LIMIT) {
        lines.push(`- ... ${otherBugs.length - DISPLAY_LIMITS.ISSUES_DISPLAY_LIMIT} more`);
      }
      lines.push('');
    }
  }

  // External dependencies section (informational - expected without credentials)
  if (hasExternalDeps) {
    lines.push(`### ${ISSUE_CLASSIFICATION.ICONS.externalDependency} ${ISSUE_CLASSIFICATION.HEADERS.externalDependency}`);
    lines.push('');
    lines.push('These failures are expected when external services are not configured:');
    lines.push('');

    // Group by service for cleaner display
    const byService = new Map<string, ClassifiedIssue[]>();
    for (const issue of classified.externalDependency) {
      const service = issue.service ?? 'Unknown';
      if (!byService.has(service)) {
        byService.set(service, []);
      }
      byService.get(service)!.push(issue);
    }

    for (const [service, issues] of byService) {
      const serviceConfig = EXTERNAL_DEPENDENCIES.SERVICES[service as keyof typeof EXTERNAL_DEPENDENCIES.SERVICES];
      const displayName = serviceConfig?.name ?? service;
      const remediation = serviceConfig?.remediation ?? 'Configure service credentials';

      lines.push(`**${displayName}** (${issues.length} issue${issues.length > 1 ? 's' : ''}):`);
      for (const issue of issues.slice(0, 5)) {
        lines.push(`- \`${escapeTableCell(issue.tool)}\`: ${issue.description}`);
      }
      if (issues.length > 5) {
        lines.push(`- ... ${issues.length - 5} more`);
      }
      lines.push(`- *Remediation: ${remediation}*`);
      lines.push('');
    }
  }

  // Environment configuration section
  if (hasEnvironment) {
    lines.push(`### ${ISSUE_CLASSIFICATION.ICONS.environment} ${ISSUE_CLASSIFICATION.HEADERS.environment}`);
    lines.push('');
    lines.push('Configure these settings to enable full testing:');
    lines.push('');
    for (const issue of classified.environment.slice(0, DISPLAY_LIMITS.ISSUES_DISPLAY_LIMIT)) {
      lines.push(`- \`${escapeTableCell(issue.tool)}\`: ${issue.description}`);
    }
    if (classified.environment.length > DISPLAY_LIMITS.ISSUES_DISPLAY_LIMIT) {
      lines.push(`- ... ${classified.environment.length - DISPLAY_LIMITS.ISSUES_DISPLAY_LIMIT} more`);
    }
    lines.push('');
  }

  // Validation rejections (expected behavior - collapsed by default)
  if (hasValidation) {
    lines.push('<details>');
    lines.push(`<summary>${ISSUE_CLASSIFICATION.ICONS.validation} ${ISSUE_CLASSIFICATION.HEADERS.validation} (${classified.validation.length})</summary>`);
    lines.push('');
    lines.push('These are expected validation errors from invalid input tests:');
    lines.push('');
    for (const issue of classified.validation.slice(0, ISSUE_CLASSIFICATION.MAX_VALIDATION_DISPLAY)) {
      lines.push(`- \`${escapeTableCell(issue.tool)}\`: ${issue.description}`);
    }
    if (classified.validation.length > ISSUE_CLASSIFICATION.MAX_VALIDATION_DISPLAY) {
      lines.push(`- ... ${classified.validation.length - ISSUE_CLASSIFICATION.MAX_VALIDATION_DISPLAY} more`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  return lines;
}

type ValidationBucket = 'input' | 'type' | 'required';

function summarizeValidationBucket(profile: ToolProfile, bucket: ValidationBucket): { total: number; passed: number } {
  let total = 0;
  let passed = 0;

  for (const interaction of profile.interactions) {
    if (interaction.mocked) {
      continue;
    }
    const question = interaction.question;
    if (question.expectedOutcome !== 'error') {
      continue;
    }

    if (classifyValidationBucket(question) !== bucket) {
      continue;
    }

    total += 1;
    if (interaction.outcomeAssessment?.correct) {
      passed += 1;
    }
  }

  return { total, passed };
}

function classifyValidationBucket(question: { description: string; expectedOutcome?: string }): ValidationBucket {
  const description = question.description.toLowerCase();

  if (/missing|required/.test(description)) {
    return 'required';
  }

  if (/type|coercion|format|invalid\s+type/.test(description)) {
    return 'type';
  }

  return 'input';
}

function formatValidationStatus(bucket: { total: number; passed: number }): string {
  if (bucket.total === 0) {
    return '-';
  }

  if (bucket.passed === bucket.total) {
    return `${RELIABILITY_DISPLAY.SYMBOLS.PASS} Pass (${bucket.passed}/${bucket.total})`;
  }

  if (bucket.passed === 0) {
    return `${RELIABILITY_DISPLAY.SYMBOLS.FAIL} Fail (0/${bucket.total})`;
  }

  return `${RELIABILITY_DISPLAY.SYMBOLS.WARN} Partial (${bucket.passed}/${bucket.total})`;
}

/**
 * Generate performance baseline section for CONTRACT.md.
 */
function generateContractPerformanceSection(
  profiles: ToolProfile[],
  metricsOverride?: ReturnType<typeof calculatePerformanceMetrics>
): string[] {
  const lines: string[] = [];
  const metrics = metricsOverride ?? calculatePerformanceMetrics(profiles);

  if (metrics.length === 0) {
    return [];
  }

  // Only show if we have meaningful data
  const hasValidMetrics = metrics.some(m => m.callCount >= 2);
  if (!hasValidMetrics) {
    return [];
  }

  lines.push('## Performance Baseline');
  lines.push('');
  lines.push('Response time metrics observed during schema validation:');
  lines.push('');
  lines.push('| Tool | Calls | P50 | P95 | Happy Path % | Confidence |');
  lines.push('|------|-------|-----|-----|--------------|------------|');

  for (const m of metrics) {
    const successRate = ((1 - m.errorRate) * 100).toFixed(0);
    const successEmoji = m.errorRate < 0.1 ? '✓' : m.errorRate < 0.5 ? '⚠' : '✗';
    const confidenceDisplay = formatConfidenceDisplay(m.confidence);
    // Guard against 0 calls edge case - show N/A for latency metrics
    const p50Display = m.callCount > 0 ? `${m.p50Ms}ms` : 'N/A';
    const p95Display = m.callCount > 0 ? `${m.p95Ms}ms` : 'N/A';
    lines.push(`| \`${escapeTableCell(m.toolName)}\` | ${m.callCount} | ${p50Display} | ${p95Display} | ${successEmoji} ${successRate}% | ${confidenceDisplay} |`);
  }

  lines.push('');

  // Show low confidence warning if any tools have low confidence
  const lowConfidenceTools = metrics.filter(m => m.confidence?.confidenceLevel === 'low');
  if (lowConfidenceTools.length > 0) {
    // Categorize low confidence by reason
    const lowSampleTools = lowConfidenceTools.filter(
      m => (m.confidence?.successfulSamples ?? 0) < PERFORMANCE_CONFIDENCE.HIGH.MIN_SAMPLES
    );
    const highVariabilityTools = lowConfidenceTools.filter(
      m => (m.confidence?.successfulSamples ?? 0) >= PERFORMANCE_CONFIDENCE.HIGH.MIN_SAMPLES &&
           (m.confidence?.coefficientOfVariation ?? 0) > PERFORMANCE_CONFIDENCE.MEDIUM.MAX_CV
    );

    lines.push(`> **⚠️ Low Confidence**: ${lowConfidenceTools.length} tool(s) have low statistical confidence.`);
    if (lowSampleTools.length > 0) {
      lines.push(`> - ${lowSampleTools.length} tool(s) have insufficient happy path samples (need ${PERFORMANCE_CONFIDENCE.HIGH.MIN_SAMPLES}+)`);
    }
    if (highVariabilityTools.length > 0) {
      lines.push(`> - ${highVariabilityTools.length} tool(s) have high response time variability (CV > ${(PERFORMANCE_CONFIDENCE.MEDIUM.MAX_CV * 100).toFixed(0)}%)`);
    }
    lines.push('> Run with `--warmup-runs 3` and `--max-questions 5` for more reliable baselines.');
    lines.push('');
  }

  // Add confidence summary section (collapsed)
  const hasConfidenceData = metrics.some(m => m.confidence);
  if (hasConfidenceData) {
    lines.push('<details>');
    lines.push('<summary>Confidence Metrics Details</summary>');
    lines.push('');
    lines.push('| Tool | Happy Path | Validation | Total | Std Dev | CV | Level |');
    lines.push('|------|------------|------------|-------|---------|-----|-------|');

    for (const m of metrics) {
      if (m.confidence) {
        // Guard against impossible metrics: 0 samples shouldn't have stdDev/CV
        const successfulSamples = m.confidence.successfulSamples ?? m.confidence.sampleCount;
        const validationSamples = m.confidence.validationSamples ?? 0;
        const totalTests = m.confidence.totalTests ?? m.confidence.sampleCount;
        // Use confidence.standardDeviation (from successful samples) for consistency with CV
        const roundedStdDev = Math.round(m.confidence.standardDeviation);
        const stdDevDisplay = successfulSamples > 0 ? `${roundedStdDev}ms` : 'N/A';
        // When stdDev rounds to 0ms, showing high CV is misleading (sub-millisecond noise)
        // In this case, display ~0% to indicate the variability is below measurement threshold
        const rawCV = m.confidence.coefficientOfVariation * 100;
        const cvDisplay = successfulSamples > 0
          ? (roundedStdDev === 0 && rawCV > 1 ? '~0%' : `${rawCV.toFixed(1)}%`)
          : 'N/A';
        const levelLabel = PERFORMANCE_CONFIDENCE.LABELS[m.confidence.confidenceLevel];
        lines.push(
          `| \`${escapeTableCell(m.toolName)}\` | ${successfulSamples} | ${validationSamples} | ${totalTests} | ${stdDevDisplay} | ${cvDisplay} | ${levelLabel} |`
        );
      }
    }

    lines.push('');
    lines.push('**Legend:**');
    lines.push(`- **Happy Path**: Successful tests with expected outcome "success" (used for confidence)`);
    lines.push(`- **Validation**: Tests with expected outcome "error" (not used for performance confidence)`);
    lines.push(`- HIGH: ${PERFORMANCE_CONFIDENCE.HIGH.MIN_SAMPLES}+ happy path samples, CV ≤ ${PERFORMANCE_CONFIDENCE.HIGH.MAX_CV * 100}%`);
    lines.push(`- MEDIUM: ${PERFORMANCE_CONFIDENCE.MEDIUM.MIN_SAMPLES}+ happy path samples, CV ≤ ${PERFORMANCE_CONFIDENCE.MEDIUM.MAX_CV * 100}%`);
    lines.push('- LOW: Insufficient happy path samples or high variability');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  return lines;
}

/**
 * Format confidence for display in table.
 */
function formatConfidenceDisplay(confidence?: PerformanceConfidence): string {
  if (!confidence) {
    return '-';
  }

  const indicator = PERFORMANCE_CONFIDENCE.INDICATORS[confidence.confidenceLevel];
  const label = PERFORMANCE_CONFIDENCE.LABELS[confidence.confidenceLevel];

  return `${indicator} ${label}`;
}

/**
 * Generate Security Baseline section for CONTRACT.md.
 */
function generateContractSecuritySection(fingerprints: Map<string, SecurityFingerprint>): string[] {
  const lines: string[] = [];

  // Collect all findings
  const allFindings: Array<SecurityFinding & { toolName: string }> = [];
  let totalTested = 0;
  let totalRiskScore = 0;

  for (const [toolName, fp] of fingerprints) {
    if (fp.tested) {
      totalTested++;
      totalRiskScore += fp.riskScore;
      for (const finding of fp.findings) {
        allFindings.push({ ...finding, toolName });
      }
    }
  }

  if (totalTested === 0) {
    return [];
  }

  const avgRiskScore = totalTested > 0 ? Math.round(totalRiskScore / totalTested) : 0;

  lines.push('## Security Baseline');
  lines.push('');
  lines.push(`Security testing performed on ${totalTested} tools.`);
  lines.push('');

  // Summary table
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Tools Tested | ${totalTested} |`);
  lines.push(`| Total Findings | ${allFindings.length} |`);
  lines.push(`| Average Risk Score | ${avgRiskScore}/100 |`);

  // Count by severity
  const bySeverity = {
    critical: allFindings.filter(f => f.riskLevel === 'critical').length,
    high: allFindings.filter(f => f.riskLevel === 'high').length,
    medium: allFindings.filter(f => f.riskLevel === 'medium').length,
    low: allFindings.filter(f => f.riskLevel === 'low').length,
    info: allFindings.filter(f => f.riskLevel === 'info').length,
  };

  if (bySeverity.critical > 0) {
    lines.push(`| Critical Findings | ${bySeverity.critical} |`);
  }
  if (bySeverity.high > 0) {
    lines.push(`| High Findings | ${bySeverity.high} |`);
  }
  if (bySeverity.medium > 0) {
    lines.push(`| Medium Findings | ${bySeverity.medium} |`);
  }
  lines.push('');

  // If no findings, show clean status
  if (allFindings.length === 0) {
    lines.push('✅ No security vulnerabilities detected during testing.');
    lines.push('');
    return lines;
  }

  // Show findings by severity
  const criticalAndHigh = allFindings.filter(
    f => f.riskLevel === 'critical' || f.riskLevel === 'high'
  );

  if (criticalAndHigh.length > 0) {
    lines.push('### Critical and High Severity Findings');
    lines.push('');
    lines.push('| Risk | Tool | Finding | CWE |');
    lines.push('|------|------|---------|-----|');

    for (const finding of criticalAndHigh) {
      const riskEmoji = finding.riskLevel === 'critical' ? '🔴' : '🟠';
      lines.push(
        `| ${riskEmoji} ${finding.riskLevel} | \`${escapeTableCell(finding.tool)}\` | ${escapeTableCell(finding.title)} | ${finding.cweId} |`
      );
    }
    lines.push('');

    // Detailed findings
    lines.push('<details>');
    lines.push('<summary>Finding Details</summary>');
    lines.push('');

    for (const finding of criticalAndHigh) {
      lines.push(`#### ${finding.title}`);
      lines.push('');
      lines.push(`**Tool:** \`${finding.tool}\``);
      lines.push(`**Parameter:** \`${finding.parameter}\``);
      lines.push(`**Risk Level:** ${finding.riskLevel.toUpperCase()}`);
      lines.push(`**CWE:** ${finding.cweId}`);
      lines.push('');
      lines.push(finding.description);
      lines.push('');
      lines.push('**Remediation:**');
      lines.push(finding.remediation);
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  // Show medium/low findings in collapsed section
  const mediumAndLow = allFindings.filter(
    f => f.riskLevel === 'medium' || f.riskLevel === 'low' || f.riskLevel === 'info'
  );

  if (mediumAndLow.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Medium/Low Severity Findings (${mediumAndLow.length})</summary>`);
    lines.push('');
    lines.push('| Risk | Tool | Finding | CWE |');
    lines.push('|------|------|---------|-----|');

    for (const finding of mediumAndLow) {
      const riskEmoji = finding.riskLevel === 'medium' ? '🟡' : '🔵';
      lines.push(
        `| ${riskEmoji} ${finding.riskLevel} | \`${escapeTableCell(finding.tool)}\` | ${escapeTableCell(finding.title)} | ${finding.cweId} |`
      );
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Per-tool risk scores
  lines.push('### Tool Risk Scores');
  lines.push('');
  lines.push('| Tool | Risk Score | Findings |');
  lines.push('|------|------------|----------|');

  const toolScores = Array.from(fingerprints.entries())
    .filter(([, fp]) => fp.tested)
    .map(([name, fp]) => ({ name, riskScore: fp.riskScore, findingCount: fp.findings.length }))
    .sort((a, b) => b.riskScore - a.riskScore);

  for (const { name, riskScore, findingCount } of toolScores) {
    const scoreEmoji = riskScore >= 70 ? '🔴' : riskScore >= 40 ? '🟠' : riskScore >= 20 ? '🟡' : '🟢';
    lines.push(`| \`${escapeTableCell(name)}\` | ${scoreEmoji} ${riskScore}/100 | ${findingCount} |`);
  }

  lines.push('');
  return lines;
}

/**
 * Generate Workflow Testing section for CONTRACT.md.
 * Documents workflow test results with step details and data flow.
 */
function generateWorkflowTestingSection(results: WorkflowResult[]): string[] {
  const lines: string[] = [];

  if (results.length === 0) {
    return [];
  }

  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;
  const totalSteps = results.reduce((sum, r) => sum + r.workflow.steps.length, 0);
  const passedSteps = results.reduce((sum, r) => sum + r.steps.filter(s => s.success).length, 0);
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  lines.push('## Workflow Testing');
  lines.push('');
  lines.push('Multi-step workflow tests validate tool chains and state transitions.');
  lines.push('');

  // Summary table
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Workflows | ${results.length} |`);
  lines.push(`| Passed | ${passed} |`);
  lines.push(`| Failed | ${failed} |`);
  lines.push(`| Total Steps | ${totalSteps} |`);
  lines.push(`| Steps Passed | ${passedSteps} |`);
  lines.push(`| Total Duration | ${formatDuration(totalDurationMs)} |`);
  lines.push('');

  // Results table
  lines.push('### Results');
  lines.push('');
  lines.push('| Workflow | Status | Steps | Duration |');
  lines.push('|----------|--------|-------|----------|');

  for (const result of results) {
    const status = result.success ? '✓ Passed' : '✗ Failed';
    const stepsInfo = `${result.steps.filter(s => s.success).length}/${result.workflow.steps.length}`;
    const duration = formatDuration(result.durationMs);
    lines.push(`| ${escapeTableCell(result.workflow.name)} | ${status} | ${stepsInfo} | ${duration} |`);
  }
  lines.push('');

  // Details for each workflow
  for (const result of results) {
    const statusIcon = result.success ? '✓' : '✗';
    lines.push(`### ${statusIcon} ${result.workflow.name}`);
    lines.push('');
    lines.push(`**ID:** \`${result.workflow.id}\``);
    if (result.workflow.description) {
      lines.push(`**Description:** ${result.workflow.description}`);
    }
    lines.push(`**Expected Outcome:** ${result.workflow.expectedOutcome}`);
    lines.push('');

    // Step details table
    lines.push('| Step | Tool | Status | Duration | Notes |');
    lines.push('|------|------|--------|----------|-------|');

    for (let i = 0; i < result.steps.length; i++) {
      const stepResult = result.steps[i];
      const step = result.workflow.steps[i];
      const stepNum = i + 1;
      const status = stepResult.success ? '✓ Pass' : '✗ Fail';
      const duration = formatDuration(stepResult.durationMs);

      let notes = '';
      if (!stepResult.success) {
        if (stepResult.error) {
          notes = escapeTableCell(truncateString(stepResult.error, 40));
        } else if (stepResult.assertionResults?.some(a => !a.passed)) {
          const failedAssertions = stepResult.assertionResults.filter(a => !a.passed);
          notes = `${failedAssertions.length} assertion(s) failed`;
        }
      } else if (step.optional) {
        notes = '(optional)';
      }

      lines.push(`| ${stepNum} | \`${escapeTableCell(step.tool)}\` | ${status} | ${duration} | ${notes} |`);
    }
    lines.push('');

    // Show failure details if any
    if (!result.success && result.failureReason) {
      lines.push('**Failure:**');
      lines.push(`> ${result.failureReason}`);
      lines.push('');
    }

    // Show data flow if present
    if (result.dataFlow && result.dataFlow.length > 0) {
      lines.push('<details>');
      lines.push('<summary>Data Flow</summary>');
      lines.push('');
      lines.push('```mermaid');
      lines.push('graph LR');
      for (const edge of result.dataFlow) {
        const fromLabel = mermaidLabel(`Step ${edge.fromStep + 1}`);
        const toLabel = mermaidLabel(`Step ${edge.toStep + 1}`);
        const edgeLabel = mermaidLabel(edge.targetParam);
        lines.push(`  ${fromLabel} -->|${edgeLabel}| ${toLabel}`);
      }
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    // Show state changes if present
    if (result.stateTracking?.changes && result.stateTracking.changes.length > 0) {
      lines.push('<details>');
      lines.push('<summary>State Changes</summary>');
      lines.push('');
      lines.push('| Step | Type | Path |');
      lines.push('|------|------|------|');
      for (const change of result.stateTracking.changes) {
        lines.push(`| ${change.causedByStep + 1} | ${change.type} | \`${escapeTableCell(change.path)}\` |`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  return lines;
}

/**
 * Truncate a string to a maximum length with ellipsis.
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Generate Semantic Types section for CONTRACT.md.
 * Documents inferred semantic types for parameters across all tools.
 */
function generateSemanticTypesSection(inferences: Map<string, SemanticInference[]>): string[] {
  const lines: string[] = [];

  // Collect all inferences with high confidence
  const allInferences: Array<SemanticInference & { toolName: string }> = [];

  for (const [toolName, toolInferences] of inferences) {
    for (const inference of toolInferences) {
      if (inference.confidence >= 0.5 && inference.inferredType !== 'unknown') {
        allInferences.push({ ...inference, toolName });
      }
    }
  }

  if (allInferences.length === 0) {
    return [];
  }

  lines.push('## Semantic Types');
  lines.push('');
  lines.push('Parameters with inferred semantic types for enhanced validation:');
  lines.push('');

  // Group by semantic type
  const byType = new Map<string, Array<{ toolName: string; paramName: string; confidence: number }>>();

  for (const inf of allInferences) {
    const existing = byType.get(inf.inferredType) ?? [];
    existing.push({
      toolName: inf.toolName,
      paramName: inf.paramName,
      confidence: inf.confidence,
    });
    byType.set(inf.inferredType, existing);
  }

  // Sort by number of parameters (most common types first)
  const sortedTypes = Array.from(byType.entries())
    .sort((a, b) => b[1].length - a[1].length);

  lines.push('| Type | Parameters | Expected Format |');
  lines.push('|------|------------|-----------------|');

  for (const [type, params] of sortedTypes) {
    const displayName = SEMANTIC_VALIDATION.TYPE_DISPLAY_NAMES[type as keyof typeof SEMANTIC_VALIDATION.TYPE_DISPLAY_NAMES] ?? type;
    const exampleValue = SEMANTIC_VALIDATION.EXAMPLE_VALUES[type as keyof typeof SEMANTIC_VALIDATION.EXAMPLE_VALUES] ?? '';

    // Format parameters as tool.param
    const paramList = params
      .slice(0, 3)
      .map(p => `\`${p.toolName}.${p.paramName}\``)
      .join(', ');
    const moreCount = params.length > 3 ? ` +${params.length - 3} more` : '';

    lines.push(`| ${displayName} | ${paramList}${moreCount} | \`${exampleValue}\` |`);
  }

  lines.push('');

  // Detailed list (collapsed)
  if (allInferences.length > 5) {
    lines.push('<details>');
    lines.push('<summary>All Inferred Semantic Types</summary>');
    lines.push('');
  }

  // Group by tool
  const byTool = new Map<string, SemanticInference[]>();
  for (const inf of allInferences) {
    const existing = byTool.get(inf.toolName) ?? [];
    existing.push(inf);
    byTool.set(inf.toolName, existing);
  }

  for (const [toolName, toolInferences] of byTool) {
    lines.push(`### ${toolName}`);
    lines.push('');
    lines.push('| Parameter | Type | Confidence |');
    lines.push('|-----------|------|------------|');

    for (const inf of toolInferences) {
      const displayName = SEMANTIC_VALIDATION.TYPE_DISPLAY_NAMES[inf.inferredType as keyof typeof SEMANTIC_VALIDATION.TYPE_DISPLAY_NAMES] ?? inf.inferredType;
      const confidenceDisplay = `${Math.round(inf.confidence * 100)}%`;
      lines.push(`| \`${escapeTableCell(inf.paramName)}\` | ${displayName} | ${confidenceDisplay} |`);
    }
    lines.push('');
  }

  if (allInferences.length > 5) {
    lines.push('</details>');
    lines.push('');
  }

  return lines;
}

/**
 * Generate Schema Stability section for CONTRACT.md.
 * Documents response schema consistency and stability across tools.
 */
function generateSchemaStabilitySection(schemaEvolution: Map<string, ResponseSchemaEvolution>): string[] {
  const lines: string[] = [];

  // Collect tools with meaningful schema data
  const toolsWithSchemas: Array<{
    name: string;
    evolution: ResponseSchemaEvolution;
    grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A';
  }> = [];

  for (const [toolName, evolution] of schemaEvolution) {
    if (evolution.sampleCount > 0) {
      const grade = getSchemaStabilityGrade(evolution);
      toolsWithSchemas.push({ name: toolName, evolution, grade });
    }
  }

  if (toolsWithSchemas.length === 0) {
    return [];
  }

  lines.push('## Schema Stability');
  lines.push('');
  lines.push('Response schema consistency metrics for tools with sufficient test samples:');
  lines.push('');

  // Summary stats
  const stableCount = toolsWithSchemas.filter(t => t.evolution.isStable).length;
  const unstableCount = toolsWithSchemas.length - stableCount;
  const avgConfidence = toolsWithSchemas.reduce((sum, t) => sum + t.evolution.stabilityConfidence, 0) / toolsWithSchemas.length;

  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Tools Analyzed | ${toolsWithSchemas.length} |`);
  lines.push(`| Stable Schemas | ${stableCount} |`);
  lines.push(`| Unstable Schemas | ${unstableCount} |`);
  lines.push(`| Avg Confidence | ${Math.round(avgConfidence * 100)}% |`);
  lines.push('');

  // Overall status
  if (stableCount === toolsWithSchemas.length) {
    lines.push('✅ All tested tools have consistent response schemas.');
    lines.push('');
  } else if (unstableCount > 0) {
    lines.push(`⚠️ ${unstableCount} tool(s) have inconsistent response schemas.`);
    lines.push('');
  }

  // Per-tool table
  lines.push('| Tool | Grade | Stability | Confidence | Samples | Issues |');
  lines.push('|------|-------|-----------|------------|---------|--------|');

  // Sort by grade (worst first, then by name)
  const gradeOrder: Record<string, number> = { 'F': 0, 'D': 1, 'C': 2, 'B': 3, 'A': 4, 'N/A': 5 };
  const sortedTools = [...toolsWithSchemas].sort((a, b) => {
    const gradeCompare = gradeOrder[a.grade] - gradeOrder[b.grade];
    if (gradeCompare !== 0) return gradeCompare;
    return a.name.localeCompare(b.name);
  });

  for (const { name, evolution, grade } of sortedTools) {
    const gradeEmoji = getGradeEmoji(grade);
    const stabilityStatus = evolution.isStable
      ? SCHEMA_EVOLUTION.STABILITY_LABELS.STABLE
      : SCHEMA_EVOLUTION.STABILITY_LABELS.UNSTABLE;
    const confidenceDisplay = `${Math.round(evolution.stabilityConfidence * 100)}%`;
    const issues = evolution.inconsistentFields.length > 0
      ? evolution.inconsistentFields.slice(0, 2).join(', ') +
        (evolution.inconsistentFields.length > 2 ? ` +${evolution.inconsistentFields.length - 2}` : '')
      : '-';

    lines.push(
      `| \`${escapeTableCell(name)}\` | ${gradeEmoji} ${grade} | ${stabilityStatus} | ${confidenceDisplay} | ${evolution.sampleCount} | ${escapeTableCell(issues)} |`
    );
  }

  lines.push('');

  // Detailed breakdown for unstable tools
  const unstableTools = sortedTools.filter(t => !t.evolution.isStable && t.evolution.inconsistentFields.length > 0);
  if (unstableTools.length > 0) {
    lines.push('<details>');
    lines.push('<summary>Unstable Schema Details</summary>');
    lines.push('');

    for (const { name, evolution } of unstableTools) {
      lines.push(`### ${name}`);
      lines.push('');
      lines.push(`**Inconsistent Fields:** ${evolution.inconsistentFields.join(', ')}`);
      lines.push('');
      lines.push('These fields appear inconsistently across responses, indicating the tool may return');
      lines.push('different structures depending on input or state.');
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  // Grade legend
  lines.push('<details>');
  lines.push('<summary>Grade Legend</summary>');
  lines.push('');
  lines.push(`- **A**: ${SCHEMA_EVOLUTION.GRADE_THRESHOLDS.A * 100}%+ stability confidence`);
  lines.push(`- **B**: ${SCHEMA_EVOLUTION.GRADE_THRESHOLDS.B * 100}%+ stability confidence`);
  lines.push(`- **C**: ${SCHEMA_EVOLUTION.GRADE_THRESHOLDS.C * 100}%+ stability confidence`);
  lines.push(`- **D**: ${SCHEMA_EVOLUTION.GRADE_THRESHOLDS.D * 100}%+ stability confidence`);
  lines.push('- **F**: Below minimum threshold');
  lines.push(`- **N/A**: Insufficient samples (< ${SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY})`);
  lines.push('');
  lines.push('</details>');
  lines.push('');

  return lines;
}

/**
 * Get emoji for stability grade.
 */
function getGradeEmoji(grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A'): string {
  switch (grade) {
    case 'A': return '🟢';
    case 'B': return '🟢';
    case 'C': return '🟡';
    case 'D': return '🟠';
    case 'F': return '🔴';
    case 'N/A': return '⚪';
  }
}

/**
 * Generate Error Analysis section for CONTRACT.md.
 * Documents enhanced error analysis with root causes and remediations.
 */
function generateErrorAnalysisSection(summaries: Map<string, ErrorAnalysisSummary>): string[] {
  const lines: string[] = [];

  // Collect tools with errors
  const toolsWithErrors: Array<{
    name: string;
    summary: ErrorAnalysisSummary;
  }> = [];

  for (const [toolName, summary] of summaries) {
    if (summary.totalErrors > 0) {
      toolsWithErrors.push({ name: toolName, summary });
    }
  }

  if (toolsWithErrors.length === 0) {
    return [];
  }

  lines.push('## Error Analysis');
  lines.push('');
  lines.push('Enhanced error analysis with root causes and remediation suggestions:');
  lines.push('');

  // Summary stats
  const totalErrors = toolsWithErrors.reduce((sum, t) => sum + t.summary.totalErrors, 0);
  const allCategories = new Set<string>();
  const transientCount = toolsWithErrors.reduce((sum, t) => sum + t.summary.transientErrors, 0);

  for (const { summary } of toolsWithErrors) {
    for (const cat of summary.categoryCounts.keys()) {
      allCategories.add(cat);
    }
  }

  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Tools with Errors | ${toolsWithErrors.length} |`);
  lines.push(`| Total Errors | ${totalErrors} |`);
  lines.push(`| Error Categories | ${allCategories.size} |`);
  lines.push(`| Transient Errors | ${transientCount} |`);
  lines.push('');

  // Overall error breakdown by category
  const globalCategoryCounts = new Map<string, number>();
  for (const { summary } of toolsWithErrors) {
    for (const [cat, count] of summary.categoryCounts) {
      globalCategoryCounts.set(cat, (globalCategoryCounts.get(cat) ?? 0) + count);
    }
  }

  if (globalCategoryCounts.size > 0) {
    lines.push('### Error Categories');
    lines.push('');
    lines.push('| Category | Count | Description |');
    lines.push('|----------|-------|-------------|');

    // Sort by count descending
    const sortedCategories = Array.from(globalCategoryCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    for (const [category, count] of sortedCategories) {
      const label = ERROR_ANALYSIS.CATEGORY_LABELS[category as keyof typeof ERROR_ANALYSIS.CATEGORY_LABELS] ?? category;
      const emoji = getCategoryEmoji(category);
      lines.push(`| ${emoji} ${label} | ${count} | ${escapeTableCell(formatCategoryDescription(category))} |`);
    }
    lines.push('');
  }

  // Per-tool breakdown
  lines.push('### By Tool');
  lines.push('');
  lines.push('| Tool | Total | Transient | Top Category | Remediation |');
  lines.push('|------|-------|-----------|--------------|-------------|');

  // Sort by error count descending
  const sortedTools = [...toolsWithErrors].sort((a, b) => b.summary.totalErrors - a.summary.totalErrors);

  for (const { name, summary } of sortedTools) {
    const topCategory = getTopCategory(summary.categoryCounts);
    const topCategoryLabel = topCategory
      ? (ERROR_ANALYSIS.CATEGORY_LABELS[topCategory as keyof typeof ERROR_ANALYSIS.CATEGORY_LABELS] ?? topCategory)
      : '-';
    const topRemediation = summary.topRemediations[0] ?? '-';
    const truncatedRemediation = topRemediation.length > 50
      ? topRemediation.slice(0, 47) + '...'
      : topRemediation;

    lines.push(
      `| \`${escapeTableCell(name)}\` | ${summary.totalErrors} | ${summary.transientErrors} | ${topCategoryLabel} | ${escapeTableCell(truncatedRemediation)} |`
    );
  }
  lines.push('');

  // Detailed remediation suggestions (collapsed)
  const toolsWithRemediations = sortedTools.filter(t => t.summary.topRemediations.length > 0);
  if (toolsWithRemediations.length > 0) {
    lines.push('<details>');
    lines.push('<summary>Remediation Suggestions</summary>');
    lines.push('');

    for (const { name, summary } of toolsWithRemediations.slice(0, ERROR_ANALYSIS.MAX_REMEDIATIONS_DISPLAY)) {
      lines.push(`### ${name}`);
      lines.push('');

      if (summary.topRootCauses.length > 0) {
        lines.push('**Root Causes:**');
        for (const cause of summary.topRootCauses) {
          lines.push(`- ${cause}`);
        }
        lines.push('');
      }

      if (summary.topRemediations.length > 0) {
        lines.push('**Suggested Remediations:**');
        for (const remediation of summary.topRemediations) {
          lines.push(`- ${remediation}`);
        }
        lines.push('');
      }

      if (summary.relatedParameters.length > 0) {
        lines.push(`**Related Parameters:** ${summary.relatedParameters.join(', ')}`);
        lines.push('');
      }
    }

    lines.push('</details>');
    lines.push('');
  }

  // Category legend
  lines.push('<details>');
  lines.push('<summary>Category Legend</summary>');
  lines.push('');
  lines.push('- **Validation Error (400)**: Client sent invalid input that failed validation');
  lines.push('- **Authentication Error (401)**: Missing or invalid authentication credentials');
  lines.push('- **Not Found (404)**: Requested resource does not exist');
  lines.push('- **Conflict (409)**: Request conflicts with current state');
  lines.push('- **Rate Limited (429)**: Too many requests, retry after delay');
  lines.push('- **Server Error (5xx)**: Internal server error, may be transient');
  lines.push('');
  lines.push('</details>');
  lines.push('');

  return lines;
}

/**
 * Get emoji for error category.
 */
function getCategoryEmoji(category: string): string {
  switch (category) {
    case 'client_error_validation': return '⚠️';
    case 'client_error_auth': return '🔐';
    case 'client_error_not_found': return '🔍';
    case 'client_error_conflict': return '💥';
    case 'client_error_rate_limit': return '⏱️';
    case 'server_error': return '🔥';
    default: return '❓';
  }
}

/**
 * Get human-readable description for error category.
 */
function formatCategoryDescription(category: string): string {
  switch (category) {
    case 'client_error_validation':
      return 'Invalid input or missing required parameters';
    case 'client_error_auth':
      return 'Authentication or authorization failure';
    case 'client_error_not_found':
      return 'Resource not found or does not exist';
    case 'client_error_conflict':
      return 'Conflict with current resource state';
    case 'client_error_rate_limit':
      return 'Rate limit exceeded, retry after delay';
    case 'server_error':
      return 'Internal server error, may be transient';
    default:
      return 'Unknown error category';
  }
}

/**
 * Get the top category from a category counts map.
 */
function getTopCategory(counts: Map<string, number>): string | undefined {
  let topCategory: string | undefined;
  let topCount = 0;

  for (const [category, count] of counts) {
    if (count > topCount) {
      topCount = count;
      topCategory = category;
    }
  }

  return topCategory;
}

/**
 * Generate documentation quality section for CONTRACT.md.
 */
function generateDocumentationQualitySection(score: DocumentationScore): string[] {
  const lines: string[] = [];

  lines.push('## Documentation Quality');
  lines.push('');

  // Overall score with grade badge
  const indicator = getGradeIndicator(score.grade);
  lines.push(`**Overall Score:** ${indicator} ${score.overallScore}/100 (${score.grade})`);
  lines.push('');

  // Component breakdown table
  lines.push('### Score Components');
  lines.push('');
  lines.push('| Component | Score | Weight |');
  lines.push('|-----------|-------|--------|');

  const weights = DOCUMENTATION_SCORING.WEIGHTS;
  lines.push(`| Description Coverage | ${score.components.descriptionCoverage}% | ${(weights.descriptionCoverage * 100).toFixed(0)}% |`);
  lines.push(`| Description Quality | ${score.components.descriptionQuality}% | ${(weights.descriptionQuality * 100).toFixed(0)}% |`);
  lines.push(`| Parameter Documentation | ${score.components.parameterDocumentation}% | ${(weights.parameterDocumentation * 100).toFixed(0)}% |`);
  lines.push(`| Example Coverage | ${score.components.exampleCoverage}% | ${(weights.exampleCoverage * 100).toFixed(0)}% |`);
  lines.push('');

  // Issues by type (if any)
  if (score.issues.length > 0) {
    lines.push('### Issues');
    lines.push('');

    // Group issues by type
    const issuesByType = new Map<string, typeof score.issues>();
    for (const issue of score.issues) {
      const existing = issuesByType.get(issue.type) ?? [];
      existing.push(issue);
      issuesByType.set(issue.type, existing);
    }

    // Create issues table
    lines.push('| Issue Type | Count | Severity |');
    lines.push('|------------|-------|----------|');

    for (const [type, issues] of issuesByType) {
      const severityLabel = issues[0].severity;
      const severityEmoji = severityLabel === 'error' ? '🔴' : severityLabel === 'warning' ? '🟡' : '🔵';
      const typeLabel = formatIssueTypeLabel(type);
      lines.push(`| ${typeLabel} | ${issues.length} | ${severityEmoji} ${severityLabel} |`);
    }
    lines.push('');

    // Show specific issues in collapsible section
    if (score.issues.length <= 10) {
      lines.push('<details>');
      lines.push('<summary>Issue Details</summary>');
      lines.push('');

      for (const issue of score.issues) {
        lines.push(`- **${issue.tool}**: ${issue.message}`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  // Suggestions (if any)
  if (score.suggestions.length > 0) {
    lines.push('### Improvement Suggestions');
    lines.push('');
    for (const suggestion of score.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push('');
  }

  // Grade thresholds reference
  lines.push('<details>');
  lines.push('<summary>Grade Thresholds</summary>');
  lines.push('');
  const thresholds = DOCUMENTATION_SCORING.GRADE_THRESHOLDS;
  lines.push(`- **A**: ${thresholds.A}+`);
  lines.push(`- **B**: ${thresholds.B}-${thresholds.A - 1}`);
  lines.push(`- **C**: ${thresholds.C}-${thresholds.B - 1}`);
  lines.push(`- **D**: ${thresholds.D}-${thresholds.C - 1}`);
  lines.push(`- **F**: Below ${thresholds.D}`);
  lines.push('');
  lines.push('</details>');
  lines.push('');

  return lines;
}

/**
 * Format issue type label for display.
 */
function formatIssueTypeLabel(type: string): string {
  switch (type) {
    case 'missing_description':
      return 'Missing Description';
    case 'short_description':
      return 'Short Description';
    case 'missing_param_description':
      return 'Missing Parameter Description';
    case 'no_examples':
      return 'No Examples';
    default:
      return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}

/**
 * Generate example usage for a tool from successful interactions.
 *
 * @param profile - Tool profile with interactions
 * @param maxExamples - Maximum number of examples to include
 * @param maxExampleLength - Maximum length for each example response (uses smart truncation)
 */
function generateToolExamples(
  profile: ToolProfile | undefined,
  maxExamples: number,
  maxExampleLength: number = EXAMPLE_OUTPUT.DEFAULT_LENGTH
): string[] {
  const lines: string[] = [];

  if (!profile || profile.interactions.length === 0) {
    return [];
  }

  // Find successful interactions
  const successful = profile.interactions.filter(i => {
    if (i.error || i.response?.isError) return false;
    const textContent = i.response?.content?.find(c => c.type === 'text');
    if (textContent && 'text' in textContent) {
      if (looksLikeError(String(textContent.text))) return false;
    }
    return true;
  });

  if (successful.length === 0) {
    return [];
  }

  // Take up to maxExamples unique examples (by different args)
  const examples: Array<{ args: Record<string, unknown>; response: string; wasTruncated: boolean }> = [];
  const seenArgsHashes = new Set<string>();

  for (const interaction of successful) {
    if (examples.length >= maxExamples) break;

    const argsHash = JSON.stringify(interaction.question.args);
    if (seenArgsHashes.has(argsHash)) continue;
    seenArgsHashes.add(argsHash);

    const textContent = interaction.response?.content?.find(c => c.type === 'text');
    if (!textContent || !('text' in textContent)) continue;

    const responseText = String(textContent.text);
    if (responseText.length === 0) continue;

    // Use smart truncation to preserve structure
    const truncated = smartTruncate(responseText, { maxLength: maxExampleLength });

    examples.push({
      args: interaction.question.args,
      response: truncated.content,
      wasTruncated: truncated.wasTruncated,
    });
  }

  if (examples.length === 0) {
    return [];
  }

  lines.push(`**Example${examples.length > 1 ? 's' : ''}:**`);
  lines.push('');

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    if (examples.length > 1) {
      lines.push(`*Example ${i + 1}:*`);
    }

    // Show input
    lines.push('Input:');
    const inputJson = validateJsonForCodeBlock(example.args);
    lines.push('```json');
    lines.push(inputJson.content);
    lines.push('```');

    // Show output (with truncation note if applicable)
    const outputLabel = example.wasTruncated ? 'Output (truncated):' : 'Output:';
    lines.push(outputLabel);
    const outputJson = validateJsonForCodeBlock(example.response);
    lines.push('```');
    lines.push(outputJson.content);
    lines.push('```');
    lines.push('');
  }

  return lines;
}

/**
 * Generate error patterns section for a tool.
 */
function generateToolErrorPatterns(profile: ToolProfile | undefined): string[] {
  const lines: string[] = [];

  if (!profile || profile.interactions.length === 0) {
    return [];
  }

  // Categorize errors
  const errorCategories: Map<string, string[]> = new Map();

  for (const interaction of profile.interactions) {
    if (interaction.mocked) {
      continue;
    }
    const errorText = interaction.error || '';
    const textContent = interaction.response?.content?.find(c => c.type === 'text');
    const responseText = textContent && 'text' in textContent ? String(textContent.text) : '';

    const isError = interaction.error || interaction.response?.isError || looksLikeError(responseText);
    if (!isError) continue;

    const errorContent = errorText || responseText;
    if (!errorContent) continue;

    const category = categorizeError(errorContent);
    const existing = errorCategories.get(category) || [];
    if (existing.length < 2) { // Max 2 examples per category
      const truncated = errorContent.length > 100 ? errorContent.slice(0, 97) + '...' : errorContent;
      existing.push(truncated);
    }
    errorCategories.set(category, existing);
  }

  if (errorCategories.size === 0) {
    return [];
  }

  lines.push('**Error Patterns:**');
  lines.push('');

  for (const [category, examples] of errorCategories) {
    lines.push(`- **${category}**: ${examples[0]}`);
  }

  lines.push('');
  return lines;
}

/**
 * Categorize an error message.
 */
function categorizeError(errorText: string): string {
  const lower = errorText.toLowerCase();

  if (/permission|denied|not allowed|forbidden|unauthorized/i.test(lower)) {
    return 'Permission';
  }
  if (/not found|does not exist|no such|cannot find|missing/i.test(lower)) {
    return 'NotFound';
  }
  if (/invalid|validation|required|must be|expected|type error/i.test(lower)) {
    return 'Validation';
  }
  if (/timeout|timed out|deadline/i.test(lower)) {
    return 'Timeout';
  }
  if (/connect|network|econnrefused|socket/i.test(lower)) {
    return 'Network';
  }
  return 'Other';
}

/**
 * Generate error summary section aggregating errors across all tools.
 */
function generateErrorSummarySection(profiles: ToolProfile[]): string[] {
  const lines: string[] = [];

  // Count errors by category across all tools
  const categoryCounts: Map<string, { count: number; tools: Set<string>; example: string }> = new Map();

  for (const profile of profiles) {
    for (const interaction of profile.interactions) {
      if (interaction.mocked) {
        continue;
      }
      const errorText = interaction.error || '';
      const textContent = interaction.response?.content?.find(c => c.type === 'text');
      const responseText = textContent && 'text' in textContent ? String(textContent.text) : '';

      const isError = interaction.error || interaction.response?.isError || looksLikeError(responseText);
      if (!isError) continue;

      const errorContent = errorText || responseText;
      if (!errorContent) continue;

      const category = categorizeError(errorContent);
      const existing = categoryCounts.get(category) || { count: 0, tools: new Set(), example: '' };
      existing.count++;
      existing.tools.add(profile.name);
      if (!existing.example) {
        existing.example = errorContent.length > 80 ? errorContent.slice(0, 77) + '...' : errorContent;
      }
      categoryCounts.set(category, existing);
    }
  }

  if (categoryCounts.size === 0) {
    return [];
  }

  lines.push('## Error Patterns Summary');
  lines.push('');
  lines.push('Errors observed during schema validation:');
  lines.push('');
  lines.push('| Category | Count | Affected Tools |');
  lines.push('|----------|-------|----------------|');

  for (const [category, data] of categoryCounts) {
    const toolList = Array.from(data.tools).slice(0, 3).map(t => `\`${t}\``).join(', ');
    const more = data.tools.size > 3 ? ` +${data.tools.size - 3} more` : '';
    lines.push(`| ${category} | ${data.count} | ${toolList}${more} |`);
  }

  lines.push('');
  return lines;
}

/**
 * Analyze tool profiles for external dependency errors.
 *
 * Extracts error patterns from tool interactions and analyzes them
 * to detect errors from known external services (Plaid, Stripe, AWS, etc.)
 *
 * @param profiles - Tool profiles with interaction data
 * @param tools - MCPTool definitions for description context
 * @returns External dependency summary or null if no significant external deps
 */
function analyzeToolsForExternalDependencies(
  profiles: ToolProfile[],
  tools: MCPTool[]
): ExternalDependencySummary | null {
  const errorInputs: Array<{
    toolName: string;
    toolDescription?: string;
    patterns: ErrorPattern[];
  }> = [];

  for (const profile of profiles) {
    const patterns: ErrorPattern[] = [];
    const patternCounts = new Map<string, { count: number; example: string }>();

    for (const interaction of profile.interactions) {
      if (interaction.mocked) {
        continue;
      }
      const errorText = interaction.error || '';
      const textContent = interaction.response?.content?.find(c => c.type === 'text');
      const responseText = textContent && 'text' in textContent ? String(textContent.text) : '';

      const isError = interaction.error || interaction.response?.isError || looksLikeError(responseText);
      if (!isError) continue;

      const errorContent = errorText || responseText;
      if (!errorContent) continue;

      // Simple categorization for pattern hashing
      const category = categorizeError(errorContent);
      const key = `${category}:${errorContent.slice(0, 50)}`;

      const existing = patternCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        patternCounts.set(key, { count: 1, example: errorContent });
      }
    }

    // Convert to ErrorPattern format
    for (const [key, data] of patternCounts) {
      const [category] = key.split(':');
      patterns.push({
        category: mapCategoryToErrorCategory(category),
        patternHash: key,
        example: data.example,
        count: data.count,
      });
    }

    if (patterns.length > 0) {
      const tool = tools.find(t => t.name === profile.name);
      errorInputs.push({
        toolName: profile.name,
        toolDescription: tool?.description,
        patterns,
      });
    }
  }

  if (errorInputs.length === 0) {
    return null;
  }

  return analyzeExternalDependencies(errorInputs);
}

/**
 * Map simple error category to ErrorPattern category type.
 */
function mapCategoryToErrorCategory(
  category: string
): 'validation' | 'not_found' | 'permission' | 'timeout' | 'internal' | 'unknown' {
  switch (category.toLowerCase()) {
    case 'permission':
      return 'permission';
    case 'notfound':
      return 'not_found';
    case 'validation':
      return 'validation';
    case 'timeout':
      return 'timeout';
    case 'network':
    case 'other':
    default:
      return 'unknown';
  }
}

function generateStatefulTestingSection(
  toolProfiles: ToolProfile[],
  summary?: StatefulTestingSummary
): string[] {
  if (!summary?.enabled) return [];

  const lines: string[] = [];
  const withDeps = toolProfiles
    .filter((p) => p.dependencyInfo)
    .sort((a, b) => (a.dependencyInfo?.sequencePosition ?? 0) - (b.dependencyInfo?.sequencePosition ?? 0));

  if (withDeps.length === 0) {
    return [];
  }

  lines.push('## Stateful Testing');
  lines.push('');
  lines.push(`Stateful testing executed across ${summary.toolCount} tool(s) with ${summary.dependencyCount} dependency edge(s).`);
  lines.push('');
  lines.push('| Tool | Sequence | Depends On |');
  lines.push('|------|----------|------------|');
  for (const profile of withDeps) {
    const deps = profile.dependencyInfo?.dependsOn?.length
      ? profile.dependencyInfo.dependsOn.join(', ')
      : 'None';
    lines.push(`| \`${escapeTableCell(profile.name)}\` | ${profile.dependencyInfo?.sequencePosition ?? 0} | ${escapeTableCell(deps)} |`);
  }
  lines.push('');

  const edges = withDeps.flatMap((profile) =>
    (profile.dependencyInfo?.dependsOn ?? []).map((dep) => ({ from: dep, to: profile.name }))
  );
  if (edges.length > 0 && edges.length <= 50) {
    lines.push('```mermaid');
    lines.push('graph TD');
    for (const edge of edges) {
      lines.push(`  ${mermaidLabel(edge.from)} --> ${mermaidLabel(edge.to)}`);
    }
    lines.push('```');
    lines.push('');
  }

  return lines;
}

function generateExternalServiceConfigSection(summary?: ExternalServiceSummary): string[] {
  if (!summary || summary.unconfiguredServices.length === 0) return [];

  const lines: string[] = [];
  lines.push('## External Service Setup');
  lines.push('');
  lines.push(`Mode: \`${summary.mode}\``);
  lines.push('');

  for (const serviceName of summary.unconfiguredServices) {
    const service = EXTERNAL_DEPENDENCIES.SERVICES[serviceName as keyof typeof EXTERNAL_DEPENDENCIES.SERVICES];
    if (!service) continue;
    lines.push(`- **${service.name}**: ${service.remediation}`);
  }
  lines.push('');

  return lines;
}

function generateResponseAssertionsSection(toolProfiles: ToolProfile[]): string[] {
  const profiles = toolProfiles.filter((p) => p.assertionSummary);
  if (profiles.length === 0) return [];

  const lines: string[] = [];
  lines.push('## Response Assertions');
  lines.push('');
  lines.push('| Tool | Passed | Failed |');
  lines.push('|------|--------|--------|');
  for (const profile of profiles) {
    const summary = profile.assertionSummary!;
    lines.push(`| \`${escapeTableCell(profile.name)}\` | ${summary.passed} | ${summary.failed} |`);
  }
  lines.push('');

  const failingTools = profiles.filter((p) => (p.assertionSummary?.failed ?? 0) > 0);
  if (failingTools.length > 0) {
    lines.push('### Assertion Failures');
    lines.push('');
    for (const profile of failingTools) {
      const failures = collectAssertionFailures(profile);
      lines.push(`- \`${profile.name}\`: ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? ' ...' : ''}`);
    }
    lines.push('');
  }

  return lines;
}

function collectAssertionFailures(profile: ToolProfile): string[] {
  const failures = new Set<string>();
  for (const interaction of profile.interactions) {
    if (interaction.mocked) {
      continue;
    }
    for (const result of interaction.assertionResults ?? []) {
      if (result.passed) continue;
      const message = result.message ? `${result.type}: ${result.message}` : `${result.type} failed`;
      failures.add(message);
    }
  }
  return Array.from(failures);
}

/**
 * Generate AGENTS.md documentation from explore results.
 * Full LLM-powered behavioral documentation with persona findings.
 * Used by: bellwether explore
 */
