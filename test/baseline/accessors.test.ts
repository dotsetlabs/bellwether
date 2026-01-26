/**
 * Unit tests for baseline/accessors.ts
 *
 * Tests the accessor functions for extracting data from baselines.
 * Following TDD principles - testing expected behavior based on rational assumptions.
 */

import { describe, it, expect } from 'vitest';
import {
  getBaselineGeneratedAt,
  getBaselineHash,
  getBaselineServerCommand,
  getBaselineMode,
  getBaselineWorkflows,
  toToolCapability,
  getToolFingerprints,
} from '../../src/baseline/accessors.js';
import type { BehavioralBaseline, ToolFingerprint } from '../../src/baseline/types.js';

/**
 * Helper to create a minimal baseline for testing accessors.
 */
function createTestBaseline(options: {
  generatedAt?: string;
  hash?: string;
  serverCommand?: string;
  mode?: 'check' | 'explore';
  workflows?: Array<{ id: string; name: string; toolSequence: string[]; succeeded: boolean }>;
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown>; schemaHash?: string }>;
  toolProfiles?: Array<{
    name: string;
    description?: string;
    schemaHash?: string;
    behavioralNotes?: string[];
    limitations?: string[];
    securityNotes?: string[];
  }>;
}): BehavioralBaseline {
  return {
    version: '1.0.0',
    metadata: {
      mode: options.mode || 'check',
      generatedAt: options.generatedAt || '2024-01-15T10:30:00.000Z',
      serverCommand: options.serverCommand || 'npx test-server',
      cliVersion: '0.11.0',
      durationMs: 1000,
      personas: [],
      model: 'none',
    },
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '0.1.0',
      capabilities: ['tools'],
    },
    capabilities: {
      tools: (options.tools || []).map((t) => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || {},
        schemaHash: t.schemaHash || 'hash123',
      })),
    },
    interviews: [],
    toolProfiles: (options.toolProfiles || []).map((p) => ({
      name: p.name,
      description: p.description || '',
      schemaHash: p.schemaHash || '',
      assertions: [],
      behavioralNotes: p.behavioralNotes || [],
      limitations: p.limitations || [],
      securityNotes: p.securityNotes || [],
    })),
    assertions: [],
    summary: 'Test baseline',
    hash: options.hash || 'test-hash-123',
    workflows: options.workflows,
  };
}

describe('accessors', () => {
  describe('getBaselineGeneratedAt', () => {
    it('should return Date object from ISO string', () => {
      const baseline = createTestBaseline({
        generatedAt: '2024-03-15T14:30:00.000Z',
      });

      const result = getBaselineGeneratedAt(baseline);

      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-03-15T14:30:00.000Z');
    });

    it('should handle different date formats', () => {
      const baseline = createTestBaseline({
        generatedAt: '2024-01-01T00:00:00Z',
      });

      const result = getBaselineGeneratedAt(baseline);

      // Use UTC methods since the ISO string is in UTC
      expect(result.getUTCFullYear()).toBe(2024);
      expect(result.getUTCMonth()).toBe(0); // January
      expect(result.getUTCDate()).toBe(1);
    });
  });

  describe('getBaselineHash', () => {
    it('should return the baseline hash', () => {
      const baseline = createTestBaseline({ hash: 'abc123def456' });

      const result = getBaselineHash(baseline);

      expect(result).toBe('abc123def456');
    });
  });

  describe('getBaselineServerCommand', () => {
    it('should return the server command', () => {
      const baseline = createTestBaseline({
        serverCommand: 'npx @my-org/my-server --port 3000',
      });

      const result = getBaselineServerCommand(baseline);

      expect(result).toBe('npx @my-org/my-server --port 3000');
    });
  });

  describe('getBaselineMode', () => {
    it('should return "check" for check mode baselines', () => {
      const baseline = createTestBaseline({ mode: 'check' });

      const result = getBaselineMode(baseline);

      expect(result).toBe('check');
    });

    it('should return "explore" for explore mode baselines', () => {
      const baseline = createTestBaseline({ mode: 'explore' });

      const result = getBaselineMode(baseline);

      expect(result).toBe('explore');
    });
  });

  describe('getBaselineWorkflows', () => {
    it('should return workflows when present', () => {
      const workflows = [
        { id: 'wf1', name: 'Login Flow', toolSequence: ['auth', 'login'], succeeded: true },
        { id: 'wf2', name: 'Checkout Flow', toolSequence: ['cart', 'pay'], succeeded: false },
      ];
      const baseline = createTestBaseline({ workflows });

      const result = getBaselineWorkflows(baseline);

      expect(result).toHaveLength(2);
      expect(result?.[0].name).toBe('Login Flow');
      expect(result?.[1].succeeded).toBe(false);
    });

    it('should return undefined when no workflows', () => {
      const baseline = createTestBaseline({ workflows: undefined });

      const result = getBaselineWorkflows(baseline);

      expect(result).toBeUndefined();
    });
  });

  describe('toToolCapability', () => {
    it('should convert ToolFingerprint to ToolCapability', () => {
      const fingerprint: ToolFingerprint = {
        name: 'my_tool',
        description: 'A useful tool',
        schemaHash: 'schema-hash-123',
        inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
        assertions: [],
        securityNotes: [],
        limitations: [],
      };

      const result = toToolCapability(fingerprint);

      expect(result.name).toBe('my_tool');
      expect(result.description).toBe('A useful tool');
      expect(result.schemaHash).toBe('schema-hash-123');
      expect(result.inputSchema).toEqual({
        type: 'object',
        properties: { input: { type: 'string' } },
      });
    });

    it('should handle undefined inputSchema', () => {
      const fingerprint: ToolFingerprint = {
        name: 'tool',
        description: 'desc',
        schemaHash: 'hash',
        assertions: [],
        securityNotes: [],
        limitations: [],
        // No inputSchema
      };

      const result = toToolCapability(fingerprint);

      expect(result.inputSchema).toEqual({});
    });

    it('should convert Date lastTestedAt to ISO string', () => {
      const testDate = new Date('2024-06-15T10:00:00Z');
      const fingerprint: ToolFingerprint = {
        name: 'tool',
        description: 'desc',
        schemaHash: 'hash',
        assertions: [],
        securityNotes: [],
        limitations: [],
        lastTestedAt: testDate,
      };

      const result = toToolCapability(fingerprint);

      expect(result.lastTestedAt).toBe('2024-06-15T10:00:00.000Z');
    });

    it('should preserve performance metrics', () => {
      const fingerprint: ToolFingerprint = {
        name: 'tool',
        description: 'desc',
        schemaHash: 'hash',
        assertions: [],
        securityNotes: [],
        limitations: [],
        baselineP50Ms: 100,
        baselineP95Ms: 250,
        baselineSuccessRate: 0.99,
      };

      const result = toToolCapability(fingerprint);

      expect(result.baselineP50Ms).toBe(100);
      expect(result.baselineP95Ms).toBe(250);
      expect(result.baselineSuccessRate).toBe(0.99);
    });
  });

  describe('getToolFingerprints', () => {
    it('should extract fingerprints from capabilities', () => {
      const baseline = createTestBaseline({
        tools: [
          { name: 'tool_a', description: 'Tool A', schemaHash: 'hash_a' },
          { name: 'tool_b', description: 'Tool B', schemaHash: 'hash_b' },
        ],
      });

      const result = getToolFingerprints(baseline);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool_a');
      expect(result[0].description).toBe('Tool A');
      expect(result[0].schemaHash).toBe('hash_a');
    });

    it('should merge data from toolProfiles', () => {
      const baseline = createTestBaseline({
        tools: [{ name: 'my_tool', description: '', schemaHash: 'hash' }],
        toolProfiles: [{
          name: 'my_tool',
          behavioralNotes: ['Returns JSON'],
          limitations: ['Max 1MB'],
          securityNotes: ['Requires auth'],
        }],
      });

      const result = getToolFingerprints(baseline);

      expect(result).toHaveLength(1);
      expect(result[0].securityNotes).toContain('Requires auth');
      expect(result[0].limitations).toContain('Max 1MB');
      expect(result[0].assertions.length).toBeGreaterThan(0);
    });

    it('should build assertions from profile data', () => {
      const baseline = createTestBaseline({
        tools: [{ name: 'tool' }],
        toolProfiles: [{
          name: 'tool',
          behavioralNotes: ['Returns formatted JSON'],
          limitations: ['Cannot handle binary'],
          securityNotes: ['Safe to use'],
        }],
      });

      const result = getToolFingerprints(baseline);
      const assertions = result[0].assertions;

      // Check behavioral note becomes positive response_format assertion
      const behaviorAssertion = assertions.find((a) => a.assertion === 'Returns formatted JSON');
      expect(behaviorAssertion?.aspect).toBe('response_format');
      expect(behaviorAssertion?.isPositive).toBe(true);

      // Check limitation becomes negative error_handling assertion
      const limitAssertion = assertions.find((a) => a.assertion === 'Cannot handle binary');
      expect(limitAssertion?.aspect).toBe('error_handling');
      expect(limitAssertion?.isPositive).toBe(false);

      // Check security note becomes security assertion
      const securityAssertion = assertions.find((a) => a.assertion === 'Safe to use');
      expect(securityAssertion?.aspect).toBe('security');
      expect(securityAssertion?.isPositive).toBe(true);
    });

    it('should mark security notes with "risk" as negative assertions', () => {
      const baseline = createTestBaseline({
        tools: [{ name: 'tool' }],
        toolProfiles: [{
          name: 'tool',
          securityNotes: ['Potential security risk with untrusted input'],
        }],
      });

      const result = getToolFingerprints(baseline);
      const securityAssertion = result[0].assertions.find((a) => a.aspect === 'security');

      expect(securityAssertion?.isPositive).toBe(false);
    });

    it('should mark security notes with "vulnerab" as negative assertions', () => {
      const baseline = createTestBaseline({
        tools: [{ name: 'tool' }],
        toolProfiles: [{
          name: 'tool',
          securityNotes: ['Vulnerable to path traversal'],
        }],
      });

      const result = getToolFingerprints(baseline);
      const securityAssertion = result[0].assertions.find((a) => a.aspect === 'security');

      expect(securityAssertion?.isPositive).toBe(false);
    });

    it('should mark security notes with "dangerous" as negative assertions', () => {
      const baseline = createTestBaseline({
        tools: [{ name: 'tool' }],
        toolProfiles: [{
          name: 'tool',
          securityNotes: ['Dangerous operation allowed'],
        }],
      });

      const result = getToolFingerprints(baseline);
      const securityAssertion = result[0].assertions.find((a) => a.aspect === 'security');

      expect(securityAssertion?.isPositive).toBe(false);
    });

    it('should fall back to toolProfiles when no capabilities.tools', () => {
      const baseline = createTestBaseline({
        tools: [], // Empty
        toolProfiles: [{
          name: 'fallback_tool',
          description: 'Fallback description',
          schemaHash: 'fallback_hash',
        }],
      });

      const result = getToolFingerprints(baseline);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('fallback_tool');
      expect(result[0].description).toBe('Fallback description');
    });

    it('should prefer tool description over profile description', () => {
      const baseline = createTestBaseline({
        tools: [{ name: 'tool', description: 'From capability' }],
        toolProfiles: [{
          name: 'tool',
          description: 'From profile',
        }],
      });

      const result = getToolFingerprints(baseline);

      expect(result[0].description).toBe('From capability');
    });

    it('should fall back to profile description when tool description empty', () => {
      const baseline = createTestBaseline({
        tools: [{ name: 'tool', description: '' }],
        toolProfiles: [{
          name: 'tool',
          description: 'From profile',
        }],
      });

      const result = getToolFingerprints(baseline);

      expect(result[0].description).toBe('From profile');
    });

    it('should handle empty baseline', () => {
      const baseline = createTestBaseline({
        tools: [],
        toolProfiles: [],
      });

      const result = getToolFingerprints(baseline);

      expect(result).toHaveLength(0);
    });

    it('should convert lastTestedAt string to Date', () => {
      const baseline = createTestBaseline({
        tools: [{
          name: 'tool',
          // lastTestedAt would be in the ToolCapability
        }],
      });
      // Manually add lastTestedAt to simulate loaded baseline
      (baseline.capabilities.tools[0] as unknown as Record<string, unknown>).lastTestedAt = '2024-07-01T00:00:00Z';

      const result = getToolFingerprints(baseline);

      expect(result[0].lastTestedAt).toBeInstanceOf(Date);
      expect(result[0].lastTestedAt?.toISOString()).toBe('2024-07-01T00:00:00.000Z');
    });
  });
});
