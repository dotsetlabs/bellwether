/**
 * Tests for response schema evolution tracking.
 */

import { describe, it, expect } from 'vitest';
import {
  compareInferredSchemas,
  buildSchemaEvolution,
  compareSchemaEvolution,
  formatSchemaEvolution,
  formatSchemaEvolutionDiff,
  hasSchemaEvolutionIssues,
  getSchemaStabilityGrade,
  type ResponseSchemaEvolution,
  type SchemaEvolutionDiff,
} from '../../src/baseline/response-schema-tracker.js';
import type { InferredSchema } from '../../src/baseline/response-fingerprint.js';
import { SCHEMA_EVOLUTION } from '../../src/constants.js';

// Helper to create a simple inferred schema
function createSchema(props: Record<string, string>, required?: string[]): InferredSchema {
  const properties: Record<string, { type: string }> = {};
  for (const [name, type] of Object.entries(props)) {
    properties[name] = { type };
  }
  return {
    type: 'object',
    properties,
    required: required ?? Object.keys(props),
  };
}

describe('compareInferredSchemas', () => {
  describe('basic comparisons', () => {
    it('should return empty diff for identical schemas', () => {
      const schema = createSchema({ id: 'integer', name: 'string' });
      const diff = compareInferredSchemas(schema, schema);

      expect(diff.structureChanged).toBe(false);
      expect(diff.fieldsAdded).toHaveLength(0);
      expect(diff.fieldsRemoved).toHaveLength(0);
      expect(diff.typeChanges).toHaveLength(0);
      expect(diff.isBreaking).toBe(false);
      expect(diff.backwardCompatible).toBe(true);
    });

    it('should detect added fields', () => {
      const previous = createSchema({ id: 'integer' });
      const current = createSchema({ id: 'integer', name: 'string' });
      const diff = compareInferredSchemas(previous, current);

      expect(diff.structureChanged).toBe(true);
      expect(diff.fieldsAdded).toContain('name');
      expect(diff.fieldsRemoved).toHaveLength(0);
      expect(diff.backwardCompatible).toBe(true);
      expect(diff.isBreaking).toBe(false);
    });

    it('should detect removed fields as breaking', () => {
      const previous = createSchema({ id: 'integer', name: 'string' });
      const current = createSchema({ id: 'integer' });
      const diff = compareInferredSchemas(previous, current);

      expect(diff.structureChanged).toBe(true);
      expect(diff.fieldsRemoved).toContain('name');
      expect(diff.fieldsAdded).toHaveLength(0);
      expect(diff.backwardCompatible).toBe(false);
      expect(diff.isBreaking).toBe(true);
    });

    it('should detect type changes', () => {
      const previous = createSchema({ id: 'integer', value: 'string' });
      const current = createSchema({ id: 'integer', value: 'number' });
      const diff = compareInferredSchemas(previous, current);

      expect(diff.structureChanged).toBe(true);
      expect(diff.typeChanges).toHaveLength(1);
      expect(diff.typeChanges[0].field).toBe('value');
      expect(diff.typeChanges[0].previousType).toBe('string');
      expect(diff.typeChanges[0].currentType).toBe('number');
    });
  });

  describe('required field changes', () => {
    it('should detect new required fields as breaking', () => {
      const previous = createSchema({ id: 'integer', name: 'string' }, ['id']);
      const current = createSchema({ id: 'integer', name: 'string' }, ['id', 'name']);
      const diff = compareInferredSchemas(previous, current);

      expect(diff.newRequired).toContain('name');
      expect(diff.isBreaking).toBe(true);
      expect(diff.backwardCompatible).toBe(false);
    });

    it('should detect fields becoming optional as non-breaking', () => {
      const previous = createSchema({ id: 'integer', name: 'string' }, ['id', 'name']);
      const current = createSchema({ id: 'integer', name: 'string' }, ['id']);
      const diff = compareInferredSchemas(previous, current);

      expect(diff.newOptional).toContain('name');
      expect(diff.isBreaking).toBe(false);
      expect(diff.backwardCompatible).toBe(true);
    });
  });

  describe('type change compatibility', () => {
    it('should consider integer to number as backward compatible', () => {
      const previous = createSchema({ value: 'integer' });
      const current = createSchema({ value: 'number' });
      const diff = compareInferredSchemas(previous, current);

      expect(diff.typeChanges).toHaveLength(1);
      expect(diff.typeChanges[0].backwardCompatible).toBe(true);
    });

    it('should consider null to any type as backward compatible', () => {
      const previous = createSchema({ value: 'null' });
      const current = createSchema({ value: 'string' });
      const diff = compareInferredSchemas(previous, current);

      expect(diff.typeChanges).toHaveLength(1);
      expect(diff.typeChanges[0].backwardCompatible).toBe(true);
    });

    it('should consider string to number as not backward compatible', () => {
      const previous = createSchema({ value: 'string' });
      const current = createSchema({ value: 'number' });
      const diff = compareInferredSchemas(previous, current);

      expect(diff.typeChanges).toHaveLength(1);
      expect(diff.typeChanges[0].backwardCompatible).toBe(false);
      expect(diff.isBreaking).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined previous schema (new schema)', () => {
      const current = createSchema({ id: 'integer', name: 'string' });
      const diff = compareInferredSchemas(undefined, current);

      expect(diff.structureChanged).toBe(true);
      expect(diff.fieldsAdded).toEqual(['id', 'name']);
      expect(diff.backwardCompatible).toBe(true);
      expect(diff.isBreaking).toBe(false);
      expect(diff.summary).toContain('established');
    });

    it('should handle undefined current schema (removed schema)', () => {
      const previous = createSchema({ id: 'integer', name: 'string' });
      const diff = compareInferredSchemas(previous, undefined);

      expect(diff.structureChanged).toBe(true);
      expect(diff.fieldsRemoved).toEqual(['id', 'name']);
      expect(diff.backwardCompatible).toBe(false);
      expect(diff.isBreaking).toBe(true);
      expect(diff.summary).toContain('removed');
    });

    it('should handle both schemas undefined', () => {
      const diff = compareInferredSchemas(undefined, undefined);

      expect(diff.structureChanged).toBe(false);
      expect(diff.isBreaking).toBe(false);
      expect(diff.backwardCompatible).toBe(true);
    });

    it('should handle empty schemas', () => {
      const previous = createSchema({});
      const current = createSchema({});
      const diff = compareInferredSchemas(previous, current);

      expect(diff.structureChanged).toBe(false);
      expect(diff.isBreaking).toBe(false);
    });
  });

  describe('summary generation', () => {
    it('should generate summary for multiple changes', () => {
      const previous = createSchema({ a: 'string', b: 'integer' });
      const current = createSchema({ b: 'number', c: 'boolean' });
      const diff = compareInferredSchemas(previous, current);

      expect(diff.summary).toContain('removed');
      expect(diff.summary).toContain('added');
      expect(diff.summary).toContain('type change');
    });

    it('should return "No schema changes" for identical schemas', () => {
      const schema = createSchema({ id: 'integer' });
      const diff = compareInferredSchemas(schema, schema);

      expect(diff.summary).toBe('No schema changes');
    });
  });
});

describe('buildSchemaEvolution', () => {
  it('should return empty evolution for no schemas', () => {
    const evolution = buildSchemaEvolution([]);

    expect(evolution.currentHash).toBe('empty');
    expect(evolution.history).toHaveLength(0);
    expect(evolution.isStable).toBe(true);
    expect(evolution.sampleCount).toBe(0);
  });

  it('should build evolution from single schema', () => {
    const schema = createSchema({ id: 'integer', name: 'string' });
    const evolution = buildSchemaEvolution([schema]);

    expect(evolution.currentHash).not.toBe('empty');
    expect(evolution.history).toHaveLength(1);
    expect(evolution.sampleCount).toBe(1);
    expect(evolution.isStable).toBe(true);
  });

  it('should detect stable schema from consistent samples', () => {
    const schema1 = createSchema({ id: 'integer', name: 'string' });
    const schema2 = createSchema({ id: 'integer', name: 'string' });
    const schema3 = createSchema({ id: 'integer', name: 'string' });
    const evolution = buildSchemaEvolution([schema1, schema2, schema3]);

    expect(evolution.isStable).toBe(true);
    expect(evolution.inconsistentFields).toHaveLength(0);
    expect(evolution.sampleCount).toBe(3);
  });

  it('should detect inconsistent fields', () => {
    const schema1 = createSchema({ id: 'integer', name: 'string' });
    const schema2 = createSchema({ id: 'integer' }); // missing 'name'
    const schema3 = createSchema({ id: 'integer', name: 'string' });
    const evolution = buildSchemaEvolution([schema1, schema2, schema3]);

    expect(evolution.isStable).toBe(false);
    expect(evolution.inconsistentFields).toContain('name');
  });

  it('should detect type inconsistency as unstable', () => {
    const schema1 = createSchema({ value: 'string' });
    const schema2 = createSchema({ value: 'integer' });
    const schema3 = createSchema({ value: 'string' });
    const evolution = buildSchemaEvolution([schema1, schema2, schema3]);

    expect(evolution.isStable).toBe(false);
    expect(evolution.inconsistentFields).toContain('value');
  });

  it('should calculate stability confidence based on consistency ratio', () => {
    // 2 out of 3 samples have field 'extra'
    const schema1 = createSchema({ id: 'integer', extra: 'string' });
    const schema2 = createSchema({ id: 'integer' });
    const schema3 = createSchema({ id: 'integer', extra: 'string' });
    const evolution = buildSchemaEvolution([schema1, schema2, schema3]);

    expect(evolution.stabilityConfidence).toBeLessThan(1);
    expect(evolution.stabilityConfidence).toBeGreaterThan(0);
  });

  it('should increase confidence with more samples', () => {
    const stableSchema = createSchema({ id: 'integer' });
    const smallSample = buildSchemaEvolution([stableSchema, stableSchema, stableSchema]);
    const largeSample = buildSchemaEvolution(Array(10).fill(stableSchema));

    expect(largeSample.stabilityConfidence).toBeGreaterThanOrEqual(smallSample.stabilityConfidence);
  });
});

describe('compareSchemaEvolution', () => {
  const createEvolution = (
    isStable: boolean,
    fields: string[] = ['id', 'name'],
    sampleCount: number = 5
  ): ResponseSchemaEvolution => ({
    currentHash: `hash_${fields.join('_')}`,
    history: [{
      hash: `hash_${fields.join('_')}`,
      schema: createSchema(Object.fromEntries(fields.map(f => [f, 'string']))),
      observedAt: new Date(),
      sampleCount,
    }],
    isStable,
    stabilityConfidence: isStable ? 0.95 : 0.5,
    inconsistentFields: isStable ? [] : ['extra'],
    sampleCount,
  });

  it('should return empty diff when both evolutions are undefined', () => {
    const diff = compareSchemaEvolution(undefined, undefined);

    expect(diff.structureChanged).toBe(false);
    expect(diff.isBreaking).toBe(false);
  });

  it('should detect new schema tracking establishment', () => {
    const current = createEvolution(true);
    const diff = compareSchemaEvolution(undefined, current);

    expect(diff.summary).toContain('established');
  });

  it('should detect schema evolution removal as breaking', () => {
    const previous = createEvolution(true);
    const diff = compareSchemaEvolution(previous, undefined);

    expect(diff.isBreaking).toBe(true);
    expect(diff.backwardCompatible).toBe(false);
    expect(diff.summary).toContain('removed');
  });

  it('should detect hash changes', () => {
    const previous = createEvolution(true, ['id', 'name']);
    const current = createEvolution(true, ['id', 'email']);
    const diff = compareSchemaEvolution(previous, current);

    expect(diff.structureChanged).toBe(true);
  });

  it('should detect stability changes', () => {
    const previous = createEvolution(true);
    const current = createEvolution(false);
    // Since schemas are the same hash, it should detect stability change
    const previousSameHash: ResponseSchemaEvolution = {
      ...previous,
      currentHash: 'same_hash',
      history: [],
    };
    const currentSameHash: ResponseSchemaEvolution = {
      ...current,
      currentHash: 'same_hash',
      history: [],
    };
    const diff = compareSchemaEvolution(previousSameHash, currentSameHash);

    expect(diff.summary).toContain('unstable');
  });
});

describe('formatSchemaEvolution', () => {
  it('should format stable evolution', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: true,
      stabilityConfidence: 0.95,
      inconsistentFields: [],
      sampleCount: 10,
    };

    const formatted = formatSchemaEvolution(evolution);

    expect(formatted).toContain('Stable');
    expect(formatted).toContain('95%');
    expect(formatted).toContain('Samples: 10');
  });

  it('should format unstable evolution with inconsistent fields', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: false,
      stabilityConfidence: 0.6,
      inconsistentFields: ['field1', 'field2'],
      sampleCount: 5,
    };

    const formatted = formatSchemaEvolution(evolution);

    expect(formatted).toContain('Unstable');
    expect(formatted).toContain('60%');
    expect(formatted).toContain('field1');
    expect(formatted).toContain('field2');
  });

  it('should truncate many inconsistent fields', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: false,
      stabilityConfidence: 0.3,
      inconsistentFields: ['field1', 'field2', 'field3', 'field4', 'field5'],
      sampleCount: 5,
    };

    const formatted = formatSchemaEvolution(evolution);

    expect(formatted).toContain('+2 more');
  });
});

describe('formatSchemaEvolutionDiff', () => {
  it('should return empty array for no structure changes', () => {
    const diff: SchemaEvolutionDiff = {
      structureChanged: false,
      fieldsAdded: [],
      fieldsRemoved: [],
      typeChanges: [],
      newRequired: [],
      newOptional: [],
      backwardCompatible: true,
      isBreaking: false,
      summary: 'No changes',
    };

    const lines = formatSchemaEvolutionDiff(diff);

    expect(lines).toHaveLength(0);
  });

  it('should format removed fields', () => {
    const diff: SchemaEvolutionDiff = {
      structureChanged: true,
      fieldsAdded: [],
      fieldsRemoved: ['name', 'email'],
      typeChanges: [],
      newRequired: [],
      newOptional: [],
      backwardCompatible: false,
      isBreaking: true,
      summary: '2 fields removed',
    };

    const lines = formatSchemaEvolutionDiff(diff, false);

    expect(lines.some(l => l.includes('removed'))).toBe(true);
    expect(lines.some(l => l.includes('name'))).toBe(true);
    expect(lines.some(l => l.includes('email'))).toBe(true);
  });

  it('should format added fields', () => {
    const diff: SchemaEvolutionDiff = {
      structureChanged: true,
      fieldsAdded: ['newField'],
      fieldsRemoved: [],
      typeChanges: [],
      newRequired: [],
      newOptional: [],
      backwardCompatible: true,
      isBreaking: false,
      summary: '1 field added',
    };

    const lines = formatSchemaEvolutionDiff(diff, false);

    expect(lines.some(l => l.includes('added'))).toBe(true);
    expect(lines.some(l => l.includes('newField'))).toBe(true);
  });

  it('should format type changes', () => {
    const diff: SchemaEvolutionDiff = {
      structureChanged: true,
      fieldsAdded: [],
      fieldsRemoved: [],
      typeChanges: [{
        field: 'value',
        previousType: 'string',
        currentType: 'number',
        backwardCompatible: false,
      }],
      newRequired: [],
      newOptional: [],
      backwardCompatible: false,
      isBreaking: true,
      summary: '1 type change',
    };

    const lines = formatSchemaEvolutionDiff(diff, false);

    expect(lines.some(l => l.includes('Type change'))).toBe(true);
    expect(lines.some(l => l.includes('value'))).toBe(true);
    expect(lines.some(l => l.includes('string'))).toBe(true);
    expect(lines.some(l => l.includes('number'))).toBe(true);
  });
});

describe('hasSchemaEvolutionIssues', () => {
  it('should return false for stable schema with sufficient samples', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: true,
      stabilityConfidence: 0.95,
      inconsistentFields: [],
      sampleCount: SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY,
    };

    expect(hasSchemaEvolutionIssues(evolution)).toBe(false);
  });

  it('should return true for unstable schema with sufficient samples', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: false,
      stabilityConfidence: 0.5,
      inconsistentFields: ['field1'],
      sampleCount: SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY,
    };

    expect(hasSchemaEvolutionIssues(evolution)).toBe(true);
  });

  it('should return false for unstable schema with insufficient samples', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: false,
      stabilityConfidence: 0.3,
      inconsistentFields: ['field1'],
      sampleCount: 1, // Below threshold
    };

    expect(hasSchemaEvolutionIssues(evolution)).toBe(false);
  });

  it('should return true for low confidence with sufficient samples', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: true,
      stabilityConfidence: 0.5, // Below threshold
      inconsistentFields: [],
      sampleCount: SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY,
    };

    expect(hasSchemaEvolutionIssues(evolution)).toBe(true);
  });

  it('should respect custom threshold', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: true,
      stabilityConfidence: 0.8,
      inconsistentFields: [],
      sampleCount: SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY,
    };

    // With default threshold (0.7), should be fine
    expect(hasSchemaEvolutionIssues(evolution)).toBe(false);

    // With higher threshold (0.9), should flag as issue
    expect(hasSchemaEvolutionIssues(evolution, 0.9)).toBe(true);
  });
});

describe('getSchemaStabilityGrade', () => {
  it('should return N/A for insufficient samples', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: true,
      stabilityConfidence: 1,
      inconsistentFields: [],
      sampleCount: 1,
    };

    expect(getSchemaStabilityGrade(evolution)).toBe('N/A');
  });

  it('should return A for stable schema with high confidence', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: true,
      stabilityConfidence: 0.98,
      inconsistentFields: [],
      sampleCount: SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY,
    };

    expect(getSchemaStabilityGrade(evolution)).toBe('A');
  });

  it('should return B for good confidence', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: false,
      stabilityConfidence: 0.88,
      inconsistentFields: ['field1'],
      sampleCount: SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY,
    };

    expect(getSchemaStabilityGrade(evolution)).toBe('B');
  });

  it('should return C for moderate confidence', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: false,
      stabilityConfidence: 0.75,
      inconsistentFields: ['field1', 'field2'],
      sampleCount: SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY,
    };

    expect(getSchemaStabilityGrade(evolution)).toBe('C');
  });

  it('should return D for low confidence', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: false,
      stabilityConfidence: 0.55,
      inconsistentFields: ['field1', 'field2', 'field3'],
      sampleCount: SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY,
    };

    expect(getSchemaStabilityGrade(evolution)).toBe('D');
  });

  it('should return F for very low confidence', () => {
    const evolution: ResponseSchemaEvolution = {
      currentHash: 'abc123',
      history: [],
      isStable: false,
      stabilityConfidence: 0.3,
      inconsistentFields: ['field1', 'field2', 'field3', 'field4'],
      sampleCount: SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY,
    };

    expect(getSchemaStabilityGrade(evolution)).toBe('F');
  });
});

describe('integration scenarios', () => {
  it('should track evolution across multiple runs', () => {
    // Simulate multiple check runs with slightly varying schemas
    const run1Schemas = [
      createSchema({ id: 'integer', name: 'string', status: 'string' }),
      createSchema({ id: 'integer', name: 'string', status: 'string' }),
    ];

    const run2Schemas = [
      createSchema({ id: 'integer', name: 'string', status: 'string' }),
      createSchema({ id: 'integer', name: 'string' }), // missing status
    ];

    const evolution1 = buildSchemaEvolution(run1Schemas);
    const evolution2 = buildSchemaEvolution(run2Schemas);

    expect(evolution1.isStable).toBe(true);
    expect(evolution2.isStable).toBe(false);
    expect(evolution2.inconsistentFields).toContain('status');
  });

  it('should detect breaking changes in API evolution', () => {
    // API v1 schema
    const v1Schema = createSchema({
      id: 'integer',
      user_name: 'string',
      email: 'string',
    });

    // API v2 schema - renamed field, added field, changed type
    const v2Schema: InferredSchema = {
      type: 'object',
      properties: {
        id: { type: 'string' }, // type change: integer -> string
        username: { type: 'string' }, // renamed from user_name
        email: { type: 'string' },
        created_at: { type: 'string' }, // new field
      },
      required: ['id', 'username', 'email'], // user_name removed
    };

    const diff = compareInferredSchemas(v1Schema, v2Schema);

    expect(diff.isBreaking).toBe(true);
    expect(diff.fieldsRemoved).toContain('user_name');
    expect(diff.fieldsAdded).toContain('username');
    expect(diff.fieldsAdded).toContain('created_at');
    expect(diff.typeChanges.some(tc => tc.field === 'id')).toBe(true);
  });

  it('should handle progressive schema expansion', () => {
    // Schema grows over time - all additions, no removals
    const v1 = createSchema({ id: 'integer' });
    const v2 = createSchema({ id: 'integer', name: 'string' });
    const v3 = createSchema({ id: 'integer', name: 'string', email: 'string' });

    const diff1 = compareInferredSchemas(v1, v2);
    const diff2 = compareInferredSchemas(v2, v3);

    // Both should be backward compatible
    expect(diff1.backwardCompatible).toBe(true);
    expect(diff1.isBreaking).toBe(false);
    expect(diff2.backwardCompatible).toBe(true);
    expect(diff2.isBreaking).toBe(false);
  });
});
