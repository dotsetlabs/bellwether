/**
 * Security and Technical Term Synonyms for Improved Recall
 *
 * This module provides comprehensive synonym mappings to improve
 * paraphrase detection in drift detection. Synonyms are bidirectional
 * and include abbreviations, alternative phrasings, and related terms.
 */

/**
 * Security vulnerability synonyms.
 * Each entry maps a canonical term to all equivalent expressions.
 */
export const SECURITY_SYNONYMS: Record<string, string[]> = {
  // Path Traversal
  path_traversal: [
    'path traversal', 'directory traversal', 'file path traversal',
    'lfi', 'local file inclusion', 'file inclusion',
    'arbitrary file', 'file access', 'path manipulation',
    'dotdot', '../', 'parent directory', 'directory escape',
    'path injection', 'file path injection', 'traverse',
  ],

  // SQL Injection
  sql_injection: [
    'sql injection', 'sqli', 'sql attack', 'database injection',
    'query injection', 'sql vulnerability', 'inject sql',
    'unsanitized sql', 'raw sql', 'dynamic sql',
    'parameterized', 'prepared statement', 'query construction',
    'string interpolation', 'f-string', 'concatenat',
    'blind injection', 'boolean-based', 'time-based',
    'second order', 'union-based', 'error-based',
  ],

  // Cross-Site Scripting
  xss: [
    'xss', 'cross-site scripting', 'cross site scripting',
    'script injection', 'html injection', 'javascript injection',
    'reflected xss', 'stored xss', 'dom xss', 'dom-based',
    'unsanitized output', 'unescaped', 'encoding', 'escaping',
    'html entity', 'script tag', 'onclick', 'onerror',
    'rendered', 'reflected', 'user input',
  ],

  // Command Injection
  command_injection: [
    'command injection', 'os injection', 'shell injection',
    'code injection', 'rce', 'remote code execution',
    'system()', 'exec()', 'eval()', 'popen',
    'subprocess', 'shell command', 'execute command',
    'os command', 'operating system', 'shell',
  ],

  // SSRF
  ssrf: [
    'ssrf', 'server-side request forgery', 'server side request forgery',
    'internal network', 'internal service', 'localhost',
    '127.0.0.1', 'metadata service', 'cloud metadata',
    'url fetch', 'url redirect', 'request to internal',
  ],

  // Authentication/Authorization
  authentication: [
    'authentication', 'auth', 'login', 'credential',
    'password', 'session', 'token', 'jwt',
    'bearer', 'api key', 'secret', 'identity',
    'sign in', 'sign-in', 'signin', 'logged in',
  ],

  authorization: [
    'authorization', 'access control', 'permission',
    'privilege', 'role', 'rbac', 'acl',
    'forbidden', 'denied', 'allowed', 'grant',
    'elevated', 'escalation', 'bypass',
  ],

  // Information Disclosure
  information_disclosure: [
    'information disclosure', 'data leak', 'data exposure',
    'sensitive data', 'sensitive information', 'pii',
    'personally identifiable', 'credit card', 'ssn',
    'secret', 'private', 'confidential', 'expose',
    'leak', 'disclose', 'reveal',
  ],

  // Input Validation
  input_validation: [
    'input validation', 'validate input', 'sanitize',
    'user input', 'user-controlled', 'user controlled',
    'untrusted input', 'external input', 'tainted',
    'whitelist', 'blacklist', 'filter', 'cleanse',
  ],

  // Generic vulnerability terms
  vulnerability: [
    'vulnerability', 'vuln', 'flaw', 'weakness',
    'security issue', 'security bug', 'security hole',
    'exploit', 'exploitable', 'attack', 'malicious',
    'threat', 'risk', 'unsafe', 'insecure',
  ],
};

/**
 * Limitation/constraint synonyms.
 */
export const LIMITATION_SYNONYMS: Record<string, string[]> = {
  // Size limits
  size_limit: [
    'size limit', 'file size', 'max size', 'maximum size',
    'too large', 'exceeds', 'bytes', 'kb', 'mb', 'gb',
    'kilobyte', 'megabyte', 'gigabyte', 'byte',
    'upload limit', 'download limit',
  ],

  // Rate limits
  rate_limit: [
    'rate limit', 'throttle', 'throttling', 'quota',
    'requests per', 'per second', 'per minute', 'per hour',
    'too many requests', '429', 'rate-limit', 'rate limiting',
    'burst', 'capacity', 'allowance',
  ],

  // Timeouts
  timeout: [
    'timeout', 'time out', 'timed out', 'time limit',
    'deadline', 'expir', 'seconds', 'milliseconds', 'ms',
    'connection timeout', 'read timeout', 'write timeout',
    'execution time', 'max time', 'time exceeded',
  ],

  // Format/encoding
  format: [
    'format', 'encoding', 'charset', 'content-type',
    'mime', 'json', 'xml', 'csv', 'yaml',
    'utf-8', 'utf8', 'ascii', 'binary',
    'schema', 'structure', 'type',
  ],
};

/**
 * Behavioral assertion synonyms.
 */
export const BEHAVIOR_SYNONYMS: Record<string, string[]> = {
  // Error handling
  error: [
    'error', 'exception', 'throw', 'raise', 'fail',
    'invalid', 'reject', 'deny', 'refuse',
    'not found', 'missing', 'absent', 'null',
    'undefined', 'empty', 'blank',
  ],

  // Success
  success: [
    'success', 'succeed', 'return', 'result',
    'complete', 'finish', 'done', 'ok',
    'valid', 'accept', 'allow', 'permit',
    'found', 'exist', 'present', 'create',
  ],

  // Validation
  validate: [
    'validate', 'check', 'verify', 'ensure',
    'confirm', 'assert', 'require', 'expect',
    'must', 'should', 'need',
  ],

  // Data handling
  handle: [
    'handle', 'process', 'parse', 'convert',
    'transform', 'modify', 'change', 'update',
    'read', 'write', 'save', 'load',
  ],
};

/**
 * Build a reverse lookup map from any synonym to its canonical term.
 */
export function buildSynonymLookup(
  synonymMap: Record<string, string[]>
): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const [canonical, synonyms] of Object.entries(synonymMap)) {
    // Map the canonical term to itself
    lookup.set(canonical, canonical);

    // Map all synonyms to the canonical term
    for (const synonym of synonyms) {
      // Normalize the synonym
      const normalized = synonym.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      lookup.set(normalized, canonical);

      // Also add without underscores for flexible matching
      const noUnderscore = synonym.toLowerCase().replace(/[^a-z0-9]/g, '');
      lookup.set(noUnderscore, canonical);
    }
  }

  return lookup;
}

// Pre-built lookup maps
const securityLookup = buildSynonymLookup(SECURITY_SYNONYMS);
const limitationLookup = buildSynonymLookup(LIMITATION_SYNONYMS);
const behaviorLookup = buildSynonymLookup(BEHAVIOR_SYNONYMS);

/**
 * Expand a text by adding canonical terms for any synonyms found.
 * This improves keyword overlap for paraphrases.
 */
export function expandWithSynonyms(
  text: string,
  type: 'security' | 'limitation' | 'behavior' = 'security'
): string {
  const lookup = type === 'security' ? securityLookup
    : type === 'limitation' ? limitationLookup
    : behaviorLookup;

  const words = text.toLowerCase().split(/\s+/);
  const expanded: string[] = [...words];

  // Check individual words
  for (const word of words) {
    const normalized = word.replace(/[^a-z0-9]/g, '');
    const canonical = lookup.get(normalized);
    if (canonical && !expanded.includes(canonical)) {
      expanded.push(canonical);
    }
  }

  // Check 2-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = words[i] + '_' + words[i + 1];
    const phraseCleaned = phrase.replace(/[^a-z0-9_]/g, '');
    const canonical = lookup.get(phraseCleaned);
    if (canonical && !expanded.includes(canonical)) {
      expanded.push(canonical);
    }
  }

  // Check 3-word phrases
  for (let i = 0; i < words.length - 2; i++) {
    const phrase = words[i] + '_' + words[i + 1] + '_' + words[i + 2];
    const phraseCleaned = phrase.replace(/[^a-z0-9_]/g, '');
    const canonical = lookup.get(phraseCleaned);
    if (canonical && !expanded.includes(canonical)) {
      expanded.push(canonical);
    }
  }

  return expanded.join(' ');
}

/**
 * Generic terms that are too broad to use for similarity matching.
 * These terms are common across many vulnerability types and would cause false matches.
 */
const GENERIC_SECURITY_TERMS = new Set([
  'vulnerability',       // Too broad - appears in all security findings
  'authentication',      // Too broad - auth bypass vs missing auth are different
  'authorization',       // Too broad - authz flaw vs missing authz are different
  'input_validation',    // Too broad - many issues involve input
]);

/**
 * Check if two texts share a canonical security term.
 * Returns the matching term(s) or empty array if no match.
 *
 * NOTE: Generic terms like "vulnerability" are excluded since they would
 * cause false matches between completely different vulnerability types.
 */
export function findSharedSecurityTerms(text1: string, text2: string): string[] {
  const terms1 = new Set<string>();
  const terms2 = new Set<string>();

  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  // Extract canonical terms from text1 (excluding generic terms)
  for (const word of words1) {
    const normalized = word.replace(/[^a-z0-9]/g, '');
    const canonical = securityLookup.get(normalized);
    if (canonical && !GENERIC_SECURITY_TERMS.has(canonical)) {
      terms1.add(canonical);
    }
  }

  // Check phrases in text1
  for (let i = 0; i < words1.length - 1; i++) {
    const phrase = (words1[i] + '_' + words1[i + 1]).replace(/[^a-z0-9_]/g, '');
    const canonical = securityLookup.get(phrase);
    if (canonical && !GENERIC_SECURITY_TERMS.has(canonical)) {
      terms1.add(canonical);
    }
  }

  // Extract canonical terms from text2 (excluding generic terms)
  for (const word of words2) {
    const normalized = word.replace(/[^a-z0-9]/g, '');
    const canonical = securityLookup.get(normalized);
    if (canonical && !GENERIC_SECURITY_TERMS.has(canonical)) {
      terms2.add(canonical);
    }
  }

  // Check phrases in text2
  for (let i = 0; i < words2.length - 1; i++) {
    const phrase = (words2[i] + '_' + words2[i + 1]).replace(/[^a-z0-9_]/g, '');
    const canonical = securityLookup.get(phrase);
    if (canonical && !GENERIC_SECURITY_TERMS.has(canonical)) {
      terms2.add(canonical);
    }
  }

  // Find intersection
  const shared: string[] = [];
  for (const term of terms1) {
    if (terms2.has(term)) {
      shared.push(term);
    }
  }

  return shared;
}

/**
 * Calculate semantic similarity boost from synonyms.
 * Returns 0-100 indicating how much two texts share canonical terms.
 */
export function calculateSynonymSimilarity(
  text1: string,
  text2: string,
  type: 'security' | 'limitation' | 'behavior' = 'security'
): number {
  const expanded1 = expandWithSynonyms(text1, type);
  const expanded2 = expandWithSynonyms(text2, type);

  // Extract canonical terms only
  const lookup = type === 'security' ? securityLookup
    : type === 'limitation' ? limitationLookup
    : behaviorLookup;

  const canonicalSet = new Set(lookup.values());

  const terms1 = new Set(
    expanded1.split(/\s+/).filter(w => canonicalSet.has(w))
  );
  const terms2 = new Set(
    expanded2.split(/\s+/).filter(w => canonicalSet.has(w))
  );

  if (terms1.size === 0 && terms2.size === 0) {
    return 0;
  }

  // Calculate Jaccard-like similarity
  let intersection = 0;
  for (const term of terms1) {
    if (terms2.has(term)) {
      intersection++;
    }
  }

  const union = new Set([...terms1, ...terms2]).size;

  if (union === 0) return 0;

  return Math.round((intersection / union) * 100);
}

/**
 * Time unit normalization for comparing timeouts.
 * Converts all time expressions to milliseconds.
 */
export function normalizeTimeToMs(text: string): number | null {
  const patterns: Array<{ regex: RegExp; multiplier: number }> = [
    // Milliseconds
    { regex: /(\d+(?:\.\d+)?)\s*(?:ms|milliseconds?)/i, multiplier: 1 },
    // Seconds
    { regex: /(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)/i, multiplier: 1000 },
    // Minutes
    { regex: /(\d+(?:\.\d+)?)\s*(?:m|min|minutes?)/i, multiplier: 60000 },
    // Hours
    { regex: /(\d+(?:\.\d+)?)\s*(?:h|hr|hours?)/i, multiplier: 3600000 },
  ];

  for (const { regex, multiplier } of patterns) {
    const match = text.match(regex);
    if (match) {
      return parseFloat(match[1]) * multiplier;
    }
  }

  return null;
}

/**
 * Check if two time expressions are equivalent.
 */
export function timeExpressionsEqual(text1: string, text2: string): boolean {
  const ms1 = normalizeTimeToMs(text1);
  const ms2 = normalizeTimeToMs(text2);

  if (ms1 === null || ms2 === null) {
    return false;
  }

  // Allow 1% tolerance for floating point
  const ratio = ms1 / ms2;
  return ratio >= 0.99 && ratio <= 1.01;
}

/**
 * Abbreviation expansions for common security terms.
 */
export const ABBREVIATIONS: Record<string, string> = {
  sqli: 'sql injection',
  xss: 'cross-site scripting',
  ssrf: 'server-side request forgery',
  csrf: 'cross-site request forgery',
  lfi: 'local file inclusion',
  rfi: 'remote file inclusion',
  rce: 'remote code execution',
  idor: 'insecure direct object reference',
  xxe: 'xml external entity',
  jwt: 'json web token',
  api: 'application programming interface',
  dos: 'denial of service',
  ddos: 'distributed denial of service',
  mitm: 'man in the middle',
  tls: 'transport layer security',
  ssl: 'secure sockets layer',
  pii: 'personally identifiable information',
  rbac: 'role-based access control',
  acl: 'access control list',
  otp: 'one-time password',
  mfa: 'multi-factor authentication',
};

/**
 * Expand abbreviations in text.
 */
export function expandAbbreviations(text: string): string {
  let expanded = text.toLowerCase();

  for (const [abbrev, full] of Object.entries(ABBREVIATIONS)) {
    // Match abbreviation as whole word
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    if (regex.test(expanded)) {
      expanded = expanded + ' ' + full;
    }
  }

  return expanded;
}
