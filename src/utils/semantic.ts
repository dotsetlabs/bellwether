/**
 * Semantic text analysis utilities.
 *
 * Provides stemming, negation handling, constraint normalization,
 * and enhanced keyword extraction for semantic matching.
 */

/**
 * Common English suffixes for stemming.
 * This is a simplified Porter-like stemmer that handles common cases.
 */
const SUFFIX_RULES: Array<{ suffix: string; replacement: string; minLength: number }> = [
  // Plurals
  { suffix: 'ies', replacement: 'y', minLength: 4 },
  { suffix: 'es', replacement: '', minLength: 4 },
  { suffix: 's', replacement: '', minLength: 4 },
  // Past tense and gerunds
  { suffix: 'ied', replacement: 'y', minLength: 4 },
  { suffix: 'ed', replacement: '', minLength: 4 },
  { suffix: 'ing', replacement: '', minLength: 5 },
  // Adverbs and adjectives
  { suffix: 'ly', replacement: '', minLength: 4 },
  { suffix: 'ness', replacement: '', minLength: 5 },
  { suffix: 'ment', replacement: '', minLength: 5 },
  { suffix: 'able', replacement: '', minLength: 5 },
  { suffix: 'ible', replacement: '', minLength: 5 },
  { suffix: 'tion', replacement: '', minLength: 5 },
  { suffix: 'sion', replacement: '', minLength: 5 },
  { suffix: 'ity', replacement: '', minLength: 4 },
  { suffix: 'ful', replacement: '', minLength: 4 },
  { suffix: 'less', replacement: '', minLength: 5 },
  { suffix: 'ive', replacement: '', minLength: 4 },
  { suffix: 'ous', replacement: '', minLength: 4 },
  { suffix: 'er', replacement: '', minLength: 4 },
  { suffix: 'est', replacement: '', minLength: 4 },
];

/**
 * Irregular word mappings that don't follow suffix rules.
 */
const IRREGULAR_STEMS: Record<string, string> = {
  // Verbs
  ran: 'run',
  running: 'run',
  runs: 'run',
  wrote: 'write',
  written: 'write',
  writes: 'write',
  writing: 'write',
  read: 'read',
  reads: 'read',
  reading: 'read',
  went: 'go',
  goes: 'go',
  going: 'go',
  gone: 'go',
  was: 'be',
  were: 'be',
  been: 'be',
  being: 'be',
  had: 'have',
  has: 'have',
  having: 'have',
  did: 'do',
  does: 'do',
  doing: 'do',
  made: 'make',
  makes: 'make',
  making: 'make',
  took: 'take',
  takes: 'take',
  taking: 'take',
  taken: 'take',
  got: 'get',
  gets: 'get',
  getting: 'get',
  threw: 'throw',
  throws: 'throw',
  throwing: 'throw',
  thrown: 'throw',
  found: 'find',
  finds: 'find',
  finding: 'find',
  caught: 'catch',
  catches: 'catch',
  catching: 'catch',
  sent: 'send',
  sends: 'send',
  sending: 'send',
  built: 'build',
  builds: 'build',
  building: 'build',
  // Nouns
  files: 'file',
  directories: 'directory',
  paths: 'path',
  errors: 'error',
  exceptions: 'exception',
  requests: 'request',
  responses: 'response',
  users: 'user',
  attacks: 'attack',
  vulnerabilities: 'vulnerability',
  injections: 'injection',
  children: 'child',
  data: 'datum',
  // Technical terms
  authenticated: 'auth',
  authentication: 'auth',
  authenticates: 'auth',
  authorized: 'author',
  authorization: 'author',
  authorizes: 'author',
  validated: 'valid',
  validates: 'valid',
  validation: 'valid',
  sanitized: 'sanit',
  sanitizes: 'sanit',
  sanitization: 'sanit',
  encrypted: 'encrypt',
  encrypts: 'encrypt',
  encryption: 'encrypt',
  decrypted: 'decrypt',
  decrypts: 'decrypt',
  decryption: 'decrypt',
};

/**
 * Stem a single word using simplified Porter-like rules.
 *
 * @param word - Word to stem (should be lowercase)
 * @returns Stemmed word
 */
export function stem(word: string): string {
  if (!word || word.length < 3) return word;

  // Check irregular mappings first
  if (IRREGULAR_STEMS[word]) {
    return IRREGULAR_STEMS[word];
  }

  // Apply suffix rules
  for (const rule of SUFFIX_RULES) {
    if (word.length >= rule.minLength && word.endsWith(rule.suffix)) {
      const stemmed = word.slice(0, -rule.suffix.length) + rule.replacement;
      // Don't stem if result is too short
      if (stemmed.length >= 2) {
        return stemmed;
      }
    }
  }

  return word;
}

/**
 * Stem all words in a text.
 *
 * @param text - Text to stem
 * @returns Text with all words stemmed
 */
export function stemText(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map(word => stem(word.replace(/[^a-z0-9]/g, '')))
    .filter(w => w.length > 0)
    .join(' ');
}

/**
 * Extract keywords with stemming applied.
 *
 * @param text - Text to extract keywords from
 * @returns Set of stemmed keywords
 */
export function extractStemmedKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
    'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'under', 'again', 'further', 'then',
    'once', 'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either',
    'neither', 'not', 'only', 'own', 'same', 'than', 'too', 'very',
    'just', 'also', 'now', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'every', 'any', 'some', 'no', 'such', 'what',
    'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'it', 'its',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .map(w => stem(w));

  return new Set(words);
}

/**
 * Calculate keyword overlap with stemming.
 *
 * @param text1 - First text
 * @param text2 - Second text
 * @returns Overlap percentage (0-100)
 */
export function calculateStemmedKeywordOverlap(text1: string, text2: string): number {
  const words1 = extractStemmedKeywords(text1);
  const words2 = extractStemmedKeywords(text2);

  if (words1.size === 0 && words2.size === 0) return 100;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return Math.round((intersection.size / union.size) * 100);
}

/**
 * Negation patterns that flip the meaning of following words.
 */
const NEGATION_PATTERNS = [
  /\bnot\s+(\w+)/gi,
  /\bno\s+(\w+)/gi,
  /\bnever\s+(\w+)/gi,
  /\bwithout\s+(\w+)/gi,
  /\bdoes\s*n[o']t\s+(\w+)/gi,
  /\bisn[o']t\s+(\w+)/gi,
  /\baren[o']t\s+(\w+)/gi,
  /\bwasn[o']t\s+(\w+)/gi,
  /\bweren[o']t\s+(\w+)/gi,
  /\bcan[o']t\s+(\w+)/gi,
  /\bcannot\s+(\w+)/gi,
  /\bwon[o']t\s+(\w+)/gi,
  /\bdon[o']t\s+(\w+)/gi,
  /\bdoesn[o']t\s+(\w+)/gi,
  /\bshouldn[o']t\s+(\w+)/gi,
  /\bwouldn[o']t\s+(\w+)/gi,
  /\bcouldn[o']t\s+(\w+)/gi,
  /\bunlike(ly)?\s+(\w+)/gi,
  /\bimpossible\b/gi,
  /\bnon[-_]?(\w+)/gi,
];

/**
 * Keywords that indicate severity levels.
 */
const SEVERITY_KEYWORDS = {
  critical: ['critical', 'severe', 'rce', 'remote code execution', 'arbitrary code', 'complete compromise'],
  high: ['high', 'dangerous', 'injection', 'traversal', 'lfi', 'ssrf', 'arbitrary file', 'xxe', 'deserialization', 'unsafe', '../', '..\\'],
  medium: ['medium', 'moderate', 'potential', 'possible', 'may lead', 'could allow'],
  low: ['low', 'minor', 'informational', 'best practice', 'recommendation'],
};

/**
 * Result of negation analysis.
 */
export interface NegationResult {
  /** Negated words found in text */
  negatedWords: string[];
  /** Whether the overall sentiment is negated */
  isNegated: boolean;
  /** Original text with negations marked */
  markedText: string;
}

/**
 * Analyze text for negation patterns.
 *
 * @param text - Text to analyze
 * @returns Negation analysis result
 */
export function analyzeNegation(text: string): NegationResult {
  const negatedWords: string[] = [];
  let markedText = text;

  for (const pattern of NEGATION_PATTERNS) {
    let match: RegExpExecArray | null;
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      // The negated word is typically in the first or second capture group
      const negatedWord = match[1] || match[2];
      if (negatedWord) {
        negatedWords.push(negatedWord.toLowerCase());
        markedText = markedText.replace(match[0], `[NEGATED:${match[0]}]`);
      }
    }
  }

  return {
    negatedWords,
    isNegated: negatedWords.length > 0,
    markedText,
  };
}

/**
 * Check if a severity keyword is negated in the text.
 *
 * @param text - Text to check
 * @param keyword - Severity keyword to look for
 * @returns True if keyword is negated
 */
export function isSeverityNegated(text: string, keyword: string): boolean {
  const lowerText = text.toLowerCase();
  const keywordIndex = lowerText.indexOf(keyword.toLowerCase());

  if (keywordIndex === -1) return false;

  // Check if there's a negation within 3 words before the keyword
  const beforeText = lowerText.slice(Math.max(0, keywordIndex - 30), keywordIndex);

  const negationIndicators = [
    'not ', 'no ', 'never ', 'without ', "isn't ", "aren't ", "wasn't ",
    "weren't ", "don't ", "doesn't ", "didn't ", "won't ", "can't ",
    "cannot ", "shouldn't ", "wouldn't ", "couldn't ", 'non-', 'non_',
    'unlikely', 'not considered', 'not a ',
  ];

  return negationIndicators.some(neg => beforeText.includes(neg));
}

/**
 * Extract severity from text with negation handling.
 *
 * @param text - Text to extract severity from
 * @returns Extracted severity level
 */
export function extractSeverityWithNegation(text: string): 'low' | 'medium' | 'high' | 'critical' {
  const lowerText = text.toLowerCase();

  // Check each severity level from highest to lowest
  for (const [level, keywords] of Object.entries(SEVERITY_KEYWORDS) as Array<
    [keyof typeof SEVERITY_KEYWORDS, string[]]
  >) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        // Check if this keyword is negated
        if (isSeverityNegated(text, keyword)) {
          // If negated, skip to next keyword
          continue;
        }
        return level;
      }
    }
  }

  // Default to low if no keywords found
  return 'low';
}

/**
 * Size unit multipliers to bytes.
 */
const SIZE_UNITS: Record<string, number> = {
  b: 1,
  byte: 1,
  bytes: 1,
  kb: 1024,
  kilobyte: 1024,
  kilobytes: 1024,
  kib: 1024,
  mb: 1024 * 1024,
  megabyte: 1024 * 1024,
  megabytes: 1024 * 1024,
  mib: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  gigabyte: 1024 * 1024 * 1024,
  gigabytes: 1024 * 1024 * 1024,
  gib: 1024 * 1024 * 1024,
  tb: 1024 * 1024 * 1024 * 1024,
  terabyte: 1024 * 1024 * 1024 * 1024,
  terabytes: 1024 * 1024 * 1024 * 1024,
  tib: 1024 * 1024 * 1024 * 1024,
};

/**
 * Time unit multipliers to milliseconds.
 */
const TIME_UNITS: Record<string, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

/**
 * Rate unit multipliers to per-second.
 */
const RATE_UNITS: Record<string, number> = {
  '/s': 1,
  '/sec': 1,
  '/second': 1,
  'per second': 1,
  'per sec': 1,
  '/m': 1 / 60,
  '/min': 1 / 60,
  '/minute': 1 / 60,
  'per minute': 1 / 60,
  'per min': 1 / 60,
  '/h': 1 / 3600,
  '/hr': 1 / 3600,
  '/hour': 1 / 3600,
  'per hour': 1 / 3600,
  'per hr': 1 / 3600,
  '/d': 1 / 86400,
  '/day': 1 / 86400,
  'per day': 1 / 86400,
};

/**
 * Normalized constraint value.
 */
export interface NormalizedConstraint {
  /** Original constraint string */
  original: string;
  /** Type of constraint */
  type: 'size' | 'time' | 'rate' | 'count' | 'unknown';
  /** Numeric value */
  value: number;
  /** Normalized unit */
  unit: string;
  /** Value in base units (bytes for size, ms for time, per-second for rate) */
  baseValue: number;
}

/**
 * Parse and normalize a constraint value.
 *
 * @param constraint - Constraint string (e.g., "10MB", "30 seconds", "100 requests/min")
 * @returns Normalized constraint or undefined if not parseable
 */
export function normalizeConstraint(constraint: string): NormalizedConstraint | undefined {
  if (!constraint) return undefined;

  const original = constraint.trim();
  const lower = original.toLowerCase();

  // Try to match size pattern: number followed by size unit
  const sizeMatch = lower.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
  if (sizeMatch) {
    const value = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2];
    if (SIZE_UNITS[unit] !== undefined) {
      return {
        original,
        type: 'size',
        value,
        unit,
        baseValue: value * SIZE_UNITS[unit],
      };
    }
    if (TIME_UNITS[unit] !== undefined) {
      return {
        original,
        type: 'time',
        value,
        unit,
        baseValue: value * TIME_UNITS[unit],
      };
    }
  }

  // Try to match rate pattern: number [unit] per/slash time
  const rateMatch = lower.match(/^(\d+(?:\.\d+)?)\s*(?:requests?|calls?|ops?|operations?|queries?)?\s*(per\s+\w+|\/\w+)$/);
  if (rateMatch) {
    const value = parseFloat(rateMatch[1]);
    const rateUnit = rateMatch[2];
    if (RATE_UNITS[rateUnit] !== undefined) {
      return {
        original,
        type: 'rate',
        value,
        unit: rateUnit,
        baseValue: value * RATE_UNITS[rateUnit],
      };
    }
  }

  // Try plain number (count)
  const countMatch = lower.match(/^(\d+(?:\.\d+)?)$/);
  if (countMatch) {
    const value = parseFloat(countMatch[1]);
    return {
      original,
      type: 'count',
      value,
      unit: '',
      baseValue: value,
    };
  }

  return undefined;
}

/**
 * Format types that are considered equivalent or related.
 */
const FORMAT_EQUIVALENTS: Record<string, string[]> = {
  json: ['json'],
  xml: ['xml'],
  csv: ['csv'],
  yaml: ['yaml', 'yml'],
  html: ['html', 'htm'],
  text: ['text', 'txt', 'plain'],
  binary: ['binary', 'bin'],
};

/**
 * Compare two constraint values with unit normalization.
 *
 * @param a - First constraint
 * @param b - Second constraint
 * @returns Similarity score (0-100)
 */
export function compareConstraints(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 100;
  if (!a || !b) return 50;

  const normA = normalizeConstraint(a);
  const normB = normalizeConstraint(b);

  // Check if both are format types (non-numeric strings)
  const cleanA = a.replace(/\s/g, '').toLowerCase();
  const cleanB = b.replace(/\s/g, '').toLowerCase();

  // Check if these are format type strings (json, xml, etc.)
  const isFormatA = Object.keys(FORMAT_EQUIVALENTS).some(fmt =>
    FORMAT_EQUIVALENTS[fmt].includes(cleanA)
  );
  const isFormatB = Object.keys(FORMAT_EQUIVALENTS).some(fmt =>
    FORMAT_EQUIVALENTS[fmt].includes(cleanB)
  );

  if (isFormatA && isFormatB) {
    // Both are format types - compare them
    const formatA = Object.keys(FORMAT_EQUIVALENTS).find(fmt =>
      FORMAT_EQUIVALENTS[fmt].includes(cleanA)
    );
    const formatB = Object.keys(FORMAT_EQUIVALENTS).find(fmt =>
      FORMAT_EQUIVALENTS[fmt].includes(cleanB)
    );
    return formatA === formatB ? 100 : 0; // Format types must match exactly
  }

  // If both couldn't be parsed, do string comparison
  if (!normA && !normB) {
    return cleanA === cleanB ? 100 : 30;
  }

  // One parsed, one didn't
  if (!normA || !normB) return 40;

  // Different types of constraints
  if (normA.type !== normB.type) return 20;

  // Same type - compare base values
  if (normA.baseValue === normB.baseValue) return 100;

  // Close values (within 10%)
  const ratio = Math.min(normA.baseValue, normB.baseValue) / Math.max(normA.baseValue, normB.baseValue);
  if (ratio > 0.9) return 90;
  if (ratio > 0.8) return 75;
  if (ratio > 0.5) return 50;

  return 30;
}

/**
 * Extended security category keywords including new categories.
 */
export const EXTENDED_SECURITY_KEYWORDS: Record<string, string[]> = {
  path_traversal: [
    'path traversal', 'directory traversal', '../', '..\\', 'lfi',
    'local file inclusion', 'arbitrary file', 'file path manipulation',
    'escape directory', 'outside base', 'outside allowed', 'read files',
    'directory escape', 'file access', 'traverse', 'dot dot slash',
  ],
  command_injection: [
    'command injection', 'shell injection', 'os command', 'exec',
    'system(', 'subprocess', 'shell=true', 'code execution',
    'system call', 'execute command', 'command execution', 'shell command',
  ],
  sql_injection: [
    'sql injection', 'sqli', 'query injection', 'database injection',
    'union select', 'drop table', 'or 1=1', 'inject sql', 'sql can be injected',
    'malicious sql', 'sql vulnerability', 'unsanitized sql', 'sql command',
    'database query', 'sql statement', 'parameterized', 'prepared statement',
  ],
  xss: [
    'xss', 'cross-site scripting', 'script injection', 'html injection',
    'dom-based', 'reflected xss', 'stored xss', 'cross site', 'javascript injection',
    'without encoding', 'unescaped output', 'unsanitized output', 'xss vulnerability',
  ],
  xxe: [
    'xxe', 'xml external entity', 'xml injection', 'entity expansion',
    'billion laughs', 'dtd injection', 'xml bomb',
  ],
  ssrf: [
    'ssrf', 'server-side request forgery', 'internal network',
    'localhost access', 'cloud metadata', '169.254.169.254',
    'internal services', 'server side request',
    'internal resources', 'access internal',
  ],
  deserialization: [
    'deserialization', 'unsafe deserialization', 'object injection',
    'pickle', 'yaml.load', 'unserialize', 'readobject',
  ],
  timing_attack: [
    'timing attack', 'side-channel', 'timing side channel',
    'constant-time', 'timing oracle', 'cache timing',
  ],
  race_condition: [
    'race condition', 'toctou', 'time of check', 'concurrency bug',
    'check-then-use', 'double-checked locking',
  ],
  file_upload: [
    'file upload', 'arbitrary upload', 'unrestricted upload',
    'malicious file', 'upload bypass', 'content-type bypass',
  ],
  access_control: [
    'access control', 'unauthorized access', 'privilege escalation',
    'bypass', 'idor', 'insecure direct object',
  ],
  authentication: [
    'authentication', 'auth bypass', 'credential', 'password',
    'login', 'brute force', 'credential stuffing',
  ],
  authorization: [
    'authorization', 'permission', 'role', 'access denied',
    'forbidden', 'rbac bypass', 'acl bypass',
  ],
  information_disclosure: [
    'information disclosure', 'data leak', 'sensitive data',
    'expose', 'reveals', 'verbose error', 'stack trace',
  ],
  denial_of_service: [
    'denial of service', 'dos', 'resource exhaustion', 'infinite loop',
    'crash', 'regex dos', 'redos', 'algorithmic complexity',
  ],
  input_validation: [
    'input validation', 'sanitization', 'validation', 'untrusted input',
    'user input', 'malformed input', 'validate input', 'input sanitization',
  ],
  output_encoding: [
    'output encoding', 'escape', 'encoding', 'sanitize output',
    'context-aware encoding',
  ],
  cryptography: [
    'cryptography', 'encryption', 'hashing', 'random', 'weak cipher',
    'hardcoded key', 'insecure random', 'md5', 'sha1', 'ecb mode',
  ],
  session_management: [
    'session', 'cookie', 'token', 'jwt', 'session fixation',
    'session hijacking', 'insecure cookie',
  ],
  error_handling: [
    'error handling', 'exception', 'stack trace', 'verbose error',
    'error message', 'unhandled exception',
  ],
  logging: [
    'logging', 'audit', 'sensitive log', 'log injection',
    'insufficient logging',
  ],
  configuration: [
    'configuration', 'hardcoded', 'default', 'insecure default',
    'misconfiguration', 'debug mode',
  ],
  prototype_pollution: [
    'prototype pollution', '__proto__', 'constructor.prototype',
    'object pollution',
  ],
  open_redirect: [
    'open redirect', 'url redirect', 'redirect vulnerability',
    'unvalidated redirect',
  ],
  clickjacking: [
    'clickjacking', 'ui redress', 'frame injection', 'x-frame-options',
  ],
  cors: [
    'cors', 'cross-origin', 'access-control-allow-origin',
    'cors misconfiguration',
  ],
  csp_bypass: [
    'csp bypass', 'content security policy', 'script-src bypass',
  ],
  other: [],
};

/**
 * Extract security category from text using extended keywords.
 *
 * @param text - Text to analyze
 * @returns Detected security category
 */
export function extractSecurityCategoryExtended(text: string): string {
  const lowerText = text.toLowerCase();

  for (const [category, keywords] of Object.entries(EXTENDED_SECURITY_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return category;
    }
  }

  return 'other';
}

/**
 * Check if two texts are semantically similar considering stemming.
 *
 * @param text1 - First text
 * @param text2 - Second text
 * @param threshold - Minimum similarity threshold (0-100, default 60)
 * @returns True if texts are similar
 */
export function areSemanticallySimular(text1: string, text2: string, threshold = 60): boolean {
  return calculateStemmedKeywordOverlap(text1, text2) >= threshold;
}

// ============================================================================
// QUALIFIER EXTRACTION
// ============================================================================
// These functions extract specific qualifiers that distinguish similar-but-different
// concepts. This prevents false positives like matching "SQL injection" with
// "NoSQL injection" or "upload limit" with "download limit".

/**
 * Database type qualifiers that distinguish different injection types.
 */
export type DatabaseQualifier = 'sql' | 'nosql' | 'mongodb' | 'redis' | 'generic';

/**
 * Direction qualifiers for file/data operations.
 */
export type DirectionQualifier = 'upload' | 'download' | 'read' | 'write' | 'generic';

/**
 * Timeout type qualifiers.
 */
export type TimeoutQualifier = 'connection' | 'read' | 'write' | 'request' | 'response' | 'idle' | 'generic';

/**
 * Polarity indicator for assertions (positive vs negative statements).
 */
export type Polarity = 'positive' | 'negative' | 'neutral';

/**
 * Full qualifier extraction result.
 */
export interface QualifierResult {
  database: DatabaseQualifier;
  direction: DirectionQualifier;
  timeout: TimeoutQualifier;
  polarity: Polarity;
  isNegated: boolean;
  rateTimeUnit: 'second' | 'minute' | 'hour' | 'day' | 'unknown';
}

/**
 * Extract database type qualifier from text.
 * Distinguishes SQL from NoSQL/MongoDB/Redis etc.
 */
export function extractDatabaseQualifier(text: string): DatabaseQualifier {
  const lower = text.toLowerCase();

  // Check for explicit NoSQL indicators BEFORE SQL check
  // (otherwise "NoSQL" would match "SQL" first)
  if (lower.includes('nosql') ||
      lower.includes('no-sql') ||
      lower.includes('non-sql') ||
      lower.includes('document database') ||
      lower.includes('key-value')) {
    return 'nosql';
  }

  // Specific database types
  if (lower.includes('mongodb') || lower.includes('mongo db')) {
    return 'mongodb';
  }
  if (lower.includes('redis')) {
    return 'redis';
  }

  // Generic SQL (checked after NoSQL to avoid false matches)
  if (lower.includes('sql') && !lower.includes('nosql')) {
    return 'sql';
  }

  return 'generic';
}

/**
 * Extract direction qualifier from text.
 * Distinguishes upload from download, read from write.
 */
export function extractDirectionQualifier(text: string): DirectionQualifier {
  const lower = text.toLowerCase();

  // Upload indicators
  if (lower.includes('upload') ||
      lower.includes('incoming') ||
      lower.includes('receive') ||
      lower.includes('inbound') ||
      lower.includes('sent to server')) {
    return 'upload';
  }

  // Download indicators
  if (lower.includes('download') ||
      lower.includes('outgoing') ||
      lower.includes('fetch') ||
      lower.includes('outbound') ||
      lower.includes('retrieve') ||
      lower.includes('from server')) {
    return 'download';
  }

  // Read vs write
  if (lower.includes('read') && !lower.includes('write')) {
    return 'read';
  }
  if (lower.includes('write') && !lower.includes('read')) {
    return 'write';
  }

  return 'generic';
}

/**
 * Extract timeout type qualifier from text.
 * Distinguishes connection timeout from read/write/request timeouts.
 */
export function extractTimeoutQualifier(text: string): TimeoutQualifier {
  const lower = text.toLowerCase();

  if (lower.includes('connection timeout') ||
      lower.includes('connect timeout') ||
      lower.includes('connection time')) {
    return 'connection';
  }

  if (lower.includes('read timeout') ||
      lower.includes('reading timeout') ||
      lower.includes('socket read')) {
    return 'read';
  }

  if (lower.includes('write timeout') ||
      lower.includes('writing timeout') ||
      lower.includes('socket write')) {
    return 'write';
  }

  if (lower.includes('request timeout')) {
    return 'request';
  }

  if (lower.includes('response timeout')) {
    return 'response';
  }

  if (lower.includes('idle timeout') ||
      lower.includes('inactivity timeout')) {
    return 'idle';
  }

  return 'generic';
}

/**
 * Extract rate limit time unit from text.
 * Distinguishes per-second from per-minute from per-hour limits.
 */
export function extractRateTimeUnit(text: string): 'second' | 'minute' | 'hour' | 'day' | 'unknown' {
  const lower = text.toLowerCase();

  // Per second patterns
  if (lower.includes('per second') ||
      lower.includes('/s') ||
      lower.includes('/sec') ||
      lower.includes('per sec')) {
    return 'second';
  }

  // Per minute patterns
  if (lower.includes('per minute') ||
      lower.includes('/m') ||
      lower.includes('/min') ||
      lower.includes('per min') ||
      lower.includes('rpm')) {
    return 'minute';
  }

  // Per hour patterns
  if (lower.includes('per hour') ||
      lower.includes('/h') ||
      lower.includes('/hr') ||
      lower.includes('per hr') ||
      lower.includes('hourly')) {
    return 'hour';
  }

  // Per day patterns
  if (lower.includes('per day') ||
      lower.includes('/d') ||
      lower.includes('daily') ||
      lower.includes('per 24')) {
    return 'day';
  }

  return 'unknown';
}

/**
 * Detect overall polarity of an assertion.
 * Returns 'negative' if the statement is negated/denied.
 */
export function detectPolarity(text: string): Polarity {
  const lower = text.toLowerCase();

  // Strong negative indicators at the start
  const negativeStarters = [
    'not ', 'no ', 'never ', 'without ', 'lacks ', 'missing ',
    'does not ', "doesn't ", 'cannot ', "can't ", 'will not ',
    "won't ", 'should not ', "shouldn't ", 'must not ', "mustn't ",
    'is not ', "isn't ", 'are not ', "aren't ", 'was not ', "wasn't ",
    'were not ', "weren't ", 'has not ', "hasn't ", 'have not ', "haven't ",
    'did not ', "didn't ", 'do not ', "don't ", 'does not ', "doesn't ",
    'unable to ', 'fails to ', 'failed to ', 'prevents ', 'blocks ',
    'denies ', 'rejects ', 'refuses ', 'prohibits ', 'disallows ',
  ];

  // Check if text starts with negative
  for (const starter of negativeStarters) {
    if (lower.startsWith(starter)) {
      return 'negative';
    }
  }

  // Check for "not a/an" patterns indicating absence
  if (/not\s+a\s+\w+/.test(lower) ||
      /not\s+an\s+\w+/.test(lower) ||
      /no\s+\w+\s+(vulnerability|issue|problem|risk|threat)/.test(lower) ||
      /is\s+not\s+\w+/.test(lower)) {
    return 'negative';
  }

  // Positive affirmation patterns
  const positiveIndicators = [
    'is a ', 'is an ', 'contains ', 'includes ', 'has ', 'found ',
    'detected ', 'identified ', 'discovered ', 'confirmed ', 'exists ',
    'present ', 'vulnerable to ', 'affected by ', 'susceptible to ',
  ];

  for (const indicator of positiveIndicators) {
    if (lower.includes(indicator)) {
      return 'positive';
    }
  }

  return 'neutral';
}

/**
 * Check if a security finding or assertion is negated.
 * Returns true if the text explicitly denies the assertion/vulnerability.
 */
export function isSecurityFindingNegated(text: string): boolean {
  const lower = text.toLowerCase();

  // Patterns that explicitly deny a vulnerability or assertion
  const negationPatterns = [
    // Vulnerability negations
    /not\s+(a\s+)?(critical|high|medium|low|severe)\s+vulnerab/i,
    /no\s+(critical|high|medium|low)\s+(severity\s+)?vulnerab/i,
    /not\s+vulnerable\s+to/i,
    /no\s+vulnerab/i,
    /vulnerab\w*\s+(was\s+)?not\s+found/i,
    /no\s+(security\s+)?(issues?|problems?|risks?|threats?)\s+found/i,
    /does\s+not\s+(have|contain|exhibit)\s+\w*\s*vulnerab/i,
    /lacks?\s+\w*\s*vulnerab/i,
    /absence\s+of\s+\w*\s*vulnerab/i,
    /free\s+(from|of)\s+\w*\s*vulnerab/i,
    /passed\s+security/i,
    /security\s+check\s+passed/i,
    /is\s+secure/i,
    /not\s+affected/i,
    /not\s+susceptible/i,
    // General action negations (for assertions)
    /is\s+not\s+(validated|required|enabled|allowed|supported)/i,
    /\b(not|never)\s+(validated|required|enabled|allowed|supported|checked|verified)\b/i,
    /\b(disabled|disallowed|unsupported|unchecked|unverified)\b/i,
    /\bno\s+(size|rate|time)\s+limit\b/i,
    /\b(lacks?|missing|without)\s+(validation|authentication|authorization)/i,
  ];

  for (const pattern of negationPatterns) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract all qualifiers from text.
 * Provides comprehensive context for semantic comparison.
 */
export function extractQualifiers(text: string): QualifierResult {
  return {
    database: extractDatabaseQualifier(text),
    direction: extractDirectionQualifier(text),
    timeout: extractTimeoutQualifier(text),
    polarity: detectPolarity(text),
    isNegated: isSecurityFindingNegated(text),
    rateTimeUnit: extractRateTimeUnit(text),
  };
}

/**
 * Opposite term pairs that indicate incompatible meanings.
 * When one text contains one term and the other contains its opposite,
 * they should not match.
 *
 * Format: [term1, term2, useWordBoundary]
 * useWordBoundary: true if we should match as whole words (prevents "asynchronous" matching "synchronous")
 */
const OPPOSITE_TERMS: Array<[string, string, boolean]> = [
  // State opposites (need word boundaries to avoid substring matches)
  ['enabled', 'disabled', false],
  ['required', 'optional', false],
  ['synchronous', 'asynchronous', true], // word boundary to avoid substring match
  ['sync', 'async', true], // abbreviations
  ['horizontal', 'vertical', true],
  ['read', 'write', true], // word boundary for "read" vs "write"
  ['upload', 'download', false],
  ['input', 'output', false],
  ['success', 'failure', false],
  ['valid', 'invalid', false],
  ['secure', 'insecure', false],
  ['encrypted', 'unencrypted', false],
  ['authenticated', 'unauthenticated', false],
  ['authorized', 'unauthorized', false],
  // Quantity opposites
  ['limited', 'unlimited', false],
  // HTTP status code opposites
  ['200', '201', true], // Different success codes
  ['200', '404', true],
  ['200', '500', true],
  // Severity opposites
  ['high', 'low', true],
  ['critical', 'low', true],
  // Security type opposites
  ['server-side', 'cross-site', true],
  ['ssrf', 'csrf', true],
  ['xss', 'csrf', true],
  ['local file', 'remote file', false],
  ['lfi', 'rfi', true],
  // v1.3.0: Additional behavior opposites for better assertion matching
  ['error', 'null', true], // Different return types
  ['null', 'default', true], // Different return values
  ['throws', 'returns', true], // Different error handling
  ['creates', 'fails', true], // Different file behaviors
  ['creates', 'deletes', true],
  ['exists', 'not found', false],
  ['found', 'missing', true],
  // Format opposites
  ['json', 'text', true],
  ['json', 'plain text', false],
  ['binary', 'text', true],
  // Rate limit time units
  ['per minute', 'per hour', false],
  ['per second', 'per minute', false],
  ['per second', 'per hour', false],
  // Limit presence opposites
  ['no limit', 'limit of', false],
  ['no size limit', 'size limit', false],
];

/**
 * Check if a word exists in text as a whole word (not as substring).
 */
function containsWord(text: string, word: string): boolean {
  const regex = new RegExp(`\\b${word}\\b`, 'i');
  return regex.test(text);
}

/**
 * Check if two texts contain opposite terms.
 */
function containsOppositeTerms(text1: string, text2: string): string | null {
  const lower1 = text1.toLowerCase();
  const lower2 = text2.toLowerCase();

  for (const [term1, term2, useWordBoundary] of OPPOSITE_TERMS) {
    let has1InText1: boolean;
    let has2InText2: boolean;
    let has1InText2: boolean;
    let has2InText1: boolean;

    if (useWordBoundary) {
      has1InText1 = containsWord(lower1, term1);
      has2InText2 = containsWord(lower2, term2);
      has1InText2 = containsWord(lower1, term2);
      has2InText1 = containsWord(lower2, term1);
    } else {
      has1InText1 = lower1.includes(term1);
      has2InText2 = lower2.includes(term2);
      has1InText2 = lower1.includes(term2);
      has2InText1 = lower2.includes(term1);
    }

    // Check if text1 has term1 and text2 has term2 (but not vice versa)
    if (has1InText1 && has2InText2 && !has1InText2 && !has2InText1) {
      return `${term1} vs ${term2}`;
    }
    // Check if text1 has term2 and text2 has term1 (but not vice versa)
    if (has2InText1 && has1InText2 && !has1InText1 && !has2InText2) {
      return `${term2} vs ${term1}`;
    }
  }

  return null;
}

/**
 * Compare qualifiers between two texts.
 * Returns a compatibility score (0-100).
 */
export function compareQualifiers(text1: string, text2: string): {
  score: number;
  incompatibilities: string[];
} {
  const q1 = extractQualifiers(text1);
  const q2 = extractQualifiers(text2);
  const incompatibilities: string[] = [];
  let score = 100;

  // Negation mismatch is fatal - positive and negative can't match
  if ((q1.isNegated && !q2.isNegated) || (!q1.isNegated && q2.isNegated)) {
    incompatibilities.push('negation mismatch (one affirms, one denies)');
    score -= 80; // Almost always a mismatch
  }

  // Polarity mismatch (weaker than negation)
  if (q1.polarity !== q2.polarity && q1.polarity !== 'neutral' && q2.polarity !== 'neutral') {
    if ((q1.polarity === 'positive' && q2.polarity === 'negative') ||
        (q1.polarity === 'negative' && q2.polarity === 'positive')) {
      incompatibilities.push(`polarity mismatch (${q1.polarity} vs ${q2.polarity})`);
      score -= 40;
    }
  }

  // Check for opposite terms (enabled vs disabled, synchronous vs asynchronous, etc.)
  const oppositeTerms = containsOppositeTerms(text1, text2);
  if (oppositeTerms) {
    incompatibilities.push(`opposite terms: ${oppositeTerms}`);
    score -= 60;
  }

  // Database qualifier mismatch (SQL vs NoSQL is incompatible)
  if (q1.database !== 'generic' && q2.database !== 'generic' && q1.database !== q2.database) {
    incompatibilities.push(`database type mismatch (${q1.database} vs ${q2.database})`);
    score -= 60; // Increased penalty
  }

  // Direction qualifier mismatch (upload vs download is incompatible)
  if (q1.direction !== 'generic' && q2.direction !== 'generic' && q1.direction !== q2.direction) {
    incompatibilities.push(`direction mismatch (${q1.direction} vs ${q2.direction})`);
    score -= 50; // Increased penalty
  }

  // Timeout type mismatch
  if (q1.timeout !== 'generic' && q2.timeout !== 'generic' && q1.timeout !== q2.timeout) {
    incompatibilities.push(`timeout type mismatch (${q1.timeout} vs ${q2.timeout})`);
    score -= 55; // Increased penalty to ensure score < 50
  }

  // Rate time unit mismatch (per minute vs per hour is different)
  if (q1.rateTimeUnit !== 'unknown' && q2.rateTimeUnit !== 'unknown' &&
      q1.rateTimeUnit !== q2.rateTimeUnit) {
    incompatibilities.push(`rate time unit mismatch (${q1.rateTimeUnit} vs ${q2.rateTimeUnit})`);
    score -= 55; // Increased penalty to ensure score < 50
  }

  return {
    score: Math.max(0, score),
    incompatibilities,
  };
}

/**
 * Check if two texts have compatible qualifiers for matching.
 * Returns false if there are critical incompatibilities.
 */
export function qualifiersCompatible(text1: string, text2: string): boolean {
  const { score } = compareQualifiers(text1, text2);
  // Require more than 50% compatibility for texts to match (stricter threshold)
  return score > 50;
}
