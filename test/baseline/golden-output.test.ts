/**
 * Tests for golden output testing functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createGoldenOutput,
  saveGoldenOutput,
  getGoldenOutput,
  listGoldenOutputs,
  deleteGoldenOutput,
  compareWithGolden,
  loadGoldenStore,
  getGoldenStorePath,
  type GoldenOutput,
} from '../../src/baseline/golden-output.js';
import type { MCPToolCallResult } from '../../src/transport/types.js';

describe('Golden Output', () => {
  let testDir: string;
  let storePath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-golden-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    storePath = getGoldenStorePath(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createGoldenOutput', () => {
    it('should create golden output from tool response', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"result": "success", "count": 42}' }],
        isError: false,
      };

      const golden = createGoldenOutput('test_tool', { param: 'value' }, response);

      expect(golden.toolName).toBe('test_tool');
      expect(golden.inputArgs).toEqual({ param: 'value' });
      expect(golden.output.raw).toBe('{"result": "success", "count": 42}');
      expect(golden.output.contentType).toBe('json');
      expect(golden.output.contentHash).toBeDefined();
      expect(golden.output.structure).toBeDefined();
      expect(golden.version).toBe(1);
    });

    it('should detect JSON content type', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"key": "value"}' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, response);
      expect(golden.output.contentType).toBe('json');
    });

    it('should detect markdown content type', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: '# Header\n\nSome content with **bold** text.' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, response);
      expect(golden.output.contentType).toBe('markdown');
    });

    it('should detect text content type', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'Plain text output without any special formatting.' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, response);
      expect(golden.output.contentType).toBe('text');
    });

    it('should apply custom tolerance options', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'test' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, response, {
        mode: 'exact',
        allowedDrift: ['$.timestamp', '$.meta.*'],
        normalizeTimestamps: false,
        normalizeUuids: false,
        description: 'Test golden',
      });

      expect(golden.tolerance.mode).toBe('exact');
      expect(golden.tolerance.allowedDrift).toEqual(['$.timestamp', '$.meta.*']);
      expect(golden.tolerance.normalizeTimestamps).toBe(false);
      expect(golden.tolerance.normalizeUuids).toBe(false);
      expect(golden.description).toBe('Test golden');
    });

    it('should extract JSON structure', () => {
      const response: MCPToolCallResult = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: 123,
            name: 'test',
            items: [1, 2, 3],
            nested: { key: 'value' },
          }),
        }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, response);
      expect(golden.output.structure).toBeDefined();
      expect(golden.output.structure?.type).toBe('object');
    });

    it('should extract key values for semantic comparison', () => {
      const response: MCPToolCallResult = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: 123,
            name: 'test',
            items: [1, 2, 3],
          }),
        }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, response);
      expect(golden.output.keyValues).toBeDefined();
      expect(golden.output.keyValues?.id).toBe(123);
      expect(golden.output.keyValues?.name).toBe('test');
      expect(golden.output.keyValues?.['items.length']).toBe(3);
    });
  });

  describe('saveGoldenOutput / loadGoldenStore', () => {
    it('should save and load golden output', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'test output' }],
        isError: false,
      };

      const golden = createGoldenOutput('test_tool', { key: 'value' }, response);
      saveGoldenOutput(golden, storePath);

      const store = loadGoldenStore(storePath);
      expect(store.outputs).toHaveLength(1);
      expect(store.outputs[0].toolName).toBe('test_tool');
    });

    it('should update existing golden for same tool/args', () => {
      const response1: MCPToolCallResult = {
        content: [{ type: 'text', text: 'output 1' }],
        isError: false,
      };
      const response2: MCPToolCallResult = {
        content: [{ type: 'text', text: 'output 2' }],
        isError: false,
      };

      const golden1 = createGoldenOutput('tool', { key: 'value' }, response1);
      saveGoldenOutput(golden1, storePath);

      const golden2 = createGoldenOutput('tool', { key: 'value' }, response2);
      saveGoldenOutput(golden2, storePath);

      const store = loadGoldenStore(storePath);
      expect(store.outputs).toHaveLength(1);
      expect(store.outputs[0].output.raw).toBe('output 2');
    });

    it('should store multiple goldens for different args', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'output' }],
        isError: false,
      };

      const golden1 = createGoldenOutput('tool', { key: 'value1' }, response);
      const golden2 = createGoldenOutput('tool', { key: 'value2' }, response);

      saveGoldenOutput(golden1, storePath);
      saveGoldenOutput(golden2, storePath);

      const store = loadGoldenStore(storePath);
      expect(store.outputs).toHaveLength(2);
    });
  });

  describe('getGoldenOutput', () => {
    it('should retrieve golden by tool name', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'output' }],
        isError: false,
      };

      const golden = createGoldenOutput('my_tool', {}, response);
      saveGoldenOutput(golden, storePath);

      const retrieved = getGoldenOutput('my_tool', storePath);
      expect(retrieved).toBeDefined();
      expect(retrieved?.toolName).toBe('my_tool');
    });

    it('should return undefined for non-existent tool', () => {
      const retrieved = getGoldenOutput('nonexistent', storePath);
      expect(retrieved).toBeUndefined();
    });

    it('should retrieve golden by tool name and args', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'output' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', { specific: 'args' }, response);
      saveGoldenOutput(golden, storePath);

      const retrieved = getGoldenOutput('tool', storePath, { specific: 'args' });
      expect(retrieved).toBeDefined();

      const notFound = getGoldenOutput('tool', storePath, { different: 'args' });
      expect(notFound).toBeUndefined();
    });
  });

  describe('listGoldenOutputs', () => {
    it('should return empty array for new store', () => {
      const outputs = listGoldenOutputs(storePath);
      expect(outputs).toEqual([]);
    });

    it('should list all saved golden outputs', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'output' }],
        isError: false,
      };

      saveGoldenOutput(createGoldenOutput('tool_a', {}, response), storePath);
      saveGoldenOutput(createGoldenOutput('tool_b', {}, response), storePath);
      saveGoldenOutput(createGoldenOutput('tool_c', {}, response), storePath);

      const outputs = listGoldenOutputs(storePath);
      expect(outputs).toHaveLength(3);
      expect(outputs.map(o => o.toolName)).toContain('tool_a');
      expect(outputs.map(o => o.toolName)).toContain('tool_b');
      expect(outputs.map(o => o.toolName)).toContain('tool_c');
    });
  });

  describe('deleteGoldenOutput', () => {
    it('should delete golden output by tool name', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'output' }],
        isError: false,
      };

      saveGoldenOutput(createGoldenOutput('tool_to_delete', {}, response), storePath);
      expect(listGoldenOutputs(storePath)).toHaveLength(1);

      const deleted = deleteGoldenOutput('tool_to_delete', storePath);
      expect(deleted).toBe(true);
      expect(listGoldenOutputs(storePath)).toHaveLength(0);
    });

    it('should return false for non-existent tool', () => {
      const deleted = deleteGoldenOutput('nonexistent', storePath);
      expect(deleted).toBe(false);
    });

    it('should not delete other tools', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'output' }],
        isError: false,
      };

      saveGoldenOutput(createGoldenOutput('tool_a', {}, response), storePath);
      saveGoldenOutput(createGoldenOutput('tool_b', {}, response), storePath);

      deleteGoldenOutput('tool_a', storePath);

      const remaining = listGoldenOutputs(storePath);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].toolName).toBe('tool_b');
    });
  });

  describe('compareWithGolden', () => {
    it('should pass for identical outputs in exact mode', () => {
      const response: MCPToolCallResult = {
        content: [{ type: 'text', text: 'exact content' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, response, { mode: 'exact' });
      const result = compareWithGolden(golden, response);

      expect(result.passed).toBe(true);
      expect(result.severity).toBe('none');
      expect(result.differences).toHaveLength(0);
    });

    it('should fail for different outputs in exact mode', () => {
      const goldenResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: 'original content' }],
        isError: false,
      };
      const currentResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: 'modified content' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, goldenResponse, { mode: 'exact' });
      const result = compareWithGolden(golden, currentResponse);

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('breaking');
      expect(result.differences.length).toBeGreaterThan(0);
    });

    it('should pass for same structure different values in structural mode', () => {
      const goldenResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"id": 1, "name": "old"}' }],
        isError: false,
      };
      const currentResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"id": 2, "name": "new"}' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, goldenResponse, { mode: 'structural' });
      const result = compareWithGolden(golden, currentResponse);

      expect(result.passed).toBe(true);
    });

    it('should detect added fields in structural mode', () => {
      const goldenResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"id": 1}' }],
        isError: false,
      };
      const currentResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"id": 1, "newField": "value"}' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, goldenResponse, { mode: 'structural' });
      const result = compareWithGolden(golden, currentResponse);

      expect(result.passed).toBe(false);
      const addedDiff = result.differences.find(d => d.type === 'added');
      expect(addedDiff).toBeDefined();
      expect(addedDiff?.path).toContain('newField');
    });

    it('should detect removed fields in structural mode', () => {
      const goldenResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"id": 1, "name": "test"}' }],
        isError: false,
      };
      const currentResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"id": 1}' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, goldenResponse, { mode: 'structural' });
      const result = compareWithGolden(golden, currentResponse);

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('breaking');
      const removedDiff = result.differences.find(d => d.type === 'removed');
      expect(removedDiff).toBeDefined();
    });

    it('should detect type changes', () => {
      const goldenResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"count": 42}' }],
        isError: false,
      };
      const currentResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"count": "42"}' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, goldenResponse, { mode: 'structural' });
      const result = compareWithGolden(golden, currentResponse);

      expect(result.passed).toBe(false);
      const typeDiff = result.differences.find(d => d.type === 'type_changed');
      expect(typeDiff).toBeDefined();
    });

    it('should respect allowed drift paths', () => {
      const goldenResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"id": 1, "timestamp": "2024-01-01"}' }],
        isError: false,
      };
      const currentResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"id": 1, "timestamp": "2024-06-15"}' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, goldenResponse, {
        mode: 'semantic',
        allowedDrift: ['$.timestamp'],
      });
      const result = compareWithGolden(golden, currentResponse);

      // The timestamp change should be marked as allowed
      const timestampDiff = result.differences.find(d => d.path.includes('timestamp'));
      expect(timestampDiff?.allowed).toBe(true);
    });

    it('should normalize timestamps when enabled', () => {
      const goldenResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: 'Event at 2024-01-15T10:30:00Z' }],
        isError: false,
      };
      const currentResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: 'Event at 2024-06-20T15:45:00Z' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, goldenResponse, {
        mode: 'exact',
        normalizeTimestamps: true,
      });
      const result = compareWithGolden(golden, currentResponse);

      // With timestamp normalization, these should match
      expect(result.passed).toBe(true);
    });

    it('should normalize UUIDs when enabled', () => {
      const goldenResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: 'ID: 123e4567-e89b-12d3-a456-426614174000' }],
        isError: false,
      };
      const currentResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: 'ID: 987fcdeb-51a2-34d5-b678-123456789abc' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, goldenResponse, {
        mode: 'exact',
        normalizeUuids: true,
      });
      const result = compareWithGolden(golden, currentResponse);

      // With UUID normalization, these should match
      expect(result.passed).toBe(true);
    });

    it('should handle array length changes', () => {
      const goldenResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"items": [1, 2, 3]}' }],
        isError: false,
      };
      const currentResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"items": [1, 2, 3, 4, 5]}' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, goldenResponse, { mode: 'structural' });
      const result = compareWithGolden(golden, currentResponse);

      expect(result.passed).toBe(false);
      const lengthDiff = result.differences.find(d => d.path.includes('length'));
      expect(lengthDiff).toBeDefined();
    });

    it('should generate meaningful summary', () => {
      const goldenResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"a": 1}' }],
        isError: false,
      };
      const currentResponse: MCPToolCallResult = {
        content: [{ type: 'text', text: '{"a": 1, "b": 2}' }],
        isError: false,
      };

      const golden = createGoldenOutput('tool', {}, goldenResponse, { mode: 'structural' });
      const result = compareWithGolden(golden, currentResponse);

      expect(result.summary).toContain('added');
    });
  });
});
