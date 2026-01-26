/**
 * Structural comparison for drift detection.
 *
 * Compares baselines using deterministic structural comparison:
 * - Tool presence/absence
 * - Schema changes (hash comparison)
 * - Description changes (exact string comparison)
 * - Workflow success/failure changes
 *
 * All comparisons are 100% deterministic - no LLM involvement.
 */

import type { InterviewResult } from '../interview/types.js';
import type {
  BehavioralBaseline,
  BehavioralDiff,
  ToolDiff,
  BehaviorChange,
  BehaviorAspect,
  CompareOptions,
  ChangeSeverity,
  ToolFingerprint,
  VersionCompatibilityInfo,
  SeverityConfig,
} from './types.js';
import { createBaseline } from './saver.js';
import { getToolFingerprints } from './accessors.js';
import {
  compareFingerprints,
  compareErrorPatterns,
} from './response-fingerprint.js';
import { analyzeErrorTrends } from './error-analyzer.js';
import type { ErrorTrendReport } from './types.js';
import { compareSecurityFingerprints } from '../security/security-tester.js';
import type { SecurityDiff, SecurityFinding } from '../security/types.js';
import { compareSchemaEvolution } from './response-schema-tracker.js';
import type { SchemaEvolutionReport, SchemaEvolutionIssue, SchemaEvolutionDiff } from './types.js';
import {
  checkVersionCompatibility,
  BaselineVersionError,
  parseVersion,
  areVersionsCompatible,
  getCompatibilityWarning,
} from './version.js';
import { compareSchemas } from './schema-compare.js';
import { PERFORMANCE_TRACKING } from '../constants.js';
import type { PerformanceRegressionReport, PerformanceRegression, PerformanceConfidenceChange, DocumentationScoreChange } from './types.js';
import { hasReliableConfidence } from './performance-tracker.js';
import { compareDocumentationScores, scoreDocumentation } from './documentation-scorer.js';

/**
 * Compare current interview results against a baseline.
 */
export function compareWithBaseline(
  baseline: BehavioralBaseline,
  current: InterviewResult,
  serverCommand: string,
  options: CompareOptions = {}
): BehavioralDiff {
  const currentBaseline = createBaseline(current, serverCommand);
  return compareBaselines(baseline, currentBaseline, options);
}

/**
 * Compare two baselines directly.
 * All changes are structural and deterministic.
 *
 * @param previous - The baseline to compare against (source/old)
 * @param current - The current baseline (target/new)
 * @param options - Comparison options
 * @returns Diff result including version compatibility information
 * @throws BaselineVersionError if versions are incompatible and ignoreVersionMismatch is false
 */
export function compareBaselines(
  previous: BehavioralBaseline,
  current: BehavioralBaseline,
  options: CompareOptions = {}
): BehavioralDiff {
  // Check version compatibility
  const v1 = parseVersion(previous.version);
  const v2 = parseVersion(current.version);
  const versionCompatibility: VersionCompatibilityInfo = {
    compatible: areVersionsCompatible(v1, v2),
    warning: getCompatibilityWarning(v1, v2),
    sourceVersion: v1.raw,
    targetVersion: v2.raw,
  };

  // Throw error if versions are incompatible (unless ignored)
  if (!versionCompatibility.compatible && !options.ignoreVersionMismatch) {
    throw new BaselineVersionError(
      `Cannot compare baselines with incompatible format versions: v${v1.raw} vs v${v2.raw}. ` +
        `Recreate the older baseline with the current CLI version, ` +
        `or use --ignore-version-mismatch to force comparison (results may be incorrect).`,
      v1.raw,
      v2.raw
    );
  }

  const previousTools = getToolFingerprints(previous);
  const currentTools = getToolFingerprints(current);
  const previousToolMap = new Map(previousTools.map((t) => [t.name, t]));
  const currentToolMap = new Map(currentTools.map((t) => [t.name, t]));

  const toolsAdded: string[] = [];
  const toolsRemoved: string[] = [];
  const toolsModified: ToolDiff[] = [];
  const behaviorChanges: BehaviorChange[] = [];

  // Check for removed tools
  for (const [name] of previousToolMap) {
    if (!currentToolMap.has(name)) {
      if (!options.tools || options.tools.length === 0 || options.tools.includes(name)) {
        toolsRemoved.push(name);
      }
    }
  }

  // Check for added tools and modifications
  for (const [name, currentTool] of currentToolMap) {
    if (options.tools && options.tools.length > 0 && !options.tools.includes(name)) {
      continue;
    }

    const previousTool = previousToolMap.get(name);

    if (!previousTool) {
      toolsAdded.push(name);
      continue;
    }

    const toolDiff = compareTool(previousTool, currentTool, options);

    if (
      toolDiff.changes.length > 0 ||
      toolDiff.schemaChanged ||
      toolDiff.descriptionChanged ||
      toolDiff.securityChanged ||
      toolDiff.responseSchemaEvolutionChanged
    ) {
      toolsModified.push(toolDiff);
      behaviorChanges.push(...toolDiff.changes);
    }
  }

  // Compare workflows
  const workflowChanges = compareWorkflows(
    previous.workflows || [],
    current.workflows || []
  );
  behaviorChanges.push(...workflowChanges);

  const { severity, breakingCount, warningCount, infoCount } = calculateSeverity(
    toolsAdded,
    toolsRemoved,
    behaviorChanges
  );

  const summary = generateSummary(
    toolsAdded,
    toolsRemoved,
    toolsModified,
    behaviorChanges,
    severity
  );

  // Generate performance regression report if performance data is available
  const performanceReport = comparePerformanceData(
    previousTools,
    currentTools,
    options.performanceThreshold ?? PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD
  );

  // Generate security diff report if security testing was performed
  const securityReport = compareSecurityData(
    previousTools,
    currentTools,
    options.ignoreSecurityChanges ?? false
  );

  // Generate schema evolution report if schema evolution data is available
  const schemaEvolutionReport = generateSchemaEvolutionReport(
    toolsModified,
    previousTools,
    currentTools
  );

  // Generate error trend report if error pattern data is available
  const errorTrendReport = generateErrorTrendReport(
    previousTools,
    currentTools,
    options.ignoreErrorPatternChanges ?? false
  );

  // Generate documentation score comparison if documentation scores are available
  const documentationScoreReport = compareDocumentationData(previous, current);

  return {
    toolsAdded,
    toolsRemoved,
    toolsModified,
    behaviorChanges,
    severity,
    breakingCount,
    warningCount,
    infoCount,
    summary,
    versionCompatibility,
    performanceReport,
    securityReport,
    schemaEvolutionReport,
    errorTrendReport,
    documentationScoreReport,
  };
}

function compareTool(
  previous: ToolFingerprint,
  current: ToolFingerprint,
  options: CompareOptions
): ToolDiff {
  const changes: BehaviorChange[] = [];
  let schemaChanged = false;
  let descriptionChanged = false;
  let responseStructureChanged = false;
  let errorPatternsChanged = false;
  let responseSchemaEvolutionChanged = false;
  let securityChanged = false;
  let schemaEvolutionDiff: SchemaEvolutionDiff | undefined;

  // Compare input schema with detailed diff
  if (previous.schemaHash !== current.schemaHash && !options.ignoreSchemaChanges) {
    schemaChanged = true;

    // Get detailed schema comparison if inputSchema is available on both
    const schemaComparison = compareSchemas(
      previous.inputSchema as Parameters<typeof compareSchemas>[0],
      current.inputSchema as Parameters<typeof compareSchemas>[0]
    );

    if (schemaComparison.changes.length > 0) {
      // Add individual schema changes with proper severity
      for (const schemaChange of schemaComparison.changes) {
        changes.push({
          tool: current.name,
          aspect: 'schema',
          before: formatSchemaChangeValue(schemaChange.before),
          after: formatSchemaChangeValue(schemaChange.after),
          severity: schemaChange.breaking ? 'breaking' : 'warning',
          description: `${schemaChange.path}: ${schemaChange.description}`,
        });
      }
    } else {
      // Fallback to hash comparison if no detailed changes detected
      // (can happen if inputSchema is missing on one or both sides)
      changes.push({
        tool: current.name,
        aspect: 'schema',
        before: `Schema hash: ${previous.schemaHash}`,
        after: `Schema hash: ${current.schemaHash}`,
        severity: 'breaking',
        description: `Schema for ${current.name} has changed`,
      });
    }
  }

  // Compare description
  if (previous.description !== current.description && !options.ignoreDescriptionChanges) {
    descriptionChanged = true;
    changes.push({
      tool: current.name,
      aspect: 'description',
      before: previous.description,
      after: current.description,
      severity: 'info',
      description: `Description for ${current.name} has changed`,
    });
  }

  // Compare response structure fingerprints (check mode enhancement)
  if (!options.ignoreResponseStructureChanges) {
    const fingerprintDiff = compareFingerprints(
      previous.responseFingerprint,
      current.responseFingerprint
    );

    if (!fingerprintDiff.identical) {
      responseStructureChanged = true;

      for (const change of fingerprintDiff.changes) {
        changes.push({
          tool: current.name,
          aspect: 'response_structure',
          before: change.before,
          after: change.after,
          severity: change.breaking ? 'breaking' : 'warning',
          description: change.description,
        });
      }
    }
  }

  // Compare error patterns (check mode enhancement)
  if (!options.ignoreErrorPatternChanges) {
    const errorDiff = compareErrorPatterns(
      previous.errorPatterns,
      current.errorPatterns
    );

    if (errorDiff.behaviorChanged) {
      errorPatternsChanged = true;

      for (const added of errorDiff.added) {
        changes.push({
          tool: current.name,
          aspect: 'error_pattern',
          before: 'none',
          after: `${added.category}: ${added.example.slice(0, 50)}...`,
          severity: 'warning',
          description: `New error pattern detected: ${added.category}`,
        });
      }

      for (const removed of errorDiff.removed) {
        changes.push({
          tool: current.name,
          aspect: 'error_pattern',
          before: `${removed.category}: ${removed.example.slice(0, 50)}...`,
          after: 'none',
          severity: 'info',
          description: `Error pattern no longer occurs: ${removed.category}`,
        });
      }
    }
  }

  // Compare response schema evolution (check mode enhancement)
  if (!options.ignoreResponseStructureChanges) {
    schemaEvolutionDiff = compareSchemaEvolution(
      previous.responseSchemaEvolution,
      current.responseSchemaEvolution
    );

    if (schemaEvolutionDiff.structureChanged) {
      responseSchemaEvolutionChanged = true;

      // Add changes for removed fields (breaking)
      if (schemaEvolutionDiff.fieldsRemoved.length > 0) {
        changes.push({
          tool: current.name,
          aspect: 'response_schema_evolution',
          before: schemaEvolutionDiff.fieldsRemoved.join(', '),
          after: 'removed',
          severity: 'breaking',
          description: `Response fields removed: ${schemaEvolutionDiff.fieldsRemoved.join(', ')}`,
        });
      }

      // Add changes for added fields (non-breaking)
      if (schemaEvolutionDiff.fieldsAdded.length > 0) {
        changes.push({
          tool: current.name,
          aspect: 'response_schema_evolution',
          before: 'none',
          after: schemaEvolutionDiff.fieldsAdded.join(', '),
          severity: 'info',
          description: `Response fields added: ${schemaEvolutionDiff.fieldsAdded.join(', ')}`,
        });
      }

      // Add changes for type changes
      for (const typeChange of schemaEvolutionDiff.typeChanges) {
        changes.push({
          tool: current.name,
          aspect: 'response_schema_evolution',
          before: typeChange.previousType,
          after: typeChange.currentType,
          severity: typeChange.backwardCompatible ? 'warning' : 'breaking',
          description: `Response field "${typeChange.field}" type changed: ${typeChange.previousType} → ${typeChange.currentType}`,
        });
      }

      // Add changes for new required fields (breaking)
      if (schemaEvolutionDiff.newRequired.length > 0) {
        changes.push({
          tool: current.name,
          aspect: 'response_schema_evolution',
          before: 'optional',
          after: 'required',
          severity: 'breaking',
          description: `Response fields now required: ${schemaEvolutionDiff.newRequired.join(', ')}`,
        });
      }
    }
  }

  // Compare security fingerprints (check mode --security flag)
  if (!options.ignoreSecurityChanges) {
    const securityDiff = compareSecurityFingerprints(
      previous.securityFingerprint,
      current.securityFingerprint
    );

    if (securityDiff.newFindings.length > 0 || securityDiff.resolvedFindings.length > 0) {
      securityChanged = true;

      // Add changes for new security findings (security degradation)
      for (const finding of securityDiff.newFindings) {
        changes.push({
          tool: current.name,
          aspect: 'security',
          before: 'no finding',
          after: `${finding.riskLevel}: ${finding.title}`,
          severity: finding.riskLevel === 'critical' || finding.riskLevel === 'high'
            ? 'breaking'
            : finding.riskLevel === 'medium'
              ? 'warning'
              : 'info',
          description: `New security finding: ${finding.title} (${finding.cweId})`,
        });
      }

      // Add changes for resolved security findings (security improvement)
      for (const finding of securityDiff.resolvedFindings) {
        changes.push({
          tool: current.name,
          aspect: 'security',
          before: `${finding.riskLevel}: ${finding.title}`,
          after: 'resolved',
          severity: 'info',
          description: `Security finding resolved: ${finding.title} (${finding.cweId})`,
        });
      }
    }
  }

  return {
    tool: current.name,
    changes,
    schemaChanged,
    descriptionChanged,
    responseStructureChanged,
    errorPatternsChanged,
    responseSchemaEvolutionChanged,
    securityChanged,
    schemaEvolutionDiff,
  };
}

/**
 * Format a schema change value for display in BehaviorChange.
 * Converts unknown values to human-readable strings.
 */
function formatSchemaChangeValue(value: unknown): string {
  if (value === undefined) return '<none>';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 3) return `[${value.map(v => formatSchemaChangeValue(v)).join(', ')}]`;
    return `[${value.slice(0, 3).map(v => formatSchemaChangeValue(v)).join(', ')}, ...]`;
  }
  // For objects, show a compact representation
  try {
    const json = JSON.stringify(value);
    return json.length > 50 ? json.slice(0, 47) + '...' : json;
  } catch {
    return String(value);
  }
}

function compareWorkflows(
  previous: Array<{ id: string; name: string; succeeded: boolean }>,
  current: Array<{ id: string; name: string; succeeded: boolean }>
): BehaviorChange[] {
  const changes: BehaviorChange[] = [];

  const prevMap = new Map(previous.map((w) => [w.id, w]));
  const currMap = new Map(current.map((w) => [w.id, w]));

  for (const [id, currWorkflow] of currMap) {
    const prevWorkflow = prevMap.get(id);

    if (prevWorkflow) {
      if (prevWorkflow.succeeded && !currWorkflow.succeeded) {
        changes.push({
          tool: currWorkflow.name,
          aspect: 'error_handling',
          before: 'succeeded',
          after: 'failed',
          severity: 'breaking',
          description: `Workflow "${currWorkflow.name}" now fails (previously succeeded)`,
        });
      } else if (!prevWorkflow.succeeded && currWorkflow.succeeded) {
        changes.push({
          tool: currWorkflow.name,
          aspect: 'error_handling',
          before: 'failed',
          after: 'succeeded',
          severity: 'info',
          description: `Workflow "${currWorkflow.name}" now succeeds (previously failed)`,
        });
      }
    }
  }

  return changes;
}

function calculateSeverity(
  toolsAdded: string[],
  toolsRemoved: string[],
  changes: BehaviorChange[]
): {
  severity: ChangeSeverity;
  breakingCount: number;
  warningCount: number;
  infoCount: number;
} {
  let breakingCount = toolsRemoved.length;
  let warningCount = 0;
  let infoCount = toolsAdded.length;

  for (const change of changes) {
    switch (change.severity) {
      case 'breaking':
        breakingCount++;
        break;
      case 'warning':
        warningCount++;
        break;
      case 'info':
        infoCount++;
        break;
    }
  }

  let severity: ChangeSeverity = 'none';
  if (breakingCount > 0) {
    severity = 'breaking';
  } else if (warningCount > 0) {
    severity = 'warning';
  } else if (infoCount > 0) {
    severity = 'info';
  }

  return { severity, breakingCount, warningCount, infoCount };
}

function generateSummary(
  toolsAdded: string[],
  toolsRemoved: string[],
  toolsModified: ToolDiff[],
  changes: BehaviorChange[],
  severity: ChangeSeverity
): string {
  if (severity === 'none') {
    return 'No changes detected.';
  }

  const parts: string[] = [];

  if (toolsRemoved.length > 0) {
    parts.push(`${toolsRemoved.length} tool(s) removed: ${toolsRemoved.join(', ')}`);
  }
  if (toolsAdded.length > 0) {
    parts.push(`${toolsAdded.length} tool(s) added: ${toolsAdded.join(', ')}`);
  }
  if (toolsModified.length > 0) {
    parts.push(`${toolsModified.length} tool(s) modified`);
  }

  const breakingChanges = changes.filter((c) => c.severity === 'breaking').length;
  const warningChanges = changes.filter((c) => c.severity === 'warning').length;

  if (breakingChanges > 0) {
    parts.push(`${breakingChanges} breaking change(s)`);
  }
  if (warningChanges > 0) {
    parts.push(`${warningChanges} warning(s)`);
  }

  return parts.join('. ') + '.';
}

export function hasBreakingChanges(diff: BehavioralDiff): boolean {
  return diff.severity === 'breaking';
}

export function hasSecurityChanges(diff: BehavioralDiff): boolean {
  return diff.behaviorChanges.some((c) => c.aspect === 'security');
}

export function filterByMinimumSeverity(
  diff: BehavioralDiff,
  minSeverity: ChangeSeverity
): BehaviorChange[] {
  const severityOrder: ChangeSeverity[] = ['none', 'info', 'warning', 'breaking'];
  const minIndex = severityOrder.indexOf(minSeverity);

  return diff.behaviorChanges.filter((change) => {
    // BehaviorChange.severity is already a ChangeSeverity, so no mapping needed
    return severityOrder.indexOf(change.severity) >= minIndex;
  });
}

/**
 * Severity order for comparison.
 */
const SEVERITY_ORDER: ChangeSeverity[] = ['none', 'info', 'warning', 'breaking'];

/**
 * Compare two severity levels.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareSeverity(a: ChangeSeverity, b: ChangeSeverity): number {
  return SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b);
}

/**
 * Check if a severity meets or exceeds a threshold.
 */
export function severityMeetsThreshold(
  severity: ChangeSeverity,
  threshold: ChangeSeverity
): boolean {
  return compareSeverity(severity, threshold) >= 0;
}

/**
 * Apply aspect overrides to a behavior change.
 * Returns the modified severity based on aspect overrides.
 */
export function applyAspectOverride(
  change: BehaviorChange,
  aspectOverrides?: Partial<Record<BehaviorAspect, ChangeSeverity>>
): ChangeSeverity {
  if (!aspectOverrides) {
    return change.severity;
  }
  const override = aspectOverrides[change.aspect];
  return override !== undefined ? override : change.severity;
}

/**
 * Apply severity configuration to a diff result.
 * Returns a new diff with filtered/modified changes based on config.
 */
export function applySeverityConfig(
  diff: BehavioralDiff,
  config: SeverityConfig
): BehavioralDiff {
  const {
    minimumSeverity = 'none',
    suppressWarnings = false,
    aspectOverrides,
  } = config;

  // Apply aspect overrides and filter by minimum severity
  const filteredChanges = diff.behaviorChanges
    .map((change) => {
      const newSeverity = applyAspectOverride(change, aspectOverrides);
      return { ...change, severity: newSeverity };
    })
    .filter((change) => {
      // Filter by minimum severity
      if (!severityMeetsThreshold(change.severity, minimumSeverity)) {
        return false;
      }
      // Suppress warnings if configured
      if (suppressWarnings && change.severity === 'warning') {
        return false;
      }
      return true;
    });

  // Filter toolsModified to only include those with remaining changes
  const toolsWithChanges = new Set(filteredChanges.map((c) => c.tool));
  const filteredToolsModified = diff.toolsModified.filter(
    (td) =>
      toolsWithChanges.has(td.tool) ||
      (td.schemaChanged &&
        (!aspectOverrides?.schema || aspectOverrides.schema !== 'none')) ||
      (td.descriptionChanged &&
        (!aspectOverrides?.description || aspectOverrides.description !== 'none'))
  );

  // Recalculate counts
  let breakingCount = diff.toolsRemoved.length;
  let warningCount = 0;
  let infoCount = diff.toolsAdded.length;

  for (const change of filteredChanges) {
    switch (change.severity) {
      case 'breaking':
        breakingCount++;
        break;
      case 'warning':
        warningCount++;
        break;
      case 'info':
        infoCount++;
        break;
    }
  }

  // Determine overall severity
  let severity: ChangeSeverity = 'none';
  if (breakingCount > 0) {
    severity = 'breaking';
  } else if (warningCount > 0) {
    severity = 'warning';
  } else if (infoCount > 0) {
    severity = 'info';
  }

  return {
    ...diff,
    behaviorChanges: filteredChanges,
    toolsModified: filteredToolsModified,
    severity,
    breakingCount,
    warningCount,
    infoCount,
    summary: generateSummary(
      diff.toolsAdded,
      diff.toolsRemoved,
      filteredToolsModified,
      filteredChanges,
      severity
    ),
  };
}

/**
 * Determine the appropriate exit code based on diff severity and config.
 * Returns true if the check should fail (non-zero exit).
 */
export function shouldFailOnDiff(
  diff: BehavioralDiff,
  failOnSeverity: ChangeSeverity = 'breaking'
): boolean {
  return severityMeetsThreshold(diff.severity, failOnSeverity);
}

/**
 * Check if two baselines have compatible versions for comparison.
 *
 * @param baseline1 - First baseline
 * @param baseline2 - Second baseline
 * @returns Version compatibility information
 */
export function checkBaselineVersionCompatibility(
  baseline1: BehavioralBaseline,
  baseline2: BehavioralBaseline
): VersionCompatibilityInfo {
  const result = checkVersionCompatibility(baseline1.version, baseline2.version);
  return {
    compatible: result.compatible,
    warning: result.warning,
    sourceVersion: result.sourceVersion,
    targetVersion: result.targetVersion,
  };
}

/**
 * Compare performance data between two baselines.
 * Detects performance regressions based on p50 latency threshold.
 * Includes confidence information to indicate reliability of comparisons.
 *
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @param threshold - Regression threshold (0-1, e.g., 0.10 = 10% slower)
 * @returns Performance regression report, or undefined if no performance data
 */
function comparePerformanceData(
  previousTools: ToolFingerprint[],
  currentTools: ToolFingerprint[],
  threshold: number
): PerformanceRegressionReport | undefined {
  const regressions: PerformanceRegression[] = [];
  const confidenceChanges: PerformanceConfidenceChange[] = [];
  const lowConfidenceTools: string[] = [];
  let improvementCount = 0;

  // Build map of previous tool performance (including confidence)
  const previousPerf = new Map<
    string,
    {
      p50: number;
      p95: number;
      confidence?: 'high' | 'medium' | 'low';
    }
  >();
  for (const tool of previousTools) {
    if (tool.baselineP50Ms !== undefined) {
      previousPerf.set(tool.name, {
        p50: tool.baselineP50Ms,
        p95: tool.baselineP95Ms ?? tool.baselineP50Ms,
        confidence: tool.performanceConfidence?.confidenceLevel,
      });
    }
  }

  // Compare current tool performance
  for (const tool of currentTools) {
    if (tool.baselineP50Ms === undefined) {
      continue; // No performance data
    }

    const currentConfidence = tool.performanceConfidence;
    const currentConfidenceLevel = currentConfidence?.confidenceLevel ?? 'low';

    // Track low confidence tools
    if (currentConfidence && !hasReliableConfidence(currentConfidence)) {
      lowConfidenceTools.push(tool.name);
    }

    const prev = previousPerf.get(tool.name);
    if (!prev) {
      continue; // New tool, no baseline to compare
    }

    // Track confidence level changes
    if (prev.confidence && currentConfidenceLevel !== prev.confidence) {
      const previousLevel = prev.confidence;
      const improved =
        (previousLevel === 'low' && currentConfidenceLevel !== 'low') ||
        (previousLevel === 'medium' && currentConfidenceLevel === 'high');
      const degraded =
        (previousLevel === 'high' && currentConfidenceLevel !== 'high') ||
        (previousLevel === 'medium' && currentConfidenceLevel === 'low');

      confidenceChanges.push({
        toolName: tool.name,
        previousLevel,
        currentLevel: currentConfidenceLevel,
        improved,
        degraded,
        summary: improved
          ? `Confidence improved from ${previousLevel} to ${currentConfidenceLevel}`
          : degraded
            ? `Confidence degraded from ${previousLevel} to ${currentConfidenceLevel}`
            : `Confidence changed from ${previousLevel} to ${currentConfidenceLevel}`,
      });
    }

    // Calculate regression percentage
    const regressionPercent =
      prev.p50 > 0 ? (tool.baselineP50Ms - prev.p50) / prev.p50 : 0;

    // Determine if the regression is reliable (based on confidence)
    const isReliable =
      currentConfidence !== undefined && hasReliableConfidence(currentConfidence);

    if (regressionPercent > threshold) {
      // Performance regression
      regressions.push({
        toolName: tool.name,
        previousP50Ms: prev.p50,
        currentP50Ms: tool.baselineP50Ms,
        regressionPercent,
        exceedsThreshold: true,
        previousConfidence: prev.confidence,
        currentConfidence: currentConfidenceLevel,
        isReliable,
      });
    } else if (regressionPercent < -PERFORMANCE_TRACKING.WARNING_THRESHOLD) {
      // Performance improvement (> 5% faster)
      improvementCount++;
    }
  }

  // Return undefined if no performance data exists
  if (previousPerf.size === 0) {
    return undefined;
  }

  return {
    regressions,
    regressionCount: regressions.length,
    improvementCount,
    hasRegressions: regressions.length > 0,
    confidenceChanges: confidenceChanges.length > 0 ? confidenceChanges : undefined,
    lowConfidenceTools: lowConfidenceTools.length > 0 ? lowConfidenceTools : undefined,
  };
}

/**
 * Compare security data between two baselines.
 * Aggregates security findings across all tools to produce a server-level security diff.
 *
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @param ignoreSecurityChanges - Whether to skip security comparison
 * @returns Security diff report, or undefined if no security data
 */
function compareSecurityData(
  previousTools: ToolFingerprint[],
  currentTools: ToolFingerprint[],
  ignoreSecurityChanges: boolean
): SecurityDiff | undefined {
  if (ignoreSecurityChanges) {
    return undefined;
  }

  // Check if either baseline has security data
  const previousHasSecurity = previousTools.some((t) => t.securityFingerprint?.tested);
  const currentHasSecurity = currentTools.some((t) => t.securityFingerprint?.tested);

  if (!previousHasSecurity && !currentHasSecurity) {
    return undefined; // No security data to compare
  }

  // Aggregate findings from all tools
  const previousFindings = new Map<string, SecurityFinding>();
  const currentFindings = new Map<string, SecurityFinding>();

  // Build finding maps keyed by a unique identifier (tool:category:cweId:parameter)
  for (const tool of previousTools) {
    if (tool.securityFingerprint?.findings) {
      for (const finding of tool.securityFingerprint.findings) {
        const key = `${finding.tool}:${finding.category}:${finding.cweId}:${finding.parameter}`;
        previousFindings.set(key, finding);
      }
    }
  }

  for (const tool of currentTools) {
    if (tool.securityFingerprint?.findings) {
      for (const finding of tool.securityFingerprint.findings) {
        const key = `${finding.tool}:${finding.category}:${finding.cweId}:${finding.parameter}`;
        currentFindings.set(key, finding);
      }
    }
  }

  // Calculate new and resolved findings
  const newFindings: SecurityFinding[] = [];
  const resolvedFindings: SecurityFinding[] = [];

  for (const [key, finding] of currentFindings) {
    if (!previousFindings.has(key)) {
      newFindings.push(finding);
    }
  }

  for (const [key, finding] of previousFindings) {
    if (!currentFindings.has(key)) {
      resolvedFindings.push(finding);
    }
  }

  // Calculate aggregate risk scores
  let previousRiskScore = 0;
  let currentRiskScore = 0;
  let previousToolCount = 0;
  let currentToolCount = 0;

  for (const tool of previousTools) {
    if (tool.securityFingerprint?.tested) {
      previousRiskScore += tool.securityFingerprint.riskScore;
      previousToolCount++;
    }
  }

  for (const tool of currentTools) {
    if (tool.securityFingerprint?.tested) {
      currentRiskScore += tool.securityFingerprint.riskScore;
      currentToolCount++;
    }
  }

  // Average risk scores if there are tested tools
  const avgPreviousRisk = previousToolCount > 0 ? previousRiskScore / previousToolCount : 0;
  const avgCurrentRisk = currentToolCount > 0 ? currentRiskScore / currentToolCount : 0;
  const riskScoreChange = avgCurrentRisk - avgPreviousRisk;

  // Generate summary
  const summaryParts: string[] = [];

  if (newFindings.length > 0) {
    const criticalHigh = newFindings.filter(
      (f) => f.riskLevel === 'critical' || f.riskLevel === 'high'
    ).length;
    if (criticalHigh > 0) {
      summaryParts.push(`${criticalHigh} critical/high severity findings detected`);
    }
    summaryParts.push(`${newFindings.length} new security finding(s)`);
  }

  if (resolvedFindings.length > 0) {
    summaryParts.push(`${resolvedFindings.length} finding(s) resolved`);
  }

  if (riskScoreChange > 0) {
    summaryParts.push(`risk score increased by ${riskScoreChange.toFixed(1)}`);
  } else if (riskScoreChange < 0) {
    summaryParts.push(`risk score decreased by ${Math.abs(riskScoreChange).toFixed(1)}`);
  }

  const summary =
    summaryParts.length > 0 ? summaryParts.join('; ') : 'No security changes detected';

  return {
    newFindings,
    resolvedFindings,
    previousRiskScore: Math.round(avgPreviousRisk),
    currentRiskScore: Math.round(avgCurrentRisk),
    riskScoreChange: Math.round(riskScoreChange),
    degraded: newFindings.length > 0 || riskScoreChange > 0,
    summary,
  };
}

/**
 * Generate schema evolution report from tool diffs.
 * Tracks schema stability changes across tools.
 *
 * @param toolsModified - Tools with modifications
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @returns Schema evolution report, or undefined if no schema evolution data
 */
function generateSchemaEvolutionReport(
  toolsModified: ToolDiff[],
  previousTools: ToolFingerprint[],
  currentTools: ToolFingerprint[]
): SchemaEvolutionReport | undefined {
  // Check if either baseline has schema evolution data
  const previousHasEvolution = previousTools.some((t) => t.responseSchemaEvolution);
  const currentHasEvolution = currentTools.some((t) => t.responseSchemaEvolution);

  if (!previousHasEvolution && !currentHasEvolution) {
    return undefined; // No schema evolution data to compare
  }

  const toolsWithIssues: SchemaEvolutionIssue[] = [];
  let unstableCount = 0;
  let stableCount = 0;
  let structureChangedCount = 0;
  let hasBreakingChanges = false;

  // Analyze tools with schema evolution data
  for (const tool of currentTools) {
    const currEvolution = tool.responseSchemaEvolution;
    if (!currEvolution) continue;

    // Count stable vs unstable
    if (currEvolution.isStable) {
      stableCount++;
    } else {
      unstableCount++;
    }

    // Find corresponding tool diff
    const toolDiff = toolsModified.find((td) => td.tool === tool.name);
    if (toolDiff?.schemaEvolutionDiff?.structureChanged) {
      structureChangedCount++;

      if (toolDiff.schemaEvolutionDiff.isBreaking) {
        hasBreakingChanges = true;
      }

      // Find previous tool
      const prevTool = previousTools.find((t) => t.name === tool.name);
      const prevEvolution = prevTool?.responseSchemaEvolution;
      const becameUnstable = (prevEvolution?.isStable ?? false) && !currEvolution.isStable;

      toolsWithIssues.push({
        toolName: tool.name,
        becameUnstable,
        fieldsAdded: toolDiff.schemaEvolutionDiff.fieldsAdded,
        fieldsRemoved: toolDiff.schemaEvolutionDiff.fieldsRemoved,
        isBreaking: toolDiff.schemaEvolutionDiff.isBreaking,
        summary: toolDiff.schemaEvolutionDiff.summary,
      });
    } else if (!currEvolution.isStable && currEvolution.inconsistentFields.length > 0) {
      // Tool with unstable schema (no change, but already unstable)
      const prevTool = previousTools.find((t) => t.name === tool.name);
      const prevEvolution = prevTool?.responseSchemaEvolution;
      const becameUnstable = (prevEvolution?.isStable ?? false) && !currEvolution.isStable;

      if (becameUnstable) {
        toolsWithIssues.push({
          toolName: tool.name,
          becameUnstable: true,
          fieldsAdded: [],
          fieldsRemoved: [],
          isBreaking: false,
          summary: `Schema became unstable: ${currEvolution.inconsistentFields.join(', ')}`,
        });
      }
    }
  }

  return {
    toolsWithIssues,
    unstableCount,
    stableCount,
    structureChangedCount,
    hasBreakingChanges,
  };
}

/**
 * Generate error trend report from baseline comparison.
 * Aggregates error patterns across all tools to identify trends.
 *
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @param ignoreErrorPatternChanges - Whether to skip error pattern comparison
 * @returns Error trend report, or undefined if no error pattern data
 */
function generateErrorTrendReport(
  previousTools: ToolFingerprint[],
  currentTools: ToolFingerprint[],
  ignoreErrorPatternChanges: boolean
): ErrorTrendReport | undefined {
  if (ignoreErrorPatternChanges) {
    return undefined;
  }

  // Check if either baseline has error pattern data
  const previousHasErrors = previousTools.some(
    (t) => t.errorPatterns && t.errorPatterns.length > 0
  );
  const currentHasErrors = currentTools.some(
    (t) => t.errorPatterns && t.errorPatterns.length > 0
  );

  if (!previousHasErrors && !currentHasErrors) {
    return undefined; // No error pattern data to compare
  }

  // Aggregate error patterns from all tools
  const allPreviousPatterns = previousTools.flatMap((t) => t.errorPatterns ?? []);
  const allCurrentPatterns = currentTools.flatMap((t) => t.errorPatterns ?? []);

  return analyzeErrorTrends(allPreviousPatterns, allCurrentPatterns);
}

/**
 * Compare documentation scores between baselines.
 * Returns a change report if documentation score data is available.
 *
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @returns Documentation score change report, or undefined if no data
 */
function compareDocumentationData(
  previous: BehavioralBaseline,
  current: BehavioralBaseline
): DocumentationScoreChange | undefined {
  // If current doesn't have documentation score, try to calculate it from tools
  // This allows comparing old baselines without scores against new ones with scores
  const currentScore = current.documentationScore ?? calculateDocScoreFromTools(current);
  const previousScore = previous.documentationScore;

  if (!currentScore) {
    return undefined;
  }

  // Use the documentation scorer's comparison function
  // We need to reconstruct a minimal DocumentationScore for comparison
  const currentDocScore = {
    overallScore: currentScore.overallScore,
    grade: currentScore.grade as 'A' | 'B' | 'C' | 'D' | 'F',
    components: {
      descriptionCoverage: 0,
      descriptionQuality: 0,
      parameterDocumentation: 0,
      exampleCoverage: 0,
    },
    issues: [],
    suggestions: [],
    toolCount: currentScore.toolCount,
  };

  return compareDocumentationScores(previousScore, currentDocScore);
}

/**
 * Calculate documentation score summary from baseline tools.
 * Used when baseline doesn't have pre-calculated score.
 */
function calculateDocScoreFromTools(
  baseline: BehavioralBaseline
): { overallScore: number; grade: string; issueCount: number; toolCount: number } | undefined {
  const toolsFromBaseline = getToolFingerprints(baseline);
  if (toolsFromBaseline.length === 0) {
    return undefined;
  }

  // Create minimal MCPTool objects from ToolFingerprint
  const tools = toolsFromBaseline.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema ?? {},
  }));

  const score = scoreDocumentation(tools);
  return {
    overallScore: score.overallScore,
    grade: score.grade,
    issueCount: score.issues.length,
    toolCount: score.toolCount,
  };
}
