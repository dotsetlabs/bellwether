import type { MCPToolCallResult } from '../transport/types.js';
import { inferSchemaFromValue, computeInferredSchemaHash } from '../baseline/response-fingerprint.js';
import type { ResponseAssertionResult, ResponseSchema } from './types.js';
import type { InferredSchema } from '../baseline/response-fingerprint.js';
import { extractTextContent } from './schema-inferrer.js';

export interface ResponseAssertionOptions {
  expectedText?: string;
}

/**
 * Validate a response against an inferred schema and basic semantic assertions.
 */
export function validateResponseAssertions(
  response: MCPToolCallResult,
  expectedSchema?: ResponseSchema,
  options: ResponseAssertionOptions = {}
): ResponseAssertionResult[] {
  const results: ResponseAssertionResult[] = [];

  const textContent = extractTextContent(response);
  const jsonContent = textContent ? tryParseJson(textContent) : null;
  const hasBinary = response.content?.some((c) => c.type !== 'text') ?? false;

  results.push(assertNotEmpty(textContent, jsonContent?.value, hasBinary));

  if (expectedSchema?.inferredType === 'json') {
    results.push(assertIsJson(jsonContent));
    if (expectedSchema.jsonSchema) {
      results.push(assertMatchesSchema(jsonContent, expectedSchema.jsonSchema));
      results.push(assertContainsFields(jsonContent, expectedSchema.jsonSchema));
    }
  }

  if (expectedSchema?.inferredType === 'markdown' && expectedSchema.markdownStructure) {
    results.push(assertMarkdownStructure(textContent, expectedSchema.markdownStructure));
  }

  if (options.expectedText) {
    results.push(assertContainsText(textContent, options.expectedText));
  }

  return results.filter(Boolean);
}

function assertNotEmpty(
  textContent: string | null,
  jsonValue: unknown | undefined,
  hasBinary: boolean
): ResponseAssertionResult {
  const isEmptyText = !textContent || textContent.trim().length === 0;
  const isEmptyJson = jsonValue === undefined || jsonValue === null ||
    (Array.isArray(jsonValue) && jsonValue.length === 0) ||
    (typeof jsonValue === 'object' && !Array.isArray(jsonValue) && Object.keys(jsonValue as object).length === 0);

  const passed = hasBinary || !(isEmptyText && isEmptyJson);
  return {
    type: 'not_empty',
    passed,
    message: passed ? undefined : 'Response was empty',
  };
}

function assertIsJson(parsed: ParsedJson | null): ResponseAssertionResult {
  const passed = !!parsed?.success;
  return {
    type: 'is_json',
    passed,
    message: passed ? undefined : 'Response is not valid JSON',
  };
}

function assertMatchesSchema(
  parsed: ParsedJson | null,
  expectedSchema: InferredSchema
): ResponseAssertionResult {
  if (!parsed?.success) {
    return {
      type: 'matches_schema',
      passed: false,
      message: 'Response is not valid JSON',
    };
  }

  const actualSchema = inferSchemaFromValue(parsed.value);
  const expectedHash = computeInferredSchemaHash(expectedSchema);
  const actualHash = computeInferredSchemaHash(actualSchema);
  const passed = expectedHash === actualHash;

  return {
    type: 'matches_schema',
    passed,
    message: passed ? undefined : 'Response schema does not match expected structure',
    expected: expectedHash,
    actual: actualHash,
  };
}

function assertContainsFields(
  parsed: ParsedJson | null,
  expectedSchema: InferredSchema
): ResponseAssertionResult {
  if (!parsed?.success || parsed.value === null || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return {
      type: 'contains_fields',
      passed: false,
      message: 'Response JSON is not an object',
    };
  }

  const expectedProps = (expectedSchema as { properties?: Record<string, unknown> }).properties ?? {};
  const requiredFields = Object.keys(expectedProps);
  if (requiredFields.length === 0) {
    return {
      type: 'contains_fields',
      passed: true,
    };
  }

  const actualFields = Object.keys(parsed.value as Record<string, unknown>);
  const missing = requiredFields.filter((field) => !actualFields.includes(field));

  return {
    type: 'contains_fields',
    passed: missing.length === 0,
    message: missing.length === 0 ? undefined : `Missing fields: ${missing.join(', ')}`,
    expected: requiredFields,
    actual: actualFields,
  };
}

function assertMarkdownStructure(
  textContent: string | null,
  expected: NonNullable<ResponseSchema['markdownStructure']>
): ResponseAssertionResult {
  if (!textContent) {
    return {
      type: 'contains_text',
      passed: false,
      message: 'Response text is empty',
    };
  }

  const hasHeaders = /^#{1,6}\s+/m.test(textContent);
  const hasTables = /^\|.+\|\s*$/m.test(textContent);
  const hasCodeBlocks = /```[\s\S]*?```/m.test(textContent);

  const passed = (!expected.hasHeaders || hasHeaders) &&
    (!expected.hasTables || hasTables) &&
    (!expected.hasCodeBlocks || hasCodeBlocks);

  return {
    type: 'contains_text',
    passed,
    message: passed ? undefined : 'Markdown structure is missing expected sections',
    expected,
    actual: { hasHeaders, hasTables, hasCodeBlocks },
  };
}

function assertContainsText(textContent: string | null, expected: string): ResponseAssertionResult {
  const passed = !!textContent && textContent.includes(expected);
  return {
    type: 'contains_text',
    passed,
    message: passed ? undefined : `Response missing expected text: "${expected}"`,
    expected,
  };
}

type ParsedJson =
  | { success: true; value: unknown }
  | { success: false; value?: undefined };

function tryParseJson(text: string): ParsedJson {
  try {
    return { success: true, value: JSON.parse(text) };
  } catch {
    return { success: false };
  }
}
