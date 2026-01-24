/**
 * Tests for JSON report generation and schema validation.
 */

import { describe, expect, it } from 'vitest';
import { generateJsonReport } from '../../src/docs/report.js';
import { REPORT_SCHEMAS } from '../../src/constants.js';
import type { InterviewResult } from '../../src/interview/types.js';

const sampleResult: InterviewResult = {
  discovery: {
    serverInfo: { name: 'test-server', version: '1.0.0' },
    protocolVersion: '2024-11-05',
    capabilities: { tools: {}, prompts: {}, resources: {} },
    tools: [
      {
        name: 'ping',
        description: 'Ping tool',
        inputSchema: { type: 'object', properties: {}, required: [] },
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
      name: 'ping',
      description: 'Ping tool',
      interactions: [
        {
          toolName: 'ping',
          question: {
            description: 'Basic ping',
            category: 'happy_path',
            args: {},
            expectedOutcome: 'success',
          },
          response: { content: [{ type: 'text', text: 'ok' }] },
          error: null,
          analysis: '',
          durationMs: 5,
          outcomeAssessment: {
            expected: 'success',
            actual: 'success',
            correct: true,
          },
        },
      ],
      behavioralNotes: [],
      limitations: [],
      securityNotes: [],
    },
  ],
  summary: 'All good',
  limitations: [],
  recommendations: [],
  metadata: {
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T00:00:01Z'),
    durationMs: 1000,
    toolCallCount: 1,
    errorCount: 0,
  },
};

describe('generateJsonReport', () => {
  it('embeds schema URL and validates output', () => {
    const report = generateJsonReport(sampleResult, {
      schemaUrl: REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL,
      validate: true,
    });

    const parsed = JSON.parse(report) as { $schema?: string };
    expect(parsed.$schema).toBe(REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL);
  });

  it('throws when report does not match schema', () => {
    const invalidResult = { ...sampleResult, metadata: undefined } as unknown as InterviewResult;
    expect(() => generateJsonReport(invalidResult, {
      schemaUrl: REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL,
      validate: true,
    })).toThrow(/schema validation failed/i);
  });
});
