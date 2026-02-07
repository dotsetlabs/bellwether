/**
 * Tests for response fingerprinting (structural drift detection).
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeResponses,
  inferSchemaFromValue,
  compareFingerprints,
  compareErrorPatterns,
  computeInferredSchemaHash,
  type ResponseFingerprint,
  type ErrorPattern,
} from '../../src/baseline/response-fingerprint.js';
import type { MCPToolCallResult } from '../../src/transport/types.js';

// Helper to create MCP tool call results
function createTextResponse(text: string, isError = false): MCPToolCallResult {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

function createJsonResponse(data: unknown, isError = false): MCPToolCallResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    isError,
  };
}

function createEmptyResponse(): MCPToolCallResult {
  return {
    content: [],
    isError: false,
  };
}

function createMultiContentResponse(texts: string[]): MCPToolCallResult {
  return {
    content: texts.map((text) => ({ type: 'text' as const, text })),
    isError: false,
  };
}

describe('analyzeResponses', () => {
  describe('basic response analysis', () => {
    it('should analyze simple text responses', () => {
      const responses = [
        { response: createTextResponse('Hello, world!'), error: null },
        { response: createTextResponse('Another response'), error: null },
      ];

      const analysis = analyzeResponses(responses);

      expect(analysis.fingerprint.contentType).toBe('text');
      expect(analysis.fingerprint.isEmpty).toBe(false);
      expect(analysis.fingerprint.sampleCount).toBe(2);
      expect(analysis.isConsistent).toBe(true);
    });

    it('should analyze JSON object responses', () => {
      const responses = [
        { response: createJsonResponse({ name: 'test', value: 123 }), error: null },
        { response: createJsonResponse({ name: 'other', value: 456 }), error: null },
      ];

      const analysis = analyzeResponses(responses);

      expect(analysis.fingerprint.contentType).toBe('object');
      expect(analysis.fingerprint.fields).toEqual(['name', 'value']);
      expect(analysis.fingerprint.isEmpty).toBe(false);
      expect(analysis.isConsistent).toBe(true);
      expect(analysis.inferredSchema).toBeDefined();
      expect(analysis.inferredSchema?.type).toBe('object');
    });

    it('should analyze JSON array responses', () => {
      const responses = [
        { response: createJsonResponse([{ id: 1 }, { id: 2 }]), error: null },
        { response: createJsonResponse([{ id: 3 }]), error: null },
      ];

      const analysis = analyzeResponses(responses);

      expect(analysis.fingerprint.contentType).toBe('array');
      expect(analysis.fingerprint.arrayItemStructure).toBeDefined();
      expect(analysis.fingerprint.isEmpty).toBe(false);
    });

    it('should handle empty responses', () => {
      const responses = [{ response: createEmptyResponse(), error: null }];

      const analysis = analyzeResponses(responses);

      expect(analysis.fingerprint.isEmpty).toBe(true);
      expect(analysis.fingerprint.contentType).toBe('empty');
    });

    it('should handle null/undefined responses', () => {
      const responses = [
        { response: null, error: null },
        { response: null, error: null },
      ];

      const analysis = analyzeResponses(responses);

      expect(analysis.fingerprint.sampleCount).toBe(0);
      expect(analysis.fingerprint.isEmpty).toBe(true);
    });
  });

  describe('structure consistency', () => {
    it('should detect consistent structure across samples', () => {
      const responses = [
        { response: createJsonResponse({ a: 1, b: 'x' }), error: null },
        { response: createJsonResponse({ a: 2, b: 'y' }), error: null },
        { response: createJsonResponse({ a: 3, b: 'z' }), error: null },
      ];

      const analysis = analyzeResponses(responses);

      expect(analysis.isConsistent).toBe(true);
      expect(analysis.fingerprint.confidence).toBe(1);
    });

    it('should detect inconsistent structure across samples', () => {
      const responses = [
        { response: createJsonResponse({ a: 1 }), error: null },
        { response: createJsonResponse({ b: 2 }), error: null },
        { response: createJsonResponse({ c: 3 }), error: null },
      ];

      const analysis = analyzeResponses(responses);

      expect(analysis.isConsistent).toBe(false);
      expect(analysis.fingerprint.confidence).toBeLessThan(1);
    });

    it('should handle mixed successful and error responses', () => {
      const responses = [
        { response: createJsonResponse({ result: 'ok' }), error: null },
        {
          response: createTextResponse('Error: something failed', true),
          error: 'Error: something failed',
        },
        { response: createJsonResponse({ result: 'ok' }), error: null },
      ];

      const analysis = analyzeResponses(responses);

      // Fingerprint should be based on successful responses
      expect(analysis.fingerprint.contentType).toBe('object');
      expect(analysis.errorPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('response size classification', () => {
    it('should classify tiny responses', () => {
      const responses = [{ response: createTextResponse('OK'), error: null }];

      const analysis = analyzeResponses(responses);
      expect(analysis.fingerprint.size).toBe('tiny');
    });

    it('should classify small responses', () => {
      const responses = [{ response: createTextResponse('x'.repeat(500)), error: null }];

      const analysis = analyzeResponses(responses);
      expect(analysis.fingerprint.size).toBe('small');
    });

    it('should classify medium responses', () => {
      const responses = [{ response: createTextResponse('x'.repeat(5000)), error: null }];

      const analysis = analyzeResponses(responses);
      expect(analysis.fingerprint.size).toBe('medium');
    });

    it('should classify large responses', () => {
      const responses = [{ response: createTextResponse('x'.repeat(15000)), error: null }];

      const analysis = analyzeResponses(responses);
      expect(analysis.fingerprint.size).toBe('large');
    });
  });

  describe('string subtype detection', () => {
    it('should detect date strings', () => {
      const responses = [
        { response: createJsonResponse({ date: '2024-01-15T10:30:00Z' }), error: null },
      ];

      const analysis = analyzeResponses(responses);
      expect(analysis.fingerprint.structureHash).toBeDefined();
    });

    it('should detect URL strings', () => {
      const responses = [
        { response: createJsonResponse({ url: 'https://example.com/path' }), error: null },
      ];

      const analysis = analyzeResponses(responses);
      expect(analysis.fingerprint.structureHash).toBeDefined();
    });

    it('should detect UUID strings', () => {
      const responses = [
        {
          response: createJsonResponse({ id: '550e8400-e29b-41d4-a716-446655440000' }),
          error: null,
        },
      ];

      const analysis = analyzeResponses(responses);
      expect(analysis.fingerprint.structureHash).toBeDefined();
    });

    it('should detect email strings', () => {
      const responses = [
        { response: createJsonResponse({ email: 'user@example.com' }), error: null },
      ];

      const analysis = analyzeResponses(responses);
      expect(analysis.fingerprint.structureHash).toBeDefined();
    });
  });

  describe('error pattern analysis', () => {
    it('should extract validation error patterns', () => {
      const responses = [
        { response: null, error: 'Invalid parameter: missing required field "name"' },
        { response: null, error: 'Invalid parameter: missing required field "email"' },
      ];

      const analysis = analyzeResponses(responses);

      expect(analysis.errorPatterns.length).toBeGreaterThan(0);
      expect(analysis.errorPatterns[0].category).toBe('validation');
    });

    it('should extract not_found error patterns', () => {
      const responses = [
        { response: null, error: 'Resource not found: /users/123' },
        { response: null, error: 'User does not exist' },
      ];

      const analysis = analyzeResponses(responses);

      const notFoundPatterns = analysis.errorPatterns.filter((p) => p.category === 'not_found');
      expect(notFoundPatterns.length).toBeGreaterThan(0);
    });

    it('should extract permission error patterns', () => {
      const responses = [
        { response: null, error: 'Permission denied: insufficient privileges' },
        { response: null, error: 'Access denied to resource' },
      ];

      const analysis = analyzeResponses(responses);

      const permissionPatterns = analysis.errorPatterns.filter((p) => p.category === 'permission');
      expect(permissionPatterns.length).toBeGreaterThan(0);
    });

    it('should extract timeout error patterns', () => {
      const responses = [{ response: null, error: 'Operation timed out after 30s' }];

      const analysis = analyzeResponses(responses);

      const timeoutPatterns = analysis.errorPatterns.filter((p) => p.category === 'timeout');
      expect(timeoutPatterns.length).toBe(1);
    });

    it('should extract internal error patterns', () => {
      const responses = [{ response: null, error: 'Internal server error occurred' }];

      const analysis = analyzeResponses(responses);

      const internalPatterns = analysis.errorPatterns.filter((p) => p.category === 'internal');
      expect(internalPatterns.length).toBe(1);
    });

    it('should normalize error patterns by stripping specific values', () => {
      const responses = [
        {
          response: null,
          error: 'User 550e8400-e29b-41d4-a716-446655440000 not found at /api/users/123',
        },
        {
          response: null,
          error: 'User 12345678-1234-1234-1234-123456789012 not found at /api/users/456',
        },
      ];

      const analysis = analyzeResponses(responses);

      // Both errors should normalize to the same pattern
      expect(analysis.errorPatterns.length).toBe(1);
      expect(analysis.errorPatterns[0].count).toBe(2);
    });

    it('should count error pattern occurrences', () => {
      const responses = [
        { response: null, error: 'Invalid input' },
        { response: null, error: 'Invalid input' },
        { response: null, error: 'Invalid input' },
      ];

      const analysis = analyzeResponses(responses);

      expect(analysis.errorPatterns[0].count).toBe(3);
    });
  });

  describe('multi-content responses', () => {
    it('should handle responses with multiple content blocks', () => {
      const responses = [
        { response: createMultiContentResponse(['Part 1', 'Part 2']), error: null },
      ];

      const analysis = analyzeResponses(responses);

      expect(analysis.fingerprint.contentType).toBe('array');
      expect(analysis.fingerprint.isEmpty).toBe(false);
    });
  });

  describe('deeply nested structures', () => {
    it('should handle deeply nested objects', () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'deep',
                },
              },
            },
          },
        },
      };

      const responses = [{ response: createJsonResponse(deepObject), error: null }];

      const analysis = analyzeResponses(responses);

      expect(analysis.fingerprint.contentType).toBe('object');
      expect(analysis.fingerprint.structureHash).toBeDefined();
    });

    it('should limit recursion depth to prevent stack overflow', () => {
      // Create very deep nesting (beyond limit)
      let deepObject: Record<string, unknown> = { value: 'bottom' };
      for (let i = 0; i < 15; i++) {
        deepObject = { nested: deepObject };
      }

      const responses = [{ response: createJsonResponse(deepObject), error: null }];

      // Should not throw
      expect(() => analyzeResponses(responses)).not.toThrow();
    });
  });
});

describe('inferSchemaFromValue', () => {
  it('should infer string schema', () => {
    const schema = inferSchemaFromValue('hello');
    expect(schema.type).toBe('string');
  });

  it('should infer integer schema', () => {
    const schema = inferSchemaFromValue(42);
    expect(schema.type).toBe('integer');
  });

  it('should infer number schema for floats', () => {
    const schema = inferSchemaFromValue(3.14);
    expect(schema.type).toBe('number');
  });

  it('should infer boolean schema', () => {
    const schema = inferSchemaFromValue(true);
    expect(schema.type).toBe('boolean');
  });

  it('should infer null schema', () => {
    const schema = inferSchemaFromValue(null);
    expect(schema.type).toBe('null');
    expect(schema.nullable).toBe(true);
  });

  it('should infer undefined schema', () => {
    const schema = inferSchemaFromValue(undefined);
    expect(schema.type).toBe('undefined');
    expect(schema.nullable).toBe(true);
  });

  it('should infer object schema with properties', () => {
    const schema = inferSchemaFromValue({ name: 'test', count: 5 });

    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
    expect(schema.properties?.name.type).toBe('string');
    expect(schema.properties?.count.type).toBe('integer');
    expect(schema.required).toContain('name');
    expect(schema.required).toContain('count');
  });

  it('should infer array schema with item type', () => {
    const schema = inferSchemaFromValue([1, 2, 3]);

    expect(schema.type).toBe('array');
    expect(schema.items).toBeDefined();
    expect(schema.items?.type).toBe('integer');
  });

  it('should infer empty array schema', () => {
    const schema = inferSchemaFromValue([]);

    expect(schema.type).toBe('array');
    expect(schema.items).toBeUndefined();
  });

  it('should infer schema for array of objects', () => {
    const schema = inferSchemaFromValue([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);

    expect(schema.type).toBe('array');
    expect(schema.items?.type).toBe('object');
    expect(schema.items?.properties?.id.type).toBe('integer');
    expect(schema.items?.properties?.name.type).toBe('string');
  });

  it('should handle nested objects', () => {
    const schema = inferSchemaFromValue({
      user: {
        profile: {
          email: 'test@example.com',
        },
      },
    });

    expect(schema.type).toBe('object');
    expect(schema.properties?.user.type).toBe('object');
    expect(schema.properties?.user.properties?.profile.type).toBe('object');
    expect(schema.properties?.user.properties?.profile.properties?.email.type).toBe('string');
  });
});

describe('compareFingerprints', () => {
  const baseFingerprint: ResponseFingerprint = {
    structureHash: 'abc123',
    contentType: 'object',
    fields: ['id', 'name', 'status'],
    size: 'small',
    isEmpty: false,
    sampleCount: 5,
    confidence: 1,
  };

  it('should return identical for same fingerprints', () => {
    const diff = compareFingerprints(baseFingerprint, { ...baseFingerprint });

    expect(diff.identical).toBe(true);
    expect(diff.changes).toHaveLength(0);
    expect(diff.significance).toBe('none');
  });

  it('should detect structure hash changes', () => {
    const modified = { ...baseFingerprint, structureHash: 'xyz789' };
    const diff = compareFingerprints(baseFingerprint, modified);

    expect(diff.identical).toBe(false);
    expect(diff.changes).toContainEqual(
      expect.objectContaining({
        aspect: 'structure',
        breaking: true,
      })
    );
    expect(diff.significance).toBe('high');
  });

  it('should detect content type changes', () => {
    const modified: ResponseFingerprint = { ...baseFingerprint, contentType: 'array' };
    const diff = compareFingerprints(baseFingerprint, modified);

    expect(diff.identical).toBe(false);
    expect(diff.changes).toContainEqual(
      expect.objectContaining({
        aspect: 'content_type',
        breaking: true,
      })
    );
  });

  it('should detect added fields (non-breaking)', () => {
    const modified = { ...baseFingerprint, fields: ['id', 'name', 'status', 'newField'] };
    const diff = compareFingerprints(baseFingerprint, modified);

    expect(diff.identical).toBe(false);
    const addedFieldChange = diff.changes.find(
      (c) => c.aspect === 'fields' && c.description.includes('added')
    );
    expect(addedFieldChange).toBeDefined();
    expect(addedFieldChange?.breaking).toBe(false);
  });

  it('should detect removed fields (breaking)', () => {
    const modified = { ...baseFingerprint, fields: ['id', 'name'] };
    const diff = compareFingerprints(baseFingerprint, modified);

    expect(diff.identical).toBe(false);
    const removedFieldChange = diff.changes.find(
      (c) => c.aspect === 'fields' && c.description.includes('removed')
    );
    expect(removedFieldChange).toBeDefined();
    expect(removedFieldChange?.breaking).toBe(true);
  });

  it('should detect emptiness changes (becoming empty IS breaking)', () => {
    // baseFingerprint has isEmpty: false, modified has isEmpty: true
    // When response goes from returning data to empty, that's breaking (consumers lose data)
    const modified = { ...baseFingerprint, isEmpty: true };
    const diff = compareFingerprints(baseFingerprint, modified);

    expect(diff.identical).toBe(false);
    expect(diff.changes).toContainEqual(
      expect.objectContaining({
        aspect: 'emptiness',
        breaking: true, // becoming empty IS breaking (losing data)
      })
    );
  });

  it('should detect emptiness changes (becoming non-empty is not breaking)', () => {
    // empty has isEmpty: true, baseFingerprint has isEmpty: false
    // When response goes from empty to returning data, that's not breaking
    const empty = { ...baseFingerprint, isEmpty: true };
    const diff = compareFingerprints(empty, baseFingerprint);

    const emptinessChange = diff.changes.find((c) => c.aspect === 'emptiness');
    expect(emptinessChange?.breaking).toBe(false); // becoming non-empty is NOT breaking
  });

  it('should detect array item structure changes', () => {
    const arrayFp: ResponseFingerprint = {
      ...baseFingerprint,
      contentType: 'array',
      arrayItemStructure: 'struct123',
    };
    const modified = { ...arrayFp, arrayItemStructure: 'struct456' };
    const diff = compareFingerprints(arrayFp, modified);

    expect(diff.changes).toContainEqual(
      expect.objectContaining({
        aspect: 'array_items',
        breaking: true,
      })
    );
  });

  it('should handle missing previous fingerprint', () => {
    const diff = compareFingerprints(undefined, baseFingerprint);

    expect(diff.identical).toBe(false);
    expect(diff.significance).toBe('low');
    expect(diff.changes[0].description).toContain('added');
  });

  it('should handle missing current fingerprint', () => {
    const diff = compareFingerprints(baseFingerprint, undefined);

    expect(diff.identical).toBe(false);
    expect(diff.changes[0].description).toContain('removed');
  });

  it('should handle both fingerprints missing', () => {
    const diff = compareFingerprints(undefined, undefined);

    expect(diff.identical).toBe(true);
    expect(diff.significance).toBe('none');
  });

  it('should calculate significance correctly', () => {
    // High significance: breaking + structure change
    const structureChange = { ...baseFingerprint, structureHash: 'different' };
    expect(compareFingerprints(baseFingerprint, structureChange).significance).toBe('high');

    // Medium significance: breaking without structure change
    const removedField = { ...baseFingerprint, fields: ['id'] };
    expect(compareFingerprints(baseFingerprint, removedField).significance).toBe('medium');

    // Low significance: non-breaking changes only
    const addedField = { ...baseFingerprint, fields: ['id', 'name', 'status', 'extra'] };
    expect(compareFingerprints(baseFingerprint, addedField).significance).toBe('low');
  });
});

describe('compareErrorPatterns', () => {
  const basePatterns: ErrorPattern[] = [
    { category: 'validation', patternHash: 'hash1', example: 'Invalid input', count: 3 },
    { category: 'not_found', patternHash: 'hash2', example: 'Not found', count: 2 },
  ];

  it('should detect no changes when patterns are the same', () => {
    const diff = compareErrorPatterns(basePatterns, [...basePatterns]);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.behaviorChanged).toBe(false);
  });

  it('should detect added error patterns', () => {
    const newPatterns: ErrorPattern[] = [
      ...basePatterns,
      { category: 'timeout', patternHash: 'hash3', example: 'Timed out', count: 1 },
    ];

    const diff = compareErrorPatterns(basePatterns, newPatterns);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].category).toBe('timeout');
    expect(diff.behaviorChanged).toBe(true);
  });

  it('should detect removed error patterns', () => {
    const reducedPatterns = [basePatterns[0]];

    const diff = compareErrorPatterns(basePatterns, reducedPatterns);

    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].category).toBe('not_found');
    expect(diff.behaviorChanged).toBe(true);
  });

  it('should handle undefined previous patterns', () => {
    const diff = compareErrorPatterns(undefined, basePatterns);

    expect(diff.added).toEqual(basePatterns);
    expect(diff.removed).toHaveLength(0);
    expect(diff.behaviorChanged).toBe(true);
  });

  it('should handle undefined current patterns', () => {
    const diff = compareErrorPatterns(basePatterns, undefined);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toEqual(basePatterns);
    expect(diff.behaviorChanged).toBe(true);
  });

  it('should handle both patterns undefined', () => {
    const diff = compareErrorPatterns(undefined, undefined);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.behaviorChanged).toBe(false);
  });
});

describe('computeInferredSchemaHash', () => {
  it('should return "empty" for undefined schema', () => {
    expect(computeInferredSchemaHash(undefined)).toBe('empty');
  });

  it('should return consistent hash for same schema', () => {
    const schema = inferSchemaFromValue({ id: 1, name: 'test' });

    const hash1 = computeInferredSchemaHash(schema);
    const hash2 = computeInferredSchemaHash(schema);

    expect(hash1).toBe(hash2);
  });

  it('should return different hash for different schemas', () => {
    const schema1 = inferSchemaFromValue({ id: 1 });
    const schema2 = inferSchemaFromValue({ name: 'test' });

    expect(computeInferredSchemaHash(schema1)).not.toBe(computeInferredSchemaHash(schema2));
  });

  it('should produce same hash regardless of property order', () => {
    const schema1 = inferSchemaFromValue({ a: 1, b: 2, c: 3 });
    const schema2 = inferSchemaFromValue({ c: 3, a: 1, b: 2 });

    expect(computeInferredSchemaHash(schema1)).toBe(computeInferredSchemaHash(schema2));
  });

  it('should handle nullable schemas', () => {
    const schema = { type: 'string', nullable: true };
    const hash = computeInferredSchemaHash(schema);

    expect(hash).toBeDefined();
    expect(hash).not.toBe('empty');
  });
});

describe('edge cases and error handling', () => {
  it('should handle primitive JSON values', () => {
    const responses = [{ response: createJsonResponse(42), error: null }];

    const analysis = analyzeResponses(responses);
    expect(analysis.fingerprint.contentType).toBe('primitive');
  });

  it('should handle boolean JSON values', () => {
    const responses = [{ response: createJsonResponse(true), error: null }];

    const analysis = analyzeResponses(responses);
    expect(analysis.fingerprint.contentType).toBe('primitive');
  });

  it('should handle empty string responses', () => {
    const responses = [{ response: createTextResponse(''), error: null }];

    const analysis = analyzeResponses(responses);
    expect(analysis.fingerprint.isEmpty).toBe(true);
    expect(analysis.fingerprint.contentType).toBe('empty');
  });

  it('should handle whitespace-only string responses', () => {
    const responses = [{ response: createTextResponse('   \n\t  '), error: null }];

    const analysis = analyzeResponses(responses);
    expect(analysis.fingerprint.isEmpty).toBe(true);
  });

  it('should handle empty object responses', () => {
    const responses = [{ response: createJsonResponse({}), error: null }];

    const analysis = analyzeResponses(responses);
    expect(analysis.fingerprint.isEmpty).toBe(true);
  });

  it('should handle empty array responses', () => {
    const responses = [{ response: createJsonResponse([]), error: null }];

    const analysis = analyzeResponses(responses);
    expect(analysis.fingerprint.isEmpty).toBe(true);
  });

  it('should handle responses with isError flag', () => {
    const responses = [
      { response: createTextResponse('Error: something went wrong', true), error: null },
    ];

    const analysis = analyzeResponses(responses);
    expect(analysis.errorPatterns.length).toBeGreaterThan(0);
  });

  it('should handle malformed JSON in text content', () => {
    const responses = [{ response: createTextResponse('{ invalid json }'), error: null }];

    // Should not throw, should treat as plain text
    const analysis = analyzeResponses(responses);
    expect(analysis.fingerprint.contentType).toBe('text');
  });

  it('should handle arrays with mixed item types', () => {
    const responses = [{ response: createJsonResponse([1, 'two', { three: 3 }]), error: null }];

    const analysis = analyzeResponses(responses);
    expect(analysis.fingerprint.contentType).toBe('array');
  });

  it('should handle homogeneous arrays correctly', () => {
    const responses = [
      { response: createJsonResponse([{ a: 1 }, { a: 2 }, { a: 3 }]), error: null },
    ];

    const analysis = analyzeResponses(responses);
    expect(analysis.fingerprint.contentType).toBe('array');
    expect(analysis.inferredSchema?.items?.type).toBe('object');
  });
});
