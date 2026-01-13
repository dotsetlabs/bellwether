/**
 * Inquest - Interview MCP servers to generate behavioral documentation
 *
 * @packageDocumentation
 */

// Transport layer
export { MCPClient, type MCPClientOptions } from './transport/mcp-client.js';
export { StdioTransport, type TransportConfig } from './transport/stdio-transport.js';
export type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCMessage,
  MCPTool,
  MCPPrompt,
  MCPServerCapabilities,
  MCPServerInfo,
  MCPInitializeResult,
  MCPToolCallResult,
  MCPContentBlock,
} from './transport/types.js';

// Discovery
export { discover, parseToolDetail, summarizeDiscovery } from './discovery/discovery.js';
export type { DiscoveryResult, ToolDetail, ToolInputSchema } from './discovery/types.js';

// Interview
export { Interviewer, DEFAULT_CONFIG } from './interview/interviewer.js';
export { Orchestrator } from './interview/orchestrator.js';
export type {
  InterviewConfig,
  InterviewResult,
  InterviewQuestion,
  ToolProfile,
  ToolInteraction,
  InterviewMetadata,
} from './interview/types.js';

// LLM
export type { LLMClient, Message, CompletionOptions } from './llm/client.js';
export { OpenAIClient, type OpenAIClientOptions } from './llm/openai.js';

// Documentation
export { generateAgentsMd, generateJsonReport } from './docs/generator.js';

// Config
export { loadConfig, generateDefaultConfig, getDefaultConfig, DEFAULT_CONFIG as DEFAULT_FILE_CONFIG } from './config/loader.js';
export type { InquestConfig } from './config/loader.js';

// Logging
export {
  createLogger,
  getLogger,
  configureLogger,
  resetLogger,
  childLogger,
  startTiming,
  LOG_LEVEL_VALUES,
  isLevelEnabled,
} from './logging/logger.js';
export type { LogLevel, LoggerConfig, Logger, TimingResult } from './logging/logger.js';
