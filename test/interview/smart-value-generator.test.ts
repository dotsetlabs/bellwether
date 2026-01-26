/**
 * Tests for smart value generation.
 */
import { describe, it, expect } from 'vitest';
import {
  generateSmartStringValue,
  generateSmartNumberValue,
  generateSmartValue,
  generateAlternativeValues,
  DATE_TIME_PATTERNS,
  EMAIL_PATTERNS,
  URL_PATTERNS,
  ID_PATTERNS,
  PHONE_PATTERNS,
  AMOUNT_PATTERNS,
  MONTH_PATTERNS,
  YEAR_PATTERNS,
} from '../../src/interview/smart-value-generator.js';

describe('smart-value-generator', () => {
  // ==================== Date/Time Pattern Detection ====================
  describe('date/time value generation', () => {
    it('should detect date fields by name suffix', () => {
      const result = generateSmartStringValue('created_at', { type: 'string' });
      expect(result.semanticType).toBe('date');
      expect(result.value).toBe(DATE_TIME_PATTERNS.DEFAULT_DATE);
    });

    it('should detect date fields by _on suffix', () => {
      const result = generateSmartStringValue('posted_on', { type: 'string' });
      expect(result.semanticType).toBe('date');
    });

    it('should detect date fields by name', () => {
      const result = generateSmartStringValue('date', { type: 'string' });
      expect(result.semanticType).toBe('date');
    });

    it('should detect birthdate fields', () => {
      const result = generateSmartStringValue('birthdate', { type: 'string' });
      expect(result.semanticType).toBe('date');
    });

    it('should detect expiration fields', () => {
      const result = generateSmartStringValue('expiration_date', { type: 'string' });
      expect(result.semanticType).toBe('date');
    });

    it('should use JSON Schema format for date', () => {
      const result = generateSmartStringValue('some_field', { type: 'string', format: 'date' });
      expect(result.semanticType).toBe('date');
      expect(result.confidence).toBe('high');
      expect(result.value).toBe(DATE_TIME_PATTERNS.DEFAULT_DATE);
    });

    it('should use JSON Schema format for date-time', () => {
      const result = generateSmartStringValue('timestamp', { type: 'string', format: 'date-time' });
      expect(result.semanticType).toBe('datetime');
      expect(result.confidence).toBe('high');
      expect(result.value).toBe(DATE_TIME_PATTERNS.DEFAULT_DATETIME);
    });

    it('should use JSON Schema format for time', () => {
      const result = generateSmartStringValue('start_time', { type: 'string', format: 'time' });
      expect(result.semanticType).toBe('time');
      expect(result.confidence).toBe('high');
      expect(result.value).toBe(DATE_TIME_PATTERNS.DEFAULT_TIME);
    });

    it('should detect date from description', () => {
      const result = generateSmartStringValue('value', {
        type: 'string',
        description: 'Date in YYYY-MM-DD format',
      });
      expect(result.semanticType).toBe('date');
    });
  });

  // ==================== Email Pattern Detection ====================
  describe('email value generation', () => {
    it('should detect email fields by name suffix', () => {
      const result = generateSmartStringValue('user_email', { type: 'string' });
      expect(result.semanticType).toBe('email');
      expect(result.value).toBe(EMAIL_PATTERNS.DEFAULT);
    });

    it('should detect mail fields', () => {
      const result = generateSmartStringValue('contact_mail', { type: 'string' });
      expect(result.semanticType).toBe('email');
    });

    it('should use JSON Schema format for email', () => {
      const result = generateSmartStringValue('contact', { type: 'string', format: 'email' });
      expect(result.semanticType).toBe('email');
      expect(result.confidence).toBe('high');
    });

    it('should detect email from description', () => {
      const result = generateSmartStringValue('address', {
        type: 'string',
        description: 'Valid email address',
      });
      expect(result.semanticType).toBe('email');
    });
  });

  // ==================== URL Pattern Detection ====================
  describe('URL value generation', () => {
    it('should detect URL fields by name suffix', () => {
      const result = generateSmartStringValue('profile_url', { type: 'string' });
      expect(result.semanticType).toBe('url');
      expect(result.value).toBe(URL_PATTERNS.DEFAULT);
    });

    it('should detect link fields', () => {
      const result = generateSmartStringValue('website_link', { type: 'string' });
      expect(result.semanticType).toBe('url');
    });

    it('should detect callback fields', () => {
      const result = generateSmartStringValue('callback', { type: 'string' });
      expect(result.semanticType).toBe('url');
    });

    it('should detect webhook fields', () => {
      const result = generateSmartStringValue('webhook', { type: 'string' });
      expect(result.semanticType).toBe('url');
    });

    it('should use JSON Schema format for uri', () => {
      const result = generateSmartStringValue('endpoint', { type: 'string', format: 'uri' });
      expect(result.semanticType).toBe('url');
      expect(result.confidence).toBe('high');
    });
  });

  // ==================== ID Pattern Detection ====================
  describe('ID value generation', () => {
    it('should detect id fields', () => {
      const result = generateSmartStringValue('id', { type: 'string' });
      expect(result.semanticType).toBe('id');
      expect(result.value).toBe(ID_PATTERNS.DEFAULT);
    });

    it('should detect _id suffix fields', () => {
      const result = generateSmartStringValue('user_id', { type: 'string' });
      expect(result.semanticType).toBe('id');
    });

    it('should detect camelCase Id fields', () => {
      const result = generateSmartStringValue('userId', { type: 'string' });
      expect(result.semanticType).toBe('id');
    });

    it('should use UUID format when indicated in description', () => {
      const result = generateSmartStringValue('item_id', {
        type: 'string',
        description: 'UUID identifier for the item',
      });
      expect(result.semanticType).toBe('uuid');
      expect(result.value).toBe(ID_PATTERNS.DEFAULT_UUID);
    });

    it('should use JSON Schema format for uuid', () => {
      const result = generateSmartStringValue('request_id', { type: 'string', format: 'uuid' });
      expect(result.semanticType).toBe('uuid');
      expect(result.confidence).toBe('high');
      expect(result.value).toBe(ID_PATTERNS.DEFAULT_UUID);
    });
  });

  // ==================== Phone Pattern Detection ====================
  describe('phone value generation', () => {
    it('should detect phone fields', () => {
      const result = generateSmartStringValue('phone', { type: 'string' });
      expect(result.semanticType).toBe('phone');
      expect(result.value).toBe(PHONE_PATTERNS.DEFAULT);
    });

    it('should detect mobile fields', () => {
      const result = generateSmartStringValue('mobile', { type: 'string' });
      expect(result.semanticType).toBe('phone');
    });

    it('should detect telephone fields', () => {
      const result = generateSmartStringValue('telephone', { type: 'string' });
      expect(result.semanticType).toBe('phone');
    });

    it('should detect phone from description', () => {
      const result = generateSmartStringValue('contact', {
        type: 'string',
        description: 'Phone number for contact',
      });
      expect(result.semanticType).toBe('phone');
    });
  });

  // ==================== Amount Pattern Detection ====================
  describe('amount value generation', () => {
    it('should detect amount fields', () => {
      const result = generateSmartStringValue('amount', { type: 'string' });
      expect(result.semanticType).toBe('amount');
      expect(result.value).toBe(AMOUNT_PATTERNS.DEFAULT);
    });

    it('should detect price fields', () => {
      const result = generateSmartStringValue('price', { type: 'string' });
      expect(result.semanticType).toBe('amount');
    });

    it('should detect total fields', () => {
      const result = generateSmartStringValue('total', { type: 'string' });
      expect(result.semanticType).toBe('amount');
    });

    it('should detect currency from description', () => {
      const result = generateSmartStringValue('value', {
        type: 'string',
        description: 'Amount in USD',
      });
      expect(result.semanticType).toBe('amount');
    });
  });

  // ==================== Month/Year Pattern Detection ====================
  describe('month value generation', () => {
    it('should detect month fields', () => {
      const result = generateSmartStringValue('month', { type: 'string' });
      expect(result.semanticType).toBe('month');
      expect(result.value).toBe(MONTH_PATTERNS.DEFAULT);
    });

    it('should detect _month suffix fields', () => {
      // Use a field name that won't match date patterns (birth, expir)
      const result = generateSmartStringValue('start_month', { type: 'string' });
      expect(result.semanticType).toBe('month');
    });
  });

  describe('year value generation', () => {
    it('should detect year fields', () => {
      const result = generateSmartStringValue('year', { type: 'string' });
      expect(result.semanticType).toBe('year');
      expect(result.value).toBe(YEAR_PATTERNS.DEFAULT);
    });

    it('should detect _year suffix fields', () => {
      // Use a field name that won't match date patterns (birth, expir)
      const result = generateSmartStringValue('start_year', { type: 'string' });
      expect(result.semanticType).toBe('year');
    });
  });

  // ==================== Priority Order ====================
  describe('priority order', () => {
    it('should prioritize format over name pattern', () => {
      // Even though name suggests email, format says uri
      const result = generateSmartStringValue('email_url', { type: 'string', format: 'uri' });
      expect(result.semanticType).toBe('url');
      expect(result.confidence).toBe('high');
    });

    it('should prioritize enum values', () => {
      const result = generateSmartStringValue('status', {
        type: 'string',
        enum: ['active', 'inactive', 'pending'],
      });
      expect(result.semanticType).toBe('enum');
      expect(result.value).toBe('active');
      expect(result.confidence).toBe('high');
    });

    it('should prioritize examples', () => {
      const result = generateSmartStringValue('custom', {
        type: 'string',
        examples: ['example_value'],
      });
      expect(result.semanticType).toBe('example');
      expect(result.value).toBe('example_value');
      expect(result.confidence).toBe('high');
    });
  });

  // ==================== Number Value Generation ====================
  describe('number value generation', () => {
    it('should generate number within min/max bounds', () => {
      const result = generateSmartNumberValue({
        type: 'number',
        minimum: 0,
        maximum: 100,
      });
      expect(result.value).toBe(50);
    });

    it('should generate integer for integer type', () => {
      const result = generateSmartNumberValue({
        type: 'integer',
        minimum: 1,
        maximum: 10,
      });
      expect(result.value).toBe(5);
      expect(result.semanticType).toBe('integer');
    });

    it('should use example if available', () => {
      const result = generateSmartNumberValue({
        type: 'number',
        examples: [42],
      });
      expect(result.value).toBe(42);
      expect(result.confidence).toBe('high');
    });

    it('should use default if available', () => {
      const result = generateSmartNumberValue({
        type: 'number',
        default: 99,
      });
      expect(result.value).toBe(99);
      expect(result.confidence).toBe('high');
    });
  });

  // ==================== Smart Value Generation ====================
  describe('generateSmartValue', () => {
    it('should use default value if available', () => {
      const result = generateSmartValue('field', { type: 'string', default: 'default_value' });
      expect(result.value).toBe('default_value');
      expect(result.semanticType).toBe('default');
      expect(result.confidence).toBe('high');
    });

    it('should use const value if available', () => {
      const result = generateSmartValue('field', { type: 'string', const: 'constant' });
      expect(result.value).toBe('constant');
      expect(result.semanticType).toBe('const');
    });

    it('should generate boolean as true', () => {
      const result = generateSmartValue('enabled', { type: 'boolean' });
      expect(result.value).toBe(true);
      expect(result.semanticType).toBe('boolean');
    });

    it('should generate empty array for array type', () => {
      const result = generateSmartValue('items', { type: 'array' });
      expect(result.value).toEqual([]);
      expect(result.semanticType).toBe('array');
    });

    it('should generate empty object for object type', () => {
      const result = generateSmartValue('data', { type: 'object' });
      expect(result.value).toEqual({});
      expect(result.semanticType).toBe('object');
    });

    it('should handle string type with pattern detection', () => {
      const result = generateSmartValue('user_email', { type: 'string' });
      expect(result.value).toBe(EMAIL_PATTERNS.DEFAULT);
    });
  });

  // ==================== Alternative Values Generation ====================
  describe('generateAlternativeValues', () => {
    it('should generate different enum values', () => {
      const results = generateAlternativeValues('status', {
        type: 'string',
        enum: ['active', 'inactive', 'pending', 'archived'],
      }, 3);
      expect(results).toHaveLength(3);
      expect(results[0].value).toBe('active');
      expect(results[1].value).toBe('inactive');
      expect(results[2].value).toBe('pending');
    });

    it('should generate date variations', () => {
      const results = generateAlternativeValues('created_at', { type: 'string' }, 3);
      expect(results).toHaveLength(3);
      expect(results[0].semanticType).toBe('date');
      expect(results[0].value).toBe(DATE_TIME_PATTERNS.DEFAULT_DATE);
      // Additional variations
      expect(results[1].value).toBe('2024-06-30');
      expect(results[2].value).toBe('2024-12-31');
    });

    it('should generate email variations', () => {
      const results = generateAlternativeValues('email', { type: 'string' }, 3);
      expect(results).toHaveLength(3);
      expect(results[0].semanticType).toBe('email');
      expect(results[1].value).toBe('user@test.com');
    });

    it('should generate id variations', () => {
      const results = generateAlternativeValues('item_id', { type: 'string' }, 3);
      expect(results).toHaveLength(3);
      expect(results[0].semanticType).toBe('id');
    });

    it('should generate number range for numeric types', () => {
      const results = generateAlternativeValues('count', {
        type: 'integer',
        minimum: 0,
        maximum: 100,
      }, 3);
      expect(results).toHaveLength(3);
      // Should be evenly distributed: 25, 50, 75
      expect(results[0].value).toBe(25);
      expect(results[1].value).toBe(50);
      expect(results[2].value).toBe(75);
    });

    it('should generate boolean true and false', () => {
      const results = generateAlternativeValues('enabled', { type: 'boolean' }, 2);
      expect(results).toHaveLength(2);
      expect(results[0].value).toBe(true);
      expect(results[1].value).toBe(false);
    });
  });

  // ==================== Common Field Patterns ====================
  describe('common field name patterns', () => {
    it('should detect name fields', () => {
      const result = generateSmartStringValue('username', { type: 'string' });
      expect(result.semanticType).toBe('name');
      expect(result.value).toBe('test-name');
    });

    it('should detect path fields', () => {
      const result = generateSmartStringValue('file_path', { type: 'string' });
      expect(result.semanticType).toBe('path');
      expect(result.value).toBe('/tmp/test');
    });

    it('should detect query/search fields', () => {
      const result = generateSmartStringValue('search_query', { type: 'string' });
      expect(result.semanticType).toBe('search_query');
      // The value is context-aware, but defaults to 'example search query'
      expect(typeof result.value).toBe('string');
      expect((result.value as string).length).toBeGreaterThan(0);
    });

    it('should detect token fields', () => {
      const result = generateSmartStringValue('api_token', { type: 'string' });
      expect(result.semanticType).toBe('token');
      expect(result.value).toBe('test-token-abc123');
    });

    it('should detect account fields', () => {
      const result = generateSmartStringValue('account', { type: 'string' });
      // account fields return 'account_id' semantic type
      expect(result.semanticType).toBe('account_id');
      // The value uses a realistic account ID format
      expect(result.value).toBe('acct_123456789');
    });

    it('should detect category fields', () => {
      const result = generateSmartStringValue('category', { type: 'string' });
      expect(result.semanticType).toBe('category');
      expect(result.value).toBe('test-category');
    });
  });

  // ==================== Fallback Behavior ====================
  describe('fallback behavior', () => {
    it('should fall back to "test" for unknown string fields', () => {
      const result = generateSmartStringValue('xyz_unknown_field', { type: 'string' });
      expect(result.value).toBe('test');
      expect(result.semanticType).toBeNull();
      expect(result.confidence).toBe('low');
    });
  });

  // ==================== Coordinate Pattern Detection ====================
  describe('coordinate value generation', () => {
    it('should detect latitude fields by name pattern', () => {
      const result = generateSmartNumberValue({ type: 'number' }, 'latitude');
      expect(result.semanticType).toBe('latitude');
      expect(result.value).toBe(37.7749);
    });

    it('should detect lat fields by name pattern', () => {
      const result = generateSmartNumberValue({ type: 'number' }, 'lat');
      expect(result.semanticType).toBe('latitude');
      expect(result.value).toBe(37.7749);
    });

    it('should detect _lat suffix fields', () => {
      const result = generateSmartNumberValue({ type: 'number' }, 'start_lat');
      expect(result.semanticType).toBe('latitude');
      expect(result.value).toBe(37.7749);
    });

    it('should detect longitude fields by name pattern', () => {
      const result = generateSmartNumberValue({ type: 'number' }, 'longitude');
      expect(result.semanticType).toBe('longitude');
      expect(result.value).toBe(-122.4194);
    });

    it('should detect lng fields by name pattern', () => {
      const result = generateSmartNumberValue({ type: 'number' }, 'lng');
      expect(result.semanticType).toBe('longitude');
      expect(result.value).toBe(-122.4194);
    });

    it('should detect lon fields by name pattern', () => {
      const result = generateSmartNumberValue({ type: 'number' }, 'lon');
      expect(result.semanticType).toBe('longitude');
      expect(result.value).toBe(-122.4194);
    });

    it('should detect _lon suffix fields', () => {
      const result = generateSmartNumberValue({ type: 'number' }, 'center_lon');
      expect(result.semanticType).toBe('longitude');
      expect(result.value).toBe(-122.4194);
    });

    it('should respect latitude range constraints', () => {
      const result = generateSmartNumberValue({
        type: 'number',
        minimum: -90,
        maximum: 90
      }, 'latitude');
      expect(result.value).toBeGreaterThanOrEqual(-90);
      expect(result.value).toBeLessThanOrEqual(90);
    });

    it('should respect longitude range constraints', () => {
      const result = generateSmartNumberValue({
        type: 'number',
        minimum: -180,
        maximum: 180
      }, 'longitude');
      expect(result.value).toBeGreaterThanOrEqual(-180);
      expect(result.value).toBeLessThanOrEqual(180);
    });
  });

  // ==================== Pagination Pattern Detection ====================
  describe('pagination value generation', () => {
    it('should detect limit fields', () => {
      const result = generateSmartNumberValue({ type: 'integer' }, 'limit');
      expect(result.semanticType).toBe('limit');
      expect(result.value).toBe(10);
    });

    it('should detect count fields', () => {
      const result = generateSmartNumberValue({ type: 'integer' }, 'count');
      expect(result.semanticType).toBe('limit');
      expect(result.value).toBe(10);
    });

    it('should detect page_size fields', () => {
      const result = generateSmartNumberValue({ type: 'integer' }, 'page_size');
      expect(result.semanticType).toBe('limit');
      expect(result.value).toBe(10);
    });

    it('should detect offset fields', () => {
      const result = generateSmartNumberValue({ type: 'integer' }, 'offset');
      expect(result.semanticType).toBe('offset');
      expect(result.value).toBe(0);
    });

    it('should detect skip fields', () => {
      const result = generateSmartNumberValue({ type: 'integer' }, 'skip');
      expect(result.semanticType).toBe('offset');
      expect(result.value).toBe(0);
    });

    it('should detect page fields with page default', () => {
      const result = generateSmartNumberValue({ type: 'integer' }, 'page');
      expect(result.semanticType).toBe('page');
      expect(result.value).toBe(1);
    });

    it('should respect limit constraints', () => {
      const result = generateSmartNumberValue({
        type: 'integer',
        minimum: 1,
        maximum: 50
      }, 'limit');
      expect(result.value).toBeGreaterThanOrEqual(1);
      expect(result.value).toBeLessThanOrEqual(50);
    });
  });


  // ==================== Additional Format Support ====================
  describe('additional JSON Schema formats', () => {
    it('should handle ipv4 format', () => {
      const result = generateSmartStringValue('server_ip', { type: 'string', format: 'ipv4' });
      expect(result.semanticType).toBe('ipv4');
      expect(result.value).toBe('192.168.1.100');
    });

    it('should handle hostname format', () => {
      const result = generateSmartStringValue('host', { type: 'string', format: 'hostname' });
      expect(result.semanticType).toBe('hostname');
      expect(result.value).toBe('example.com');
    });
  });
});
