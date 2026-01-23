/**
 * Diff output formatting for human and machine consumption.
 */

import type {
  BehavioralDiff,
  BehaviorChange,
  ChangeSeverity,
  SchemaEvolutionReport,
} from './types.js';
import type { SecurityDiff, RiskLevel } from '../security/types.js';
import { formatSchemaEvolutionDiff } from './response-schema-tracker.js';
import { formatErrorTrendReport } from './error-analyzer.js';
import { getGradeIndicator } from './documentation-scorer.js';

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
      const confidenceNote = regression.isReliable
        ? ''
        : ` ${yellow('(low confidence)')}`;
      lines.push(
        `  ${red('!')} ${regression.toolName}: ` +
          `${regression.previousP50Ms.toFixed(0)}ms → ` +
          `${regression.currentP50Ms.toFixed(0)}ms (+${percentStr}%)${confidenceNote}`
      );
    }
    lines.push('');

    // Show low confidence tools warning
    if (diff.performanceReport.lowConfidenceTools && diff.performanceReport.lowConfidenceTools.length > 0) {
      lines.push(yellow('  Note: Some tools have low confidence metrics.'));
      lines.push(yellow(`  Run with more samples for reliable baselines: ${diff.performanceReport.lowConfidenceTools.join(', ')}`));
      lines.push('');
    }
  } else if (diff.performanceReport?.improvementCount ?? 0 > 0) {
    lines.push(green('─── Performance ───'));
    lines.push(`  ${green('✓')} ${diff.performanceReport?.improvementCount} tool(s) improved`);
    lines.push('');
  }

  // Performance confidence changes
  if (diff.performanceReport?.confidenceChanges && diff.performanceReport.confidenceChanges.length > 0) {
    lines.push(cyan('─── Confidence Changes ───'));
    for (const change of diff.performanceReport.confidenceChanges) {
      const icon = change.improved ? green('↑') : change.degraded ? yellow('↓') : '→';
      lines.push(`  ${icon} ${change.toolName}: ${change.summary}`);
    }
    lines.push('');
  }

  // Security findings
  if (diff.securityReport) {
    const secReport = diff.securityReport;
    if (secReport.degraded || secReport.newFindings.length > 0) {
      lines.push(red('─── Security Findings ───'));
      lines.push(`  ${secReport.summary}`);
      lines.push('');

      if (secReport.newFindings.length > 0) {
        lines.push(red('  New Findings:'));
        for (const finding of secReport.newFindings) {
          const riskColor = getRiskLevelColor(finding.riskLevel, useColors);
          lines.push(
            `    ${riskColor('●')} [${finding.riskLevel.toUpperCase()}] ${finding.title}`
          );
          lines.push(`      Tool: ${finding.tool}, Parameter: ${finding.parameter}`);
          lines.push(`      ${finding.cweId}: ${finding.description}`);
        }
        lines.push('');
      }
    } else if (secReport.resolvedFindings.length > 0) {
      lines.push(green('─── Security Improvements ───'));
      lines.push(`  ${green('✓')} ${secReport.resolvedFindings.length} finding(s) resolved`);
      lines.push('');
    }

    // Show risk score change
    if (secReport.riskScoreChange !== 0) {
      const changeIcon = secReport.riskScoreChange > 0 ? red('↑') : green('↓');
      lines.push(
        `  Risk score: ${secReport.previousRiskScore} → ${secReport.currentRiskScore} (${changeIcon} ${Math.abs(secReport.riskScoreChange)})`
      );
      lines.push('');
    }
  }

  // Schema evolution issues
  if (diff.schemaEvolutionReport) {
    const schemaReport = diff.schemaEvolutionReport;
    if (schemaReport.hasBreakingChanges || schemaReport.unstableCount > 0) {
      lines.push(red('─── Schema Evolution Issues ───'));
      lines.push(`  ${formatSchemaEvolutionSummary(schemaReport)}`);
      lines.push('');

      for (const issue of schemaReport.toolsWithIssues) {
        const issueIcon = issue.isBreaking ? red('✗') : yellow('⚠');
        lines.push(`  ${issueIcon} ${bold(issue.toolName)}`);
        lines.push(`      ${issue.summary}`);

        if (issue.fieldsRemoved.length > 0) {
          lines.push(`      ${red('- Removed: ' + issue.fieldsRemoved.join(', '))}`);
        }
        if (issue.fieldsAdded.length > 0) {
          lines.push(`      ${green('+ Added: ' + issue.fieldsAdded.join(', '))}`);
        }
      }
      lines.push('');
    } else if (schemaReport.stableCount > 0) {
      lines.push(green('─── Schema Stability ───'));
      lines.push(`  ${green('✓')} ${schemaReport.stableCount} tool(s) with stable response schemas`);
      lines.push('');
    }
  }

  // Add schema evolution diff lines for modified tools
  for (const toolDiff of diff.toolsModified) {
    if (toolDiff.schemaEvolutionDiff?.structureChanged) {
      const diffLines = formatSchemaEvolutionDiff(toolDiff.schemaEvolutionDiff, useColors);
      if (diffLines.length > 0) {
        lines.push(yellow(`─── ${toolDiff.tool} Schema Evolution ───`));
        lines.push(...diffLines);
        lines.push('');
      }
    }
  }

  // Error trend report
  if (diff.errorTrendReport) {
    const errorReport = diff.errorTrendReport;
    if (errorReport.significantChange) {
      lines.push(yellow('─── Error Trend Analysis ───'));
      lines.push(formatErrorTrendReport(errorReport, useColors));
      lines.push('');
    } else if (errorReport.trends.length > 0) {
      lines.push(green('─── Error Patterns ───'));
      lines.push(`  ${green('✓')} Error patterns stable`);
      lines.push('');
    }
  }

  // Documentation score report
  if (diff.documentationScoreReport) {
    const docReport = diff.documentationScoreReport;
    const indicator = getGradeIndicator(docReport.currentGrade);
    if (docReport.degraded) {
      lines.push(yellow('─── Documentation Quality ───'));
      lines.push(
        `  ${yellow(indicator)} Score: ${docReport.previousScore} → ${docReport.currentScore} (${docReport.change})`
      );
      lines.push(`  ${yellow('Grade:')} ${docReport.previousGrade} → ${docReport.currentGrade}`);
      if (docReport.newIssues > 0) {
        lines.push(`  ${red('!')} New issues: ${docReport.newIssues}`);
      }
      lines.push('');
    } else if (docReport.improved) {
      lines.push(green('─── Documentation Quality ───'));
      lines.push(
        `  ${green(indicator)} Score: ${docReport.previousScore} → ${docReport.currentScore} (+${docReport.change})`
      );
      lines.push(`  ${green('Grade:')} ${docReport.previousGrade} → ${docReport.currentGrade}`);
      if (docReport.issuesFixed > 0) {
        lines.push(`  ${green('✓')} Issues fixed: ${docReport.issuesFixed}`);
      }
      lines.push('');
    }
  }

  lines.push('─── Statistics ───');
  lines.push(`  Breaking changes: ${diff.breakingCount}`);
  lines.push(`  Warnings: ${diff.warningCount}`);
  lines.push(`  Info: ${diff.infoCount}`);
  if (diff.performanceReport) {
    lines.push(`  Performance regressions: ${diff.performanceReport.regressionCount}`);
    if (diff.performanceReport.lowConfidenceTools && diff.performanceReport.lowConfidenceTools.length > 0) {
      lines.push(`  Low confidence tools: ${diff.performanceReport.lowConfidenceTools.length}`);
    }
  }
  if (diff.securityReport) {
    lines.push(`  New security findings: ${diff.securityReport.newFindings.length}`);
    lines.push(`  Resolved findings: ${diff.securityReport.resolvedFindings.length}`);
  }
  if (diff.schemaEvolutionReport) {
    lines.push(`  Schema stability: ${diff.schemaEvolutionReport.stableCount} stable, ${diff.schemaEvolutionReport.unstableCount} unstable`);
    if (diff.schemaEvolutionReport.structureChangedCount > 0) {
      lines.push(`  Schema structure changes: ${diff.schemaEvolutionReport.structureChangedCount}`);
    }
  }
  if (diff.errorTrendReport) {
    const et = diff.errorTrendReport;
    if (et.newCategories.length > 0) {
      lines.push(`  New error types: ${et.newCategories.length}`);
    }
    if (et.resolvedCategories.length > 0) {
      lines.push(`  Resolved error types: ${et.resolvedCategories.length}`);
    }
    if (et.increasingCategories.length > 0) {
      lines.push(`  Increasing errors: ${et.increasingCategories.length}`);
    }
  }
  if (diff.documentationScoreReport) {
    const doc = diff.documentationScoreReport;
    lines.push(`  Documentation score: ${doc.currentScore}/100 (${doc.currentGrade})`);
    if (doc.change !== 0) {
      const sign = doc.change > 0 ? '+' : '';
      lines.push(`  Documentation change: ${sign}${doc.change}`);
    }
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
  if (diff.performanceReport?.lowConfidenceTools && diff.performanceReport.lowConfidenceTools.length > 0) {
    parts.push(`low_confidence_tools=${diff.performanceReport.lowConfidenceTools.length}`);
  }
  if (diff.securityReport) {
    if (diff.securityReport.newFindings.length > 0) {
      parts.push(`new_security_findings=${diff.securityReport.newFindings.length}`);
    }
    if (diff.securityReport.resolvedFindings.length > 0) {
      parts.push(`resolved_findings=${diff.securityReport.resolvedFindings.length}`);
    }
    if (diff.securityReport.degraded) {
      parts.push(`security_degraded=true`);
    }
  }
  if (diff.schemaEvolutionReport) {
    if (diff.schemaEvolutionReport.unstableCount > 0) {
      parts.push(`schema_unstable=${diff.schemaEvolutionReport.unstableCount}`);
    }
    if (diff.schemaEvolutionReport.structureChangedCount > 0) {
      parts.push(`schema_changed=${diff.schemaEvolutionReport.structureChangedCount}`);
    }
    if (diff.schemaEvolutionReport.hasBreakingChanges) {
      parts.push(`schema_breaking=true`);
    }
  }
  if (diff.errorTrendReport) {
    if (diff.errorTrendReport.newCategories.length > 0) {
      parts.push(`new_error_types=${diff.errorTrendReport.newCategories.length}`);
    }
    if (diff.errorTrendReport.resolvedCategories.length > 0) {
      parts.push(`resolved_error_types=${diff.errorTrendReport.resolvedCategories.length}`);
    }
    if (diff.errorTrendReport.significantChange) {
      parts.push(`error_trend_change=true`);
    }
  }
  if (diff.documentationScoreReport) {
    parts.push(`doc_score=${diff.documentationScoreReport.currentScore}`);
    parts.push(`doc_grade=${diff.documentationScoreReport.currentGrade}`);
    if (diff.documentationScoreReport.degraded) {
      parts.push(`doc_degraded=true`);
    }
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

  // Performance regressions with confidence
  if (diff.performanceReport?.hasRegressions) {
    for (const regression of diff.performanceReport.regressions) {
      const percentStr = (regression.regressionPercent * 100).toFixed(1);
      const confidenceNote = regression.isReliable ? '' : ' (low confidence)';
      lines.push(
        `::warning::Performance regression: ${regression.toolName} +${percentStr}%${confidenceNote}`
      );
    }
  }

  // Low confidence warning
  if (diff.performanceReport?.lowConfidenceTools && diff.performanceReport.lowConfidenceTools.length > 0) {
    lines.push(
      `::notice::Low confidence metrics for ${diff.performanceReport.lowConfidenceTools.length} tool(s): ${diff.performanceReport.lowConfidenceTools.join(', ')}`
    );
  }

  // Security findings
  if (diff.securityReport) {
    for (const finding of diff.securityReport.newFindings) {
      const level = finding.riskLevel === 'critical' || finding.riskLevel === 'high'
        ? 'error'
        : finding.riskLevel === 'medium'
          ? 'warning'
          : 'notice';
      lines.push(`::${level}::Security [${finding.riskLevel.toUpperCase()}] ${finding.tool}: ${finding.title} (${finding.cweId})`);
    }

    if (diff.securityReport.degraded) {
      lines.push(`::warning::Security posture degraded - ${diff.securityReport.summary}`);
    }
  }

  // Schema evolution issues
  if (diff.schemaEvolutionReport) {
    for (const issue of diff.schemaEvolutionReport.toolsWithIssues) {
      const level = issue.isBreaking ? 'error' : 'warning';
      lines.push(`::${level}::Schema evolution [${issue.toolName}]: ${issue.summary}`);
    }

    if (diff.schemaEvolutionReport.hasBreakingChanges) {
      lines.push(`::error::Breaking schema changes detected in ${diff.schemaEvolutionReport.structureChangedCount} tool(s)`);
    } else if (diff.schemaEvolutionReport.unstableCount > 0) {
      lines.push(`::warning::${diff.schemaEvolutionReport.unstableCount} tool(s) have unstable response schemas`);
    }
  }

  // Error trend analysis
  if (diff.errorTrendReport) {
    const et = diff.errorTrendReport;
    if (et.newCategories.length > 0) {
      lines.push(`::warning::New error types detected: ${et.newCategories.join(', ')}`);
    }
    if (et.increasingCategories.length > 0) {
      lines.push(`::warning::Increasing errors: ${et.increasingCategories.join(', ')}`);
    }
    if (et.resolvedCategories.length > 0) {
      lines.push(`::notice::Resolved error types: ${et.resolvedCategories.join(', ')}`);
    }
    if (et.significantChange) {
      lines.push(`::warning::Error behavior significantly changed - ${et.summary}`);
    }
  }

  // Documentation score changes
  if (diff.documentationScoreReport) {
    const doc = diff.documentationScoreReport;
    if (doc.degraded) {
      lines.push(`::warning::Documentation quality degraded: ${doc.previousScore} -> ${doc.currentScore} (${doc.currentGrade})`);
    } else if (doc.improved) {
      lines.push(`::notice::Documentation quality improved: ${doc.previousScore} -> ${doc.currentScore} (${doc.currentGrade})`);
    }
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

  // Security findings section
  if (diff.securityReport) {
    const secReport = diff.securityReport;
    if (secReport.newFindings.length > 0 || secReport.resolvedFindings.length > 0) {
      lines.push('### Security');
      lines.push('');

      if (secReport.degraded) {
        lines.push(`⚠️ **Security posture degraded**: ${secReport.summary}`);
        lines.push('');
      }

      if (secReport.newFindings.length > 0) {
        lines.push('#### New Findings');
        lines.push('');
        lines.push('| Risk | Tool | Finding | CWE |');
        lines.push('|------|------|---------|-----|');

        for (const finding of secReport.newFindings) {
          const riskEmoji = getRiskLevelEmoji(finding.riskLevel);
          lines.push(
            `| ${riskEmoji} ${finding.riskLevel} | ${finding.tool} | ${finding.title} | ${finding.cweId} |`
          );
        }
        lines.push('');
      }

      if (secReport.resolvedFindings.length > 0) {
        lines.push('#### Resolved Findings');
        lines.push('');
        lines.push(`✅ ${secReport.resolvedFindings.length} security finding(s) resolved`);
        lines.push('');
      }

      lines.push(
        `**Risk Score:** ${secReport.previousRiskScore} → ${secReport.currentRiskScore} (${secReport.riskScoreChange >= 0 ? '+' : ''}${secReport.riskScoreChange})`
      );
      lines.push('');
    }
  }

  // Schema evolution section
  if (diff.schemaEvolutionReport) {
    const schemaReport = diff.schemaEvolutionReport;
    if (schemaReport.toolsWithIssues.length > 0 || schemaReport.structureChangedCount > 0) {
      lines.push('### Schema Evolution');
      lines.push('');

      if (schemaReport.hasBreakingChanges) {
        lines.push('⚠️ **Breaking schema changes detected**');
        lines.push('');
      }

      if (schemaReport.toolsWithIssues.length > 0) {
        lines.push('| Tool | Status | Changes |');
        lines.push('|------|--------|---------|');

        for (const issue of schemaReport.toolsWithIssues) {
          const statusIcon = issue.isBreaking ? '🔴' : issue.becameUnstable ? '🟡' : '🔵';
          const status = issue.isBreaking ? 'Breaking' : issue.becameUnstable ? 'Unstable' : 'Changed';
          lines.push(`| ${issue.toolName} | ${statusIcon} ${status} | ${issue.summary} |`);
        }
        lines.push('');
      }

      lines.push(`**Stability:** ${schemaReport.stableCount} stable, ${schemaReport.unstableCount} unstable`);
      if (schemaReport.structureChangedCount > 0) {
        lines.push(`**Structure changes:** ${schemaReport.structureChangedCount} tool(s)`);
      }
      lines.push('');
    }
  }

  // Error trend section
  if (diff.errorTrendReport) {
    const et = diff.errorTrendReport;
    if (et.significantChange || et.trends.length > 0) {
      lines.push('### Error Trends');
      lines.push('');

      if (et.significantChange) {
        lines.push(`⚠️ **Error behavior changed**: ${et.summary}`);
        lines.push('');
      }

      if (et.newCategories.length > 0 || et.resolvedCategories.length > 0 ||
          et.increasingCategories.length > 0 || et.decreasingCategories.length > 0) {
        lines.push('| Category | Trend | Previous | Current | Change |');
        lines.push('|----------|-------|----------|---------|--------|');

        for (const trend of et.trends.filter(t => t.trend !== 'stable')) {
          const trendEmoji = getTrendEmoji(trend.trend);
          const changeStr = trend.changePercent !== 0
            ? `${trend.changePercent > 0 ? '+' : ''}${trend.changePercent}%`
            : '-';
          lines.push(
            `| ${trend.category} | ${trendEmoji} ${trend.trend} | ${trend.previousCount} | ${trend.currentCount} | ${changeStr} |`
          );
        }
        lines.push('');
      }
    }
  }

  // Performance section
  if (diff.performanceReport) {
    const perfReport = diff.performanceReport;
    if (perfReport.hasRegressions || perfReport.improvementCount > 0 ||
        (perfReport.lowConfidenceTools && perfReport.lowConfidenceTools.length > 0)) {
      lines.push('### Performance');
      lines.push('');

      if (perfReport.hasRegressions) {
        lines.push('#### Regressions');
        lines.push('');
        lines.push('| Tool | Previous | Current | Change | Confidence |');
        lines.push('|------|----------|---------|--------|------------|');

        for (const regression of perfReport.regressions) {
          const percentStr = (regression.regressionPercent * 100).toFixed(1);
          const confidenceEmoji = regression.isReliable ? '✓' : '⚠️';
          const confidenceLabel = regression.currentConfidence ?? 'unknown';
          lines.push(
            `| ${regression.toolName} | ${regression.previousP50Ms.toFixed(0)}ms | ${regression.currentP50Ms.toFixed(0)}ms | +${percentStr}% | ${confidenceEmoji} ${confidenceLabel} |`
          );
        }
        lines.push('');
      }

      if (perfReport.lowConfidenceTools && perfReport.lowConfidenceTools.length > 0) {
        lines.push(`> **⚠️ Low confidence metrics**: ${perfReport.lowConfidenceTools.join(', ')}`);
        lines.push('> Consider running with more samples for reliable baselines.');
        lines.push('');
      }

      if (perfReport.confidenceChanges && perfReport.confidenceChanges.length > 0) {
        lines.push('#### Confidence Changes');
        lines.push('');
        lines.push('| Tool | Previous | Current | Status |');
        lines.push('|------|----------|---------|--------|');

        for (const change of perfReport.confidenceChanges) {
          const statusEmoji = change.improved ? '📈' : change.degraded ? '📉' : '➡️';
          lines.push(
            `| ${change.toolName} | ${change.previousLevel ?? 'N/A'} | ${change.currentLevel} | ${statusEmoji} ${change.improved ? 'Improved' : change.degraded ? 'Degraded' : 'Changed'} |`
          );
        }
        lines.push('');
      }
    }
  }

  // Documentation quality section
  if (diff.documentationScoreReport) {
    const doc = diff.documentationScoreReport;
    lines.push('### Documentation Quality');
    lines.push('');

    const changeIcon = doc.improved ? '📈' : doc.degraded ? '📉' : '➡️';
    const sign = doc.change > 0 ? '+' : '';
    lines.push(`**Score:** ${doc.currentScore}/100 (${doc.currentGrade}) ${changeIcon}`);

    if (doc.change !== 0) {
      lines.push(`**Change:** ${doc.previousScore} → ${doc.currentScore} (${sign}${doc.change})`);
      lines.push(`**Grade:** ${doc.previousGrade} → ${doc.currentGrade}`);
    }

    if (doc.issuesFixed > 0) {
      lines.push(`**Issues fixed:** ${doc.issuesFixed}`);
    }
    if (doc.newIssues > 0) {
      lines.push(`**New issues:** ${doc.newIssues}`);
    }
    lines.push('');
  }

  lines.push('### Statistics');
  lines.push('');
  lines.push(`- Breaking changes: **${diff.breakingCount}**`);
  lines.push(`- Warnings: **${diff.warningCount}**`);
  lines.push(`- Info: **${diff.infoCount}**`);
  if (diff.performanceReport) {
    lines.push(`- Performance regressions: **${diff.performanceReport.regressionCount}**`);
    if (diff.performanceReport.lowConfidenceTools && diff.performanceReport.lowConfidenceTools.length > 0) {
      lines.push(`- Low confidence tools: **${diff.performanceReport.lowConfidenceTools.length}**`);
    }
  }
  if (diff.securityReport) {
    lines.push(`- New security findings: **${diff.securityReport.newFindings.length}**`);
    lines.push(`- Resolved findings: **${diff.securityReport.resolvedFindings.length}**`);
  }
  if (diff.schemaEvolutionReport) {
    lines.push(`- Stable schemas: **${diff.schemaEvolutionReport.stableCount}**`);
    lines.push(`- Unstable schemas: **${diff.schemaEvolutionReport.unstableCount}**`);
    if (diff.schemaEvolutionReport.structureChangedCount > 0) {
      lines.push(`- Schema structure changes: **${diff.schemaEvolutionReport.structureChangedCount}**`);
    }
  }
  if (diff.errorTrendReport) {
    const et = diff.errorTrendReport;
    if (et.newCategories.length > 0) {
      lines.push(`- New error types: **${et.newCategories.length}**`);
    }
    if (et.resolvedCategories.length > 0) {
      lines.push(`- Resolved error types: **${et.resolvedCategories.length}**`);
    }
    if (et.increasingCategories.length > 0) {
      lines.push(`- Increasing errors: **${et.increasingCategories.length}**`);
    }
    if (et.decreasingCategories.length > 0) {
      lines.push(`- Decreasing errors: **${et.decreasingCategories.length}**`);
    }
  }
  if (diff.documentationScoreReport) {
    const doc = diff.documentationScoreReport;
    lines.push(`- Documentation score: **${doc.currentScore}/100** (${doc.currentGrade})`);
    if (doc.change !== 0) {
      const sign = doc.change > 0 ? '+' : '';
      lines.push(`- Documentation change: **${sign}${doc.change}**`);
    }
  }

  return lines.join('\n');
}

/**
 * Get emoji for error trend direction.
 */
function getTrendEmoji(trend: 'increasing' | 'decreasing' | 'stable' | 'new' | 'resolved'): string {
  switch (trend) {
    case 'new':
      return '🆕';
    case 'resolved':
      return '✅';
    case 'increasing':
      return '📈';
    case 'decreasing':
      return '📉';
    case 'stable':
      return '➡️';
  }
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

  // Test cases for performance regressions
  if (diff.performanceReport) {
    for (const regression of diff.performanceReport.regressions) {
      const name = escapeXml(`performance-${regression.toolName}`);
      const percentStr = (regression.regressionPercent * 100).toFixed(1);
      const confidenceNote = regression.isReliable ? '' : ' (low confidence)';

      lines.push(`    <testcase name="${name}" classname="drift.performance">`);
      lines.push(`      <failure message="Performance regression: +${percentStr}%${confidenceNote}" type="regression">`);
      lines.push(`Tool: ${escapeXml(regression.toolName)}`);
      lines.push(`Previous p50: ${regression.previousP50Ms.toFixed(0)}ms`);
      lines.push(`Current p50: ${regression.currentP50Ms.toFixed(0)}ms`);
      lines.push(`Regression: +${percentStr}%`);
      lines.push(`Confidence: ${regression.currentConfidence ?? 'unknown'}${regression.isReliable ? '' : ' (unreliable)'}`);
      lines.push('      </failure>');
      lines.push('    </testcase>');
    }

    // Low confidence tools
    if (diff.performanceReport.lowConfidenceTools && diff.performanceReport.lowConfidenceTools.length > 0) {
      for (const tool of diff.performanceReport.lowConfidenceTools) {
        const name = escapeXml(`confidence-${tool}`);
        lines.push(`    <testcase name="${name}" classname="drift.confidence">`);
        lines.push(`      <system-err>[NOTICE] Low confidence metrics for ${escapeXml(tool)}. Run with more samples for reliable baselines.</system-err>`);
        lines.push('    </testcase>');
      }
    }
  }

  // Test cases for security findings
  if (diff.securityReport) {
    for (const finding of diff.securityReport.newFindings) {
      const name = escapeXml(`security-${finding.tool}-${finding.category}`);
      const isFailure = finding.riskLevel === 'critical' || finding.riskLevel === 'high';

      lines.push(`    <testcase name="${name}" classname="drift.security">`);
      if (isFailure) {
        lines.push(`      <failure message="${escapeXml(finding.title)}" type="${finding.riskLevel}">`);
        lines.push(`Tool: ${escapeXml(finding.tool)}`);
        lines.push(`Parameter: ${escapeXml(finding.parameter)}`);
        lines.push(`CWE: ${escapeXml(finding.cweId)}`);
        lines.push(`Description: ${escapeXml(finding.description)}`);
        lines.push(`Remediation: ${escapeXml(finding.remediation)}`);
        lines.push('      </failure>');
      } else {
        lines.push(`      <system-err>[${finding.riskLevel.toUpperCase()}] ${escapeXml(finding.title)}</system-err>`);
      }
      lines.push('    </testcase>');
    }

    // Show resolved findings as passing tests
    for (const finding of diff.securityReport.resolvedFindings) {
      const name = escapeXml(`security-resolved-${finding.tool}-${finding.category}`);
      lines.push(`    <testcase name="${name}" classname="drift.security">`);
      lines.push(`      <system-out>Resolved: ${escapeXml(finding.title)} (${escapeXml(finding.cweId)})</system-out>`);
      lines.push('    </testcase>');
    }
  }

  // Test cases for schema evolution issues
  if (diff.schemaEvolutionReport) {
    for (const issue of diff.schemaEvolutionReport.toolsWithIssues) {
      const name = escapeXml(`schema-evolution-${issue.toolName}`);

      lines.push(`    <testcase name="${name}" classname="drift.schema">`);
      if (issue.isBreaking) {
        lines.push(`      <failure message="${escapeXml(issue.summary)}" type="breaking">`);
        lines.push(`Tool: ${escapeXml(issue.toolName)}`);
        if (issue.fieldsRemoved.length > 0) {
          lines.push(`Fields removed: ${escapeXml(issue.fieldsRemoved.join(', '))}`);
        }
        if (issue.fieldsAdded.length > 0) {
          lines.push(`Fields added: ${escapeXml(issue.fieldsAdded.join(', '))}`);
        }
        lines.push('      </failure>');
      } else if (issue.becameUnstable) {
        lines.push(`      <system-err>[WARNING] Schema became unstable: ${escapeXml(issue.summary)}</system-err>`);
      } else {
        lines.push(`      <system-out>[INFO] Schema changed: ${escapeXml(issue.summary)}</system-out>`);
      }
      lines.push('    </testcase>');
    }

    // Show stable schemas as passing tests
    if (diff.schemaEvolutionReport.stableCount > 0 && diff.schemaEvolutionReport.toolsWithIssues.length === 0) {
      lines.push(`    <testcase name="schema-stability-check" classname="drift.schema">`);
      lines.push(`      <system-out>${diff.schemaEvolutionReport.stableCount} tool(s) have stable response schemas</system-out>`);
      lines.push('    </testcase>');
    }
  }

  // Test cases for error trend changes
  if (diff.errorTrendReport) {
    const et = diff.errorTrendReport;

    // New error types (warnings)
    for (const category of et.newCategories) {
      const name = escapeXml(`error-trend-new-${category}`);
      lines.push(`    <testcase name="${name}" classname="drift.errors">`);
      lines.push(`      <system-err>[WARNING] New error type detected: ${escapeXml(category)}</system-err>`);
      lines.push('    </testcase>');
    }

    // Resolved error types (info)
    for (const category of et.resolvedCategories) {
      const name = escapeXml(`error-trend-resolved-${category}`);
      lines.push(`    <testcase name="${name}" classname="drift.errors">`);
      lines.push(`      <system-out>Resolved: ${escapeXml(category)} error type no longer occurs</system-out>`);
      lines.push('    </testcase>');
    }

    // Increasing error types (warnings)
    for (const category of et.increasingCategories) {
      const trend = et.trends.find(t => t.category === category);
      const name = escapeXml(`error-trend-increasing-${category}`);
      lines.push(`    <testcase name="${name}" classname="drift.errors">`);
      lines.push(`      <system-err>[WARNING] Error frequency increasing: ${escapeXml(category)}${trend ? ` (+${trend.changePercent}%)` : ''}</system-err>`);
      lines.push('    </testcase>');
    }

    // Overall error trend summary
    if (et.significantChange) {
      lines.push(`    <testcase name="error-trend-summary" classname="drift.errors">`);
      lines.push(`      <system-err>[WARNING] ${escapeXml(et.summary)}</system-err>`);
      lines.push('    </testcase>');
    } else if (et.trends.length > 0) {
      lines.push(`    <testcase name="error-trend-summary" classname="drift.errors">`);
      lines.push(`      <system-out>Error patterns stable</system-out>`);
      lines.push('    </testcase>');
    }
  }

  // Test case for documentation quality
  if (diff.documentationScoreReport) {
    const doc = diff.documentationScoreReport;
    const name = 'documentation-quality-score';

    lines.push(`    <testcase name="${name}" classname="drift.documentation">`);
    if (doc.degraded) {
      lines.push(`      <system-err>[WARNING] Documentation quality degraded: ${doc.previousScore} -> ${doc.currentScore} (${doc.currentGrade})</system-err>`);
      if (doc.newIssues > 0) {
        lines.push(`      <system-err>New documentation issues: ${doc.newIssues}</system-err>`);
      }
    } else if (doc.improved) {
      lines.push(`      <system-out>Documentation quality improved: ${doc.previousScore} -> ${doc.currentScore} (${doc.currentGrade})</system-out>`);
      if (doc.issuesFixed > 0) {
        lines.push(`      <system-out>Issues fixed: ${doc.issuesFixed}</system-out>`);
      }
    } else {
      lines.push(`      <system-out>Documentation quality: ${doc.currentScore}/100 (${doc.currentGrade})</system-out>`);
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
              {
                id: 'BWH007',
                name: 'SecurityFinding',
                shortDescription: { text: 'Security vulnerability detected' },
                fullDescription: {
                  text: 'A security vulnerability was detected during testing. The tool may be susceptible to injection attacks or other security issues.',
                },
                defaultConfiguration: { level: 'error' },
                help: {
                  text: 'Review the security finding and implement appropriate input validation, sanitization, or other mitigations.',
                },
              },
              {
                id: 'BWH008',
                name: 'SchemaEvolutionBreaking',
                shortDescription: { text: 'Breaking response schema change' },
                fullDescription: {
                  text: 'A breaking change was detected in a tool response schema, such as removed fields or type changes that may affect consumers.',
                },
                defaultConfiguration: { level: 'error' },
                help: {
                  text: 'Review the schema changes and update consumers accordingly. Consider versioning or migration paths for breaking changes.',
                },
              },
              {
                id: 'BWH009',
                name: 'SchemaEvolutionUnstable',
                shortDescription: { text: 'Unstable response schema detected' },
                fullDescription: {
                  text: 'The tool response schema is inconsistent across samples, indicating potential reliability issues.',
                },
                defaultConfiguration: { level: 'warning' },
                help: {
                  text: 'Investigate why the response schema varies. Consider normalizing responses or documenting optional fields.',
                },
              },
              {
                id: 'BWH010',
                name: 'ErrorTrendNew',
                shortDescription: { text: 'New error type detected' },
                fullDescription: {
                  text: 'A new type of error was detected that did not occur in the previous baseline.',
                },
                defaultConfiguration: { level: 'warning' },
                help: {
                  text: 'Review the new error type and ensure consumers handle it appropriately.',
                },
              },
              {
                id: 'BWH011',
                name: 'ErrorTrendIncreasing',
                shortDescription: { text: 'Error frequency increasing' },
                fullDescription: {
                  text: 'The frequency of a specific error type has significantly increased compared to the baseline.',
                },
                defaultConfiguration: { level: 'warning' },
                help: {
                  text: 'Investigate why errors are increasing. This may indicate a regression or environmental issue.',
                },
              },
              {
                id: 'BWH012',
                name: 'PerformanceRegression',
                shortDescription: { text: 'Performance regression detected' },
                fullDescription: {
                  text: 'A tool has significantly slower response times compared to the baseline.',
                },
                defaultConfiguration: { level: 'warning' },
                help: {
                  text: 'Investigate the cause of the performance regression. Review recent changes that may have impacted response times.',
                },
              },
              {
                id: 'BWH013',
                name: 'LowConfidenceMetrics',
                shortDescription: { text: 'Low confidence performance metrics' },
                fullDescription: {
                  text: 'Performance metrics have low statistical confidence due to insufficient samples or high variability.',
                },
                defaultConfiguration: { level: 'note' },
                help: {
                  text: 'Run with more samples (--samples flag) to establish reliable performance baselines.',
                },
              },
              {
                id: 'BWH014',
                name: 'DocumentationQualityDegraded',
                shortDescription: { text: 'Documentation quality degraded' },
                fullDescription: {
                  text: 'The documentation quality score has decreased compared to the baseline, indicating potential documentation issues.',
                },
                defaultConfiguration: { level: 'warning' },
                help: {
                  text: 'Review tool and parameter descriptions. Ensure all tools have meaningful descriptions and parameters are documented.',
                },
              },
              {
                id: 'BWH015',
                name: 'DocumentationQualityLow',
                shortDescription: { text: 'Low documentation quality score' },
                fullDescription: {
                  text: 'The documentation quality score is below acceptable thresholds (grade D or F).',
                },
                defaultConfiguration: { level: 'warning' },
                help: {
                  text: 'Add descriptions to tools and parameters. Consider adding examples to improve documentation.',
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

  // Add results for security findings
  if (diff.securityReport) {
    for (const finding of diff.securityReport.newFindings) {
      const level: 'note' | 'warning' | 'error' =
        finding.riskLevel === 'critical' || finding.riskLevel === 'high'
          ? 'error'
          : finding.riskLevel === 'medium'
            ? 'warning'
            : 'note';

      results.push({
        ruleId: 'BWH007',
        level,
        message: { text: `[${finding.riskLevel.toUpperCase()}] ${finding.tool}: ${finding.title}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: baselinePath },
              region: { startLine: 1 },
            },
          },
        ],
        properties: {
          tool: finding.tool,
          parameter: finding.parameter,
          category: finding.category,
          riskLevel: finding.riskLevel,
          cweId: finding.cweId,
          description: finding.description,
          remediation: finding.remediation,
          evidence: finding.evidence,
        },
      });
    }
  }

  // Add results for schema evolution issues
  if (diff.schemaEvolutionReport) {
    for (const issue of diff.schemaEvolutionReport.toolsWithIssues) {
      const ruleId = issue.isBreaking ? 'BWH008' : 'BWH009';
      const level: 'note' | 'warning' | 'error' = issue.isBreaking
        ? 'error'
        : issue.becameUnstable
          ? 'warning'
          : 'note';

      results.push({
        ruleId,
        level,
        message: { text: `${issue.toolName}: ${issue.summary}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: baselinePath },
              region: { startLine: 1 },
            },
          },
        ],
        properties: {
          tool: issue.toolName,
          isBreaking: issue.isBreaking,
          becameUnstable: issue.becameUnstable,
          fieldsAdded: issue.fieldsAdded,
          fieldsRemoved: issue.fieldsRemoved,
        },
      });
    }
  }

  // Add results for performance regressions and confidence
  if (diff.performanceReport) {
    // Performance regressions
    for (const regression of diff.performanceReport.regressions) {
      const percentStr = (regression.regressionPercent * 100).toFixed(1);
      const confidenceNote = regression.isReliable ? '' : ' (low confidence)';

      results.push({
        ruleId: 'BWH012',
        level: 'warning',
        message: {
          text: `Performance regression: ${regression.toolName} +${percentStr}%${confidenceNote}`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: baselinePath },
              region: { startLine: 1 },
            },
          },
        ],
        properties: {
          tool: regression.toolName,
          previousP50Ms: regression.previousP50Ms,
          currentP50Ms: regression.currentP50Ms,
          regressionPercent: regression.regressionPercent,
          isReliable: regression.isReliable,
          currentConfidence: regression.currentConfidence,
        },
      });
    }

    // Low confidence tools
    if (diff.performanceReport.lowConfidenceTools) {
      for (const tool of diff.performanceReport.lowConfidenceTools) {
        results.push({
          ruleId: 'BWH013',
          level: 'note',
          message: {
            text: `Low confidence metrics for "${tool}". Consider running with more samples.`,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: baselinePath },
                region: { startLine: 1 },
              },
            },
          ],
          properties: {
            tool,
            recommendation: 'Run with --samples flag for reliable baselines',
          },
        });
      }
    }
  }

  // Add results for error trend changes
  if (diff.errorTrendReport) {
    const et = diff.errorTrendReport;

    // New error types
    for (const category of et.newCategories) {
      results.push({
        ruleId: 'BWH010',
        level: 'warning',
        message: { text: `New error type detected: ${category}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: baselinePath },
              region: { startLine: 1 },
            },
          },
        ],
        properties: {
          category,
          trend: 'new',
          significance: 'high',
        },
      });
    }

    // Increasing error types
    for (const category of et.increasingCategories) {
      const trend = et.trends.find(t => t.category === category);
      results.push({
        ruleId: 'BWH011',
        level: 'warning',
        message: { text: `Error frequency increasing: ${category}${trend ? ` (+${trend.changePercent}%)` : ''}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: baselinePath },
              region: { startLine: 1 },
            },
          },
        ],
        properties: {
          category,
          trend: 'increasing',
          previousCount: trend?.previousCount,
          currentCount: trend?.currentCount,
          changePercent: trend?.changePercent,
        },
      });
    }
  }

  // Add results for documentation quality changes
  if (diff.documentationScoreReport) {
    const doc = diff.documentationScoreReport;

    if (doc.degraded) {
      results.push({
        ruleId: 'BWH014',
        level: 'warning',
        message: {
          text: `Documentation quality degraded: ${doc.previousScore} -> ${doc.currentScore} (${doc.currentGrade})`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: baselinePath },
              region: { startLine: 1 },
            },
          },
        ],
        properties: {
          previousScore: doc.previousScore,
          currentScore: doc.currentScore,
          change: doc.change,
          previousGrade: doc.previousGrade,
          currentGrade: doc.currentGrade,
          newIssues: doc.newIssues,
        },
      });
    }

    // Add warning for low documentation quality regardless of change
    if (doc.currentGrade === 'D' || doc.currentGrade === 'F') {
      results.push({
        ruleId: 'BWH015',
        level: 'warning',
        message: {
          text: `Low documentation quality: ${doc.currentScore}/100 (${doc.currentGrade})`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: baselinePath },
              region: { startLine: 1 },
            },
          },
        ],
        properties: {
          score: doc.currentScore,
          grade: doc.currentGrade,
        },
      });
    }
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

/**
 * Get color function for risk level.
 */
function getRiskLevelColor(
  riskLevel: RiskLevel,
  useColors: boolean
): (s: string) => string {
  const c = useColors ? colors : noColors;

  switch (riskLevel) {
    case 'critical':
    case 'high':
      return c.red;
    case 'medium':
      return c.yellow;
    case 'low':
      return c.cyan;
    case 'info':
    default:
      return c.dim;
  }
}

/**
 * Get emoji for risk level (used in markdown output).
 */
function getRiskLevelEmoji(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    case 'low':
      return '🔵';
    case 'info':
    default:
      return '⚪';
  }
}

/**
 * Format a summary for schema evolution report.
 */
function formatSchemaEvolutionSummary(report: SchemaEvolutionReport): string {
  const parts: string[] = [];

  if (report.hasBreakingChanges) {
    parts.push('Breaking schema changes detected');
  }

  if (report.unstableCount > 0) {
    parts.push(`${report.unstableCount} unstable schema(s)`);
  }

  if (report.structureChangedCount > 0) {
    parts.push(`${report.structureChangedCount} structure change(s)`);
  }

  if (parts.length === 0) {
    return `${report.stableCount} stable schema(s)`;
  }

  return parts.join(', ');
}

/**
 * Format a standalone security report for display.
 * Used when only security data is available (not a full diff).
 */
export function formatSecurityReport(
  report: SecurityDiff,
  useColors: boolean = true
): string {
  const lines: string[] = [];
  const { red, green, bold, dim } = useColors ? colors : noColors;

  lines.push(bold('Security Report'));
  lines.push('═'.repeat(50));
  lines.push('');

  // Summary
  lines.push(report.summary);
  lines.push('');

  // Risk score
  const scoreColor = report.degraded ? red : green;
  const changeSymbol = report.riskScoreChange > 0 ? '↑' : report.riskScoreChange < 0 ? '↓' : '→';
  lines.push(
    `Risk Score: ${report.previousRiskScore} ${changeSymbol} ${scoreColor(String(report.currentRiskScore))}`
  );
  lines.push('');

  // New findings
  if (report.newFindings.length > 0) {
    lines.push(red('─── New Findings ───'));
    for (const finding of report.newFindings) {
      const riskColor = getRiskLevelColor(finding.riskLevel, useColors);
      lines.push(`  ${riskColor('●')} [${finding.riskLevel.toUpperCase()}] ${finding.title}`);
      lines.push(`    Tool: ${finding.tool}`);
      lines.push(`    Parameter: ${finding.parameter}`);
      lines.push(`    ${finding.cweId}: ${finding.description}`);
      lines.push(`    ${dim('Remediation:')} ${finding.remediation}`);
      lines.push('');
    }
  }

  // Resolved findings
  if (report.resolvedFindings.length > 0) {
    lines.push(green('─── Resolved Findings ───'));
    for (const finding of report.resolvedFindings) {
      lines.push(`  ${green('✓')} ${finding.title} (${finding.tool})`);
    }
    lines.push('');
  }

  // Statistics
  lines.push('─── Statistics ───');
  lines.push(`  New findings: ${report.newFindings.length}`);
  lines.push(`  Resolved findings: ${report.resolvedFindings.length}`);

  const criticalHigh = report.newFindings.filter(
    (f) => f.riskLevel === 'critical' || f.riskLevel === 'high'
  ).length;
  if (criticalHigh > 0) {
    lines.push(`  ${red('Critical/High severity:')} ${criticalHigh}`);
  }
  lines.push('');

  return lines.join('\n');
}
