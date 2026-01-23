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
            it('should test empty array for array parameters', () => {
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

            it('should test many items array', () => {
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
                // These have "(repeat N)" in their description
                const nonRepeatedTests = tests.filter(
                    (t) => !t.description.includes('(repeat ')
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
    });
});
