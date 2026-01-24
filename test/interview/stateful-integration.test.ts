/**
 * Integration test for stateful testing behavior.
 */

import { describe, expect, it } from 'vitest';
import { Interviewer } from '../../src/interview/interviewer.js';
import type { MCPClient } from '../../src/transport/mcp-client.js';
import type { MCPToolCallResult } from '../../src/transport/types.js';
import type { DiscoveryResult } from '../../src/discovery/types.js';

function createMockClient(recorded: Record<string, Record<string, unknown>[]>): MCPClient {
  return {
    async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
      if (!recorded[name]) {
        recorded[name] = [];
      }
      recorded[name].push(args);

      if (name === 'create_item') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ id: 'state-123' }) }],
        };
      }

      return {
        content: [{ type: 'text', text: 'ok' }],
      };
    },
  } as unknown as MCPClient;
}

function createDiscoveryResult(): DiscoveryResult {
  return {
    serverInfo: { name: 'test-server', version: '1.0.0' },
    protocolVersion: '2024-11-05',
    capabilities: { tools: {}, prompts: {}, resources: {} },
    tools: [
      {
        name: 'create_item',
        description: 'Create an item',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
      },
      {
        name: 'get_item',
        description: 'Get item by id',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    ],
    prompts: [],
    resources: [],
    timestamp: new Date('2024-01-01T00:00:00Z'),
    serverCommand: 'node server.js',
    serverArgs: [],
  };
}

describe('stateful testing integration', () => {
  it('injects state from prior tool outputs', async () => {
    const recorded: Record<string, Record<string, unknown>[]> = {};
    const client = createMockClient(recorded);
    const discovery = createDiscoveryResult();

    const interviewer = new Interviewer(null, {
      checkMode: true,
      maxQuestionsPerTool: 1,
      parallelTools: false,
      warmupRuns: 0, // Disable warmup so only stateful-injected args are recorded
      statefulTesting: {
        enabled: true,
        maxChainLength: 5,
        shareOutputsBetweenTools: true,
      },
    });

    await interviewer.interview(client, discovery);

    const getItemCalls = recorded.get_item ?? [];
    expect(getItemCalls.length).toBeGreaterThan(0);
    expect(getItemCalls[0]?.id).toBe('state-123');
  });
});
