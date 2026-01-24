import { describe, it, expect } from 'vitest';
import { inferResponseSchema } from '../../src/interview/schema-inferrer.js';
import { validateResponseAssertions } from '../../src/interview/response-validator.js';
import type { MCPToolCallResult } from '../../src/transport/types.js';

describe('response-validator', () => {
  it('infers JSON schema and validates assertions', () => {
    const response: MCPToolCallResult = {
      content: [{ type: 'text', text: JSON.stringify({ id: 'abc', status: 'ok' }) }],
    };

    const schema = inferResponseSchema(response);
    expect(schema?.inferredType).toBe('json');

    const results = validateResponseAssertions(response, schema ?? undefined);
    expect(results.some((r) => r.type === 'is_json' && r.passed)).toBe(true);
    expect(results.some((r) => r.type === 'contains_fields' && r.passed)).toBe(true);
  });

  it('detects missing fields', () => {
    const expected: MCPToolCallResult = {
      content: [{ type: 'text', text: JSON.stringify({ id: 'abc', status: 'ok' }) }],
    };
    const actual: MCPToolCallResult = {
      content: [{ type: 'text', text: JSON.stringify({ status: 'ok' }) }],
    };

    const schema = inferResponseSchema(expected);
    const results = validateResponseAssertions(actual, schema ?? undefined);
    const containsFields = results.find((r) => r.type === 'contains_fields');
    expect(containsFields?.passed).toBe(false);
  });

  it('handles markdown structure', () => {
    const response: MCPToolCallResult = {
      content: [{ type: 'text', text: '# Title\n\n```js\nconsole.log("hi");\n```' }],
    };
    const schema = inferResponseSchema(response);
    expect(schema?.inferredType).toBe('markdown');
    const results = validateResponseAssertions(response, schema ?? undefined);
    expect(results.length).toBeGreaterThan(0);
  });
});
