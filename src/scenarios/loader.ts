/**
 * Scenario loader - loads test scenarios from YAML files.
 */

import { readFileSync, existsSync } from 'fs';
import type { QuestionCategory } from '../interview/question-category.js';
import { parseYamlSecure } from '../utils/yaml-parser.js';
import { PATHS } from '../constants.js';
import type {
  TestScenario,
  PromptScenario,
  ScenarioAssertion,
  TestScenariosYAML,
  TestScenarioYAML,
  PromptScenarioYAML,
  ScenarioAssertionYAML,
  LoadedScenarios,
  AssertionCondition,
} from './types.js';

/** Default file name for test scenarios */
export const DEFAULT_SCENARIOS_FILE = PATHS.DEFAULT_SCENARIOS_FILE;

/** Valid question categories */
const VALID_CATEGORIES: QuestionCategory[] = [
  'happy_path',
  'edge_case',
  'error_handling',
  'boundary',
  'security',
];

/** Valid assertion conditions */
const VALID_CONDITIONS: AssertionCondition[] = [
  'exists',
  'equals',
  'contains',
  'truthy',
  'type',
  'not_error',
];

/**
 * Load test scenarios from a YAML file.
 */
export function loadScenariosFromFile(path: string): LoadedScenarios {
  if (!existsSync(path)) {
    throw new Error(`Test scenarios file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');
  const parsed = parseYamlSecure<TestScenariosYAML>(content);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid test scenarios file: ${path} (expected object)`);
  }

  const globalTags = parsed.tags ?? [];
  const toolScenarios: TestScenario[] = [];
  const promptScenarios: PromptScenario[] = [];

  // Parse tool scenarios
  if (parsed.scenarios && Array.isArray(parsed.scenarios)) {
    for (let i = 0; i < parsed.scenarios.length; i++) {
      const raw = parsed.scenarios[i];
      try {
        const scenario = validateToolScenario(raw, i, path, globalTags);
        toolScenarios.push(scenario);
      } catch (error) {
        throw new Error(`Error in scenario ${i + 1} of ${path}: ${(error as Error).message}`);
      }
    }
  }

  // Parse prompt scenarios
  if (parsed.prompts && Array.isArray(parsed.prompts)) {
    for (let i = 0; i < parsed.prompts.length; i++) {
      const raw = parsed.prompts[i];
      try {
        const scenario = validatePromptScenario(raw, i, path, globalTags);
        promptScenarios.push(scenario);
      } catch (error) {
        throw new Error(`Error in prompt scenario ${i + 1} of ${path}: ${(error as Error).message}`);
      }
    }
  }

  return {
    source: path,
    toolScenarios,
    promptScenarios,
    description: parsed.description,
    version: parsed.version,
  };
}

/**
 * Try to load scenarios from the default file in a directory.
 * Returns null if file doesn't exist.
 */
export function tryLoadDefaultScenarios(directory: string): LoadedScenarios | null {
  const path = `${directory}/${DEFAULT_SCENARIOS_FILE}`;
  if (!existsSync(path)) {
    return null;
  }
  return loadScenariosFromFile(path);
}

/**
 * Validate and normalize a tool test scenario.
 */
function validateToolScenario(
  data: TestScenarioYAML,
  _index: number,
  _source: string,
  globalTags: string[]
): TestScenario {
  // Required: tool
  if (!data.tool || typeof data.tool !== 'string') {
    throw new Error('missing required field: tool');
  }

  // Optional: category (default: happy_path)
  let category: QuestionCategory = 'happy_path';
  if (data.category) {
    if (!VALID_CATEGORIES.includes(data.category as QuestionCategory)) {
      throw new Error(
        `invalid category "${data.category}". Valid categories: ${VALID_CATEGORIES.join(', ')}`
      );
    }
    category = data.category as QuestionCategory;
  }

  // Optional: args (default: empty)
  const args = data.args ?? {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('args must be an object');
  }

  // Optional: assertions
  const assertions = data.assertions?.map((a, i) => validateAssertion(a, i));

  // Merge global tags with scenario tags
  const tags = [...globalTags, ...(data.tags ?? [])];

  return {
    tool: data.tool,
    description: data.description ?? `Test ${data.tool} with ${category} scenario`,
    category,
    args,
    assertions,
    skip: data.skip ?? false,
    tags: tags.length > 0 ? tags : undefined,
  };
}

/**
 * Validate and normalize a prompt test scenario.
 */
function validatePromptScenario(
  data: PromptScenarioYAML,
  _index: number,
  _source: string,
  globalTags: string[]
): PromptScenario {
  // Required: prompt
  if (!data.prompt || typeof data.prompt !== 'string') {
    throw new Error('missing required field: prompt');
  }

  // Optional: args (default: empty)
  const args = data.args ?? {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('args must be an object');
  }

  // Validate that all arg values are strings
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string') {
      throw new Error(`prompt arg "${key}" must be a string, got ${typeof value}`);
    }
  }

  // Optional: assertions
  const assertions = data.assertions?.map((a, i) => validateAssertion(a, i));

  // Merge global tags with scenario tags
  const tags = [...globalTags, ...(data.tags ?? [])];

  return {
    prompt: data.prompt,
    description: data.description ?? `Test prompt ${data.prompt}`,
    args,
    assertions,
    skip: data.skip ?? false,
    tags: tags.length > 0 ? tags : undefined,
  };
}

/**
 * Validate and normalize an assertion.
 */
function validateAssertion(data: ScenarioAssertionYAML, index: number): ScenarioAssertion {
  // Required: path
  if (!data.path || typeof data.path !== 'string') {
    throw new Error(`assertion ${index + 1}: missing required field "path"`);
  }

  // Required: condition
  if (!data.condition || typeof data.condition !== 'string') {
    throw new Error(`assertion ${index + 1}: missing required field "condition"`);
  }

  if (!VALID_CONDITIONS.includes(data.condition as AssertionCondition)) {
    throw new Error(
      `assertion ${index + 1}: invalid condition "${data.condition}". ` +
        `Valid conditions: ${VALID_CONDITIONS.join(', ')}`
    );
  }

  // Validate that 'value' is provided for conditions that require it
  const conditionsRequiringValue: AssertionCondition[] = ['equals', 'contains', 'type'];
  if (conditionsRequiringValue.includes(data.condition as AssertionCondition) && data.value === undefined) {
    throw new Error(
      `assertion ${index + 1}: condition "${data.condition}" requires a "value" field`
    );
  }

  return {
    path: data.path,
    condition: data.condition as AssertionCondition,
    value: data.value,
    message: data.message,
  };
}

/**
 * Generate a sample YAML template for test scenarios.
 */
export function generateSampleScenariosYaml(): string {
  return `# Bellwether Test Scenarios
# Save as: bellwether-tests.yaml in your project root
# Docs: https://docs.bellwether.sh/guides/custom-scenarios

version: "1"
description: Custom test scenarios for my MCP server

# Global tags applied to all scenarios (optional)
tags:
  - custom

# Tool test scenarios
scenarios:
  # Happy path test
  - tool: read_file
    description: Read a valid file
    category: happy_path
    args:
      path: "/tmp/test.txt"
    assertions:
      - path: content
        condition: exists
        message: File content should be returned

  # Edge case test
  - tool: read_file
    description: Read file with special characters in name
    category: edge_case
    args:
      path: "/tmp/file with spaces.txt"
    assertions:
      - path: content
        condition: exists

  # Error handling test
  - tool: read_file
    description: Handle missing file gracefully
    category: error_handling
    args:
      path: "/nonexistent/file.txt"
    assertions:
      - path: error
        condition: exists
        message: Should return error for missing file

  # Security test
  - tool: read_file
    description: Reject path traversal attempt
    category: security
    args:
      path: "../../etc/passwd"
    tags:
      - security
      - critical

  # Skip a test (won't run)
  - tool: dangerous_operation
    description: Skipped test
    skip: true
    args:
      action: delete_all

# Prompt test scenarios
prompts:
  - prompt: summarize
    description: Test summarize prompt with sample text
    args:
      text: "This is a long document that needs to be summarized..."
    assertions:
      - path: messages
        condition: exists
      - path: messages[0].content
        condition: truthy

  - prompt: translate
    description: Test translation prompt
    args:
      text: "Hello, world!"
      language: "Spanish"
    assertions:
      - path: messages[0].content.text
        condition: contains
        value: "Hola"

# Assertion conditions:
# - exists: Path exists (value is not undefined)
# - equals: Value equals expected
# - contains: String/array contains value
# - truthy: Value is truthy
# - type: Value is of type (string, number, boolean, object, array)
# - not_error: Response is not an error

# Categories:
# - happy_path: Normal usage
# - edge_case: Boundary conditions
# - error_handling: Invalid inputs
# - boundary: Limits and extremes
# - security: Security-related tests
`;
}
