/**
 * Tests for smart truncation utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  smartTruncate,
  simpleTruncate,
  smartTruncateJson,
  smartTruncateMarkdown,
  detectContentType,
  getExampleLength,
} from '../../src/utils/smart-truncate.js';
import { EXAMPLE_OUTPUT } from '../../src/constants.js';

describe('smart-truncate', () => {
  describe('detectContentType', () => {
    it('should detect JSON objects', () => {
      expect(detectContentType('{"key": "value"}')).toBe('json');
      expect(detectContentType('  {"nested": {"key": 123}}  ')).toBe('json');
    });

    it('should detect JSON arrays', () => {
      expect(detectContentType('[1, 2, 3]')).toBe('json');
      expect(detectContentType('  [{"name": "test"}]  ')).toBe('json');
    });

    it('should detect invalid JSON as text or markdown', () => {
      expect(detectContentType('{not valid json}')).toBe('text');
      expect(detectContentType('[unclosed array')).toBe('text');
    });

    it('should detect markdown with headers', () => {
      expect(detectContentType('# Heading')).toBe('markdown');
      expect(detectContentType('Some text\n## Subheading')).toBe('markdown');
    });

    it('should detect markdown with lists', () => {
      expect(detectContentType('- item 1\n- item 2')).toBe('markdown');
      expect(detectContentType('* bullet point')).toBe('markdown');
      expect(detectContentType('1. numbered item')).toBe('markdown');
    });

    it('should detect markdown with code blocks', () => {
      expect(detectContentType('```javascript\ncode\n```')).toBe('markdown');
    });

    it('should detect markdown with emphasis', () => {
      expect(detectContentType('This is **bold** text')).toBe('markdown');
      expect(detectContentType('This is __underline__ text')).toBe('markdown');
    });

    it('should default to text for plain content', () => {
      expect(detectContentType('Plain text content')).toBe('text');
      expect(detectContentType('Just some words')).toBe('text');
    });
  });

  describe('simpleTruncate', () => {
    it('should not truncate content under max length', () => {
      const result = simpleTruncate('short text', 100);
      expect(result.wasTruncated).toBe(false);
      expect(result.content).toBe('short text');
      expect(result.charactersRemoved).toBe(0);
    });

    it('should truncate content over max length', () => {
      const content = 'a'.repeat(200);
      const result = simpleTruncate(content, 100);
      expect(result.wasTruncated).toBe(true);
      expect(result.content.length).toBeLessThanOrEqual(100);
      expect(result.originalLength).toBe(200);
    });

    it('should try to truncate at word boundary', () => {
      const content = 'Hello world this is a test of truncation at word boundaries';
      const result = simpleTruncate(content, 30);
      expect(result.wasTruncated).toBe(true);
      // When truncated, it should have an indicator
      expect(result.content.length).toBeLessThanOrEqual(30);
    });

    it('should use custom indicator', () => {
      const content = 'a'.repeat(200);
      const result = simpleTruncate(content, 100, ' [TRUNCATED]');
      expect(result.content.endsWith(' [TRUNCATED]')).toBe(true);
    });
  });

  describe('smartTruncateJson', () => {
    it('should not truncate small JSON', () => {
      const json = JSON.stringify({ key: 'value' });
      const result = smartTruncateJson(json, 1000);
      expect(result.wasTruncated).toBe(false);
      expect(result.content).toBe(json);
    });

    it('should truncate large JSON arrays', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` }));
      const json = JSON.stringify(data);
      const result = smartTruncateJson(json, 500, 3);
      expect(result.wasTruncated).toBe(true);
      expect(result.content.length).toBeLessThanOrEqual(json.length);
      // Should produce valid JSON
      expect(() => JSON.parse(result.content)).not.toThrow();
    });

    it('should truncate large JSON objects', () => {
      const data: Record<string, unknown> = {};
      for (let i = 0; i < 50; i++) {
        data[`key${i}`] = { nested: { value: `value ${i}` } };
      }
      const json = JSON.stringify(data);
      const result = smartTruncateJson(json, 500, 3);
      expect(result.wasTruncated).toBe(true);
      // Should produce valid JSON
      expect(() => JSON.parse(result.content)).not.toThrow();
    });

    it('should handle invalid JSON gracefully', () => {
      const invalid = '{not valid json}';
      const result = smartTruncateJson(invalid, 10);
      expect(result.wasTruncated).toBe(true);
      // Should fall back to simple truncation
    });

    it('should truncate long string values', () => {
      const data = { key: 'a'.repeat(500) };
      const json = JSON.stringify(data);
      const result = smartTruncateJson(json, 200, 3);
      expect(result.wasTruncated).toBe(true);
      // Should produce valid JSON
      const parsed = JSON.parse(result.content);
      expect(parsed.key.endsWith('...')).toBe(true);
    });
  });

  describe('smartTruncateMarkdown', () => {
    it('should not truncate small markdown', () => {
      const md = '# Title\n\nSome content';
      const result = smartTruncateMarkdown(md, 1000);
      expect(result.wasTruncated).toBe(false);
      expect(result.content).toBe(md);
    });

    it('should truncate at line boundaries', () => {
      const md = '# Title\n\nParagraph one.\n\nParagraph two.\n\nParagraph three.';
      const result = smartTruncateMarkdown(md, 30);
      expect(result.wasTruncated).toBe(true);
      expect(result.content).toContain('# Title');
    });

    it('should preserve headers when possible', () => {
      const md = '# Title\n\n' + 'Content '.repeat(50) + '\n\n## Subheading';
      const result = smartTruncateMarkdown(md, 100);
      expect(result.wasTruncated).toBe(true);
      expect(result.content).toContain('# Title');
    });

    it('should add truncation indicator', () => {
      const md = 'Line one\n'.repeat(50);
      const result = smartTruncateMarkdown(md, 50);
      expect(result.wasTruncated).toBe(true);
      expect(result.content).toContain('...');
    });
  });

  describe('smartTruncate', () => {
    it('should auto-detect JSON and truncate appropriately', () => {
      const data = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      const json = JSON.stringify(data);
      const result = smartTruncate(json, { maxLength: 200 });
      expect(result.wasTruncated).toBe(true);
      // Should produce valid JSON since it was detected as JSON
      expect(() => JSON.parse(result.content)).not.toThrow();
    });

    it('should auto-detect markdown and truncate appropriately', () => {
      const md = '# Title\n\n' + 'Paragraph content. '.repeat(100);
      const result = smartTruncate(md, { maxLength: 100 });
      expect(result.wasTruncated).toBe(true);
      expect(result.content).toContain('# Title');
    });

    it('should respect contentType override', () => {
      const content = '{"key": "value"}';
      const result = smartTruncate(content, {
        maxLength: 10,
        contentType: 'text',
      });
      expect(result.wasTruncated).toBe(true);
      // Should NOT produce valid JSON since we forced text mode
    });

    it('should respect preserveJsonStructure option', () => {
      const data = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      const json = JSON.stringify(data);
      const result = smartTruncate(json, {
        maxLength: 200,
        contentType: 'json',
        preserveJsonStructure: false,
      });
      expect(result.wasTruncated).toBe(true);
      // With preserveJsonStructure=false, it should use simple truncation
    });

    it('should not truncate when under max length', () => {
      const content = 'Short content';
      const result = smartTruncate(content, { maxLength: 1000 });
      expect(result.wasTruncated).toBe(false);
      expect(result.content).toBe(content);
      expect(result.charactersRemoved).toBe(0);
    });
  });

  describe('getExampleLength', () => {
    it('should return full length when fullExamples is true', () => {
      expect(getExampleLength(true)).toBe(EXAMPLE_OUTPUT.FULL_LENGTH);
    });

    it('should return default length when fullExamples is false', () => {
      expect(getExampleLength(false)).toBe(EXAMPLE_OUTPUT.DEFAULT_LENGTH);
    });

    it('should return custom length when provided', () => {
      expect(getExampleLength(true, 1500)).toBe(1500);
      expect(getExampleLength(false, 500)).toBe(500);
    });
  });
});
