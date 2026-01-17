import { describe, it, expect } from 'vitest';
import {
  parseYamlSecure,
  parseYamlStrict,
  YAML_SECURITY_LIMITS,
} from '../../src/utils/yaml-parser.js';

describe('YAML Parser Security', () => {
  describe('parseYamlSecure', () => {
    it('should parse valid YAML', () => {
      const yaml = `
name: test
version: 1
items:
  - one
  - two
`;
      const result = parseYamlSecure<{ name: string; version: number; items: string[] }>(yaml);
      expect(result.name).toBe('test');
      expect(result.version).toBe(1);
      expect(result.items).toEqual(['one', 'two']);
    });

    it('should parse empty YAML as null', () => {
      const result = parseYamlSecure('');
      expect(result).toBeNull();
    });

    it('should parse nested structures', () => {
      const yaml = `
config:
  database:
    host: localhost
    port: 5432
  cache:
    enabled: true
`;
      const result = parseYamlSecure<{
        config: { database: { host: string; port: number }; cache: { enabled: boolean } };
      }>(yaml);
      expect(result.config.database.host).toBe('localhost');
      expect(result.config.cache.enabled).toBe(true);
    });

    describe('alias protection', () => {
      it('should allow reasonable number of aliases', () => {
        const yaml = `
anchor: &anchor
  key: value

item1: *anchor
item2: *anchor
item3: *anchor
`;
        const result = parseYamlSecure(yaml);
        expect(result).toBeDefined();
      });

      it('should reject excessive aliases (alias bomb protection)', () => {
        // Create a YAML with more aliases than allowed
        const lines = ['base: &base {x: 1}'];
        for (let i = 0; i < 150; i++) {
          lines.push(`item${i}: *base`);
        }
        const yaml = lines.join('\n');

        expect(() => parseYamlSecure(yaml)).toThrow();
      });

      it('should respect custom maxAliasCount', () => {
        const yaml = `
base: &base {x: 1}
item1: *base
item2: *base
item3: *base
`;
        // Should work with default
        expect(() => parseYamlSecure(yaml)).not.toThrow();

        // Should fail with low limit
        expect(() => parseYamlSecure(yaml, { maxAliasCount: 1 })).toThrow();
      });
    });

    describe('depth protection', () => {
      it('should allow reasonable nesting depth', () => {
        const yaml = `
level1:
  level2:
    level3:
      level4:
        level5:
          value: deep
`;
        const result = parseYamlSecure(yaml);
        expect(result).toBeDefined();
      });

      it('should reject excessive nesting depth', () => {
        // Create deeply nested structure
        let yaml = 'root:';
        for (let i = 0; i < 60; i++) {
          yaml += '\n' + '  '.repeat(i + 1) + `level${i}:`;
        }
        yaml += '\n' + '  '.repeat(61) + 'value: deep';

        expect(() => parseYamlSecure(yaml)).toThrow(/nesting depth/i);
      });

      it('should respect custom maxDepth', () => {
        const yaml = `
level1:
  level2:
    level3:
      value: ok
`;
        // Should work with default
        expect(() => parseYamlSecure(yaml)).not.toThrow();

        // Should fail with low limit
        expect(() => parseYamlSecure(yaml, { maxDepth: 2 })).toThrow(/nesting depth/i);
      });
    });

    describe('input size protection', () => {
      it('should accept normal-sized input', () => {
        // Use unique keys to create valid YAML
        const yaml = Array.from({ length: 100 }, (_, i) => `key${i}: value`).join('\n');
        expect(() => parseYamlSecure(yaml)).not.toThrow();
      });

      it('should reject oversized input', () => {
        const yaml = 'x'.repeat(YAML_SECURITY_LIMITS.MAX_INPUT_SIZE + 1);
        expect(() => parseYamlSecure(yaml)).toThrow(/input size/i);
      });

      it('should respect custom maxInputSize', () => {
        const yaml = 'key: ' + 'x'.repeat(200);

        // Should work with default
        expect(() => parseYamlSecure(yaml)).not.toThrow();

        // Should fail with low limit
        expect(() => parseYamlSecure(yaml, { maxInputSize: 100 })).toThrow(/input size/i);
      });
    });
  });

  describe('parseYamlStrict', () => {
    it('should parse valid YAML with stricter limits', () => {
      const yaml = `
name: strict-test
value: 123
`;
      const result = parseYamlStrict<{ name: string; value: number }>(yaml);
      expect(result.name).toBe('strict-test');
      expect(result.value).toBe(123);
    });

    it('should reject excessive aliases at lower threshold', () => {
      const yaml = `
base: &base {x: 1}
item1: *base
item2: *base
item3: *base
item4: *base
item5: *base
item6: *base
item7: *base
item8: *base
item9: *base
item10: *base
item11: *base
`;
      // Strict mode has maxAliasCount of 10
      expect(() => parseYamlStrict(yaml)).toThrow();
    });

    it('should reject deep nesting at lower threshold', () => {
      // Create structure deeper than 20 levels (strict limit)
      let yaml = 'root:';
      for (let i = 0; i < 25; i++) {
        yaml += '\n' + '  '.repeat(i + 1) + `level${i}:`;
      }
      yaml += '\n' + '  '.repeat(26) + 'value: deep';

      expect(() => parseYamlStrict(yaml)).toThrow(/nesting depth/i);
    });
  });

  describe('edge cases', () => {
    it('should handle arrays correctly', () => {
      const yaml = `
items:
  - first
  - second
  - third
`;
      const result = parseYamlSecure<{ items: string[] }>(yaml);
      expect(result.items).toHaveLength(3);
    });

    it('should handle mixed nested arrays and objects', () => {
      const yaml = `
users:
  - name: Alice
    roles:
      - admin
      - user
  - name: Bob
    roles:
      - user
`;
      const result = parseYamlSecure<{ users: Array<{ name: string; roles: string[] }> }>(yaml);
      expect(result.users).toHaveLength(2);
      expect(result.users[0].roles).toContain('admin');
    });

    it('should handle special YAML types', () => {
      const yaml = `
nullValue: ~
boolTrue: true
boolFalse: false
date: 2024-01-15
`;
      const result = parseYamlSecure<{
        nullValue: null;
        boolTrue: boolean;
        boolFalse: boolean;
        date: Date;
      }>(yaml);
      expect(result.nullValue).toBeNull();
      expect(result.boolTrue).toBe(true);
      expect(result.boolFalse).toBe(false);
    });
  });
});
