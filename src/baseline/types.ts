/**
 * Baseline types for drift detection.
 */

import type { ToolProfile } from '../interview/types.js';
import type {
  ResponseFingerprint,
  InferredSchema,
  ErrorPattern,
} from './response-fingerprint.js';

/**
 * Severity of a change.
 * Used consistently throughout the codebase for change classification.
 *
 * - 'none': No change detected
 * - 'info': Minor change (description updates, new optional params)
 * - 'warning': Moderate change (new error patterns, response structure shifts)
 * - 'breaking': Critical change (removed tools, changed required params, type changes)
 */
export type ChangeSeverity = 'none' | 'info' | 'warning' | 'breaking';

/**
 * Aspect of tool behavior that changed.
 */
export type BehaviorAspect =
  | 'response_format'
  | 'response_structure'
  | 'error_handling'
  | 'error_pattern'
  | 'security'
  | 'performance'
  | 'schema'
  | 'description';

/**
 * A single behavioral assertion about a tool.
 */
export interface BehavioralAssertion {
  tool: string;
  aspect: BehaviorAspect;
  assertion: string;
  evidence?: string;
  isPositive: boolean;
}

/**
 * A change detected between baselines.
 */
export interface BehaviorChange {
  tool: string;
  aspect: BehaviorAspect;
  before: string;
  after: string;
  /** Severity level of the change (unified with ChangeSeverity) */
  severity: ChangeSeverity;
  description: string;
}

/**
 * Changes detected for a single tool.
 */
export interface ToolDiff {
  tool: string;
  changes: BehaviorChange[];
  schemaChanged: boolean;
  descriptionChanged: boolean;
  /** Whether response structure changed (contract mode) */
  responseStructureChanged: boolean;
  /** Whether error patterns changed (contract mode) */
  errorPatternsChanged: boolean;
  previous?: ToolProfile;
  current?: ToolProfile;
}

/**
 * Complete diff between two baselines.
 */
export interface BehavioralDiff {
  toolsAdded: string[];
  toolsRemoved: string[];
  toolsModified: ToolDiff[];
  behaviorChanges: BehaviorChange[];
  severity: ChangeSeverity;
  breakingCount: number;
  warningCount: number;
  infoCount: number;
  summary: string;
  /** Version compatibility information for the compared baselines */
  versionCompatibility?: VersionCompatibilityInfo;
}

/**
 * Version compatibility information included in diff results.
 */
export interface VersionCompatibilityInfo {
  /** Whether the versions are compatible for comparison */
  compatible: boolean;
  /** Warning message if versions differ */
  warning: string | null;
  /** Source baseline format version */
  sourceVersion: string;
  /** Target baseline format version */
  targetVersion: string;
}

/**
 * Tool fingerprint for comparison.
 */
export interface ToolFingerprint {
  name: string;
  description: string;
  schemaHash: string;
  /** Full input schema for the tool (preserved for cloud upload) */
  inputSchema?: Record<string, unknown>;
  assertions: BehavioralAssertion[];
  securityNotes: string[];
  limitations: string[];

  // Response fingerprinting (contract mode enhancement)
  /** Fingerprint of the tool's response structure */
  responseFingerprint?: ResponseFingerprint;
  /** Inferred JSON schema of the tool's output */
  inferredOutputSchema?: InferredSchema;
  /** Normalized error patterns observed during testing */
  errorPatterns?: ErrorPattern[];

  // Deprecation lifecycle fields
  /** Whether this tool is deprecated */
  deprecated?: boolean;
  /** When the tool was marked as deprecated */
  deprecatedAt?: Date;
  /** Deprecation notice/message for consumers */
  deprecationNotice?: string;
  /** Planned removal date for the tool */
  removalDate?: Date;
  /** Suggested replacement tool name */
  replacementTool?: string;

  // Performance baseline fields
  /** Baseline p50 latency in milliseconds */
  baselineP50Ms?: number;
  /** Baseline p95 latency in milliseconds */
  baselineP95Ms?: number;
  /** Baseline success rate (0-1) */
  baselineSuccessRate?: number;
}

/**
 * Server fingerprint for baseline comparison.
 */
export interface ServerFingerprint {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: string[];
}

/**
 * Mode used to create the baseline.
 * - document: Created with LLM analysis (rich behavioral data)
 * - contract: Created without LLM (CI mode, contract data only)
 */
export type BaselineMode = 'document' | 'contract';

/**
 * Baseline for an MCP server.
 */
export interface BehavioralBaseline {
  /** Format version using semantic versioning (e.g., "1.0.0") */
  version: string;
  createdAt: Date;
  mode?: BaselineMode;
  serverCommand: string;
  server: ServerFingerprint;
  tools: ToolFingerprint[];
  summary: string;
  assertions: BehavioralAssertion[];
  workflowSignatures?: WorkflowSignature[];
  integrityHash: string;
}

/**
 * Workflow signature for baseline tracking.
 */
export interface WorkflowSignature {
  id: string;
  name: string;
  toolSequence: string[];
  succeeded: boolean;
  summary?: string;
}

/**
 * Options for baseline comparison.
 */
export interface CompareOptions {
  ignoreSchemaChanges?: boolean;
  ignoreDescriptionChanges?: boolean;
  /** Ignore changes in response structure fingerprints */
  ignoreResponseStructureChanges?: boolean;
  /** Ignore changes in error patterns */
  ignoreErrorPatternChanges?: boolean;
  minimumSeverity?: ChangeSeverity;
  tools?: string[];
  /** Force comparison even if baseline versions are incompatible */
  ignoreVersionMismatch?: boolean;
}
