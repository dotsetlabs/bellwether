/**
 * Deterministic security test payloads.
 *
 * These are well-known test patterns used for security testing that don't
 * require LLM generation. Each payload is designed to test a specific
 * vulnerability class.
 *
 * IMPORTANT: These payloads are for defensive security testing only.
 * They help developers identify input validation gaps in their MCP servers.
 */

import type { SecurityPayload, SecurityCategory } from './types.js';

/**
 * SQL injection test payloads.
 * Tests for improper handling of SQL metacharacters in user input.
 * CWE-89: Improper Neutralization of Special Elements used in an SQL Command
 */
export const SQL_INJECTION_PAYLOADS: SecurityPayload[] = [
  {
    category: 'sql_injection',
    payload: "'; DROP TABLE users; --",
    description: 'Classic SQL injection with table drop attempt',
    expectedBehavior: 'reject',
  },
  {
    category: 'sql_injection',
    payload: "1' OR '1'='1",
    description: 'Boolean-based SQL injection (tautology)',
    expectedBehavior: 'reject',
  },
  {
    category: 'sql_injection',
    payload: "1; SELECT * FROM users WHERE '1'='1",
    description: 'Stacked query injection',
    expectedBehavior: 'reject',
  },
  {
    category: 'sql_injection',
    payload: "admin'--",
    description: 'Comment-based authentication bypass',
    expectedBehavior: 'reject',
  },
  {
    category: 'sql_injection',
    payload: "1 UNION SELECT username, password FROM users--",
    description: 'UNION-based data extraction',
    expectedBehavior: 'reject',
  },
];

/**
 * Cross-Site Scripting (XSS) test payloads.
 * Tests for improper handling of HTML/JavaScript in user input.
 * CWE-79: Improper Neutralization of Input During Web Page Generation
 */
export const XSS_PAYLOADS: SecurityPayload[] = [
  {
    category: 'xss',
    payload: '<script>alert("xss")</script>',
    description: 'Basic script tag injection',
    expectedBehavior: 'sanitize',
  },
  {
    category: 'xss',
    payload: '"><img src=x onerror=alert(1)>',
    description: 'Event handler injection via img tag',
    expectedBehavior: 'sanitize',
  },
  {
    category: 'xss',
    payload: "javascript:alert('xss')",
    description: 'JavaScript protocol handler',
    expectedBehavior: 'reject',
  },
  {
    category: 'xss',
    payload: '<svg onload=alert(1)>',
    description: 'SVG-based XSS with onload event',
    expectedBehavior: 'sanitize',
  },
  {
    category: 'xss',
    payload: '<body onpageshow=alert(1)>',
    description: 'Body tag event handler injection',
    expectedBehavior: 'sanitize',
  },
];

/**
 * Path traversal test payloads.
 * Tests for improper handling of file path inputs.
 * CWE-22: Improper Limitation of a Pathname to a Restricted Directory
 */
export const PATH_TRAVERSAL_PAYLOADS: SecurityPayload[] = [
  {
    category: 'path_traversal',
    payload: '../../../etc/passwd',
    description: 'Unix path traversal to /etc/passwd',
    expectedBehavior: 'reject',
  },
  {
    category: 'path_traversal',
    payload: '..\\..\\..\\windows\\system32\\config\\sam',
    description: 'Windows path traversal to SAM database',
    expectedBehavior: 'reject',
  },
  {
    category: 'path_traversal',
    payload: '/etc/passwd',
    description: 'Absolute path to sensitive Unix file',
    expectedBehavior: 'reject',
  },
  {
    category: 'path_traversal',
    payload: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    description: 'URL-encoded path traversal',
    expectedBehavior: 'reject',
  },
  {
    category: 'path_traversal',
    payload: '....//....//....//etc/passwd',
    description: 'Double-dot bypass attempt',
    expectedBehavior: 'reject',
  },
  {
    category: 'path_traversal',
    payload: '/proc/self/environ',
    description: 'Linux proc filesystem access',
    expectedBehavior: 'reject',
  },
];

/**
 * Command injection test payloads.
 * Tests for improper handling of shell metacharacters.
 * CWE-78: Improper Neutralization of Special Elements used in an OS Command
 */
export const COMMAND_INJECTION_PAYLOADS: SecurityPayload[] = [
  {
    category: 'command_injection',
    payload: '; ls -la',
    description: 'Semicolon command chaining',
    expectedBehavior: 'reject',
  },
  {
    category: 'command_injection',
    payload: '| cat /etc/passwd',
    description: 'Pipe command injection',
    expectedBehavior: 'reject',
  },
  {
    category: 'command_injection',
    payload: '$(whoami)',
    description: 'Command substitution',
    expectedBehavior: 'reject',
  },
  {
    category: 'command_injection',
    payload: '`id`',
    description: 'Backtick command execution',
    expectedBehavior: 'reject',
  },
  {
    category: 'command_injection',
    payload: '&& cat /etc/passwd',
    description: 'AND operator command chaining',
    expectedBehavior: 'reject',
  },
  {
    category: 'command_injection',
    payload: '|| cat /etc/passwd',
    description: 'OR operator command chaining',
    expectedBehavior: 'reject',
  },
];

/**
 * Server-Side Request Forgery (SSRF) test payloads.
 * Tests for improper URL validation allowing internal network access.
 * CWE-918: Server-Side Request Forgery (SSRF)
 */
export const SSRF_PAYLOADS: SecurityPayload[] = [
  {
    category: 'ssrf',
    payload: 'http://localhost:22',
    description: 'Localhost SSH port access',
    expectedBehavior: 'reject',
  },
  {
    category: 'ssrf',
    payload: 'http://127.0.0.1:3306',
    description: 'Loopback MySQL port access',
    expectedBehavior: 'reject',
  },
  {
    category: 'ssrf',
    payload: 'http://169.254.169.254/latest/meta-data/',
    description: 'AWS metadata endpoint (IMDS)',
    expectedBehavior: 'reject',
  },
  {
    category: 'ssrf',
    payload: 'http://[::1]:80',
    description: 'IPv6 localhost access',
    expectedBehavior: 'reject',
  },
  {
    category: 'ssrf',
    payload: 'file:///etc/passwd',
    description: 'File protocol access',
    expectedBehavior: 'reject',
  },
  {
    category: 'ssrf',
    payload: 'http://0.0.0.0:80',
    description: 'Null IP address access',
    expectedBehavior: 'reject',
  },
  {
    category: 'ssrf',
    payload: 'http://10.0.0.1/',
    description: 'Private network (10.x.x.x) access',
    expectedBehavior: 'reject',
  },
  {
    category: 'ssrf',
    payload: 'http://192.168.1.1/',
    description: 'Private network (192.168.x.x) access',
    expectedBehavior: 'reject',
  },
];

/**
 * Map of security categories to their payloads.
 */
const PAYLOAD_MAP: Record<SecurityCategory, SecurityPayload[]> = {
  sql_injection: SQL_INJECTION_PAYLOADS,
  xss: XSS_PAYLOADS,
  path_traversal: PATH_TRAVERSAL_PAYLOADS,
  command_injection: COMMAND_INJECTION_PAYLOADS,
  ssrf: SSRF_PAYLOADS,
  error_disclosure: [], // Error disclosure is tested differently
};

/**
 * Get payloads for a specific security category.
 *
 * @param category - The security category to get payloads for
 * @returns Array of payloads for that category
 */
export function getPayloadsForCategory(category: SecurityCategory): SecurityPayload[] {
  return PAYLOAD_MAP[category] ?? [];
}

/**
 * Get all security payloads across all categories.
 *
 * @returns Array of all security payloads
 */
export function getAllSecurityPayloads(): SecurityPayload[] {
  return [
    ...SQL_INJECTION_PAYLOADS,
    ...XSS_PAYLOADS,
    ...PATH_TRAVERSAL_PAYLOADS,
    ...COMMAND_INJECTION_PAYLOADS,
    ...SSRF_PAYLOADS,
  ];
}

/**
 * Get all available security categories.
 *
 * @returns Array of all security category identifiers
 */
export function getAllSecurityCategories(): SecurityCategory[] {
  return Object.keys(PAYLOAD_MAP) as SecurityCategory[];
}
