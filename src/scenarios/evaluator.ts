/**
 * Scenario assertion evaluator.
 *
 * Evaluates assertions against tool/prompt responses.
 */

import type { ScenarioAssertion, AssertionResult } from './types.js';
import { getValueAtPath } from '../utils/jsonpath.js';

// Re-export for backwards compatibility
export { getValueAtPath };

/**
 * Evaluate a single assertion against a response.
 */
export function evaluateAssertion(
  assertion: ScenarioAssertion,
  response: unknown,
  isError: boolean
): AssertionResult {
  const actualValue = getValueAtPath(response, assertion.path);

  try {
    switch (assertion.condition) {
      case 'exists':
        return {
          assertion,
          passed: actualValue !== undefined,
          actualValue,
          error:
            actualValue === undefined
              ? assertion.message ?? `Expected path "${assertion.path}" to exist`
              : undefined,
        };

      case 'equals': {
        const isEqual = JSON.stringify(actualValue) === JSON.stringify(assertion.value);
        return {
          assertion,
          passed: isEqual,
          actualValue,
          error: isEqual
            ? undefined
            : assertion.message ??
              `Expected ${JSON.stringify(actualValue)} to equal ${JSON.stringify(assertion.value)}`,
        };
      }

      case 'contains': {
        let containsValue = false;
        if (typeof actualValue === 'string' && typeof assertion.value === 'string') {
          containsValue = actualValue.includes(assertion.value);
        } else if (Array.isArray(actualValue)) {
          containsValue = actualValue.some(
            (item) => JSON.stringify(item) === JSON.stringify(assertion.value)
          );
        }
        return {
          assertion,
          passed: containsValue,
          actualValue,
          error: containsValue
            ? undefined
            : assertion.message ??
              `Expected ${JSON.stringify(actualValue)} to contain ${JSON.stringify(assertion.value)}`,
        };
      }

      case 'truthy': {
        const isTruthy = Boolean(actualValue);
        return {
          assertion,
          passed: isTruthy,
          actualValue,
          error: isTruthy
            ? undefined
            : assertion.message ?? `Expected path "${assertion.path}" to be truthy`,
        };
      }

      case 'type': {
        let actualType: string;
        if (Array.isArray(actualValue)) {
          actualType = 'array';
        } else if (actualValue === null) {
          actualType = 'null';
        } else {
          actualType = typeof actualValue;
        }
        const typeMatches = actualType === assertion.value;
        return {
          assertion,
          passed: typeMatches,
          actualValue,
          error: typeMatches
            ? undefined
            : assertion.message ??
              `Expected type "${assertion.value}" but got "${actualType}"`,
        };
      }

      case 'not_error':
        return {
          assertion,
          passed: !isError,
          actualValue: isError,
          error: isError
            ? assertion.message ?? 'Expected response to not be an error'
            : undefined,
        };

      default:
        return {
          assertion,
          passed: false,
          actualValue,
          error: `Unknown assertion condition: ${(assertion as ScenarioAssertion).condition}`,
        };
    }
  } catch (error) {
    return {
      assertion,
      passed: false,
      actualValue,
      error: `Assertion evaluation error: ${(error as Error).message}`,
    };
  }
}

/**
 * Evaluate all assertions for a response.
 */
export function evaluateAssertions(
  assertions: ScenarioAssertion[],
  response: unknown,
  isError: boolean
): AssertionResult[] {
  return assertions.map((assertion) => evaluateAssertion(assertion, response, isError));
}

/**
 * Format assertion results for display.
 */
export function formatAssertionResults(results: AssertionResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    const status = result.passed ? '✓' : '✗';
    const condition = result.assertion.condition;
    const path = result.assertion.path;

    if (result.passed) {
      lines.push(`  ${status} ${path} ${condition}`);
    } else {
      lines.push(`  ${status} ${path} ${condition}: ${result.error}`);
    }
  }

  return lines.join('\n');
}
