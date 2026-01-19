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
  ServerFingerprint,
  BehavioralBaseline,
  WorkflowSignature,
  CompareOptions,
  BaselineMode,
  VersionCompatibilityInfo,
} from './types.js';

export {
  createBaseline,
  saveBaseline,
  loadBaseline,
  verifyIntegrity,
  baselineExists,
  recalculateIntegrityHash,
  type LoadBaselineOptions,
} from './saver.js';

export {
  compareWithBaseline,
  compareBaselines,
  hasBreakingChanges,
  hasSecurityChanges,
  filterByMinimumSeverity,
  checkBaselineVersionCompatibility,
} from './comparator.js';

export {
  formatDiffText,
  formatDiffJson,
  formatDiffCompact,
  formatDiffGitHubActions,
  formatDiffMarkdown,
} from './diff.js';

export {
  convertToCloudBaseline,
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
  BASELINE_FORMAT_VERSION,
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
  BaselineVersionError,
  type FormatVersion,
  type VersionCompatibility,
} from './version.js';

export {
  migrateBaseline,
  canMigrate,
  getMigrationsToApply,
  needsMigration,
  getMigrationInfo,
} from './migrations.js';

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

// Phase 1: Change impact analysis
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

// Phase 1: Performance tracking
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
  PERFORMANCE,
  type LatencyTrend,
  type ToolPerformanceMetrics,
  type PerformanceBaseline,
  type PerformanceComparison,
  type PerformanceReport,
  type LatencySample,
} from './performance-tracker.js';

// Phase 1: Deprecation tracking
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

// Phase 1: Health scoring
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

// Phase 2: Schema evolution timeline
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

// Phase 2: Migration guide generation
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

// Phase 2: Auto-generated test scenarios
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

// Phase 2: Enhanced PR comments
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
