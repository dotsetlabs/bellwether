/**
 * Category Matching and Relationship Scoring
 *
 * Provides multi-category detection and relationship scoring for improved
 * recall in semantic matching. Instead of first-match-wins, this module
 * extracts ALL matching categories and scores relationships between them.
 *
 * Key improvements over single-category matching:
 * 1. Multi-category detection - finds all matching categories
 * 2. Relationship scoring - related categories get partial credit
 * 3. Best-match selection - finds highest-confidence category pair
 */

import { EXTENDED_SECURITY_KEYWORDS } from '../utils/semantic.js';

/**
 * Result of category extraction with confidence.
 */
export interface CategoryMatch {
  category: string;
  confidence: number;
  matchedKeywords: string[];
}

/**
 * Category relationship groups.
 * Categories in the same group are related and should get partial credit.
 *
 * IMPORTANT (v1.3.0): Groups are now more conservative to prevent false positives.
 * - Authentication and Authorization are NOT grouped (they're different concerns)
 * - Injection types are more narrowly grouped
 * - Only truly similar vulnerabilities are grouped
 */
export const SECURITY_CATEGORY_GROUPS: Record<string, string[]> = {
  // File/path related vulnerabilities (narrowed)
  file_access: ['path_traversal', 'file_upload'],
  // SQL-specific injection (narrowed - SQL and command injection are different)
  sql_issues: ['sql_injection'],
  // Command execution issues
  command_issues: ['command_injection'],
  // XSS-specific
  xss_issues: ['xss', 'output_encoding'],
  // Access control (without auth/authz - they're different)
  access: ['access_control'],
  // Data handling issues (narrowed)
  data: ['information_disclosure', 'cryptography'],
  // Input handling
  input_handling: ['input_validation'],
  // Server-side issues (narrowed)
  server_side: ['ssrf'],
  // Deserialization standalone
  deserialization_issues: ['deserialization'],
  // XXE standalone (different from deserialization despite both being data handling)
  xxe_issues: ['xxe'],
};

/**
 * Limitation category relationship groups.
 */
export const LIMITATION_CATEGORY_GROUPS: Record<string, string[]> = {
  // Resource constraints
  resource: ['size_limit', 'memory', 'rate_limit'],
  // Time-related
  temporal: ['timeout', 'rate_limit'],
  // Access-related
  access: ['permission', 'platform'],
  // Format-related
  format: ['encoding', 'format'],
};

/**
 * Direct category similarity scores (0-100).
 * Used for categories that are similar but not in the same group.
 *
 * IMPORTANT (v1.3.0): Reduced similarity scores to prevent false positives.
 * Authentication vs Authorization are now considered DIFFERENT (not related).
 * Only truly similar categories get partial credit.
 */
const CATEGORY_SIMILARITY: Record<string, Record<string, number>> = {
  path_traversal: {
    file_upload: 40,  // Reduced - only somewhat related
    information_disclosure: 30,  // Reduced
  },
  sql_injection: {
    input_validation: 40,  // Reduced - input validation is generic
  },
  xss: {
    output_encoding: 50,  // Reduced
    input_validation: 30,  // Reduced
  },
  // IMPORTANT: authentication and authorization are now DIFFERENT
  // They are distinct security concerns and should not match
  authentication: {
    session_management: 40,  // Only session mgmt is somewhat related
  },
  authorization: {
    access_control: 50,  // Access control is related but distinct
  },
  input_validation: {
    output_encoding: 40,
  },
};

/**
 * Extract ALL matching security categories from text with confidence scores.
 * Unlike single-category extraction, this returns all matches ranked by confidence.
 */
export function extractSecurityCategories(text: string): CategoryMatch[] {
  const matches: CategoryMatch[] = [];
  const lowerText = text.toLowerCase();

  for (const [category, keywords] of Object.entries(EXTENDED_SECURITY_KEYWORDS)) {
    const matchedKeywords = keywords.filter(keyword => lowerText.includes(keyword));

    if (matchedKeywords.length > 0) {
      // Calculate confidence based on keyword match quality
      const confidence = calculateCategoryConfidence(text, matchedKeywords, keywords);
      matches.push({
        category,
        confidence,
        matchedKeywords,
      });
    }
  }

  // Sort by confidence (highest first)
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Limitation category keywords for multi-category extraction.
 */
const LIMITATION_KEYWORDS: Record<string, string[]> = {
  size_limit: ['size limit', 'max size', 'file size', 'mb', 'gb', 'kb', 'bytes', 'too large', 'megabytes', 'gigabytes', 'kilobytes', 'maximum'],
  rate_limit: ['rate limit', 'throttle', 'requests per', 'quota', 'too many requests', 'rate limiting'],
  timeout: ['timeout', 'time out', 'time limit', 'seconds', 'timed out', 'deadline', 'expires'],
  encoding: ['encoding', 'utf-8', 'ascii', 'binary', 'charset', 'unicode'],
  format: ['format', 'json', 'xml', 'csv', 'type', 'mime', 'content-type'],
  permission: ['permission', 'access', 'denied', 'forbidden', 'read-only', 'write', 'privileges'],
  platform: ['platform', 'windows', 'linux', 'macos', 'os-specific', 'operating system'],
  dependency: ['dependency', 'requires', 'prerequisite', 'library', 'package', 'module'],
  concurrency: ['concurrent', 'parallel', 'thread', 'lock', 'race condition', 'simultaneous'],
  memory: ['memory', 'ram', 'heap', 'out of memory', 'memory limit'],
  network: ['network', 'connection', 'offline', 'unreachable', 'connectivity'],
};

/**
 * Extract ALL matching limitation categories from text with confidence scores.
 */
export function extractLimitationCategories(text: string): CategoryMatch[] {
  const matches: CategoryMatch[] = [];
  const lowerText = text.toLowerCase();

  for (const [category, keywords] of Object.entries(LIMITATION_KEYWORDS)) {
    const matchedKeywords = keywords.filter(keyword => lowerText.includes(keyword));

    if (matchedKeywords.length > 0) {
      const confidence = calculateCategoryConfidence(text, matchedKeywords, keywords);
      matches.push({
        category,
        confidence,
        matchedKeywords,
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Calculate confidence for a category match based on keyword quality.
 */
function calculateCategoryConfidence(
  text: string,
  matchedKeywords: string[],
  allKeywords: string[]
): number {
  if (matchedKeywords.length === 0) return 0;

  // Base confidence from keyword count
  const keywordRatio = matchedKeywords.length / Math.min(allKeywords.length, 5);
  let confidence = Math.min(keywordRatio * 60, 60); // Max 60 from keyword count

  // Bonus for longer/more specific keywords
  const avgKeywordLength = matchedKeywords.reduce((sum, k) => sum + k.length, 0) / matchedKeywords.length;
  if (avgKeywordLength > 10) confidence += 20;
  else if (avgKeywordLength > 5) confidence += 10;

  // Bonus for multiple distinct keywords
  if (matchedKeywords.length >= 3) confidence += 15;
  else if (matchedKeywords.length >= 2) confidence += 10;

  // Penalty if text is very long but few keywords matched
  const textLength = text.length;
  if (textLength > 200 && matchedKeywords.length === 1) {
    confidence -= 10;
  }

  return Math.min(Math.max(confidence, 10), 100);
}

/**
 * Calculate relationship score between two security categories.
 * Returns 0-100 where:
 * - 100: Same category
 * - 70-90: Categories in same group
 * - 40-60: Related categories
 * - 0-30: Unrelated categories
 */
export function calculateSecurityCategoryRelationship(cat1: string, cat2: string): number {
  if (cat1 === cat2) return 100;

  // Check direct similarity scores
  const directScore = CATEGORY_SIMILARITY[cat1]?.[cat2] ?? CATEGORY_SIMILARITY[cat2]?.[cat1];
  if (directScore !== undefined) return directScore;

  // Check if in same group
  for (const groupCategories of Object.values(SECURITY_CATEGORY_GROUPS)) {
    if (groupCategories.includes(cat1) && groupCategories.includes(cat2)) {
      return 70; // Same group gets 70%
    }
  }

  // Unrelated
  return 0;
}

/**
 * Calculate relationship score between two limitation categories.
 */
export function calculateLimitationCategoryRelationship(cat1: string, cat2: string): number {
  if (cat1 === cat2) return 100;

  // Check if in same group
  for (const groupCategories of Object.values(LIMITATION_CATEGORY_GROUPS)) {
    if (groupCategories.includes(cat1) && groupCategories.includes(cat2)) {
      return 70;
    }
  }

  return 0;
}

/**
 * Find the best category match between two texts.
 * Returns the highest-scoring category pair and their relationship score.
 */
export function findBestSecurityCategoryMatch(
  categories1: CategoryMatch[],
  categories2: CategoryMatch[]
): { cat1: string; cat2: string; relationshipScore: number; combinedConfidence: number } | null {
  if (categories1.length === 0 || categories2.length === 0) {
    return null;
  }

  let bestMatch: { cat1: string; cat2: string; relationshipScore: number; combinedConfidence: number } | null = null;
  let bestScore = 0;

  for (const c1 of categories1) {
    for (const c2 of categories2) {
      const relationshipScore = calculateSecurityCategoryRelationship(c1.category, c2.category);

      if (relationshipScore > 0) {
        // Combined score considers both category confidence and relationship
        const combinedConfidence = Math.round(
          (c1.confidence * 0.4 + c2.confidence * 0.4 + relationshipScore * 0.2)
        );

        // Prefer higher relationship scores, then higher combined confidence
        const totalScore = relationshipScore * 100 + combinedConfidence;

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = {
            cat1: c1.category,
            cat2: c2.category,
            relationshipScore,
            combinedConfidence,
          };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Find the best limitation category match between two texts.
 */
export function findBestLimitationCategoryMatch(
  categories1: CategoryMatch[],
  categories2: CategoryMatch[]
): { cat1: string; cat2: string; relationshipScore: number; combinedConfidence: number } | null {
  if (categories1.length === 0 || categories2.length === 0) {
    return null;
  }

  let bestMatch: { cat1: string; cat2: string; relationshipScore: number; combinedConfidence: number } | null = null;
  let bestScore = 0;

  for (const c1 of categories1) {
    for (const c2 of categories2) {
      const relationshipScore = calculateLimitationCategoryRelationship(c1.category, c2.category);

      if (relationshipScore > 0) {
        const combinedConfidence = Math.round(
          (c1.confidence * 0.4 + c2.confidence * 0.4 + relationshipScore * 0.2)
        );

        const totalScore = relationshipScore * 100 + combinedConfidence;

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = {
            cat1: c1.category,
            cat2: c2.category,
            relationshipScore,
            combinedConfidence,
          };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Check if two security categories are considered matching.
 * Uses relationship scoring for partial credit.
 */
export function securityCategoriesMatch(cat1: string, cat2: string): boolean {
  const relationshipScore = calculateSecurityCategoryRelationship(cat1, cat2);
  // Consider matching if relationship score is 50 or higher
  return relationshipScore >= 50;
}

/**
 * Check if two limitation categories are considered matching.
 */
export function limitationCategoriesMatch(cat1: string, cat2: string): boolean {
  const relationshipScore = calculateLimitationCategoryRelationship(cat1, cat2);
  return relationshipScore >= 50;
}
