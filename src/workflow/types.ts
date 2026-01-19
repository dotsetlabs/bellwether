/**
 * Workflow types - defines chained tool execution patterns.
 */

import type { MCPToolCallResult } from '../transport/types.js';

/**
 * A workflow defines a sequence of tool calls that represent
 * a realistic usage pattern.
 */
export interface Workflow {
  /** Unique identifier for the workflow */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the workflow accomplishes */
  description: string;
  /** Ordered sequence of steps */
  steps: WorkflowStep[];
  /** Expected final outcome description */
  expectedOutcome: string;
  /** Whether this workflow was auto-discovered */
  discovered?: boolean;
}

/**
 * A single step in a workflow.
 */
export interface WorkflowStep {
  /** Tool to call for this step */
  tool: string;
  /** Description of what this step does */
  description: string;
  /** Static arguments to pass to the tool */
  args?: Record<string, unknown>;
  /** Dynamic argument mapping from previous step outputs */
  argMapping?: ArgMapping;
  /** Assertions to verify after this step */
  assertions?: Assertion[];
  /** Whether this step is optional (workflow continues if it fails) */
  optional?: boolean;
}

/**
 * Maps parameter names to JSONPath expressions referencing previous step outputs.
 * Example: { "flightId": "$steps[0].result.flights[0].id" }
 */
export type ArgMapping = Record<string, string>;

/**
 * An assertion to verify after a step.
 */
export interface Assertion {
  /** JSONPath expression to evaluate */
  path: string;
  /** Expected condition */
  condition: 'exists' | 'equals' | 'contains' | 'truthy' | 'type';
  /** Expected value (for equals/contains/type) */
  value?: unknown;
  /** Error message if assertion fails */
  message?: string;
}

/**
 * Result of executing a single workflow step.
 */
export interface WorkflowStepResult {
  /** The step that was executed */
  step: WorkflowStep;
  /** Step index in the workflow */
  stepIndex: number;
  /** Whether the step succeeded */
  success: boolean;
  /** The tool call response */
  response: MCPToolCallResult | null;
  /** Error message if the step failed */
  error?: string;
  /** Resolved arguments (after applying mapping) */
  resolvedArgs: Record<string, unknown>;
  /** Assertion results */
  assertionResults?: AssertionResult[];
  /** Time taken in ms */
  durationMs: number;
  /** LLM analysis of this step */
  analysis?: string;
}

/**
 * Result of an assertion check.
 */
export interface AssertionResult {
  /** The assertion that was checked */
  assertion: Assertion;
  /** Whether the assertion passed */
  passed: boolean;
  /** Actual value found */
  actualValue?: unknown;
  /** Error message if failed */
  message?: string;
}

/**
 * Complete result of executing a workflow.
 */
export interface WorkflowResult {
  /** The workflow that was executed */
  workflow: Workflow;
  /** Results for each step */
  steps: WorkflowStepResult[];
  /** Whether the entire workflow succeeded */
  success: boolean;
  /** Reason for failure if unsuccessful */
  failureReason?: string;
  /** Index of the step that failed (if any) */
  failedStepIndex?: number;
  /** Total time taken in ms */
  durationMs: number;
  /** Data flow between steps (for visualization) */
  dataFlow?: DataFlowEdge[];
  /** LLM-generated summary of what the workflow demonstrated */
  summary?: string;
  /** State tracking information (if enabled) */
  stateTracking?: WorkflowStateTracking;
}

/**
 * Represents data flowing between workflow steps.
 */
export interface DataFlowEdge {
  /** Source step index */
  fromStep: number;
  /** Target step index */
  toStep: number;
  /** JSONPath of source data */
  sourcePath: string;
  /** Parameter name at target */
  targetParam: string;
  /** Sample value (for documentation) */
  sampleValue?: unknown;
}

/**
 * YAML format for user-defined workflows.
 */
export interface WorkflowYAML {
  id: string;
  name: string;
  description?: string;
  expectedOutcome?: string;
  steps: Array<{
    tool: string;
    description?: string;
    args?: Record<string, unknown>;
    argMapping?: Record<string, string>;
    optional?: boolean;
    assertions?: Array<{
      path: string;
      condition: string;
      value?: unknown;
      message?: string;
    }>;
  }>;
}

/**
 * Workflow execution progress information.
 */
export interface WorkflowProgress {
  /** Current phase of execution */
  phase: 'starting' | 'executing' | 'analyzing' | 'summarizing' | 'complete';
  /** Workflow being executed */
  workflow: Workflow;
  /** Current step index (0-based) */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Current step being executed */
  currentStepInfo?: WorkflowStep;
  /** Steps completed so far */
  stepsCompleted: number;
  /** Number of steps that failed */
  stepsFailed: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

/**
 * Callback for workflow progress updates.
 */
export type WorkflowProgressCallback = (progress: WorkflowProgress) => void;

/**
 * Options for workflow execution.
 */
export interface WorkflowExecutorOptions {
  /** Whether to continue after a step fails */
  continueOnError?: boolean;
  /** Timeout per step in ms (default: 30000) */
  stepTimeout?: number;
  /** Whether to generate LLM analysis for each step */
  analyzeSteps?: boolean;
  /** Whether to generate an overall summary */
  generateSummary?: boolean;
  /** Progress callback for tracking execution */
  onProgress?: WorkflowProgressCallback;
  /** State tracking configuration */
  stateTracking?: StateTrackingOptions;
  /** Timeout configuration for various operations */
  timeouts?: WorkflowTimeoutConfig;
  /** AbortSignal for cancelling workflow execution */
  signal?: AbortSignal;
}

/**
 * Timeout configuration for workflow operations.
 */
export interface WorkflowTimeoutConfig {
  /** Timeout for individual tool calls in ms (default: 30000) */
  toolCall?: number;
  /** Timeout for state snapshot operations in ms (default: 30000) */
  stateSnapshot?: number;
  /** Timeout for individual probe tool calls in ms (default: 5000) */
  probeTool?: number;
  /** Timeout for LLM analysis calls in ms (default: 30000) */
  llmAnalysis?: number;
  /** Timeout for LLM summary generation in ms (default: 45000) */
  llmSummary?: number;
}

/**
 * Options for workflow discovery.
 */
export interface WorkflowDiscoveryOptions {
  /** Maximum workflows to discover */
  maxWorkflows?: number;
  /** Minimum steps per workflow */
  minSteps?: number;
  /** Maximum steps per workflow */
  maxSteps?: number;
}
/**
 * Role of a tool in state management.
 */
export type ToolStateRole = 'reader' | 'writer' | 'both' | 'unknown';

/**
 * Information about how a tool interacts with state.
 */
export interface ToolStateInfo {
  /** Tool name */
  tool: string;
  /** Role in state management */
  role: ToolStateRole;
  /** Types of state this tool affects (e.g., "files", "database", "cache") */
  stateTypes?: string[];
  /** Whether this tool can be used as a state probe */
  isProbe: boolean;
  /** Confidence in this classification (0-1) */
  confidence: number;
}

/**
 * A snapshot of state at a point in time.
 */
export interface StateSnapshot {
  /** When the snapshot was taken */
  timestamp: Date;
  /** Step index when snapshot was taken (-1 for before workflow) */
  afterStepIndex: number;
  /** Tool used to capture this snapshot (the probe) */
  probeTool?: string;
  /** The captured state data */
  data: unknown;
  /** Hash of the state for quick comparison */
  hash: string;
}

/**
 * Describes a state change between two snapshots.
 */
export interface StateChange {
  /** Type of change */
  type: 'created' | 'modified' | 'deleted';
  /** Path to the changed element (JSONPath-like) */
  path: string;
  /** Value before the change */
  before?: unknown;
  /** Value after the change */
  after?: unknown;
  /** Which step caused this change */
  causedByStep: number;
}

/**
 * Dependency between steps based on state.
 */
export interface StateDependency {
  /** Step that produces state */
  producerStep: number;
  /** Step that consumes state */
  consumerStep: number;
  /** Type of state (e.g., "file", "resource", "entity") */
  stateType: string;
  /** Description of the dependency */
  description: string;
  /** Whether this dependency was verified during execution */
  verified: boolean;
}

/**
 * Complete state tracking result for a workflow.
 */
export interface WorkflowStateTracking {
  /** State snapshots taken during workflow execution */
  snapshots: StateSnapshot[];
  /** Detected state changes */
  changes: StateChange[];
  /** Inferred dependencies between steps */
  dependencies: StateDependency[];
  /** Tools classified by their state role */
  toolRoles: ToolStateInfo[];
  /** Summary of state behavior */
  summary?: string;
}

/**
 * Options for state tracking during workflow execution.
 */
export interface StateTrackingOptions {
  /** Whether to enable state tracking */
  enabled?: boolean;
  /** Tools to use as state probes (if not specified, auto-detect) */
  probeTools?: string[];
  /** Take initial snapshot before workflow starts */
  snapshotBefore?: boolean;
  /** Take final snapshot after workflow completes */
  snapshotAfter?: boolean;
  /** Take snapshot after each step */
  snapshotAfterEachStep?: boolean;
}

/**
 * Extended workflow step with state hints.
 */
export interface WorkflowStepWithState extends WorkflowStep {
  /** Expected state role for this step's tool */
  stateHint?: {
    role: ToolStateRole;
    stateTypes?: string[];
  };
}
