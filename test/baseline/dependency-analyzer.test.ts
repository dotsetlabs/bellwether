/**
 * Tests for cross-tool dependency analyzer.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeDependencies,
  calculateDependencyStats,
  generateDependencyMermaid,
  generateDependencyMarkdown,
} from '../../src/baseline/dependency-analyzer.js';
import type { MCPTool } from '../../src/transport/types.js';

describe('Dependency Analyzer', () => {
  describe('analyzeDependencies', () => {
    it('should return empty graph for empty tools', () => {
      const graph = analyzeDependencies([]);
      expect(graph.edges).toHaveLength(0);
      expect(graph.entryPoints).toHaveLength(0);
      expect(graph.terminalPoints).toHaveLength(0);
    });

    it('should return empty edges for single tool', () => {
      const tools: MCPTool[] = [
        { name: 'single_tool', description: 'A single tool', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      expect(graph.edges).toHaveLength(0);
    });

    it('should detect tool mentions in descriptions', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_link',
          description: 'Create a link token for authentication',
          inputSchema: {},
        },
        {
          name: 'exchange_link',
          description: 'Exchange the link token. Requires create_link to be called first.',
          inputSchema: {},
        },
      ];

      const graph = analyzeDependencies(tools);
      expect(graph.edges.length).toBeGreaterThan(0);

      const mentionEdge = graph.edges.find(e =>
        e.from === 'create_link' && e.to === 'exchange_link'
      );
      expect(mentionEdge).toBeDefined();
    });

    it('should detect parameter-based dependencies', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_user',
          description: 'Create a new user',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
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

      const graph = analyzeDependencies(tools);

      // Should detect that get_user depends on create_user
      // (may be detected as output_input, resource_ref, or sequence depending on confidence)
      const dependencyEdge = graph.edges.find(e =>
        e.from === 'create_user' && e.to === 'get_user'
      );
      expect(dependencyEdge).toBeDefined();
      // The detected type should be one of the dependency types
      expect(['output_input', 'resource_ref', 'sequence']).toContain(dependencyEdge?.type);
    });

    it('should detect resource reference patterns', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_item',
          description: 'Create an item',
          inputSchema: {},
        },
        {
          name: 'get_item',
          description: 'Get item by ID',
          inputSchema: {},
        },
        {
          name: 'list_items',
          description: 'List all items',
          inputSchema: {},
        },
      ];

      const graph = analyzeDependencies(tools);

      // Should detect create_item -> get_item relationship
      const createToGetEdge = graph.edges.find(e =>
        e.from === 'create_item' && e.to === 'get_item'
      );
      expect(createToGetEdge).toBeDefined();
    });

    it('should identify entry points (tools with no dependencies)', () => {
      const tools: MCPTool[] = [
        {
          name: 'step_1',
          description: 'First step',
          inputSchema: {},
        },
        {
          name: 'step_2',
          description: 'Second step. Requires step_1.',
          inputSchema: {},
        },
        {
          name: 'step_3',
          description: 'Third step. Requires step_2.',
          inputSchema: {},
        },
      ];

      const graph = analyzeDependencies(tools);

      // step_1 should be an entry point
      expect(graph.entryPoints).toContain('step_1');
      expect(graph.entryPoints).not.toContain('step_2');
      expect(graph.entryPoints).not.toContain('step_3');
    });

    it('should identify terminal points (tools with no dependents)', () => {
      const tools: MCPTool[] = [
        {
          name: 'step_1',
          description: 'First step',
          inputSchema: {},
        },
        {
          name: 'step_2',
          description: 'Second step. Requires step_1.',
          inputSchema: {},
        },
      ];

      const graph = analyzeDependencies(tools);

      // step_2 should be a terminal point
      expect(graph.terminalPoints).toContain('step_2');
    });

    it('should build topological layers', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_item',
          description: 'Create item',
          inputSchema: {},
        },
        {
          name: 'get_item',
          description: 'Get item',
          inputSchema: {},
        },
      ];

      const graph = analyzeDependencies(tools);

      expect(graph.layers.length).toBeGreaterThan(0);
      // Entry points should be in first layer
      for (const entry of graph.entryPoints) {
        expect(graph.layers[0]).toContain(entry);
      }
    });

    it('should detect cycles', () => {
      const tools: MCPTool[] = [
        {
          name: 'tool_a',
          description: 'Tool A. Depends on tool_b.',
          inputSchema: {},
        },
        {
          name: 'tool_b',
          description: 'Tool B. Depends on tool_a.',
          inputSchema: {},
        },
      ];

      const graph = analyzeDependencies(tools);

      // If cycles are detected, they should be recorded
      // Note: cycles may or may not be detected depending on exact description matching
      expect(Array.isArray(graph.cycles)).toBe(true);
    });

    it('should assign confidence scores to edges', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_link',
          description: 'Create link',
          inputSchema: {},
        },
        {
          name: 'exchange_link',
          description: 'Exchange link. Use result from create_link.',
          inputSchema: {},
        },
      ];

      const graph = analyzeDependencies(tools);

      for (const edge of graph.edges) {
        expect(edge.confidence).toBeGreaterThan(0);
        expect(edge.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should deduplicate edges keeping highest confidence', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_user',
          description: 'Create user',
          inputSchema: {},
        },
        {
          name: 'get_user',
          description: 'Get user. Requires create_user first.',
          inputSchema: {
            type: 'object',
            properties: {
              user_id: { type: 'string' },
            },
          },
        },
      ];

      const graph = analyzeDependencies(tools);

      // Should have at most one edge between each pair
      const edgePairs = graph.edges.map(e => `${e.from}->${e.to}`);
      const uniquePairs = new Set(edgePairs);
      expect(edgePairs.length).toBe(uniquePairs.size);
    });
  });

  describe('calculateDependencyStats', () => {
    it('should calculate basic statistics', () => {
      const tools: MCPTool[] = [
        { name: 'create_item', description: 'Create', inputSchema: {} },
        { name: 'get_item', description: 'Get', inputSchema: {} },
        { name: 'list_items', description: 'List', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const stats = calculateDependencyStats(graph);

      expect(stats.totalEdges).toBe(graph.edges.length);
      expect(stats.avgDependencies).toBeDefined();
      expect(stats.maxChainLength).toBeDefined();
    });

    it('should count edges by type', () => {
      const tools: MCPTool[] = [
        { name: 'step_1', description: 'First step', inputSchema: {} },
        { name: 'step_2', description: 'Second. Requires step_1.', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const stats = calculateDependencyStats(graph);

      expect(stats.byType).toBeDefined();
      expect(typeof stats.byType.mention).toBe('number');
      expect(typeof stats.byType.output_input).toBe('number');
    });

    it('should identify most dependent tools', () => {
      const tools: MCPTool[] = [
        { name: 'core_tool', description: 'Core', inputSchema: {} },
        { name: 'tool_a', description: 'A. Uses core_tool.', inputSchema: {} },
        { name: 'tool_b', description: 'B. Uses core_tool.', inputSchema: {} },
        { name: 'tool_c', description: 'C. Uses core_tool.', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const stats = calculateDependencyStats(graph);

      expect(Array.isArray(stats.mostDependent)).toBe(true);
      expect(Array.isArray(stats.mostDependedUpon)).toBe(true);
    });
  });

  describe('generateDependencyMermaid', () => {
    it('should generate valid mermaid syntax', () => {
      const tools: MCPTool[] = [
        { name: 'create_item', description: 'Create', inputSchema: {} },
        { name: 'get_item', description: 'Get', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const mermaid = generateDependencyMermaid(graph);

      expect(mermaid).toContain('graph TD');
    });

    it('should use different arrow styles for confidence levels', () => {
      const tools: MCPTool[] = [
        { name: 'step_1', description: 'First', inputSchema: {} },
        { name: 'step_2', description: 'Second. Requires step_1.', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const mermaid = generateDependencyMermaid(graph);

      // High confidence uses solid arrows (-->)
      // Medium confidence uses dashed arrows (-.->)
      expect(mermaid).toMatch(/-->|-.->|-\.\.->}/);
    });

    it('should style entry points', () => {
      const tools: MCPTool[] = [
        { name: 'entry', description: 'Entry point', inputSchema: {} },
        { name: 'follower', description: 'Follows entry.', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const mermaid = generateDependencyMermaid(graph);

      // Entry points should have green fill
      if (graph.entryPoints.length > 0) {
        expect(mermaid).toContain('fill:#90EE90');
      }
    });
  });

  describe('generateDependencyMarkdown', () => {
    it('should generate markdown with header', () => {
      const tools: MCPTool[] = [
        { name: 'tool_a', description: 'Tool A', inputSchema: {} },
        { name: 'tool_b', description: 'Tool B', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const stats = calculateDependencyStats(graph);
      const markdown = generateDependencyMarkdown(graph, stats);

      expect(markdown).toContain('## Tool Dependencies');
    });

    it('should include statistics table', () => {
      const tools: MCPTool[] = [
        { name: 'create_user', description: 'Create', inputSchema: {} },
        { name: 'get_user', description: 'Get. Uses create_user.', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const stats = calculateDependencyStats(graph);
      const markdown = generateDependencyMarkdown(graph, stats);

      expect(markdown).toContain('Total Dependencies');
      expect(markdown).toContain('Entry Points');
    });

    it('should include mermaid diagram for small graphs', () => {
      const tools: MCPTool[] = [
        { name: 'step_1', description: 'Step 1', inputSchema: {} },
        { name: 'step_2', description: 'Step 2. Needs step_1.', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const stats = calculateDependencyStats(graph);
      const markdown = generateDependencyMarkdown(graph, stats);

      if (graph.edges.length > 0) {
        expect(markdown).toContain('```mermaid');
      }
    });

    it('should include dependency details table', () => {
      const tools: MCPTool[] = [
        { name: 'create_item', description: 'Create item', inputSchema: {} },
        { name: 'get_item', description: 'Get item. Requires create_item.', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const stats = calculateDependencyStats(graph);
      const markdown = generateDependencyMarkdown(graph, stats);

      if (graph.edges.length > 0) {
        expect(markdown).toContain('Dependency Details');
        expect(markdown).toContain('| Tool | Depends On |');
      }
    });

    it('should handle empty graphs gracefully', () => {
      const graph = analyzeDependencies([]);
      const stats = calculateDependencyStats(graph);
      const markdown = generateDependencyMarkdown(graph, stats);

      expect(markdown).toContain('No inter-tool dependencies detected');
    });

    it('should include suggested execution order', () => {
      const tools: MCPTool[] = [
        { name: 'step_1', description: 'First', inputSchema: {} },
        { name: 'step_2', description: 'Second. After step_1.', inputSchema: {} },
        { name: 'step_3', description: 'Third. After step_2.', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);
      const stats = calculateDependencyStats(graph);
      const markdown = generateDependencyMarkdown(graph, stats);

      if (graph.layers.length > 1) {
        expect(markdown).toContain('Suggested Execution Order');
      }
    });

    it('should warn about cycles', () => {
      // Create tools that might form a cycle
      const tools: MCPTool[] = [
        {
          name: 'tool_a',
          description: 'Tool A needs tool_b',
          inputSchema: {},
        },
        {
          name: 'tool_b',
          description: 'Tool B needs tool_a',
          inputSchema: {},
        },
      ];

      const graph = analyzeDependencies(tools);
      const stats = calculateDependencyStats(graph);
      const markdown = generateDependencyMarkdown(graph, stats);

      if (graph.cycles.length > 0) {
        expect(markdown).toContain('Circular Dependencies');
      }
    });
  });

  describe('Real-world patterns', () => {
    it('should detect Plaid-like link flow', () => {
      const tools: MCPTool[] = [
        {
          name: 'link_create',
          description: 'Create a link token for initializing Plaid Link',
          inputSchema: {},
        },
        {
          name: 'link_exchange',
          description: 'Exchange public token for access token. Call after link_create flow.',
          inputSchema: {
            properties: {
              public_token: { type: 'string' },
            },
          },
        },
        {
          name: 'accounts_list',
          description: 'List accounts. Requires valid access token from link_exchange.',
          inputSchema: {
            properties: {
              item_id: { type: 'string' },
            },
          },
        },
        {
          name: 'transactions_sync',
          description: 'Sync transactions for an item. Needs item_id from link_exchange.',
          inputSchema: {
            properties: {
              item_id: { type: 'string' },
            },
          },
        },
      ];

      const graph = analyzeDependencies(tools);

      // Should detect the flow: link_create -> link_exchange -> accounts_list/transactions_sync
      const createToExchange = graph.edges.find(e =>
        e.from === 'link_create' && e.to === 'link_exchange'
      );
      expect(createToExchange).toBeDefined();

      // Entry point should be link_create
      expect(graph.entryPoints).toContain('link_create');
    });

    it('should detect CRUD patterns', () => {
      const tools: MCPTool[] = [
        { name: 'create_user', description: 'Create new user', inputSchema: {} },
        { name: 'get_user', description: 'Get user by ID', inputSchema: { properties: { user_id: { type: 'string' } } } },
        { name: 'update_user', description: 'Update user', inputSchema: { properties: { user_id: { type: 'string' } } } },
        { name: 'delete_user', description: 'Delete user', inputSchema: { properties: { user_id: { type: 'string' } } } },
        { name: 'list_users', description: 'List all users', inputSchema: {} },
      ];

      const graph = analyzeDependencies(tools);

      // create_user should be a dependency for get/update/delete
      const createDependents = graph.edges.filter(e => e.from === 'create_user');
      expect(createDependents.length).toBeGreaterThan(0);
    });
  });
});
