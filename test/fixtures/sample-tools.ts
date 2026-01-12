/**
 * Sample MCP tool definitions for testing.
 */

import type { MCPTool, MCPPrompt } from '../../src/transport/types.js';

/**
 * A simple weather tool for basic testing.
 */
export const weatherTool: MCPTool = {
  name: 'get_weather',
  description: 'Get the current weather for a location',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name or zip code',
      },
      units: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'Temperature units',
        default: 'celsius',
      },
    },
    required: ['location'],
  },
};

/**
 * A calculator tool with multiple operations.
 */
export const calculatorTool: MCPTool = {
  name: 'calculate',
  description: 'Perform mathematical calculations',
  inputSchema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate',
      },
      precision: {
        type: 'number',
        description: 'Decimal places for result',
        default: 2,
      },
    },
    required: ['expression'],
  },
};

/**
 * A file reading tool for security testing.
 */
export const readFileTool: MCPTool = {
  name: 'read_file',
  description: 'Read contents of a file',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read',
      },
      encoding: {
        type: 'string',
        enum: ['utf-8', 'base64', 'binary'],
        default: 'utf-8',
      },
    },
    required: ['path'],
  },
};

/**
 * A database query tool for complex schema testing.
 */
export const queryTool: MCPTool = {
  name: 'query_database',
  description: 'Execute a read-only SQL query',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SQL SELECT query to execute',
      },
      database: {
        type: 'string',
        description: 'Database name',
      },
      timeout: {
        type: 'number',
        description: 'Query timeout in seconds',
        default: 30,
      },
      limit: {
        type: 'number',
        description: 'Maximum rows to return',
        default: 100,
      },
    },
    required: ['query', 'database'],
  },
};

/**
 * A tool with no parameters (edge case).
 */
export const noParamsTool: MCPTool = {
  name: 'get_timestamp',
  description: 'Get the current Unix timestamp',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * A tool with minimal schema (edge case).
 */
export const minimalTool: MCPTool = {
  name: 'ping',
  description: 'Check server health',
};

/**
 * Standard tool set for most tests.
 */
export const standardToolSet: MCPTool[] = [
  weatherTool,
  calculatorTool,
  readFileTool,
];

/**
 * Full tool set including edge cases.
 */
export const fullToolSet: MCPTool[] = [
  weatherTool,
  calculatorTool,
  readFileTool,
  queryTool,
  noParamsTool,
  minimalTool,
];

/**
 * Sample prompts for testing.
 */
export const samplePrompts: MCPPrompt[] = [
  {
    name: 'summarize',
    description: 'Summarize the given text',
    arguments: [
      {
        name: 'text',
        description: 'Text to summarize',
        required: true,
      },
      {
        name: 'max_length',
        description: 'Maximum summary length',
        required: false,
      },
    ],
  },
  {
    name: 'translate',
    description: 'Translate text to another language',
    arguments: [
      {
        name: 'text',
        description: 'Text to translate',
        required: true,
      },
      {
        name: 'target_language',
        description: 'Target language code',
        required: true,
      },
    ],
  },
];

/**
 * Mock server info for testing.
 */
export const mockServerInfo = {
  name: 'test-server',
  version: '1.0.0',
};

/**
 * Mock server capabilities.
 */
export const mockCapabilities = {
  tools: {},
  prompts: {},
};

/**
 * Create a mock initialization result.
 */
export function createMockInitResult() {
  return {
    protocolVersion: '2024-11-05',
    capabilities: mockCapabilities,
    serverInfo: mockServerInfo,
  };
}

/**
 * Create a mock tool call result.
 */
export function createMockToolResult(text: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text }],
    isError,
  };
}
