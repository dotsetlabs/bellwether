#!/usr/bin/env node
/**
 * Mock MCP server for integration testing.
 *
 * This server implements the MCP protocol over stdio and can be spawned
 * as a subprocess for testing the MCPClient.
 *
 * Usage:
 *   node mock-mcp-server.js [options]
 *
 * Options (via environment variables):
 *   MOCK_TOOLS - JSON array of tool definitions (defaults to standard set)
 *   MOCK_PROMPTS - JSON array of prompt definitions
 *   MOCK_DELAY - Delay in ms before responding
 *   MOCK_FAIL_INIT - Fail on initialization
 *   MOCK_FAIL_TOOL - Tool name that should fail
 */

import * as readline from 'readline';
import {
  standardToolSet,
  samplePrompts,
  mockServerInfo,
  mockCapabilities,
  createMockToolResult,
} from './sample-tools.js';
import type { MCPTool, MCPPrompt } from '../../src/transport/types.js';

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

// Configuration from environment
const tools: MCPTool[] = process.env.MOCK_TOOLS
  ? JSON.parse(process.env.MOCK_TOOLS)
  : standardToolSet;

const prompts: MCPPrompt[] = process.env.MOCK_PROMPTS
  ? JSON.parse(process.env.MOCK_PROMPTS)
  : samplePrompts;

const responseDelay = parseInt(process.env.MOCK_DELAY ?? '0', 10);
const failInit = process.env.MOCK_FAIL_INIT === 'true';
const failTool = process.env.MOCK_FAIL_TOOL;

// Write to stderr to signal ready
console.error('Mock MCP server starting...');

// Set up readline for JSON-RPC over stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(response: JSONRPCResponse): void {
  const json = JSON.stringify(response);
  // Use newline-delimited JSON format
  process.stdout.write(`${json}\n`);
}

function handleRequest(request: JSONRPCRequest): void {
  // Only delay tool calls, not initialization/discovery
  const isToolCall = request.method === 'tools/call';
  const delay = isToolCall && responseDelay > 0 ? responseDelay : 0;

  setTimeout(() => {
    let response: JSONRPCResponse;

    try {
      switch (request.method) {
        case 'initialize':
          if (failInit) {
            response = {
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32000, message: 'Initialization failed' },
            };
          } else {
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                protocolVersion: process.env.MOCK_PROTOCOL_VERSION ?? '2025-11-25',
                capabilities: mockCapabilities,
                serverInfo: mockServerInfo,
              },
            };
          }
          break;

        case 'tools/list':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: { tools },
          };
          break;

        case 'prompts/list':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: { prompts },
          };
          break;

        case 'resources/list':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: { resources: [] },
          };
          break;

        case 'resources/templates/list':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: { resourceTemplates: [] },
          };
          break;

        case 'tools/call':
          response = handleToolCall(request);
          break;

        default:
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32601, message: `Method not found: ${request.method}` },
          };
      }
    } catch (error) {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }

    sendResponse(response);
  }, delay);
}

function handleToolCall(request: JSONRPCRequest): JSONRPCResponse {
  const params = request.params as { name: string; arguments?: Record<string, unknown> };
  const toolName = params?.name;
  const args = params?.arguments ?? {};

  // Check if this tool should fail
  if (failTool && toolName === failTool) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32000, message: `Tool ${toolName} failed (simulated)` },
    };
  }

  // Find the tool definition
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32602, message: `Unknown tool: ${toolName}` },
    };
  }

  // Generate mock response based on tool
  let result;
  switch (toolName) {
    case 'get_weather':
      result = createMockToolResult(
        JSON.stringify({
          location: args.location ?? 'Unknown',
          temperature: 72,
          units: args.units ?? 'fahrenheit',
          conditions: 'Sunny',
        })
      );
      break;

    case 'calculate':
      try {
        // Safe evaluation for testing (not for production!)
        const expr = String(args.expression ?? '0');
        // Only allow simple math expressions
        if (!/^[\d\s+\-*/().]+$/.test(expr)) {
          result = createMockToolResult('Invalid expression', true);
        } else {
          // eslint-disable-next-line no-eval
          const value = eval(expr);
          result = createMockToolResult(JSON.stringify({ result: value }));
        }
      } catch {
        result = createMockToolResult('Calculation error', true);
      }
      break;

    case 'read_file': {
      const path = String(args.path ?? '');
      if (path.includes('..') || path.startsWith('/etc')) {
        result = createMockToolResult('Access denied', true);
      } else if (path === '/nonexistent') {
        result = createMockToolResult('File not found', true);
      } else {
        result = createMockToolResult(`Contents of ${path}: mock file content`);
      }
      break;
    }

    case 'query_database': {
      const query = String(args.query ?? '').toLowerCase();
      if (query.includes('drop') || query.includes('delete')) {
        result = createMockToolResult('Write operations not allowed', true);
      } else {
        result = createMockToolResult(
          JSON.stringify({
            rows: [{ id: 1, name: 'Test' }],
            rowCount: 1,
          })
        );
      }
      break;
    }

    case 'get_timestamp':
      result = createMockToolResult(JSON.stringify({ timestamp: Date.now() }));
      break;

    case 'ping':
      result = createMockToolResult(JSON.stringify({ status: 'ok' }));
      break;

    default:
      result = createMockToolResult(JSON.stringify({ tool: toolName, args }));
  }

  return {
    jsonrpc: '2.0',
    id: request.id,
    result,
  };
}

// Process incoming lines as JSON-RPC messages
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request = JSON.parse(trimmed) as JSONRPCRequest;

    // Ignore notifications (no id)
    if (request.id === undefined) {
      return;
    }

    handleRequest(request);
  } catch (error) {
    // Invalid JSON - send parse error
    console.error('Parse error:', error);
    sendResponse({
      jsonrpc: '2.0',
      id: 0,
      error: { code: -32700, message: 'Parse error' },
    });
  }
});

rl.on('close', () => {
  process.exit(0);
});

// Handle process signals
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});

console.error('Mock MCP server ready');
