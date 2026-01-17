/**
 * Workflow loader - loads workflows from YAML files.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseAllDocuments } from 'yaml';
import type { Workflow, WorkflowStep, WorkflowYAML, Assertion } from './types.js';
import { parseYamlSecure, YAML_SECURITY_LIMITS } from '../utils/yaml-parser.js';

/** Default file name for workflow definitions */
export const DEFAULT_WORKFLOWS_FILE = 'bellwether-workflows.yaml';

/**
 * Load workflows from a YAML file.
 * Supports both single-document and multi-document YAML (separated by ---).
 */
export function loadWorkflowsFromFile(path: string): Workflow[] {
  if (!existsSync(path)) {
    throw new Error(`Workflow file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');

  // Check if content has multiple YAML documents (separated by ---)
  if (content.includes('\n---')) {
    // Parse as multi-document YAML
    const documents = parseAllDocuments(content);

    const rawWorkflows: WorkflowYAML[] = [];
    for (const doc of documents) {
      if (doc.errors && doc.errors.length > 0) {
        throw new Error(`YAML parse error: ${doc.errors[0].message}`);
      }
      const parsed = doc.toJS({
        maxAliasCount: YAML_SECURITY_LIMITS.MAX_ALIAS_COUNT,
      });
      if (parsed) {
        rawWorkflows.push(parsed);
      }
    }

    return rawWorkflows.map((raw, index) => validateAndNormalizeWorkflow(raw, path, index));
  }

  // Single document - use secure parser
  const parsed = parseYamlSecure(content);

  // Handle single workflow or array of workflows
  const rawWorkflows: WorkflowYAML[] = Array.isArray(parsed) ? parsed : [parsed];

  return rawWorkflows.map((raw, index) => validateAndNormalizeWorkflow(raw, path, index));
}

/**
 * Try to load workflows from the default file in a directory.
 * Returns null if file doesn't exist.
 *
 * This enables auto-discovery of workflow files similar to how
 * scenarios are auto-loaded from bellwether-tests.yaml.
 */
export function tryLoadDefaultWorkflows(directory: string): Workflow[] | null {
  const path = join(directory, DEFAULT_WORKFLOWS_FILE);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return loadWorkflowsFromFile(path);
  } catch {
    // If the file exists but is invalid, return null rather than throwing
    // This allows the interview to proceed without workflows
    return null;
  }
}

/**
 * Validate and normalize a workflow definition.
 */
function validateAndNormalizeWorkflow(
  data: Partial<WorkflowYAML>,
  source: string,
  index: number
): Workflow {
  // Required fields
  if (!data.id || typeof data.id !== 'string') {
    throw new Error(`Workflow ${index + 1} from ${source} missing required field: id`);
  }
  if (!data.name || typeof data.name !== 'string') {
    throw new Error(`Workflow ${index + 1} from ${source} missing required field: name`);
  }
  if (!data.steps || !Array.isArray(data.steps) || data.steps.length === 0) {
    throw new Error(`Workflow ${index + 1} from ${source} missing required field: steps (must be non-empty array)`);
  }

  // Validate each step
  const steps: WorkflowStep[] = data.steps.map((step, stepIndex) => {
    if (!step.tool || typeof step.tool !== 'string') {
      throw new Error(`Step ${stepIndex + 1} in workflow "${data.id}" missing required field: tool`);
    }

    // Validate argMapping format
    if (step.argMapping) {
      for (const [param, expr] of Object.entries(step.argMapping)) {
        if (typeof expr !== 'string' || !expr.startsWith('$steps[')) {
          throw new Error(
            `Invalid argMapping for "${param}" in step ${stepIndex + 1} of workflow "${data.id}". ` +
            `Expected format: $steps[N].result.path.to.value`
          );
        }
      }
    }

    // Validate assertions
    const assertions: Assertion[] | undefined = step.assertions?.map((a, aIndex) => {
      if (!a.path || typeof a.path !== 'string') {
        throw new Error(
          `Assertion ${aIndex + 1} in step ${stepIndex + 1} of workflow "${data.id}" missing required field: path`
        );
      }

      const validConditions = ['exists', 'equals', 'contains', 'truthy', 'type'];
      if (!a.condition || !validConditions.includes(a.condition)) {
        throw new Error(
          `Assertion ${aIndex + 1} in step ${stepIndex + 1} of workflow "${data.id}" has invalid condition. ` +
          `Valid conditions: ${validConditions.join(', ')}`
        );
      }

      return {
        path: a.path,
        condition: a.condition as Assertion['condition'],
        value: a.value,
        message: a.message,
      };
    });

    return {
      tool: step.tool,
      description: step.description ?? `Call ${step.tool}`,
      args: step.args,
      argMapping: step.argMapping,
      optional: step.optional ?? false,
      assertions,
    };
  });

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? `Workflow: ${data.name}`,
    expectedOutcome: data.expectedOutcome ?? 'Workflow completes successfully',
    steps,
    discovered: false,
  };
}

/**
 * Generate a sample workflow YAML template.
 */
export function generateSampleWorkflowYaml(): string {
  return `# Workflow Definition
# Save this file and reference it with: --workflows ./my-workflows.yaml

# Single workflow
id: search_and_get
name: Search and Retrieve
description: Search for items and retrieve details

expectedOutcome: Successfully find and retrieve item details

steps:
  - tool: search_items
    description: Search for items matching criteria
    args:
      query: "example search"
      limit: 10
    assertions:
      - path: items
        condition: exists
        message: Search should return items array

  - tool: get_item_details
    description: Get details for first search result
    argMapping:
      id: "$steps[0].result.items[0].id"
    assertions:
      - path: name
        condition: exists
      - path: status
        condition: equals
        value: "active"

  - tool: get_item_history
    description: Optional - get history if available
    optional: true
    argMapping:
      itemId: "$steps[1].result.id"

---
# You can define multiple workflows in one file using YAML document separators

id: create_and_verify
name: Create and Verify
description: Create a new item and verify it exists

steps:
  - tool: create_item
    description: Create a new item
    args:
      name: "Test Item"
      type: "example"

  - tool: get_item_details
    description: Verify the item was created
    argMapping:
      id: "$steps[0].result.id"
    assertions:
      - path: name
        condition: equals
        value: "Test Item"
`;
}
