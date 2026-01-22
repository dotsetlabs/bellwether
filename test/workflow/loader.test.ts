/**
 * Tests for workflow YAML loader.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import {
  loadWorkflowsFromFile,
  tryLoadDefaultWorkflows,
  generateSampleWorkflowYaml,
  DEFAULT_WORKFLOWS_FILE,
} from '../../src/workflow/loader.js';
import type { Workflow } from '../../src/workflow/types.js';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe('loadWorkflowsFromFile', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
  });

  describe('file existence', () => {
    it('should throw when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => loadWorkflowsFromFile('/nonexistent/workflows.yaml'))
        .toThrow('Workflow file not found: /nonexistent/workflows.yaml');
    });
  });

  describe('single workflow parsing', () => {
    it('should parse a single workflow', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test-workflow
name: Test Workflow
description: A test workflow
expectedOutcome: Success
steps:
  - tool: get_weather
    description: Get weather
    args:
      location: NYC
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');

      expect(workflows).toHaveLength(1);
      expect(workflows[0].id).toBe('test-workflow');
      expect(workflows[0].name).toBe('Test Workflow');
      expect(workflows[0].description).toBe('A test workflow');
      expect(workflows[0].steps).toHaveLength(1);
    });

    it('should parse workflow with minimal fields', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: minimal
name: Minimal Workflow
steps:
  - tool: test_tool
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');

      expect(workflows).toHaveLength(1);
      expect(workflows[0].id).toBe('minimal');
      expect(workflows[0].description).toContain('Minimal Workflow');
      expect(workflows[0].expectedOutcome).toContain('successfully');
    });

    it('should set discovered to false for loaded workflows', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - tool: test
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');

      expect(workflows[0].discovered).toBe(false);
    });
  });

  describe('multi-document YAML parsing', () => {
    it('should parse multiple workflows from multi-document YAML', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: workflow-1
name: First Workflow
steps:
  - tool: tool_a
---
id: workflow-2
name: Second Workflow
steps:
  - tool: tool_b
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');

      expect(workflows).toHaveLength(2);
      expect(workflows[0].id).toBe('workflow-1');
      expect(workflows[1].id).toBe('workflow-2');
    });

    it('should handle empty documents in multi-document YAML', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: workflow-1
name: First
steps:
  - tool: tool_a
---
---
id: workflow-2
name: Second
steps:
  - tool: tool_b
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');

      expect(workflows).toHaveLength(2);
    });
  });

  describe('array format parsing', () => {
    it('should parse array of workflows', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
- id: array-workflow-1
  name: Array Workflow 1
  steps:
    - tool: tool_a
- id: array-workflow-2
  name: Array Workflow 2
  steps:
    - tool: tool_b
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');

      expect(workflows).toHaveLength(2);
      expect(workflows[0].id).toBe('array-workflow-1');
      expect(workflows[1].id).toBe('array-workflow-2');
    });
  });

  describe('step parsing', () => {
    it('should parse step with all fields', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - tool: get_weather
    description: Get weather for location
    args:
      location: NYC
      units: celsius
    optional: true
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');
      const step = workflows[0].steps[0];

      expect(step.tool).toBe('get_weather');
      expect(step.description).toBe('Get weather for location');
      expect(step.args).toEqual({ location: 'NYC', units: 'celsius' });
      expect(step.optional).toBe(true);
    });

    it('should set default description for steps', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - tool: my_tool
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');

      expect(workflows[0].steps[0].description).toBe('Call my_tool');
    });

    it('should default optional to false', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - tool: my_tool
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');

      expect(workflows[0].steps[0].optional).toBe(false);
    });
  });

  describe('argMapping parsing', () => {
    it('should parse valid argMapping', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - tool: tool_a
    args:
      query: test
  - tool: tool_b
    argMapping:
      id: "$steps[0].result.id"
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');
      const step = workflows[0].steps[1];

      expect(step.argMapping).toEqual({ id: '$steps[0].result.id' });
    });

    it('should reject invalid argMapping format', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - tool: tool_a
  - tool: tool_b
    argMapping:
      id: "invalid-format"
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow('Invalid argMapping');
    });
  });

  describe('assertion parsing', () => {
    it('should parse valid assertions', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - tool: test_tool
    assertions:
      - path: result.id
        condition: exists
        message: ID should exist
      - path: result.status
        condition: equals
        value: active
`);

      const workflows = loadWorkflowsFromFile('/test/workflows.yaml');
      const assertions = workflows[0].steps[0].assertions;

      expect(assertions).toHaveLength(2);
      expect(assertions![0].path).toBe('result.id');
      expect(assertions![0].condition).toBe('exists');
      expect(assertions![0].message).toBe('ID should exist');
      expect(assertions![1].value).toBe('active');
    });

    it('should accept all valid assertion conditions', () => {
      for (const condition of ['exists', 'equals', 'contains', 'truthy', 'type']) {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - tool: test
    assertions:
      - path: result
        condition: ${condition}
`);

        const workflows = loadWorkflowsFromFile('/test/workflows.yaml');
        expect(workflows[0].steps[0].assertions![0].condition).toBe(condition);
      }
    });

    it('should reject invalid assertion condition', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - tool: test
    assertions:
      - path: result
        condition: invalid_condition
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow('invalid condition');
    });

    it('should reject assertion without path', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - tool: test
    assertions:
      - condition: exists
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow('missing required field: path');
    });
  });

  describe('validation errors', () => {
    it('should throw when workflow is missing id', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
name: No ID Workflow
steps:
  - tool: test
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow('missing required field: id');
    });

    it('should throw when workflow is missing name', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: no-name
steps:
  - tool: test
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow('missing required field: name');
    });

    it('should throw when workflow has no steps', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: no-steps
name: No Steps
steps: []
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow('must be non-empty array');
    });

    it('should throw when workflow is missing steps', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: missing-steps
name: Missing Steps
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow('missing required field: steps');
    });

    it('should throw when step is missing tool', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: test
name: Test
steps:
  - description: No tool here
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow('missing required field: tool');
    });

    it('should include workflow index in error message', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: valid
name: Valid
steps:
  - tool: test
---
name: Invalid
steps:
  - tool: test
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow('Workflow 2');
    });

    it('should include workflow id in step error message', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: my-workflow
name: My Workflow
steps:
  - description: Missing tool
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow('"my-workflow"');
    });
  });

  describe('YAML parse errors', () => {
    it('should throw on invalid YAML in multi-document', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
id: valid
name: Valid
steps:
  - tool: test
---
invalid: yaml: here: [
`);

      expect(() => loadWorkflowsFromFile('/test/workflows.yaml'))
        .toThrow();
    });
  });
});

describe('tryLoadDefaultWorkflows', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
  });

  it('should return null when default file does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const result = tryLoadDefaultWorkflows('/some/directory');

    expect(result).toBeNull();
  });

  it('should load workflows from default file', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
id: default-workflow
name: Default
steps:
  - tool: test
`);

    const result = tryLoadDefaultWorkflows('/some/directory');

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe('default-workflow');
  });

  it('should return null on parse error (instead of throwing)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('invalid: yaml: [');

    const result = tryLoadDefaultWorkflows('/some/directory');

    expect(result).toBeNull();
  });

  it('should return null on validation error (instead of throwing)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`
invalid: workflow
missing: required_fields
`);

    const result = tryLoadDefaultWorkflows('/some/directory');

    expect(result).toBeNull();
  });
});

describe('DEFAULT_WORKFLOWS_FILE', () => {
  it('should be defined', () => {
    expect(DEFAULT_WORKFLOWS_FILE).toBeDefined();
  });

  it('should be a yaml file', () => {
    expect(DEFAULT_WORKFLOWS_FILE).toMatch(/\.ya?ml$/);
  });
});

describe('generateSampleWorkflowYaml', () => {
  it('should generate valid YAML', () => {
    const sample = generateSampleWorkflowYaml();

    expect(sample).toContain('id:');
    expect(sample).toContain('name:');
    expect(sample).toContain('steps:');
  });

  it('should include example workflows', () => {
    const sample = generateSampleWorkflowYaml();

    // Should have at least 2 example workflows
    expect(sample).toContain('---'); // Multi-document separator
    expect(sample).toContain('search_and_get');
    expect(sample).toContain('create_and_verify');
  });

  it('should include argMapping examples', () => {
    const sample = generateSampleWorkflowYaml();

    expect(sample).toContain('argMapping:');
    expect(sample).toContain('$steps[');
  });

  it('should include assertion examples', () => {
    const sample = generateSampleWorkflowYaml();

    expect(sample).toContain('assertions:');
    expect(sample).toContain('condition:');
    expect(sample).toContain('exists');
    expect(sample).toContain('equals');
  });

  it('should include optional step example', () => {
    const sample = generateSampleWorkflowYaml();

    expect(sample).toContain('optional: true');
  });

  it('should include helpful comments', () => {
    const sample = generateSampleWorkflowYaml();

    expect(sample).toContain('# Workflow Definition');
    expect(sample).toContain('--workflows');
  });

  it('should be parseable as YAML', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(generateSampleWorkflowYaml());

    // Should not throw
    const workflows = loadWorkflowsFromFile('/test/sample.yaml');

    expect(workflows.length).toBeGreaterThan(0);
  });
});

describe('workflow type correctness', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
  });

  it('should produce workflows matching the Workflow type', () => {
    mockReadFileSync.mockReturnValue(`
id: typed-workflow
name: Typed Workflow
description: A workflow with all fields
expectedOutcome: Everything works
steps:
  - tool: step_tool
    description: Step description
    args:
      param: value
    argMapping:
      other: "$steps[0].result.id"
    optional: true
    assertions:
      - path: result
        condition: exists
        message: Should exist
`);

    const workflows = loadWorkflowsFromFile('/test/workflows.yaml');
    const workflow: Workflow = workflows[0];

    // TypeScript should accept all these accesses
    expect(workflow.id).toBe('typed-workflow');
    expect(workflow.name).toBe('Typed Workflow');
    expect(workflow.description).toBe('A workflow with all fields');
    expect(workflow.expectedOutcome).toBe('Everything works');
    expect(workflow.discovered).toBe(false);
    expect(workflow.steps[0].tool).toBe('step_tool');
    expect(workflow.steps[0].description).toBe('Step description');
    expect(workflow.steps[0].args).toEqual({ param: 'value' });
    expect(workflow.steps[0].argMapping).toEqual({ other: '$steps[0].result.id' });
    expect(workflow.steps[0].optional).toBe(true);
    expect(workflow.steps[0].assertions![0].path).toBe('result');
    expect(workflow.steps[0].assertions![0].condition).toBe('exists');
    expect(workflow.steps[0].assertions![0].message).toBe('Should exist');
  });
});
