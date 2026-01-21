/**
 * Drift Simulator for E2E tests.
 *
 * Generates modified tool sets to test drift detection capabilities.
 */

import type { MCPTool, MCPPrompt } from '../../../src/transport/types.js';
import {
  standardToolSet,
  fullToolSet,
  samplePrompts,
  weatherTool,
  calculatorTool,
  readFileTool,
  queryTool,
  noParamsTool,
  minimalTool,
} from '../../fixtures/sample-tools.js';

export interface DriftConfig {
  /** Tools to add to the set */
  addTools?: MCPTool[];
  /** Names of tools to remove */
  removeToolNames?: string[];
  /** Modifications to apply to existing tools */
  modifyTools?: Array<{
    name: string;
    changes: Partial<MCPTool>;
  }>;
  /** Schema modifications to apply */
  modifySchemas?: Array<{
    toolName: string;
    schemaChanges: object;
  }>;
  /** Prompts to add */
  addPrompts?: MCPPrompt[];
  /** Names of prompts to remove */
  removePromptNames?: string[];
}

/**
 * Apply drift to a set of tools.
 */
export function simulateDrift(
  baseTools: MCPTool[],
  drift: DriftConfig
): MCPTool[] {
  let tools = [...baseTools];

  // Remove tools
  if (drift.removeToolNames?.length) {
    tools = tools.filter((t) => !drift.removeToolNames!.includes(t.name));
  }

  // Add tools
  if (drift.addTools?.length) {
    tools = [...tools, ...drift.addTools];
  }

  // Modify tools
  if (drift.modifyTools?.length) {
    tools = tools.map((tool) => {
      const modification = drift.modifyTools!.find((m) => m.name === tool.name);
      if (modification) {
        return { ...tool, ...modification.changes };
      }
      return tool;
    });
  }

  // Modify schemas
  if (drift.modifySchemas?.length) {
    tools = tools.map((tool) => {
      const schemaChange = drift.modifySchemas!.find(
        (s) => s.toolName === tool.name
      );
      if (schemaChange && tool.inputSchema) {
        return {
          ...tool,
          inputSchema: {
            ...tool.inputSchema,
            ...schemaChange.schemaChanges,
          },
        };
      }
      return tool;
    });
  }

  return tools;
}

/**
 * Apply drift to a set of prompts.
 */
export function simulatePromptDrift(
  basePrompts: MCPPrompt[],
  drift: DriftConfig
): MCPPrompt[] {
  let prompts = [...basePrompts];

  // Remove prompts
  if (drift.removePromptNames?.length) {
    prompts = prompts.filter((p) => !drift.removePromptNames!.includes(p.name));
  }

  // Add prompts
  if (drift.addPrompts?.length) {
    prompts = [...prompts, ...drift.addPrompts];
  }

  return prompts;
}

/**
 * Create environment variables for the mock MCP server with drifted tools.
 */
export function createDriftedMockEnv(drift: DriftConfig): Record<string, string> {
  const tools = simulateDrift(standardToolSet, drift);
  const prompts = simulatePromptDrift(samplePrompts, drift);

  return {
    MOCK_TOOLS: JSON.stringify(tools),
    MOCK_PROMPTS: JSON.stringify(prompts),
  };
}

// Pre-built drift scenarios for common test cases

/**
 * Scenario: A new tool has been added.
 */
export const newToolDrift: DriftConfig = {
  addTools: [
    {
      name: 'search_files',
      description: 'Search for files matching a pattern',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern to match',
          },
          directory: {
            type: 'string',
            description: 'Directory to search in',
          },
        },
        required: ['pattern'],
      },
    },
  ],
};

/**
 * Scenario: A tool has been removed.
 */
export const removedToolDrift: DriftConfig = {
  removeToolNames: ['read_file'],
};

/**
 * Scenario: A tool description has changed.
 */
export const descriptionChangeDrift: DriftConfig = {
  modifyTools: [
    {
      name: 'get_weather',
      changes: {
        description: 'Get weather information for a location (enhanced with forecasts)',
      },
    },
  ],
};

/**
 * Scenario: A tool schema has a new required parameter.
 */
export const newRequiredParamDrift: DriftConfig = {
  modifySchemas: [
    {
      toolName: 'get_weather',
      schemaChanges: {
        required: ['location', 'units'],
      },
    },
  ],
};

/**
 * Scenario: A tool schema has a new optional parameter.
 */
export const newOptionalParamDrift: DriftConfig = {
  modifySchemas: [
    {
      toolName: 'get_weather',
      schemaChanges: {
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
          include_forecast: {
            type: 'boolean',
            description: 'Include 5-day forecast',
            default: false,
          },
        },
      },
    },
  ],
};

/**
 * Scenario: A parameter type has changed.
 */
export const paramTypeChangeDrift: DriftConfig = {
  modifySchemas: [
    {
      toolName: 'calculate',
      schemaChanges: {
        properties: {
          expression: {
            type: 'string',
            description: 'Mathematical expression to evaluate',
          },
          precision: {
            type: 'string', // Changed from number to string
            description: 'Decimal places for result',
            default: '2',
          },
        },
      },
    },
  ],
};

/**
 * Scenario: Multiple changes at once (breaking drift).
 */
export const breakingDrift: DriftConfig = {
  removeToolNames: ['read_file'],
  modifyTools: [
    {
      name: 'get_weather',
      changes: {
        description: 'Completely rewritten weather tool',
      },
    },
  ],
  modifySchemas: [
    {
      toolName: 'get_weather',
      schemaChanges: {
        required: ['location', 'api_key'], // Added required api_key
        properties: {
          location: {
            type: 'string',
            description: 'City name or zip code',
          },
          api_key: {
            type: 'string',
            description: 'API key for weather service',
          },
        },
      },
    },
  ],
};

/**
 * Scenario: Tool renamed (appears as add + remove).
 */
export const renamedToolDrift: DriftConfig = {
  removeToolNames: ['read_file'],
  addTools: [
    {
      name: 'file_read', // Renamed from read_file
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
    },
  ],
};

/**
 * Get the standard tool set.
 */
export function getStandardTools(): MCPTool[] {
  return [...standardToolSet];
}

/**
 * Get the full tool set including edge cases.
 */
export function getFullTools(): MCPTool[] {
  return [...fullToolSet];
}

/**
 * Get the sample prompts.
 */
export function getStandardPrompts(): MCPPrompt[] {
  return [...samplePrompts];
}

/**
 * Create a custom tool for testing.
 */
export function createTestTool(
  name: string,
  description: string,
  properties: Record<string, object> = {},
  required: string[] = []
): MCPTool {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      required,
    },
  };
}

/**
 * Create a custom prompt for testing.
 */
export function createTestPrompt(
  name: string,
  description: string,
  args: Array<{ name: string; description: string; required?: boolean }> = []
): MCPPrompt {
  return {
    name,
    description,
    arguments: args.map((a) => ({
      name: a.name,
      description: a.description,
      required: a.required ?? false,
    })),
  };
}

// Re-export individual tools for convenience
export {
  weatherTool,
  calculatorTool,
  readFileTool,
  queryTool,
  noParamsTool,
  minimalTool,
  standardToolSet,
  fullToolSet,
  samplePrompts,
};
