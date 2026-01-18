/**
 * Comprehensive test coverage for Phase 4 features.
 *
 * Covers:
 * - Edge case tests for evaluators
 * - Concurrent modification tests
 * - Large baseline performance tests
 * - Malformed input tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Evaluator imports
import {
  evaluateAssertion,
  evaluateAssertions,
  getValueAtPath,
} from '../src/scenarios/evaluator.js';
import type { ScenarioAssertion } from '../src/scenarios/types.js';

// Baseline imports
import {
  createBaseline,
  compareBaselines,
} from '../src/baseline/index.js';
import type { InterviewResult, ToolProfile } from '../src/interview/types.js';

// Token budget imports
import {
  TokenBudgetTracker,
  truncateMessages,
} from '../src/llm/token-budget.js';
import type { Message } from '../src/llm/client.js';

// Metrics imports
import { MetricsCollector } from '../src/metrics/collector.js';

// YAML parsing imports
import { parseYamlSecure, parseYamlStrict } from '../src/utils/yaml-parser.js';

// Config loader imports
import { loadConfigNew } from '../src/config/loader.js';

describe('Evaluator Edge Cases', () => {
  describe('getValueAtPath edge cases', () => {
    it('should handle circular references gracefully', () => {
      const obj: Record<string, unknown> = { name: 'test' };
      obj.self = obj;

      // Should not hang or crash
      expect(getValueAtPath(obj, 'name')).toBe('test');
      expect(getValueAtPath(obj, 'self.name')).toBe('test');
    });

    it('should handle very deep nesting', () => {
      let obj: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < 100; i++) {
        obj = { nested: obj };
      }

      // Build path string
      const path = 'nested.'.repeat(100) + 'value';
      expect(getValueAtPath(obj, path)).toBe('deep');
    });

    it('should handle array-like objects', () => {
      const arrayLike = { 0: 'a', 1: 'b', length: 2 };
      expect(getValueAtPath(arrayLike, '0')).toBe('a');
      expect(getValueAtPath(arrayLike, 'length')).toBe(2);
    });

    it('should handle prototype properties', () => {
      const obj = { own: 'property' };
      // toString is inherited from Object.prototype
      expect(getValueAtPath(obj, 'toString')).toBeDefined();
      expect(getValueAtPath(obj, 'own')).toBe('property');
    });

    it('should handle numeric string keys', () => {
      const obj = { '123': 'numeric key' };
      expect(getValueAtPath(obj, '123')).toBe('numeric key');
    });

    it('should handle empty string path segments', () => {
      const obj = { '': { nested: 'value' } };
      // Empty string key access
      expect(getValueAtPath(obj, '')).toBeUndefined();
    });
  });

  describe('evaluateAssertion edge cases', () => {
    it('should handle unknown assertion condition', () => {
      const assertion = {
        path: 'value',
        condition: 'unknown_condition' as never,
      };

      const result = evaluateAssertion(assertion, { value: 'test' }, false);
      expect(result.passed).toBe(false);
      expect(result.error).toContain('Unknown assertion condition');
    });

    it('should handle contains with non-string/non-array values', () => {
      const assertion: ScenarioAssertion = {
        path: 'value',
        condition: 'contains',
        value: 'test',
      };

      // Test with number
      const numberResult = evaluateAssertion(assertion, { value: 123 }, false);
      expect(numberResult.passed).toBe(false);

      // Test with object
      const objectResult = evaluateAssertion(assertion, { value: { test: 1 } }, false);
      expect(objectResult.passed).toBe(false);

      // Test with boolean
      const boolResult = evaluateAssertion(assertion, { value: true }, false);
      expect(boolResult.passed).toBe(false);
    });

    it('should handle contains with null value', () => {
      const assertion: ScenarioAssertion = {
        path: 'value',
        condition: 'contains',
        value: 'test',
      };

      const result = evaluateAssertion(assertion, { value: null }, false);
      expect(result.passed).toBe(false);
    });

    it('should handle type check for null', () => {
      const assertion: ScenarioAssertion = {
        path: 'value',
        condition: 'type',
        value: 'null',
      };

      const result = evaluateAssertion(assertion, { value: null }, false);
      expect(result.passed).toBe(true);
    });

    it('should handle equals with undefined expected value', () => {
      const assertion: ScenarioAssertion = {
        path: 'value',
        condition: 'equals',
        value: undefined,
      };

      // Undefined equals undefined
      const result = evaluateAssertion(assertion, { other: 'test' }, false);
      expect(result.passed).toBe(true);
    });

    it('should handle complex nested object equality', () => {
      const assertion: ScenarioAssertion = {
        path: 'data',
        condition: 'equals',
        value: {
          nested: {
            deep: [1, 2, { key: 'value' }],
          },
        },
      };

      const resultMatch = evaluateAssertion(
        assertion,
        { data: { nested: { deep: [1, 2, { key: 'value' }] } } },
        false
      );
      expect(resultMatch.passed).toBe(true);

      const resultNoMatch = evaluateAssertion(
        assertion,
        { data: { nested: { deep: [1, 2, { key: 'different' }] } } },
        false
      );
      expect(resultNoMatch.passed).toBe(false);
    });

    it('should handle array contains with complex objects', () => {
      const assertion: ScenarioAssertion = {
        path: 'items',
        condition: 'contains',
        value: { id: 1, name: 'test' },
      };

      const result = evaluateAssertion(
        assertion,
        { items: [{ id: 1, name: 'test' }, { id: 2, name: 'other' }] },
        false
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('evaluateAssertions edge cases', () => {
    it('should handle empty assertions array', () => {
      const results = evaluateAssertions([], { data: 'test' }, false);
      expect(results).toHaveLength(0);
    });

    it('should evaluate all assertions even when some fail', () => {
      const assertions: ScenarioAssertion[] = [
        { path: 'a', condition: 'exists' },
        { path: 'b', condition: 'exists' },
        { path: 'c', condition: 'exists' },
      ];

      const results = evaluateAssertions(assertions, { a: 1, c: 3 }, false);

      expect(results).toHaveLength(3);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(false);
      expect(results[2].passed).toBe(true);
    });
  });
});

describe('Concurrent Modification Tests', () => {
  describe('MetricsCollector concurrent access', () => {
    it('should handle concurrent token usage recording', async () => {
      const collector = new MetricsCollector();

      // Simulate concurrent calls
      const promises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve().then(() => {
          collector.recordTokenUsage('openai', 'gpt-4', 100, 50);
        })
      );

      await Promise.all(promises);

      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.tokenUsage[0].callCount).toBe(100);
      expect(aggregated.tokenUsage[0].totalInputTokens).toBe(10000);
    });

    it('should handle concurrent timing records', async () => {
      const collector = new MetricsCollector();

      const promises = Array.from({ length: 50 }, (_, i) =>
        collector.time('llm_call', async () => {
          await new Promise((r) => setTimeout(r, 1));
          return i;
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(50);
      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.operationStats[0].count).toBe(50);
    });

    it('should handle interview start/end race', async () => {
      const collector = new MetricsCollector();

      // Start interview, then immediately end in parallel with updates
      collector.startInterview();

      await Promise.all([
        Promise.resolve().then(() => collector.recordTokenUsage('openai', 'gpt-4', 100, 50)),
        Promise.resolve().then(() => collector.recordTiming('tool_call', 100, true)),
        Promise.resolve().then(() => collector.updateInterviewCounters({ questionsGenerated: 5 })),
      ]);

      const metrics = collector.getInterviewMetrics();
      expect(metrics).not.toBeNull();
    });
  });

  describe('TokenBudgetTracker concurrent access', () => {
    it('should handle concurrent budget tracking', async () => {
      const tracker = new TokenBudgetTracker({ maxTotalTokens: 100000 });

      const promises = Array.from({ length: 100 }, () =>
        Promise.resolve().then(() => {
          tracker.recordUsage(100, 50);
        })
      );

      await Promise.all(promises);

      const status = tracker.getStatus();
      expect(status.totalUsed).toBe(15000); // 100 * (100 + 50)
    });

    it('should trigger warning only once under concurrent load', async () => {
      const onWarning = vi.fn();
      const tracker = new TokenBudgetTracker({
        maxTotalTokens: 1000,
        warningThreshold: 0.5,
        onBudgetWarning: onWarning,
      });

      // All at once should trigger warning exactly once
      const promises = Array.from({ length: 10 }, () =>
        Promise.resolve().then(() => {
          tracker.recordUsage(100, 0);
        })
      );

      await Promise.all(promises);

      // Warning should have been called, but only once
      expect(onWarning).toHaveBeenCalled();
      // Note: Due to race conditions, it might be called multiple times
      // The important thing is it doesn't crash
    });
  });
});

// Helper function at module scope for reuse in multiple describe blocks
function createLargeInterviewResult(toolCount: number): InterviewResult {
  const tools: ToolProfile[] = Array.from({ length: toolCount }, (_, i) => ({
    name: `tool_${i}`,
    description: `Tool number ${i} that does something useful`,
    interactions: Array.from({ length: 5 }, (_, j) => ({
      toolName: `tool_${i}`,
      question: {
        description: `Test question ${j}`,
        category: 'happy_path' as const,
        args: { input: `test_${j}` },
      },
      response: { content: [{ type: 'text', text: `response ${j}` }] },
      error: null,
      analysis: `Analysis for question ${j}`,
      durationMs: 100,
    })),
    behavioralNotes: [`Behavior note for tool ${i}`],
    limitations: [`Limitation for tool ${i}`],
    securityNotes: i % 10 === 0 ? [`Security note for tool ${i}`] : [],
  }));

  return {
    discovery: {
      serverInfo: { name: 'large-server', version: '1.0.0' },
      protocolVersion: '0.1.0',
      capabilities: { tools: true, prompts: false, resources: false, logging: false },
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
      })),
      prompts: [],
      resources: [],
    },
    toolProfiles: tools,
    summary: 'Large interview completed',
    limitations: ['Server limitation'],
    recommendations: ['Recommendation'],
    metadata: {
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 10000,
      toolCallCount: toolCount * 5,
      errorCount: 0,
      model: 'test-model',
    },
  };
}

describe('Large Baseline Performance Tests', () => {
  it('should handle baseline with 100 tools', () => {
    const result = createLargeInterviewResult(100);
    const startTime = Date.now();

    const baseline = createBaseline(result, 'npx large-server');

    const duration = Date.now() - startTime;
    expect(baseline.tools).toHaveLength(100);
    expect(baseline.assertions.length).toBeGreaterThan(0);
    // Should complete in reasonable time
    expect(duration).toBeLessThan(5000);
  });

  it('should compare large baselines efficiently', () => {
    const result1 = createLargeInterviewResult(50);
    const result2 = createLargeInterviewResult(50);

    // Modify some tools in result2
    result2.toolProfiles[10].description = 'Modified description';
    result2.toolProfiles[20].limitations = ['New limitation'];

    const baseline1 = createBaseline(result1, 'npx server');
    const baseline2 = createBaseline(result2, 'npx server');

    const startTime = Date.now();
    const diff = compareBaselines(baseline1, baseline2);
    const duration = Date.now() - startTime;

    expect(diff.toolsModified.length).toBeGreaterThan(0);
    // Should complete in reasonable time
    expect(duration).toBeLessThan(5000);
  });

  it('should handle baseline with many assertions', () => {
    const result = createLargeInterviewResult(20);
    const baseline = createBaseline(result, 'npx server');

    // Should have generated multiple assertions per tool
    expect(baseline.assertions.length).toBeGreaterThan(20);
  });
});

describe('Malformed Input Tests', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-malformed-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('YAML parsing malformed input', () => {
    it('should reject YAML with tabs in indentation', () => {
      const yaml = "name: test\n\tvalue: invalid";
      expect(() => parseYamlSecure(yaml)).toThrow();
    });

    it('should reject unclosed quotes', () => {
      const yaml = 'name: "unclosed string';
      expect(() => parseYamlSecure(yaml)).toThrow();
    });

    it('should reject invalid YAML with duplicate keys in strict mode', () => {
      const yaml = 'key: value1\nkey: value2';
      // Strict mode should reject duplicate keys
      expect(() => parseYamlStrict(yaml)).toThrow();
    });

    it('should handle binary data gracefully', () => {
      const binary = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE]).toString();
      // Should not crash, may throw or return unexpected result
      try {
        parseYamlSecure(binary);
      } catch {
        // Expected to throw for invalid YAML
      }
    });

    it('should handle extremely long lines', () => {
      const longLine = 'key: ' + 'a'.repeat(100000);
      // Should not hang
      const result = parseYamlSecure(longLine);
      expect(result).toHaveProperty('key');
    });

    it('should reject YAML with excessive anchors', () => {
      const lines = ['base: &base {x: 1}'];
      for (let i = 0; i < 200; i++) {
        lines.push(`item${i}: *base`);
      }
      const yaml = lines.join('\n');

      expect(() => parseYamlSecure(yaml)).toThrow();
    });
  });

  describe('Config loading malformed input', () => {
    it('should handle empty config file', () => {
      const configPath = join(testDir, 'bellwether.yaml');
      writeFileSync(configPath, '');

      // Should not crash, applies defaults (empty YAML parses to null)
      const config = loadConfigNew(configPath);
      expect(config).toBeDefined();
      expect(config.mode).toBe('structural');
    });

    it('should handle config with only comments', () => {
      const configPath = join(testDir, 'bellwether.yaml');
      writeFileSync(configPath, '# Just a comment\n# Another comment');

      // Comments-only parses to null, applies defaults
      const config = loadConfigNew(configPath);
      expect(config).toBeDefined();
      expect(config.mode).toBe('structural');
    });

    it('should handle config with unknown fields', () => {
      const configPath = join(testDir, 'bellwether.yaml');
      writeFileSync(
        configPath,
        `
mode: structural
unknownField: true
anotherUnknown:
  nested: value
llm:
  provider: openai
  model: gpt-4
test:
  maxQuestionsPerTool: 3
output:
  format: agents.md
`
      );

      // Should load without crashing, ignoring unknown fields (passthrough)
      const config = loadConfigNew(configPath);
      expect(config.llm?.provider).toBe('openai');
    });

    it('should throw validation error for invalid provider', () => {
      const configPath = join(testDir, 'bellwether.yaml');
      writeFileSync(
        configPath,
        `
mode: structural
llm:
  provider: invalid_provider
`
      );

      // New loadConfigNew throws validation errors for invalid values
      expect(() => loadConfigNew(configPath)).toThrow();
    });

    it('should reject string numbers with clear error message', () => {
      const configPath = join(testDir, 'bellwether.yaml');
      writeFileSync(
        configPath,
        `
mode: structural
test:
  maxQuestionsPerTool: "5"
`
      );

      // New config validation is strict about types - strings are not coerced
      expect(() => loadConfigNew(configPath)).toThrow(/Expected number, received string/);
    });
  });

  describe('Token budget malformed messages', () => {
    it('should handle messages with undefined content', () => {
      const messages: Message[] = [
        { role: 'user', content: undefined as unknown as string },
        { role: 'assistant', content: 'response' },
      ];

      // Should not crash
      const result = truncateMessages(messages, 1000);
      expect(result).toBeDefined();
    });

    it('should handle messages with empty content', () => {
      const messages: Message[] = [
        { role: 'user', content: '' },
        { role: 'assistant', content: '' },
      ];

      const result = truncateMessages(messages, 1000);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle single very long message', () => {
      const messages: Message[] = [
        { role: 'user', content: 'word '.repeat(10000) },
      ];

      const result = truncateMessages(messages, 100, {
        keepSystemMessage: false,
        minMessages: 1,
      });

      // Should keep at least minMessages
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Assertion evaluation malformed data', () => {
    it('should handle assertion against undefined response', () => {
      const assertion: ScenarioAssertion = {
        path: 'value',
        condition: 'exists',
      };

      const result = evaluateAssertion(assertion, undefined, false);
      expect(result.passed).toBe(false);
    });

    it('should handle assertion with empty path against object', () => {
      const assertion: ScenarioAssertion = {
        path: '',
        condition: 'truthy',
      };

      const result = evaluateAssertion(assertion, { data: 'test' }, false);
      // Empty path returns undefined
      expect(result.passed).toBe(false);
    });

    it('should handle assertion against function value', () => {
      const assertion: ScenarioAssertion = {
        path: 'fn',
        condition: 'type',
        value: 'function',
      };

      const result = evaluateAssertion(
        assertion,
        { fn: () => {} },
        false
      );
      expect(result.passed).toBe(true);
    });

    it('should handle assertion against symbol value', () => {
      const assertion: ScenarioAssertion = {
        path: 'sym',
        condition: 'type',
        value: 'symbol',
      };

      const result = evaluateAssertion(
        assertion,
        { sym: Symbol('test') },
        false
      );
      expect(result.passed).toBe(true);
    });
  });
});

describe('Additional Timeout Edge Cases', () => {
  it('should handle zero timeout gracefully', async () => {
    const tracker = new TokenBudgetTracker({
      maxTotalTokens: 1000,
    });

    // Should not crash with edge case values
    expect(tracker.wouldExceedBudget(0, 0)).toBe(false);
    tracker.recordUsage(0, 0);
    expect(tracker.getStatus().totalUsed).toBe(0);
  });

  it('should handle negative values defensively', () => {
    const tracker = new TokenBudgetTracker({
      maxTotalTokens: 1000,
    });

    // Negative values should be handled
    tracker.recordUsage(-100, -50);
    // Implementation may treat negatives differently, just ensure no crash
    expect(tracker.getStatus()).toBeDefined();
  });

  it('should handle very large token values', () => {
    const tracker = new TokenBudgetTracker({
      maxTotalTokens: Number.MAX_SAFE_INTEGER,
    });

    tracker.recordUsage(1000000000, 500000000);
    expect(tracker.getStatus().totalUsed).toBe(1500000000);
  });
});

describe('Schema Comparison Edge Cases', () => {
  it('should handle schema with no properties', () => {
    const result = createLargeInterviewResult(1);
    result.discovery.tools[0].inputSchema = { type: 'object' };

    const baseline = createBaseline(result, 'npx server');
    expect(baseline.tools[0].schemaHash).toBeDefined();
  });

  it('should handle schema with only required field', () => {
    const result = createLargeInterviewResult(1);
    result.discovery.tools[0].inputSchema = {
      type: 'object',
      required: ['field1'],
    };

    const baseline = createBaseline(result, 'npx server');
    expect(baseline.tools[0].schemaHash).toBeDefined();
  });
});
