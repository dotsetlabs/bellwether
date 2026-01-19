/**
 * Tests for PR comment generator.
 */

import { describe, it, expect } from 'vitest';
import {
  generatePRComment,
  generateCompactPRComment,
  generateCIStatusSummary,
  generateDiffTable,
  generateBadgeUrl,
  generateBadgeMarkdown,
  getBadgeColor,
  shouldBlockMerge,
  getSeverityEmoji,
} from '../../src/baseline/pr-comment-generator.js';
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
    summary: 'No changes detected',
    ...overrides,
  };
}

// Helper to create a mock behavior change
function createMockChange(overrides: Partial<BehaviorChange> = {}): BehaviorChange {
  return {
    tool: 'test_tool',
    aspect: 'schema',
    before: 'old value',
    after: 'new value',
    severity: 'info',
    description: 'Test change',
    ...overrides,
  };
}

// Helper to create a mock tool diff
function createMockToolDiff(overrides: Partial<ToolDiff> = {}): ToolDiff {
  return {
    tool: 'test_tool',
    changes: [],
    schemaChanged: false,
    descriptionChanged: false,
    responseStructureChanged: false,
    errorPatternsChanged: false,
    ...overrides,
  };
}

describe('PR Comment Generator', () => {
  describe('getBadgeColor', () => {
    it('should return correct colors for severity levels', () => {
      expect(getBadgeColor('breaking')).toBe('red');
      expect(getBadgeColor('warning')).toBe('orange');
      expect(getBadgeColor('info')).toBe('blue');
      expect(getBadgeColor('none')).toBe('green');
    });
  });

  describe('generateBadgeUrl', () => {
    it('should generate shields.io URL', () => {
      const url = generateBadgeUrl('Status', 'passing', 'green');

      expect(url).toContain('img.shields.io');
      expect(url).toContain('Status');
      expect(url).toContain('passing');
      expect(url).toContain('green');
    });

    it('should encode special characters', () => {
      const url = generateBadgeUrl('My Label', 'has spaces', 'blue');

      expect(url).toContain('My%20Label');
      expect(url).toContain('has%20spaces');
    });
  });

  describe('generateBadgeMarkdown', () => {
    it('should generate markdown badge', () => {
      const markdown = generateBadgeMarkdown('Status', 'passing', 'green');

      expect(markdown).toMatch(/!\[Status\]\(https:\/\/img\.shields\.io.+\)/);
    });
  });

  describe('getSeverityEmoji', () => {
    it('should return correct emojis', () => {
      expect(getSeverityEmoji('breaking')).toBe('🔴');
      expect(getSeverityEmoji('warning')).toBe('🟠');
      expect(getSeverityEmoji('info')).toBe('🔵');
      expect(getSeverityEmoji('none')).toBe('✅');
    });
  });

  describe('generatePRComment', () => {
    it('should generate comment for no changes', () => {
      const diff = createMockDiff({ severity: 'none' });

      const comment = generatePRComment(diff);

      expect(comment.title).toContain('No Schema Drift');
      expect(comment.badge.color).toBe('green');
      expect(comment.markdown).toContain('No Schema Drift');
    });

    it('should generate comment for breaking changes', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        breakingCount: 2,
        behaviorChanges: [
          createMockChange({ severity: 'breaking', tool: 'tool1' }),
          createMockChange({ severity: 'breaking', tool: 'tool2' }),
        ],
      });

      const comment = generatePRComment(diff);

      expect(comment.title).toContain('Breaking');
      expect(comment.badge.color).toBe('red');
      expect(comment.badge.message).toContain('2 breaking');
    });

    it('should generate comment for warning changes', () => {
      const diff = createMockDiff({
        severity: 'warning',
        warningCount: 3,
      });

      const comment = generatePRComment(diff);

      expect(comment.badge.color).toBe('orange');
      expect(comment.badge.message).toContain('3 warnings');
    });

    it('should include summary section', () => {
      const diff = createMockDiff({
        toolsAdded: ['new_tool'],
        toolsRemoved: ['old_tool'],
        toolsModified: [createMockToolDiff({ tool: 'modified_tool' })],
      });

      const comment = generatePRComment(diff);

      expect(comment.markdown).toContain('1** tools added');
      expect(comment.markdown).toContain('1** tools removed');
      expect(comment.markdown).toContain('1** tools modified');
    });

    it('should include breaking changes section', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        breakingCount: 1,
        behaviorChanges: [
          createMockChange({
            severity: 'breaking',
            tool: 'test_tool',
            aspect: 'schema',
            description: 'Parameter removed',
          }),
        ],
      });

      const comment = generatePRComment(diff);

      expect(comment.markdown).toContain('Breaking Changes');
      expect(comment.markdown).toContain('test_tool');
      expect(comment.markdown).toContain('Parameter removed');
    });

    it('should include tools added section', () => {
      const diff = createMockDiff({
        toolsAdded: ['tool1', 'tool2'],
      });

      const comment = generatePRComment(diff);

      expect(comment.markdown).toContain('Tools Added');
      expect(comment.markdown).toContain('tool1');
      expect(comment.markdown).toContain('tool2');
    });

    it('should include tools removed section', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        breakingCount: 1,
        toolsRemoved: ['old_tool'],
      });

      const comment = generatePRComment(diff);

      expect(comment.markdown).toContain('Tools Removed');
      expect(comment.markdown).toContain('old_tool');
      expect(comment.markdown).toContain('breaking change');
    });

    it('should generate action items', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        breakingCount: 1,
        toolsRemoved: ['tool1'],
      });

      const comment = generatePRComment(diff);

      expect(comment.actionItems.length).toBeGreaterThan(0);
      expect(comment.markdown).toContain('Action Items');
    });

    it('should include footer', () => {
      const diff = createMockDiff();
      const comment = generatePRComment(diff, {
        baseBranch: 'main',
        headBranch: 'feature',
      });

      expect(comment.footer).toContain('Bellwether');
      expect(comment.markdown).toContain('main');
      expect(comment.markdown).toContain('feature');
    });

    it('should include collapsible sections when enabled', () => {
      const diff = createMockDiff({
        toolsModified: [
          createMockToolDiff({ tool: 'tool1', changes: [createMockChange()] }),
          createMockToolDiff({ tool: 'tool2', changes: [createMockChange()] }),
          createMockToolDiff({ tool: 'tool3', changes: [createMockChange()] }),
          createMockToolDiff({ tool: 'tool4', changes: [createMockChange()] }),
        ],
      });

      const comment = generatePRComment(diff, { useCollapsibleSections: true });

      expect(comment.markdown).toContain('<details>');
    });
  });

  describe('generateCompactPRComment', () => {
    it('should generate compact comment for no changes', () => {
      const diff = createMockDiff({ severity: 'none' });

      const comment = generateCompactPRComment(diff);

      expect(comment).toContain('No schema drift detected');
    });

    it('should generate compact comment with breaking changes', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        breakingCount: 2,
        behaviorChanges: [
          createMockChange({ severity: 'breaking', tool: 'tool1', description: 'Change 1' }),
          createMockChange({ severity: 'breaking', tool: 'tool2', description: 'Change 2' }),
        ],
      });

      const comment = generateCompactPRComment(diff);

      expect(comment).toContain('Schema Drift Report');
      expect(comment).toContain('Breaking changes');
      expect(comment).toContain('tool1');
      expect(comment).toContain('tool2');
    });

    it('should show tool stats', () => {
      const diff = createMockDiff({
        toolsAdded: ['new'],
        toolsRemoved: ['old'],
        toolsModified: [createMockToolDiff()],
        severity: 'info',
        infoCount: 1,
      });

      const comment = generateCompactPRComment(diff);

      expect(comment).toContain('+1 added');
      expect(comment).toContain('-1 removed');
      expect(comment).toContain('~1 modified');
    });

    it('should truncate many breaking changes', () => {
      const changes: BehaviorChange[] = [];
      for (let i = 0; i < 10; i++) {
        changes.push(createMockChange({
          severity: 'breaking',
          tool: `tool${i}`,
          description: `Change ${i}`,
        }));
      }

      const diff = createMockDiff({
        severity: 'breaking',
        breakingCount: 10,
        behaviorChanges: changes,
      });

      const comment = generateCompactPRComment(diff);

      expect(comment).toContain('...and');
      expect(comment).toContain('more');
    });
  });

  describe('generateCIStatusSummary', () => {
    it('should return failure for breaking changes', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        breakingCount: 1,
      });

      const status = generateCIStatusSummary(diff);

      expect(status.conclusion).toBe('failure');
      expect(status.title).toContain('breaking');
    });

    it('should return neutral for warnings', () => {
      const diff = createMockDiff({
        severity: 'warning',
        warningCount: 2,
      });

      const status = generateCIStatusSummary(diff);

      expect(status.conclusion).toBe('neutral');
      expect(status.title).toContain('warning');
    });

    it('should return success for info changes', () => {
      const diff = createMockDiff({
        severity: 'info',
        infoCount: 3,
      });

      const status = generateCIStatusSummary(diff);

      expect(status.conclusion).toBe('success');
    });

    it('should return success for no changes', () => {
      const diff = createMockDiff({ severity: 'none' });

      const status = generateCIStatusSummary(diff);

      expect(status.conclusion).toBe('success');
      expect(status.title).toContain('No drift');
    });
  });

  describe('generateDiffTable', () => {
    it('should generate empty message for no diffs', () => {
      const table = generateDiffTable([]);

      expect(table).toContain('No tool modifications');
    });

    it('should generate table with tool info', () => {
      const diffs = [
        createMockToolDiff({
          tool: 'tool1',
          schemaChanged: true,
          changes: [createMockChange({ severity: 'breaking' })],
        }),
      ];

      const table = generateDiffTable(diffs);

      expect(table).toContain('| Tool |');
      expect(table).toContain('tool1');
      expect(table).toContain('🔴');
      expect(table).toContain('Changed');
    });

    it('should show all change indicators', () => {
      const diffs = [
        createMockToolDiff({
          tool: 'tool1',
          changes: [
            createMockChange({ severity: 'breaking' }),
            createMockChange({ severity: 'warning' }),
            createMockChange({ severity: 'info' }),
          ],
        }),
      ];

      const table = generateDiffTable(diffs);

      expect(table).toContain('🔴');
      expect(table).toContain('🟠');
      expect(table).toContain('🔵');
    });

    it('should truncate many tools', () => {
      const diffs: ToolDiff[] = [];
      for (let i = 0; i < 20; i++) {
        diffs.push(createMockToolDiff({ tool: `tool${i}` }));
      }

      const table = generateDiffTable(diffs);

      expect(table).toContain('...and');
      expect(table).toContain('more');
    });
  });

  describe('shouldBlockMerge', () => {
    it('should block merge for breaking changes in strict mode', () => {
      const diff = createMockDiff({ severity: 'breaking' });

      expect(shouldBlockMerge(diff, true)).toBe(true);
    });

    it('should not block merge for warnings in strict mode', () => {
      const diff = createMockDiff({ severity: 'warning' });

      expect(shouldBlockMerge(diff, true)).toBe(false);
    });

    it('should not block merge for breaking changes when not strict', () => {
      const diff = createMockDiff({ severity: 'breaking' });

      expect(shouldBlockMerge(diff, false)).toBe(false);
    });

    it('should not block merge for no changes', () => {
      const diff = createMockDiff({ severity: 'none' });

      expect(shouldBlockMerge(diff, true)).toBe(false);
    });
  });

  describe('with migration guide', () => {
    it('should include migration section when provided', () => {
      const diff = createMockDiff({
        severity: 'breaking',
        breakingCount: 1,
      });

      const migrationGuide = {
        fromVersion: '1.0.0',
        toVersion: '2.0.0',
        dateRange: {
          from: new Date('2025-01-01'),
          to: new Date('2025-01-15'),
        },
        breakingChanges: [],
        steps: [
          {
            stepNumber: 1,
            type: 'remove_parameter' as const,
            toolName: 'test_tool',
            title: 'Remove deprecated parameter',
            description: 'The param has been removed',
            isBreaking: true,
            codeExamples: [
              {
                language: 'typescript',
                title: 'Example',
                before: '// old code',
                after: '// new code',
              },
            ],
          },
        ],
        codeExamples: [],
        estimatedEffort: 'minor' as const,
        stats: {
          breakingChangesCount: 1,
          toolsAffected: 1,
          stepsCount: 1,
          changesByType: {},
        },
        summary: 'Migration summary',
        removedTools: [],
        addedTools: [],
        warnings: [],
      };

      const comment = generatePRComment(diff, { includeMigrationExamples: true }, migrationGuide);

      expect(comment.markdown).toContain('Migration Guide');
      expect(comment.markdown).toContain('MINOR');
    });
  });

  describe('with affected workflows', () => {
    it('should include workflows section when provided', () => {
      const diff = createMockDiff();
      const workflows = [
        {
          name: 'Data Pipeline',
          description: 'Affected by tool changes',
          affectedTools: ['tool1', 'tool2'],
          severity: 'warning' as const,
        },
      ];

      const comment = generatePRComment(diff, {}, undefined, workflows);

      expect(comment.markdown).toContain('Affected Workflows');
      expect(comment.markdown).toContain('Data Pipeline');
    });
  });
});
