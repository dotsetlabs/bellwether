import type { MCPToolCallResult, MCPTool } from '../transport/types.js';
import type { InterviewQuestion } from './types.js';
import { STATEFUL_TESTING } from '../constants.js';
import { extractTextContent } from './schema-inferrer.js';
import { getValueAtPath } from '../utils/jsonpath.js';

interface StoredValue {
  value: unknown;
  sourceTool: string;
}

/**
 * Maintains shared state between tool calls for stateful testing.
 */
export class StatefulTestRunner {
  private values = new Map<string, StoredValue>();
  private jsonPathValues = new Map<string, StoredValue>();
  private recentResponses: Array<{ value: unknown; sourceTool: string }> = [];

  constructor(private options: { shareOutputs: boolean }) {}

  applyStateToQuestion(
    _toolName: string,
    question: InterviewQuestion
  ): {
    args: Record<string, unknown>;
    usedKeys: string[];
  } {
    if (!this.options.shareOutputs) {
      return { args: { ...question.args }, usedKeys: [] };
    }

    const args: Record<string, unknown> = { ...question.args };
    const usedKeys: string[] = [];

    for (const [param] of Object.entries(args)) {
      if (!shouldPreferStateValue(param)) {
        continue;
      }

      const stateValue = this.findMatchingValue(param);
      if (stateValue) {
        args[param] = stateValue.value;
        usedKeys.push(param);
      }
    }

    return { args, usedKeys };
  }

  recordResponse(tool: MCPTool, response: MCPToolCallResult | null): string[] {
    if (!response || response.isError) {
      return [];
    }

    const textContent = extractTextContent(response);
    if (!textContent) {
      return [];
    }

    const parsed = tryParseJson(textContent);
    if (!parsed) {
      return [];
    }

    const providedKeys: string[] = [];
    const flattened = flattenValue(parsed);

    for (const [key, value] of Object.entries(flattened)) {
      if (this.values.size >= STATEFUL_TESTING.MAX_STORED_VALUES) {
        break;
      }
      this.values.set(key, { value, sourceTool: tool.name });
      providedKeys.push(key);
    }

    // Record JSONPath values for richer mapping
    const pathValues = collectJsonPaths(parsed);
    for (const [path, value] of Object.entries(pathValues)) {
      if (this.jsonPathValues.size >= STATEFUL_TESTING.MAX_STORED_VALUES) {
        break;
      }
      this.jsonPathValues.set(path, { value, sourceTool: tool.name });
    }

    // Keep a bounded list of recent responses for direct JSONPath lookup
    this.recentResponses.unshift({ value: parsed, sourceTool: tool.name });
    if (this.recentResponses.length > STATEFUL_TESTING.MAX_STORED_VALUES) {
      this.recentResponses.pop();
    }

    return providedKeys;
  }

  private findMatchingValue(paramName: string): StoredValue | null {
    if (looksLikeJsonPath(paramName)) {
      const direct = this.findByJsonPath(paramName);
      if (direct) return direct;
    }

    const normalizedParam = normalizeKey(paramName);
    for (const [key, value] of this.values.entries()) {
      if (normalizeKey(key) === normalizedParam) {
        return value;
      }
    }
    for (const [key, value] of this.jsonPathValues.entries()) {
      if (normalizeKey(key) === normalizedParam) {
        return value;
      }
    }
    for (const [key, value] of this.values.entries()) {
      const normalizedKey = normalizeKey(key);
      if (normalizedKey.endsWith(normalizedParam)) {
        return value;
      }
    }
    for (const [key, value] of this.jsonPathValues.entries()) {
      const normalizedKey = normalizeKey(key);
      if (normalizedKey.endsWith(normalizedParam)) {
        return value;
      }
    }
    if (!looksLikeJsonPath(paramName)) {
      const pathMatch = this.findByJsonPath(`$.${paramName}`);
      if (pathMatch) return pathMatch;
    }
    return null;
  }

  private findByJsonPath(path: string): StoredValue | null {
    const normalized = path.startsWith('$') ? path : `$.${path}`;
    const stored = this.jsonPathValues.get(normalized);
    if (stored) {
      return stored;
    }

    for (const entry of this.recentResponses) {
      const value = getValueAtPath(entry.value, normalized);
      if (value !== undefined) {
        return { value, sourceTool: entry.sourceTool };
      }
    }
    return null;
  }
}

function shouldPreferStateValue(paramName: string): boolean {
  return STATEFUL_TESTING.PREFERRED_PARAM_PATTERNS.some((pattern) => pattern.test(paramName));
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function flattenValue(value: unknown, prefix = ''): Record<string, unknown> {
  if (value === null || value === undefined) return {};

  if (Array.isArray(value)) {
    if (value.length === 0) return {};
    return flattenValue(value[0], prefix);
  }

  if (typeof value !== 'object') {
    return prefix ? { [prefix]: value } : {};
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const combinedKey = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'object' && child !== null) {
      Object.assign(result, flattenValue(child, combinedKey));
      continue;
    }
    result[key] = child;
    result[combinedKey] = child;
  }

  return result;
}

function looksLikeJsonPath(value: string): boolean {
  return value.startsWith('$') || value.includes('.') || value.includes('[');
}

function collectJsonPaths(
  value: unknown,
  path: string = '$',
  depth: number = 0,
  result: Record<string, unknown> = {}
): Record<string, unknown> {
  if (depth > 4 || value === null || value === undefined) {
    return result;
  }

  if (Array.isArray(value)) {
    const sample = value.slice(0, 3);
    sample.forEach((item, index) => {
      collectJsonPaths(item, `${path}[${index}]`, depth + 1, result);
    });
    return result;
  }

  if (typeof value !== 'object') {
    result[path] = value;
    return result;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (typeof child === 'object' && child !== null) {
      collectJsonPaths(child, childPath, depth + 1, result);
    } else {
      result[childPath] = child;
    }
  }

  return result;
}
