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

  it('validates when schemaPath is provided as a relative path', () => {
    const report = generateJsonReport(sampleResult, {
      schemaUrl: REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL,
      schemaPath: REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_FILE,
      validate: true,
    });

    const parsed = JSON.parse(report) as { $schema?: string };
    expect(parsed.$schema).toBe(REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL);
  });

  it('validates against the explore report schema', () => {
    const report = generateJsonReport(sampleResult, {
      schemaUrl: REPORT_SCHEMAS.EXPLORE_REPORT_SCHEMA_URL,
      schemaPath: REPORT_SCHEMAS.EXPLORE_REPORT_SCHEMA_FILE,
      validate: true,
    });

    const parsed = JSON.parse(report) as { $schema?: string };
    expect(parsed.$schema).toBe(REPORT_SCHEMAS.EXPLORE_REPORT_SCHEMA_URL);
  });

  it('includes enrichment fields when present', () => {
    const enrichedResult: InterviewResult = {
      ...sampleResult,
      semanticInferences: {
        ping: [
          {
            paramName: 'id',
            inferredType: 'identifier',
            confidence: 0.9,
            evidence: ['name pattern'],
          },
        ],
      },
      schemaEvolution: {
        ping: {
          currentHash: 'hash1',
          history: [
            {
              hash: 'hash1',
              schema: { type: 'object', properties: {}, required: [] },
              observedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
              sampleCount: 1,
            },
          ],
          isStable: true,
          stabilityConfidence: 1,
          inconsistentFields: [],
          sampleCount: 1,
        },
      },
      errorAnalysisSummaries: {
        ping: {
          tool: 'ping',
          totalErrors: 1,
          analyses: [
            {
              pattern: { category: 'unknown', patternHash: 'hash', example: 'oops', count: 1 },
              statusCategory: 'unknown',
              rootCause: 'unknown',
              remediation: 'retry',
              relatedParameters: [],
              transient: false,
              severity: 'low',
            },
          ],
          dominantCategory: 'unknown',
          transientErrors: 0,
          actionableCount: 1,
          remediations: ['retry'],
          categoryCounts: { unknown: 1 },
          topRootCauses: ['unknown'],
          topRemediations: ['retry'],
          relatedParameters: [],
        },
      },
      documentationScore: {
        overallScore: 85,
        grade: 'B',
        components: {
          descriptionCoverage: 1,
          descriptionQuality: 0.8,
          parameterDocumentation: 0.7,
          exampleCoverage: 0.9,
        },
        issues: [],
        suggestions: [],
        toolCount: 1,
      },
    };

    const report = generateJsonReport(enrichedResult, {
      schemaUrl: REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL,
      schemaPath: REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_FILE,
      validate: true,
    });

    const parsed = JSON.parse(report) as InterviewResult;
    expect(parsed.semanticInferences).toBeDefined();
    expect(parsed.schemaEvolution).toBeDefined();
    expect(parsed.errorAnalysisSummaries).toBeDefined();
    expect(parsed.documentationScore).toBeDefined();
  });

  it('throws when report does not match schema', () => {
    const invalidResult = { ...sampleResult, metadata: undefined } as unknown as InterviewResult;
    expect(() =>
      generateJsonReport(invalidResult, {
        schemaUrl: REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL,
        validate: true,
      })
    ).toThrow(/schema validation failed/i);
  });
});
