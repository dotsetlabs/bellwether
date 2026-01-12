/**
 * Diff output formatting for human and machine consumption.
 */

import type {
  BehavioralDiff,
  BehaviorChange,
  ChangeSeverity,
} from './types.js';

/**
 * Format diff for human-readable console output.
 */
export function formatDiffText(diff: BehavioralDiff, useColors: boolean = true): string {
  const lines: string[] = [];
  const { red, green, yellow, cyan, bold } = useColors ? colors : noColors;

  // Header
  lines.push(bold('Behavioral Drift Report'));
  lines.push('═'.repeat(50));
  lines.push('');

  // Severity badge
  const severityBadge = getSeverityBadge(diff.severity, useColors);
  lines.push(`Overall Severity: ${severityBadge}`);
  lines.push('');

  // Summary
  lines.push(diff.summary);
  lines.push('');

  // Tools removed (breaking)
  if (diff.toolsRemoved.length > 0) {
    lines.push(red('─── Tools Removed ───'));
    for (const tool of diff.toolsRemoved) {
      lines.push(`  ${red('✗')} ${tool}`);
    }
    lines.push('');
  }

  // Tools added
  if (diff.toolsAdded.length > 0) {
    lines.push(green('─── Tools Added ───'));
    for (const tool of diff.toolsAdded) {
      lines.push(`  ${green('+')} ${tool}`);
    }
    lines.push('');
  }

  // Tools modified
  if (diff.toolsModified.length > 0) {
    lines.push(yellow('─── Tools Modified ───'));
    for (const toolDiff of diff.toolsModified) {
      lines.push(`  ${yellow('~')} ${bold(toolDiff.tool)}`);

      if (toolDiff.schemaChanged) {
        lines.push(`      ${red('• Schema changed')}`);
      }
      if (toolDiff.descriptionChanged) {
        lines.push(`      ${yellow('• Description changed')}`);
      }

      for (const change of toolDiff.changes) {
        const icon = getChangeIcon(change, useColors);
        lines.push(`      ${icon} ${change.description}`);
      }
    }
    lines.push('');
  }

  // Detailed changes
  if (diff.behaviorChanges.length > 0) {
    lines.push(cyan('─── Change Details ───'));
    lines.push('');

    const changesByTool = groupChangesByTool(diff.behaviorChanges);

    for (const [tool, changes] of changesByTool) {
      lines.push(`  ${bold(tool)}:`);
      for (const change of changes) {
        const sigColor = getSignificanceColor(change.significance, useColors);
        lines.push(`    ${sigColor(`[${change.significance.toUpperCase()}]`)} ${change.aspect}`);
        if (change.before) {
          lines.push(`      ${red('- ' + change.before)}`);
        }
        if (change.after) {
          lines.push(`      ${green('+ ' + change.after)}`);
        }
      }
      lines.push('');
    }
  }

  // Stats
  lines.push('─── Statistics ───');
  lines.push(`  Breaking changes: ${diff.breakingCount}`);
  lines.push(`  Warnings: ${diff.warningCount}`);
  lines.push(`  Info: ${diff.infoCount}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format diff as JSON for machine consumption.
 */
export function formatDiffJson(diff: BehavioralDiff): string {
  return JSON.stringify(diff, null, 2);
}

/**
 * Format diff in a compact single-line format for CI logs.
 */
export function formatDiffCompact(diff: BehavioralDiff): string {
  const parts: string[] = [];

  parts.push(`severity=${diff.severity}`);
  parts.push(`breaking=${diff.breakingCount}`);
  parts.push(`warnings=${diff.warningCount}`);
  parts.push(`info=${diff.infoCount}`);

  if (diff.toolsRemoved.length > 0) {
    parts.push(`removed=[${diff.toolsRemoved.join(',')}]`);
  }
  if (diff.toolsAdded.length > 0) {
    parts.push(`added=[${diff.toolsAdded.join(',')}]`);
  }
  if (diff.toolsModified.length > 0) {
    parts.push(`modified=[${diff.toolsModified.map((t) => t.tool).join(',')}]`);
  }

  return parts.join(' ');
}

/**
 * Format diff for GitHub Actions annotations.
 */
export function formatDiffGitHubActions(diff: BehavioralDiff): string {
  const lines: string[] = [];

  // Summary as workflow annotation
  if (diff.severity === 'breaking') {
    lines.push(`::error::Behavioral drift detected: ${diff.summary}`);
  } else if (diff.severity === 'warning') {
    lines.push(`::warning::Behavioral drift detected: ${diff.summary}`);
  } else if (diff.severity === 'info') {
    lines.push(`::notice::Minor behavioral changes: ${diff.summary}`);
  }

  // Individual changes as annotations
  for (const change of diff.behaviorChanges) {
    const level = change.significance === 'high' ? 'error' :
                  change.significance === 'medium' ? 'warning' : 'notice';
    lines.push(`::${level}::${change.tool} - ${change.description}`);
  }

  // Removed tools
  for (const tool of diff.toolsRemoved) {
    lines.push(`::error::Tool removed: ${tool}`);
  }

  return lines.join('\n');
}

/**
 * Format diff as a markdown table.
 */
export function formatDiffMarkdown(diff: BehavioralDiff): string {
  const lines: string[] = [];

  lines.push('## Behavioral Drift Report');
  lines.push('');
  lines.push(`**Severity:** ${getSeverityEmoji(diff.severity)} ${diff.severity.toUpperCase()}`);
  lines.push('');
  lines.push(diff.summary);
  lines.push('');

  // Tools table
  if (diff.toolsRemoved.length > 0 || diff.toolsAdded.length > 0 || diff.toolsModified.length > 0) {
    lines.push('### Tool Changes');
    lines.push('');
    lines.push('| Tool | Status | Details |');
    lines.push('|------|--------|---------|');

    for (const tool of diff.toolsRemoved) {
      lines.push(`| ${tool} | ❌ Removed | Breaking change |`);
    }
    for (const tool of diff.toolsAdded) {
      lines.push(`| ${tool} | ✅ Added | New tool |`);
    }
    for (const toolDiff of diff.toolsModified) {
      const details = [
        toolDiff.schemaChanged ? 'Schema changed' : '',
        toolDiff.descriptionChanged ? 'Description changed' : '',
        `${toolDiff.changes.length} behavior change(s)`,
      ].filter(Boolean).join(', ');
      lines.push(`| ${toolDiff.tool} | ⚠️ Modified | ${details} |`);
    }
    lines.push('');
  }

  // Behavior changes table
  if (diff.behaviorChanges.length > 0) {
    lines.push('### Behavioral Changes');
    lines.push('');
    lines.push('| Tool | Aspect | Significance | Description |');
    lines.push('|------|--------|--------------|-------------|');

    for (const change of diff.behaviorChanges) {
      const sigEmoji = change.significance === 'high' ? '🔴' :
                       change.significance === 'medium' ? '🟡' : '🟢';
      lines.push(`| ${change.tool} | ${change.aspect} | ${sigEmoji} ${change.significance} | ${change.description} |`);
    }
    lines.push('');
  }

  // Stats
  lines.push('### Statistics');
  lines.push('');
  lines.push(`- Breaking changes: **${diff.breakingCount}**`);
  lines.push(`- Warnings: **${diff.warningCount}**`);
  lines.push(`- Info: **${diff.infoCount}**`);

  return lines.join('\n');
}

// Color utilities
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  reset: '\x1b[0m',
};

const noColors = {
  red: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  bold: (s: string) => s,
  reset: '',
};

function getSeverityBadge(severity: ChangeSeverity, useColors: boolean): string {
  const c = useColors ? colors : noColors;

  switch (severity) {
    case 'none':
      return c.green('✓ NONE');
    case 'info':
      return c.cyan('ℹ INFO');
    case 'warning':
      return c.yellow('⚠ WARNING');
    case 'breaking':
      return c.red('✗ BREAKING');
  }
}

function getSeverityEmoji(severity: ChangeSeverity): string {
  switch (severity) {
    case 'none':
      return '✅';
    case 'info':
      return 'ℹ️';
    case 'warning':
      return '⚠️';
    case 'breaking':
      return '❌';
  }
}

function getChangeIcon(change: BehaviorChange, useColors: boolean): string {
  const c = useColors ? colors : noColors;

  switch (change.significance) {
    case 'high':
      return c.red('●');
    case 'medium':
      return c.yellow('●');
    case 'low':
      return c.cyan('●');
    default:
      return '○';
  }
}

function getSignificanceColor(
  significance: string,
  useColors: boolean
): (s: string) => string {
  const c = useColors ? colors : noColors;

  switch (significance) {
    case 'high':
      return c.red;
    case 'medium':
      return c.yellow;
    case 'low':
      return c.cyan;
    default:
      return (s: string) => s;
  }
}

function groupChangesByTool(changes: BehaviorChange[]): Map<string, BehaviorChange[]> {
  const map = new Map<string, BehaviorChange[]>();

  for (const change of changes) {
    const existing = map.get(change.tool) || [];
    existing.push(change);
    map.set(change.tool, existing);
  }

  return map;
}
