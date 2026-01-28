/**
 * Enhanced GitHub PR comment generation for schema changes.
 *
 * This module generates detailed, actionable PR comments that help reviewers
 * understand the impact of schema changes on downstream consumers.
 */

import { PR_COMMENTS } from '../constants.js';
import type {
  BehavioralDiff,
  BehaviorChange,
  ToolDiff,
  ChangeSeverity,
} from './types.js';
import type { MigrationGuide } from './migration-generator.js';
/**
 * Severity badge configuration.
 */
export type BadgeColor = 'red' | 'orange' | 'blue' | 'green';

/**
 * A section in the PR comment.
 */
export interface CommentSection {
  title: string;
  content: string;
  priority: number;
  collapsed?: boolean;
}

/**
 * Affected workflow information for PR comments.
 */
export interface AffectedWorkflow {
  name: string;
  description: string;
  affectedTools: string[];
  severity: ChangeSeverity;
}

/**
 * Complete PR comment structure.
 */
export interface PRComment {
  /** Main title/header */
  title: string;
  /** Summary of changes */
  summary: string;
  /** Severity badge */
  badge: {
    label: string;
    color: BadgeColor;
    message: string;
  };
  /** Detailed sections */
  sections: CommentSection[];
  /** Quick action items */
  actionItems: string[];
  /** Footer with metadata */
  footer: string;
  /** Full rendered markdown */
  markdown: string;
}

/**
 * Configuration for PR comment generation.
 */
export interface PRCommentConfig {
  /** Maximum tools to show in detail */
  maxDetailedTools?: number;
  /** Maximum changes per tool */
  maxChangesPerTool?: number;
  /** Maximum affected workflows to show */
  maxAffectedWorkflows?: number;
  /** Include migration examples */
  includeMigrationExamples?: boolean;
  /** Maximum migration examples */
  maxMigrationExamples?: number;
  /** Include collapsible sections */
  useCollapsibleSections?: boolean;
  /** Repository URL for linking */
  repositoryUrl?: string;
  /** Base branch name */
  baseBranch?: string;
  /** Head branch name */
  headBranch?: string;
}
/**
 * Get badge color for severity level.
 */
export function getBadgeColor(severity: ChangeSeverity): BadgeColor {
  return PR_COMMENTS.BADGE_COLORS[severity] as BadgeColor;
}

/**
 * Generate a shields.io badge URL.
 */
export function generateBadgeUrl(label: string, message: string, color: BadgeColor): string {
  const encodedLabel = encodeURIComponent(label);
  const encodedMessage = encodeURIComponent(message);
  return `https://img.shields.io/badge/${encodedLabel}-${encodedMessage}-${color}`;
}

/**
 * Generate a markdown badge.
 */
export function generateBadgeMarkdown(label: string, message: string, color: BadgeColor): string {
  const url = generateBadgeUrl(label, message, color);
  return `![${label}](${url})`;
}
/**
 * Generate the summary section.
 */
function generateSummarySection(diff: BehavioralDiff): CommentSection {
  const lines: string[] = [];

  // High-level stats
  const stats = [
    diff.toolsAdded.length > 0 ? `**${diff.toolsAdded.length}** tools added` : null,
    diff.toolsRemoved.length > 0 ? `**${diff.toolsRemoved.length}** tools removed` : null,
    diff.toolsModified.length > 0 ? `**${diff.toolsModified.length}** tools modified` : null,
  ].filter(Boolean);

  if (stats.length > 0) {
    lines.push(stats.join(' | '));
    lines.push('');
  }

  // Change counts by severity
  if (diff.breakingCount > 0 || diff.warningCount > 0 || diff.infoCount > 0) {
    const counts: string[] = [];
    if (diff.breakingCount > 0) counts.push(`🔴 ${diff.breakingCount} breaking`);
    if (diff.warningCount > 0) counts.push(`🟠 ${diff.warningCount} warnings`);
    if (diff.infoCount > 0) counts.push(`🔵 ${diff.infoCount} info`);
    lines.push(counts.join(' | '));
  }

  return {
    title: 'Summary',
    content: lines.join('\n'),
    priority: 1,
  };
}

/**
 * Generate breaking changes section.
 */
function generateBreakingChangesSection(
  diff: BehavioralDiff,
  config: PRCommentConfig
): CommentSection | null {
  const breakingChanges = diff.behaviorChanges.filter(c => c.severity === 'breaking');

  if (breakingChanges.length === 0) {
    return null;
  }

  const lines: string[] = ['> ⚠️ **These changes may break existing integrations**', ''];

  // Group by tool
  const byTool = new Map<string, BehaviorChange[]>();
  for (const change of breakingChanges) {
    const existing = byTool.get(change.tool) || [];
    existing.push(change);
    byTool.set(change.tool, existing);
  }

  let toolCount = 0;
  for (const [toolName, changes] of byTool) {
    if (toolCount >= (config.maxDetailedTools ?? PR_COMMENTS.MAX_DETAILED_TOOLS)) {
      lines.push(`\n*...and ${byTool.size - toolCount} more tools with breaking changes*`);
      break;
    }

    lines.push(`### \`${toolName}\``);
    lines.push('');

    const displayChanges = changes.slice(0, config.maxChangesPerTool ?? PR_COMMENTS.MAX_CHANGES_PER_TOOL);
    for (const change of displayChanges) {
      lines.push(`- **${formatAspect(change.aspect)}**: ${change.description}`);
      if (change.before && change.after) {
        lines.push(`  - Before: \`${truncate(change.before)}\``);
        lines.push(`  - After: \`${truncate(change.after)}\``);
      }
    }

    if (changes.length > displayChanges.length) {
      lines.push(`  - *...and ${changes.length - displayChanges.length} more changes*`);
    }

    lines.push('');
    toolCount++;
  }

  return {
    title: '🔴 Breaking Changes',
    content: lines.join('\n'),
    priority: 2,
  };
}

/**
 * Generate tools added section.
 */
function generateToolsAddedSection(diff: BehavioralDiff): CommentSection | null {
  if (diff.toolsAdded.length === 0) {
    return null;
  }

  const lines: string[] = [];

  for (const tool of diff.toolsAdded.slice(0, PR_COMMENTS.MAX_DETAILED_TOOLS)) {
    lines.push(`- \`${tool}\``);
  }

  if (diff.toolsAdded.length > PR_COMMENTS.MAX_DETAILED_TOOLS) {
    lines.push(`- *...and ${diff.toolsAdded.length - PR_COMMENTS.MAX_DETAILED_TOOLS} more*`);
  }

  return {
    title: '✅ Tools Added',
    content: lines.join('\n'),
    priority: 4,
  };
}

/**
 * Generate tools removed section.
 */
function generateToolsRemovedSection(diff: BehavioralDiff): CommentSection | null {
  if (diff.toolsRemoved.length === 0) {
    return null;
  }

  const lines: string[] = [
    '> ⚠️ **Removing tools is a breaking change for consumers**',
    '',
  ];

  for (const tool of diff.toolsRemoved) {
    lines.push(`- ~~\`${tool}\`~~`);
  }

  return {
    title: '❌ Tools Removed',
    content: lines.join('\n'),
    priority: 3,
  };
}

/**
 * Generate modified tools section.
 */
function generateModifiedToolsSection(
  diff: BehavioralDiff,
  config: PRCommentConfig
): CommentSection | null {
  // Filter out breaking changes (shown separately)
  const nonBreakingModified = diff.toolsModified.filter(
    t => !t.changes.some(c => c.severity === 'breaking')
  );

  if (nonBreakingModified.length === 0) {
    return null;
  }

  const lines: string[] = [];
  const maxTools = config.maxDetailedTools ?? PR_COMMENTS.MAX_DETAILED_TOOLS;

  for (const toolDiff of nonBreakingModified.slice(0, maxTools)) {
    lines.push(`### \`${toolDiff.tool}\``);
    lines.push('');

    const changes = toolDiff.changes.slice(0, config.maxChangesPerTool ?? PR_COMMENTS.MAX_CHANGES_PER_TOOL);
    for (const change of changes) {
      const icon = change.severity === 'warning' ? '🟠' : '🔵';
      lines.push(`- ${icon} **${formatAspect(change.aspect)}**: ${change.description}`);
    }

    if (toolDiff.changes.length > changes.length) {
      lines.push(`- *...and ${toolDiff.changes.length - changes.length} more changes*`);
    }

    lines.push('');
  }

  if (nonBreakingModified.length > maxTools) {
    lines.push(`*...and ${nonBreakingModified.length - maxTools} more modified tools*`);
  }

  return {
    title: '📝 Tools Modified',
    content: lines.join('\n'),
    priority: 5,
    collapsed: nonBreakingModified.length > 3,
  };
}

/**
 * Generate migration guide section.
 */
function generateMigrationSection(
  guide: MigrationGuide | undefined,
  config: PRCommentConfig
): CommentSection | null {
  if (!guide || guide.steps.length === 0 || !config.includeMigrationExamples) {
    return null;
  }

  const lines: string[] = [
    `**Estimated effort**: ${guide.estimatedEffort.toUpperCase()}`,
    `**Breaking changes**: ${guide.stats.breakingChangesCount}`,
    '',
    '### Steps',
    '',
  ];

  const maxSteps = config.maxMigrationExamples ?? PR_COMMENTS.MAX_MIGRATION_EXAMPLES;
  const steps = guide.steps.slice(0, maxSteps);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    lines.push(`${i + 1}. **${step.title}**`);
    lines.push(`   - Tool: \`${step.toolName}\``);

    if (step.codeExamples && step.codeExamples.length > 0) {
      const example = step.codeExamples[0];
      lines.push('');
      lines.push('   ```' + (example.language || ''));
      lines.push('   // Before:');
      lines.push('   ' + example.before.split('\n').join('\n   '));
      lines.push('');
      lines.push('   // After:');
      lines.push('   ' + example.after.split('\n').join('\n   '));
      lines.push('   ```');
    }

    lines.push('');
  }

  if (guide.steps.length > maxSteps) {
    lines.push(`*...and ${guide.steps.length - maxSteps} more migration steps*`);
  }

  return {
    title: '🔄 Migration Guide',
    content: lines.join('\n'),
    priority: 6,
    collapsed: true,
  };
}

/**
 * Generate affected workflows section.
 */
function generateAffectedWorkflowsSection(
  workflows: AffectedWorkflow[],
  config: PRCommentConfig
): CommentSection | null {
  if (!workflows || workflows.length === 0) {
    return null;
  }

  const lines: string[] = [];
  const maxWorkflows = config.maxAffectedWorkflows ?? PR_COMMENTS.MAX_AFFECTED_WORKFLOWS;

  for (const workflow of workflows.slice(0, maxWorkflows)) {
    const icon = workflow.severity === 'breaking' ? '🔴' : workflow.severity === 'warning' ? '🟠' : '🔵';
    lines.push(`- ${icon} **${workflow.name}**: ${workflow.description}`);
    lines.push(`  - Tools: ${workflow.affectedTools.map(t => `\`${t}\``).join(', ')}`);
  }

  if (workflows.length > maxWorkflows) {
    lines.push(`\n*...and ${workflows.length - maxWorkflows} more affected workflows*`);
  }

  return {
    title: '⚡ Affected Workflows',
    content: lines.join('\n'),
    priority: 7,
    collapsed: true,
  };
}

/**
 * Generate action items based on changes.
 */
function generateActionItems(diff: BehavioralDiff): string[] {
  const items: string[] = [];

  if (diff.toolsRemoved.length > 0) {
    items.push('[ ] Update consumer applications to handle removed tools');
  }

  if (diff.breakingCount > 0) {
    items.push('[ ] Review breaking changes with team before merging');
    items.push('[ ] Update documentation for changed tool schemas');
  }

  const schemaChanges = diff.toolsModified.filter(t => t.schemaChanged);
  if (schemaChanges.length > 0) {
    items.push('[ ] Verify client SDKs are updated for schema changes');
  }

  if (diff.toolsAdded.length > 0) {
    items.push('[ ] Add tests for new tools');
    items.push('[ ] Update API documentation');
  }

  // Add testing recommendations
  if (diff.severity === 'breaking' || diff.severity === 'warning') {
    items.push('[ ] Run integration tests with downstream consumers');
  }

  return items;
}
/**
 * Format a behavior aspect for display.
 */
function formatAspect(aspect: string): string {
  return aspect
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Truncate a string for display.
 */
function truncate(value: string, maxLength: number = PR_COMMENTS.VALUE_TRUNCATE_LENGTH): string {
  if (value.length <= maxLength) return value;
  return value.substring(0, maxLength - 3) + '...';
}

/**
 * Render a collapsible section.
 */
function renderCollapsibleSection(title: string, content: string): string {
  return `<details>\n<summary>${title}</summary>\n\n${content}\n\n</details>`;
}

/**
 * Generate footer with metadata.
 */
function generateFooter(config: PRCommentConfig): string {
  const lines: string[] = ['---'];

  const parts: string[] = [];

  if (config.baseBranch && config.headBranch) {
    parts.push(`Comparing \`${config.baseBranch}\` → \`${config.headBranch}\``);
  }

  parts.push('Generated by [Bellwether](https://github.com/dotsetlabs/bellwether)');

  lines.push(parts.join(' | '));

  return lines.join('\n');
}
/**
 * Generate a complete PR comment for a behavioral diff.
 */
export function generatePRComment(
  diff: BehavioralDiff,
  config: PRCommentConfig = {},
  migrationGuide?: MigrationGuide,
  affectedWorkflows?: AffectedWorkflow[]
): PRComment {
  const {
    includeMigrationExamples = true,
    useCollapsibleSections = true,
  } = config;

  // Determine badge
  const badgeLabel = 'Schema Drift';
  let badgeMessage: string;
  let badgeColor: BadgeColor;

  if (diff.severity === 'breaking') {
    badgeMessage = `${diff.breakingCount} breaking`;
    badgeColor = 'red';
  } else if (diff.severity === 'warning') {
    badgeMessage = `${diff.warningCount} warnings`;
    badgeColor = 'orange';
  } else if (diff.severity === 'info') {
    badgeMessage = 'changes detected';
    badgeColor = 'blue';
  } else {
    badgeMessage = 'no changes';
    badgeColor = 'green';
  }

  // Generate sections
  const sections: CommentSection[] = [];

  sections.push(generateSummarySection(diff));

  const breakingSection = generateBreakingChangesSection(diff, config);
  if (breakingSection) sections.push(breakingSection);

  const removedSection = generateToolsRemovedSection(diff);
  if (removedSection) sections.push(removedSection);

  const addedSection = generateToolsAddedSection(diff);
  if (addedSection) sections.push(addedSection);

  const modifiedSection = generateModifiedToolsSection(diff, config);
  if (modifiedSection) sections.push(modifiedSection);

  if (includeMigrationExamples) {
    const migrationSection = generateMigrationSection(migrationGuide, config);
    if (migrationSection) sections.push(migrationSection);
  }

  const workflowsSection = generateAffectedWorkflowsSection(affectedWorkflows || [], config);
  if (workflowsSection) sections.push(workflowsSection);

  // Sort by priority
  sections.sort((a, b) => a.priority - b.priority);

  // Generate action items
  const actionItems = generateActionItems(diff);

  // Generate footer
  const footer = generateFooter(config);

  // Generate title
  const title = diff.severity === 'none'
    ? '✅ No Schema Drift Detected'
    : diff.severity === 'breaking'
      ? '🚨 Breaking Schema Changes Detected'
      : diff.severity === 'warning'
        ? '⚠️ Schema Changes Detected'
        : 'ℹ️ Minor Schema Changes';

  // Render full markdown
  const markdownLines: string[] = [
    `## ${title}`,
    '',
    generateBadgeMarkdown(badgeLabel, badgeMessage, badgeColor),
    '',
  ];

  // Add sections
  for (const section of sections) {
    if (useCollapsibleSections && section.collapsed) {
      markdownLines.push(renderCollapsibleSection(`### ${section.title}`, section.content));
    } else {
      markdownLines.push(`### ${section.title}`);
      markdownLines.push('');
      markdownLines.push(section.content);
    }
    markdownLines.push('');
  }

  // Add action items
  if (actionItems.length > 0) {
    markdownLines.push('### 📋 Action Items');
    markdownLines.push('');
    for (const item of actionItems) {
      markdownLines.push(`- ${item}`);
    }
    markdownLines.push('');
  }

  // Add footer
  markdownLines.push(footer);

  return {
    title,
    summary: diff.summary,
    badge: {
      label: badgeLabel,
      color: badgeColor,
      message: badgeMessage,
    },
    sections,
    actionItems,
    footer,
    markdown: markdownLines.join('\n'),
  };
}

/**
 * Generate a compact PR comment for simple diffs.
 */
export function generateCompactPRComment(diff: BehavioralDiff): string {
  if (diff.severity === 'none') {
    return '✅ **No schema drift detected** - baseline matches current server state.';
  }

  const lines: string[] = [];

  // Header with badge
  const badgeColor = getBadgeColor(diff.severity);
  const badgeMessage = diff.severity === 'breaking'
    ? `${diff.breakingCount} breaking`
    : diff.severity === 'warning'
      ? `${diff.warningCount} warnings`
      : 'changes detected';

  lines.push(`## Schema Drift Report ${generateBadgeMarkdown('drift', badgeMessage, badgeColor)}`);
  lines.push('');

  // Quick stats
  const stats: string[] = [];
  if (diff.toolsAdded.length > 0) stats.push(`+${diff.toolsAdded.length} added`);
  if (diff.toolsRemoved.length > 0) stats.push(`-${diff.toolsRemoved.length} removed`);
  if (diff.toolsModified.length > 0) stats.push(`~${diff.toolsModified.length} modified`);

  if (stats.length > 0) {
    lines.push(`**Tools**: ${stats.join(', ')}`);
  }

  // Breaking changes summary
  if (diff.breakingCount > 0) {
    lines.push('');
    lines.push('**Breaking changes:**');
    const breakingChanges = diff.behaviorChanges
      .filter(c => c.severity === 'breaking')
      .slice(0, 5);

    for (const change of breakingChanges) {
      lines.push(`- \`${change.tool}\`: ${change.description}`);
    }

    if (diff.breakingCount > 5) {
      lines.push(`- *...and ${diff.breakingCount - 5} more*`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('*Generated by [Bellwether](https://github.com/dotsetlabs/bellwether)*');

  return lines.join('\n');
}

/**
 * Generate a status check summary for CI.
 */
export function generateCIStatusSummary(diff: BehavioralDiff): {
  conclusion: 'success' | 'failure' | 'neutral';
  title: string;
  summary: string;
} {
  if (diff.severity === 'breaking') {
    return {
      conclusion: 'failure',
      title: `${diff.breakingCount} breaking change(s) detected`,
      summary: `Schema drift analysis found ${diff.breakingCount} breaking changes that may affect consumers.`,
    };
  }

  if (diff.severity === 'warning') {
    return {
      conclusion: 'neutral',
      title: `${diff.warningCount} warning(s) detected`,
      summary: `Schema drift analysis found ${diff.warningCount} changes that should be reviewed.`,
    };
  }

  if (diff.severity === 'info') {
    return {
      conclusion: 'success',
      title: 'Minor changes detected',
      summary: `Schema drift analysis found ${diff.infoCount} informational change(s).`,
    };
  }

  return {
    conclusion: 'success',
    title: 'No drift detected',
    summary: 'Schema matches the baseline - no changes detected.',
  };
}

/**
 * Generate diff visualization as a table.
 */
export function generateDiffTable(toolDiffs: ToolDiff[]): string {
  if (toolDiffs.length === 0) {
    return '*No tool modifications*';
  }

  const lines: string[] = [
    '| Tool | Changes | Schema | Description |',
    '|------|---------|--------|-------------|',
  ];

  for (const toolDiff of toolDiffs.slice(0, PR_COMMENTS.MAX_DETAILED_TOOLS)) {
    const breakingCount = toolDiff.changes.filter(c => c.severity === 'breaking').length;
    const warningCount = toolDiff.changes.filter(c => c.severity === 'warning').length;
    const infoCount = toolDiff.changes.filter(c => c.severity === 'info').length;

    const changeIndicators: string[] = [];
    if (breakingCount > 0) changeIndicators.push(`🔴${breakingCount}`);
    if (warningCount > 0) changeIndicators.push(`🟠${warningCount}`);
    if (infoCount > 0) changeIndicators.push(`🔵${infoCount}`);

    const schemaStatus = toolDiff.schemaChanged ? '⚠️ Changed' : '✅ OK';
    const descStatus = toolDiff.descriptionChanged ? '⚠️ Changed' : '✅ OK';

    lines.push(
      `| \`${toolDiff.tool}\` | ${changeIndicators.join(' ') || '—'} | ${schemaStatus} | ${descStatus} |`
    );
  }

  if (toolDiffs.length > PR_COMMENTS.MAX_DETAILED_TOOLS) {
    lines.push(`| *...and ${toolDiffs.length - PR_COMMENTS.MAX_DETAILED_TOOLS} more* | | | |`);
  }

  return lines.join('\n');
}

/**
 * Determine if a PR comment should block merge.
 */
export function shouldBlockMerge(diff: BehavioralDiff, strictMode: boolean = true): boolean {
  if (strictMode) {
    return diff.severity === 'breaking';
  }
  return false;
}

/**
 * Get emoji for severity level.
 */
export function getSeverityEmoji(severity: ChangeSeverity): string {
  switch (severity) {
    case 'breaking':
      return '🔴';
    case 'warning':
      return '🟠';
    case 'info':
      return '🔵';
    case 'none':
      return '✅';
  }
}
