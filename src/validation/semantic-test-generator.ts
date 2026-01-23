/**
 * Generate test cases based on semantic type inference.
 *
 * This module generates validation tests for parameters with inferred
 * semantic types, testing that tools properly reject invalid values.
 */

import type { MCPTool } from '../transport/types.js';
import type { InterviewQuestion } from '../interview/types.js';
import type { QuestionCategory } from '../persona/types.js';
import { inferSemanticType } from './semantic-validator.js';
import type { SemanticType, SemanticInference } from './semantic-types.js';
import { SEMANTIC_VALIDATION } from '../constants.js';

/**
 * Invalid test values for each semantic type.
 * These values should be rejected by tools that properly validate input.
 */
const INVALID_VALUES: Record<SemanticType, string[]> = {
  date_iso8601: ['not-a-date', '2024/01/15', '01-15-2024', '2024-13-45', ''],
  date_month: ['not-a-month', '2024/01', '01-2024', '2024-13', ''],
  datetime: ['not-a-datetime', '2024-01-15 10:30', 'tomorrow', 'now', ''],
  timestamp: ['not-a-timestamp', '-12345', 'abc', '1.5.3', ''],
  amount_currency: ['not-an-amount', 'free', 'hundred dollars', 'N/A', ''],
  percentage: ['not-a-percentage', 'half', 'none', 'all', ''],
  identifier: ['', '   ', '\n\t', '\x00'],
  email: ['not-an-email', 'missing@domain', '@nodomain.com', 'no-at-sign', ''],
  url: ['not-a-url', 'missing-protocol.com', '://no-scheme', 'http://', ''],
  phone: ['not-a-phone', 'abc', '123', 'call-me', ''],
  ip_address: ['not-an-ip', '999.999.999.999', 'localhost', '1.2.3.4.5', ''],
  file_path: [], // Don't test - too OS-specific
  json: ['not-json', '{invalid}', '{"missing": }', '{key: "no-quotes"}', ''],
  base64: ['not-base64!!!', '====', 'has spaces', '@#$%', ''],
  regex: ['[invalid', '(unclosed', '*invalid', '\\', ''],
  unknown: [],
};

/**
 * Result of generating semantic tests for a tool.
 */
export interface SemanticTestResult {
  /** Generated test cases */
  tests: InterviewQuestion[];
  /** Semantic inferences for each parameter */
  inferences: SemanticInference[];
}

/**
 * Options for semantic test generation.
 */
export interface SemanticTestOptions {
  /** Minimum confidence threshold for generating tests (0-1, default: 0.5) */
  minConfidence?: number;
  /** Maximum invalid values to test per parameter (default: 2) */
  maxInvalidValuesPerParam?: number;
  /** Skip semantic tests entirely */
  skipSemanticTests?: boolean;
}

/**
 * Generate semantic validation tests for a tool.
 *
 * Analyzes the tool's input schema, infers semantic types for parameters,
 * and generates test cases with invalid values to verify proper validation.
 *
 * @param tool - The MCP tool to generate tests for
 * @param options - Configuration options
 * @returns Generated tests and semantic inferences
 */
export function generateSemanticTests(
  tool: MCPTool,
  options: SemanticTestOptions = {}
): SemanticTestResult {
  const {
    minConfidence = SEMANTIC_VALIDATION.MIN_CONFIDENCE_THRESHOLD,
    maxInvalidValuesPerParam = SEMANTIC_VALIDATION.MAX_INVALID_VALUES_PER_PARAM,
    skipSemanticTests = false,
  } = options;

  const tests: InterviewQuestion[] = [];
  const inferences: SemanticInference[] = [];

  if (skipSemanticTests) {
    return { tests, inferences };
  }

  const schema = tool.inputSchema as {
    properties?: Record<string, {
      type?: string;
      description?: string;
      format?: string;
    }>;
    required?: string[];
  } | undefined;

  if (!schema?.properties) {
    return { tests, inferences };
  }

  const requiredParams = schema.required ?? [];

  for (const [paramName, propSchema] of Object.entries(schema.properties)) {
    // Only infer semantic types for string parameters
    if (propSchema.type !== 'string' && propSchema.type !== undefined) {
      continue;
    }

    // Infer semantic type
    const inference = inferSemanticType(
      paramName,
      propSchema.description,
      propSchema.format
    );

    // Only generate tests for high-confidence inferences
    if (inference.confidence < minConfidence || inference.inferredType === 'unknown') {
      continue;
    }

    inferences.push(inference);

    // Get invalid values for this semantic type
    const invalidValues = INVALID_VALUES[inference.inferredType];
    if (invalidValues.length === 0) continue;

    // Build base args with required params
    const baseArgs: Record<string, unknown> = {};
    for (const req of requiredParams) {
      if (req !== paramName) {
        // Provide a valid placeholder for other required params
        baseArgs[req] = generatePlaceholderValue(req, schema.properties[req]);
      }
    }

    // Generate tests with invalid semantic values
    const valuesToTest = invalidValues.slice(0, maxInvalidValuesPerParam);
    for (const invalidValue of valuesToTest) {
      tests.push({
        description: `Semantic validation: invalid ${formatSemanticType(inference.inferredType)} for "${paramName}"`,
        category: 'error_handling' as QuestionCategory,
        args: {
          ...baseArgs,
          [paramName]: invalidValue,
        },
        metadata: {
          semanticType: inference.inferredType,
          expectedBehavior: 'reject',
          confidence: inference.confidence,
        },
      });
    }
  }

  return { tests, inferences };
}

/**
 * Generate a placeholder value for a required parameter.
 * Used to provide valid values for other params when testing one param.
 */
function generatePlaceholderValue(
  paramName: string,
  propSchema?: { type?: string; description?: string; format?: string }
): unknown {
  if (!propSchema) return 'test';

  const type = propSchema.type;

  switch (type) {
    case 'string':
      return generateStringPlaceholder(paramName, propSchema);
    case 'number':
    case 'integer':
      return 1;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return 'test';
  }
}

/**
 * Generate a placeholder string value based on parameter name and format.
 */
function generateStringPlaceholder(
  paramName: string,
  propSchema: { description?: string; format?: string }
): string {
  // Use format hint if available
  if (propSchema.format === 'date') return '2024-01-15';
  if (propSchema.format === 'date-time') return '2024-01-15T12:00:00Z';
  if (propSchema.format === 'email') return 'test@example.com';
  if (propSchema.format === 'uri' || propSchema.format === 'url') return 'https://example.com';
  if (propSchema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';

  // Infer from name
  const lowerName = paramName.toLowerCase();
  if (lowerName.includes('date')) return '2024-01-15';
  if (lowerName.includes('email')) return 'test@example.com';
  if (lowerName.includes('url') || lowerName.includes('uri')) return 'https://example.com';
  if (lowerName.includes('id')) return 'test-id-123';
  if (lowerName.includes('path') || lowerName.includes('file')) return '/tmp/test';
  if (lowerName.includes('phone')) return '+1234567890';

  return 'test';
}

/**
 * Format semantic type for display in test descriptions.
 */
function formatSemanticType(type: SemanticType): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get the invalid test values for a semantic type.
 * Useful for external modules that need access to the test values.
 */
export function getInvalidValuesForType(type: SemanticType): readonly string[] {
  return INVALID_VALUES[type] ?? [];
}

/**
 * Get all semantic types that have invalid test values defined.
 */
export function getTestableSemanticTypes(): SemanticType[] {
  return (Object.entries(INVALID_VALUES) as [SemanticType, string[]][])
    .filter(([, values]) => values.length > 0)
    .map(([type]) => type);
}
