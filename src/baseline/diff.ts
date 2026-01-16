/**
 * Diff output formatting for human and machine consumption.
 *
 * All formats now include confidence scores to help users understand
 * the reliability of detected changes.
 */

import type {
  BehavioralDiff,
  BehaviorChange,
  ChangeSeverity,
  ChangeConfidence,
} from './types.js';
import { getConfidenceLabel } from './confidence.js';

/**
 * Format diff for human-readable console output.
 */
export function formatDiffText(diff: BehavioralDiff, useColors: boolean = true): string {
  const lines: string[] = [];
  const { red, green, yellow, cyan, bold, dim } = useColors ? colors : noColors;

  // Header
  lines.push(bold('Behavioral Drift Report'));
  lines.push('═'.repeat(50));
  lines.push('');

  // Mode indicator
  if (diff.strictMode) {
    lines.push(cyan('[Strict Mode: structural changes only]'));
    lines.push('');
  }

  // Severity badge
  const severityBadge = getSeverityBadge(diff.severity, useColors);
  lines.push(`Overall Severity: ${severityBadge}`);

  // Confidence summary
  if (diff.confidence) {
    const confLabel = getConfidenceLabel(diff.confidence.overallScore);
    const confColor = confLabel === 'high' ? green :
                     confLabel === 'medium' ? yellow : red;
    lines.push(`Overall Confidence: ${confColor(`${diff.confidence.overallScore}% (${confLabel})`)}`);
    lines.push(dim(`  Structural changes: ${diff.confidence.structuralCount} (avg ${diff.confidence.structuralAverage}%)`));
    lines.push(dim(`  Semantic changes: ${diff.confidence.semanticCount} (avg ${diff.confidence.semanticAverage}%)`));
  }
  lines.push('');

  // Summary
  lines.push(diff.summary);
  lines.push('');

  // Tools removed (breaking)
  if (diff.toolsRemoved.length > 0) {
    lines.push(red('─── Tools Removed ───'));
    for (const tool of diff.toolsRemoved) {
      lines.push(`  ${red('✗')} ${tool} ${dim('(100% confidence - structural)')}`);
    }
    lines.push('');
  }

  // Tools added
  if (diff.toolsAdded.length > 0) {
    lines.push(green('─── Tools Added ───'));
    for (const tool of diff.toolsAdded) {
      lines.push(`  ${green('+')} ${tool} ${dim('(100% confidence - structural)')}`);
    }
    lines.push('');
  }

  // Tools modified
  if (diff.toolsModified.length > 0) {
    lines.push(yellow('─── Tools Modified ───'));
    for (const toolDiff of diff.toolsModified) {
      const toolConfStr = toolDiff.confidence
        ? dim(` (${toolDiff.confidence.score}% confidence)`)
        : '';
      lines.push(`  ${yellow('~')} ${bold(toolDiff.tool)}${toolConfStr}`);

      if (toolDiff.schemaChanged) {
        lines.push(`      ${red('• Schema changed')} ${dim('(100% - structural)')}`);
      }
      if (toolDiff.descriptionChanged) {
        lines.push(`      ${yellow('• Description changed')} ${dim('(100% - structural)')}`);
      }

      for (const change of toolDiff.changes) {
        const icon = getChangeIcon(change, useColors);
        const confStr = formatConfidenceIndicator(change.confidence, useColors);
        lines.push(`      ${icon} ${change.description} ${confStr}`);
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
        const confStr = formatConfidenceIndicator(change.confidence, useColors);
        lines.push(`    ${sigColor(`[${change.significance.toUpperCase()}]`)} ${change.aspect} ${confStr}`);
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
  if (diff.confidence) {
    lines.push(`  Min confidence: ${diff.confidence.minScore}%`);
    lines.push(`  Max confidence: ${diff.confidence.maxScore}%`);
  }
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

  // Confidence info
  if (diff.confidence) {
    parts.push(`confidence=${diff.confidence.overallScore}%`);
    parts.push(`min_conf=${diff.confidence.minScore}%`);
    parts.push(`structural=${diff.confidence.structuralCount}`);
    parts.push(`semantic=${diff.confidence.semanticCount}`);
  }

  // Strict mode
  if (diff.strictMode) {
    parts.push('mode=strict');
  }

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

  // Mode indicator
  const modeStr = diff.strictMode ? ' [strict mode]' : '';

  // Summary as workflow annotation
  if (diff.severity === 'breaking') {
    const confStr = diff.confidence ? ` (confidence: ${diff.confidence.minScore}%-${diff.confidence.maxScore}%)` : '';
    lines.push(`::error::Behavioral drift detected${modeStr}: ${diff.summary}${confStr}`);
  } else if (diff.severity === 'warning') {
    const confStr = diff.confidence ? ` (confidence: ${diff.confidence.overallScore}%)` : '';
    lines.push(`::warning::Behavioral drift detected${modeStr}: ${diff.summary}${confStr}`);
  } else if (diff.severity === 'info') {
    lines.push(`::notice::Minor behavioral changes${modeStr}: ${diff.summary}`);
  }

  // Confidence summary
  if (diff.confidence) {
    lines.push(`::notice::Confidence summary: overall=${diff.confidence.overallScore}% structural=${diff.confidence.structuralCount} semantic=${diff.confidence.semanticCount}`);
  }

  // Individual changes as annotations
  for (const change of diff.behaviorChanges) {
    const level = change.significance === 'high' ? 'error' :
                  change.significance === 'medium' ? 'warning' : 'notice';
    const confStr = change.confidence
      ? ` [${change.confidence.score}% ${change.confidence.method}]`
      : '';
    lines.push(`::${level}::${change.tool} - ${change.description}${confStr}`);
  }

  // Removed tools
  for (const tool of diff.toolsRemoved) {
    lines.push(`::error::Tool removed: ${tool} [100% structural]`);
  }

  // Added tools
  for (const tool of diff.toolsAdded) {
    lines.push(`::notice::Tool added: ${tool} [100% structural]`);
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

  // Mode indicator
  if (diff.strictMode) {
    lines.push('> **Mode:** Strict (structural changes only)');
    lines.push('');
  }

  lines.push(`**Severity:** ${getSeverityEmoji(diff.severity)} ${diff.severity.toUpperCase()}`);

  // Confidence summary
  if (diff.confidence) {
    const confEmoji = getConfidenceEmoji(diff.confidence.overallScore);
    lines.push(`**Confidence:** ${confEmoji} ${diff.confidence.overallScore}% overall`);
  }

  lines.push('');
  lines.push(diff.summary);
  lines.push('');

  // Confidence breakdown
  if (diff.confidence) {
    lines.push('### Confidence Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Overall Confidence | ${diff.confidence.overallScore}% |`);
    lines.push(`| Min Confidence | ${diff.confidence.minScore}% |`);
    lines.push(`| Max Confidence | ${diff.confidence.maxScore}% |`);
    lines.push(`| Structural Changes | ${diff.confidence.structuralCount} (avg ${diff.confidence.structuralAverage}%) |`);
    lines.push(`| Semantic Changes | ${diff.confidence.semanticCount} (avg ${diff.confidence.semanticAverage}%) |`);
    lines.push('');
  }

  // Tools table
  if (diff.toolsRemoved.length > 0 || diff.toolsAdded.length > 0 || diff.toolsModified.length > 0) {
    lines.push('### Tool Changes');
    lines.push('');
    lines.push('| Tool | Status | Confidence | Details |');
    lines.push('|------|--------|------------|---------|');

    for (const tool of diff.toolsRemoved) {
      lines.push(`| ${tool} | ❌ Removed | 100% structural | Breaking change |`);
    }
    for (const tool of diff.toolsAdded) {
      lines.push(`| ${tool} | ✅ Added | 100% structural | New tool |`);
    }
    for (const toolDiff of diff.toolsModified) {
      const details = [
        toolDiff.schemaChanged ? 'Schema changed' : '',
        toolDiff.descriptionChanged ? 'Description changed' : '',
        `${toolDiff.changes.length} behavior change(s)`,
      ].filter(Boolean).join(', ');
      const confStr = toolDiff.confidence
        ? `${toolDiff.confidence.score}% ${toolDiff.confidence.method}`
        : 'N/A';
      lines.push(`| ${toolDiff.tool} | ⚠️ Modified | ${confStr} | ${details} |`);
    }
    lines.push('');
  }

  // Behavior changes table
  if (diff.behaviorChanges.length > 0) {
    lines.push('### Behavioral Changes');
    lines.push('');
    lines.push('| Tool | Aspect | Significance | Confidence | Description |');
    lines.push('|------|--------|--------------|------------|-------------|');

    for (const change of diff.behaviorChanges) {
      const sigEmoji = change.significance === 'high' ? '🔴' :
                       change.significance === 'medium' ? '🟡' : '🟢';
      const confStr = change.confidence
        ? `${change.confidence.score}% ${change.confidence.method}`
        : 'N/A';
      lines.push(`| ${change.tool} | ${change.aspect} | ${sigEmoji} ${change.significance} | ${confStr} | ${change.description} |`);
    }
    lines.push('');
  }

  // Stats
  lines.push('### Statistics');
  lines.push('');
  lines.push(`- Breaking changes: **${diff.breakingCount}**`);
  lines.push(`- Warnings: **${diff.warningCount}**`);
  lines.push(`- Info: **${diff.infoCount}**`);
  if (diff.confidence) {
    lines.push(`- Min confidence: **${diff.confidence.minScore}%**`);
    lines.push(`- Structural changes: **${diff.confidence.structuralCount}**`);
    lines.push(`- Semantic changes: **${diff.confidence.semanticCount}**`);
  }

  return lines.join('\n');
}

// Color utilities
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  reset: '\x1b[0m',
};

const noColors = {
  red: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  bold: (s: string) => s,
  dim: (s: string) => s,
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

/**
 * Format confidence indicator for console output.
 */
function formatConfidenceIndicator(
  confidence: ChangeConfidence | undefined,
  useColors: boolean
): string {
  if (!confidence) return '';

  const c = useColors ? colors : noColors;
  const label = getConfidenceLabel(confidence.score);
  const method = confidence.method === 'structural' ? 'S' : 'L';

  if (label === 'high') {
    return c.dim(`[${confidence.score}%${method}]`);
  } else if (label === 'medium') {
    return c.yellow(`[${confidence.score}%${method}]`);
  } else {
    return c.red(`[${confidence.score}%${method}]`);
  }
}

/**
 * Get emoji for confidence level.
 */
function getConfidenceEmoji(score: number): string {
  if (score >= 85) return '🟢';
  if (score >= 60) return '🟡';
  if (score >= 40) return '🟠';
  return '🔴';
}
