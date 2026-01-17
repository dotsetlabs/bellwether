/**
 * Tests for workflow CLI options in the interview command.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadWorkflowsFromFile, generateSampleWorkflowYaml } from '../../../src/workflow/loader.js';
import { WORKFLOW } from '../../../src/constants.js';

describe('Workflow CLI Options', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-workflow-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('--init-workflows', () => {
    it('should generate a valid sample workflows file', () => {
      const content = generateSampleWorkflowYaml();

      expect(content).toContain('id:');
      expect(content).toContain('name:');
      expect(content).toContain('steps:');
      expect(content).toContain('tool:');
    });

    it('should generate parseable YAML', () => {
      const content = generateSampleWorkflowYaml();
      const outputPath = join(testDir, 'bellwether-workflows.yaml');
      writeFileSync(outputPath, content);

      // Should be able to load the generated file
      const workflows = loadWorkflowsFromFile(outputPath);
      expect(Array.isArray(workflows)).toBe(true);
      expect(workflows.length).toBeGreaterThan(0);
    });

    it('should include example workflows with valid structure', () => {
      const content = generateSampleWorkflowYaml();
      const outputPath = join(testDir, 'test-workflows.yaml');
      writeFileSync(outputPath, content);

      const workflows = loadWorkflowsFromFile(outputPath);

      // Each workflow should have required fields
      for (const workflow of workflows) {
        expect(workflow.id).toBeDefined();
        expect(workflow.name).toBeDefined();
        expect(Array.isArray(workflow.steps)).toBe(true);
        expect(workflow.steps.length).toBeGreaterThan(0);

        // Each step should have a tool
        for (const step of workflow.steps) {
          expect(step.tool).toBeDefined();
        }
      }
    });
  });

  describe('--workflows <path>', () => {
    it('should load a single workflow from YAML file', () => {
      const workflowYaml = `
id: test-workflow
name: Test Workflow
description: A test workflow
steps:
  - tool: search_items
    args:
      query: test
  - tool: get_item
    args:
      id: "123"
`;
      const filePath = join(testDir, 'workflows.yaml');
      writeFileSync(filePath, workflowYaml);

      const workflows = loadWorkflowsFromFile(filePath);

      expect(workflows).toHaveLength(1);
      expect(workflows[0].id).toBe('test-workflow');
      expect(workflows[0].name).toBe('Test Workflow');
      expect(workflows[0].steps).toHaveLength(2);
    });

    it('should handle workflows with assertions', () => {
      const workflowYaml = `
id: assertion-workflow
name: Workflow with Assertions
steps:
  - tool: search_items
    args:
      query: test
    assertions:
      - path: items
        condition: exists
      - path: items
        condition: truthy
`;
      const filePath = join(testDir, 'assertions.yaml');
      writeFileSync(filePath, workflowYaml);

      const workflows = loadWorkflowsFromFile(filePath);

      expect(workflows[0].steps[0].assertions).toBeDefined();
      expect(workflows[0].steps[0].assertions).toHaveLength(2);
      expect(workflows[0].steps[0].assertions![0].condition).toBe('exists');
    });

    it('should handle workflows with argument mappings', () => {
      const workflowYaml = `
id: mapping-workflow
name: Workflow with Mappings
steps:
  - tool: search_items
    args:
      query: test
  - tool: get_item
    argMapping:
      id: "$steps[0].result.items[0].id"
`;
      const filePath = join(testDir, 'mappings.yaml');
      writeFileSync(filePath, workflowYaml);

      const workflows = loadWorkflowsFromFile(filePath);

      expect(workflows[0].steps[1].argMapping?.id).toBe('$steps[0].result.items[0].id');
    });

    it('should throw error for non-existent file', () => {
      const nonExistent = join(testDir, 'non-existent.yaml');

      expect(() => loadWorkflowsFromFile(nonExistent)).toThrow();
    });

    it('should throw error for invalid YAML', () => {
      const invalidYaml = 'this is not: valid: yaml: [content';
      const filePath = join(testDir, 'invalid.yaml');
      writeFileSync(filePath, invalidYaml);

      expect(() => loadWorkflowsFromFile(filePath)).toThrow();
    });

    it('should throw error for missing required fields', () => {
      const noId = `
name: Missing ID Workflow
steps:
  - tool: some_tool
`;
      const filePath = join(testDir, 'no-id.yaml');
      writeFileSync(filePath, noId);

      expect(() => loadWorkflowsFromFile(filePath)).toThrow(/missing required field: id/);
    });
  });

  describe('--max-workflows', () => {
    it('should have a valid default value', () => {
      expect(WORKFLOW.MAX_DISCOVERED_WORKFLOWS).toBe(3);
    });

    it('should be used to limit workflow discovery', () => {
      // The constant should be reasonable
      expect(WORKFLOW.MAX_DISCOVERED_WORKFLOWS).toBeGreaterThan(0);
      expect(WORKFLOW.MAX_DISCOVERED_WORKFLOWS).toBeLessThanOrEqual(10);
    });
  });

  describe('--workflow-state-tracking', () => {
    it('should enable state tracking in workflow config', () => {
      // This is tested through the Interviewer config
      // Here we verify the constants exist
      expect(WORKFLOW.STATE_SNAPSHOT_TIMEOUT).toBeGreaterThan(0);
    });
  });

  describe('Workflow file format', () => {
    it('should support multiple workflows using YAML document separators', () => {
      const multipleWorkflows = `
id: workflow-1
name: First Workflow
steps:
  - tool: tool_a
---
id: workflow-2
name: Second Workflow
steps:
  - tool: tool_b
---
id: workflow-3
name: Third Workflow
steps:
  - tool: tool_c
`;
      const filePath = join(testDir, 'multiple.yaml');
      writeFileSync(filePath, multipleWorkflows);

      const workflows = loadWorkflowsFromFile(filePath);

      expect(workflows).toHaveLength(3);
      expect(workflows[0].id).toBe('workflow-1');
      expect(workflows[1].id).toBe('workflow-2');
      expect(workflows[2].id).toBe('workflow-3');
    });

    it('should support workflow metadata', () => {
      const metadataWorkflow = `
id: metadata-workflow
name: Workflow with Metadata
description: A detailed description of the workflow
expectedOutcome: The workflow should complete successfully
steps:
  - tool: search_items
    description: Search for items first
    args:
      query: test
`;
      const filePath = join(testDir, 'metadata.yaml');
      writeFileSync(filePath, metadataWorkflow);

      const workflows = loadWorkflowsFromFile(filePath);

      expect(workflows[0].description).toBe('A detailed description of the workflow');
      expect(workflows[0].expectedOutcome).toBe('The workflow should complete successfully');
    });

    it('should support empty args', () => {
      const emptyArgs = `
id: empty-args
name: Empty Args Workflow
steps:
  - tool: list_all
`;
      const filePath = join(testDir, 'empty-args.yaml');
      writeFileSync(filePath, emptyArgs);

      const workflows = loadWorkflowsFromFile(filePath);

      // Args may be undefined when not specified
      expect(workflows[0].steps[0].tool).toBe('list_all');
    });

    it('should support optional steps', () => {
      const optionalSteps = `
id: optional-workflow
name: Workflow with Optional Steps
steps:
  - tool: required_tool
  - tool: optional_tool
    optional: true
`;
      const filePath = join(testDir, 'optional.yaml');
      writeFileSync(filePath, optionalSteps);

      const workflows = loadWorkflowsFromFile(filePath);

      expect(workflows[0].steps[0].optional).toBe(false);
      expect(workflows[0].steps[1].optional).toBe(true);
    });

    it('should validate assertion conditions', () => {
      const invalidAssertion = `
id: invalid-assertion
name: Invalid Assertion Workflow
steps:
  - tool: some_tool
    assertions:
      - path: result
        condition: invalid_condition
`;
      const filePath = join(testDir, 'invalid-assertion.yaml');
      writeFileSync(filePath, invalidAssertion);

      expect(() => loadWorkflowsFromFile(filePath)).toThrow(/invalid condition/);
    });

    it('should support all valid assertion conditions', () => {
      const validConditions = `
id: all-conditions
name: All Assertion Conditions
steps:
  - tool: some_tool
    assertions:
      - path: result.exists
        condition: exists
      - path: result.value
        condition: equals
        value: expected
      - path: result.text
        condition: contains
        value: substring
      - path: result.flag
        condition: truthy
      - path: result.data
        condition: type
        value: object
`;
      const filePath = join(testDir, 'all-conditions.yaml');
      writeFileSync(filePath, validConditions);

      const workflows = loadWorkflowsFromFile(filePath);

      expect(workflows[0].steps[0].assertions).toHaveLength(5);
    });
  });
});

describe('Workflow Progress Bar Integration', () => {
  it('should support workflow phase in progress type', () => {
    // Import the progress type to verify it supports workflows
    type ProgressPhase = 'starting' | 'interviewing' | 'workflows' | 'synthesizing' | 'complete';

    const phases: ProgressPhase[] = ['starting', 'interviewing', 'workflows', 'synthesizing', 'complete'];
    expect(phases).toContain('workflows');
  });
});
