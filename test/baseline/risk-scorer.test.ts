/**
 * Tests for Regression Risk Scorer.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRiskScore,
  generateRiskScoreMarkdown,
} from '../../src/baseline/risk-scorer.js';
import type { BehavioralDiff, BehaviorChange, ChangeSeverity } from '../../src/baseline/types.js';

/**
 * Helper to create a minimal behavioral diff for testing.
 */
function createBasicDiff(overrides: Partial<BehavioralDiff> = {}): BehavioralDiff {
  return {
    severity: 'none' as ChangeSeverity,
    toolsAdded: [],
    toolsRemoved: [],
    toolsModified: [],
    behaviorChanges: [],
    breakingCount: 0,
    warningCount: 0,
    infoCount: 0,
    ...overrides,
  };
}

describe('Risk Scorer', () => {
  describe('calculateRiskScore', () => {
    it('should return minimal risk for no changes', () => {
      const diff = createBasicDiff();
      const score = calculateRiskScore(diff);

      expect(score.score).toBeLessThanOrEqual(30);
      expect(score.level).toBe('info');
      expect(score.factors).toHaveLength(5);
    });

    it('should increase risk for removed tools', () => {
      const diff = createBasicDiff({
        toolsRemoved: ['important_tool'],
        breakingCount: 1,
        severity: 'breaking',
      });

      const score = calculateRiskScore(diff);

      expect(score.score).toBeGreaterThan(30);
      expect(score.level).not.toBe('info');
      // Recommendation should be non-empty
      expect(score.recommendation.length).toBeGreaterThan(10);
    });

    it('should score breaking behavior changes highly', () => {
      const diff = createBasicDiff({
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'schema',
            description: 'Required parameter removed from input',
            severity: 'breaking' as ChangeSeverity,
            isPositive: false,
            assertion: 'Schema should be stable',
          },
        ],
        breakingCount: 1,
        severity: 'breaking',
      });

      const score = calculateRiskScore(diff);

      const breakingFactor = score.factors.find(f => f.name === 'Breaking Changes');
      expect(breakingFactor).toBeDefined();
      expect(breakingFactor!.score).toBeGreaterThan(0);
    });

    it('should compound score for multiple breaking changes', () => {
      const singleBreaking = createBasicDiff({
        behaviorChanges: [
          {
            tool: 'tool1',
            aspect: 'schema',
            description: 'Type changed',
            severity: 'breaking' as ChangeSeverity,
            isPositive: false,
            assertion: 'Type stable',
          },
        ],
        breakingCount: 1,
        severity: 'breaking',
      });

      const multipleBreaking = createBasicDiff({
        behaviorChanges: [
          {
            tool: 'tool1',
            aspect: 'schema',
            description: 'Type changed',
            severity: 'breaking' as ChangeSeverity,
            isPositive: false,
            assertion: 'Type stable',
          },
          {
            tool: 'tool2',
            aspect: 'schema',
            description: 'Required parameter added',
            severity: 'breaking' as ChangeSeverity,
            isPositive: false,
            assertion: 'Required params stable',
          },
          {
            tool: 'tool3',
            aspect: 'schema',
            description: 'Enum value removed',
            severity: 'breaking' as ChangeSeverity,
            isPositive: false,
            assertion: 'Enum values stable',
          },
        ],
        breakingCount: 3,
        severity: 'breaking',
      });

      const singleScore = calculateRiskScore(singleBreaking);
      const multipleScore = calculateRiskScore(multipleBreaking);

      expect(multipleScore.score).toBeGreaterThan(singleScore.score);
    });

    it('should consider tool importance', () => {
      const diff = createBasicDiff({
        toolsModified: [
          {
            tool: 'create_user',
            previous: {
              name: 'create_user',
              description: 'Creates a new user - frequently used for authentication',
              schemaHash: 'abc',
              securityNotes: [],
              limitations: [],
            },
            current: {
              name: 'create_user',
              description: 'Creates a new user - frequently used for authentication',
              schemaHash: 'def',
              securityNotes: [],
              limitations: [],
            },
            changes: [],
          },
        ],
        breakingCount: 1,
        severity: 'breaking',
      });

      const score = calculateRiskScore(diff);

      const importanceFactor = score.factors.find(f => f.name === 'Tool Importance');
      expect(importanceFactor).toBeDefined();
    });

    it('should factor in error rate changes', () => {
      const diff = createBasicDiff({
        errorTrendReport: {
          trends: [
            {
              category: 'validation_error',
              previousRate: 0.05,
              currentRate: 0.25,
              changePercent: 400,
              trend: 'increasing',
            },
          ],
          newCategories: ['timeout_error'],
          resolvedCategories: [],
          totalDelta: 0.2,
        },
      });

      const score = calculateRiskScore(diff);

      const errorFactor = score.factors.find(f => f.name === 'Error Rate');
      expect(errorFactor).toBeDefined();
      expect(errorFactor!.score).toBeGreaterThan(50);
    });

    it('should factor in performance regressions', () => {
      const diff = createBasicDiff({
        performanceReport: {
          hasRegressions: true,
          regressionCount: 2,
          improvementCount: 0,
          regressions: [
            {
              toolName: 'slow_tool',
              previousMedian: 100,
              currentMedian: 350,
              regressionPercent: 250,
              exceedsThreshold: true,
            },
          ],
          improvements: [],
          summary: 'Performance degraded',
        },
      });

      const score = calculateRiskScore(diff);

      const perfFactor = score.factors.find(f => f.name === 'Performance');
      expect(perfFactor).toBeDefined();
      expect(perfFactor!.score).toBeGreaterThan(0);
    });

    it('should factor in security findings', () => {
      const diff = createBasicDiff({
        securityReport: {
          newFindings: [
            {
              toolName: 'vulnerable_tool',
              category: 'injection',
              riskLevel: 'critical',
              payload: 'test',
              description: 'SQL injection possible',
            },
          ],
          resolvedFindings: [],
          severityChange: 2,
        },
      });

      const score = calculateRiskScore(diff);

      const securityFactor = score.factors.find(f => f.name === 'Security');
      expect(securityFactor).toBeDefined();
      expect(securityFactor!.score).toBeGreaterThan(80);
    });

    it('should generate appropriate risk levels', () => {
      const criticalDiff = createBasicDiff({
        toolsRemoved: ['critical_tool'],
        breakingCount: 5,
        severity: 'breaking',
        behaviorChanges: [
          { tool: 't1', aspect: 'schema', description: 'Required parameter removed', severity: 'breaking', isPositive: false, assertion: '' },
          { tool: 't2', aspect: 'schema', description: 'Type changed', severity: 'breaking', isPositive: false, assertion: '' },
          { tool: 't3', aspect: 'schema', description: 'Required parameter added', severity: 'breaking', isPositive: false, assertion: '' },
        ],
        securityReport: {
          newFindings: [{ toolName: 'x', category: 'injection', riskLevel: 'critical', payload: '', description: '' }],
          resolvedFindings: [],
          severityChange: 2,
        },
      });

      const minimalDiff = createBasicDiff({
        infoCount: 1,
        severity: 'info',
      });

      const criticalScore = calculateRiskScore(criticalDiff);
      const minimalScore = calculateRiskScore(minimalDiff);

      // criticalScore should be at least medium or higher
      expect(['critical', 'high', 'medium']).toContain(criticalScore.level);
      expect(criticalScore.score).toBeGreaterThan(minimalScore.score);
      expect(minimalScore.level).toBe('info');
    });

    it('should generate appropriate recommendations', () => {
      const diff = createBasicDiff({
        toolsRemoved: ['old_tool'],
        breakingCount: 1,
        severity: 'breaking',
      });

      const score = calculateRiskScore(diff);

      expect(score.recommendation).toBeTruthy();
      expect(score.recommendation.length).toBeGreaterThan(10);
    });

    it('should include change summary', () => {
      const diff = createBasicDiff({
        toolsAdded: ['new_tool'],
        toolsRemoved: ['old_tool'],
        toolsModified: [
          { tool: 'modified_tool', previous: null, current: null, changes: [] },
        ],
        breakingCount: 2,
        warningCount: 3,
        infoCount: 5,
      });

      const score = calculateRiskScore(diff);

      expect(score.changeSummary.breaking).toBe(2);
      expect(score.changeSummary.warning).toBe(3);
      expect(score.changeSummary.info).toBe(5);
      expect(score.changeSummary.toolsAdded).toBe(1);
      expect(score.changeSummary.toolsRemoved).toBe(1);
      expect(score.changeSummary.toolsModified).toBe(1);
    });
  });

  describe('generateRiskScoreMarkdown', () => {
    it('should generate valid markdown output', () => {
      const diff = createBasicDiff({
        breakingCount: 1,
        severity: 'warning',
      });
      const score = calculateRiskScore(diff);
      const markdown = generateRiskScoreMarkdown(score);

      expect(markdown).toContain('## Regression Risk Assessment');
      expect(markdown).toContain('Risk Level:');
      expect(markdown).toContain('/100');
      expect(markdown).toContain('### Risk Factors');
    });

    it('should include factor breakdown table', () => {
      const diff = createBasicDiff();
      const score = calculateRiskScore(diff);
      const markdown = generateRiskScoreMarkdown(score);

      expect(markdown).toContain('| Factor | Score | Weight | Details |');
      expect(markdown).toContain('Breaking Changes');
      expect(markdown).toContain('Tool Importance');
      expect(markdown).toContain('Error Rate');
      expect(markdown).toContain('Performance');
      expect(markdown).toContain('Security');
    });

    it('should include change summary table when changes exist', () => {
      const diff = createBasicDiff({
        breakingCount: 1,
        warningCount: 2,
        severity: 'breaking',
      });
      const score = calculateRiskScore(diff);
      const markdown = generateRiskScoreMarkdown(score);

      expect(markdown).toContain('### Change Summary');
      expect(markdown).toContain('| Type | Count |');
    });

    it('should show appropriate emoji for risk level', () => {
      const criticalDiff = createBasicDiff({
        toolsRemoved: ['tool1', 'tool2', 'tool3'],
        breakingCount: 5,
        severity: 'breaking',
        behaviorChanges: [
          { tool: 't', aspect: 'schema', description: 'Required parameter removed', severity: 'breaking', isPositive: false, assertion: '' },
        ],
      });

      const score = calculateRiskScore(criticalDiff);
      const markdown = generateRiskScoreMarkdown(score);

      // Should have appropriate indicator for the risk level
      expect(markdown).toMatch(/CRITICAL|HIGH|MEDIUM|LOW|INFO/i);
    });
  });
});
