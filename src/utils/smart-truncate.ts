/**
 * Smart Truncation Utilities
 *
 * Provides intelligent content truncation that preserves structure
 * for different content types (JSON, Markdown, plain text).
 *
 * Unlike simple string truncation, these functions:
 * - Preserve JSON structure (valid JSON output)
 * - Preserve Markdown headers and section structure
 * - Truncate at natural boundaries (sentences, paragraphs)
 * - Provide helpful truncation indicators
 */

import { EXAMPLE_OUTPUT } from '../constants.js';
import { detectContentType as detectGeneralContentType } from './content-type.js';

// ==================== Types ====================

/** Content type for smart truncation */
export type ContentType = 'json' | 'markdown' | 'text';

/** Options for smart truncation */
export interface SmartTruncateOptions {
  /** Maximum length in characters */
  maxLength: number;
  /** Content type for appropriate truncation strategy */
  contentType?: ContentType;
  /** Whether to preserve JSON structure (for JSON content) */
  preserveJsonStructure?: boolean;
  /** Whether to preserve markdown headers (for markdown content) */
  preserveMarkdownHeaders?: boolean;
  /** Minimum array items to show when truncating JSON arrays */
  minArrayItems?: number;
  /** Custom truncation indicator */
  truncationIndicator?: string;
}

/** Result of smart truncation */
export interface TruncationResult {
  /** The truncated content */
  content: string;
  /** Whether truncation occurred */
  wasTruncated: boolean;
  /** Original length */
  originalLength: number;
  /** Number of characters removed */
  charactersRemoved: number;
  /** Items omitted (for arrays/objects) */
  itemsOmitted?: number;
}

// ==================== Main Functions ====================

/**
 * Smart truncate content based on type.
 *
 * @param content - Content to truncate
 * @param options - Truncation options
 * @returns Truncation result
 */
export function smartTruncate(content: string, options: SmartTruncateOptions): TruncationResult {
  const {
    maxLength,
    contentType = detectContentType(content),
    preserveJsonStructure = EXAMPLE_OUTPUT.SMART_TRUNCATE.preserveJsonStructure,
    preserveMarkdownHeaders = EXAMPLE_OUTPUT.SMART_TRUNCATE.preserveMarkdownHeaders,
    minArrayItems = EXAMPLE_OUTPUT.SMART_TRUNCATE.minArrayItems,
    truncationIndicator,
  } = options;

  const originalLength = content.length;

  // No truncation needed
  if (originalLength <= maxLength) {
    return {
      content,
      wasTruncated: false,
      originalLength,
      charactersRemoved: 0,
    };
  }

  let result: TruncationResult;

  switch (contentType) {
    case 'json':
      result = preserveJsonStructure
        ? smartTruncateJson(content, maxLength, minArrayItems, truncationIndicator)
        : simpleTruncate(content, maxLength, truncationIndicator ?? EXAMPLE_OUTPUT.TRUNCATION_INDICATORS.json);
      break;

    case 'markdown':
      result = preserveMarkdownHeaders
        ? smartTruncateMarkdown(content, maxLength, truncationIndicator)
        : simpleTruncate(content, maxLength, truncationIndicator ?? EXAMPLE_OUTPUT.TRUNCATION_INDICATORS.markdown);
      break;

    default:
      result = simpleTruncate(content, maxLength, truncationIndicator ?? EXAMPLE_OUTPUT.TRUNCATION_INDICATORS.text);
  }

  return result;
}

/**
 * Simple string truncation with indicator.
 *
 * @param content - Content to truncate
 * @param maxLength - Maximum length
 * @param indicator - Truncation indicator
 * @returns Truncation result
 */
export function simpleTruncate(
  content: string,
  maxLength: number,
  indicator: string = EXAMPLE_OUTPUT.TRUNCATION_INDICATORS.text
): TruncationResult {
  const originalLength = content.length;

  if (originalLength <= maxLength) {
    return {
      content,
      wasTruncated: false,
      originalLength,
      charactersRemoved: 0,
    };
  }

  const truncateAt = maxLength - indicator.length;
  if (truncateAt <= EXAMPLE_OUTPUT.MIN_TRUNCATION_INDICATOR_LENGTH) {
    // Not enough room for indicator, just truncate
    return {
      content: content.slice(0, maxLength),
      wasTruncated: true,
      originalLength,
      charactersRemoved: originalLength - maxLength,
    };
  }

  // Try to truncate at a word boundary
  let cutPoint = truncateAt;
  const lastSpace = content.lastIndexOf(' ', truncateAt);
  const lastNewline = content.lastIndexOf('\n', truncateAt);
  const boundary = Math.max(lastSpace, lastNewline);

  // Only use boundary if it's not too far back (within 20% of truncateAt)
  if (boundary > truncateAt * 0.8) {
    cutPoint = boundary;
  }

  return {
    content: content.slice(0, cutPoint) + indicator,
    wasTruncated: true,
    originalLength,
    charactersRemoved: originalLength - cutPoint - indicator.length,
  };
}

// ==================== JSON Truncation ====================

/**
 * Smart truncate JSON while preserving valid structure.
 *
 * @param content - JSON string to truncate
 * @param maxLength - Maximum length
 * @param minArrayItems - Minimum array items to preserve
 * @param indicator - Custom truncation indicator
 * @returns Truncation result
 */
export function smartTruncateJson(
  content: string,
  maxLength: number,
  minArrayItems: number = EXAMPLE_OUTPUT.SMART_TRUNCATE.minArrayItems,
  indicator?: string
): TruncationResult {
  const originalLength = content.length;

  if (originalLength <= maxLength) {
    return {
      content,
      wasTruncated: false,
      originalLength,
      charactersRemoved: 0,
    };
  }

  // Try to parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Not valid JSON, fall back to simple truncation
    return simpleTruncate(content, maxLength, indicator ?? EXAMPLE_OUTPUT.TRUNCATION_INDICATORS.json);
  }

  // Recursively truncate the JSON object
  const truncated = truncateJsonValue(parsed, maxLength, minArrayItems);
  const result = JSON.stringify(truncated.value, null, 2);

  return {
    content: result,
    wasTruncated: true,
    originalLength,
    charactersRemoved: originalLength - result.length,
    itemsOmitted: truncated.itemsOmitted,
  };
}

interface JsonTruncateResult {
  value: unknown;
  itemsOmitted: number;
}

/**
 * Recursively truncate a JSON value.
 */
function truncateJsonValue(
  value: unknown,
  maxLength: number,
  minItems: number,
  depth: number = 0
): JsonTruncateResult {
  // Prevent infinite recursion
  if (depth > 10) {
    return { value: '...', itemsOmitted: 0 };
  }

  // Primitives pass through
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > maxLength / 4) {
      // Truncate long strings
      return {
        value: `${value.slice(0, Math.floor(maxLength / 4))}...`,
        itemsOmitted: 0,
      };
    }
    return { value, itemsOmitted: 0 };
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return truncateJsonArray(value, maxLength, minItems, depth);
  }

  // Handle objects
  return truncateJsonObject(value as Record<string, unknown>, maxLength, minItems, depth);
}

/**
 * Truncate a JSON array.
 */
function truncateJsonArray(
  arr: unknown[],
  maxLength: number,
  minItems: number,
  depth: number
): JsonTruncateResult {
  if (arr.length === 0) {
    return { value: [], itemsOmitted: 0 };
  }

  // Check if current serialization fits
  const serialized = JSON.stringify(arr, null, 2);
  if (serialized.length <= maxLength) {
    return { value: arr, itemsOmitted: 0 };
  }

  // Calculate how many items we can keep
  const itemBudget = Math.max(minItems, Math.floor(maxLength / 100));
  let totalOmitted = 0;

  if (arr.length <= itemBudget) {
    // Truncate individual items
    const truncatedItems = arr.map((item) => {
      const result = truncateJsonValue(item, Math.floor(maxLength / arr.length), minItems, depth + 1);
      totalOmitted += result.itemsOmitted;
      return result.value;
    });
    return { value: truncatedItems, itemsOmitted: totalOmitted };
  }

  // Keep first minItems and add indicator
  const kept = arr.slice(0, itemBudget).map((item) => {
    const result = truncateJsonValue(item, Math.floor(maxLength / itemBudget), minItems, depth + 1);
    totalOmitted += result.itemsOmitted;
    return result.value;
  });

  const omitted = arr.length - itemBudget;
  totalOmitted += omitted;

  kept.push(EXAMPLE_OUTPUT.SMART_TRUNCATE.arrayOmittedTemplate.replace('{count}', String(omitted)));

  return { value: kept, itemsOmitted: totalOmitted };
}

/**
 * Truncate a JSON object.
 */
function truncateJsonObject(
  obj: Record<string, unknown>,
  maxLength: number,
  minItems: number,
  depth: number
): JsonTruncateResult {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return { value: {}, itemsOmitted: 0 };
  }

  // Check if current serialization fits
  const serialized = JSON.stringify(obj, null, 2);
  if (serialized.length <= maxLength) {
    return { value: obj, itemsOmitted: 0 };
  }

  // Calculate how many keys we can keep
  const keyBudget = Math.max(minItems, Math.floor(maxLength / 100));
  let totalOmitted = 0;

  if (keys.length <= keyBudget) {
    // Truncate individual values
    const truncated: Record<string, unknown> = {};
    for (const key of keys) {
      const result = truncateJsonValue(obj[key], Math.floor(maxLength / keys.length), minItems, depth + 1);
      truncated[key] = result.value;
      totalOmitted += result.itemsOmitted;
    }
    return { value: truncated, itemsOmitted: totalOmitted };
  }

  // Keep first keyBudget keys and add indicator
  const truncated: Record<string, unknown> = {};
  const keptKeys = keys.slice(0, keyBudget);

  for (const key of keptKeys) {
    const result = truncateJsonValue(obj[key], Math.floor(maxLength / keyBudget), minItems, depth + 1);
    truncated[key] = result.value;
    totalOmitted += result.itemsOmitted;
  }

  const omitted = keys.length - keyBudget;
  totalOmitted += omitted;
  truncated['...'] = EXAMPLE_OUTPUT.SMART_TRUNCATE.objectOmittedTemplate.replace('{count}', String(omitted));

  return { value: truncated, itemsOmitted: totalOmitted };
}

// ==================== Markdown Truncation ====================

/**
 * Smart truncate Markdown while preserving structure.
 *
 * @param content - Markdown content to truncate
 * @param maxLength - Maximum length
 * @param indicator - Custom truncation indicator
 * @returns Truncation result
 */
export function smartTruncateMarkdown(
  content: string,
  maxLength: number,
  indicator?: string
): TruncationResult {
  const originalLength = content.length;
  const truncIndicator = indicator ?? EXAMPLE_OUTPUT.TRUNCATION_INDICATORS.markdown;

  if (originalLength <= maxLength) {
    return {
      content,
      wasTruncated: false,
      originalLength,
      charactersRemoved: 0,
    };
  }

  const lines = content.split('\n');
  const result: string[] = [];
  let currentLength = 0;
  const targetLength = maxLength - truncIndicator.length;

  for (const line of lines) {
    const lineLength = line.length + 1; // +1 for newline

    // Always include headers (they're important for structure)
    const isHeader = /^#{1,6}\s/.test(line);

    if (currentLength + lineLength <= targetLength) {
      result.push(line);
      currentLength += lineLength;
    } else if (isHeader && currentLength + lineLength <= maxLength * 1.1) {
      // Allow slight overflow for headers
      result.push(line);
      currentLength += lineLength;
      break;
    } else {
      // Try to truncate the current line at a sentence boundary
      const remaining = targetLength - currentLength;
      if (remaining > 50) {
        const truncatedLine = truncateAtSentence(line, remaining);
        if (truncatedLine.length > 0) {
          result.push(truncatedLine);
        }
      }
      break;
    }
  }

  const truncatedContent = result.join('\n') + truncIndicator;

  return {
    content: truncatedContent,
    wasTruncated: true,
    originalLength,
    charactersRemoved: originalLength - truncatedContent.length,
  };
}

/**
 * Truncate text at a sentence boundary.
 */
function truncateAtSentence(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Find last sentence ending before maxLength
  const truncated = text.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('. ');
  const lastQuestion = truncated.lastIndexOf('? ');
  const lastExclamation = truncated.lastIndexOf('! ');

  const sentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);

  if (sentenceEnd > maxLength * 0.5) {
    return text.slice(0, sentenceEnd + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return text.slice(0, lastSpace);
  }

  return truncated;
}

// ==================== Utility Functions ====================

/**
 * Detect content type from content.
 *
 * @param content - Content to analyze
 * @returns Detected content type
 */
export function detectContentType(content: string): ContentType {
  return detectGeneralContentType(content, { markdownHeuristics: 'lenient' });
}

/**
 * Get the appropriate example length based on options.
 *
 * @param fullExamples - Whether to use full example length
 * @param customLength - Custom length override
 * @returns Example length to use
 */
export function getExampleLength(fullExamples: boolean, customLength?: number): number {
  if (customLength !== undefined) {
    return customLength;
  }
  return fullExamples ? EXAMPLE_OUTPUT.FULL_LENGTH : EXAMPLE_OUTPUT.DEFAULT_LENGTH;
}
