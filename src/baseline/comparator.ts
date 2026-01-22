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
import {
  compareFingerprints,
  compareErrorPatterns,
} from './response-fingerprint.js';
import {
  checkVersionCompatibility,
  BaselineVersionError,
  parseVersion,
  areVersionsCompatible,
  getCompatibilityWarning,
} from './version.js';
import { compareSchemas } from './schema-compare.js';
import { PERFORMANCE_TRACKING } from '../constants.js';
import type { PerformanceRegressionReport, PerformanceRegression } from './types.js';

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
        `Use \`bellwether baseline migrate\` to upgrade the older baseline, ` +
        `or use --ignore-version-mismatch to force comparison (results may be incorrect).`,
      v1.raw,
      v2.raw
    );
  }

  const previousToolMap = new Map(previous.tools.map((t) => [t.name, t]));
  const currentToolMap = new Map(current.tools.map((t) => [t.name, t]));

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

    if (toolDiff.changes.length > 0 || toolDiff.schemaChanged || toolDiff.descriptionChanged) {
      toolsModified.push(toolDiff);
      behaviorChanges.push(...toolDiff.changes);
    }
  }

  // Compare workflows
  const workflowChanges = compareWorkflows(
    previous.workflowSignatures || [],
    current.workflowSignatures || []
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
    previous,
    current,
    options.performanceThreshold ?? PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD
  );

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

  return {
    tool: current.name,
    changes,
    schemaChanged,
    descriptionChanged,
    responseStructureChanged,
    errorPatternsChanged,
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
 *
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @param threshold - Regression threshold (0-1, e.g., 0.10 = 10% slower)
 * @returns Performance regression report, or undefined if no performance data
 */
function comparePerformanceData(
  previous: BehavioralBaseline,
  current: BehavioralBaseline,
  threshold: number
): PerformanceRegressionReport | undefined {
  const regressions: PerformanceRegression[] = [];
  let improvementCount = 0;

  // Build map of previous tool performance
  const previousPerf = new Map<string, { p50: number; p95: number }>();
  for (const tool of previous.tools) {
    if (tool.baselineP50Ms !== undefined) {
      previousPerf.set(tool.name, {
        p50: tool.baselineP50Ms,
        p95: tool.baselineP95Ms ?? tool.baselineP50Ms,
      });
    }
  }

  // Compare current tool performance
  for (const tool of current.tools) {
    if (tool.baselineP50Ms === undefined) {
      continue; // No performance data
    }

    const prev = previousPerf.get(tool.name);
    if (!prev) {
      continue; // New tool, no baseline to compare
    }

    // Calculate regression percentage
    const regressionPercent = prev.p50 > 0
      ? (tool.baselineP50Ms - prev.p50) / prev.p50
      : 0;

    if (regressionPercent > threshold) {
      // Performance regression
      regressions.push({
        toolName: tool.name,
        previousP50Ms: prev.p50,
        currentP50Ms: tool.baselineP50Ms,
        regressionPercent,
        exceedsThreshold: true,
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
  };
}
