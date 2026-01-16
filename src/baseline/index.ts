/**
 * Baseline module - behavioral baseline and drift detection.
 */

// Types
export type {
  ChangeSeverity,
  BehaviorAspect,
  ChangeSignificance,
  ComparisonMethod,
  ConfidenceFactor,
  ChangeConfidence,
  DiffConfidence,
  BehavioralAssertion,
  BehaviorChange,
  ToolDiff,
  BehavioralDiff,
  ToolFingerprint,
  ServerFingerprint,
  BehavioralBaseline,
  WorkflowSignature,
  CompareOptions,
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
  meetsConfidenceRequirements,
  getLowConfidenceChanges,
  separateByMethod,
} from './comparator.js';

// Confidence scoring functions
export {
  CONFIDENCE_WEIGHTS,
  CONFIDENCE_THRESHOLDS,
  STRUCTURAL_ASPECTS,
  SEMANTIC_ASPECTS,
  createStructuralConfidence,
  calculateSemanticConfidence,
  calculateKeywordOverlap,
  calculateLengthSimilarity,
  calculateSemanticIndicators,
  getComparisonMethod,
  isStructuralAspect,
  aggregateToolConfidence,
  aggregateDiffConfidence,
  getConfidenceLabel,
  formatConfidenceScore,
  filterByConfidence,
  meetsConfidenceThreshold,
} from './confidence.js';

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

// Semantic comparison utilities (for handling LLM non-determinism)
export {
  extractSecurityCategory,
  extractLimitationCategory,
  createFingerprint,
  structureSecurityNotes,
  structureLimitations,
  securityFindingsMatch,
  limitationsMatch,
  assertionsMatch,
  compareArraysSemantic,
  securityFindingsMatchWithConfidence,
  limitationsMatchWithConfidence,
  assertionsMatchWithConfidence,
  compareArraysSemanticWithConfidence,
  calculateComparisonConfidence,
  SECURITY_CATEGORIES,
  LIMITATION_CATEGORIES,
  type SecurityCategory,
  type LimitationCategory,
  type StructuredSecurityFinding,
  type StructuredLimitation,
  type NormalizedAssertion,
  type SemanticComparisonResult,
} from './semantic.js';
