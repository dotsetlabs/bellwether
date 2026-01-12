/**
 * Baseline module - behavioral baseline and drift detection.
 */

// Types
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
  CICheckResult,
  CIFinding,
} from './types.js';

// Saver functions
export {
  BASELINE_VERSION,
  createBaseline,
  saveBaseline,
  loadBaseline,
  verifyIntegrity,
  baselineExists,
} from './saver.js';

// Comparator functions
export {
  compareWithBaseline,
  compareBaselines,
  hasBreakingChanges,
  hasSecurityChanges,
  filterByMinimumSeverity,
} from './comparator.js';

// Diff formatting functions
export {
  formatDiffText,
  formatDiffJson,
  formatDiffCompact,
  formatDiffGitHubActions,
  formatDiffMarkdown,
} from './diff.js';

// Converter functions (for cloud integration)
export {
  convertToCloudBaseline,
  createCloudBaseline,
} from './converter.js';
