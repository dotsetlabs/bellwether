/**
 * Regression Risk Scorer.
 *
 * Calculates weighted risk scores for detected changes to help prioritize fixes.
 * Considers multiple factors: breaking changes, tool importance, error rates,
 * performance regressions, and security posture.
 */

import type {
  BehavioralDiff,
  BehaviorChange,
} from './types.js';
import { REGRESSION_RISK } from '../constants.js';

/**
 * A single risk factor contributing to the overall score.
 */
export interface RiskFactor {
  /** Name of the risk factor */
  name: string;
  /** Weight in overall calculation (0-1) */
  weight: number;
  /** Raw score (0-100) */
  score: number;
  /** Weighted contribution to overall score */
  weightedScore: number;
  /** Details about this factor */
  details: string;
}

/**
 * Complete regression risk score.
 */
export interface RegressionRiskScore {
  /** Overall risk score (0-100) */
  score: number;
  /** Risk level classification */
  level: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Individual risk factors */
  factors: RiskFactor[];
  /** Human-readable recommendation */
  recommendation: string;
  /** Breakdown of changes by severity */
  changeSummary: {
    breaking: number;
    warning: number;
    info: number;
    toolsRemoved: number;
    toolsAdded: number;
    toolsModified: number;
  };
}

/**
 * Calculate regression risk score from a behavioral diff.
 */
export function calculateRiskScore(diff: BehavioralDiff): RegressionRiskScore {
  const factors: RiskFactor[] = [];

  // Factor 1: Breaking Change Severity
  const breakingFactor = scoreBreakingChanges(diff);
  factors.push(breakingFactor);

  // Factor 2: Affected Tool Importance
  const importanceFactor = scoreToolImportance(diff);
  factors.push(importanceFactor);

  // Factor 3: Error Rate Delta
  const errorFactor = scoreErrorDelta(diff);
  factors.push(errorFactor);

  // Factor 4: Performance Regression
  const performanceFactor = scorePerformanceRegression(diff);
  factors.push(performanceFactor);

  // Factor 5: Security Posture
  const securityFactor = scoreSecurityChange(diff);
  factors.push(securityFactor);

  // Calculate overall score
  const overallScore = Math.round(
    factors.reduce((sum, f) => sum + f.weightedScore, 0)
  );

  // Determine risk level
  const level = getRiskLevel(overallScore);

  // Generate recommendation
  const recommendation = generateRecommendation(overallScore, factors, diff);

  // Build change summary
  const changeSummary = {
    breaking: diff.breakingCount,
    warning: diff.warningCount,
    info: diff.infoCount,
    toolsRemoved: diff.toolsRemoved.length,
    toolsAdded: diff.toolsAdded.length,
    toolsModified: diff.toolsModified.length,
  };

  return {
    score: overallScore,
    level,
    factors,
    recommendation,
    changeSummary,
  };
}

/**
 * Score breaking changes based on type and count.
 */
function scoreBreakingChanges(diff: BehavioralDiff): RiskFactor {
  const weight = REGRESSION_RISK.WEIGHTS.breakingChangeSeverity;
  let score = 0;
  const details: string[] = [];

  // Score removed tools (most severe)
  if (diff.toolsRemoved.length > 0) {
    score = Math.max(score, REGRESSION_RISK.BREAKING_SCORES.toolRemoved);
    details.push(`${diff.toolsRemoved.length} tool(s) removed`);
  }

  // Score breaking behavior changes
  for (const change of diff.behaviorChanges) {
    if (change.severity === 'breaking') {
      const changeScore = getChangeScore(change);
      score = Math.max(score, changeScore);
      details.push(`${change.aspect}: ${change.description.slice(0, 50)}`);
    }
  }

  // Compound score based on count
  if (diff.breakingCount > 1) {
    score = Math.min(100, score + (diff.breakingCount - 1) * 10);
  }

  return {
    name: 'Breaking Changes',
    weight,
    score,
    weightedScore: score * weight,
    details: details.length > 0 ? details.join('; ') : 'No breaking changes',
  };
}

/**
 * Get score for a specific change type.
 */
function getChangeScore(change: BehaviorChange): number {
  const description = change.description.toLowerCase();

  if (description.includes('removed') && description.includes('required')) {
    return REGRESSION_RISK.BREAKING_SCORES.requiredParamRemoved;
  }
  if (description.includes('type') && description.includes('changed')) {
    return REGRESSION_RISK.BREAKING_SCORES.typeChanged;
  }
  if (description.includes('enum') && description.includes('removed')) {
    return REGRESSION_RISK.BREAKING_SCORES.enumValueRemoved;
  }
  if (description.includes('constraint') && description.includes('tightened')) {
    return REGRESSION_RISK.BREAKING_SCORES.constraintTightened;
  }
  if (description.includes('required') && description.includes('added')) {
    return REGRESSION_RISK.BREAKING_SCORES.requiredParamAdded;
  }

  // Default score for unrecognized breaking changes
  return 50;
}

/**
 * Score based on importance of affected tools.
 */
function scoreToolImportance(diff: BehavioralDiff): RiskFactor {
  const weight = REGRESSION_RISK.WEIGHTS.toolImportance;
  let score = 0;
  const details: string[] = [];

  // Analyze affected tools
  const affectedTools = [
    ...diff.toolsRemoved,
    ...diff.toolsModified.map(t => t.tool),
  ];

  let highImportanceCount = 0;
  let lowImportanceCount = 0;

  for (const toolDiff of diff.toolsModified) {
    const description = toolDiff.previous?.description || toolDiff.current?.description || '';

    // Check for high importance indicators
    const isHighImportance = REGRESSION_RISK.IMPORTANCE_PATTERNS.highFrequency.some(
      pattern => pattern.test(description)
    );

    // Check for low importance indicators
    const isLowImportance = REGRESSION_RISK.IMPORTANCE_PATTERNS.lowFrequency.some(
      pattern => pattern.test(description)
    );

    if (isHighImportance) {
      highImportanceCount++;
    } else if (isLowImportance) {
      lowImportanceCount++;
    }
  }

  // Calculate score based on importance distribution
  const totalAffected = affectedTools.length;
  if (totalAffected > 0) {
    const importanceRatio = highImportanceCount / totalAffected;
    score = Math.round(importanceRatio * 100);

    if (highImportanceCount > 0) {
      details.push(`${highImportanceCount} high-importance tool(s) affected`);
    }
    if (lowImportanceCount > 0 && lowImportanceCount === totalAffected) {
      score = Math.max(0, score - 20);
      details.push('Only low-importance tools affected');
    }
  }

  // Minimum score if there are any breaking changes in any tools
  if (diff.breakingCount > 0 && score < 30) {
    score = 30;
  }

  return {
    name: 'Tool Importance',
    weight,
    score,
    weightedScore: score * weight,
    details: details.length > 0 ? details.join('; ') : 'No high-importance tools affected',
  };
}

/**
 * Score based on error rate changes.
 */
function scoreErrorDelta(diff: BehavioralDiff): RiskFactor {
  const weight = REGRESSION_RISK.WEIGHTS.errorRateDelta;
  let score = 0;
  const details: string[] = [];

  // Check error trend report if available
  if (diff.errorTrendReport) {
    const report = diff.errorTrendReport;

    // Score based on new error categories
    if (report.newCategories.length > 0) {
      score = Math.max(score, 70);
      details.push(`${report.newCategories.length} new error category(s)`);
    }

    // Score based on increasing error rates
    for (const trend of report.trends) {
      if (trend.trend === 'increasing') {
        if (trend.changePercent >= REGRESSION_RISK.ERROR_RATE.CRITICAL_INCREASE) {
          score = Math.max(score, 90);
          details.push(`${trend.category}: +${Math.round(trend.changePercent)}%`);
        } else if (trend.changePercent >= REGRESSION_RISK.ERROR_RATE.SIGNIFICANT_INCREASE) {
          score = Math.max(score, 60);
        }
      }
    }
  }

  // Fallback to behavior changes for error patterns
  const errorChanges = diff.behaviorChanges.filter(c => c.aspect === 'error_pattern');
  if (errorChanges.length > 0 && score === 0) {
    score = REGRESSION_RISK.ERROR_RATE.BASE_SCORE;
    details.push(`${errorChanges.length} error pattern change(s)`);
  }

  return {
    name: 'Error Rate',
    weight,
    score,
    weightedScore: score * weight,
    details: details.length > 0 ? details.join('; ') : 'No error rate changes',
  };
}

/**
 * Score based on performance regressions.
 */
function scorePerformanceRegression(diff: BehavioralDiff): RiskFactor {
  const weight = REGRESSION_RISK.WEIGHTS.performanceRegression;
  let score = 0;
  const details: string[] = [];

  if (!diff.performanceReport) {
    return {
      name: 'Performance',
      weight,
      score: 0,
      weightedScore: 0,
      details: 'No performance data available',
    };
  }

  const report = diff.performanceReport;

  if (!report.hasRegressions) {
    if (report.improvementCount > 0) {
      details.push(`${report.improvementCount} tool(s) improved`);
    }
    return {
      name: 'Performance',
      weight,
      score: 0,
      weightedScore: 0,
      details: details.length > 0 ? details.join('; ') : 'No performance regressions',
    };
  }

  // Score each regression
  for (const regression of report.regressions) {
    if (!regression.exceedsThreshold) continue;

    const percent = regression.regressionPercent;
    let regressionScore: number;

    if (percent >= REGRESSION_RISK.PERFORMANCE.CRITICAL_REGRESSION) {
      regressionScore = REGRESSION_RISK.PERFORMANCE.SCORES.critical;
      details.push(`${regression.toolName}: +${Math.round(percent)}% (critical)`);
    } else if (percent >= REGRESSION_RISK.PERFORMANCE.MAJOR_REGRESSION) {
      regressionScore = REGRESSION_RISK.PERFORMANCE.SCORES.major;
      details.push(`${regression.toolName}: +${Math.round(percent)}% (major)`);
    } else {
      regressionScore = REGRESSION_RISK.PERFORMANCE.SCORES.minor;
    }

    score = Math.max(score, regressionScore);
  }

  // Compound for multiple regressions
  if (report.regressionCount > 1) {
    score = Math.min(100, score + (report.regressionCount - 1) * 5);
  }

  return {
    name: 'Performance',
    weight,
    score,
    weightedScore: score * weight,
    details: details.length > 0 ? details.join('; ') : `${report.regressionCount} regression(s)`,
  };
}

/**
 * Score based on security posture changes.
 */
function scoreSecurityChange(diff: BehavioralDiff): RiskFactor {
  const weight = REGRESSION_RISK.WEIGHTS.securityPosture;
  let score = 0;
  const details: string[] = [];

  if (!diff.securityReport) {
    return {
      name: 'Security',
      weight,
      score: 0,
      weightedScore: 0,
      details: 'No security testing data',
    };
  }

  const report = diff.securityReport;

  // Score new vulnerabilities
  if (report.newFindings && report.newFindings.length > 0) {
    const criticalCount = report.newFindings.filter(f => f.riskLevel === 'critical').length;
    const highCount = report.newFindings.filter(f => f.riskLevel === 'high').length;

    if (criticalCount > 0) {
      score = REGRESSION_RISK.SECURITY.NEW_VULNERABILITY;
      details.push(`${criticalCount} new critical vulnerability(ies)`);
    } else if (highCount > 0) {
      score = Math.max(score, 80);
      details.push(`${highCount} new high severity finding(s)`);
    } else {
      score = Math.max(score, 50);
      details.push(`${report.newFindings.length} new security finding(s)`);
    }
  }

  // Credit resolved vulnerabilities
  if (report.resolvedFindings && report.resolvedFindings.length > 0) {
    score = Math.max(0, score + REGRESSION_RISK.SECURITY.RESOLVED_VULNERABILITY);
    details.push(`${report.resolvedFindings.length} resolved`);
  }

  // Score severity increases
  if (report.riskScoreChange && report.riskScoreChange > 0) {
    score = Math.max(score, REGRESSION_RISK.SECURITY.SEVERITY_INCREASE);
    details.push('Overall security risk score increased');
  }

  return {
    name: 'Security',
    weight,
    score: Math.max(0, score),
    weightedScore: Math.max(0, score) * weight,
    details: details.length > 0 ? details.join('; ') : 'No security changes',
  };
}

/**
 * Get risk level from score.
 */
function getRiskLevel(score: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (score >= REGRESSION_RISK.LEVEL_THRESHOLDS.critical) return 'critical';
  if (score >= REGRESSION_RISK.LEVEL_THRESHOLDS.high) return 'high';
  if (score >= REGRESSION_RISK.LEVEL_THRESHOLDS.medium) return 'medium';
  if (score >= REGRESSION_RISK.LEVEL_THRESHOLDS.low) return 'low';
  return 'info';
}

/**
 * Generate recommendation based on risk analysis.
 */
function generateRecommendation(
  score: number,
  factors: RiskFactor[],
  diff: BehavioralDiff
): string {
  const level = getRiskLevel(score);

  // Find highest contributing factor
  const sortedFactors = [...factors].sort((a, b) => b.weightedScore - a.weightedScore);
  const topFactor = sortedFactors[0];

  switch (level) {
    case 'critical':
      if (diff.toolsRemoved.length > 0) {
        return 'CRITICAL: Tools were removed. Ensure consumers are migrated before releasing.';
      }
      if (topFactor.name === 'Security') {
        return 'CRITICAL: Security vulnerabilities introduced. Address before any deployment.';
      }
      return 'CRITICAL: Major breaking changes detected. Requires thorough review and migration plan.';

    case 'high':
      if (topFactor.name === 'Performance') {
        return 'HIGH RISK: Significant performance regressions. Profile and optimize before release.';
      }
      if (topFactor.name === 'Error Rate') {
        return 'HIGH RISK: Error rates increased substantially. Investigate new failure modes.';
      }
      return 'HIGH RISK: Multiple breaking changes. Create deprecation notices and migration guides.';

    case 'medium':
      if (topFactor.name === 'Tool Importance') {
        return 'MEDIUM RISK: Changes affect important tools. Stage release with deprecation warnings.';
      }
      return 'MEDIUM RISK: Notable changes detected. Test with key consumers before release.';

    case 'low':
      if (diff.warningCount > 0) {
        return 'LOW RISK: Minor changes with warnings. Review before release but likely safe.';
      }
      return 'LOW RISK: Changes are minor. Standard release process should be sufficient.';

    default:
      if (diff.infoCount > 0) {
        return 'MINIMAL RISK: Only informational changes. Safe to release.';
      }
      return 'NO RISK: No significant changes detected.';
  }
}

/**
 * Generate markdown report for risk score.
 */
export function generateRiskScoreMarkdown(riskScore: RegressionRiskScore): string {
  const lines: string[] = [];

  // Risk level badge
  const levelEmoji: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
    info: '⚪',
  };

  lines.push('## Regression Risk Assessment');
  lines.push('');
  lines.push(`**Risk Level: ${levelEmoji[riskScore.level]} ${riskScore.level.toUpperCase()}** (Score: ${riskScore.score}/100)`);
  lines.push('');
  lines.push(`> ${riskScore.recommendation}`);
  lines.push('');

  // Factor breakdown
  lines.push('### Risk Factors');
  lines.push('');
  lines.push('| Factor | Score | Weight | Details |');
  lines.push('|--------|-------|--------|---------|');

  for (const factor of riskScore.factors) {
    const bar = generateScoreBar(factor.score);
    const weightPercent = Math.round(factor.weight * 100);
    lines.push(
      `| ${factor.name} | ${bar} ${factor.score}/100 | ${weightPercent}% | ${factor.details} |`
    );
  }

  lines.push('');

  // Change summary
  lines.push('### Change Summary');
  lines.push('');
  const summary = riskScore.changeSummary;
  if (summary.breaking > 0 || summary.warning > 0 || summary.info > 0) {
    lines.push('| Type | Count |');
    lines.push('|------|-------|');
    if (summary.breaking > 0) lines.push(`| Breaking | ${summary.breaking} |`);
    if (summary.warning > 0) lines.push(`| Warnings | ${summary.warning} |`);
    if (summary.info > 0) lines.push(`| Info | ${summary.info} |`);
    if (summary.toolsRemoved > 0) lines.push(`| Tools Removed | ${summary.toolsRemoved} |`);
    if (summary.toolsAdded > 0) lines.push(`| Tools Added | ${summary.toolsAdded} |`);
    if (summary.toolsModified > 0) lines.push(`| Tools Modified | ${summary.toolsModified} |`);
    lines.push('');
  } else {
    lines.push('No changes detected.');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate ASCII score bar.
 */
function generateScoreBar(score: number, width = 10): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}
