/**
 * Tests for the security testing module.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runSecurityTests,
  compareSecurityFingerprints,
  getRiskLevelFromScore,
  parseSecurityCategories,
  getPayloadsForCategory,
  getAllSecurityPayloads,
  getAllSecurityCategories,
} from '../../src/security/index.js';
import type {
  SecurityCategory,
  SecurityFingerprint,
  SecurityFinding,
  SecurityToolCallResult,
} from '../../src/security/types.js';

// Mock tool call function
function createMockCallTool(
  behavior: 'accept' | 'reject' | 'error' = 'reject'
): (args: Record<string, unknown>) => Promise<SecurityToolCallResult> {
  return async (args: Record<string, unknown>) => {
    if (behavior === 'error') {
      return {
        isError: true,
        content: '',
        errorMessage: 'Connection refused',
      };
    }

    if (behavior === 'reject') {
      // Simulate a security rejection
      const argValues = Object.values(args).map(String);
      const hasPayload = argValues.some(
        (v) =>
          v.includes("'") ||
          v.includes('<script>') ||
          v.includes('../') ||
          v.includes('|') ||
          v.includes('http://169.254')
      );

      if (hasPayload) {
        return {
          isError: true,
          content: '',
          errorMessage: 'Invalid input: potentially malicious content detected',
        };
      }
    }

    // Accept behavior - simulate accepting the payload
    return {
      isError: false,
      content: JSON.stringify({ result: 'success', args }),
    };
  };
}

// Create a mock fingerprint
function createMockFingerprint(overrides: Partial<SecurityFingerprint> = {}): SecurityFingerprint {
  return {
    tested: true,
    categoriesTested: ['sql_injection', 'xss'],
    findings: [],
    riskScore: 0,
    testedAt: new Date().toISOString(),
    findingsHash: 'hash123',
    ...overrides,
  };
}

// Create a mock finding
function createMockFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    category: 'sql_injection',
    riskLevel: 'high',
    title: 'SQL Injection Vulnerability',
    description: 'The tool accepts SQL injection payloads',
    evidence: "Input '1 OR 1=1' was accepted",
    remediation: 'Implement input validation and parameterized queries',
    cweId: 'CWE-89',
    parameter: 'query',
    tool: 'test_tool',
    ...overrides,
  };
}

describe('Security Testing Module', () => {
  describe('getPayloadsForCategory', () => {
    it('should return payloads for sql_injection', () => {
      const payloads = getPayloadsForCategory('sql_injection');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every((p) => p.category === 'sql_injection')).toBe(true);
    });

    it('should return payloads for xss', () => {
      const payloads = getPayloadsForCategory('xss');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every((p) => p.category === 'xss')).toBe(true);
    });

    it('should return payloads for path_traversal', () => {
      const payloads = getPayloadsForCategory('path_traversal');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every((p) => p.category === 'path_traversal')).toBe(true);
    });

    it('should return payloads for command_injection', () => {
      const payloads = getPayloadsForCategory('command_injection');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every((p) => p.category === 'command_injection')).toBe(true);
    });

    it('should return payloads for ssrf', () => {
      const payloads = getPayloadsForCategory('ssrf');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every((p) => p.category === 'ssrf')).toBe(true);
    });
  });

  describe('getAllSecurityPayloads', () => {
    it('should return all payloads', () => {
      const payloads = getAllSecurityPayloads();
      expect(payloads.length).toBeGreaterThan(0);

      // Should have payloads from multiple categories
      const categories = new Set(payloads.map((p) => p.category));
      expect(categories.size).toBeGreaterThan(1);
    });
  });

  describe('getAllSecurityCategories', () => {
    it('should return all categories', () => {
      const categories = getAllSecurityCategories();
      expect(categories).toContain('sql_injection');
      expect(categories).toContain('xss');
      expect(categories).toContain('path_traversal');
      expect(categories).toContain('command_injection');
      expect(categories).toContain('ssrf');
    });
  });

  describe('parseSecurityCategories', () => {
    it('should parse comma-separated categories', () => {
      const result = parseSecurityCategories('sql_injection,xss');
      expect(result).toEqual(['sql_injection', 'xss']);
    });

    it('should trim whitespace', () => {
      const result = parseSecurityCategories('sql_injection , xss , path_traversal');
      expect(result).toEqual(['sql_injection', 'xss', 'path_traversal']);
    });

    it('should return defaults for invalid category', () => {
      // Invalid categories are silently ignored, defaults returned
      const result = parseSecurityCategories('invalid_category');
      // Should return default categories when no valid categories found
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle single category', () => {
      const result = parseSecurityCategories('ssrf');
      expect(result).toEqual(['ssrf']);
    });
  });

  describe('getRiskLevelFromScore', () => {
    // Thresholds: critical >= 70, high >= 50, medium >= 25, low >= 10, info < 10
    it('should return critical for scores >= 70', () => {
      expect(getRiskLevelFromScore(70)).toBe('critical');
      expect(getRiskLevelFromScore(100)).toBe('critical');
    });

    it('should return high for scores >= 50', () => {
      expect(getRiskLevelFromScore(50)).toBe('high');
      expect(getRiskLevelFromScore(69)).toBe('high');
    });

    it('should return medium for scores >= 25', () => {
      expect(getRiskLevelFromScore(25)).toBe('medium');
      expect(getRiskLevelFromScore(49)).toBe('medium');
    });

    it('should return low for scores >= 10', () => {
      expect(getRiskLevelFromScore(10)).toBe('low');
      expect(getRiskLevelFromScore(24)).toBe('low');
    });

    it('should return info for scores < 10', () => {
      expect(getRiskLevelFromScore(0)).toBe('info');
      expect(getRiskLevelFromScore(9)).toBe('info');
    });
  });

  describe('runSecurityTests', () => {
    it('should return a fingerprint with tested=true', async () => {
      const result = await runSecurityTests(
        {
          toolName: 'test_tool',
          toolDescription: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
          callTool: createMockCallTool('reject'),
        },
        {
          categories: ['sql_injection'],
          maxPayloadsPerCategory: 2,
          timeout: 1000,
        }
      );

      expect(result.tested).toBe(true);
      expect(result.categoriesTested).toContain('sql_injection');
      expect(result.testedAt).toBeDefined();
      expect(result.findingsHash).toBeDefined();
    });

    it('should detect findings when tool accepts payloads', async () => {
      const result = await runSecurityTests(
        {
          toolName: 'vulnerable_tool',
          toolDescription: 'A vulnerable tool',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          },
          callTool: createMockCallTool('accept'),
        },
        {
          categories: ['sql_injection'],
          maxPayloadsPerCategory: 2,
          timeout: 1000,
        }
      );

      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should not detect findings when tool rejects payloads', async () => {
      const result = await runSecurityTests(
        {
          toolName: 'secure_tool',
          toolDescription: 'A secure tool',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
          callTool: createMockCallTool('reject'),
        },
        {
          categories: ['sql_injection'],
          maxPayloadsPerCategory: 2,
          timeout: 1000,
        }
      );

      expect(result.findings.length).toBe(0);
      expect(result.riskScore).toBe(0);
    });

    it('should handle tool with no schema', async () => {
      const result = await runSecurityTests(
        {
          toolName: 'no_schema_tool',
          toolDescription: 'A tool without schema',
          callTool: createMockCallTool('reject'),
        },
        {
          categories: ['sql_injection'],
          maxPayloadsPerCategory: 2,
          timeout: 1000,
        }
      );

      expect(result.tested).toBe(true);
      // Should still work, just may not find testable parameters
      expect(result.categoriesTested).toContain('sql_injection');
    });

    it('should respect maxPayloadsPerCategory limit', async () => {
      let callCount = 0;
      const result = await runSecurityTests(
        {
          toolName: 'test_tool',
          toolDescription: 'Test',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
          callTool: async () => {
            callCount++;
            return { isError: true, content: '', errorMessage: 'Rejected' };
          },
        },
        {
          categories: ['sql_injection'],
          maxPayloadsPerCategory: 1,
          timeout: 1000,
        }
      );

      // Should only call tool once per parameter per category
      expect(callCount).toBeLessThanOrEqual(2);
    });
  });

  describe('compareSecurityFingerprints', () => {
    it('should detect new findings', () => {
      const previous = createMockFingerprint({ findings: [] });
      const current = createMockFingerprint({
        findings: [createMockFinding()],
        riskScore: 50,
      });

      const diff = compareSecurityFingerprints(previous, current);

      expect(diff.newFindings.length).toBe(1);
      expect(diff.resolvedFindings.length).toBe(0);
      expect(diff.degraded).toBe(true);
    });

    it('should detect resolved findings', () => {
      const previous = createMockFingerprint({
        findings: [createMockFinding()],
        riskScore: 50,
      });
      const current = createMockFingerprint({ findings: [], riskScore: 0 });

      const diff = compareSecurityFingerprints(previous, current);

      expect(diff.newFindings.length).toBe(0);
      expect(diff.resolvedFindings.length).toBe(1);
      expect(diff.degraded).toBe(false);
    });

    it('should handle no changes', () => {
      const finding = createMockFinding();
      const previous = createMockFingerprint({
        findings: [finding],
        riskScore: 50,
      });
      const current = createMockFingerprint({
        findings: [finding],
        riskScore: 50,
      });

      const diff = compareSecurityFingerprints(previous, current);

      expect(diff.newFindings.length).toBe(0);
      expect(diff.resolvedFindings.length).toBe(0);
      expect(diff.riskScoreChange).toBe(0);
    });

    it('should calculate risk score change', () => {
      const previous = createMockFingerprint({ riskScore: 30 });
      const current = createMockFingerprint({ riskScore: 70 });

      const diff = compareSecurityFingerprints(previous, current);

      expect(diff.previousRiskScore).toBe(30);
      expect(diff.currentRiskScore).toBe(70);
      expect(diff.riskScoreChange).toBe(40);
      expect(diff.degraded).toBe(true);
    });

    it('should handle undefined fingerprints', () => {
      const diff1 = compareSecurityFingerprints(undefined, undefined);
      expect(diff1.newFindings.length).toBe(0);
      expect(diff1.resolvedFindings.length).toBe(0);

      const fingerprint = createMockFingerprint({
        findings: [createMockFinding()],
      });
      const diff2 = compareSecurityFingerprints(undefined, fingerprint);
      expect(diff2.newFindings.length).toBe(1);

      const diff3 = compareSecurityFingerprints(fingerprint, undefined);
      expect(diff3.resolvedFindings.length).toBe(1);
    });

    it('should generate meaningful summary', () => {
      const previous = createMockFingerprint({ findings: [], riskScore: 10 });
      const current = createMockFingerprint({
        findings: [
          createMockFinding({ riskLevel: 'critical' }),
          createMockFinding({ riskLevel: 'medium', cweId: 'CWE-79', parameter: 'other' }),
        ],
        riskScore: 80,
      });

      const diff = compareSecurityFingerprints(previous, current);

      // Summary should mention new findings and risk score change
      expect(diff.summary).toContain('new finding');
      expect(diff.summary).toContain('risk score');
      expect(diff.summary.length).toBeGreaterThan(0);
    });
  });
});

describe('Security Payload Constants', () => {
  it('should have valid SQL injection payloads', () => {
    const payloads = getPayloadsForCategory('sql_injection');
    expect(payloads.some((p) => p.payload.includes("'"))).toBe(true);
    expect(payloads.some((p) => p.payload.toLowerCase().includes('or'))).toBe(true);
  });

  it('should have valid XSS payloads', () => {
    const payloads = getPayloadsForCategory('xss');
    expect(payloads.some((p) => p.payload.includes('<script>'))).toBe(true);
  });

  it('should have valid path traversal payloads', () => {
    const payloads = getPayloadsForCategory('path_traversal');
    expect(payloads.some((p) => p.payload.includes('../'))).toBe(true);
  });

  it('should have valid command injection payloads', () => {
    const payloads = getPayloadsForCategory('command_injection');
    expect(payloads.some((p) => p.payload.includes('|') || p.payload.includes(';'))).toBe(true);
  });

  it('should have valid SSRF payloads', () => {
    const payloads = getPayloadsForCategory('ssrf');
    expect(payloads.some((p) => p.payload.includes('169.254'))).toBe(true);
  });

  it('should have expected behavior defined for all payloads', () => {
    const allPayloads = getAllSecurityPayloads();
    for (const payload of allPayloads) {
      expect(['accept', 'reject', 'sanitize']).toContain(payload.expectedBehavior);
    }
  });
});
