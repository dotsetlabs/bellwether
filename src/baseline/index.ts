/**
 * Baseline module - structural drift detection.
 */

export type {
  ChangeSeverity,
  BehaviorAspect,
  BehavioralAssertion,
  BehaviorChange,
  ToolDiff,
  BehavioralDiff,
  ToolFingerprint,
  BehavioralBaseline,
  WorkflowSignature,
  CompareOptions,
  BaselineMode,
  VersionCompatibilityInfo,
  DriftAcceptance,
  AcceptedDiff,
  SeverityConfig,
  SchemaEvolutionReport,
  SchemaEvolutionIssue,
  PerformanceRegressionReport,
  PerformanceRegression,
  PerformanceConfidence,
  PerformanceConfidenceChange,
  ConfidenceLevel,
  DocumentationScore,
  DocumentationScoreSummary,
  DocumentationScoreChange,
  DocumentationIssue,
  DocumentationGrade,
  DocumentationComponents,
  ToolDocumentationScore,
} from './types.js';

export {
  getBaselineGeneratedAt,
  getBaselineHash,
  getBaselineServerCommand,
  getBaselineMode,
  getBaselineWorkflows,
  getToolFingerprints,
  toToolCapability,
} from './accessors.js';

export {
  createBaseline,
  saveBaseline,
  loadBaseline,
  verifyBaselineHash,
  baselineExists,
  recalculateBaselineHash,
  acceptDrift,
  hasAcceptance,
  clearAcceptance,
  type LoadBaselineOptions,
  type AcceptDriftOptions,
} from './saver.js';

export {
  compareWithBaseline,
  compareBaselines,
  hasBreakingChanges,
  hasSecurityChanges,
  filterByMinimumSeverity,
  checkBaselineVersionCompatibility,
  compareSeverity,
  severityMeetsThreshold,
  applyAspectOverride,
  applySeverityConfig,
  shouldFailOnDiff,
} from './comparator.js';

export {
  formatDiffText,
  formatDiffJson,
  formatDiffCompact,
  formatDiffGitHubActions,
  formatDiffMarkdown,
  formatDiffJUnit,
  formatDiffSarif,
  formatSecurityReport,
} from './diff.js';

export { createBaselineFromInterview } from './converter.js';

export {
  computeSchemaHash,
  compareSchemas,
  computeConsensusSchemaHash,
  type SchemaChangeType,
  type SchemaChange,
  type SchemaComparisonResult,
} from './schema-compare.js';

export {
  getBaselineVersion,
  parseVersion,
  areVersionsCompatible,
  compareVersions,
  getCompatibilityWarning,
  checkVersionCompatibility,
  assertVersionCompatibility,
  formatVersion,
  isCurrentVersion,
  isOlderVersion,
  isNewerVersion,
  requiresMigration,
  BaselineVersionError,
  type FormatVersion,
  type VersionCompatibility,
} from './version.js';

// Legacy baseline migrations removed; current baseline format is canonical.

// Incremental checking
export {
  analyzeForIncremental,
  mergeFingerprints,
  formatIncrementalSummary,
  isIncrementalWorthwhile,
  addIncrementalMetadata,
  type IncrementalCheckResult,
  type IncrementalChangeSummary,
  type IncrementalCheckOptions,
} from './incremental-checker.js';

export {
  analyzeResponses,
  inferSchemaFromValue,
  compareFingerprints,
  compareErrorPatterns,
  computeInferredSchemaHash,
  type ResponseFingerprint,
  type ResponseContentType,
  type ResponseSize,
  type InferredSchema,
  type ErrorPattern,
  type ResponseAnalysis,
  type FingerprintDiff,
  type FingerprintChange,
  type ErrorPatternDiff,
} from './response-fingerprint.js';

// Response schema evolution tracking
export {
  compareInferredSchemas,
  buildSchemaEvolution,
  compareSchemaEvolution,
  formatSchemaEvolution,
  formatSchemaEvolutionDiff,
  hasSchemaEvolutionIssues,
  getSchemaStabilityGrade,
  type ResponseSchemaEvolution,
  type SchemaVersion as SchemaEvolutionVersion,
  type SchemaEvolutionDiff,
  type SchemaTypeChange,
} from './response-schema-tracker.js';

// Performance tracking
export {
  calculateMetrics,
  createPerformanceBaseline,
  extractPerformanceBaselines,
  comparePerformance,
  generatePerformanceReport,
  formatMetrics,
  formatComparison,
  isPerformanceAcceptable,
  aggregateSamplesByTool,
  calculatePerformanceConfidence,
  calculateConfidenceFromMetrics,
  formatConfidenceLevel,
  hasReliableConfidence,
  type LatencyTrend,
  type ToolPerformanceMetrics,
  type PerformanceBaseline,
  type PerformanceComparison,
  type PerformanceReport,
  type LatencySample,
} from './performance-tracker.js';

// Security testing (re-exported from security module for convenience)
export type {
  SecurityCategory,
  RiskLevel,
  SecurityPayload,
  SecurityTestResult,
  SecurityFinding,
  SecurityFingerprint,
  SecurityDiff,
  SecurityTestOptions,
  SecurityTestContext,
  SecurityToolCallResult,
  SecurityReport,
} from '../security/types.js';

export {
  runSecurityTests,
  compareSecurityFingerprints,
  getRiskLevelFromScore,
  parseSecurityCategories,
  getPayloadsForCategory,
  getAllSecurityPayloads,
  getAllSecurityCategories,
} from '../security/index.js';

// Error analysis
export type {
  HttpStatusCategory,
  ErrorSeverity,
  EnhancedErrorAnalysis,
  ErrorAnalysisSummary,
  ErrorTrend,
  ErrorTrendReport,
} from './error-analyzer.js';

export {
  analyzeError,
  analyzeErrorPatterns,
  generateErrorSummary,
  analyzeErrorTrends,
  extractHttpStatus,
  categorizeHttpStatus,
  inferRootCause,
  generateRemediation,
  extractRelatedParameters,
  isTransientError,
  assessErrorSeverity,
  mapStatusToErrorCategory,
  formatEnhancedError,
  formatErrorTrendReport,
  formatCategoryName,
} from './error-analyzer.js';

// Documentation quality scoring
export {
  scoreDocumentation,
  scoreToolDocumentation,
  calculateDescriptionCoverage,
  calculateDescriptionQuality,
  calculateParameterDocumentation,
  calculateExampleCoverage,
  hasExamples,
  scoreToGrade,
  generateSuggestions,
  compareDocumentationScores,
  formatDocumentationScore,
  formatDocumentationScoreCompact,
  formatDocumentationScoreChange,
  toDocumentationScoreSummary,
  getGradeIndicator,
  getGradeBadgeColor,
  meetsDocumentationThreshold,
  meetsDocumentationGrade,
  type DocumentationIssueSeverity,
  type DocumentationIssueType,
} from './documentation-scorer.js';
