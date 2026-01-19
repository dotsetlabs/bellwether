/**
 * Health Scoring System
 *
 * Calculates a comprehensive health score (0-100) for an MCP server.
 * Combines multiple factors: test coverage, error rate, performance, deprecation, and breaking changes.
 */

import type {
  BehavioralBaseline,
  BehavioralDiff,
  ChangeSeverity,
} from './types.js';
import type { PerformanceReport } from './performance-tracker.js';
import type { DeprecationReport } from './deprecation-tracker.js';
import type { DiffImpactAnalysis } from './change-impact-analyzer.js';
import { HEALTH_SCORING } from '../constants.js';
/**
 * Health trend direction.
 */
export type HealthTrend = 'improving' | 'stable' | 'degrading';

/**
 * Priority level for action items.
 */
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Action item for improving health score.
 */
export interface HealthActionItem {
  /** Priority of the action */
  priority: ActionPriority;
  /** Category of the action */
  category: 'coverage' | 'errors' | 'performance' | 'deprecation' | 'breaking_changes' | 'documentation';
  /** Description of the issue */
  description: string;
  /** Suggested action to take */
  suggestedAction: string;
  /** Estimated impact on health score */
  estimatedImpact: number;
  /** Related tool name (if applicable) */
  tool?: string;
}

/**
 * Component scores that make up the overall health score.
 */
export interface HealthComponents {
  /** Test coverage score (0-100) - % of tools with passing tests */
  testCoverage: number;
  /** Error rate score (0-100) - inverse of % failing tests */
  errorRate: number;
  /** Performance score (0-100) - based on latency trends */
  performanceScore: number;
  /** Deprecation score (0-100) - penalty for deprecated tools */
  deprecationScore: number;
  /** Breaking change score (0-100) - penalty for breaking changes */
  breakingChangeScore: number;
  /** Documentation score (0-100) - based on description quality */
  documentationScore: number;
}

/**
 * Comprehensive health score result.
 */
export interface HealthScore {
  /** Overall health score (0-100) */
  overall: number;
  /** Individual component scores */
  components: HealthComponents;
  /** Health trend (requires historical data) */
  trend: HealthTrend;
  /** Letter grade (A-F) */
  grade: string;
  /** Severity classification */
  severity: ChangeSeverity;
  /** Prioritized action items for improvement */
  actionItems: HealthActionItem[];
  /** Human-readable summary */
  summary: string;
  /** Timestamp of when score was calculated */
  calculatedAt: Date;
}

/**
 * Historical health data for trend analysis.
 */
export interface HealthHistory {
  /** Timestamp */
  timestamp: Date;
  /** Overall score at that time */
  overallScore: number;
  /** Component scores at that time */
  components: HealthComponents;
}

/**
 * Input data for health calculation.
 */
export interface HealthInput {
  /** Current baseline */
  baseline: BehavioralBaseline;
  /** Diff from previous baseline (if available) */
  diff?: BehavioralDiff;
  /** Performance report (if available) */
  performanceReport?: PerformanceReport;
  /** Deprecation report (if available) */
  deprecationReport?: DeprecationReport;
  /** Impact analysis (if available) */
  impactAnalysis?: DiffImpactAnalysis;
  /** Historical health data for trend analysis */
  history?: HealthHistory[];
  /** Test results (tool name -> passed/failed) */
  testResults?: Map<string, { passed: number; failed: number }>;
}
// Re-export centralized constant for backwards compatibility
export { HEALTH_SCORING } from '../constants.js';

/**
 * Weight configuration for component scores.
 * Uses values from centralized constants.
 */
export const HEALTH_WEIGHTS = HEALTH_SCORING.WEIGHTS;

/**
 * Grade thresholds.
 * Uses values from centralized constants.
 */
export const GRADE_THRESHOLDS = HEALTH_SCORING.GRADE_THRESHOLDS;

/**
 * Severity thresholds.
 * Uses values from centralized constants.
 */
export const SEVERITY_THRESHOLDS = HEALTH_SCORING.SEVERITY_THRESHOLDS;

/**
 * Penalty values for various issues.
 * Uses values from centralized constants.
 */
export const HEALTH_PENALTIES = HEALTH_SCORING.PENALTIES;
/**
 * Calculate comprehensive health score for an MCP server.
 */
export function calculateHealthScore(input: HealthInput): HealthScore {
  const components = calculateComponents(input);
  const overall = calculateOverallScore(components);
  const grade = calculateGrade(overall);
  const severity = calculateSeverity(overall);
  const trend = calculateTrend(overall, input.history);
  const actionItems = generateActionItems(input, components);
  const summary = generateHealthSummary(overall, components, trend);

  return {
    overall,
    components,
    trend,
    grade,
    severity,
    actionItems,
    summary,
    calculatedAt: new Date(),
  };
}

/**
 * Calculate individual component scores.
 */
function calculateComponents(input: HealthInput): HealthComponents {
  return {
    testCoverage: calculateTestCoverageScore(input),
    errorRate: calculateErrorRateScore(input),
    performanceScore: calculatePerformanceScore(input),
    deprecationScore: calculateDeprecationScore(input),
    breakingChangeScore: calculateBreakingChangeScore(input),
    documentationScore: calculateDocumentationScore(input),
  };
}

/**
 * Calculate overall score from component scores.
 */
function calculateOverallScore(components: HealthComponents): number {
  const weighted =
    components.testCoverage * HEALTH_WEIGHTS.testCoverage +
    components.errorRate * HEALTH_WEIGHTS.errorRate +
    components.performanceScore * HEALTH_WEIGHTS.performanceScore +
    components.deprecationScore * HEALTH_WEIGHTS.deprecationScore +
    components.breakingChangeScore * HEALTH_WEIGHTS.breakingChangeScore +
    components.documentationScore * HEALTH_WEIGHTS.documentationScore;

  return Math.round(Math.max(0, Math.min(100, weighted)));
}
/**
 * Calculate test coverage score.
 */
function calculateTestCoverageScore(input: HealthInput): number {
  const { baseline, testResults } = input;

  if (!testResults || testResults.size === 0) {
    // If no explicit test results, use tool count as proxy for coverage
    const toolCount = baseline.tools.length;
    if (toolCount === 0) return 100; // No tools = perfect score
    return 80; // Default score when no test data
  }

  const totalTools = baseline.tools.length;
  const testedTools = testResults.size;

  // Coverage percentage
  const coveragePercent = totalTools > 0 ? (testedTools / totalTools) * 100 : 100;

  return Math.round(coveragePercent);
}

/**
 * Calculate error rate score (inverse of error rate).
 */
function calculateErrorRateScore(input: HealthInput): number {
  const { testResults } = input;

  if (!testResults || testResults.size === 0) {
    return 100; // No data = assume perfect
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const { passed, failed } of testResults.values()) {
    totalPassed += passed;
    totalFailed += failed;
  }

  const total = totalPassed + totalFailed;
  if (total === 0) return 100;

  // Score is inverse of error rate
  const successRate = totalPassed / total;
  return Math.round(successRate * 100);
}

/**
 * Calculate performance score.
 */
function calculatePerformanceScore(input: HealthInput): number {
  const { performanceReport } = input;

  if (!performanceReport) {
    return 100; // No data = assume perfect
  }

  // Start with 100 and subtract penalties
  let score = 100;

  // Penalty for regressions
  score -= performanceReport.regressionCount * HEALTH_PENALTIES.performanceRegression;

  // Bonus for improvements
  score += performanceReport.improvementCount * 5;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Calculate deprecation score.
 */
function calculateDeprecationScore(input: HealthInput): number {
  const { baseline, deprecationReport } = input;

  // Start with perfect score
  let score = 100;

  if (deprecationReport) {
    // Penalty for deprecated tools
    score -= deprecationReport.deprecatedCount * HEALTH_PENALTIES.deprecatedTool;
    // Higher penalty for expired tools
    score -= deprecationReport.expiredCount * HEALTH_PENALTIES.expiredTool;
  } else {
    // Calculate from baseline directly
    const deprecatedTools = baseline.tools.filter(t => t.deprecated);
    score -= deprecatedTools.length * HEALTH_PENALTIES.deprecatedTool;

    const expiredTools = baseline.tools.filter(t => {
      if (!t.deprecated || !t.removalDate) return false;
      return new Date() > new Date(t.removalDate);
    });
    score -= expiredTools.length * HEALTH_PENALTIES.expiredTool;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Calculate breaking change score.
 */
function calculateBreakingChangeScore(input: HealthInput): number {
  const { diff, impactAnalysis } = input;

  // No changes = perfect score
  if (!diff) {
    return 100;
  }

  let score = 100;

  // Penalty for removed tools
  score -= diff.toolsRemoved.length * HEALTH_PENALTIES.breakingChange;

  // Penalty for breaking changes
  score -= diff.breakingCount * HEALTH_PENALTIES.breakingChange;

  // Smaller penalty for warnings
  score -= diff.warningCount * HEALTH_PENALTIES.warningChange;

  // Use impact analysis if available for more accurate scoring
  if (impactAnalysis) {
    for (const [, impact] of impactAnalysis.toolImpacts) {
      if (!impact.backwardsCompatible) {
        score -= 5; // Additional penalty for non-backwards-compatible changes
      }
    }
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Calculate documentation score.
 */
function calculateDocumentationScore(input: HealthInput): number {
  const { baseline } = input;

  if (baseline.tools.length === 0) {
    return 100;
  }

  let score = 100;

  for (const tool of baseline.tools) {
    if (!tool.description || tool.description.trim() === '') {
      score -= HEALTH_PENALTIES.missingDescription;
    } else if (tool.description.length < HEALTH_SCORING.MIN_DESCRIPTION_LENGTH) {
      score -= HEALTH_PENALTIES.shortDescription;
    }
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}
/**
 * Calculate letter grade from score.
 */
function calculateGrade(score: number): string {
  if (score >= GRADE_THRESHOLDS.A) return 'A';
  if (score >= GRADE_THRESHOLDS.B) return 'B';
  if (score >= GRADE_THRESHOLDS.C) return 'C';
  if (score >= GRADE_THRESHOLDS.D) return 'D';
  return 'F';
}

/**
 * Calculate severity from score.
 */
function calculateSeverity(score: number): ChangeSeverity {
  if (score >= SEVERITY_THRESHOLDS.none) return 'none';
  if (score >= SEVERITY_THRESHOLDS.info) return 'info';
  if (score >= SEVERITY_THRESHOLDS.warning) return 'warning';
  return 'breaking';
}

/**
 * Calculate trend from historical data.
 */
function calculateTrend(current: number, history?: HealthHistory[]): HealthTrend {
  if (!history || history.length < 2) {
    return 'stable';
  }

  // Sort by timestamp (newest first)
  const sorted = [...history].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Compare current to recent average
  const recentScores = sorted.slice(0, HEALTH_SCORING.MAX_ACTION_ITEMS_DISPLAY).map(h => h.overallScore);
  const recentAvg = recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length;

  const diff = current - recentAvg;

  if (diff > HEALTH_SCORING.TREND_THRESHOLD) return 'improving';
  if (diff < -HEALTH_SCORING.TREND_THRESHOLD) return 'degrading';
  return 'stable';
}
/**
 * Generate prioritized action items for improving health.
 */
function generateActionItems(input: HealthInput, components: HealthComponents): HealthActionItem[] {
  const items: HealthActionItem[] = [];

  // Low test coverage
  if (components.testCoverage < 80) {
    items.push({
      priority: components.testCoverage < 50 ? 'high' : 'medium',
      category: 'coverage',
      description: `Test coverage is ${components.testCoverage}%`,
      suggestedAction: 'Add tests for uncovered tools',
      estimatedImpact: Math.min(20, 100 - components.testCoverage) * HEALTH_WEIGHTS.testCoverage,
    });
  }

  // High error rate
  if (components.errorRate < 90) {
    items.push({
      priority: components.errorRate < 70 ? 'critical' : 'high',
      category: 'errors',
      description: `${100 - components.errorRate}% of tests are failing`,
      suggestedAction: 'Fix failing tests or update test expectations',
      estimatedImpact: (100 - components.errorRate) * HEALTH_WEIGHTS.errorRate,
    });
  }

  // Performance issues
  if (components.performanceScore < 80 && input.performanceReport) {
    const regressions = input.performanceReport.toolComparisons.filter(c => c.hasRegression);
    for (const regression of regressions) {
      items.push({
        priority: 'high',
        category: 'performance',
        description: `Performance regression detected for "${regression.toolName}"`,
        suggestedAction: 'Investigate and optimize the tool implementation',
        estimatedImpact: HEALTH_PENALTIES.performanceRegression * HEALTH_WEIGHTS.performanceScore,
        tool: regression.toolName,
      });
    }
  }

  // Deprecation issues
  if (components.deprecationScore < 100 && input.deprecationReport) {
    const expired = input.deprecationReport.warnings.filter(w => w.isPastRemoval);
    for (const warning of expired) {
      items.push({
        priority: 'critical',
        category: 'deprecation',
        description: `Tool "${warning.toolName}" is past its removal date`,
        suggestedAction: warning.replacementTool
          ? `Migrate to "${warning.replacementTool}"`
          : 'Remove usage of deprecated tool',
        estimatedImpact: HEALTH_PENALTIES.expiredTool * HEALTH_WEIGHTS.deprecationScore,
        tool: warning.toolName,
      });
    }

    const deprecated = input.deprecationReport.warnings.filter(w => !w.isPastRemoval);
    for (const warning of deprecated) {
      items.push({
        priority: warning.daysUntilRemoval !== undefined && warning.daysUntilRemoval < 30 ? 'high' : 'medium',
        category: 'deprecation',
        description: `Tool "${warning.toolName}" is deprecated`,
        suggestedAction: warning.replacementTool
          ? `Plan migration to "${warning.replacementTool}"`
          : 'Plan to remove deprecated tool usage',
        estimatedImpact: HEALTH_PENALTIES.deprecatedTool * HEALTH_WEIGHTS.deprecationScore,
        tool: warning.toolName,
      });
    }
  }

  // Breaking changes
  if (components.breakingChangeScore < 100 && input.diff) {
    for (const removed of input.diff.toolsRemoved) {
      items.push({
        priority: 'critical',
        category: 'breaking_changes',
        description: `Tool "${removed}" has been removed`,
        suggestedAction: 'Update consumers to not depend on this tool',
        estimatedImpact: HEALTH_PENALTIES.breakingChange * HEALTH_WEIGHTS.breakingChangeScore,
        tool: removed,
      });
    }
  }

  // Documentation issues
  if (components.documentationScore < 80) {
    const undocumented = input.baseline.tools.filter(
      t => !t.description || t.description.trim() === ''
    );
    if (undocumented.length > 0) {
      items.push({
        priority: 'low',
        category: 'documentation',
        description: `${undocumented.length} tool(s) have no description`,
        suggestedAction: 'Add descriptions to improve discoverability',
        estimatedImpact: undocumented.length * HEALTH_PENALTIES.missingDescription * HEALTH_WEIGHTS.documentationScore,
      });
    }
  }

  // Sort by priority and impact
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.estimatedImpact - a.estimatedImpact;
  });

  return items;
}
/**
 * Generate human-readable health summary.
 */
function generateHealthSummary(
  overall: number,
  components: HealthComponents,
  trend: HealthTrend
): string {
  const grade = calculateGrade(overall);
  const parts: string[] = [];

  parts.push(`Health Score: ${overall}/100 (Grade: ${grade})`);

  // Trend indicator
  const trendIndicator = trend === 'improving' ? '↗' : trend === 'degrading' ? '↘' : '→';
  parts.push(`Trend: ${trendIndicator} ${trend}`);

  // Highlight problem areas
  const issues: string[] = [];
  if (components.testCoverage < 70) issues.push('low test coverage');
  if (components.errorRate < 80) issues.push('high error rate');
  if (components.performanceScore < 70) issues.push('performance issues');
  if (components.deprecationScore < 80) issues.push('deprecated tools');
  if (components.breakingChangeScore < 70) issues.push('breaking changes');
  if (components.documentationScore < 70) issues.push('documentation gaps');

  if (issues.length > 0) {
    parts.push(`Issues: ${issues.join(', ')}`);
  } else {
    parts.push('No critical issues detected.');
  }

  return parts.join('. ');
}
/**
 * Format health score for console output.
 */
export function formatHealthScore(score: HealthScore): string {
  const lines: string[] = [
    'Health Report',
    '═'.repeat(50),
    '',
    `Overall Score: ${score.overall}/100 (${score.grade})`,
    `Trend: ${score.trend}`,
    `Severity: ${score.severity}`,
    '',
    'Component Scores:',
    `  Test Coverage:    ${score.components.testCoverage}%`,
    `  Error Rate:       ${score.components.errorRate}%`,
    `  Performance:      ${score.components.performanceScore}%`,
    `  Deprecation:      ${score.components.deprecationScore}%`,
    `  Breaking Changes: ${score.components.breakingChangeScore}%`,
    `  Documentation:    ${score.components.documentationScore}%`,
    '',
  ];

  if (score.actionItems.length > 0) {
    lines.push('Action Items:');
    const maxDisplay = HEALTH_SCORING.MAX_ACTION_ITEMS_DISPLAY;
    for (const item of score.actionItems.slice(0, maxDisplay)) {
      const icon = item.priority === 'critical' ? '❌' :
                   item.priority === 'high' ? '⚠️' :
                   item.priority === 'medium' ? '📝' : 'ℹ️';
      lines.push(`  ${icon} [${item.priority.toUpperCase()}] ${item.description}`);
      lines.push(`     → ${item.suggestedAction}`);
    }
    if (score.actionItems.length > maxDisplay) {
      lines.push(`  ... and ${score.actionItems.length - maxDisplay} more items`);
    }
  }

  lines.push('');
  lines.push(score.summary);

  return lines.join('\n');
}

/**
 * Check if health score meets minimum threshold.
 */
export function meetsHealthThreshold(score: HealthScore, minScore: number): boolean {
  return score.overall >= minScore;
}

/**
 * Get health badge color based on score.
 */
export function getHealthBadgeColor(score: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

/**
 * Create a health history entry from a health score.
 */
export function createHealthHistoryEntry(score: HealthScore): HealthHistory {
  return {
    timestamp: score.calculatedAt,
    overallScore: score.overall,
    components: { ...score.components },
  };
}
