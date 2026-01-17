/**
 * Markdown output escaping utilities.
 *
 * Provides functions to safely escape content for Markdown output,
 * including tables, code blocks, and Mermaid diagrams.
 */

/**
 * Escape a string for use in a Markdown table cell.
 * Handles pipe characters and other special characters that break table structure.
 *
 * @param text - The text to escape
 * @returns Escaped text safe for table cells
 */
export function escapeTableCell(text: string): string {
  if (!text) return '';

  return text
    // Escape pipe characters (break table columns)
    .replace(/\|/g, '\\|')
    // Escape newlines (break table rows)
    .replace(/\r?\n/g, '<br>')
    // Escape leading/trailing whitespace that might affect rendering
    .trim();
}

/**
 * Escape a string for use inside a code block.
 * Handles backticks that would prematurely close the code block.
 *
 * @param text - The text to escape
 * @returns Escaped text safe for code blocks
 */
export function escapeCodeBlock(text: string): string {
  if (!text) return '';

  // Replace triple backticks with escaped version
  // Use Unicode zero-width space to break the sequence
  return text.replace(/```/g, '`\u200B`\u200B`');
}

/**
 * Escape a string for use in a Mermaid diagram.
 * Handles quotes, brackets, and other special characters.
 *
 * @param text - The text to escape
 * @returns Escaped text safe for Mermaid
 */
export function escapeMermaid(text: string): string {
  if (!text) return '';

  return text
    // Escape double quotes (break Mermaid string literals)
    .replace(/"/g, '#quot;')
    // Escape square brackets (node syntax)
    .replace(/\[/g, '#lsqb;')
    .replace(/\]/g, '#rsqb;')
    // Escape parentheses (node syntax)
    .replace(/\(/g, '#lpar;')
    .replace(/\)/g, '#rpar;')
    // Escape curly braces (subgraph syntax)
    .replace(/\{/g, '#lcub;')
    .replace(/\}/g, '#rcub;')
    // Escape arrows and pipes
    .replace(/-->/g, '#arrow;')
    .replace(/->/g, '#rarr;')
    .replace(/\|/g, '#pipe;')
    // Escape newlines
    .replace(/\r?\n/g, ' ');
}

/**
 * Escape a string for use as a Mermaid node label.
 * Wraps in quotes and escapes special characters.
 *
 * @param text - The text to use as a label
 * @returns Safe Mermaid node label
 */
export function mermaidLabel(text: string): string {
  if (!text) return '""';

  // For simple alphanumeric text, no escaping needed
  if (/^[a-zA-Z0-9_-]+$/.test(text)) {
    return text;
  }

  // Escape and wrap in quotes for complex text
  const escaped = text
    .replace(/"/g, "'")
    .replace(/\r?\n/g, ' ')
    .trim();

  return `"${escaped}"`;
}

/**
 * Options for JSON code block validation.
 */
export interface JsonCodeBlockOptions {
  /** Maximum length before truncating (default: unlimited) */
  maxLength?: number;
  /** Truncation indicator (default: '...(truncated)') */
  truncationIndicator?: string;
  /** Whether to pretty-print the JSON (default: true) */
  prettyPrint?: boolean;
  /** Indentation for pretty-printing (default: 2) */
  indent?: number;
}

/**
 * Result of validating JSON for a code block.
 */
export interface JsonCodeBlockResult {
  /** Whether the JSON is valid */
  valid: boolean;
  /** The formatted JSON string (or original if invalid) */
  content: string;
  /** Whether the content was truncated */
  truncated: boolean;
  /** Error message if JSON is invalid */
  error?: string;
}

/**
 * Validate and format JSON for output in a code block.
 * Returns safe content even if JSON is invalid.
 *
 * @param json - The JSON string or object to validate
 * @param options - Formatting options
 * @returns Validation result with safe content
 */
export function validateJsonForCodeBlock(
  json: string | unknown,
  options: JsonCodeBlockOptions = {}
): JsonCodeBlockResult {
  const {
    maxLength,
    truncationIndicator = '...(truncated)',
    prettyPrint = true,
    indent = 2,
  } = options;

  let content: string;
  let valid = true;
  let error: string | undefined;

  // Parse if string, stringify if object
  if (typeof json === 'string') {
    try {
      const parsed = JSON.parse(json);
      content = prettyPrint
        ? JSON.stringify(parsed, null, indent)
        : JSON.stringify(parsed);
    } catch (e) {
      valid = false;
      error = e instanceof Error ? e.message : 'Invalid JSON';
      content = escapeCodeBlock(json);
    }
  } else {
    try {
      content = prettyPrint
        ? JSON.stringify(json, null, indent)
        : JSON.stringify(json);
    } catch (e) {
      valid = false;
      error = e instanceof Error ? e.message : 'Cannot stringify value';
      content = String(json);
    }
  }

  // Truncate if needed
  let truncated = false;
  if (maxLength && content.length > maxLength) {
    content = content.substring(0, maxLength) + '\n' + truncationIndicator;
    truncated = true;
  }

  // Escape any backticks that might break the code block
  content = escapeCodeBlock(content);

  return { valid, content, truncated, error };
}

/**
 * Escape special characters in inline code.
 *
 * @param text - The text to escape
 * @returns Escaped text safe for inline code
 */
export function escapeInlineCode(text: string): string {
  // Empty string returns double backticks (minimal valid inline code)
  if (!text) return '``';

  // Single backticks can be escaped by using double backticks
  if (text.includes('`')) {
    // If text contains backticks, wrap with double backticks and padding spaces.
    // Spaces are always added for clarity and to handle edge cases where
    // text starts/ends with backticks (CommonMark strips one padding space each side).
    return `\`\` ${text} \`\``;
  }

  return `\`${text}\``;
}

/**
 * Escape text for use in a Markdown link title.
 *
 * @param text - The text to escape
 * @returns Escaped text safe for link titles
 */
export function escapeLinkTitle(text: string): string {
  if (!text) return '';

  return text
    // Escape quotes
    .replace(/"/g, '\\"')
    // Escape parentheses
    .replace(/\)/g, '\\)')
    .replace(/\(/g, '\\(');
}

/**
 * Escape text for use in a Markdown bullet list item.
 *
 * @param text - The text to escape
 * @returns Escaped text safe for list items
 */
export function escapeListItem(text: string): string {
  if (!text) return '';

  // Handle leading characters that could be interpreted as list markers
  let escaped = text;

  // Leading dash, asterisk, plus (unordered list)
  if (/^[-*+]\s/.test(escaped)) {
    escaped = '\\' + escaped;
  }

  // Leading number with period (ordered list)
  if (/^\d+\.\s/.test(escaped)) {
    escaped = escaped.replace(/^(\d+)\./, '$1\\.');
  }

  // Newlines in list items
  escaped = escaped.replace(/\r?\n/g, '  \n  ');

  return escaped;
}

/**
 * Wrap text to ensure it fits within table cell width constraints.
 *
 * @param text - The text to wrap
 * @param maxWidth - Maximum width (default: 50)
 * @returns Wrapped text with <br> for line breaks
 */
export function wrapTableCell(text: string, maxWidth: number = 50): string {
  if (!text || text.length <= maxWidth) {
    return escapeTableCell(text);
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word.length > maxWidth ? word.substring(0, maxWidth) + '...' : word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return escapeTableCell(lines.join('\n'));
}

/**
 * Build a Markdown table from headers and rows.
 * Automatically escapes cell content.
 *
 * @param headers - Array of header strings
 * @param rows - 2D array of cell values
 * @param alignments - Optional array of column alignments ('left', 'center', 'right')
 * @returns Complete Markdown table string
 */
export function buildTable(
  headers: string[],
  rows: string[][],
  alignments?: Array<'left' | 'center' | 'right'>
): string {
  const lines: string[] = [];

  // Header row
  const escapedHeaders = headers.map(h => escapeTableCell(h));
  lines.push(`| ${escapedHeaders.join(' | ')} |`);

  // Separator row with alignment
  const separators = headers.map((_, i) => {
    const align = alignments?.[i] ?? 'left';
    switch (align) {
      case 'center':
        return ':---:';
      case 'right':
        return '---:';
      default:
        return '---';
    }
  });
  lines.push(`| ${separators.join(' | ')} |`);

  // Data rows
  for (const row of rows) {
    const escapedCells = row.map(cell => escapeTableCell(cell));
    // Pad row if needed
    while (escapedCells.length < headers.length) {
      escapedCells.push('');
    }
    lines.push(`| ${escapedCells.join(' | ')} |`);
  }

  return lines.join('\n');
}
