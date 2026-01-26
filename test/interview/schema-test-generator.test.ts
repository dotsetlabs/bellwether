/**
 * Tests for the SchemaTestGenerator module.
 *
 * Validates that the enhanced schema-based test generation produces
 * comprehensive, deterministic test cases from JSON Schema.
 */

import { describe, it, expect } from 'vitest';
import { generateSchemaTests } from '../../src/interview/schema-test-generator.js';
import type { MCPTool } from '../../src/transport/types.js';

// ==================== Test Fixtures ====================

/**
 * Create a mock tool with the given input schema.
 */
function createMockTool(inputSchema: Record<string, unknown>): MCPTool {
    return {
        name: 'test_tool',
        description: 'A test tool for testing',
        inputSchema,
    };
}

// ==================== Tests ====================

describe('SchemaTestGenerator', () => {
    describe('generateSchemaTests', () => {
        describe('basic functionality', () => {
            it('should generate tests for tool with no parameters', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {},
                });

                const tests = generateSchemaTests(tool);

                expect(tests.length).toBeGreaterThanOrEqual(1);
                expect(tests.some((t) => t.category === 'happy_path')).toBe(true);
                expect(tests.some((t) => Object.keys(t.args).length === 0)).toBe(true);
            });

            it('should generate tests for tool with required string parameter', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'A name parameter',
                        },
                    },
                    required: ['name'],
                });

                const tests = generateSchemaTests(tool);

                // Should have multiple tests
                expect(tests.length).toBeGreaterThan(2);

                // Should have happy path with smart default value
                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.name !== undefined
                );
                expect(happyPath).toBeDefined();
                expect(happyPath?.args.name).toBe('test-name'); // Smart value for 'name'

                // Should have boundary test (empty string)
                const emptyStringTest = tests.find(
                    (t) => t.args.name === ''
                );
                expect(emptyStringTest).toBeDefined();

                // Should have error handling test (missing required)
                const missingTest = tests.find(
                    (t) => t.category === 'error_handling' && Object.keys(t.args).length === 0
                );
                expect(missingTest).toBeDefined();
            });

            it('should generate tests for tool with required number parameter', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        count: {
                            type: 'integer',
                            description: 'A count parameter',
                        },
                    },
                    required: ['count'],
                });

                const tests = generateSchemaTests(tool);

                // Should have boundary tests
                expect(tests.some((t) => t.args.count === 0)).toBe(true); // Zero
                expect(tests.some((t) => t.args.count === -1)).toBe(true); // Negative

                // Should have type coercion test
                expect(tests.some((t) => t.args.count === '123')).toBe(true);
            });

            it('should generate tests for tool with boolean parameter', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        enabled: {
                            type: 'boolean',
                            description: 'Whether enabled',
                        },
                    },
                    required: ['enabled'],
                });

                const tests = generateSchemaTests(tool);

                // Should have type coercion test (string for boolean)
                expect(tests.some((t) => t.args.enabled === 'true')).toBe(true);
            });
        });

        describe('boundary testing', () => {
            it('should test empty string when minLength is 0 or undefined', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                    },
                });

                const tests = generateSchemaTests(tool);

                expect(tests.some((t) => t.args.query === '')).toBe(true);
            });

            it('should test long strings when maxLength is undefined', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                    },
                });

                const tests = generateSchemaTests(tool);

                const longStringTest = tests.find(
                    (t) => typeof t.args.query === 'string' && t.args.query.length > 100
                );
                expect(longStringTest).toBeDefined();
            });

            it('should test zero for number fields when minimum allows', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        limit: { type: 'number' },
                    },
                });

                const tests = generateSchemaTests(tool);

                expect(tests.some((t) => t.args.limit === 0)).toBe(true);
            });

            it('should test negative values for number fields when minimum allows', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        offset: { type: 'integer' },
                    },
                });

                const tests = generateSchemaTests(tool);

                expect(tests.some((t) => t.args.offset === -1)).toBe(true);
            });

            it('should test large values for number fields when maximum is undefined', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        count: { type: 'number' },
                    },
                });

                const tests = generateSchemaTests(tool);

                expect(tests.some((t) => t.args.count === 999999999)).toBe(true);
            });
        });

        describe('enum validation', () => {
            it('should generate invalid enum test when property has enum', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        format: {
                            type: 'string',
                            enum: ['json', 'csv', 'xml'],
                        },
                    },
                    required: ['format'],
                });

                const tests = generateSchemaTests(tool);

                // Should have a test with invalid enum value
                const invalidEnumTest = tests.find(
                    (t) =>
                        t.args.format !== 'json' &&
                        t.args.format !== 'csv' &&
                        t.args.format !== 'xml' &&
                        typeof t.args.format === 'string' &&
                        t.args.format.includes('INVALID')
                );
                expect(invalidEnumTest).toBeDefined();
            });

            it('should use first enum value for happy path tests', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        status: {
                            type: 'string',
                            enum: ['active', 'inactive', 'pending'],
                        },
                    },
                    required: ['status'],
                });

                const tests = generateSchemaTests(tool);

                // Happy path should use first enum value
                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.status === 'active'
                );
                expect(happyPath).toBeDefined();
            });
        });

        describe('array handling', () => {
            it('should test empty array for array parameters without minItems', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                    },
                });

                const tests = generateSchemaTests(tool);

                expect(
                    tests.some(
                        (t) => Array.isArray(t.args.items) && t.args.items.length === 0
                    )
                ).toBe(true);
            });

            it('should NOT test empty array when minItems > 0', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: { type: 'string' },
                            minItems: 2,
                        },
                    },
                });

                const tests = generateSchemaTests(tool);

                // Should NOT have an empty array test
                const emptyArrayTests = tests.filter(
                    (t) => Array.isArray(t.args.items) && t.args.items.length === 0
                );
                expect(emptyArrayTests.length).toBe(0);
            });

            it('should test underflow (below minItems) as error case', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: { type: 'string' },
                            minItems: 3,
                        },
                    },
                });

                const tests = generateSchemaTests(tool);

                // Should have a test with items below minItems (expecting error)
                const underflowTest = tests.find(
                    (t) =>
                        Array.isArray(t.args.items) &&
                        t.args.items.length < 3 &&
                        t.expectedOutcome === 'error'
                );
                expect(underflowTest).toBeDefined();
            });

            it('should test overflow (above maxItems) as error case', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: { type: 'string' },
                            maxItems: 3,
                        },
                    },
                });

                const tests = generateSchemaTests(tool);

                // Should have a test with items above maxItems (expecting error)
                const overflowTest = tests.find(
                    (t) =>
                        Array.isArray(t.args.items) &&
                        t.args.items.length > 3 &&
                        t.expectedOutcome === 'error'
                );
                expect(overflowTest).toBeDefined();
            });

            it('should generate exact minItems for happy path array with minItems constraint', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: { type: 'string' },
                            minItems: 2,
                        },
                    },
                    required: ['items'],
                });

                const tests = generateSchemaTests(tool);

                // Happy path should have at least minItems elements
                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && Array.isArray(t.args.items)
                );
                expect(happyPath).toBeDefined();
                expect((happyPath?.args.items as unknown[]).length).toBeGreaterThanOrEqual(2);
            });

            it('should test exact minItems boundary', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        data: {
                            type: 'array',
                            items: { type: 'number' },
                            minItems: 3,
                        },
                    },
                });

                const tests = generateSchemaTests(tool);

                // Should have a test with exactly minItems
                const exactMinTest = tests.find(
                    (t) => Array.isArray(t.args.data) && t.args.data.length === 3
                );
                expect(exactMinTest).toBeDefined();
            });

            it('should test exact maxItems boundary', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        data: {
                            type: 'array',
                            items: { type: 'number' },
                            maxItems: 5,
                        },
                    },
                });

                const tests = generateSchemaTests(tool);

                // Should have a test with exactly maxItems
                const exactMaxTest = tests.find(
                    (t) => Array.isArray(t.args.data) && t.args.data.length === 5
                );
                expect(exactMaxTest).toBeDefined();
            });

            it('should generate correct item types based on item schema', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        numbers: {
                            type: 'array',
                            items: { type: 'number' },
                            minItems: 2,
                        },
                    },
                    required: ['numbers'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && Array.isArray(t.args.numbers)
                );
                expect(happyPath).toBeDefined();
                const numbers = happyPath?.args.numbers as unknown[];
                expect(numbers.length).toBeGreaterThanOrEqual(2);
                // All items should be numbers
                numbers.forEach(n => expect(typeof n).toBe('number'));
            });

            it('should test single item array', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        ids: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                    },
                });

                const tests = generateSchemaTests(tool);

                expect(
                    tests.some(
                        (t) => Array.isArray(t.args.ids) && t.args.ids.length === 1
                    )
                ).toBe(true);
            });

            it('should test many items array when within maxItems', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        values: {
                            type: 'array',
                            items: { type: 'number' },
                        },
                    },
                });

                const tests = generateSchemaTests(tool);

                expect(
                    tests.some(
                        (t) => Array.isArray(t.args.values) && t.args.values.length >= 10
                    )
                ).toBe(true);
            });

            it('should not exceed maxItems in many items test', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        values: {
                            type: 'array',
                            items: { type: 'number' },
                            maxItems: 5,
                        },
                    },
                });

                const tests = generateSchemaTests(tool);

                // Valid tests should not exceed maxItems
                const validTests = tests.filter(
                    (t) => t.expectedOutcome !== 'error' && Array.isArray(t.args.values)
                );
                validTests.forEach(t => {
                    expect((t.args.values as unknown[]).length).toBeLessThanOrEqual(5);
                });
            });
        });

        describe('nullability testing', () => {
            it('should test null for optional parameters', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        optional_field: { type: 'string' },
                    },
                    required: ['name'],
                });

                const tests = generateSchemaTests(tool);

                expect(
                    tests.some((t) => t.args.optional_field === null)
                ).toBe(true);
            });
        });

        describe('error handling tests', () => {
            it('should generate missing required parameter tests', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        required_param: { type: 'string' },
                        another_required: { type: 'number' },
                    },
                    required: ['required_param', 'another_required'],
                });

                const tests = generateSchemaTests(tool);

                // Should have test with all required missing
                expect(
                    tests.some(
                        (t) =>
                            t.category === 'error_handling' &&
                            Object.keys(t.args).length === 0
                    )
                ).toBe(true);

                // Should have test with individual required missing
                expect(
                    tests.some(
                        (t) =>
                            t.category === 'error_handling' &&
                            t.args.another_required !== undefined &&
                            t.args.required_param === undefined
                    )
                ).toBe(true);
            });

            it('should skip error tests when skipErrorTests is true', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                    },
                    required: ['name'],
                });

                const tests = generateSchemaTests(tool, { skipErrorTests: true });

                // Should not have error handling tests
                expect(
                    tests.filter((t) => t.category === 'error_handling').length
                ).toBe(0);
            });
        });

        describe('smart value generation', () => {
            it('should generate date format for date parameters', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        start_date: { type: 'string' },
                    },
                    required: ['start_date'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.start_date !== undefined
                );
                expect(happyPath?.args.start_date).toBe('2024-01-15');
            });

            it('should generate email format for email parameters', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        user_email: { type: 'string' },
                    },
                    required: ['user_email'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.user_email !== undefined
                );
                expect(happyPath?.args.user_email).toBe('test@example.com');
            });

            it('should generate URL format for URL parameters', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        callback_url: { type: 'string' },
                    },
                    required: ['callback_url'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.callback_url !== undefined
                );
                expect(happyPath?.args.callback_url).toBe('https://example.com');
            });

            it('should generate path format for path parameters', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        output_path: { type: 'string' },
                    },
                    required: ['output_path'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.output_path !== undefined
                );
                expect(happyPath?.args.output_path).toBe('/tmp/test');
            });

            it('should use schema examples when available', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        custom_field: {
                            type: 'string',
                            examples: ['example_value'],
                        },
                    },
                    required: ['custom_field'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.custom_field !== undefined
                );
                expect(happyPath?.args.custom_field).toBe('example_value');
            });

            it('should use schema default when available', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            default: 50,
                        },
                    },
                    required: ['limit'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.limit === 50
                );
                expect(happyPath).toBeDefined();
            });
        });

        describe('test limits', () => {
            it('should respect maxTestsPerTool option', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        field1: { type: 'string' },
                        field2: { type: 'number' },
                        field3: { type: 'boolean' },
                        field4: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['field1', 'field2'],
                });

                const tests = generateSchemaTests(tool, { maxTestsPerTool: 5 });

                expect(tests.length).toBeLessThanOrEqual(5);
            });

            it('should generate at least minimum tests for simple tools', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {},
                });

                const tests = generateSchemaTests(tool);

                expect(tests.length).toBeGreaterThanOrEqual(1);
            });
        });

        describe('duplicate prevention', () => {
            it('should not generate duplicate test cases', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                    },
                    required: ['name'],
                });

                const tests = generateSchemaTests(tool);

                // Filter out intentional repeats (used for statistical confidence)
                // These include:
                // - Legacy repeats with "(repeat N)" in their description
                // - Consistency check runs used for performance sampling
                // - Sequential/rapid succession tests for timing variance
                const intentionalRepeatPatterns = [
                    '(repeat ',
                    'consistency check run',
                    'sequential call',
                    'rapid succession',
                    'idempotency verification',
                ];
                const nonRepeatedTests = tests.filter(
                    (t) => !intentionalRepeatPatterns.some(pattern =>
                        t.description.toLowerCase().includes(pattern.toLowerCase())
                    )
                );

                // Check for duplicates by comparing stringified args among non-repeated tests
                const argsStrings = nonRepeatedTests.map((t) => JSON.stringify(t.args));
                const uniqueArgsStrings = new Set(argsStrings);

                expect(uniqueArgsStrings.size).toBe(argsStrings.length);
            });
        });

        describe('complex schemas', () => {
            it('should handle tools with many parameters', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                        category: { type: 'string', enum: ['a', 'b', 'c'] },
                        min_amount: { type: 'number' },
                        max_amount: { type: 'number' },
                        start_date: { type: 'string' },
                        end_date: { type: 'string' },
                        account_id: { type: 'string' },
                        limit: { type: 'integer', default: 50 },
                        tags: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['start_date', 'end_date'],
                });

                const tests = generateSchemaTests(tool);

                // Should generate meaningful tests
                expect(tests.length).toBeGreaterThan(5);

                // Should have happy path
                expect(tests.some((t) => t.category === 'happy_path')).toBe(true);

                // Should have boundary tests
                expect(tests.some((t) => t.category === 'edge_case')).toBe(true);
            });

            it('should handle tools with nested object properties', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        config: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                value: { type: 'number' },
                            },
                        },
                    },
                });

                const tests = generateSchemaTests(tool);

                // Should still generate tests
                expect(tests.length).toBeGreaterThanOrEqual(1);
            });
        });

        describe('test fixtures configuration', () => {
            it('should use exact match parameter values from fixtures', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        latitude: { type: 'number' },
                        longitude: { type: 'number' },
                    },
                    required: ['latitude', 'longitude'],
                });

                const tests = generateSchemaTests(tool, {
                    testFixtures: {
                        parameterValues: {
                            latitude: 40.7128,
                            longitude: -74.0060,
                        },
                    },
                });

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.latitude !== undefined
                );
                expect(happyPath?.args.latitude).toBe(40.7128);
                expect(happyPath?.args.longitude).toBe(-74.0060);
            });

            it('should use pattern match values from fixtures', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        user_id: { type: 'string' },
                        item_id: { type: 'string' },
                    },
                    required: ['user_id', 'item_id'],
                });

                const tests = generateSchemaTests(tool, {
                    testFixtures: {
                        patterns: [
                            { match: '.*_id$', value: 'fixture_id_12345' },
                        ],
                    },
                });

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.user_id !== undefined
                );
                expect(happyPath?.args.user_id).toBe('fixture_id_12345');
                expect(happyPath?.args.item_id).toBe('fixture_id_12345');
            });

            it('should prioritize exact match over pattern match', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        user_id: { type: 'string' },
                        item_id: { type: 'string' },
                    },
                    required: ['user_id', 'item_id'],
                });

                const tests = generateSchemaTests(tool, {
                    testFixtures: {
                        parameterValues: {
                            user_id: 'exact_user_123',
                        },
                        patterns: [
                            { match: '.*_id$', value: 'pattern_id_456' },
                        ],
                    },
                });

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.user_id !== undefined
                );
                // user_id should use exact match
                expect(happyPath?.args.user_id).toBe('exact_user_123');
                // item_id should use pattern match
                expect(happyPath?.args.item_id).toBe('pattern_id_456');
            });

            it('should fall back to smart generation when no fixture matches', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        user_email: { type: 'string' },
                        query: { type: 'string' },
                    },
                    required: ['user_email', 'query'],
                });

                const tests = generateSchemaTests(tool, {
                    testFixtures: {
                        parameterValues: {
                            unrelated_param: 'some_value',
                        },
                    },
                });

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.user_email !== undefined
                );
                // Should use smart generation fallback
                expect(happyPath?.args.user_email).toBe('test@example.com');
            });

            it('should support fixture values for numbers', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        limit: { type: 'integer' },
                        offset: { type: 'integer' },
                    },
                    required: ['limit', 'offset'],
                });

                const tests = generateSchemaTests(tool, {
                    testFixtures: {
                        parameterValues: {
                            limit: 25,
                            offset: 100,
                        },
                    },
                });

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.limit !== undefined
                );
                expect(happyPath?.args.limit).toBe(25);
                expect(happyPath?.args.offset).toBe(100);
            });

            it('should handle empty fixtures gracefully', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                    },
                    required: ['name'],
                });

                const tests = generateSchemaTests(tool, {
                    testFixtures: {},
                });

                // Should still generate tests using smart defaults
                expect(tests.length).toBeGreaterThan(0);
                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.name !== undefined
                );
                expect(happyPath?.args.name).toBe('test-name');
            });

            it('should apply fixtures to array item generation', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    item_id: { type: 'string' },
                                },
                                required: ['item_id'],
                            },
                            minItems: 2,
                        },
                    },
                    required: ['items'],
                });

                const tests = generateSchemaTests(tool, {
                    testFixtures: {
                        parameterValues: {
                            item_id: 'array_item_fixture',
                        },
                    },
                });

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && Array.isArray(t.args.items)
                );
                expect(happyPath).toBeDefined();
                const items = happyPath?.args.items as Array<{item_id: string}>;
                expect(items.length).toBeGreaterThanOrEqual(2);
                // Each item should use the fixture value
                items.forEach(item => {
                    expect(item.item_id).toBe('array_item_fixture');
                });
            });
        });

        describe('coordinate value generation', () => {
            it('should generate realistic latitude values', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        lat: { type: 'number' },
                        lng: { type: 'number' },
                    },
                    required: ['lat', 'lng'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.lat !== undefined
                );
                // Should use San Francisco coordinates as default
                expect(happyPath?.args.lat).toBe(37.7749);
                expect(happyPath?.args.lng).toBe(-122.4194);
            });

            it('should detect latitude/longitude fields', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        latitude: { type: 'number' },
                        longitude: { type: 'number' },
                    },
                    required: ['latitude', 'longitude'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.latitude !== undefined
                );
                expect(happyPath?.args.latitude).toBe(37.7749);
                expect(happyPath?.args.longitude).toBe(-122.4194);
            });
        });

        describe('pagination value generation', () => {
            it('should generate sensible pagination values', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        limit: { type: 'integer' },
                        offset: { type: 'integer' },
                    },
                    required: ['limit', 'offset'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.limit !== undefined
                );
                // Should use sensible defaults
                expect(happyPath?.args.limit).toBe(10);
                expect(happyPath?.args.offset).toBe(0);
            });

            it('should detect page parameter vs offset', () => {
                const tool = createMockTool({
                    type: 'object',
                    properties: {
                        page: { type: 'integer' },
                        page_size: { type: 'integer' },
                    },
                    required: ['page', 'page_size'],
                });

                const tests = generateSchemaTests(tool);

                const happyPath = tests.find(
                    (t) => t.category === 'happy_path' && t.args.page !== undefined
                );
                // page should start at 1, not 0
                expect(happyPath?.args.page).toBe(1);
                expect(happyPath?.args.page_size).toBe(10);
            });
        });
    });
});
