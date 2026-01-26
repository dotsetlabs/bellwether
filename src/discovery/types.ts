import type {
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPServerInfo,
  MCPServerCapabilities,
} from '../transport/types.js';

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

  /** List of available resources */
  resources: MCPResource[];

  /** Timestamp of discovery */
  timestamp: Date;

  /** Command used to start the server */
  serverCommand: string;

  /** Arguments passed to the server */
  serverArgs: string[];

  /** Transport-level errors captured during discovery */
  transportErrors?: TransportErrorRecord[];

  /** Warnings about potential issues */
  warnings?: DiscoveryWarning[];
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

/**
 * Classification of transport-level errors.
 * Used to differentiate between server bugs, protocol issues, and environment problems.
 */
export type TransportErrorCategory =
  | 'invalid_json'          // Server output invalid JSON on stdout
  | 'buffer_overflow'       // Response too large / buffer overflow
  | 'connection_refused'    // Server process failed to start
  | 'connection_lost'       // Server process died unexpectedly
  | 'protocol_violation'    // Invalid MCP protocol message
  | 'timeout'              // Request timed out
  | 'shutdown_error'       // Error during graceful shutdown
  | 'unknown';             // Unclassified error

/**
 * Record of a transport-level error that occurred during MCP communication.
 */
export interface TransportErrorRecord {
  /** When the error occurred */
  timestamp: Date;
  /** Classification of the error */
  category: TransportErrorCategory;
  /** Human-readable error message */
  message: string;
  /** Original error message (if available) */
  rawError?: string;
  /** The operation being performed when error occurred */
  operation?: string;
  /** Whether this error is likely a server bug vs environment/config issue */
  likelyServerBug: boolean;
}

/**
 * Warning about potential issues discovered during server inspection.
 */
export interface DiscoveryWarning {
  /** Warning severity level */
  level: 'info' | 'warning' | 'error';
  /** Warning message */
  message: string;
  /** Recommendation for addressing the warning */
  recommendation?: string;
}
