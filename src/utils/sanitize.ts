/**
 * Input sanitization utilities for prompt injection protection.
 *
 * These utilities help prevent malicious content in MCP server responses
 * from manipulating LLM behavior through prompt injection attacks.
 */

/**
 * Patterns that may indicate prompt injection attempts.
 * These patterns look for instruction-like content in user data.
 */
const INJECTION_PATTERNS = [
  // Direct instruction patterns
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|above|prior)/i,
  /forget\s+(everything|all|what)\s+(you|i)/i,
  // New instruction patterns
  /new\s+instructions?:/i,
  /system\s*:\s*you\s+(are|should|must|will)/i,
  /\bact\s+as\s+(if|though)\b/i,
  /\byou\s+are\s+now\b/i,
  /\bpretend\s+(to\s+be|you\s+are)\b/i,
  // Output manipulation
  /\breturn\s+(only|just)\s+["']?success/i,
  /\balways\s+(return|respond|output|say)\b/i,
  /\bnever\s+(return|respond|output|mention|reveal)\b/i,
  // Role/persona manipulation
  /\byour\s+(new\s+)?role\s+is\b/i,
  /\bswitch\s+(to\s+)?(role|persona|mode)\b/i,
  // Jailbreak attempts
  /\bdo\s+anything\s+now\b/i,
  /\bdan\s+mode\b/i,
  /\bdeveloper\s+mode\b/i,
  // Markdown/formatting exploits
  /```\s*(system|instruction|prompt)/i,
];

/**
 * Characters that could be used for prompt structure manipulation.
 */
const STRUCTURAL_CHARS: Record<string, string> = {
  '`': '\\`',
  '$': '\\$',
  '{': '\\{',
  '}': '\\}',
};

/**
 * Result of sanitization with metadata about what was found.
 */
export interface SanitizeResult {
  /** The sanitized text */
  sanitized: string;
  /** Whether any potential injection patterns were detected */
  hadInjectionPatterns: boolean;
  /** List of detected patterns (for logging) */
  detectedPatterns: string[];
  /** Whether structural characters were escaped */
  hadStructuralChars: boolean;
}

/**
 * Sanitize user-provided text for safe inclusion in LLM prompts.
 *
 * This function:
 * 1. Detects potential prompt injection patterns
 * 2. Escapes structural characters that could manipulate prompt format
 * 3. Wraps content in clear data delimiters
 *
 * @param text - The text to sanitize (e.g., tool description, schema)
 * @param options - Sanitization options
 * @returns Sanitized text safe for prompt inclusion
 */
export function sanitizeForPrompt(
  text: string,
  options: {
    /** Whether to escape structural characters */
    escapeStructural?: boolean;
    /** Whether to wrap in data delimiters */
    wrapInDelimiters?: boolean;
    /** Custom delimiter name */
    delimiterName?: string;
    /** Whether to strip detected injection patterns */
    stripInjections?: boolean;
  } = {}
): SanitizeResult {
  const {
    escapeStructural = true,
    wrapInDelimiters = false,
    delimiterName = 'DATA',
    stripInjections = false,
  } = options;

  let sanitized = text;
  const detectedPatterns: string[] = [];
  let hadStructuralChars = false;

  // Detect injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      detectedPatterns.push(pattern.source);
      if (stripInjections) {
        // Replace detected patterns with a placeholder
        sanitized = sanitized.replace(pattern, '[FILTERED]');
      }
    }
  }

  // Escape structural characters
  if (escapeStructural) {
    for (const [char, escaped] of Object.entries(STRUCTURAL_CHARS)) {
      if (sanitized.includes(char)) {
        hadStructuralChars = true;
        sanitized = sanitized.split(char).join(escaped);
      }
    }
  }

  // Wrap in delimiters if requested
  if (wrapInDelimiters) {
    sanitized = `<${delimiterName}>\n${sanitized}\n</${delimiterName}>`;
  }

  return {
    sanitized,
    hadInjectionPatterns: detectedPatterns.length > 0,
    detectedPatterns,
    hadStructuralChars,
  };
}

/**
 * Sanitize a JSON object for prompt inclusion.
 * Recursively sanitizes all string values.
 *
 * @param obj - The object to sanitize
 * @returns Sanitized object with all strings processed
 */
export function sanitizeObjectForPrompt(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeForPrompt(obj, { escapeStructural: true }).sanitized;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectForPrompt(item));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Also sanitize keys (though less critical)
      const sanitizedKey = sanitizeForPrompt(key, { escapeStructural: true }).sanitized;
      result[sanitizedKey] = sanitizeObjectForPrompt(value);
    }
    return result;
  }

  // Numbers, booleans, etc. pass through
  return obj;
}

/**
 * Create a safely delimited data section for prompts.
 * Uses instruction/data separation pattern to prevent injection.
 *
 * @param label - Label for the data section
 * @param content - Content to include
 * @returns Formatted data section
 */
export function createDataSection(label: string, content: string): string {
  const sanitized = sanitizeForPrompt(content, { escapeStructural: true });

  // Use XML-like delimiters that are less likely to be in user data
  return `<${label.toUpperCase()}_DATA>
${sanitized.sanitized}
</${label.toUpperCase()}_DATA>`;
}

/**
 * Sanitize a tool for safe inclusion in prompts.
 * Returns a structured representation with sanitized fields.
 *
 * @param tool - Tool object with name, description, and schema
 * @returns Sanitized prompt-safe representation
 */
export function sanitizeToolForPrompt(tool: {
  name: string;
  description?: string;
  inputSchema?: unknown;
}): {
  name: string;
  description: string;
  schema: string;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Sanitize name (should be safe, but check anyway)
  const nameResult = sanitizeForPrompt(tool.name, { escapeStructural: true });
  if (nameResult.hadInjectionPatterns) {
    warnings.push(`Tool name contains suspicious patterns: ${tool.name}`);
  }

  // Sanitize description
  const descResult = sanitizeForPrompt(
    tool.description ?? 'No description provided',
    { escapeStructural: true }
  );
  if (descResult.hadInjectionPatterns) {
    warnings.push(`Tool description contains potential injection patterns`);
  }

  // Sanitize schema
  let schemaStr = 'No schema provided';
  if (tool.inputSchema) {
    const sanitizedSchema = sanitizeObjectForPrompt(tool.inputSchema);
    schemaStr = JSON.stringify(sanitizedSchema, null, 2);
  }

  return {
    name: nameResult.sanitized,
    description: descResult.sanitized,
    schema: schemaStr,
    warnings,
  };
}

/**
 * Check if text contains potential injection patterns without modifying it.
 *
 * @param text - Text to check
 * @returns True if potential injection detected
 */
export function hasInjectionPatterns(text: string): boolean {
  return INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Truncate text to a maximum length with indicator.
 * Useful for limiting context size in prompts.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export function truncateForPrompt(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}
