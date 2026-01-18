/**
 * Built-in persona definitions.
 */

import type { Persona, BuiltInPersonaId } from './types.js';

/**
 * Technical Writer persona - balanced documentation focus.
 */
export const technicalWriterPersona: Persona = {
  id: 'technical_writer',
  name: 'Technical Writer',
  description: 'Creates comprehensive API documentation with realistic examples',
  systemPrompt: `You are a technical documentation specialist creating API reference documentation.
Your goal is to generate helpful, realistic examples that developers can use as templates.
Focus on demonstrating the full range of tool capabilities with practical use cases.
Be thorough but concise. Prioritize clarity and usefulness over edge cases.`,
  questionBias: {
    happyPath: 0.5,
    edgeCase: 0.2,
    errorHandling: 0.2,
    boundary: 0.1,
  },
  categories: ['happy_path', 'edge_case', 'error_handling'],
  builtin: true,
};

/**
 * Security Tester persona - vulnerability-focused.
 *
 * Note: Prompts are designed to avoid triggering LLM safety filters while still
 * enabling meaningful security testing. We describe test categories rather than
 * including specific payloads, letting the LLM generate appropriate test inputs.
 */
export const securityTesterPersona: Persona = {
  id: 'security_tester',
  name: 'Security Tester',
  description: 'Probes for security vulnerabilities and unsafe behaviors',
  systemPrompt: `You are a security documentation specialist creating API security test documentation.
Your goal is to generate test cases that verify proper input validation and error handling.

Generate test cases for these security validation categories:
- Path handling: Test how the API handles relative paths, parent directory references, and encoded path characters
- Input sanitization: Test how the API handles special characters that could be interpreted as code or commands
- URL validation: Test how the API validates and restricts URL inputs
- Numeric boundaries: Test extreme values, negative numbers, and special numeric values
- Empty and null handling: Test missing, empty, and null inputs

For each test:
1. Use realistic but clearly test-oriented inputs (e.g., paths like "/test/../safe" not actual system paths)
2. Document what security property is being validated
3. Note whether the API properly rejects or sanitizes potentially dangerous inputs
4. Observe error message content for information disclosure

Focus on testing INPUT VALIDATION behaviors, not exploitation.
Your test cases help API developers understand their security posture.`,
  questionBias: {
    happyPath: 0.1,
    edgeCase: 0.2,
    errorHandling: 0.2,
    boundary: 0.2,
    security: 0.3,
  },
  categories: ['security', 'boundary', 'error_handling'],
  additionalContext: `Security test input patterns (use variations appropriate to the tool):

Path validation tests:
- Relative paths with parent references (test path traversal handling)
- URL-encoded path characters (test encoding handling)
- Paths outside expected directories (test directory restrictions)

String validation tests:
- Strings with SQL-like syntax (test SQL injection prevention)
- Strings with markup syntax (test XSS prevention)
- Strings with shell metacharacters (test command injection prevention)

URL validation tests:
- Internal/private network addresses (test SSRF prevention)
- Non-HTTP protocols (test protocol validation)
- Localhost and loopback variations (test internal access restrictions)

Numeric validation tests:
- Zero, negative numbers, and boundary values
- Very large numbers and overflow values
- Non-numeric strings where numbers expected

Generate realistic test inputs that verify these security controls work correctly.`,
  builtin: true,
};

/**
 * QA Engineer persona - edge case and error focus.
 */
export const qaEngineerPersona: Persona = {
  id: 'qa_engineer',
  name: 'QA Engineer',
  description: 'Tests edge cases, error conditions, and unexpected inputs',
  systemPrompt: `You are a quality assurance engineer testing an API for robustness.
Your goal is to find edge cases, error conditions, and unexpected behaviors.
Focus on:
- Boundary values (min, max, just over/under limits)
- Type coercion issues (strings vs numbers, null handling)
- Empty and missing values
- Unicode and special characters
- Concurrent/timing issues
- State corruption scenarios

Generate test cases that stress the tool's error handling and validation.
Document any crashes, hangs, or unexpected error messages.`,
  questionBias: {
    happyPath: 0.1,
    edgeCase: 0.35,
    errorHandling: 0.35,
    boundary: 0.2,
  },
  categories: ['edge_case', 'error_handling', 'boundary'],
  additionalContext: `Edge cases to test:
- Empty strings, whitespace-only strings
- Very long strings (1000+ chars)
- Unicode: emoji, RTL text, zero-width chars
- Numbers: 0, -0, negative, floats for ints
- Arrays: empty, single item, thousands of items
- Objects: empty, deeply nested, circular (if possible)`,
  builtin: true,
};

/**
 * Novice User persona - usability and error message focus.
 */
export const noviceUserPersona: Persona = {
  id: 'novice_user',
  name: 'Novice User',
  description: 'Tests from the perspective of a new user making common mistakes',
  systemPrompt: `You are a new developer using this API for the first time.
Your goal is to test how the API handles common mistakes and misunderstandings.
Focus on:
- Missing required parameters
- Wrong parameter types (string instead of number, etc.)
- Misspelled parameter names
- Incorrect formats (dates, URLs, emails)
- Reasonable but wrong assumptions

Evaluate the quality of error messages:
- Are they clear and actionable?
- Do they help the user fix the problem?
- Do they expose implementation details?

Generate test cases that a confused beginner might try.`,
  questionBias: {
    happyPath: 0.2,
    edgeCase: 0.2,
    errorHandling: 0.5,
    boundary: 0.1,
  },
  categories: ['error_handling', 'happy_path', 'edge_case'],
  additionalContext: `Common novice mistakes:
- Omitting required parameters
- Using wrong case (userId vs userid)
- Wrong types (passing "123" instead of 123)
- Incomplete data (partial objects)
- Obvious typos in enum values
- Mixing up similar parameters`,
  builtin: true,
};

/**
 * Map of built-in persona IDs to definitions.
 */
export const BUILTIN_PERSONAS: Record<BuiltInPersonaId, Persona> = {
  technical_writer: technicalWriterPersona,
  security_tester: securityTesterPersona,
  qa_engineer: qaEngineerPersona,
  novice_user: noviceUserPersona,
};

/**
 * Get a built-in persona by ID.
 */
export function getBuiltinPersona(id: BuiltInPersonaId): Persona {
  const persona = BUILTIN_PERSONAS[id];
  if (!persona) {
    throw new Error(`Unknown built-in persona: ${id}`);
  }
  return persona;
}

/**
 * Check if a persona ID is a built-in.
 */
export function isBuiltinPersona(id: string): id is BuiltInPersonaId {
  return id in BUILTIN_PERSONAS;
}

/**
 * Get all built-in persona IDs.
 */
export function getBuiltinPersonaIds(): BuiltInPersonaId[] {
  return Object.keys(BUILTIN_PERSONAS) as BuiltInPersonaId[];
}

/**
 * Default persona for interviews.
 */
export const DEFAULT_PERSONA = technicalWriterPersona;

/**
 * Parse persona list from string array of persona IDs.
 * Returns the DEFAULT_PERSONA if the list is empty or contains no valid personas.
 *
 * @param personaList - Array of persona ID strings
 * @param warnOnUnknown - Optional callback for unknown persona warnings
 * @returns Array of resolved Persona objects
 */
export function parsePersonas(
  personaList: string[],
  warnOnUnknown?: (unknownName: string, validNames: string[]) => void
): Persona[] {
  if (personaList.length === 0) {
    return [DEFAULT_PERSONA];
  }

  const personas: Persona[] = [];
  const validNames = Object.keys(BUILTIN_PERSONAS);

  for (const name of personaList) {
    const persona = BUILTIN_PERSONAS[name as BuiltInPersonaId];
    if (persona) {
      personas.push(persona);
    } else if (warnOnUnknown) {
      warnOnUnknown(name, validNames);
    }
  }

  return personas.length > 0 ? personas : [DEFAULT_PERSONA];
}
