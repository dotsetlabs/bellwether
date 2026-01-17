/**
 * Tests for workflow integration in the interview process.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Interviewer, DEFAULT_CONFIG } from '../../src/interview/interviewer.js';
import type { InterviewProgress, WorkflowConfig } from '../../src/interview/types.js';
import type { LLMClient } from '../../src/llm/client.js';
import type { MCPClient } from '../../src/transport/mcp-client.js';
import type { DiscoveryResult } from '../../src/discovery/types.js';
import type { MCPTool, MCPToolCallResult } from '../../src/transport/types.js';
import { WORKFLOW } from '../../src/constants.js';

// Mock LLM client that returns properly formatted responses
function createMockLLM(): LLMClient {
  return {
    complete: vi.fn().mockImplementation((prompt: string) => {
      // Handle question generation - return array format
      if (prompt.includes('generate') || prompt.includes('question')) {
        return Promise.resolve(JSON.stringify([
          { description: 'Test basic functionality', category: 'happy_path', args: { query: 'test' } },
        ]));
      }

      // Handle analysis
      if (prompt.includes('analyze') || prompt.includes('behavior')) {
        return Promise.resolve('Tool executed successfully.');
      }

      // Handle synthesis
      if (prompt.includes('synthesize') || prompt.includes('summary') || prompt.includes('profile')) {
        return Promise.resolve(JSON.stringify({
          behavioralNotes: ['Works as expected'],
          limitations: [],
          securityNotes: [],
          summary: 'Server works correctly',
          recommendations: [],
        }));
      }

      // Handle workflow discovery
      if (prompt.includes('workflow')) {
        return Promise.resolve(JSON.stringify({
          workflows: [],
        }));
      }

      // Default
      return Promise.resolve(JSON.stringify({ result: 'mock' }));
    }),
    chat: vi.fn().mockResolvedValue('Chat response'),
    parseJSON: vi.fn((str: string) => {
      try {
        // Handle markdown code blocks
        const jsonMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]);
        }
        return JSON.parse(str);
      } catch {
        return { result: str };
      }
    }),
  } as unknown as LLMClient;
}

// Mock MCP client
function createMockClient(toolResponses: Map<string, MCPToolCallResult>): MCPClient {
  return {
    callTool: vi.fn((toolName: string) => {
      const response = toolResponses.get(toolName);
      if (response) {
        return Promise.resolve(response);
      }
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify({ error: 'Unknown tool' }) }],
        isError: true,
      });
    }),
    getPrompt: vi.fn().mockResolvedValue({ messages: [] }),
    readResource: vi.fn().mockResolvedValue({ contents: [] }),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
    listResources: vi.fn().mockResolvedValue({ resources: [] }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isReady: vi.fn().mockReturnValue(true),
  } as unknown as MCPClient;
}

// Sample tools for testing
const sampleTools: MCPTool[] = [
  {
    name: 'search_items',
    description: 'Search for items in the database',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_item',
    description: 'Get item details by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Item ID' },
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
        id: { type: 'string', description: 'Item ID' },
        data: { type: 'object', description: 'Update data' },
      },
      required: ['id', 'data'],
    },
  },
];

// Sample discovery result
function createDiscoveryResult(tools: MCPTool[] = sampleTools): DiscoveryResult {
  return {
    serverInfo: {
      name: 'test-server',
      version: '1.0.0',
    },
    capabilities: {
      tools: {},
    },
    tools,
    prompts: [],
    resources: [],
  };
}

describe('Workflow Integration', () => {
  let mockLLM: LLMClient;
  let mockClient: MCPClient;
  let toolResponses: Map<string, MCPToolCallResult>;

  beforeEach(() => {
    mockLLM = createMockLLM();

    toolResponses = new Map();
    toolResponses.set('search_items', {
      content: [{ type: 'text', text: JSON.stringify({ items: [{ id: '123', name: 'Test Item' }] }) }],
    });
    toolResponses.set('get_item', {
      content: [{ type: 'text', text: JSON.stringify({ id: '123', name: 'Test Item', status: 'active' }) }],
    });
    toolResponses.set('update_item', {
      content: [{ type: 'text', text: JSON.stringify({ success: true, id: '123' }) }],
    });

    mockClient = createMockClient(toolResponses);
  });

  describe('WorkflowConfig', () => {
    it('should accept workflow configuration in InterviewConfig', () => {
      const workflowConfig: WorkflowConfig = {
        discoverWorkflows: true,
        maxDiscoveredWorkflows: 5,
        enableStateTracking: true,
      };

      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        workflowConfig,
      });

      expect(interviewer).toBeDefined();
    });

    it('should accept workflows array in config', () => {
      const workflowConfig: WorkflowConfig = {
        workflows: [
          {
            id: 'test-workflow',
            name: 'Test Workflow',
            description: 'A test workflow',
            steps: [
              { tool: 'search_items', args: { query: 'test' }, description: 'Search' },
              { tool: 'get_item', args: { id: '123' }, description: 'Get' },
            ],
          },
        ],
      };

      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        workflowConfig,
      });

      expect(interviewer).toBeDefined();
    });
  });

  describe('Workflow Execution', () => {
    it('should execute user-provided workflows', async () => {
      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
        workflowConfig: {
          workflows: [
            {
              id: 'manual-workflow',
              name: 'Manual Workflow',
              description: 'A manually defined workflow',
              steps: [
                { tool: 'search_items', args: { query: 'test' }, description: 'Search' },
                { tool: 'get_item', args: { id: '123' }, description: 'Get details' },
              ],
            },
          ],
        },
      });

      const result = await interviewer.interview(mockClient, createDiscoveryResult());

      expect(result.workflowResults).toBeDefined();
      expect(result.workflowResults).toHaveLength(1);
      expect(result.workflowResults![0].workflow.name).toBe('Manual Workflow');
    });

    it('should track workflow summary in metadata', async () => {
      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
        workflowConfig: {
          workflows: [
            {
              id: 'workflow-1',
              name: 'Workflow 1',
              description: 'First workflow',
              steps: [{ tool: 'search_items', args: { query: 'test' }, description: 'Search' }],
            },
          ],
        },
      });

      const result = await interviewer.interview(mockClient, createDiscoveryResult());

      expect(result.metadata.workflows).toBeDefined();
      expect(result.metadata.workflows?.workflowCount).toBe(1);
      expect(result.metadata.workflows?.loadedCount).toBe(1);
      expect(result.metadata.workflows?.discoveredCount).toBe(0);
    });

    it('should handle workflow execution failures gracefully', async () => {
      // Set up a tool that will fail
      toolResponses.set('search_items', {
        content: [{ type: 'text', text: 'Search failed' }],
        isError: true,
      });
      mockClient = createMockClient(toolResponses);

      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
        workflowConfig: {
          workflows: [
            {
              id: 'failing-workflow',
              name: 'Failing Workflow',
              description: 'A workflow that will fail',
              steps: [{ tool: 'search_items', args: { query: 'test' }, description: 'Search' }],
            },
          ],
        },
      });

      const result = await interviewer.interview(mockClient, createDiscoveryResult());

      expect(result.workflowResults).toBeDefined();
      expect(result.workflowResults![0].success).toBe(false);
      expect(result.metadata.workflows?.failedCount).toBe(1);
    });

    it('should skip workflow execution when skipWorkflowExecution is true', async () => {
      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
        workflowConfig: {
          workflows: [
            {
              id: 'skipped-workflow',
              name: 'Skipped Workflow',
              description: 'This workflow should be skipped',
              steps: [{ tool: 'search_items', args: { query: 'test' }, description: 'Search' }],
            },
          ],
          skipWorkflowExecution: true,
        },
      });

      const result = await interviewer.interview(mockClient, createDiscoveryResult());

      // Workflows loaded but not executed
      expect(result.workflowResults).toBeUndefined();
    });

    it('should not execute workflows when none configured', async () => {
      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
      });

      const result = await interviewer.interview(mockClient, createDiscoveryResult());

      expect(result.workflowResults).toBeUndefined();
      expect(result.metadata.workflows).toBeUndefined();
    });
  });

  describe('Progress Tracking', () => {
    it('should report workflow phase in progress', async () => {
      const progressUpdates: InterviewProgress[] = [];

      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
        workflowConfig: {
          workflows: [
            {
              id: 'progress-workflow',
              name: 'Progress Workflow',
              description: 'Test workflow for progress tracking',
              steps: [{ tool: 'search_items', args: { query: 'test' }, description: 'Search' }],
            },
          ],
        },
      });

      await interviewer.interview(mockClient, createDiscoveryResult(), (progress) => {
        progressUpdates.push({ ...progress });
      });

      // Should have workflow phase
      const workflowPhases = progressUpdates.filter(p => p.phase === 'workflows');
      expect(workflowPhases.length).toBeGreaterThan(0);
    });

    it('should track current workflow in progress', async () => {
      const progressUpdates: InterviewProgress[] = [];

      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
        workflowConfig: {
          workflows: [
            {
              id: 'tracked-workflow',
              name: 'Tracked Workflow',
              description: 'Workflow name should appear in progress',
              steps: [{ tool: 'search_items', args: { query: 'test' }, description: 'Search' }],
            },
          ],
        },
      });

      await interviewer.interview(mockClient, createDiscoveryResult(), (progress) => {
        progressUpdates.push({ ...progress });
      });

      const workflowProgress = progressUpdates.find(
        p => p.phase === 'workflows' && p.currentWorkflow
      );
      expect(workflowProgress?.currentWorkflow).toBe('Tracked Workflow');
    });

    it('should track workflow completion count', async () => {
      const progressUpdates: InterviewProgress[] = [];

      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
        workflowConfig: {
          workflows: [
            {
              id: 'wf-1',
              name: 'Workflow 1',
              description: 'First',
              steps: [{ tool: 'search_items', args: { query: 'test' }, description: 'Search' }],
            },
            {
              id: 'wf-2',
              name: 'Workflow 2',
              description: 'Second',
              steps: [{ tool: 'get_item', args: { id: '123' }, description: 'Get' }],
            },
          ],
        },
      });

      await interviewer.interview(mockClient, createDiscoveryResult(), (progress) => {
        progressUpdates.push({ ...progress });
      });

      // Find the last workflow progress update
      const lastWorkflowProgress = [...progressUpdates]
        .reverse()
        .find(p => p.phase === 'workflows');

      expect(lastWorkflowProgress?.totalWorkflows).toBe(2);
      expect(lastWorkflowProgress?.workflowsCompleted).toBe(2);
    });
  });

  describe('Workflow Discovery', () => {
    it('should skip discovery when not enabled', async () => {
      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
        workflowConfig: {
          discoverWorkflows: false,
        },
      });

      const result = await interviewer.interview(mockClient, createDiscoveryResult());

      expect(result.workflowResults).toBeUndefined();
    });

    it('should not discover workflows when server has fewer than 2 tools', async () => {
      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
        workflowConfig: {
          discoverWorkflows: true,
        },
      });

      const singleToolDiscovery = createDiscoveryResult([sampleTools[0]]);
      const result = await interviewer.interview(mockClient, singleToolDiscovery);

      // With only one tool, workflow discovery should be skipped
      expect(result.workflowResults).toBeUndefined();
    });
  });

  describe('State Tracking', () => {
    it('should pass state tracking config to executor', async () => {
      const interviewer = new Interviewer(mockLLM, {
        ...DEFAULT_CONFIG,
        maxQuestionsPerTool: 1,
        workflowConfig: {
          workflows: [
            {
              id: 'state-workflow',
              name: 'State Tracking Workflow',
              description: 'Workflow with state tracking',
              steps: [{ tool: 'search_items', args: { query: 'test' }, description: 'Search' }],
            },
          ],
          enableStateTracking: true,
        },
      });

      const result = await interviewer.interview(mockClient, createDiscoveryResult());

      expect(result.workflowResults).toBeDefined();
      // State tracking is internal to executor, but workflow should complete
      expect(result.workflowResults![0].workflow.name).toBe('State Tracking Workflow');
    });
  });
});

describe('Workflow Constants', () => {
  it('should have valid workflow configuration constants', () => {
    expect(WORKFLOW.MAX_DISCOVERED_WORKFLOWS).toBeGreaterThan(0);
    expect(WORKFLOW.MIN_WORKFLOW_STEPS).toBeGreaterThanOrEqual(1);
    expect(WORKFLOW.MAX_WORKFLOW_STEPS).toBeGreaterThan(WORKFLOW.MIN_WORKFLOW_STEPS);
    expect(WORKFLOW.STEP_TIMEOUT).toBeGreaterThan(0);
    expect(WORKFLOW.STATE_SNAPSHOT_TIMEOUT).toBeGreaterThan(0);
    expect(WORKFLOW.PROBE_TOOL_TIMEOUT).toBeGreaterThan(0);
    expect(WORKFLOW.LLM_ANALYSIS_TIMEOUT).toBeGreaterThan(0);
    expect(WORKFLOW.LLM_SUMMARY_TIMEOUT).toBeGreaterThan(0);
  });

  it('should have consistent timeout values', () => {
    // Step timeout should be reasonable
    expect(WORKFLOW.STEP_TIMEOUT).toBeLessThanOrEqual(60000);

    // State snapshot should be faster than step execution
    expect(WORKFLOW.STATE_SNAPSHOT_TIMEOUT).toBeLessThanOrEqual(WORKFLOW.STEP_TIMEOUT);

    // Probe tool should be faster than state snapshot
    expect(WORKFLOW.PROBE_TOOL_TIMEOUT).toBeLessThanOrEqual(WORKFLOW.STATE_SNAPSHOT_TIMEOUT);
  });
});

describe('Interview Progress Type', () => {
  it('should support workflow phase', () => {
    const progress: InterviewProgress = {
      phase: 'workflows',
      personasCompleted: 1,
      totalPersonas: 1,
      toolsCompleted: 3,
      totalTools: 3,
      questionsAsked: 9,
      currentWorkflow: 'Test Workflow',
      workflowsCompleted: 0,
      totalWorkflows: 2,
    };

    expect(progress.phase).toBe('workflows');
    expect(progress.currentWorkflow).toBe('Test Workflow');
    expect(progress.totalWorkflows).toBe(2);
  });
});
