/**
 * Telemetry and Decision Logging for Drift Detection
 *
 * Records comparison decisions for post-hoc analysis and algorithm improvement.
 * Decisions are logged locally and can be exported for feedback or A/B testing.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import type { ConfidenceFactor } from './types.js';
import type { SecurityCategory, LimitationCategory } from './semantic.js';

/**
 * Category match extracted from text during comparison.
 */
export interface CategoryMatch {
  category: SecurityCategory | LimitationCategory | string;
  confidence: number;
  matchedKeywords: string[];
}

/**
 * A recorded comparison decision.
 */
export interface ComparisonDecision {
  /** Unique ID for this decision */
  id: string;

  /** When the decision was made */
  timestamp: Date;

  /** Type of comparison */
  type: 'security' | 'limitation' | 'assertion';

  /** First text being compared */
  text1: string;

  /** Second text being compared */
  text2: string;

  /** Categories extracted from text1 */
  categories1: CategoryMatch[];

  /** Categories extracted from text2 */
  categories2: CategoryMatch[];

  /** Keyword overlap score (0-100) */
  keywordOverlap: number;

  /** The match decision made */
  matchDecision: boolean;

  /** Raw confidence score before calibration */
  rawConfidence: number;

  /** Calibrated confidence score */
  calibratedConfidence: number;

  /** Individual confidence factors */
  factors: ConfidenceFactor[];

  /** Tool name context */
  toolName: string;

  /** Server command being interviewed */
  serverCommand?: string;

  /** Bellwether version */
  bellwetherVersion: string;
}

/**
 * User feedback on a comparison decision.
 */
export interface FeedbackReport {
  /** ID of the decision being reported */
  decisionId: string;

  /** Type of feedback */
  feedbackType: 'false_positive' | 'false_negative' | 'confidence_wrong';

  /** Optional user comment explaining the issue */
  userComment?: string;

  /** What the correct answer should have been */
  correctAnswer?: boolean;

  /** When feedback was submitted */
  timestamp: Date;
}

/**
 * Analysis of aggregated feedback.
 */
export interface FeedbackAnalysis {
  totalReports: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  confidenceIssueRate: number;
  commonPatterns: Array<{
    pattern: string;
    count: number;
    feedbackType: string;
  }>;
}

/**
 * Get the telemetry directory path.
 */
function getTelemetryDir(): string {
  return join(homedir(), '.bellwether', 'telemetry');
}

/**
 * Ensure telemetry directory exists.
 */
function ensureTelemetryDir(): void {
  const dir = getTelemetryDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Decision logger for recording and analyzing comparison decisions.
 */
export class DecisionLogger {
  private decisions: ComparisonDecision[] = [];
  private logPath: string;
  private enabled: boolean;

  constructor(options: { enabled?: boolean; logPath?: string } = {}) {
    this.enabled = options.enabled ?? true;
    ensureTelemetryDir();
    this.logPath = options.logPath ?? join(getTelemetryDir(), 'comparison-log.jsonl');
  }

  /**
   * Log a comparison decision.
   */
  log(decision: Omit<ComparisonDecision, 'id' | 'timestamp' | 'bellwetherVersion'>): string {
    const fullDecision: ComparisonDecision = {
      ...decision,
      id: randomUUID(),
      timestamp: new Date(),
      bellwetherVersion: getVersion(),
    };

    this.decisions.push(fullDecision);

    if (this.enabled) {
      try {
        appendFileSync(this.logPath, JSON.stringify(fullDecision) + '\n');
      } catch {
        // Silently fail if we can't write to log file
      }
    }

    return fullDecision.id;
  }

  /**
   * Get all logged decisions from this session.
   */
  getSessionDecisions(): ComparisonDecision[] {
    return [...this.decisions];
  }

  /**
   * Load all decisions from the log file.
   */
  loadAllDecisions(): ComparisonDecision[] {
    if (!existsSync(this.logPath)) {
      return [];
    }

    try {
      const content = readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.map(line => {
        const decision = JSON.parse(line);
        decision.timestamp = new Date(decision.timestamp);
        return decision;
      });
    } catch {
      return [];
    }
  }

  /**
   * Get a specific decision by ID.
   */
  getDecision(id: string): ComparisonDecision | undefined {
    // First check session decisions
    const sessionDecision = this.decisions.find(d => d.id === id);
    if (sessionDecision) return sessionDecision;

    // Then check log file
    const allDecisions = this.loadAllDecisions();
    return allDecisions.find(d => d.id === id);
  }

  /**
   * Export decisions to a JSON file.
   */
  exportToFile(filePath: string): void {
    const decisions = this.loadAllDecisions();
    writeFileSync(filePath, JSON.stringify(decisions, null, 2));
  }

  /**
   * Get statistics about logged decisions.
   */
  getStatistics(): {
    totalDecisions: number;
    byType: Record<string, number>;
    averageConfidence: number;
    matchRate: number;
  } {
    const decisions = this.loadAllDecisions();

    if (decisions.length === 0) {
      return {
        totalDecisions: 0,
        byType: {},
        averageConfidence: 0,
        matchRate: 0,
      };
    }

    const byType: Record<string, number> = {};
    let totalConfidence = 0;
    let matchCount = 0;

    for (const decision of decisions) {
      byType[decision.type] = (byType[decision.type] || 0) + 1;
      totalConfidence += decision.rawConfidence;
      if (decision.matchDecision) matchCount++;
    }

    return {
      totalDecisions: decisions.length,
      byType,
      averageConfidence: Math.round(totalConfidence / decisions.length),
      matchRate: Math.round((matchCount / decisions.length) * 100),
    };
  }

  /**
   * Clear all logged decisions.
   */
  clear(): void {
    this.decisions = [];
    if (existsSync(this.logPath)) {
      writeFileSync(this.logPath, '');
    }
  }
}

/**
 * Feedback manager for recording and analyzing user feedback.
 */
export class FeedbackManager {
  private feedbackPath: string;

  constructor(options: { feedbackPath?: string } = {}) {
    ensureTelemetryDir();
    this.feedbackPath = options.feedbackPath ?? join(getTelemetryDir(), 'feedback.jsonl');
  }

  /**
   * Submit feedback on a comparison decision.
   */
  submit(feedback: Omit<FeedbackReport, 'timestamp'>): void {
    const fullFeedback: FeedbackReport = {
      ...feedback,
      timestamp: new Date(),
    };

    try {
      appendFileSync(this.feedbackPath, JSON.stringify(fullFeedback) + '\n');
    } catch {
      // Silently fail if we can't write
    }
  }

  /**
   * Load all feedback reports.
   */
  loadAll(): FeedbackReport[] {
    if (!existsSync(this.feedbackPath)) {
      return [];
    }

    try {
      const content = readFileSync(this.feedbackPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.map(line => {
        const report = JSON.parse(line);
        report.timestamp = new Date(report.timestamp);
        return report;
      });
    } catch {
      return [];
    }
  }

  /**
   * Analyze all feedback to identify patterns.
   */
  analyze(): FeedbackAnalysis {
    const reports = this.loadAll();

    if (reports.length === 0) {
      return {
        totalReports: 0,
        falsePositiveRate: 0,
        falseNegativeRate: 0,
        confidenceIssueRate: 0,
        commonPatterns: [],
      };
    }

    const fpCount = reports.filter(r => r.feedbackType === 'false_positive').length;
    const fnCount = reports.filter(r => r.feedbackType === 'false_negative').length;
    const confCount = reports.filter(r => r.feedbackType === 'confidence_wrong').length;

    // Extract common patterns from user comments
    const patternCounts = new Map<string, { count: number; feedbackType: string }>();

    for (const report of reports) {
      if (report.userComment) {
        // Simple keyword extraction
        const keywords = report.userComment.toLowerCase()
          .split(/\s+/)
          .filter(word => word.length > 4);

        for (const keyword of keywords) {
          const existing = patternCounts.get(keyword);
          if (existing) {
            existing.count++;
          } else {
            patternCounts.set(keyword, { count: 1, feedbackType: report.feedbackType });
          }
        }
      }
    }

    const commonPatterns = Array.from(patternCounts.entries())
      .filter(([, data]) => data.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        feedbackType: data.feedbackType,
      }));

    return {
      totalReports: reports.length,
      falsePositiveRate: Math.round((fpCount / reports.length) * 100),
      falseNegativeRate: Math.round((fnCount / reports.length) * 100),
      confidenceIssueRate: Math.round((confCount / reports.length) * 100),
      commonPatterns,
    };
  }

  /**
   * Clear all feedback.
   */
  clear(): void {
    if (existsSync(this.feedbackPath)) {
      writeFileSync(this.feedbackPath, '');
    }
  }
}

/**
 * Get the package version.
 */
function getVersion(): string {
  try {
    // Try to read from package.json
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      return pkg.version || '0.0.0';
    }
  } catch {
    // Ignore errors
  }
  return '0.0.0';
}

// Singleton instances for global access
let globalDecisionLogger: DecisionLogger | null = null;
let globalFeedbackManager: FeedbackManager | null = null;

/**
 * Get the global decision logger instance.
 */
export function getDecisionLogger(options?: { enabled?: boolean }): DecisionLogger {
  if (!globalDecisionLogger) {
    globalDecisionLogger = new DecisionLogger(options);
  }
  return globalDecisionLogger;
}

/**
 * Get the global feedback manager instance.
 */
export function getFeedbackManager(): FeedbackManager {
  if (!globalFeedbackManager) {
    globalFeedbackManager = new FeedbackManager();
  }
  return globalFeedbackManager;
}

/**
 * Reset global instances (for testing).
 */
export function resetTelemetry(): void {
  globalDecisionLogger = null;
  globalFeedbackManager = null;
}
