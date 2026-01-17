import { describe, it, expect } from 'vitest';
import {
  parsePath,
  getValueAtPath,
  getValueBySegments,
  isValidPath,
  normalizePath,
} from '../../src/utils/jsonpath.js';

describe('parsePath', () => {
  describe('simple dot notation', () => {
    it('should parse single property', () => {
      const result = parsePath('foo');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([{ type: 'property', value: 'foo' }]);
    });

    it('should parse nested properties', () => {
      const result = parsePath('foo.bar.baz');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'foo' },
        { type: 'property', value: 'bar' },
        { type: 'property', value: 'baz' },
      ]);
    });

    it('should handle property names with underscores', () => {
      const result = parsePath('foo_bar.baz_qux');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'foo_bar' },
        { type: 'property', value: 'baz_qux' },
      ]);
    });

    it('should handle property names with hyphens', () => {
      const result = parsePath('foo-bar.baz-qux');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'foo-bar' },
        { type: 'property', value: 'baz-qux' },
      ]);
    });

    it('should handle property names with dollar signs', () => {
      // Note: leading $ is treated as root, so use bracket notation for $-prefixed keys
      const result = parsePath('foo.$bar');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'foo' },
        { type: 'property', value: '$bar' },
      ]);
    });

    it('should handle $-prefixed keys using bracket notation', () => {
      const result = parsePath("['$foo']['$bar']");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'bracket_property', value: '$foo' },
        { type: 'bracket_property', value: '$bar' },
      ]);
    });

    it('should handle numeric suffixes in property names', () => {
      const result = parsePath('item1.value2');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'item1' },
        { type: 'property', value: 'value2' },
      ]);
    });
  });

  describe('array index notation', () => {
    it('should parse array index', () => {
      const result = parsePath('items[0]');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'items' },
        { type: 'index', value: 0 },
      ]);
    });

    it('should parse multiple array indices', () => {
      const result = parsePath('matrix[0][1]');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'matrix' },
        { type: 'index', value: 0 },
        { type: 'index', value: 1 },
      ]);
    });

    it('should parse array access followed by property', () => {
      const result = parsePath('items[0].name');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'items' },
        { type: 'index', value: 0 },
        { type: 'property', value: 'name' },
      ]);
    });

    it('should handle array indices with whitespace', () => {
      const result = parsePath('items[ 0 ]');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'items' },
        { type: 'index', value: 0 },
      ]);
    });
  });

  describe('bracket notation for properties', () => {
    it('should parse bracket property with single quotes', () => {
      const result = parsePath("['foo']");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([{ type: 'bracket_property', value: 'foo' }]);
    });

    it('should parse bracket property with double quotes', () => {
      const result = parsePath('["foo"]');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([{ type: 'bracket_property', value: 'foo' }]);
    });

    it('should handle property names with dots', () => {
      const result = parsePath("['field.with.dots']");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'bracket_property', value: 'field.with.dots' },
      ]);
    });

    it('should handle property names with spaces', () => {
      const result = parsePath("['key with spaces']");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'bracket_property', value: 'key with spaces' },
      ]);
    });

    it('should handle escaped single quotes', () => {
      const result = parsePath("['key\\'s value']");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'bracket_property', value: "key's value" },
      ]);
    });

    it('should handle escaped double quotes', () => {
      const result = parsePath('["key\\"with\\"quotes"]');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'bracket_property', value: 'key"with"quotes' },
      ]);
    });

    it('should handle escaped backslashes', () => {
      const result = parsePath("['path\\\\to\\\\file']");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'bracket_property', value: 'path\\to\\file' },
      ]);
    });

    it('should handle common escape sequences', () => {
      const result = parsePath("['line1\\nline2\\ttab']");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'bracket_property', value: 'line1\nline2\ttab' },
      ]);
    });

    it('should handle whitespace around property name', () => {
      const result = parsePath("[ 'foo' ]");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([{ type: 'bracket_property', value: 'foo' }]);
    });
  });

  describe('mixed notation', () => {
    it('should parse mixed dot and bracket notation', () => {
      const result = parsePath("foo['bar'].baz");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'foo' },
        { type: 'bracket_property', value: 'bar' },
        { type: 'property', value: 'baz' },
      ]);
    });

    it('should parse complex nested path', () => {
      const result = parsePath("data['items'][0].config['key.with.dots']");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'data' },
        { type: 'bracket_property', value: 'items' },
        { type: 'index', value: 0 },
        { type: 'property', value: 'config' },
        { type: 'bracket_property', value: 'key.with.dots' },
      ]);
    });
  });

  describe('optional root ($)', () => {
    it('should handle root prefix', () => {
      const result = parsePath('$.foo.bar');
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'property', value: 'foo' },
        { type: 'property', value: 'bar' },
      ]);
    });

    it('should handle root with bracket notation', () => {
      const result = parsePath("$['foo']['bar']");
      expect(result.error).toBeUndefined();
      expect(result.segments).toEqual([
        { type: 'bracket_property', value: 'foo' },
        { type: 'bracket_property', value: 'bar' },
      ]);
    });
  });

  describe('error cases', () => {
    it('should return error for empty path', () => {
      const result = parsePath('');
      expect(result.error).toBe('Empty path');
    });

    it('should return error for trailing dot', () => {
      const result = parsePath('foo.');
      expect(result.error).toBe('Unexpected end after dot');
    });

    it('should return error for unclosed bracket', () => {
      const result = parsePath('foo[0');
      expect(result.error).toBe('Expected closing bracket after index');
    });

    it('should return error for unterminated string', () => {
      const result = parsePath("foo['bar");
      expect(result.error).toBe('Unterminated string in bracket expression');
    });

    it('should return error for invalid bracket content', () => {
      const result = parsePath('foo[abc]');
      expect(result.error).toBe('Invalid bracket expression: expected string or number');
    });
  });
});

describe('getValueAtPath', () => {
  const testObj = {
    simple: 'value',
    nested: {
      deep: {
        value: 42,
      },
    },
    items: [
      { name: 'first', value: 1 },
      { name: 'second', value: 2 },
    ],
    'key.with.dots': 'dotted',
    'key with spaces': 'spaced',
    "key'with'quotes": 'quoted',
    matrix: [
      [1, 2],
      [3, 4],
    ],
  };

  describe('simple paths', () => {
    it('should get simple property', () => {
      expect(getValueAtPath(testObj, 'simple')).toBe('value');
    });

    it('should get nested property', () => {
      expect(getValueAtPath(testObj, 'nested.deep.value')).toBe(42);
    });

    it('should return undefined for missing property', () => {
      expect(getValueAtPath(testObj, 'missing')).toBeUndefined();
    });

    it('should return undefined for deeply missing property', () => {
      expect(getValueAtPath(testObj, 'nested.missing.value')).toBeUndefined();
    });
  });

  describe('array access', () => {
    it('should access array element', () => {
      expect(getValueAtPath(testObj, 'items[0]')).toEqual({ name: 'first', value: 1 });
    });

    it('should access array element property', () => {
      expect(getValueAtPath(testObj, 'items[1].name')).toBe('second');
    });

    it('should access 2D array', () => {
      expect(getValueAtPath(testObj, 'matrix[0][1]')).toBe(2);
      expect(getValueAtPath(testObj, 'matrix[1][0]')).toBe(3);
    });

    it('should return undefined for out-of-bounds index', () => {
      expect(getValueAtPath(testObj, 'items[99]')).toBeUndefined();
    });

    it('should return undefined when accessing index on non-array', () => {
      expect(getValueAtPath(testObj, 'simple[0]')).toBeUndefined();
    });
  });

  describe('special characters in keys', () => {
    it('should access key with dots using bracket notation', () => {
      expect(getValueAtPath(testObj, "['key.with.dots']")).toBe('dotted');
    });

    it('should access key with spaces', () => {
      expect(getValueAtPath(testObj, "['key with spaces']")).toBe('spaced');
    });

    it('should access key with quotes', () => {
      expect(getValueAtPath(testObj, "['key\\'with\\'quotes']")).toBe('quoted');
    });
  });

  describe('edge cases', () => {
    it('should return undefined for null object', () => {
      expect(getValueAtPath(null, 'foo')).toBeUndefined();
    });

    it('should return undefined for undefined object', () => {
      expect(getValueAtPath(undefined, 'foo')).toBeUndefined();
    });

    it('should return undefined for primitive value', () => {
      expect(getValueAtPath('string', 'length')).toBeUndefined();
    });

    it('should return undefined for empty path', () => {
      expect(getValueAtPath(testObj, '')).toBeUndefined();
    });

    it('should handle null values in path', () => {
      const obj = { a: { b: null } };
      expect(getValueAtPath(obj, 'a.b.c')).toBeUndefined();
    });
  });
});

describe('isValidPath', () => {
  it('should return true for valid paths', () => {
    expect(isValidPath('foo')).toBe(true);
    expect(isValidPath('foo.bar')).toBe(true);
    expect(isValidPath('foo[0]')).toBe(true);
    expect(isValidPath("foo['bar']")).toBe(true);
    expect(isValidPath('$.foo.bar')).toBe(true);
  });

  it('should return false for invalid paths', () => {
    expect(isValidPath('')).toBe(false);
    expect(isValidPath('foo.')).toBe(false);
    expect(isValidPath('foo[0')).toBe(false);
    expect(isValidPath("foo['bar")).toBe(false);
  });
});

describe('normalizePath', () => {
  it('should normalize simple paths', () => {
    expect(normalizePath('foo.bar.baz')).toBe('foo.bar.baz');
  });

  it('should normalize bracket to dot notation', () => {
    expect(normalizePath("foo['bar']")).toBe('foo.bar');
  });

  it('should keep bracket notation for special characters', () => {
    expect(normalizePath("['key.with.dots']")).toBe("['key.with.dots']");
    expect(normalizePath("['key with spaces']")).toBe("['key with spaces']");
  });

  it('should normalize mixed paths', () => {
    expect(normalizePath("foo['bar'][0].baz")).toBe('foo.bar[0].baz');
  });

  it('should return original for invalid paths', () => {
    expect(normalizePath('foo[[')).toBe('foo[[');
  });
});

describe('getValueBySegments', () => {
  const testObj = {
    a: {
      b: {
        c: 'value',
      },
    },
    items: ['first', 'second'],
  };

  it('should get value using pre-parsed segments', () => {
    const segments = [
      { type: 'property' as const, value: 'a' },
      { type: 'property' as const, value: 'b' },
      { type: 'property' as const, value: 'c' },
    ];
    expect(getValueBySegments(testObj, segments)).toBe('value');
  });

  it('should handle array index segments', () => {
    const segments = [
      { type: 'property' as const, value: 'items' },
      { type: 'index' as const, value: 1 },
    ];
    expect(getValueBySegments(testObj, segments)).toBe('second');
  });

  it('should return undefined for missing paths', () => {
    const segments = [
      { type: 'property' as const, value: 'missing' },
    ];
    expect(getValueBySegments(testObj, segments)).toBeUndefined();
  });
});
