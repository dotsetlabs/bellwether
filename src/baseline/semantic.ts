/**
 * Semantic comparison utilities for drift detection.
 *
 * This module provides robust comparison that handles LLM non-determinism
 * by normalizing text and extracting structured facts rather than comparing
 * raw prose strings.
 */

/**
 * Security finding categories (normalized).
 * These map to common vulnerability patterns.
 */
export const SECURITY_CATEGORIES = [
  'path_traversal',
  'command_injection',
  'sql_injection',
  'xss',
  'ssrf',
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
 */
const SECURITY_KEYWORDS: Record<SecurityCategory, string[]> = {
  path_traversal: ['path traversal', 'directory traversal', '../', '..\\', 'lfi', 'local file inclusion', 'arbitrary file'],
  command_injection: ['command injection', 'shell injection', 'os command', 'exec', 'system(', 'subprocess', 'shell=true'],
  sql_injection: ['sql injection', 'sqli', 'query injection', 'database injection'],
  xss: ['xss', 'cross-site scripting', 'script injection', 'html injection'],
  ssrf: ['ssrf', 'server-side request forgery', 'internal network', 'localhost access'],
  file_upload: ['file upload', 'arbitrary upload', 'unrestricted upload', 'malicious file'],
  access_control: ['access control', 'unauthorized access', 'privilege escalation', 'bypass'],
  authentication: ['authentication', 'auth bypass', 'credential', 'password', 'login'],
  authorization: ['authorization', 'permission', 'role', 'access denied', 'forbidden'],
  information_disclosure: ['information disclosure', 'data leak', 'sensitive data', 'expose', 'reveals'],
  denial_of_service: ['denial of service', 'dos', 'resource exhaustion', 'infinite loop', 'crash'],
  input_validation: ['input validation', 'sanitization', 'validation', 'untrusted input', 'user input'],
  output_encoding: ['output encoding', 'escape', 'encoding', 'sanitize output'],
  cryptography: ['cryptography', 'encryption', 'hashing', 'random', 'weak cipher'],
  session_management: ['session', 'cookie', 'token', 'jwt'],
  error_handling: ['error handling', 'exception', 'stack trace', 'verbose error'],
  logging: ['logging', 'audit', 'sensitive log'],
  configuration: ['configuration', 'hardcoded', 'default', 'insecure default'],
  other: [],
};

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
 */
export function extractSeverity(text: string): 'low' | 'medium' | 'high' | 'critical' {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('critical') || lowerText.includes('severe') || lowerText.includes('rce') || lowerText.includes('remote code')) {
    return 'critical';
  }
  // LFI, SSRF, arbitrary file access are high severity
  if (lowerText.includes('high') || lowerText.includes('dangerous') || lowerText.includes('injection') ||
      lowerText.includes('traversal') || lowerText.includes('lfi') || lowerText.includes('ssrf') ||
      lowerText.includes('arbitrary file') || lowerText.includes('../')) {
    return 'high';
  }
  if (lowerText.includes('medium') || lowerText.includes('moderate') || lowerText.includes('potential')) {
    return 'medium';
  }
  return 'low';
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
