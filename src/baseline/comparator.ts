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
  CompareOptions,
  ChangeSeverity,
  ToolFingerprint,
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
  const currentBaseline = createBaseline(current, serverCommand);
  return compareBaselines(baseline, currentBaseline, options);
}

/**
 * Compare two baselines directly.
 * All changes are structural and deterministic.
 */
export function compareBaselines(
  previous: BehavioralBaseline,
  current: BehavioralBaseline,
  options: CompareOptions = {}
): BehavioralDiff {
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

function compareTool(
  previous: ToolFingerprint,
  current: ToolFingerprint,
  options: CompareOptions
): ToolDiff {
  const changes: BehaviorChange[] = [];
  let schemaChanged = false;
  let descriptionChanged = false;

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

  return {
    tool: current.name,
    changes,
    schemaChanged,
    descriptionChanged,
  };
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

  const highChanges = changes.filter((c) => c.significance === 'high').length;
  const mediumChanges = changes.filter((c) => c.significance === 'medium').length;

  if (highChanges > 0) {
    parts.push(`${highChanges} breaking change(s)`);
  }
  if (mediumChanges > 0) {
    parts.push(`${mediumChanges} warning(s)`);
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
    const changeLevel =
      change.significance === 'high' ? 'breaking' :
      change.significance === 'medium' ? 'warning' : 'info';
    return severityOrder.indexOf(changeLevel) >= minIndex;
  });
}
