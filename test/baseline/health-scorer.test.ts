/**
 * Tests for health scorer.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHealthScore,
  formatHealthScore,
  meetsHealthThreshold,
  getHealthBadgeColor,
  createHealthHistoryEntry,
  HEALTH_WEIGHTS,
  GRADE_THRESHOLDS,
  SEVERITY_THRESHOLDS,
  HEALTH_PENALTIES,
} from '../../src/baseline/health-scorer.js';
import type {
  HealthInput,
  HealthScore,
  HealthHistory,
} from '../../src/baseline/health-scorer.js';
import type { ToolFingerprint, BehavioralBaseline, BehavioralDiff } from '../../src/baseline/types.js';
import type { PerformanceReport } from '../../src/baseline/performance-tracker.js';
import type { DeprecationReport } from '../../src/baseline/deprecation-tracker.js';
import { HEALTH_SCORING } from '../../src/constants.js';

// Helper to create a mock tool fingerprint
function createMockTool(overrides: Partial<ToolFingerprint> = {}): ToolFingerprint {
  return {
    name: 'test_tool',
    description: 'A test tool description that is long enough',
    schemaHash: 'abc123',
    assertions: [],
    securityNotes: [],
    limitations: [],
    ...overrides,
  };
}

// Helper to create a mock baseline
function createMockBaseline(tools: ToolFingerprint[] = []): BehavioralBaseline {
  const capabilityTools = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? {},
    schemaHash: tool.schemaHash,
    lastTestedAt: tool.lastTestedAt ? tool.lastTestedAt.toISOString() : undefined,
    inputSchemaHashAtTest: tool.inputSchemaHashAtTest,
  }));
  const toolProfiles = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    schemaHash: tool.schemaHash,
    assertions: tool.assertions ?? [],
    securityNotes: tool.securityNotes ?? [],
    limitations: tool.limitations ?? [],
    behavioralNotes: [],
  }));

  return {
    version: '1.0.0',
    metadata: {
      mode: 'check',
      generatedAt: new Date().toISOString(),
      cliVersion: '1.0.0',
      serverCommand: 'npx test-server',
      durationMs: 1000,
      personas: [],
      model: 'none',
    },
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: [],
    },
    capabilities: { tools: capabilityTools },
    interviews: [],
    toolProfiles,
    summary: 'Test baseline',
    assertions: [],
    hash: 'hash123',
  };
}

// Helper to create health input
function createHealthInput(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    baseline: createMockBaseline([
      createMockTool({ name: 'tool1' }),
      createMockTool({ name: 'tool2' }),
    ]),
    ...overrides,
  };
}

describe('Health Scorer', () => {
  describe('calculateHealthScore', () => {
    it('should calculate score for healthy baseline', () => {
      const input = createHealthInput({
        testResults: new Map([
          ['tool1', { passed: 10, failed: 0 }],
          ['tool2', { passed: 10, failed: 0 }],
        ]),
      });

      const score = calculateHealthScore(input);

      expect(score.overall).toBeGreaterThanOrEqual(80);
      expect(score.grade).toMatch(/^[AB]$/);
      expect(score.severity).toBe('none');
      expect(score.trend).toBe('stable');
    });

    it('should detect low test coverage', () => {
      const input = createHealthInput({
        baseline: createMockBaseline([
          createMockTool({ name: 'tool1' }),
          createMockTool({ name: 'tool2' }),
          createMockTool({ name: 'tool3' }),
          createMockTool({ name: 'tool4' }),
        ]),
        testResults: new Map([
          ['tool1', { passed: 10, failed: 0 }],
          // Only 1 of 4 tools tested = 25% coverage
        ]),
      });

      const score = calculateHealthScore(input);

      expect(score.components.testCoverage).toBeLessThan(50);
      expect(score.actionItems.some(a => a.category === 'coverage')).toBe(true);
    });

    it('should detect high error rate', () => {
      const input = createHealthInput({
        testResults: new Map([
          ['tool1', { passed: 5, failed: 5 }],
          ['tool2', { passed: 5, failed: 5 }],
        ]),
      });

      const score = calculateHealthScore(input);

      expect(score.components.errorRate).toBe(50);
      expect(score.actionItems.some(a => a.category === 'errors')).toBe(true);
    });

    it('should detect performance regressions', () => {
      const performanceReport: PerformanceReport = {
        toolComparisons: [
          {
            toolName: 'tool1',
            current: {
              toolName: 'tool1',
              p50Ms: 150,
              p95Ms: 300,
              p99Ms: 450,
              successRate: 0.99,
              sampleCount: 100,
              avgMs: 170,
              minMs: 75,
              maxMs: 750,
              stdDevMs: 75,
              collectedAt: new Date(),
            },
            trend: 'degrading',
            p50RegressionPercent: 0.5,
            p95RegressionPercent: 0.5,
            p99RegressionPercent: 0.5,
            hasRegression: true,
            severity: 'breaking',
            summary: 'Regression',
          },
          {
            toolName: 'tool2',
            current: {
              toolName: 'tool2',
              p50Ms: 200,
              p95Ms: 400,
              p99Ms: 600,
              successRate: 0.99,
              sampleCount: 100,
              avgMs: 220,
              minMs: 100,
              maxMs: 1000,
              stdDevMs: 100,
              collectedAt: new Date(),
            },
            trend: 'degrading',
            p50RegressionPercent: 1.0,
            p95RegressionPercent: 1.0,
            p99RegressionPercent: 1.0,
            hasRegression: true,
            severity: 'breaking',
            summary: 'Regression',
          },
          {
            toolName: 'tool3',
            current: {
              toolName: 'tool3',
              p50Ms: 300,
              p95Ms: 600,
              p99Ms: 900,
              successRate: 0.99,
              sampleCount: 100,
              avgMs: 350,
              minMs: 150,
              maxMs: 1500,
              stdDevMs: 150,
              collectedAt: new Date(),
            },
            trend: 'degrading',
            p50RegressionPercent: 2.0,
            p95RegressionPercent: 2.0,
            p99RegressionPercent: 2.0,
            hasRegression: true,
            severity: 'breaking',
            summary: 'Regression',
          },
        ],
        regressionCount: 3,
        improvementCount: 0,
        stableCount: 0,
        overallTrend: 'degrading',
        overallSeverity: 'breaking',
        summary: 'Performance issues',
      };

      const input = createHealthInput({ performanceReport });
      const score = calculateHealthScore(input);

      // With 3 regressions, performance score should be significantly reduced
      expect(score.components.performanceScore).toBeLessThan(80);
      expect(score.actionItems.some(a => a.category === 'performance')).toBe(true);
    });

    it('should detect deprecated tools', () => {
      const deprecationReport: DeprecationReport = {
        warnings: [
          {
            toolName: 'tool1',
            status: 'deprecated',
            severity: 'warning',
            message: 'Deprecated',
            isPastRemoval: false,
            isInGracePeriod: false,
          },
        ],
        deprecatedCount: 1,
        expiredCount: 0,
        gracePeriodCount: 0,
        overallSeverity: 'warning',
        summary: 'Deprecated tools',
        hasCriticalIssues: false,
      };

      const input = createHealthInput({ deprecationReport });
      const score = calculateHealthScore(input);

      expect(score.components.deprecationScore).toBeLessThan(100);
      expect(score.actionItems.some(a => a.category === 'deprecation')).toBe(true);
    });

    it('should detect expired tools with higher penalty', () => {
      const deprecationReport: DeprecationReport = {
        warnings: [
          {
            toolName: 'tool1',
            status: 'removed',
            severity: 'breaking',
            message: 'Removed',
            isPastRemoval: true,
            isInGracePeriod: false,
          },
        ],
        deprecatedCount: 0,
        expiredCount: 1,
        gracePeriodCount: 0,
        overallSeverity: 'breaking',
        summary: 'Expired tools',
        hasCriticalIssues: true,
      };

      const input = createHealthInput({ deprecationReport });
      const score = calculateHealthScore(input);

      // Expired tool penalty is higher than deprecated
      expect(score.components.deprecationScore).toBeLessThanOrEqual(
        100 - HEALTH_PENALTIES.expiredTool
      );
    });

    it('should detect breaking changes', () => {
      const diff: BehavioralDiff = {
        toolsAdded: [],
        toolsRemoved: ['removed_tool'],
        toolsModified: [],
        behaviorChanges: [],
        severity: 'breaking',
        breakingCount: 1,
        warningCount: 0,
        infoCount: 0,
        summary: 'Breaking changes',
      };

      const input = createHealthInput({ diff });
      const score = calculateHealthScore(input);

      expect(score.components.breakingChangeScore).toBeLessThan(100);
      expect(score.actionItems.some(a => a.category === 'breaking_changes')).toBe(true);
    });

    it('should detect documentation issues', () => {
      // Create many tools with poor documentation to ensure score drops below threshold
      const input = createHealthInput({
        baseline: createMockBaseline([
          createMockTool({ name: 'tool1', description: '' }),
          createMockTool({ name: 'tool2', description: '' }),
          createMockTool({ name: 'tool3', description: '' }),
          createMockTool({ name: 'tool4', description: '' }),
          createMockTool({ name: 'tool5', description: 'S' }),
        ]),
      });

      const score = calculateHealthScore(input);

      // With multiple undocumented tools, score should be significantly reduced
      expect(score.components.documentationScore).toBeLessThan(80);
      expect(score.actionItems.some(a => a.category === 'documentation')).toBe(true);
    });

    it('should calculate trend from history', () => {
      const history: HealthHistory[] = [
        { timestamp: new Date(), overallScore: 60, components: {} as any },
        { timestamp: new Date(Date.now() - 86400000), overallScore: 55, components: {} as any },
        { timestamp: new Date(Date.now() - 172800000), overallScore: 50, components: {} as any },
      ];

      const input = createHealthInput({
        testResults: new Map([
          ['tool1', { passed: 10, failed: 0 }],
          ['tool2', { passed: 10, failed: 0 }],
        ]),
        history,
      });

      const score = calculateHealthScore(input);

      // Current score should be better than history average
      expect(score.trend).toBe('improving');
    });

    it('should detect degrading trend', () => {
      const history: HealthHistory[] = [
        { timestamp: new Date(), overallScore: 95, components: {} as any },
        { timestamp: new Date(Date.now() - 86400000), overallScore: 95, components: {} as any },
        { timestamp: new Date(Date.now() - 172800000), overallScore: 95, components: {} as any },
      ];

      const input = createHealthInput({
        testResults: new Map([
          ['tool1', { passed: 5, failed: 5 }], // 50% fail rate
          ['tool2', { passed: 5, failed: 5 }],
        ]),
        history,
      });

      const score = calculateHealthScore(input);

      // Current score should be worse than history average
      expect(score.trend).toBe('degrading');
    });
  });

  describe('grade calculation', () => {
    it('should assign A grade for high scores', () => {
      const input = createHealthInput({
        testResults: new Map([
          ['tool1', { passed: 100, failed: 0 }],
          ['tool2', { passed: 100, failed: 0 }],
        ]),
      });

      const score = calculateHealthScore(input);
      expect(score.grade).toBe('A');
    });

    it('should assign F grade for low scores', () => {
      // Create many severe issues across all categories to drive score below 60
      const input = createHealthInput({
        baseline: createMockBaseline([
          createMockTool({ name: 'tool1', description: '' }),
          createMockTool({ name: 'tool2', description: '' }),
          createMockTool({ name: 'tool3', description: '' }),
          createMockTool({ name: 'tool4', description: '' }),
          createMockTool({ name: 'tool5', description: '' }),
          createMockTool({ name: 'tool6', description: '' }),
        ]),
        testResults: new Map([
          ['tool1', { passed: 0, failed: 100 }],
          ['tool2', { passed: 0, failed: 100 }],
          ['tool3', { passed: 0, failed: 100 }],
          ['tool4', { passed: 0, failed: 100 }],
          ['tool5', { passed: 0, failed: 100 }],
          ['tool6', { passed: 0, failed: 100 }],
        ]),
        deprecationReport: {
          warnings: [
            { toolName: 'tool1', status: 'removed', severity: 'breaking', message: 'Removed', isPastRemoval: true, isInGracePeriod: false },
            { toolName: 'tool2', status: 'removed', severity: 'breaking', message: 'Removed', isPastRemoval: true, isInGracePeriod: false },
            { toolName: 'tool3', status: 'removed', severity: 'breaking', message: 'Removed', isPastRemoval: true, isInGracePeriod: false },
          ],
          deprecatedCount: 0,
          expiredCount: 3,
          gracePeriodCount: 0,
          overallSeverity: 'breaking',
          summary: 'Critical issues',
          hasCriticalIssues: true,
        },
        diff: {
          toolsAdded: [],
          toolsRemoved: ['tool1', 'tool2', 'tool3', 'tool4'],
          toolsModified: [],
          behaviorChanges: [],
          severity: 'breaking',
          breakingCount: 4,
          warningCount: 0,
          infoCount: 0,
          summary: 'Breaking changes',
        },
      });

      const score = calculateHealthScore(input);
      // With multiple failures across all categories, score should be F
      expect(score.overall).toBeLessThan(60);
      expect(score.grade).toBe('F');
    });
  });

  describe('formatHealthScore', () => {
    it('should format score with all components', () => {
      const input = createHealthInput();
      const score = calculateHealthScore(input);
      const formatted = formatHealthScore(score);

      expect(formatted).toContain('Health Report');
      expect(formatted).toContain('Overall Score');
      expect(formatted).toContain('Test Coverage');
      expect(formatted).toContain('Error Rate');
      expect(formatted).toContain('Performance');
      expect(formatted).toContain('Deprecation');
      expect(formatted).toContain('Breaking Changes');
      expect(formatted).toContain('Documentation');
    });

    it('should include action items when present', () => {
      const input = createHealthInput({
        testResults: new Map([
          ['tool1', { passed: 5, failed: 5 }],
          ['tool2', { passed: 5, failed: 5 }],
        ]),
      });
      const score = calculateHealthScore(input);
      const formatted = formatHealthScore(score);

      if (score.actionItems.length > 0) {
        expect(formatted).toContain('Action Items');
      }
    });
  });

  describe('meetsHealthThreshold', () => {
    it('should return true when score meets threshold', () => {
      const score: HealthScore = {
        overall: 85,
        components: {} as any,
        trend: 'stable',
        grade: 'B',
        severity: 'none',
        actionItems: [],
        summary: 'Good',
        calculatedAt: new Date(),
      };

      expect(meetsHealthThreshold(score, 80)).toBe(true);
    });

    it('should return false when score below threshold', () => {
      const score: HealthScore = {
        overall: 75,
        components: {} as any,
        trend: 'stable',
        grade: 'C',
        severity: 'warning',
        actionItems: [],
        summary: 'Needs work',
        calculatedAt: new Date(),
      };

      expect(meetsHealthThreshold(score, 80)).toBe(false);
    });
  });

  describe('getHealthBadgeColor', () => {
    it('should return green for high scores', () => {
      expect(getHealthBadgeColor(90)).toBe('green');
      expect(getHealthBadgeColor(80)).toBe('green');
    });

    it('should return yellow for medium scores', () => {
      expect(getHealthBadgeColor(70)).toBe('yellow');
      expect(getHealthBadgeColor(60)).toBe('yellow');
    });

    it('should return orange for low scores', () => {
      expect(getHealthBadgeColor(50)).toBe('orange');
      expect(getHealthBadgeColor(40)).toBe('orange');
    });

    it('should return red for very low scores', () => {
      expect(getHealthBadgeColor(30)).toBe('red');
      expect(getHealthBadgeColor(0)).toBe('red');
    });
  });

  describe('createHealthHistoryEntry', () => {
    it('should create history entry from score', () => {
      const score: HealthScore = {
        overall: 85,
        components: {
          testCoverage: 90,
          errorRate: 95,
          performanceScore: 80,
          deprecationScore: 100,
          breakingChangeScore: 100,
          documentationScore: 70,
        },
        trend: 'stable',
        grade: 'B',
        severity: 'none',
        actionItems: [],
        summary: 'Good',
        calculatedAt: new Date(),
      };

      const entry = createHealthHistoryEntry(score);

      expect(entry.overallScore).toBe(85);
      expect(entry.components.testCoverage).toBe(90);
      expect(entry.timestamp).toEqual(score.calculatedAt);
    });
  });

  describe('constants', () => {
    it('should have weights summing to 1.0', () => {
      const total = Object.values(HEALTH_WEIGHTS).reduce((sum, w) => sum + w, 0);
      expect(total).toBeCloseTo(1.0, 2);
    });

    it('should have grade thresholds in descending order', () => {
      expect(GRADE_THRESHOLDS.A).toBeGreaterThan(GRADE_THRESHOLDS.B);
      expect(GRADE_THRESHOLDS.B).toBeGreaterThan(GRADE_THRESHOLDS.C);
      expect(GRADE_THRESHOLDS.C).toBeGreaterThan(GRADE_THRESHOLDS.D);
      expect(GRADE_THRESHOLDS.D).toBeGreaterThan(GRADE_THRESHOLDS.F);
    });

    it('should have severity thresholds in descending order', () => {
      expect(SEVERITY_THRESHOLDS.none).toBeGreaterThan(SEVERITY_THRESHOLDS.info);
      expect(SEVERITY_THRESHOLDS.info).toBeGreaterThan(SEVERITY_THRESHOLDS.warning);
      expect(SEVERITY_THRESHOLDS.warning).toBeGreaterThan(SEVERITY_THRESHOLDS.breaking);
    });

    it('should use centralized constants', () => {
      expect(HEALTH_WEIGHTS).toEqual(HEALTH_SCORING.WEIGHTS);
      expect(GRADE_THRESHOLDS).toEqual(HEALTH_SCORING.GRADE_THRESHOLDS);
      expect(SEVERITY_THRESHOLDS).toEqual(HEALTH_SCORING.SEVERITY_THRESHOLDS);
      expect(HEALTH_PENALTIES).toEqual(HEALTH_SCORING.PENALTIES);
    });
  });

  describe('action item prioritization', () => {
    it('should prioritize critical issues first', () => {
      const deprecationReport: DeprecationReport = {
        warnings: [
          {
            toolName: 'tool1',
            status: 'removed',
            severity: 'breaking',
            message: 'Removed',
            isPastRemoval: true,
            isInGracePeriod: false,
          },
        ],
        deprecatedCount: 0,
        expiredCount: 1,
        gracePeriodCount: 0,
        overallSeverity: 'breaking',
        summary: 'Critical',
        hasCriticalIssues: true,
      };

      const input = createHealthInput({
        deprecationReport,
        baseline: createMockBaseline([
          createMockTool({ name: 'tool1', description: '' }), // Documentation issue (low priority)
        ]),
      });

      const score = calculateHealthScore(input);

      if (score.actionItems.length >= 2) {
        expect(score.actionItems[0].priority).toBe('critical');
      }
    });
  });
});
