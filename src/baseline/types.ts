/**
 * Behavioral baseline types for drift detection.
 */

import type { ToolProfile } from '../interview/types.js';

/**
 * Severity of a behavioral change.
 */
export type ChangeSeverity = 'none' | 'info' | 'warning' | 'breaking';

/**
 * Aspect of tool behavior that changed.
 */
export type BehaviorAspect =
  | 'response_format'
  | 'error_handling'
  | 'security'
  | 'performance'
  | 'schema'
  | 'description';

/**
 * Significance of a change.
 */
export type ChangeSignificance = 'low' | 'medium' | 'high';

/**
 * Method used to detect a change.
 * - structural: Deterministic comparison (schema, tool presence, etc.)
 * - semantic: LLM-based comparison (behavioral assertions, security notes, etc.)
 */
export type ComparisonMethod = 'structural' | 'semantic';

/**
 * A factor contributing to confidence score calculation.
 */
export interface ConfidenceFactor {
  /** Name of the factor */
  name: string;
  /** Weight of this factor (0-1) */
  weight: number;
  /** Calculated value for this factor (0-100) */
  value: number;
  /** Human-readable description */
  description: string;
}

/**
 * Confidence information for a detected change.
 */
export interface ChangeConfidence {
  /** Confidence score (0-100) */
  score: number;
  /** Method used to detect this change */
  method: ComparisonMethod;
  /** Factors contributing to the confidence score */
  factors: ConfidenceFactor[];
}

/**
 * A single behavioral assertion about a tool.
 */
export interface BehavioralAssertion {
  /** Tool this assertion is about */
  tool: string;
  /** What aspect this assertion covers */
  aspect: BehaviorAspect;
  /** Human-readable assertion description */
  assertion: string;
  /** Evidence supporting this assertion */
  evidence?: string;
  /** Whether this is a positive or negative assertion */
  isPositive: boolean;
}

/**
 * Behavioral change detected between baselines.
 */
export interface BehaviorChange {
  /** Tool that changed */
  tool: string;
  /** Aspect of behavior that changed */
  aspect: BehaviorAspect;
  /** Previous value/description */
  before: string;
  /** New value/description */
  after: string;
  /** How significant is this change */
  significance: ChangeSignificance;
  /** Human-readable description of the change */
  description: string;
  /** Confidence information for this change */
  confidence?: ChangeConfidence;
}

/**
 * Changes detected for a single tool.
 */
export interface ToolDiff {
  /** Tool name */
  tool: string;
  /** Changes in tool behavior */
  changes: BehaviorChange[];
  /** Whether the schema changed */
  schemaChanged: boolean;
  /** Whether the description changed */
  descriptionChanged: boolean;
  /** Previous tool profile */
  previous?: ToolProfile;
  /** Current tool profile */
  current?: ToolProfile;
  /** Aggregated confidence for this tool's changes */
  confidence?: ChangeConfidence;
}

/**
 * Complete behavioral diff between two baselines.
 */
export interface BehavioralDiff {
  /** Tools added since baseline */
  toolsAdded: string[];
  /** Tools removed since baseline */
  toolsRemoved: string[];
  /** Tools with modified behavior */
  toolsModified: ToolDiff[];
  /** Specific behavior changes */
  behaviorChanges: BehaviorChange[];
  /** Overall severity of changes */
  severity: ChangeSeverity;
  /** Number of breaking changes */
  breakingCount: number;
  /** Number of warnings */
  warningCount: number;
  /** Number of info changes */
  infoCount: number;
  /** Summary of changes */
  summary: string;
  /** Aggregated confidence for all changes */
  confidence?: DiffConfidence;
  /** Whether strict mode was used (structural-only) */
  strictMode?: boolean;
}

/**
 * Aggregated confidence information for a diff.
 */
export interface DiffConfidence {
  /** Overall confidence score (0-100) */
  overallScore: number;
  /** Minimum confidence among all changes */
  minScore: number;
  /** Maximum confidence among all changes */
  maxScore: number;
  /** Number of structural (deterministic) changes */
  structuralCount: number;
  /** Number of semantic (LLM-based) changes */
  semanticCount: number;
  /** Average confidence for structural changes */
  structuralAverage: number;
  /** Average confidence for semantic changes */
  semanticAverage: number;
}

/**
 * Tool fingerprint for quick comparison.
 */
export interface ToolFingerprint {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Hash of the input schema */
  schemaHash: string;
  /** Key behavioral assertions */
  assertions: BehavioralAssertion[];
  /** Security notes from interview */
  securityNotes: string[];
  /** Known limitations */
  limitations: string[];
}

/**
 * Server fingerprint for baseline comparison.
 */
export interface ServerFingerprint {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Protocol version */
  protocolVersion: string;
  /** Available capabilities */
  capabilities: string[];
}

/**
 * Behavioral baseline for an MCP server.
 */
export interface BehavioralBaseline {
  /** Baseline format version */
  version: number;
  /** When this baseline was created */
  createdAt: Date;
  /** Command used to start the server */
  serverCommand: string;
  /** Server fingerprint */
  server: ServerFingerprint;
  /** Fingerprints for each tool */
  tools: ToolFingerprint[];
  /** Overall behavioral summary */
  summary: string;
  /** Overall assertions */
  assertions: BehavioralAssertion[];
  /** Workflow signatures (if workflows were tested) */
  workflowSignatures?: WorkflowSignature[];
  /** Hash of the entire baseline for integrity checking */
  integrityHash: string;
}

/**
 * Workflow signature for baseline tracking.
 */
export interface WorkflowSignature {
  /** Workflow ID */
  id: string;
  /** Workflow name */
  name: string;
  /** Tool sequence */
  toolSequence: string[];
  /** Whether it succeeded in baseline */
  succeeded: boolean;
  /** Summary of behavior */
  summary?: string;
}

/**
 * Options for baseline comparison.
 */
export interface CompareOptions {
  /** Ignore schema changes */
  ignoreSchemaChanges?: boolean;
  /** Ignore description changes */
  ignoreDescriptionChanges?: boolean;
  /** Minimum severity to report */
  minimumSeverity?: ChangeSeverity;
  /** Specific tools to compare (empty = all) */
  tools?: string[];
  /** Strict mode: only report structural (deterministic) changes */
  strict?: boolean;
  /** Minimum confidence score to report a change (0-100) */
  minConfidence?: number;
  /** Confidence threshold for breaking changes in CI (0-100) */
  confidenceThreshold?: number;
}

