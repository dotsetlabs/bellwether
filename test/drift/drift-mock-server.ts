#!/usr/bin/env node
/**
 * Fully configurable MCP mock server for drift detection integration tests.
 *
 * Reads a single DRIFT_CONFIG env var containing a JSON blob with complete
 * server configuration. Unlike the existing mock server (which hardcodes
 * resources/templates to empty arrays), this one is configurable in every
 * dimension.
 *
 * Usage:
 *   DRIFT_CONFIG='{ ... }' node --import tsx drift-mock-server.ts
 */

import * as readline from 'readline';

// ---------------------------------------------------------------------------
// Inline types — standalone to avoid coupling with src/
// ---------------------------------------------------------------------------

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface DriftTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  title?: string;
  outputSchema?: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  execution?: { taskSupport?: string };
}

interface DriftPrompt {
  name: string;
  description?: string;
  title?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

interface DriftResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  title?: string;
  annotations?: { audience?: string[]; priority?: number; lastModified?: string };
  size?: number;
}

interface DriftResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

interface DriftConfig {
  serverInfo: { name: string; version: string };
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  instructions?: string;
  tools: DriftTool[];
  prompts: DriftPrompt[];
  resources: DriftResource[];
  resourceTemplates: DriftResourceTemplate[];
  toolResponses?: Record<string, { text: string; isError?: boolean }>;
}

// ---------------------------------------------------------------------------
// Parse config
// ---------------------------------------------------------------------------

const rawConfig = process.env.DRIFT_CONFIG;
if (!rawConfig) {
  console.error('DRIFT_CONFIG env var is required');
  process.exit(1);
}

let config: DriftConfig;
try {
  config = JSON.parse(rawConfig) as DriftConfig;
} catch (e) {
  console.error('Failed to parse DRIFT_CONFIG:', e);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// JSON-RPC plumbing
// ---------------------------------------------------------------------------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(response: JSONRPCResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function handleRequest(request: JSONRPCRequest): void {
  // Ignore notifications (no id)
  if (request.id === undefined || request.id === null) {
    return;
  }

  let response: JSONRPCResponse;

  try {
    switch (request.method) {
      case 'initialize': {
        const result: Record<string, unknown> = {
          protocolVersion: config.protocolVersion,
          capabilities: config.capabilities,
          serverInfo: config.serverInfo,
        };
        if (config.instructions !== undefined) {
          result.instructions = config.instructions;
        }
        response = { jsonrpc: '2.0', id: request.id, result };
        break;
      }

      case 'tools/list':
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: { tools: config.tools },
        };
        break;

      case 'prompts/list':
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: { prompts: config.prompts },
        };
        break;

      case 'resources/list':
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: { resources: config.resources },
        };
        break;

      case 'resources/templates/list':
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: { resourceTemplates: config.resourceTemplates },
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
}

function handleToolCall(request: JSONRPCRequest): JSONRPCResponse {
  const params = request.params as { name: string; arguments?: Record<string, unknown> };
  const toolName = params?.name;
  const args = params?.arguments ?? {};

  const tool = config.tools.find((t) => t.name === toolName);
  if (!tool) {
    return {
      jsonrpc: '2.0',
      id: request.id!,
      error: { code: -32602, message: `Unknown tool: ${toolName}` },
    };
  }

  // Check for custom response
  const custom = config.toolResponses?.[toolName];
  if (custom) {
    return {
      jsonrpc: '2.0',
      id: request.id!,
      result: {
        content: [{ type: 'text', text: custom.text }],
        isError: custom.isError ?? false,
      },
    };
  }

  // Generate generic response
  return {
    jsonrpc: '2.0',
    id: request.id!,
    result: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ tool: toolName, args, status: 'ok' }),
        },
      ],
      isError: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request = JSON.parse(trimmed) as JSONRPCRequest;
    handleRequest(request);
  } catch (error) {
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

process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});

console.error('Drift mock server ready');
