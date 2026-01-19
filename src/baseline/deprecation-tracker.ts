/**
 * Deprecation Lifecycle Management
 *
 * Tracks tool deprecation status and warns consumers about deprecated tools.
 * Supports grace periods, replacement suggestions, and removal date enforcement.
 */

import type { ToolFingerprint, BehavioralBaseline, ChangeSeverity } from './types.js';
import { DEPRECATION } from '../constants.js';

// ==================== Types ====================

/**
 * Deprecation status for a tool.
 */
export type DeprecationStatus = 'active' | 'deprecated' | 'sunset' | 'removed';

/**
 * Deprecation warning for a single tool.
 */
export interface DeprecationWarning {
  /** Tool name */
  toolName: string;
  /** Current deprecation status */
  status: DeprecationStatus;
  /** Severity of the warning */
  severity: ChangeSeverity;
  /** Warning message */
  message: string;
  /** When the tool was deprecated (if applicable) */
  deprecatedAt?: Date;
  /** Planned removal date (if applicable) */
  removalDate?: Date;
  /** Days until removal (negative if past) */
  daysUntilRemoval?: number;
  /** Suggested replacement tool */
  replacementTool?: string;
  /** Full deprecation notice from the tool */
  deprecationNotice?: string;
  /** Whether this tool is past its removal date */
  isPastRemoval: boolean;
  /** Whether this tool is within grace period */
  isInGracePeriod: boolean;
}

/**
 * Deprecation report for an entire baseline.
 */
export interface DeprecationReport {
  /** All deprecation warnings */
  warnings: DeprecationWarning[];
  /** Number of deprecated tools */
  deprecatedCount: number;
  /** Number of tools past removal date */
  expiredCount: number;
  /** Number of tools within grace period */
  gracePeriodCount: number;
  /** Overall severity */
  overallSeverity: ChangeSeverity;
  /** Human-readable summary */
  summary: string;
  /** Whether there are any critical issues (past removal date) */
  hasCriticalIssues: boolean;
}

/**
 * Deprecation configuration options.
 */
export interface DeprecationConfig {
  /** Warn when using deprecated tools */
  warnOnUsage: boolean;
  /** Fail when using tools past their removal date */
  failOnExpired: boolean;
  /** Default grace period in days after removal date */
  gracePeriodDays: number;
  /** Severity for deprecated tools */
  deprecatedSeverity: ChangeSeverity;
  /** Severity for tools past removal date */
  expiredSeverity: ChangeSeverity;
}

// ==================== Constants ====================

// Re-export centralized constant for backwards compatibility
export { DEPRECATION } from '../constants.js';

/**
 * Default deprecation configuration.
 * Uses values from centralized constants.
 */
export const DEPRECATION_DEFAULTS: DeprecationConfig = {
  warnOnUsage: DEPRECATION.DEFAULTS.warnOnUsage,
  failOnExpired: DEPRECATION.DEFAULTS.failOnExpired,
  gracePeriodDays: DEPRECATION.DEFAULTS.gracePeriodDays,
  deprecatedSeverity: 'warning',
  expiredSeverity: 'breaking',
};

/**
 * Days thresholds for warning levels.
 * Uses values from centralized constants.
 */
export const DEPRECATION_THRESHOLDS = {
  /** Warn about upcoming removal within this many days */
  UPCOMING_REMOVAL_DAYS: DEPRECATION.THRESHOLDS.upcomingRemovalDays,
  /** Critical warning within this many days */
  CRITICAL_REMOVAL_DAYS: DEPRECATION.THRESHOLDS.criticalRemovalDays,
} as const;

// ==================== Core Functions ====================

/**
 * Check all tools in a baseline for deprecation issues.
 */
export function checkDeprecations(
  baseline: BehavioralBaseline,
  config: Partial<DeprecationConfig> = {}
): DeprecationReport {
  const fullConfig = { ...DEPRECATION_DEFAULTS, ...config };
  const warnings: DeprecationWarning[] = [];
  let deprecatedCount = 0;
  let expiredCount = 0;
  let gracePeriodCount = 0;

  const now = new Date();

  for (const tool of baseline.tools) {
    const warning = checkToolDeprecation(tool, now, fullConfig);

    if (warning) {
      warnings.push(warning);

      if (warning.status === 'removed' || warning.isPastRemoval) {
        expiredCount++;
      } else if (warning.status === 'deprecated') {
        deprecatedCount++;
      }

      if (warning.isInGracePeriod) {
        gracePeriodCount++;
      }
    }
  }

  // Determine overall severity
  const overallSeverity = determineOverallSeverity(warnings);

  // Generate summary
  const summary = generateDeprecationSummary(warnings, deprecatedCount, expiredCount, gracePeriodCount);

  return {
    warnings,
    deprecatedCount,
    expiredCount,
    gracePeriodCount,
    overallSeverity,
    summary,
    hasCriticalIssues: expiredCount > 0,
  };
}

/**
 * Check a single tool for deprecation issues.
 */
export function checkToolDeprecation(
  tool: ToolFingerprint,
  now: Date = new Date(),
  config: DeprecationConfig = DEPRECATION_DEFAULTS
): DeprecationWarning | null {
  // Not deprecated - no warning
  if (!tool.deprecated) {
    return null;
  }

  // Calculate days until removal (if removal date is set)
  let daysUntilRemoval: number | undefined;
  let isPastRemoval = false;
  let isInGracePeriod = false;

  if (tool.removalDate) {
    const removalDate = new Date(tool.removalDate);
    const diffMs = removalDate.getTime() - now.getTime();
    daysUntilRemoval = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    isPastRemoval = daysUntilRemoval < 0;

    // Check grace period
    if (isPastRemoval) {
      const daysPastRemoval = Math.abs(daysUntilRemoval);
      isInGracePeriod = daysPastRemoval <= config.gracePeriodDays;
    }
  }

  // Determine status
  let status: DeprecationStatus = 'deprecated';
  if (isPastRemoval && !isInGracePeriod) {
    status = 'removed';
  } else if (isPastRemoval && isInGracePeriod) {
    status = 'sunset';
  }

  // Determine severity
  let severity = config.deprecatedSeverity;
  if (status === 'removed') {
    severity = config.expiredSeverity;
  } else if (status === 'sunset') {
    severity = 'warning';
  } else if (daysUntilRemoval !== undefined && daysUntilRemoval <= DEPRECATION_THRESHOLDS.CRITICAL_REMOVAL_DAYS) {
    severity = 'breaking';
  }

  // Generate message
  const message = generateDeprecationMessage(tool, status, daysUntilRemoval, isInGracePeriod);

  return {
    toolName: tool.name,
    status,
    severity,
    message,
    deprecatedAt: tool.deprecatedAt ? new Date(tool.deprecatedAt) : undefined,
    removalDate: tool.removalDate ? new Date(tool.removalDate) : undefined,
    daysUntilRemoval,
    replacementTool: tool.replacementTool,
    deprecationNotice: tool.deprecationNotice,
    isPastRemoval,
    isInGracePeriod,
  };
}

/**
 * Mark a tool as deprecated.
 */
export function markAsDeprecated(
  tool: ToolFingerprint,
  options: {
    notice?: string;
    removalDate?: Date;
    replacementTool?: string;
  } = {}
): ToolFingerprint {
  return {
    ...tool,
    deprecated: true,
    deprecatedAt: new Date(),
    deprecationNotice: options.notice,
    removalDate: options.removalDate,
    replacementTool: options.replacementTool,
  };
}

/**
 * Clear deprecation status from a tool.
 */
export function clearDeprecation(tool: ToolFingerprint): ToolFingerprint {
  const { deprecated, deprecatedAt, deprecationNotice, removalDate, replacementTool, ...rest } = tool;
  return rest as ToolFingerprint;
}

// ==================== Helper Functions ====================

/**
 * Generate deprecation message for a tool.
 */
function generateDeprecationMessage(
  tool: ToolFingerprint,
  status: DeprecationStatus,
  daysUntilRemoval: number | undefined,
  _isInGracePeriod: boolean
): string {
  const parts: string[] = [];

  switch (status) {
    case 'removed':
      parts.push(`Tool "${tool.name}" has been REMOVED and is past its removal date.`);
      break;

    case 'sunset':
      parts.push(`Tool "${tool.name}" is in SUNSET phase (grace period).`);
      if (daysUntilRemoval !== undefined) {
        parts.push(`Removal date was ${Math.abs(daysUntilRemoval)} day(s) ago.`);
      }
      break;

    case 'deprecated':
      parts.push(`Tool "${tool.name}" is DEPRECATED.`);
      if (daysUntilRemoval !== undefined) {
        if (daysUntilRemoval <= DEPRECATION_THRESHOLDS.CRITICAL_REMOVAL_DAYS) {
          parts.push(`CRITICAL: Will be removed in ${daysUntilRemoval} day(s)!`);
        } else if (daysUntilRemoval <= DEPRECATION_THRESHOLDS.UPCOMING_REMOVAL_DAYS) {
          parts.push(`Will be removed in ${daysUntilRemoval} day(s).`);
        } else {
          parts.push(`Scheduled for removal on ${tool.removalDate}.`);
        }
      }
      break;
  }

  // Add notice if available
  if (tool.deprecationNotice) {
    parts.push(`Notice: ${tool.deprecationNotice}`);
  }

  // Add replacement suggestion
  if (tool.replacementTool) {
    parts.push(`Use "${tool.replacementTool}" instead.`);
  }

  return parts.join(' ');
}

/**
 * Determine overall severity from warnings.
 */
function determineOverallSeverity(warnings: DeprecationWarning[]): ChangeSeverity {
  if (warnings.length === 0) {
    return 'none';
  }

  // Check for any critical issues (removed tools)
  if (warnings.some(w => w.status === 'removed')) {
    return 'breaking';
  }

  // Check for sunset tools
  if (warnings.some(w => w.status === 'sunset')) {
    return 'warning';
  }

  // Check for upcoming critical removals
  if (warnings.some(w => w.daysUntilRemoval !== undefined && w.daysUntilRemoval <= DEPRECATION_THRESHOLDS.CRITICAL_REMOVAL_DAYS)) {
    return 'breaking';
  }

  // All deprecated tools
  return 'warning';
}

/**
 * Generate summary message for deprecation report.
 */
function generateDeprecationSummary(
  warnings: DeprecationWarning[],
  deprecatedCount: number,
  expiredCount: number,
  gracePeriodCount: number
): string {
  if (warnings.length === 0) {
    return 'No deprecated tools found.';
  }

  const parts: string[] = [];

  if (expiredCount > 0) {
    parts.push(`${expiredCount} tool(s) past removal date`);
  }

  if (gracePeriodCount > 0) {
    parts.push(`${gracePeriodCount} tool(s) in grace period`);
  }

  if (deprecatedCount > 0) {
    parts.push(`${deprecatedCount} deprecated tool(s)`);
  }

  // Add critical warnings
  const criticalTools = warnings.filter(
    w => w.daysUntilRemoval !== undefined && w.daysUntilRemoval <= DEPRECATION_THRESHOLDS.CRITICAL_REMOVAL_DAYS && w.daysUntilRemoval >= 0
  );

  if (criticalTools.length > 0) {
    parts.push(`${criticalTools.length} tool(s) will be removed within ${DEPRECATION_THRESHOLDS.CRITICAL_REMOVAL_DAYS} days`);
  }

  return parts.join(', ') + '.';
}

// ==================== Utility Functions ====================

/**
 * Get all deprecated tools from a baseline.
 */
export function getDeprecatedTools(baseline: BehavioralBaseline): ToolFingerprint[] {
  return baseline.tools.filter(t => t.deprecated);
}

/**
 * Get tools that are past their removal date.
 */
export function getExpiredTools(
  baseline: BehavioralBaseline,
  now: Date = new Date()
): ToolFingerprint[] {
  return baseline.tools.filter(t => {
    if (!t.deprecated || !t.removalDate) {
      return false;
    }
    const removalDate = new Date(t.removalDate);
    return now > removalDate;
  });
}

/**
 * Get tools that will be removed within a specified number of days.
 */
export function getUpcomingRemovals(
  baseline: BehavioralBaseline,
  withinDays: number = DEPRECATION_THRESHOLDS.UPCOMING_REMOVAL_DAYS,
  now: Date = new Date()
): ToolFingerprint[] {
  return baseline.tools.filter(t => {
    if (!t.deprecated || !t.removalDate) {
      return false;
    }
    const removalDate = new Date(t.removalDate);
    const diffMs = removalDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return daysUntil >= 0 && daysUntil <= withinDays;
  });
}

/**
 * Format deprecation warning for display.
 */
export function formatDeprecationWarning(warning: DeprecationWarning): string {
  const lines: string[] = [];
  const icon = warning.isPastRemoval ? '❌' : warning.isInGracePeriod ? '⚠️' : '🕐';

  lines.push(`${icon} ${warning.toolName} [${warning.status.toUpperCase()}]`);
  lines.push(`   ${warning.message}`);

  if (warning.replacementTool) {
    lines.push(`   Replacement: ${warning.replacementTool}`);
  }

  return lines.join('\n');
}

/**
 * Format deprecation report for console output.
 */
export function formatDeprecationReport(report: DeprecationReport): string {
  const lines: string[] = ['Deprecation Report', '═'.repeat(50), ''];

  if (report.warnings.length === 0) {
    lines.push('✓ No deprecated tools found.');
    return lines.join('\n');
  }

  lines.push(report.summary);
  lines.push('');

  // Group by status
  const byStatus = new Map<DeprecationStatus, DeprecationWarning[]>();
  for (const warning of report.warnings) {
    const existing = byStatus.get(warning.status) || [];
    existing.push(warning);
    byStatus.set(warning.status, existing);
  }

  // Show removed first
  const statusOrder: DeprecationStatus[] = ['removed', 'sunset', 'deprecated'];
  for (const status of statusOrder) {
    const warnings = byStatus.get(status);
    if (warnings && warnings.length > 0) {
      lines.push(`─── ${status.toUpperCase()} ───`);
      for (const warning of warnings) {
        lines.push(formatDeprecationWarning(warning));
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Check if deprecation report should cause failure.
 */
export function shouldFailOnDeprecation(
  report: DeprecationReport,
  config: Partial<DeprecationConfig> = {}
): boolean {
  const fullConfig = { ...DEPRECATION_DEFAULTS, ...config };

  if (!fullConfig.failOnExpired) {
    return false;
  }

  return report.expiredCount > 0;
}
