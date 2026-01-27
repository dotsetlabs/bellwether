/**
 * Bellwether - Interview MCP servers to generate behavioral documentation
 *
 * @packageDocumentation
 */

// Transport layer
export { MCPClient, type MCPClientOptions } from './transport/mcp-client.js';
export { BaseTransport, type BaseTransportConfig, type TransportType } from './transport/base-transport.js';
export { StdioTransport, type StdioTransportConfig } from './transport/stdio-transport.js';
export { SSETransport, type SSETransportConfig } from './transport/sse-transport.js';
export { HTTPTransport, type HTTPTransportConfig } from './transport/http-transport.js';
export type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  JSONRPCMessage,
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPServerCapabilities,
  MCPServerInfo,
  MCPInitializeResult,
  MCPToolCallResult,
  MCPResourceReadResult,
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
  PromptProfile,
  PromptInteraction,
  ResourceProfile,
  ResourceInteraction,
  ResourceQuestion,
} from './interview/types.js';

// LLM
export type { LLMClient, Message, CompletionOptions } from './llm/client.js';
export { OpenAIClient, type OpenAIClientOptions } from './llm/openai.js';

// Documentation
export { generateAgentsMd, generateContractMd, generateJsonReport } from './docs/generator.js';

// Config
export { loadConfig, ConfigNotFoundError } from './config/loader.js';
export type { BellwetherConfig } from './config/loader.js';
export { validateConfig, findConfigFile } from './config/validator.js';
export { generateConfigTemplate, generatePresetConfig, PRESETS } from './config/template.js';

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

// Scenarios
export {
  loadScenariosFromFile,
  tryLoadDefaultScenarios,
  generateSampleScenariosYaml,
  DEFAULT_SCENARIOS_FILE,
  evaluateAssertion,
  evaluateAssertions,
  getValueAtPath,
  formatAssertionResults,
} from './scenarios/index.js';
export type {
  TestScenario,
  PromptScenario,
  ScenarioAssertion,
  AssertionCondition,
  LoadedScenarios,
  AssertionResult,
  ScenarioResult,
} from './scenarios/index.js';

// Registry
export {
  RegistryClient,
  REGISTRY_BASE_URL,
  API_VERSION,
  generateRunCommand,
  generatePackageCommand,
  formatServerEntry,
  formatServerList,
} from './registry/index.js';
export type {
  RegistryRepository,
  RegistryPackageArgument,
  RegistryTransport,
  RegistryPackage,
  RegistryServerMeta,
  RegistryServer,
  RegistryServerEntry,
  RegistryResponseMetadata,
  RegistryServersResponse,
  ListServersOptions,
} from './registry/index.js';

// Benchmark (Tested with Bellwether)
export {
  generateBenchmarkResult,
  generateBenchmarkReport,
  generateBenchmarkBadge,
  generateBadgeUrl,
  generateBadgeMarkdown,
  isBenchmarkValid,
} from './benchmark/index.js';
export type {
  BenchmarkStatus,
  BenchmarkTier,
  BenchmarkResult,
  BenchmarkBadge,
  BenchmarkConfig,
  BenchmarkReport,
  BenchmarkSubmission,
} from './benchmark/index.js';
