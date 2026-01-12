/**
 * Workflow loader - loads workflows from YAML files.
 */

import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import type { Workflow, WorkflowStep, WorkflowYAML, Assertion } from './types.js';

/**
 * Load workflows from a YAML file.
 */
export function loadWorkflowsFromFile(path: string): Workflow[] {
  if (!existsSync(path)) {
    throw new Error(`Workflow file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');
  const parsed = parseYaml(content);

  // Handle single workflow or array of workflows
  const rawWorkflows: WorkflowYAML[] = Array.isArray(parsed) ? parsed : [parsed];

  return rawWorkflows.map((raw, index) => validateAndNormalizeWorkflow(raw, path, index));
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
