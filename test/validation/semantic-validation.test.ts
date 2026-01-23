/**
 * Tests for the semantic validation module.
 */

import {
  inferSemanticType,
  validateSemanticValue,
  validateAllParameters,
} from '../../src/validation/semantic-validator.js';
import {
  generateSemanticTests,
  getInvalidValuesForType,
  getTestableSemanticTypes,
} from '../../src/validation/semantic-test-generator.js';
import {
  getAllSemanticTypes,
  isSemanticType,
  SEMANTIC_PATTERNS,
} from '../../src/validation/semantic-types.js';
import type { SemanticType, SemanticInference } from '../../src/validation/semantic-types.js';
import type { MCPTool } from '../../src/transport/types.js';

describe('Semantic Type Inference', () => {
  describe('inferSemanticType', () => {
    it('should infer date_iso8601 from parameter name', () => {
      const result = inferSemanticType('created_date');
      expect(result.inferredType).toBe('date_iso8601');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should infer date_iso8601 from description', () => {
      const result = inferSemanticType('when', 'Date in YYYY-MM-DD format');
      expect(result.inferredType).toBe('date_iso8601');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should infer email from parameter name', () => {
      const result = inferSemanticType('user_email');
      expect(result.inferredType).toBe('email');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should infer url from parameter name', () => {
      const result = inferSemanticType('website_url');
      expect(result.inferredType).toBe('url');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should infer identifier from id suffix', () => {
      const result = inferSemanticType('user_id');
      expect(result.inferredType).toBe('identifier');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should infer file_path from path parameter', () => {
      const result = inferSemanticType('file_path');
      expect(result.inferredType).toBe('file_path');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should infer ip_address from ip parameter', () => {
      const result = inferSemanticType('server_ip');
      expect(result.inferredType).toBe('ip_address');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should use schema format with highest confidence', () => {
      const result = inferSemanticType('something', 'some description', 'email');
      expect(result.inferredType).toBe('email');
      expect(result.confidence).toBe(0.95);
    });

    it('should return unknown for unrecognized parameters', () => {
      const result = inferSemanticType('xyz123');
      expect(result.inferredType).toBe('unknown');
    });

    it('should combine name and description confidence', () => {
      const result = inferSemanticType('email', 'User email address');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should infer amount_currency from price', () => {
      const result = inferSemanticType('total_price');
      expect(result.inferredType).toBe('amount_currency');
    });

    it('should infer percentage from rate', () => {
      const result = inferSemanticType('tax_rate');
      expect(result.inferredType).toBe('percentage');
    });

    it('should infer timestamp from unix parameter', () => {
      const result = inferSemanticType('unix_epoch');
      expect(result.inferredType).toBe('timestamp');
    });

    it('should infer json from payload parameter', () => {
      const result = inferSemanticType('request_payload');
      expect(result.inferredType).toBe('json');
    });

    it('should infer base64 from base64 parameter', () => {
      const result = inferSemanticType('base64_content');
      expect(result.inferredType).toBe('base64');
    });

    it('should infer regex from pattern parameter', () => {
      const result = inferSemanticType('filter_pattern');
      expect(result.inferredType).toBe('regex');
    });
  });

  describe('validateSemanticValue', () => {
    describe('date_iso8601 validation', () => {
      it('should accept valid dates', () => {
        const result = validateSemanticValue('date', '2024-01-15', 'date_iso8601');
        expect(result.isValid).toBe(true);
      });

      it('should reject invalid date formats', () => {
        const result = validateSemanticValue('date', '01/15/2024', 'date_iso8601');
        expect(result.isValid).toBe(false);
        expect(result.issue).toContain('YYYY-MM-DD');
      });

      it('should reject invalid dates', () => {
        const result = validateSemanticValue('date', '2024-13-45', 'date_iso8601');
        expect(result.isValid).toBe(false);
      });
    });

    describe('email validation', () => {
      it('should accept valid emails', () => {
        const result = validateSemanticValue('email', 'user@example.com', 'email');
        expect(result.isValid).toBe(true);
      });

      it('should reject invalid emails', () => {
        const result = validateSemanticValue('email', 'not-an-email', 'email');
        expect(result.isValid).toBe(false);
      });

      it('should reject emails without domain', () => {
        const result = validateSemanticValue('email', 'user@', 'email');
        expect(result.isValid).toBe(false);
      });
    });

    describe('url validation', () => {
      it('should accept valid URLs', () => {
        const result = validateSemanticValue('url', 'https://example.com/path', 'url');
        expect(result.isValid).toBe(true);
      });

      it('should accept URLs with ports', () => {
        const result = validateSemanticValue('url', 'http://localhost:3000', 'url');
        expect(result.isValid).toBe(true);
      });

      it('should reject invalid URLs', () => {
        const result = validateSemanticValue('url', 'not-a-url', 'url');
        expect(result.isValid).toBe(false);
      });
    });

    describe('ip_address validation', () => {
      it('should accept valid IPv4', () => {
        const result = validateSemanticValue('ip', '192.168.1.1', 'ip_address');
        expect(result.isValid).toBe(true);
      });

      it('should reject invalid IPv4', () => {
        const result = validateSemanticValue('ip', '999.999.999.999', 'ip_address');
        expect(result.isValid).toBe(false);
      });

      it('should accept IPv6', () => {
        const result = validateSemanticValue('ip', '2001:0db8:85a3::8a2e:0370:7334', 'ip_address');
        expect(result.isValid).toBe(true);
      });
    });

    describe('identifier validation', () => {
      it('should accept non-empty identifiers', () => {
        const result = validateSemanticValue('id', 'user-123', 'identifier');
        expect(result.isValid).toBe(true);
      });

      it('should reject empty identifiers', () => {
        const result = validateSemanticValue('id', '', 'identifier');
        expect(result.isValid).toBe(false);
      });

      it('should reject whitespace-only identifiers', () => {
        const result = validateSemanticValue('id', '   ', 'identifier');
        expect(result.isValid).toBe(false);
      });
    });

    describe('json validation', () => {
      it('should accept valid JSON', () => {
        const result = validateSemanticValue('data', '{"key": "value"}', 'json');
        expect(result.isValid).toBe(true);
      });

      it('should accept JSON arrays', () => {
        const result = validateSemanticValue('data', '[1, 2, 3]', 'json');
        expect(result.isValid).toBe(true);
      });

      it('should reject invalid JSON', () => {
        const result = validateSemanticValue('data', '{invalid}', 'json');
        expect(result.isValid).toBe(false);
      });
    });

    describe('base64 validation', () => {
      it('should accept valid base64', () => {
        const result = validateSemanticValue('data', 'SGVsbG8gV29ybGQ=', 'base64');
        expect(result.isValid).toBe(true);
      });

      it('should reject invalid base64', () => {
        const result = validateSemanticValue('data', 'not!base64', 'base64');
        expect(result.isValid).toBe(false);
      });
    });

    describe('regex validation', () => {
      it('should accept valid regex', () => {
        const result = validateSemanticValue('pattern', '^[a-z]+$', 'regex');
        expect(result.isValid).toBe(true);
      });

      it('should reject invalid regex', () => {
        const result = validateSemanticValue('pattern', '[invalid', 'regex');
        expect(result.isValid).toBe(false);
      });
    });

    describe('timestamp validation', () => {
      it('should accept valid timestamps', () => {
        const result = validateSemanticValue('ts', '1705330200', 'timestamp');
        expect(result.isValid).toBe(true);
      });

      it('should reject negative timestamps', () => {
        const result = validateSemanticValue('ts', '-12345', 'timestamp');
        expect(result.isValid).toBe(false);
      });
    });

    describe('percentage validation', () => {
      it('should accept numeric percentages', () => {
        const result = validateSemanticValue('rate', '75', 'percentage');
        expect(result.isValid).toBe(true);
      });

      it('should accept decimal percentages', () => {
        const result = validateSemanticValue('rate', '0.75', 'percentage');
        expect(result.isValid).toBe(true);
      });

      it('should reject non-numeric percentages', () => {
        const result = validateSemanticValue('rate', 'half', 'percentage');
        expect(result.isValid).toBe(false);
      });
    });

    describe('phone validation', () => {
      it('should accept valid phone numbers', () => {
        const result = validateSemanticValue('phone', '+1-555-123-4567', 'phone');
        expect(result.isValid).toBe(true);
      });

      it('should reject short numbers', () => {
        const result = validateSemanticValue('phone', '123', 'phone');
        expect(result.isValid).toBe(false);
      });
    });

    describe('unknown type', () => {
      it('should always accept values for unknown type', () => {
        const result = validateSemanticValue('param', 'anything', 'unknown');
        expect(result.isValid).toBe(true);
      });
    });

    describe('non-string values', () => {
      it('should accept non-string values without validation', () => {
        const result = validateSemanticValue('num', 123 as unknown as string, 'email');
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('validateAllParameters', () => {
    it('should validate multiple parameters', () => {
      const args = {
        email: 'invalid',
        date: '2024-01-15',
      };

      const inferences: SemanticInference[] = [
        { paramName: 'email', inferredType: 'email', confidence: 0.9, evidence: [] },
        { paramName: 'date', inferredType: 'date_iso8601', confidence: 0.9, evidence: [] },
      ];

      const results = validateAllParameters(args, inferences);
      expect(results).toHaveLength(2);
      expect(results.find(r => r.paramName === 'email')?.isValid).toBe(false);
      expect(results.find(r => r.paramName === 'date')?.isValid).toBe(true);
    });

    it('should skip undefined parameters', () => {
      const args = { email: 'test@example.com' };
      const inferences: SemanticInference[] = [
        { paramName: 'email', inferredType: 'email', confidence: 0.9, evidence: [] },
        { paramName: 'missing', inferredType: 'url', confidence: 0.9, evidence: [] },
      ];

      const results = validateAllParameters(args, inferences);
      expect(results).toHaveLength(1);
    });
  });
});

describe('Semantic Test Generation', () => {
  function createMockTool(schema: Record<string, unknown>): MCPTool {
    return {
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: schema,
    };
  }

  describe('generateSemanticTests', () => {
    it('should generate tests for email parameters', () => {
      const tool = createMockTool({
        type: 'object',
        properties: {
          email: { type: 'string', description: 'User email address' },
        },
        required: ['email'],
      });

      const result = generateSemanticTests(tool);
      expect(result.tests.length).toBeGreaterThan(0);
      expect(result.inferences.length).toBeGreaterThan(0);
      expect(result.inferences[0].inferredType).toBe('email');
    });

    it('should generate tests for date parameters', () => {
      const tool = createMockTool({
        type: 'object',
        properties: {
          created_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        },
      });

      const result = generateSemanticTests(tool);
      expect(result.inferences.some(i => i.inferredType === 'date_iso8601')).toBe(true);
    });

    it('should respect minConfidence option', () => {
      const tool = createMockTool({
        type: 'object',
        properties: {
          xyz: { type: 'string' }, // Low confidence - no patterns match
        },
      });

      const result = generateSemanticTests(tool, { minConfidence: 0.5 });
      expect(result.tests.length).toBe(0);
      expect(result.inferences.length).toBe(0);
    });

    it('should skip tests when skipSemanticTests is true', () => {
      const tool = createMockTool({
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Email address' },
        },
      });

      const result = generateSemanticTests(tool, { skipSemanticTests: true });
      expect(result.tests.length).toBe(0);
    });

    it('should use schema format for inference', () => {
      const tool = createMockTool({
        type: 'object',
        properties: {
          something: { type: 'string', format: 'email' },
        },
        required: ['something'],
      });

      const result = generateSemanticTests(tool);
      expect(result.inferences[0]?.inferredType).toBe('email');
      expect(result.inferences[0]?.confidence).toBe(0.95);
    });

    it('should handle tools with no properties', () => {
      const tool = createMockTool({
        type: 'object',
      });

      const result = generateSemanticTests(tool);
      expect(result.tests.length).toBe(0);
      expect(result.inferences.length).toBe(0);
    });

    it('should set correct metadata on generated tests', () => {
      const tool = createMockTool({
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Email address' },
        },
        required: ['email'],
      });

      const result = generateSemanticTests(tool);
      const test = result.tests[0];
      expect(test.metadata).toBeDefined();
      expect(test.metadata?.semanticType).toBe('email');
      expect(test.metadata?.expectedBehavior).toBe('reject');
      expect(test.metadata?.confidence).toBeGreaterThan(0);
    });

    it('should only generate tests for string parameters', () => {
      const tool = createMockTool({
        type: 'object',
        properties: {
          count: { type: 'number' },
          enabled: { type: 'boolean' },
        },
      });

      const result = generateSemanticTests(tool);
      expect(result.tests.length).toBe(0);
    });
  });
});

describe('Utility Functions', () => {
  describe('getAllSemanticTypes', () => {
    it('should return all semantic types except unknown', () => {
      const types = getAllSemanticTypes();
      expect(types.length).toBeGreaterThan(10);
      expect(types).not.toContain('unknown');
      expect(types).toContain('email');
      expect(types).toContain('url');
      expect(types).toContain('date_iso8601');
    });
  });

  describe('isSemanticType', () => {
    it('should return true for valid types', () => {
      expect(isSemanticType('email')).toBe(true);
      expect(isSemanticType('url')).toBe(true);
      expect(isSemanticType('unknown')).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isSemanticType('invalid')).toBe(false);
      expect(isSemanticType('')).toBe(false);
    });
  });

  describe('getInvalidValuesForType', () => {
    it('should return invalid values for email', () => {
      const values = getInvalidValuesForType('email');
      expect(values.length).toBeGreaterThan(0);
      expect(values).toContain('not-an-email');
    });

    it('should return invalid values for url', () => {
      const values = getInvalidValuesForType('url');
      expect(values.length).toBeGreaterThan(0);
      expect(values).toContain('not-a-url');
    });

    it('should return empty array for file_path', () => {
      const values = getInvalidValuesForType('file_path');
      expect(values.length).toBe(0);
    });
  });

  describe('getTestableSemanticTypes', () => {
    it('should return types with invalid values defined', () => {
      const types = getTestableSemanticTypes();
      expect(types.length).toBeGreaterThan(10);
      expect(types).toContain('email');
      expect(types).toContain('url');
      expect(types).not.toContain('file_path');
      expect(types).not.toContain('unknown');
    });
  });
});

describe('SEMANTIC_PATTERNS', () => {
  it('should have patterns for all semantic types', () => {
    const types = getAllSemanticTypes();
    for (const type of types) {
      expect(SEMANTIC_PATTERNS[type]).toBeDefined();
      expect(SEMANTIC_PATTERNS[type].namePatterns).toBeInstanceOf(Array);
      expect(SEMANTIC_PATTERNS[type].descriptionPatterns).toBeInstanceOf(Array);
    }
  });

  it('should have non-empty patterns for common types', () => {
    expect(SEMANTIC_PATTERNS.email.namePatterns.length).toBeGreaterThan(0);
    expect(SEMANTIC_PATTERNS.url.namePatterns.length).toBeGreaterThan(0);
    expect(SEMANTIC_PATTERNS.date_iso8601.namePatterns.length).toBeGreaterThan(0);
    expect(SEMANTIC_PATTERNS.identifier.namePatterns.length).toBeGreaterThan(0);
  });

  it('should have empty patterns for unknown type', () => {
    expect(SEMANTIC_PATTERNS.unknown.namePatterns.length).toBe(0);
    expect(SEMANTIC_PATTERNS.unknown.descriptionPatterns.length).toBe(0);
  });
});
