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
 * MCP tool call result structure.
 * Mirrors the MCPToolCallResult type from transport/types.ts.
 */
interface MCPToolCallResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/**
 * Extract and parse the actual response content from an MCP tool call result.
 *
 * MCP returns responses in this format:
 * {
 *   content: [{ type: 'text', text: '{"success": true, ...}' }],
 *   isError: false
 * }
 *
 * This function extracts the JSON from content[0].text and parses it,
 * allowing assertions to check paths like 'success' and 'note.id' directly.
 *
 * For error responses (isError: true), returns an object with:
 * { error: true, message: "...", isError: true }
 *
 * Falls back to returning the original response if:
 * - Response is not an MCP tool call result
 * - No text content found
 * - Text is not valid JSON (for success responses)
 */
export function extractResponseContent(response: unknown): unknown {
  // Handle null/undefined
  if (response === null || response === undefined) {
    return response;
  }

  // Check if this looks like an MCP tool call result
  if (typeof response === 'object' && 'content' in (response as object)) {
    const mcpResult = response as MCPToolCallResult;

    // Find text content
    const textContent = mcpResult.content?.find((c) => c.type === 'text' && c.text);

    // If this is an error response, wrap the message in an error object
    // This allows assertions like { path: 'error', condition: 'exists' } to work
    if (mcpResult.isError) {
      const errorMessage = textContent?.text ?? 'Unknown error';
      return {
        error: true,
        message: errorMessage,
        isError: true,
      };
    }

    // For success responses, try to parse JSON
    if (textContent?.text) {
      try {
        // Try to parse as JSON
        const parsed = JSON.parse(textContent.text);
        return parsed;
      } catch {
        // Not valid JSON, return the raw text
        return textContent.text;
      }
    }
  }

  // Not an MCP response, return as-is
  return response;
}

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
 *
 * Automatically extracts and parses JSON content from MCP tool call results.
 * This allows assertions to check paths like 'success', 'note.id' directly
 * rather than needing to navigate through 'content[0].text'.
 *
 * When isError is true and response is null/undefined (MCP threw an exception),
 * creates an error object to allow assertions like { path: 'error', condition: 'exists' }
 * to pass for error handling test cases.
 */
export function evaluateAssertions(
  assertions: ScenarioAssertion[],
  response: unknown,
  isError: boolean
): AssertionResult[] {
  // Handle the case where MCP threw an exception (response is null but isError is true)
  // This allows error handling test cases to verify that errors occur
  if (isError && (response === null || response === undefined)) {
    const errorResponse = {
      error: true,
      isError: true,
      message: 'MCP protocol error occurred',
    };
    return assertions.map((assertion) => evaluateAssertion(assertion, errorResponse, isError));
  }

  // Extract actual content from MCP response wrapper
  const extractedResponse = extractResponseContent(response);
  return assertions.map((assertion) => evaluateAssertion(assertion, extractedResponse, isError));
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
