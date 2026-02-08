/**
 * Unit tests for baseline/baseline-hash.ts
 *
 * Tests the calculateBaselineHash function for deterministic output,
 * property order independence, Date handling, and stability.
 */

import { describe, it, expect } from 'vitest';
import { calculateBaselineHash } from '../../src/baseline/baseline-hash.js';
import type { BehavioralBaseline } from '../../src/baseline/types.js';

/**
 * Helper to create a minimal baseline without a hash field.
 */
function createMinimalBaseline(
  overrides: Partial<Omit<BehavioralBaseline, 'hash'>> = {}
): Omit<BehavioralBaseline, 'hash'> {
  return {
    version: '2.0.1',
    metadata: {
      mode: 'check',
      generatedAt: '2025-01-15T12:00:00.000Z',
      serverCommand: 'npx test-server',
      cliVersion: '2.0.1',
      durationMs: 1000,
      personas: [],
      model: 'none',
    },
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2025-11-25',
      capabilities: ['tools'],
    },
    capabilities: {
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: {} },
          schemaHash: 'hash123',
        },
      ],
      prompts: [],
      resources: [],
    },
    interviews: [],
    toolProfiles: [],
    assertions: [],
    summary: 'Test baseline',
    ...overrides,
  };
}

describe('calculateBaselineHash', () => {
  it('should produce a 16-character hex string', () => {
    const baseline = createMinimalBaseline();
    const hash = calculateBaselineHash(baseline);

    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should be deterministic — same content produces same hash', () => {
    const baseline = createMinimalBaseline();

    const hash1 = calculateBaselineHash(baseline);
    const hash2 = calculateBaselineHash(baseline);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different content', () => {
    const baseline1 = createMinimalBaseline({ summary: 'Baseline A' });
    const baseline2 = createMinimalBaseline({ summary: 'Baseline B' });

    const hash1 = calculateBaselineHash(baseline1);
    const hash2 = calculateBaselineHash(baseline2);

    expect(hash1).not.toBe(hash2);
  });

  it('should be independent of property insertion order', () => {
    // Create two objects with same fields in different order
    const baseline1 = createMinimalBaseline();

    // Create a reordered copy by destructuring in different order
    const {
      summary,
      version,
      capabilities,
      metadata,
      server,
      interviews,
      toolProfiles,
      assertions,
    } = createMinimalBaseline();
    const baseline2 = {
      summary,
      assertions,
      toolProfiles,
      interviews,
      capabilities,
      server,
      metadata,
      version,
    } as Omit<BehavioralBaseline, 'hash'>;

    const hash1 = calculateBaselineHash(baseline1);
    const hash2 = calculateBaselineHash(baseline2);

    expect(hash1).toBe(hash2);
  });

  it('should handle Date objects by converting to ISO strings', () => {
    const withDate = createMinimalBaseline();
    // Simulate a Date object that might appear in the baseline
    (withDate as Record<string, unknown>).acceptance = {
      acceptedAt: new Date('2025-01-15T12:00:00.000Z'),
      acceptedDiff: {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
        severity: 'none',
        breakingCount: 0,
        warningCount: 0,
        infoCount: 0,
      },
    };

    const withString = createMinimalBaseline();
    (withString as Record<string, unknown>).acceptance = {
      acceptedAt: '2025-01-15T12:00:00.000Z',
      acceptedDiff: {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
        severity: 'none',
        breakingCount: 0,
        warningCount: 0,
        infoCount: 0,
      },
    };

    const hashDate = calculateBaselineHash(withDate);
    const hashString = calculateBaselineHash(withString);

    // Date and equivalent ISO string should produce the same hash
    expect(hashDate).toBe(hashString);
  });

  it('should handle empty baselines with no tools', () => {
    const baseline = createMinimalBaseline({
      capabilities: { tools: [], prompts: [], resources: [] },
    });

    const hash = calculateBaselineHash(baseline);

    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should handle nested object key ordering', () => {
    const baseline1 = createMinimalBaseline({
      capabilities: {
        tools: [
          {
            name: 'tool_a',
            description: 'desc',
            inputSchema: {
              type: 'object',
              properties: { alpha: { type: 'string' }, beta: { type: 'number' } },
            },
            schemaHash: 'h1',
          },
        ],
        prompts: [],
        resources: [],
      },
    });

    const baseline2 = createMinimalBaseline({
      capabilities: {
        tools: [
          {
            name: 'tool_a',
            description: 'desc',
            inputSchema: {
              type: 'object',
              properties: { beta: { type: 'number' }, alpha: { type: 'string' } },
            },
            schemaHash: 'h1',
          },
        ],
        prompts: [],
        resources: [],
      },
    });

    const hash1 = calculateBaselineHash(baseline1);
    const hash2 = calculateBaselineHash(baseline2);

    // Same content in different key order should produce same hash
    expect(hash1).toBe(hash2);
  });

  it('should detect changes in deeply nested fields', () => {
    const baseline1 = createMinimalBaseline({
      capabilities: {
        tools: [
          {
            name: 'tool_a',
            description: 'desc',
            inputSchema: {
              type: 'object',
              properties: { nested: { type: 'object', properties: { deep: { type: 'string' } } } },
            },
            schemaHash: 'h1',
          },
        ],
        prompts: [],
        resources: [],
      },
    });

    const baseline2 = createMinimalBaseline({
      capabilities: {
        tools: [
          {
            name: 'tool_a',
            description: 'desc',
            inputSchema: {
              type: 'object',
              properties: { nested: { type: 'object', properties: { deep: { type: 'number' } } } },
            },
            schemaHash: 'h1',
          },
        ],
        prompts: [],
        resources: [],
      },
    });

    const hash1 = calculateBaselineHash(baseline1);
    const hash2 = calculateBaselineHash(baseline2);

    // Different nested value should produce different hash
    expect(hash1).not.toBe(hash2);
  });
});
