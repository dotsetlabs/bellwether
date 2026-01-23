/**
 * Golden Output Testing - Capture and compare expected tool outputs.
 *
 * Golden outputs provide a reference for expected tool behavior,
 * enabling detection of semantic changes that schema validation
 * might miss (e.g., different category names, changed formats).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import type { MCPToolCallResult } from '../transport/types.js';
import { PATHS } from '../constants.js';

/**
 * Comparison modes for golden output validation.
 */
export type GoldenComparisonMode = 'exact' | 'structural' | 'semantic';

/**
 * Content type of the golden output.
 */
export type GoldenContentType = 'json' | 'markdown' | 'text';

/**
 * Severity of golden output drift.
 */
export type GoldenDriftSeverity = 'none' | 'info' | 'warning' | 'breaking';

/**
 * A captured golden output for a tool.
 */
export interface GoldenOutput {
  /** Tool name this golden output is for */
  toolName: string;
  /** When the golden output was captured */
  capturedAt: string; // ISO date string
  /** Input arguments used to generate this output */
  inputArgs: Record<string, unknown>;
  /** The captured output */
  output: {
    /** Raw output string */
    raw: string;
    /** Detected content type */
    contentType: GoldenContentType;
    /** Hash of the raw content for quick comparison */
    contentHash: string;
    /** Inferred JSON structure (if JSON content) */
    structure?: Record<string, unknown>;
    /** Extracted key-value pairs for semantic comparison */
    keyValues?: Record<string, unknown>;
  };
  /** Tolerance configuration for comparisons */
  tolerance: {
    /** Comparison mode to use */
    mode: GoldenComparisonMode;
    /** JSONPath patterns for values that are allowed to change */
    allowedDrift: string[];
    /** Whether to normalize timestamps before comparison */
    normalizeTimestamps?: boolean;
    /** Whether to normalize UUIDs before comparison */
    normalizeUuids?: boolean;
  };
  /** Optional description of what this golden output represents */
  description?: string;
  /** Schema version for future compatibility */
  version: number;
}

/**
 * Result of comparing current output against golden.
 */
export interface GoldenComparisonResult {
  /** Tool name */
  toolName: string;
  /** Whether the comparison passed */
  passed: boolean;
  /** Drift severity (if any) */
  severity: GoldenDriftSeverity;
  /** Comparison mode used */
  mode: GoldenComparisonMode;
  /** When the golden was captured */
  goldenCapturedAt: string;
  /** Detected differences */
  differences: GoldenDifference[];
  /** Summary of the comparison */
  summary: string;
}

/**
 * A single difference between golden and current output.
 */
export interface GoldenDifference {
  /** Type of difference */
  type: 'added' | 'removed' | 'changed' | 'type_changed' | 'value_changed';
  /** JSONPath or location of the difference */
  path: string;
  /** Expected value (from golden) */
  expected?: unknown;
  /** Actual value (from current) */
  actual?: unknown;
  /** Whether this difference is allowed by tolerance config */
  allowed: boolean;
  /** Description of the change */
  description: string;
}

/**
 * Options for saving a golden output.
 */
export interface GoldenSaveOptions {
  /** Comparison mode to use for this golden */
  mode?: GoldenComparisonMode;
  /** JSONPath patterns for allowed drift */
  allowedDrift?: string[];
  /** Whether to normalize timestamps */
  normalizeTimestamps?: boolean;
  /** Whether to normalize UUIDs */
  normalizeUuids?: boolean;
  /** Description of the golden output */
  description?: string;
}

/**
 * Golden output storage/file structure.
 */
export interface GoldenOutputStore {
  /** Schema version */
  version: number;
  /** All stored golden outputs */
  outputs: GoldenOutput[];
  /** When the store was last updated */
  lastUpdated: string;
}

// Constants
const GOLDEN_STORE_VERSION = 1;
const DEFAULT_GOLDEN_DIR = '.bellwether/golden';
const DEFAULT_GOLDEN_FILE = 'bellwether-golden.json';

// Common timestamp patterns to normalize
const TIMESTAMP_PATTERNS = [
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?/g, // ISO 8601
  /\d{10,13}/g, // Unix timestamps (seconds or milliseconds)
];

// Common UUID patterns
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Get the path to the golden output store file.
 */
export function getGoldenStorePath(outputDir?: string): string {
  const dir = outputDir || PATHS.DEFAULT_CACHE_DIR || DEFAULT_GOLDEN_DIR;
  return join(dir, DEFAULT_GOLDEN_FILE);
}

/**
 * Load the golden output store from disk.
 */
export function loadGoldenStore(storePath: string): GoldenOutputStore {
  if (!existsSync(storePath)) {
    return {
      version: GOLDEN_STORE_VERSION,
      outputs: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  try {
    const content = readFileSync(storePath, 'utf-8');
    const store = JSON.parse(content) as GoldenOutputStore;

    // Validate version compatibility
    if (store.version > GOLDEN_STORE_VERSION) {
      throw new Error(
        `Golden store version ${store.version} is newer than supported version ${GOLDEN_STORE_VERSION}`
      );
    }

    return store;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid golden store file: ${storePath}`);
    }
    throw error;
  }
}

/**
 * Save the golden output store to disk.
 */
export function saveGoldenStore(store: GoldenOutputStore, storePath: string): void {
  const dir = dirname(storePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  store.lastUpdated = new Date().toISOString();
  writeFileSync(storePath, JSON.stringify(store, null, 2));
}

/**
 * Create a golden output from a tool response.
 */
export function createGoldenOutput(
  toolName: string,
  inputArgs: Record<string, unknown>,
  response: MCPToolCallResult,
  options: GoldenSaveOptions = {}
): GoldenOutput {
  // Extract text content from response
  const textContent = response.content.find(c => c.type === 'text');
  const raw = textContent && 'text' in textContent ? String(textContent.text) : '';

  // Detect content type
  const contentType = detectContentType(raw);

  // Compute content hash
  const contentHash = computeContentHash(raw);

  // Extract structure if JSON
  let structure: Record<string, unknown> | undefined;
  let keyValues: Record<string, unknown> | undefined;

  if (contentType === 'json') {
    try {
      const parsed = JSON.parse(raw);
      structure = inferJsonStructure(parsed);
      keyValues = extractKeyValues(parsed);
    } catch {
      // Not valid JSON despite looking like it
    }
  }

  return {
    toolName,
    capturedAt: new Date().toISOString(),
    inputArgs,
    output: {
      raw,
      contentType,
      contentHash,
      structure,
      keyValues,
    },
    tolerance: {
      mode: options.mode || 'structural',
      allowedDrift: options.allowedDrift || [],
      normalizeTimestamps: options.normalizeTimestamps ?? true,
      normalizeUuids: options.normalizeUuids ?? true,
    },
    description: options.description,
    version: GOLDEN_STORE_VERSION,
  };
}

/**
 * Save a golden output to the store.
 */
export function saveGoldenOutput(
  golden: GoldenOutput,
  storePath: string
): void {
  const store = loadGoldenStore(storePath);

  // Check if we already have a golden for this tool/args combo
  const existingIndex = store.outputs.findIndex(
    g => g.toolName === golden.toolName &&
      JSON.stringify(g.inputArgs) === JSON.stringify(golden.inputArgs)
  );

  if (existingIndex >= 0) {
    store.outputs[existingIndex] = golden;
  } else {
    store.outputs.push(golden);
  }

  saveGoldenStore(store, storePath);
}

/**
 * Get a golden output for a specific tool.
 */
export function getGoldenOutput(
  toolName: string,
  storePath: string,
  inputArgs?: Record<string, unknown>
): GoldenOutput | undefined {
  const store = loadGoldenStore(storePath);

  if (inputArgs) {
    return store.outputs.find(
      g => g.toolName === toolName &&
        JSON.stringify(g.inputArgs) === JSON.stringify(inputArgs)
    );
  }

  // Return first golden for this tool if no args specified
  return store.outputs.find(g => g.toolName === toolName);
}

/**
 * List all golden outputs in the store.
 */
export function listGoldenOutputs(storePath: string): GoldenOutput[] {
  const store = loadGoldenStore(storePath);
  return store.outputs;
}

/**
 * Delete a golden output from the store.
 */
export function deleteGoldenOutput(
  toolName: string,
  storePath: string,
  inputArgs?: Record<string, unknown>
): boolean {
  const store = loadGoldenStore(storePath);
  const initialCount = store.outputs.length;

  if (inputArgs) {
    store.outputs = store.outputs.filter(
      g => !(g.toolName === toolName &&
        JSON.stringify(g.inputArgs) === JSON.stringify(inputArgs))
    );
  } else {
    store.outputs = store.outputs.filter(g => g.toolName !== toolName);
  }

  if (store.outputs.length < initialCount) {
    saveGoldenStore(store, storePath);
    return true;
  }

  return false;
}

/**
 * Compare current output against a golden output.
 */
export function compareWithGolden(
  golden: GoldenOutput,
  currentResponse: MCPToolCallResult
): GoldenComparisonResult {
  // Extract current output
  const textContent = currentResponse.content.find(c => c.type === 'text');
  const currentRaw = textContent && 'text' in textContent ? String(textContent.text) : '';

  const differences: GoldenDifference[] = [];
  const mode = golden.tolerance.mode;

  // Normalize if configured
  // IMPORTANT: UUID normalization must come BEFORE timestamp normalization
  // because timestamp patterns can match numeric portions of UUIDs
  let goldenNormalized = golden.output.raw;
  let currentNormalized = currentRaw;

  if (golden.tolerance.normalizeUuids) {
    goldenNormalized = normalizeUuids(goldenNormalized);
    currentNormalized = normalizeUuids(currentNormalized);
  }

  if (golden.tolerance.normalizeTimestamps) {
    goldenNormalized = normalizeTimestamps(goldenNormalized);
    currentNormalized = normalizeTimestamps(currentNormalized);
  }

  switch (mode) {
    case 'exact':
      if (goldenNormalized !== currentNormalized) {
        differences.push({
          type: 'changed',
          path: '$',
          expected: truncateForDisplay(goldenNormalized),
          actual: truncateForDisplay(currentNormalized),
          allowed: false,
          description: 'Output content differs',
        });
      }
      break;

    case 'structural':
      if (golden.output.contentType === 'json') {
        const structuralDiffs = compareJsonStructure(
          golden.output.raw,
          currentRaw,
          golden.tolerance.allowedDrift
        );
        differences.push(...structuralDiffs);
      } else {
        // For non-JSON, fall back to line-by-line comparison
        const lineDiffs = compareLines(goldenNormalized, currentNormalized);
        differences.push(...lineDiffs);
      }
      break;

    case 'semantic':
      if (golden.output.contentType === 'json' && golden.output.keyValues) {
        const semanticDiffs = compareSemanticValues(
          golden.output.keyValues,
          extractKeyValuesFromRaw(currentRaw),
          golden.tolerance.allowedDrift
        );
        differences.push(...semanticDiffs);
      } else {
        // Fall back to structural comparison
        const lineDiffs = compareLines(goldenNormalized, currentNormalized);
        differences.push(...lineDiffs);
      }
      break;
  }

  // Filter allowed differences
  const disallowedDiffs = differences.filter(d => !d.allowed);
  const severity = determineSeverity(disallowedDiffs, mode);
  const passed = disallowedDiffs.length === 0;

  return {
    toolName: golden.toolName,
    passed,
    severity,
    mode,
    goldenCapturedAt: golden.capturedAt,
    differences,
    summary: generateComparisonSummary(disallowedDiffs, mode),
  };
}

/**
 * Compare all golden outputs against current tool responses.
 */
export function compareAllGoldens(
  storePath: string,
  getToolResponse: (toolName: string, args: Record<string, unknown>) => Promise<MCPToolCallResult>
): Promise<GoldenComparisonResult[]> {
  const store = loadGoldenStore(storePath);

  return Promise.all(
    store.outputs.map(async golden => {
      try {
        const response = await getToolResponse(golden.toolName, golden.inputArgs);
        return compareWithGolden(golden, response);
      } catch (error) {
        return {
          toolName: golden.toolName,
          passed: false,
          severity: 'breaking' as GoldenDriftSeverity,
          mode: golden.tolerance.mode,
          goldenCapturedAt: golden.capturedAt,
          differences: [{
            type: 'changed' as const,
            path: '$',
            expected: 'successful response',
            actual: `error: ${error instanceof Error ? error.message : String(error)}`,
            allowed: false,
            description: 'Tool call failed',
          }],
          summary: `Tool call failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    })
  );
}

// Helper functions

/**
 * Detect content type from raw output.
 */
function detectContentType(raw: string): GoldenContentType {
  const trimmed = raw.trim();

  // Check for JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  // Check for Markdown patterns
  if (/^#|^\*{1,3}[^*]|\[.*\]\(.*\)|^```/.test(trimmed)) {
    return 'markdown';
  }

  return 'text';
}

/**
 * Compute a hash of content for quick comparison.
 */
function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Infer JSON structure (types only, not values).
 */
function inferJsonStructure(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 10) return { type: 'any' }; // Prevent infinite recursion

  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: { type: 'any' } };
    return { type: 'array', items: inferJsonStructure(value[0], depth + 1) };
  }
  if (typeof value === 'object') {
    const properties: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      properties[key] = inferJsonStructure(val, depth + 1);
    }
    return { type: 'object', properties };
  }
  return { type: typeof value };
}

/**
 * Extract key-value pairs for semantic comparison.
 * Flattens nested objects and captures important values.
 */
function extractKeyValues(
  value: unknown,
  prefix = '',
  result: Record<string, unknown> = {}
): Record<string, unknown> {
  if (value === null || value === undefined) {
    if (prefix) result[prefix] = value;
    return result;
  }

  if (Array.isArray(value)) {
    result[prefix ? `${prefix}.length` : 'length'] = value.length;
    // Capture first few items for semantic comparison
    value.slice(0, 3).forEach((item, i) => {
      extractKeyValues(item, prefix ? `${prefix}[${i}]` : `[${i}]`, result);
    });
    return result;
  }

  if (typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      extractKeyValues(val, newPrefix, result);
    }
    return result;
  }

  if (prefix) {
    result[prefix] = value;
  }

  return result;
}

/**
 * Extract key values from raw content.
 */
function extractKeyValuesFromRaw(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return extractKeyValues(parsed);
  } catch {
    return { raw };
  }
}

/**
 * Normalize timestamps in content.
 */
function normalizeTimestamps(content: string): string {
  let normalized = content;
  for (const pattern of TIMESTAMP_PATTERNS) {
    normalized = normalized.replace(pattern, '<TIMESTAMP>');
  }
  return normalized;
}

/**
 * Normalize UUIDs in content.
 */
function normalizeUuids(content: string): string {
  return content.replace(UUID_PATTERN, '<UUID>');
}

/**
 * Compare JSON structure between golden and current.
 */
function compareJsonStructure(
  goldenRaw: string,
  currentRaw: string,
  allowedPaths: string[]
): GoldenDifference[] {
  const differences: GoldenDifference[] = [];

  try {
    const golden = JSON.parse(goldenRaw);
    const current = JSON.parse(currentRaw);

    compareObjects(golden, current, '$', allowedPaths, differences);
  } catch {
    differences.push({
      type: 'changed',
      path: '$',
      expected: 'valid JSON',
      actual: 'invalid JSON',
      allowed: false,
      description: 'Current output is not valid JSON',
    });
  }

  return differences;
}

/**
 * Recursively compare objects for structural differences.
 */
function compareObjects(
  golden: unknown,
  current: unknown,
  path: string,
  allowedPaths: string[],
  differences: GoldenDifference[]
): void {
  const allowed = isPathAllowed(path, allowedPaths);

  // Type comparison
  const goldenType = getType(golden);
  const currentType = getType(current);

  if (goldenType !== currentType) {
    differences.push({
      type: 'type_changed',
      path,
      expected: goldenType,
      actual: currentType,
      allowed,
      description: `Type changed from ${goldenType} to ${currentType}`,
    });
    return;
  }

  // Object comparison
  if (goldenType === 'object' && golden !== null && current !== null) {
    const goldenObj = golden as Record<string, unknown>;
    const currentObj = current as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(goldenObj), ...Object.keys(currentObj)]);

    for (const key of allKeys) {
      const childPath = `${path}.${key}`;
      const keyAllowed = isPathAllowed(childPath, allowedPaths);

      if (!(key in goldenObj)) {
        differences.push({
          type: 'added',
          path: childPath,
          actual: truncateForDisplay(currentObj[key]),
          allowed: keyAllowed,
          description: `Field "${key}" was added`,
        });
      } else if (!(key in currentObj)) {
        differences.push({
          type: 'removed',
          path: childPath,
          expected: truncateForDisplay(goldenObj[key]),
          allowed: keyAllowed,
          description: `Field "${key}" was removed`,
        });
      } else {
        compareObjects(goldenObj[key], currentObj[key], childPath, allowedPaths, differences);
      }
    }
    return;
  }

  // Array comparison
  if (goldenType === 'array') {
    const goldenArr = golden as unknown[];
    const currentArr = current as unknown[];

    if (goldenArr.length !== currentArr.length) {
      differences.push({
        type: 'value_changed',
        path: `${path}.length`,
        expected: goldenArr.length,
        actual: currentArr.length,
        allowed,
        description: `Array length changed from ${goldenArr.length} to ${currentArr.length}`,
      });
    }

    // Compare elements up to the shorter length
    const minLength = Math.min(goldenArr.length, currentArr.length);
    for (let i = 0; i < minLength; i++) {
      compareObjects(goldenArr[i], currentArr[i], `${path}[${i}]`, allowedPaths, differences);
    }
    return;
  }

  // Primitive comparison (structural mode doesn't compare values)
  // Only flag if types match but values differ for semantic checks
}

/**
 * Compare semantic key values.
 */
function compareSemanticValues(
  goldenValues: Record<string, unknown>,
  currentValues: Record<string, unknown>,
  allowedPaths: string[]
): GoldenDifference[] {
  const differences: GoldenDifference[] = [];
  const allKeys = new Set([...Object.keys(goldenValues), ...Object.keys(currentValues)]);

  for (const key of allKeys) {
    const allowed = isPathAllowed(key, allowedPaths);

    if (!(key in goldenValues)) {
      differences.push({
        type: 'added',
        path: key,
        actual: truncateForDisplay(currentValues[key]),
        allowed,
        description: `Value "${key}" was added`,
      });
    } else if (!(key in currentValues)) {
      differences.push({
        type: 'removed',
        path: key,
        expected: truncateForDisplay(goldenValues[key]),
        allowed,
        description: `Value "${key}" was removed`,
      });
    } else if (String(goldenValues[key]) !== String(currentValues[key])) {
      differences.push({
        type: 'value_changed',
        path: key,
        expected: truncateForDisplay(goldenValues[key]),
        actual: truncateForDisplay(currentValues[key]),
        allowed,
        description: `Value "${key}" changed`,
      });
    }
  }

  return differences;
}

/**
 * Compare content line by line.
 */
function compareLines(golden: string, current: string): GoldenDifference[] {
  const differences: GoldenDifference[] = [];
  const goldenLines = golden.split('\n');
  const currentLines = current.split('\n');

  const maxLines = Math.max(goldenLines.length, currentLines.length);

  for (let i = 0; i < maxLines; i++) {
    if (i >= goldenLines.length) {
      differences.push({
        type: 'added',
        path: `line ${i + 1}`,
        actual: truncateForDisplay(currentLines[i]),
        allowed: false,
        description: `Line ${i + 1} was added`,
      });
    } else if (i >= currentLines.length) {
      differences.push({
        type: 'removed',
        path: `line ${i + 1}`,
        expected: truncateForDisplay(goldenLines[i]),
        allowed: false,
        description: `Line ${i + 1} was removed`,
      });
    } else if (goldenLines[i] !== currentLines[i]) {
      differences.push({
        type: 'changed',
        path: `line ${i + 1}`,
        expected: truncateForDisplay(goldenLines[i]),
        actual: truncateForDisplay(currentLines[i]),
        allowed: false,
        description: `Line ${i + 1} changed`,
      });
    }
  }

  return differences;
}

/**
 * Check if a path matches any allowed drift pattern.
 * Handles both JSONPath-style patterns ($.field) and plain paths (field).
 */
function isPathAllowed(path: string, allowedPaths: string[]): boolean {
  // Normalize path by stripping leading $. if present
  const normalizedPath = path.replace(/^\$\.?/, '');

  return allowedPaths.some(pattern => {
    // Normalize pattern by stripping leading $. if present
    const normalizedPattern = pattern.replace(/^\$\.?/, '');

    // Simple glob matching: * matches any segment
    const regex = new RegExp(
      '^' + normalizedPattern.replace(/\*/g, '[^.]+').replace(/\./g, '\\.') + '$'
    );
    return regex.test(normalizedPath);
  });
}

/**
 * Get type of a value as a string.
 */
function getType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Truncate a value for display purposes.
 */
function truncateForDisplay(value: unknown, maxLength = 50): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Determine severity based on differences.
 */
function determineSeverity(
  differences: GoldenDifference[],
  mode: GoldenComparisonMode
): GoldenDriftSeverity {
  if (differences.length === 0) return 'none';

  const hasRemoved = differences.some(d => d.type === 'removed');
  const hasTypeChanged = differences.some(d => d.type === 'type_changed');

  // Removals and type changes are breaking in structural/semantic modes
  if ((hasRemoved || hasTypeChanged) && mode !== 'exact') {
    return 'breaking';
  }

  // Exact mode: any difference is breaking
  if (mode === 'exact') {
    return 'breaking';
  }

  // Additions are warnings
  const hasAdded = differences.some(d => d.type === 'added');
  if (hasAdded) {
    return 'warning';
  }

  // Value changes are info in semantic mode
  return 'info';
}

/**
 * Generate a comparison summary.
 */
function generateComparisonSummary(
  differences: GoldenDifference[],
  mode: GoldenComparisonMode
): string {
  if (differences.length === 0) {
    return `Output matches golden (${mode} mode)`;
  }

  const counts = {
    added: differences.filter(d => d.type === 'added').length,
    removed: differences.filter(d => d.type === 'removed').length,
    changed: differences.filter(d => d.type === 'changed' || d.type === 'value_changed').length,
    typeChanged: differences.filter(d => d.type === 'type_changed').length,
  };

  const parts: string[] = [];
  if (counts.added > 0) parts.push(`${counts.added} added`);
  if (counts.removed > 0) parts.push(`${counts.removed} removed`);
  if (counts.changed > 0) parts.push(`${counts.changed} changed`);
  if (counts.typeChanged > 0) parts.push(`${counts.typeChanged} type changes`);

  return `${differences.length} difference(s): ${parts.join(', ')}`;
}
