/**
 * Unit tests for baseline/saver.ts
 *
 * Tests baseline save/load operations, validation, and error handling.
 * Following TDD principles - testing expected behavior based on rational assumptions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  verifyBaselineHash,
  recalculateBaselineHash,
  baselineExists,
  acceptDrift,
  hasAcceptance,
  clearAcceptance,
} from '../../src/baseline/saver.js';
import { compareBaselines } from '../../src/baseline/comparator.js';
import type { InterviewResult, ToolProfile } from '../../src/interview/types.js';
import { PAYLOAD_LIMITS } from '../../src/constants.js';

/**
 * Helper to create a minimal interview result for testing.
 */
function createTestInterviewResult(options: {
  serverName?: string;
  tools?: Partial<ToolProfile>[];
}): InterviewResult {
  const tools = (options.tools || []).map((t) => ({
    name: t.name || 'test_tool',
    description: t.description ?? 'A test tool',
    interactions: t.interactions || [],
    behavioralNotes: t.behavioralNotes || [],
    limitations: t.limitations || [],
    securityNotes: t.securityNotes || [],
  })) as ToolProfile[];

  const discoveryTools = tools.map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: { type: 'object', properties: {} },
  }));

  return {
    discovery: {
      serverInfo: {
        name: options.serverName || 'test-server',
        version: '1.0.0',
      },
      protocolVersion: '0.1.0',
      capabilities: {
        tools: {},
        prompts: undefined,
        resources: undefined,
        logging: undefined,
      },
      tools: discoveryTools,
      prompts: [],
      resources: [],
      resourceTemplates: [],
      timestamp: new Date(),
      serverCommand: 'npx test-server',
      serverArgs: [],
    },
    toolProfiles: tools,
    summary: 'Test interview completed',
    limitations: [],
    recommendations: [],
    metadata: {
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 1000,
      toolCallCount: 1,
      errorCount: 0,
      model: 'check',
    },
  };
}

describe('saver', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `bellwether-saver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createBaseline', () => {
    it('should create a baseline from interview result', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'my_tool', description: 'My test tool' }],
      });

      const baseline = createBaseline(result, 'npx my-server');

      expect(baseline.version).toBeDefined();
      expect(baseline.metadata.serverCommand).toBe('npx my-server');
      expect(baseline.server.name).toBe('test-server');
      expect(baseline.hash).toBeDefined();
    });

    it('should include all tool profiles', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool_a' }, { name: 'tool_b' }, { name: 'tool_c' }],
      });

      const baseline = createBaseline(result, 'npx test');

      expect(baseline.capabilities.tools).toHaveLength(3);
      expect(baseline.toolProfiles).toHaveLength(3);
    });
  });

  describe('saveBaseline / loadBaseline roundtrip', () => {
    it('should save and load baseline correctly', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'test_tool' }],
      });
      const baseline = createBaseline(result, 'npx test');
      const path = join(testDir, 'baseline.json');

      saveBaseline(baseline, path);
      const loaded = loadBaseline(path);

      expect(loaded.version).toBe(baseline.version);
      expect(loaded.server.name).toBe(baseline.server.name);
      expect(loaded.metadata.serverCommand).toBe(baseline.metadata.serverCommand);
    });

    it('should preserve tool capabilities through save/load', () => {
      const result = createTestInterviewResult({
        tools: [
          { name: 'tool_a', description: 'Tool A description' },
          { name: 'tool_b', description: 'Tool B description' },
        ],
      });
      const baseline = createBaseline(result, 'npx test');
      const path = join(testDir, 'baseline.json');

      saveBaseline(baseline, path);
      const loaded = loadBaseline(path);

      expect(loaded.capabilities.tools).toHaveLength(2);
      expect(loaded.capabilities.tools[0].name).toBe('tool_a');
      expect(loaded.capabilities.tools[1].name).toBe('tool_b');
    });
  });

  describe('loadBaseline error handling', () => {
    it('should throw for non-existent file', () => {
      const fakePath = join(testDir, 'does-not-exist.json');

      expect(() => loadBaseline(fakePath)).toThrow('Baseline file not found');
    });

    it('should throw for invalid JSON', () => {
      const path = join(testDir, 'invalid.json');
      writeFileSync(path, '{ not valid json }');

      expect(() => loadBaseline(path)).toThrow('Invalid JSON');
    });

    it('should throw for empty file', () => {
      const path = join(testDir, 'empty.json');
      writeFileSync(path, '');

      expect(() => loadBaseline(path)).toThrow(); // Invalid JSON
    });

    it('should throw for file exceeding size limit', () => {
      const path = join(testDir, 'huge.json');
      // Create content that exceeds the limit
      const hugeContent = `{"data":"${'x'.repeat(PAYLOAD_LIMITS.MAX_BASELINE_SIZE + 1000)}"}`;
      writeFileSync(path, hugeContent);

      expect(() => loadBaseline(path)).toThrow('too large');
    });

    it('should throw for schema validation errors', () => {
      const path = join(testDir, 'bad-schema.json');
      // Valid JSON but invalid baseline schema
      writeFileSync(
        path,
        JSON.stringify({
          version: '1.0.0',
          // Missing required fields
        })
      );

      expect(() => loadBaseline(path)).toThrow('Invalid baseline format');
    });

    it('should throw for tampered baseline when integrity check enabled', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      const path = join(testDir, 'tampered.json');

      // Save and then tamper
      saveBaseline(baseline, path);
      const content = JSON.parse(readFileSync(path, 'utf-8'));
      content.server.name = 'tampered-name';
      writeFileSync(path, JSON.stringify(content, null, 2));

      expect(() => loadBaseline(path)).toThrow('hash verification failed');
    });

    it('should allow loading tampered baseline with skipIntegrityCheck', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      const path = join(testDir, 'tampered.json');

      // Save and then tamper
      saveBaseline(baseline, path);
      const content = JSON.parse(readFileSync(path, 'utf-8'));
      content.server.name = 'tampered-name';
      writeFileSync(path, JSON.stringify(content, null, 2));

      const loaded = loadBaseline(path, { skipIntegrityCheck: true });

      expect(loaded.server.name).toBe('tampered-name');
    });
  });

  describe('verifyBaselineHash', () => {
    it('should return true for valid baseline', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');

      expect(verifyBaselineHash(baseline)).toBe(true);
    });

    it('should return false for tampered baseline', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');

      // Tamper with the baseline
      const tampered = { ...baseline, server: { ...baseline.server, name: 'hacked' } };

      expect(verifyBaselineHash(tampered)).toBe(false);
    });

    it('should return false when hash is wrong', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');

      const tampered = { ...baseline, hash: 'wrong-hash' };

      expect(verifyBaselineHash(tampered)).toBe(false);
    });
  });

  describe('recalculateBaselineHash', () => {
    it('should calculate hash for baseline without hash', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');

      // Remove hash
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { hash: _hash, ...baselineWithoutHash } = baseline;

      const recalculated = recalculateBaselineHash(baselineWithoutHash);

      expect(recalculated.hash).toBeDefined();
      expect(verifyBaselineHash(recalculated)).toBe(true);
    });

    it('should produce same hash for same content', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { hash: _hash, ...baselineWithoutHash } = baseline;

      const first = recalculateBaselineHash(baselineWithoutHash);
      const second = recalculateBaselineHash(baselineWithoutHash);

      expect(first.hash).toBe(second.hash);
    });

    it('should produce different hash for different content', () => {
      const result1 = createTestInterviewResult({ tools: [{ name: 'tool_a' }] });
      const result2 = createTestInterviewResult({ tools: [{ name: 'tool_b' }] });
      const baseline1 = createBaseline(result1, 'npx test');
      const baseline2 = createBaseline(result2, 'npx test');

      expect(baseline1.hash).not.toBe(baseline2.hash);
    });
  });

  describe('baselineExists', () => {
    it('should return true for existing file', () => {
      const path = join(testDir, 'exists.json');
      writeFileSync(path, '{}');

      expect(baselineExists(path)).toBe(true);
    });

    it('should return false for non-existent file', () => {
      const path = join(testDir, 'does-not-exist.json');

      expect(baselineExists(path)).toBe(false);
    });

    it('should return false for directory', () => {
      // testDir is a directory, not a file
      expect(baselineExists(testDir)).toBe(false);
    });

    it('should return false for subdirectory', () => {
      const subdir = join(testDir, 'subdir');
      mkdirSync(subdir);

      expect(baselineExists(subdir)).toBe(false);
    });
  });

  describe('acceptDrift', () => {
    it('should add acceptance metadata to baseline', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      const diff = compareBaselines(baseline, baseline);

      const accepted = acceptDrift(baseline, diff, {
        reason: 'Intentional change',
        acceptedBy: 'developer@example.com',
      });

      expect(accepted.acceptance).toBeDefined();
      expect(accepted.acceptance?.reason).toBe('Intentional change');
      expect(accepted.acceptance?.acceptedBy).toBe('developer@example.com');
      expect(accepted.acceptance?.acceptedAt).toBeInstanceOf(Date);
    });

    it('should capture diff snapshot in acceptance', () => {
      const result1 = createTestInterviewResult({
        tools: [{ name: 'existing' }],
      });
      const result2 = createTestInterviewResult({
        tools: [{ name: 'existing' }, { name: 'new_tool' }],
      });
      const baseline1 = createBaseline(result1, 'npx test');
      const baseline2 = createBaseline(result2, 'npx test');
      const diff = compareBaselines(baseline1, baseline2);

      const accepted = acceptDrift(baseline2, diff);

      expect(accepted.acceptance?.acceptedDiff.toolsAdded).toContain('new_tool');
      expect(accepted.acceptance?.acceptedDiff.severity).toBe(diff.severity);
    });

    it('should recalculate hash after adding acceptance', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      const diff = compareBaselines(baseline, baseline);

      const accepted = acceptDrift(baseline, diff);

      expect(accepted.hash).not.toBe(baseline.hash);
      expect(verifyBaselineHash(accepted)).toBe(true);
    });

    it('should work without optional parameters', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      const diff = compareBaselines(baseline, baseline);

      const accepted = acceptDrift(baseline, diff);

      expect(accepted.acceptance).toBeDefined();
      expect(accepted.acceptance?.reason).toBeUndefined();
      expect(accepted.acceptance?.acceptedBy).toBeUndefined();
    });
  });

  describe('hasAcceptance', () => {
    it('should return true for baseline with acceptance', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      const diff = compareBaselines(baseline, baseline);
      const accepted = acceptDrift(baseline, diff);

      expect(hasAcceptance(accepted)).toBe(true);
    });

    it('should return false for baseline without acceptance', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');

      expect(hasAcceptance(baseline)).toBe(false);
    });
  });

  describe('clearAcceptance', () => {
    it('should remove acceptance metadata', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      const diff = compareBaselines(baseline, baseline);
      const accepted = acceptDrift(baseline, diff);

      expect(hasAcceptance(accepted)).toBe(true);

      const cleared = clearAcceptance(accepted);

      expect(hasAcceptance(cleared)).toBe(false);
      expect(cleared.acceptance).toBeUndefined();
    });

    it('should recalculate hash after clearing acceptance', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      const diff = compareBaselines(baseline, baseline);
      const accepted = acceptDrift(baseline, diff);

      const cleared = clearAcceptance(accepted);

      expect(cleared.hash).not.toBe(accepted.hash);
      expect(verifyBaselineHash(cleared)).toBe(true);
    });

    it('should preserve other baseline data', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'my_tool', description: 'Test tool' }],
        serverName: 'my-server',
      });
      const baseline = createBaseline(result, 'npx my-server');
      const diff = compareBaselines(baseline, baseline);
      const accepted = acceptDrift(baseline, diff, { reason: 'Test' });

      const cleared = clearAcceptance(accepted);

      expect(cleared.server.name).toBe('my-server');
      expect(cleared.capabilities.tools[0].name).toBe('my_tool');
      expect(cleared.metadata.serverCommand).toBe('npx my-server');
    });
  });

  describe('acceptance persistence', () => {
    it('should preserve acceptance through save/load', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      const diff = compareBaselines(baseline, baseline);
      const accepted = acceptDrift(baseline, diff, {
        reason: 'CI approved',
        acceptedBy: 'ci-bot',
      });
      const path = join(testDir, 'accepted.json');

      saveBaseline(accepted, path);
      // Load with skipIntegrityCheck because Zod schema reordering changes hash
      const loaded = loadBaseline(path, { skipIntegrityCheck: true });

      expect(loaded.acceptance).toBeDefined();
      expect(loaded.acceptance?.reason).toBe('CI approved');
      expect(loaded.acceptance?.acceptedBy).toBe('ci-bot');
    });

    it('should convert acceptedAt to Date when loading', () => {
      const result = createTestInterviewResult({ tools: [{ name: 'tool' }] });
      const baseline = createBaseline(result, 'npx test');
      const diff = compareBaselines(baseline, baseline);
      const accepted = acceptDrift(baseline, diff);
      const path = join(testDir, 'accepted.json');

      saveBaseline(accepted, path);
      const loaded = loadBaseline(path, { skipIntegrityCheck: true });

      expect(loaded.acceptance?.acceptedAt).toBeInstanceOf(Date);
    });
  });

  describe('full runtime field roundtrip', () => {
    it('should preserve all optional runtime fields through save/load', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'full_tool', description: 'Tool with all fields' }],
      });
      const baseline = createBaseline(result, 'npx test');

      // Manually populate ALL optional runtime fields on the first tool
      const tool = baseline.capabilities.tools[0];
      tool.responseFingerprint = {
        structureHash: 'fp-hash-123',
        contentType: 'object',
        fields: ['status', 'data', 'meta'],
        size: 'medium',
        isEmpty: false,
        sampleCount: 5,
        confidence: 0.95,
      };
      tool.inferredOutputSchema = {
        type: 'object',
        properties: {
          status: { type: 'string' },
          data: { type: 'object', properties: { value: { type: 'number' } } },
        },
        required: ['status'],
      };
      tool.errorPatterns = [
        {
          category: 'validation',
          patternHash: 'err-hash-1',
          example: 'Invalid input: missing field',
          count: 3,
        },
        {
          category: 'not_found',
          patternHash: 'err-hash-2',
          example: 'Resource not found',
          count: 1,
        },
      ];
      tool.responseSchemaEvolution = {
        currentHash: 'evo-hash-abc',
        history: [
          {
            hash: 'evo-hash-abc',
            schema: { type: 'object', properties: { status: { type: 'string' } } },
            observedAt: '2025-01-01T00:00:00.000Z',
            sampleCount: 5,
          },
        ],
        isStable: true,
        stabilityConfidence: 0.98,
        inconsistentFields: [],
        sampleCount: 5,
      };
      tool.baselineP50Ms = 42;
      tool.baselineP95Ms = 85;
      tool.baselineP99Ms = 120;
      tool.baselineSuccessRate = 0.95;
      tool.performanceConfidence = {
        sampleCount: 10,
        successfulSamples: 9,
        validationSamples: 3,
        totalTests: 12,
        standardDeviation: 8.5,
        coefficientOfVariation: 0.15,
        confidenceLevel: 'high',
      };
      tool.securityFingerprint = {
        tested: true,
        categoriesTested: ['sql_injection', 'xss'],
        findings: [
          {
            category: 'sql_injection',
            riskLevel: 'critical',
            title: 'SQL Injection',
            description: 'Input not sanitized',
            evidence: "' OR 1=1 --",
            remediation: 'Use parameterized queries',
            cweId: 'CWE-89',
            parameter: 'query',
            tool: 'full_tool',
          },
        ],
        riskScore: 9,
        testedAt: '2025-01-15T12:00:00.000Z',
        findingsHash: 'sec-hash-xyz',
      };
      tool.annotations = {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      };
      tool.outputSchema = {
        type: 'object',
        properties: { result: { type: 'boolean' } },
      };
      tool.outputSchemaHash = 'out-schema-hash-456';
      tool.title = 'Full Test Tool';
      tool.execution = { taskSupport: 'optional' };
      tool.lastTestedAt = '2025-01-15T12:00:00.000Z';

      // Recalculate hash after mutations
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { hash: _oldHash, ...rest } = baseline;
      const recalculated = recalculateBaselineHash(rest);

      const path = join(testDir, 'full-roundtrip.json');
      saveBaseline(recalculated, path);
      const loaded = loadBaseline(path);

      const loadedTool = loaded.capabilities.tools[0];

      // Verify all runtime fields survived the disk roundtrip
      expect(loadedTool.responseFingerprint).toEqual(tool.responseFingerprint);
      expect(loadedTool.inferredOutputSchema).toEqual(tool.inferredOutputSchema);
      expect(loadedTool.errorPatterns).toEqual(tool.errorPatterns);
      expect(loadedTool.responseSchemaEvolution).toEqual(tool.responseSchemaEvolution);
      expect(loadedTool.baselineP50Ms).toBe(42);
      expect(loadedTool.baselineP95Ms).toBe(85);
      expect(loadedTool.baselineP99Ms).toBe(120);
      expect(loadedTool.baselineSuccessRate).toBe(0.95);
      expect(loadedTool.performanceConfidence).toEqual(tool.performanceConfidence);
      expect(loadedTool.securityFingerprint).toEqual(tool.securityFingerprint);
      expect(loadedTool.annotations).toEqual(tool.annotations);
      expect(loadedTool.outputSchema).toEqual(tool.outputSchema);
      expect(loadedTool.outputSchemaHash).toBe('out-schema-hash-456');
      expect(loadedTool.title).toBe('Full Test Tool');
      expect(loadedTool.execution).toEqual({ taskSupport: 'optional' });
      expect(loadedTool.lastTestedAt).toBe('2025-01-15T12:00:00.000Z');
    });

    it('should preserve undefined optional fields as absent after roundtrip', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'minimal_tool', description: 'Minimal tool' }],
      });
      const baseline = createBaseline(result, 'npx test');

      // Ensure optional runtime fields are NOT set
      const tool = baseline.capabilities.tools[0] as unknown as Record<string, unknown>;
      delete tool.responseFingerprint;
      delete tool.errorPatterns;
      delete tool.securityFingerprint;
      delete tool.performanceConfidence;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { hash: _oldHash, ...rest } = baseline;
      const recalculated = recalculateBaselineHash(rest);

      const path = join(testDir, 'minimal-roundtrip.json');
      saveBaseline(recalculated, path);
      const loaded = loadBaseline(path);

      const loadedTool = loaded.capabilities.tools[0];

      // These should be absent (undefined) after roundtrip
      expect(loadedTool.responseFingerprint).toBeUndefined();
      expect(loadedTool.errorPatterns).toBeUndefined();
      expect(loadedTool.securityFingerprint).toBeUndefined();
      expect(loadedTool.performanceConfidence).toBeUndefined();
    });

    it('should produce identical comparison when comparing before and after save/load', () => {
      const result = createTestInterviewResult({
        tools: [{ name: 'tool_a' }, { name: 'tool_b' }],
      });
      const baseline = createBaseline(result, 'npx test');
      const path = join(testDir, 'comparison-roundtrip.json');

      saveBaseline(baseline, path);
      const loaded = loadBaseline(path, { skipIntegrityCheck: true });

      // Comparing the original and loaded baselines should produce no drift
      const diff = compareBaselines(baseline, loaded);

      expect(diff.toolsAdded).toHaveLength(0);
      expect(diff.toolsRemoved).toHaveLength(0);
      expect(diff.toolsModified).toHaveLength(0);
      expect(diff.severity).toBe('none');
    });
  });
});
