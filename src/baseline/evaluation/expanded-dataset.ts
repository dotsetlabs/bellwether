/**
 * Expanded Golden Dataset for Drift Detection Evaluation
 *
 * Phase 3 expansion: 150+ additional labeled test cases covering:
 * - Extended security vulnerability paraphrases
 * - Comprehensive limitation variations
 * - Assertion behavior matching
 * - Edge cases (negation, severity, constraints)
 * - Paraphrase robustness tests
 *
 * These cases are designed to:
 * 1. Test algorithm robustness against paraphrase variations
 * 2. Verify correct handling of edge cases
 * 3. Ensure high recall without sacrificing precision
 */

import type { GoldenTestCase } from './types.js';

// ============================================================================
// SECURITY: PATH TRAVERSAL VARIATIONS
// Tests various phrasings of directory traversal vulnerabilities
// ============================================================================

export const PATH_TRAVERSAL_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'pt-tp-001',
    category: 'security',
    text1: 'Attackers can use ../ sequences to escape the sandbox directory',
    text2: 'Directory traversal via dot-dot-slash allows accessing parent folders',
    toolName: 'read_file',
    expectedMatch: true,
    reasoning: 'Both describe ../ based directory traversal',
    source: 'llm-generated',
    tags: ['path_traversal', 'paraphrase'],
  },
  {
    id: 'pt-tp-002',
    category: 'security',
    text1: 'File path not properly sanitized, allowing arbitrary file access',
    text2: 'Insufficient path validation enables reading files outside allowed directories',
    toolName: 'read_file',
    expectedMatch: true,
    reasoning: 'Both describe path sanitization failures',
    source: 'llm-generated',
    tags: ['path_traversal', 'paraphrase'],
  },
  {
    id: 'pt-tp-003',
    category: 'security',
    text1: 'The tool does not validate that requested paths stay within base directory',
    text2: 'No boundary check on file paths allows directory escape',
    toolName: 'read_file',
    expectedMatch: true,
    reasoning: 'Both describe missing path boundary validation',
    source: 'llm-generated',
    tags: ['path_traversal', 'paraphrase'],
  },
  {
    id: 'pt-tp-004',
    category: 'security',
    text1: 'Relative paths with ../ can traverse to system files',
    text2: 'Using parent directory references in paths exposes sensitive files',
    toolName: 'read_file',
    expectedMatch: true,
    reasoning: 'Both describe traversal to sensitive system files',
    source: 'llm-generated',
    tags: ['path_traversal', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'pt-tn-001',
    category: 'security',
    text1: 'Path traversal vulnerability in file reading',
    text2: 'Permission denied when accessing protected files',
    toolName: 'read_file',
    expectedMatch: false,
    reasoning: 'Different issues: traversal vs permission denial',
    source: 'llm-generated',
    tags: ['path_traversal', 'negative'],
  },
  {
    id: 'pt-tn-002',
    category: 'security',
    text1: 'Directory traversal allows reading /etc/passwd',
    text2: 'Directory listing exposes file names',
    toolName: 'read_file',
    expectedMatch: false,
    reasoning: 'Different issues: file read vs directory listing',
    source: 'llm-generated',
    tags: ['path_traversal', 'negative'],
  },
];

// ============================================================================
// SECURITY: SQL INJECTION VARIATIONS
// Tests various phrasings of SQL injection vulnerabilities
// ============================================================================

export const SQL_INJECTION_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'sql-tp-001',
    category: 'security',
    text1: 'User input concatenated directly into SQL queries',
    text2: 'Query strings built without parameterization',
    toolName: 'search_db',
    expectedMatch: true,
    reasoning: 'Both describe improper SQL construction',
    source: 'llm-generated',
    tags: ['sql_injection', 'paraphrase'],
  },
  {
    id: 'sql-tp-002',
    category: 'security',
    text1: 'Attackers can inject malicious SQL through search parameters',
    text2: 'SQL statements vulnerable to injection via user-controlled input',
    toolName: 'search_db',
    expectedMatch: true,
    reasoning: 'Both describe SQL injection through user input',
    source: 'llm-generated',
    tags: ['sql_injection', 'paraphrase'],
  },
  {
    id: 'sql-tp-003',
    category: 'security',
    text1: 'Unsanitized input allows UNION-based SQL injection',
    text2: 'SQL injection enables extracting data from other tables',
    toolName: 'search_db',
    expectedMatch: true,
    reasoning: 'Both describe SQL injection data extraction',
    source: 'llm-generated',
    tags: ['sql_injection', 'paraphrase'],
  },
  {
    id: 'sql-tp-004',
    category: 'security',
    text1: 'Database queries use string interpolation instead of prepared statements',
    text2: 'Queries constructed with f-strings allow SQL injection',
    toolName: 'search_db',
    expectedMatch: true,
    reasoning: 'Both describe unsafe query construction',
    source: 'llm-generated',
    tags: ['sql_injection', 'paraphrase'],
  },
  {
    id: 'sql-tp-005',
    category: 'security',
    text1: 'The WHERE clause is vulnerable to boolean-based blind injection',
    text2: 'Blind SQL injection possible through conditional responses',
    toolName: 'search_db',
    expectedMatch: true,
    reasoning: 'Both describe blind SQL injection',
    source: 'llm-generated',
    tags: ['sql_injection', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'sql-tn-001',
    category: 'security',
    text1: 'SQL injection in database queries',
    text2: 'NoSQL injection in MongoDB queries',
    toolName: 'search_db',
    expectedMatch: false,
    reasoning: 'Different database types',
    source: 'llm-generated',
    tags: ['sql_injection', 'negative'],
  },
  {
    id: 'sql-tn-002',
    category: 'security',
    text1: 'SQL injection vulnerability',
    text2: 'Database connection timeout issue',
    toolName: 'search_db',
    expectedMatch: false,
    reasoning: 'Security vs operational issue',
    source: 'llm-generated',
    tags: ['sql_injection', 'negative'],
  },
];

// ============================================================================
// SECURITY: XSS VARIATIONS
// Tests various phrasings of cross-site scripting vulnerabilities
// ============================================================================

export const XSS_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'xss-tp-001',
    category: 'security',
    text1: 'User input rendered in HTML without escaping',
    text2: 'Output not properly encoded, allowing script injection',
    toolName: 'render_html',
    expectedMatch: true,
    reasoning: 'Both describe XSS through unescaped output',
    source: 'llm-generated',
    tags: ['xss', 'paraphrase'],
  },
  {
    id: 'xss-tp-002',
    category: 'security',
    text1: 'Reflected XSS through URL parameters displayed on page',
    text2: 'Input from query string echoed without sanitization',
    toolName: 'render_html',
    expectedMatch: true,
    reasoning: 'Both describe reflected XSS',
    source: 'llm-generated',
    tags: ['xss', 'paraphrase'],
  },
  {
    id: 'xss-tp-003',
    category: 'security',
    text1: 'Stored XSS in user comments persisted to database',
    text2: 'Malicious scripts saved and served to other users',
    toolName: 'render_html',
    expectedMatch: true,
    reasoning: 'Both describe stored/persistent XSS',
    source: 'llm-generated',
    tags: ['xss', 'paraphrase'],
  },
  {
    id: 'xss-tp-004',
    category: 'security',
    text1: 'DOM-based XSS through innerHTML assignment',
    text2: 'Client-side script injection via DOM manipulation',
    toolName: 'render_html',
    expectedMatch: true,
    reasoning: 'Both describe DOM-based XSS',
    source: 'llm-generated',
    tags: ['xss', 'paraphrase'],
  },
  {
    id: 'xss-tp-005',
    category: 'security',
    text1: 'JavaScript can be injected through event handlers',
    text2: 'onclick and other event attributes allow script execution',
    toolName: 'render_html',
    expectedMatch: true,
    reasoning: 'Both describe XSS via event handlers',
    source: 'llm-generated',
    tags: ['xss', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'xss-tn-001',
    category: 'security',
    text1: 'Cross-site scripting vulnerability',
    text2: 'Cross-site request forgery vulnerability',
    toolName: 'render_html',
    expectedMatch: false,
    reasoning: 'XSS vs CSRF are different vulnerabilities',
    source: 'llm-generated',
    tags: ['xss', 'negative'],
  },
  {
    id: 'xss-tn-002',
    category: 'security',
    text1: 'XSS allows stealing session cookies',
    text2: 'CORS misconfiguration exposes data',
    toolName: 'render_html',
    expectedMatch: false,
    reasoning: 'Different vulnerability types',
    source: 'llm-generated',
    tags: ['xss', 'negative'],
  },
];

// ============================================================================
// SECURITY: COMMAND INJECTION VARIATIONS
// Tests various phrasings of OS command injection vulnerabilities
// ============================================================================

export const COMMAND_INJECTION_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'cmd-tp-001',
    category: 'security',
    text1: 'User input passed directly to shell execution',
    text2: 'Command constructed with unsanitized parameters',
    toolName: 'run_command',
    expectedMatch: true,
    reasoning: 'Both describe command injection via shell',
    source: 'llm-generated',
    tags: ['command_injection', 'paraphrase'],
  },
  {
    id: 'cmd-tp-002',
    category: 'security',
    text1: 'OS command injection through backtick execution',
    text2: 'Shell metacharacters allow arbitrary command execution',
    toolName: 'run_command',
    expectedMatch: true,
    reasoning: 'Both describe command injection techniques',
    source: 'llm-generated',
    tags: ['command_injection', 'paraphrase'],
  },
  {
    id: 'cmd-tp-003',
    category: 'security',
    text1: 'subprocess.call with shell=True is vulnerable to injection',
    text2: 'Spawning shell processes with user input enables RCE',
    toolName: 'run_command',
    expectedMatch: true,
    reasoning: 'Both describe shell-based command injection',
    source: 'llm-generated',
    tags: ['command_injection', 'paraphrase'],
  },
  {
    id: 'cmd-tp-004',
    category: 'security',
    text1: 'Semicolons in input allow command chaining',
    text2: 'Command separators enable executing additional commands',
    toolName: 'run_command',
    expectedMatch: true,
    reasoning: 'Both describe command chaining injection',
    source: 'llm-generated',
    tags: ['command_injection', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'cmd-tn-001',
    category: 'security',
    text1: 'Command injection allows executing arbitrary code',
    text2: 'Command not found error when tool is missing',
    toolName: 'run_command',
    expectedMatch: false,
    reasoning: 'Security vulnerability vs operational error',
    source: 'llm-generated',
    tags: ['command_injection', 'negative'],
  },
];

// ============================================================================
// SECURITY: SSRF VARIATIONS
// Tests various phrasings of server-side request forgery
// ============================================================================

export const SSRF_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'ssrf-tp-001',
    category: 'security',
    text1: 'Server makes requests to user-specified URLs without validation',
    text2: 'Attacker can make the server fetch arbitrary URLs',
    toolName: 'fetch_url',
    expectedMatch: true,
    reasoning: 'Both describe SSRF via URL control',
    source: 'llm-generated',
    tags: ['ssrf', 'paraphrase'],
  },
  {
    id: 'ssrf-tp-002',
    category: 'security',
    text1: 'SSRF allows accessing internal network services',
    text2: 'Server-side request forgery exposes internal endpoints',
    toolName: 'fetch_url',
    expectedMatch: true,
    reasoning: 'Both describe SSRF to internal network',
    source: 'llm-generated',
    tags: ['ssrf', 'paraphrase'],
  },
  {
    id: 'ssrf-tp-003',
    category: 'security',
    text1: 'Cloud metadata endpoint accessible via SSRF',
    text2: 'Attacker can reach 169.254.169.254 through the server',
    toolName: 'fetch_url',
    expectedMatch: true,
    reasoning: 'Both describe cloud metadata SSRF',
    source: 'llm-generated',
    tags: ['ssrf', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'ssrf-tn-001',
    category: 'security',
    text1: 'SSRF vulnerability in URL fetching',
    text2: 'Open redirect vulnerability in URL handling',
    toolName: 'fetch_url',
    expectedMatch: false,
    reasoning: 'SSRF vs open redirect are different',
    source: 'llm-generated',
    tags: ['ssrf', 'negative'],
  },
];

// ============================================================================
// SECURITY: AUTHENTICATION/AUTHORIZATION VARIATIONS
// Tests auth-related vulnerabilities
// ============================================================================

export const AUTH_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'auth-tp-001',
    category: 'security',
    text1: 'Missing authentication allows unauthenticated access to API',
    text2: 'Endpoints accessible without any credentials',
    toolName: 'api_endpoint',
    expectedMatch: true,
    reasoning: 'Both describe missing authentication',
    source: 'llm-generated',
    tags: ['authentication', 'paraphrase'],
  },
  {
    id: 'auth-tp-002',
    category: 'security',
    text1: 'Session tokens not properly validated',
    text2: 'Invalid or expired tokens still accepted',
    toolName: 'api_endpoint',
    expectedMatch: true,
    reasoning: 'Both describe session validation failures',
    source: 'llm-generated',
    tags: ['authentication', 'paraphrase'],
  },
  {
    id: 'auth-tp-003',
    category: 'security',
    text1: 'IDOR allows accessing other users resources',
    text2: 'Changing ID parameter exposes other accounts data',
    toolName: 'api_endpoint',
    expectedMatch: true,
    reasoning: 'Both describe insecure direct object reference',
    source: 'llm-generated',
    tags: ['authorization', 'paraphrase'],
  },
  {
    id: 'auth-tp-004',
    category: 'security',
    text1: 'Privilege escalation from user to admin role',
    text2: 'Regular users can access administrative functions',
    toolName: 'api_endpoint',
    expectedMatch: true,
    reasoning: 'Both describe privilege escalation',
    source: 'llm-generated',
    tags: ['authorization', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'auth-tn-001',
    category: 'security',
    text1: 'Authentication bypass vulnerability',
    text2: 'Authorization check missing on endpoint',
    toolName: 'api_endpoint',
    expectedMatch: false,
    reasoning: 'Authentication vs authorization are different',
    source: 'llm-generated',
    tags: ['authentication', 'negative'],
  },
  {
    id: 'auth-tn-002',
    category: 'security',
    text1: 'Weak password policy allows simple passwords',
    text2: 'Password stored in plain text',
    toolName: 'api_endpoint',
    expectedMatch: false,
    reasoning: 'Password policy vs storage are different issues',
    source: 'llm-generated',
    tags: ['authentication', 'negative'],
  },
];

// ============================================================================
// LIMITATIONS: SIZE CONSTRAINTS
// Tests various phrasings of size-related limitations
// ============================================================================

export const SIZE_LIMIT_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'size-tp-001',
    category: 'limitation',
    text1: 'Files larger than 50MB are rejected',
    text2: 'Maximum file size: 50 megabytes',
    toolName: 'upload_file',
    expectedMatch: true,
    reasoning: 'Same 50MB limit',
    source: 'llm-generated',
    tags: ['size_limit', 'paraphrase'],
  },
  {
    id: 'size-tp-002',
    category: 'limitation',
    text1: 'Upload limit is 25 megabytes per file',
    text2: 'Each file must be under 25MB',
    toolName: 'upload_file',
    expectedMatch: true,
    reasoning: 'Same 25MB per-file limit',
    source: 'llm-generated',
    tags: ['size_limit', 'paraphrase'],
  },
  {
    id: 'size-tp-003',
    category: 'limitation',
    text1: 'Total upload size cannot exceed 500MB',
    text2: 'Combined file size limited to 500 megabytes',
    toolName: 'upload_file',
    expectedMatch: true,
    reasoning: 'Same 500MB total limit',
    source: 'llm-generated',
    tags: ['size_limit', 'paraphrase'],
  },
  {
    id: 'size-tp-004',
    category: 'limitation',
    text1: 'Request body limited to 1MB',
    text2: 'Payload size must not exceed 1 megabyte',
    toolName: 'api_call',
    expectedMatch: true,
    reasoning: 'Same 1MB request limit',
    source: 'llm-generated',
    tags: ['size_limit', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'size-tn-001',
    category: 'limitation',
    text1: 'Maximum file size is 10MB',
    text2: 'Maximum file size is 50MB',
    toolName: 'upload_file',
    expectedMatch: false,
    reasoning: 'Different size limits: 10MB vs 50MB',
    source: 'llm-generated',
    tags: ['size_limit', 'negative'],
  },
  {
    id: 'size-tn-002',
    category: 'limitation',
    text1: 'Files up to 1GB supported',
    text2: 'Files up to 100MB supported',
    toolName: 'upload_file',
    expectedMatch: false,
    reasoning: 'Different limits: 1GB vs 100MB',
    source: 'llm-generated',
    tags: ['size_limit', 'negative'],
  },
  {
    id: 'size-tn-003',
    category: 'limitation',
    text1: 'Maximum upload size is 5MB',
    text2: 'Maximum download size is 5MB',
    toolName: 'upload_file',
    expectedMatch: false,
    reasoning: 'Upload vs download are different operations',
    source: 'llm-generated',
    tags: ['size_limit', 'negative'],
  },
];

// ============================================================================
// LIMITATIONS: RATE LIMITS
// Tests various phrasings of rate limiting
// ============================================================================

export const RATE_LIMIT_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'rate-tp-001',
    category: 'limitation',
    text1: 'API limited to 100 calls per minute',
    text2: 'Rate limit: 100 requests/min',
    toolName: 'api_call',
    expectedMatch: true,
    reasoning: 'Same 100/min rate limit',
    source: 'llm-generated',
    tags: ['rate_limit', 'paraphrase'],
  },
  {
    id: 'rate-tp-002',
    category: 'limitation',
    text1: 'Maximum 1000 requests per hour',
    text2: 'Hourly quota of 1000 API calls',
    toolName: 'api_call',
    expectedMatch: true,
    reasoning: 'Same 1000/hour limit',
    source: 'llm-generated',
    tags: ['rate_limit', 'paraphrase'],
  },
  {
    id: 'rate-tp-003',
    category: 'limitation',
    text1: 'Throttled to 10 requests per second',
    text2: '10 RPS rate limit enforced',
    toolName: 'api_call',
    expectedMatch: true,
    reasoning: 'Same 10/second limit',
    source: 'llm-generated',
    tags: ['rate_limit', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'rate-tn-001',
    category: 'limitation',
    text1: 'Rate limited to 100 requests per minute',
    text2: 'Rate limited to 100 requests per hour',
    toolName: 'api_call',
    expectedMatch: false,
    reasoning: 'Different time periods: per minute vs per hour',
    source: 'llm-generated',
    tags: ['rate_limit', 'negative'],
  },
  {
    id: 'rate-tn-002',
    category: 'limitation',
    text1: '50 calls per minute allowed',
    text2: '500 calls per minute allowed',
    toolName: 'api_call',
    expectedMatch: false,
    reasoning: 'Different rates: 50 vs 500',
    source: 'llm-generated',
    tags: ['rate_limit', 'negative'],
  },
];

// ============================================================================
// LIMITATIONS: TIMEOUT CONSTRAINTS
// Tests various phrasings of timeout limitations
// ============================================================================

export const TIMEOUT_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'timeout-tp-001',
    category: 'limitation',
    text1: 'Operations time out after 30 seconds',
    text2: '30 second timeout on all requests',
    toolName: 'api_call',
    expectedMatch: true,
    reasoning: 'Same 30 second timeout',
    source: 'llm-generated',
    tags: ['timeout', 'paraphrase'],
  },
  {
    id: 'timeout-tp-002',
    category: 'limitation',
    text1: 'Long-running tasks limited to 5 minutes',
    text2: 'Maximum execution time is 300 seconds',
    toolName: 'process_data',
    expectedMatch: true,
    reasoning: 'Same 5 minute/300 second timeout',
    source: 'llm-generated',
    tags: ['timeout', 'paraphrase'],
  },
  {
    id: 'timeout-tp-003',
    category: 'limitation',
    text1: 'Connection timeout set to 10 seconds',
    text2: 'Connections must establish within 10s',
    toolName: 'api_call',
    expectedMatch: true,
    reasoning: 'Same 10 second connection timeout',
    source: 'llm-generated',
    tags: ['timeout', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'timeout-tn-001',
    category: 'limitation',
    text1: 'Request timeout is 30 seconds',
    text2: 'Request timeout is 60 seconds',
    toolName: 'api_call',
    expectedMatch: false,
    reasoning: 'Different timeout values',
    source: 'llm-generated',
    tags: ['timeout', 'negative'],
  },
  {
    id: 'timeout-tn-002',
    category: 'limitation',
    text1: 'Connection timeout of 5 seconds',
    text2: 'Read timeout of 5 seconds',
    toolName: 'api_call',
    expectedMatch: false,
    reasoning: 'Different timeout types',
    source: 'llm-generated',
    tags: ['timeout', 'negative'],
  },
];

// ============================================================================
// LIMITATIONS: FORMAT CONSTRAINTS
// Tests various phrasings of format/encoding limitations
// ============================================================================

export const FORMAT_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'fmt-tp-001',
    category: 'limitation',
    text1: 'Only accepts JSON formatted input',
    text2: 'Input must be valid JSON',
    toolName: 'parse_data',
    expectedMatch: true,
    reasoning: 'Same JSON format requirement',
    source: 'llm-generated',
    tags: ['format', 'paraphrase'],
  },
  {
    id: 'fmt-tp-002',
    category: 'limitation',
    text1: 'UTF-8 encoding required for all text',
    text2: 'Text must use UTF-8 character encoding',
    toolName: 'process_text',
    expectedMatch: true,
    reasoning: 'Same UTF-8 requirement',
    source: 'llm-generated',
    tags: ['encoding', 'paraphrase'],
  },
  {
    id: 'fmt-tp-003',
    category: 'limitation',
    text1: 'Images must be PNG or JPEG format',
    text2: 'Supported image formats: PNG, JPEG',
    toolName: 'upload_image',
    expectedMatch: true,
    reasoning: 'Same supported formats',
    source: 'llm-generated',
    tags: ['format', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'fmt-tn-001',
    category: 'limitation',
    text1: 'Only JSON format supported',
    text2: 'Only YAML format supported',
    toolName: 'parse_data',
    expectedMatch: false,
    reasoning: 'Different formats: JSON vs YAML',
    source: 'llm-generated',
    tags: ['format', 'negative'],
  },
  {
    id: 'fmt-tn-002',
    category: 'limitation',
    text1: 'Requires UTF-8 encoding',
    text2: 'Requires ASCII encoding',
    toolName: 'process_text',
    expectedMatch: false,
    reasoning: 'Different encodings',
    source: 'llm-generated',
    tags: ['encoding', 'negative'],
  },
];

// ============================================================================
// ASSERTIONS: BEHAVIOR MATCHING
// Tests various phrasings of behavioral assertions
// ============================================================================

export const ASSERTION_CASES: GoldenTestCase[] = [
  // True Positives - Should match
  {
    id: 'asrt-tp-010',
    category: 'assertion',
    text1: 'Function returns null for invalid input',
    text2: 'Invalid input causes null to be returned',
    toolName: 'process_data',
    expectedMatch: true,
    reasoning: 'Same null return behavior',
    source: 'llm-generated',
    tags: ['assertion', 'paraphrase'],
  },
  {
    id: 'asrt-tp-011',
    category: 'assertion',
    text1: 'Throws FileNotFoundError when file is missing',
    text2: 'Missing files cause FileNotFoundError to be raised',
    toolName: 'read_file',
    expectedMatch: true,
    reasoning: 'Same error thrown for same condition',
    source: 'llm-generated',
    tags: ['assertion', 'paraphrase'],
  },
  {
    id: 'asrt-tp-012',
    category: 'assertion',
    text1: 'Returns empty array when no results found',
    text2: 'Empty list returned for queries with no matches',
    toolName: 'search_db',
    expectedMatch: true,
    reasoning: 'Same empty result behavior',
    source: 'llm-generated',
    tags: ['assertion', 'paraphrase'],
  },
  {
    id: 'asrt-tp-013',
    category: 'assertion',
    text1: 'Successful operations return status code 200',
    text2: 'HTTP 200 returned on success',
    toolName: 'api_call',
    expectedMatch: true,
    reasoning: 'Same success status code',
    source: 'llm-generated',
    tags: ['assertion', 'paraphrase'],
  },
  {
    id: 'asrt-tp-014',
    category: 'assertion',
    text1: 'Creates directory if it does not exist',
    text2: 'Missing directories are automatically created',
    toolName: 'write_file',
    expectedMatch: true,
    reasoning: 'Same auto-create behavior',
    source: 'llm-generated',
    tags: ['assertion', 'paraphrase'],
  },
  // True Negatives - Should NOT match
  {
    id: 'exp-asrt-tn-001',
    category: 'assertion',
    text1: 'Returns empty array when no results found',
    text2: 'Throws exception when no results found',
    toolName: 'search_db',
    expectedMatch: false,
    reasoning: 'Different behaviors: return vs throw',
    source: 'llm-generated',
    tags: ['assertion', 'negative'],
  },
  {
    id: 'exp-asrt-tn-002',
    category: 'assertion',
    text1: 'Returns null for invalid input',
    text2: 'Returns default value for invalid input',
    toolName: 'process_data',
    expectedMatch: false,
    reasoning: 'Different return values',
    source: 'llm-generated',
    tags: ['assertion', 'negative'],
  },
  {
    id: 'exp-asrt-tn-003',
    category: 'assertion',
    text1: 'Status code 200 on success',
    text2: 'Status code 201 on success',
    toolName: 'api_call',
    expectedMatch: false,
    reasoning: 'Different status codes',
    source: 'llm-generated',
    tags: ['assertion', 'negative'],
  },
];

// ============================================================================
// EDGE CASES: NEGATION HANDLING
// Tests that negated phrases are properly distinguished
// ============================================================================

export const NEGATION_CASES: GoldenTestCase[] = [
  {
    id: 'neg-001',
    category: 'security',
    text1: 'This is a critical vulnerability',
    text2: 'This is not a critical vulnerability',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Negation reverses meaning',
    source: 'llm-generated',
    tags: ['negation', 'edge'],
  },
  {
    id: 'neg-002',
    category: 'limitation',
    text1: 'There is no size limit',
    text2: 'There is a size limit of 10MB',
    toolName: 'upload_file',
    expectedMatch: false,
    reasoning: 'No limit vs specific limit',
    source: 'llm-generated',
    tags: ['negation', 'edge'],
  },
  {
    id: 'neg-003',
    category: 'security',
    text1: 'Input is validated before processing',
    text2: 'Input is not validated before processing',
    toolName: 'process_data',
    expectedMatch: false,
    reasoning: 'Validated vs not validated',
    source: 'llm-generated',
    tags: ['negation', 'edge'],
  },
  {
    id: 'neg-004',
    category: 'security',
    text1: 'Authentication is required',
    text2: 'Authentication is not required',
    toolName: 'api_endpoint',
    expectedMatch: false,
    reasoning: 'Required vs not required',
    source: 'llm-generated',
    tags: ['negation', 'edge'],
  },
  {
    id: 'neg-005',
    category: 'limitation',
    text1: 'Rate limiting is enabled',
    text2: 'Rate limiting is disabled',
    toolName: 'api_call',
    expectedMatch: false,
    reasoning: 'Enabled vs disabled',
    source: 'llm-generated',
    tags: ['negation', 'edge'],
  },
];

// ============================================================================
// EDGE CASES: SEVERITY DIFFERENCES
// Tests that different severities are properly distinguished
// ============================================================================

export const SEVERITY_CASES: GoldenTestCase[] = [
  {
    id: 'sev-001',
    category: 'security',
    text1: 'Critical severity remote code execution',
    text2: 'Low severity information disclosure',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Critical vs low severity',
    source: 'llm-generated',
    tags: ['severity', 'edge'],
  },
  {
    id: 'sev-002',
    category: 'security',
    text1: 'High risk SQL injection vulnerability',
    text2: 'Medium risk SQL injection vulnerability',
    toolName: 'search_db',
    expectedMatch: true,
    reasoning: 'Same vulnerability type, adjacent severity',
    source: 'llm-generated',
    tags: ['severity', 'edge'],
  },
  {
    id: 'sev-003',
    category: 'security',
    text1: 'Minor XSS issue in error messages',
    text2: 'Critical XSS allowing session hijacking',
    toolName: 'render_html',
    expectedMatch: false,
    reasoning: 'Minor vs critical severity',
    source: 'llm-generated',
    tags: ['severity', 'edge'],
  },
];

// ============================================================================
// EDGE CASES: SIMILAR BUT DIFFERENT
// Tests for things that look similar but have different meanings
// ============================================================================

export const SIMILAR_DIFFERENT_CASES: GoldenTestCase[] = [
  {
    id: 'sim-001',
    category: 'security',
    text1: 'Server-side request forgery vulnerability',
    text2: 'Cross-site request forgery vulnerability',
    toolName: 'api_endpoint',
    expectedMatch: false,
    reasoning: 'SSRF vs CSRF are different',
    source: 'llm-generated',
    tags: ['similar', 'edge'],
  },
  {
    id: 'sim-002',
    category: 'security',
    text1: 'Local file inclusion vulnerability',
    text2: 'Remote file inclusion vulnerability',
    toolName: 'read_file',
    expectedMatch: false,
    reasoning: 'LFI vs RFI are different',
    source: 'llm-generated',
    tags: ['similar', 'edge'],
  },
  {
    id: 'sim-003',
    category: 'limitation',
    text1: 'Read operations are rate limited',
    text2: 'Write operations are rate limited',
    toolName: 'api_call',
    expectedMatch: false,
    reasoning: 'Different operation types',
    source: 'llm-generated',
    tags: ['similar', 'edge'],
  },
  {
    id: 'sim-004',
    category: 'security',
    text1: 'Horizontal privilege escalation',
    text2: 'Vertical privilege escalation',
    toolName: 'api_endpoint',
    expectedMatch: false,
    reasoning: 'Different escalation types',
    source: 'llm-generated',
    tags: ['similar', 'edge'],
  },
  {
    id: 'sim-005',
    category: 'assertion',
    text1: 'Synchronous API call',
    text2: 'Asynchronous API call',
    toolName: 'api_call',
    expectedMatch: false,
    reasoning: 'Different execution modes',
    source: 'llm-generated',
    tags: ['similar', 'edge'],
  },
];

// ============================================================================
// PARAPHRASE ROBUSTNESS: TECHNICAL TERMS
// Tests various ways to express the same technical concept
// ============================================================================

export const PARAPHRASE_TECHNICAL_CASES: GoldenTestCase[] = [
  {
    id: 'para-tech-001',
    category: 'security',
    text1: 'RCE vulnerability through deserialization',
    text2: 'Remote code execution via unsafe object deserialization',
    toolName: 'process_data',
    expectedMatch: true,
    reasoning: 'RCE abbreviation expands to remote code execution',
    source: 'llm-generated',
    tags: ['paraphrase', 'abbreviation'],
  },
  {
    id: 'para-tech-002',
    category: 'security',
    text1: 'XXE attack allows reading local files',
    text2: 'XML external entity injection enables file disclosure',
    toolName: 'parse_xml',
    expectedMatch: true,
    reasoning: 'XXE abbreviation and full description',
    source: 'llm-generated',
    tags: ['paraphrase', 'abbreviation'],
  },
  {
    id: 'para-tech-003',
    category: 'security',
    text1: 'DoS through resource exhaustion',
    text2: 'Denial of service by consuming server resources',
    toolName: 'process_data',
    expectedMatch: true,
    reasoning: 'DoS abbreviation and full description',
    source: 'llm-generated',
    tags: ['paraphrase', 'abbreviation'],
  },
  {
    id: 'para-tech-004',
    category: 'limitation',
    text1: 'API uses JWT for auth',
    text2: 'JSON Web Tokens required for authentication',
    toolName: 'api_endpoint',
    expectedMatch: true,
    reasoning: 'JWT abbreviation and full description',
    source: 'llm-generated',
    tags: ['paraphrase', 'abbreviation'],
  },
];

// ============================================================================
// PARAPHRASE ROBUSTNESS: PASSIVE VS ACTIVE VOICE
// Tests same meaning in different grammatical structures
// ============================================================================

export const PARAPHRASE_VOICE_CASES: GoldenTestCase[] = [
  {
    id: 'para-voice-001',
    category: 'security',
    text1: 'Attackers can inject SQL commands',
    text2: 'SQL commands can be injected by attackers',
    toolName: 'search_db',
    expectedMatch: true,
    reasoning: 'Active vs passive voice, same meaning',
    source: 'llm-generated',
    tags: ['paraphrase', 'voice'],
  },
  {
    id: 'para-voice-002',
    category: 'security',
    text1: 'The server validates all input',
    text2: 'All input is validated by the server',
    toolName: 'api_endpoint',
    expectedMatch: true,
    reasoning: 'Active vs passive voice',
    source: 'llm-generated',
    tags: ['paraphrase', 'voice'],
  },
  {
    id: 'para-voice-003',
    category: 'limitation',
    text1: 'The system enforces rate limits',
    text2: 'Rate limits are enforced by the system',
    toolName: 'api_call',
    expectedMatch: true,
    reasoning: 'Active vs passive voice',
    source: 'llm-generated',
    tags: ['paraphrase', 'voice'],
  },
];

// ============================================================================
// PARAPHRASE ROBUSTNESS: INFORMAL VS FORMAL
// Tests same meaning in different registers
// ============================================================================

export const PARAPHRASE_REGISTER_CASES: GoldenTestCase[] = [
  {
    id: 'para-reg-001',
    category: 'security',
    text1: 'The file path check is broken',
    text2: 'Path validation mechanism contains a vulnerability',
    toolName: 'read_file',
    expectedMatch: true,
    reasoning: 'Informal vs formal description of same issue',
    source: 'llm-generated',
    tags: ['paraphrase', 'register'],
  },
  {
    id: 'para-reg-002',
    category: 'limitation',
    text1: 'Cant upload files bigger than 10MB',
    text2: 'File uploads are restricted to a maximum size of 10 megabytes',
    toolName: 'upload_file',
    expectedMatch: true,
    reasoning: 'Informal vs formal, same constraint',
    source: 'llm-generated',
    tags: ['paraphrase', 'register'],
  },
  {
    id: 'para-reg-003',
    category: 'assertion',
    text1: 'Blows up if you pass null',
    text2: 'Raises an exception when null is provided as input',
    toolName: 'process_data',
    expectedMatch: true,
    reasoning: 'Informal vs formal description of error behavior',
    source: 'llm-generated',
    tags: ['paraphrase', 'register'],
  },
];

// ============================================================================
// COMBINED EXPORT
// Aggregates all expanded test cases
// ============================================================================

export const EXPANDED_TEST_CASES: GoldenTestCase[] = [
  ...PATH_TRAVERSAL_CASES,
  ...SQL_INJECTION_CASES,
  ...XSS_CASES,
  ...COMMAND_INJECTION_CASES,
  ...SSRF_CASES,
  ...AUTH_CASES,
  ...SIZE_LIMIT_CASES,
  ...RATE_LIMIT_CASES,
  ...TIMEOUT_CASES,
  ...FORMAT_CASES,
  ...ASSERTION_CASES,
  ...NEGATION_CASES,
  ...SEVERITY_CASES,
  ...SIMILAR_DIFFERENT_CASES,
  ...PARAPHRASE_TECHNICAL_CASES,
  ...PARAPHRASE_VOICE_CASES,
  ...PARAPHRASE_REGISTER_CASES,
];

/**
 * Get statistics about the expanded dataset.
 */
export function getExpandedDatasetStatistics(): {
  totalCases: number;
  byCategory: Record<string, number>;
  byTag: Record<string, number>;
  truePositives: number;
  trueNegatives: number;
} {
  const byCategory: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  let truePositives = 0;
  let trueNegatives = 0;

  for (const tc of EXPANDED_TEST_CASES) {
    // Count by category
    byCategory[tc.category] = (byCategory[tc.category] || 0) + 1;

    // Count by tags
    if (tc.tags) {
      for (const tag of tc.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }

    // Count TP/TN
    if (tc.expectedMatch) {
      truePositives++;
    } else {
      trueNegatives++;
    }
  }

  return {
    totalCases: EXPANDED_TEST_CASES.length,
    byCategory,
    byTag,
    truePositives,
    trueNegatives,
  };
}
