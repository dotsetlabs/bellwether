/**
 * Response fingerprinting for structural drift detection.
 *
 * Analyzes MCP tool responses to create deterministic fingerprints
 * that capture response structure, shape, and characteristics without
 * requiring LLM analysis.
 */

import { createHash } from 'crypto';
import type { MCPToolCallResult } from '../transport/types.js';

/**
 * Content type classification for responses.
 */
export type ResponseContentType =
  | 'text'
  | 'object'
  | 'array'
  | 'primitive'
  | 'empty'
  | 'error'
  | 'mixed';

/**
 * Size classification for responses.
 */
export type ResponseSize = 'tiny' | 'small' | 'medium' | 'large';

/**
 * Fingerprint of a tool's response structure.
 */
export interface ResponseFingerprint {
  /** Hash of the response structure (keys, types, nesting) */
  structureHash: string;

  /** Primary content type of the response */
  contentType: ResponseContentType;

  /** Top-level field names if response is an object */
  fields?: string[];

  /** Structure hash of array items (if array response) */
  arrayItemStructure?: string;

  /** Approximate response size category */
  size: ResponseSize;

  /** Whether the response is empty/has no meaningful content */
  isEmpty: boolean;

  /** Number of successful responses used to build this fingerprint */
  sampleCount: number;

  /** Confidence score (0-1) based on response consistency */
  confidence: number;
}

/**
 * Inferred JSON schema from response samples.
 */
export interface InferredSchema {
  type: string;
  properties?: Record<string, InferredSchema>;
  items?: InferredSchema;
  required?: string[];
  nullable?: boolean;
  enum?: unknown[];
}

/**
 * Normalized error pattern for drift detection.
 */
export interface ErrorPattern {
  /** Normalized error category */
  category: 'validation' | 'not_found' | 'permission' | 'timeout' | 'internal' | 'unknown';

  /** Pattern hash for comparison */
  patternHash: string;

  /** Example error message (first occurrence) */
  example: string;

  /** Count of occurrences */
  count: number;
}

/**
 * Result of analyzing multiple tool responses.
 */
export interface ResponseAnalysis {
  /** Aggregated response fingerprint */
  fingerprint: ResponseFingerprint;

  /** Inferred output schema from successful responses */
  inferredSchema?: InferredSchema;

  /** Error patterns observed */
  errorPatterns: ErrorPattern[];

  /** Whether responses were consistent across samples */
  isConsistent: boolean;
}

// =============================================================================
// Core Fingerprinting Functions
// =============================================================================

/**
 * Analyze multiple tool responses to create a comprehensive fingerprint.
 */
export function analyzeResponses(
  responses: Array<{ response: MCPToolCallResult | null; error: string | null }>
): ResponseAnalysis {
  const successfulResponses = responses.filter(
    (r) => r.response && !r.response.isError && !r.error
  );
  const errorResponses = responses.filter(
    (r) => r.error || r.response?.isError
  );

  // Analyze successful responses
  const structures: string[] = [];
  const inferredSchemas: InferredSchema[] = [];

  for (const { response } of successfulResponses) {
    if (!response) continue;

    const content = extractResponseContent(response);
    if (content !== undefined) {
      structures.push(computeStructureHash(content));
      inferredSchemas.push(inferSchemaFromValue(content));
    }
  }

  // Analyze error patterns
  const errorPatterns = analyzeErrorPatterns(errorResponses);

  // Build fingerprint
  const fingerprint = buildFingerprint(successfulResponses, structures);

  // Merge inferred schemas
  const inferredSchema =
    inferredSchemas.length > 0 ? mergeSchemas(inferredSchemas) : undefined;

  // Check consistency
  const uniqueStructures = new Set(structures);
  const isConsistent = uniqueStructures.size <= 1;

  return {
    fingerprint,
    inferredSchema,
    errorPatterns,
    isConsistent,
  };
}

/**
 * Extract the meaningful content from an MCP tool response.
 */
function extractResponseContent(response: MCPToolCallResult): unknown {
  if (!response.content || response.content.length === 0) {
    return undefined;
  }

  // Handle single content item
  if (response.content.length === 1) {
    const item = response.content[0];
    if (item.type === 'text' && 'text' in item && typeof item.text === 'string') {
      // Try to parse as JSON
      try {
        return JSON.parse(item.text);
      } catch {
        return item.text;
      }
    }
    return item;
  }

  // Multiple content items - return as array
  return response.content.map((item) => {
    if (item.type === 'text' && 'text' in item && typeof item.text === 'string') {
      try {
        return JSON.parse(item.text);
      } catch {
        return item.text;
      }
    }
    return item;
  });
}

/**
 * Compute a structure hash that captures shape but not values.
 */
function computeStructureHash(value: unknown): string {
  const structure = extractStructure(value);
  const serialized = JSON.stringify(structure);
  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

/**
 * Extract the structural representation of a value.
 * Captures types, keys, and nesting but not actual values.
 */
function extractStructure(value: unknown, depth: number = 0): unknown {
  // Prevent infinite recursion
  if (depth > 10) {
    return { type: 'deep' };
  }

  if (value === null) {
    return { type: 'null' };
  }

  if (value === undefined) {
    return { type: 'undefined' };
  }

  const valueType = typeof value;

  if (valueType === 'string') {
    // Classify string patterns
    const str = value as string;
    if (str.length === 0) return { type: 'string', subtype: 'empty' };
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return { type: 'string', subtype: 'date' };
    if (/^https?:\/\//.test(str)) return { type: 'string', subtype: 'url' };
    if (/^[\w.-]+@[\w.-]+\.\w+$/.test(str)) return { type: 'string', subtype: 'email' };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
      return { type: 'string', subtype: 'uuid' };
    }
    return { type: 'string' };
  }

  if (valueType === 'number') {
    const num = value as number;
    if (Number.isInteger(num)) return { type: 'integer' };
    return { type: 'number' };
  }

  if (valueType === 'boolean') {
    return { type: 'boolean' };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: 'array', items: { type: 'unknown' }, empty: true };
    }

    // Sample first few items to determine array item structure
    const sampleSize = Math.min(3, value.length);
    const itemStructures = value
      .slice(0, sampleSize)
      .map((item) => extractStructure(item, depth + 1));

    // Check if all items have the same structure
    const firstStructure = JSON.stringify(itemStructures[0]);
    const isHomogeneous = itemStructures.every(
      (s) => JSON.stringify(s) === firstStructure
    );

    return {
      type: 'array',
      items: isHomogeneous ? itemStructures[0] : { type: 'mixed' },
      homogeneous: isHomogeneous,
    };
  }

  if (valueType === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();

    if (keys.length === 0) {
      return { type: 'object', properties: {}, empty: true };
    }

    const properties: Record<string, unknown> = {};
    for (const key of keys) {
      properties[key] = extractStructure(obj[key], depth + 1);
    }

    return {
      type: 'object',
      properties,
      keys: keys.length,
    };
  }

  return { type: valueType };
}

/**
 * Build a fingerprint from analyzed responses.
 */
function buildFingerprint(
  responses: Array<{ response: MCPToolCallResult | null; error: string | null }>,
  structureHashes: string[]
): ResponseFingerprint {
  if (responses.length === 0 || structureHashes.length === 0) {
    return {
      structureHash: 'empty',
      contentType: 'empty',
      size: 'tiny',
      isEmpty: true,
      sampleCount: 0,
      confidence: 0,
    };
  }

  // Determine most common structure hash
  const hashCounts = new Map<string, number>();
  for (const hash of structureHashes) {
    hashCounts.set(hash, (hashCounts.get(hash) ?? 0) + 1);
  }

  let dominantHash = 'empty';
  let maxCount = 0;
  for (const [hash, count] of hashCounts) {
    if (count > maxCount) {
      dominantHash = hash;
      maxCount = count;
    }
  }

  // Analyze first successful response for details
  const firstResponse = responses.find((r) => r.response)?.response;
  const content = firstResponse ? extractResponseContent(firstResponse) : undefined;

  const contentType = classifyContentType(content);
  const fields = extractTopLevelFields(content);
  const arrayItemStructure = extractArrayItemStructure(content);
  const size = classifySize(firstResponse);
  const isEmpty = checkIsEmpty(content);

  // Calculate confidence based on consistency
  const confidence = structureHashes.length > 0 ? maxCount / structureHashes.length : 0;

  return {
    structureHash: dominantHash,
    contentType,
    fields,
    arrayItemStructure,
    size,
    isEmpty,
    sampleCount: responses.length,
    confidence,
  };
}

/**
 * Classify the content type of a response.
 */
function classifyContentType(content: unknown): ResponseContentType {
  if (content === undefined || content === null) {
    return 'empty';
  }

  if (typeof content === 'string') {
    if (content.trim().length === 0) return 'empty';
    return 'text';
  }

  if (Array.isArray(content)) {
    return 'array';
  }

  if (typeof content === 'object') {
    return 'object';
  }

  if (typeof content === 'number' || typeof content === 'boolean') {
    return 'primitive';
  }

  return 'mixed';
}

/**
 * Extract top-level field names from an object response.
 */
function extractTopLevelFields(content: unknown): string[] | undefined {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return Object.keys(content as Record<string, unknown>).sort();
  }
  return undefined;
}

/**
 * Extract array item structure hash if content is an array.
 */
function extractArrayItemStructure(content: unknown): string | undefined {
  if (Array.isArray(content) && content.length > 0) {
    return computeStructureHash(content[0]);
  }
  return undefined;
}

/**
 * Classify response size.
 */
function classifySize(response: MCPToolCallResult | null | undefined): ResponseSize {
  if (!response?.content) return 'tiny';

  let totalLength = 0;
  for (const item of response.content) {
    if (item.type === 'text' && 'text' in item && typeof item.text === 'string') {
      totalLength += item.text.length;
    }
  }

  if (totalLength < 100) return 'tiny';
  if (totalLength < 1000) return 'small';
  if (totalLength < 10000) return 'medium';
  return 'large';
}

/**
 * Check if content is effectively empty.
 */
function checkIsEmpty(content: unknown): boolean {
  if (content === undefined || content === null) return true;

  if (typeof content === 'string') {
    return content.trim().length === 0;
  }

  if (Array.isArray(content)) {
    return content.length === 0;
  }

  if (typeof content === 'object') {
    return Object.keys(content as Record<string, unknown>).length === 0;
  }

  return false;
}

// =============================================================================
// Schema Inference
// =============================================================================

/**
 * Infer a JSON schema from a sample value.
 */
export function inferSchemaFromValue(value: unknown): InferredSchema {
  if (value === null) {
    return { type: 'null', nullable: true };
  }

  if (value === undefined) {
    return { type: 'undefined', nullable: true };
  }

  const valueType = typeof value;

  if (valueType === 'string') {
    return { type: 'string' };
  }

  if (valueType === 'number') {
    return { type: Number.isInteger(value) ? 'integer' : 'number' };
  }

  if (valueType === 'boolean') {
    return { type: 'boolean' };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: 'array' };
    }

    // Infer item schema from samples
    const itemSchemas = value.slice(0, 5).map(inferSchemaFromValue);
    const mergedItemSchema = mergeSchemas(itemSchemas);

    return {
      type: 'array',
      items: mergedItemSchema,
    };
  }

  if (valueType === 'object') {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, InferredSchema> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries(obj)) {
      properties[key] = inferSchemaFromValue(val);
      if (val !== null && val !== undefined) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required.sort() : undefined,
    };
  }

  return { type: 'unknown' };
}

/**
 * Merge multiple inferred schemas into one.
 */
function mergeSchemas(schemas: InferredSchema[]): InferredSchema {
  if (schemas.length === 0) {
    return { type: 'unknown' };
  }

  if (schemas.length === 1) {
    return schemas[0];
  }

  // Check if all schemas have the same type
  const types = new Set(schemas.map((s) => s.type));

  if (types.size === 1) {
    const type = schemas[0].type;

    if (type === 'object') {
      // Merge object properties
      const allProperties = new Map<string, InferredSchema[]>();
      const allRequiredSets: Set<string>[] = [];

      for (const schema of schemas) {
        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (!allProperties.has(key)) {
              allProperties.set(key, []);
            }
            allProperties.get(key)!.push(propSchema);
          }
        }
        if (schema.required) {
          allRequiredSets.push(new Set(schema.required));
        }
      }

      const mergedProperties: Record<string, InferredSchema> = {};
      for (const [key, propSchemas] of allProperties) {
        mergedProperties[key] = mergeSchemas(propSchemas);
      }

      // Required fields must be required in ALL schemas
      let required: string[] | undefined;
      if (allRequiredSets.length > 0) {
        const intersection = allRequiredSets.reduce((acc, set) => {
          return new Set([...acc].filter((x) => set.has(x)));
        });
        if (intersection.size > 0) {
          required = [...intersection].sort();
        }
      }

      return {
        type: 'object',
        properties: mergedProperties,
        required,
      };
    }

    if (type === 'array' && schemas.every((s) => s.items)) {
      // Merge array item schemas
      const itemSchemas = schemas.map((s) => s.items!);
      return {
        type: 'array',
        items: mergeSchemas(itemSchemas),
      };
    }

    return { type };
  }

  // Mixed types - return union-like
  if (types.has('null') || types.has('undefined')) {
    const nonNullSchemas = schemas.filter(
      (s) => s.type !== 'null' && s.type !== 'undefined'
    );
    if (nonNullSchemas.length > 0) {
      const merged = mergeSchemas(nonNullSchemas);
      merged.nullable = true;
      return merged;
    }
  }

  return { type: 'mixed' };
}

// =============================================================================
// Error Pattern Analysis
// =============================================================================

/**
 * Analyze error responses to extract patterns.
 */
function analyzeErrorPatterns(
  responses: Array<{ response: MCPToolCallResult | null; error: string | null }>
): ErrorPattern[] {
  const patterns = new Map<string, ErrorPattern>();

  for (const { response, error } of responses) {
    const errorMessage = error ?? extractErrorMessage(response);
    if (!errorMessage) continue;

    const category = categorizeError(errorMessage);
    const patternHash = hashErrorPattern(errorMessage);
    const key = `${category}:${patternHash}`;

    if (patterns.has(key)) {
      patterns.get(key)!.count++;
    } else {
      patterns.set(key, {
        category,
        patternHash,
        example: errorMessage.slice(0, 200),
        count: 1,
      });
    }
  }

  return [...patterns.values()];
}

/**
 * Extract error message from a response.
 */
function extractErrorMessage(response: MCPToolCallResult | null): string | null {
  if (!response?.isError) return null;

  const textContent = response.content?.find((c) => c.type === 'text');
  if (textContent && 'text' in textContent && typeof textContent.text === 'string') {
    return textContent.text;
  }

  return null;
}

/**
 * Categorize an error message.
 */
function categorizeError(
  message: string
): 'validation' | 'not_found' | 'permission' | 'timeout' | 'internal' | 'unknown' {
  const lower = message.toLowerCase();

  if (
    lower.includes('invalid') ||
    lower.includes('required') ||
    lower.includes('missing') ||
    lower.includes('must be') ||
    lower.includes('expected')
  ) {
    return 'validation';
  }

  if (
    lower.includes('not found') ||
    lower.includes('does not exist') ||
    lower.includes('no such') ||
    lower.includes('404')
  ) {
    return 'not_found';
  }

  if (
    lower.includes('permission') ||
    lower.includes('denied') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('access')
  ) {
    return 'permission';
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'timeout';
  }

  if (
    lower.includes('internal') ||
    lower.includes('server error') ||
    lower.includes('unexpected')
  ) {
    return 'internal';
  }

  return 'unknown';
}

/**
 * Create a normalized hash of an error pattern.
 * Strips specific values (IDs, paths, numbers) to capture the pattern.
 */
function hashErrorPattern(message: string): string {
  // Normalize the error message
  const normalized = message
    // Remove UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    // Remove file paths
    .replace(/\/[\w./\-_]+/g, '<PATH>')
    // Remove numbers
    .replace(/\b\d+\b/g, '<N>')
    // Remove quoted strings
    .replace(/"[^"]*"/g, '"<STR>"')
    .replace(/'[^']*'/g, "'<STR>'")
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

// =============================================================================
// Comparison Functions
// =============================================================================

/**
 * Compare two response fingerprints and return differences.
 */
export interface FingerprintDiff {
  /** Whether the fingerprints are identical */
  identical: boolean;

  /** List of changes detected */
  changes: FingerprintChange[];

  /** Overall significance of changes */
  significance: 'none' | 'low' | 'medium' | 'high';
}

export interface FingerprintChange {
  aspect: 'structure' | 'content_type' | 'fields' | 'array_items' | 'size' | 'emptiness';
  description: string;
  before: string;
  after: string;
  breaking: boolean;
}

/**
 * Compare two response fingerprints.
 */
export function compareFingerprints(
  previous: ResponseFingerprint | undefined,
  current: ResponseFingerprint | undefined
): FingerprintDiff {
  // Handle missing fingerprints
  if (!previous && !current) {
    return { identical: true, changes: [], significance: 'none' };
  }

  if (!previous) {
    return {
      identical: false,
      changes: [
        {
          aspect: 'structure',
          description: 'Response fingerprint added (new baseline data)',
          before: 'none',
          after: current!.structureHash,
          breaking: false,
        },
      ],
      significance: 'low',
    };
  }

  if (!current) {
    return {
      identical: false,
      changes: [
        {
          aspect: 'structure',
          description: 'Response fingerprint removed',
          before: previous.structureHash,
          after: 'none',
          breaking: false,
        },
      ],
      significance: 'low',
    };
  }

  const changes: FingerprintChange[] = [];

  // Compare structure hash
  if (previous.structureHash !== current.structureHash) {
    changes.push({
      aspect: 'structure',
      description: 'Response structure changed',
      before: previous.structureHash,
      after: current.structureHash,
      breaking: true,
    });
  }

  // Compare content type
  if (previous.contentType !== current.contentType) {
    changes.push({
      aspect: 'content_type',
      description: `Response type changed from ${previous.contentType} to ${current.contentType}`,
      before: previous.contentType,
      after: current.contentType,
      breaking: true,
    });
  }

  // Compare fields
  const prevFields = previous.fields?.join(',') ?? '';
  const currFields = current.fields?.join(',') ?? '';
  if (prevFields !== currFields) {
    const addedFields = current.fields?.filter((f) => !previous.fields?.includes(f)) ?? [];
    const removedFields = previous.fields?.filter((f) => !current.fields?.includes(f)) ?? [];

    if (removedFields.length > 0) {
      changes.push({
        aspect: 'fields',
        description: `Fields removed: ${removedFields.join(', ')}`,
        before: prevFields,
        after: currFields,
        breaking: true,
      });
    }

    if (addedFields.length > 0) {
      changes.push({
        aspect: 'fields',
        description: `Fields added: ${addedFields.join(', ')}`,
        before: prevFields,
        after: currFields,
        breaking: false,
      });
    }
  }

  // Compare array item structure
  if (previous.arrayItemStructure !== current.arrayItemStructure) {
    changes.push({
      aspect: 'array_items',
      description: 'Array item structure changed',
      before: previous.arrayItemStructure ?? 'none',
      after: current.arrayItemStructure ?? 'none',
      breaking: true,
    });
  }

  // Compare emptiness (significant behavioral change)
  if (previous.isEmpty !== current.isEmpty) {
    changes.push({
      aspect: 'emptiness',
      description: previous.isEmpty
        ? 'Response now returns data (was empty)'
        : 'Response now empty (was returning data)',
      before: String(previous.isEmpty),
      after: String(current.isEmpty),
      breaking: !current.isEmpty, // Becoming empty is breaking
    });
  }

  // Determine overall significance
  let significance: 'none' | 'low' | 'medium' | 'high' = 'none';
  if (changes.length > 0) {
    const hasBreaking = changes.some((c) => c.breaking);
    const structureChanged = changes.some((c) => c.aspect === 'structure');

    if (hasBreaking && structureChanged) {
      significance = 'high';
    } else if (hasBreaking) {
      significance = 'medium';
    } else {
      significance = 'low';
    }
  }

  return {
    identical: changes.length === 0,
    changes,
    significance,
  };
}

/**
 * Compare error patterns between baselines.
 */
export interface ErrorPatternDiff {
  /** New error patterns that didn't exist before */
  added: ErrorPattern[];

  /** Error patterns that no longer occur */
  removed: ErrorPattern[];

  /** Whether error behavior changed significantly */
  behaviorChanged: boolean;
}

export function compareErrorPatterns(
  previous: ErrorPattern[] | undefined,
  current: ErrorPattern[] | undefined
): ErrorPatternDiff {
  const prevPatterns = new Set((previous ?? []).map((p) => p.patternHash));
  const currPatterns = new Set((current ?? []).map((p) => p.patternHash));

  const added = (current ?? []).filter((p) => !prevPatterns.has(p.patternHash));
  const removed = (previous ?? []).filter((p) => !currPatterns.has(p.patternHash));

  return {
    added,
    removed,
    behaviorChanged: added.length > 0 || removed.length > 0,
  };
}

/**
 * Compute a hash for the inferred schema for comparison.
 */
export function computeInferredSchemaHash(schema: InferredSchema | undefined): string {
  if (!schema) return 'empty';

  // Create normalized representation
  const normalized = normalizeInferredSchema(schema);
  const serialized = JSON.stringify(normalized);

  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

function normalizeInferredSchema(schema: InferredSchema): Record<string, unknown> {
  const result: Record<string, unknown> = { type: schema.type };

  if (schema.nullable) {
    result.nullable = true;
  }

  if (schema.properties) {
    const sortedProps: Record<string, unknown> = {};
    for (const key of Object.keys(schema.properties).sort()) {
      sortedProps[key] = normalizeInferredSchema(schema.properties[key]);
    }
    result.properties = sortedProps;
  }

  if (schema.items) {
    result.items = normalizeInferredSchema(schema.items);
  }

  if (schema.required && schema.required.length > 0) {
    result.required = [...schema.required].sort();
  }

  return result;
}
