/**
 * Semantic validator for inferring and validating semantic types.
 *
 * This module provides functions to:
 * 1. Infer semantic types from parameter names and descriptions
 * 2. Validate values against expected semantic types
 */

import type {
  SemanticType,
  SemanticInference,
  SemanticValidationResult,
} from './semantic-types.js';
import { SEMANTIC_PATTERNS } from './semantic-types.js';
import { SEMANTIC_VALIDATION } from '../constants.js';

/**
 * Infer semantic type from parameter name and description.
 *
 * Uses pattern matching against known semantic type patterns to determine
 * the most likely semantic type for a parameter.
 *
 * @param paramName - The name of the parameter
 * @param description - Optional description of the parameter
 * @param schemaFormat - Optional JSON Schema format hint
 * @returns Inference result with type, confidence, and evidence
 */
export function inferSemanticType(
  paramName: string,
  description?: string,
  schemaFormat?: string
): SemanticInference {
  const evidence: string[] = [];
  let bestMatch: SemanticType = 'unknown';
  let bestConfidence = 0;

  // Check schema format first (highest confidence)
  if (schemaFormat) {
    const formatType = mapFormatToSemanticType(schemaFormat);
    if (formatType !== 'unknown') {
      return {
        paramName,
        inferredType: formatType,
        confidence: SEMANTIC_VALIDATION.CONFIDENCE.SCHEMA_FORMAT,
        evidence: [`Schema format: ${schemaFormat}`],
      };
    }
  }

  // Check each semantic type
  for (const [type, patterns] of Object.entries(SEMANTIC_PATTERNS)) {
    if (type === 'unknown') continue;

    let confidence = 0;
    const typeEvidence: string[] = [];

    // Check name patterns
    for (const pattern of patterns.namePatterns) {
      if (pattern.test(paramName)) {
        confidence += SEMANTIC_VALIDATION.CONFIDENCE.NAME_PATTERN_MATCH;
        typeEvidence.push(`Name matches pattern: ${pattern.source}`);
        break;
      }
    }

    // Check description patterns
    if (description) {
      for (const pattern of patterns.descriptionPatterns) {
        if (pattern.test(description)) {
          confidence += SEMANTIC_VALIDATION.CONFIDENCE.DESCRIPTION_PATTERN_MATCH;
          typeEvidence.push(`Description matches: ${pattern.source}`);
          break;
        }
      }
    }

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestMatch = type as SemanticType;
      evidence.length = 0;
      evidence.push(...typeEvidence);
    }
  }

  return {
    paramName,
    inferredType: bestMatch,
    confidence: Math.min(1, bestConfidence),
    evidence,
  };
}

/**
 * Map JSON Schema format to semantic type.
 *
 * @param format - JSON Schema format string
 * @returns Corresponding semantic type or 'unknown'
 */
function mapFormatToSemanticType(format: string): SemanticType {
  const formatLower = format.toLowerCase();

  const formatMap: Record<string, SemanticType> = {
    'date': 'date_iso8601',
    'date-time': 'datetime',
    'email': 'email',
    'uri': 'url',
    'url': 'url',
    'uuid': 'identifier',
    'ipv4': 'ip_address',
    'ipv6': 'ip_address',
    'ip-address': 'ip_address',
    'hostname': 'url',
  };

  return formatMap[formatLower] ?? 'unknown';
}

/**
 * Validate a value against an expected semantic type.
 *
 * @param paramName - The name of the parameter being validated
 * @param value - The value to validate
 * @param expectedType - The expected semantic type
 * @returns Validation result with validity and any issues
 */
export function validateSemanticValue(
  paramName: string,
  value: unknown,
  expectedType: SemanticType
): SemanticValidationResult {
  if (expectedType === 'unknown') {
    return { paramName, expectedType, providedValue: value, isValid: true };
  }

  if (typeof value !== 'string') {
    // Non-string values can't be validated semantically
    return { paramName, expectedType, providedValue: value, isValid: true };
  }

  const validators: Record<SemanticType, (v: string) => string | null> = {
    date_iso8601: validateDate,
    date_month: validateMonth,
    datetime: validateDateTime,
    timestamp: validateTimestamp,
    amount_currency: validateAmount,
    percentage: validatePercentage,
    identifier: validateIdentifier,
    email: validateEmail,
    url: validateUrl,
    phone: validatePhone,
    ip_address: validateIpAddress,
    file_path: () => null, // Paths are hard to validate generically
    json: validateJson,
    base64: validateBase64,
    regex: validateRegex,
    unknown: () => null,
  };

  const issue = validators[expectedType](value);

  return {
    paramName,
    expectedType,
    providedValue: value,
    isValid: issue === null,
    issue: issue ?? undefined,
  };
}

/**
 * Validate all parameters in a tool call against inferred types.
 *
 * @param args - The arguments to validate
 * @param inferences - The semantic inferences for each parameter
 * @returns Array of validation results
 */
export function validateAllParameters(
  args: Record<string, unknown>,
  inferences: SemanticInference[]
): SemanticValidationResult[] {
  const results: SemanticValidationResult[] = [];

  for (const inference of inferences) {
    const value = args[inference.paramName];
    if (value !== undefined) {
      results.push(
        validateSemanticValue(
          inference.paramName,
          value,
          inference.inferredType
        )
      );
    }
  }

  return results;
}

// ==================== Validation Functions ====================

/**
 * Validate ISO 8601 date format (YYYY-MM-DD).
 */
function validateDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `Expected date format YYYY-MM-DD, got: ${value}`;
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return `Invalid date: ${value}`;
  }
  // Validate the date components are valid
  const [, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12) {
    return `Invalid month: ${month}`;
  }
  if (day < 1 || day > 31) {
    return `Invalid day: ${day}`;
  }
  return null;
}

/**
 * Validate month format (YYYY-MM).
 */
function validateMonth(value: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return `Expected month format YYYY-MM, got: ${value}`;
  }
  const [, month] = value.split('-').map(Number);
  if (month < 1 || month > 12) {
    return `Invalid month: ${month}`;
  }
  return null;
}

/**
 * Validate ISO 8601 datetime.
 */
function validateDateTime(value: string): string | null {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return `Invalid datetime: ${value}`;
  }
  return null;
}

/**
 * Validate Unix timestamp.
 */
function validateTimestamp(value: string): string | null {
  const num = Number(value);
  if (isNaN(num) || num < 0) {
    return `Expected positive number for timestamp, got: ${value}`;
  }
  return null;
}

/**
 * Validate monetary amount.
 */
function validateAmount(value: string): string | null {
  // Remove currency symbols and commas
  const cleaned = value.replace(/[$,\u20AC\u00A3]/g, '');
  const num = Number(cleaned);
  if (isNaN(num)) {
    return `Expected numeric amount, got: ${value}`;
  }
  return null;
}

/**
 * Validate percentage.
 */
function validatePercentage(value: string): string | null {
  // Remove % symbol if present
  const cleaned = value.replace(/%$/, '');
  const num = Number(cleaned);
  if (isNaN(num)) {
    return `Expected numeric percentage, got: ${value}`;
  }
  // Don't enforce range - could be 0-1 or 0-100
  return null;
}

/**
 * Validate identifier (non-empty string).
 */
function validateIdentifier(value: string): string | null {
  if (value.trim().length === 0) {
    return 'Identifier cannot be empty';
  }
  return null;
}

/**
 * Validate email format.
 */
function validateEmail(value: string): string | null {
  // Basic email validation - requires @ and at least one dot after @
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return `Invalid email format: ${value}`;
  }
  return null;
}

/**
 * Validate URL format.
 */
function validateUrl(value: string): string | null {
  try {
    new URL(value);
    return null;
  } catch {
    return `Invalid URL: ${value}`;
  }
}

/**
 * Validate phone number (loose validation - at least 7 digits).
 */
function validatePhone(value: string): string | null {
  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly.length < 7) {
    return `Invalid phone number (too few digits): ${value}`;
  }
  return null;
}

/**
 * Validate IP address (IPv4 or IPv6).
 */
function validateIpAddress(value: string): string | null {
  // IPv4 validation
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    const parts = value.split('.').map(Number);
    if (parts.every((p) => p >= 0 && p <= 255)) {
      return null;
    }
    return `Invalid IPv4 address (octets must be 0-255): ${value}`;
  }

  // IPv6 validation (simplified - just check for valid hex groups with colons)
  if (/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(value)) {
    return null;
  }

  // IPv6 with :: shorthand
  if (value.includes('::') && /^[0-9a-fA-F:]+$/.test(value)) {
    return null;
  }

  return `Invalid IP address: ${value}`;
}

/**
 * Validate JSON string.
 */
function validateJson(value: string): string | null {
  try {
    JSON.parse(value);
    return null;
  } catch {
    const preview = value.length > 50 ? `${value.slice(0, 50)}...` : value;
    return `Invalid JSON: ${preview}`;
  }
}

/**
 * Validate Base64 encoded string.
 */
function validateBase64(value: string): string | null {
  // Standard base64 characters plus optional padding
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    const preview = value.length > 50 ? `${value.slice(0, 50)}...` : value;
    return `Invalid base64: ${preview}`;
  }
  // Check length is valid (must be multiple of 4 when padded)
  if (value.length % 4 !== 0) {
    return `Invalid base64 length (must be multiple of 4): ${value.length}`;
  }
  return null;
}

/**
 * Validate regular expression.
 */
function validateRegex(value: string): string | null {
  try {
    new RegExp(value);
    return null;
  } catch {
    return `Invalid regex: ${value}`;
  }
}
