import { describe, it, expect } from 'vitest';
import {
  computeSchemaHash,
  compareSchemas,
  computeConsensusSchemaHash,
} from '../../src/baseline/schema-compare.js';

describe('computeSchemaHash', () => {
  it('should return "empty" for undefined schema', () => {
    expect(computeSchemaHash(undefined)).toBe('empty');
  });

  it('should return consistent hash for same schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    };

    const hash1 = computeSchemaHash(schema);
    const hash2 = computeSchemaHash(schema);
    expect(hash1).toBe(hash2);
  });

  it('should return different hash for different schemas', () => {
    const schema1 = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };

    const schema2 = {
      type: 'object',
      properties: {
        name: { type: 'integer' },
      },
    };

    expect(computeSchemaHash(schema1)).not.toBe(computeSchemaHash(schema2));
  });

  it('should include types in hash', () => {
    const stringSchema = {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
    };

    const intSchema = {
      type: 'object',
      properties: {
        value: { type: 'integer' },
      },
    };

    expect(computeSchemaHash(stringSchema)).not.toBe(computeSchemaHash(intSchema));
  });

  it('should include constraints in hash', () => {
    const schema1 = {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 0 },
      },
    };

    const schema2 = {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 1 },
      },
    };

    expect(computeSchemaHash(schema1)).not.toBe(computeSchemaHash(schema2));
  });

  it('should be order-independent for properties', () => {
    const schema1 = {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'integer' },
      },
    };

    const schema2 = {
      type: 'object',
      properties: {
        b: { type: 'integer' },
        a: { type: 'string' },
      },
    };

    expect(computeSchemaHash(schema1)).toBe(computeSchemaHash(schema2));
  });
});

describe('compareSchemas', () => {
  it('should detect identical schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };

    const result = compareSchemas(schema, schema);
    expect(result.identical).toBe(true);
    expect(result.changes).toHaveLength(0);
  });

  it('should detect property addition', () => {
    const prev = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
    };

    const result = compareSchemas(prev, curr);
    expect(result.identical).toBe(false);
    expect(result.changes.some((c) => c.changeType === 'property_added')).toBe(true);
    expect(result.changes.find((c) => c.changeType === 'property_added')?.path).toBe('age');
  });

  it('should detect property removal as breaking', () => {
    const prev = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };

    const result = compareSchemas(prev, curr);
    expect(result.identical).toBe(false);
    const removal = result.changes.find((c) => c.changeType === 'property_removed');
    expect(removal).toBeDefined();
    expect(removal?.breaking).toBe(true);
  });

  it('should detect type change as breaking', () => {
    const prev = {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        value: { type: 'integer' },
      },
    };

    const result = compareSchemas(prev, curr);
    expect(result.identical).toBe(false);
    const typeChange = result.changes.find((c) => c.changeType === 'type_changed');
    expect(typeChange).toBeDefined();
    expect(typeChange?.breaking).toBe(true);
  });

  it('should detect constraint changes', () => {
    const prev = {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 0 },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 1 },
      },
    };

    const result = compareSchemas(prev, curr);
    expect(result.identical).toBe(false);
    const constraintChange = result.changes.find((c) => c.changeType === 'constraint_changed');
    expect(constraintChange).toBeDefined();
    // Increasing minimum is breaking
    expect(constraintChange?.breaking).toBe(true);
  });

  it('should detect decreasing maximum as breaking', () => {
    const prev = {
      type: 'object',
      properties: {
        size: { type: 'integer', maximum: 100 },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        size: { type: 'integer', maximum: 50 },
      },
    };

    const result = compareSchemas(prev, curr);
    const constraintChange = result.changes.find((c) => c.changeType === 'constraint_changed');
    expect(constraintChange?.breaking).toBe(true);
  });

  it('should detect required field changes', () => {
    const prev = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    };

    const curr = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name', 'age'],
    };

    const result = compareSchemas(prev, curr);
    expect(result.identical).toBe(false);
    const requiredChange = result.changes.find((c) => c.changeType === 'required_changed');
    expect(requiredChange).toBeDefined();
    expect(requiredChange?.breaking).toBe(true);
  });

  it('should detect enum changes', () => {
    const prev = {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
      },
    };

    const result = compareSchemas(prev, curr);
    const enumChange = result.changes.find((c) => c.changeType === 'enum_changed');
    expect(enumChange).toBeDefined();
    // Adding enum values is not breaking
    expect(enumChange?.breaking).toBe(false);
  });

  it('should detect enum value removal as breaking', () => {
    const prev = {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
    };

    const result = compareSchemas(prev, curr);
    const enumChange = result.changes.find((c) => c.changeType === 'enum_changed');
    expect(enumChange?.breaking).toBe(true);
  });

  it('should generate visual diff', () => {
    const prev = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        name: { type: 'integer' },
      },
    };

    const result = compareSchemas(prev, curr);
    expect(result.visualDiff).toContain('Schema Diff');
    expect(result.visualDiff).toContain('name');
    expect(result.visualDiff).toContain('Type changed');
    expect(result.visualDiff).toContain('BREAKING');
  });

  it('should handle nested properties', () => {
    const prev = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'integer' },
          },
        },
      },
    };

    const result = compareSchemas(prev, curr);
    const change = result.changes.find((c) => c.path === 'user.name');
    expect(change).toBeDefined();
  });

  it('should handle array items', () => {
    const prev = {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' } },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'integer' } },
      },
    };

    const result = compareSchemas(prev, curr);
    const change = result.changes.find((c) => c.path === 'items[]');
    expect(change).toBeDefined();
    expect(change?.changeType).toBe('type_changed');
  });

  it('should detect oneOf/anyOf variant changes', () => {
    const prev = {
      type: 'object',
      properties: {
        mode: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        mode: { oneOf: [{ type: 'string' }, { type: 'number' }] },
      },
    };

    const result = compareSchemas(prev, curr);
    const variantChange = result.changes.find((c) => c.path === 'mode.oneOf');
    expect(variantChange).toBeDefined();
    expect(variantChange?.changeType).toBe('constraint_changed');
  });

  it('should detect patternProperties changes', () => {
    const prev = {
      type: 'object',
      properties: {
        metadata: {
          type: 'object',
          patternProperties: {
            '^test': { type: 'string' },
          },
        },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        metadata: {
          type: 'object',
          patternProperties: {
            '^test': { type: 'string' },
            '^x-': { type: 'integer' },
          },
        },
      },
    };

    const result = compareSchemas(prev, curr);
    const added = result.changes.find((c) => c.path === 'metadata{^x-}');
    expect(added).toBeDefined();
    expect(added?.changeType).toBe('property_added');
  });

  it('should detect dependentRequired changes', () => {
    const prev = {
      type: 'object',
      properties: {
        payload: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            userId: { type: 'string' },
          },
          dependentRequired: {
            token: ['userId'],
          },
        },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        payload: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            userId: { type: 'string' },
            role: { type: 'string' },
          },
          dependentRequired: {
            token: ['userId', 'role'],
          },
        },
      },
    };

    const result = compareSchemas(prev, curr);
    const dependentChange = result.changes.find(
      (c) => c.path === 'payload.dependentRequired.token'
    );
    expect(dependentChange).toBeDefined();
    expect(dependentChange?.changeType).toBe('constraint_changed');
    expect(dependentChange?.breaking).toBe(true);
  });

  it('should detect conditional schema changes', () => {
    const prev = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            mode: { type: 'string' },
          },
        },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            mode: { type: 'string' },
            value: { type: 'string' },
          },
          if: {
            properties: {
              mode: { const: 'advanced' },
            },
          },
          then: {
            required: ['value'],
          },
        },
      },
    };

    const result = compareSchemas(prev, curr);
    const conditionalChange = result.changes.find((c) => c.path === 'config.ifThenElse');
    expect(conditionalChange).toBeDefined();
    expect(conditionalChange?.changeType).toBe('constraint_changed');
  });

  it('should detect additionalProperties changes', () => {
    const prev = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          additionalProperties: true,
        },
      },
    };

    const curr = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          additionalProperties: false,
        },
      },
    };

    const result = compareSchemas(prev, curr);
    const change = result.changes.find((c) => c.path === 'config.additionalProperties');
    expect(change).toBeDefined();
    expect(change?.changeType).toBe('constraint_changed');
    expect(change?.breaking).toBe(true);
  });
});

describe('computeConsensusSchemaHash', () => {
  it('should handle empty interactions', () => {
    const result = computeConsensusSchemaHash([]);
    expect(result.hash).toBe('empty');
    expect(result.consistency).toBe(1);
    expect(result.variations).toBe(0);
  });

  it('should compute hash from single interaction', () => {
    const interactions = [{ args: { name: 'test', count: 5 } }];

    const result = computeConsensusSchemaHash(interactions);
    expect(result.hash).not.toBe('empty');
    expect(result.consistency).toBe(1);
    expect(result.variations).toBe(1);
  });

  it('should compute consistent hash from multiple identical interactions', () => {
    const interactions = [
      { args: { name: 'test1', count: 1 } },
      { args: { name: 'test2', count: 2 } },
      { args: { name: 'test3', count: 3 } },
    ];

    const result = computeConsensusSchemaHash(interactions);
    expect(result.consistency).toBe(1);
    expect(result.variations).toBe(1);
  });

  it('should report variations when schemas differ', () => {
    const interactions = [
      { args: { name: 'test' } },
      { args: { name: 'test', count: 5 } },
      { args: { name: 'test' } },
    ];

    const result = computeConsensusSchemaHash(interactions);
    expect(result.variations).toBe(2);
    expect(result.consistency).toBeLessThan(1);
  });

  it('should infer types from values', () => {
    const stringInteractions = [{ args: { value: 'hello' } }];
    const intInteractions = [{ args: { value: 42 } }];

    const stringResult = computeConsensusSchemaHash(stringInteractions);
    const intResult = computeConsensusSchemaHash(intInteractions);

    expect(stringResult.hash).not.toBe(intResult.hash);
  });

  it('should handle nested objects', () => {
    const interactions = [{ args: { user: { name: 'test', age: 30 } } }];

    const result = computeConsensusSchemaHash(interactions);
    expect(result.hash).not.toBe('empty');
  });

  it('should handle arrays', () => {
    const interactions = [{ args: { items: ['a', 'b', 'c'] } }];

    const result = computeConsensusSchemaHash(interactions);
    expect(result.hash).not.toBe('empty');
  });
});

describe('Circular reference protection', () => {
  it('should produce stable hash for circular reference', () => {
    // Create a schema with a circular reference via object mutation
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        parent: {
          type: 'object',
          properties: {},
        },
      },
    };
    // Create circular reference: parent.properties.self = parent
    const parentProp = (schema.properties as Record<string, Record<string, unknown>>).parent;
    (parentProp.properties as Record<string, unknown>).self = parentProp;

    // Should not stack overflow and should return a valid hash
    const hash = computeSchemaHash(schema);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
    expect(hash).not.toBe('empty');
  });

  it('should handle MAX_SCHEMA_DEPTH without stack overflow', () => {
    // Create a deeply nested schema exceeding MAX_SCHEMA_DEPTH (50)
    let schema: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 60; i++) {
      schema = {
        type: 'object',
        properties: {
          nested: schema,
        },
      };
    }

    // Should not stack overflow
    const hash = computeSchemaHash(schema);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });
});

describe('Unicode normalization', () => {
  it('should produce same hash for NFC and NFD equivalent keys', () => {
    // 'café' in NFC vs NFD
    const nfcKey = 'caf\u00E9'; // 'café' NFC (single char é)
    const nfdKey = 'cafe\u0301'; // 'café' NFD (e + combining acute)

    const schema1 = {
      type: 'object',
      properties: { [nfcKey]: { type: 'string' } },
    };
    const schema2 = {
      type: 'object',
      properties: { [nfdKey]: { type: 'string' } },
    };

    expect(computeSchemaHash(schema1)).toBe(computeSchemaHash(schema2));
  });

  it('should normalize Unicode in required array', () => {
    const nfcKey = 'caf\u00E9';
    const nfdKey = 'cafe\u0301';

    const schema1 = {
      type: 'object',
      properties: { [nfcKey]: { type: 'string' } },
      required: [nfcKey],
    };
    const schema2 = {
      type: 'object',
      properties: { [nfdKey]: { type: 'string' } },
      required: [nfdKey],
    };

    expect(computeSchemaHash(schema1)).toBe(computeSchemaHash(schema2));
  });
});

describe('$ref resolution', () => {
  it('should resolve local $ref and include in hash', () => {
    const schemaWithRef = {
      type: 'object',
      properties: {
        address: { type: 'object', properties: { city: { type: 'string' } } },
        shipping: { $ref: '#/properties/address' },
      },
    };

    // Hash should complete without error and be different from schema without $ref
    const hash = computeSchemaHash(schemaWithRef);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);

    // Compare with schema that has inline definition instead of $ref
    const schemaInline = {
      type: 'object',
      properties: {
        address: { type: 'object', properties: { city: { type: 'string' } } },
        shipping: { type: 'object', properties: { city: { type: 'string' } } },
      },
    };

    // The hashes should differ because one uses $ref notation and one uses inline
    const hashInline = computeSchemaHash(schemaInline);
    expect(hash).not.toBe(hashInline);
  });

  it('should gracefully handle invalid $ref', () => {
    const schema = {
      type: 'object',
      properties: {
        broken: { $ref: '#/nonexistent/path' },
      },
    };

    // Should not throw, should produce a valid hash
    const hash = computeSchemaHash(schema);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });
});
