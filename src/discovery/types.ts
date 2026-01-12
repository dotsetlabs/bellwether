import type { MCPTool, MCPPrompt, MCPServerInfo, MCPServerCapabilities } from '../transport/types.js';

/**
 * Result of discovering an MCP server's capabilities.
 */
export interface DiscoveryResult {
  /** Server identification info */
  serverInfo: MCPServerInfo;

  /** Protocol version negotiated */
  protocolVersion: string;

  /** Server capabilities */
  capabilities: MCPServerCapabilities;

  /** List of available tools */
  tools: MCPTool[];

  /** List of available prompts */
  prompts: MCPPrompt[];

  /** Timestamp of discovery */
  timestamp: Date;

  /** Command used to start the server */
  serverCommand: string;

  /** Arguments passed to the server */
  serverArgs: string[];
}

/**
 * Detailed tool information with parsed schema.
 */
export interface ToolDetail {
  name: string;
  description: string;
  inputSchema: ToolInputSchema | null;
  requiredParams: string[];
  optionalParams: string[];
}

/**
 * Parsed JSON Schema for tool inputs.
 */
export interface ToolInputSchema {
  type: string;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface PropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: PropertySchema;
}
