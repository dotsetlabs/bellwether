/**
 * E2E Test Mocks
 *
 * Provides mock servers and simulators for E2E testing.
 */

// Drift Simulator
export {
  simulateDrift,
  simulatePromptDrift,
  createDriftedMockEnv,
  createTestTool,
  createTestPrompt,
  getStandardTools,
  getFullTools,
  getStandardPrompts,
  // Pre-built drift scenarios
  newToolDrift,
  removedToolDrift,
  descriptionChangeDrift,
  newRequiredParamDrift,
  newOptionalParamDrift,
  paramTypeChangeDrift,
  breakingDrift,
  renamedToolDrift,
  // Re-exported tools
  weatherTool,
  calculatorTool,
  readFileTool,
  queryTool,
  noParamsTool,
  minimalTool,
  standardToolSet,
  fullToolSet,
  samplePrompts,
  type DriftConfig,
} from './drift-simulator.js';

// Mock LLM Server
export {
  createMockLLMServer,
  createSimpleMockLLMServer,
  createFailingMockLLMServer,
  createInterviewResponses,
  type MockLLMConfig,
  type MockLLMServer,
  type RequestRecord,
} from './mock-llm-server.js';

// Mock Registry Server
export {
  createMockRegistryServer,
  createCustomRegistryServer,
  createEmptyRegistryServer,
  createFailingRegistryServer,
  defaultServers,
  type MockRegistryConfig,
  type MockRegistryServer,
  type RegistryServer,
} from './mock-registry-server.js';
