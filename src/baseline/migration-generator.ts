/**
 * Migration Guide Generator
 *
 * Auto-generates migration guides for breaking changes between baselines.
 * Provides step-by-step instructions, code examples, and effort estimates.
 */

import type {
  BehavioralBaseline,
  BehavioralDiff,
  ChangeSeverity,
} from './types.js';
import { getBaselineGeneratedAt, getToolFingerprints } from './accessors.js';
import {
  analyzeSchemaChanges,
  type SchemaChangeDetail,
  type SchemaChangeType,
} from './change-impact-analyzer.js';
import { MIGRATION_GUIDE } from '../constants.js';
/**
 * Estimated effort level for migration.
 */
export type MigrationEffort = 'trivial' | 'minor' | 'moderate' | 'major';

/**
 * Type of migration step.
 */
export type MigrationStepType =
  | 'add_parameter'
  | 'remove_parameter'
  | 'change_type'
  | 'update_constraint'
  | 'update_enum'
  | 'update_default'
  | 'deprecation'
  | 'tool_removal'
  | 'tool_addition';

/**
 * A single step in the migration process.
 */
export interface MigrationStep {
  /** Step number */
  stepNumber: number;
  /** Type of migration action */
  type: MigrationStepType;
  /** Tool affected */
  toolName: string;
  /** Parameter path (if applicable) */
  parameterPath?: string;
  /** Human-readable title */
  title: string;
  /** Detailed description of what to do */
  description: string;
  /** Whether this step is for a breaking change */
  isBreaking: boolean;
  /** Code examples */
  codeExamples: CodeExample[];
  /** Related schema change */
  schemaChange?: SchemaChangeDetail;
}

/**
 * Code example for a migration step.
 */
export interface CodeExample {
  /** Language (typescript, javascript, etc.) */
  language: string;
  /** Title/description of the example */
  title: string;
  /** Code before migration */
  before: string;
  /** Code after migration */
  after: string;
}

/**
 * A single breaking change with context.
 */
export interface BreakingChange {
  /** Tool name */
  toolName: string;
  /** Type of change */
  changeType: SchemaChangeType;
  /** Parameter affected */
  parameterPath: string;
  /** Value before */
  before: unknown;
  /** Value after */
  after: unknown;
  /** Human-readable description */
  description: string;
  /** Severity */
  severity: ChangeSeverity;
}

/**
 * Complete migration guide between two versions.
 */
export interface MigrationGuide {
  /** Source version/identifier */
  fromVersion: string;
  /** Target version/identifier */
  toVersion: string;
  /** Date range of the migration */
  dateRange: {
    from: Date;
    to: Date;
  };
  /** All breaking changes */
  breakingChanges: BreakingChange[];
  /** Step-by-step migration instructions */
  steps: MigrationStep[];
  /** Code examples for common patterns */
  codeExamples: CodeExample[];
  /** Estimated effort level */
  estimatedEffort: MigrationEffort;
  /** Summary statistics */
  stats: MigrationStats;
  /** Human-readable summary */
  summary: string;
  /** Tools that were removed */
  removedTools: string[];
  /** Tools that were added */
  addedTools: string[];
  /** Warnings or notes */
  warnings: string[];
}

/**
 * Statistics about the migration.
 */
export interface MigrationStats {
  /** Total breaking changes */
  breakingChangesCount: number;
  /** Total tools affected */
  toolsAffected: number;
  /** Total migration steps */
  stepsCount: number;
  /** Breakdown by change type */
  changesByType: Record<SchemaChangeType, number>;
}
/**
 * Generate a migration guide from two baselines.
 */
export function generateMigrationGuide(
  oldBaseline: BehavioralBaseline,
  newBaseline: BehavioralBaseline,
  diff?: BehavioralDiff
): MigrationGuide {
  const breakingChanges: BreakingChange[] = [];
  const steps: MigrationStep[] = [];
  const warnings: string[] = [];
  const changesByType: Record<string, number> = {};
  let stepNumber = 0;

  // Process removed tools
  const removedTools = diff?.toolsRemoved ?? findRemovedTools(oldBaseline, newBaseline);
  for (const toolName of removedTools) {
    const oldTool = getToolFingerprints(oldBaseline).find(t => t.name === toolName);
    if (oldTool) {
      breakingChanges.push({
        toolName,
        changeType: 'parameter_removed',
        parameterPath: toolName,
        before: oldTool,
        after: null,
        description: `Tool "${toolName}" has been removed`,
        severity: 'breaking',
      });

      steps.push({
        stepNumber: ++stepNumber,
        type: 'tool_removal',
        toolName,
        title: `Remove usage of "${toolName}"`,
        description: `The tool "${toolName}" has been removed from the server. Update all code that calls this tool to use an alternative or remove the functionality.`,
        isBreaking: true,
        codeExamples: generateToolRemovalExamples(toolName),
      });

      changesByType['parameter_removed'] = (changesByType['parameter_removed'] || 0) + 1;
    }
  }

  // Process added tools (non-breaking, but noteworthy)
  const addedTools = diff?.toolsAdded ?? findAddedTools(oldBaseline, newBaseline);
  for (const toolName of addedTools) {
    const newTool = getToolFingerprints(newBaseline).find(t => t.name === toolName);
    if (newTool) {
      steps.push({
        stepNumber: ++stepNumber,
        type: 'tool_addition',
        toolName,
        title: `New tool available: "${toolName}"`,
        description: `A new tool "${toolName}" is now available. ${newTool.description}`,
        isBreaking: false,
        codeExamples: generateToolAdditionExamples(toolName, newTool.inputSchema),
      });

      changesByType['parameter_added'] = (changesByType['parameter_added'] || 0) + 1;
    }
  }

  // Process modified tools
  const modifiedToolNames = diff?.toolsModified.map(t => t.tool) ?? findModifiedTools(oldBaseline, newBaseline);
  for (const toolName of modifiedToolNames) {
    const oldTool = getToolFingerprints(oldBaseline).find(t => t.name === toolName);
    const newTool = getToolFingerprints(newBaseline).find(t => t.name === toolName);

    if (oldTool && newTool) {
      const schemaChanges = analyzeSchemaChanges(oldTool.inputSchema, newTool.inputSchema);

      for (const change of schemaChanges) {
        // Track change type
        changesByType[change.type] = (changesByType[change.type] || 0) + 1;

        if (change.breaking) {
          breakingChanges.push({
            toolName,
            changeType: change.type,
            parameterPath: change.parameterPath,
            before: change.before,
            after: change.after,
            description: change.description,
            severity: 'breaking',
          });
        }

        // Generate migration step
        const step = generateMigrationStep(toolName, change, ++stepNumber);
        if (step) {
          steps.push(step);
        }
      }

      // Check for deprecation changes
      if (!oldTool.deprecated && newTool.deprecated) {
        warnings.push(`Tool "${toolName}" has been deprecated. ${newTool.deprecationNotice || ''}`);
        if (newTool.replacementTool) {
          warnings.push(`Consider migrating to "${newTool.replacementTool}".`);
        }
      }
    }
  }

  // Limit steps
  const limitedSteps = steps.slice(0, MIGRATION_GUIDE.MAX_MIGRATION_STEPS);
  if (steps.length > MIGRATION_GUIDE.MAX_MIGRATION_STEPS) {
    warnings.push(`Migration guide truncated: ${steps.length - MIGRATION_GUIDE.MAX_MIGRATION_STEPS} additional steps not shown.`);
  }

  // Calculate effort
  const estimatedEffort = estimateEffort(breakingChanges.length);

  // Generate summary
  const summary = generateSummary(breakingChanges.length, removedTools.length, addedTools.length, estimatedEffort);

  // Generate general code examples
  const codeExamples = generateGeneralExamples(breakingChanges);

  return {
    fromVersion: oldBaseline.version,
    toVersion: newBaseline.version,
    dateRange: {
      from: getBaselineGeneratedAt(oldBaseline),
      to: getBaselineGeneratedAt(newBaseline),
    },
    breakingChanges,
    steps: limitedSteps,
    codeExamples,
    estimatedEffort,
    stats: {
      breakingChangesCount: breakingChanges.length,
      toolsAffected: new Set([...removedTools, ...addedTools, ...modifiedToolNames]).size,
      stepsCount: limitedSteps.length,
      changesByType: changesByType as Record<SchemaChangeType, number>,
    },
    summary,
    removedTools,
    addedTools,
    warnings,
  };
}
/**
 * Find tools that were removed.
 */
function findRemovedTools(oldBaseline: BehavioralBaseline, newBaseline: BehavioralBaseline): string[] {
  const newToolNames = new Set(getToolFingerprints(newBaseline).map(t => t.name));
  return getToolFingerprints(oldBaseline).filter(t => !newToolNames.has(t.name)).map(t => t.name);
}

/**
 * Find tools that were added.
 */
function findAddedTools(oldBaseline: BehavioralBaseline, newBaseline: BehavioralBaseline): string[] {
  const oldToolNames = new Set(getToolFingerprints(oldBaseline).map(t => t.name));
  return getToolFingerprints(newBaseline).filter(t => !oldToolNames.has(t.name)).map(t => t.name);
}

/**
 * Find tools that were modified.
 */
function findModifiedTools(oldBaseline: BehavioralBaseline, newBaseline: BehavioralBaseline): string[] {
  const modified: string[] = [];
  const oldToolMap = new Map(getToolFingerprints(oldBaseline).map(t => [t.name, t]));

  for (const newTool of getToolFingerprints(newBaseline)) {
    const oldTool = oldToolMap.get(newTool.name);
    if (oldTool && oldTool.schemaHash !== newTool.schemaHash) {
      modified.push(newTool.name);
    }
  }

  return modified;
}

/**
 * Generate a migration step for a schema change.
 */
function generateMigrationStep(
  toolName: string,
  change: SchemaChangeDetail,
  stepNumber: number
): MigrationStep | null {
  const { type, parameterPath, before, after, description, breaking } = change;

  switch (type) {
    case 'parameter_removed':
      return {
        stepNumber,
        type: 'remove_parameter',
        toolName,
        parameterPath,
        title: `Remove parameter "${parameterPath}" from ${toolName}`,
        description: `The parameter "${parameterPath}" has been removed. Update all calls to "${toolName}" that use this parameter.`,
        isBreaking: breaking,
        codeExamples: generateParameterRemovalExamples(toolName, parameterPath),
        schemaChange: change,
      };

    case 'parameter_required_added':
      return {
        stepNumber,
        type: 'add_parameter',
        toolName,
        parameterPath,
        title: `Add required parameter "${parameterPath}" to ${toolName}`,
        description: `A new required parameter "${parameterPath}" has been added. All calls to "${toolName}" must now include this parameter.`,
        isBreaking: breaking,
        codeExamples: generateRequiredParameterExamples(toolName, parameterPath, after),
        schemaChange: change,
      };

    case 'parameter_added':
      return {
        stepNumber,
        type: 'add_parameter',
        toolName,
        parameterPath,
        title: `New optional parameter "${parameterPath}" available for ${toolName}`,
        description: `A new optional parameter "${parameterPath}" is now available. You can use it to ${description.toLowerCase()}.`,
        isBreaking: false,
        codeExamples: [],
        schemaChange: change,
      };

    case 'parameter_type_changed':
      return {
        stepNumber,
        type: 'change_type',
        toolName,
        parameterPath,
        title: `Update type of "${parameterPath}" in ${toolName}`,
        description: `The type of "${parameterPath}" has changed from ${before} to ${after}. Update all values passed to this parameter.`,
        isBreaking: breaking,
        codeExamples: generateTypeChangeExamples(toolName, parameterPath, before, after),
        schemaChange: change,
      };

    case 'enum_value_removed':
      return {
        stepNumber,
        type: 'update_enum',
        toolName,
        parameterPath,
        title: `Update enum values for "${parameterPath}" in ${toolName}`,
        description: `The enum value "${before}" has been removed from "${parameterPath}". Update any code using this value.`,
        isBreaking: breaking,
        codeExamples: generateEnumChangeExamples(toolName, parameterPath, before as string),
        schemaChange: change,
      };

    case 'constraint_tightened':
      return {
        stepNumber,
        type: 'update_constraint',
        toolName,
        parameterPath,
        title: `Update values for "${parameterPath}" in ${toolName}`,
        description: `The constraint for "${parameterPath}" has been tightened. Ensure all values meet the new constraint: ${after}.`,
        isBreaking: breaking,
        codeExamples: [],
        schemaChange: change,
      };

    default:
      // For non-critical changes, return a generic step
      if (breaking) {
        return {
          stepNumber,
          type: 'update_constraint',
          toolName,
          parameterPath,
          title: `Update "${parameterPath}" in ${toolName}`,
          description,
          isBreaking: true,
          codeExamples: [],
          schemaChange: change,
        };
      }
      return null;
  }
}

/**
 * Estimate migration effort based on breaking changes.
 */
function estimateEffort(breakingCount: number): MigrationEffort {
  if (breakingCount <= MIGRATION_GUIDE.EFFORT_THRESHOLDS.trivial) {
    return 'trivial';
  }
  if (breakingCount <= MIGRATION_GUIDE.EFFORT_THRESHOLDS.minor) {
    return 'minor';
  }
  if (breakingCount <= MIGRATION_GUIDE.EFFORT_THRESHOLDS.moderate) {
    return 'moderate';
  }
  return 'major';
}

/**
 * Generate summary text.
 */
function generateSummary(
  breakingCount: number,
  removedCount: number,
  addedCount: number,
  effort: MigrationEffort
): string {
  const parts: string[] = [];

  if (breakingCount === 0) {
    parts.push('This migration contains no breaking changes.');
  } else {
    parts.push(`This migration contains ${breakingCount} breaking change(s).`);
  }

  if (removedCount > 0) {
    parts.push(`${removedCount} tool(s) have been removed.`);
  }

  if (addedCount > 0) {
    parts.push(`${addedCount} new tool(s) are available.`);
  }

  parts.push(`Estimated effort: ${effort.toUpperCase()}.`);

  return parts.join(' ');
}
/**
 * Generate examples for tool removal.
 */
function generateToolRemovalExamples(toolName: string): CodeExample[] {
  return [{
    language: 'typescript',
    title: `Remove calls to ${toolName}`,
    before: `// Old code using the removed tool
const result = await mcp.callTool('${toolName}', {
  param: 'value'
});`,
    after: `// The tool has been removed
// Option 1: Remove the functionality
// Option 2: Use an alternative tool if available
// Option 3: Implement the functionality differently`,
  }];
}

/**
 * Generate examples for tool addition.
 */
function generateToolAdditionExamples(toolName: string, schema?: Record<string, unknown>): CodeExample[] {
  const params = schema?.properties
    ? Object.keys(schema.properties as Record<string, unknown>).slice(0, 3).join(', ')
    : 'param1, param2';

  return [{
    language: 'typescript',
    title: `Use the new ${toolName} tool`,
    before: `// Tool was not available before`,
    after: `// New tool is now available
const result = await mcp.callTool('${toolName}', {
  ${params.split(', ').map(p => `${p}: /* value */`).join(',\n  ')}
});`,
  }];
}

/**
 * Generate examples for parameter removal.
 */
function generateParameterRemovalExamples(toolName: string, parameterPath: string): CodeExample[] {
  return [{
    language: 'typescript',
    title: `Remove "${parameterPath}" from ${toolName} calls`,
    before: `const result = await mcp.callTool('${toolName}', {
  ${parameterPath}: 'value',  // This parameter is being removed
  otherParam: 'other'
});`,
    after: `const result = await mcp.callTool('${toolName}', {
  // ${parameterPath} has been removed
  otherParam: 'other'
});`,
  }];
}

/**
 * Generate examples for required parameter addition.
 */
function generateRequiredParameterExamples(
  toolName: string,
  parameterPath: string,
  newSchema: unknown
): CodeExample[] {
  const typeHint = typeof newSchema === 'object' && newSchema !== null && 'type' in newSchema
    ? (newSchema as { type: string }).type
    : 'string';

  return [{
    language: 'typescript',
    title: `Add required "${parameterPath}" to ${toolName} calls`,
    before: `const result = await mcp.callTool('${toolName}', {
  existingParam: 'value'
});`,
    after: `const result = await mcp.callTool('${toolName}', {
  existingParam: 'value',
  ${parameterPath}: /* ${typeHint} - REQUIRED */
});`,
  }];
}

/**
 * Generate examples for type changes.
 */
function generateTypeChangeExamples(
  toolName: string,
  parameterPath: string,
  oldType: unknown,
  newType: unknown
): CodeExample[] {
  return [{
    language: 'typescript',
    title: `Update "${parameterPath}" type in ${toolName} calls`,
    before: `const result = await mcp.callTool('${toolName}', {
  ${parameterPath}: /* ${oldType} */
});`,
    after: `const result = await mcp.callTool('${toolName}', {
  ${parameterPath}: /* ${newType} - type changed! */
});`,
  }];
}

/**
 * Generate examples for enum changes.
 */
function generateEnumChangeExamples(
  toolName: string,
  parameterPath: string,
  removedValue: string
): CodeExample[] {
  return [{
    language: 'typescript',
    title: `Update enum value for "${parameterPath}" in ${toolName}`,
    before: `const result = await mcp.callTool('${toolName}', {
  ${parameterPath}: '${removedValue}'  // This value is no longer valid
});`,
    after: `const result = await mcp.callTool('${toolName}', {
  ${parameterPath}: /* use a different valid value */
});`,
  }];
}

/**
 * Generate general code examples based on breaking changes.
 */
function generateGeneralExamples(breakingChanges: BreakingChange[]): CodeExample[] {
  const examples: CodeExample[] = [];

  // Group by tool
  const byTool = new Map<string, BreakingChange[]>();
  for (const change of breakingChanges) {
    const existing = byTool.get(change.toolName) || [];
    existing.push(change);
    byTool.set(change.toolName, existing);
  }

  // Generate combined example for tools with multiple changes
  for (const [toolName, changes] of byTool) {
    if (changes.length > 1 && examples.length < MIGRATION_GUIDE.MAX_CODE_EXAMPLES_PER_STEP) {
      const beforeParams = changes.map(c => `  ${c.parameterPath}: /* old */`).join(',\n');
      const afterParams = changes.map(c => `  ${c.parameterPath}: /* updated */`).join(',\n');

      examples.push({
        language: 'typescript',
        title: `Update multiple parameters in ${toolName}`,
        before: `const result = await mcp.callTool('${toolName}', {\n${beforeParams}\n});`,
        after: `const result = await mcp.callTool('${toolName}', {\n${afterParams}\n});`,
      });
    }
  }

  return examples;
}
/**
 * Format migration guide as markdown.
 */
export function formatMigrationGuideMarkdown(guide: MigrationGuide): string {
  const lines: string[] = [];

  lines.push(`# Migration Guide: ${guide.fromVersion} → ${guide.toVersion}`);
  lines.push('');
  lines.push(`**Date Range:** ${guide.dateRange.from.toISOString().split('T')[0]} to ${guide.dateRange.to.toISOString().split('T')[0]}`);
  lines.push(`**Estimated Effort:** ${guide.estimatedEffort.toUpperCase()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(guide.summary);
  lines.push('');

  // Statistics
  lines.push('## Statistics');
  lines.push('');
  lines.push(`- **Breaking Changes:** ${guide.stats.breakingChangesCount}`);
  lines.push(`- **Tools Affected:** ${guide.stats.toolsAffected}`);
  lines.push(`- **Migration Steps:** ${guide.stats.stepsCount}`);
  lines.push('');

  // Warnings
  if (guide.warnings.length > 0) {
    lines.push('## ⚠️ Warnings');
    lines.push('');
    for (const warning of guide.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  // Breaking changes
  if (guide.breakingChanges.length > 0) {
    lines.push('## Breaking Changes');
    lines.push('');
    for (const change of guide.breakingChanges) {
      lines.push(`### ${change.toolName}: ${change.parameterPath}`);
      lines.push('');
      lines.push(`**Type:** ${change.changeType}`);
      lines.push('');
      lines.push(change.description);
      lines.push('');
    }
  }

  // Migration steps
  if (guide.steps.length > 0) {
    lines.push('## Migration Steps');
    lines.push('');
    for (const step of guide.steps) {
      const breakingBadge = step.isBreaking ? ' ⚠️' : '';
      lines.push(`### Step ${step.stepNumber}: ${step.title}${breakingBadge}`);
      lines.push('');
      lines.push(step.description);
      lines.push('');

      for (const example of step.codeExamples) {
        lines.push(`**${example.title}**`);
        lines.push('');
        lines.push('Before:');
        lines.push(`\`\`\`${example.language}`);
        lines.push(example.before);
        lines.push('```');
        lines.push('');
        lines.push('After:');
        lines.push(`\`\`\`${example.language}`);
        lines.push(example.after);
        lines.push('```');
        lines.push('');
      }
    }
  }

  // Added tools
  if (guide.addedTools.length > 0) {
    lines.push('## New Tools Available');
    lines.push('');
    for (const tool of guide.addedTools) {
      lines.push(`- \`${tool}\``);
    }
    lines.push('');
  }

  // Removed tools
  if (guide.removedTools.length > 0) {
    lines.push('## Removed Tools');
    lines.push('');
    for (const tool of guide.removedTools) {
      lines.push(`- \`${tool}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format migration guide for console output.
 */
export function formatMigrationGuideText(guide: MigrationGuide): string {
  const lines: string[] = [];

  lines.push(`Migration Guide: ${guide.fromVersion} → ${guide.toVersion}`);
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(guide.summary);
  lines.push('');
  lines.push(`Estimated Effort: ${guide.estimatedEffort.toUpperCase()}`);
  lines.push(`Breaking Changes: ${guide.stats.breakingChangesCount}`);
  lines.push(`Tools Affected: ${guide.stats.toolsAffected}`);
  lines.push('');

  if (guide.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of guide.warnings) {
      lines.push(`  ⚠️ ${warning}`);
    }
    lines.push('');
  }

  if (guide.steps.length > 0) {
    lines.push('Migration Steps:');
    lines.push('─'.repeat(40));
    for (const step of guide.steps.filter(s => s.isBreaking)) {
      const icon = step.isBreaking ? '!' : ' ';
      lines.push(`  ${icon} Step ${step.stepNumber}: ${step.title}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check if a migration guide contains breaking changes that require action.
 */
export function hasBreakingMigrationChanges(guide: MigrationGuide): boolean {
  return guide.breakingChanges.length > 0;
}

/**
 * Get breaking tools from guide.
 */
export function getBreakingTools(guide: MigrationGuide): string[] {
  const tools = new Set<string>();
  for (const change of guide.breakingChanges) {
    tools.add(change.toolName);
  }
  return Array.from(tools);
}
