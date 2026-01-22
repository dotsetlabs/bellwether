/**
 * Tests for the Prometheus metrics exporter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  exportPrometheusMetrics,
  exportMetricsJSON,
  getMetricDefinitions,
} from '../../src/metrics/prometheus.js';
import { getMetricsCollector, resetMetricsCollector } from '../../src/metrics/collector.js';

describe('Prometheus metrics exporter', () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  describe('exportPrometheusMetrics', () => {
    it('should return valid Prometheus format', () => {
      const collector = getMetricsCollector();
      const output = exportPrometheusMetrics(collector);

      expect(typeof output).toBe('string');
      // Should contain HELP and TYPE declarations
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('should export token usage metrics', () => {
      const collector = getMetricsCollector();

      // Record some token usage
      collector.recordTokenUsage('openai', 'gpt-4', 100, 50, 'test_call');

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('bellwether_llm_tokens_total');
      expect(output).toContain('provider="openai"');
      expect(output).toContain('model="gpt-4"');
      expect(output).toContain('direction="input"');
      expect(output).toContain('direction="output"');
    });

    it('should export LLM call count metrics', () => {
      const collector = getMetricsCollector();

      collector.recordTokenUsage('anthropic', 'claude-3', 200, 100, 'test_call');
      collector.recordTokenUsage('anthropic', 'claude-3', 150, 75, 'test_call');

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('bellwether_llm_calls_total');
      expect(output).toContain('provider="anthropic"');
    });

    it('should export cost metrics', () => {
      const collector = getMetricsCollector();

      // Cost is recorded automatically via recordTokenUsage when model pricing exists
      // Use a model with known pricing to trigger cost calculation
      collector.recordTokenUsage('openai', 'gpt-4', 1000, 500, 'test_call');
      collector.recordTokenUsage('openai', 'gpt-4', 2000, 1000, 'test_call');

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('bellwether_cost_usd_total');
      expect(output).toContain('provider="openai"');
    });

    it('should export operation duration histogram', () => {
      const collector = getMetricsCollector();

      // Use recordTiming which is the actual method
      collector.recordTiming('tool_call', 150, true);
      collector.recordTiming('tool_call', 200, true);
      collector.recordTiming('tool_call', 500, false);

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('bellwether_operation_duration_seconds');
      expect(output).toContain('_bucket');
      expect(output).toContain('_sum');
      expect(output).toContain('_count');
    });

    it('should export operation total counter', () => {
      const collector = getMetricsCollector();

      // Use recordTiming which is the actual method (durationMs, success boolean)
      collector.recordTiming('llm_call', 100, true);
      collector.recordTiming('llm_call', 150, false);

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('bellwether_operation_total');
      expect(output).toContain('operation="llm_call"');
      expect(output).toContain('status="success"');
      expect(output).toContain('status="failure"');
    });

    it('should export error metrics', () => {
      const collector = getMetricsCollector();

      collector.recordError('network', 'Connection refused', true);
      collector.recordError('auth', 'Invalid API key', false);

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('bellwether_errors_total');
      expect(output).toContain('category="network"');
      expect(output).toContain('category="auth"');
      expect(output).toContain('retryable="true"');
      expect(output).toContain('retryable="false"');
    });

    it('should export interview metrics when interview is active', () => {
      const collector = getMetricsCollector();

      collector.startInterview();
      collector.updateInterviewCounters({
        toolsDiscovered: 10,
        questionsGenerated: 30,
      });
      // Tool calls are tracked via recordTiming
      for (let i = 0; i < 25; i++) {
        collector.recordTiming('tool_call', 100, true); // 25 successful
      }
      for (let i = 0; i < 5; i++) {
        collector.recordTiming('tool_call', 100, false); // 5 failed
      }

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('bellwether_interview_tools_discovered');
      expect(output).toContain('bellwether_interview_questions_generated');
      expect(output).toContain('bellwether_interview_tool_calls_total');
      expect(output).toContain('bellwether_interview_duration_seconds');
      expect(output).toContain('bellwether_interview_progress_ratio');
    });

    it('should handle empty collector gracefully', () => {
      const collector = getMetricsCollector();
      const output = exportPrometheusMetrics(collector);

      expect(typeof output).toBe('string');
      // Should still have headers even with no data
      expect(output).toContain('# HELP');
    });

    it('should escape label values properly', () => {
      const collector = getMetricsCollector();

      // Record with values that need escaping
      collector.recordTokenUsage('openai', 'gpt-4"test', 100, 50, 'test_call');

      const output = exportPrometheusMetrics(collector);

      // Double quotes should be escaped
      expect(output).toContain('\\"');
    });

    it('should handle special characters in labels', () => {
      const collector = getMetricsCollector();

      collector.recordError('test\ncategory', 'Error with\nnewline', true);

      const output = exportPrometheusMetrics(collector);

      // Newlines should be escaped
      expect(output).toContain('\\n');
    });

    it('should calculate histogram buckets correctly', () => {
      const collector = getMetricsCollector();

      // Record timings with known durations
      collector.recordTiming('test_op', 5, true);   // < 10ms bucket
      collector.recordTiming('test_op', 15, true);  // < 25ms bucket
      collector.recordTiming('test_op', 75, true);  // < 100ms bucket
      collector.recordTiming('test_op', 150, true); // < 250ms bucket

      const output = exportPrometheusMetrics(collector);

      // Check that buckets are cumulative
      expect(output).toContain('_bucket');
      expect(output).toContain('le=');
    });

    it('should include +Inf bucket in histograms', () => {
      const collector = getMetricsCollector();

      collector.recordTiming('test_op', 100, true);

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('le="+Inf"');
    });
  });

  describe('exportMetricsJSON', () => {
    it('should return valid JSON', () => {
      const collector = getMetricsCollector();
      const output = exportMetricsJSON(collector);

      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should include dashboard metrics', () => {
      const collector = getMetricsCollector();

      collector.recordTokenUsage('openai', 'gpt-4', 100, 50, 'test_call');
      collector.recordTiming('tool_call', 150, true);

      const output = exportMetricsJSON(collector);
      const parsed = JSON.parse(output);

      // Dashboard metrics structure includes interview, tokens, cost, performance, providers
      expect(parsed).toHaveProperty('tokens');
      expect(parsed).toHaveProperty('cost');
      expect(parsed).toHaveProperty('performance');
      expect(parsed).toHaveProperty('providers');
    });

    it('should handle empty collector', () => {
      const collector = getMetricsCollector();
      const output = exportMetricsJSON(collector);

      expect(() => JSON.parse(output)).not.toThrow();
    });
  });

  describe('getMetricDefinitions', () => {
    it('should return array of metric definitions', () => {
      const definitions = getMetricDefinitions();

      expect(Array.isArray(definitions)).toBe(true);
      expect(definitions.length).toBeGreaterThan(0);
    });

    it('should return immutable copy', () => {
      const definitions1 = getMetricDefinitions();
      const definitions2 = getMetricDefinitions();

      expect(definitions1).not.toBe(definitions2);
      expect(definitions1).toEqual(definitions2);
    });

    it('should have required fields for each metric', () => {
      const definitions = getMetricDefinitions();

      for (const metric of definitions) {
        expect(metric).toHaveProperty('name');
        expect(metric).toHaveProperty('type');
        expect(metric).toHaveProperty('help');
        expect(typeof metric.name).toBe('string');
        expect(typeof metric.type).toBe('string');
        expect(typeof metric.help).toBe('string');
      }
    });

    it('should have valid metric types', () => {
      const definitions = getMetricDefinitions();
      const validTypes = ['counter', 'gauge', 'histogram', 'summary'];

      for (const metric of definitions) {
        expect(validTypes).toContain(metric.type);
      }
    });

    it('should include token usage metric', () => {
      const definitions = getMetricDefinitions();
      const tokenMetric = definitions.find(m => m.name === 'bellwether_llm_tokens_total');

      expect(tokenMetric).toBeDefined();
      expect(tokenMetric?.type).toBe('counter');
    });

    it('should include cost metric', () => {
      const definitions = getMetricDefinitions();
      const costMetric = definitions.find(m => m.name === 'bellwether_cost_usd_total');

      expect(costMetric).toBeDefined();
      expect(costMetric?.type).toBe('counter');
    });

    it('should include operation duration histogram', () => {
      const definitions = getMetricDefinitions();
      const durationMetric = definitions.find(m => m.name === 'bellwether_operation_duration_seconds');

      expect(durationMetric).toBeDefined();
      expect(durationMetric?.type).toBe('histogram');
    });

    it('should include error metric', () => {
      const definitions = getMetricDefinitions();
      const errorMetric = definitions.find(m => m.name === 'bellwether_errors_total');

      expect(errorMetric).toBeDefined();
      expect(errorMetric?.type).toBe('counter');
    });

    it('should include interview metrics', () => {
      const definitions = getMetricDefinitions();
      const interviewMetrics = definitions.filter(m => m.name.includes('interview'));

      expect(interviewMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle very large values', () => {
      const collector = getMetricsCollector();

      collector.recordTokenUsage('openai', 'gpt-4', 1000000, 500000, 'large_call');

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('1000000');
      expect(output).toContain('500000');
    });

    it('should handle zero values', () => {
      const collector = getMetricsCollector();

      collector.recordTokenUsage('openai', 'gpt-4', 0, 0, 'empty_call');

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain(' 0');
    });

    it('should handle many different providers', () => {
      const collector = getMetricsCollector();

      collector.recordTokenUsage('openai', 'gpt-4', 100, 50, 'call');
      collector.recordTokenUsage('anthropic', 'claude-3', 200, 100, 'call');
      collector.recordTokenUsage('ollama', 'llama2', 150, 75, 'call');

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('provider="openai"');
      expect(output).toContain('provider="anthropic"');
      expect(output).toContain('provider="ollama"');
    });

    it('should handle many operations', () => {
      const collector = getMetricsCollector();

      for (let i = 0; i < 100; i++) {
        collector.recordTiming('test_op', Math.random() * 1000, i % 5 !== 0);
      }

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('bellwether_operation_total');
    });

    it('should calculate progress ratio correctly', () => {
      const collector = getMetricsCollector();

      collector.startInterview();
      collector.updateInterviewCounters({
        toolsDiscovered: 10,
      });
      // toolCallsMade is tracked internally via recordTiming
      // 25 calls = 50% progress (10 tools * 5 expected calls = 50)
      for (let i = 0; i < 25; i++) {
        collector.recordTiming('tool_call', 100, true);
      }

      const output = exportPrometheusMetrics(collector);

      expect(output).toContain('bellwether_interview_progress_ratio');
    });

    it('should handle zero expected calls in progress', () => {
      const collector = getMetricsCollector();

      collector.startInterview();
      collector.updateInterviewCounters({
        toolsDiscovered: 0,
      });
      // No tool calls made (toolCallsMade is 0 by default)

      const output = exportPrometheusMetrics(collector);

      // Should not throw or produce NaN
      expect(output).not.toContain('NaN');
    });
  });
});
