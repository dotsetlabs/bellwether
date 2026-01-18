/**
 * Baseline module - structural drift detection.
 */

export type {
  ChangeSeverity,
  BehaviorAspect,
  ChangeSignificance,
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

// Version utilities
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

// Migration utilities
export {
  migrateBaseline,
  canMigrate,
  getMigrationsToApply,
  needsMigration,
  getMigrationInfo,
} from './migrations.js';
