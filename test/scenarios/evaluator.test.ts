import { describe, it, expect } from 'vitest';
import {
  getValueAtPath,
  evaluateAssertion,
  evaluateAssertions,
  formatAssertionResults,
} from '../../src/scenarios/evaluator.js';
import type { ScenarioAssertion } from '../../src/scenarios/types.js';

describe('scenarios/evaluator', () => {
  describe('getValueAtPath', () => {
    it('should get simple property', () => {
      const obj = { name: 'test' };
      expect(getValueAtPath(obj, 'name')).toBe('test');
    });

    it('should get nested property', () => {
      const obj = { result: { value: 42 } };
      expect(getValueAtPath(obj, 'result.value')).toBe(42);
    });

    it('should get array element', () => {
      const obj = { items: ['a', 'b', 'c'] };
      expect(getValueAtPath(obj, 'items[0]')).toBe('a');
      expect(getValueAtPath(obj, 'items[2]')).toBe('c');
    });

    it('should get nested array property', () => {
      const obj = { data: { items: [{ name: 'first' }, { name: 'second' }] } };
      expect(getValueAtPath(obj, 'data.items[0].name')).toBe('first');
      expect(getValueAtPath(obj, 'data.items[1].name')).toBe('second');
    });

    it('should return undefined for missing path', () => {
      const obj = { name: 'test' };
      expect(getValueAtPath(obj, 'missing')).toBeUndefined();
      expect(getValueAtPath(obj, 'name.nested')).toBeUndefined();
    });

    it('should return undefined for null/undefined input', () => {
      expect(getValueAtPath(null, 'path')).toBeUndefined();
      expect(getValueAtPath(undefined, 'path')).toBeUndefined();
    });

    it('should return undefined for empty path', () => {
      expect(getValueAtPath({ name: 'test' }, '')).toBeUndefined();
    });

    it('should handle array index out of bounds', () => {
      const obj = { items: ['a', 'b'] };
      expect(getValueAtPath(obj, 'items[10]')).toBeUndefined();
    });
  });

  describe('evaluateAssertion', () => {
    describe('exists condition', () => {
      it('should pass when value exists', () => {
        const assertion: ScenarioAssertion = { path: 'name', condition: 'exists' };
        const result = evaluateAssertion(assertion, { name: 'test' }, false);
        expect(result.passed).toBe(true);
      });

      it('should fail when value is undefined', () => {
        const assertion: ScenarioAssertion = { path: 'missing', condition: 'exists' };
        const result = evaluateAssertion(assertion, { name: 'test' }, false);
        expect(result.passed).toBe(false);
        expect(result.error).toContain('to exist');
      });

      it('should pass for null value (exists but is null)', () => {
        const assertion: ScenarioAssertion = { path: 'value', condition: 'exists' };
        const result = evaluateAssertion(assertion, { value: null }, false);
        expect(result.passed).toBe(true);
      });
    });

    describe('equals condition', () => {
      it('should pass when values are equal', () => {
        const assertion: ScenarioAssertion = { path: 'count', condition: 'equals', value: 5 };
        const result = evaluateAssertion(assertion, { count: 5 }, false);
        expect(result.passed).toBe(true);
      });

      it('should fail when values differ', () => {
        const assertion: ScenarioAssertion = { path: 'count', condition: 'equals', value: 5 };
        const result = evaluateAssertion(assertion, { count: 10 }, false);
        expect(result.passed).toBe(false);
      });

      it('should compare objects deeply', () => {
        const assertion: ScenarioAssertion = {
          path: 'data',
          condition: 'equals',
          value: { a: 1, b: 2 },
        };
        const result = evaluateAssertion(assertion, { data: { a: 1, b: 2 } }, false);
        expect(result.passed).toBe(true);
      });

      it('should compare arrays', () => {
        const assertion: ScenarioAssertion = {
          path: 'items',
          condition: 'equals',
          value: [1, 2, 3],
        };
        const result = evaluateAssertion(assertion, { items: [1, 2, 3] }, false);
        expect(result.passed).toBe(true);
      });
    });

    describe('contains condition', () => {
      it('should pass when string contains substring', () => {
        const assertion: ScenarioAssertion = {
          path: 'text',
          condition: 'contains',
          value: 'world',
        };
        const result = evaluateAssertion(assertion, { text: 'Hello, world!' }, false);
        expect(result.passed).toBe(true);
      });

      it('should fail when string does not contain substring', () => {
        const assertion: ScenarioAssertion = { path: 'text', condition: 'contains', value: 'foo' };
        const result = evaluateAssertion(assertion, { text: 'Hello, world!' }, false);
        expect(result.passed).toBe(false);
      });

      it('should pass when array contains element', () => {
        const assertion: ScenarioAssertion = { path: 'items', condition: 'contains', value: 'b' };
        const result = evaluateAssertion(assertion, { items: ['a', 'b', 'c'] }, false);
        expect(result.passed).toBe(true);
      });

      it('should fail when array does not contain element', () => {
        const assertion: ScenarioAssertion = { path: 'items', condition: 'contains', value: 'x' };
        const result = evaluateAssertion(assertion, { items: ['a', 'b', 'c'] }, false);
        expect(result.passed).toBe(false);
      });
    });

    describe('truthy condition', () => {
      it('should pass for truthy values', () => {
        const assertion: ScenarioAssertion = { path: 'value', condition: 'truthy' };
        expect(evaluateAssertion(assertion, { value: true }, false).passed).toBe(true);
        expect(evaluateAssertion(assertion, { value: 1 }, false).passed).toBe(true);
        expect(evaluateAssertion(assertion, { value: 'text' }, false).passed).toBe(true);
        expect(evaluateAssertion(assertion, { value: [] }, false).passed).toBe(true);
        expect(evaluateAssertion(assertion, { value: {} }, false).passed).toBe(true);
      });

      it('should fail for falsy values', () => {
        const assertion: ScenarioAssertion = { path: 'value', condition: 'truthy' };
        expect(evaluateAssertion(assertion, { value: false }, false).passed).toBe(false);
        expect(evaluateAssertion(assertion, { value: 0 }, false).passed).toBe(false);
        expect(evaluateAssertion(assertion, { value: '' }, false).passed).toBe(false);
        expect(evaluateAssertion(assertion, { value: null }, false).passed).toBe(false);
      });
    });

    describe('type condition', () => {
      it('should check string type', () => {
        const assertion: ScenarioAssertion = { path: 'value', condition: 'type', value: 'string' };
        expect(evaluateAssertion(assertion, { value: 'text' }, false).passed).toBe(true);
        expect(evaluateAssertion(assertion, { value: 123 }, false).passed).toBe(false);
      });

      it('should check number type', () => {
        const assertion: ScenarioAssertion = { path: 'value', condition: 'type', value: 'number' };
        expect(evaluateAssertion(assertion, { value: 123 }, false).passed).toBe(true);
        expect(evaluateAssertion(assertion, { value: '123' }, false).passed).toBe(false);
      });

      it('should check boolean type', () => {
        const assertion: ScenarioAssertion = { path: 'value', condition: 'type', value: 'boolean' };
        expect(evaluateAssertion(assertion, { value: true }, false).passed).toBe(true);
        expect(evaluateAssertion(assertion, { value: 'true' }, false).passed).toBe(false);
      });

      it('should check array type', () => {
        const assertion: ScenarioAssertion = { path: 'value', condition: 'type', value: 'array' };
        expect(evaluateAssertion(assertion, { value: [1, 2, 3] }, false).passed).toBe(true);
        expect(evaluateAssertion(assertion, { value: { length: 3 } }, false).passed).toBe(false);
      });

      it('should check object type', () => {
        const assertion: ScenarioAssertion = { path: 'value', condition: 'type', value: 'object' };
        expect(evaluateAssertion(assertion, { value: { a: 1 } }, false).passed).toBe(true);
        expect(evaluateAssertion(assertion, { value: [1, 2] }, false).passed).toBe(false);
      });
    });

    describe('not_error condition', () => {
      it('should pass when not an error', () => {
        const assertion: ScenarioAssertion = { path: '', condition: 'not_error' };
        const result = evaluateAssertion(assertion, { data: 'success' }, false);
        expect(result.passed).toBe(true);
      });

      it('should fail when is an error', () => {
        const assertion: ScenarioAssertion = { path: '', condition: 'not_error' };
        const result = evaluateAssertion(assertion, { error: 'failed' }, true);
        expect(result.passed).toBe(false);
      });
    });

    it('should use custom error message', () => {
      const assertion: ScenarioAssertion = {
        path: 'missing',
        condition: 'exists',
        message: 'Custom error message',
      };
      const result = evaluateAssertion(assertion, {}, false);
      expect(result.error).toBe('Custom error message');
    });

    it('should include actual value in result', () => {
      const assertion: ScenarioAssertion = { path: 'count', condition: 'equals', value: 5 };
      const result = evaluateAssertion(assertion, { count: 10 }, false);
      expect(result.actualValue).toBe(10);
    });
  });

  describe('evaluateAssertions', () => {
    it('should evaluate multiple assertions', () => {
      const assertions: ScenarioAssertion[] = [
        { path: 'name', condition: 'exists' },
        { path: 'count', condition: 'equals', value: 5 },
      ];
      const response = { name: 'test', count: 5 };

      const results = evaluateAssertions(assertions, response, false);

      expect(results).toHaveLength(2);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(true);
    });

    it('should handle mixed pass/fail', () => {
      const assertions: ScenarioAssertion[] = [
        { path: 'name', condition: 'exists' },
        { path: 'count', condition: 'equals', value: 10 },
      ];
      const response = { name: 'test', count: 5 };

      const results = evaluateAssertions(assertions, response, false);

      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(false);
    });
  });

  describe('formatAssertionResults', () => {
    it('should format passed assertions with checkmark', () => {
      const results = [
        {
          assertion: { path: 'name', condition: 'exists' as const },
          passed: true,
          actualValue: 'test',
        },
      ];

      const formatted = formatAssertionResults(results);

      expect(formatted).toContain('[PASS]');
      expect(formatted).toContain('name');
      expect(formatted).toContain('exists');
    });

    it('should format failed assertions with X and error', () => {
      const results = [
        {
          assertion: { path: 'count', condition: 'equals' as const, value: 5 },
          passed: false,
          actualValue: 10,
          error: 'Expected 10 to equal 5',
        },
      ];

      const formatted = formatAssertionResults(results);

      expect(formatted).toContain('[FAIL]');
      expect(formatted).toContain('count');
      expect(formatted).toContain('Expected 10 to equal 5');
    });
  });
});
