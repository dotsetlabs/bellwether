import type { DiscoveryResult } from '../discovery/types.js';
import type {
  MCPToolCallResult,
  MCPPromptGetResult,
  MCPResourceReadResult,
} from '../transport/types.js';
import type { InferredSchema } from '../baseline/response-fingerprint.js';
import type { Persona, QuestionCategory } from '../persona/types.js';
import type {
  Workflow,
  WorkflowResult,
  WorkflowTimeoutConfig,
} from '../workflow/types.js';
import type { LoadedScenarios, ScenarioResult } from '../scenarios/types.js';
import type { ToolResponseCache } from '../cache/response-cache.js';

/**
 * Server context extracted during discovery/initial probing.
 * Used to generate contextually appropriate test cases.
 */
export interface ServerContext {
  /** Allowed directories for filesystem operations */
  allowedDirectories?: string[];
  /** Base URLs or hosts the server can access */
  allowedHosts?: string[];
  /** Any constraints discovered from initial tool calls */
  constraints?: string[];
  /** Server-specific hints extracted from tool descriptions */
  hints?: string[];
}

/**
 * Streaming callback for interview operations.
 * These callbacks provide real-time feedback during LLM operations.
 */
export interface InterviewStreamingCallbacks {
  /** Called when streaming starts for an operation (e.g., "question:toolName") */
  onStart?: (operation: string, context?: string) => void;
  /** Called with each chunk of streaming text */
  onChunk?: (chunk: string, operation: string) => void;
  /** Called when streaming completes with the full text */
  onComplete?: (text: string, operation: string) => void;
  /** Called if an error occurs during streaming */
  onError?: (error: Error, operation: string) => void;
}

/**
 * Configuration for workflow testing.
 */
export interface WorkflowConfig {
  /** Path to user-provided workflow YAML file */
  workflowsFile?: string;
  /** User-provided workflows (parsed from file or programmatically) */
  workflows?: Workflow[];
  /** Enable LLM-based workflow discovery */
  discoverWorkflows?: boolean;
  /** Maximum workflows to discover (default: 3) */
  maxDiscoveredWorkflows?: number;
  /** Skip workflow execution (discovery/load only) */
  skipWorkflowExecution?: boolean;
  /** Enable state tracking during workflow execution */
  enableStateTracking?: boolean;
  /** Timeout per workflow step in ms */
  stepTimeout?: number;
  /** Timeout configuration for workflow operations */
  timeouts?: WorkflowTimeoutConfig;
}

/**
 * Configuration for the interview process.
 */
export interface InterviewConfig {
  /** Maximum questions per tool (default: 3) */
  maxQuestionsPerTool: number;
  /** Timeout for tool calls in ms (default: 30000) */
  timeout: number;
  /** Whether to skip error handling tests */
  skipErrorTests: boolean;
  /** LLM model to use (optional - determined by LLM client if not specified) */
  model?: string;
  /** Personas to use for interviewing (default: technical_writer) */
  personas?: Persona[];
  /** Custom test scenarios loaded from YAML */
  customScenarios?: LoadedScenarios;
  /** Whether to only run custom scenarios (skip LLM-generated questions) */
  customScenariosOnly?: boolean;
  /** Timeout for resource reads in ms (default: 15000) */
  resourceTimeout?: number;
  /** Enable streaming output during LLM operations */
  enableStreaming?: boolean;
  /** Callbacks for streaming output */
  streamingCallbacks?: InterviewStreamingCallbacks;
  /** Enable parallel persona execution */
  parallelPersonas?: boolean;
  /** Maximum concurrent persona interviews (default: 3) */
  personaConcurrency?: number;
  /** Enable parallel tool testing (check mode only) */
  parallelTools?: boolean;
  /** Maximum concurrent tool tests (default: 4) */
  toolConcurrency?: number;
  /** Cache for tool responses and LLM analysis */
  cache?: ToolResponseCache;
  /** Workflow testing configuration */
  workflowConfig?: WorkflowConfig;
  /** Skip LLM analysis for fast CI runs (uses fallback questions, skips synthesis) */
  checkMode?: boolean;
  /** Server command (for metadata tracking) */
  serverCommand?: string;
  /** Number of warmup runs before timing samples (0-5, default: 1) */
  warmupRuns?: number;
  /** Skip tools that depend on external services (Plaid, Stripe, etc.) */
  externalServices?: ExternalServicesConfig;
  /** Response assertion configuration */
  assertions?: AssertionsConfig;
  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig;
  /** Stateful testing configuration */
  statefulTesting?: StatefulTestingConfig;
}

/**
 * Expected outcome for a test question.
 * - 'success': Test expects the tool to execute successfully
 * - 'error': Test expects the tool to reject/fail (validation test)
 * - 'either': Test outcome is acceptable either way
 */
export type ExpectedOutcome = 'success' | 'error' | 'either';

/**
 * A question to ask about a tool's behavior.
 */
export interface InterviewQuestion {
  /** Description of what this question tests */
  description: string;
  /** Category of question */
  category: QuestionCategory;
  /** Arguments to pass to the tool */
  args: Record<string, unknown>;
  /**
   * Expected outcome of this test.
   * Used to determine if the tool behaved correctly.
   * - 'success': Expects successful execution (happy path)
   * - 'error': Expects rejection/error (validation test)
   * - 'either': Either outcome is acceptable
   */
  expectedOutcome?: ExpectedOutcome;
  /** Semantic validation metadata (for tests generated from semantic type inference) */
  metadata?: {
    /** The inferred semantic type being tested */
    semanticType?: string;
    /** Expected behavior: 'reject' for invalid values, 'accept' for valid */
    expectedBehavior?: 'reject' | 'accept';
    /** Confidence level of the semantic type inference (0-1) */
    confidence?: number;
    /** Stateful testing metadata */
    stateful?: {
      /** Keys injected from prior tool outputs */
      usedKeys?: string[];
      /** Keys captured from this response */
      providedKeys?: string[];
    };
    /**
     * Whether this tool uses operation-based dispatch pattern.
     * Tools with this pattern have different required args per operation.
     */
    operationBased?: boolean;
    /** The parameter name that selects the operation (e.g., "operation", "action") */
    operationParam?: string;
    /** The parameter name that holds operation-specific args (e.g., "args", "params") */
    argsParam?: string;
    /**
     * Whether this tool requires prior state (session, chain, etc.).
     * These tools need an active session before they can work.
     */
    selfStateful?: boolean;
    /** Reason for self-stateful detection */
    selfStatefulReason?: string;
    /**
     * Whether this tool has complex array schemas requiring structured data.
     * Simple test data generation often fails for these tools.
     */
    hasComplexArrays?: boolean;
    /** Array parameters with complex item schemas */
    complexArrayParams?: string[];
  };
}

/**
 * Assessment of whether a tool interaction outcome matched expectations.
 */
export interface OutcomeAssessment {
  /** What outcome was expected */
  expected: ExpectedOutcome;
  /** What actually happened */
  actual: 'success' | 'error';
  /** Whether the tool behaved correctly (matches expectation) */
  correct: boolean;
  /** True if this was a validation test that correctly rejected invalid input */
  isValidationSuccess?: boolean;
}

/**
 * Result of asking a single question.
 */
export interface ToolInteraction {
  /** Name of the tool called */
  toolName: string;
  /** The question that was asked */
  question: InterviewQuestion;
  /** The tool's response */
  response: MCPToolCallResult | null;
  /** Error if the call failed */
  error: string | null;
  /** LLM analysis of the response */
  analysis: string;
  /** Total time taken in ms (includes tool call + LLM analysis) */
  durationMs: number;
  /** Time taken for tool execution only (MCP transport) in ms */
  toolExecutionMs?: number;
  /** Time taken for LLM analysis only in ms */
  llmAnalysisMs?: number;
  /** Persona that generated this interaction */
  personaId?: string;
  /** Outcome assessment - whether the result matched expectations */
  outcomeAssessment?: OutcomeAssessment;
  /** Response assertion results (semantic assertions) */
  assertionResults?: ResponseAssertionResult[];
  /** Whether all assertions passed for this interaction */
  assertionsPassed?: boolean;
  /** Whether the response was mocked */
  mocked?: boolean;
  /** External service that provided the mock (if mocked) */
  mockService?: string;
}

/**
 * Findings by persona for a tool.
 */
export interface PersonaFindings {
  /** Persona ID that generated these findings */
  personaId: string;
  /** Persona name */
  personaName: string;
  /** Behavioral notes from this persona */
  behavioralNotes: string[];
  /** Limitations found by this persona */
  limitations: string[];
  /** Security notes from this persona */
  securityNotes: string[];
}

/**
 * Classification of errors by source for a tool.
 */
export interface ErrorClassification {
  /** Number of errors attributed to external services (Plaid, Stripe, etc.) */
  externalServiceErrors: number;
  /** Number of errors attributed to environment/config issues (missing credentials) */
  environmentErrors: number;
  /** Number of errors that appear to be code bugs */
  codeBugErrors: number;
  /** Number of errors that couldn't be classified */
  unknownErrors: number;
  /** External services detected for this tool */
  detectedServices?: string[];
}

/**
 * Behavioral profile for a single tool.
 */
export interface ToolProfile {
  /** Tool name */
  name: string;
  /** Tool description from schema */
  description: string;
  /** Interactions during interview */
  interactions: ToolInteraction[];
  /** Synthesized behavioral notes (aggregated) */
  behavioralNotes: string[];
  /** Discovered limitations (aggregated) */
  limitations: string[];
  /** Security considerations (aggregated) */
  securityNotes: string[];
  /** Findings broken down by persona */
  findingsByPersona?: PersonaFindings[];
  /** Error classification - separates tool correctness from environment setup issues */
  errorClassification?: ErrorClassification;
  /** Whether this tool was skipped */
  skipped?: boolean;
  /** Reason for skipping this tool */
  skipReason?: string;
  /** Whether this tool used mocked responses */
  mocked?: boolean;
  /** Mocked service name (if mocked) */
  mockService?: string;
  /** Aggregated response schema for assertions */
  responseSchema?: ResponseSchema;
  /** Assertion summary for this tool */
  assertionSummary?: AssertionSummary;
  /** Dependency info for stateful testing */
  dependencyInfo?: ToolDependencyInfo;
}

/**
 * A question/test case for a prompt.
 */
export interface PromptQuestion {
  /** Description of what this test case evaluates */
  description: string;
  /** Arguments to pass to the prompt */
  args: Record<string, string>;
}

/**
 * Result of testing a single prompt invocation.
 */
export interface PromptInteraction {
  /** Name of the prompt */
  promptName: string;
  /** The test case */
  question: PromptQuestion;
  /** The prompt's response (rendered messages) */
  response: MCPPromptGetResult | null;
  /** Error if the call failed */
  error: string | null;
  /** LLM analysis of the response */
  analysis: string;
  /** Time taken in ms */
  durationMs: number;
}

/**
 * Behavioral profile for a single prompt.
 */
export interface PromptProfile {
  /** Prompt name */
  name: string;
  /** Prompt description */
  description: string;
  /** Arguments the prompt accepts */
  arguments: Array<{ name: string; description?: string; required?: boolean }>;
  /** Interactions during interview */
  interactions: PromptInteraction[];
  /** Synthesized behavioral notes */
  behavioralNotes: string[];
  /** Discovered limitations */
  limitations: string[];
  /** Example rendered output */
  exampleOutput?: string;
}

/**
 * A question/test case for a resource.
 */
export interface ResourceQuestion {
  /** Description of what this test evaluates */
  description: string;
  /** Category of test */
  category: QuestionCategory;
}

/**
 * Result of reading a single resource.
 */
export interface ResourceInteraction {
  /** URI of the resource */
  resourceUri: string;
  /** Name of the resource */
  resourceName: string;
  /** The test case */
  question: ResourceQuestion;
  /** The resource's content */
  response: MCPResourceReadResult | null;
  /** Error if the read failed */
  error: string | null;
  /** LLM analysis of the response */
  analysis: string;
  /** Time taken in ms */
  durationMs: number;
}

/**
 * Behavioral profile for a single resource.
 */
export interface ResourceProfile {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name: string;
  /** Resource description */
  description: string;
  /** MIME type */
  mimeType?: string;
  /** Interactions during interview */
  interactions: ResourceInteraction[];
  /** Synthesized behavioral notes */
  behavioralNotes: string[];
  /** Discovered limitations */
  limitations: string[];
  /** Content preview (truncated if large) */
  contentPreview?: string;
}

/**
 * Complete interview result.
 */
export interface InterviewResult {
  /** Original discovery result */
  discovery: DiscoveryResult;
  /** Profile for each tool */
  toolProfiles: ToolProfile[];
  /** Profile for each prompt */
  promptProfiles?: PromptProfile[];
  /** Profile for each resource */
  resourceProfiles?: ResourceProfile[];
  /** Workflow execution results */
  workflowResults?: WorkflowResult[];
  /** Custom scenario results (if scenarios were provided) */
  scenarioResults?: ScenarioResult[];
  /** Overall behavioral summary */
  summary: string;
  /** Overall limitations */
  limitations: string[];
  /** Overall recommendations */
  recommendations: string[];
  /** Interview metadata */
  metadata: InterviewMetadata;
}

/**
 * Summary of a persona used in the interview.
 */
export interface PersonaSummary {
  /** Persona ID */
  id: string;
  /** Persona name */
  name: string;
  /** Questions asked by this persona */
  questionsAsked: number;
  /** Tool calls made for this persona */
  toolCallCount: number;
  /** Errors encountered for this persona */
  errorCount: number;
}

/**
 * Summary of workflow execution in the interview.
 */
export interface WorkflowSummary {
  /** Total workflows executed */
  workflowCount: number;
  /** Number of successful workflows */
  successfulCount: number;
  /** Number of failed workflows */
  failedCount: number;
  /** Number discovered via LLM */
  discoveredCount: number;
  /** Number loaded from file */
  loadedCount: number;
}

export interface InterviewMetadata {
  /** Start time */
  startTime: Date;
  /** End time */
  endTime: Date;
  /** Total duration in ms */
  durationMs: number;
  /** Number of tool calls made */
  toolCallCount: number;
  /** Number of resource reads made */
  resourceReadCount?: number;
  /** Number of errors encountered */
  errorCount: number;
  /** LLM model used */
  model?: string;
  /** Personas used in the interview */
  personas?: PersonaSummary[];
  /** Workflow execution summary */
  workflows?: WorkflowSummary;
  /** Server command used to start the MCP server */
  serverCommand?: string;
  /** Rate limit events observed during the interview */
  rateLimit?: RateLimitSummary;
  /** External service handling summary */
  externalServices?: ExternalServiceSummary;
  /** Assertion summary across tools */
  assertions?: AssertionSummary;
  /** Stateful testing summary */
  statefulTesting?: StatefulTestingSummary;
}

/**
 * Response assertion types for semantic validation.
 */
export type ResponseAssertionType =
  | 'is_json'
  | 'matches_schema'
  | 'contains_fields'
  | 'not_empty'
  | 'contains_text';

/**
 * Result of a response assertion.
 */
export interface ResponseAssertionResult {
  /** Assertion type */
  type: ResponseAssertionType;
  /** Whether the assertion passed */
  passed: boolean;
  /** Optional description or failure message */
  message?: string;
  /** Expected value (if applicable) */
  expected?: unknown;
  /** Actual value (if applicable) */
  actual?: unknown;
}

/**
 * Inferred response schema for semantic assertions.
 */
export interface ResponseSchema {
  inferredType: 'text' | 'json' | 'markdown' | 'binary';
  jsonSchema?: InferredSchema;
  markdownStructure?: {
    hasHeaders: boolean;
    hasTables: boolean;
    hasCodeBlocks: boolean;
  };
  sampleFingerprints: string[];
}

/**
 * Summary of assertion results.
 */
export interface AssertionSummary {
  total: number;
  passed: number;
  failed: number;
}

/**
 * Configuration for response assertions.
 */
export interface AssertionsConfig {
  enabled: boolean;
  /** Strict mode fails on assertion violations */
  strict: boolean;
  /** Infer schemas from responses */
  infer: boolean;
}

/**
 * Rate limiting configuration.
 */
export interface RateLimitConfig {
  enabled: boolean;
  requestsPerSecond: number;
  burstLimit: number;
  backoffStrategy: 'linear' | 'exponential';
  maxRetries: number;
}

/**
 * Stateful testing configuration.
 */
export interface StatefulTestingConfig {
  enabled: boolean;
  maxChainLength: number;
  shareOutputsBetweenTools: boolean;
}

/**
 * External service configuration per service.
 */
export interface ExternalServiceConfig {
  enabled?: boolean;
  sandboxCredentials?: Record<string, string>;
}

/**
 * External service handling configuration.
 */
export interface ExternalServicesConfig {
  mode: 'skip' | 'mock' | 'fail';
  services?: Record<string, ExternalServiceConfig>;
}

/**
 * Dependency info for stateful testing.
 */
export interface ToolDependencyInfo {
  tool: string;
  dependsOn: string[];
  providesOutputFor: string[];
  sequencePosition: number;
}

/**
 * Summary of rate limiting events.
 */
export interface RateLimitSummary {
  totalEvents: number;
  totalRetries: number;
  tools: string[];
}

/**
 * Summary of external service handling.
 */
export interface ExternalServiceSummary {
  mode: 'skip' | 'mock' | 'fail';
  unconfiguredServices: string[];
  skippedTools: string[];
  mockedTools: string[];
}

/**
 * Summary of stateful testing.
 */
export interface StatefulTestingSummary {
  enabled: boolean;
  toolCount: number;
  dependencyCount: number;
  maxChainLength: number;
}
