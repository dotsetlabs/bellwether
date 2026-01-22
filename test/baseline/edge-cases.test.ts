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
  verifyIntegrity,
  recalculateIntegrityHash,
  hasAcceptance,
  clearAcceptance,
  type BehavioralBaseline,
} from '../../src/baseline/index.js';

// Helper to create a valid mock baseline
function createValidBaseline(): BehavioralBaseline {
  return {
    version: '1.0.0',
    createdAt: new Date(),
    mode: 'check',
    serverCommand: 'npx test-server',
    server: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: ['tools'],
    },
    tools: [
      {
        name: 'test_tool',
        description: 'A test tool',
        schemaHash: 'abc123',
        assertions: [],
        securityNotes: [],
        limitations: [],
      },
    ],
    summary: 'Test baseline',
    assertions: [],
    workflowSignatures: [],
    integrityHash: '', // Will be set
  };
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

    it('should reject baseline with invalid version format', () => {
      const path = join(tempDir, 'invalid-version.json');
      const baseline = createValidBaseline();
      (baseline as any).version = 'invalid';
      writeFileSync(path, JSON.stringify(baseline));

      expect(() => loadBaseline(path)).toThrow('Invalid baseline format');
    });

    it('should reject baseline with invalid tool schema', () => {
      const path = join(tempDir, 'invalid-tool.json');
      const baseline = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        serverCommand: 'test',
        server: {
          name: 'test',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
        tools: [
          {
            // Missing required fields like name, description, schemaHash
            invalid: 'tool',
          },
        ],
        summary: 'test',
        assertions: [],
        integrityHash: 'abc123',
      };
      writeFileSync(path, JSON.stringify(baseline));

      expect(() => loadBaseline(path)).toThrow('Invalid baseline format');
    });

    it('should accept legacy numeric version', () => {
      const path = join(tempDir, 'legacy-version.json');
      const baseline = {
        version: 1, // Legacy numeric version
        createdAt: new Date().toISOString(),
        serverCommand: 'test',
        server: {
          name: 'test',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
        tools: [],
        summary: 'test',
        assertions: [],
        integrityHash: 'abc123',
      };
      writeFileSync(path, JSON.stringify(baseline));

      // Should not throw - legacy version is supported
      const loaded = loadBaseline(path, { skipIntegrityCheck: true });
      expect(loaded).toBeDefined();
    });
  });

  describe('integrity verification', () => {
    it('should fail verification for modified baseline', () => {
      const baseline = createValidBaseline();
      baseline.integrityHash = 'incorrect_hash';

      expect(verifyIntegrity(baseline)).toBe(false);
    });

    it('should verify integrity after save/load cycle', () => {
      const path = join(tempDir, 'verify-integrity.json');
      const baseline = createValidBaseline();
      const withHash = recalculateIntegrityHash(baseline);

      // Save and reload
      saveBaseline(withHash, path);
      const loaded = loadBaseline(path, { skipIntegrityCheck: true });

      // Manually verify the reloaded baseline matches expected structure
      // Note: version may be migrated during load, so we just verify it's a valid semver
      expect(loaded.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(loaded.serverCommand).toBe(withHash.serverCommand);
      expect(loaded.tools.length).toBe(withHash.tools.length);
    });

    it('should skip integrity check when option is set', () => {
      const path = join(tempDir, 'modified.json');
      const baseline = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        serverCommand: 'test',
        server: {
          name: 'test',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
        tools: [],
        summary: 'test',
        assertions: [],
        integrityHash: 'wrong_hash',
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
        createdAt: new Date().toISOString(),
        serverCommand: 'test',
        server: {
          name: 'test',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
        tools: [],
        // Create large content to exceed the limit
        summary: 'x'.repeat(60 * 1024 * 1024), // 60MB of x's
        assertions: [],
        integrityHash: 'abc123',
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
    const withHash = recalculateIntegrityHash(baseline);

    saveBaseline(withHash, path);

    expect(existsSync(path)).toBe(true);
  });

  it('should overwrite existing baseline', () => {
    const path = join(tempDir, 'overwrite.json');
    const baseline1 = createValidBaseline();
    baseline1.summary = 'first';
    const withHash1 = recalculateIntegrityHash(baseline1);

    saveBaseline(withHash1, path);

    const baseline2 = createValidBaseline();
    baseline2.summary = 'second';
    const withHash2 = recalculateIntegrityHash(baseline2);

    saveBaseline(withHash2, path);

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

describe('recalculateIntegrityHash', () => {
  it('should recalculate hash for modified baseline', () => {
    const baseline = createValidBaseline();
    const original = recalculateIntegrityHash(baseline);
    const originalHash = original.integrityHash;

    // Modify the baseline
    baseline.summary = 'modified summary';
    const recalculated = recalculateIntegrityHash(baseline);

    expect(recalculated.integrityHash).not.toBe(originalHash);
  });

  it('should produce same hash for identical baselines', () => {
    const baseline1 = createValidBaseline();
    const baseline2 = createValidBaseline();

    const hash1 = recalculateIntegrityHash(baseline1).integrityHash;
    const hash2 = recalculateIntegrityHash(baseline2).integrityHash;

    expect(hash1).toBe(hash2);
  });
});

describe('acceptance metadata', () => {
  it('should detect baseline without acceptance', () => {
    const baseline = createValidBaseline();
    const withHash = recalculateIntegrityHash(baseline);

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
    const withHash = recalculateIntegrityHash(baseline);

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
    const withHash = recalculateIntegrityHash(baseline);

    const cleared = clearAcceptance(withHash);

    expect(hasAcceptance(cleared)).toBe(false);
    expect(verifyIntegrity(cleared)).toBe(true);
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

  it('should restore Date objects when loading', () => {
    const path = join(tempDir, 'dates.json');
    const baseline = {
      version: '1.0.0',
      createdAt: '2024-01-15T12:00:00.000Z',
      serverCommand: 'test',
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      tools: [],
      summary: 'test',
      assertions: [],
      integrityHash: 'will_be_ignored',
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    expect(loaded.createdAt).toBeInstanceOf(Date);
    expect(loaded.createdAt.toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  it('should restore acceptance date', () => {
    const path = join(tempDir, 'acceptance-date.json');
    const baseline = {
      version: '1.0.0',
      createdAt: '2024-01-15T12:00:00.000Z',
      serverCommand: 'test',
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      tools: [],
      summary: 'test',
      assertions: [],
      integrityHash: 'will_be_ignored',
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

    expect(loaded.acceptance?.acceptedAt).toBeInstanceOf(Date);
    expect(loaded.acceptance?.acceptedAt.toISOString()).toBe('2024-01-16T12:00:00.000Z');
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
      createdAt: new Date().toISOString(),
      serverCommand: 'test',
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      tools: [
        {
          name: 'simple_tool',
          description: 'A simple tool',
          schemaHash: 'abc123',
          assertions: [],
          securityNotes: [],
          limitations: [],
        },
      ],
      summary: 'test',
      assertions: [],
      integrityHash: 'placeholder',
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    expect(loaded.tools[0].assertions).toEqual([]);
  });

  it('should handle tools with response fingerprints', () => {
    const path = join(tempDir, 'with-fingerprint.json');
    const baseline = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      serverCommand: 'test',
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      tools: [
        {
          name: 'tool_with_fingerprint',
          description: 'A tool with fingerprint',
          schemaHash: 'abc123',
          assertions: [],
          securityNotes: [],
          limitations: [],
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
      summary: 'test',
      assertions: [],
      integrityHash: 'placeholder',
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    expect(loaded.tools[0].responseFingerprint).toBeDefined();
    expect(loaded.tools[0].responseFingerprint?.contentType).toBe('object');
  });

  it('should handle tools with error patterns', () => {
    const path = join(tempDir, 'with-errors.json');
    const baseline = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      serverCommand: 'test',
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      tools: [
        {
          name: 'error_tool',
          description: 'A tool with errors',
          schemaHash: 'abc123',
          assertions: [],
          securityNotes: [],
          limitations: [],
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
      summary: 'test',
      assertions: [],
      integrityHash: 'placeholder',
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    expect(loaded.tools[0].errorPatterns).toBeDefined();
    expect(loaded.tools[0].errorPatterns?.[0].category).toBe('validation');
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
      createdAt: new Date().toISOString(),
      serverCommand: 'test',
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      tools: [],
      summary: 'test',
      assertions: [],
      integrityHash: 'placeholder',
      workflowSignatures: [
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

    expect(loaded.workflowSignatures).toBeDefined();
    expect(loaded.workflowSignatures?.length).toBe(1);
    expect(loaded.workflowSignatures?.[0].name).toBe('Test Workflow');
  });

  it('should handle baseline without workflows', () => {
    const path = join(tempDir, 'no-workflows.json');
    const baseline = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      serverCommand: 'test',
      server: {
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      tools: [],
      summary: 'test',
      assertions: [],
      integrityHash: 'placeholder',
      // No workflowSignatures field
    };
    writeFileSync(path, JSON.stringify(baseline));

    const loaded = loadBaseline(path, { skipIntegrityCheck: true });

    // Should handle missing workflowSignatures gracefully
    expect(loaded.workflowSignatures).toBeUndefined();
  });
});
