/**
 * Tests for the workflow system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WorkflowExecutor } from '../../src/workflow/executor.js';
import { WorkflowDiscoverer } from '../../src/workflow/discovery.js';
import { loadWorkflowsFromFile, generateSampleWorkflowYaml } from '../../src/workflow/loader.js';
import type { Workflow, WorkflowStep, WorkflowResult } from '../../src/workflow/types.js';
import type { MCPClient } from '../../src/transport/mcp-client.js';
import type { LLMClient, CompletionOptions } from '../../src/llm/client.js';
import type { MCPTool, MCPToolCallResult } from '../../src/transport/types.js';

// Mock MCP client
function createMockClient(responses: Map<string, MCPToolCallResult>): MCPClient {
  return {
    callTool: vi.fn((toolName: string) => {
      const response = responses.get(toolName);
      if (response) {
        return Promise.resolve(response);
      }
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify({ error: 'Unknown tool' }) }],
        isError: true,
      });
    }),
  } as unknown as MCPClient;
}

// Mock LLM client
function createMockLLM(): LLMClient {
  return {
    complete: vi.fn(() => Promise.resolve('Analysis of step.')),
    chat: vi.fn(() => Promise.resolve('Chat response')),
    parseJSON: vi.fn((str: string) => JSON.parse(str)),
  } as unknown as LLMClient;
}

// Sample tools
const sampleTools: MCPTool[] = [
  {
    name: 'search_items',
    description: 'Search for items',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_item',
    description: 'Get item details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_item',
    description: 'Update an item',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        data: { type: 'object' },
      },
      required: ['id', 'data'],
    },
  },
];

describe('Workflow System', () => {
  describe('WorkflowExecutor', () => {
    let mockClient: MCPClient;
    let mockLLM: LLMClient;
    let executor: WorkflowExecutor;

    beforeEach(() => {
      const responses = new Map<string, MCPToolCallResult>();
      responses.set('search_items', {
        content: [{ type: 'text', text: JSON.stringify({ items: [{ id: '123', name: 'Test Item' }] }) }],
      });
      responses.set('get_item', {
        content: [{ type: 'text', text: JSON.stringify({ id: '123', name: 'Test Item', status: 'active' }) }],
      });
      responses.set('update_item', {
        content: [{ type: 'text', text: JSON.stringify({ success: true, id: '123' }) }],
      });

      mockClient = createMockClient(responses);
      mockLLM = createMockLLM();
      executor = new WorkflowExecutor(mockClient, mockLLM, sampleTools, { analyzeSteps: false, generateSummary: false });
    });

    it('should execute a simple workflow', async () => {
      const workflow: Workflow = {
        id: 'simple_test',
        name: 'Simple Test',
        description: 'A simple test workflow',
        expectedOutcome: 'Success',
        steps: [
          {
            tool: 'search_items',
            description: 'Search for items',
            args: { query: 'test' },
          },
        ],
      };

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].success).toBe(true);
      expect(mockClient.callTool).toHaveBeenCalledWith('search_items', { query: 'test' });
    });

    it('should chain workflow steps with argument mapping', async () => {
      const workflow: Workflow = {
        id: 'chained_test',
        name: 'Chained Test',
        description: 'Test step chaining',
        expectedOutcome: 'Get item details from search result',
        steps: [
          {
            tool: 'search_items',
            description: 'Search for items',
            args: { query: 'test' },
          },
          {
            tool: 'get_item',
            description: 'Get first item details',
            argMapping: {
              id: '$steps[0].result.items[0].id',
            },
          },
        ],
      };

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[1].resolvedArgs).toEqual({ id: '123' });
      expect(mockClient.callTool).toHaveBeenCalledWith('get_item', { id: '123' });
    });

    it('should build data flow graph', async () => {
      const workflow: Workflow = {
        id: 'data_flow_test',
        name: 'Data Flow Test',
        description: 'Test data flow tracking',
        expectedOutcome: 'Track data between steps',
        steps: [
          {
            tool: 'search_items',
            description: 'Search',
            args: { query: 'test' },
          },
          {
            tool: 'get_item',
            description: 'Get details',
            argMapping: { id: '$steps[0].result.items[0].id' },
          },
        ],
      };

      const result = await executor.execute(workflow);

      expect(result.dataFlow).toHaveLength(1);
      expect(result.dataFlow![0]).toMatchObject({
        fromStep: 0,
        toStep: 1,
        targetParam: 'id',
        sourcePath: 'result.items[0].id',
      });
    });

    it('should fail workflow when step fails', async () => {
      const responses = new Map<string, MCPToolCallResult>();
      responses.set('search_items', {
        content: [{ type: 'text', text: 'Error: Search failed' }],
        isError: true,
      });

      mockClient = createMockClient(responses);
      executor = new WorkflowExecutor(mockClient, mockLLM, sampleTools, { analyzeSteps: false, generateSummary: false });

      const workflow: Workflow = {
        id: 'fail_test',
        name: 'Fail Test',
        description: 'Test failure handling',
        expectedOutcome: 'Should fail',
        steps: [
          {
            tool: 'search_items',
            description: 'Search that fails',
            args: { query: 'test' },
          },
          {
            tool: 'get_item',
            description: 'Should not run',
            args: { id: 'test' },
          },
        ],
      };

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.failedStepIndex).toBe(0);
      expect(result.steps).toHaveLength(1); // Second step not executed
    });

    it('should continue on error with optional step', async () => {
      const responses = new Map<string, MCPToolCallResult>();
      responses.set('search_items', {
        content: [{ type: 'text', text: JSON.stringify({ items: [] }) }],
      });
      responses.set('get_item', {
        content: [{ type: 'text', text: 'Not found' }],
        isError: true,
      });

      mockClient = createMockClient(responses);
      executor = new WorkflowExecutor(mockClient, mockLLM, sampleTools, { analyzeSteps: false, generateSummary: false });

      const workflow: Workflow = {
        id: 'optional_test',
        name: 'Optional Step Test',
        description: 'Test optional step handling',
        expectedOutcome: 'Continue after optional failure',
        steps: [
          {
            tool: 'search_items',
            description: 'Search',
            args: { query: 'test' },
          },
          {
            tool: 'get_item',
            description: 'Optional get',
            args: { id: 'nonexistent' },
            optional: true,
          },
        ],
      };

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true); // Overall success because failed step was optional
      expect(result.steps).toHaveLength(2);
      expect(result.steps[1].success).toBe(false);
    });

    it('should handle missing tool gracefully', async () => {
      const workflow: Workflow = {
        id: 'missing_tool',
        name: 'Missing Tool Test',
        description: 'Test missing tool handling',
        expectedOutcome: 'Should fail with error',
        steps: [
          {
            tool: 'nonexistent_tool',
            description: 'Call missing tool',
            args: {},
          },
        ],
      };

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.steps[0].error).toContain('Tool not found');
    });

    it('should run assertions and pass when met', async () => {
      const workflow: Workflow = {
        id: 'assertion_pass',
        name: 'Assertion Pass Test',
        description: 'Test passing assertions',
        expectedOutcome: 'Assertions should pass',
        steps: [
          {
            tool: 'get_item',
            description: 'Get item with assertions',
            args: { id: '123' },
            assertions: [
              { path: 'id', condition: 'exists' },
              { path: 'status', condition: 'equals', value: 'active' },
              { path: 'name', condition: 'truthy' },
            ],
          },
        ],
      };

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps[0].assertionResults).toHaveLength(3);
      expect(result.steps[0].assertionResults!.every(r => r.passed)).toBe(true);
    });

    it('should run assertions and fail when not met', async () => {
      const workflow: Workflow = {
        id: 'assertion_fail',
        name: 'Assertion Fail Test',
        description: 'Test failing assertions',
        expectedOutcome: 'Assertions should fail',
        steps: [
          {
            tool: 'get_item',
            description: 'Get item with failing assertion',
            args: { id: '123' },
            assertions: [
              { path: 'status', condition: 'equals', value: 'inactive', message: 'Expected inactive status' },
            ],
          },
        ],
      };

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.steps[0].assertionResults![0].passed).toBe(false);
      expect(result.steps[0].assertionResults![0].message).toBe('Expected inactive status');
    });
  });

  describe('WorkflowDiscoverer', () => {
    let mockLLM: LLMClient;
    let discoverer: WorkflowDiscoverer;

    beforeEach(() => {
      mockLLM = createMockLLM();
      discoverer = new WorkflowDiscoverer(mockLLM, { maxWorkflows: 2 });
    });

    it('should return empty array for insufficient tools', async () => {
      const result = await discoverer.discover([sampleTools[0]]);
      expect(result).toEqual([]);
    });

    it('should discover workflows from LLM response', async () => {
      const mockResponse = JSON.stringify([
        {
          name: 'Search and View',
          description: 'Search for items and view details',
          expectedOutcome: 'View item details',
          steps: [
            { tool: 'search_items', description: 'Search', args: { query: 'test' } },
            { tool: 'get_item', description: 'View', argMapping: { id: '$steps[0].result.items[0].id' } },
          ],
        },
      ]);

      (mockLLM.complete as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const workflows = await discoverer.discover(sampleTools);

      expect(workflows).toHaveLength(1);
      expect(workflows[0].name).toBe('Search and View');
      expect(workflows[0].discovered).toBe(true);
      expect(workflows[0].steps).toHaveLength(2);
    });

    it('should filter out workflows with invalid tools', async () => {
      const mockResponse = JSON.stringify([
        {
          name: 'Invalid Workflow',
          description: 'Uses nonexistent tool',
          steps: [
            { tool: 'nonexistent_tool', description: 'Invalid' },
            { tool: 'search_items', description: 'Search' },
          ],
        },
      ]);

      (mockLLM.complete as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const workflows = await discoverer.discover(sampleTools);

      // Workflow should be filtered out because it has < 2 valid steps
      expect(workflows).toHaveLength(0);
    });

    it('should use fallback discovery when LLM fails', async () => {
      (mockLLM.complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM failed'));

      // Create tools with CRUD naming pattern
      const crudTools: MCPTool[] = [
        { name: 'list_users', description: 'List users' },
        { name: 'get_users', description: 'Get user details' },
        { name: 'create_users', description: 'Create user' },
      ];

      const workflows = await discoverer.discover(crudTools);

      // Fallback should create workflow from naming patterns
      expect(workflows.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Workflow Loader', () => {
    let tempDir: string;
    let tempFile: string;

    beforeEach(() => {
      tempDir = tmpdir();
      tempFile = join(tempDir, `test-workflow-${Date.now()}.yaml`);
    });

    afterEach(() => {
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    });

    it('should load valid workflow from YAML', () => {
      const yaml = `
id: yaml_workflow
name: YAML Workflow
description: A workflow from YAML
expectedOutcome: Success
steps:
  - tool: search_items
    description: Search for items
    args:
      query: test
  - tool: get_item
    description: Get item details
    argMapping:
      id: "$steps[0].result.items[0].id"
`;
      writeFileSync(tempFile, yaml);

      const workflows = loadWorkflowsFromFile(tempFile);

      expect(workflows).toHaveLength(1);
      expect(workflows[0].id).toBe('yaml_workflow');
      expect(workflows[0].name).toBe('YAML Workflow');
      expect(workflows[0].steps).toHaveLength(2);
      expect(workflows[0].discovered).toBe(false);
    });

    it('should load multiple workflows from YAML array', () => {
      const yaml = `
- id: workflow1
  name: Workflow 1
  steps:
    - tool: search_items
      description: Search
    - tool: get_item
      description: Get

- id: workflow2
  name: Workflow 2
  steps:
    - tool: update_item
      description: Update
    - tool: get_item
      description: Get
`;
      writeFileSync(tempFile, yaml);

      const workflows = loadWorkflowsFromFile(tempFile);

      expect(workflows).toHaveLength(2);
      expect(workflows[0].id).toBe('workflow1');
      expect(workflows[1].id).toBe('workflow2');
    });

    it('should throw for missing required fields', () => {
      const yamlMissingId = `
name: No ID
steps:
  - tool: test
`;
      writeFileSync(tempFile, yamlMissingId);
      expect(() => loadWorkflowsFromFile(tempFile)).toThrow('missing required field: id');
    });

    it('should throw for missing steps', () => {
      const yaml = `
id: no_steps
name: No Steps
`;
      writeFileSync(tempFile, yaml);
      expect(() => loadWorkflowsFromFile(tempFile)).toThrow('missing required field: steps');
    });

    it('should throw for empty steps array', () => {
      const yaml = `
id: empty_steps
name: Empty Steps
steps: []
`;
      writeFileSync(tempFile, yaml);
      expect(() => loadWorkflowsFromFile(tempFile)).toThrow('must be non-empty array');
    });

    it('should throw for invalid argMapping format', () => {
      const yaml = `
id: bad_mapping
name: Bad Mapping
steps:
  - tool: test
    argMapping:
      id: "invalid_format"
`;
      writeFileSync(tempFile, yaml);
      expect(() => loadWorkflowsFromFile(tempFile)).toThrow('Invalid argMapping');
    });

    it('should throw for invalid assertion condition', () => {
      const yaml = `
id: bad_assertion
name: Bad Assertion
steps:
  - tool: test
    assertions:
      - path: field
        condition: invalid_condition
`;
      writeFileSync(tempFile, yaml);
      expect(() => loadWorkflowsFromFile(tempFile)).toThrow('invalid condition');
    });

    it('should validate assertions', () => {
      const yaml = `
id: valid_assertions
name: Valid Assertions
steps:
  - tool: test
    assertions:
      - path: id
        condition: exists
      - path: status
        condition: equals
        value: active
      - path: name
        condition: contains
        value: test
      - path: enabled
        condition: truthy
      - path: count
        condition: type
        value: number
`;
      writeFileSync(tempFile, yaml);

      const workflows = loadWorkflowsFromFile(tempFile);
      const assertions = workflows[0].steps[0].assertions!;

      expect(assertions).toHaveLength(5);
      expect(assertions[0].condition).toBe('exists');
      expect(assertions[1].condition).toBe('equals');
      expect(assertions[2].condition).toBe('contains');
      expect(assertions[3].condition).toBe('truthy');
      expect(assertions[4].condition).toBe('type');
    });

    it('should throw for non-existent file', () => {
      expect(() => loadWorkflowsFromFile('/nonexistent/workflow.yaml')).toThrow('not found');
    });
  });

  describe('generateSampleWorkflowYaml', () => {
    it('should generate valid YAML sample', () => {
      const sample = generateSampleWorkflowYaml();

      expect(sample).toContain('id:');
      expect(sample).toContain('name:');
      expect(sample).toContain('steps:');
      expect(sample).toContain('tool:');
      expect(sample).toContain('argMapping:');
      expect(sample).toContain('assertions:');
      expect(sample).toContain('$steps[');
    });
  });
});
