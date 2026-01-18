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
} from '../../src/baseline/diff.js';
import type { BehavioralDiff, ToolDiff, BehaviorChange } from '../../src/baseline/types.js';

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
            significance: 'high',
            description: 'Schema changed for modified_tool',
          },
        ],
        schemaChanged: true,
        descriptionChanged: false,
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
        toolsModified: [{ tool: 'c', changes: [], schemaChanged: false, descriptionChanged: false }],
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
            significance: 'high',
            description: 'Schema changed',
          },
        ],
        breakingCount: 1,
      });

      const output = formatDiffGitHubActions(diff);

      expect(output).toContain('::error::');
      expect(output).toContain('Breaking changes detected');
    });

    it('should use appropriate annotation levels', () => {
      const changes: BehaviorChange[] = [
        {
          tool: 'a',
          aspect: 'schema',
          before: '',
          after: '',
          significance: 'high',
          description: 'High change',
        },
        {
          tool: 'b',
          aspect: 'description',
          before: '',
          after: '',
          significance: 'medium',
          description: 'Medium change',
        },
        {
          tool: 'c',
          aspect: 'description',
          before: '',
          after: '',
          significance: 'low',
          description: 'Low change',
        },
      ];

      const diff = createMockDiff({
        severity: 'warning',
        behaviorChanges: changes,
        summary: 'Changes detected',
      });

      const output = formatDiffGitHubActions(diff);

      expect(output).toContain('::error::a - High change');
      expect(output).toContain('::warning::b - Medium change');
      expect(output).toContain('::notice::c - Low change');
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
        toolsModified: [{
          tool: 'modified',
          changes: [],
          schemaChanged: true,
          descriptionChanged: false,
        }],
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
            significance: 'high',
            description: 'Security issue found',
          },
        ],
        severity: 'breaking',
        breakingCount: 1,
        summary: 'Security changes',
      });

      const output = formatDiffMarkdown(diff);

      expect(output).toContain('### Changes');
      expect(output).toContain('| Tool | Aspect | Significance | Description |');
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
});
