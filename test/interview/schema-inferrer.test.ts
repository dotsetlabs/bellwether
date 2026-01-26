/**
 * Unit tests for interview/schema-inferrer.ts
 *
 * Tests response schema inference from MCP tool responses.
 * Following TDD principles - testing expected behavior based on rational assumptions.
 */

import { describe, it, expect } from 'vitest';
import { inferResponseSchema, extractTextContent } from '../../src/interview/schema-inferrer.js';
import type { MCPToolCallResult } from '../../src/transport/types.js';

/**
 * Helper to create an MCP tool response with text content.
 */
function createTextResponse(text: string): MCPToolCallResult {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Helper to create an MCP tool response with binary/image content.
 */
function createBinaryResponse(): MCPToolCallResult {
  return {
    content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
  };
}

/**
 * Helper to create an empty MCP tool response.
 */
function createEmptyResponse(): MCPToolCallResult {
  return {
    content: [],
  };
}

describe('schema-inferrer', () => {
  describe('extractTextContent', () => {
    it('should extract text from single text block', () => {
      const response = createTextResponse('Hello, world!');

      const result = extractTextContent(response);

      expect(result).toBe('Hello, world!');
    });

    it('should join multiple text blocks with newlines', () => {
      const response: MCPToolCallResult = {
        content: [
          { type: 'text', text: 'First line' },
          { type: 'text', text: 'Second line' },
          { type: 'text', text: 'Third line' },
        ],
      };

      const result = extractTextContent(response);

      expect(result).toBe('First line\nSecond line\nThird line');
    });

    it('should return null for empty content array', () => {
      const response = createEmptyResponse();

      const result = extractTextContent(response);

      expect(result).toBeNull();
    });

    it('should return null for undefined content', () => {
      // Test edge case where content might be undefined at runtime
      const response = {} as MCPToolCallResult;

      const result = extractTextContent(response);

      expect(result).toBeNull();
    });

    it('should return null when no text blocks present', () => {
      const response = createBinaryResponse();

      const result = extractTextContent(response);

      expect(result).toBeNull();
    });

    it('should ignore non-text content blocks', () => {
      const response: MCPToolCallResult = {
        content: [
          { type: 'image', data: 'imagedata', mimeType: 'image/png' },
          { type: 'text', text: 'Caption' },
        ],
      };

      const result = extractTextContent(response);

      expect(result).toBe('Caption');
    });
  });

  describe('inferResponseSchema', () => {
    describe('JSON responses', () => {
      it('should detect valid JSON object', () => {
        const response = createTextResponse('{"name": "test", "value": 42}');

        const result = inferResponseSchema(response);

        expect(result).not.toBeNull();
        expect(result?.inferredType).toBe('json');
        expect(result?.jsonSchema).toBeDefined();
      });

      it('should detect valid JSON array', () => {
        const response = createTextResponse('[1, 2, 3, 4, 5]');

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('json');
      });

      it('should detect nested JSON objects', () => {
        const json = JSON.stringify({
          user: {
            name: 'Test',
            address: {
              city: 'New York',
            },
          },
          items: [1, 2, 3],
        });
        const response = createTextResponse(json);

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('json');
        expect(result?.jsonSchema).toBeDefined();
      });

      it('should include sample fingerprint for JSON', () => {
        const response = createTextResponse('{"key": "value"}');

        const result = inferResponseSchema(response);

        expect(result?.sampleFingerprints).toHaveLength(1);
        expect(typeof result?.sampleFingerprints[0]).toBe('string');
      });

      it('should detect JSON primitives (string)', () => {
        const response = createTextResponse('"hello"');

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('json');
      });

      it('should detect JSON primitives (number)', () => {
        const response = createTextResponse('42');

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('json');
      });

      it('should detect JSON null', () => {
        const response = createTextResponse('null');

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('json');
      });

      it('should detect JSON boolean', () => {
        const response = createTextResponse('true');

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('json');
      });
    });

    describe('Markdown responses', () => {
      it('should detect headers in markdown', () => {
        const response = createTextResponse('# Main Title\n\nSome content here.');

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('markdown');
        expect(result?.markdownStructure?.hasHeaders).toBe(true);
      });

      it('should detect multiple header levels', () => {
        const markdown = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;
        const response = createTextResponse(markdown);

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('markdown');
        expect(result?.markdownStructure?.hasHeaders).toBe(true);
      });

      it('should detect tables in markdown', () => {
        const markdown = `| Name | Value |
|------|-------|
| foo  | bar   |`;
        const response = createTextResponse(markdown);

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('markdown');
        expect(result?.markdownStructure?.hasTables).toBe(true);
      });

      it('should detect code blocks in markdown', () => {
        const markdown = `Here is some code:
\`\`\`javascript
console.log('hello');
\`\`\``;
        const response = createTextResponse(markdown);

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('markdown');
        expect(result?.markdownStructure?.hasCodeBlocks).toBe(true);
      });

      it('should detect mixed markdown structure', () => {
        const markdown = `# Documentation

| Feature | Status |
|---------|--------|
| API     | Done   |

\`\`\`json
{"example": true}
\`\`\``;
        const response = createTextResponse(markdown);

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('markdown');
        expect(result?.markdownStructure?.hasHeaders).toBe(true);
        expect(result?.markdownStructure?.hasTables).toBe(true);
        expect(result?.markdownStructure?.hasCodeBlocks).toBe(true);
      });
    });

    describe('Plain text responses', () => {
      it('should return text type for plain text', () => {
        const response = createTextResponse('This is just plain text without any special structure.');

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('text');
      });

      it('should include fingerprint for text responses', () => {
        const response = createTextResponse('Some text content');

        const result = inferResponseSchema(response);

        expect(result?.sampleFingerprints).toHaveLength(1);
      });

      it('should not misidentify plain text with hash symbols', () => {
        // Text that has # but not as a header (not at start of line with space)
        const response = createTextResponse('Use #hashtag in your post');

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('text');
      });
    });

    describe('Binary responses', () => {
      it('should return binary type for non-text content', () => {
        const response = createBinaryResponse();

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('binary');
        expect(result?.sampleFingerprints).toHaveLength(0);
      });

      it('should detect binary when only image content present', () => {
        const response: MCPToolCallResult = {
          content: [
            { type: 'image', data: 'base64...', mimeType: 'image/jpeg' },
          ],
        };

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('binary');
      });
    });

    describe('Empty/null responses', () => {
      it('should return null for empty content', () => {
        const response = createEmptyResponse();

        const result = inferResponseSchema(response);

        expect(result).toBeNull();
      });

      it('should return null for undefined content', () => {
        // Test edge case where content might be undefined at runtime
        const response = {} as MCPToolCallResult;

        const result = inferResponseSchema(response);

        expect(result).toBeNull();
      });
    });

    describe('Edge cases', () => {
      it('should handle invalid JSON gracefully', () => {
        const response = createTextResponse('{ invalid json }');

        const result = inferResponseSchema(response);

        // Should fall back to text since it's not valid JSON
        expect(result?.inferredType).toBe('text');
      });

      it('should handle whitespace-only content', () => {
        const response = createTextResponse('   \n\t   ');

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('text');
      });

      it('should handle very long content', () => {
        const longText = 'x'.repeat(10000);
        const response = createTextResponse(longText);

        const result = inferResponseSchema(response);

        expect(result?.inferredType).toBe('text');
        expect(result?.sampleFingerprints).toHaveLength(1);
      });

      it('should prefer JSON over markdown if valid JSON with code block syntax', () => {
        // This is valid JSON
        const response = createTextResponse('{"code": "```js\\nconsole.log()\\n```"}');

        const result = inferResponseSchema(response);

        // JSON parsing should succeed and take precedence
        expect(result?.inferredType).toBe('json');
      });
    });
  });
});
