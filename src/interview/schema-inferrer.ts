import { createHash } from 'crypto';
import type { MCPToolCallResult } from '../transport/types.js';
import {
  inferSchemaFromValue,
  computeInferredSchemaHash,
} from '../baseline/response-fingerprint.js';
import type { ResponseSchema } from './types.js';

/**
 * Infer a response schema from an MCP tool response.
 */
export function inferResponseSchema(response: MCPToolCallResult): ResponseSchema | null {
  const textContent = extractTextContent(response);
  if (!textContent) {
    const hasBinary = response.content?.some((c) => c.type !== 'text');
    if (hasBinary) {
      return {
        inferredType: 'binary',
        sampleFingerprints: [],
      };
    }
    return null;
  }

  const parsedJson = tryParseJson(textContent);
  if (parsedJson.success) {
    const jsonSchema = inferSchemaFromValue(parsedJson.value);
    const hash = computeInferredSchemaHash(jsonSchema);
    return {
      inferredType: 'json',
      jsonSchema,
      sampleFingerprints: [hash],
    };
  }

  const markdownStructure = detectMarkdownStructure(textContent);
  if (
    markdownStructure.hasHeaders ||
    markdownStructure.hasTables ||
    markdownStructure.hasCodeBlocks
  ) {
    return {
      inferredType: 'markdown',
      markdownStructure,
      sampleFingerprints: [hashString(textContent)],
    };
  }

  return {
    inferredType: 'text',
    sampleFingerprints: [hashString(textContent)],
  };
}

export function extractTextContent(response: MCPToolCallResult): string | null {
  if (!response.content || response.content.length === 0) {
    return null;
  }

  const textBlocks = response.content
    .filter((c) => typeof c.text === 'string')
    .map((c) => c.text as string);

  if (textBlocks.length === 0) {
    const decodedBlocks = response.content
      .map((c) => decodeDataBlock(c.data, c.mimeType))
      .filter((v): v is string => typeof v === 'string');
    if (decodedBlocks.length === 0) {
      return null;
    }
    return decodedBlocks.join('\n');
  }

  return textBlocks.join('\n');
}

function tryParseJson(text: string): { success: true; value: unknown } | { success: false } {
  try {
    return { success: true, value: JSON.parse(text) };
  } catch {
    return { success: false };
  }
}

function detectMarkdownStructure(text: string): {
  hasHeaders: boolean;
  hasTables: boolean;
  hasCodeBlocks: boolean;
} {
  return {
    hasHeaders: /^#{1,6}\s+/m.test(text),
    hasTables: /^\|.+\|\s*$/m.test(text),
    hasCodeBlocks: /```[\s\S]*?```/m.test(text),
  };
}

function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeDataBlock(data?: string, mimeType?: string): string | null {
  if (!data || typeof data !== 'string') return null;
  const mime = (mimeType ?? '').toLowerCase();
  if (!mime.includes('json') && !mime.startsWith('text/')) {
    return null;
  }
  try {
    return Buffer.from(data, 'base64').toString('utf8');
  } catch {
    return null;
  }
}
