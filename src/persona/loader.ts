/**
 * Persona loader - resolves persona IDs and loads custom personas from YAML.
 */

import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import type { Persona, PersonaYAML, QuestionCategory, QuestionBias } from './types.js';
import { BUILTIN_PERSONAS, isBuiltinPersona, DEFAULT_PERSONA } from './builtins.js';

/**
 * Options for loading personas.
 */
export interface LoadPersonaOptions {
  /** Persona ID(s) - can be built-in IDs or paths to YAML files */
  personas?: string | string[];
  /** Explicit path to a persona YAML file */
  personaFile?: string;
}

/**
 * Load personas from IDs or file paths.
 */
export function loadPersonas(options: LoadPersonaOptions = {}): Persona[] {
  const result: Persona[] = [];

  // Handle explicit persona file
  if (options.personaFile) {
    const persona = loadPersonaFromFile(options.personaFile);
    result.push(persona);
  }

  // Handle persona IDs/paths
  if (options.personas) {
    const personaList = Array.isArray(options.personas)
      ? options.personas
      : options.personas.split(',').map(s => s.trim());

    for (const personaSpec of personaList) {
      const persona = resolvePersona(personaSpec);
      // Avoid duplicates
      if (!result.some(p => p.id === persona.id)) {
        result.push(persona);
      }
    }
  }

  // Default to technical_writer if nothing specified
  if (result.length === 0) {
    result.push(DEFAULT_PERSONA);
  }

  return result;
}

/**
 * Resolve a persona from ID or file path.
 */
export function resolvePersona(personaSpec: string): Persona {
  // Check if it's a built-in persona ID
  if (isBuiltinPersona(personaSpec)) {
    return BUILTIN_PERSONAS[personaSpec];
  }

  // Check common aliases
  const aliases: Record<string, string> = {
    'writer': 'technical_writer',
    'security': 'security_tester',
    'qa': 'qa_engineer',
    'novice': 'novice_user',
    'beginner': 'novice_user',
  };

  if (personaSpec in aliases) {
    const aliasedId = aliases[personaSpec];
    if (isBuiltinPersona(aliasedId)) {
      return BUILTIN_PERSONAS[aliasedId];
    }
  }

  // Try to load as a file path
  if (existsSync(personaSpec)) {
    return loadPersonaFromFile(personaSpec);
  }

  // Check with common extensions
  const extensions = ['.yaml', '.yml'];
  for (const ext of extensions) {
    const pathWithExt = personaSpec + ext;
    if (existsSync(pathWithExt)) {
      return loadPersonaFromFile(pathWithExt);
    }
  }

  throw new Error(
    `Unknown persona: "${personaSpec}". ` +
    `Available built-in personas: technical_writer, security_tester, qa_engineer, novice_user`
  );
}

/**
 * Load a persona from a YAML file.
 */
export function loadPersonaFromFile(path: string): Persona {
  if (!existsSync(path)) {
    throw new Error(`Persona file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');
  const parsed = parseYaml(content) as PersonaYAML;

  return validateAndNormalizePersona(parsed, path);
}

/**
 * Validate and normalize a persona definition.
 */
function validateAndNormalizePersona(data: Partial<PersonaYAML>, source: string): Persona {
  // Required fields
  if (!data.id || typeof data.id !== 'string') {
    throw new Error(`Persona from ${source} missing required field: id`);
  }
  if (!data.name || typeof data.name !== 'string') {
    throw new Error(`Persona from ${source} missing required field: name`);
  }
  if (!data.systemPrompt || typeof data.systemPrompt !== 'string') {
    throw new Error(`Persona from ${source} missing required field: systemPrompt`);
  }

  // Normalize question bias with defaults
  const defaultBias: QuestionBias = {
    happyPath: 0.25,
    edgeCase: 0.25,
    errorHandling: 0.25,
    boundary: 0.25,
  };

  const questionBias: QuestionBias = {
    ...defaultBias,
    ...(data.questionBias ?? {}),
  };

  // Normalize categories
  const defaultCategories: QuestionCategory[] = ['happy_path', 'edge_case', 'error_handling'];
  const categories = data.categories ?? defaultCategories;

  // Validate categories
  const validCategories: QuestionCategory[] = ['happy_path', 'edge_case', 'error_handling', 'boundary', 'security'];
  for (const cat of categories) {
    if (!validCategories.includes(cat)) {
      throw new Error(`Invalid category "${cat}" in persona ${data.id}. Valid categories: ${validCategories.join(', ')}`);
    }
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? `Custom persona: ${data.name}`,
    systemPrompt: data.systemPrompt,
    questionBias,
    categories,
    additionalContext: data.additionalContext,
    builtin: false,
  };
}

/**
 * Generate a sample custom persona YAML.
 */
export function generateSamplePersonaYaml(): string {
  return `# Custom Persona Definition
# Save this file and reference it with: --persona-file ./my-persona.yaml

id: custom_auditor
name: Compliance Auditor
description: Tests for compliance with security and data handling requirements

systemPrompt: |
  You are a compliance auditor testing an API for regulatory requirements.
  Focus on data handling, privacy, and security compliance.
  Test for:
  - Sensitive data exposure in responses
  - Proper error handling without information leakage
  - Input validation and sanitization
  - Access control boundaries

questionBias:
  happyPath: 0.2
  edgeCase: 0.2
  errorHandling: 0.3
  boundary: 0.15
  security: 0.15

categories:
  - error_handling
  - security
  - boundary

additionalContext: |
  Compliance areas to verify:
  - PII handling and masking
  - Error message sanitization
  - Rate limiting behavior
  - Authentication requirements
`;
}
