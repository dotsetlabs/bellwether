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
} from './types.js';

export {
  BASELINE_VERSION,
  createBaseline,
  saveBaseline,
  loadBaseline,
  verifyIntegrity,
  baselineExists,
} from './saver.js';

export {
  compareWithBaseline,
  compareBaselines,
  hasBreakingChanges,
  hasSecurityChanges,
  filterByMinimumSeverity,
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
