/**
 * Baseline types for drift detection.
 */

import type { ToolProfile } from '../interview/types.js';
import type { ResponseFingerprint, InferredSchema, ErrorPattern } from './response-fingerprint.js';
import type { BellwetherBaseline, DriftAcceptance, AcceptedDiff } from './baseline-format.js';

export type { DriftAcceptance, AcceptedDiff };
export type { BaselineMode } from './baseline-format.js';

/**
 * Re-export ErrorPattern for use by other modules.
 */
export type { ErrorPattern };
import type { SecurityFingerprint, SecurityDiff } from '../security/types.js';
import type { ResponseSchemaEvolution, SchemaEvolutionDiff } from './response-schema-tracker.js';
import type {
  DocumentationScoreSummary,
  DocumentationScoreChange,
} from './documentation-scorer.js';

/**
 * Confidence level for statistical metrics.
 * Used to indicate reliability of performance baselines.
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

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
  | 'response_schema_evolution'
  | 'error_handling'
  | 'error_pattern'
  | 'security'
  | 'performance'
  | 'schema'
  | 'description'
  | 'prompt'
  | 'resource'
  | 'resource_template'
  | 'server'
  | 'capability'
  | 'tool_annotations'
  | 'output_schema'
  | 'resource_annotations';

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
  /** Whether response structure changed (check mode) */
  responseStructureChanged: boolean;
  /** Whether error patterns changed (check mode) */
  errorPatternsChanged: boolean;
  /** Whether response schema evolution changed (check mode) */
  responseSchemaEvolutionChanged: boolean;
  /** Whether security findings changed (check mode --security) */
  securityChanged: boolean;
  /** Schema evolution diff details (when schema evolution changed) */
  schemaEvolutionDiff?: SchemaEvolutionDiff;
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
  /** Performance regression report (when performance data available) */
  performanceReport?: PerformanceRegressionReport;
  /** Security diff report (when security testing was performed) */
  securityReport?: SecurityDiff;
  /** Schema evolution report (when schema evolution data available) */
  schemaEvolutionReport?: SchemaEvolutionReport;
  /** Error trend report (when comparing error patterns) */
  errorTrendReport?: ErrorTrendReport;
  /** Documentation score comparison report */
  documentationScoreReport?: DocumentationScoreChange;
}

/**
 * Performance regression report summary in diff.
 */
export interface PerformanceRegressionReport {
  /** Tools with performance regression */
  regressions: PerformanceRegression[];
  /** Total tools with regressions */
  regressionCount: number;
  /** Total tools with improved performance */
  improvementCount: number;
  /** Overall has regressions beyond threshold */
  hasRegressions: boolean;
  /** Confidence-related changes */
  confidenceChanges?: PerformanceConfidenceChange[];
  /** Tools with low confidence (unreliable baselines) */
  lowConfidenceTools?: string[];
}

/**
 * A single tool's performance regression.
 */
export interface PerformanceRegression {
  /** Tool name */
  toolName: string;
  /** Previous p50 latency */
  previousP50Ms: number;
  /** Current p50 latency */
  currentP50Ms: number;
  /** Regression percentage (positive = slower) */
  regressionPercent: number;
  /** Whether this exceeds the threshold */
  exceedsThreshold: boolean;
  /** Previous confidence level (if available) */
  previousConfidence?: 'high' | 'medium' | 'low';
  /** Current confidence level */
  currentConfidence?: 'high' | 'medium' | 'low';
  /** Whether regression is statistically reliable (based on confidence) */
  isReliable: boolean;
}

/**
 * Schema evolution report summary in diff.
 * Tracks schema stability changes across tools.
 */
export interface SchemaEvolutionReport {
  /** Tools with schema evolution issues */
  toolsWithIssues: SchemaEvolutionIssue[];
  /** Total tools with unstable schemas */
  unstableCount: number;
  /** Total tools with stable schemas */
  stableCount: number;
  /** Total tools with schema structure changes */
  structureChangedCount: number;
  /** Whether any tools have breaking schema changes */
  hasBreakingChanges: boolean;
}

/**
 * A single tool's schema evolution issue.
 */
export interface SchemaEvolutionIssue {
  /** Tool name */
  toolName: string;
  /** Whether schema became unstable */
  becameUnstable: boolean;
  /** Fields added */
  fieldsAdded: string[];
  /** Fields removed */
  fieldsRemoved: string[];
  /** Whether this is a breaking change */
  isBreaking: boolean;
  /** Human-readable summary */
  summary: string;
}

/**
 * Error trend report comparing error patterns across baselines.
 * Identifies new, resolved, increasing, and decreasing error categories.
 */
export interface ErrorTrendReport {
  /** Error trends by category */
  trends: ErrorTrend[];
  /** Whether error behavior significantly changed */
  significantChange: boolean;
  /** Summary of changes */
  summary: string;
  /** Categories with increasing errors */
  increasingCategories: string[];
  /** Categories with decreasing errors */
  decreasingCategories: string[];
  /** New error categories */
  newCategories: string[];
  /** Resolved error categories */
  resolvedCategories: string[];
}

/**
 * A single error trend entry.
 */
export interface ErrorTrend {
  /** Error category */
  category: string;
  /** Count in previous baseline */
  previousCount: number;
  /** Count in current baseline */
  currentCount: number;
  /** Trend direction */
  trend: 'increasing' | 'decreasing' | 'stable' | 'new' | 'resolved';
  /** Significance of the trend */
  significance: 'high' | 'medium' | 'low';
  /** Change percentage */
  changePercent: number;
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
  /** Full input schema for the tool (preserved for export/analysis) */
  inputSchema?: Record<string, unknown>;
  /** Hash of observed arguments schema (from actual calls) */
  observedArgsSchemaHash?: string;
  /** Consistency of observed argument schemas (0-1) */
  observedArgsSchemaConsistency?: number;
  /** Number of observed schema variations */
  observedArgsSchemaVariations?: number;
  assertions: BehavioralAssertion[];
  securityNotes: string[];
  limitations: string[];

  // Response fingerprinting (check mode enhancement)
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
  /** Baseline p99 latency in milliseconds */
  baselineP99Ms?: number;
  /** Baseline success rate (0-1) */
  baselineSuccessRate?: number;

  // Incremental checking fields
  /** When this tool was last tested */
  lastTestedAt?: Date;
  /** Hash of the input schema at last test time */
  inputSchemaHashAtTest?: string;

  // Security baseline fields (check mode --security flag)
  /** Security testing fingerprint with findings and risk score */
  securityFingerprint?: SecurityFingerprint;

  // Semantic validation fields
  /** Semantic type inferences for parameters (discovered during check) */
  semanticInferences?: SemanticInferenceRecord[];

  // Response schema evolution fields
  /** Response schema evolution tracking for consistency analysis */
  responseSchemaEvolution?: ResponseSchemaEvolution;

  // Performance confidence fields
  /** Statistical confidence metrics for performance baselines */
  performanceConfidence?: PerformanceConfidence;

  // MCP 2025-11-25 fields
  /** Human-readable title for the tool */
  title?: string;
  /** JSON Schema for the tool's output */
  outputSchema?: Record<string, unknown>;
  /** Hash of the output schema for drift detection */
  outputSchemaHash?: string;
  /** Behavioral annotations/hints */
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  /** Task execution configuration */
  execution?: { taskSupport?: string };
}

/**
 * Record of a semantic type inference for a parameter.
 * Stored in baseline to track inferred types across runs.
 */
export interface SemanticInferenceRecord {
  /** Parameter name */
  paramName: string;
  /** Inferred semantic type */
  inferredType: string;
  /** Confidence level (0-1) */
  confidence: number;
}

/**
 * Baseline for an MCP server.
 */
export type BehavioralBaseline = BellwetherBaseline & {
  /** Drift acceptance metadata - present when drift was intentionally accepted */
  acceptance?: DriftAcceptance;
  /** Documentation quality score summary */
  documentationScore?: DocumentationScoreSummary;
};

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
  /** Ignore changes in security findings */
  ignoreSecurityChanges?: boolean;
  minimumSeverity?: ChangeSeverity;
  tools?: string[];
  /** Force comparison even if baseline versions are incompatible */
  ignoreVersionMismatch?: boolean;
  /** Performance regression threshold (0-1, e.g., 0.10 = 10% slower) */
  performanceThreshold?: number;
}

/**
 * Metadata about baseline drift acceptance.
 * Tracks when and why drift was intentionally accepted.
 */
/**
 * Configuration for severity thresholds.
 * Allows customizing how changes are classified and reported.
 */
export interface SeverityConfig {
  /**
   * Minimum severity level to include in reports.
   * Changes below this threshold are filtered out.
   * @default 'none'
   */
  minimumSeverity?: ChangeSeverity;

  /**
   * Severity level at which to fail CI checks.
   * Exit code 0 for changes below this threshold.
   * @default 'breaking'
   */
  failOnSeverity?: ChangeSeverity;

  /**
   * Suppress warning-level changes from output.
   * @default false
   */
  suppressWarnings?: boolean;

  /**
   * Custom severity overrides per aspect.
   * Allows downgrading/upgrading severity for specific change types.
   * Use 'none' to completely ignore changes for an aspect.
   */
  aspectOverrides?: Partial<Record<BehaviorAspect, ChangeSeverity>>;
}

// Re-export security types for convenience
export type { SecurityFingerprint, SecurityDiff } from '../security/types.js';

// Re-export schema evolution types for convenience
export type {
  ResponseSchemaEvolution,
  SchemaEvolutionDiff,
  SchemaVersion,
  SchemaTypeChange,
} from './response-schema-tracker.js';

// Re-export error analyzer types for convenience
export type {
  HttpStatusCategory,
  ErrorSeverity,
  EnhancedErrorAnalysis,
  ErrorAnalysisSummary,
} from './error-analyzer.js';

// Re-export documentation scorer types for convenience
export type {
  DocumentationScore,
  DocumentationScoreSummary,
  DocumentationScoreChange,
  DocumentationIssue,
  DocumentationGrade,
  DocumentationComponents,
  ToolDocumentationScore,
} from './documentation-scorer.js';

/**
 * Performance confidence metrics for a tool.
 * Indicates statistical validity of performance baselines.
 */
export interface PerformanceConfidence {
  /** Number of samples used to calculate metrics (happy_path tests only) */
  sampleCount: number;
  /** Number of successful happy_path samples (tool executed without error) */
  successfulSamples: number;
  /** Number of validation tests that correctly rejected invalid input */
  validationSamples: number;
  /** Total tests run including validation tests */
  totalTests: number;
  /** Standard deviation of latency samples (ms) */
  standardDeviation: number;
  /** Coefficient of variation (stdDev / mean) - lower is more consistent */
  coefficientOfVariation: number;
  /** Confidence level based on sample count and CV */
  confidenceLevel: ConfidenceLevel;
  /** Recommendation if confidence is low */
  recommendation?: string;
}

/**
 * Performance confidence change between baselines.
 */
export interface PerformanceConfidenceChange {
  /** Tool name */
  toolName: string;
  /** Previous confidence level */
  previousLevel?: ConfidenceLevel;
  /** Current confidence level */
  currentLevel: ConfidenceLevel;
  /** Whether confidence improved */
  improved: boolean;
  /** Whether confidence degraded */
  degraded: boolean;
  /** Human-readable summary */
  summary: string;
}
