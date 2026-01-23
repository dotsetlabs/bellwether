/**
 * Tests for Intelligent Test Pruning.
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePruningDecisions,
  calculateToolPruning,
  prioritizeTools,
  generatePruningSummary,
  generatePruningMarkdown,
  type PruningInput,
  type TestCategory,
} from '../../src/baseline/test-pruner.js';
import type { MCPTool } from '../../src/transport/types.js';

describe('Test Pruner', () => {
  const ALL_CATEGORIES: TestCategory[] = [
    'happy_path',
    'boundary',
    'enum',
    'optional_combinations',
    'error_handling',
    'security',
    'semantic',
  ];

  describe('calculateToolPruning', () => {
    it('should always run happy_path and error_handling', () => {
      const input: PruningInput = {
        tool: {
          name: 'simple_tool',
          description: 'A simple tool',
          inputSchema: {},
        },
        availableCategories: ALL_CATEGORIES,
      };

      const decision = calculateToolPruning(input);

      expect(decision.categoriesToRun).toContain('happy_path');
      expect(decision.categoriesToRun).toContain('error_handling');
    });

    it('should skip boundary tests for tools without numeric params', () => {
      const input: PruningInput = {
        tool: {
          name: 'string_only_tool',
          description: 'A tool with only string parameters',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        availableCategories: ALL_CATEGORIES,
      };

      const decision = calculateToolPruning(input);

      expect(decision.categoriesToSkip).toContain('boundary');
    });

    it('should run boundary tests for tools with numeric params', () => {
      const input: PruningInput = {
        tool: {
          name: 'numeric_tool',
          description: 'A tool with numeric parameters',
          inputSchema: {
            type: 'object',
            properties: {
              count: { type: 'integer' },
              price: { type: 'number' },
            },
          },
        },
        availableCategories: ALL_CATEGORIES,
      };

      const decision = calculateToolPruning(input);

      // Should run boundary tests (not skip) since it has numeric params
      const boundaryDecision = decision.categories.find(c => c.category === 'boundary');
      expect(boundaryDecision?.shouldRun).toBe(true);
    });

    it('should skip enum tests for tools without enum params', () => {
      const input: PruningInput = {
        tool: {
          name: 'no_enum_tool',
          description: 'A tool without enum parameters',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        },
        availableCategories: ALL_CATEGORIES,
      };

      const decision = calculateToolPruning(input);

      expect(decision.categoriesToSkip).toContain('enum');
    });

    it('should run enum tests for tools with enum params', () => {
      const input: PruningInput = {
        tool: {
          name: 'enum_tool',
          description: 'A tool with enum parameters',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
            },
          },
        },
        availableCategories: ALL_CATEGORIES,
      };

      const decision = calculateToolPruning(input);

      expect(decision.categoriesToRun).toContain('enum');
    });

    it('should skip optional_combinations for tools without optional params', () => {
      const input: PruningInput = {
        tool: {
          name: 'required_only',
          description: 'A tool with only required parameters',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
            required: ['id'],
          },
        },
        availableCategories: ALL_CATEGORIES,
      };

      const decision = calculateToolPruning(input);

      expect(decision.categoriesToSkip).toContain('optional_combinations');
    });

    it('should skip security tests for tools without string params', () => {
      const input: PruningInput = {
        tool: {
          name: 'numbers_only',
          description: 'A tool with only numeric parameters',
          inputSchema: {
            type: 'object',
            properties: {
              count: { type: 'integer' },
              amount: { type: 'number' },
            },
          },
        },
        availableCategories: ALL_CATEGORIES,
      };

      const decision = calculateToolPruning(input);

      expect(decision.categoriesToSkip).toContain('security');
    });

    it('should prioritize tools with external dependencies', () => {
      const externalTool: PruningInput = {
        tool: {
          name: 'api_tool',
          description: 'Calls external API service',
          inputSchema: {},
        },
        availableCategories: ALL_CATEGORIES,
      };

      const internalTool: PruningInput = {
        tool: {
          name: 'local_tool',
          description: 'Performs local computation',
          inputSchema: {},
        },
        availableCategories: ALL_CATEGORIES,
      };

      const externalDecision = calculateToolPruning(externalTool);
      const internalDecision = calculateToolPruning(internalTool);

      expect(externalDecision.priority).toBeGreaterThan(internalDecision.priority);
    });

    it('should increase priority for tools with error history', () => {
      const errorTool: PruningInput = {
        tool: {
          name: 'error_prone_tool',
          description: 'A tool that frequently errors',
          inputSchema: {},
        },
        errorPatterns: [
          { message: 'Validation failed', count: 10, category: 'validation' },
          { message: 'Timeout', count: 5, category: 'timeout' },
        ],
        availableCategories: ALL_CATEGORIES,
      };

      const stableTool: PruningInput = {
        tool: {
          name: 'stable_tool',
          description: 'A tool that rarely errors',
          inputSchema: {},
        },
        availableCategories: ALL_CATEGORIES,
      };

      const errorDecision = calculateToolPruning(errorTool);
      const stableDecision = calculateToolPruning(stableTool);

      expect(errorDecision.priority).toBeGreaterThan(stableDecision.priority);
    });

    it('should calculate reduction percentage', () => {
      const input: PruningInput = {
        tool: {
          name: 'simple_tool',
          description: 'A simple tool',
          inputSchema: {},
        },
        availableCategories: ALL_CATEGORIES,
      };

      const decision = calculateToolPruning(input);

      expect(decision.reductionPercent).toBeGreaterThanOrEqual(0);
      expect(decision.reductionPercent).toBeLessThanOrEqual(100);
    });

    it('should respect max skip limit', () => {
      const input: PruningInput = {
        tool: {
          name: 'minimal_tool',
          description: 'Tool',
          inputSchema: {},
        },
        availableCategories: ALL_CATEGORIES,
      };

      const decision = calculateToolPruning(input);

      // At least happy_path and error_handling should run
      expect(decision.categoriesToRun.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('calculatePruningDecisions', () => {
    it('should calculate decisions for multiple tools', () => {
      const inputs: PruningInput[] = [
        {
          tool: { name: 'tool1', description: 'First tool', inputSchema: {} },
          availableCategories: ALL_CATEGORIES,
        },
        {
          tool: { name: 'tool2', description: 'Second tool', inputSchema: {} },
          availableCategories: ALL_CATEGORIES,
        },
        {
          tool: { name: 'tool3', description: 'Third tool', inputSchema: {} },
          availableCategories: ALL_CATEGORIES,
        },
      ];

      const decisions = calculatePruningDecisions(inputs);

      expect(decisions).toHaveLength(3);
      expect(decisions[0].toolName).toBe('tool1');
      expect(decisions[1].toolName).toBe('tool2');
      expect(decisions[2].toolName).toBe('tool3');
    });
  });

  describe('prioritizeTools', () => {
    it('should sort tools by priority descending', () => {
      const inputs: PruningInput[] = [
        {
          tool: { name: 'low_priority', description: 'Low priority tool', inputSchema: {} },
          availableCategories: ALL_CATEGORIES,
        },
        {
          tool: {
            name: 'high_priority',
            description: 'High priority external API tool with many parameters',
            inputSchema: {
              type: 'object',
              properties: {
                p1: { type: 'string' },
                p2: { type: 'string' },
                p3: { type: 'string' },
                p4: { type: 'string' },
                p5: { type: 'string' },
                p6: { type: 'string' },
              },
            },
          },
          errorPatterns: [{ message: 'Error', count: 10, category: 'error' }],
          availableCategories: ALL_CATEGORIES,
        },
      ];

      const decisions = calculatePruningDecisions(inputs);
      const prioritized = prioritizeTools(decisions);

      expect(prioritized[0].toolName).toBe('high_priority');
      expect(prioritized[0].priority).toBeGreaterThan(prioritized[1].priority);
    });
  });

  describe('generatePruningSummary', () => {
    it('should calculate overall statistics', () => {
      const inputs: PruningInput[] = [
        {
          tool: { name: 'tool1', description: 'Tool 1', inputSchema: {} },
          availableCategories: ALL_CATEGORIES,
        },
        {
          tool: { name: 'tool2', description: 'Tool 2', inputSchema: {} },
          availableCategories: ALL_CATEGORIES,
        },
      ];

      const decisions = calculatePruningDecisions(inputs);
      const summary = generatePruningSummary(decisions);

      expect(summary.totalTools).toBe(2);
      expect(summary.totalCategoriesWithoutPruning).toBe(ALL_CATEGORIES.length * 2);
      expect(summary.totalCategoriesWithPruning).toBeLessThanOrEqual(
        summary.totalCategoriesWithoutPruning
      );
      expect(summary.overallReduction).toBeGreaterThanOrEqual(0);
    });

    it('should identify high priority tools', () => {
      const inputs: PruningInput[] = [
        {
          tool: {
            name: 'important_tool',
            description: 'Important external API tool',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
            },
          },
          errorPatterns: [{ message: 'Error', count: 5, category: 'error' }],
          availableCategories: ALL_CATEGORIES,
        },
        {
          tool: { name: 'simple_tool', description: 'Simple', inputSchema: {} },
          availableCategories: ALL_CATEGORIES,
        },
      ];

      const decisions = calculatePruningDecisions(inputs);
      const summary = generatePruningSummary(decisions);

      expect(summary.highPriorityTools).toContain('important_tool');
    });

    it('should identify most pruned tools', () => {
      const inputs: PruningInput[] = [
        {
          tool: {
            name: 'minimal_tool',
            description: 'Minimal tool with no params',
            inputSchema: {},
          },
          availableCategories: ALL_CATEGORIES,
        },
        {
          tool: {
            name: 'full_tool',
            description: 'Full featured external API tool',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                count: { type: 'integer' },
                status: { type: 'string', enum: ['a', 'b'] },
                optional: { type: 'string' },
              },
              required: ['query'],
            },
          },
          errorPatterns: [{ message: 'Error', count: 10, category: 'error' }],
          availableCategories: ALL_CATEGORIES,
        },
      ];

      const decisions = calculatePruningDecisions(inputs);
      const summary = generatePruningSummary(decisions);

      // Minimal tool should be more pruned than full tool
      const minimalDecision = decisions.find(d => d.toolName === 'minimal_tool');
      const fullDecision = decisions.find(d => d.toolName === 'full_tool');

      expect(minimalDecision!.reductionPercent).toBeGreaterThanOrEqual(
        fullDecision!.reductionPercent
      );
    });
  });

  describe('generatePruningMarkdown', () => {
    it('should generate valid markdown output', () => {
      const inputs: PruningInput[] = [
        {
          tool: { name: 'test_tool', description: 'Test', inputSchema: {} },
          availableCategories: ALL_CATEGORIES,
        },
      ];

      const decisions = calculatePruningDecisions(inputs);
      const summary = generatePruningSummary(decisions);
      const markdown = generatePruningMarkdown(decisions, summary);

      expect(markdown).toContain('## Test Pruning Analysis');
      expect(markdown).toContain('Test Reduction:');
      expect(markdown).toContain('| Metric | Value |');
    });

    it('should include high priority tools section when present', () => {
      const inputs: PruningInput[] = [
        {
          tool: {
            name: 'priority_tool',
            description: 'High priority API tool',
            inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
          },
          errorPatterns: [{ message: 'Error', count: 10, category: 'error' }],
          availableCategories: ALL_CATEGORIES,
        },
      ];

      const decisions = calculatePruningDecisions(inputs);
      const summary = generatePruningSummary(decisions);
      const markdown = generatePruningMarkdown(decisions, summary);

      if (summary.highPriorityTools.length > 0) {
        expect(markdown).toContain('### High Priority Tools');
      }
    });

    it('should include pruning decisions table', () => {
      const inputs: PruningInput[] = [
        {
          tool: { name: 'tool1', description: 'Tool 1', inputSchema: {} },
          availableCategories: ALL_CATEGORIES,
        },
        {
          tool: { name: 'tool2', description: 'Tool 2', inputSchema: {} },
          availableCategories: ALL_CATEGORIES,
        },
      ];

      const decisions = calculatePruningDecisions(inputs);
      const summary = generatePruningSummary(decisions);
      const markdown = generatePruningMarkdown(decisions, summary);

      expect(markdown).toContain('### Pruning Decisions');
      expect(markdown).toContain('| Tool | Priority | Run | Skip | Reduction |');
    });

    it('should handle many tools with ellipsis', () => {
      const inputs: PruningInput[] = Array.from({ length: 20 }, (_, i) => ({
        tool: { name: `tool_${i}`, description: `Tool ${i}`, inputSchema: {} },
        availableCategories: ALL_CATEGORIES,
      }));

      const decisions = calculatePruningDecisions(inputs);
      const summary = generatePruningSummary(decisions);
      const markdown = generatePruningMarkdown(decisions, summary);

      expect(markdown).toContain('more tools');
    });
  });
});
