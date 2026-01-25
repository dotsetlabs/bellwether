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

export {
  createCloudBaseline,
} from './converter.js';

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

// Legacy baseline migrations removed; cloud baseline is canonical.

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

// Change impact analysis
export {
  analyzeToolChangeImpact,
  analyzeDiffImpact,
  analyzeSchemaChanges,
  isBreakingChange,
  getBreakingChangeSummary,
  CHANGE_IMPACT,
  type SchemaChangeType as ImpactSchemaChangeType,
  type SchemaChangeDetail,
  type MigrationComplexity,
  type ChangeImpact,
  type DiffImpactAnalysis,
  type ActionItem,
} from './change-impact-analyzer.js';

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
  PERFORMANCE,
  type LatencyTrend,
  type ToolPerformanceMetrics,
  type PerformanceBaseline,
  type PerformanceComparison,
  type PerformanceReport,
  type LatencySample,
} from './performance-tracker.js';

// Deprecation tracking
export {
  checkDeprecations,
  checkToolDeprecation,
  markAsDeprecated,
  clearDeprecation,
  getDeprecatedTools,
  getExpiredTools,
  getUpcomingRemovals,
  formatDeprecationWarning,
  formatDeprecationReport,
  shouldFailOnDeprecation,
  DEPRECATION,
  DEPRECATION_DEFAULTS,
  DEPRECATION_THRESHOLDS,
  type DeprecationStatus,
  type DeprecationWarning,
  type DeprecationReport,
  type DeprecationConfig,
} from './deprecation-tracker.js';

// Health scoring
export {
  calculateHealthScore,
  formatHealthScore,
  meetsHealthThreshold,
  getHealthBadgeColor,
  createHealthHistoryEntry,
  HEALTH_SCORING,
  HEALTH_WEIGHTS,
  GRADE_THRESHOLDS,
  SEVERITY_THRESHOLDS,
  HEALTH_PENALTIES,
  type HealthTrend,
  type ActionPriority,
  type HealthActionItem,
  type HealthComponents,
  type HealthScore,
  type HealthHistory,
  type HealthInput,
} from './health-scorer.js';

// Schema evolution timeline
export {
  buildServerTimeline,
  buildToolTimeline,
  formatTimeline,
  formatServerTimelineSummary,
  generateVisualTimeline,
  serializeTimeline,
  deserializeTimeline,
  serializeServerTimeline,
  deserializeServerTimeline,
  getMostActiveTools,
  getMostBreakingTools,
  getBreakingChanges,
  getVersionAtTime,
  getChangesBetween,
  hadBreakingChanges,
  type SchemaEventType,
  type SchemaVersion,
  type SchemaTimeline,
  type ServerTimeline,
  type DeprecationEvent,
  type TimelineStats,
  type TimelineBuildOptions,
} from './schema-evolution.js';

// Migration guide generation
export {
  generateMigrationGuide,
  formatMigrationGuideMarkdown,
  formatMigrationGuideText,
  hasBreakingMigrationChanges,
  getBreakingTools,
  type MigrationEffort,
  type MigrationStepType,
  type CodeExample,
  type BreakingChange,
  type MigrationStep,
  type MigrationGuide,
  type MigrationStats,
} from './migration-generator.js';

// Auto-generated test scenarios
export {
  generateToolScenarios,
  generateBaselineScenarios,
  formatScenariosAsYaml,
  formatScenariosReport,
  getScenariosByPriority,
  getScenariosByCategory,
  getCriticalScenarios,
  getSecurityScenarios,
  type ScenarioCategory,
  type ScenarioPriority,
  type TestScenario,
  type AutoGeneratedScenarios,
  type ScenarioGenerationSummary,
  type ScenarioGenerationResult,
  type ScenarioGenerationConfig,
} from './scenario-generator.js';

// Enhanced PR comments
export {
  generatePRComment,
  generateCompactPRComment,
  generateCIStatusSummary,
  generateDiffTable,
  generateBadgeUrl,
  generateBadgeMarkdown,
  getBadgeColor,
  shouldBlockMerge,
  getSeverityEmoji,
  type BadgeColor,
  type CommentSection,
  type AffectedWorkflow,
  type PRComment,
  type PRCommentConfig,
} from './pr-comment-generator.js';

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

// AI Agent Compatibility Scoring
export {
  calculateAICompatibilityScore,
  generateAICompatibilityMarkdown,
  type AICompatibilityScore,
  type ScoreComponent,
  type AICompatibilityRecommendation,
  type ToolAIScore,
  type AICompatibilityInput,
} from './ai-compatibility-scorer.js';

// Regression Risk Scoring
export {
  calculateRiskScore,
  generateRiskScoreMarkdown,
  type RegressionRiskScore,
  type RiskFactor,
} from './risk-scorer.js';

// Intelligent Test Pruning
export {
  calculatePruningDecisions,
  calculateToolPruning,
  prioritizeTools,
  generatePruningSummary,
  generatePruningMarkdown,
  type TestCategory,
  type TestCategoryDecision,
  type ToolPruningDecision,
  type ToolCharacteristics,
  type PruningInput,
  type PruningSummary,
} from './test-pruner.js';
