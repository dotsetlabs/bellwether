/**
 * Enhanced schema comparison for baseline drift detection.
 *
 * Improvements over basic comparison:
 * - Hash argument types, not just keys
 * - Detect constraint changes (min/max, patterns, enums)
 * - Compare across multiple interactions
 * - Visualize schema differences
 * - Circular reference protection
 * - Unicode normalization for consistent property comparison
 */

import { createHash } from 'crypto';
import { PAYLOAD_LIMITS } from '../constants.js';

/**
 * Maximum depth for schema traversal to prevent stack overflow
 * from circular references or extremely deep nesting.
 */
const MAX_SCHEMA_DEPTH = PAYLOAD_LIMITS.MAX_SCHEMA_DEPTH;

/**
 * JSON Schema property type.
 */
interface SchemaProperty {
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | SchemaProperty;
}

/**
 * Input schema for a tool.
 */
interface InputSchema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | SchemaProperty;
}

/**
 * Schema change type.
 */
export type SchemaChangeType =
  | 'property_added'
  | 'property_removed'
  | 'type_changed'
  | 'constraint_changed'
  | 'required_changed'
  | 'enum_changed'
  | 'description_changed'
  | 'format_changed';

/**
 * Individual schema change.
 */
export interface SchemaChange {
  path: string;
  changeType: SchemaChangeType;
  before: unknown;
  after: unknown;
  breaking: boolean;
  description: string;
}

/**
 * Schema comparison result.
 */
export interface SchemaComparisonResult {
  identical: boolean;
  changes: SchemaChange[];
  previousHash: string;
  currentHash: string;
  visualDiff: string;
}

/**
 * Compute a comprehensive schema hash that includes types and constraints.
 * Protected against circular references and excessively deep schemas.
 */
export function computeSchemaHash(schema: InputSchema | undefined): string {
  if (!schema) return 'empty';

  // Create normalized representation for hashing with circular reference protection
  const seen = new WeakSet<object>();
  const normalized = normalizeSchema(schema, 0, seen);
  const serialized = JSON.stringify(normalized);

  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

/**
 * Normalize a Unicode string key for consistent comparison.
 * Uses NFC (Canonical Decomposition, followed by Canonical Composition)
 * to ensure equivalent Unicode sequences compare as equal.
 */
function normalizeUnicodeKey(key: string): string {
  return key.normalize('NFC');
}

/**
 * Check if we've exceeded the maximum schema depth.
 * Returns a truncation marker instead of continuing.
 */
function checkDepthLimit(depth: number): Record<string, unknown> | null {
  if (depth > MAX_SCHEMA_DEPTH) {
    return { _truncated: true, _reason: 'max_depth_exceeded', _depth: depth };
  }
  return null;
}

/**
 * Check for circular reference and mark if detected.
 */
function checkCircularRef(obj: unknown, seen: WeakSet<object>): Record<string, unknown> | null {
  if (typeof obj === 'object' && obj !== null) {
    if (seen.has(obj)) {
      return { _circular: true };
    }
    seen.add(obj);
  }
  return null;
}

/**
 * Normalize schema for consistent hashing.
 * Sorts keys, removes undefined values, and handles edge cases:
 * - Circular reference protection via WeakSet
 * - Depth limiting to prevent stack overflow
 * - Unicode normalization for property keys
 *
 * @param schema - The schema to normalize
 * @param depth - Current recursion depth
 * @param seen - WeakSet tracking visited objects for circular reference detection
 */
function normalizeSchema(
  schema: InputSchema | SchemaProperty,
  depth: number = 0,
  seen: WeakSet<object> = new WeakSet()
): Record<string, unknown> {
  // Check depth limit
  const depthLimit = checkDepthLimit(depth);
  if (depthLimit) return depthLimit;

  // Check circular reference
  const circularRef = checkCircularRef(schema, seen);
  if (circularRef) return circularRef;

  const result: Record<string, unknown> = {};

  // Sort and normalize simple fields
  if (schema.type !== undefined) {
    result.type = Array.isArray(schema.type) ? schema.type.sort() : schema.type;
  }
  if ((schema as SchemaProperty).format !== undefined) {
    result.format = (schema as SchemaProperty).format;
  }
  if ((schema as SchemaProperty).enum !== undefined) {
    result.enum = [...(schema as SchemaProperty).enum!].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    );
  }

  // Constraints - normalize numeric values to handle 1.0 vs 1
  const constraintFields = ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'default'] as const;
  for (const field of constraintFields) {
    const value = (schema as SchemaProperty)[field];
    if (value !== undefined) {
      // Normalize numeric values to avoid 1.0 vs 1 differences
      if (typeof value === 'number') {
        result[field] = Number.isInteger(value) ? Math.floor(value) : value;
      } else {
        result[field] = value;
      }
    }
  }

  // Required array - normalize Unicode in property names
  if (schema.required !== undefined && schema.required.length > 0) {
    result.required = [...schema.required].map(normalizeUnicodeKey).sort();
  }

  // Properties - recursively normalize with Unicode-normalized keys
  if (schema.properties) {
    const props: Record<string, unknown> = {};
    // Normalize Unicode in property keys and sort
    const sortedKeys = Object.keys(schema.properties)
      .map(normalizeUnicodeKey)
      .sort();

    for (const key of sortedKeys) {
      // Find the original key (may differ in Unicode representation)
      const originalKey = Object.keys(schema.properties).find(
        k => normalizeUnicodeKey(k) === key
      );
      if (originalKey) {
        props[key] = normalizeSchema(schema.properties[originalKey], depth + 1, seen);
      }
    }
    result.properties = props;
  }

  // Items for arrays
  if ((schema as SchemaProperty).items) {
    result.items = normalizeSchema((schema as SchemaProperty).items!, depth + 1, seen);
  }

  // Additional properties
  if (schema.additionalProperties !== undefined) {
    if (typeof schema.additionalProperties === 'boolean') {
      result.additionalProperties = schema.additionalProperties;
    } else {
      result.additionalProperties = normalizeSchema(schema.additionalProperties, depth + 1, seen);
    }
  }

  return result;
}

/**
 * Compare two schemas and return detailed differences.
 */
export function compareSchemas(
  previous: InputSchema | undefined,
  current: InputSchema | undefined
): SchemaComparisonResult {
  const previousHash = computeSchemaHash(previous);
  const currentHash = computeSchemaHash(current);

  if (previousHash === currentHash) {
    return {
      identical: true,
      changes: [],
      previousHash,
      currentHash,
      visualDiff: '',
    };
  }

  const changes: SchemaChange[] = [];

  // Compare root required arrays
  const prevRequired = new Set(previous?.required ?? []);
  const currRequired = new Set(current?.required ?? []);

  for (const req of currRequired) {
    if (!prevRequired.has(req)) {
      changes.push({
        path: `required`,
        changeType: 'required_changed',
        before: Array.from(prevRequired),
        after: Array.from(currRequired),
        breaking: true, // New required field is breaking
        description: `Property "${req}" is now required`,
      });
      break; // Only report once for required changes
    }
  }

  for (const req of prevRequired) {
    if (!currRequired.has(req)) {
      changes.push({
        path: `required`,
        changeType: 'required_changed',
        before: Array.from(prevRequired),
        after: Array.from(currRequired),
        breaking: false, // Removing required is non-breaking
        description: `Property "${req}" is no longer required`,
      });
      break;
    }
  }

  // Compare properties
  const prevProps = previous?.properties ?? {};
  const currProps = current?.properties ?? {};

  const allKeys = new Set([...Object.keys(prevProps), ...Object.keys(currProps)]);

  for (const key of allKeys) {
    const prevProp = prevProps[key];
    const currProp = currProps[key];
    const path = key;

    if (prevProp === undefined && currProp !== undefined) {
      // Property added
      const isRequired = currRequired.has(key);
      changes.push({
        path,
        changeType: 'property_added',
        before: undefined,
        after: summarizeProperty(currProp),
        breaking: isRequired, // Only breaking if required
        description: `Property "${key}" added${isRequired ? ' (required)' : ' (optional)'}`,
      });
    } else if (prevProp !== undefined && currProp === undefined) {
      // Property removed
      changes.push({
        path,
        changeType: 'property_removed',
        before: summarizeProperty(prevProp),
        after: undefined,
        breaking: true, // Removing properties is always breaking
        description: `Property "${key}" removed`,
      });
    } else if (prevProp !== undefined && currProp !== undefined) {
      // Compare property details
      compareProperties(prevProp, currProp, path, changes);
    }
  }

  // Generate visual diff
  const visualDiff = generateVisualDiff(previous, current, changes);

  return {
    identical: false,
    changes,
    previousHash,
    currentHash,
    visualDiff,
  };
}

/**
 * Compare two properties recursively.
 */
function compareProperties(
  prev: SchemaProperty,
  curr: SchemaProperty,
  path: string,
  changes: SchemaChange[]
): void {
  // Compare type
  const prevType = normalizeType(prev.type);
  const currType = normalizeType(curr.type);

  if (prevType !== currType) {
    changes.push({
      path,
      changeType: 'type_changed',
      before: prev.type,
      after: curr.type,
      breaking: true,
      description: `Type changed from "${prevType}" to "${currType}"`,
    });
  }

  // Compare format
  if (prev.format !== curr.format) {
    changes.push({
      path,
      changeType: 'format_changed',
      before: prev.format,
      after: curr.format,
      breaking: curr.format !== undefined && prev.format === undefined,
      description: `Format changed from "${prev.format ?? 'none'}" to "${curr.format ?? 'none'}"`,
    });
  }

  // Compare enums
  if (!arraysEqual(prev.enum, curr.enum)) {
    const prevSet = new Set((prev.enum ?? []).map(String));
    const currSet = new Set((curr.enum ?? []).map(String));

    const removed = [...prevSet].filter(v => !currSet.has(v));
    const added = [...currSet].filter(v => !prevSet.has(v));

    changes.push({
      path,
      changeType: 'enum_changed',
      before: prev.enum,
      after: curr.enum,
      breaking: removed.length > 0, // Removing enum values is breaking
      description: `Enum values changed: ${removed.length} removed, ${added.length} added`,
    });
  }

  // Compare constraints
  compareConstraint(prev, curr, path, 'minimum', changes);
  compareConstraint(prev, curr, path, 'maximum', changes);
  compareConstraint(prev, curr, path, 'minLength', changes);
  compareConstraint(prev, curr, path, 'maxLength', changes);
  compareConstraint(prev, curr, path, 'pattern', changes);

  // Compare nested properties
  if (prev.properties || curr.properties) {
    const prevNested = prev.properties ?? {};
    const currNested = curr.properties ?? {};
    const nestedKeys = new Set([...Object.keys(prevNested), ...Object.keys(currNested)]);

    for (const key of nestedKeys) {
      const nestedPath = `${path}.${key}`;
      const prevProp = prevNested[key];
      const currProp = currNested[key];

      if (!prevProp && currProp) {
        changes.push({
          path: nestedPath,
          changeType: 'property_added',
          before: undefined,
          after: summarizeProperty(currProp),
          breaking: false,
          description: `Nested property "${key}" added`,
        });
      } else if (prevProp && !currProp) {
        changes.push({
          path: nestedPath,
          changeType: 'property_removed',
          before: summarizeProperty(prevProp),
          after: undefined,
          breaking: true,
          description: `Nested property "${key}" removed`,
        });
      } else if (prevProp && currProp) {
        compareProperties(prevProp, currProp, nestedPath, changes);
      }
    }
  }

  // Compare array items
  if (prev.items || curr.items) {
    if (prev.items && curr.items) {
      compareProperties(prev.items, curr.items, `${path}[]`, changes);
    } else if (!prev.items && curr.items) {
      changes.push({
        path: `${path}[]`,
        changeType: 'type_changed',
        before: 'untyped array',
        after: summarizeProperty(curr.items),
        breaking: false,
        description: 'Array items type added',
      });
    } else if (prev.items && !curr.items) {
      changes.push({
        path: `${path}[]`,
        changeType: 'type_changed',
        before: summarizeProperty(prev.items),
        after: 'untyped array',
        breaking: false,
        description: 'Array items type removed',
      });
    }
  }
}

/**
 * Compare a single constraint.
 */
function compareConstraint(
  prev: SchemaProperty,
  curr: SchemaProperty,
  path: string,
  field: 'minimum' | 'maximum' | 'minLength' | 'maxLength' | 'pattern',
  changes: SchemaChange[]
): void {
  const prevValue = prev[field];
  const currValue = curr[field];

  if (prevValue !== currValue) {
    // Determine if breaking
    let breaking = false;
    const isMinConstraint = field === 'minimum' || field === 'minLength';
    const isMaxConstraint = field === 'maximum' || field === 'maxLength';

    if (isMinConstraint) {
      // Increasing minimum is breaking (more restrictive)
      breaking = currValue !== undefined && (prevValue === undefined || currValue > prevValue);
    } else if (isMaxConstraint) {
      // Decreasing maximum is breaking (more restrictive)
      breaking = currValue !== undefined && (prevValue === undefined || currValue < prevValue);
    } else if (field === 'pattern') {
      // Changing pattern is potentially breaking
      breaking = currValue !== undefined;
    }

    changes.push({
      path,
      changeType: 'constraint_changed',
      before: prevValue,
      after: currValue,
      breaking,
      description: `Constraint "${field}" changed from ${prevValue ?? 'none'} to ${currValue ?? 'none'}`,
    });
  }
}

/**
 * Normalize type to string for comparison.
 */
function normalizeType(type: string | string[] | undefined): string {
  if (type === undefined) return 'any';
  if (Array.isArray(type)) return type.sort().join('|');
  return type;
}

/**
 * Check if two arrays are equal.
 */
function arraysEqual(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  const sortedA = [...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  const sortedB = [...b].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));

  return sortedA.every((v, i) => JSON.stringify(v) === JSON.stringify(sortedB[i]));
}

/**
 * Summarize a property for display.
 */
function summarizeProperty(prop: SchemaProperty): string {
  const parts: string[] = [];

  if (prop.type) {
    parts.push(Array.isArray(prop.type) ? prop.type.join('|') : prop.type);
  }

  if (prop.format) {
    parts.push(`(${prop.format})`);
  }

  if (prop.enum) {
    parts.push(`enum[${prop.enum.length}]`);
  }

  const constraints: string[] = [];
  if (prop.minimum !== undefined) constraints.push(`min:${prop.minimum}`);
  if (prop.maximum !== undefined) constraints.push(`max:${prop.maximum}`);
  if (prop.minLength !== undefined) constraints.push(`minLen:${prop.minLength}`);
  if (prop.maxLength !== undefined) constraints.push(`maxLen:${prop.maxLength}`);
  if (prop.pattern) constraints.push(`pattern`);

  if (constraints.length > 0) {
    parts.push(`{${constraints.join(',')}}`);
  }

  return parts.join(' ') || 'unknown';
}

/**
 * Generate a visual diff of two schemas.
 */
function generateVisualDiff(
  _previous: InputSchema | undefined,
  _current: InputSchema | undefined,
  changes: SchemaChange[]
): string {
  if (changes.length === 0) return '';

  const lines: string[] = ['Schema Diff:'];
  lines.push('');

  // Group changes by path
  const byPath = new Map<string, SchemaChange[]>();
  for (const change of changes) {
    const existing = byPath.get(change.path) ?? [];
    existing.push(change);
    byPath.set(change.path, existing);
  }

  // Format each path's changes
  for (const [path, pathChanges] of byPath) {
    const marker = pathChanges.some(c => c.breaking) ? '!' : '~';
    lines.push(`${marker} ${path}:`);

    for (const change of pathChanges) {
      const prefix = change.breaking ? '  [BREAKING]' : '  [info]';
      lines.push(`${prefix} ${change.description}`);

      if (change.before !== undefined) {
        lines.push(`    - ${formatValue(change.before)}`);
      }
      if (change.after !== undefined) {
        lines.push(`    + ${formatValue(change.after)}`);
      }
    }
  }

  // Summary
  const breakingCount = changes.filter(c => c.breaking).length;
  const nonBreakingCount = changes.length - breakingCount;
  lines.push('');
  lines.push(`Summary: ${breakingCount} breaking, ${nonBreakingCount} non-breaking change(s)`);

  return lines.join('\n');
}

/**
 * Format a value for display.
 */
function formatValue(value: unknown): string {
  if (value === undefined) return '<none>';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Compute schema hash from multiple interactions (not just first).
 * Returns the most common schema hash if schemas vary.
 */
export function computeConsensusSchemaHash(
  interactions: Array<{ args: Record<string, unknown> }>
): { hash: string; consistency: number; variations: number } {
  if (interactions.length === 0) {
    return { hash: 'empty', consistency: 1, variations: 0 };
  }

  // Compute hash for each interaction
  const hashCounts = new Map<string, number>();

  for (const interaction of interactions) {
    const argsSchema = inferSchemaFromArgs(interaction.args);
    const hash = computeSchemaHash(argsSchema as InputSchema);

    hashCounts.set(hash, (hashCounts.get(hash) ?? 0) + 1);
  }

  // Find most common hash
  let mostCommonHash = 'empty';
  let maxCount = 0;
  for (const [hash, count] of hashCounts) {
    if (count > maxCount) {
      mostCommonHash = hash;
      maxCount = count;
    }
  }

  return {
    hash: mostCommonHash,
    consistency: maxCount / interactions.length,
    variations: hashCounts.size,
  };
}

/**
 * Infer schema from actual argument values.
 */
function inferSchemaFromArgs(args: Record<string, unknown>): InputSchema {
  const properties: Record<string, SchemaProperty> = {};

  for (const [key, value] of Object.entries(args)) {
    properties[key] = inferPropertyType(value);
  }

  return {
    type: 'object',
    properties,
    required: Object.keys(properties).sort(),
  };
}

/**
 * Infer property type from a value.
 */
function inferPropertyType(value: unknown): SchemaProperty {
  if (value === null) return { type: 'null' };
  if (value === undefined) return { type: 'null' };

  const type = typeof value;

  switch (type) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'object': {
      if (Array.isArray(value)) {
        if (value.length === 0) return { type: 'array' };
        // Infer items type from first element
        return { type: 'array', items: inferPropertyType(value[0]) };
      }
      // Nested object
      const properties: Record<string, SchemaProperty> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        properties[k] = inferPropertyType(v);
      }
      return { type: 'object', properties };
    }
    default:
      return { type: 'string' }; // Fallback
  }
}
