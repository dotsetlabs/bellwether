/**
 * Runtime drift detection integration tests.
 *
 * Tests runtime observation drift (response fingerprints, error patterns,
 * schema evolution, security findings, performance, workflows, documentation),
 * remaining structural gaps (resource annotations, prompt arg details,
 * template MIME/title), aggregate reports, and CompareOptions ignore flags.
 *
 * Uses a hybrid approach:
 * - Pipeline tests: real mock server -> MCPClient -> discover -> interview -> baseline
 * - Direct construction tests: construct BehavioralBaseline objects directly
 */

import { describe, it, expect } from 'vitest';
import {
  runDriftComparison,
  runDirectComparison,
  baseConfig,
  withPrompts,
  withResources,
  withResourceTemplates,
  withProtocolVersion,
  withToolResponses,
  createDirectBaseline,
  PROMPTS,
  RESOURCES,
  TEMPLATES,
} from './helpers.js';
import type { DirectToolOptions } from './helpers.js';
import type { ResponseFingerprint } from '../../src/baseline/response-fingerprint.js';
import type { ResponseSchemaEvolution } from '../../src/baseline/response-schema-tracker.js';
import type { SecurityFingerprint, SecurityFinding } from '../../src/security/types.js';
import type { PerformanceConfidence } from '../../src/baseline/types.js';

const TEST_TIMEOUT = 30_000;

// ---------------------------------------------------------------------------
// Shared test data constants
// ---------------------------------------------------------------------------

function makeFingerprint(overrides: Partial<ResponseFingerprint> = {}): ResponseFingerprint {
  return {
    structureHash: 'abc123',
    contentType: 'object',
    fields: ['status', 'data'],
    size: 'small',
    isEmpty: false,
    sampleCount: 2,
    confidence: 1,
    ...overrides,
  };
}

function makeSchemaEvolution(
  overrides: Partial<ResponseSchemaEvolution> = {}
): ResponseSchemaEvolution {
  return {
    currentHash: 'evo-hash-1',
    history: [
      {
        hash: 'evo-hash-1',
        schema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            data: { type: 'object', properties: { temp: { type: 'number' } } },
          },
          required: ['status', 'data'],
        },
        observedAt: new Date(),
        sampleCount: 5,
      },
    ],
    isStable: true,
    stabilityConfidence: 0.95,
    inconsistentFields: [],
    sampleCount: 5,
    ...overrides,
  };
}

function makeSecurityFingerprint(
  overrides: Partial<SecurityFingerprint> = {}
): SecurityFingerprint {
  return {
    tested: true,
    categoriesTested: ['sql_injection'],
    findings: [],
    riskScore: 0,
    testedAt: new Date().toISOString(),
    findingsHash: 'clean',
    ...overrides,
  };
}

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    category: 'sql_injection',
    riskLevel: 'critical',
    title: 'SQL Injection',
    description: 'SQL injection via location param',
    evidence: "Input: ' OR 1=1 --",
    remediation: 'Use parameterized queries',
    cweId: 'CWE-89',
    parameter: 'location',
    tool: 'get_weather',
    ...overrides,
  };
}

function makePerformanceConfidence(
  overrides: Partial<PerformanceConfidence> = {}
): PerformanceConfidence {
  return {
    sampleCount: 10,
    successfulSamples: 10,
    validationSamples: 5,
    totalTests: 15,
    standardDeviation: 5,
    coefficientOfVariation: 0.1,
    confidenceLevel: 'high',
    ...overrides,
  };
}

const BASE_TOOL: DirectToolOptions = {
  name: 'get_weather',
  description: 'Get the current weather for a location',
  schemaHash: 'weather-hash',
  inputSchema: {
    type: 'object',
    properties: { location: { type: 'string' } },
    required: ['location'],
  },
};

// ===========================================================================
describe('Drift Detection - Runtime Observations', { timeout: TEST_TIMEOUT }, () => {
  // -------------------------------------------------------------------------
  // Response structure fingerprints
  // -------------------------------------------------------------------------

  describe('Response structure fingerprints', () => {
    // -- Pipeline tests --

    it('structure hash changed -> response_structure, breaking', async () => {
      const before = withToolResponses(baseConfig(), {
        get_weather: { text: '{"status":"ok","data":{"temp":72}}' },
      });
      const after = withToolResponses(baseConfig(), {
        get_weather: { text: '{"temperature":72,"forecast":"sunny"}' },
      });
      const diff = await runDriftComparison(before, after);

      const fpChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_structure'
      );
      expect(fpChanges.length).toBeGreaterThan(0);
      expect(fpChanges.some((c) => c.severity === 'breaking')).toBe(true);
    });

    it('content type changed (object -> text) -> response_structure, breaking', async () => {
      const before = withToolResponses(baseConfig(), {
        get_weather: { text: '{"status":"ok","value":42}' },
      });
      const after = withToolResponses(baseConfig(), {
        get_weather: { text: 'The weather is sunny and warm today' },
      });
      const diff = await runDriftComparison(before, after);

      const fpChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_structure'
      );
      expect(fpChanges.length).toBeGreaterThan(0);
      expect(fpChanges.some((c) => c.severity === 'breaking')).toBe(true);
    });

    it('response became empty -> response_structure, breaking', async () => {
      const before = withToolResponses(baseConfig(), {
        get_weather: { text: '{"data":"value"}' },
      });
      const after = withToolResponses(baseConfig(), {
        get_weather: { text: '' },
      });
      const diff = await runDriftComparison(before, after);

      const fpChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_structure'
      );
      expect(fpChanges.length).toBeGreaterThan(0);
      expect(fpChanges.some((c) => c.severity === 'breaking')).toBe(true);
    });

    it('identical responses -> no response_structure changes', async () => {
      const cfg = withToolResponses(baseConfig(), {
        get_weather: { text: '{"status":"ok","temp":72}' },
      });
      const diff = await runDriftComparison(cfg, cfg);

      const fpChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_structure'
      );
      expect(fpChanges).toHaveLength(0);
    });

    // -- Direct construction tests --

    it('fields removed -> response_structure, breaking', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseFingerprint: makeFingerprint({
              fields: ['status', 'data', 'meta'],
            }),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseFingerprint: makeFingerprint({
              structureHash: 'changed',
              fields: ['status'],
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const fpChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_structure'
      );
      expect(fpChanges.length).toBeGreaterThan(0);
      expect(fpChanges.some((c) => c.severity === 'breaking')).toBe(true);
    });

    it('fields added -> response_structure, warning', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseFingerprint: makeFingerprint({
              fields: ['status'],
            }),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseFingerprint: makeFingerprint({
              structureHash: 'changed',
              fields: ['status', 'data', 'meta'],
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const fpChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_structure'
      );
      expect(fpChanges.length).toBeGreaterThan(0);
      // Added fields produce a non-breaking (warning) change for the fields aspect,
      // but structure hash change is breaking
      expect(fpChanges.some((c) => c.severity === 'warning' || c.severity === 'breaking')).toBe(
        true
      );
    });

    it('array item structure changed -> response_structure, breaking', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseFingerprint: makeFingerprint({
              contentType: 'array',
              arrayItemStructure: 'item-hash-1',
              fields: undefined,
            }),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseFingerprint: makeFingerprint({
              structureHash: 'changed',
              contentType: 'array',
              arrayItemStructure: 'item-hash-2',
              fields: undefined,
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const fpChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_structure'
      );
      expect(fpChanges.length).toBeGreaterThan(0);
      expect(fpChanges.some((c) => c.severity === 'breaking')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Error patterns
  // -------------------------------------------------------------------------

  describe('Error patterns', () => {
    it('new error pattern -> error_pattern, warning', async () => {
      const before = withToolResponses(baseConfig(), {
        get_weather: { text: '{"status":"ok"}' },
      });
      const after = withToolResponses(baseConfig(), {
        get_weather: { text: 'Error: Invalid location parameter', isError: true },
      });
      const diff = await runDriftComparison(before, after);

      const errChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'error_pattern'
      );
      expect(errChanges.length).toBeGreaterThan(0);
      expect(errChanges.some((c) => c.severity === 'warning')).toBe(true);
    });

    it('error pattern resolved -> error_pattern, info', async () => {
      const before = withToolResponses(baseConfig(), {
        get_weather: { text: 'Error: Invalid location parameter', isError: true },
      });
      const after = withToolResponses(baseConfig(), {
        get_weather: { text: '{"status":"ok"}' },
      });
      const diff = await runDriftComparison(before, after);

      const errChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'error_pattern'
      );
      expect(errChanges.length).toBeGreaterThan(0);
      expect(errChanges.some((c) => c.severity === 'info')).toBe(true);
    });

    it('identical error responses -> no error_pattern changes', async () => {
      const cfg = withToolResponses(baseConfig(), {
        get_weather: { text: 'Error: service unavailable', isError: true },
      });
      const diff = await runDriftComparison(cfg, cfg);

      const errChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'error_pattern'
      );
      expect(errChanges).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Response schema evolution
  // -------------------------------------------------------------------------

  describe('Response schema evolution', () => {
    it('fields removed -> response_schema_evolution, breaking', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseSchemaEvolution: makeSchemaEvolution(),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseSchemaEvolution: makeSchemaEvolution({
              currentHash: 'evo-hash-2',
              history: [
                {
                  hash: 'evo-hash-2',
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                    },
                    required: ['status'],
                  },
                  observedAt: new Date(),
                  sampleCount: 5,
                },
              ],
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const evoChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_schema_evolution'
      );
      expect(evoChanges.length).toBeGreaterThan(0);
      expect(evoChanges.some((c) => c.severity === 'breaking')).toBe(true);
    });

    it('fields added -> response_schema_evolution, info', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseSchemaEvolution: makeSchemaEvolution({
              currentHash: 'evo-small',
              history: [
                {
                  hash: 'evo-small',
                  schema: {
                    type: 'object',
                    properties: { status: { type: 'string' } },
                    required: ['status'],
                  },
                  observedAt: new Date(),
                  sampleCount: 5,
                },
              ],
            }),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseSchemaEvolution: makeSchemaEvolution({
              currentHash: 'evo-bigger',
              history: [
                {
                  hash: 'evo-bigger',
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      data: { type: 'object', properties: { temp: { type: 'number' } } },
                    },
                    required: ['status'],
                  },
                  observedAt: new Date(),
                  sampleCount: 5,
                },
              ],
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const evoChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_schema_evolution'
      );
      expect(evoChanges.length).toBeGreaterThan(0);
      expect(evoChanges.some((c) => c.severity === 'info')).toBe(true);
    });

    it('field type changed (incompatible, string -> number) -> response_schema_evolution, breaking', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseSchemaEvolution: makeSchemaEvolution({
              currentHash: 'type-str',
              history: [
                {
                  hash: 'type-str',
                  schema: {
                    type: 'object',
                    properties: { value: { type: 'string' } },
                    required: ['value'],
                  },
                  observedAt: new Date(),
                  sampleCount: 5,
                },
              ],
            }),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseSchemaEvolution: makeSchemaEvolution({
              currentHash: 'type-num',
              history: [
                {
                  hash: 'type-num',
                  schema: {
                    type: 'object',
                    properties: { value: { type: 'number' } },
                    required: ['value'],
                  },
                  observedAt: new Date(),
                  sampleCount: 5,
                },
              ],
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const evoChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_schema_evolution'
      );
      expect(evoChanges.length).toBeGreaterThan(0);
      expect(evoChanges.some((c) => c.severity === 'breaking')).toBe(true);
    });

    it('field type changed (compatible widening, integer -> number) -> response_schema_evolution, warning', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseSchemaEvolution: makeSchemaEvolution({
              currentHash: 'type-int',
              history: [
                {
                  hash: 'type-int',
                  schema: {
                    type: 'object',
                    properties: { value: { type: 'integer' } },
                    required: ['value'],
                  },
                  observedAt: new Date(),
                  sampleCount: 5,
                },
              ],
            }),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseSchemaEvolution: makeSchemaEvolution({
              currentHash: 'type-float',
              history: [
                {
                  hash: 'type-float',
                  schema: {
                    type: 'object',
                    properties: { value: { type: 'number' } },
                    required: ['value'],
                  },
                  observedAt: new Date(),
                  sampleCount: 5,
                },
              ],
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const evoChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_schema_evolution'
      );
      expect(evoChanges.length).toBeGreaterThan(0);
      expect(evoChanges.some((c) => c.severity === 'warning')).toBe(true);
    });

    it('new required field -> response_schema_evolution, breaking', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseSchemaEvolution: makeSchemaEvolution({
              currentHash: 'req-a',
              history: [
                {
                  hash: 'req-a',
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      data: { type: 'string' },
                    },
                    required: ['status'],
                  },
                  observedAt: new Date(),
                  sampleCount: 5,
                },
              ],
            }),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseSchemaEvolution: makeSchemaEvolution({
              currentHash: 'req-b',
              history: [
                {
                  hash: 'req-b',
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      data: { type: 'string' },
                    },
                    required: ['status', 'data'],
                  },
                  observedAt: new Date(),
                  sampleCount: 5,
                },
              ],
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const evoChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'response_schema_evolution'
      );
      expect(evoChanges.length).toBeGreaterThan(0);
      expect(evoChanges.some((c) => c.severity === 'breaking')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Security findings
  // -------------------------------------------------------------------------

  describe('Security findings', () => {
    it('new critical/high finding -> security, breaking', () => {
      const before = createDirectBaseline({
        tools: [{ ...BASE_TOOL, securityFingerprint: makeSecurityFingerprint() }],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            securityFingerprint: makeSecurityFingerprint({
              findings: [makeFinding({ riskLevel: 'critical' })],
              riskScore: 85,
              findingsHash: 'vuln1',
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const secChanges = diff.behaviorChanges.filter((c) => c.aspect === 'security');
      expect(secChanges.length).toBeGreaterThan(0);
      expect(secChanges[0].severity).toBe('breaking');
    });

    it('new medium finding -> security, warning', () => {
      const before = createDirectBaseline({
        tools: [{ ...BASE_TOOL, securityFingerprint: makeSecurityFingerprint() }],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            securityFingerprint: makeSecurityFingerprint({
              findings: [
                makeFinding({
                  riskLevel: 'medium',
                  title: 'Medium XSS',
                  category: 'xss',
                  cweId: 'CWE-79',
                }),
              ],
              riskScore: 40,
              findingsHash: 'vuln-med',
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const secChanges = diff.behaviorChanges.filter((c) => c.aspect === 'security');
      expect(secChanges.length).toBeGreaterThan(0);
      expect(secChanges[0].severity).toBe('warning');
    });

    it('new low/info finding -> security, info', () => {
      const before = createDirectBaseline({
        tools: [{ ...BASE_TOOL, securityFingerprint: makeSecurityFingerprint() }],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            securityFingerprint: makeSecurityFingerprint({
              findings: [
                makeFinding({
                  riskLevel: 'low',
                  title: 'Info Disclosure',
                  category: 'error_disclosure',
                  cweId: 'CWE-209',
                }),
              ],
              riskScore: 10,
              findingsHash: 'vuln-low',
            }),
          },
        ],
      });
      const diff = runDirectComparison(before, after);

      const secChanges = diff.behaviorChanges.filter((c) => c.aspect === 'security');
      expect(secChanges.length).toBeGreaterThan(0);
      expect(secChanges[0].severity).toBe('info');
    });

    it('resolved finding -> security, info', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            securityFingerprint: makeSecurityFingerprint({
              findings: [makeFinding()],
              riskScore: 85,
              findingsHash: 'vuln1',
            }),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [{ ...BASE_TOOL, securityFingerprint: makeSecurityFingerprint() }],
      });
      const diff = runDirectComparison(before, after);

      const secChanges = diff.behaviorChanges.filter((c) => c.aspect === 'security');
      expect(secChanges.length).toBeGreaterThan(0);
      expect(secChanges[0].severity).toBe('info');
    });

    it('no security data -> no security changes', () => {
      const before = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
      const after = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
      const diff = runDirectComparison(before, after);

      const secChanges = diff.behaviorChanges.filter((c) => c.aspect === 'security');
      expect(secChanges).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Workflow changes
  // -------------------------------------------------------------------------

  describe('Workflow changes', () => {
    it('workflow succeeded -> failed -> error_handling, breaking', () => {
      const before = createDirectBaseline({
        tools: [{ ...BASE_TOOL }],
        workflows: [{ id: 'wf1', name: 'weather-flow', succeeded: true }],
      });
      const after = createDirectBaseline({
        tools: [{ ...BASE_TOOL }],
        workflows: [{ id: 'wf1', name: 'weather-flow', succeeded: false }],
      });
      const diff = runDirectComparison(before, after);

      const wfChanges = diff.behaviorChanges.filter((c) => c.aspect === 'error_handling');
      expect(wfChanges.length).toBeGreaterThan(0);
      expect(wfChanges[0].severity).toBe('breaking');
    });

    it('workflow failed -> succeeded -> error_handling, info', () => {
      const before = createDirectBaseline({
        tools: [{ ...BASE_TOOL }],
        workflows: [{ id: 'wf1', name: 'weather-flow', succeeded: false }],
      });
      const after = createDirectBaseline({
        tools: [{ ...BASE_TOOL }],
        workflows: [{ id: 'wf1', name: 'weather-flow', succeeded: true }],
      });
      const diff = runDirectComparison(before, after);

      const wfChanges = diff.behaviorChanges.filter((c) => c.aspect === 'error_handling');
      expect(wfChanges.length).toBeGreaterThan(0);
      expect(wfChanges[0].severity).toBe('info');
    });
  });

  // -------------------------------------------------------------------------
  // Remaining structural gaps
  // -------------------------------------------------------------------------

  describe('Remaining structural gaps', () => {
    describe('Prompt argument details', () => {
      it('argument description changed -> prompt, info', async () => {
        const before = baseConfig();
        const after = withPrompts(before, [
          {
            ...PROMPTS.summarize,
            arguments: PROMPTS.summarize.arguments!.map((a) =>
              a.name === 'text' ? { ...a, description: 'New description for text arg' } : a
            ),
          },
        ]);
        const diff = await runDriftComparison(before, after);

        const argDescChanges = diff.behaviorChanges.filter(
          (c) =>
            c.aspect === 'prompt' &&
            c.description.includes('argument') &&
            c.description.includes('description changed')
        );
        expect(argDescChanges.length).toBeGreaterThan(0);
        expect(argDescChanges[0].severity).toBe('info');
      });

      it('optional argument added -> prompt, info', async () => {
        const before = baseConfig();
        const after = withPrompts(before, [
          {
            ...PROMPTS.summarize,
            arguments: [
              ...PROMPTS.summarize.arguments!,
              { name: 'style', description: 'Summary style', required: false },
            ],
          },
        ]);
        const diff = await runDriftComparison(before, after);

        const argAddedChanges = diff.behaviorChanges.filter(
          (c) =>
            c.aspect === 'prompt' &&
            c.description.includes('argument') &&
            c.description.includes('added') &&
            c.description.includes('style')
        );
        expect(argAddedChanges.length).toBeGreaterThan(0);
        expect(argAddedChanges[0].severity).toBe('info');
      });
    });

    describe('Resource details', () => {
      it('resource name changed -> resource, info', async () => {
        const before = baseConfig();
        const after = withResources(before, [{ ...RESOURCES.readme, name: 'README-v2' }]);
        const diff = await runDriftComparison(before, after);

        const nameChanges = diff.behaviorChanges.filter(
          (c) => c.aspect === 'resource' && c.description.includes('name changed')
        );
        expect(nameChanges.length).toBeGreaterThan(0);
        expect(nameChanges[0].severity).toBe('info');
      });

      it('resource title changed -> resource, info (protocol 2025-03-26+)', async () => {
        const before = withResources(withProtocolVersion(baseConfig(), '2025-03-26'), [
          { ...RESOURCES.readme, title: 'Project Readme' },
        ]);
        const after = withResources(before, [{ ...RESOURCES.readme, title: 'Updated Readme V2' }]);
        const diff = await runDriftComparison(before, after);

        const titleChanges = diff.behaviorChanges.filter(
          (c) => c.aspect === 'resource' && c.description.includes('title changed')
        );
        expect(titleChanges.length).toBeGreaterThan(0);
        expect(titleChanges[0].severity).toBe('info');
      });

      it('resource audience annotation changed -> resource_annotations, warning', () => {
        const before = createDirectBaseline({
          protocolVersion: '2025-03-26',
          resources: [
            {
              uri: 'file:///docs/README.md',
              name: 'README',
              description: 'Project README',
              mimeType: 'text/markdown',
              annotations: { audience: ['developer'] },
            },
          ],
        });
        const after = createDirectBaseline({
          protocolVersion: '2025-03-26',
          resources: [
            {
              uri: 'file:///docs/README.md',
              name: 'README',
              description: 'Project README',
              mimeType: 'text/markdown',
              annotations: { audience: ['developer', 'admin'] },
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        const annoChanges = diff.behaviorChanges.filter(
          (c) => c.aspect === 'resource_annotations' && c.description.includes('audience')
        );
        expect(annoChanges.length).toBeGreaterThan(0);
        expect(annoChanges[0].severity).toBe('warning');
      });

      it('resource size annotation changed -> resource_annotations, info', () => {
        const before = createDirectBaseline({
          protocolVersion: '2025-03-26',
          resources: [
            {
              uri: 'file:///docs/README.md',
              name: 'README',
              description: 'Project README',
              mimeType: 'text/markdown',
              size: 1024,
            },
          ],
        });
        const after = createDirectBaseline({
          protocolVersion: '2025-03-26',
          resources: [
            {
              uri: 'file:///docs/README.md',
              name: 'README',
              description: 'Project README',
              mimeType: 'text/markdown',
              size: 2048,
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        const sizeChanges = diff.behaviorChanges.filter(
          (c) => c.aspect === 'resource_annotations' && c.description.includes('size')
        );
        expect(sizeChanges.length).toBeGreaterThan(0);
        expect(sizeChanges[0].severity).toBe('info');
      });
    });

    describe('Template details', () => {
      it('template MIME type changed -> resource_template, info', async () => {
        const before = baseConfig();
        const after = withResourceTemplates(before, [
          { ...TEMPLATES.fileTemplate, mimeType: 'application/json' },
        ]);
        const diff = await runDriftComparison(before, after);

        const mimeChanges = diff.behaviorChanges.filter(
          (c) => c.aspect === 'resource_template' && c.description.includes('mime type changed')
        );
        expect(mimeChanges.length).toBeGreaterThan(0);
        expect(mimeChanges[0].severity).toBe('info');
      });

      it('template title changed -> resource_template, info (protocol 2025-03-26+)', async () => {
        const before = withResourceTemplates(withProtocolVersion(baseConfig(), '2025-03-26'), [
          { ...TEMPLATES.fileTemplate, title: 'Docs Template' },
        ]);
        const after = withResourceTemplates(before, [
          { ...TEMPLATES.fileTemplate, title: 'Updated Docs Template' },
        ]);
        const diff = await runDriftComparison(before, after);

        const titleChanges = diff.behaviorChanges.filter(
          (c) => c.aspect === 'resource_template' && c.description.includes('title changed')
        );
        expect(titleChanges.length).toBeGreaterThan(0);
        expect(titleChanges[0].severity).toBe('info');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Aggregate reports
  // -------------------------------------------------------------------------

  describe('Aggregate reports', () => {
    describe('Performance regression report', () => {
      it('regression >10% -> performanceReport.hasRegressions=true', () => {
        const before = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              baselineP50Ms: 100,
              baselineP95Ms: 200,
              performanceConfidence: makePerformanceConfidence(),
            },
          ],
        });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              baselineP50Ms: 150, // 50% regression
              baselineP95Ms: 300,
              performanceConfidence: makePerformanceConfidence(),
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.performanceReport).toBeDefined();
        expect(diff.performanceReport!.hasRegressions).toBe(true);
        expect(diff.performanceReport!.regressionCount).toBeGreaterThan(0);
      });

      it('improvement detected -> performanceReport.improvementCount > 0', () => {
        const before = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              baselineP50Ms: 200,
              baselineP95Ms: 400,
              performanceConfidence: makePerformanceConfidence(),
            },
          ],
        });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              baselineP50Ms: 100, // 50% faster
              baselineP95Ms: 200,
              performanceConfidence: makePerformanceConfidence(),
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.performanceReport).toBeDefined();
        expect(diff.performanceReport!.improvementCount).toBeGreaterThan(0);
      });

      it('confidence degraded -> performanceReport.confidenceChanges populated', () => {
        const before = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              baselineP50Ms: 100,
              baselineP95Ms: 200,
              performanceConfidence: makePerformanceConfidence({ confidenceLevel: 'high' }),
            },
          ],
        });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              baselineP50Ms: 100,
              baselineP95Ms: 200,
              performanceConfidence: makePerformanceConfidence({ confidenceLevel: 'low' }),
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.performanceReport).toBeDefined();
        expect(diff.performanceReport!.confidenceChanges).toBeDefined();
        expect(diff.performanceReport!.confidenceChanges!.length).toBeGreaterThan(0);
        expect(diff.performanceReport!.confidenceChanges![0].degraded).toBe(true);
      });

      it('low confidence tool -> performanceReport.lowConfidenceTools populated', () => {
        const before = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              baselineP50Ms: 100,
              baselineP95Ms: 200,
              performanceConfidence: makePerformanceConfidence({ confidenceLevel: 'high' }),
            },
          ],
        });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              baselineP50Ms: 100,
              baselineP95Ms: 200,
              performanceConfidence: makePerformanceConfidence({ confidenceLevel: 'low' }),
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.performanceReport).toBeDefined();
        expect(diff.performanceReport!.lowConfidenceTools).toBeDefined();
        expect(diff.performanceReport!.lowConfidenceTools).toContain('get_weather');
      });

      it('no performance data -> performanceReport undefined', () => {
        const before = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
        const after = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
        const diff = runDirectComparison(before, after);

        expect(diff.performanceReport).toBeUndefined();
      });
    });

    describe('Security report', () => {
      it('new findings aggregated -> securityReport.newFindings populated', () => {
        const before = createDirectBaseline({
          tools: [{ ...BASE_TOOL, securityFingerprint: makeSecurityFingerprint() }],
        });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              securityFingerprint: makeSecurityFingerprint({
                findings: [makeFinding()],
                riskScore: 85,
                findingsHash: 'vuln1',
              }),
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.securityReport).toBeDefined();
        expect(diff.securityReport!.newFindings.length).toBeGreaterThan(0);
      });

      it('resolved findings tracked -> securityReport.resolvedFindings populated', () => {
        const before = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              securityFingerprint: makeSecurityFingerprint({
                findings: [makeFinding()],
                riskScore: 85,
                findingsHash: 'vuln1',
              }),
            },
          ],
        });
        const after = createDirectBaseline({
          tools: [{ ...BASE_TOOL, securityFingerprint: makeSecurityFingerprint() }],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.securityReport).toBeDefined();
        expect(diff.securityReport!.resolvedFindings.length).toBeGreaterThan(0);
      });

      it('risk score change -> securityReport.riskScoreChange correct', () => {
        const before = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              securityFingerprint: makeSecurityFingerprint({ riskScore: 10 }),
            },
          ],
        });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              securityFingerprint: makeSecurityFingerprint({
                findings: [makeFinding()],
                riskScore: 85,
                findingsHash: 'vuln1',
              }),
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.securityReport).toBeDefined();
        expect(diff.securityReport!.riskScoreChange).toBeGreaterThan(0);
      });

      it('no security data -> securityReport undefined', () => {
        const before = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
        const after = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
        const diff = runDirectComparison(before, after);

        expect(diff.securityReport).toBeUndefined();
      });
    });

    describe('Schema evolution report', () => {
      it('unstable schemas tracked -> schemaEvolutionReport.unstableCount > 0', () => {
        const before = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              responseSchemaEvolution: makeSchemaEvolution({
                isStable: false,
                inconsistentFields: ['data'],
              }),
            },
          ],
        });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              responseSchemaEvolution: makeSchemaEvolution({
                isStable: false,
                inconsistentFields: ['data'],
              }),
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.schemaEvolutionReport).toBeDefined();
        expect(diff.schemaEvolutionReport!.unstableCount).toBeGreaterThan(0);
      });

      it('structure changes counted -> schemaEvolutionReport.structureChangedCount > 0', () => {
        const before = createDirectBaseline({
          tools: [{ ...BASE_TOOL, responseSchemaEvolution: makeSchemaEvolution() }],
        });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              responseSchemaEvolution: makeSchemaEvolution({
                currentHash: 'evo-hash-2',
                history: [
                  {
                    hash: 'evo-hash-2',
                    schema: {
                      type: 'object',
                      properties: { status: { type: 'string' } },
                      required: ['status'],
                    },
                    observedAt: new Date(),
                    sampleCount: 5,
                  },
                ],
              }),
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.schemaEvolutionReport).toBeDefined();
        expect(diff.schemaEvolutionReport!.structureChangedCount).toBeGreaterThan(0);
      });

      it('breaking changes flagged -> schemaEvolutionReport.hasBreakingChanges', () => {
        const before = createDirectBaseline({
          tools: [{ ...BASE_TOOL, responseSchemaEvolution: makeSchemaEvolution() }],
        });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              responseSchemaEvolution: makeSchemaEvolution({
                currentHash: 'evo-hash-2',
                history: [
                  {
                    hash: 'evo-hash-2',
                    schema: {
                      type: 'object',
                      properties: { status: { type: 'string' } },
                      required: ['status'],
                    },
                    observedAt: new Date(),
                    sampleCount: 5,
                  },
                ],
              }),
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.schemaEvolutionReport).toBeDefined();
        expect(diff.schemaEvolutionReport!.hasBreakingChanges).toBe(true);
      });

      it('no schema evolution data -> schemaEvolutionReport undefined', () => {
        const before = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
        const after = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
        const diff = runDirectComparison(before, after);

        expect(diff.schemaEvolutionReport).toBeUndefined();
      });
    });

    describe('Error trend report', () => {
      it('new error categories -> errorTrendReport.newCategories populated', () => {
        const before = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              errorPatterns: [
                {
                  category: 'validation',
                  patternHash: 'val-hash-1',
                  example: 'Error: Invalid location parameter',
                  count: 3,
                },
              ],
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.errorTrendReport).toBeDefined();
        expect(diff.errorTrendReport!.newCategories).toContain('validation');
      });

      it('resolved error categories -> errorTrendReport.resolvedCategories populated', () => {
        const before = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              errorPatterns: [
                {
                  category: 'validation',
                  patternHash: 'val-hash-1',
                  example: 'Error: Invalid location parameter',
                  count: 3,
                },
              ],
            },
          ],
        });
        const after = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
        const diff = runDirectComparison(before, after);

        expect(diff.errorTrendReport).toBeDefined();
        expect(diff.errorTrendReport!.resolvedCategories).toContain('validation');
      });

      it('increasing trend -> errorTrendReport.increasingCategories populated', () => {
        const before = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              errorPatterns: [
                {
                  category: 'validation',
                  patternHash: 'val-hash-1',
                  example: 'Error: Invalid location',
                  count: 2,
                },
              ],
            },
          ],
        });
        const after = createDirectBaseline({
          tools: [
            {
              ...BASE_TOOL,
              errorPatterns: [
                {
                  category: 'validation',
                  patternHash: 'val-hash-1',
                  example: 'Error: Invalid location',
                  count: 10, // 5x increase
                },
              ],
            },
          ],
        });
        const diff = runDirectComparison(before, after);

        expect(diff.errorTrendReport).toBeDefined();
        expect(diff.errorTrendReport!.increasingCategories).toContain('validation');
      });

      it('no error data -> errorTrendReport undefined', () => {
        const before = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
        const after = createDirectBaseline({ tools: [{ ...BASE_TOOL }] });
        const diff = runDirectComparison(before, after);

        expect(diff.errorTrendReport).toBeUndefined();
      });
    });

    describe('Documentation score report', () => {
      it('score improved -> documentationScoreReport.improved=true', () => {
        const before = createDirectBaseline({
          tools: [{ ...BASE_TOOL }],
          documentationScore: { overallScore: 60, grade: 'D', issueCount: 5, toolCount: 1 },
        });
        const after = createDirectBaseline({
          tools: [{ ...BASE_TOOL }],
          documentationScore: { overallScore: 90, grade: 'A', issueCount: 1, toolCount: 1 },
        });
        const diff = runDirectComparison(before, after);

        expect(diff.documentationScoreReport).toBeDefined();
        expect(diff.documentationScoreReport!.improved).toBe(true);
      });

      it('score degraded -> documentationScoreReport.degraded=true', () => {
        const before = createDirectBaseline({
          tools: [{ ...BASE_TOOL }],
          documentationScore: { overallScore: 90, grade: 'A', issueCount: 1, toolCount: 1 },
        });
        const after = createDirectBaseline({
          tools: [{ ...BASE_TOOL }],
          documentationScore: { overallScore: 50, grade: 'F', issueCount: 8, toolCount: 1 },
        });
        const diff = runDirectComparison(before, after);

        expect(diff.documentationScoreReport).toBeDefined();
        expect(diff.documentationScoreReport!.degraded).toBe(true);
      });

      it('grade change detected -> report shows grade transition', () => {
        const before = createDirectBaseline({
          tools: [{ ...BASE_TOOL }],
          documentationScore: { overallScore: 75, grade: 'C', issueCount: 3, toolCount: 1 },
        });
        const after = createDirectBaseline({
          tools: [{ ...BASE_TOOL }],
          documentationScore: { overallScore: 90, grade: 'A', issueCount: 1, toolCount: 1 },
        });
        const diff = runDirectComparison(before, after);

        expect(diff.documentationScoreReport).toBeDefined();
        expect(diff.documentationScoreReport!.previousGrade).toBe('C');
        expect(diff.documentationScoreReport!.currentGrade).toBe('A');
      });

      it('no documentation data -> documentationScoreReport undefined', () => {
        // Use tools with no descriptions to avoid auto-score calculation
        const before = createDirectBaseline({ tools: [] });
        const after = createDirectBaseline({ tools: [] });
        const diff = runDirectComparison(before, after);

        expect(diff.documentationScoreReport).toBeUndefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // CompareOptions ignore flags
  // -------------------------------------------------------------------------

  describe('CompareOptions ignore flags', () => {
    it('ignoreResponseStructureChanges -> suppresses response_structure + response_schema_evolution', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseFingerprint: makeFingerprint(),
            responseSchemaEvolution: makeSchemaEvolution(),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            responseFingerprint: makeFingerprint({
              structureHash: 'changed-hash',
              contentType: 'text',
              fields: undefined,
            }),
            responseSchemaEvolution: makeSchemaEvolution({
              currentHash: 'evo-hash-2',
              history: [
                {
                  hash: 'evo-hash-2',
                  schema: {
                    type: 'object',
                    properties: { status: { type: 'string' } },
                    required: ['status'],
                  },
                  observedAt: new Date(),
                  sampleCount: 5,
                },
              ],
            }),
          },
        ],
      });

      const diff = runDirectComparison(before, after, {
        ignoreResponseStructureChanges: true,
      });

      const fpChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'response_structure' || c.aspect === 'response_schema_evolution'
      );
      expect(fpChanges).toHaveLength(0);
    });

    it('ignoreErrorPatternChanges -> suppresses error_pattern + errorTrendReport', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            errorPatterns: [
              {
                category: 'validation',
                patternHash: 'val-hash-1',
                example: 'Error: Invalid param',
                count: 2,
              },
            ],
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            errorPatterns: [
              {
                category: 'not_found',
                patternHash: 'nf-hash-1',
                example: 'Error: Not found',
                count: 3,
              },
            ],
          },
        ],
      });

      const diff = runDirectComparison(before, after, {
        ignoreErrorPatternChanges: true,
      });

      const errChanges = diff.behaviorChanges.filter((c) => c.aspect === 'error_pattern');
      expect(errChanges).toHaveLength(0);
      expect(diff.errorTrendReport).toBeUndefined();
    });

    it('ignoreSecurityChanges -> suppresses security + securityReport', () => {
      const before = createDirectBaseline({
        tools: [{ ...BASE_TOOL, securityFingerprint: makeSecurityFingerprint() }],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            securityFingerprint: makeSecurityFingerprint({
              findings: [makeFinding()],
              riskScore: 85,
              findingsHash: 'vuln1',
            }),
          },
        ],
      });

      const diff = runDirectComparison(before, after, {
        ignoreSecurityChanges: true,
      });

      const secChanges = diff.behaviorChanges.filter((c) => c.aspect === 'security');
      expect(secChanges).toHaveLength(0);
      expect(diff.securityReport).toBeUndefined();
    });

    it('custom performanceThreshold -> higher threshold prevents regression detection', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            baselineP50Ms: 100,
            baselineP95Ms: 200,
            performanceConfidence: makePerformanceConfidence(),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            baselineP50Ms: 115, // 15% regression
            baselineP95Ms: 230,
            performanceConfidence: makePerformanceConfidence(),
          },
        ],
      });

      // Default threshold is 10%, so this would normally be flagged
      // With 50% threshold, it should NOT be flagged
      const diff = runDirectComparison(before, after, {
        performanceThreshold: 0.5,
      });

      expect(diff.performanceReport).toBeDefined();
      expect(diff.performanceReport!.hasRegressions).toBe(false);
    });

    it('performanceThreshold=0 -> everything counts as regression', () => {
      const before = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            baselineP50Ms: 100,
            baselineP95Ms: 200,
            performanceConfidence: makePerformanceConfidence(),
          },
        ],
      });
      const after = createDirectBaseline({
        tools: [
          {
            ...BASE_TOOL,
            baselineP50Ms: 101, // 1% regression - tiny
            baselineP95Ms: 202,
            performanceConfidence: makePerformanceConfidence(),
          },
        ],
      });

      const diff = runDirectComparison(before, after, {
        performanceThreshold: 0,
      });

      expect(diff.performanceReport).toBeDefined();
      expect(diff.performanceReport!.hasRegressions).toBe(true);
    });
  });
});
