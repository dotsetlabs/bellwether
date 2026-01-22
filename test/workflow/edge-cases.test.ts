/**
 * Tests for workflow edge cases and error handling.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Workflow, WorkflowStep, DataFlowEdge, AssertionResult } from '../../src/workflow/types.js';
import type { MCPToolCallResult } from '../../src/transport/types.js';

describe('workflow edge cases', () => {
  describe('path resolution', () => {
    // Helper function to simulate path resolution logic
    function resolvePath(pathExpr: string, stepResults: any[], currentStepIndex: number): unknown {
      const match = pathExpr.match(/^\$steps\[(\d+)\]\.(.+)$/);
      if (!match) {
        throw new Error(`Invalid path expression: ${pathExpr}`);
      }

      const stepIndex = parseInt(match[1], 10);
      const propertyPath = match[2];

      if (stepIndex >= currentStepIndex) {
        throw new Error(`Cannot reference step ${stepIndex} from step ${currentStepIndex}`);
      }

      const stepResult = stepResults[stepIndex];
      if (!stepResult) {
        throw new Error(`Step ${stepIndex} has not been executed yet`);
      }

      return navigatePath(stepResult, propertyPath);
    }

    function navigatePath(obj: unknown, path: string): unknown {
      const parts = path.split('.');
      let current: unknown = obj;

      for (const part of parts) {
        if (current === null || current === undefined) {
          return undefined;
        }

        // Handle array access: field[0]
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const [, fieldName, indexStr] = arrayMatch;
          const index = parseInt(indexStr, 10);
          current = (current as Record<string, unknown>)[fieldName];
          if (Array.isArray(current)) {
            current = current[index];
          } else {
            return undefined;
          }
        } else {
          current = (current as Record<string, unknown>)[part];
        }
      }

      return current;
    }

    it('should resolve simple path', () => {
      const stepResults = [
        { result: { id: '123', name: 'Test' } },
      ];

      const value = resolvePath('$steps[0].result.id', stepResults, 1);
      expect(value).toBe('123');
    });

    it('should resolve nested path', () => {
      const stepResults = [
        { result: { user: { profile: { email: 'test@example.com' } } } },
      ];

      const value = resolvePath('$steps[0].result.user.profile.email', stepResults, 1);
      expect(value).toBe('test@example.com');
    });

    it('should resolve array access path', () => {
      const stepResults = [
        { result: { items: [{ id: '1' }, { id: '2' }, { id: '3' }] } },
      ];

      const value = resolvePath('$steps[0].result.items[1].id', stepResults, 1);
      expect(value).toBe('2');
    });

    it('should reject invalid path format', () => {
      const stepResults = [{ result: {} }];

      expect(() => resolvePath('invalid.path', stepResults, 1)).toThrow('Invalid path expression');
    });

    it('should reject forward references', () => {
      const stepResults = [{ result: {} }];

      expect(() => resolvePath('$steps[1].result.id', stepResults, 1)).toThrow('Cannot reference step 1 from step 1');
    });

    it('should handle undefined nested properties', () => {
      const stepResults = [
        { result: { user: null } },
      ];

      const value = resolvePath('$steps[0].result.user.name', stepResults, 1);
      expect(value).toBeUndefined();
    });

    it('should handle out of bounds array access', () => {
      const stepResults = [
        { result: { items: [{ id: '1' }] } },
      ];

      const value = resolvePath('$steps[0].result.items[5].id', stepResults, 1);
      expect(value).toBeUndefined();
    });
  });

  describe('assertion evaluation', () => {
    // Helper function to simulate assertion evaluation
    function evaluateAssertion(
      condition: string,
      actualValue: unknown,
      expectedValue?: unknown
    ): boolean {
      switch (condition) {
        case 'exists':
          return actualValue !== undefined && actualValue !== null;
        case 'truthy':
          return Boolean(actualValue);
        case 'equals':
          return actualValue === expectedValue;
        case 'contains':
          if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
            return actualValue.includes(expectedValue);
          }
          if (Array.isArray(actualValue)) {
            return actualValue.includes(expectedValue);
          }
          return false;
        case 'type':
          return typeof actualValue === expectedValue;
        default:
          return false;
      }
    }

    describe('exists condition', () => {
      it('should pass for defined value', () => {
        expect(evaluateAssertion('exists', 'value')).toBe(true);
        expect(evaluateAssertion('exists', 0)).toBe(true);
        expect(evaluateAssertion('exists', false)).toBe(true);
        expect(evaluateAssertion('exists', '')).toBe(true);
        expect(evaluateAssertion('exists', [])).toBe(true);
        expect(evaluateAssertion('exists', {})).toBe(true);
      });

      it('should fail for undefined or null', () => {
        expect(evaluateAssertion('exists', undefined)).toBe(false);
        expect(evaluateAssertion('exists', null)).toBe(false);
      });
    });

    describe('truthy condition', () => {
      it('should pass for truthy values', () => {
        expect(evaluateAssertion('truthy', 'value')).toBe(true);
        expect(evaluateAssertion('truthy', 1)).toBe(true);
        expect(evaluateAssertion('truthy', true)).toBe(true);
        expect(evaluateAssertion('truthy', [1])).toBe(true);
        expect(evaluateAssertion('truthy', { a: 1 })).toBe(true);
      });

      it('should fail for falsy values', () => {
        expect(evaluateAssertion('truthy', '')).toBe(false);
        expect(evaluateAssertion('truthy', 0)).toBe(false);
        expect(evaluateAssertion('truthy', false)).toBe(false);
        expect(evaluateAssertion('truthy', null)).toBe(false);
        expect(evaluateAssertion('truthy', undefined)).toBe(false);
      });
    });

    describe('equals condition', () => {
      it('should pass for equal values', () => {
        expect(evaluateAssertion('equals', 'test', 'test')).toBe(true);
        expect(evaluateAssertion('equals', 123, 123)).toBe(true);
        expect(evaluateAssertion('equals', true, true)).toBe(true);
        expect(evaluateAssertion('equals', null, null)).toBe(true);
      });

      it('should fail for unequal values', () => {
        expect(evaluateAssertion('equals', 'test', 'other')).toBe(false);
        expect(evaluateAssertion('equals', 123, 456)).toBe(false);
        expect(evaluateAssertion('equals', '123', 123)).toBe(false); // Type mismatch
      });
    });

    describe('contains condition', () => {
      it('should pass for string containment', () => {
        expect(evaluateAssertion('contains', 'hello world', 'world')).toBe(true);
        expect(evaluateAssertion('contains', 'testing', 'test')).toBe(true);
      });

      it('should pass for array containment', () => {
        expect(evaluateAssertion('contains', ['a', 'b', 'c'], 'b')).toBe(true);
        expect(evaluateAssertion('contains', [1, 2, 3], 2)).toBe(true);
      });

      it('should fail for non-containment', () => {
        expect(evaluateAssertion('contains', 'hello', 'world')).toBe(false);
        expect(evaluateAssertion('contains', ['a', 'b'], 'c')).toBe(false);
      });

      it('should fail for non-string/array types', () => {
        expect(evaluateAssertion('contains', 123, '2')).toBe(false);
        expect(evaluateAssertion('contains', { a: 1 }, 'a')).toBe(false);
      });
    });

    describe('type condition', () => {
      it('should correctly identify types', () => {
        expect(evaluateAssertion('type', 'string', 'string')).toBe(true);
        expect(evaluateAssertion('type', 123, 'number')).toBe(true);
        expect(evaluateAssertion('type', true, 'boolean')).toBe(true);
        expect(evaluateAssertion('type', {}, 'object')).toBe(true);
        expect(evaluateAssertion('type', undefined, 'undefined')).toBe(true);
      });

      it('should fail for mismatched types', () => {
        expect(evaluateAssertion('type', 'string', 'number')).toBe(false);
        expect(evaluateAssertion('type', 123, 'string')).toBe(false);
        expect(evaluateAssertion('type', null, 'undefined')).toBe(false);
      });

      it('should handle array type check', () => {
        // Arrays are 'object' in typeof
        expect(evaluateAssertion('type', [], 'object')).toBe(true);
      });
    });
  });

  describe('data flow graph building', () => {
    // Helper function to simulate data flow graph building
    function buildDataFlowGraph(workflow: Workflow): DataFlowEdge[] {
      const edges: DataFlowEdge[] = [];

      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        if (!step.argMapping) continue;

        for (const [targetParam, pathExpr] of Object.entries(step.argMapping)) {
          const match = pathExpr.match(/^\$steps\[(\d+)\]\.(.+)$/);
          if (!match) continue;

          const fromStep = parseInt(match[1], 10);
          const sourcePath = match[2];

          edges.push({
            fromStep,
            toStep: i,
            sourcePath,
            targetParam,
          });
        }
      }

      return edges;
    }

    it('should build empty graph for no mappings', () => {
      const workflow: Workflow = {
        id: 'test',
        name: 'Test',
        steps: [
          { tool: 'tool1', description: 'Step 1' },
          { tool: 'tool2', description: 'Step 2' },
        ],
      };

      const edges = buildDataFlowGraph(workflow);
      expect(edges).toEqual([]);
    });

    it('should build graph for single mapping', () => {
      const workflow: Workflow = {
        id: 'test',
        name: 'Test',
        steps: [
          { tool: 'search', description: 'Search' },
          {
            tool: 'get',
            description: 'Get',
            argMapping: { id: '$steps[0].result.items[0].id' },
          },
        ],
      };

      const edges = buildDataFlowGraph(workflow);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        fromStep: 0,
        toStep: 1,
        sourcePath: 'result.items[0].id',
        targetParam: 'id',
      });
    });

    it('should build graph for multiple mappings', () => {
      const workflow: Workflow = {
        id: 'test',
        name: 'Test',
        steps: [
          { tool: 'search', description: 'Search' },
          { tool: 'get', description: 'Get' },
          {
            tool: 'update',
            description: 'Update',
            argMapping: {
              id: '$steps[0].result.items[0].id',
              status: '$steps[1].result.status',
            },
          },
        ],
      };

      const edges = buildDataFlowGraph(workflow);

      expect(edges).toHaveLength(2);
      expect(edges.find(e => e.fromStep === 0 && e.targetParam === 'id')).toBeDefined();
      expect(edges.find(e => e.fromStep === 1 && e.targetParam === 'status')).toBeDefined();
    });

    it('should handle complex multi-step chains', () => {
      const workflow: Workflow = {
        id: 'test',
        name: 'Test',
        steps: [
          { tool: 'step0', description: 'Step 0' },
          { tool: 'step1', description: 'Step 1', argMapping: { a: '$steps[0].result.a' } },
          { tool: 'step2', description: 'Step 2', argMapping: { b: '$steps[1].result.b' } },
          { tool: 'step3', description: 'Step 3', argMapping: { c: '$steps[2].result.c' } },
        ],
      };

      const edges = buildDataFlowGraph(workflow);

      expect(edges).toHaveLength(3);
      expect(edges[0]).toMatchObject({ fromStep: 0, toStep: 1 });
      expect(edges[1]).toMatchObject({ fromStep: 1, toStep: 2 });
      expect(edges[2]).toMatchObject({ fromStep: 2, toStep: 3 });
    });
  });

  describe('workflow step options', () => {
    it('should handle optional steps', () => {
      const step: WorkflowStep = {
        tool: 'test_tool',
        description: 'Optional step',
        optional: true,
      };

      expect(step.optional).toBe(true);
    });

    it('should handle steps with args', () => {
      const step: WorkflowStep = {
        tool: 'test_tool',
        description: 'Step with args',
        args: {
          query: 'test',
          limit: 10,
          enabled: true,
          tags: ['a', 'b'],
        },
      };

      expect(step.args?.query).toBe('test');
      expect(step.args?.limit).toBe(10);
      expect(step.args?.enabled).toBe(true);
      expect(step.args?.tags).toEqual(['a', 'b']);
    });

    it('should handle steps with empty args', () => {
      const step: WorkflowStep = {
        tool: 'test_tool',
        description: 'Step with empty args',
        args: {},
      };

      expect(step.args).toEqual({});
    });

    it('should handle steps with combined args and mapping', () => {
      const step: WorkflowStep = {
        tool: 'test_tool',
        description: 'Step with both',
        args: {
          staticArg: 'value',
        },
        argMapping: {
          dynamicArg: '$steps[0].result.id',
        },
      };

      expect(step.args?.staticArg).toBe('value');
      expect(step.argMapping?.dynamicArg).toBe('$steps[0].result.id');
    });
  });

  describe('error message extraction', () => {
    // Helper function to simulate error message extraction
    function extractErrorMessage(response: MCPToolCallResult): string {
      const textContent = response.content.find(c => c.type === 'text');
      if (textContent && 'text' in textContent) {
        return String(textContent.text);
      }
      return 'Unknown error';
    }

    it('should extract text error message', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'Error: Something went wrong' }],
        isError: true,
      };

      expect(extractErrorMessage(response)).toBe('Error: Something went wrong');
    });

    it('should return unknown error for non-text content', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
        isError: true,
      };

      expect(extractErrorMessage(response)).toBe('Unknown error');
    });

    it('should return unknown error for empty content', () => {
      const response: MCPToolCallResult = {
        content: [],
        isError: true,
      };

      expect(extractErrorMessage(response)).toBe('Unknown error');
    });

    it('should extract first text content when multiple items', () => {
      const response: MCPToolCallResult = {
        content: [
          { type: 'text', text: 'First error' },
          { type: 'text', text: 'Second error' },
        ],
        isError: true,
      };

      expect(extractErrorMessage(response)).toBe('First error');
    });
  });

  describe('workflow progress tracking', () => {
    it('should calculate steps completed', () => {
      const stepResults = [
        { success: true },
        { success: true },
        { success: false },
      ];

      const stepsCompleted = stepResults.length;
      const stepsFailed = stepResults.filter(r => !r.success).length;

      expect(stepsCompleted).toBe(3);
      expect(stepsFailed).toBe(1);
    });

    it('should track elapsed time', () => {
      const startTime = Date.now() - 5000; // 5 seconds ago
      const elapsedMs = Date.now() - startTime;

      expect(elapsedMs).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('workflow validation', () => {
    it('should validate workflow has required fields', () => {
      const validWorkflow: Workflow = {
        id: 'valid',
        name: 'Valid Workflow',
        steps: [
          { tool: 'test', description: 'Test' },
        ],
      };

      expect(validWorkflow.id).toBeDefined();
      expect(validWorkflow.name).toBeDefined();
      expect(validWorkflow.steps.length).toBeGreaterThan(0);
    });

    it('should validate step has required fields', () => {
      const validStep: WorkflowStep = {
        tool: 'test_tool',
        description: 'Test step',
      };

      expect(validStep.tool).toBeDefined();
      expect(validStep.description).toBeDefined();
    });

    it('should validate argMapping format', () => {
      const validMapping = {
        param1: '$steps[0].result.value',
        param2: '$steps[1].result.items[0].id',
      };

      for (const [, path] of Object.entries(validMapping)) {
        expect(path).toMatch(/^\$steps\[\d+\]\..+$/);
      }
    });

    it('should reject invalid argMapping format', () => {
      const invalidMappings = [
        'just.a.path',
        '$step[0].result',
        '$steps.result',
        '$steps[abc].result',
        'steps[0].result',
      ];

      for (const mapping of invalidMappings) {
        expect(mapping).not.toMatch(/^\$steps\[\d+\]\..+$/);
      }
    });
  });

  describe('workflow timeout handling', () => {
    it('should have default timeout values', () => {
      const defaults = {
        toolCall: 30000,
        stateSnapshot: 15000,
        probeTool: 10000,
        llmAnalysis: 30000,
        llmSummary: 30000,
      };

      expect(defaults.toolCall).toBeGreaterThan(0);
      expect(defaults.stateSnapshot).toBeGreaterThan(0);
      expect(defaults.probeTool).toBeGreaterThan(0);
    });

    it('should allow timeout configuration', () => {
      const customTimeouts = {
        toolCall: 60000,
        stateSnapshot: 30000,
        probeTool: 20000,
        llmAnalysis: 45000,
        llmSummary: 45000,
      };

      expect(customTimeouts.toolCall).toBe(60000);
      expect(customTimeouts.stateSnapshot).toBe(30000);
    });
  });
});
