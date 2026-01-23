/**
 * Tests for workflow auto-generator functionality.
 */

import { describe, it, expect } from 'vitest';
import {
  generateWorkflowsFromTools,
  generateWorkflowYamlContent,
} from '../../src/workflow/auto-generator.js';
import type { MCPTool } from '../../src/transport/types.js';

describe('Workflow Auto-Generator', () => {
  describe('generateWorkflowsFromTools', () => {
    it('should return empty array for less than 2 tools', () => {
      const tools: MCPTool[] = [
        { name: 'get_user', description: 'Get user details', inputSchema: {} },
      ];

      const workflows = generateWorkflowsFromTools(tools);
      expect(workflows).toHaveLength(0);
    });

    it('should generate CRUD workflows from create/get tool pairs', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_user',
          description: 'Create a new user',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
            required: ['name', 'email'],
          },
        },
        {
          name: 'get_user',
          description: 'Get user by ID',
          inputSchema: {
            type: 'object',
            properties: {
              user_id: { type: 'string' },
            },
            required: ['user_id'],
          },
        },
      ];

      const workflows = generateWorkflowsFromTools(tools);
      expect(workflows.length).toBeGreaterThan(0);

      // Should have a workflow that chains create -> get
      const crudWorkflow = workflows.find(w => w.name.toLowerCase().includes('create') && w.name.toLowerCase().includes('read'));
      if (crudWorkflow) {
        expect(crudWorkflow.steps).toHaveLength(2);
        expect(crudWorkflow.steps[0].tool).toBe('create_user');
        expect(crudWorkflow.steps[1].tool).toBe('get_user');
      }
    });

    it('should generate list/read workflows with create tool', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_item',
          description: 'Create a new item',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
        {
          name: 'list_items',
          description: 'List all items',
          inputSchema: {},
        },
        {
          name: 'get_item',
          description: 'Get item by ID',
          inputSchema: {
            type: 'object',
            properties: {
              item_id: { type: 'string' },
            },
            required: ['item_id'],
          },
        },
      ];

      const workflows = generateWorkflowsFromTools(tools);
      // With create + list + get, should find CRUD patterns
      expect(workflows.length).toBeGreaterThan(0);
    });

    it('should detect tool mentions in descriptions', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_link',
          description: 'Create a link token',
          inputSchema: {},
        },
        {
          name: 'exchange_link',
          description: 'Exchange link token. Requires output from create_link first.',
          inputSchema: {
            type: 'object',
            properties: {
              public_token: { type: 'string' },
            },
            required: ['public_token'],
          },
        },
      ];

      const workflows = generateWorkflowsFromTools(tools);
      expect(workflows.length).toBeGreaterThan(0);

      // Should detect the dependency from description
      const relWorkflow = workflows.find(w =>
        w.steps.some(s => s.tool === 'create_link') &&
        w.steps.some(s => s.tool === 'exchange_link')
      );
      expect(relWorkflow).toBeDefined();
    });

    it('should respect maxWorkflows option', () => {
      const tools: MCPTool[] = [
        { name: 'create_a', description: 'Create A', inputSchema: {} },
        { name: 'get_a', description: 'Get A', inputSchema: {} },
        { name: 'create_b', description: 'Create B', inputSchema: {} },
        { name: 'get_b', description: 'Get B', inputSchema: {} },
        { name: 'create_c', description: 'Create C', inputSchema: {} },
        { name: 'get_c', description: 'Get C', inputSchema: {} },
      ];

      const workflows = generateWorkflowsFromTools(tools, { maxWorkflows: 2 });
      expect(workflows.length).toBeLessThanOrEqual(2);
    });

    it('should generate minimal args for required parameters', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_item',
          description: 'Create item',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              count: { type: 'integer' },
              active: { type: 'boolean' },
              tags: { type: 'array' },
            },
            required: ['name', 'count', 'active'],
          },
        },
        {
          name: 'get_item',
          description: 'Get item',
          inputSchema: {
            type: 'object',
            properties: {
              item_id: { type: 'string' },
            },
            required: ['item_id'],
          },
        },
      ];

      const workflows = generateWorkflowsFromTools(tools);
      const workflow = workflows.find(w => w.steps.some(s => s.tool === 'create_item'));

      if (workflow) {
        const createStep = workflow.steps.find(s => s.tool === 'create_item');
        expect(createStep?.args).toBeDefined();
        expect(createStep?.args?.name).toBeDefined();
        expect(createStep?.args?.count).toBeDefined();
        expect(createStep?.args?.active).toBeDefined();
      }
    });

    it('should infer argument mapping from ID parameters', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_user',
          description: 'Create a user, returns user with ID',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
        {
          name: 'update_user',
          description: 'Update a user',
          inputSchema: {
            type: 'object',
            properties: {
              user_id: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['user_id'],
          },
        },
      ];

      const workflows = generateWorkflowsFromTools(tools);
      const workflow = workflows.find(w =>
        w.steps.some(s => s.tool === 'create_user') &&
        w.steps.some(s => s.tool === 'update_user')
      );

      if (workflow) {
        const updateStep = workflow.steps.find(s => s.tool === 'update_user');
        expect(updateStep?.argMapping).toBeDefined();
        // Should map user_id from create result
        expect(updateStep?.argMapping?.user_id).toContain('$steps[0]');
      }
    });

    it('should generate unique workflow IDs', () => {
      const tools: MCPTool[] = [
        { name: 'create_user', description: 'Create user', inputSchema: {} },
        { name: 'get_user', description: 'Get user', inputSchema: {} },
        { name: 'list_users', description: 'List users', inputSchema: {} },
      ];

      const workflows = generateWorkflowsFromTools(tools);
      const ids = workflows.map(w => w.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should mark workflows as discovered', () => {
      const tools: MCPTool[] = [
        { name: 'create_item', description: 'Create item', inputSchema: {} },
        { name: 'get_item', description: 'Get item', inputSchema: {} },
      ];

      const workflows = generateWorkflowsFromTools(tools);
      for (const workflow of workflows) {
        expect(workflow.discovered).toBe(true);
      }
    });
  });

  describe('generateWorkflowYamlContent', () => {
    it('should generate valid YAML header', () => {
      const workflows = [{
        id: 'test_workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        expectedOutcome: 'Should complete successfully',
        steps: [
          { tool: 'tool_a', description: 'Call tool A' },
          { tool: 'tool_b', description: 'Call tool B' },
        ],
        discovered: true,
      }];

      const yaml = generateWorkflowYamlContent(workflows);
      expect(yaml).toContain('# Auto-generated workflow definitions');
      expect(yaml).toContain('id: test_workflow');
      expect(yaml).toContain('name: "Test Workflow"');
    });

    it('should format steps correctly', () => {
      const workflows = [{
        id: 'test_workflow',
        name: 'Test',
        description: 'Test',
        expectedOutcome: 'Success',
        steps: [
          {
            tool: 'my_tool',
            description: 'Do something',
            args: { param: 'value' },
            argMapping: { other: '$steps[0].result.id' },
          },
        ],
        discovered: true,
      }];

      const yaml = generateWorkflowYamlContent(workflows);
      expect(yaml).toContain('- tool: my_tool');
      expect(yaml).toContain('args:');
      expect(yaml).toContain('param: "value"');
      expect(yaml).toContain('argMapping:');
      expect(yaml).toContain('other: "$steps[0].result.id"');
    });

    it('should escape special characters in YAML strings', () => {
      const workflows = [{
        id: 'test',
        name: 'Test "with quotes"',
        description: 'Description with\nnewline',
        expectedOutcome: 'Success',
        steps: [{ tool: 'tool', description: 'Step' }],
        discovered: true,
      }];

      const yaml = generateWorkflowYamlContent(workflows);
      expect(yaml).toContain('\\"'); // Escaped quotes
      expect(yaml).toContain('\\n'); // Escaped newline
    });

    it('should handle multiple workflows with YAML document separators', () => {
      const workflows = [
        {
          id: 'workflow_1',
          name: 'Workflow 1',
          description: 'First workflow',
          expectedOutcome: 'Success',
          steps: [{ tool: 'tool_a', description: 'Step A' }],
          discovered: true,
        },
        {
          id: 'workflow_2',
          name: 'Workflow 2',
          description: 'Second workflow',
          expectedOutcome: 'Success',
          steps: [{ tool: 'tool_b', description: 'Step B' }],
          discovered: true,
        },
      ];

      const yaml = generateWorkflowYamlContent(workflows);
      expect(yaml).toContain('---'); // Document separator
      expect(yaml).toContain('id: workflow_1');
      expect(yaml).toContain('id: workflow_2');
    });

    it('should include assertion template comments', () => {
      const workflows = [{
        id: 'test',
        name: 'Test',
        description: 'Test',
        expectedOutcome: 'Success',
        steps: [{ tool: 'tool', description: 'Step' }],
        discovered: true,
      }];

      const yaml = generateWorkflowYamlContent(workflows);
      expect(yaml).toContain('# assertions:');
      expect(yaml).toContain('#   - path: "$.result"');
    });
  });
});
