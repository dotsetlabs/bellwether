/**
 * Smart test value generation for schema-based testing.
 *
 * This module provides intelligent value generation for test cases by:
 * 1. Recognizing semantic patterns in field names and descriptions
 * 2. Respecting JSON Schema format fields
 * 3. Generating syntactically and semantically valid test values
 *
 * The goal is to generate values that are more likely to be accepted by
 * real-world tools, rather than random strings that get rejected.
 */

// ==================== Configuration Constants ====================

/**
 * Pattern matchers for detecting date/time formats.
 */
export const DATE_TIME_PATTERNS = {
  /** Field name patterns that suggest date fields */
  FIELD_NAME: [
    /date$/i,           // end_date, start_date
    /_at$/i,            // created_at, updated_at
    /_on$/i,            // posted_on, modified_on
    /timestamp$/i,      // created_timestamp
    /^date$/i,          // date
    /birth/i,           // birthdate
    /expir/i,           // expiration, expiry
    /when$/i,           // when
  ] as const,

  /** Description patterns that suggest date formats */
  DESCRIPTION: [
    /YYYY-MM-DD/i,
    /ISO\s*8601/i,
    /date\s*format/i,
    /unix\s*timestamp/i,
    /epoch\s*time/i,
    /date\s*string/i,
  ] as const,

  /** Default date value if format not specified */
  DEFAULT_DATE: '2024-01-15',
  DEFAULT_DATETIME: '2024-01-15T14:30:00Z',
  DEFAULT_TIME: '14:30:00',
} as const;

/**
 * Pattern matchers for detecting email fields.
 */
export const EMAIL_PATTERNS = {
  /** Field name patterns */
  FIELD_NAME: [
    /email$/i,
    /e-mail/i,
    /mail$/i,
  ] as const,

  /** Description patterns */
  DESCRIPTION: [
    /email\s*address/i,
    /e-mail/i,
    /valid.*email/i,
  ] as const,

  /** Default email value */
  DEFAULT: 'test@example.com',
} as const;

/**
 * Pattern matchers for detecting URL fields.
 */
export const URL_PATTERNS = {
  /** Field name patterns */
  FIELD_NAME: [
    /url$/i,
    /uri$/i,
    /link$/i,
    /href$/i,
    /endpoint$/i,
    /callback$/i,
    /redirect$/i,
    /webhook$/i,
  ] as const,

  /** Description patterns */
  DESCRIPTION: [
    /URL/i,
    /URI/i,
    /http.*link/i,
    /web\s*address/i,
  ] as const,

  /** Default URL value */
  DEFAULT: 'https://example.com',
} as const;

/**
 * Pattern matchers for detecting ID fields.
 */
export const ID_PATTERNS = {
  /** Field name patterns */
  FIELD_NAME: [
    /^id$/i,
    /_id$/i,
    /Id$/,              // camelCase: userId
    /uuid$/i,
    /guid$/i,
  ] as const,

  /** Description patterns */
  DESCRIPTION: [
    /unique\s*identifier/i,
    /UUID/i,
    /GUID/i,
  ] as const,

  /** Default ID value */
  DEFAULT: 'test-id-123',
  DEFAULT_UUID: '550e8400-e29b-41d4-a716-446655440000',
} as const;

/**
 * Pattern matchers for detecting phone fields.
 */
export const PHONE_PATTERNS = {
  /** Field name patterns */
  FIELD_NAME: [
    /phone$/i,
    /mobile$/i,
    /tel$/i,
    /telephone$/i,
    /cell$/i,
    /fax$/i,
  ] as const,

  /** Description patterns */
  DESCRIPTION: [
    /phone\s*number/i,
    /telephone/i,
    /mobile\s*number/i,
  ] as const,

  /** Default phone value */
  DEFAULT: '+1-555-123-4567',
} as const;

/**
 * Pattern matchers for detecting monetary/amount fields.
 */
export const AMOUNT_PATTERNS = {
  /** Field name patterns */
  FIELD_NAME: [
    /amount$/i,
    /price$/i,
    /cost$/i,
    /total$/i,
    /balance$/i,
    /fee$/i,
  ] as const,

  /** Description patterns */
  DESCRIPTION: [
    /amount/i,
    /currency/i,
    /dollar/i,
    /price/i,
    /USD|EUR|GBP/i,
  ] as const,

  /** Default amount value */
  DEFAULT: '100.00',
} as const;

/**
 * Pattern matchers for detecting month fields.
 */
export const MONTH_PATTERNS = {
  /** Field name patterns */
  FIELD_NAME: [
    /month$/i,
    /_month$/i,
  ] as const,

  /** Description patterns */
  DESCRIPTION: [
    /month/i,
    /january|february|march|april|may|june|july|august|september|october|november|december/i,
  ] as const,

  /** Valid month names */
  VALID_VALUES: [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ],

  /** Default month value */
  DEFAULT: 'january',
  DEFAULT_NUMERIC: '01',
} as const;

/**
 * Pattern matchers for detecting year fields.
 */
export const YEAR_PATTERNS = {
  /** Field name patterns */
  FIELD_NAME: [
    /year$/i,
    /_year$/i,
  ] as const,

  /** Description patterns */
  DESCRIPTION: [
    /\byear\b/i,
    /YYYY/i,
  ] as const,

  /** Default year value */
  DEFAULT: '2024',
} as const;

// ==================== Type Definitions ====================

/**
 * Property schema interface (JSON Schema subset).
 */
export interface PropertySchema {
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
 * Result of smart value generation.
 */
export interface SmartValueResult {
  /** The generated value */
  value: unknown;
  /** The detected semantic type */
  semanticType: string | null;
  /** Confidence level of the type detection */
  confidence: 'high' | 'medium' | 'low';
}

// ==================== Helper Functions ====================

/**
 * Test if a string matches any pattern in a list.
 */
function matchesAny(str: string, patterns: readonly RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(str));
}

/**
 * Get the primary type from a schema property.
 */
function getPrimaryType(schema: PropertySchema): string | undefined {
  if (Array.isArray(schema.type)) {
    return schema.type.find((t) => t !== 'null') ?? schema.type[0];
  }
  return schema.type;
}

// ==================== Smart Value Generation ====================

/**
 * Generate a smart string value based on field name, description, and schema.
 */
export function generateSmartStringValue(
  propName: string,
  prop: PropertySchema
): SmartValueResult {
  const lowerName = propName.toLowerCase();
  const description = prop.description ?? '';

  // Priority 1: Check schema format field (JSON Schema standard)
  if (prop.format) {
    const formatValue = getValueForFormat(prop.format);
    if (formatValue !== null) {
      return {
        value: formatValue.value,
        semanticType: formatValue.type,
        confidence: 'high',
      };
    }
  }

  // Priority 2: Check for enum values - use first valid enum
  if (prop.enum && prop.enum.length > 0) {
    return {
      value: prop.enum[0],
      semanticType: 'enum',
      confidence: 'high',
    };
  }

  // Priority 3: Check for example values
  if (prop.examples && prop.examples.length > 0) {
    return {
      value: prop.examples[0],
      semanticType: 'example',
      confidence: 'high',
    };
  }

  // Priority 4: Detect semantic type from field name and description
  const detected = detectSemanticType(lowerName, description, propName);
  if (detected) {
    return detected;
  }

  // Priority 5: Default fallback
  return {
    value: 'test',
    semanticType: null,
    confidence: 'low',
  };
}

/**
 * Get a value for a JSON Schema format field.
 */
function getValueForFormat(format: string): { value: string; type: string } | null {
  switch (format) {
    case 'date':
      return { value: DATE_TIME_PATTERNS.DEFAULT_DATE, type: 'date' };
    case 'date-time':
      return { value: DATE_TIME_PATTERNS.DEFAULT_DATETIME, type: 'datetime' };
    case 'time':
      return { value: DATE_TIME_PATTERNS.DEFAULT_TIME, type: 'time' };
    case 'email':
      return { value: EMAIL_PATTERNS.DEFAULT, type: 'email' };
    case 'uri':
    case 'url':
      return { value: URL_PATTERNS.DEFAULT, type: 'url' };
    case 'uuid':
      return { value: ID_PATTERNS.DEFAULT_UUID, type: 'uuid' };
    case 'ipv4':
      return { value: '192.168.1.100', type: 'ipv4' };
    case 'hostname':
      return { value: 'example.com', type: 'hostname' };
    default:
      return null;
  }
}

/**
 * Detect semantic type from field name and description.
 */
function detectSemanticType(
  lowerName: string,
  description: string,
  originalName: string
): SmartValueResult | null {
  // Check for date/time patterns
  if (matchesAny(lowerName, DATE_TIME_PATTERNS.FIELD_NAME) ||
      matchesAny(description, DATE_TIME_PATTERNS.DESCRIPTION)) {
    return {
      value: DATE_TIME_PATTERNS.DEFAULT_DATE,
      semanticType: 'date',
      confidence: 'medium',
    };
  }

  // Check for email patterns
  if (matchesAny(lowerName, EMAIL_PATTERNS.FIELD_NAME) ||
      matchesAny(description, EMAIL_PATTERNS.DESCRIPTION)) {
    return {
      value: EMAIL_PATTERNS.DEFAULT,
      semanticType: 'email',
      confidence: 'medium',
    };
  }

  // Check for URL patterns
  if (matchesAny(lowerName, URL_PATTERNS.FIELD_NAME) ||
      matchesAny(description, URL_PATTERNS.DESCRIPTION)) {
    return {
      value: URL_PATTERNS.DEFAULT,
      semanticType: 'url',
      confidence: 'medium',
    };
  }

  // Check for phone patterns
  if (matchesAny(lowerName, PHONE_PATTERNS.FIELD_NAME) ||
      matchesAny(description, PHONE_PATTERNS.DESCRIPTION)) {
    return {
      value: PHONE_PATTERNS.DEFAULT,
      semanticType: 'phone',
      confidence: 'medium',
    };
  }

  // Check for ID patterns (including camelCase like userId)
  if (matchesAny(lowerName, ID_PATTERNS.FIELD_NAME) ||
      matchesAny(originalName, ID_PATTERNS.FIELD_NAME) ||
      matchesAny(description, ID_PATTERNS.DESCRIPTION)) {
    // If description mentions UUID, use UUID format
    if (/uuid|guid/i.test(description)) {
      return {
        value: ID_PATTERNS.DEFAULT_UUID,
        semanticType: 'uuid',
        confidence: 'medium',
      };
    }
    return {
      value: ID_PATTERNS.DEFAULT,
      semanticType: 'id',
      confidence: 'medium',
    };
  }

  // Check for amount/currency patterns
  if (matchesAny(lowerName, AMOUNT_PATTERNS.FIELD_NAME) ||
      matchesAny(description, AMOUNT_PATTERNS.DESCRIPTION)) {
    return {
      value: AMOUNT_PATTERNS.DEFAULT,
      semanticType: 'amount',
      confidence: 'medium',
    };
  }

  // Check for month patterns
  if (matchesAny(lowerName, MONTH_PATTERNS.FIELD_NAME) ||
      matchesAny(description, MONTH_PATTERNS.DESCRIPTION)) {
    return {
      value: MONTH_PATTERNS.DEFAULT,
      semanticType: 'month',
      confidence: 'medium',
    };
  }

  // Check for year patterns
  if (matchesAny(lowerName, YEAR_PATTERNS.FIELD_NAME) ||
      matchesAny(description, YEAR_PATTERNS.DESCRIPTION)) {
    return {
      value: YEAR_PATTERNS.DEFAULT,
      semanticType: 'year',
      confidence: 'medium',
    };
  }

  // Check for common field name patterns
  if (lowerName.includes('name')) {
    return {
      value: 'test-name',
      semanticType: 'name',
      confidence: 'low',
    };
  }

  if (lowerName.includes('path') || lowerName.includes('directory')) {
    return {
      value: '/tmp/test',
      semanticType: 'path',
      confidence: 'low',
    };
  }

  if (lowerName.includes('query') || lowerName.includes('search')) {
    return {
      value: 'test query',
      semanticType: 'search_query',
      confidence: 'low',
    };
  }

  if (lowerName.includes('token') || lowerName.includes('key') || lowerName.includes('secret')) {
    return {
      value: 'test-token-abc123',
      semanticType: 'token',
      confidence: 'low',
    };
  }

  if (lowerName.includes('account')) {
    return {
      value: 'test-account-123',
      semanticType: 'account',
      confidence: 'low',
    };
  }

  if (lowerName.includes('category')) {
    return {
      value: 'test-category',
      semanticType: 'category',
      confidence: 'low',
    };
  }

  return null;
}

/**
 * Generate a smart number value based on schema constraints.
 */
export function generateSmartNumberValue(prop: PropertySchema): SmartValueResult {
  const type = getPrimaryType(prop);
  const isInteger = type === 'integer';

  // Use example if available
  if (prop.examples && prop.examples.length > 0) {
    return {
      value: prop.examples[0],
      semanticType: 'example',
      confidence: 'high',
    };
  }

  // Use default if available
  if (prop.default !== undefined) {
    return {
      value: prop.default,
      semanticType: 'default',
      confidence: 'high',
    };
  }

  const min = prop.minimum ?? 0;
  const max = prop.maximum ?? (min + 100);

  // Calculate a value in the valid range
  let value = Math.floor((min + max) / 2);
  if (!isInteger) {
    value = Math.round(((min + max) / 2) * 100) / 100;
  }

  return {
    value,
    semanticType: isInteger ? 'integer' : 'number',
    confidence: 'low',
  };
}

/**
 * Generate a complete smart value for any type.
 */
export function generateSmartValue(
  propName: string,
  prop: PropertySchema
): SmartValueResult {
  const type = getPrimaryType(prop);

  // Use default if available
  if (prop.default !== undefined) {
    return {
      value: prop.default,
      semanticType: 'default',
      confidence: 'high',
    };
  }

  // Use first example if available
  if (prop.examples && prop.examples.length > 0) {
    return {
      value: prop.examples[0],
      semanticType: 'example',
      confidence: 'high',
    };
  }

  // Use first enum value if available
  if (prop.enum && prop.enum.length > 0) {
    return {
      value: prop.enum[0],
      semanticType: 'enum',
      confidence: 'high',
    };
  }

  // Use const if available
  if (prop.const !== undefined) {
    return {
      value: prop.const,
      semanticType: 'const',
      confidence: 'high',
    };
  }

  switch (type) {
    case 'string':
      return generateSmartStringValue(propName, prop);
    case 'number':
    case 'integer':
      return generateSmartNumberValue(prop);
    case 'boolean':
      return { value: true, semanticType: 'boolean', confidence: 'high' };
    case 'array':
      return { value: [], semanticType: 'array', confidence: 'low' };
    case 'object':
      return { value: {}, semanticType: 'object', confidence: 'low' };
    default:
      return { value: 'test', semanticType: null, confidence: 'low' };
  }
}

/**
 * Generate multiple alternative values for a field (for varied testing).
 */
export function generateAlternativeValues(
  propName: string,
  prop: PropertySchema,
  count: number = 3
): SmartValueResult[] {
  const results: SmartValueResult[] = [];
  const type = getPrimaryType(prop);

  // If enum, return different enum values
  if (prop.enum && prop.enum.length > 1) {
    for (let i = 0; i < Math.min(count, prop.enum.length); i++) {
      results.push({
        value: prop.enum[i],
        semanticType: 'enum',
        confidence: 'high',
      });
    }
    return results;
  }

  // Generate alternatives based on type
  if (type === 'string') {
    const base = generateSmartStringValue(propName, prop);
    results.push(base);

    // Generate variations based on semantic type
    if (base.semanticType === 'date') {
      results.push({ value: '2024-06-30', semanticType: 'date', confidence: 'medium' });
      results.push({ value: '2024-12-31', semanticType: 'date', confidence: 'medium' });
    } else if (base.semanticType === 'email') {
      results.push({ value: 'user@test.com', semanticType: 'email', confidence: 'medium' });
      results.push({ value: 'admin@example.org', semanticType: 'email', confidence: 'medium' });
    } else if (base.semanticType === 'id') {
      results.push({ value: 'test-id-456', semanticType: 'id', confidence: 'medium' });
      results.push({ value: 'test-id-789', semanticType: 'id', confidence: 'medium' });
    } else {
      results.push({ value: 'alternative-1', semanticType: null, confidence: 'low' });
      results.push({ value: 'alternative-2', semanticType: null, confidence: 'low' });
    }
  } else if (type === 'number' || type === 'integer') {
    const min = prop.minimum ?? 0;
    const max = prop.maximum ?? 100;
    const step = (max - min) / (count + 1);

    for (let i = 1; i <= count; i++) {
      const value = type === 'integer' ? Math.floor(min + step * i) : min + step * i;
      results.push({ value, semanticType: type, confidence: 'medium' });
    }
  } else if (type === 'boolean') {
    results.push({ value: true, semanticType: 'boolean', confidence: 'high' });
    results.push({ value: false, semanticType: 'boolean', confidence: 'high' });
  }

  return results.slice(0, count);
}
