/**
 * Baseline types for drift detection.
 */

import type { ToolProfile } from '../interview/types.js';

/**
 * Severity of a change.
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
  significance: ChangeSignificance;
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
  assertions: BehavioralAssertion[];
  securityNotes: string[];
  limitations: string[];
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
 * - full: Created with LLM analysis (rich behavioral data)
 * - structural: Created without LLM (CI mode, structural data only)
 */
export type BaselineMode = 'full' | 'structural';

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
  minimumSeverity?: ChangeSeverity;
  tools?: string[];
  /** Force comparison even if baseline versions are incompatible */
  ignoreVersionMismatch?: boolean;
}
