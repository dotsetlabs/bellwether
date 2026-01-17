import { describe, it, expect } from 'vitest';
import {
  escapeTableCell,
  escapeCodeBlock,
  escapeMermaid,
  mermaidLabel,
  validateJsonForCodeBlock,
  escapeInlineCode,
  escapeLinkTitle,
  escapeListItem,
  wrapTableCell,
  buildTable,
} from '../../src/utils/markdown.js';

describe('escapeTableCell', () => {
  it('should escape pipe characters', () => {
    expect(escapeTableCell('foo|bar')).toBe('foo\\|bar');
    expect(escapeTableCell('a|b|c')).toBe('a\\|b\\|c');
  });

  it('should convert newlines to <br>', () => {
    expect(escapeTableCell('line1\nline2')).toBe('line1<br>line2');
    expect(escapeTableCell('line1\r\nline2')).toBe('line1<br>line2');
  });

  it('should trim whitespace', () => {
    expect(escapeTableCell('  text  ')).toBe('text');
  });

  it('should handle empty strings', () => {
    expect(escapeTableCell('')).toBe('');
  });

  it('should handle complex content', () => {
    expect(escapeTableCell('foo|bar\nbaz')).toBe('foo\\|bar<br>baz');
  });
});

describe('escapeCodeBlock', () => {
  it('should escape triple backticks', () => {
    const input = 'code with ``` backticks';
    const result = escapeCodeBlock(input);
    expect(result).not.toContain('```');
  });

  it('should handle multiple triple backticks', () => {
    const input = '```\ncode\n``` more ```';
    const result = escapeCodeBlock(input);
    const matches = result.match(/```/g);
    expect(matches).toBeNull();
  });

  it('should handle empty strings', () => {
    expect(escapeCodeBlock('')).toBe('');
  });

  it('should not modify text without backticks', () => {
    expect(escapeCodeBlock('normal text')).toBe('normal text');
  });
});

describe('escapeMermaid', () => {
  it('should escape double quotes', () => {
    expect(escapeMermaid('text "with" quotes')).toBe('text #quot;with#quot; quotes');
  });

  it('should escape brackets', () => {
    expect(escapeMermaid('text [in] brackets')).toBe('text #lsqb;in#rsqb; brackets');
  });

  it('should escape parentheses', () => {
    expect(escapeMermaid('text (in) parens')).toBe('text #lpar;in#rpar; parens');
  });

  it('should escape curly braces', () => {
    expect(escapeMermaid('text {in} braces')).toBe('text #lcub;in#rcub; braces');
  });

  it('should escape pipes', () => {
    expect(escapeMermaid('foo|bar')).toBe('foo#pipe;bar');
  });

  it('should convert newlines to spaces', () => {
    expect(escapeMermaid('line1\nline2')).toBe('line1 line2');
  });

  it('should handle empty strings', () => {
    expect(escapeMermaid('')).toBe('');
  });
});

describe('mermaidLabel', () => {
  it('should return simple text as-is', () => {
    expect(mermaidLabel('simple')).toBe('simple');
    expect(mermaidLabel('tool_name')).toBe('tool_name');
    expect(mermaidLabel('foo-bar')).toBe('foo-bar');
  });

  it('should wrap complex text in quotes', () => {
    expect(mermaidLabel('text with spaces')).toBe('"text with spaces"');
  });

  it('should escape double quotes', () => {
    expect(mermaidLabel('text "quoted"')).toBe("\"text 'quoted'\"");
  });

  it('should handle empty strings', () => {
    expect(mermaidLabel('')).toBe('""');
  });
});

describe('validateJsonForCodeBlock', () => {
  describe('valid JSON', () => {
    it('should format valid JSON object', () => {
      const result = validateJsonForCodeBlock('{"a":1,"b":2}');
      expect(result.valid).toBe(true);
      expect(result.content).toContain('"a": 1');
      expect(result.truncated).toBe(false);
    });

    it('should format valid JSON array', () => {
      const result = validateJsonForCodeBlock('[1, 2, 3]');
      expect(result.valid).toBe(true);
      expect(result.content).toContain('1');
      expect(result.truncated).toBe(false);
    });

    it('should handle object input', () => {
      const result = validateJsonForCodeBlock({ foo: 'bar' });
      expect(result.valid).toBe(true);
      expect(result.content).toContain('"foo": "bar"');
    });
  });

  describe('invalid JSON', () => {
    it('should mark as invalid for malformed JSON', () => {
      const result = validateJsonForCodeBlock('{invalid}');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should escape backticks in invalid JSON', () => {
      const result = validateJsonForCodeBlock('```');
      expect(result.valid).toBe(false);
      expect(result.content).not.toContain('```');
    });
  });

  describe('truncation', () => {
    it('should truncate long content', () => {
      const longJson = { data: 'x'.repeat(1000) };
      const result = validateJsonForCodeBlock(longJson, { maxLength: 100 });
      expect(result.truncated).toBe(true);
      expect(result.content.length).toBeLessThan(150); // With indicator
    });

    it('should use custom truncation indicator', () => {
      const longJson = { data: 'x'.repeat(1000) };
      const result = validateJsonForCodeBlock(longJson, {
        maxLength: 100,
        truncationIndicator: '[CUT]',
      });
      expect(result.content).toContain('[CUT]');
    });
  });

  describe('formatting options', () => {
    it('should disable pretty print when requested', () => {
      const result = validateJsonForCodeBlock({ a: 1 }, { prettyPrint: false });
      expect(result.content).toBe('{"a":1}');
    });

    it('should use custom indent', () => {
      const result = validateJsonForCodeBlock({ a: 1 }, { indent: 4 });
      expect(result.content).toContain('    "a"');
    });
  });
});

describe('escapeInlineCode', () => {
  it('should return simple text with backticks', () => {
    expect(escapeInlineCode('code')).toBe('`code`');
  });

  it('should use double backticks for text containing backticks', () => {
    expect(escapeInlineCode('foo`bar')).toBe('`` foo`bar ``');
  });

  it('should handle text starting with backtick', () => {
    const result = escapeInlineCode('`start');
    expect(result.startsWith('``')).toBe(true);
    expect(result).toContain(' `start');
  });

  it('should handle text ending with backtick', () => {
    const result = escapeInlineCode('end`');
    expect(result.endsWith('``')).toBe(true);
    expect(result).toContain('end` ');
  });

  it('should handle empty strings', () => {
    expect(escapeInlineCode('')).toBe('``');
  });
});

describe('escapeLinkTitle', () => {
  it('should escape double quotes', () => {
    expect(escapeLinkTitle('title "quoted"')).toBe('title \\"quoted\\"');
  });

  it('should escape parentheses', () => {
    expect(escapeLinkTitle('title (note)')).toBe('title \\(note\\)');
  });

  it('should handle empty strings', () => {
    expect(escapeLinkTitle('')).toBe('');
  });
});

describe('escapeListItem', () => {
  it('should escape leading dash', () => {
    expect(escapeListItem('- item')).toBe('\\- item');
  });

  it('should escape leading asterisk', () => {
    expect(escapeListItem('* item')).toBe('\\* item');
  });

  it('should escape leading number with period', () => {
    expect(escapeListItem('1. item')).toBe('1\\. item');
  });

  it('should handle newlines in list items', () => {
    expect(escapeListItem('line1\nline2')).toBe('line1  \n  line2');
  });

  it('should not escape non-list-marker leading characters', () => {
    expect(escapeListItem('normal text')).toBe('normal text');
  });
});

describe('wrapTableCell', () => {
  it('should escape short text without wrapping', () => {
    const result = wrapTableCell('short');
    expect(result).toBe('short');
  });

  it('should wrap long text', () => {
    const longText = 'This is a very long text that should be wrapped across multiple lines';
    const result = wrapTableCell(longText, 20);
    expect(result).toContain('<br>');
  });

  it('should escape pipes in wrapped text', () => {
    const text = 'text | with | pipes';
    const result = wrapTableCell(text);
    expect(result).not.toContain(' | ');
    expect(result).toContain('\\|');
  });
});

describe('buildTable', () => {
  it('should build simple table', () => {
    const result = buildTable(
      ['A', 'B', 'C'],
      [
        ['1', '2', '3'],
        ['4', '5', '6'],
      ]
    );
    expect(result).toContain('| A | B | C |');
    expect(result).toContain('| --- | --- | --- |');
    expect(result).toContain('| 1 | 2 | 3 |');
    expect(result).toContain('| 4 | 5 | 6 |');
  });

  it('should apply alignments', () => {
    const result = buildTable(
      ['Left', 'Center', 'Right'],
      [],
      ['left', 'center', 'right']
    );
    expect(result).toContain('| --- | :---: | ---: |');
  });

  it('should escape content in cells', () => {
    const result = buildTable(
      ['Header | Pipe'],
      [['Cell | Pipe']]
    );
    expect(result).toContain('Header \\| Pipe');
    expect(result).toContain('Cell \\| Pipe');
  });

  it('should pad short rows', () => {
    const result = buildTable(
      ['A', 'B', 'C'],
      [['1']] // Only one cell
    );
    expect(result).toContain('| 1 |  |  |');
  });
});
