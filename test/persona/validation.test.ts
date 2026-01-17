import { describe, it, expect } from 'vitest';
import {
  validateBiasWeights,
  validateCategoryBiasAlignment,
  validatePersona,
  formatValidationErrors,
  assertValidPersona,
  normalizeBiasWeights,
} from '../../src/persona/validation.js';
import type { Persona, QuestionBias } from '../../src/persona/types.js';
import { BUILTIN_PERSONAS } from '../../src/persona/builtins.js';

describe('validateBiasWeights', () => {
  it('should accept valid weights that sum to 1.0', () => {
    const bias: QuestionBias = {
      happyPath: 0.25,
      edgeCase: 0.25,
      errorHandling: 0.25,
      boundary: 0.25,
    };
    const result = validateBiasWeights(bias);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept weights with security that sum to 1.0', () => {
    const bias: QuestionBias = {
      happyPath: 0.1,
      edgeCase: 0.2,
      errorHandling: 0.2,
      boundary: 0.2,
      security: 0.3,
    };
    const result = validateBiasWeights(bias);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept weights within tolerance', () => {
    const bias: QuestionBias = {
      happyPath: 0.25,
      edgeCase: 0.25,
      errorHandling: 0.25,
      boundary: 0.249, // Sum = 0.999, within default tolerance
    };
    const result = validateBiasWeights(bias);
    expect(result.valid).toBe(true);
  });

  it('should reject weights that sum to more than 1.0', () => {
    const bias: QuestionBias = {
      happyPath: 0.5,
      edgeCase: 0.5,
      errorHandling: 0.5,
      boundary: 0.5,
    };
    const result = validateBiasWeights(bias);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'questionBias')).toBe(true);
  });

  it('should reject weights less than 0', () => {
    const bias: QuestionBias = {
      happyPath: -0.1,
      edgeCase: 0.4,
      errorHandling: 0.4,
      boundary: 0.3,
    };
    const result = validateBiasWeights(bias);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'questionBias.happyPath')).toBe(true);
  });

  it('should reject weights greater than 1', () => {
    const bias: QuestionBias = {
      happyPath: 1.5,
      edgeCase: 0.0,
      errorHandling: 0.0,
      boundary: 0.0,
    };
    const result = validateBiasWeights(bias);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'questionBias.happyPath')).toBe(true);
  });

  it('should reject NaN weights', () => {
    const bias: QuestionBias = {
      happyPath: NaN,
      edgeCase: 0.25,
      errorHandling: 0.25,
      boundary: 0.25,
    };
    const result = validateBiasWeights(bias);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('finite number'))).toBe(true);
  });

  it('should reject Infinity weights', () => {
    const bias: QuestionBias = {
      happyPath: Infinity,
      edgeCase: 0.25,
      errorHandling: 0.25,
      boundary: 0.25,
    };
    const result = validateBiasWeights(bias);
    expect(result.valid).toBe(false);
  });

  it('should accept custom tolerance', () => {
    const bias: QuestionBias = {
      happyPath: 0.2,
      edgeCase: 0.2,
      errorHandling: 0.2,
      boundary: 0.2, // Sum = 0.8
    };
    // Fail with default tolerance
    expect(validateBiasWeights(bias).valid).toBe(false);
    // Pass with relaxed tolerance
    expect(validateBiasWeights(bias, { sumTolerance: 0.25 }).valid).toBe(true);
  });
});

describe('validateCategoryBiasAlignment', () => {
  it('should pass when categories match biases', () => {
    const bias: QuestionBias = {
      happyPath: 0.3,
      edgeCase: 0.3,
      errorHandling: 0.4,
      boundary: 0,
    };
    const categories = ['happy_path', 'edge_case', 'error_handling'] as const;
    const result = validateCategoryBiasAlignment(bias, [...categories]);
    expect(result.valid).toBe(true);
  });

  it('should fail when security category is listed but bias is undefined', () => {
    const bias: QuestionBias = {
      happyPath: 0.5,
      edgeCase: 0.25,
      errorHandling: 0.25,
      boundary: 0,
    };
    const categories = ['security', 'happy_path'] as const;
    const result = validateCategoryBiasAlignment(bias, [...categories]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'questionBias.security')).toBe(true);
  });

  it('should pass when security is missing with allowMissingSecurity option', () => {
    const bias: QuestionBias = {
      happyPath: 0.5,
      edgeCase: 0.25,
      errorHandling: 0.25,
      boundary: 0,
    };
    const categories = ['security', 'happy_path'] as const;
    const result = validateCategoryBiasAlignment(bias, [...categories], {
      allowMissingSecurity: true,
    });
    expect(result.valid).toBe(true);
  });

  it('should warn when category has very low bias', () => {
    const bias: QuestionBias = {
      happyPath: 0.9,
      edgeCase: 0.01, // Very low
      errorHandling: 0.09,
      boundary: 0,
    };
    const categories = ['happy_path', 'edge_case', 'error_handling'] as const;
    const result = validateCategoryBiasAlignment(bias, [...categories]);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.field === 'questionBias.edgeCase')).toBe(true);
  });

  it('should warn when bias is set but category is not listed', () => {
    const bias: QuestionBias = {
      happyPath: 0.4,
      edgeCase: 0.3,
      errorHandling: 0.3,
      boundary: 0,
      security: 0.1, // Set but not in categories
    };
    const categories = ['happy_path', 'edge_case'] as const;
    const result = validateCategoryBiasAlignment(bias, [...categories]);
    expect(result.warnings.some(w => w.field === 'questionBias.security')).toBe(true);
  });

  it('should not warn about unused biases when disabled', () => {
    const bias: QuestionBias = {
      happyPath: 0.4,
      edgeCase: 0.3,
      errorHandling: 0.3,
      boundary: 0,
      security: 0.1,
    };
    const categories = ['happy_path'] as const;
    const result = validateCategoryBiasAlignment(bias, [...categories], {
      warnUnusedBiases: false,
    });
    expect(result.warnings).toHaveLength(0);
  });
});

describe('validatePersona', () => {
  const validPersona: Persona = {
    id: 'test_persona',
    name: 'Test Persona',
    description: 'A test persona',
    systemPrompt: 'You are a test persona',
    questionBias: {
      happyPath: 0.25,
      edgeCase: 0.25,
      errorHandling: 0.25,
      boundary: 0.25,
    },
    categories: ['happy_path', 'edge_case', 'error_handling'],
  };

  it('should accept a valid persona', () => {
    const result = validatePersona(validPersona);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing id', () => {
    const persona = { ...validPersona, id: '' };
    const result = validatePersona(persona);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'id')).toBe(true);
  });

  it('should reject missing name', () => {
    const persona = { ...validPersona, name: '' };
    const result = validatePersona(persona);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'name')).toBe(true);
  });

  it('should reject missing systemPrompt', () => {
    const persona = { ...validPersona, systemPrompt: '' };
    const result = validatePersona(persona);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'systemPrompt')).toBe(true);
  });

  it('should reject invalid id format', () => {
    const persona = { ...validPersona, id: 'Invalid-ID' };
    const result = validatePersona(persona);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'id' && e.message.includes('lowercase'))).toBe(true);
  });

  it('should reject id starting with number', () => {
    const persona = { ...validPersona, id: '123_persona' };
    const result = validatePersona(persona);
    expect(result.valid).toBe(false);
  });

  it('should reject empty categories', () => {
    const persona = { ...validPersona, categories: [] };
    const result = validatePersona(persona);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'categories')).toBe(true);
  });

  it('should reject invalid category', () => {
    const persona = { ...validPersona, categories: ['invalid_category' as 'happy_path'] };
    const result = validatePersona(persona);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Invalid category'))).toBe(true);
  });

  it('should validate all built-in personas', () => {
    for (const [id, persona] of Object.entries(BUILTIN_PERSONAS)) {
      const result = validatePersona(persona);
      expect(result.valid, `Built-in persona ${id} should be valid`).toBe(true);
    }
  });
});

describe('formatValidationErrors', () => {
  it('should format errors clearly', () => {
    const result = {
      valid: false,
      errors: [
        {
          field: 'questionBias.happyPath',
          message: 'Bias weight must be between 0 and 1',
          actual: -0.5,
          expected: '0 <= weight <= 1',
        },
      ],
      warnings: [],
    };
    const formatted = formatValidationErrors(result, 'test.yaml');
    expect(formatted).toContain('test.yaml');
    expect(formatted).toContain('questionBias.happyPath');
    expect(formatted).toContain('must be between 0 and 1');
    expect(formatted).toContain('-0.5');
  });

  it('should include warnings', () => {
    const result = {
      valid: true,
      errors: [],
      warnings: [
        {
          field: 'questionBias.security',
          message: 'Bias is set but category not listed',
        },
      ],
    };
    const formatted = formatValidationErrors(result, 'test.yaml');
    expect(formatted).toContain('Warnings');
    expect(formatted).toContain('questionBias.security');
  });
});

describe('assertValidPersona', () => {
  it('should not throw for valid persona', () => {
    const persona: Persona = {
      id: 'valid_persona',
      name: 'Valid',
      description: 'Test',
      systemPrompt: 'Test prompt',
      questionBias: {
        happyPath: 0.25,
        edgeCase: 0.25,
        errorHandling: 0.25,
        boundary: 0.25,
      },
      categories: ['happy_path'],
    };
    expect(() => assertValidPersona(persona, 'test')).not.toThrow();
  });

  it('should throw for invalid persona', () => {
    const persona: Persona = {
      id: 'invalid',
      name: '',
      description: 'Test',
      systemPrompt: 'Test prompt',
      questionBias: {
        happyPath: 0.25,
        edgeCase: 0.25,
        errorHandling: 0.25,
        boundary: 0.25,
      },
      categories: ['happy_path'],
    };
    expect(() => assertValidPersona(persona, 'test')).toThrow('name is required');
  });
});

describe('normalizeBiasWeights', () => {
  it('should normalize weights to sum to 1.0', () => {
    const bias: QuestionBias = {
      happyPath: 1,
      edgeCase: 1,
      errorHandling: 1,
      boundary: 1,
    };
    const normalized = normalizeBiasWeights(bias);
    const sum = normalized.happyPath + normalized.edgeCase +
                normalized.errorHandling + normalized.boundary;
    expect(sum).toBeCloseTo(1.0);
    expect(normalized.happyPath).toBe(0.25);
  });

  it('should preserve ratios when normalizing', () => {
    const bias: QuestionBias = {
      happyPath: 2,
      edgeCase: 1,
      errorHandling: 1,
      boundary: 0,
    };
    const normalized = normalizeBiasWeights(bias);
    expect(normalized.happyPath).toBe(0.5);
    expect(normalized.edgeCase).toBe(0.25);
    expect(normalized.errorHandling).toBe(0.25);
    expect(normalized.boundary).toBe(0);
  });

  it('should handle security when present', () => {
    const bias: QuestionBias = {
      happyPath: 1,
      edgeCase: 1,
      errorHandling: 1,
      boundary: 1,
      security: 1,
    };
    const normalized = normalizeBiasWeights(bias);
    const sum = normalized.happyPath + normalized.edgeCase +
                normalized.errorHandling + normalized.boundary +
                (normalized.security ?? 0);
    expect(sum).toBeCloseTo(1.0);
    expect(normalized.security).toBe(0.2);
  });

  it('should not include security when originally undefined', () => {
    const bias: QuestionBias = {
      happyPath: 1,
      edgeCase: 1,
      errorHandling: 1,
      boundary: 1,
    };
    const normalized = normalizeBiasWeights(bias);
    expect(normalized.security).toBeUndefined();
  });

  it('should handle all zeros', () => {
    const bias: QuestionBias = {
      happyPath: 0,
      edgeCase: 0,
      errorHandling: 0,
      boundary: 0,
    };
    const normalized = normalizeBiasWeights(bias);
    expect(normalized.happyPath).toBe(0.25);
    expect(normalized.edgeCase).toBe(0.25);
    expect(normalized.errorHandling).toBe(0.25);
    expect(normalized.boundary).toBe(0.25);
  });
});
