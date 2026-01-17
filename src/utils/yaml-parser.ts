/**
 * Secure YAML parsing utility.
 *
 * Provides safe YAML parsing with protection against:
 * - Alias bombs (billion laughs attack) via maxAliasCount
 * - Excessive nesting via depth validation
 * - Circular references
 */

import { parse as yamlParse, type ParseOptions } from 'yaml';

/**
 * Default security limits for YAML parsing.
 */
export const YAML_SECURITY_LIMITS = {
  /** Maximum number of aliases to resolve (prevents billion laughs attack) */
  MAX_ALIAS_COUNT: 100,
  /** Maximum nesting depth for parsed structures */
  MAX_DEPTH: 50,
  /** Maximum size of input in characters */
  MAX_INPUT_SIZE: 10 * 1024 * 1024, // 10MB
};

/**
 * Options for secure YAML parsing.
 */
export interface SecureYamlOptions {
  /** Maximum number of aliases to resolve (default: 100) */
  maxAliasCount?: number;
  /** Maximum nesting depth (default: 50) */
  maxDepth?: number;
  /** Maximum input size in characters (default: 10MB) */
  maxInputSize?: number;
  /** Additional yaml parse options */
  parseOptions?: ParseOptions;
}

/**
 * Check the depth of a nested structure.
 * Throws if depth exceeds the limit.
 */
function validateDepth(value: unknown, maxDepth: number, currentDepth = 0): void {
  if (currentDepth > maxDepth) {
    throw new Error(`YAML nesting depth exceeds maximum of ${maxDepth}`);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      validateDepth(item, maxDepth, currentDepth + 1);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      validateDepth((value as Record<string, unknown>)[key], maxDepth, currentDepth + 1);
    }
  }
}

/**
 * Parse YAML with security protections.
 *
 * @param content - YAML content to parse
 * @param options - Security options
 * @returns Parsed YAML value
 * @throws Error if parsing fails or security limits are exceeded
 *
 * @example
 * ```typescript
 * const data = parseYamlSecure(content);
 * const config = parseYamlSecure(content, { maxDepth: 10 });
 * ```
 */
export function parseYamlSecure<T = unknown>(
  content: string,
  options?: SecureYamlOptions
): T {
  const maxAliasCount = options?.maxAliasCount ?? YAML_SECURITY_LIMITS.MAX_ALIAS_COUNT;
  const maxDepth = options?.maxDepth ?? YAML_SECURITY_LIMITS.MAX_DEPTH;
  const maxInputSize = options?.maxInputSize ?? YAML_SECURITY_LIMITS.MAX_INPUT_SIZE;

  // Check input size
  if (content.length > maxInputSize) {
    throw new Error(
      `YAML input size (${content.length} bytes) exceeds maximum of ${maxInputSize} bytes`
    );
  }

  // Parse with alias protection
  const parsed = yamlParse(content, {
    maxAliasCount,
    ...options?.parseOptions,
  });

  // Validate nesting depth
  validateDepth(parsed, maxDepth);

  return parsed as T;
}

/**
 * Parse YAML with strict security settings.
 * Use this for parsing untrusted input.
 *
 * @param content - YAML content to parse
 * @returns Parsed YAML value
 * @throws Error if parsing fails or security limits are exceeded
 */
export function parseYamlStrict<T = unknown>(content: string): T {
  return parseYamlSecure<T>(content, {
    maxAliasCount: 10,
    maxDepth: 20,
    maxInputSize: 1024 * 1024, // 1MB
  });
}
