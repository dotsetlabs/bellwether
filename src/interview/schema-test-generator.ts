/**
 * Schema-based test generator for deterministic testing in check mode.
 *
 * Generates comprehensive test cases from JSON Schema without requiring LLM.
 * This module is the core of the enhanced testing capability, producing
 * 8-12 tests per tool covering boundaries, types, enums, and error handling.
 */

import type { MCPTool } from '../transport/types.js';
import type { InterviewQuestion } from './types.js';
import type { QuestionCategory } from '../persona/types.js';
import { SCHEMA_TESTING, SEMANTIC_VALIDATION } from '../constants.js';
import { generateSemanticTests } from '../validation/semantic-test-generator.js';
import type { SemanticInference } from '../validation/semantic-types.js';

// ==================== Types ====================

/**
 * Property schema interface matching JSON Schema specification.
 * Extended for structural test generation.
 */
interface PropertySchema {
    type?: string | string[];
    enum?: unknown[];
    const?: unknown;
    default?: unknown;
    examples?: unknown[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    items?: PropertySchema;
    properties?: Record<string, PropertySchema>;
    required?: string[];
    description?: string;
    oneOf?: PropertySchema[];
    anyOf?: PropertySchema[];
}

/**
 * Input schema interface for tool input validation.
 */
interface InputSchema {
    type?: string;
    properties?: Record<string, PropertySchema>;
    required?: string[];
    examples?: unknown[];
    default?: unknown;
}

/**
 * Options for test generation.
 */
export interface SchemaTestGeneratorOptions {
    /** Skip error handling tests (e.g., missing required params) */
    skipErrorTests?: boolean;
    /** Maximum tests per tool (overrides default) */
    maxTestsPerTool?: number;
    /** Skip semantic validation tests (default: false) */
    skipSemanticTests?: boolean;
}

/**
 * Result of schema test generation including semantic inferences.
 */
export interface SchemaTestGeneratorResult {
    /** Generated test questions */
    questions: InterviewQuestion[];
    /** Semantic type inferences for parameters */
    semanticInferences: SemanticInference[];
}

// ==================== Helper Functions ====================

/**
 * Get the primary type from a schema property.
 */
function getPrimaryType(schema: PropertySchema): string | undefined {
    if (Array.isArray(schema.type)) {
        // Return first non-null type
        return schema.type.find((t) => t !== 'null') ?? schema.type[0];
    }
    return schema.type;
}

/**
 * Generate a smart default value for a property based on its type and constraints.
 */
function generateDefaultValue(
    propName: string,
    prop: PropertySchema
): unknown {
    const type = getPrimaryType(prop);

    // Use schema example if available
    if (prop.examples && prop.examples.length > 0) {
        return prop.examples[0];
    }

    // Use schema default if available
    if (prop.default !== undefined) {
        return prop.default;
    }

    // Use first enum value if available
    if (prop.enum && prop.enum.length > 0) {
        return prop.enum[0];
    }

    // Use const value if available
    if (prop.const !== undefined) {
        return prop.const;
    }

    // Generate based on type
    switch (type) {
        case 'string':
            return generateSmartStringValue(propName, prop);
        case 'number':
        case 'integer':
            return generateSmartNumberValue(prop);
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
 * Generate a contextually appropriate string value based on property name and constraints.
 */
function generateSmartStringValue(
    propName: string,
    prop: PropertySchema
): string {
    const lowerName = propName.toLowerCase();

    // Check for common patterns in property names
    if (lowerName.includes('date')) {
        return '2024-01-15';
    }
    if (lowerName.includes('time')) {
        return '14:30:00';
    }
    if (lowerName.includes('email')) {
        return 'test@example.com';
    }
    if (lowerName.includes('url') || lowerName.includes('uri')) {
        return 'https://example.com';
    }
    if (lowerName.includes('path') || lowerName.includes('directory') || lowerName.includes('dir')) {
        return '/tmp/test';
    }
    if (lowerName.includes('id')) {
        return 'test-id-123';
    }
    if (lowerName.includes('name')) {
        return 'test-name';
    }
    if (lowerName.includes('query') || lowerName.includes('search')) {
        return 'test query';
    }
    if (lowerName.includes('token')) {
        return 'test-token-abc123';
    }

    // Check format hints
    if (prop.format === 'date') {
        return '2024-01-15';
    }
    if (prop.format === 'date-time') {
        return '2024-01-15T14:30:00Z';
    }
    if (prop.format === 'email') {
        return 'test@example.com';
    }
    if (prop.format === 'uri' || prop.format === 'url') {
        return 'https://example.com';
    }

    // Default fallback
    return 'test';
}

/**
 * Generate a contextually appropriate number value based on constraints.
 */
function generateSmartNumberValue(prop: PropertySchema): number {
    const min = prop.minimum ?? 0;
    const max = prop.maximum ?? 100;

    // Use midpoint between min and max if both are specified
    if (prop.minimum !== undefined && prop.maximum !== undefined) {
        return Math.floor((min + max) / 2);
    }

    // Use minimum + 1 if only minimum is specified
    if (prop.minimum !== undefined) {
        return min + 1;
    }

    // Use reasonable defaults
    return 1;
}

/**
 * Add a question to the list, avoiding duplicates.
 */
function addQuestion(
    questions: InterviewQuestion[],
    question: InterviewQuestion
): void {
    // Check for duplicates based on args
    const argsJson = JSON.stringify(question.args);
    const isDuplicate = questions.some(
        (q) => JSON.stringify(q.args) === argsJson
    );
    if (!isDuplicate) {
        questions.push(question);
    }
}

/**
 * Build base args with required parameters populated.
 */
function buildBaseArgs(
    properties: Record<string, PropertySchema>,
    requiredParams: string[]
): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    for (const param of requiredParams) {
        const prop = properties[param];
        if (prop) {
            args[param] = generateDefaultValue(param, prop);
        }
    }
    return args;
}

// ==================== Test Generators ====================

/**
 * Generate happy path tests.
 * Tests the tool with valid, expected inputs.
 */
function generateHappyPathTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[]
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    // Test 1: Empty args (if no required params)
    if (requiredParams.length === 0) {
        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: empty arguments`,
            category: 'happy_path' as QuestionCategory,
            args: {},
        });
    }

    // Test 2: Minimal required args with smart defaults
    if (requiredParams.length > 0) {
        const minimalArgs = buildBaseArgs(properties, requiredParams);
        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: minimal required arguments`,
            category: 'happy_path' as QuestionCategory,
            args: minimalArgs,
        });
    }

    // Test 3: All parameters with defaults (if there are optional params)
    const optionalParams = Object.keys(properties).filter(
        (p) => !requiredParams.includes(p)
    );
    if (optionalParams.length > 0 && questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
        const fullArgs = buildBaseArgs(properties, requiredParams);
        for (const param of optionalParams.slice(0, 3)) {
            const prop = properties[param];
            if (prop) {
                fullArgs[param] = generateDefaultValue(param, prop);
            }
        }
        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: with optional parameters`,
            category: 'happy_path' as QuestionCategory,
            args: fullArgs,
        });
    }

    return questions.slice(0, SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY);
}

/**
 * Generate boundary value tests.
 * Tests edge cases like empty strings, zero, large numbers.
 */
function generateBoundaryTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[]
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { BOUNDARY_VALUES, CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    for (const [propName, prop] of Object.entries(properties)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        const type = getPrimaryType(prop);
        const baseArgs = buildBaseArgs(properties, requiredParams);

        switch (type) {
            case 'string': {
                // Test empty string
                if (prop.minLength === undefined || prop.minLength === 0) {
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.BOUNDARY}: empty string for "${propName}"`,
                        category: 'edge_case' as QuestionCategory,
                        args: { ...baseArgs, [propName]: BOUNDARY_VALUES.EMPTY_STRING },
                    });
                }

                // Test long string if no maxLength
                if (prop.maxLength === undefined && questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
                    const longString = 'x'.repeat(BOUNDARY_VALUES.LONG_STRING_LENGTH);
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.BOUNDARY}: long string for "${propName}"`,
                        category: 'edge_case' as QuestionCategory,
                        args: { ...baseArgs, [propName]: longString },
                    });
                }
                break;
            }

            case 'number':
            case 'integer': {
                // Test zero
                if (prop.minimum === undefined || prop.minimum <= 0) {
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.BOUNDARY}: zero for "${propName}"`,
                        category: 'edge_case' as QuestionCategory,
                        args: { ...baseArgs, [propName]: BOUNDARY_VALUES.ZERO },
                    });
                }

                // Test negative (if allowed or not specified)
                if (
                    (prop.minimum === undefined || prop.minimum < 0) &&
                    questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY
                ) {
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.BOUNDARY}: negative value for "${propName}"`,
                        category: 'edge_case' as QuestionCategory,
                        args: { ...baseArgs, [propName]: BOUNDARY_VALUES.NEGATIVE_ONE },
                    });
                }

                // Test large number
                if (
                    prop.maximum === undefined &&
                    questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY
                ) {
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.BOUNDARY}: large value for "${propName}"`,
                        category: 'edge_case' as QuestionCategory,
                        args: { ...baseArgs, [propName]: BOUNDARY_VALUES.LARGE_POSITIVE },
                    });
                }
                break;
            }

            case 'array': {
                // Test empty array
                addQuestion(questions, {
                    description: `${CATEGORY_DESCRIPTIONS.ARRAY_HANDLING}: empty array for "${propName}"`,
                    category: 'edge_case' as QuestionCategory,
                    args: { ...baseArgs, [propName]: [] },
                });
                break;
            }
        }
    }

    return questions.slice(0, SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY);
}

/**
 * Generate type coercion tests.
 * Tests what happens when wrong types are passed.
 */
function generateTypeCoercionTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[]
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { TYPE_COERCION, CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    for (const [propName, prop] of Object.entries(properties)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        const type = getPrimaryType(prop);
        const baseArgs = buildBaseArgs(properties, requiredParams);

        switch (type) {
            case 'number':
            case 'integer':
                // Pass string instead of number
                addQuestion(questions, {
                    description: `${CATEGORY_DESCRIPTIONS.TYPE_COERCION}: string for number "${propName}"`,
                    category: 'error_handling' as QuestionCategory,
                    args: { ...baseArgs, [propName]: TYPE_COERCION.NUMERIC_STRING },
                });
                break;

            case 'boolean':
                // Pass string instead of boolean
                addQuestion(questions, {
                    description: `${CATEGORY_DESCRIPTIONS.TYPE_COERCION}: string for boolean "${propName}"`,
                    category: 'error_handling' as QuestionCategory,
                    args: { ...baseArgs, [propName]: TYPE_COERCION.TRUE_STRING },
                });
                break;

            case 'string':
                // Pass number instead of string
                if (questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.TYPE_COERCION}: number for string "${propName}"`,
                        category: 'error_handling' as QuestionCategory,
                        args: { ...baseArgs, [propName]: 12345 },
                    });
                }
                break;
        }
    }

    return questions.slice(0, SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY);
}

/**
 * Generate enum validation tests.
 * Tests that invalid enum values are properly rejected.
 */
function generateEnumTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[]
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { INVALID_ENUM_VALUES, CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    for (const [propName, prop] of Object.entries(properties)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        if (prop.enum && prop.enum.length > 0) {
            const baseArgs = buildBaseArgs(properties, requiredParams);
            addQuestion(questions, {
                description: `${CATEGORY_DESCRIPTIONS.ENUM_VIOLATION}: invalid enum for "${propName}"`,
                category: 'error_handling' as QuestionCategory,
                args: { ...baseArgs, [propName]: INVALID_ENUM_VALUES[0] },
            });
        }
    }

    return questions;
}

/**
 * Generate array handling tests.
 * Tests arrays with different sizes.
 */
function generateArrayTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[]
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { ARRAY_TESTS, CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    for (const [propName, prop] of Object.entries(properties)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        const type = getPrimaryType(prop);
        if (type === 'array' && prop.items) {
            const baseArgs = buildBaseArgs(properties, requiredParams);
            const itemType = getPrimaryType(prop.items);

            // Generate sample items
            let sampleItem: unknown = 'item';
            if (itemType === 'number' || itemType === 'integer') {
                sampleItem = 1;
            } else if (itemType === 'boolean') {
                sampleItem = true;
            } else if (itemType === 'object') {
                sampleItem = {};
            }

            // Test with single item
            addQuestion(questions, {
                description: `${CATEGORY_DESCRIPTIONS.ARRAY_HANDLING}: single item for "${propName}"`,
                category: 'edge_case' as QuestionCategory,
                args: { ...baseArgs, [propName]: [sampleItem] },
            });

            // Test with many items
            if (questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
                const manyItems = Array(ARRAY_TESTS.MANY_ITEMS_COUNT).fill(sampleItem);
                addQuestion(questions, {
                    description: `${CATEGORY_DESCRIPTIONS.ARRAY_HANDLING}: many items for "${propName}"`,
                    category: 'edge_case' as QuestionCategory,
                    args: { ...baseArgs, [propName]: manyItems },
                });
            }
        }
    }

    return questions;
}

/**
 * Generate null/undefined handling tests.
 * Tests how the tool handles null and undefined values.
 */
function generateNullabilityTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[]
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    // Test null for optional parameters
    const optionalParams = Object.keys(properties).filter(
        (p) => !requiredParams.includes(p)
    );

    for (const propName of optionalParams.slice(0, 2)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        const baseArgs = buildBaseArgs(properties, requiredParams);
        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.NULL_HANDLING}: null for optional "${propName}"`,
            category: 'edge_case' as QuestionCategory,
            args: { ...baseArgs, [propName]: null },
        });
    }

    return questions;
}

/**
 * Generate error handling tests.
 * Tests that required parameters are properly validated.
 */
function generateErrorHandlingTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[]
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    // Test missing all required params
    if (requiredParams.length > 0) {
        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.MISSING_REQUIRED}: missing all required arguments`,
            category: 'error_handling' as QuestionCategory,
            args: {},
        });
    }

    // Test missing each required param individually
    for (const param of requiredParams.slice(0, 2)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        const partialArgs = buildBaseArgs(properties, requiredParams);
        delete partialArgs[param];

        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.MISSING_REQUIRED}: missing "${param}"`,
            category: 'error_handling' as QuestionCategory,
            args: partialArgs,
        });
    }

    return questions;
}

// ==================== Main Export ====================

/**
 * Generate comprehensive schema-based test cases for a tool.
 *
 * This function analyzes the tool's JSON Schema and generates deterministic
 * test cases covering:
 * - Happy path (valid inputs)
 * - Boundary values (empty strings, zero, large numbers)
 * - Type coercion (wrong types)
 * - Enum validation (invalid enum values)
 * - Array handling (empty, single, many items)
 * - Null/undefined handling
 * - Error handling (missing required params)
 * - Semantic validation (date formats, emails, URLs, etc.)
 *
 * @param tool - The MCP tool to generate tests for
 * @param options - Configuration options
 * @returns Array of interview questions (test cases)
 */
export function generateSchemaTests(
    tool: MCPTool,
    options: SchemaTestGeneratorOptions = {}
): InterviewQuestion[] {
    const result = generateSchemaTestsWithInferences(tool, options);
    return result.questions;
}

/**
 * Generate schema-based tests with semantic inference information.
 *
 * This variant returns both the test questions and semantic type inferences,
 * useful when you need to track inferred types for documentation.
 *
 * @param tool - The MCP tool to generate tests for
 * @param options - Configuration options
 * @returns Test questions and semantic inferences
 */
export function generateSchemaTestsWithInferences(
    tool: MCPTool,
    options: SchemaTestGeneratorOptions = {}
): SchemaTestGeneratorResult {
    const questions: InterviewQuestion[] = [];
    const schema = tool.inputSchema as InputSchema | undefined;
    const maxTests = options.maxTestsPerTool ?? SCHEMA_TESTING.MAX_TESTS_PER_TOOL;

    const properties = schema?.properties ?? {};
    const requiredParams = (schema?.required ?? []) as string[];

    // 1. Happy Path Tests (always included)
    questions.push(...generateHappyPathTests(properties, requiredParams));

    // 2. Boundary Value Tests
    questions.push(...generateBoundaryTests(properties, requiredParams));

    // 3. Type Coercion Tests (unless skipping error tests)
    if (!options.skipErrorTests) {
        questions.push(...generateTypeCoercionTests(properties, requiredParams));
    }

    // 4. Enum Validation Tests (unless skipping error tests)
    if (!options.skipErrorTests) {
        questions.push(...generateEnumTests(properties, requiredParams));
    }

    // 5. Array Handling Tests
    questions.push(...generateArrayTests(properties, requiredParams));

    // 6. Nullability Tests
    questions.push(...generateNullabilityTests(properties, requiredParams));

    // 7. Error Handling Tests (unless skipped)
    if (!options.skipErrorTests) {
        questions.push(...generateErrorHandlingTests(properties, requiredParams));
    }

    // 8. Semantic Validation Tests (unless skipped)
    let semanticInferences: SemanticInference[] = [];
    if (!options.skipSemanticTests) {
        const semanticResult = generateSemanticTests(tool, {
            minConfidence: SEMANTIC_VALIDATION.MIN_CONFIDENCE_THRESHOLD,
            maxInvalidValuesPerParam: SEMANTIC_VALIDATION.MAX_INVALID_VALUES_PER_PARAM,
        });
        // Limit semantic tests to prevent explosion
        const semanticTestsToAdd = semanticResult.tests.slice(
            0,
            SEMANTIC_VALIDATION.MAX_SEMANTIC_TESTS_PER_TOOL
        );
        questions.push(...semanticTestsToAdd);
        semanticInferences = semanticResult.inferences;
    }

    // Enforce minimum tests for statistical confidence
    // For simple tools with few/no parameters, repeat the happy path test
    // Use the greater of MIN_TESTS_PER_TOOL and maxTests (target confidence samples)
    const minTests = Math.max(SCHEMA_TESTING.MIN_TESTS_PER_TOOL, maxTests);
    if (questions.length < minTests && questions.length > 0) {
        const baseTest = questions[0]; // Use first test as template
        while (questions.length < minTests) {
            questions.push({
                ...baseTest,
                description: `${baseTest.description} (repeat ${questions.length})`,
            });
        }
    }

    // Limit total tests
    return {
        questions: questions.slice(0, maxTests),
        semanticInferences,
    };
}
