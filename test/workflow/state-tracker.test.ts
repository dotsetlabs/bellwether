/**
 * Tests for the state tracking system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateTracker } from '../../src/workflow/state-tracker.js';
import type { MCPClient } from '../../src/transport/mcp-client.js';
import type { MCPTool, MCPToolCallResult } from '../../src/transport/types.js';
import type { WorkflowStepResult, StateSnapshot } from '../../src/workflow/types.js';

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

// Sample tools with various naming conventions
const readerTools: MCPTool[] = [
  { name: 'list_users', description: 'List all users in the system' },
  { name: 'get_user', description: 'Get a user by ID' },
  { name: 'search_items', description: 'Search for items by query' },
  { name: 'fetch_data', description: 'Fetch data from the database' },
  { name: 'query_records', description: 'Query records from the database' },
];

const writerTools: MCPTool[] = [
  { name: 'create_user', description: 'Create a new user' },
  { name: 'update_item', description: 'Update an existing item' },
  { name: 'delete_record', description: 'Delete a record from the database' },
  { name: 'insert_data', description: 'Insert data into the table' },
  { name: 'save_config', description: 'Save configuration settings' },
];

const mixedTools: MCPTool[] = [
  ...readerTools,
  ...writerTools,
  { name: 'process_file', description: 'Process a file (unknown role)' },
  { name: 'run_task', description: 'Execute a background task' },
];

const probeTools: MCPTool[] = [
  { name: 'list_all_items', description: 'List all items in the system' },
  { name: 'get_all_users', description: 'Get all users' },
  { name: 'dump_state', description: 'Dump current state' },
  { name: 'snapshot_data', description: 'Take a snapshot of data' },
];

describe('StateTracker', () => {
  describe('Tool Classification', () => {
    let mockClient: MCPClient;
    let tracker: StateTracker;

    beforeEach(() => {
      mockClient = createMockClient(new Map());
      tracker = new StateTracker(mockClient, mixedTools);
    });

    it('should classify reader tools correctly', () => {
      for (const tool of readerTools) {
        const info = tracker.getToolInfo(tool.name);
        expect(info).toBeDefined();
        expect(info!.role).toBe('reader');
        expect(info!.confidence).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('should classify writer tools correctly', () => {
      for (const tool of writerTools) {
        const info = tracker.getToolInfo(tool.name);
        expect(info).toBeDefined();
        expect(info!.role).toBe('writer');
        expect(info!.confidence).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('should classify unknown role tools', () => {
      const processFile = tracker.getToolInfo('process_file');
      expect(processFile).toBeDefined();
      expect(processFile!.role).toBe('unknown');
      expect(processFile!.confidence).toBeLessThan(0.5);
    });

    it('should identify probe tools', () => {
      const probeTracker = new StateTracker(mockClient, probeTools);
      const probes = probeTracker.getProbeTools();

      expect(probes.length).toBeGreaterThan(0);
      expect(probes).toContain('list_all_items');
    });

    it('should return all tool info', () => {
      const allInfo = tracker.getAllToolInfo();
      expect(allInfo.length).toBe(mixedTools.length);
    });
  });

  describe('State Type Inference', () => {
    let mockClient: MCPClient;

    beforeEach(() => {
      mockClient = createMockClient(new Map());
    });

    it('should infer file state type', () => {
      const tools: MCPTool[] = [
        { name: 'read_file', description: 'Read a file from disk' },
      ];
      const tracker = new StateTracker(mockClient, tools);
      const info = tracker.getToolInfo('read_file');

      expect(info?.stateTypes).toContain('files');
    });

    it('should infer database state type', () => {
      const tools: MCPTool[] = [
        { name: 'query_db', description: 'Query the database tables' },
      ];
      const tracker = new StateTracker(mockClient, tools);
      const info = tracker.getToolInfo('query_db');

      expect(info?.stateTypes).toContain('database');
    });

    it('should infer user state type', () => {
      const tools: MCPTool[] = [
        { name: 'get_profile', description: 'Get user account profile' },
      ];
      const tracker = new StateTracker(mockClient, tools);
      const info = tracker.getToolInfo('get_profile');

      expect(info?.stateTypes).toContain('users');
    });

    it('should infer multiple state types', () => {
      const tools: MCPTool[] = [
        { name: 'sync_user_files', description: 'Sync user account files to database' },
      ];
      const tracker = new StateTracker(mockClient, tools);
      const info = tracker.getToolInfo('sync_user_files');

      expect(info?.stateTypes).toContain('files');
      expect(info?.stateTypes).toContain('users');
      expect(info?.stateTypes).toContain('database');
    });
  });

  describe('State Snapshots', () => {
    let mockClient: MCPClient;
    let responses: Map<string, MCPToolCallResult>;

    beforeEach(() => {
      responses = new Map();
      responses.set('list_items', {
        content: [{ type: 'text', text: JSON.stringify({ items: [{ id: 1 }, { id: 2 }] }) }],
      });
      mockClient = createMockClient(responses);
    });

    it('should take state snapshot using probe tools', async () => {
      const tools: MCPTool[] = [
        { name: 'list_items', description: 'List all items' },
      ];
      const tracker = new StateTracker(mockClient, tools);
      const snapshot = await tracker.takeSnapshot(0);

      expect(snapshot.timestamp).toBeInstanceOf(Date);
      expect(snapshot.afterStepIndex).toBe(0);
      expect(snapshot.hash).toBeDefined();
      expect(snapshot.data).toBeDefined();
    });

    it('should use specified probe tools', async () => {
      const tools: MCPTool[] = [
        { name: 'list_items', description: 'List all items' },
        { name: 'get_status', description: 'Get status' },
      ];
      responses.set('get_status', {
        content: [{ type: 'text', text: JSON.stringify({ status: 'ok' }) }],
      });

      const tracker = new StateTracker(mockClient, tools, undefined, {
        probeTools: ['get_status'],
      });

      const probes = tracker.getProbeTools();
      expect(probes).toContain('get_status');
      expect(probes).not.toContain('list_items');
    });

    it('should handle probe failures gracefully', async () => {
      const tools: MCPTool[] = [
        { name: 'list_failing', description: 'List all failing items' },
      ];
      const failingClient = createMockClient(new Map()); // No response = failure

      const tracker = new StateTracker(failingClient, tools);
      const snapshot = await tracker.takeSnapshot(0);

      // Should still create snapshot even with failures
      expect(snapshot).toBeDefined();
      expect(snapshot.hash).toBeDefined();
    });
  });

  describe('Snapshot Comparison', () => {
    let mockClient: MCPClient;
    let tracker: StateTracker;

    beforeEach(() => {
      mockClient = createMockClient(new Map());
      tracker = new StateTracker(mockClient, []);
    });

    it('should detect no changes for identical snapshots', () => {
      const snapshot1: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 0,
        data: { items: [1, 2, 3] },
        hash: 'abc123',
      };
      const snapshot2: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 1,
        data: { items: [1, 2, 3] },
        hash: 'abc123',
      };

      const changes = tracker.compareSnapshots(snapshot1, snapshot2, 1);
      expect(changes).toHaveLength(0);
    });

    it('should detect created state', () => {
      const snapshot1: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: -1,
        data: null,
        hash: 'null',
      };
      const snapshot2: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 0,
        data: { items: [1, 2, 3] },
        hash: 'abc123',
      };

      const changes = tracker.compareSnapshots(snapshot1, snapshot2, 0);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('created');
      expect(changes[0].causedByStep).toBe(0);
    });

    it('should detect deleted state', () => {
      const snapshot1: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 0,
        data: { items: [1, 2, 3] },
        hash: 'abc123',
      };
      const snapshot2: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 1,
        data: null,
        hash: 'null',
      };

      const changes = tracker.compareSnapshots(snapshot1, snapshot2, 1);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('deleted');
    });

    it('should detect modified state', () => {
      const snapshot1: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 0,
        data: { probe1: { count: 1 } },
        hash: 'abc',
      };
      const snapshot2: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 1,
        data: { probe1: { count: 2 } },
        hash: 'def',
      };

      const changes = tracker.compareSnapshots(snapshot1, snapshot2, 1);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('modified');
      expect(changes[0].path).toBe('$.probe1');
    });

    it('should detect created keys in state', () => {
      const snapshot1: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 0,
        data: { probe1: { a: 1 } },
        hash: 'abc',
      };
      const snapshot2: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 1,
        data: { probe1: { a: 1 }, probe2: { b: 2 } },
        hash: 'def',
      };

      const changes = tracker.compareSnapshots(snapshot1, snapshot2, 1);
      expect(changes.some(c => c.type === 'created' && c.path === '$.probe2')).toBe(true);
    });

    it('should detect deleted keys in state', () => {
      const snapshot1: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 0,
        data: { probe1: { a: 1 }, probe2: { b: 2 } },
        hash: 'abc',
      };
      const snapshot2: StateSnapshot = {
        timestamp: new Date(),
        afterStepIndex: 1,
        data: { probe1: { a: 1 } },
        hash: 'def',
      };

      const changes = tracker.compareSnapshots(snapshot1, snapshot2, 1);
      expect(changes.some(c => c.type === 'deleted' && c.path === '$.probe2')).toBe(true);
    });
  });

  describe('Dependency Inference', () => {
    let mockClient: MCPClient;
    let tracker: StateTracker;

    beforeEach(() => {
      const tools: MCPTool[] = [
        { name: 'create_user', description: 'Create a user account' },
        { name: 'get_user', description: 'Get user account details' },
        { name: 'update_user', description: 'Update user account' },
        { name: 'list_files', description: 'List files on disk' },
        { name: 'delete_file', description: 'Delete a file from disk' },
      ];
      mockClient = createMockClient(new Map());
      tracker = new StateTracker(mockClient, tools);
    });

    it('should infer dependency from writer to reader', () => {
      const stepResults: WorkflowStepResult[] = [
        {
          step: { tool: 'create_user', description: 'Create' },
          stepIndex: 0,
          success: true,
          response: null,
          resolvedArgs: {},
          durationMs: 100,
        },
        {
          step: { tool: 'get_user', description: 'Get' },
          stepIndex: 1,
          success: true,
          response: null,
          resolvedArgs: {},
          durationMs: 100,
        },
      ];

      const deps = tracker.inferDependencies(stepResults);

      expect(deps.length).toBeGreaterThan(0);
      expect(deps[0].producerStep).toBe(0);
      expect(deps[0].consumerStep).toBe(1);
      expect(deps[0].stateType).toBe('users');
    });

    it('should not infer dependency for unrelated state types', () => {
      const stepResults: WorkflowStepResult[] = [
        {
          step: { tool: 'create_user', description: 'Create user' },
          stepIndex: 0,
          success: true,
          response: null,
          resolvedArgs: {},
          durationMs: 100,
        },
        {
          step: { tool: 'list_files', description: 'List files' },
          stepIndex: 1,
          success: true,
          response: null,
          resolvedArgs: {},
          durationMs: 100,
        },
      ];

      const deps = tracker.inferDependencies(stepResults);

      // Should not infer dependency between users and files
      expect(deps.every(d => d.stateType !== 'files' || d.producerStep !== 0)).toBe(true);
    });

    it('should infer dependency chain', () => {
      const stepResults: WorkflowStepResult[] = [
        {
          step: { tool: 'create_user', description: 'Create' },
          stepIndex: 0,
          success: true,
          response: null,
          resolvedArgs: {},
          durationMs: 100,
        },
        {
          step: { tool: 'get_user', description: 'Get' },
          stepIndex: 1,
          success: true,
          response: null,
          resolvedArgs: {},
          durationMs: 100,
        },
        {
          step: { tool: 'update_user', description: 'Update' },
          stepIndex: 2,
          success: true,
          response: null,
          resolvedArgs: {},
          durationMs: 100,
        },
      ];

      const deps = tracker.inferDependencies(stepResults);

      // Should have dependencies: 0->1, 0->2 (since update is both reader and writer)
      expect(deps.length).toBeGreaterThan(0);
    });
  });

  describe('Dependency Verification', () => {
    let mockClient: MCPClient;
    let tracker: StateTracker;

    beforeEach(() => {
      mockClient = createMockClient(new Map());
      tracker = new StateTracker(mockClient, []);
    });

    it('should verify dependencies when changes exist', () => {
      const dependencies = [
        {
          producerStep: 0,
          consumerStep: 1,
          stateType: 'users',
          description: 'Test dependency',
          verified: false,
        },
      ];

      const snapshots: StateSnapshot[] = [
        { timestamp: new Date(), afterStepIndex: 0, data: {}, hash: 'a' },
        { timestamp: new Date(), afterStepIndex: 1, data: {}, hash: 'b' },
      ];

      const changes = [
        { type: 'modified' as const, path: '$.users', causedByStep: 0 },
      ];

      const verified = tracker.verifyDependencies(dependencies, snapshots, changes);

      expect(verified[0].verified).toBe(true);
    });

    it('should not verify dependencies when no changes exist', () => {
      const dependencies = [
        {
          producerStep: 0,
          consumerStep: 1,
          stateType: 'users',
          description: 'Test dependency',
          verified: false,
        },
      ];

      const snapshots: StateSnapshot[] = [
        { timestamp: new Date(), afterStepIndex: 0, data: {}, hash: 'a' },
        { timestamp: new Date(), afterStepIndex: 1, data: {}, hash: 'a' },
      ];

      const changes: Array<{ type: 'created' | 'modified' | 'deleted'; path: string; causedByStep: number }> = [];

      const verified = tracker.verifyDependencies(dependencies, snapshots, changes);

      expect(verified[0].verified).toBe(false);
    });
  });

  describe('Summary Generation', () => {
    let mockClient: MCPClient;
    let tracker: StateTracker;

    beforeEach(() => {
      mockClient = createMockClient(new Map());
      tracker = new StateTracker(mockClient, mixedTools);
    });

    it('should generate summary with state changes', async () => {
      const tracking = {
        snapshots: [],
        changes: [
          { type: 'created' as const, path: '$.a', causedByStep: 0 },
          { type: 'modified' as const, path: '$.b', causedByStep: 1 },
        ],
        dependencies: [
          { producerStep: 0, consumerStep: 1, stateType: 'test', description: 'Test', verified: true },
        ],
        toolRoles: tracker.getAllToolInfo(),
      };

      const summary = await tracker.generateSummary(tracking);

      expect(summary).toContain('State changes');
      expect(summary).toContain('1 created');
      expect(summary).toContain('1 modified');
      expect(summary).toContain('Dependencies');
    });

    it('should generate summary with no changes', async () => {
      const tracking = {
        snapshots: [],
        changes: [],
        dependencies: [],
        toolRoles: tracker.getAllToolInfo(),
      };

      const summary = await tracker.generateSummary(tracking);

      expect(summary).toContain('No state changes detected');
    });
  });

});
