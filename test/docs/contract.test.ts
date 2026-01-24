/**
 * Tests for CONTRACT.md generation enhancements.
 */

import { describe, expect, it } from 'vitest';
import { generateContractMd } from '../../src/docs/contract.js';
import type { InterviewResult, ToolInteraction } from '../../src/interview/types.js';
import type { MCPToolCallResult } from '../../src/transport/types.js';

function createResponse(isError: boolean, text: string): MCPToolCallResult {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

function createInteraction(params: {
  toolName: string;
  description: string;
  expected: 'success' | 'error';
  actual: 'success' | 'error';
  durationMs: number;
}): ToolInteraction {
  const isError = params.actual === 'error';
  return {
    toolName: params.toolName,
    question: {
      description: params.description,
      category: params.expected === 'error' ? 'error_handling' : 'happy_path',
      args: {},
      expectedOutcome: params.expected,
    },
    response: createResponse(isError, isError ? 'error' : 'ok'),
    error: isError ? 'error' : null,
    analysis: '',
    durationMs: params.durationMs,
    toolExecutionMs: params.durationMs,
    outcomeAssessment: {
      expected: params.expected,
      actual: params.actual,
      correct: params.expected === params.actual,
    },
  };
}

const sampleResult: InterviewResult = {
  discovery: {
    serverInfo: { name: 'test-server', version: '1.0.0' },
    protocolVersion: '2024-11-05',
    capabilities: { tools: {}, prompts: {}, resources: {} },
    tools: [
      {
        name: 'tool_a',
        description: 'Tool A',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      {
        name: 'tool_b',
        description: 'Tool B',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    ],
    prompts: [],
    resources: [],
    timestamp: new Date('2024-01-01T00:00:00Z'),
    serverCommand: 'node server.js',
    serverArgs: [],
  },
  toolProfiles: [
    {
      name: 'tool_a',
      description: 'Tool A',
      interactions: [
        createInteraction({
          toolName: 'tool_a',
          description: 'Missing required parameter',
          expected: 'error',
          actual: 'error',
          durationMs: 12,
        }),
        createInteraction({
          toolName: 'tool_a',
          description: 'Valid input',
          expected: 'success',
          actual: 'success',
          durationMs: 10,
        }),
      ],
      behavioralNotes: [],
      limitations: [],
      securityNotes: [],
    },
    {
      name: 'tool_b',
      description: 'Tool B',
      interactions: [
        createInteraction({
          toolName: 'tool_b',
          description: 'Wrong type for id',
          expected: 'error',
          actual: 'success',
          durationMs: 14,
        }),
        createInteraction({
          toolName: 'tool_b',
          description: 'Valid input fails unexpectedly',
          expected: 'success',
          actual: 'error',
          durationMs: 18,
        }),
      ],
      behavioralNotes: [],
      limitations: [],
      securityNotes: [],
    },
  ],
  summary: 'Summary',
  limitations: [],
  recommendations: [],
  metadata: {
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T00:00:02Z'),
    durationMs: 2000,
    toolCallCount: 4,
    errorCount: 1,
  },
};

describe('generateContractMd', () => {
  it('includes metrics legend and validation table', () => {
    const contract = generateContractMd(sampleResult, {
      countValidationAsSuccess: true,
      separateValidationMetrics: true,
    });

    expect(contract).toContain('## Metrics Legend');
    expect(contract).toContain('## Validation Testing');
    expect(contract).toContain('| Tool | Parameters | Reliability | P50 | Confidence | Description |');
    expect(contract).toContain('Required Params');
  });

  it('includes issues detected section', () => {
    const contract = generateContractMd(sampleResult, {
      countValidationAsSuccess: true,
      separateValidationMetrics: true,
    });

    expect(contract).toContain('## Issues Detected');
    expect(contract).toContain('`tool_b`');
    expect(contract).toContain('Critical');
    expect(contract).toContain('Warnings');
  });

  it('renames Success column to Happy Path % in performance baseline', () => {
    const contract = generateContractMd(sampleResult, {
      countValidationAsSuccess: true,
      separateValidationMetrics: true,
    });

    expect(contract).toContain('| Tool | Calls | P50 | P95 | Happy Path % | Confidence |');
    expect(contract).not.toContain('| Tool | Calls | P50 | P95 | Success | Confidence |');
  });
});

describe('Performance Baseline CV calculation', () => {
  it('shows consistent stdDev and CV when all durations are identical', () => {
    // All calls have identical 10ms duration - stdDev should be 0, CV should be 0
    const identicalDurationsResult: InterviewResult = {
      ...sampleResult,
      toolProfiles: [
        {
          name: 'consistent_tool',
          description: 'Tool with consistent timing',
          interactions: [
            createInteraction({ toolName: 'consistent_tool', description: 'Call 1', expected: 'success', actual: 'success', durationMs: 10 }),
            createInteraction({ toolName: 'consistent_tool', description: 'Call 2', expected: 'success', actual: 'success', durationMs: 10 }),
            createInteraction({ toolName: 'consistent_tool', description: 'Call 3', expected: 'success', actual: 'success', durationMs: 10 }),
            createInteraction({ toolName: 'consistent_tool', description: 'Call 4', expected: 'success', actual: 'success', durationMs: 10 }),
            createInteraction({ toolName: 'consistent_tool', description: 'Call 5', expected: 'success', actual: 'success', durationMs: 10 }),
          ],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        },
      ],
    };

    const contract = generateContractMd(identicalDurationsResult, {});

    // When stdDev is 0ms, CV should also be 0%
    expect(contract).toContain('0ms');
    expect(contract).toContain('0.0%');
    // Should NOT show inconsistent values like 0ms stdDev with high CV
    expect(contract).not.toMatch(/\| 0ms \| [1-9]\d*\.\d%/);
  });

  it('shows non-zero CV when there is timing variability among successful calls', () => {
    // Varying durations should produce non-zero stdDev and CV
    const variableDurationsResult: InterviewResult = {
      ...sampleResult,
      toolProfiles: [
        {
          name: 'variable_tool',
          description: 'Tool with variable timing',
          interactions: [
            createInteraction({ toolName: 'variable_tool', description: 'Fast call', expected: 'success', actual: 'success', durationMs: 50 }),
            createInteraction({ toolName: 'variable_tool', description: 'Slow call', expected: 'success', actual: 'success', durationMs: 150 }),
            createInteraction({ toolName: 'variable_tool', description: 'Medium call', expected: 'success', actual: 'success', durationMs: 100 }),
            createInteraction({ toolName: 'variable_tool', description: 'Another fast', expected: 'success', actual: 'success', durationMs: 60 }),
            createInteraction({ toolName: 'variable_tool', description: 'Another slow', expected: 'success', actual: 'success', durationMs: 140 }),
          ],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        },
      ],
    };

    const contract = generateContractMd(variableDurationsResult, {});

    // Should have Confidence Metrics Details section
    expect(contract).toContain('Confidence Metrics Details');
    // Should show non-zero stdDev and CV
    expect(contract).toMatch(/\| \d+ms \| \d+\.\d+%/);
  });

  it('uses confidence.standardDeviation instead of overall stdDevMs for consistency', () => {
    // Create a scenario where successful calls have different timing than error calls
    // This tests that we're using the right stdDev source (from successful samples only)
    const mixedResult: InterviewResult = {
      ...sampleResult,
      toolProfiles: [
        {
          name: 'mixed_tool',
          description: 'Tool with mixed outcomes',
          interactions: [
            // Successful calls are fast
            createInteraction({ toolName: 'mixed_tool', description: 'Success 1', expected: 'success', actual: 'success', durationMs: 10 }),
            createInteraction({ toolName: 'mixed_tool', description: 'Success 2', expected: 'success', actual: 'success', durationMs: 10 }),
            createInteraction({ toolName: 'mixed_tool', description: 'Success 3', expected: 'success', actual: 'success', durationMs: 10 }),
            // Error calls are slow (but shouldn't affect confidence metrics)
            createInteraction({ toolName: 'mixed_tool', description: 'Validation 1', expected: 'error', actual: 'error', durationMs: 500 }),
            createInteraction({ toolName: 'mixed_tool', description: 'Validation 2', expected: 'error', actual: 'error', durationMs: 500 }),
          ],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        },
      ],
    };

    const contract = generateContractMd(mixedResult, {});

    // The confidence table should show stdDev from successful samples (which is 0ms)
    // not from all samples (which would be much higher due to the 500ms error calls)
    expect(contract).toContain('Confidence Metrics Details');
    // Should show consistent 0ms stdDev and 0% CV for the successful samples
    // Note: Current implementation tracks successfulSamples but sets validationSamples to 0
    // The key check is that stdDev=0ms and CV=0.0% are consistent for identical durations
    expect(contract).toContain('| `mixed_tool` | 3 |');
    expect(contract).toContain('| 0ms | 0.0%');
  });

  it('provides actionable low confidence warning with specific reasons', () => {
    // Create result with low sample count but enough calls to trigger Performance Baseline (needs 2+)
    const lowSampleResult: InterviewResult = {
      ...sampleResult,
      toolProfiles: [
        {
          name: 'low_sample_tool',
          description: 'Tool with few samples',
          interactions: [
            // Need at least 2 calls to trigger Performance Baseline section
            createInteraction({ toolName: 'low_sample_tool', description: 'Call 1', expected: 'success', actual: 'success', durationMs: 100 }),
            createInteraction({ toolName: 'low_sample_tool', description: 'Call 2', expected: 'success', actual: 'success', durationMs: 100 }),
            // Still less than HIGH.MIN_SAMPLES (10) so confidence will be LOW
          ],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        },
      ],
    };

    const contract = generateContractMd(lowSampleResult, {});

    // Should have Performance Baseline section
    expect(contract).toContain('## Performance Baseline');
    // Should have low confidence warning
    expect(contract).toContain('Low Confidence');
    // Should mention insufficient samples
    expect(contract).toContain('insufficient happy path samples');
    // Should provide actionable recommendation
    expect(contract).toContain('--warmup-runs');
  });
});
