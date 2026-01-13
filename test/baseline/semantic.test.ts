/**
 * Tests for semantic comparison utilities.
 *
 * These tests verify that the semantic matching handles LLM non-determinism
 * correctly - paraphrased descriptions with the same meaning should match.
 */

import { describe, it, expect } from 'vitest';
import {
  extractSecurityCategory,
  extractLimitationCategory,
  createFingerprint,
  structureSecurityNotes,
  structureLimitations,
  securityFindingsMatch,
  limitationsMatch,
  compareArraysSemantic,
  SECURITY_CATEGORIES,
  LIMITATION_CATEGORIES,
} from '../../src/baseline/semantic.js';

describe('Semantic Comparison', () => {
  describe('extractSecurityCategory', () => {
    it('should identify path traversal vulnerabilities', () => {
      expect(extractSecurityCategory('Path traversal vulnerability in file reading')).toBe('path_traversal');
      expect(extractSecurityCategory('The tool allows directory traversal via ../')).toBe('path_traversal');
      expect(extractSecurityCategory('Vulnerable to LFI attacks')).toBe('path_traversal');
      expect(extractSecurityCategory('Can read arbitrary files outside root')).toBe('path_traversal');
    });

    it('should identify SQL injection vulnerabilities', () => {
      expect(extractSecurityCategory('SQL injection possible in query parameter')).toBe('sql_injection');
      expect(extractSecurityCategory('SQLi vulnerability in user input')).toBe('sql_injection');
    });

    it('should identify command injection vulnerabilities', () => {
      expect(extractSecurityCategory('Command injection via shell metacharacters')).toBe('command_injection');
      expect(extractSecurityCategory('Vulnerable to shell injection attacks')).toBe('command_injection');
      expect(extractSecurityCategory('Uses subprocess without sanitization')).toBe('command_injection');
    });

    it('should identify XSS vulnerabilities', () => {
      expect(extractSecurityCategory('Cross-site scripting in output')).toBe('xss');
      expect(extractSecurityCategory('XSS vulnerability in user content')).toBe('xss');
    });

    it('should identify SSRF vulnerabilities', () => {
      expect(extractSecurityCategory('Server-side request forgery possible')).toBe('ssrf');
      expect(extractSecurityCategory('SSRF allows access to internal network')).toBe('ssrf');
    });

    it('should identify input validation issues', () => {
      expect(extractSecurityCategory('Missing input validation on user data')).toBe('input_validation');
      expect(extractSecurityCategory('Untrusted input passed directly to API')).toBe('input_validation');
    });

    it('should return other for unrecognized patterns', () => {
      expect(extractSecurityCategory('Some generic security concern')).toBe('other');
      expect(extractSecurityCategory('Needs review')).toBe('other');
    });
  });

  describe('extractLimitationCategory', () => {
    it('should identify size limits', () => {
      expect(extractLimitationCategory('Maximum file size is 10MB')).toBe('size_limit');
      expect(extractLimitationCategory('Files larger than 10 megabytes rejected')).toBe('size_limit');
      expect(extractLimitationCategory('Max size: 1GB')).toBe('size_limit');
      expect(extractLimitationCategory('Too large files will fail')).toBe('size_limit');
    });

    it('should identify rate limits', () => {
      expect(extractLimitationCategory('Rate limited to 100 requests per minute')).toBe('rate_limit');
      expect(extractLimitationCategory('Throttled at 1000 calls per hour')).toBe('rate_limit');
      expect(extractLimitationCategory('API quota of 10000 requests per day')).toBe('rate_limit');
    });

    it('should identify timeouts', () => {
      expect(extractLimitationCategory('Operations timeout after 30 seconds')).toBe('timeout');
      expect(extractLimitationCategory('100ms deadline for responses')).toBe('timeout');
      expect(extractLimitationCategory('Request will time out after 60s')).toBe('timeout');
    });

    it('should identify encoding limitations', () => {
      expect(extractLimitationCategory('Only supports UTF-8 encoding')).toBe('encoding');
      expect(extractLimitationCategory('ASCII only, no unicode support')).toBe('encoding');
    });

    it('should identify format limitations', () => {
      expect(extractLimitationCategory('Only accepts JSON format')).toBe('format');
      expect(extractLimitationCategory('Content-type must be application/xml')).toBe('format');
    });

    it('should identify permission limitations', () => {
      expect(extractLimitationCategory('Permission denied for write operations')).toBe('permission');
      expect(extractLimitationCategory('Read-only access to directory')).toBe('permission');
    });

    it('should return other for unrecognized patterns', () => {
      expect(extractLimitationCategory('Some generic limitation')).toBe('other');
      expect(extractLimitationCategory('Does not work well')).toBe('other');
    });
  });

  describe('createFingerprint', () => {
    it('should create identical fingerprints for semantically equivalent security assertions', () => {
      const fp1 = createFingerprint('read_file', 'security', 'Path traversal allows reading arbitrary files');
      const fp2 = createFingerprint('read_file', 'security', 'Vulnerable to directory traversal via ../ sequences');
      expect(fp1).toBe(fp2);
    });

    it('should create identical fingerprints for semantically equivalent limitation assertions', () => {
      const fp1 = createFingerprint('upload', 'error_handling', 'Maximum file size is 10MB');
      const fp2 = createFingerprint('upload', 'error_handling', 'Files larger than 10 megabytes will be rejected');
      expect(fp1).toBe(fp2);
    });

    it('should create different fingerprints for different security categories', () => {
      const fp1 = createFingerprint('query', 'security', 'SQL injection vulnerability');
      const fp2 = createFingerprint('query', 'security', 'Command injection vulnerability');
      expect(fp1).not.toBe(fp2);
    });

    it('should create different fingerprints for different limitation categories', () => {
      const fp1 = createFingerprint('api', 'error_handling', 'Rate limited to 100 requests per minute');
      const fp2 = createFingerprint('api', 'error_handling', 'Operations timeout after 30 seconds');
      expect(fp1).not.toBe(fp2);
    });

    it('should include action verbs in fingerprint', () => {
      const fp1 = createFingerprint('tool', 'response_format', 'Returns JSON');
      const fp2 = createFingerprint('tool', 'response_format', 'Outputs JSON');
      // "returns" is in the action list, but "outputs" is not
      expect(fp1).toContain('returns');
    });
  });

  describe('structureSecurityNotes', () => {
    it('should extract category and severity from security notes', () => {
      const findings = structureSecurityNotes('read_file', [
        'Path traversal vulnerability allows reading arbitrary files',
        'Low severity information disclosure in error messages',
      ]);

      expect(findings).toHaveLength(2);
      expect(findings[0].category).toBe('path_traversal');
      expect(findings[0].severity).toBe('high');
      expect(findings[1].category).toBe('information_disclosure');
      expect(findings[1].severity).toBe('low');
    });
  });

  describe('structureLimitations', () => {
    it('should extract category from limitations', () => {
      const limitations = structureLimitations('upload', [
        'Maximum file size is 10MB',
        'Rate limited to 100 requests per minute',
      ]);

      expect(limitations).toHaveLength(2);
      expect(limitations[0].category).toBe('size_limit');
      expect(limitations[1].category).toBe('rate_limit');
    });

    it('should extract numeric constraints', () => {
      const limitations = structureLimitations('api', [
        'Maximum file size is 10MB',
        'Operations timeout after 30 seconds',
      ]);

      expect(limitations[0].constraint).toBe('10MB');
      expect(limitations[1].constraint).toBe('30 seconds');
    });
  });

  describe('securityFindingsMatch', () => {
    it('should match findings with same category, tool, and severity', () => {
      const a = { category: 'path_traversal' as const, tool: 'read_file', severity: 'high' as const, description: 'Path traversal allows reading files' };
      const b = { category: 'path_traversal' as const, tool: 'read_file', severity: 'high' as const, description: 'Directory traversal vulnerability' };
      expect(securityFindingsMatch(a, b)).toBe(true);
    });

    it('should not match findings with different categories', () => {
      const a = { category: 'path_traversal' as const, tool: 'query', severity: 'high' as const, description: 'Path traversal' };
      const b = { category: 'sql_injection' as const, tool: 'query', severity: 'high' as const, description: 'SQL injection' };
      expect(securityFindingsMatch(a, b)).toBe(false);
    });

    it('should not match findings with different severities', () => {
      const a = { category: 'xss' as const, tool: 'render', severity: 'high' as const, description: 'XSS high severity' };
      const b = { category: 'xss' as const, tool: 'render', severity: 'medium' as const, description: 'XSS medium severity' };
      expect(securityFindingsMatch(a, b)).toBe(false);
    });
  });

  describe('limitationsMatch', () => {
    it('should match limitations with same category and tool', () => {
      const a = { category: 'size_limit' as const, tool: 'upload', description: 'Max 10MB' };
      const b = { category: 'size_limit' as const, tool: 'upload', description: 'Files must be under 10 megabytes' };
      expect(limitationsMatch(a, b)).toBe(true);
    });

    it('should not match limitations with different categories', () => {
      const a = { category: 'size_limit' as const, tool: 'api', description: 'Max 10MB' };
      const b = { category: 'rate_limit' as const, tool: 'api', description: '100 req/min' };
      expect(limitationsMatch(a, b)).toBe(false);
    });
  });

  describe('compareArraysSemantic', () => {
    it('should find added and removed items using semantic matching', () => {
      const previous = [
        { category: 'path_traversal' as const, tool: 'read', severity: 'high' as const, description: 'Path traversal' },
        { category: 'xss' as const, tool: 'render', severity: 'medium' as const, description: 'XSS' },
      ];
      const current = [
        { category: 'path_traversal' as const, tool: 'read', severity: 'high' as const, description: 'Directory traversal (rephrased)' },
        { category: 'sql_injection' as const, tool: 'query', severity: 'high' as const, description: 'SQL injection (new)' },
      ];

      const { added, removed } = compareArraysSemantic(previous, current, securityFindingsMatch);

      // path_traversal matches semantically (not removed, not added)
      // xss was removed
      // sql_injection was added
      expect(added).toHaveLength(1);
      expect(added[0].category).toBe('sql_injection');
      expect(removed).toHaveLength(1);
      expect(removed[0].category).toBe('xss');
    });

    it('should return empty arrays when items match semantically', () => {
      const previous = [
        { category: 'size_limit' as const, tool: 'upload', description: 'Max file size 10MB' },
      ];
      const current = [
        { category: 'size_limit' as const, tool: 'upload', description: 'Files cannot exceed 10 megabytes' },
      ];

      const { added, removed } = compareArraysSemantic(previous, current, limitationsMatch);

      expect(added).toHaveLength(0);
      expect(removed).toHaveLength(0);
    });
  });

  describe('LLM non-determinism handling', () => {
    it('should not flag drift when LLM rephrases path traversal finding', () => {
      const variants = [
        'Path traversal vulnerability allows reading arbitrary files',
        'The tool is vulnerable to directory traversal attacks',
        'Can read files outside the base directory using ../',
        'Local file inclusion (LFI) vulnerability present',
      ];

      const findings = variants.map(v => structureSecurityNotes('read_file', [v])[0]);

      // All should be categorized as path_traversal with high severity
      for (const finding of findings) {
        expect(finding.category).toBe('path_traversal');
        expect(finding.severity).toBe('high');
      }

      // All should match each other semantically
      for (let i = 0; i < findings.length; i++) {
        for (let j = i + 1; j < findings.length; j++) {
          expect(securityFindingsMatch(findings[i], findings[j])).toBe(true);
        }
      }
    });

    it('should not flag drift when LLM rephrases size limit', () => {
      const variants = [
        'Maximum file size is 10MB',
        'Files larger than 10 megabytes will be rejected',
        'The max size limit is 10 MB',
        'Cannot upload files exceeding 10MB in size',
      ];

      const limitations = variants.map(v => structureLimitations('upload', [v])[0]);

      // All should be categorized as size_limit
      for (const limitation of limitations) {
        expect(limitation.category).toBe('size_limit');
      }

      // All should match each other semantically
      for (let i = 0; i < limitations.length; i++) {
        for (let j = i + 1; j < limitations.length; j++) {
          expect(limitationsMatch(limitations[i], limitations[j])).toBe(true);
        }
      }
    });
  });
});
