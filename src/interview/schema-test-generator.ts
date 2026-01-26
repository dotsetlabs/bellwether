/**
 * Schema-based test generator for deterministic testing in check mode.
 *
 * Generates comprehensive test cases from JSON Schema without requiring LLM.
 * This module is the core of the enhanced testing capability, producing
 * 8-12 tests per tool covering boundaries, types, enums, and error handling.
 */

import type { MCPTool } from '../transport/types.js';
import type { InterviewQuestion, ExpectedOutcome } from './types.js';
import type { QuestionCategory } from '../persona/types.js';
import { SCHEMA_TESTING, SEMANTIC_VALIDATION, OUTCOME_ASSESSMENT } from '../constants.js';
import { SMART_VALUE_GENERATION } from '../constants/testing.js';
import { generateSemanticTests } from '../validation/semantic-test-generator.js';
import type { SemanticInference } from '../validation/semantic-types.js';
// Smart value generation is implemented inline below, but the module is available
// for external use: import { generateSmartValue } from './smart-value-generator.js';

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
    minItems?: number;
    maxItems?: number;
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
 * Test fixture pattern for matching parameter names.
 */
export interface TestFixturePattern {
    /** Regex pattern to match parameter names */
    match: string;
    /** Value to use for matching parameters */
    value: unknown;
}

/**
 * Test fixtures configuration for customizing test values.
 */
export interface TestFixturesConfig {
    /** Custom values for specific parameter names (exact match) */
    parameterValues?: Record<string, unknown>;
    /** Custom values for parameters matching regex patterns */
    patterns?: TestFixturePattern[];
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
    /** Custom test fixtures for overriding default values */
    testFixtures?: TestFixturesConfig;
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
 * Generate a default value for a nested schema.
 * Used when generating array items or object properties.
 */
function generateDefaultValueForSchema(
    schema: PropertySchema,
    fixtures?: TestFixturesConfig
): unknown {
    const type = getPrimaryType(schema);

    // Use schema example if available
    if (schema.examples && schema.examples.length > 0) {
        return schema.examples[0];
    }

    // Use schema default if available
    if (schema.default !== undefined) {
        return schema.default;
    }

    // Use first enum value if available
    if (schema.enum && schema.enum.length > 0) {
        return schema.enum[0];
    }

    // Use const value if available
    if (schema.const !== undefined) {
        return schema.const;
    }

    // Generate based on type
    switch (type) {
        case 'string':
            return generateSmartStringValueForSchema(schema);
        case 'number':
            return generateSmartNumberValue(schema);
        case 'integer':
            return Math.floor(generateSmartNumberValue(schema));
        case 'boolean':
            return true;
        case 'array':
            return generateMinimalArray(schema, fixtures);
        case 'object':
            return generateMinimalObject(schema, fixtures);
        case 'null':
            return null;
        default:
            return 'test';
    }
}

/**
 * Generate a smart string value for a schema without property name context.
 * Used for nested array items where we don't have a property name.
 */
function generateSmartStringValueForSchema(schema: PropertySchema): string {
    const description = (schema.description ?? '').toLowerCase();

    // Check description for explicit format hints
    for (const { pattern, value } of DATE_FORMAT_PATTERNS) {
        if (pattern.test(schema.description ?? '') || pattern.test(description)) {
            return value;
        }
    }

    for (const { pattern, value } of SEMANTIC_FORMAT_PATTERNS) {
        if (pattern.test(schema.description ?? '') || pattern.test(description)) {
            return value;
        }
    }

    // Check schema format field
    if (schema.format === 'date') return '2024-01-15';
    if (schema.format === 'date-time') return '2024-01-15T14:30:00Z';
    if (schema.format === 'email') return 'test@example.com';
    if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com';
    if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
    if (schema.format === 'ipv4') return '192.168.1.100';
    if (schema.format === 'time') return '14:30:00';

    // Respect minLength constraint
    const minLength = schema.minLength ?? 0;
    if (minLength > 4) {
        return 'test'.padEnd(minLength, 'x');
    }

    return 'test';
}

/**
 * Generate a minimal array that satisfies minItems constraint.
 */
function generateMinimalArray(
    schema: PropertySchema,
    fixtures?: TestFixturesConfig
): unknown[] {
    const minItems = schema.minItems ?? 0;
    const itemSchema = schema.items;

    if (minItems === 0) {
        return [];
    }

    // Generate the minimum required number of items
    const items: unknown[] = [];
    for (let i = 0; i < minItems; i++) {
        if (itemSchema) {
            items.push(generateDefaultValueForSchema(itemSchema, fixtures));
        } else {
            // No item schema, use generic values
            items.push('item');
        }
    }

    return items;
}

/**
 * Generate a minimal object that satisfies required properties constraint.
 */
function generateMinimalObject(
    schema: PropertySchema,
    fixtures?: TestFixturesConfig
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const requiredProps = schema.required ?? [];
    const properties = schema.properties ?? {};

    // Only populate required properties
    for (const propName of requiredProps) {
        const propSchema = properties[propName];
        if (propSchema) {
            // Use the property name to generate a contextual value
            result[propName] = generateDefaultValueForPropertySchema(propName, propSchema, fixtures);
        } else {
            // No schema for required property, use generic value
            result[propName] = 'test';
        }
    }

    return result;
}

/**
 * Generate an array with a specific number of items based on the item schema.
 * Used for boundary testing at minItems/maxItems limits.
 */
function generateArrayItems(itemSchema: PropertySchema | undefined, count: number): unknown[] {
    const items: unknown[] = [];
    for (let i = 0; i < count; i++) {
        if (itemSchema) {
            items.push(generateDefaultValueForSchema(itemSchema));
        } else {
            items.push('item');
        }
    }
    return items;
}

/**
 * Generate a default value for a property with both name and schema context.
 * This is the recursive version that handles nested structures.
 */
function generateDefaultValueForPropertySchema(
    propName: string,
    schema: PropertySchema,
    fixtures?: TestFixturesConfig
): unknown {
    // Check fixtures first
    const fixtureValue = getFixtureValue(propName, fixtures);
    if (fixtureValue !== undefined) {
        return fixtureValue;
    }

    const type = getPrimaryType(schema);

    // Use schema example if available
    if (schema.examples && schema.examples.length > 0) {
        return schema.examples[0];
    }

    // Use schema default if available
    if (schema.default !== undefined) {
        return schema.default;
    }

    // Use first enum value if available
    if (schema.enum && schema.enum.length > 0) {
        return schema.enum[0];
    }

    // Use const value if available
    if (schema.const !== undefined) {
        return schema.const;
    }

    // Generate based on type
    switch (type) {
        case 'string':
            return generateSmartStringValue(propName, schema);
        case 'number':
        case 'integer':
            return generateSmartNumberValue(schema, propName);
        case 'boolean':
            return true;
        case 'array':
            return generateMinimalArray(schema, fixtures);
        case 'object':
            return generateMinimalObject(schema, fixtures);
        case 'null':
            return null;
        default:
            return 'test';
    }
}

/**
 * Check if a property name matches any fixture pattern.
 * Returns the fixture value if matched, undefined otherwise.
 */
function getFixtureValueByPattern(
    propName: string,
    patterns?: TestFixturePattern[]
): unknown | undefined {
    if (!patterns || patterns.length === 0) {
        return undefined;
    }

    for (const pattern of patterns) {
        try {
            const regex = new RegExp(pattern.match);
            if (regex.test(propName)) {
                return pattern.value;
            }
        } catch {
            // Invalid regex pattern, skip
            continue;
        }
    }

    return undefined;
}

/**
 * Get a fixture value for a property name, checking exact match first,
 * then pattern match.
 */
function getFixtureValue(
    propName: string,
    fixtures?: TestFixturesConfig
): unknown | undefined {
    if (!fixtures) {
        return undefined;
    }

    // Priority 1: Exact match in parameterValues
    if (fixtures.parameterValues && propName in fixtures.parameterValues) {
        return fixtures.parameterValues[propName];
    }

    // Priority 2: Pattern match
    return getFixtureValueByPattern(propName, fixtures.patterns);
}

/**
 * Generate a smart default value for a property based on its type and constraints.
 * Checks test fixtures first if provided.
 */
function generateDefaultValue(
    propName: string,
    prop: PropertySchema,
    fixtures?: TestFixturesConfig
): unknown {
    // Priority 0: Check test fixtures first
    const fixtureValue = getFixtureValue(propName, fixtures);
    if (fixtureValue !== undefined) {
        return fixtureValue;
    }

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
            return generateSmartNumberValue(prop, propName);
        case 'boolean':
            return true;
        case 'array':
            return generateMinimalArray(prop, fixtures);
        case 'object':
            return generateMinimalObject(prop, fixtures);
        case 'null':
            return null;
        default:
            return 'test';
    }
}

/**
 * Pattern matchers for detecting date/time formats in descriptions.
 * Each pattern maps to a format string and example value.
 */
const DATE_FORMAT_PATTERNS: Array<{
    pattern: RegExp;
    value: string;
    formatName: string;
}> = [
    // ISO 8601 date patterns
    { pattern: /YYYY-MM-DD|ISO\s*8601\s*date|date.*format.*YYYY/i, value: '2024-01-15', formatName: 'ISO 8601 date' },
    { pattern: /YYYY-MM|year-month|month.*format/i, value: '2024-01', formatName: 'year-month' },
    { pattern: /ISO\s*8601\s*(datetime|timestamp)|datetime.*format|timestamp.*ISO/i, value: '2024-01-15T14:30:00Z', formatName: 'ISO 8601 datetime' },
    // Unix timestamp patterns
    { pattern: /unix\s*timestamp|epoch\s*time|seconds\s*since/i, value: '1705330200', formatName: 'Unix timestamp' },
    { pattern: /milliseconds?\s*(since|timestamp)|ms\s*timestamp/i, value: '1705330200000', formatName: 'Unix timestamp (ms)' },
    // Time patterns
    { pattern: /HH:MM:SS|time.*format.*HH|24.hour.*time/i, value: '14:30:00', formatName: '24-hour time' },
    { pattern: /HH:MM|hour.*minute/i, value: '14:30', formatName: 'hour:minute' },
    // Other date formats
    { pattern: /MM\/DD\/YYYY|US\s*date/i, value: '01/15/2024', formatName: 'US date' },
    { pattern: /DD\/MM\/YYYY|European\s*date/i, value: '15/01/2024', formatName: 'European date' },
];

/**
 * Pattern matchers for detecting other semantic types in descriptions.
 */
const SEMANTIC_FORMAT_PATTERNS: Array<{
    pattern: RegExp;
    value: string;
    formatName: string;
}> = [
    // Currency/money patterns
    { pattern: /currency.*amount|dollar.*amount|price/i, value: '99.99', formatName: 'currency' },
    { pattern: /percentage|percent/i, value: '50', formatName: 'percentage' },
    // Phone patterns
    { pattern: /phone.*number|telephone/i, value: '+1-555-123-4567', formatName: 'phone' },
    // UUID patterns
    { pattern: /UUID|unique.*identifier/i, value: '550e8400-e29b-41d4-a716-446655440000', formatName: 'UUID' },
    // IP address patterns
    { pattern: /IP.*address|IPv4/i, value: '192.168.1.100', formatName: 'IP address' },
    // JSON patterns
    { pattern: /JSON\s*string|stringify|serialized/i, value: '{"key": "value"}', formatName: 'JSON' },
    // Base64 patterns
    { pattern: /base64|encoded/i, value: 'dGVzdA==', formatName: 'base64' },
];

/**
 * Generate a contextually appropriate string value based on property name,
 * constraints, and description.
 *
 * This function implements smart test value generation by:
 * 1. Parsing schema descriptions for format hints (e.g., "YYYY-MM-DD")
 * 2. Checking schema format field
 * 3. Inferring from property name patterns
 */
function generateSmartStringValue(
    propName: string,
    prop: PropertySchema
): string {
    const lowerName = propName.toLowerCase();
    const description = (prop.description ?? '').toLowerCase();

    // Priority 1: Check description for explicit date/time format hints
    // This is the most reliable indicator since the schema author specified it
    for (const { pattern, value } of DATE_FORMAT_PATTERNS) {
        if (pattern.test(prop.description ?? '') || pattern.test(description)) {
            return value;
        }
    }

    // Priority 2: Check description for other semantic format hints
    for (const { pattern, value } of SEMANTIC_FORMAT_PATTERNS) {
        if (pattern.test(prop.description ?? '') || pattern.test(description)) {
            return value;
        }
    }

    // Priority 3: Check schema format field (JSON Schema standard)
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
    if (prop.format === 'uuid') {
        return '550e8400-e29b-41d4-a716-446655440000';
    }
    if (prop.format === 'ipv4') {
        return '192.168.1.100';
    }
    if (prop.format === 'time') {
        return '14:30:00';
    }

    // Priority 4: Infer from property name patterns
    if (lowerName.includes('date') || description.includes('date')) {
        return '2024-01-15';
    }
    if (lowerName.includes('time') || description.includes('time')) {
        return '14:30:00';
    }
    if (lowerName.includes('email') || description.includes('email')) {
        return 'test@example.com';
    }
    if (lowerName.includes('url') || lowerName.includes('uri') ||
        description.includes('url') || description.includes('uri')) {
        return 'https://example.com';
    }
    if (lowerName.includes('path') || lowerName.includes('directory') ||
        lowerName.includes('dir') || description.includes('path')) {
        return '/tmp/test';
    }
    if (lowerName.includes('id') || description.includes('identifier')) {
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
    if (lowerName.includes('account') || description.includes('account')) {
        return 'test-account-123';
    }
    if (lowerName.includes('amount') || description.includes('amount')) {
        return '100.00';
    }
    if (lowerName.includes('category') || description.includes('category')) {
        return 'test-category';
    }

    // Default fallback
    return 'test';
}

/**
 * Generate a contextually appropriate number value based on constraints and property name.
 * Detects coordinates (latitude/longitude) and pagination parameters.
 */
function generateSmartNumberValue(prop: PropertySchema, propName?: string): number {
    const { COORDINATES, PAGINATION } = SMART_VALUE_GENERATION;
    const lowerName = (propName ?? '').toLowerCase();
    const description = (prop.description ?? '').toLowerCase();

    // Check for latitude patterns
    for (const pattern of COORDINATES.LATITUDE_PATTERNS) {
        if (pattern.test(propName ?? '') || pattern.test(description)) {
            // Ensure value is within valid latitude range
            const value = COORDINATES.DEFAULTS.latitude;
            if (prop.minimum !== undefined && value < prop.minimum) {
                return prop.minimum;
            }
            if (prop.maximum !== undefined && value > prop.maximum) {
                return prop.maximum;
            }
            return value;
        }
    }

    // Check for longitude patterns
    for (const pattern of COORDINATES.LONGITUDE_PATTERNS) {
        if (pattern.test(propName ?? '') || pattern.test(description)) {
            // Ensure value is within valid longitude range
            const value = COORDINATES.DEFAULTS.longitude;
            if (prop.minimum !== undefined && value < prop.minimum) {
                return prop.minimum;
            }
            if (prop.maximum !== undefined && value > prop.maximum) {
                return prop.maximum;
            }
            return value;
        }
    }

    // Check for pagination patterns
    for (const pattern of PAGINATION.LIMIT_PATTERNS) {
        if (pattern.test(propName ?? '')) {
            const value = PAGINATION.DEFAULTS.limit;
            if (prop.minimum !== undefined && value < prop.minimum) {
                return prop.minimum;
            }
            if (prop.maximum !== undefined && value > prop.maximum) {
                return prop.maximum;
            }
            return value;
        }
    }

    for (const pattern of PAGINATION.OFFSET_PATTERNS) {
        if (pattern.test(propName ?? '')) {
            // Distinguish between offset/skip (start at 0) and page (start at 1)
            const lowerPropName = (propName ?? '').toLowerCase();
            if (lowerPropName === 'page' || lowerPropName.includes('page')) {
                return PAGINATION.DEFAULTS.page;
            }
            return PAGINATION.DEFAULTS.offset;
        }
    }

    // Check for year detection in name/description
    if (lowerName.includes('year') || description.includes('year')) {
        return 2024;
    }

    // Check for percentage
    if (lowerName.includes('percent') || description.includes('percent')) {
        return 50;
    }

    // Standard value generation based on constraints
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
 * Determine expected outcome for a test based on its category and description.
 * Uses OUTCOME_ASSESSMENT constants to classify tests.
 *
 * @param category - Test category
 * @param description - Test description
 * @returns Expected outcome: 'success', 'error', or 'either'
 */
export function determineExpectedOutcome(
    category: QuestionCategory,
    description: string
): ExpectedOutcome {
    // Check if category expects error
    if (OUTCOME_ASSESSMENT.EXPECTS_ERROR_CATEGORIES.includes(
        category as typeof OUTCOME_ASSESSMENT.EXPECTS_ERROR_CATEGORIES[number]
    )) {
        return 'error';
    }

    // Check if category expects success
    if (OUTCOME_ASSESSMENT.EXPECTS_SUCCESS_CATEGORIES.includes(
        category as typeof OUTCOME_ASSESSMENT.EXPECTS_SUCCESS_CATEGORIES[number]
    )) {
        return 'success';
    }

    // Check description patterns for error expectation
    for (const pattern of OUTCOME_ASSESSMENT.EXPECTS_ERROR_PATTERNS) {
        if (pattern.test(description)) {
            return 'error';
        }
    }

    // Default to 'either' for edge cases
    return 'either';
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
    requiredParams: string[],
    fixtures?: TestFixturesConfig
): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    for (const param of requiredParams) {
        const prop = properties[param];
        if (prop) {
            args[param] = generateDefaultValue(param, prop, fixtures);
        }
    }
    return args;
}

// ==================== Test Generators ====================

/**
 * Generate happy path tests.
 * Tests the tool with valid, expected inputs.
 * All happy path tests expect success - errors indicate tool problems.
 */
function generateHappyPathTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[],
    fixtures?: TestFixturesConfig
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    // Test 1: Empty args (if no required params)
    if (requiredParams.length === 0) {
        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: empty arguments`,
            category: 'happy_path' as QuestionCategory,
            args: {},
            expectedOutcome: 'success',
        });
    }

    // Test 2: Minimal required args with smart defaults
    if (requiredParams.length > 0) {
        const minimalArgs = buildBaseArgs(properties, requiredParams, fixtures);
        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: minimal required arguments`,
            category: 'happy_path' as QuestionCategory,
            args: minimalArgs,
            expectedOutcome: 'success',
        });
    }

    // Test 3: All parameters with defaults (if there are optional params)
    const optionalParams = Object.keys(properties).filter(
        (p) => !requiredParams.includes(p)
    );
    if (optionalParams.length > 0 && questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
        const fullArgs = buildBaseArgs(properties, requiredParams, fixtures);
        for (const param of optionalParams.slice(0, 3)) {
            const prop = properties[param];
            if (prop) {
                fullArgs[param] = generateDefaultValue(param, prop, fixtures);
            }
        }
        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: with optional parameters`,
            category: 'happy_path' as QuestionCategory,
            args: fullArgs,
            expectedOutcome: 'success',
        });
    }

    return questions.slice(0, SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY);
}

/**
 * Generate boundary value tests.
 * Tests edge cases like empty strings, zero, large numbers.
 * Boundary tests use 'either' outcome - they may succeed or fail depending on tool implementation.
 */
function generateBoundaryTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[],
    fixtures?: TestFixturesConfig
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { BOUNDARY_VALUES, CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    for (const [propName, prop] of Object.entries(properties)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        const type = getPrimaryType(prop);
        const baseArgs = buildBaseArgs(properties, requiredParams, fixtures);

        switch (type) {
            case 'string': {
                // Test empty string
                if (prop.minLength === undefined || prop.minLength === 0) {
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.BOUNDARY}: empty string for "${propName}"`,
                        category: 'edge_case' as QuestionCategory,
                        args: { ...baseArgs, [propName]: BOUNDARY_VALUES.EMPTY_STRING },
                        expectedOutcome: 'either',
                    });
                }

                // Test long string if no maxLength
                if (prop.maxLength === undefined && questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
                    const longString = 'x'.repeat(BOUNDARY_VALUES.LONG_STRING_LENGTH);
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.BOUNDARY}: long string for "${propName}"`,
                        category: 'edge_case' as QuestionCategory,
                        args: { ...baseArgs, [propName]: longString },
                        expectedOutcome: 'either',
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
                        expectedOutcome: 'either',
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
                        expectedOutcome: 'either',
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
                        expectedOutcome: 'either',
                    });
                }
                break;
            }

            case 'array': {
                const minItems = prop.minItems ?? 0;
                const maxItems = prop.maxItems;

                // Test empty array only if minItems allows it (minItems = 0 or undefined)
                if (minItems === 0) {
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.ARRAY_HANDLING}: empty array for "${propName}"`,
                        category: 'edge_case' as QuestionCategory,
                        args: { ...baseArgs, [propName]: [] },
                        expectedOutcome: 'either',
                    });
                } else {
                    // Test array with fewer items than minItems (should be rejected)
                    const underflowCount = Math.max(0, minItems - 1);
                    const underflowItems = generateArrayItems(prop.items, underflowCount);
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.BOUNDARY}: array below minItems (${underflowCount}/${minItems}) for "${propName}"`,
                        category: 'error_handling' as QuestionCategory,
                        args: { ...baseArgs, [propName]: underflowItems },
                        expectedOutcome: 'error',
                    });
                }

                // Test array exceeding maxItems if defined
                if (maxItems !== undefined && questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
                    const overflowCount = maxItems + 1;
                    const overflowItems = generateArrayItems(prop.items, overflowCount);
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.BOUNDARY}: array above maxItems (${overflowCount}/${maxItems}) for "${propName}"`,
                        category: 'error_handling' as QuestionCategory,
                        args: { ...baseArgs, [propName]: overflowItems },
                        expectedOutcome: 'error',
                    });
                }
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
    requiredParams: string[],
    fixtures?: TestFixturesConfig
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { TYPE_COERCION, CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    for (const [propName, prop] of Object.entries(properties)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        const type = getPrimaryType(prop);
        const baseArgs = buildBaseArgs(properties, requiredParams, fixtures);

        switch (type) {
            case 'number':
            case 'integer':
                // Pass string instead of number - tool should reject
                addQuestion(questions, {
                    description: `${CATEGORY_DESCRIPTIONS.TYPE_COERCION}: string for number "${propName}"`,
                    category: 'error_handling' as QuestionCategory,
                    args: { ...baseArgs, [propName]: TYPE_COERCION.NUMERIC_STRING },
                    expectedOutcome: 'error',
                });
                break;

            case 'boolean':
                // Pass string instead of boolean - tool should reject
                addQuestion(questions, {
                    description: `${CATEGORY_DESCRIPTIONS.TYPE_COERCION}: string for boolean "${propName}"`,
                    category: 'error_handling' as QuestionCategory,
                    args: { ...baseArgs, [propName]: TYPE_COERCION.TRUE_STRING },
                    expectedOutcome: 'error',
                });
                break;

            case 'string':
                // Pass number instead of string - tool should reject
                if (questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.TYPE_COERCION}: number for string "${propName}"`,
                        category: 'error_handling' as QuestionCategory,
                        args: { ...baseArgs, [propName]: 12345 },
                        expectedOutcome: 'error',
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
 * All enum tests expect error - tool should reject invalid values.
 */
function generateEnumTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[],
    fixtures?: TestFixturesConfig
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { INVALID_ENUM_VALUES, CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    for (const [propName, prop] of Object.entries(properties)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        if (prop.enum && prop.enum.length > 0) {
            const baseArgs = buildBaseArgs(properties, requiredParams, fixtures);
            addQuestion(questions, {
                description: `${CATEGORY_DESCRIPTIONS.ENUM_VIOLATION}: invalid enum for "${propName}"`,
                category: 'error_handling' as QuestionCategory,
                args: { ...baseArgs, [propName]: INVALID_ENUM_VALUES[0] },
                expectedOutcome: 'error',
            });
        }
    }

    return questions;
}

/**
 * Generate array handling tests.
 * Tests arrays with different sizes, respecting minItems/maxItems constraints.
 * Array tests use 'either' outcome for valid sizes, 'error' for constraint violations.
 */
function generateArrayTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[],
    fixtures?: TestFixturesConfig
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { ARRAY_TESTS, CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    for (const [propName, prop] of Object.entries(properties)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        const type = getPrimaryType(prop);
        if (type === 'array' && prop.items) {
            const baseArgs = buildBaseArgs(properties, requiredParams, fixtures);
            const minItems = prop.minItems ?? 0;
            const maxItems = prop.maxItems;

            // Generate sample item based on item schema
            const sampleItem = generateDefaultValueForSchema(prop.items);

            // Test with single item (only if valid for minItems/maxItems)
            const singleItemValid = minItems <= 1 && (maxItems === undefined || maxItems >= 1);
            if (singleItemValid) {
                addQuestion(questions, {
                    description: `${CATEGORY_DESCRIPTIONS.ARRAY_HANDLING}: single item for "${propName}"`,
                    category: 'edge_case' as QuestionCategory,
                    args: { ...baseArgs, [propName]: [sampleItem] },
                    expectedOutcome: 'either',
                });
            }

            // Test with exact minItems (if minItems > 1)
            if (minItems > 1 && questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
                const minItemsArray = generateArrayItems(prop.items, minItems);
                addQuestion(questions, {
                    description: `${CATEGORY_DESCRIPTIONS.ARRAY_HANDLING}: exact minItems (${minItems}) for "${propName}"`,
                    category: 'edge_case' as QuestionCategory,
                    args: { ...baseArgs, [propName]: minItemsArray },
                    expectedOutcome: 'either',
                });
            }

            // Test with exact maxItems (if defined and reasonable)
            if (maxItems !== undefined && maxItems <= ARRAY_TESTS.MANY_ITEMS_COUNT && questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
                const maxItemsArray = generateArrayItems(prop.items, maxItems);
                addQuestion(questions, {
                    description: `${CATEGORY_DESCRIPTIONS.ARRAY_HANDLING}: exact maxItems (${maxItems}) for "${propName}"`,
                    category: 'edge_case' as QuestionCategory,
                    args: { ...baseArgs, [propName]: maxItemsArray },
                    expectedOutcome: 'either',
                });
            }

            // Test with many items (only if within maxItems or no maxItems)
            if (questions.length < SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) {
                const manyItemsCount = maxItems !== undefined
                    ? Math.min(maxItems, ARRAY_TESTS.MANY_ITEMS_COUNT)
                    : ARRAY_TESTS.MANY_ITEMS_COUNT;
                // Only add if it's different from minItems and maxItems tests
                if (manyItemsCount > minItems && manyItemsCount !== maxItems) {
                    const manyItems = generateArrayItems(prop.items, manyItemsCount);
                    addQuestion(questions, {
                        description: `${CATEGORY_DESCRIPTIONS.ARRAY_HANDLING}: many items (${manyItemsCount}) for "${propName}"`,
                        category: 'edge_case' as QuestionCategory,
                        args: { ...baseArgs, [propName]: manyItems },
                        expectedOutcome: 'either',
                    });
                }
            }
        }
    }

    return questions;
}

/**
 * Generate null/undefined handling tests.
 * Tests how the tool handles null and undefined values.
 * Null tests use 'either' outcome - tool may or may not accept null for optional params.
 */
function generateNullabilityTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[],
    fixtures?: TestFixturesConfig
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    // Test null for optional parameters
    const optionalParams = Object.keys(properties).filter(
        (p) => !requiredParams.includes(p)
    );

    for (const propName of optionalParams.slice(0, 2)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        const baseArgs = buildBaseArgs(properties, requiredParams, fixtures);
        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.NULL_HANDLING}: null for optional "${propName}"`,
            category: 'edge_case' as QuestionCategory,
            args: { ...baseArgs, [propName]: null },
            expectedOutcome: 'either',
        });
    }

    return questions;
}

/**
 * Generate error handling tests.
 * Tests that required parameters are properly validated.
 * All error handling tests expect error - tool should reject missing required params.
 */
function generateErrorHandlingTests(
    properties: Record<string, PropertySchema>,
    requiredParams: string[],
    fixtures?: TestFixturesConfig
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    // Test missing all required params
    if (requiredParams.length > 0) {
        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.MISSING_REQUIRED}: missing all required arguments`,
            category: 'error_handling' as QuestionCategory,
            args: {},
            expectedOutcome: 'error',
        });
    }

    // Test missing each required param individually
    for (const param of requiredParams.slice(0, 2)) {
        if (questions.length >= SCHEMA_TESTING.MAX_TESTS_PER_CATEGORY) break;

        const partialArgs = buildBaseArgs(properties, requiredParams, fixtures);
        delete partialArgs[param];

        addQuestion(questions, {
            description: `${CATEGORY_DESCRIPTIONS.MISSING_REQUIRED}: missing "${param}"`,
            category: 'error_handling' as QuestionCategory,
            args: partialArgs,
            expectedOutcome: 'error',
        });
    }

    return questions;
}

// ==================== Varied Tests for Simple Tools ====================

/**
 * Generate varied tests for tools with few/no parameters.
 * Instead of repeating the same test, this generates meaningful variations
 * to improve statistical confidence without redundant test data.
 * All varied tests are happy_path with expectedOutcome: 'success'.
 */
function generateVariedTestsForSimpleTools(
    properties: Record<string, PropertySchema>,
    requiredParams: string[],
    count: number,
    existingQuestions: InterviewQuestion[],
    fixtures?: TestFixturesConfig
): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const { CATEGORY_DESCRIPTIONS } = SCHEMA_TESTING;

    // Get existing arg signatures to avoid duplicates
    const existingArgSignatures = new Set(
        existingQuestions.map(q => JSON.stringify(q.args))
    );

    // Variation strategies for simple/no-param tools
    const variationStrategies: Array<() => InterviewQuestion | null> = [];

    // Strategy 1: Different timing contexts (useful for stateful tools)
    variationStrategies.push(() => ({
        description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: sequential call verification`,
        category: 'happy_path' as QuestionCategory,
        args: buildBaseArgs(properties, requiredParams, fixtures),
        expectedOutcome: 'success' as ExpectedOutcome,
    }));

    // Strategy 2: Rapid succession test (for rate limiting / caching behavior)
    variationStrategies.push(() => ({
        description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: rapid succession call`,
        category: 'happy_path' as QuestionCategory,
        args: buildBaseArgs(properties, requiredParams, fixtures),
        expectedOutcome: 'success' as ExpectedOutcome,
    }));

    // Strategy 3: Idempotency verification
    variationStrategies.push(() => ({
        description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: idempotency verification`,
        category: 'happy_path' as QuestionCategory,
        args: buildBaseArgs(properties, requiredParams, fixtures),
        expectedOutcome: 'success' as ExpectedOutcome,
    }));

    // Strategy 4: If there are any string params, try different valid values
    // Start with variant 1 and 2 since variant 0 is typically the same as base value
    const stringParams = Object.entries(properties).filter(
        ([, prop]) => getPrimaryType(prop) === 'string'
    );
    for (const [paramName, prop] of stringParams) {
        // Variant with different valid string (start at 1 to avoid duplicate with base)
        variationStrategies.push(() => {
            const args = buildBaseArgs(properties, requiredParams, fixtures);
            args[paramName] = generateAlternativeStringValue(paramName, prop, 1);
            return {
                description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: alternative value for "${paramName}"`,
                category: 'happy_path' as QuestionCategory,
                args,
                expectedOutcome: 'success' as ExpectedOutcome,
            };
        });
        variationStrategies.push(() => {
            const args = buildBaseArgs(properties, requiredParams, fixtures);
            args[paramName] = generateAlternativeStringValue(paramName, prop, 2);
            return {
                description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: second alternative for "${paramName}"`,
                category: 'happy_path' as QuestionCategory,
                args,
                expectedOutcome: 'success' as ExpectedOutcome,
            };
        });
    }

    // Strategy 5: If there are number params, try different valid values
    const numberParams = Object.entries(properties).filter(
        ([, prop]) => {
            const type = getPrimaryType(prop);
            return type === 'number' || type === 'integer';
        }
    );
    for (const [paramName, prop] of numberParams) {
        variationStrategies.push(() => {
            const args = buildBaseArgs(properties, requiredParams, fixtures);
            args[paramName] = generateAlternativeNumberValue(prop, 0);
            return {
                description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: alternative value for "${paramName}"`,
                category: 'happy_path' as QuestionCategory,
                args,
                expectedOutcome: 'success' as ExpectedOutcome,
            };
        });
        variationStrategies.push(() => {
            const args = buildBaseArgs(properties, requiredParams, fixtures);
            args[paramName] = generateAlternativeNumberValue(prop, 1);
            return {
                description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: second alternative for "${paramName}"`,
                category: 'happy_path' as QuestionCategory,
                args,
                expectedOutcome: 'success' as ExpectedOutcome,
            };
        });
    }

    // Strategy 6: Boolean params - test both values
    const booleanParams = Object.entries(properties).filter(
        ([, prop]) => getPrimaryType(prop) === 'boolean'
    );
    for (const [paramName] of booleanParams) {
        variationStrategies.push(() => {
            const args = buildBaseArgs(properties, requiredParams, fixtures);
            args[paramName] = true;
            return {
                description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: "${paramName}" = true`,
                category: 'happy_path' as QuestionCategory,
                args,
                expectedOutcome: 'success' as ExpectedOutcome,
            };
        });
        variationStrategies.push(() => {
            const args = buildBaseArgs(properties, requiredParams, fixtures);
            args[paramName] = false;
            return {
                description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: "${paramName}" = false`,
                category: 'happy_path' as QuestionCategory,
                args,
                expectedOutcome: 'success' as ExpectedOutcome,
            };
        });
    }

    // Strategy 7: Consistency checks (same args, different run)
    for (let i = 0; i < 3; i++) {
        variationStrategies.push(() => ({
            description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: consistency check run ${i + 1}`,
            category: 'happy_path' as QuestionCategory,
            args: buildBaseArgs(properties, requiredParams, fixtures),
            expectedOutcome: 'success' as ExpectedOutcome,
        }));
    }

    // Apply strategies until we have enough tests
    let strategyIndex = 0;
    while (questions.length < count && strategyIndex < variationStrategies.length) {
        const question = variationStrategies[strategyIndex]();
        if (question) {
            const argSignature = JSON.stringify(question.args);
            // Only add if not a duplicate (different description is still unique)
            const descSignature = `${question.description}:${argSignature}`;
            if (!existingArgSignatures.has(descSignature)) {
                questions.push(question);
                existingArgSignatures.add(descSignature);
            }
        }
        strategyIndex++;
    }

    // If we still need more, add numbered consistency checks
    let consistencyRun = 4;
    while (questions.length < count) {
        questions.push({
            description: `${CATEGORY_DESCRIPTIONS.HAPPY_PATH}: consistency check run ${consistencyRun}`,
            category: 'happy_path' as QuestionCategory,
            args: buildBaseArgs(properties, requiredParams, fixtures),
            expectedOutcome: 'success',
        });
        consistencyRun++;
    }

    return questions;
}

/**
 * Generate an alternative string value for variation.
 */
function generateAlternativeStringValue(
    propName: string,
    prop: PropertySchema,
    variant: number
): string {
    const lowerName = propName.toLowerCase();

    // Generate different valid values based on type
    if (lowerName.includes('date')) {
        const dates = ['2024-01-15', '2024-06-30', '2024-12-31'];
        return dates[variant % dates.length];
    }
    if (lowerName.includes('id')) {
        const ids = ['test-id-123', 'test-id-456', 'test-id-789'];
        return ids[variant % ids.length];
    }
    if (lowerName.includes('name')) {
        const names = ['test-name', 'sample-name', 'example-name'];
        return names[variant % names.length];
    }
    if (lowerName.includes('query') || lowerName.includes('search')) {
        const queries = ['test query', 'sample search', 'example term'];
        return queries[variant % queries.length];
    }

    // Check if enum, use different values
    if (prop.enum && prop.enum.length > 1) {
        return String(prop.enum[(variant + 1) % prop.enum.length]);
    }

    // Default alternatives
    const defaults = ['test', 'sample', 'example'];
    return defaults[variant % defaults.length];
}

/**
 * Generate an alternative number value for variation.
 */
function generateAlternativeNumberValue(
    prop: PropertySchema,
    variant: number
): number {
    const min = prop.minimum ?? 0;
    const max = prop.maximum ?? 100;

    // Generate different valid values within the range
    const range = max - min;
    const values = [
        min + Math.floor(range * 0.25),
        min + Math.floor(range * 0.5),
        min + Math.floor(range * 0.75),
    ];

    return values[variant % values.length];
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
    const fixtures = options.testFixtures;

    const properties = schema?.properties ?? {};
    const requiredParams = (schema?.required ?? []) as string[];

    // 1. Happy Path Tests (always included)
    questions.push(...generateHappyPathTests(properties, requiredParams, fixtures));

    // 2. Boundary Value Tests
    questions.push(...generateBoundaryTests(properties, requiredParams, fixtures));

    // 3. Type Coercion Tests (unless skipping error tests)
    if (!options.skipErrorTests) {
        questions.push(...generateTypeCoercionTests(properties, requiredParams, fixtures));
    }

    // 4. Enum Validation Tests (unless skipping error tests)
    if (!options.skipErrorTests) {
        questions.push(...generateEnumTests(properties, requiredParams, fixtures));
    }

    // 5. Array Handling Tests
    questions.push(...generateArrayTests(properties, requiredParams, fixtures));

    // 6. Nullability Tests
    questions.push(...generateNullabilityTests(properties, requiredParams, fixtures));

    // 7. Error Handling Tests (unless skipped)
    if (!options.skipErrorTests) {
        questions.push(...generateErrorHandlingTests(properties, requiredParams, fixtures));
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
    // For simple tools with few/no parameters, generate varied tests
    // Use the greater of MIN_TESTS_PER_TOOL and maxTests (target confidence samples)
    const minTests = Math.max(SCHEMA_TESTING.MIN_TESTS_PER_TOOL, maxTests);
    if (questions.length < minTests && questions.length > 0) {
        const existingCount = questions.length;
        const additionalTests = generateVariedTestsForSimpleTools(
            properties,
            requiredParams,
            minTests - existingCount,
            questions,
            fixtures
        );
        questions.push(...additionalTests);
    }

    // Limit total tests
    return {
        questions: questions.slice(0, maxTests),
        semanticInferences,
    };
}
