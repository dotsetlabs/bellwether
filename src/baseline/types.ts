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
}

/**
 * Result of a CI/CD check.
 */
export interface CICheckResult {
  /** Whether the check passed */
  passed: boolean;
  /** Exit code (0=pass, 1=fail, 2=error) */
  exitCode: number;
  /** Behavioral diff (if baseline comparison) */
  diff?: BehavioralDiff;
  /** Assertions extracted */
  assertions: BehavioralAssertion[];
  /** Security findings count */
  securityFindingsCount: number;
  /** Human-readable summary */
  summary: string;
  /** Detailed findings for report */
  findings: CIFinding[];
}

/**
 * A finding for CI reporting.
 */
export interface CIFinding {
  /** Unique ID */
  id: string;
  /** Finding category */
  category: 'behavior' | 'security' | 'reliability' | 'drift';
  /** Severity level */
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** Tool involved (if applicable) */
  tool?: string;
  /** Evidence supporting the finding */
  evidence?: string[];
  /** Recommended action */
  recommendation?: string;
}
