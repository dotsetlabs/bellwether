export type DetectedContentType = 'json' | 'markdown' | 'text';

export interface DetectContentTypeOptions {
  /**
   * Markdown detection mode:
   * - `strict`: conservative heading/link/fence patterns (legacy contract/golden behavior)
   * - `lenient`: broader markdown indicators (legacy smart-truncate behavior)
   */
  markdownHeuristics?: 'strict' | 'lenient';
}

function looksLikeMarkdownStrict(trimmed: string): boolean {
  return /^#|^\*{1,3}[^*]|\[.*\]\(.*\)|^```/.test(trimmed);
}

function looksLikeMarkdownLenient(trimmed: string): boolean {
  if (looksLikeMarkdownStrict(trimmed)) {
    return true;
  }

  return (
    trimmed.includes('\n#') ||
    /^[-*]\s/.test(trimmed) ||
    /^\d+\.\s/.test(trimmed) ||
    trimmed.includes('```') ||
    trimmed.includes('**') ||
    trimmed.includes('__')
  );
}

/**
 * Detect whether content is JSON, Markdown, or plain text.
 */
export function detectContentType(
  content: string,
  options: DetectContentTypeOptions = {}
): DetectedContentType {
  const mode = options.markdownHeuristics ?? 'strict';
  const trimmed = content.trim();

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  const isMarkdown =
    mode === 'lenient' ? looksLikeMarkdownLenient(trimmed) : looksLikeMarkdownStrict(trimmed);
  if (isMarkdown) {
    return 'markdown';
  }

  return 'text';
}
