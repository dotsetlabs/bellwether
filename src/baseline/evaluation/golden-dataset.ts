/**
 * Golden Dataset for Drift Detection Evaluation
 *
 * This dataset contains labeled test cases for evaluating the accuracy
 * of semantic comparison in drift detection. Each case specifies whether
 * two texts should be considered semantically equivalent.
 *
 * Categories:
 * - TRUE POSITIVES: Different phrasing, same meaning (should match)
 * - TRUE NEGATIVES: Different meaning (should not match)
 * - EDGE CASES: Boundary conditions and special scenarios
 *
 * To add new test cases:
 * 1. Add to appropriate section below
 * 2. Run `bellwether eval` to verify accuracy
 * 3. If test fails unexpectedly, either fix algorithm or adjust test case
 */

import type { GoldenTestCase } from './types.js';
import { EXPANDED_TEST_CASES, getExpandedDatasetStatistics } from './expanded-dataset.js';

/**
 * Dataset version history:
 * - 1.0.0: Initial 50 test cases
 * - 2.0.0: Phase 3 expansion with 150+ additional cases
 */
export const DATASET_VERSION = '2.0.0';

// ============================================================================
// SECURITY FINDINGS - TRUE POSITIVES (should match)
// Same vulnerability, different phrasing
// ============================================================================

const SECURITY_TRUE_POSITIVES: GoldenTestCase[] = [
  // Path Traversal Variations
  {
    id: 'sec-tp-001',
    category: 'security',
    text1: 'Path traversal vulnerability allows reading files outside base directory',
    text2: 'The tool is vulnerable to directory traversal attacks via ../ sequences',
    toolName: 'read_file',
    expectedMatch: true,
    expectedConfidence: { min: 80, max: 100 },
    reasoning: 'Both describe path_traversal category, same vulnerability type',
    source: 'manual',
    tags: ['path_traversal', 'paraphrase'],
  },
  {
    id: 'sec-tp-002',
    category: 'security',
    text1: 'Local file inclusion vulnerability through path manipulation',
    text2: 'Arbitrary file read via ../ path traversal',
    toolName: 'read_file',
    expectedMatch: true,
    expectedConfidence: { min: 75, max: 100 },
    reasoning: 'LFI and path traversal are the same category',
    source: 'manual',
    tags: ['path_traversal', 'lfi'],
  },
  {
    id: 'sec-tp-003',
    category: 'security',
    text1: 'Users can access files outside the intended directory using relative paths',
    text2: 'The read_file tool allows escaping the base directory',
    toolName: 'read_file',
    expectedMatch: true,
    reasoning: 'Both describe the same directory escape vulnerability',
    source: 'manual',
    tags: ['path_traversal'],
  },

  // SQL Injection Variations
  {
    id: 'sec-tp-010',
    category: 'security',
    text1: 'SQL injection allows unauthorized database access',
    text2: 'The query parameter is vulnerable to SQL injection attacks',
    toolName: 'search_db',
    expectedMatch: true,
    expectedConfidence: { min: 85, max: 100 },
    reasoning: 'Both describe sql_injection category',
    source: 'manual',
    tags: ['sql_injection', 'paraphrase'],
  },
  {
    id: 'sec-tp-011',
    category: 'security',
    text1: 'User input is not properly sanitized before database queries',
    text2: 'Malicious SQL can be injected through the search field',
    toolName: 'search_db',
    expectedMatch: true,
    reasoning: 'Both indicate SQL injection vulnerability',
    source: 'manual',
    tags: ['sql_injection'],
  },
  {
    id: 'sec-tp-012',
    category: 'security',
    text1: 'Database queries are constructed using unsanitized input',
    text2: 'SQLi vulnerability in query construction',
    toolName: 'search_db',
    expectedMatch: true,
    reasoning: 'SQLi abbreviation maps to sql_injection',
    source: 'manual',
    tags: ['sql_injection', 'abbreviation'],
  },

  // XSS Variations
  {
    id: 'sec-tp-020',
    category: 'security',
    text1: 'Cross-site scripting vulnerability in output rendering',
    text2: 'XSS vulnerability allows script injection',
    toolName: 'render_html',
    expectedMatch: true,
    expectedConfidence: { min: 85, max: 100 },
    reasoning: 'XSS abbreviation and full name are equivalent',
    source: 'manual',
    tags: ['xss', 'abbreviation'],
  },
  {
    id: 'sec-tp-021',
    category: 'security',
    text1: 'User input is reflected in HTML without proper encoding',
    text2: 'Reflected XSS through unsanitized output',
    toolName: 'render_html',
    expectedMatch: true,
    reasoning: 'Both describe reflected XSS vulnerability',
    source: 'manual',
    tags: ['xss', 'reflected'],
  },

  // Command Injection Variations
  {
    id: 'sec-tp-030',
    category: 'security',
    text1: 'Command injection vulnerability allows arbitrary code execution',
    text2: 'Shell injection through unsanitized input to exec()',
    toolName: 'run_command',
    expectedMatch: true,
    expectedConfidence: { min: 80, max: 100 },
    reasoning: 'Command and shell injection are same category',
    source: 'manual',
    tags: ['command_injection'],
  },
  {
    id: 'sec-tp-031',
    category: 'security',
    text1: 'OS command injection via user-controlled input',
    text2: 'The system() call uses unsanitized user input',
    toolName: 'run_command',
    expectedMatch: true,
    reasoning: 'Both describe command injection vulnerability',
    source: 'manual',
    tags: ['command_injection'],
  },

  // Authentication Variations
  {
    id: 'sec-tp-040',
    category: 'security',
    text1: 'Authentication bypass allows unauthenticated access',
    text2: 'Auth can be bypassed using specific request headers',
    toolName: 'admin_api',
    expectedMatch: true,
    reasoning: 'Both describe authentication bypass',
    source: 'manual',
    tags: ['authentication'],
  },

  // SSRF Variations
  {
    id: 'sec-tp-050',
    category: 'security',
    text1: 'Server-side request forgery allows accessing internal services',
    text2: 'SSRF vulnerability enables requests to internal network',
    toolName: 'fetch_url',
    expectedMatch: true,
    reasoning: 'SSRF and full name are equivalent',
    source: 'manual',
    tags: ['ssrf', 'abbreviation'],
  },
];

// ============================================================================
// SECURITY FINDINGS - TRUE NEGATIVES (should NOT match)
// Different vulnerability types
// ============================================================================

const SECURITY_TRUE_NEGATIVES: GoldenTestCase[] = [
  {
    id: 'sec-tn-001',
    category: 'security',
    text1: 'Path traversal vulnerability allows reading arbitrary files',
    text2: 'SQL injection allows unauthorized database access',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Different categories: path_traversal vs sql_injection',
    source: 'manual',
    tags: ['cross_category'],
  },
  {
    id: 'sec-tn-002',
    category: 'security',
    text1: 'Cross-site scripting vulnerability',
    text2: 'Command injection vulnerability',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Different categories: xss vs command_injection',
    source: 'manual',
    tags: ['cross_category'],
  },
  {
    id: 'sec-tn-003',
    category: 'security',
    text1: 'Authentication bypass allows unauthenticated access',
    text2: 'Authorization flaw allows accessing other users data',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Different categories: authentication vs authorization',
    source: 'manual',
    tags: ['cross_category'],
  },
  {
    id: 'sec-tn-004',
    category: 'security',
    text1: 'SSRF allows accessing internal services',
    text2: 'Open redirect allows phishing attacks',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Different categories: ssrf vs open_redirect',
    source: 'manual',
    tags: ['cross_category'],
  },
  {
    id: 'sec-tn-005',
    category: 'security',
    text1: 'High severity path traversal vulnerability',
    text2: 'Low severity information disclosure',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Different categories and severity levels',
    source: 'manual',
    tags: ['cross_category', 'severity_diff'],
  },
  {
    id: 'sec-tn-006',
    category: 'security',
    text1: 'XXE vulnerability allows reading local files',
    text2: 'Deserialization vulnerability allows code execution',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Different categories: xxe vs deserialization',
    source: 'manual',
    tags: ['cross_category'],
  },
];

// ============================================================================
// LIMITATION FINDINGS - TRUE POSITIVES (should match)
// Same limitation, different phrasing
// ============================================================================

const LIMITATION_TRUE_POSITIVES: GoldenTestCase[] = [
  // Size Limit Variations
  {
    id: 'lim-tp-001',
    category: 'limitation',
    text1: 'Maximum file size is 10MB',
    text2: 'Files larger than 10 megabytes will be rejected',
    toolName: 'upload_file',
    expectedMatch: true,
    expectedConfidence: { min: 85, max: 100 },
    reasoning: 'Same size limit, different phrasing (10MB = 10 megabytes)',
    source: 'manual',
    tags: ['size_limit', 'unit_conversion'],
  },
  {
    id: 'lim-tp-002',
    category: 'limitation',
    text1: 'File size limit: 10 MB',
    text2: 'Cannot process files exceeding 10MB',
    toolName: 'upload_file',
    expectedMatch: true,
    reasoning: 'Same 10MB limit expressed differently',
    source: 'manual',
    tags: ['size_limit'],
  },
  {
    id: 'lim-tp-003',
    category: 'limitation',
    text1: 'Maximum upload size is 1GB',
    text2: 'Uploads are limited to 1 gigabyte',
    toolName: 'upload_file',
    expectedMatch: true,
    reasoning: 'Same 1GB limit',
    source: 'manual',
    tags: ['size_limit', 'unit_conversion'],
  },

  // Rate Limit Variations
  {
    id: 'lim-tp-010',
    category: 'limitation',
    text1: 'Rate limited to 100 requests per minute',
    text2: '100 requests/min rate limit applies',
    toolName: 'api_call',
    expectedMatch: true,
    expectedConfidence: { min: 80, max: 100 },
    reasoning: 'Same rate limit with different notation',
    source: 'manual',
    tags: ['rate_limit'],
  },
  {
    id: 'lim-tp-011',
    category: 'limitation',
    text1: 'API is throttled to 60 calls per hour',
    text2: 'Rate limit: 60 requests/hour',
    toolName: 'api_call',
    expectedMatch: true,
    reasoning: 'Same hourly rate limit',
    source: 'manual',
    tags: ['rate_limit'],
  },

  // Timeout Variations
  {
    id: 'lim-tp-020',
    category: 'limitation',
    text1: 'Requests timeout after 30 seconds',
    text2: '30 second timeout for all operations',
    toolName: 'long_operation',
    expectedMatch: true,
    expectedConfidence: { min: 85, max: 100 },
    reasoning: 'Same 30 second timeout',
    source: 'manual',
    tags: ['timeout'],
  },
  {
    id: 'lim-tp-021',
    category: 'limitation',
    text1: 'Operations time out after 5 minutes',
    text2: '300 second timeout applies',
    toolName: 'long_operation',
    expectedMatch: true,
    reasoning: '5 minutes = 300 seconds',
    source: 'manual',
    tags: ['timeout', 'unit_conversion'],
  },

  // Format Variations
  {
    id: 'lim-tp-030',
    category: 'limitation',
    text1: 'Only JSON format is supported',
    text2: 'Input must be valid JSON',
    toolName: 'parse_data',
    expectedMatch: true,
    reasoning: 'Both specify JSON format requirement',
    source: 'manual',
    tags: ['format'],
  },
];

// ============================================================================
// LIMITATION FINDINGS - TRUE NEGATIVES (should NOT match)
// Different limitations
// ============================================================================

const LIMITATION_TRUE_NEGATIVES: GoldenTestCase[] = [
  {
    id: 'lim-tn-001',
    category: 'limitation',
    text1: 'Maximum file size is 10MB',
    text2: 'Maximum file size is 100MB',
    toolName: 'upload_file',
    expectedMatch: false,
    reasoning: 'Different size limits: 10MB vs 100MB',
    source: 'manual',
    tags: ['size_limit', 'value_diff'],
  },
  {
    id: 'lim-tn-002',
    category: 'limitation',
    text1: 'Rate limited to 100 requests per minute',
    text2: 'Rate limited to 1000 requests per minute',
    toolName: 'api_call',
    expectedMatch: false,
    reasoning: 'Different rate limits: 100 vs 1000',
    source: 'manual',
    tags: ['rate_limit', 'value_diff'],
  },
  {
    id: 'lim-tn-003',
    category: 'limitation',
    text1: 'Maximum file size is 10MB',
    text2: 'Rate limited to 100 requests per minute',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Different categories: size_limit vs rate_limit',
    source: 'manual',
    tags: ['cross_category'],
  },
  {
    id: 'lim-tn-004',
    category: 'limitation',
    text1: 'Timeout after 30 seconds',
    text2: 'Maximum file size is 30MB',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Different categories despite similar number',
    source: 'manual',
    tags: ['cross_category', 'confusing_number'],
  },
  {
    id: 'lim-tn-005',
    category: 'limitation',
    text1: 'Only JSON format supported',
    text2: 'Only XML format supported',
    toolName: 'parse_data',
    expectedMatch: false,
    reasoning: 'Different format requirements',
    source: 'manual',
    tags: ['format', 'value_diff'],
  },
];

// ============================================================================
// ASSERTION FINDINGS - TRUE POSITIVES (should match)
// Same behavioral assertion, different phrasing
// ============================================================================

const ASSERTION_TRUE_POSITIVES: GoldenTestCase[] = [
  {
    id: 'asrt-tp-001',
    category: 'assertion',
    text1: 'Returns error when file does not exist',
    text2: 'The tool throws an error for missing files',
    toolName: 'read_file',
    expectedMatch: true,
    expectedConfidence: { min: 70, max: 100 },
    reasoning: 'Same error behavior for missing files',
    source: 'manual',
    tags: ['error_handling'],
  },
  {
    id: 'asrt-tp-002',
    category: 'assertion',
    text1: 'Handles empty input gracefully',
    text2: 'Empty strings are handled without error',
    toolName: 'process_text',
    expectedMatch: true,
    reasoning: 'Same empty input handling behavior',
    source: 'manual',
    tags: ['error_handling', 'empty_input'],
  },
  {
    id: 'asrt-tp-003',
    category: 'assertion',
    text1: 'Returns JSON object on success',
    text2: 'Successful calls return a JSON response',
    toolName: 'api_call',
    expectedMatch: true,
    reasoning: 'Same success response format',
    source: 'manual',
    tags: ['response_format'],
  },
  {
    id: 'asrt-tp-004',
    category: 'assertion',
    text1: 'Validates input before processing',
    text2: 'Input is validated prior to execution',
    toolName: 'process_data',
    expectedMatch: true,
    reasoning: 'Same input validation behavior',
    source: 'manual',
    tags: ['input_validation'],
  },
];

// ============================================================================
// ASSERTION FINDINGS - TRUE NEGATIVES (should NOT match)
// Different behavioral assertions
// ============================================================================

const ASSERTION_TRUE_NEGATIVES: GoldenTestCase[] = [
  {
    id: 'asrt-tn-001',
    category: 'assertion',
    text1: 'Returns error when file does not exist',
    text2: 'Returns null when file does not exist',
    toolName: 'read_file',
    expectedMatch: false,
    reasoning: 'Different behaviors: error vs null',
    source: 'manual',
    tags: ['error_handling', 'behavior_diff'],
  },
  {
    id: 'asrt-tn-002',
    category: 'assertion',
    text1: 'Creates file if it does not exist',
    text2: 'Fails if file does not exist',
    toolName: 'write_file',
    expectedMatch: false,
    reasoning: 'Opposite behaviors for missing files',
    source: 'manual',
    tags: ['error_handling', 'behavior_diff'],
  },
  {
    id: 'asrt-tn-003',
    category: 'assertion',
    text1: 'Returns JSON object on success',
    text2: 'Returns plain text on success',
    toolName: 'api_call',
    expectedMatch: false,
    reasoning: 'Different response formats',
    source: 'manual',
    tags: ['response_format', 'behavior_diff'],
  },
];

// ============================================================================
// EDGE CASES
// Boundary conditions and special scenarios
// ============================================================================

const EDGE_CASES: GoldenTestCase[] = [
  // Empty and Short Strings
  {
    id: 'edge-001',
    category: 'security',
    text1: '',
    text2: '',
    toolName: 'test_tool',
    expectedMatch: true,
    reasoning: 'Empty strings should match each other',
    source: 'manual',
    tags: ['empty', 'edge'],
  },
  {
    id: 'edge-002',
    category: 'security',
    text1: 'XSS',
    text2: 'Cross-site scripting',
    toolName: 'test_tool',
    expectedMatch: true,
    reasoning: 'Very short abbreviation should match full name',
    source: 'manual',
    tags: ['short', 'abbreviation', 'edge'],
  },
  {
    id: 'edge-003',
    category: 'security',
    text1: 'SQLi',
    text2: 'SQL injection vulnerability detected',
    toolName: 'test_tool',
    expectedMatch: true,
    reasoning: 'Short abbreviation should match longer description',
    source: 'manual',
    tags: ['short', 'abbreviation', 'edge'],
  },

  // Negation Cases
  {
    id: 'edge-010',
    category: 'security',
    text1: 'Critical vulnerability found',
    text2: 'Not a critical vulnerability',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Negation changes meaning',
    source: 'manual',
    tags: ['negation', 'edge'],
  },
  {
    id: 'edge-011',
    category: 'limitation',
    text1: 'No size limit',
    text2: 'Size limit of 10MB',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Negated limitation vs actual limitation',
    source: 'manual',
    tags: ['negation', 'edge'],
  },

  // Different Tools
  {
    id: 'edge-020',
    category: 'security',
    text1: 'Path traversal vulnerability',
    text2: 'Path traversal vulnerability',
    toolName: 'read_file',
    expectedMatch: true,
    reasoning: 'Identical text, same tool',
    source: 'manual',
    tags: ['identical', 'edge'],
  },

  // Case Sensitivity
  {
    id: 'edge-030',
    category: 'security',
    text1: 'PATH TRAVERSAL VULNERABILITY',
    text2: 'path traversal vulnerability',
    toolName: 'test_tool',
    expectedMatch: true,
    reasoning: 'Case differences should not matter',
    source: 'manual',
    tags: ['case', 'edge'],
  },

  // Special Characters
  {
    id: 'edge-040',
    category: 'security',
    text1: 'Path traversal via "../" sequences',
    text2: 'Path traversal via ../ sequences',
    toolName: 'test_tool',
    expectedMatch: true,
    reasoning: 'Quoted vs unquoted should match',
    source: 'manual',
    tags: ['special_chars', 'edge'],
  },

  // Severity in Text
  {
    id: 'edge-050',
    category: 'security',
    text1: 'High severity SQL injection',
    text2: 'SQL injection (high severity)',
    toolName: 'test_tool',
    expectedMatch: true,
    reasoning: 'Same severity, different format',
    source: 'manual',
    tags: ['severity', 'edge'],
  },
  {
    id: 'edge-051',
    category: 'security',
    text1: 'High severity SQL injection',
    text2: 'Low severity SQL injection',
    toolName: 'test_tool',
    expectedMatch: false,
    reasoning: 'Different severity levels should not match',
    source: 'manual',
    tags: ['severity', 'edge'],
  },

  // Multiple constraints in single finding
  {
    id: 'edge-060',
    category: 'limitation',
    text1: 'Maximum 100 files, each up to 5MB',
    text2: 'Limit of 100 files, 5MB per file',
    toolName: 'upload_files',
    expectedMatch: true,
    reasoning: 'Same constraints, different phrasing',
    source: 'manual',
    tags: ['constraint', 'multi_constraint', 'edge'],
  },
  {
    id: 'edge-061',
    category: 'limitation',
    text1: 'Maximum 100 files, each up to 5MB',
    text2: 'Maximum 50 files, each up to 10MB',
    toolName: 'upload_files',
    expectedMatch: false,
    reasoning: 'Different constraint values for both limits',
    source: 'manual',
    tags: ['constraint', 'multi_constraint', 'edge'],
  },
];

// ============================================================================
// COMBINED DATASET
// Includes original 50 cases + 100+ expanded cases from Phase 3
// ============================================================================

/**
 * Original core test cases (50 cases from Phase 1).
 */
const CORE_CASES: GoldenTestCase[] = [
  ...SECURITY_TRUE_POSITIVES,
  ...SECURITY_TRUE_NEGATIVES,
  ...LIMITATION_TRUE_POSITIVES,
  ...LIMITATION_TRUE_NEGATIVES,
  ...ASSERTION_TRUE_POSITIVES,
  ...ASSERTION_TRUE_NEGATIVES,
  ...EDGE_CASES,
];

/**
 * Full golden dataset combining core and expanded cases.
 * Total: 150+ labeled test cases for comprehensive evaluation.
 */
export const GOLDEN_DATASET: GoldenTestCase[] = [
  ...CORE_CASES,
  ...EXPANDED_TEST_CASES,
];

// Export categorized for targeted testing
export const SECURITY_CASES = [
  ...SECURITY_TRUE_POSITIVES,
  ...SECURITY_TRUE_NEGATIVES,
  ...EXPANDED_TEST_CASES.filter(c => c.category === 'security'),
];

export const LIMITATION_CASES = [
  ...LIMITATION_TRUE_POSITIVES,
  ...LIMITATION_TRUE_NEGATIVES,
  ...EXPANDED_TEST_CASES.filter(c => c.category === 'limitation'),
];

export const ASSERTION_CASES = [
  ...ASSERTION_TRUE_POSITIVES,
  ...ASSERTION_TRUE_NEGATIVES,
  ...EXPANDED_TEST_CASES.filter(c => c.category === 'assertion'),
];

/**
 * Get comprehensive statistics about the golden dataset.
 */
export function getDatasetStatistics() {
  const truePositives = GOLDEN_DATASET.filter((c) => c.expectedMatch).length;
  const trueNegatives = GOLDEN_DATASET.filter((c) => !c.expectedMatch).length;

  // Count by tags
  const byTag: Record<string, number> = {};
  for (const tc of GOLDEN_DATASET) {
    if (tc.tags) {
      for (const tag of tc.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }
  }

  // Get expanded stats
  const expandedStats = getExpandedDatasetStatistics();

  return {
    version: DATASET_VERSION,
    totalCases: GOLDEN_DATASET.length,
    coreCases: CORE_CASES.length,
    expandedCases: EXPANDED_TEST_CASES.length,
    truePositives,
    trueNegatives,
    byCategory: {
      security: SECURITY_CASES.length,
      limitation: LIMITATION_CASES.length,
      assertion: ASSERTION_CASES.length,
      edge: EDGE_CASES.length,
    },
    byTag,
    expanded: expandedStats,
  };
}
