/**
 * Persona validation utilities.
 *
 * Validates persona configurations including bias weights and categories
 * to ensure they form valid probability distributions.
 */

import type { Persona, QuestionBias, QuestionCategory } from './types.js';

/**
 * Validation error with detailed information.
 */
export interface ValidationError {
  /** Field or path that failed validation */
  field: string;
  /** Error message */
  message: string;
  /** Actual value that caused the error */
  actual?: unknown;
  /** Expected value or constraint */
  expected?: string;
}

/**
 * Result of validating a persona.
 */
export interface PersonaValidationResult {
  /** Whether the persona is valid */
  valid: boolean;
  /** Validation errors (empty if valid) */
  errors: ValidationError[];
  /** Validation warnings (non-fatal issues) */
  warnings: ValidationError[];
}

/**
 * Options for persona validation.
 */
export interface ValidationOptions {
  /** Tolerance for weight sum validation (default: 0.01) */
  sumTolerance?: number;
  /** Whether to allow security category without security bias (default: false) */
  allowMissingSecurity?: boolean;
  /** Whether to warn about unused biases (default: true) */
  warnUnusedBiases?: boolean;
  /** Minimum bias weight to be considered "active" (default: 0.05) */
  minActiveBias?: number;
}

const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  sumTolerance: 0.01,
  allowMissingSecurity: false,
  warnUnusedBiases: true,
  minActiveBias: 0.05,
};

/**
 * Validate a persona's bias weights.
 *
 * @param bias - The question bias configuration
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 */
export function validateBiasWeights(
  bias: QuestionBias,
  options: ValidationOptions = {}
): PersonaValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Get all bias values
  const biasFields: Array<{ field: keyof QuestionBias; name: string }> = [
    { field: 'happyPath', name: 'happyPath' },
    { field: 'edgeCase', name: 'edgeCase' },
    { field: 'errorHandling', name: 'errorHandling' },
    { field: 'boundary', name: 'boundary' },
    { field: 'security', name: 'security' },
  ];

  const values: number[] = [];

  // Validate each bias weight is between 0 and 1
  for (const { field, name } of biasFields) {
    const value = bias[field];

    // Skip undefined security (optional field)
    if (value === undefined) {
      continue;
    }

    // Check type
    if (typeof value !== 'number') {
      errors.push({
        field: `questionBias.${name}`,
        message: `Bias weight must be a number`,
        actual: typeof value,
        expected: 'number',
      });
      continue;
    }

    // Check range [0, 1]
    if (value < 0 || value > 1) {
      errors.push({
        field: `questionBias.${name}`,
        message: `Bias weight must be between 0 and 1`,
        actual: value,
        expected: '0 <= weight <= 1',
      });
    }

    // Check for NaN or Infinity
    if (!Number.isFinite(value)) {
      errors.push({
        field: `questionBias.${name}`,
        message: `Bias weight must be a finite number`,
        actual: value,
        expected: 'finite number',
      });
    }

    values.push(value);
  }

  // Validate sum approximately equals 1.0
  if (values.length > 0 && errors.length === 0) {
    const sum = values.reduce((a, b) => a + b, 0);
    const deviation = Math.abs(sum - 1.0);

    if (deviation > opts.sumTolerance) {
      errors.push({
        field: 'questionBias',
        message: `Bias weights must sum to approximately 1.0 (tolerance: ${opts.sumTolerance})`,
        actual: sum.toFixed(4),
        expected: `1.0 ± ${opts.sumTolerance}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that categories have corresponding active bias weights.
 *
 * @param bias - The question bias configuration
 * @param categories - The categories this persona focuses on
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 */
export function validateCategoryBiasAlignment(
  bias: QuestionBias,
  categories: QuestionCategory[],
  options: ValidationOptions = {}
): PersonaValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Map categories to bias fields
  const categoryToBias: Record<QuestionCategory, keyof QuestionBias> = {
    happy_path: 'happyPath',
    edge_case: 'edgeCase',
    error_handling: 'errorHandling',
    boundary: 'boundary',
    security: 'security',
  };

  // Check that each category has a corresponding non-zero bias
  for (const category of categories) {
    const biasField = categoryToBias[category];
    const biasValue = bias[biasField];

    // Security is special - can be undefined
    if (category === 'security' && biasValue === undefined) {
      if (!opts.allowMissingSecurity) {
        errors.push({
          field: `questionBias.security`,
          message: `Category "security" is listed but security bias is not defined`,
          actual: undefined,
          expected: 'security bias > 0',
        });
      }
      continue;
    }

    // Check if bias is too low to be meaningful
    if (biasValue !== undefined && biasValue < opts.minActiveBias) {
      warnings.push({
        field: `questionBias.${biasField}`,
        message: `Category "${category}" is listed but bias weight is very low`,
        actual: biasValue,
        expected: `>= ${opts.minActiveBias}`,
      });
    }
  }

  // Check for biases that are set but not in categories (warn)
  if (opts.warnUnusedBiases) {
    const allBiases: Array<{ field: keyof QuestionBias; category: QuestionCategory }> = [
      { field: 'happyPath', category: 'happy_path' },
      { field: 'edgeCase', category: 'edge_case' },
      { field: 'errorHandling', category: 'error_handling' },
      { field: 'boundary', category: 'boundary' },
      { field: 'security', category: 'security' },
    ];

    for (const { field, category } of allBiases) {
      const value = bias[field];
      if (value !== undefined && value >= opts.minActiveBias && !categories.includes(category)) {
        warnings.push({
          field: `questionBias.${field}`,
          message: `Bias "${field}" has significant weight but "${category}" is not in categories list`,
          actual: value,
          expected: `Category "${category}" in categories array`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a complete persona configuration.
 *
 * @param persona - The persona to validate
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 */
export function validatePersona(
  persona: Persona,
  options: ValidationOptions = {}
): PersonaValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate required fields
  if (!persona.id || typeof persona.id !== 'string') {
    errors.push({
      field: 'id',
      message: 'Persona ID is required and must be a string',
      actual: persona.id,
    });
  }

  if (!persona.name || typeof persona.name !== 'string') {
    errors.push({
      field: 'name',
      message: 'Persona name is required and must be a string',
      actual: persona.name,
    });
  }

  if (!persona.systemPrompt || typeof persona.systemPrompt !== 'string') {
    errors.push({
      field: 'systemPrompt',
      message: 'System prompt is required and must be a string',
      actual: typeof persona.systemPrompt,
    });
  }

  // Validate ID format (alphanumeric and underscores only)
  if (persona.id && !/^[a-z][a-z0-9_]*$/.test(persona.id)) {
    errors.push({
      field: 'id',
      message: 'Persona ID must start with a letter and contain only lowercase letters, numbers, and underscores',
      actual: persona.id,
      expected: 'pattern: ^[a-z][a-z0-9_]*$',
    });
  }

  // Validate bias weights
  const biasResult = validateBiasWeights(persona.questionBias, options);
  errors.push(...biasResult.errors);
  warnings.push(...biasResult.warnings);

  // Validate categories
  if (!persona.categories || !Array.isArray(persona.categories)) {
    errors.push({
      field: 'categories',
      message: 'Categories must be an array',
      actual: typeof persona.categories,
    });
  } else if (persona.categories.length === 0) {
    errors.push({
      field: 'categories',
      message: 'At least one category is required',
      actual: 0,
      expected: '>= 1 category',
    });
  } else {
    // Validate category values
    const validCategories: QuestionCategory[] = ['happy_path', 'edge_case', 'error_handling', 'boundary', 'security'];
    for (const cat of persona.categories) {
      if (!validCategories.includes(cat as QuestionCategory)) {
        errors.push({
          field: 'categories',
          message: `Invalid category "${cat}"`,
          actual: cat,
          expected: validCategories.join(', '),
        });
      }
    }

    // Validate category-bias alignment
    if (biasResult.valid) {
      const alignmentResult = validateCategoryBiasAlignment(
        persona.questionBias,
        persona.categories,
        options
      );
      errors.push(...alignmentResult.errors);
      warnings.push(...alignmentResult.warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format validation errors for display.
 *
 * @param result - Validation result
 * @param personaSource - Source of the persona (e.g., file path or "built-in")
 * @returns Formatted error message
 */
export function formatValidationErrors(
  result: PersonaValidationResult,
  personaSource: string
): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push(`Persona validation failed for ${personaSource}:`);
    for (const error of result.errors) {
      lines.push(`  - ${error.field}: ${error.message}`);
      if (error.actual !== undefined) {
        lines.push(`    Actual: ${JSON.stringify(error.actual)}`);
      }
      if (error.expected) {
        lines.push(`    Expected: ${error.expected}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning.field}: ${warning.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Assert a persona is valid, throwing if not.
 *
 * @param persona - The persona to validate
 * @param source - Source identifier for error messages
 * @param options - Validation options
 * @throws Error if persona is invalid
 */
export function assertValidPersona(
  persona: Persona,
  source: string,
  options: ValidationOptions = {}
): void {
  const result = validatePersona(persona, options);
  if (!result.valid) {
    throw new Error(formatValidationErrors(result, source));
  }
}

/**
 * Normalize bias weights to sum to 1.0.
 *
 * @param bias - The original bias configuration
 * @returns Normalized bias with weights summing to 1.0
 */
export function normalizeBiasWeights(bias: QuestionBias): QuestionBias {
  // Calculate sum of all defined weights
  const happyPath = typeof bias.happyPath === 'number' ? bias.happyPath : 0;
  const edgeCase = typeof bias.edgeCase === 'number' ? bias.edgeCase : 0;
  const errorHandling = typeof bias.errorHandling === 'number' ? bias.errorHandling : 0;
  const boundary = typeof bias.boundary === 'number' ? bias.boundary : 0;
  const security = typeof bias.security === 'number' ? bias.security : 0;

  const sum = happyPath + edgeCase + errorHandling + boundary + security;

  if (sum === 0) {
    // All zeros - return equal weights for the required fields
    return {
      happyPath: 0.25,
      edgeCase: 0.25,
      errorHandling: 0.25,
      boundary: 0.25,
      security: bias.security !== undefined ? 0 : undefined,
    };
  }

  // Normalize to sum to 1.0
  const result: QuestionBias = {
    happyPath: happyPath / sum,
    edgeCase: edgeCase / sum,
    errorHandling: errorHandling / sum,
    boundary: boundary / sum,
  };

  // Only include security if it was originally defined
  if (bias.security !== undefined) {
    result.security = security / sum;
  }

  return result;
}
