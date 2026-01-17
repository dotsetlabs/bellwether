/**
 * JSONPath parsing utilities.
 *
 * Supports a subset of JSONPath syntax for accessing nested values:
 * - Dot notation: "foo.bar.baz"
 * - Bracket notation: "foo['bar']" or "foo[\"bar\"]"
 * - Array indices: "items[0]" or "items['0']"
 * - Mixed: "foo.items[0].bar"
 * - Escaped characters: "foo['bar.baz']" for keys containing dots
 * - Special characters: "foo['key with spaces']" or "foo['key\"with\"quotes']"
 */

/**
 * Token types for JSONPath parsing.
 */
type TokenType = 'property' | 'index' | 'bracket_property';

/**
 * A parsed path segment.
 */
interface PathSegment {
  type: TokenType;
  value: string | number;
}

/**
 * Result of parsing a JSONPath expression.
 */
export interface ParseResult {
  segments: PathSegment[];
  error?: string;
}

/**
 * Parse a JSONPath expression into segments.
 *
 * @param path - The JSONPath expression to parse
 * @returns ParseResult with segments or error
 */
export function parsePath(path: string): ParseResult {
  if (!path || path.length === 0) {
    return { segments: [], error: 'Empty path' };
  }

  const segments: PathSegment[] = [];
  let i = 0;

  // Handle optional root ($)
  if (path[0] === '$') {
    i++;
    // Skip optional leading dot after $
    if (path[i] === '.') {
      i++;
    }
  }

  while (i < path.length) {
    // Skip leading dot (for dot notation)
    if (path[i] === '.') {
      i++;
      if (i >= path.length) {
        return { segments, error: 'Unexpected end after dot' };
      }
    }

    // Handle bracket notation
    if (path[i] === '[') {
      const result = parseBracket(path, i);
      if (result.error) {
        return { segments, error: result.error };
      }
      segments.push(result.segment!);
      i = result.endIndex;
    }
    // Handle property name (dot notation)
    else {
      const result = parseProperty(path, i);
      if (result.error) {
        return { segments, error: result.error };
      }
      segments.push(result.segment!);
      i = result.endIndex;
    }
  }

  return { segments };
}

/**
 * Parse a bracket expression starting at the given index.
 */
function parseBracket(
  path: string,
  start: number
): { segment?: PathSegment; endIndex: number; error?: string } {
  // Skip the opening bracket
  let i = start + 1;

  // Skip whitespace
  while (i < path.length && isWhitespace(path[i])) {
    i++;
  }

  if (i >= path.length) {
    return { endIndex: i, error: 'Unexpected end in bracket expression' };
  }

  // Check for string literal (single or double quotes)
  if (path[i] === "'" || path[i] === '"') {
    const quote = path[i];
    i++;
    let value = '';

    while (i < path.length && path[i] !== quote) {
      // Handle escape sequences
      if (path[i] === '\\' && i + 1 < path.length) {
        const next = path[i + 1];
        if (next === quote || next === '\\') {
          value += next;
          i += 2;
          continue;
        }
        // Handle common escape sequences
        if (next === 'n') {
          value += '\n';
          i += 2;
          continue;
        }
        if (next === 't') {
          value += '\t';
          i += 2;
          continue;
        }
        if (next === 'r') {
          value += '\r';
          i += 2;
          continue;
        }
      }
      value += path[i];
      i++;
    }

    if (i >= path.length) {
      return { endIndex: i, error: `Unterminated string in bracket expression` };
    }

    // Skip the closing quote
    i++;

    // Skip whitespace before closing bracket
    while (i < path.length && isWhitespace(path[i])) {
      i++;
    }

    if (i >= path.length || path[i] !== ']') {
      return { endIndex: i, error: 'Expected closing bracket' };
    }

    // Skip the closing bracket
    i++;

    return {
      segment: { type: 'bracket_property', value },
      endIndex: i,
    };
  }

  // Check for numeric index
  let numStr = '';
  while (i < path.length && isDigit(path[i])) {
    numStr += path[i];
    i++;
  }

  if (numStr.length > 0) {
    // Skip whitespace before closing bracket
    while (i < path.length && isWhitespace(path[i])) {
      i++;
    }

    if (i >= path.length || path[i] !== ']') {
      return { endIndex: i, error: 'Expected closing bracket after index' };
    }

    // Skip the closing bracket
    i++;

    return {
      segment: { type: 'index', value: parseInt(numStr, 10) },
      endIndex: i,
    };
  }

  // Invalid bracket content
  return { endIndex: i, error: 'Invalid bracket expression: expected string or number' };
}

/**
 * Parse a property name in dot notation starting at the given index.
 */
function parseProperty(
  path: string,
  start: number
): { segment?: PathSegment; endIndex: number; error?: string } {
  let i = start;
  let name = '';

  // Property names can contain alphanumeric, underscore, hyphen, and dollar sign
  // They cannot start with a digit
  while (i < path.length && isPropertyChar(path[i])) {
    name += path[i];
    i++;
  }

  if (name.length === 0) {
    return {
      endIndex: i,
      error: `Invalid character at position ${start}: ${path[start]}`,
    };
  }

  return {
    segment: { type: 'property', value: name },
    endIndex: i,
  };
}

/**
 * Check if a character is a valid property name character.
 */
function isPropertyChar(char: string): boolean {
  const code = char.charCodeAt(0);
  // alphanumeric, underscore, dollar sign, hyphen
  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 || // _
    code === 36 || // $
    code === 45 // -
  );
}

/**
 * Check if a character is a digit.
 */
function isDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

/**
 * Check if a character is whitespace.
 */
function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

/**
 * Get a value from an object using a parsed path.
 *
 * @param obj - The object to access
 * @param segments - The parsed path segments
 * @returns The value at the path, or undefined if not found
 */
export function getValueBySegments(obj: unknown, segments: PathSegment[]): unknown {
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    if (segment.type === 'index') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment.value as number];
    } else {
      // Both 'property' and 'bracket_property' access object keys
      current = (current as Record<string, unknown>)[segment.value as string];
    }
  }

  return current;
}

/**
 * Get a value from an object using a JSONPath expression.
 *
 * This is the main API function combining parsing and value retrieval.
 *
 * @param obj - The object to access
 * @param path - The JSONPath expression
 * @returns The value at the path, or undefined if not found or path is invalid
 *
 * @example
 * // Simple paths
 * getValueAtPath({ a: { b: 1 } }, 'a.b') // => 1
 *
 * @example
 * // Array access
 * getValueAtPath({ items: [1, 2, 3] }, 'items[1]') // => 2
 *
 * @example
 * // Keys with dots
 * getValueAtPath({ 'key.with.dots': 42 }, "['key.with.dots']") // => 42
 *
 * @example
 * // Keys with spaces
 * getValueAtPath({ 'my key': 'value' }, "['my key']") // => 'value'
 */
export function getValueAtPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== 'object' || obj === null) {
    return undefined;
  }

  const parseResult = parsePath(path);
  if (parseResult.error) {
    return undefined;
  }

  return getValueBySegments(obj, parseResult.segments);
}

/**
 * Check if a path is valid JSONPath syntax.
 *
 * @param path - The path to validate
 * @returns True if the path is valid, false otherwise
 */
export function isValidPath(path: string): boolean {
  const result = parsePath(path);
  return !result.error;
}

/**
 * Convert a JSONPath expression to a normalized form.
 * Useful for comparing paths that may use different notations.
 *
 * @param path - The path to normalize
 * @returns Normalized path string, or the original if parsing fails
 */
export function normalizePath(path: string): string {
  const result = parsePath(path);
  if (result.error) {
    return path;
  }

  return result.segments
    .map((seg) => {
      if (seg.type === 'index') {
        return `[${seg.value}]`;
      }
      // Use bracket notation for properties with special characters
      const value = seg.value as string;
      if (needsBracketNotation(value)) {
        return `['${escapeString(value)}']`;
      }
      return `.${value}`;
    })
    .join('')
    .replace(/^\./, ''); // Remove leading dot
}

/**
 * Check if a property name needs bracket notation.
 */
function needsBracketNotation(name: string): boolean {
  if (name.length === 0) return true;

  // Check first character (can't be a digit)
  const first = name.charCodeAt(0);
  if (first >= 48 && first <= 57) return true;

  // Check all characters
  for (let i = 0; i < name.length; i++) {
    if (!isPropertyChar(name[i])) {
      return true;
    }
  }

  return false;
}

/**
 * Escape a string for use in bracket notation.
 */
function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
