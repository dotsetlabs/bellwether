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

  lines.push(bold('Drift Report'));
  lines.push('═'.repeat(50));
  lines.push('');

  const severityBadge = getSeverityBadge(diff.severity, useColors);
  lines.push(`Severity: ${severityBadge}`);
  lines.push('');
  lines.push(diff.summary);
  lines.push('');

  if (diff.toolsRemoved.length > 0) {
    lines.push(red('─── Tools Removed ───'));
    for (const tool of diff.toolsRemoved) {
      lines.push(`  ${red('✗')} ${tool}`);
    }
    lines.push('');
  }

  if (diff.toolsAdded.length > 0) {
    lines.push(green('─── Tools Added ───'));
    for (const tool of diff.toolsAdded) {
      lines.push(`  ${green('+')} ${tool}`);
    }
    lines.push('');
  }

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

  if (diff.behaviorChanges.length > 0) {
    lines.push(cyan('─── Change Details ───'));
    lines.push('');

    const changesByTool = groupChangesByTool(diff.behaviorChanges);

    for (const [tool, changes] of changesByTool) {
      lines.push(`  ${bold(tool)}:`);
      for (const change of changes) {
        const sevColor = getSeverityColor(change.severity, useColors);
        lines.push(`    ${sevColor(`[${change.severity.toUpperCase()}]`)} ${change.aspect}`);
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

  // Performance regressions
  if (diff.performanceReport?.hasRegressions) {
    lines.push(red('─── Performance Regressions ───'));
    for (const regression of diff.performanceReport.regressions) {
      const percentStr = (regression.regressionPercent * 100).toFixed(1);
      lines.push(
        `  ${red('!')} ${regression.toolName}: ` +
          `${regression.previousP50Ms.toFixed(0)}ms → ` +
          `${regression.currentP50Ms.toFixed(0)}ms (+${percentStr}%)`
      );
    }
    lines.push('');
  } else if (diff.performanceReport?.improvementCount ?? 0 > 0) {
    lines.push(green('─── Performance ───'));
    lines.push(`  ${green('✓')} ${diff.performanceReport?.improvementCount} tool(s) improved`);
    lines.push('');
  }

  lines.push('─── Statistics ───');
  lines.push(`  Breaking changes: ${diff.breakingCount}`);
  lines.push(`  Warnings: ${diff.warningCount}`);
  lines.push(`  Info: ${diff.infoCount}`);
  if (diff.performanceReport) {
    lines.push(`  Performance regressions: ${diff.performanceReport.regressionCount}`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Format diff as JSON.
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
  if (diff.performanceReport?.regressionCount ?? 0 > 0) {
    parts.push(`perf_regressions=${diff.performanceReport?.regressionCount}`);
  }

  return parts.join(' ');
}

/**
 * Format diff for GitHub Actions annotations.
 */
export function formatDiffGitHubActions(diff: BehavioralDiff): string {
  const lines: string[] = [];

  if (diff.severity === 'breaking') {
    lines.push(`::error::Drift detected: ${diff.summary}`);
  } else if (diff.severity === 'warning') {
    lines.push(`::warning::Drift detected: ${diff.summary}`);
  } else if (diff.severity === 'info') {
    lines.push(`::notice::Minor changes: ${diff.summary}`);
  }

  for (const change of diff.behaviorChanges) {
    const level = change.severity === 'breaking' ? 'error' :
                  change.severity === 'warning' ? 'warning' : 'notice';
    lines.push(`::${level}::${change.tool} - ${change.description}`);
  }

  for (const tool of diff.toolsRemoved) {
    lines.push(`::error::Tool removed: ${tool}`);
  }

  for (const tool of diff.toolsAdded) {
    lines.push(`::notice::Tool added: ${tool}`);
  }

  return lines.join('\n');
}

/**
 * Format diff as markdown.
 */
export function formatDiffMarkdown(diff: BehavioralDiff): string {
  const lines: string[] = [];

  lines.push('## Drift Report');
  lines.push('');
  lines.push(`**Severity:** ${getSeverityEmoji(diff.severity)} ${diff.severity.toUpperCase()}`);
  lines.push('');
  lines.push(diff.summary);
  lines.push('');

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
        `${toolDiff.changes.length} change(s)`,
      ].filter(Boolean).join(', ');
      lines.push(`| ${toolDiff.tool} | ⚠️ Modified | ${details} |`);
    }
    lines.push('');
  }

  if (diff.behaviorChanges.length > 0) {
    lines.push('### Changes');
    lines.push('');
    lines.push('| Tool | Aspect | Severity | Description |');
    lines.push('|------|--------|----------|-------------|');

    for (const change of diff.behaviorChanges) {
      const sevEmoji = change.severity === 'breaking' ? '🔴' :
                       change.severity === 'warning' ? '🟡' : '🟢';
      lines.push(`| ${change.tool} | ${change.aspect} | ${sevEmoji} ${change.severity} | ${change.description} |`);
    }
    lines.push('');
  }

  lines.push('### Statistics');
  lines.push('');
  lines.push(`- Breaking changes: **${diff.breakingCount}**`);
  lines.push(`- Warnings: **${diff.warningCount}**`);
  lines.push(`- Info: **${diff.infoCount}**`);

  return lines.join('\n');
}

/**
 * Format diff as JUnit XML for CI dashboard integration.
 *
 * JUnit XML is widely supported by CI/CD systems (Jenkins, GitLab CI,
 * CircleCI, Azure DevOps, etc.) for test result visualization.
 *
 * @param diff - The behavioral diff to format
 * @param suiteName - Name for the test suite (default: 'bellwether')
 * @returns JUnit XML string
 */
export function formatDiffJUnit(diff: BehavioralDiff, suiteName: string = 'bellwether'): string {
  const timestamp = new Date().toISOString();
  const totalTests =
    diff.toolsAdded.length +
    diff.toolsRemoved.length +
    diff.behaviorChanges.length;
  const failures = diff.breakingCount;
  const errors = 0;
  const skipped = 0;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="${escapeXml(suiteName)}" tests="${totalTests}" failures="${failures}" errors="${errors}" skipped="${skipped}" timestamp="${timestamp}">`,
    `  <testsuite name="drift-detection" tests="${totalTests}" failures="${failures}" errors="${errors}" skipped="${skipped}">`,
  ];

  // Test case for each removed tool (failure - breaking)
  for (const tool of diff.toolsRemoved) {
    const name = escapeXml(`tool-present-${tool}`);
    lines.push(`    <testcase name="${name}" classname="drift.tools">`);
    lines.push(`      <failure message="Tool removed: ${escapeXml(tool)}" type="breaking">`);
    lines.push(`Tool "${escapeXml(tool)}" was present in baseline but is now missing.`);
    lines.push('This is a breaking change that may affect consumers.');
    lines.push('      </failure>');
    lines.push('    </testcase>');
  }

  // Test case for each added tool (passes - info)
  for (const tool of diff.toolsAdded) {
    const name = escapeXml(`tool-new-${tool}`);
    lines.push(`    <testcase name="${name}" classname="drift.tools">`);
    lines.push(`      <system-out>New tool added: ${escapeXml(tool)}</system-out>`);
    lines.push('    </testcase>');
  }

  // Test case for each behavior change
  for (const change of diff.behaviorChanges) {
    const name = escapeXml(`${change.tool}-${change.aspect}`);
    lines.push(`    <testcase name="${name}" classname="drift.behavior">`);

    if (change.severity === 'breaking') {
      lines.push(`      <failure message="${escapeXml(change.description)}" type="breaking">`);
      lines.push(`Tool: ${escapeXml(change.tool)}`);
      lines.push(`Aspect: ${escapeXml(change.aspect)}`);
      if (change.before) {
        lines.push(`Before: ${escapeXml(change.before)}`);
      }
      if (change.after) {
        lines.push(`After: ${escapeXml(change.after)}`);
      }
      lines.push('      </failure>');
    } else if (change.severity === 'warning') {
      lines.push(`      <system-err>[WARNING] ${escapeXml(change.description)}</system-err>`);
    } else {
      lines.push(`      <system-out>[INFO] ${escapeXml(change.description)}</system-out>`);
    }

    lines.push('    </testcase>');
  }

  lines.push('  </testsuite>');
  lines.push('</testsuites>');

  return lines.join('\n');
}

/**
 * SARIF result for type checking.
 */
interface SarifResult {
  ruleId: string;
  level: 'note' | 'warning' | 'error';
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number };
    };
  }>;
  properties?: Record<string, unknown>;
}

/**
 * Format diff as SARIF (Static Analysis Results Interchange Format) for GitHub Code Scanning.
 *
 * SARIF is the standard format for GitHub's code scanning feature and can be
 * uploaded to show drift detection results in pull request reviews.
 *
 * @see https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 *
 * @param diff - The behavioral diff to format
 * @param baselinePath - Path to the baseline file (for location references)
 * @returns SARIF JSON string
 */
export function formatDiffSarif(
  diff: BehavioralDiff,
  baselinePath: string = 'bellwether-baseline.json'
): string {
  const sarif = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'bellwether',
            version: '1.0.0',
            informationUri: 'https://github.com/dotsetlabs/bellwether',
            rules: [
              {
                id: 'BWH001',
                name: 'ToolRemoved',
                shortDescription: { text: 'Tool was removed from server' },
                fullDescription: {
                  text: 'A tool that existed in the baseline is no longer present. This is a breaking change that may affect consumers relying on this tool.',
                },
                defaultConfiguration: { level: 'error' },
                help: {
                  text: 'Ensure the tool removal was intentional and update consumers. Consider deprecation warnings before removal.',
                },
              },
              {
                id: 'BWH002',
                name: 'SchemaBreakingChange',
                shortDescription: { text: 'Breaking schema change detected' },
                fullDescription: {
                  text: 'A breaking change was detected in a tool schema, such as a removed parameter, type change, or new required field.',
                },
                defaultConfiguration: { level: 'error' },
                help: {
                  text: 'Review schema changes and update consumers accordingly. Breaking changes require version bumps.',
                },
              },
              {
                id: 'BWH003',
                name: 'SchemaWarningChange',
                shortDescription: { text: 'Schema warning change detected' },
                fullDescription: {
                  text: 'A warning-level change was detected in a tool schema that may affect some consumers.',
                },
                defaultConfiguration: { level: 'warning' },
                help: {
                  text: 'Review schema changes for potential impact on consumers.',
                },
              },
              {
                id: 'BWH004',
                name: 'ToolAdded',
                shortDescription: { text: 'New tool added to server' },
                fullDescription: {
                  text: 'A new tool was added that did not exist in the baseline. This is typically safe but should be documented.',
                },
                defaultConfiguration: { level: 'note' },
                help: {
                  text: 'Document the new tool and notify consumers of new functionality.',
                },
              },
              {
                id: 'BWH005',
                name: 'ResponseStructureChanged',
                shortDescription: { text: 'Response structure changed' },
                fullDescription: {
                  text: 'The structure of a tool response has changed, which may affect consumers parsing the response.',
                },
                defaultConfiguration: { level: 'warning' },
                help: {
                  text: 'Review response structure changes and update consumers that depend on specific fields.',
                },
              },
              {
                id: 'BWH006',
                name: 'ErrorPatternChanged',
                shortDescription: { text: 'Error pattern changed' },
                fullDescription: {
                  text: 'The error behavior of a tool has changed, with new or modified error patterns.',
                },
                defaultConfiguration: { level: 'warning' },
                help: {
                  text: 'Review error handling changes and ensure consumers handle new error cases.',
                },
              },
            ],
          },
        },
        results: [] as SarifResult[],
      },
    ],
  };

  const results = sarif.runs[0].results;

  // Add results for removed tools (breaking)
  for (const tool of diff.toolsRemoved) {
    results.push({
      ruleId: 'BWH001',
      level: 'error',
      message: { text: `Tool "${tool}" was removed from the server` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: baselinePath },
            region: { startLine: 1 },
          },
        },
      ],
      properties: { tool, changeType: 'removed' },
    });
  }

  // Add results for added tools (info)
  for (const tool of diff.toolsAdded) {
    results.push({
      ruleId: 'BWH004',
      level: 'note',
      message: { text: `New tool "${tool}" was added to the server` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: baselinePath },
            region: { startLine: 1 },
          },
        },
      ],
      properties: { tool, changeType: 'added' },
    });
  }

  // Add results for behavior changes
  for (const change of diff.behaviorChanges) {
    let ruleId: string;
    let level: 'note' | 'warning' | 'error';

    // Map aspect and severity to appropriate rule
    if (change.aspect === 'schema') {
      ruleId = change.severity === 'breaking' ? 'BWH002' : 'BWH003';
      level = change.severity === 'breaking' ? 'error' : 'warning';
    } else if (change.aspect === 'response_structure') {
      ruleId = 'BWH005';
      level = change.severity === 'breaking' ? 'error' : 'warning';
    } else if (change.aspect === 'error_pattern' || change.aspect === 'error_handling') {
      ruleId = 'BWH006';
      level = change.severity === 'breaking' ? 'error' : 'warning';
    } else {
      // Default to schema rules for other aspects
      ruleId = change.severity === 'breaking' ? 'BWH002' : 'BWH003';
      level =
        change.severity === 'breaking'
          ? 'error'
          : change.severity === 'warning'
            ? 'warning'
            : 'note';
    }

    results.push({
      ruleId,
      level,
      message: { text: `${change.tool}: ${change.description}` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: baselinePath },
            region: { startLine: 1 },
          },
        },
      ],
      properties: {
        tool: change.tool,
        aspect: change.aspect,
        before: change.before,
        after: change.after,
        severity: change.severity,
      },
    });
  }

  return JSON.stringify(sarif, null, 2);
}

/**
 * Escape XML special characters to prevent injection.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

const noColors = {
  red: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  bold: (s: string) => s,
  dim: (s: string) => s,
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

  switch (change.severity) {
    case 'breaking':
      return c.red('●');
    case 'warning':
      return c.yellow('●');
    case 'info':
      return c.cyan('●');
    default:
      return '○';
  }
}

function getSeverityColor(
  severity: ChangeSeverity,
  useColors: boolean
): (s: string) => string {
  const c = useColors ? colors : noColors;

  switch (severity) {
    case 'breaking':
      return c.red;
    case 'warning':
      return c.yellow;
    case 'info':
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
