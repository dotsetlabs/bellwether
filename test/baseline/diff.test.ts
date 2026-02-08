/**
 * Tests for diff formatting functions.
 */

import { describe, it, expect } from 'vitest';
import {
  formatDiffText,
  formatDiffJson,
  formatDiffCompact,
  formatDiffGitHubActions,
  formatDiffMarkdown,
  formatDiffJUnit,
  formatDiffSarif,
  formatSecurityReport,
} from '../../src/baseline/diff.js';
import type { BehavioralDiff, ToolDiff, BehaviorChange } from '../../src/baseline/types.js';
import type { SecurityDiff } from '../../src/security/types.js';

// Helper to create a mock diff
function createMockDiff(overrides: Partial<BehavioralDiff> = {}): BehavioralDiff {
  return {
    toolsAdded: [],
    toolsRemoved: [],
    toolsModified: [],
    behaviorChanges: [],
    severity: 'none',
    breakingCount: 0,
    warningCount: 0,
    infoCount: 0,
    summary: 'No changes detected.',
    ...overrides,
  };
}

describe('Diff Formatting', () => {
  describe('formatDiffText', () => {
    it('should format empty diff', () => {
      const diff = createMockDiff();
      const output = formatDiffText(diff, false);

      expect(output).toContain('Drift Report');
      expect(output).toContain('No changes detected');
      expect(output).toContain('Severity:');
    });

    it('should format diff with removed tools', () => {
      const diff = createMockDiff({
        toolsRemoved: ['old_tool'],
        severity: 'breaking',
        breakingCount: 1,
        summary: '1 tool(s) removed: old_tool.',
      });

      const output = formatDiffText(diff, false);

      expect(output).toContain('Tools Removed');
      expect(output).toContain('old_tool');
      expect(output).toContain('BREAKING');
    });

    it('should format diff with added tools', () => {
      const diff = createMockDiff({
        toolsAdded: ['new_tool'],
        severity: 'info',
        infoCount: 1,
        summary: '1 tool(s) added: new_tool.',
      });

      const output = formatDiffText(diff, false);

      expect(output).toContain('Tools Added');
      expect(output).toContain('new_tool');
    });

    it('should format diff with modified tools', () => {
      const toolDiff: ToolDiff = {
        tool: 'modified_tool',
        changes: [
          {
            tool: 'modified_tool',
            aspect: 'schema',
            before: 'old schema',
            after: 'new schema',
            severity: 'breaking',
            description: 'Schema changed for modified_tool',
          },
        ],
        schemaChanged: true,
        descriptionChanged: false,
        responseStructureChanged: false,
        errorPatternsChanged: false,
        responseSchemaEvolutionChanged: false,
        securityChanged: false,
      };

      const diff = createMockDiff({
        toolsModified: [toolDiff],
        behaviorChanges: toolDiff.changes,
        severity: 'breaking',
        breakingCount: 1,
        summary: '1 tool(s) modified.',
      });

      const output = formatDiffText(diff, false);

      expect(output).toContain('Tools Modified');
      expect(output).toContain('modified_tool');
      expect(output).toContain('Schema changed');
    });

    it('should show statistics', () => {
      const diff = createMockDiff({
        severity: 'warning',
        breakingCount: 1,
        warningCount: 2,
        infoCount: 3,
        summary: 'Various changes detected.',
      });

      const output = formatDiffText(diff, false);

      expect(output).toContain('Statistics');
      expect(output).toContain('Breaking changes: 1');
      expect(output).toContain('Warnings: 2');
      expect(output).toContain('Info: 3');
    });

    it('should format with colors when enabled', () => {
      const diff = createMockDiff({
        toolsRemoved: ['removed_tool'],
        severity: 'breaking',
        breakingCount: 1,
        summary: '1 tool(s) removed.',
      });

      const output = formatDiffText(diff, true);

      // Should contain ANSI color codes
      expect(output).toContain('\x1b[');
    });

    it('should format without colors when disabled', () => {
      const diff = createMockDiff({
        toolsRemoved: ['removed_tool'],
        severity: 'breaking',
        breakingCount: 1,
        summary: '1 tool(s) removed.',
      });

      const output = formatDiffText(diff, false);

      // Should not contain ANSI color codes
      expect(output).not.toContain('\x1b[31m');
    });
  });

  describe('formatDiffJson', () => {
    it('should produce valid JSON', () => {
      const diff = createMockDiff({
        toolsAdded: ['new_tool'],
        severity: 'info',
        infoCount: 1,
      });

      const output = formatDiffJson(diff);
      const parsed = JSON.parse(output);

      expect(parsed.toolsAdded).toContain('new_tool');
      expect(parsed.severity).toBe('info');
    });

    it('should include all diff fields', () => {
      const diff = createMockDiff({
        toolsAdded: ['a'],
        toolsRemoved: ['b'],
        toolsModified: [
          {
            tool: 'c',
            changes: [],
            schemaChanged: false,
            descriptionChanged: false,
            responseStructureChanged: false,
            errorPatternsChanged: false,
            responseSchemaEvolutionChanged: false,
            securityChanged: false,
          },
        ],
        behaviorChanges: [],
        severity: 'warning',
        breakingCount: 1,
        warningCount: 1,
        infoCount: 1,
        summary: 'Test summary',
      });

      const output = formatDiffJson(diff);
      const parsed = JSON.parse(output);

      expect(parsed.toolsAdded).toEqual(['a']);
      expect(parsed.toolsRemoved).toEqual(['b']);
      expect(parsed.toolsModified).toHaveLength(1);
      expect(parsed.severity).toBe('warning');
      expect(parsed.breakingCount).toBe(1);
      expect(parsed.summary).toBe('Test summary');
    });
  });

  describe('formatDiffCompact', () => {
    it('should produce single-line output', () => {
      const diff = createMockDiff({
        toolsAdded: ['a', 'b'],
        severity: 'info',
        infoCount: 2,
      });

      const output = formatDiffCompact(diff);

      expect(output).not.toContain('\n');
      expect(output).toContain('severity=info');
      expect(output).toContain('added=[a,b]');
    });

    it('should include counts', () => {
      const diff = createMockDiff({
        severity: 'warning',
        breakingCount: 1,
        warningCount: 2,
        infoCount: 3,
      });

      const output = formatDiffCompact(diff);

      expect(output).toContain('breaking=1');
      expect(output).toContain('warnings=2');
      expect(output).toContain('info=3');
    });

    it('should not include empty arrays', () => {
      const diff = createMockDiff();

      const output = formatDiffCompact(diff);

      expect(output).not.toContain('removed=');
      expect(output).not.toContain('added=');
      expect(output).not.toContain('modified=');
    });
  });

  describe('formatDiffGitHubActions', () => {
    it('should produce GitHub Actions annotations', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        summary: 'Breaking changes detected',
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'schema',
            before: 'old',
            after: 'new',
            severity: 'breaking',
            description: 'Schema changed',
          },
        ],
        breakingCount: 1,
      });

      const output = formatDiffGitHubActions(diff);

      expect(output).toContain('::error::Drift detected:');
      expect(output).toContain('Breaking changes detected');
    });

    it('should use appropriate annotation levels', () => {
      const changes: BehaviorChange[] = [
        {
          tool: 'a',
          aspect: 'schema',
          before: '',
          after: '',
          severity: 'breaking',
          description: 'Breaking change',
        },
        {
          tool: 'b',
          aspect: 'description',
          before: '',
          after: '',
          severity: 'warning',
          description: 'Warning change',
        },
        {
          tool: 'c',
          aspect: 'description',
          before: '',
          after: '',
          severity: 'info',
          description: 'Info change',
        },
      ];

      const diff = createMockDiff({
        severity: 'breaking',
        behaviorChanges: changes,
        summary: 'Changes detected',
      });

      const output = formatDiffGitHubActions(diff);

      expect(output).toContain('::error::a - Breaking change');
      expect(output).toContain('::warning::b - Warning change');
      expect(output).toContain('::notice::c - Info change');
    });

    it('should annotate removed tools as errors', () => {
      const diff = createMockDiff({
        toolsRemoved: ['removed_tool'],
        severity: 'breaking',
        breakingCount: 1,
        summary: 'Tool removed',
      });

      const output = formatDiffGitHubActions(diff);

      expect(output).toContain('::error::Tool removed: removed_tool');
    });
  });

  describe('formatDiffMarkdown', () => {
    it('should produce valid markdown', () => {
      const diff = createMockDiff({
        severity: 'warning',
        summary: 'Some changes detected',
      });

      const output = formatDiffMarkdown(diff);

      expect(output).toContain('## Drift Report');
      expect(output).toContain('**Severity:**');
      expect(output).toContain('WARNING');
    });

    it('should include tool changes table', () => {
      const diff = createMockDiff({
        toolsRemoved: ['removed'],
        toolsAdded: ['added'],
        toolsModified: [
          {
            tool: 'modified',
            changes: [],
            schemaChanged: true,
            descriptionChanged: false,
            responseStructureChanged: false,
            errorPatternsChanged: false,
            responseSchemaEvolutionChanged: false,
            securityChanged: false,
          },
        ],
        severity: 'breaking',
        breakingCount: 1,
        infoCount: 1,
        warningCount: 1,
        summary: 'Multiple changes',
      });

      const output = formatDiffMarkdown(diff);

      expect(output).toContain('### Tool Changes');
      expect(output).toContain('| Tool | Status | Details |');
      expect(output).toContain('removed');
      expect(output).toContain('added');
      expect(output).toContain('modified');
    });

    it('should include behavioral changes table', () => {
      const diff = createMockDiff({
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'security',
            before: '',
            after: '',
            severity: 'breaking',
            description: 'Security issue found',
          },
        ],
        severity: 'breaking',
        breakingCount: 1,
        summary: 'Security changes',
      });

      const output = formatDiffMarkdown(diff);

      expect(output).toContain('### Changes');
      expect(output).toContain('| Tool | Aspect | Severity | Description |');
      expect(output).toContain('test_tool');
      expect(output).toContain('security');
    });

    it('should show statistics', () => {
      const diff = createMockDiff({
        severity: 'warning',
        breakingCount: 1,
        warningCount: 2,
        infoCount: 3,
        summary: 'Stats test',
      });

      const output = formatDiffMarkdown(diff);

      expect(output).toContain('### Statistics');
      expect(output).toContain('**1**');
      expect(output).toContain('**2**');
      expect(output).toContain('**3**');
    });

    it('should use correct severity emojis', () => {
      const severities: Array<{ severity: BehavioralDiff['severity']; emoji: string }> = [
        { severity: 'none', emoji: '✅' },
        { severity: 'info', emoji: 'ℹ️' },
        { severity: 'warning', emoji: '⚠️' },
        { severity: 'breaking', emoji: '❌' },
      ];

      for (const { severity, emoji } of severities) {
        const diff = createMockDiff({ severity, summary: `Test ${severity}` });
        const output = formatDiffMarkdown(diff);
        expect(output).toContain(emoji);
      }
    });
  });

  describe('formatDiffJUnit', () => {
    it('should produce valid XML with header', () => {
      const diff = createMockDiff();
      const output = formatDiffJUnit(diff);

      expect(output).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(output).toContain('<testsuites');
      expect(output).toContain('</testsuites>');
    });

    it('should use custom suite name', () => {
      const diff = createMockDiff();
      const output = formatDiffJUnit(diff, 'my-suite');

      expect(output).toContain('name="my-suite"');
    });

    it('should create failure elements for removed tools', () => {
      const diff = createMockDiff({
        toolsRemoved: ['old_tool'],
        severity: 'breaking',
        breakingCount: 1,
        summary: 'Tool removed',
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('tool-present-old_tool');
      expect(output).toContain('<failure message="Tool removed: old_tool" type="breaking">');
      expect(output).toContain('classname="drift.tools"');
    });

    it('should create system-out for added tools', () => {
      const diff = createMockDiff({
        toolsAdded: ['new_tool'],
        severity: 'info',
        infoCount: 1,
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('tool-new-new_tool');
      expect(output).toContain('<system-out>New tool added: new_tool</system-out>');
    });

    it('should handle breaking behavior changes as failures', () => {
      const diff = createMockDiff({
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'schema',
            before: 'old schema',
            after: 'new schema',
            severity: 'breaking',
            description: 'Schema changed',
          },
        ],
        severity: 'breaking',
        breakingCount: 1,
        summary: 'Breaking changes',
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('classname="drift.behavior"');
      expect(output).toContain('<failure message="Schema changed" type="breaking">');
      expect(output).toContain('Before: old schema');
      expect(output).toContain('After: new schema');
    });

    it('should handle warning changes as system-err', () => {
      const diff = createMockDiff({
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'description',
            before: '',
            after: '',
            severity: 'warning',
            description: 'Description changed',
          },
        ],
        severity: 'warning',
        warningCount: 1,
        summary: 'Warning changes',
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('<system-err>[WARNING] Description changed</system-err>');
    });

    it('should handle info changes as system-out', () => {
      const diff = createMockDiff({
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'description',
            before: '',
            after: '',
            severity: 'info',
            description: 'Minor change',
          },
        ],
        severity: 'info',
        infoCount: 1,
        summary: 'Info changes',
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('<system-out>[INFO] Minor change</system-out>');
    });

    it('should include performance regression test cases', () => {
      const diff = createMockDiff({
        severity: 'warning',
        performanceReport: {
          regressions: [
            {
              toolName: 'slow_tool',
              previousP50Ms: 100,
              currentP50Ms: 200,
              regressionPercent: 1.0,
              exceedsThreshold: true,
              isReliable: true,
              currentConfidence: 'high',
            },
          ],
          regressionCount: 1,
          improvementCount: 0,
          hasRegressions: true,
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('performance-slow_tool');
      expect(output).toContain('classname="drift.performance"');
      expect(output).toContain('Performance regression: +100.0%');
      expect(output).toContain('Previous p50: 100ms');
      expect(output).toContain('Current p50: 200ms');
    });

    it('should include low confidence tool notices', () => {
      const diff = createMockDiff({
        severity: 'info',
        performanceReport: {
          regressions: [],
          regressionCount: 0,
          improvementCount: 0,
          hasRegressions: false,
          lowConfidenceTools: ['flaky_tool'],
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('confidence-flaky_tool');
      expect(output).toContain('classname="drift.confidence"');
      expect(output).toContain('Low confidence metrics for flaky_tool');
    });

    it('should include security findings', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        securityReport: {
          newFindings: [
            {
              category: 'sql_injection',
              riskLevel: 'critical',
              title: 'SQL Injection in query param',
              description: 'Payload not sanitized',
              evidence: 'SELECT * FROM ...',
              remediation: 'Use parameterized queries',
              cweId: 'CWE-89',
              parameter: 'query',
              tool: 'search_tool',
            },
          ],
          resolvedFindings: [
            {
              category: 'xss',
              riskLevel: 'medium',
              title: 'XSS in output',
              description: 'Fixed',
              evidence: '',
              remediation: 'N/A',
              cweId: 'CWE-79',
              parameter: 'output',
              tool: 'render_tool',
            },
          ],
          previousRiskScore: 50,
          currentRiskScore: 80,
          riskScoreChange: 30,
          degraded: true,
          summary: 'Security degraded',
        },
      });

      const output = formatDiffJUnit(diff);

      // New critical finding as failure
      expect(output).toContain('classname="drift.security"');
      expect(output).toContain('<failure message="SQL Injection in query param" type="critical">');
      expect(output).toContain('CWE-89');

      // Resolved finding as passing
      expect(output).toContain('security-resolved-render_tool-xss');
      expect(output).toContain('Resolved: XSS in output (CWE-79)');
    });

    it('should include non-critical security findings as system-err', () => {
      const diff = createMockDiff({
        severity: 'warning',
        securityReport: {
          newFindings: [
            {
              category: 'error_disclosure',
              riskLevel: 'low',
              title: 'Stack trace exposed',
              description: 'Error details visible',
              evidence: 'at line 42',
              remediation: 'Suppress stack traces',
              cweId: 'CWE-209',
              parameter: 'error',
              tool: 'api_tool',
            },
          ],
          resolvedFindings: [],
          previousRiskScore: 10,
          currentRiskScore: 20,
          riskScoreChange: 10,
          degraded: true,
          summary: 'Minor security issue',
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('[LOW] Stack trace exposed');
      expect(output).not.toContain('<failure');
    });

    it('should include schema evolution issues', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        schemaEvolutionReport: {
          toolsWithIssues: [
            {
              toolName: 'evolving_tool',
              becameUnstable: false,
              fieldsAdded: ['newField'],
              fieldsRemoved: ['oldField'],
              isBreaking: true,
              summary: 'Breaking schema evolution',
            },
          ],
          unstableCount: 0,
          stableCount: 5,
          structureChangedCount: 1,
          hasBreakingChanges: true,
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('schema-evolution-evolving_tool');
      expect(output).toContain('classname="drift.schema"');
      expect(output).toContain('<failure message="Breaking schema evolution"');
      expect(output).toContain('Fields removed: oldField');
      expect(output).toContain('Fields added: newField');
    });

    it('should show unstable schema as warning', () => {
      const diff = createMockDiff({
        severity: 'warning',
        schemaEvolutionReport: {
          toolsWithIssues: [
            {
              toolName: 'unstable_tool',
              becameUnstable: true,
              fieldsAdded: [],
              fieldsRemoved: [],
              isBreaking: false,
              summary: 'Schema became unstable',
            },
          ],
          unstableCount: 1,
          stableCount: 4,
          structureChangedCount: 0,
          hasBreakingChanges: false,
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('[WARNING] Schema became unstable');
    });

    it('should show stable schemas as passing when no issues', () => {
      const diff = createMockDiff({
        severity: 'none',
        schemaEvolutionReport: {
          toolsWithIssues: [],
          unstableCount: 0,
          stableCount: 3,
          structureChangedCount: 0,
          hasBreakingChanges: false,
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('schema-stability-check');
      expect(output).toContain('3 tool(s) have stable response schemas');
    });

    it('should include error trend changes', () => {
      const diff = createMockDiff({
        severity: 'warning',
        errorTrendReport: {
          trends: [
            {
              category: 'validation',
              previousCount: 2,
              currentCount: 10,
              trend: 'increasing',
              significance: 'high',
              changePercent: 400,
            },
          ],
          significantChange: true,
          summary: 'Error rates significantly increased',
          increasingCategories: ['validation'],
          decreasingCategories: [],
          newCategories: ['timeout'],
          resolvedCategories: ['permission'],
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('error-trend-new-timeout');
      expect(output).toContain('New error type detected: timeout');
      expect(output).toContain('error-trend-resolved-permission');
      expect(output).toContain('Resolved: permission error type no longer occurs');
      expect(output).toContain('error-trend-increasing-validation');
      expect(output).toContain('Error frequency increasing: validation (+400%)');
      expect(output).toContain('error-trend-summary');
      expect(output).toContain('Error rates significantly increased');
    });

    it('should show stable error trends', () => {
      const diff = createMockDiff({
        severity: 'none',
        errorTrendReport: {
          trends: [
            {
              category: 'validation',
              previousCount: 5,
              currentCount: 5,
              trend: 'stable',
              significance: 'low',
              changePercent: 0,
            },
          ],
          significantChange: false,
          summary: 'Error patterns stable',
          increasingCategories: [],
          decreasingCategories: [],
          newCategories: [],
          resolvedCategories: [],
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('Error patterns stable');
    });

    it('should include documentation quality changes', () => {
      const diff = createMockDiff({
        severity: 'warning',
        documentationScoreReport: {
          previousScore: 85,
          currentScore: 60,
          change: -25,
          previousGrade: 'B',
          currentGrade: 'D',
          improved: false,
          degraded: true,
          issuesFixed: 0,
          newIssues: 5,
          summary: 'Documentation quality decreased',
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('documentation-quality-score');
      expect(output).toContain('Documentation quality degraded: 85 -> 60 (D)');
      expect(output).toContain('New documentation issues: 5');
    });

    it('should show improved documentation', () => {
      const diff = createMockDiff({
        severity: 'info',
        documentationScoreReport: {
          previousScore: 60,
          currentScore: 90,
          change: 30,
          previousGrade: 'D',
          currentGrade: 'A',
          improved: true,
          degraded: false,
          issuesFixed: 3,
          newIssues: 0,
          summary: 'Documentation improved',
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('Documentation quality improved: 60 -> 90 (A)');
      expect(output).toContain('Issues fixed: 3');
    });

    it('should show stable documentation', () => {
      const diff = createMockDiff({
        severity: 'none',
        documentationScoreReport: {
          previousScore: 80,
          currentScore: 80,
          change: 0,
          previousGrade: 'B',
          currentGrade: 'B',
          improved: false,
          degraded: false,
          issuesFixed: 0,
          newIssues: 0,
          summary: 'No change',
        },
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('Documentation quality: 80/100 (B)');
    });

    it('should escape XML special characters', () => {
      const diff = createMockDiff({
        toolsRemoved: ['tool<with>&"special\'chars'],
        severity: 'breaking',
        breakingCount: 1,
        summary: 'Tool removed',
      });

      const output = formatDiffJUnit(diff);

      expect(output).toContain('&lt;');
      expect(output).toContain('&amp;');
      expect(output).toContain('&quot;');
      expect(output).toContain('&apos;');
    });
  });

  describe('formatDiffSarif', () => {
    it('should produce valid SARIF JSON', () => {
      const diff = createMockDiff();
      const output = formatDiffSarif(diff);
      const sarif = JSON.parse(output);

      expect(sarif.version).toBe('2.1.0');
      expect(sarif.$schema).toContain('sarif-schema');
      expect(sarif.runs).toHaveLength(1);
      expect(sarif.runs[0].tool.driver.name).toBe('bellwether');
      expect(sarif.runs[0].tool.driver.rules.length).toBeGreaterThan(0);
    });

    it('should include removed tools as errors with BWH001', () => {
      const diff = createMockDiff({
        toolsRemoved: ['gone_tool'],
        severity: 'breaking',
        breakingCount: 1,
      });

      const output = formatDiffSarif(diff);
      const sarif = JSON.parse(output);
      const results = sarif.runs[0].results;

      const removed = results.find((r: Record<string, unknown>) => r.ruleId === 'BWH001');
      expect(removed).toBeDefined();
      expect(removed.level).toBe('error');
      expect(removed.message.text).toContain('gone_tool');
      expect(removed.properties.changeType).toBe('removed');
    });

    it('should include added tools as notes with BWH004', () => {
      const diff = createMockDiff({
        toolsAdded: ['new_tool'],
        severity: 'info',
        infoCount: 1,
      });

      const output = formatDiffSarif(diff);
      const sarif = JSON.parse(output);
      const results = sarif.runs[0].results;

      const added = results.find((r: Record<string, unknown>) => r.ruleId === 'BWH004');
      expect(added).toBeDefined();
      expect(added.level).toBe('note');
      expect(added.properties.changeType).toBe('added');
    });

    it('should map behavior change aspects to correct rules', () => {
      const changes: BehaviorChange[] = [
        {
          tool: 'a',
          aspect: 'schema',
          before: '',
          after: '',
          severity: 'breaking',
          description: 'Schema broke',
        },
        {
          tool: 'b',
          aspect: 'response_structure',
          before: '',
          after: '',
          severity: 'warning',
          description: 'Response changed',
        },
        {
          tool: 'c',
          aspect: 'error_pattern',
          before: '',
          after: '',
          severity: 'warning',
          description: 'Error pattern changed',
        },
        {
          tool: 'd',
          aspect: 'error_handling',
          before: '',
          after: '',
          severity: 'info',
          description: 'Error handling updated',
        },
        {
          tool: 'e',
          aspect: 'description',
          before: '',
          after: '',
          severity: 'info',
          description: 'Description updated',
        },
      ];

      const diff = createMockDiff({
        behaviorChanges: changes,
        severity: 'breaking',
        breakingCount: 1,
        warningCount: 2,
        infoCount: 2,
      });

      const output = formatDiffSarif(diff);
      const sarif = JSON.parse(output);
      const results = sarif.runs[0].results;

      // Schema breaking → BWH002 error
      const schemaResult = results.find(
        (r: Record<string, unknown>) =>
          (r as { properties: { tool: string } }).properties.tool === 'a'
      );
      expect(schemaResult.ruleId).toBe('BWH002');
      expect(schemaResult.level).toBe('error');

      // Response structure → BWH005 warning
      const respResult = results.find(
        (r: Record<string, unknown>) =>
          (r as { properties: { tool: string } }).properties.tool === 'b'
      );
      expect(respResult.ruleId).toBe('BWH005');
      expect(respResult.level).toBe('warning');

      // Error pattern → BWH006
      const errResult = results.find(
        (r: Record<string, unknown>) =>
          (r as { properties: { tool: string } }).properties.tool === 'c'
      );
      expect(errResult.ruleId).toBe('BWH006');

      // Error handling → BWH006
      const errHandling = results.find(
        (r: Record<string, unknown>) =>
          (r as { properties: { tool: string } }).properties.tool === 'd'
      );
      expect(errHandling.ruleId).toBe('BWH006');

      // Description (default) → BWH003 note
      const descResult = results.find(
        (r: Record<string, unknown>) =>
          (r as { properties: { tool: string } }).properties.tool === 'e'
      );
      expect(descResult.ruleId).toBe('BWH003');
      expect(descResult.level).toBe('note');
    });

    it('should include security findings as BWH007', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        securityReport: {
          newFindings: [
            {
              category: 'sql_injection',
              riskLevel: 'critical',
              title: 'SQL Injection',
              description: 'Payload passed through',
              evidence: 'SELECT *',
              remediation: 'Parameterize queries',
              cweId: 'CWE-89',
              parameter: 'query',
              tool: 'db_tool',
            },
            {
              category: 'xss',
              riskLevel: 'medium',
              title: 'XSS Reflected',
              description: 'Script injected',
              evidence: '<script>',
              remediation: 'Sanitize output',
              cweId: 'CWE-79',
              parameter: 'html',
              tool: 'render_tool',
            },
            {
              category: 'error_disclosure',
              riskLevel: 'low',
              title: 'Stack trace',
              description: 'Stack exposed',
              evidence: 'at line 5',
              remediation: 'Hide traces',
              cweId: 'CWE-209',
              parameter: 'err',
              tool: 'api_tool',
            },
          ],
          resolvedFindings: [],
          previousRiskScore: 0,
          currentRiskScore: 80,
          riskScoreChange: 80,
          degraded: true,
          summary: 'Multiple security issues',
        },
      });

      const output = formatDiffSarif(diff);
      const sarif = JSON.parse(output);
      const securityResults = sarif.runs[0].results.filter(
        (r: Record<string, unknown>) => r.ruleId === 'BWH007'
      );

      expect(securityResults).toHaveLength(3);

      // Critical → error
      expect(securityResults[0].level).toBe('error');
      // Medium → warning
      expect(securityResults[1].level).toBe('warning');
      // Low → note
      expect(securityResults[2].level).toBe('note');
    });

    it('should include schema evolution as BWH008/BWH009', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        schemaEvolutionReport: {
          toolsWithIssues: [
            {
              toolName: 'breaking_tool',
              becameUnstable: false,
              fieldsAdded: [],
              fieldsRemoved: ['removed_field'],
              isBreaking: true,
              summary: 'Field removed',
            },
            {
              toolName: 'unstable_tool',
              becameUnstable: true,
              fieldsAdded: [],
              fieldsRemoved: [],
              isBreaking: false,
              summary: 'Became unstable',
            },
          ],
          unstableCount: 1,
          stableCount: 3,
          structureChangedCount: 1,
          hasBreakingChanges: true,
        },
      });

      const output = formatDiffSarif(diff);
      const sarif = JSON.parse(output);
      const results = sarif.runs[0].results;

      const breakingSchema = results.find((r: Record<string, unknown>) => r.ruleId === 'BWH008');
      expect(breakingSchema).toBeDefined();
      expect(breakingSchema.level).toBe('error');

      const unstableSchema = results.find((r: Record<string, unknown>) => r.ruleId === 'BWH009');
      expect(unstableSchema).toBeDefined();
      expect(unstableSchema.level).toBe('warning');
    });

    it('should include performance regressions as BWH012', () => {
      const diff = createMockDiff({
        severity: 'warning',
        performanceReport: {
          regressions: [
            {
              toolName: 'slow_tool',
              previousP50Ms: 50,
              currentP50Ms: 150,
              regressionPercent: 2.0,
              exceedsThreshold: true,
              isReliable: false,
              currentConfidence: 'low',
            },
          ],
          regressionCount: 1,
          improvementCount: 0,
          hasRegressions: true,
          lowConfidenceTools: ['unreliable_tool'],
        },
      });

      const output = formatDiffSarif(diff);
      const sarif = JSON.parse(output);
      const results = sarif.runs[0].results;

      const perfResult = results.find((r: Record<string, unknown>) => r.ruleId === 'BWH012');
      expect(perfResult).toBeDefined();
      expect(perfResult.level).toBe('warning');
      expect(perfResult.message.text).toContain('low confidence');

      const confResult = results.find((r: Record<string, unknown>) => r.ruleId === 'BWH013');
      expect(confResult).toBeDefined();
      expect(confResult.level).toBe('note');
      expect(confResult.message.text).toContain('unreliable_tool');
    });

    it('should include error trends as BWH010/BWH011', () => {
      const diff = createMockDiff({
        severity: 'warning',
        errorTrendReport: {
          trends: [
            {
              category: 'validation',
              previousCount: 1,
              currentCount: 10,
              trend: 'increasing',
              significance: 'high',
              changePercent: 900,
            },
          ],
          significantChange: true,
          summary: 'Errors increasing',
          increasingCategories: ['validation'],
          decreasingCategories: [],
          newCategories: ['timeout'],
          resolvedCategories: [],
        },
      });

      const output = formatDiffSarif(diff);
      const sarif = JSON.parse(output);
      const results = sarif.runs[0].results;

      const newErr = results.find((r: Record<string, unknown>) => r.ruleId === 'BWH010');
      expect(newErr).toBeDefined();
      expect(newErr.message.text).toContain('timeout');

      const incErr = results.find((r: Record<string, unknown>) => r.ruleId === 'BWH011');
      expect(incErr).toBeDefined();
      expect(incErr.message.text).toContain('validation');
      expect(incErr.message.text).toContain('+900%');
    });

    it('should include documentation quality as BWH014/BWH015', () => {
      const diff = createMockDiff({
        severity: 'warning',
        documentationScoreReport: {
          previousScore: 80,
          currentScore: 35,
          change: -45,
          previousGrade: 'B',
          currentGrade: 'F',
          improved: false,
          degraded: true,
          issuesFixed: 0,
          newIssues: 10,
          summary: 'Documentation quality dropped',
        },
      });

      const output = formatDiffSarif(diff);
      const sarif = JSON.parse(output);
      const results = sarif.runs[0].results;

      const degraded = results.find((r: Record<string, unknown>) => r.ruleId === 'BWH014');
      expect(degraded).toBeDefined();
      expect(degraded.level).toBe('warning');
      expect(degraded.message.text).toContain('80 -> 35');

      const lowQuality = results.find((r: Record<string, unknown>) => r.ruleId === 'BWH015');
      expect(lowQuality).toBeDefined();
      expect(lowQuality.message.text).toContain('35/100');
      expect(lowQuality.message.text).toContain('F');
    });

    it('should use custom baseline path', () => {
      const diff = createMockDiff({
        toolsAdded: ['tool'],
        severity: 'info',
        infoCount: 1,
      });

      const output = formatDiffSarif(diff, 'custom/path.json');
      const sarif = JSON.parse(output);

      const location = sarif.runs[0].results[0].locations[0].physicalLocation;
      expect(location.artifactLocation.uri).toBe('custom/path.json');
    });
  });

  describe('formatSecurityReport', () => {
    function createMockSecurityDiff(overrides: Partial<SecurityDiff> = {}): SecurityDiff {
      return {
        newFindings: [],
        resolvedFindings: [],
        previousRiskScore: 0,
        currentRiskScore: 0,
        riskScoreChange: 0,
        degraded: false,
        summary: 'No security changes',
        ...overrides,
      };
    }

    it('should produce a report with header and summary', () => {
      const report = createMockSecurityDiff();
      const output = formatSecurityReport(report, false);

      expect(output).toContain('Security Report');
      expect(output).toContain('No security changes');
      expect(output).toContain('Risk Score:');
    });

    it('should show risk score changes', () => {
      const report = createMockSecurityDiff({
        previousRiskScore: 20,
        currentRiskScore: 60,
        riskScoreChange: 40,
        degraded: true,
        summary: 'Security degraded',
      });

      const output = formatSecurityReport(report, false);

      expect(output).toContain('Risk Score: 20');
      expect(output).toContain('60');
      expect(output).toContain('↑');
    });

    it('should show decreased risk score', () => {
      const report = createMockSecurityDiff({
        previousRiskScore: 60,
        currentRiskScore: 20,
        riskScoreChange: -40,
        degraded: false,
        summary: 'Security improved',
      });

      const output = formatSecurityReport(report, false);

      expect(output).toContain('↓');
    });

    it('should show unchanged risk score', () => {
      const report = createMockSecurityDiff({
        previousRiskScore: 30,
        currentRiskScore: 30,
        riskScoreChange: 0,
      });

      const output = formatSecurityReport(report, false);

      expect(output).toContain('→');
    });

    it('should show new findings with risk levels', () => {
      const report = createMockSecurityDiff({
        newFindings: [
          {
            category: 'sql_injection',
            riskLevel: 'critical',
            title: 'SQL Injection Found',
            description: 'Query param not sanitized',
            evidence: "' OR 1=1 --",
            remediation: 'Use prepared statements',
            cweId: 'CWE-89',
            parameter: 'query',
            tool: 'search_tool',
          },
        ],
        degraded: true,
        summary: 'Critical finding',
      });

      const output = formatSecurityReport(report, false);

      expect(output).toContain('New Findings');
      expect(output).toContain('[CRITICAL]');
      expect(output).toContain('SQL Injection Found');
      expect(output).toContain('Tool: search_tool');
      expect(output).toContain('Parameter: query');
      expect(output).toContain('CWE-89');
      expect(output).toContain('Remediation:');
    });

    it('should show resolved findings', () => {
      const report = createMockSecurityDiff({
        resolvedFindings: [
          {
            category: 'xss',
            riskLevel: 'medium',
            title: 'XSS Fixed',
            description: 'No longer vulnerable',
            evidence: '',
            remediation: 'N/A',
            cweId: 'CWE-79',
            parameter: 'html',
            tool: 'render_tool',
          },
        ],
        summary: 'Fixed issue',
      });

      const output = formatSecurityReport(report, false);

      expect(output).toContain('Resolved Findings');
      expect(output).toContain('XSS Fixed');
      expect(output).toContain('render_tool');
    });

    it('should show statistics with critical/high count', () => {
      const report = createMockSecurityDiff({
        newFindings: [
          {
            category: 'sql_injection',
            riskLevel: 'critical',
            title: 'Critical issue',
            description: 'Desc',
            evidence: 'ev',
            remediation: 'Fix',
            cweId: 'CWE-89',
            parameter: 'p',
            tool: 't1',
          },
          {
            category: 'command_injection',
            riskLevel: 'high',
            title: 'High issue',
            description: 'Desc',
            evidence: 'ev',
            remediation: 'Fix',
            cweId: 'CWE-78',
            parameter: 'p',
            tool: 't2',
          },
          {
            category: 'error_disclosure',
            riskLevel: 'low',
            title: 'Low issue',
            description: 'Desc',
            evidence: 'ev',
            remediation: 'Fix',
            cweId: 'CWE-209',
            parameter: 'p',
            tool: 't3',
          },
        ],
        resolvedFindings: [],
        degraded: true,
        summary: 'Multiple issues',
      });

      const output = formatSecurityReport(report, false);

      expect(output).toContain('Statistics');
      expect(output).toContain('New findings: 3');
      expect(output).toContain('Resolved findings: 0');
      expect(output).toContain('Critical/High severity:');
      expect(output).toContain('2');
    });

    it('should support colors', () => {
      const report = createMockSecurityDiff({
        degraded: true,
        previousRiskScore: 10,
        currentRiskScore: 50,
        riskScoreChange: 40,
        summary: 'Degraded',
      });

      const output = formatSecurityReport(report, true);

      expect(output).toContain('\x1b[');
    });
  });

  describe('formatDiffText with rich reports', () => {
    it('should include performance report section', () => {
      const diff = createMockDiff({
        severity: 'warning',
        performanceReport: {
          regressions: [
            {
              toolName: 'slow_tool',
              previousP50Ms: 100,
              currentP50Ms: 300,
              regressionPercent: 2.0,
              exceedsThreshold: true,
              isReliable: true,
            },
          ],
          regressionCount: 1,
          improvementCount: 0,
          hasRegressions: true,
        },
      });

      const output = formatDiffText(diff, false);

      expect(output).toContain('Performance');
    });

    it('should include security report section', () => {
      const diff = createMockDiff({
        severity: 'warning',
        securityReport: {
          newFindings: [
            {
              category: 'xss',
              riskLevel: 'medium',
              title: 'XSS',
              description: 'XSS vuln',
              evidence: '<script>',
              remediation: 'Sanitize',
              cweId: 'CWE-79',
              parameter: 'input',
              tool: 'tool',
            },
          ],
          resolvedFindings: [],
          previousRiskScore: 0,
          currentRiskScore: 40,
          riskScoreChange: 40,
          degraded: true,
          summary: 'New security findings',
        },
      });

      const output = formatDiffText(diff, false);

      expect(output).toContain('Security');
    });
  });

  describe('formatDiffJson with rich reports', () => {
    it('should include all report data in JSON output', () => {
      const diff = createMockDiff({
        severity: 'warning',
        performanceReport: {
          regressions: [],
          regressionCount: 0,
          improvementCount: 1,
          hasRegressions: false,
        },
        securityReport: {
          newFindings: [],
          resolvedFindings: [],
          previousRiskScore: 10,
          currentRiskScore: 5,
          riskScoreChange: -5,
          degraded: false,
          summary: 'Improved',
        },
      });

      const output = formatDiffJson(diff);
      const parsed = JSON.parse(output);

      expect(parsed.performanceReport).toBeDefined();
      expect(parsed.securityReport).toBeDefined();
    });
  });
});
