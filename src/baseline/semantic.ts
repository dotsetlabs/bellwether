/**
 * Semantic comparison utilities for drift detection.
 *
 * This module provides robust comparison that handles LLM non-determinism
 * by normalizing text and extracting structured facts rather than comparing
 * raw prose strings.
 */

import type { ChangeConfidence, ConfidenceFactor } from './types.js';
import {
  calculateKeywordOverlap,
  calculateLengthSimilarity,
  calculateSemanticIndicators,
  CONFIDENCE_WEIGHTS,
} from './confidence.js';
import {
  extractSeverityWithNegation,
  compareConstraints,
  EXTENDED_SECURITY_KEYWORDS,
} from '../utils/semantic.js';

/**
 * Security finding categories (normalized).
 * These map to common vulnerability patterns.
 * Extended to include additional security categories like XXE, timing attacks, etc.
 */
export const SECURITY_CATEGORIES = [
  'path_traversal',
  'command_injection',
  'sql_injection',
  'xss',
  'xxe',
  'ssrf',
  'deserialization',
  'timing_attack',
  'race_condition',
  'file_upload',
  'access_control',
  'authentication',
  'authorization',
  'information_disclosure',
  'denial_of_service',
  'input_validation',
  'output_encoding',
  'cryptography',
  'session_management',
  'error_handling',
  'logging',
  'configuration',
  'prototype_pollution',
  'open_redirect',
  'clickjacking',
  'cors',
  'csp_bypass',
  'other',
] as const;

export type SecurityCategory = typeof SECURITY_CATEGORIES[number];

/**
 * Limitation categories (normalized).
 */
export const LIMITATION_CATEGORIES = [
  'size_limit',
  'rate_limit',
  'timeout',
  'encoding',
  'format',
  'permission',
  'platform',
  'dependency',
  'concurrency',
  'memory',
  'network',
  'other',
] as const;

export type LimitationCategory = typeof LIMITATION_CATEGORIES[number];

/**
 * Structured security finding.
 */
export interface StructuredSecurityFinding {
  category: SecurityCategory;
  tool: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;  // Human-readable (for display only, not comparison)
}

/**
 * Structured limitation.
 */
export interface StructuredLimitation {
  category: LimitationCategory;
  tool: string;
  constraint?: string;  // e.g., "10MB", "100 req/min"
  description: string;  // Human-readable (for display only)
}

/**
 * Normalized assertion for comparison.
 */
export interface NormalizedAssertion {
  tool: string;
  aspect: string;
  fingerprint: string;  // Normalized key for comparison
  description: string;  // Human-readable (for display only)
  isPositive: boolean;
}

/**
 * Keywords that map to security categories.
 * Now using EXTENDED_SECURITY_KEYWORDS from the semantic utilities module
 * which includes additional categories like XXE, timing attacks, etc.
 */
const SECURITY_KEYWORDS: Record<string, string[]> = EXTENDED_SECURITY_KEYWORDS;

/**
 * Keywords that map to limitation categories.
 */
const LIMITATION_KEYWORDS: Record<LimitationCategory, string[]> = {
  size_limit: ['size limit', 'max size', 'file size', 'mb', 'gb', 'kb', 'bytes', 'too large', 'megabytes', 'gigabytes', 'kilobytes'],
  rate_limit: ['rate limit', 'throttle', 'requests per', 'quota', 'too many requests'],
  timeout: ['timeout', 'time out', 'time limit', 'seconds', 'ms', 'timed out', 'deadline'],
  encoding: ['encoding', 'utf-8', 'ascii', 'binary', 'charset', 'unicode'],
  format: ['format', 'json', 'xml', 'csv', 'type', 'mime', 'content-type'],
  permission: ['permission', 'access', 'denied', 'forbidden', 'read-only', 'write'],
  platform: ['platform', 'windows', 'linux', 'macos', 'os-specific'],
  dependency: ['dependency', 'requires', 'prerequisite', 'library', 'package'],
  concurrency: ['concurrent', 'parallel', 'thread', 'lock', 'race condition'],
  memory: ['memory', 'ram', 'heap', 'out of memory'],
  network: ['network', 'connection', 'offline', 'unreachable'],
  other: [],
};

/**
 * Extract security category from text.
 */
export function extractSecurityCategory(text: string): SecurityCategory {
  const lowerText = text.toLowerCase();

  for (const [category, keywords] of Object.entries(SECURITY_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return category as SecurityCategory;
    }
  }

  return 'other';
}

/**
 * Extract limitation category from text.
 */
export function extractLimitationCategory(text: string): LimitationCategory {
  const lowerText = text.toLowerCase();

  for (const [category, keywords] of Object.entries(LIMITATION_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return category as LimitationCategory;
    }
  }

  return 'other';
}

/**
 * Extract severity from text.
 * Now uses negation-aware extraction to handle phrases like "not critical".
 */
export function extractSeverity(text: string): 'low' | 'medium' | 'high' | 'critical' {
  // Use the enhanced negation-aware severity extraction
  return extractSeverityWithNegation(text);
}

/**
 * Create a normalized fingerprint from assertion text.
 * This extracts key semantic elements for comparison.
 *
 * For assertions about limitations or security, we primarily use
 * the category to ensure semantic equivalence (e.g., "10MB limit" and
 * "files larger than 10 megabytes" both get category 'size_limit').
 */
export function createFingerprint(tool: string, aspect: string, text: string): string {
  const lowerText = text.toLowerCase();

  // Extract key elements
  const elements: string[] = [tool, aspect];

  // For error_handling assertions (often derived from limitations),
  // include the limitation category for semantic grouping
  if (aspect === 'error_handling') {
    const category = extractLimitationCategory(text);
    if (category !== 'other') {
      elements.push(`limit:${category}`);
    }
  }

  // For security aspects, include the security category
  if (aspect === 'security') {
    const category = extractSecurityCategory(text);
    if (category !== 'other') {
      elements.push(`sec:${category}`);
    }
  }

  // Extract action verbs
  const actions = ['returns', 'throws', 'fails', 'succeeds', 'handles', 'validates', 'rejects', 'accepts', 'creates', 'deletes', 'reads', 'writes'];
  for (const action of actions) {
    if (lowerText.includes(action)) {
      elements.push(action);
    }
  }

  // Extract condition keywords (but skip if we already have a category)
  const hasCategory = elements.some(e => e.startsWith('limit:') || e.startsWith('sec:'));
  if (!hasCategory) {
    const conditions = ['error', 'invalid', 'missing', 'empty', 'null', 'undefined', 'exists', 'not found', 'permission', 'timeout'];
    for (const condition of conditions) {
      if (lowerText.includes(condition)) {
        elements.push(condition.replace(' ', '_'));
      }
    }
  }

  // Extract output keywords
  const outputs = ['success', 'failure', 'true', 'false', 'json', 'string', 'array', 'object', 'number', 'boolean'];
  for (const output of outputs) {
    if (lowerText.includes(output)) {
      elements.push(output);
    }
  }

  // Sort for consistency and join
  return elements.sort().join(':');
}

/**
 * Convert raw security notes to structured findings.
 */
export function structureSecurityNotes(
  tool: string,
  notes: string[]
): StructuredSecurityFinding[] {
  return notes.map(note => ({
    category: extractSecurityCategory(note),
    tool,
    severity: extractSeverity(note),
    description: note,
  }));
}

/**
 * Convert raw limitations to structured limitations.
 */
export function structureLimitations(
  tool: string,
  limitations: string[]
): StructuredLimitation[] {
  return limitations.map(limitation => ({
    category: extractLimitationCategory(limitation),
    tool,
    constraint: extractConstraint(limitation),
    description: limitation,
  }));
}

/**
 * Extract numeric constraint from text (e.g., "10MB", "100 requests").
 */
function extractConstraint(text: string): string | undefined {
  // Match patterns like "10MB", "100 requests/min", "30 seconds"
  const patterns = [
    /(\d+\s*[kmgt]?b)/i,           // Size: 10MB, 1GB
    /(\d+\s*(?:ms|seconds?|minutes?|hours?))/i,  // Time
    /(\d+\s*(?:requests?|calls?)(?:\s*\/\s*\w+)?)/i,  // Rate
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

/**
 * Compare two structured security findings.
 * Returns true if they represent the same finding.
 */
export function securityFindingsMatch(
  a: StructuredSecurityFinding,
  b: StructuredSecurityFinding
): boolean {
  return (
    a.category === b.category &&
    a.tool === b.tool &&
    a.severity === b.severity
  );
}

/**
 * Compare two structured security findings with confidence.
 * Returns a confidence score indicating how similar they are.
 */
export function securityFindingsMatchWithConfidence(
  a: StructuredSecurityFinding,
  b: StructuredSecurityFinding
): { matches: boolean; confidence: ChangeConfidence } {
  const factors: ConfidenceFactor[] = [];

  // Category match is critical (50% weight)
  const categoryMatch = a.category === b.category;
  factors.push({
    name: 'category_match',
    weight: 0.5,
    value: categoryMatch ? 100 : 0,
    description: categoryMatch
      ? `Categories match: ${a.category}`
      : `Categories differ: ${a.category} vs ${b.category}`,
  });

  // Tool match (20% weight)
  const toolMatch = a.tool === b.tool;
  factors.push({
    name: 'tool_match',
    weight: 0.2,
    value: toolMatch ? 100 : 0,
    description: toolMatch
      ? `Tools match: ${a.tool}`
      : `Tools differ: ${a.tool} vs ${b.tool}`,
  });

  // Severity match (15% weight)
  const severityMatch = a.severity === b.severity;
  factors.push({
    name: 'severity_match',
    weight: 0.15,
    value: severityMatch ? 100 : severityDistance(a.severity, b.severity),
    description: severityMatch
      ? `Severities match: ${a.severity}`
      : `Severities differ: ${a.severity} vs ${b.severity}`,
  });

  // Description similarity (15% weight)
  const descSimilarity = calculateKeywordOverlap(a.description, b.description);
  factors.push({
    name: 'description_similarity',
    weight: 0.15,
    value: descSimilarity,
    description: `${descSimilarity}% description keyword overlap`,
  });

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.weight * f.value, 0) / totalWeight
  );

  return {
    matches: categoryMatch && toolMatch && severityMatch,
    confidence: {
      score,
      method: 'semantic',
      factors,
    },
  };
}

/**
 * Calculate similarity between severity levels.
 */
function severityDistance(
  a: 'low' | 'medium' | 'high' | 'critical',
  b: 'low' | 'medium' | 'high' | 'critical'
): number {
  const levels = { low: 0, medium: 1, high: 2, critical: 3 };
  const distance = Math.abs(levels[a] - levels[b]);
  // 0 distance = 100%, 1 = 66%, 2 = 33%, 3 = 0%
  return Math.round(100 - (distance / 3) * 100);
}

/**
 * Compare two structured limitations.
 * Returns true if they represent the same limitation.
 */
export function limitationsMatch(
  a: StructuredLimitation,
  b: StructuredLimitation
): boolean {
  return (
    a.category === b.category &&
    a.tool === b.tool
    // Note: We don't compare constraint since "10MB" vs "10 MB" would fail
  );
}

/**
 * Compare two structured limitations with confidence.
 * Returns a confidence score indicating how similar they are.
 */
export function limitationsMatchWithConfidence(
  a: StructuredLimitation,
  b: StructuredLimitation
): { matches: boolean; confidence: ChangeConfidence } {
  const factors: ConfidenceFactor[] = [];

  // Category match is critical (50% weight)
  const categoryMatch = a.category === b.category;
  factors.push({
    name: 'category_match',
    weight: 0.5,
    value: categoryMatch ? 100 : 0,
    description: categoryMatch
      ? `Categories match: ${a.category}`
      : `Categories differ: ${a.category} vs ${b.category}`,
  });

  // Tool match (25% weight)
  const toolMatch = a.tool === b.tool;
  factors.push({
    name: 'tool_match',
    weight: 0.25,
    value: toolMatch ? 100 : 0,
    description: toolMatch
      ? `Tools match: ${a.tool}`
      : `Tools differ: ${a.tool} vs ${b.tool}`,
  });

  // Constraint similarity (10% weight)
  const constraintScore = constraintsMatch(a.constraint, b.constraint);
  factors.push({
    name: 'constraint_match',
    weight: 0.1,
    value: constraintScore,
    description: constraintScore === 100
      ? 'Constraints match'
      : constraintScore > 50
        ? 'Constraints similar'
        : 'Constraints differ or missing',
  });

  // Description similarity (15% weight)
  const descSimilarity = calculateKeywordOverlap(a.description, b.description);
  factors.push({
    name: 'description_similarity',
    weight: 0.15,
    value: descSimilarity,
    description: `${descSimilarity}% description keyword overlap`,
  });

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.weight * f.value, 0) / totalWeight
  );

  return {
    matches: categoryMatch && toolMatch,
    confidence: {
      score,
      method: 'semantic',
      factors,
    },
  };
}

/**
 * Compare constraint values, handling variations like "10MB" vs "10 MB".
 * Now uses enhanced constraint comparison with unit normalization (e.g., 10MB = 10240KB).
 */
function constraintsMatch(a?: string, b?: string): number {
  // Use the enhanced constraint comparison that handles unit conversions
  return compareConstraints(a, b);
}

/**
 * Compare two normalized assertions.
 * Returns true if they have the same fingerprint.
 */
export function assertionsMatch(
  a: NormalizedAssertion,
  b: NormalizedAssertion
): boolean {
  return a.fingerprint === b.fingerprint;
}

/**
 * Compare two normalized assertions with confidence.
 * Returns a confidence score indicating how similar they are.
 */
export function assertionsMatchWithConfidence(
  a: NormalizedAssertion,
  b: NormalizedAssertion
): { matches: boolean; confidence: ChangeConfidence } {
  const factors: ConfidenceFactor[] = [];

  // Fingerprint match (40% weight)
  const fingerprintMatch = a.fingerprint === b.fingerprint;
  factors.push({
    name: 'fingerprint_match',
    weight: 0.4,
    value: fingerprintMatch ? 100 : fingerprintSimilarity(a.fingerprint, b.fingerprint),
    description: fingerprintMatch
      ? 'Fingerprints match exactly'
      : `Fingerprints ${fingerprintSimilarity(a.fingerprint, b.fingerprint)}% similar`,
  });

  // Tool and aspect match (25% weight)
  const toolAspectMatch = a.tool === b.tool && a.aspect === b.aspect;
  factors.push({
    name: 'tool_aspect_match',
    weight: 0.25,
    value: toolAspectMatch ? 100 : (a.tool === b.tool ? 50 : 0),
    description: toolAspectMatch
      ? `Tool and aspect match: ${a.tool}/${a.aspect}`
      : `Tool/aspect differ`,
  });

  // Polarity match (15% weight)
  const polarityMatch = a.isPositive === b.isPositive;
  factors.push({
    name: 'polarity_match',
    weight: 0.15,
    value: polarityMatch ? 100 : 0,
    description: polarityMatch
      ? 'Same polarity'
      : 'Different polarity (positive/negative)',
  });

  // Description similarity (20% weight)
  const descSimilarity = calculateKeywordOverlap(a.description, b.description);
  factors.push({
    name: 'description_similarity',
    weight: 0.2,
    value: descSimilarity,
    description: `${descSimilarity}% description keyword overlap`,
  });

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.weight * f.value, 0) / totalWeight
  );

  return {
    matches: fingerprintMatch,
    confidence: {
      score,
      method: 'semantic',
      factors,
    },
  };
}

/**
 * Calculate similarity between two fingerprints.
 */
function fingerprintSimilarity(a: string, b: string): number {
  const partsA = new Set(a.split(':'));
  const partsB = new Set(b.split(':'));

  if (partsA.size === 0 && partsB.size === 0) return 100;
  if (partsA.size === 0 || partsB.size === 0) return 0;

  const intersection = new Set([...partsA].filter((p) => partsB.has(p)));
  const union = new Set([...partsA, ...partsB]);

  return Math.round((intersection.size / union.size) * 100);
}

/**
 * Find matching item in array using matcher function.
 */
export function findMatch<T>(
  item: T,
  array: T[],
  matcher: (a: T, b: T) => boolean
): T | undefined {
  return array.find(other => matcher(item, other));
}

/**
 * Compare two arrays using semantic matching.
 * Returns items that are only in first array (removed) and only in second (added).
 */
export function compareArraysSemantic<T>(
  previous: T[],
  current: T[],
  matcher: (a: T, b: T) => boolean
): { added: T[]; removed: T[] } {
  const added: T[] = [];
  const removed: T[] = [];

  // Find removed (in previous but not in current)
  for (const prev of previous) {
    if (!findMatch(prev, current, matcher)) {
      removed.push(prev);
    }
  }

  // Find added (in current but not in previous)
  for (const curr of current) {
    if (!findMatch(curr, previous, matcher)) {
      added.push(curr);
    }
  }

  return { added, removed };
}

/**
 * Result of a semantic comparison with confidence.
 */
export interface SemanticComparisonResult<T> {
  /** Items in current but not in previous */
  added: Array<{ item: T; confidence: ChangeConfidence }>;
  /** Items in previous but not in current */
  removed: Array<{ item: T; confidence: ChangeConfidence }>;
  /** Items that match between versions */
  matched: Array<{ previous: T; current: T; confidence: ChangeConfidence }>;
}

/**
 * Compare two arrays using semantic matching with confidence scores.
 * Returns detailed comparison results including confidence for each item.
 */
export function compareArraysSemanticWithConfidence<T>(
  previous: T[],
  current: T[],
  matcherWithConfidence: (a: T, b: T) => { matches: boolean; confidence: ChangeConfidence }
): SemanticComparisonResult<T> {
  const added: Array<{ item: T; confidence: ChangeConfidence }> = [];
  const removed: Array<{ item: T; confidence: ChangeConfidence }> = [];
  const matched: Array<{ previous: T; current: T; confidence: ChangeConfidence }> = [];

  const matchedCurrentIndices = new Set<number>();

  // For each previous item, find best match in current
  for (const prev of previous) {
    let bestMatch: { index: number; current: T; confidence: ChangeConfidence } | null = null;

    for (let i = 0; i < current.length; i++) {
      if (matchedCurrentIndices.has(i)) continue;

      const result = matcherWithConfidence(prev, current[i]);
      if (result.matches) {
        if (!bestMatch || result.confidence.score > bestMatch.confidence.score) {
          bestMatch = { index: i, current: current[i], confidence: result.confidence };
        }
      }
    }

    if (bestMatch) {
      matchedCurrentIndices.add(bestMatch.index);
      matched.push({
        previous: prev,
        current: bestMatch.current,
        confidence: bestMatch.confidence,
      });
    } else {
      // Item was removed - calculate confidence that it's truly gone
      removed.push({
        item: prev,
        confidence: {
          score: 95, // High confidence for removals (we checked all items)
          method: 'semantic',
          factors: [
            {
              name: 'removal_check',
              weight: 1.0,
              value: 95,
              description: `No matching item found in ${current.length} current items`,
            },
          ],
        },
      });
    }
  }

  // Any unmatched current items are additions
  for (let i = 0; i < current.length; i++) {
    if (!matchedCurrentIndices.has(i)) {
      added.push({
        item: current[i],
        confidence: {
          score: 95, // High confidence for additions (we checked all items)
          method: 'semantic',
          factors: [
            {
              name: 'addition_check',
              weight: 1.0,
              value: 95,
              description: `No matching item found in ${previous.length} previous items`,
            },
          ],
        },
      });
    }
  }

  return { added, removed, matched };
}

/**
 * Calculate overall confidence for a semantic comparison operation.
 */
export function calculateComparisonConfidence(
  before: string,
  after: string,
  categoryMatch: boolean
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

  // Factor 2: Length similarity
  const lengthScore = calculateLengthSimilarity(before, after);
  factors.push({
    name: 'length_similarity',
    weight: CONFIDENCE_WEIGHTS.structuralAlignment,
    value: lengthScore,
    description: `${lengthScore}% length similarity`,
  });

  // Factor 3: Semantic indicators
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

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.weight * f.value, 0) / totalWeight
  );

  return {
    score,
    method: 'semantic',
    factors,
  };
}
