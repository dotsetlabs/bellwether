/**
 * JSON-RPC 2.0 types for MCP protocol communication.
 */

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export type JSONRPCMessage = JSONRPCRequest | JSONRPCResponse | JSONRPCNotification;

/**
 * MCP Protocol types
 */

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPServerCapabilities {
  tools?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  logging?: Record<string, unknown>;
}

export interface MCPServerInfo {
  name: string;
  version: string;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: MCPServerInfo;
}

export interface MCPToolCallResult {
  content: MCPContentBlock[];
  isError?: boolean;
}

export interface MCPContentBlock {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface MCPToolsListResult {
  tools: MCPTool[];
}

export interface MCPPromptsListResult {
  prompts: MCPPrompt[];
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: MCPPromptContent;
}

export interface MCPPromptContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface MCPPromptGetResult {
  description?: string;
  messages: MCPPromptMessage[];
}

/**
 * Type guards
 */

export function isRequest(msg: JSONRPCMessage): msg is JSONRPCRequest {
  return 'method' in msg && 'id' in msg && msg.id !== undefined;
}

export function isResponse(msg: JSONRPCMessage): msg is JSONRPCResponse {
  return 'id' in msg && ('result' in msg || 'error' in msg);
}

export function isNotification(msg: JSONRPCMessage): msg is JSONRPCNotification {
  return 'method' in msg && !('id' in msg && (msg as JSONRPCRequest).id !== undefined);
}
