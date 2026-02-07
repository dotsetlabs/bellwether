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
 * MCP Protocol types (aligned with MCP specification 2025-11-25)
 */

/**
 * Icon for MCP entities (tools, resources, prompts, server).
 */
export interface MCPIcon {
  /** URI or data URI for the icon */
  src: string;
  /** MIME type of the icon */
  mimeType?: string;
  /** Supported sizes (e.g., ['16x16', '32x32']) */
  sizes?: string[];
  /** Theme hint for the icon */
  theme?: 'light' | 'dark';
}

/**
 * Annotations for content blocks and resources.
 * Provides metadata about intended audience, priority, and freshness.
 */
export interface MCPAnnotations {
  /** Intended audience for the content */
  audience?: ('user' | 'assistant')[];
  /** Priority hint (0.0 = lowest, 1.0 = highest) */
  priority?: number;
  /** ISO 8601 timestamp of when the content was last modified */
  lastModified?: string;
}

/**
 * Behavioral annotations for tools.
 * Provides hints about tool behavior to help clients make decisions.
 */
export interface MCPToolAnnotations {
  /** Human-readable title for the annotation group */
  title?: string;
  /** Whether the tool only reads data and does not modify state */
  readOnlyHint?: boolean;
  /** Whether the tool may perform destructive operations */
  destructiveHint?: boolean;
  /** Whether calling the tool multiple times with the same args has the same effect */
  idempotentHint?: boolean;
  /** Whether the tool interacts with entities outside the server's controlled environment */
  openWorldHint?: boolean;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** Human-readable title for the tool */
  title?: string;
  /** Icons for the tool */
  icons?: MCPIcon[];
  /** JSON Schema for the tool's output (structured content) */
  outputSchema?: Record<string, unknown>;
  /** Behavioral annotations/hints */
  annotations?: MCPToolAnnotations;
  /** Task execution configuration */
  execution?: { taskSupport?: 'forbidden' | 'optional' | 'required' };
  /** Extension metadata */
  _meta?: Record<string, unknown>;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
  /** Human-readable title for the prompt */
  title?: string;
  /** Icons for the prompt */
  icons?: MCPIcon[];
  /** Extension metadata */
  _meta?: Record<string, unknown>;
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
  /** Human-readable title for the argument */
  title?: string;
}

export interface MCPServerCapabilities {
  tools?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  /** Server supports completions (autocomplete) */
  completions?: Record<string, unknown>;
  /** Server supports task management */
  tasks?: Record<string, unknown>;
  /** Experimental/vendor-specific capabilities */
  experimental?: Record<string, unknown>;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  /** Human-readable title for the server */
  title?: string;
  /** Description of the server */
  description?: string;
  /** Icons for the server */
  icons?: MCPIcon[];
  /** Website URL for the server */
  websiteUrl?: string;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: MCPServerInfo;
  /** Server-provided instructions for the client */
  instructions?: string;
}

export interface MCPToolCallResult {
  content: MCPContentBlock[];
  isError?: boolean;
  /** Structured output content (validated against tool's outputSchema) */
  structuredContent?: Record<string, unknown>;
}

/**
 * MCP content block types per MCP specification (2025-11-25).
 * Supports: text, image, audio, resource (embedded), resource_link (reference)
 */
export interface MCPContentBlock {
  type: 'text' | 'image' | 'audio' | 'resource' | 'resource_link';
  /** Text content (for type: 'text') */
  text?: string;
  /** Base64-encoded binary data (for type: 'image', 'audio') */
  data?: string;
  /** MIME type of the content */
  mimeType?: string;
  /** URI reference (for type: 'resource_link') */
  uri?: string;
  /** Content/resource annotations */
  annotations?: MCPAnnotations;
  /** Extension metadata */
  _meta?: Record<string, unknown>;
  /** Embedded resource content (for type: 'resource') */
  resource?: MCPResourceContent;
  /** Resource name (for type: 'resource_link') */
  name?: string;
  /** Resource description (for type: 'resource_link') */
  description?: string;
}

export interface MCPToolsListResult {
  tools: MCPTool[];
  /** Cursor for pagination */
  nextCursor?: string;
}

export interface MCPPromptsListResult {
  prompts: MCPPrompt[];
  /** Cursor for pagination */
  nextCursor?: string;
}

/**
 * MCP Resource types
 */

export interface MCPResource {
  /** URI identifying the resource */
  uri: string;
  /** Human-readable name */
  name: string;
  /** Description of the resource */
  description?: string;
  /** MIME type of the resource content */
  mimeType?: string;
  /** Human-readable title for the resource */
  title?: string;
  /** Icons for the resource */
  icons?: MCPIcon[];
  /** Resource annotations */
  annotations?: MCPAnnotations;
  /** Size of the resource in bytes */
  size?: number;
  /** Extension metadata */
  _meta?: Record<string, unknown>;
}

export interface MCPResourcesListResult {
  resources: MCPResource[];
  /** Cursor for pagination */
  nextCursor?: string;
}

export interface MCPResourceReadResult {
  contents: MCPResourceContent[];
}

export interface MCPResourceContent {
  /** URI of the resource */
  uri: string;
  /** MIME type of the content */
  mimeType?: string;
  /** Text content (for text resources) */
  text?: string;
  /** Binary content as base64 (for binary resources) */
  blob?: string;
}

/**
 * MCP Resource Template for URI-templated resources.
 */
export interface MCPResourceTemplate {
  /** URI template (RFC 6570) */
  uriTemplate: string;
  /** Human-readable name */
  name: string;
  /** Human-readable title */
  title?: string;
  /** Description of the resource template */
  description?: string;
  /** Expected MIME type of resources matching this template */
  mimeType?: string;
  /** Icons for the resource template */
  icons?: MCPIcon[];
  /** Resource annotations */
  annotations?: MCPAnnotations;
  /** Extension metadata */
  _meta?: Record<string, unknown>;
}

export interface MCPResourceTemplatesListResult {
  resourceTemplates: MCPResourceTemplate[];
  /** Cursor for pagination */
  nextCursor?: string;
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: MCPPromptContent;
}

/**
 * MCP prompt content types per MCP specification (2025-11-25).
 * Same content types as MCPContentBlock.
 */
export interface MCPPromptContent {
  type: 'text' | 'image' | 'audio' | 'resource' | 'resource_link';
  /** Text content (for type: 'text') */
  text?: string;
  /** Base64-encoded binary data (for type: 'image', 'audio') */
  data?: string;
  /** MIME type of the content */
  mimeType?: string;
  /** URI reference (for type: 'resource_link') */
  uri?: string;
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
