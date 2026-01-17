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
  calculateStemmedKeywordOverlap,
  compareQualifiers,
  isSecurityFindingNegated,
} from '../utils/semantic.js';
import {
  extractSecurityCategories,
  extractLimitationCategories,
  findBestSecurityCategoryMatch,
  findBestLimitationCategoryMatch,
  calculateSecurityCategoryRelationship,
  calculateLimitationCategoryRelationship,
} from './category-matching.js';
import {
  findSharedSecurityTerms,
  calculateSynonymSimilarity,
  expandAbbreviations,
  timeExpressionsEqual,
} from './synonyms.js';

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
 * Extract constraint from text (e.g., "10MB", "100 requests", "JSON").
 * Handles numeric constraints and format/type names.
 */
function extractConstraint(text: string): string | undefined {
  // Match patterns like "10MB", "100 requests/min", "30 seconds"
  const numericPatterns = [
    /(\d+\s*[kmgt]?b)/i,           // Size: 10MB, 1GB
    /(\d+\s*(?:ms|seconds?|minutes?|hours?))/i,  // Time
    /(\d+\s*(?:requests?|calls?)(?:\s*\/\s*\w+)?)/i,  // Rate
  ];

  for (const pattern of numericPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // Extract format types (JSON, XML, CSV, etc.)
  const formatPattern = /\b(json|xml|csv|yaml|toml|html|text|binary|utf-?8|ascii)\b/i;
  const formatMatch = text.match(formatPattern);
  if (formatMatch) {
    return formatMatch[1].toLowerCase();
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
 *
 * ENHANCED (v1.1.0): Uses multi-category detection and relationship scoring
 * to improve recall. Categories that are related (e.g., authentication and
 * authorization) now get partial credit instead of 0%.
 *
 * ENHANCED (v1.2.0): Added qualifier comparison to prevent false positives from:
 * - Negation mismatches ("Critical vulnerability found" vs "Not a critical vulnerability")
 * - Database type mismatches (SQL injection vs NoSQL injection)
 *
 * ENHANCED (v1.3.0): Improved recall by:
 * - Adding synonym-based similarity detection
 * - Relaxing severity mismatch (no longer blocks matching)
 * - Lowering thresholds when shared security terms are found
 * - Better handling of abbreviations (SQLi, XSS, SSRF)
 */
export function securityFindingsMatchWithConfidence(
  a: StructuredSecurityFinding,
  b: StructuredSecurityFinding
): { matches: boolean; confidence: ChangeConfidence } {
  const factors: ConfidenceFactor[] = [];

  // Expand abbreviations for better matching
  const descA = expandAbbreviations(a.description);
  const descB = expandAbbreviations(b.description);

  // CRITICAL: Check for negation mismatch FIRST
  // A finding that affirms a vulnerability cannot match one that denies it
  const aNegated = isSecurityFindingNegated(a.description);
  const bNegated = isSecurityFindingNegated(b.description);
  const negationMismatch = aNegated !== bNegated;

  if (negationMismatch) {
    factors.push({
      name: 'negation_check',
      weight: 0.2,
      value: 0,
      description: `Negation mismatch: ${aNegated ? 'first denies' : 'first affirms'}, ${bNegated ? 'second denies' : 'second affirms'}`,
    });
  }

  // Check qualifier compatibility (SQL vs NoSQL, etc.)
  // Only block if there's a clear incompatibility, not just different wording
  const qualifierComparison = compareQualifiers(a.description, b.description);
  const hasHardIncompatibility = qualifierComparison.incompatibilities.some(
    inc => inc.includes('sql vs nosql') || inc.includes('ssrf vs csrf')
  );

  if (qualifierComparison.incompatibilities.length > 0) {
    factors.push({
      name: 'qualifier_compatibility',
      weight: 0.1,
      value: qualifierComparison.score,
      description: `Qualifier issues: ${qualifierComparison.incompatibilities.join(', ')}`,
    });
  }

  // Check for shared security terms (synonym-based matching)
  const sharedTerms = findSharedSecurityTerms(descA, descB);
  const hasSharedSecurityTerms = sharedTerms.length > 0;

  if (hasSharedSecurityTerms) {
    factors.push({
      name: 'shared_security_terms',
      weight: 0.25,
      value: Math.min(100, sharedTerms.length * 50),
      description: `Shared security concepts: ${sharedTerms.join(', ')}`,
    });
  }

  // Synonym-based similarity (catches paraphrases with different wording)
  const synonymSimilarity = calculateSynonymSimilarity(descA, descB, 'security');
  if (synonymSimilarity > 0) {
    factors.push({
      name: 'synonym_similarity',
      weight: 0.15,
      value: synonymSimilarity,
      description: `${synonymSimilarity}% synonym-based similarity`,
    });
  }

  // Multi-category detection: extract ALL categories from descriptions
  const categoriesA = extractSecurityCategories(descA);
  const categoriesB = extractSecurityCategories(descB);

  // Find best matching category pair using relationship scoring
  const bestCategoryMatch = findBestSecurityCategoryMatch(categoriesA, categoriesB);

  // Calculate category relationship score (allows partial credit for related categories)
  let categoryScore: number;
  let categoryDescription: string;

  if (a.category === b.category) {
    // Exact category match from structured data
    categoryScore = 100;
    categoryDescription = `Categories match exactly: ${a.category}`;
  } else if (bestCategoryMatch && bestCategoryMatch.relationshipScore >= 60) {
    // Related categories found via multi-category detection (lowered threshold)
    categoryScore = bestCategoryMatch.relationshipScore;
    categoryDescription = `Related categories: ${bestCategoryMatch.cat1} ~ ${bestCategoryMatch.cat2} (${bestCategoryMatch.relationshipScore}% related)`;
  } else if (hasSharedSecurityTerms) {
    // Shared security terms suggest the same vulnerability type
    categoryScore = 80;
    categoryDescription = `Categories inferred from shared terms: ${sharedTerms.join(', ')}`;
  } else {
    // Check direct relationship between structured categories
    const directRelationship = calculateSecurityCategoryRelationship(a.category, b.category);
    categoryScore = Math.max(directRelationship, 20); // Minimum 20 for any security finding
    categoryDescription = directRelationship >= 50
      ? `Related categories: ${a.category} ~ ${b.category} (${directRelationship}% related)`
      : `Categories differ: ${a.category} vs ${b.category}`;
  }

  // Category match (25% weight - reduced to make room for synonyms)
  factors.push({
    name: 'category_match',
    weight: 0.25,
    value: categoryScore,
    description: categoryDescription,
  });

  // Tool match (10% weight)
  const toolMatch = a.tool === b.tool;
  factors.push({
    name: 'tool_match',
    weight: 0.1,
    value: toolMatch ? 100 : 50,
    description: toolMatch
      ? `Tools match: ${a.tool}`
      : `Different tools: ${a.tool} vs ${b.tool}`,
  });

  // Severity match (10% weight - reduced, severity differences are often benign)
  // IMPORTANT: Severity mismatch no longer blocks matching, only affects confidence
  const severityMatch = a.severity === b.severity;
  const severityScore = severityMatch ? 100 : severityDistance(a.severity, b.severity);
  factors.push({
    name: 'severity_match',
    weight: 0.1,
    value: severityScore,
    description: severityMatch
      ? `Severities match: ${a.severity}`
      : `Severities differ: ${a.severity} vs ${b.severity} (${severityScore}% similar)`,
  });

  // Description similarity with synonym expansion
  const descSimilarity = calculateStemmedKeywordOverlap(descA, descB);
  factors.push({
    name: 'description_similarity',
    weight: 0.15,
    value: descSimilarity,
    description: `${descSimilarity}% description keyword overlap (stemmed)`,
  });

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.weight * f.value, 0) / totalWeight
  );

  // CRITICAL: Only block matching for clear semantic conflicts:
  // 1. Negation mismatch (one affirms, one denies)
  // 2. Hard qualifier incompatibility (SQL vs NoSQL specifically)
  if (negationMismatch) {
    return {
      matches: false,
      confidence: {
        score: Math.min(score, 20),
        method: 'semantic',
        factors,
      },
    };
  }

  if (hasHardIncompatibility) {
    return {
      matches: false,
      confidence: {
        score: Math.min(score, 30),
        method: 'semantic',
        factors,
      },
    };
  }

  // IMPROVED MATCHING LOGIC (v1.3.0 - refined for precision):
  // Match only if:
  // 1. Exact category match with same severity (same finding)
  // 2. Exact category match with similar severity (one-level difference is OK for paraphrases)
  // 3. High synonym similarity (>= 60) with same tool
  //
  // DO NOT match if:
  // - Severity difference of 2+ levels (high vs low = real drift, not paraphrase)
  // - Different categories without very high confidence
  const exactCategoryMatch = a.category === b.category && a.category !== 'other';
  const relatedCategories = categoryScore >= 70; // Stricter threshold
  const highDescriptionSimilarity = descSimilarity >= 40 || synonymSimilarity >= 50;

  // For severity differences:
  // - Exact match with any severity: always a match (paraphrases may describe severity differently)
  // - Different categories: only match if very high similarity
  //
  // Note: We initially tried blocking 2+ level severity differences, but this hurt recall
  // since the same vulnerability might be described with different severity assessments.
  // Better to match and let human review decide if severity change is drift.
  const matches =
    (exactCategoryMatch && toolMatch) ||
    (exactCategoryMatch && descSimilarity >= 20) ||
    (hasSharedSecurityTerms && toolMatch && synonymSimilarity >= 30) ||
    (synonymSimilarity >= 60 && toolMatch) ||
    (relatedCategories && highDescriptionSimilarity && toolMatch);

  return {
    matches,
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
 *
 * ENHANCED (v1.1.0): Uses multi-category detection and relationship scoring
 * to improve recall for limitation paraphrases.
 *
 * ENHANCED (v1.2.0): Added qualifier comparison to prevent false positives from:
 * - Direction mismatches (upload limit vs download limit)
 * - Timeout type mismatches (connection timeout vs read timeout)
 * - Rate time unit mismatches (per minute vs per hour)
 *
 * ENHANCED (v1.3.0): Improved recall by:
 * - Adding synonym-based similarity for limitation descriptions
 * - Time expression normalization (30s = 30 seconds)
 * - Relaxed matching thresholds while maintaining constraint validation
 *
 * IMPORTANT: Two limitations with the same category but significantly different
 * constraint values (e.g., 10MB vs 100MB) are NOT considered matching.
 */
export function limitationsMatchWithConfidence(
  a: StructuredLimitation,
  b: StructuredLimitation
): { matches: boolean; confidence: ChangeConfidence } {
  const factors: ConfidenceFactor[] = [];

  // Expand abbreviations for better matching
  const descA = expandAbbreviations(a.description);
  const descB = expandAbbreviations(b.description);

  // Check qualifier compatibility (upload vs download, timeout types, rate units)
  const qualifierComparison = compareQualifiers(a.description, b.description);
  // Only strict qualifier incompatibilities should block matching
  const hasHardIncompatibility = qualifierComparison.incompatibilities.some(
    inc => inc.includes('upload vs download') || inc.includes('connection timeout vs read timeout')
  );

  if (qualifierComparison.incompatibilities.length > 0) {
    factors.push({
      name: 'qualifier_compatibility',
      weight: 0.1,
      value: qualifierComparison.score,
      description: `Qualifier issues: ${qualifierComparison.incompatibilities.join(', ')}`,
    });
  }

  // Check time expression equivalence (30 seconds = 30s = 30000ms)
  const timeExpressionsMatch = timeExpressionsEqual(descA, descB);
  if (timeExpressionsMatch) {
    factors.push({
      name: 'time_equivalence',
      weight: 0.15,
      value: 100,
      description: 'Time expressions are equivalent',
    });
  }

  // Synonym-based similarity for limitations
  const synonymSimilarity = calculateSynonymSimilarity(descA, descB, 'limitation');
  if (synonymSimilarity > 0) {
    factors.push({
      name: 'synonym_similarity',
      weight: 0.15,
      value: synonymSimilarity,
      description: `${synonymSimilarity}% synonym-based similarity`,
    });
  }

  // Multi-category detection for limitations
  const categoriesA = extractLimitationCategories(descA);
  const categoriesB = extractLimitationCategories(descB);

  // Find best matching category pair
  const bestCategoryMatch = findBestLimitationCategoryMatch(categoriesA, categoriesB);

  // Calculate category relationship score
  let categoryScore: number;
  let categoryDescription: string;

  if (a.category === b.category) {
    categoryScore = 100;
    categoryDescription = `Categories match exactly: ${a.category}`;
  } else if (bestCategoryMatch && bestCategoryMatch.relationshipScore >= 60) {
    categoryScore = bestCategoryMatch.relationshipScore;
    categoryDescription = `Related categories: ${bestCategoryMatch.cat1} ~ ${bestCategoryMatch.cat2} (${bestCategoryMatch.relationshipScore}% related)`;
  } else if (synonymSimilarity >= 50) {
    // Synonym similarity suggests same limitation type
    categoryScore = 70;
    categoryDescription = `Categories inferred from synonym similarity: ${synonymSimilarity}%`;
  } else {
    const directRelationship = calculateLimitationCategoryRelationship(a.category, b.category);
    categoryScore = Math.max(directRelationship, 20); // Minimum 20 for any limitation
    categoryDescription = directRelationship >= 50
      ? `Related categories: ${a.category} ~ ${b.category} (${directRelationship}% related)`
      : `Categories differ: ${a.category} vs ${b.category}`;
  }

  // Category match (25% weight - reduced to make room for synonyms)
  factors.push({
    name: 'category_match',
    weight: 0.25,
    value: categoryScore,
    description: categoryDescription,
  });

  // Tool match (10% weight)
  const toolMatch = a.tool === b.tool;
  factors.push({
    name: 'tool_match',
    weight: 0.1,
    value: toolMatch ? 100 : 50,
    description: toolMatch
      ? `Tools match: ${a.tool}`
      : `Different tools: ${a.tool} vs ${b.tool}`,
  });

  // Constraint similarity (20% weight - reduced slightly)
  // Also check if time expressions match even if constraints don't
  let constraintScore = constraintsMatch(a.constraint, b.constraint);
  if (timeExpressionsMatch && constraintScore < 100) {
    constraintScore = Math.max(constraintScore, 90); // Time equivalence implies constraint match
  }
  factors.push({
    name: 'constraint_match',
    weight: 0.2,
    value: constraintScore,
    description: constraintScore === 100
      ? 'Constraints match exactly'
      : constraintScore > 80
        ? 'Constraints very similar'
        : constraintScore > 50
          ? 'Constraints similar'
          : 'Constraints differ significantly',
  });

  // Description similarity with stemming
  const descSimilarity = calculateStemmedKeywordOverlap(descA, descB);
  factors.push({
    name: 'description_similarity',
    weight: 0.15,
    value: descSimilarity,
    description: `${descSimilarity}% description keyword overlap (stemmed)`,
  });

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.weight * f.value, 0) / totalWeight
  );

  // CRITICAL: Block matching for semantic conflicts
  // For limitations, qualifier incompatibilities should block matching
  // (e.g., "no limit" vs "limit of", "per minute" vs "per hour")
  if (hasHardIncompatibility || qualifierComparison.incompatibilities.length > 0) {
    return {
      matches: false,
      confidence: {
        score: Math.min(score, 35),
        method: 'semantic',
        factors,
      },
    };
  }

  // IMPROVED MATCHING LOGIC (v1.3.0 - balanced for precision/recall):
  // Match if:
  // 1. Exact category match with compatible constraints
  // 2. Time expressions are equivalent (implies same limitation)
  // 3. Same category with moderate description similarity
  // 4. High synonym similarity with same tool
  //
  // IMPORTANT: Constraint compatibility is still required (but threshold lowered)
  const exactCategoryMatch = a.category === b.category && a.category !== 'other';
  const constraintsCompatible = constraintScore > 35 || timeExpressionsMatch;
  const moderateDescriptionSimilarity = descSimilarity >= 35 || synonymSimilarity >= 40;

  // Constraints must be compatible for limitations to match
  const matches = constraintsCompatible && (
    (exactCategoryMatch) ||
    timeExpressionsMatch ||
    (toolMatch && moderateDescriptionSimilarity && synonymSimilarity >= 30)
  );

  return {
    matches,
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
 *
 * ENHANCED (v1.2.0): Added qualifier comparison to prevent false positives from:
 * - Opposite terms (synchronous vs asynchronous, enabled vs disabled)
 * - Status code differences (200 vs 201)
 *
 * ENHANCED (v1.3.0): Improved recall by:
 * - Adding synonym-based similarity for behavioral descriptions
 * - Relaxed fingerprint matching (partial matches now count)
 * - Better polarity detection that handles paraphrasing
 * - Lower thresholds while blocking only clear semantic conflicts
 */
export function assertionsMatchWithConfidence(
  a: NormalizedAssertion,
  b: NormalizedAssertion
): { matches: boolean; confidence: ChangeConfidence } {
  const factors: ConfidenceFactor[] = [];

  // Expand abbreviations for better matching
  const descA = expandAbbreviations(a.description);
  const descB = expandAbbreviations(b.description);

  // Check qualifier compatibility (opposite terms, negation)
  const qualifierComparison = compareQualifiers(a.description, b.description);
  // Only hard incompatibilities should block matching
  const hasHardIncompatibility = qualifierComparison.incompatibilities.some(
    inc => inc.includes('synchronous vs asynchronous') || inc.includes('enabled vs disabled')
  );

  if (qualifierComparison.incompatibilities.length > 0) {
    factors.push({
      name: 'qualifier_compatibility',
      weight: 0.1,
      value: qualifierComparison.score,
      description: `Qualifier issues: ${qualifierComparison.incompatibilities.join(', ')}`,
    });
  }

  // Synonym-based similarity for behavioral descriptions
  const synonymSimilarity = calculateSynonymSimilarity(descA, descB, 'behavior');
  if (synonymSimilarity > 0) {
    factors.push({
      name: 'synonym_similarity',
      weight: 0.15,
      value: synonymSimilarity,
      description: `${synonymSimilarity}% synonym-based similarity`,
    });
  }

  // Fingerprint match (25% weight - reduced to allow more flexibility)
  const fingerprintMatch = a.fingerprint === b.fingerprint;
  const fpSimilarity = fingerprintSimilarity(a.fingerprint, b.fingerprint);
  factors.push({
    name: 'fingerprint_match',
    weight: 0.25,
    value: fingerprintMatch ? 100 : fpSimilarity,
    description: fingerprintMatch
      ? 'Fingerprints match exactly'
      : `Fingerprints ${fpSimilarity}% similar`,
  });

  // Tool and aspect match (20% weight)
  const toolAspectMatch = a.tool === b.tool && a.aspect === b.aspect;
  const toolMatch = a.tool === b.tool;
  factors.push({
    name: 'tool_aspect_match',
    weight: 0.2,
    value: toolAspectMatch ? 100 : (toolMatch ? 70 : 30),
    description: toolAspectMatch
      ? `Tool and aspect match: ${a.tool}/${a.aspect}`
      : toolMatch
        ? `Tool matches: ${a.tool}, aspects differ`
        : `Tools differ`,
  });

  // Polarity match (10% weight)
  // IMPROVED: Handle paraphrases where polarity is implicitly the same
  const polarityMatch = a.isPositive === b.isPositive;
  // If descriptions are highly similar, assume polarity is consistent (paraphrase)
  const implicitPolarityMatch = synonymSimilarity >= 60 || fpSimilarity >= 70;
  factors.push({
    name: 'polarity_match',
    weight: 0.1,
    value: polarityMatch ? 100 : (implicitPolarityMatch ? 80 : 20),
    description: polarityMatch
      ? 'Same polarity'
      : implicitPolarityMatch
        ? 'Polarity difference likely paraphrasing'
        : 'Different polarity (positive/negative)',
  });

  // Description similarity with stemming
  const descSimilarity = calculateStemmedKeywordOverlap(descA, descB);
  factors.push({
    name: 'description_similarity',
    weight: 0.2,
    value: descSimilarity,
    description: `${descSimilarity}% description keyword overlap (stemmed)`,
  });

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.weight * f.value, 0) / totalWeight
  );

  // CRITICAL: Block matching for semantic conflicts
  // For assertions, ANY qualifier incompatibility should block matching
  // (assertions define precise behaviors - "error" vs "null" is real drift)
  if (hasHardIncompatibility || qualifierComparison.incompatibilities.length > 0) {
    return {
      matches: false,
      confidence: {
        score: Math.min(score, 40),
        method: 'semantic',
        factors,
      },
    };
  }

  // IMPROVED MATCHING LOGIC (v1.3.0 - balanced for precision/recall):
  // Match if:
  // 1. Exact fingerprint match (almost certainly same assertion)
  // 2. Tool/aspect match with moderate description similarity AND same polarity
  // 3. High fingerprint similarity (>= 60) with matching tool
  // 4. High synonym similarity (>= 50) with tool match
  const highFingerprintSimilarity = fpSimilarity >= 60;
  const moderateDescriptionSimilarity = descSimilarity >= 40 || synonymSimilarity >= 45;

  const matches =
    fingerprintMatch ||
    (toolAspectMatch && moderateDescriptionSimilarity && polarityMatch) ||
    (toolMatch && highFingerprintSimilarity && polarityMatch) ||
    (toolMatch && synonymSimilarity >= 50 && polarityMatch);

  return {
    matches,
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
