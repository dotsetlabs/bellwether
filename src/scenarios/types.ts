/**
 * Types for custom YAML-defined test scenarios.
 *
 * These types define the schema for user-defined test cases
 * that can be provided via bellwether-tests.yaml files.
 */

import type { QuestionCategory } from '../interview/question-category.js';

/**
 * Valid assertion conditions for scenario expectations.
 */
export type AssertionCondition = 'exists' | 'equals' | 'contains' | 'truthy' | 'type' | 'not_error';

/**
 * An assertion/expectation for a test scenario.
 */
export interface ScenarioAssertion {
  /** JSONPath to the value to check */
  path: string;
  /** Condition to evaluate */
  condition: AssertionCondition;
  /** Expected value (for equals, contains, type) */
  value?: unknown;
  /** Custom error message on failure */
  message?: string;
}

/**
 * A single test scenario for a tool.
 */
export interface TestScenario {
  /** Tool to test */
  tool: string;
  /** Description of what this test verifies */
  description: string;
  /** Category of test (default: happy_path) */
  category: QuestionCategory;
  /** Arguments to pass to the tool */
  args: Record<string, unknown>;
  /** Assertions to verify after execution */
  assertions?: ScenarioAssertion[];
  /** Whether this scenario should be skipped */
  skip?: boolean;
  /** Tags for filtering scenarios */
  tags?: string[];
}

/**
 * A single test scenario for a prompt.
 */
export interface PromptScenario {
  /** Prompt to test */
  prompt: string;
  /** Description of what this test verifies */
  description: string;
  /** Arguments to pass to the prompt */
  args: Record<string, string>;
  /** Assertions to verify on the rendered output */
  assertions?: ScenarioAssertion[];
  /** Whether this scenario should be skipped */
  skip?: boolean;
  /** Tags for filtering scenarios */
  tags?: string[];
}

/**
 * YAML file structure for test scenarios.
 */
export interface TestScenariosYAML {
  /** Version of the schema (for future compatibility) */
  version?: string;
  /** Description of this test file */
  description?: string;
  /** Tool test scenarios */
  scenarios?: TestScenarioYAML[];
  /** Prompt test scenarios */
  prompts?: PromptScenarioYAML[];
  /** Global tags applied to all scenarios */
  tags?: string[];
}

/**
 * YAML representation of a test scenario (looser types for parsing).
 */
export interface TestScenarioYAML {
  tool: string;
  description?: string;
  category?: string;
  args?: Record<string, unknown>;
  assertions?: ScenarioAssertionYAML[];
  skip?: boolean;
  tags?: string[];
}

/**
 * YAML representation of a prompt scenario.
 */
export interface PromptScenarioYAML {
  prompt: string;
  description?: string;
  args?: Record<string, string>;
  assertions?: ScenarioAssertionYAML[];
  skip?: boolean;
  tags?: string[];
}

/**
 * YAML representation of an assertion.
 */
export interface ScenarioAssertionYAML {
  path?: string;
  condition?: string;
  value?: unknown;
  message?: string;
}

/**
 * Loaded test scenarios file.
 */
export interface LoadedScenarios {
  /** Source file path */
  source: string;
  /** Tool test scenarios */
  toolScenarios: TestScenario[];
  /** Prompt test scenarios */
  promptScenarios: PromptScenario[];
  /** File description */
  description?: string;
  /** Schema version */
  version?: string;
}

/**
 * Result of running a scenario assertion.
 */
export interface AssertionResult {
  /** The assertion that was checked */
  assertion: ScenarioAssertion;
  /** Whether the assertion passed */
  passed: boolean;
  /** Actual value found */
  actualValue?: unknown;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of running a single test scenario.
 */
export interface ScenarioResult {
  /** The scenario that was run */
  scenario: TestScenario | PromptScenario;
  /** Whether the scenario passed (all assertions passed and no error) */
  passed: boolean;
  /** Assertion results */
  assertionResults: AssertionResult[];
  /** Error if execution failed */
  error?: string;
  /** Response from the tool/prompt */
  response?: unknown;
  /** Execution duration in ms */
  durationMs: number;
}
