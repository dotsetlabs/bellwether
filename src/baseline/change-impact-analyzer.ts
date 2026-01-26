/**
 * Change Impact Analyzer
 *
 * Provides semantic understanding of schema changes and their impact.
 * Goes beyond simple hash comparison to understand what actually breaks.
 */

import type {
  BehaviorChange,
  ChangeSeverity,
  ToolFingerprint,
  BehavioralBaseline,
  BehavioralDiff,
  WorkflowSignature,
} from './types.js';
import { getToolFingerprints } from './accessors.js';
import { CHANGE_IMPACT } from '../constants.js';
/**
 * Type of schema change detected.
 */
export type SchemaChangeType =
  | 'parameter_removed'
  | 'parameter_added'
  | 'parameter_type_changed'
  | 'parameter_required_added'
  | 'parameter_required_removed'
  | 'enum_value_removed'
  | 'enum_value_added'
  | 'constraint_added'
  | 'constraint_removed'
  | 'constraint_tightened'
  | 'constraint_relaxed'
  | 'description_changed'
  | 'default_changed'
  | 'format_changed';

/**
 * Detailed information about a single schema change.
 */
export interface SchemaChangeDetail {
  type: SchemaChangeType;
  parameterPath: string;
  breaking: boolean;
  before: unknown;
  after: unknown;
  description: string;
}

/**
 * Migration complexity levels.
 */
export type MigrationComplexity = 'trivial' | 'simple' | 'moderate' | 'complex';

/**
 * Comprehensive impact analysis for a change.
 */
export interface ChangeImpact {
  /** Overall severity of the change */
  severity: ChangeSeverity;
  /** List of affected workflow IDs */
  affectedWorkflows: string[];
  /** List of affected parameter paths */
  affectedParameters: string[];
  /** Estimated complexity to migrate */
  migrationComplexity: MigrationComplexity;
  /** Suggested migration approach */
  suggestedMigration: string;
  /** Detailed breakdown of schema changes */
  schemaChanges: SchemaChangeDetail[];
  /** Whether this change is backwards compatible */
  backwardsCompatible: boolean;
  /** Risk score (0-100) */
  riskScore: number;
}

/**
 * Impact analysis results for the entire diff.
 */
export interface DiffImpactAnalysis {
  /** Overall severity of all changes */
  overallSeverity: ChangeSeverity;
  /** Total number of breaking changes */
  breakingChangesCount: number;
  /** Per-tool impact analysis */
  toolImpacts: Map<string, ChangeImpact>;
  /** Workflows that will fail due to changes */
  brokenWorkflows: string[];
  /** Overall migration complexity */
  overallMigrationComplexity: MigrationComplexity;
  /** Summary of all changes */
  summary: string;
  /** Action items for addressing the changes */
  actionItems: ActionItem[];
}

/**
 * Action item for addressing a change.
 */
export interface ActionItem {
  priority: 'critical' | 'high' | 'medium' | 'low';
  tool: string;
  description: string;
  suggestedAction: string;
}

// Re-export the centralized CHANGE_IMPACT constant for backwards compatibility
export { CHANGE_IMPACT } from '../constants.js';
/**
 * Analyze the impact of changes between two tool fingerprints.
 */
export function analyzeToolChangeImpact(
  oldTool: ToolFingerprint,
  newTool: ToolFingerprint,
  workflows: WorkflowSignature[] = []
): ChangeImpact {
  const schemaChanges = analyzeSchemaChanges(
    oldTool.inputSchema,
    newTool.inputSchema
  );

  const breakingChanges = schemaChanges.filter(c => c.breaking);
  const affectedParameters = [...new Set(schemaChanges.map(c => c.parameterPath))];

  // Find affected workflows
  const affectedWorkflows = workflows
    .filter(w => w.toolSequence.includes(oldTool.name))
    .map(w => w.id);

  // Calculate risk score
  const riskScore = calculateRiskScore(schemaChanges);

  // Determine severity
  const severity = determineSeverity(riskScore, breakingChanges.length);

  // Calculate migration complexity
  const migrationComplexity = calculateMigrationComplexity(schemaChanges);

  // Generate migration suggestion
  const suggestedMigration = generateMigrationSuggestion(schemaChanges, oldTool.name);

  return {
    severity,
    affectedWorkflows,
    affectedParameters,
    migrationComplexity,
    suggestedMigration,
    schemaChanges,
    backwardsCompatible: breakingChanges.length === 0,
    riskScore,
  };
}

/**
 * Analyze a complete diff and provide comprehensive impact analysis.
 */
export function analyzeDiffImpact(
  diff: BehavioralDiff,
  oldBaseline: BehavioralBaseline,
  newBaseline: BehavioralBaseline
): DiffImpactAnalysis {
  const toolImpacts = new Map<string, ChangeImpact>();
  const actionItems: ActionItem[] = [];
  let totalBreakingChanges = 0;
  const oldTools = getToolFingerprints(oldBaseline);
  const newTools = getToolFingerprints(newBaseline);
  const oldWorkflows = oldBaseline.workflows ?? [];

  // Analyze removed tools (always breaking)
  for (const toolName of diff.toolsRemoved) {
    const oldTool = oldTools.find(t => t.name === toolName);
    if (oldTool) {
      const impact: ChangeImpact = {
        severity: 'breaking',
        affectedWorkflows: oldWorkflows
          .filter(w => w.toolSequence.includes(toolName))
          .map(w => w.id),
        affectedParameters: [],
        migrationComplexity: 'complex',
        suggestedMigration: `Tool "${toolName}" has been removed. You must find an alternative tool or remove all usages.`,
        schemaChanges: [{
          type: 'parameter_removed',
          parameterPath: toolName,
          breaking: true,
          before: oldTool,
          after: null,
          description: `Tool "${toolName}" has been completely removed`,
        }],
        backwardsCompatible: false,
        riskScore: 100,
      };
      toolImpacts.set(toolName, impact);
      totalBreakingChanges++;

      actionItems.push({
        priority: 'critical',
        tool: toolName,
        description: `Tool "${toolName}" has been removed`,
        suggestedAction: 'Find alternative tool or update all consumers to not use this tool',
      });
    }
  }

  // Analyze modified tools
  for (const toolDiff of diff.toolsModified) {
    const oldTool = oldTools.find(t => t.name === toolDiff.tool);
    const newTool = newTools.find(t => t.name === toolDiff.tool);

    if (oldTool && newTool) {
      const impact = analyzeToolChangeImpact(
        oldTool,
        newTool,
        oldWorkflows
      );
      toolImpacts.set(toolDiff.tool, impact);

      if (impact.severity === 'breaking') {
        totalBreakingChanges++;
        actionItems.push({
          priority: 'critical',
          tool: toolDiff.tool,
          description: `Breaking changes detected in "${toolDiff.tool}"`,
          suggestedAction: impact.suggestedMigration,
        });
      } else if (impact.severity === 'warning') {
        actionItems.push({
          priority: 'high',
          tool: toolDiff.tool,
          description: `Significant changes detected in "${toolDiff.tool}"`,
          suggestedAction: impact.suggestedMigration,
        });
      }
    }
  }

  // Analyze added tools (non-breaking but noteworthy)
  for (const toolName of diff.toolsAdded) {
    const impact: ChangeImpact = {
      severity: 'info',
      affectedWorkflows: [],
      affectedParameters: [],
      migrationComplexity: 'trivial',
      suggestedMigration: `New tool "${toolName}" is available. No action required for existing consumers.`,
      schemaChanges: [{
        type: 'parameter_added',
        parameterPath: toolName,
        breaking: false,
        before: null,
        after: newTools.find(t => t.name === toolName),
        description: `New tool "${toolName}" has been added`,
      }],
      backwardsCompatible: true,
      riskScore: 0,
    };
    toolImpacts.set(toolName, impact);

    actionItems.push({
      priority: 'low',
      tool: toolName,
      description: `New tool "${toolName}" is available`,
      suggestedAction: 'Consider using this new tool if applicable to your use case',
    });
  }

  // Find all broken workflows
  const brokenWorkflows: string[] = [];
  for (const [, impact] of toolImpacts) {
    if (!impact.backwardsCompatible) {
      brokenWorkflows.push(...impact.affectedWorkflows);
    }
  }
  const uniqueBrokenWorkflows = [...new Set(brokenWorkflows)];

  // Determine overall severity and complexity
  const overallSeverity = determineOverallSeverity(toolImpacts, diff);
  const overallMigrationComplexity = determineOverallComplexity(toolImpacts);

  // Generate summary
  const summary = generateImpactSummary(diff, toolImpacts, uniqueBrokenWorkflows);

  // Sort action items by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  actionItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    overallSeverity,
    breakingChangesCount: totalBreakingChanges,
    toolImpacts,
    brokenWorkflows: uniqueBrokenWorkflows,
    overallMigrationComplexity,
    summary,
    actionItems,
  };
}
/**
 * Analyze changes between two schemas and return detailed change information.
 */
export function analyzeSchemaChanges(
  oldSchema: Record<string, unknown> | undefined,
  newSchema: Record<string, unknown> | undefined
): SchemaChangeDetail[] {
  const changes: SchemaChangeDetail[] = [];

  if (!oldSchema && !newSchema) {
    return changes;
  }

  if (!oldSchema && newSchema) {
    // Schema added (new tool or schema now defined)
    return changes;
  }

  if (oldSchema && !newSchema) {
    // Schema removed
    changes.push({
      type: 'parameter_removed',
      parameterPath: 'inputSchema',
      breaking: true,
      before: oldSchema,
      after: null,
      description: 'Input schema has been removed',
    });
    return changes;
  }

  // Compare properties
  const oldProps = (oldSchema?.properties as Record<string, unknown>) || {};
  const newProps = (newSchema?.properties as Record<string, unknown>) || {};
  const oldRequired = (oldSchema?.required as string[]) || [];
  const newRequired = (newSchema?.required as string[]) || [];

  // Check for removed parameters
  for (const [name, oldProp] of Object.entries(oldProps)) {
    if (!(name in newProps)) {
      changes.push({
        type: 'parameter_removed',
        parameterPath: name,
        breaking: true,
        before: oldProp,
        after: null,
        description: `Parameter "${name}" has been removed`,
      });
    }
  }

  // Check for added parameters
  for (const [name, newProp] of Object.entries(newProps)) {
    if (!(name in oldProps)) {
      const isRequired = newRequired.includes(name);
      changes.push({
        type: isRequired ? 'parameter_required_added' : 'parameter_added',
        parameterPath: name,
        breaking: isRequired,
        before: null,
        after: newProp,
        description: isRequired
          ? `New required parameter "${name}" has been added`
          : `New optional parameter "${name}" has been added`,
      });
    }
  }

  // Check for modified parameters
  for (const [name, oldProp] of Object.entries(oldProps)) {
    const newProp = newProps[name];
    if (newProp) {
      const propChanges = analyzePropertyChanges(
        name,
        oldProp as Record<string, unknown>,
        newProp as Record<string, unknown>,
        oldRequired,
        newRequired
      );
      changes.push(...propChanges);
    }
  }

  return changes;
}

/**
 * Analyze changes to a single property.
 */
function analyzePropertyChanges(
  paramName: string,
  oldProp: Record<string, unknown>,
  newProp: Record<string, unknown>,
  oldRequired: string[],
  newRequired: string[]
): SchemaChangeDetail[] {
  const changes: SchemaChangeDetail[] = [];

  // Check type changes
  if (oldProp.type !== newProp.type) {
    changes.push({
      type: 'parameter_type_changed',
      parameterPath: paramName,
      breaking: true,
      before: oldProp.type,
      after: newProp.type,
      description: `Parameter "${paramName}" type changed from "${oldProp.type}" to "${newProp.type}"`,
    });
  }

  // Check required status changes
  const wasRequired = oldRequired.includes(paramName);
  const isRequired = newRequired.includes(paramName);

  if (!wasRequired && isRequired) {
    changes.push({
      type: 'parameter_required_added',
      parameterPath: paramName,
      breaking: true,
      before: 'optional',
      after: 'required',
      description: `Parameter "${paramName}" is now required (was optional)`,
    });
  } else if (wasRequired && !isRequired) {
    changes.push({
      type: 'parameter_required_removed',
      parameterPath: paramName,
      breaking: false,
      before: 'required',
      after: 'optional',
      description: `Parameter "${paramName}" is now optional (was required)`,
    });
  }

  // Check enum changes
  const oldEnum = oldProp.enum as unknown[] | undefined;
  const newEnum = newProp.enum as unknown[] | undefined;

  if (oldEnum && newEnum) {
    // Check for removed enum values
    for (const value of oldEnum) {
      if (!newEnum.includes(value)) {
        changes.push({
          type: 'enum_value_removed',
          parameterPath: `${paramName}.enum`,
          breaking: true,
          before: value,
          after: null,
          description: `Enum value "${value}" removed from parameter "${paramName}"`,
        });
      }
    }

    // Check for added enum values
    for (const value of newEnum) {
      if (!oldEnum.includes(value)) {
        changes.push({
          type: 'enum_value_added',
          parameterPath: `${paramName}.enum`,
          breaking: false,
          before: null,
          after: value,
          description: `Enum value "${value}" added to parameter "${paramName}"`,
        });
      }
    }
  }

  // Check constraint changes (min, max, minLength, maxLength, pattern)
  const constraintProps = ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems'];

  for (const constraint of constraintProps) {
    const oldValue = oldProp[constraint];
    const newValue = newProp[constraint];

    if (oldValue === undefined && newValue !== undefined) {
      // Constraint added
      const isTightening = isConstraintTightening(constraint, undefined, newValue);
      changes.push({
        type: isTightening ? 'constraint_tightened' : 'constraint_added',
        parameterPath: `${paramName}.${constraint}`,
        breaking: isTightening,
        before: oldValue,
        after: newValue,
        description: `Constraint "${constraint}" added to parameter "${paramName}" (value: ${newValue})`,
      });
    } else if (oldValue !== undefined && newValue === undefined) {
      // Constraint removed
      changes.push({
        type: 'constraint_removed',
        parameterPath: `${paramName}.${constraint}`,
        breaking: false,
        before: oldValue,
        after: newValue,
        description: `Constraint "${constraint}" removed from parameter "${paramName}"`,
      });
    } else if (oldValue !== newValue) {
      // Constraint changed
      const isTightening = isConstraintTightening(constraint, oldValue, newValue);
      changes.push({
        type: isTightening ? 'constraint_tightened' : 'constraint_relaxed',
        parameterPath: `${paramName}.${constraint}`,
        breaking: isTightening,
        before: oldValue,
        after: newValue,
        description: `Constraint "${constraint}" changed from ${oldValue} to ${newValue} for parameter "${paramName}"`,
      });
    }
  }

  // Check format changes
  if (oldProp.format !== newProp.format) {
    changes.push({
      type: 'format_changed',
      parameterPath: `${paramName}.format`,
      breaking: true,
      before: oldProp.format,
      after: newProp.format,
      description: `Format changed from "${oldProp.format}" to "${newProp.format}" for parameter "${paramName}"`,
    });
  }

  // Check default value changes
  if (JSON.stringify(oldProp.default) !== JSON.stringify(newProp.default)) {
    changes.push({
      type: 'default_changed',
      parameterPath: `${paramName}.default`,
      breaking: false,
      before: oldProp.default,
      after: newProp.default,
      description: `Default value changed for parameter "${paramName}"`,
    });
  }

  return changes;
}

/**
 * Determine if a constraint change is tightening (more restrictive).
 */
function isConstraintTightening(
  constraint: string,
  oldValue: unknown,
  newValue: unknown
): boolean {
  if (oldValue === undefined) {
    // Adding a constraint is always tightening
    return true;
  }

  const oldNum = typeof oldValue === 'number' ? oldValue : null;
  const newNum = typeof newValue === 'number' ? newValue : null;

  if (oldNum === null || newNum === null) {
    // For pattern changes, any change is potentially breaking
    return constraint === 'pattern';
  }

  switch (constraint) {
    case 'minimum':
    case 'minLength':
    case 'minItems':
      // Increasing minimum is tightening
      return newNum > oldNum;
    case 'maximum':
    case 'maxLength':
    case 'maxItems':
      // Decreasing maximum is tightening
      return newNum < oldNum;
    default:
      return false;
  }
}
/**
 * Calculate risk score based on schema changes.
 */
function calculateRiskScore(changes: SchemaChangeDetail[]): number {
  if (changes.length === 0) {
    return 0;
  }

  let totalScore = 0;

  for (const change of changes) {
    totalScore += CHANGE_IMPACT.RISK_WEIGHTS[change.type] || 0;
  }

  // Normalize to 0-100
  return Math.min(100, totalScore);
}

/**
 * Determine severity from risk score and breaking changes count.
 */
function determineSeverity(riskScore: number, breakingCount: number): ChangeSeverity {
  if (breakingCount > 0 || riskScore >= CHANGE_IMPACT.SEVERITY_THRESHOLDS.breaking) {
    return 'breaking';
  }
  if (riskScore >= CHANGE_IMPACT.SEVERITY_THRESHOLDS.warning) {
    return 'warning';
  }
  if (riskScore >= CHANGE_IMPACT.SEVERITY_THRESHOLDS.info) {
    return 'info';
  }
  return 'none';
}

/**
 * Calculate migration complexity based on changes.
 */
function calculateMigrationComplexity(changes: SchemaChangeDetail[]): MigrationComplexity {
  const breakingChanges = changes.filter(c => c.breaking);
  const count = breakingChanges.length;

  if (count <= CHANGE_IMPACT.COMPLEXITY_THRESHOLDS.trivial) {
    return 'trivial';
  }
  if (count <= CHANGE_IMPACT.COMPLEXITY_THRESHOLDS.simple) {
    return 'simple';
  }
  if (count <= CHANGE_IMPACT.COMPLEXITY_THRESHOLDS.moderate) {
    return 'moderate';
  }
  return 'complex';
}

/**
 * Generate migration suggestion based on changes.
 */
function generateMigrationSuggestion(changes: SchemaChangeDetail[], toolName: string): string {
  const breakingChanges = changes.filter(c => c.breaking);

  if (breakingChanges.length === 0) {
    return `No migration required for "${toolName}". Changes are backwards compatible.`;
  }

  const suggestions: string[] = [`Migration guide for "${toolName}":`];

  for (const change of breakingChanges) {
    switch (change.type) {
      case 'parameter_removed':
        suggestions.push(`- Remove usage of parameter "${change.parameterPath}"`);
        break;
      case 'parameter_required_added':
        suggestions.push(`- Add required parameter "${change.parameterPath}" to all calls`);
        break;
      case 'parameter_type_changed':
        suggestions.push(`- Update "${change.parameterPath}" from ${change.before} to ${change.after}`);
        break;
      case 'enum_value_removed':
        suggestions.push(`- Replace enum value "${change.before}" with a valid alternative`);
        break;
      case 'constraint_tightened':
        suggestions.push(`- Ensure "${change.parameterPath}" meets new constraint: ${change.after}`);
        break;
      case 'format_changed':
        suggestions.push(`- Update format of "${change.parameterPath}" from ${change.before} to ${change.after}`);
        break;
    }
  }

  return suggestions.join('\n');
}
/**
 * Determine overall severity from all tool impacts.
 */
function determineOverallSeverity(
  toolImpacts: Map<string, ChangeImpact>,
  diff: BehavioralDiff
): ChangeSeverity {
  // Removed tools are always breaking
  if (diff.toolsRemoved.length > 0) {
    return 'breaking';
  }

  // Check all tool impacts
  let hasBreaking = false;
  let hasWarning = false;
  let hasInfo = false;

  for (const [, impact] of toolImpacts) {
    if (impact.severity === 'breaking') {
      hasBreaking = true;
    } else if (impact.severity === 'warning') {
      hasWarning = true;
    } else if (impact.severity === 'info') {
      hasInfo = true;
    }
  }

  if (hasBreaking) return 'breaking';
  if (hasWarning) return 'warning';
  if (hasInfo) return 'info';
  return 'none';
}

/**
 * Determine overall migration complexity.
 */
function determineOverallComplexity(
  toolImpacts: Map<string, ChangeImpact>
): MigrationComplexity {
  const complexities = Array.from(toolImpacts.values()).map(i => i.migrationComplexity);

  // Return the highest complexity
  if (complexities.includes('complex')) return 'complex';
  if (complexities.includes('moderate')) return 'moderate';
  if (complexities.includes('simple')) return 'simple';
  return 'trivial';
}

/**
 * Generate a human-readable impact summary.
 */
function generateImpactSummary(
  diff: BehavioralDiff,
  toolImpacts: Map<string, ChangeImpact>,
  brokenWorkflows: string[]
): string {
  const parts: string[] = [];

  // Tools summary
  if (diff.toolsRemoved.length > 0) {
    parts.push(`${diff.toolsRemoved.length} tool(s) removed: ${diff.toolsRemoved.join(', ')}`);
  }
  if (diff.toolsAdded.length > 0) {
    parts.push(`${diff.toolsAdded.length} tool(s) added: ${diff.toolsAdded.join(', ')}`);
  }
  if (diff.toolsModified.length > 0) {
    parts.push(`${diff.toolsModified.length} tool(s) modified`);
  }

  // Breaking changes summary
  let breakingCount = 0;
  for (const [, impact] of toolImpacts) {
    breakingCount += impact.schemaChanges.filter(c => c.breaking).length;
  }

  if (breakingCount > 0) {
    parts.push(`${breakingCount} breaking change(s) detected`);
  }

  // Workflows summary
  if (brokenWorkflows.length > 0) {
    parts.push(`${brokenWorkflows.length} workflow(s) may be affected`);
  }

  return parts.length > 0 ? parts.join('. ') + '.' : 'No changes detected.';
}
/**
 * Check if a behavior change is actually breaking based on semantic analysis.
 * This enhances the simple hash-based comparison with semantic understanding.
 */
export function isBreakingChange(change: BehaviorChange): boolean {
  // Schema changes are always potentially breaking
  if (change.aspect === 'schema') {
    // Check if it's just a description change within schema
    if (change.description.toLowerCase().includes('description')) {
      return false;
    }
    return true;
  }

  // Error handling changes that go from success to failure are breaking
  if (change.aspect === 'error_handling') {
    if (change.before === 'succeeded' && change.after === 'failed') {
      return true;
    }
    return false;
  }

  // Response structure changes could be breaking
  if (change.aspect === 'response_structure') {
    // Check for field removal
    if (change.description.toLowerCase().includes('removed') ||
        change.description.toLowerCase().includes('missing')) {
      return true;
    }
  }

  return change.severity === 'breaking';
}

/**
 * Get a quick summary of breaking changes for CI output.
 */
export function getBreakingChangeSummary(analysis: DiffImpactAnalysis): string {
  if (analysis.breakingChangesCount === 0) {
    return 'No breaking changes detected.';
  }

  const lines: string[] = [
    `Breaking Changes (${analysis.breakingChangesCount}):`,
  ];

  for (const item of analysis.actionItems.filter(a => a.priority === 'critical')) {
    lines.push(`  - ${item.tool}: ${item.description}`);
  }

  if (analysis.brokenWorkflows.length > 0) {
    lines.push(`\nAffected Workflows: ${analysis.brokenWorkflows.join(', ')}`);
  }

  return lines.join('\n');
}
