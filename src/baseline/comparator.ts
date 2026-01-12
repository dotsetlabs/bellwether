/**
 * Behavioral comparison algorithm for drift detection.
 */

import type { InterviewResult } from '../interview/types.js';
import type {
  BehavioralBaseline,
  BehavioralDiff,
  ToolDiff,
  BehaviorChange,
  CompareOptions,
  ChangeSeverity,
  ChangeSignificance,
  ToolFingerprint,
  BehavioralAssertion,
} from './types.js';
import { createBaseline } from './saver.js';

/**
 * Compare current interview results against a baseline.
 */
export function compareWithBaseline(
  baseline: BehavioralBaseline,
  current: InterviewResult,
  serverCommand: string,
  options: CompareOptions = {}
): BehavioralDiff {
  // Create a baseline from current results for comparison
  const currentBaseline = createBaseline(current, serverCommand);

  return compareBaselines(baseline, currentBaseline, options);
}

/**
 * Compare two baselines directly.
 */
export function compareBaselines(
  previous: BehavioralBaseline,
  current: BehavioralBaseline,
  options: CompareOptions = {}
): BehavioralDiff {
  const previousToolMap = new Map(previous.tools.map((t) => [t.name, t]));
  const currentToolMap = new Map(current.tools.map((t) => [t.name, t]));

  // Find added/removed tools
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
    // Filter by specified tools if provided
    if (options.tools && options.tools.length > 0 && !options.tools.includes(name)) {
      continue;
    }

    const previousTool = previousToolMap.get(name);

    if (!previousTool) {
      toolsAdded.push(name);
      continue;
    }

    // Compare tool details
    const toolDiff = compareTool(previousTool, currentTool, options);

    if (toolDiff.changes.length > 0 || toolDiff.schemaChanged || toolDiff.descriptionChanged) {
      toolsModified.push(toolDiff);
      behaviorChanges.push(...toolDiff.changes);
    }
  }

  // Compare assertions
  const assertionChanges = compareAssertions(previous.assertions, current.assertions);
  behaviorChanges.push(...assertionChanges);

  // Compare workflows
  const workflowChanges = compareWorkflows(
    previous.workflowSignatures || [],
    current.workflowSignatures || []
  );
  behaviorChanges.push(...workflowChanges);

  // Calculate severity
  const { severity, breakingCount, warningCount, infoCount } = calculateSeverity(
    toolsAdded,
    toolsRemoved,
    behaviorChanges,
    options
  );

  // Generate summary
  const summary = generateSummary(
    toolsAdded,
    toolsRemoved,
    toolsModified,
    behaviorChanges,
    severity
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
  };
}

/**
 * Compare two tool fingerprints.
 */
function compareTool(
  previous: ToolFingerprint,
  current: ToolFingerprint,
  options: CompareOptions
): ToolDiff {
  const changes: BehaviorChange[] = [];
  let schemaChanged = false;
  let descriptionChanged = false;

  // Check schema change
  if (previous.schemaHash !== current.schemaHash && !options.ignoreSchemaChanges) {
    schemaChanged = true;
    changes.push({
      tool: current.name,
      aspect: 'schema',
      before: `Schema hash: ${previous.schemaHash}`,
      after: `Schema hash: ${current.schemaHash}`,
      significance: 'high',
      description: `Schema for ${current.name} has changed`,
    });
  }

  // Check description change
  if (previous.description !== current.description && !options.ignoreDescriptionChanges) {
    descriptionChanged = true;
    changes.push({
      tool: current.name,
      aspect: 'description',
      before: previous.description,
      after: current.description,
      significance: 'low',
      description: `Description for ${current.name} has changed`,
    });
  }

  // Compare security notes
  const prevSecuritySet = new Set(previous.securityNotes);
  const currSecuritySet = new Set(current.securityNotes);

  for (const note of current.securityNotes) {
    if (!prevSecuritySet.has(note)) {
      changes.push({
        tool: current.name,
        aspect: 'security',
        before: '',
        after: note,
        significance: 'high',
        description: `New security note for ${current.name}: ${note}`,
      });
    }
  }

  for (const note of previous.securityNotes) {
    if (!currSecuritySet.has(note)) {
      changes.push({
        tool: current.name,
        aspect: 'security',
        before: note,
        after: '',
        significance: 'medium',
        description: `Removed security note for ${current.name}: ${note}`,
      });
    }
  }

  // Compare limitations
  const prevLimitSet = new Set(previous.limitations);
  const currLimitSet = new Set(current.limitations);

  for (const limitation of current.limitations) {
    if (!prevLimitSet.has(limitation)) {
      changes.push({
        tool: current.name,
        aspect: 'error_handling',
        before: '',
        after: limitation,
        significance: 'medium',
        description: `New limitation for ${current.name}: ${limitation}`,
      });
    }
  }

  for (const limitation of previous.limitations) {
    if (!currLimitSet.has(limitation)) {
      changes.push({
        tool: current.name,
        aspect: 'error_handling',
        before: limitation,
        after: '',
        significance: 'low',
        description: `Resolved limitation for ${current.name}: ${limitation}`,
      });
    }
  }

  return {
    tool: current.name,
    changes,
    schemaChanged,
    descriptionChanged,
  };
}

/**
 * Compare behavioral assertions.
 */
function compareAssertions(
  previous: BehavioralAssertion[],
  current: BehavioralAssertion[]
): BehaviorChange[] {
  const changes: BehaviorChange[] = [];

  // Create maps keyed by tool+aspect+assertion
  const prevMap = new Map(
    previous.map((a) => [`${a.tool}:${a.aspect}:${a.assertion}`, a])
  );
  const currMap = new Map(
    current.map((a) => [`${a.tool}:${a.aspect}:${a.assertion}`, a])
  );

  // Check for new assertions
  for (const [key, assertion] of currMap) {
    if (!prevMap.has(key)) {
      const significance = getAssertionSignificance(assertion);
      changes.push({
        tool: assertion.tool,
        aspect: assertion.aspect,
        before: '',
        after: assertion.assertion,
        significance,
        description: `New ${assertion.aspect} assertion: ${assertion.assertion}`,
      });
    }
  }

  // Check for removed assertions
  for (const [key, assertion] of prevMap) {
    if (!currMap.has(key)) {
      const significance = getAssertionSignificance(assertion);
      changes.push({
        tool: assertion.tool,
        aspect: assertion.aspect,
        before: assertion.assertion,
        after: '',
        significance,
        description: `Removed ${assertion.aspect} assertion: ${assertion.assertion}`,
      });
    }
  }

  return changes;
}

/**
 * Compare workflow signatures.
 */
function compareWorkflows(
  previous: Array<{ id: string; name: string; succeeded: boolean }>,
  current: Array<{ id: string; name: string; succeeded: boolean }>
): BehaviorChange[] {
  const changes: BehaviorChange[] = [];

  const prevMap = new Map(previous.map((w) => [w.id, w]));
  const currMap = new Map(current.map((w) => [w.id, w]));

  // Check for workflow success/failure changes
  for (const [id, currWorkflow] of currMap) {
    const prevWorkflow = prevMap.get(id);

    if (prevWorkflow) {
      if (prevWorkflow.succeeded && !currWorkflow.succeeded) {
        changes.push({
          tool: currWorkflow.name,
          aspect: 'error_handling',
          before: 'succeeded',
          after: 'failed',
          significance: 'high',
          description: `Workflow "${currWorkflow.name}" now fails (previously succeeded)`,
        });
      } else if (!prevWorkflow.succeeded && currWorkflow.succeeded) {
        changes.push({
          tool: currWorkflow.name,
          aspect: 'error_handling',
          before: 'failed',
          after: 'succeeded',
          significance: 'low',
          description: `Workflow "${currWorkflow.name}" now succeeds (previously failed)`,
        });
      }
    }
  }

  return changes;
}

/**
 * Get significance level for an assertion.
 */
function getAssertionSignificance(assertion: BehavioralAssertion): ChangeSignificance {
  if (assertion.aspect === 'security') {
    return 'high';
  }
  if (assertion.aspect === 'error_handling' && !assertion.isPositive) {
    return 'medium';
  }
  return 'low';
}

/**
 * Calculate overall severity from changes.
 */
function calculateSeverity(
  toolsAdded: string[],
  toolsRemoved: string[],
  changes: BehaviorChange[],
  _options: CompareOptions
): {
  severity: ChangeSeverity;
  breakingCount: number;
  warningCount: number;
  infoCount: number;
} {
  let breakingCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  // Removed tools are always breaking
  breakingCount += toolsRemoved.length;

  // Count changes by significance
  for (const change of changes) {
    switch (change.significance) {
      case 'high':
        breakingCount++;
        break;
      case 'medium':
        warningCount++;
        break;
      case 'low':
        infoCount++;
        break;
    }
  }

  // Added tools are informational
  infoCount += toolsAdded.length;

  // Determine overall severity
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

/**
 * Generate human-readable summary.
 */
function generateSummary(
  toolsAdded: string[],
  toolsRemoved: string[],
  toolsModified: ToolDiff[],
  changes: BehaviorChange[],
  severity: ChangeSeverity
): string {
  if (severity === 'none') {
    return 'No behavioral changes detected.';
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

  const highChanges = changes.filter((c) => c.significance === 'high').length;
  const mediumChanges = changes.filter((c) => c.significance === 'medium').length;

  if (highChanges > 0) {
    parts.push(`${highChanges} high-significance change(s)`);
  }
  if (mediumChanges > 0) {
    parts.push(`${mediumChanges} medium-significance change(s)`);
  }

  return parts.join('. ') + '.';
}

/**
 * Check if the diff indicates any breaking changes.
 */
export function hasBreakingChanges(diff: BehavioralDiff): boolean {
  return diff.severity === 'breaking';
}

/**
 * Check if the diff indicates security-related changes.
 */
export function hasSecurityChanges(diff: BehavioralDiff): boolean {
  return diff.behaviorChanges.some((c) => c.aspect === 'security');
}

/**
 * Filter changes by minimum severity.
 */
export function filterByMinimumSeverity(
  diff: BehavioralDiff,
  minSeverity: ChangeSeverity
): BehaviorChange[] {
  const severityOrder: ChangeSeverity[] = ['none', 'info', 'warning', 'breaking'];
  const minIndex = severityOrder.indexOf(minSeverity);

  return diff.behaviorChanges.filter((change) => {
    const changeLevel =
      change.significance === 'high' ? 'breaking' :
      change.significance === 'medium' ? 'warning' : 'info';
    return severityOrder.indexOf(changeLevel) >= minIndex;
  });
}
