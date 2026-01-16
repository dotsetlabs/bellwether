/**
 * Behavioral comparison algorithm for drift detection.
 *
 * IMPORTANT: This module uses semantic comparison, not exact string matching,
 * to handle LLM non-determinism. Two descriptions that mean the same thing
 * but are phrased differently will NOT be flagged as drift.
 *
 * STRICT MODE: When options.strict is true, only structural (deterministic)
 * changes are reported. This is useful for CI/CD pipelines that need
 * 100% reproducible results.
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
  ChangeConfidence,
} from './types.js';
import { createBaseline } from './saver.js';
import {
  structureSecurityNotes,
  structureLimitations,
  securityFindingsMatchWithConfidence,
  limitationsMatchWithConfidence,
  compareArraysSemanticWithConfidence,
  createFingerprint,
  calculateComparisonConfidence,
} from './semantic.js';
import {
  createStructuralConfidence,
  aggregateToolConfidence,
  aggregateDiffConfidence,
  filterByConfidence,
  isStructuralAspect,
} from './confidence.js';

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
 *
 * @param previous - Previous baseline to compare against
 * @param current - Current baseline
 * @param options - Comparison options including strict mode and confidence thresholds
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
  let toolsModified: ToolDiff[] = [];
  let behaviorChanges: BehaviorChange[] = [];

  // Check for removed tools (structural - 100% confidence)
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

  // Compare assertions (unless strict mode - assertions are semantic)
  if (!options.strict) {
    const assertionChanges = compareAssertions(previous.assertions, current.assertions, options);
    behaviorChanges.push(...assertionChanges);
  }

  // Compare workflows (structural - workflow success/failure is deterministic)
  const workflowChanges = compareWorkflows(
    previous.workflowSignatures || [],
    current.workflowSignatures || []
  );
  behaviorChanges.push(...workflowChanges);

  // Filter by minimum confidence if specified
  if (options.minConfidence !== undefined && options.minConfidence > 0) {
    behaviorChanges = filterByConfidence(behaviorChanges, options.minConfidence);

    // Re-filter toolsModified based on remaining changes
    toolsModified = toolsModified.map((td) => ({
      ...td,
      changes: filterByConfidence(td.changes, options.minConfidence!),
    })).filter((td) => td.changes.length > 0 || td.schemaChanged);
  }

  // Aggregate confidence for each tool
  for (const toolDiff of toolsModified) {
    toolDiff.confidence = aggregateToolConfidence(toolDiff.changes);
  }

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
    severity,
    options.strict
  );

  // Aggregate overall confidence
  const confidence = aggregateDiffConfidence(toolsModified, behaviorChanges);

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
    confidence,
    strictMode: options.strict,
  };
}

/**
 * Compare two tool fingerprints.
 *
 * Uses SEMANTIC comparison for LLM-generated content (security notes, limitations)
 * to avoid false positives from LLM non-determinism.
 *
 * In STRICT MODE, only structural changes (schema, description) are reported.
 */
function compareTool(
  previous: ToolFingerprint,
  current: ToolFingerprint,
  options: CompareOptions
): ToolDiff {
  const changes: BehaviorChange[] = [];
  let schemaChanged = false;
  let descriptionChanged = false;

  // Check schema change (deterministic - hash comparison, 100% confidence)
  if (previous.schemaHash !== current.schemaHash && !options.ignoreSchemaChanges) {
    schemaChanged = true;
    changes.push({
      tool: current.name,
      aspect: 'schema',
      before: `Schema hash: ${previous.schemaHash}`,
      after: `Schema hash: ${current.schemaHash}`,
      significance: 'high',
      description: `Schema for ${current.name} has changed`,
      confidence: createStructuralConfidence('Schema hash differs - deterministic comparison'),
    });
  }

  // Check description change (from MCP server, not LLM - exact match, 100% confidence)
  if (previous.description !== current.description && !options.ignoreDescriptionChanges) {
    descriptionChanged = true;
    changes.push({
      tool: current.name,
      aspect: 'description',
      before: previous.description,
      after: current.description,
      significance: 'low',
      description: `Description for ${current.name} has changed`,
      confidence: createStructuralConfidence('Description text differs - exact string comparison'),
    });
  }

  // Skip semantic comparisons in strict mode
  if (options.strict) {
    return {
      tool: current.name,
      changes,
      schemaChanged,
      descriptionChanged,
    };
  }

  // Compare security notes using SEMANTIC matching with confidence
  // Convert to structured findings and compare by category+severity, not exact text
  const prevSecurityFindings = structureSecurityNotes(current.name, previous.securityNotes);
  const currSecurityFindings = structureSecurityNotes(current.name, current.securityNotes);

  const securityDiff = compareArraysSemanticWithConfidence(
    prevSecurityFindings,
    currSecurityFindings,
    securityFindingsMatchWithConfidence
  );

  for (const { item: finding, confidence } of securityDiff.added) {
    changes.push({
      tool: current.name,
      aspect: 'security',
      before: '',
      after: `[${finding.category}/${finding.severity}] ${finding.description}`,
      significance: 'high',
      description: `New ${finding.severity} security finding (${finding.category}) for ${current.name}`,
      confidence,
    });
  }

  for (const { item: finding, confidence } of securityDiff.removed) {
    changes.push({
      tool: current.name,
      aspect: 'security',
      before: `[${finding.category}/${finding.severity}] ${finding.description}`,
      after: '',
      significance: 'medium',
      description: `Resolved ${finding.category} security finding for ${current.name}`,
      confidence,
    });
  }

  // Compare limitations using SEMANTIC matching with confidence
  // Convert to structured limitations and compare by category, not exact text
  const prevLimitations = structureLimitations(current.name, previous.limitations);
  const currLimitations = structureLimitations(current.name, current.limitations);

  const limitationDiff = compareArraysSemanticWithConfidence(
    prevLimitations,
    currLimitations,
    limitationsMatchWithConfidence
  );

  for (const { item: limitation, confidence } of limitationDiff.added) {
    changes.push({
      tool: current.name,
      aspect: 'error_handling',
      before: '',
      after: `[${limitation.category}] ${limitation.description}`,
      significance: 'medium',
      description: `New ${limitation.category} limitation for ${current.name}`,
      confidence,
    });
  }

  for (const { item: limitation, confidence } of limitationDiff.removed) {
    changes.push({
      tool: current.name,
      aspect: 'error_handling',
      before: `[${limitation.category}] ${limitation.description}`,
      after: '',
      significance: 'low',
      description: `Resolved ${limitation.category} limitation for ${current.name}`,
      confidence,
    });
  }

  return {
    tool: current.name,
    changes,
    schemaChanged,
    descriptionChanged,
  };
}

/**
 * Compare behavioral assertions using SEMANTIC fingerprinting.
 *
 * Instead of exact string matching (which fails due to LLM non-determinism),
 * we extract semantic fingerprints and compare those.
 *
 * Example:
 *   "Returns error when file doesn't exist" → fingerprint: "read_file:error_handling:error:not_found:returns"
 *   "The tool throws an error for missing files" → fingerprint: "read_file:error_handling:error:missing:throws"
 *   These would have similar fingerprints and NOT be flagged as drift.
 */
function compareAssertions(
  previous: BehavioralAssertion[],
  current: BehavioralAssertion[],
  _options: CompareOptions = {}
): BehaviorChange[] {
  const changes: BehaviorChange[] = [];

  // Create fingerprints for semantic comparison
  const createKey = (a: BehavioralAssertion) =>
    createFingerprint(a.tool, a.aspect, a.assertion);

  // Create maps keyed by semantic fingerprint
  const prevMap = new Map<string, { fingerprint: string; assertion: BehavioralAssertion }>();
  for (const a of previous) {
    const fingerprint = createKey(a);
    prevMap.set(fingerprint, { fingerprint, assertion: a });
  }

  const currMap = new Map<string, { fingerprint: string; assertion: BehavioralAssertion }>();
  for (const a of current) {
    const fingerprint = createKey(a);
    currMap.set(fingerprint, { fingerprint, assertion: a });
  }

  // Check for new assertions (fingerprint in current but not previous)
  for (const [fingerprint, { assertion }] of currMap) {
    if (!prevMap.has(fingerprint)) {
      const significance = getAssertionSignificance(assertion);

      // Calculate confidence based on how different this is from any previous assertion
      let bestConfidence: ChangeConfidence | undefined;
      for (const [, { assertion: prevAssertion }] of prevMap) {
        if (prevAssertion.tool === assertion.tool && prevAssertion.aspect === assertion.aspect) {
          const conf = calculateComparisonConfidence(
            prevAssertion.assertion,
            assertion.assertion,
            false // Categories don't match since fingerprints differ
          );
          if (!bestConfidence || conf.score > bestConfidence.score) {
            bestConfidence = conf;
          }
        }
      }

      // If no similar assertion found, high confidence it's new
      if (!bestConfidence) {
        bestConfidence = {
          score: 90,
          method: 'semantic',
          factors: [
            {
              name: 'no_similar_assertion',
              weight: 1.0,
              value: 90,
              description: 'No similar assertion found in previous baseline',
            },
          ],
        };
      }

      changes.push({
        tool: assertion.tool,
        aspect: assertion.aspect,
        before: '',
        after: assertion.assertion,
        significance,
        description: `New ${assertion.aspect} assertion: ${assertion.assertion}`,
        confidence: bestConfidence,
      });
    }
  }

  // Check for removed assertions (fingerprint in previous but not current)
  for (const [fingerprint, { assertion }] of prevMap) {
    if (!currMap.has(fingerprint)) {
      const significance = getAssertionSignificance(assertion);

      // Calculate confidence based on how different this is from any current assertion
      let bestConfidence: ChangeConfidence | undefined;
      for (const [, { assertion: currAssertion }] of currMap) {
        if (currAssertion.tool === assertion.tool && currAssertion.aspect === assertion.aspect) {
          const conf = calculateComparisonConfidence(
            assertion.assertion,
            currAssertion.assertion,
            false // Categories don't match since fingerprints differ
          );
          if (!bestConfidence || conf.score > bestConfidence.score) {
            bestConfidence = conf;
          }
        }
      }

      // If no similar assertion found, high confidence it was removed
      if (!bestConfidence) {
        bestConfidence = {
          score: 90,
          method: 'semantic',
          factors: [
            {
              name: 'no_similar_assertion',
              weight: 1.0,
              value: 90,
              description: 'No similar assertion found in current baseline',
            },
          ],
        };
      }

      changes.push({
        tool: assertion.tool,
        aspect: assertion.aspect,
        before: assertion.assertion,
        after: '',
        significance,
        description: `Removed ${assertion.aspect} assertion: ${assertion.assertion}`,
        confidence: bestConfidence,
      });
    }
  }

  return changes;
}

/**
 * Compare workflow signatures.
 *
 * Workflow comparisons are STRUCTURAL (deterministic) because we're
 * comparing actual execution results (succeeded/failed), not LLM prose.
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
          confidence: createStructuralConfidence('Workflow execution result changed - deterministic'),
        });
      } else if (!prevWorkflow.succeeded && currWorkflow.succeeded) {
        changes.push({
          tool: currWorkflow.name,
          aspect: 'error_handling',
          before: 'failed',
          after: 'succeeded',
          significance: 'low',
          description: `Workflow "${currWorkflow.name}" now succeeds (previously failed)`,
          confidence: createStructuralConfidence('Workflow execution result changed - deterministic'),
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
  severity: ChangeSeverity,
  strictMode?: boolean
): string {
  if (severity === 'none') {
    return strictMode
      ? 'No structural changes detected (strict mode).'
      : 'No behavioral changes detected.';
  }

  const parts: string[] = [];

  if (strictMode) {
    parts.push('[Strict Mode: structural changes only]');
  }

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

/**
 * Check if the diff meets confidence requirements for CI.
 *
 * @param diff - The behavioral diff to check
 * @param confidenceThreshold - Minimum confidence (0-100) for breaking changes
 * @returns true if all breaking changes meet the confidence threshold
 */
export function meetsConfidenceRequirements(
  diff: BehavioralDiff,
  confidenceThreshold: number
): boolean {
  // If no breaking changes, we're fine
  if (diff.breakingCount === 0) {
    return true;
  }

  // Check each breaking change
  const breakingChanges = diff.behaviorChanges.filter((c) => c.significance === 'high');

  for (const change of breakingChanges) {
    // If no confidence info, assume it's structural (100%)
    const confidence = change.confidence?.score ?? 100;

    if (confidence < confidenceThreshold) {
      // This breaking change doesn't meet the threshold
      return false;
    }
  }

  return true;
}

/**
 * Get changes that don't meet the confidence threshold.
 */
export function getLowConfidenceChanges(
  diff: BehavioralDiff,
  threshold: number
): BehaviorChange[] {
  return diff.behaviorChanges.filter((change) => {
    const confidence = change.confidence?.score ?? 100;
    return confidence < threshold;
  });
}

/**
 * Separate structural and semantic changes.
 */
export function separateByMethod(diff: BehavioralDiff): {
  structural: BehaviorChange[];
  semantic: BehaviorChange[];
} {
  const structural: BehaviorChange[] = [];
  const semantic: BehaviorChange[] = [];

  for (const change of diff.behaviorChanges) {
    if (change.confidence?.method === 'structural' || isStructuralAspect(change.aspect)) {
      structural.push(change);
    } else {
      semantic.push(change);
    }
  }

  return { structural, semantic };
}
