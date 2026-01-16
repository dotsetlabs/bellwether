/**
 * Confidence scoring for drift detection.
 *
 * This module provides confidence calculations for behavioral changes detected
 * between baselines. Structural changes (schema, tool presence) are 100% confident,
 * while semantic changes (assertions, security notes) have variable confidence
 * based on several factors.
 */

import type {
  ChangeConfidence,
  ConfidenceFactor,
  ComparisonMethod,
  BehaviorChange,
  ToolDiff,
  DiffConfidence,
  BehaviorAspect,
} from './types.js';

/**
 * Default weights for confidence factors.
 */
export const CONFIDENCE_WEIGHTS = {
  /** Weight for keyword overlap factor */
  keywordOverlap: 0.3,
  /** Weight for structural alignment factor */
  structuralAlignment: 0.25,
  /** Weight for semantic similarity factor */
  semanticSimilarity: 0.25,
  /** Weight for category consistency factor */
  categoryConsistency: 0.2,
} as const;

/**
 * Default confidence thresholds.
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Default minimum confidence for CI to fail */
  ci: 80,
  /** Default minimum confidence to report a change */
  reporting: 50,
  /** Threshold for "high confidence" label */
  high: 85,
  /** Threshold for "medium confidence" label */
  medium: 60,
  /** Threshold for "low confidence" label */
  low: 40,
} as const;

/**
 * Aspects that are structural (deterministic) vs semantic (LLM-based).
 */
export const STRUCTURAL_ASPECTS: BehaviorAspect[] = ['schema'];
export const SEMANTIC_ASPECTS: BehaviorAspect[] = [
  'response_format',
  'error_handling',
  'security',
  'performance',
  'description',
];

/**
 * Creates a 100% confidence result for structural changes.
 */
export function createStructuralConfidence(description: string): ChangeConfidence {
  return {
    score: 100,
    method: 'structural',
    factors: [
      {
        name: 'structural_match',
        weight: 1.0,
        value: 100,
        description,
      },
    ],
  };
}

/**
 * Calculates confidence for a semantic comparison.
 *
 * @param before - Previous value/text
 * @param after - New value/text
 * @param categoryMatch - Whether extracted categories match
 * @param additionalFactors - Any additional confidence factors
 */
export function calculateSemanticConfidence(
  before: string,
  after: string,
  categoryMatch: boolean,
  additionalFactors: ConfidenceFactor[] = []
): ChangeConfidence {
  const factors: ConfidenceFactor[] = [];

  // Factor 1: Keyword overlap
  const keywordScore = calculateKeywordOverlap(before, after);
  factors.push({
    name: 'keyword_overlap',
    weight: CONFIDENCE_WEIGHTS.keywordOverlap,
    value: keywordScore,
    description: `${keywordScore}% keyword overlap between old and new text`,
  });

  // Factor 2: Length similarity (structural alignment proxy)
  const lengthScore = calculateLengthSimilarity(before, after);
  factors.push({
    name: 'length_similarity',
    weight: CONFIDENCE_WEIGHTS.structuralAlignment,
    value: lengthScore,
    description: `${lengthScore}% length similarity`,
  });

  // Factor 3: Semantic indicators (presence of similar concepts)
  const semanticScore = calculateSemanticIndicators(before, after);
  factors.push({
    name: 'semantic_indicators',
    weight: CONFIDENCE_WEIGHTS.semanticSimilarity,
    value: semanticScore,
    description: `${semanticScore}% semantic indicator match`,
  });

  // Factor 4: Category consistency
  const categoryScore = categoryMatch ? 100 : 30;
  factors.push({
    name: 'category_consistency',
    weight: CONFIDENCE_WEIGHTS.categoryConsistency,
    value: categoryScore,
    description: categoryMatch
      ? 'Categories match between versions'
      : 'Categories differ between versions',
  });

  // Add any additional factors
  factors.push(...additionalFactors);

  // Calculate weighted score
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedSum = factors.reduce((sum, f) => sum + f.weight * f.value, 0);
  const score = Math.round(weightedSum / totalWeight);

  return {
    score,
    method: 'semantic',
    factors,
  };
}

/**
 * Calculates keyword overlap between two strings.
 * Returns a score 0-100.
 */
export function calculateKeywordOverlap(text1: string, text2: string): number {
  const words1 = extractKeywords(text1);
  const words2 = extractKeywords(text2);

  if (words1.size === 0 && words2.size === 0) return 100;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  // Jaccard similarity
  return Math.round((intersection.size / union.size) * 100);
}

/**
 * Extracts meaningful keywords from text.
 */
function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
    'dare',
    'ought',
    'used',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'up',
    'about',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'under',
    'again',
    'further',
    'then',
    'once',
    'and',
    'but',
    'or',
    'nor',
    'so',
    'yet',
    'both',
    'either',
    'neither',
    'not',
    'only',
    'own',
    'same',
    'than',
    'too',
    'very',
    'just',
    'also',
    'now',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'every',
    'any',
    'some',
    'no',
    'such',
    'what',
    'which',
    'who',
    'whom',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  return new Set(words);
}

/**
 * Calculates length similarity between two strings.
 * Returns a score 0-100.
 */
export function calculateLengthSimilarity(text1: string, text2: string): number {
  const len1 = text1.length;
  const len2 = text2.length;

  if (len1 === 0 && len2 === 0) return 100;
  if (len1 === 0 || len2 === 0) return 0;

  const ratio = Math.min(len1, len2) / Math.max(len1, len2);
  return Math.round(ratio * 100);
}

/**
 * Calculates semantic indicator similarity.
 * Looks for common technical patterns and concepts.
 */
export function calculateSemanticIndicators(text1: string, text2: string): number {
  const indicators = [
    // Error handling patterns
    /error|exception|fail|invalid|reject/i,
    // Security patterns
    /auth|permission|access|secure|credential/i,
    // Data patterns
    /file|path|directory|read|write/i,
    // Network patterns
    /request|response|api|http|url/i,
    // Format patterns
    /json|xml|format|parse|serialize/i,
    // State patterns
    /state|status|flag|mode|config/i,
    // Numeric patterns
    /number|count|size|limit|max|min/i,
    // Time patterns
    /time|date|timeout|delay|schedule/i,
  ];

  let matches1 = 0;
  let matches2 = 0;
  let commonMatches = 0;

  for (const pattern of indicators) {
    const match1 = pattern.test(text1);
    const match2 = pattern.test(text2);

    if (match1) matches1++;
    if (match2) matches2++;
    if (match1 && match2) commonMatches++;
  }

  const totalMatches = matches1 + matches2 - commonMatches;
  if (totalMatches === 0) return 100; // No indicators in either, consider similar

  return Math.round((commonMatches / totalMatches) * 100);
}

/**
 * Determines the comparison method for a given aspect.
 */
export function getComparisonMethod(aspect: BehaviorAspect): ComparisonMethod {
  return STRUCTURAL_ASPECTS.includes(aspect) ? 'structural' : 'semantic';
}

/**
 * Determines if an aspect is structural (deterministic).
 */
export function isStructuralAspect(aspect: BehaviorAspect): boolean {
  return STRUCTURAL_ASPECTS.includes(aspect);
}

/**
 * Aggregates confidence scores from multiple changes into a single tool confidence.
 */
export function aggregateToolConfidence(changes: BehaviorChange[]): ChangeConfidence | undefined {
  if (changes.length === 0) return undefined;

  const confidences = changes
    .map((c) => c.confidence)
    .filter((c): c is ChangeConfidence => c !== undefined);

  if (confidences.length === 0) return undefined;

  // Calculate weighted average (lower confidence changes weighted more heavily)
  // This ensures the aggregate reflects uncertainty
  const weights = confidences.map((c) => 100 - c.score + 10); // Inverse weighting
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const weightedSum = confidences.reduce((sum, c, i) => sum + c.score * weights[i], 0);
  const avgScore = Math.round(weightedSum / totalWeight);

  // Determine primary method
  const structuralCount = confidences.filter((c) => c.method === 'structural').length;
  const method: ComparisonMethod = structuralCount > confidences.length / 2 ? 'structural' : 'semantic';

  return {
    score: avgScore,
    method,
    factors: [
      {
        name: 'aggregated_changes',
        weight: 1.0,
        value: avgScore,
        description: `Aggregated from ${changes.length} changes`,
      },
    ],
  };
}

/**
 * Aggregates confidence information for an entire diff.
 */
export function aggregateDiffConfidence(
  toolDiffs: ToolDiff[],
  behaviorChanges: BehaviorChange[]
): DiffConfidence | undefined {
  const allChanges = [
    ...behaviorChanges,
    ...toolDiffs.flatMap((td) => td.changes),
  ];

  if (allChanges.length === 0) return undefined;

  const confidences = allChanges
    .map((c) => c.confidence)
    .filter((c): c is ChangeConfidence => c !== undefined);

  if (confidences.length === 0) return undefined;

  const scores = confidences.map((c) => c.score);
  const structuralChanges = confidences.filter((c) => c.method === 'structural');
  const semanticChanges = confidences.filter((c) => c.method === 'semantic');

  return {
    overallScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    minScore: Math.min(...scores),
    maxScore: Math.max(...scores),
    structuralCount: structuralChanges.length,
    semanticCount: semanticChanges.length,
    structuralAverage:
      structuralChanges.length > 0
        ? Math.round(
            structuralChanges.reduce((sum, c) => sum + c.score, 0) / structuralChanges.length
          )
        : 0,
    semanticAverage:
      semanticChanges.length > 0
        ? Math.round(
            semanticChanges.reduce((sum, c) => sum + c.score, 0) / semanticChanges.length
          )
        : 0,
  };
}

/**
 * Gets a human-readable confidence label.
 */
export function getConfidenceLabel(score: number): 'high' | 'medium' | 'low' | 'very-low' {
  if (score >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (score >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  if (score >= CONFIDENCE_THRESHOLDS.low) return 'low';
  return 'very-low';
}

/**
 * Formats a confidence score for display.
 */
export function formatConfidenceScore(confidence: ChangeConfidence | undefined): string {
  if (!confidence) return 'N/A';

  const label = getConfidenceLabel(confidence.score);
  const method = confidence.method === 'structural' ? 'structural' : 'semantic';

  return `${confidence.score}% (${label}, ${method})`;
}

/**
 * Filters changes by minimum confidence threshold.
 */
export function filterByConfidence<T extends { confidence?: ChangeConfidence }>(
  changes: T[],
  minConfidence: number
): T[] {
  return changes.filter((c) => {
    if (!c.confidence) return true; // Include changes without confidence info
    return c.confidence.score >= minConfidence;
  });
}

/**
 * Checks if a diff meets the confidence threshold for CI.
 */
export function meetsConfidenceThreshold(
  diff: { confidence?: DiffConfidence },
  threshold: number
): boolean {
  if (!diff.confidence) return true; // If no confidence info, assume it meets threshold
  return diff.confidence.minScore >= threshold;
}
