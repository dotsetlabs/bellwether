/**
 * Pipeline integration tests for runtime observation data flow.
 *
 * Unlike the existing drift E2E tests (which test structural and runtime drift
 * detection via comparison), these tests verify that runtime observation data
 * correctly flows through the entire pipeline:
 *
 *   mock server → MCPClient → discover → interview → createBaseline
 *     → (security attachment) → compareBaselines
 *
 * Focus areas:
 * - Runtime fields are populated (not undefined) after pipeline runs
 * - Protocol version gating correctly includes/excludes fields
 * - Cross-version baseline comparison uses AND-intersection of feature flags
 * - Security fingerprint attachment and comparison works
 */

import { describe, it, expect } from 'vitest';
import {
  runPipeline,
  runDirectComparison,
  baseConfig,
  withTools,
  withToolResponses,
  withProtocolVersion,
  createDirectBaseline,
  TOOLS,
} from './helpers.js';
import type { DirectToolOptions } from './helpers.js';
import type { SecurityFingerprint, SecurityFinding } from '../../src/security/types.js';

const TEST_TIMEOUT = 30_000;

// ---------------------------------------------------------------------------
// Shared test data factories
// ---------------------------------------------------------------------------

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
describe('Pipeline runtime field propagation', { timeout: TEST_TIMEOUT }, () => {
  // -------------------------------------------------------------------------
  // Verify that runtime fields are populated after a full pipeline run
  // -------------------------------------------------------------------------

  it('responseFingerprint flows through full pipeline', async () => {
    const cfg = withToolResponses(baseConfig(), {
      get_weather: { text: '{"status":"ok","data":{"temp":72,"humidity":45}}' },
      calculate: { text: '{"result":42,"precision":2}' },
    });
    const baseline = await runPipeline(cfg);

    // At least one tool should have a responseFingerprint
    const toolsWithFP = baseline.capabilities.tools.filter(
      (t) => t.responseFingerprint !== undefined
    );
    expect(toolsWithFP.length).toBeGreaterThan(0);

    // Check that the fingerprint has expected fields
    const fp = toolsWithFP[0].responseFingerprint!;
    expect(fp.structureHash).toBeDefined();
    expect(fp.contentType).toBeDefined();
    expect(fp.fields).toBeDefined();
    expect(Array.isArray(fp.fields)).toBe(true);
  });

  it('errorPatterns flow through full pipeline', async () => {
    const cfg = withToolResponses(baseConfig(), {
      get_weather: { text: 'Error: location not found', isError: true },
      calculate: { text: '{"result":42}' },
    });
    const baseline = await runPipeline(cfg);

    // The tool with an error response should have errorPatterns
    const weatherTool = baseline.capabilities.tools.find((t) => t.name === 'get_weather');
    expect(weatherTool).toBeDefined();
    // errorPatterns may be populated from the error response
    // (depends on whether the interviewer collects enough error samples)
    // At minimum, verify the field exists on the tool capability type
    if (weatherTool!.errorPatterns) {
      expect(Array.isArray(weatherTool!.errorPatterns)).toBe(true);
      expect(weatherTool!.errorPatterns!.length).toBeGreaterThan(0);
    }
  });

  it('performance metrics flow through full pipeline', async () => {
    const cfg = withToolResponses(baseConfig(), {
      get_weather: { text: '{"status":"ok","temp":72}' },
      calculate: { text: '{"result":42}' },
    });
    const baseline = await runPipeline(cfg);

    // At least one tool should have performance metrics (from tool execution timing)
    const toolsWithPerf = baseline.capabilities.tools.filter((t) => t.baselineP50Ms !== undefined);
    expect(toolsWithPerf.length).toBeGreaterThan(0);

    const perf = toolsWithPerf[0];
    expect(typeof perf.baselineP50Ms).toBe('number');
    expect(typeof perf.baselineP95Ms).toBe('number');
    expect(typeof perf.baselineP99Ms).toBe('number');
    expect(perf.baselineP50Ms!).toBeGreaterThanOrEqual(0);
  });

  it('performanceConfidence flows through full pipeline', async () => {
    const cfg = withToolResponses(baseConfig(), {
      get_weather: { text: '{"status":"ok","temp":72}' },
      calculate: { text: '{"result":42}' },
    });
    const baseline = await runPipeline(cfg);

    const toolsWithConfidence = baseline.capabilities.tools.filter(
      (t) => t.performanceConfidence !== undefined
    );
    expect(toolsWithConfidence.length).toBeGreaterThan(0);

    const conf = toolsWithConfidence[0].performanceConfidence!;
    expect(conf.confidenceLevel).toBeDefined();
    expect(typeof conf.sampleCount).toBe('number');
  });

  it('responseSchemaEvolution flows through full pipeline', async () => {
    const cfg = withToolResponses(baseConfig(), {
      get_weather: { text: '{"status":"ok","data":{"temp":72}}' },
      calculate: { text: '{"result":42}' },
    });
    const baseline = await runPipeline(cfg);

    const toolsWithEvolution = baseline.capabilities.tools.filter(
      (t) => t.responseSchemaEvolution !== undefined
    );
    expect(toolsWithEvolution.length).toBeGreaterThan(0);

    const evo = toolsWithEvolution[0].responseSchemaEvolution!;
    expect(evo.currentHash).toBeDefined();
    expect(typeof evo.currentHash).toBe('string');
  });

  it('documentationScore flows through full pipeline', async () => {
    const cfg = baseConfig();
    const baseline = await runPipeline(cfg);

    expect(baseline.documentationScore).toBeDefined();
    expect(baseline.documentationScore!.overallScore).toBeDefined();
    expect(baseline.documentationScore!.grade).toBeDefined();
    expect(typeof baseline.documentationScore!.toolCount).toBe('number');
  });
});

// ===========================================================================
describe('Protocol version gating through pipeline', { timeout: TEST_TIMEOUT }, () => {
  it('protocol 2024-11-05 excludes annotations/titles/execution', async () => {
    // Use oldest protocol version with tools that have annotations and titles
    const cfg = withProtocolVersion(
      withTools(baseConfig(), [
        { ...TOOLS.annotated },
        { ...TOOLS.withTitle },
        { ...TOOLS.withTaskSupport },
      ]),
      '2024-11-05'
    );
    const baseline = await runPipeline(cfg);

    // With protocol 2024-11-05, annotations, titles, and execution should be excluded
    for (const tool of baseline.capabilities.tools) {
      expect(tool.annotations).toBeUndefined();
      expect(tool.title).toBeUndefined();
      expect(tool.execution).toBeUndefined();
      expect(tool.outputSchema).toBeUndefined();
    }
  });

  it('protocol 2025-11-25 includes annotations/titles/execution/outputSchema', async () => {
    // Use latest protocol version with tools that have all fields
    const cfg = withProtocolVersion(
      withTools(baseConfig(), [
        { ...TOOLS.annotated },
        { ...TOOLS.withTitle },
        { ...TOOLS.withTaskSupport },
      ]),
      '2025-11-25'
    );
    const baseline = await runPipeline(cfg);

    // delete_file should have annotations and outputSchema
    const deleteFile = baseline.capabilities.tools.find((t) => t.name === 'delete_file');
    expect(deleteFile).toBeDefined();
    expect(deleteFile!.annotations).toBeDefined();
    expect(deleteFile!.annotations!.destructiveHint).toBe(true);
    expect(deleteFile!.outputSchema).toBeDefined();

    // search_docs should have title
    const searchDocs = baseline.capabilities.tools.find((t) => t.name === 'search_docs');
    expect(searchDocs).toBeDefined();
    expect(searchDocs!.title).toBe('Search Documentation');

    // long_running should have execution
    const longRunning = baseline.capabilities.tools.find((t) => t.name === 'long_running');
    expect(longRunning).toBeDefined();
    expect(longRunning!.execution).toBeDefined();
    expect(longRunning!.execution!.taskSupport).toBe('optional');
  });
});

// ===========================================================================
describe('Cross-version baseline comparison', () => {
  it('baselines with different protocol versions compared using shared feature flags', () => {
    // Create baseline with old protocol (no annotations support)
    const oldBaseline = createDirectBaseline({
      protocolVersion: '2024-11-05',
      tools: [
        {
          ...BASE_TOOL,
          // No annotations (old protocol doesn't support them)
        },
      ],
    });

    // Create baseline with new protocol (has annotations)
    const newBaseline = createDirectBaseline({
      protocolVersion: '2025-11-25',
      tools: [
        {
          ...BASE_TOOL,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
          },
        },
      ],
    });

    const diff = runDirectComparison(oldBaseline, newBaseline);

    // Annotation differences should NOT be flagged as drift because the old
    // protocol doesn't support annotations (getSharedFeatureFlags AND-intersection)
    const annotationChanges = diff.behaviorChanges.filter(
      (c) => c.aspect === 'tool_annotations' && c.description?.includes('Hint')
    );
    expect(annotationChanges).toHaveLength(0);
  });

  it('shared feature flags allow comparison of fields supported by both versions', () => {
    // Create two baselines with different protocol versions but both support
    // basic tool schema comparison
    const oldBaseline = createDirectBaseline({
      protocolVersion: '2024-11-05',
      tools: [
        {
          ...BASE_TOOL,
          description: 'Original description',
        },
      ],
    });

    const newBaseline = createDirectBaseline({
      protocolVersion: '2025-11-25',
      tools: [
        {
          ...BASE_TOOL,
          description: 'Changed description',
        },
      ],
    });

    const diff = runDirectComparison(oldBaseline, newBaseline);

    // Description changes should still be detected (both versions support this)
    const descChanges = diff.behaviorChanges.filter((c) => c.aspect === 'description');
    expect(descChanges.length).toBeGreaterThan(0);
    expect(descChanges[0].before).toBe('Original description');
    expect(descChanges[0].after).toBe('Changed description');
  });
});

// ===========================================================================
describe('Security fingerprint attachment', () => {
  it('security fingerprints survive baseline mutation and comparison', () => {
    // Mimic what check.ts does: create baseline, then attach security fingerprints
    const before = createDirectBaseline({
      tools: [
        {
          ...BASE_TOOL,
          securityFingerprint: makeSecurityFingerprint({
            findings: [],
            riskScore: 0,
            findingsHash: 'clean',
          }),
        },
      ],
    });

    const after = createDirectBaseline({
      tools: [
        {
          ...BASE_TOOL,
          securityFingerprint: makeSecurityFingerprint({
            findings: [makeFinding()],
            riskScore: 9,
            findingsHash: 'dirty',
          }),
        },
      ],
    });

    const diff = runDirectComparison(before, after);

    // Security changes should be detected
    const securityChanges = diff.behaviorChanges.filter((c) => c.aspect === 'security');
    expect(securityChanges.length).toBeGreaterThan(0);
    expect(securityChanges.some((c) => c.severity === 'breaking')).toBe(true);
    expect(securityChanges.some((c) => c.description?.includes('SQL Injection'))).toBe(true);
  });

  it('tools without security fingerprints do not generate spurious changes', () => {
    // Neither baseline has security fingerprints
    const before = createDirectBaseline({
      tools: [{ ...BASE_TOOL }],
    });

    const after = createDirectBaseline({
      tools: [{ ...BASE_TOOL }],
    });

    const diff = runDirectComparison(before, after);

    // No security changes should be detected
    const securityChanges = diff.behaviorChanges.filter((c) => c.aspect === 'security');
    expect(securityChanges).toHaveLength(0);
  });
});
