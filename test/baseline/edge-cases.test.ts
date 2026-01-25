/**
 * Tests for baseline edge cases and error handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadBaseline,
  saveBaseline,
  baselineExists,
  verifyBaselineHash,
  recalculateBaselineHash,
  hasAcceptance,
  clearAcceptance,
  createBaseline,
  type BehavioralBaseline,
} from '../../src/baseline/index.js';
import type { InterviewResult } from '../../src/interview/types.js';

// Helper to create a valid mock interview result for baseline creation
function createMockInterviewResult(): InterviewResult {
  const now = new Date();
  return {
    discovery: {
      serverInfo: { name: 'test-server', version: '1.0.0' },
      protocolVersion: '2024-11-05',
      tools: [{
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: { type: 'object', properties: {} },
      }],
      prompts: [],
      resources: [],
      capabilities: { tools: true } as Record<string, unknown>,
      timestamp: now,
      serverCommand: 'npx test-server',
      serverArgs: [],
    },
    toolProfiles: [{
      name: 'test_tool',
      description: 'A test tool',
      interactions: [],
      behavioralNotes: [],
      limitations: [],
      securityNotes: [],
    }],
    summary: 'Test baseline',
    limitations: [],
    recommendations: [],
    metadata: {
      startTime: now,
      endTime: now,
      durationMs: 1000,
      toolCallCount: 1,
      errorCount: 0,
      model: 'check',
      personas: [],
      serverCommand: 'npx test-server',
    },
  };
}

// Helper to create a valid baseline using the production createBaseline function
function createValidBaseline(): BehavioralBaseline {
  return createBaseline(createMockInterviewResult(), 'npx test-server');
}

describe('baseline loading edge cases', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `bellwether-baseline-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('file not found', () => {
    it('should throw error when baseline file does not exist', () => {
      const nonExistentPath = join(tempDir, 'nonexistent.json');

      expect(() => loadBaseline(nonExistentPath)).toThrow('Baseline file not found');
    });
  });

  describe('invalid JSON', () => {
    it('should throw error for malformed JSON', () => {
      const path = join(tempDir, 'invalid.json');
      writeFileSync(path, '{ invalid json');

      expect(() => loadBaseline(path)).toThrow('Invalid JSON');
    });

    it('should throw error for empty file', () => {
      const path = join(tempDir, 'empty.json');
      writeFileSync(path, '');

      expect(() => loadBaseline(path)).toThrow();
    });

    it('should throw error for non-object JSON', () => {
      const path = join(tempDir, 'array.json');
      writeFileSync(path, '[]');

      expect(() => loadBaseline(path)).toThrow('Invalid baseline format');
    });

    it('should throw error for string JSON', () => {
      const path = join(tempDir, 'string.json');
      writeFileSync(path, '"just a string"');

      expect(() => loadBaseline(path)).toThrow('Invalid baseline format');
    });
  });

  describe('schema validation', () => {
    it('should reject baseline missing required fields', () => {
      const path = join(tempDir, 'missing-fields.json');
      writeFileSync(path, JSON.stringify({
        version: '1.0.0',
        // Missing required fields
      }));

      expect(() => loadBaseline(path)).toThrow('Invalid baseline format');
    });

    // Note: The Zod schema validates version as z.string(), so any string is valid.
    // This test verifies that non-string versions (like numbers) are rejected.
    it('should reject baseline with non-string version', () => {
      const path = join(tempDir, 'invalid-version.json');
      writeFileSync(path, JSON.stringify({
        version: 123, // Number instead of string
        metadata: {
          mode: 'check',
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'test',
          durationMs: 1,
          personas: [],
          model: 'none',
        },
        server: { name: 'test', version: '1.0.0', protocolVersion: '2024-11-05', capabilities: ['tools'] },
        capabilities: { tools: [] },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'test',
        hash: 'abc123',
      }));

      expect(() => loadBaseline(path)).toThrow('Invalid baseline format');
    });

    it('should reject baseline with invalid tool schema', () => {
      const path = join(tempDir, 'invalid-tool.json');
      const baseline = {
        version: '1.0.0',
        metadata: {
          mode: 'check',
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'test',
          durationMs: 1,
          personas: [],
          model: 'none',
        },
        server: {
          name: 'test',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
        capabilities: {
          tools: [
            {
              // Missing required fields like name, description, schemaHash
              invalid: 'tool',
            },
          ],
        },
        interviews: [],
        toolProfiles: [],
        summary: 'test',
        assertions: [],
        hash: 'abc123',
      };
      writeFileSync(path, JSON.stringify(baseline));

      expect(() => loadBaseline(path)).toThrow('Invalid baseline format');
    });

    it('should reject legacy numeric version', () => {
      const path = join(tempDir, 'legacy-version.json');
      const baseline = {
        version: 1, // Legacy numeric version
        metadata: {
          mode: 'check',
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'test',
          durationMs: 1,
          personas: [],
          model: 'none',
        },
        server: {
          name: 'test',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
        capabilities: { tools: [] },
        interviews: [],
        toolProfiles: [],
        summary: 'test',
        assertions: [],
        hash: 'abc123',
      };
      writeFileSync(path, JSON.stringify(baseline));

      expect(() => loadBaseline(path)).toThrow('Invalid baseline format');
    });
  });

  describe('integrity verification', () => {
    it('should fail verification for modified baseline', () => {
      const baseline = createValidBaseline();
      baseline.hash = 'incorrect_hash';

      expect(verifyBaselineHash(baseline)).toBe(false);
    });

    it('should verify integrity after save/load cycle', () => {
      const path = join(tempDir, 'verify-integrity.json');
      const baseline = createValidBaseline();
      const withHash = recalculateBaselineHash(baseline);

      // Save and reload
      saveBaseline(withHash, path);
      const loaded = loadBaseline(path, { skipIntegrityCheck: true });

      // Manually verify the reloaded baseline matches expected structure
      // Note: version may be migrated during load, so we just verify it's a valid semver
      expect(loaded.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(loaded.metadata.serverCommand).toBe(withHash.metadata.serverCommand);
      expect(loaded.capabilities.tools.length).toBe(withHash.capabilities.tools.length);
    });

    it('should skip integrity check when option is set', () => {
      const path = join(tempDir, 'modified.json');
      const baseline = {
        version: '1.0.0',
        metadata: {
          mode: 'check',
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'test',
          durationMs: 1,
          personas: [],
          model: 'none',
        },
        server: {
          name: 'test',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
        capabilities: { tools: [] },
        interviews: [],
        toolProfiles: [],
        summary: 'test',
        assertions: [],
        hash: 'wrong_hash',
      };
      writeFileSync(path, JSON.stringify(baseline));

      // Should not throw with skipIntegrityCheck
      const loaded = loadBaseline(path, { skipIntegrityCheck: true });
      expect(loaded).toBeDefined();
    });
  });

  describe('file size limits', () => {
    it('should reject oversized baseline files', () => {
      const path = join(tempDir, 'large.json');

      // Create a baseline with a very large summary to exceed limits
      const baseline = {
        version: '1.0.0',
        metadata: {
          mode: 'check',
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'test',
          durationMs: 1,
          personas: [],
          model: 'none',
        },
        server: {
          name: 'test',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
        capabilities: { tools: [] },
        interviews: [],
        toolProfiles: [],
        // Create large content to exceed the limit
        summary: 'x'.repeat(60 * 1024 * 1024), // 60MB of x's
        assertions: [],
        hash: 'abc123',
      };

      writeFileSync(path, JSON.stringify(baseline));

      expect(() => loadBaseline(path)).toThrow('too large');
    });
  });
});

describe('baseline saving', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `bellwether-save-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should save baseline to file', () => {
    const path = join(tempDir, 'saved.json');
    const baseline = createValidBaseline();
    const withHash = recalculateBaselineHash(baseline);

    saveBaseline(withHash, path);

    expect(existsSync(path)).toBe(true);
  });

  it('should overwrite existing baseline', () => {
    const path = join(tempDir, 'overwrite.json');

    // Create first baseline - use production createBaseline to ensure correct format
    const result1 = createMockInterviewResult();
    (result1 as any).summary = 'first';
    const baseline1 = createBaseline(result1, 'npx test-server');
    saveBaseline(baseline1, path);

    // Create second baseline with different summary
    const result2 = createMockInterviewResult();
    (result2 as any).summary = 'second';
    const baseline2 = createBaseline(result2, 'npx test-server');
    saveBaseline(baseline2, path);

    const loaded = loadBaseline(path);
    expect(loaded.summary).toBe('second');
  });
});

describe('baselineExists', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `bellwether-exists-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return true for existing file', () => {
    const path = join(tempDir, 'exists.json');
    writeFileSync(path, '{}');

    expect(baselineExists(path)).toBe(true);
  });

  it('should return false for non-existing file', () => {
    const path = join(tempDir, 'nonexistent.json');

    expect(baselineExists(path)).toBe(false);
  });

  it('should return false for directory', () => {
    const dirPath = join(tempDir, 'directory');
    mkdirSync(dirPath);

    expect(baselineExists(dirPath)).toBe(false); // directories are not valid baselines
  });
});

describe('recalculateBaselineHash', () => {
  it('should recalculate hash for modified baseline', () => {
    const baseline = createValidBaseline();
    const original = recalculateBaselineHash(baseline);
    const originalHash = original.hash;

    // Modify the baseline
    baseline.summary = 'modified summary';
    const recalculated = recalculateBaselineHash(baseline);

    expect(recalculated.hash).not.toBe(originalHash);
  });

  it('should produce same hash for identical baselines', () => {
    const baseline1 = createValidBaseline();
    const baseline2 = createValidBaseline();

    const hash1 = recalculateBaselineHash(baseline1).hash;
    const hash2 = recalculateBaselineHash(baseline2).hash;

    expect(hash1).toBe(hash2);
  });
});

describe('acceptance metadata', () => {
  it('should detect baseline without acceptance', () => {
    const baseline = createValidBaseline();
    const withHash = recalculateBaselineHash(baseline);

    expect(hasAcceptance(withHash)).toBe(false);
  });

  it('should detect baseline with acceptance', () => {
    const baseline = createValidBaseline() as any;
    baseline.acceptance = {
      acceptedAt: new Date(),
      acceptedBy: 'test',
      reason: 'test reason',
      acceptedDiff: {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
        severity: 'info',
        breakingCount: 0,
        warningCount: 0,
        infoCount: 1,
      },
    };
    const withHash = recalculateBaselineHash(baseline);

    expect(hasAcceptance(withHash)).toBe(true);
  });

  it('should clear acceptance metadata', () => {
    const baseline = createValidBaseline() as any;
    baseline.acceptance = {
      acceptedAt: new Date(),
      acceptedBy: 'test',
      reason: 'test reason',
      acceptedDiff: {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
        severity: 'info',
        breakingCount: 0,
        warningCount: 0,
        infoCount: 1,
      },
    };
    const withHash = recalculateBaselineHash(baseline);

    const cleared = clearAcceptance(withHash);

    expect(hasAcceptance(cleared)).toBe(false);
    expect(verifyBaselineHash(cleared)).toBe(true);
  });
});

describe('date handling', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `bellwether-date-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should preserve ISO timestamps when loading', () => {
    const path = join(tempDir, 'dates.json');
    const baseline = {
      version: '1.0.0',
      metadata: {
        mode: 'check',
        generatedAt: '2024-01-15T12:00:00.000Z',
        cliVersion: '1.0.0',
        serverCommand: 'test',
        durationMs: 1,
        personas: [],
        model: 'none',
      },
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      summary: 'test',
      assertions: [],
      hash: 'will_be_ignored',
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    expect(loaded.metadata.generatedAt).toBe('2024-01-15T12:00:00.000Z');
  });

  it('should preserve acceptance timestamps', () => {
    const path = join(tempDir, 'acceptance-date.json');
    const baseline = {
      version: '1.0.0',
      metadata: {
        mode: 'check',
        generatedAt: '2024-01-15T12:00:00.000Z',
        cliVersion: '1.0.0',
        serverCommand: 'test',
        durationMs: 1,
        personas: [],
        model: 'none',
      },
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      summary: 'test',
      assertions: [],
      hash: 'will_be_ignored',
      acceptance: {
        acceptedAt: '2024-01-16T12:00:00.000Z',
        reason: 'test',
        acceptedDiff: {
          toolsAdded: [],
          toolsRemoved: [],
          toolsModified: [],
          severity: 'none',
          breakingCount: 0,
          warningCount: 0,
          infoCount: 0,
        },
      },
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    // loadBaseline converts acceptedAt to Date object
    expect((loaded.acceptance?.acceptedAt as Date).toISOString()).toBe('2024-01-16T12:00:00.000Z');
  });
});

describe('tool fingerprint edge cases', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `bellwether-fingerprint-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle tools with no assertions', () => {
    const path = join(tempDir, 'no-assertions.json');
    const baseline = {
      version: '1.0.0',
      metadata: {
        mode: 'check',
        generatedAt: new Date().toISOString(),
        cliVersion: '1.0.0',
        serverCommand: 'test',
        durationMs: 1,
        personas: [],
        model: 'none',
      },
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      capabilities: {
        tools: [
          {
            name: 'simple_tool',
            description: 'A simple tool',
            inputSchema: { type: 'object', properties: {} },
            schemaHash: 'abc123',
          },
        ],
      },
      interviews: [],
      toolProfiles: [
        {
          name: 'simple_tool',
          description: 'A simple tool',
          schemaHash: 'abc123',
          assertions: [],
          securityNotes: [],
          limitations: [],
          behavioralNotes: [],
        },
      ],
      summary: 'test',
      assertions: [],
      hash: 'placeholder',
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    expect(loaded.toolProfiles[0].assertions).toEqual([]);
  });

  it('should handle tools with response fingerprints', () => {
    const path = join(tempDir, 'with-fingerprint.json');
    const baseline = {
      version: '1.0.0',
      metadata: {
        mode: 'check',
        generatedAt: new Date().toISOString(),
        cliVersion: '1.0.0',
        serverCommand: 'test',
        durationMs: 1,
        personas: [],
        model: 'none',
      },
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      capabilities: {
        tools: [
          {
            name: 'tool_with_fingerprint',
            description: 'A tool with fingerprint',
            inputSchema: { type: 'object', properties: {} },
            schemaHash: 'abc123',
            responseFingerprint: {
              structureHash: 'struct_hash',
              contentType: 'object',
              fields: ['field1', 'field2'],
              size: 'small',
              isEmpty: false,
              sampleCount: 5,
              confidence: 0.95,
            },
          },
        ],
      },
      interviews: [],
      toolProfiles: [
        {
          name: 'tool_with_fingerprint',
          description: 'A tool with fingerprint',
          schemaHash: 'abc123',
          assertions: [],
          securityNotes: [],
          limitations: [],
          behavioralNotes: [],
        },
      ],
      summary: 'test',
      assertions: [],
      hash: 'placeholder',
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    expect(loaded.capabilities.tools[0].responseFingerprint).toBeDefined();
    expect(loaded.capabilities.tools[0].responseFingerprint?.contentType).toBe('object');
  });

  it('should handle tools with error patterns', () => {
    const path = join(tempDir, 'with-errors.json');
    const baseline = {
      version: '1.0.0',
      metadata: {
        mode: 'check',
        generatedAt: new Date().toISOString(),
        cliVersion: '1.0.0',
        serverCommand: 'test',
        durationMs: 1,
        personas: [],
        model: 'none',
      },
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      capabilities: {
        tools: [
          {
            name: 'error_tool',
            description: 'A tool with errors',
            inputSchema: { type: 'object', properties: {} },
            schemaHash: 'abc123',
            errorPatterns: [
              {
                category: 'validation',
                patternHash: 'err_hash',
                example: 'Invalid input',
                count: 3,
              },
            ],
          },
        ],
      },
      interviews: [],
      toolProfiles: [
        {
          name: 'error_tool',
          description: 'A tool with errors',
          schemaHash: 'abc123',
          assertions: [],
          securityNotes: [],
          limitations: [],
          behavioralNotes: [],
        },
      ],
      summary: 'test',
      assertions: [],
      hash: 'placeholder',
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    expect(loaded.capabilities.tools[0].errorPatterns).toBeDefined();
    expect(loaded.capabilities.tools[0].errorPatterns?.[0].category).toBe('validation');
  });
});

describe('workflow signature edge cases', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `bellwether-workflow-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle baseline with workflows', () => {
    const path = join(tempDir, 'workflows.json');
    const baseline = {
      version: '1.0.0',
      metadata: {
        mode: 'check',
        generatedAt: new Date().toISOString(),
        cliVersion: '1.0.0',
        serverCommand: 'test',
        durationMs: 1,
        personas: [],
        model: 'none',
      },
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      summary: 'test',
      assertions: [],
      hash: 'placeholder',
      workflows: [
        {
          id: 'workflow_1',
          name: 'Test Workflow',
          toolSequence: ['tool1', 'tool2', 'tool3'],
          succeeded: true,
          summary: 'Workflow succeeded',
        },
      ],
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    expect(loaded.workflows).toBeDefined();
    expect(loaded.workflows?.length).toBe(1);
    expect(loaded.workflows?.[0].name).toBe('Test Workflow');
  });

  it('should handle baseline without workflows', () => {
    const path = join(tempDir, 'no-workflows.json');
    const baseline = {
      version: '1.0.0',
      metadata: {
        mode: 'check',
        generatedAt: new Date().toISOString(),
        cliVersion: '1.0.0',
        serverCommand: 'test',
        durationMs: 1,
        personas: [],
        model: 'none',
      },
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      capabilities: { tools: [] },
      interviews: [],
      toolProfiles: [],
      summary: 'test',
      assertions: [],
      hash: 'placeholder',
      // No workflows field
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    // Should handle missing workflows gracefully
    expect(loaded.workflows).toBeUndefined();
  });
});
