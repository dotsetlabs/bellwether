import { describe, it, expect, beforeEach } from 'vitest';
import {
  MetricsCollector,
  getMetricsCollector,
  resetMetricsCollector,
} from '../../src/metrics/collector.js';
import { exportPrometheusMetrics, exportMetricsJSON } from '../../src/metrics/prometheus.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('token usage tracking', () => {
    it('should record token usage', () => {
      collector.recordTokenUsage('openai', 'gpt-4', 100, 50, 'test');

      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.tokenUsage).toHaveLength(1);
      expect(aggregated.tokenUsage[0]).toEqual({
        provider: 'openai',
        model: 'gpt-4',
        totalInputTokens: 100,
        totalOutputTokens: 50,
        callCount: 1,
      });
    });

    it('should aggregate multiple calls to same model', () => {
      collector.recordTokenUsage('openai', 'gpt-4', 100, 50);
      collector.recordTokenUsage('openai', 'gpt-4', 200, 100);

      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.tokenUsage).toHaveLength(1);
      expect(aggregated.tokenUsage[0].totalInputTokens).toBe(300);
      expect(aggregated.tokenUsage[0].totalOutputTokens).toBe(150);
      expect(aggregated.tokenUsage[0].callCount).toBe(2);
    });

    it('should track different providers separately', () => {
      collector.recordTokenUsage('openai', 'gpt-4', 100, 50);
      collector.recordTokenUsage('anthropic', 'claude-3-opus-20240229', 200, 100);

      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.tokenUsage).toHaveLength(2);
    });

    it('should calculate cost from token usage', () => {
      // claude-3-opus has known pricing
      collector.recordTokenUsage('anthropic', 'claude-3-opus-20240229', 1_000_000, 500_000);

      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.totalCostUSD).toBeGreaterThan(0);
      expect(aggregated.costByProvider).toHaveLength(1);
      expect(aggregated.costByProvider[0].provider).toBe('anthropic');
    });
  });

  describe('timing tracking', () => {
    it('should record operation timing', () => {
      collector.recordTiming('llm_call', 1500, true);

      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.operationStats).toHaveLength(1);
      expect(aggregated.operationStats[0]).toMatchObject({
        operation: 'llm_call',
        count: 1,
        successCount: 1,
        failureCount: 0,
      });
    });

    it('should calculate percentiles correctly', () => {
      // Add 100 timing records with known distribution
      for (let i = 1; i <= 100; i++) {
        collector.recordTiming('llm_call', i * 10, true);
      }

      const aggregated = collector.getAggregatedMetrics();
      const stats = aggregated.operationStats[0];

      expect(stats.count).toBe(100);
      expect(stats.minDurationMs).toBe(10);
      expect(stats.maxDurationMs).toBe(1000);
      // Math.floor(100 * 0.5) = 50, sorted[50] = 510
      expect(stats.p50DurationMs).toBe(510);
      // Math.floor(100 * 0.95) = 95, sorted[95] = 960
      expect(stats.p95DurationMs).toBe(960);
      // Math.floor(100 * 0.99) = 99, sorted[99] = 1000
      expect(stats.p99DurationMs).toBe(1000);
    });

    it('should track success and failure separately', () => {
      collector.recordTiming('tool_call', 100, true);
      collector.recordTiming('tool_call', 200, true);
      collector.recordTiming('tool_call', 500, false);

      const aggregated = collector.getAggregatedMetrics();
      const stats = aggregated.operationStats[0];

      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
    });

    it('should time async operations', async () => {
      const result = await collector.time('llm_call', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'done';
      });

      expect(result).toBe('done');

      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.operationStats).toHaveLength(1);
      // Allow some timing tolerance (setTimeout is not precise)
      expect(aggregated.operationStats[0].avgDurationMs).toBeGreaterThanOrEqual(45);
    });

    it('should record failure on exception', async () => {
      await expect(
        collector.time('llm_call', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.operationStats[0].failureCount).toBe(1);
    });
  });

  describe('error tracking', () => {
    it('should record errors by category', () => {
      collector.recordError('llm_rate_limit', 'LLM_RATE_LIMITED', 'Rate limit exceeded', true);
      collector.recordError('llm_auth', 'LLM_AUTH_FAILED', 'Auth failed', false);

      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.errorStats).toHaveLength(2);
    });

    it('should track retryable vs terminal errors', () => {
      collector.recordError('llm_rate_limit', 'LLM_RATE_LIMITED', 'Rate limit', true);
      collector.recordError('llm_rate_limit', 'LLM_RATE_LIMITED', 'Rate limit', true);
      collector.recordError('llm_rate_limit', 'LLM_RATE_LIMITED', 'Rate limit', false);

      const aggregated = collector.getAggregatedMetrics();
      const stats = aggregated.errorStats.find(s => s.category === 'llm_rate_limit');

      expect(stats?.count).toBe(3);
      expect(stats?.retryableCount).toBe(2);
      expect(stats?.terminalCount).toBe(1);
    });
  });

  describe('interview metrics', () => {
    it('should track interview lifecycle', () => {
      collector.startInterview();
      expect(collector.getInterviewMetrics()).not.toBeNull();
      expect(collector.getInterviewMetrics()?.startedAt).toBeInstanceOf(Date);

      const result = collector.endInterview();
      expect(result?.endedAt).toBeInstanceOf(Date);
      expect(result?.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should update interview counters', () => {
      collector.startInterview();
      collector.updateInterviewCounters({
        toolsDiscovered: 5,
        questionsGenerated: 10,
        personasUsed: 3,
      });

      const metrics = collector.getInterviewMetrics();
      expect(metrics?.toolsDiscovered).toBe(5);
      expect(metrics?.questionsGenerated).toBe(10);
      expect(metrics?.personasUsed).toBe(3);
    });

    it('should accumulate questions generated', () => {
      collector.startInterview();
      collector.updateInterviewCounters({ questionsGenerated: 5 });
      collector.updateInterviewCounters({ questionsGenerated: 3 });

      expect(collector.getInterviewMetrics()?.questionsGenerated).toBe(8);
    });

    it('should track tool calls during interview', () => {
      collector.startInterview();
      collector.recordTiming('tool_call', 100, true);
      collector.recordTiming('tool_call', 200, false);

      const metrics = collector.getInterviewMetrics();
      expect(metrics?.toolCallsMade).toBe(2);
      expect(metrics?.toolCallsSucceeded).toBe(1);
      expect(metrics?.toolCallsFailed).toBe(1);
    });

    it('should track tokens and cost during interview', () => {
      collector.startInterview();
      collector.recordTokenUsage('anthropic', 'claude-3-opus-20240229', 1000, 500);

      const metrics = collector.getInterviewMetrics();
      expect(metrics?.totalInputTokens).toBe(1000);
      expect(metrics?.totalOutputTokens).toBe(500);
      expect(metrics?.llmCallsMade).toBe(1);
      expect(metrics?.totalCostUSD).toBeGreaterThan(0);
    });

    it('should track errors during interview', () => {
      collector.startInterview();
      collector.recordError('llm_rate_limit', 'CODE', 'msg', true);
      collector.recordError('llm_rate_limit', 'CODE', 'msg', true);
      collector.recordError('transport', 'CODE', 'msg', false);

      const metrics = collector.getInterviewMetrics();
      expect(metrics?.errorsByCategory['llm_rate_limit']).toBe(2);
      expect(metrics?.errorsByCategory['transport']).toBe(1);
    });
  });

  describe('dashboard metrics', () => {
    it('should produce dashboard-compatible output', () => {
      collector.startInterview();
      collector.updateInterviewCounters({ toolsDiscovered: 10 });
      collector.recordTokenUsage('openai', 'gpt-4', 500, 250);
      collector.recordTiming('llm_call', 1000, true);
      collector.recordTiming('tool_call', 200, true);

      const dashboard = collector.getDashboardMetrics();

      expect(dashboard.timestamp).toBeDefined();
      expect(dashboard.interview.status).toBe('running');
      expect(dashboard.interview.toolsTotal).toBe(10);
      expect(dashboard.tokens.input).toBe(500);
      expect(dashboard.tokens.output).toBe(250);
      expect(dashboard.tokens.total).toBe(750);
      expect(dashboard.performance.avgLLMLatencyMs).toBe(1000);
      expect(dashboard.performance.avgToolLatencyMs).toBe(200);
      expect(dashboard.cost.currency).toBe('USD');
    });

    it('should calculate success rate', () => {
      collector.recordTiming('tool_call', 100, true);
      collector.recordTiming('tool_call', 100, true);
      collector.recordTiming('tool_call', 100, false);

      const dashboard = collector.getDashboardMetrics();
      expect(dashboard.performance.successRate).toBeCloseTo(66.67, 0);
    });
  });

  describe('reset', () => {
    it('should clear all metrics on reset', () => {
      collector.startInterview();
      collector.recordTokenUsage('openai', 'gpt-4', 100, 50);
      collector.recordTiming('llm_call', 100, true);
      collector.recordError('transport', 'CODE', 'msg', true);

      collector.reset();

      expect(collector.getInterviewMetrics()).toBeNull();
      const aggregated = collector.getAggregatedMetrics();
      expect(aggregated.tokenUsage).toHaveLength(0);
      expect(aggregated.operationStats).toHaveLength(0);
      expect(aggregated.errorStats).toHaveLength(0);
    });
  });

  describe('raw records', () => {
    it('should return raw records', () => {
      collector.recordTokenUsage('openai', 'gpt-4', 100, 50);
      collector.recordTiming('llm_call', 100, true);
      collector.recordError('transport', 'CODE', 'msg', true);

      const raw = collector.getRawRecords();
      expect(raw.tokens).toHaveLength(1);
      expect(raw.timing).toHaveLength(1);
      expect(raw.errors).toHaveLength(1);
    });

    it('should trim records when exceeding max', () => {
      const smallCollector = new MetricsCollector({ maxRecords: 5 });

      for (let i = 0; i < 10; i++) {
        smallCollector.recordTiming('llm_call', i * 100, true);
      }

      const raw = smallCollector.getRawRecords();
      expect(raw.timing).toHaveLength(5);
      // Should keep the most recent records
      expect(raw.timing[0].durationMs).toBe(500);
    });
  });
});

describe('Prometheus export', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  it('should export valid Prometheus format', () => {
    collector.recordTokenUsage('openai', 'gpt-4', 1000, 500);
    collector.recordTiming('llm_call', 1500, true);
    collector.recordError('transport', 'CODE', 'Connection failed', true);

    const output = exportPrometheusMetrics(collector);

    expect(output).toContain('# HELP bellwether_llm_tokens_total');
    expect(output).toContain('# TYPE bellwether_llm_tokens_total counter');
    expect(output).toContain('bellwether_llm_tokens_total{provider="openai",model="gpt-4",direction="input"} 1000');
    expect(output).toContain('bellwether_llm_tokens_total{provider="openai",model="gpt-4",direction="output"} 500');
  });

  it('should export histogram buckets', () => {
    collector.recordTiming('llm_call', 50, true);
    collector.recordTiming('llm_call', 150, true);
    collector.recordTiming('llm_call', 500, true);

    const output = exportPrometheusMetrics(collector);

    expect(output).toContain('bellwether_operation_duration_seconds_bucket');
    expect(output).toContain('bellwether_operation_duration_seconds_sum');
    expect(output).toContain('bellwether_operation_duration_seconds_count');
  });

  it('should escape label values', () => {
    collector.recordTokenUsage('test\\provider', 'model"with"quotes', 100, 50);

    const output = exportPrometheusMetrics(collector);

    expect(output).toContain('provider="test\\\\provider"');
    expect(output).toContain('model="model\\"with\\"quotes"');
  });

  it('should include interview metrics when available', () => {
    collector.startInterview();
    collector.updateInterviewCounters({ toolsDiscovered: 5 });
    collector.recordTiming('tool_call', 100, true);
    collector.recordTiming('tool_call', 100, false);

    const output = exportPrometheusMetrics(collector);

    expect(output).toContain('bellwether_interview_tools_discovered 5');
    expect(output).toContain('bellwether_interview_tool_calls_total{status="success"} 1');
    expect(output).toContain('bellwether_interview_tool_calls_total{status="failure"} 1');
  });
});

describe('JSON export', () => {
  it('should export valid JSON', () => {
    const collector = new MetricsCollector();
    collector.startInterview();
    collector.recordTokenUsage('openai', 'gpt-4', 100, 50);

    const output = exportMetricsJSON(collector);
    const parsed = JSON.parse(output);

    expect(parsed.timestamp).toBeDefined();
    expect(parsed.interview).toBeDefined();
    expect(parsed.tokens).toBeDefined();
    expect(parsed.cost).toBeDefined();
    expect(parsed.performance).toBeDefined();
  });
});

describe('global collector', () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  it('should return singleton instance', () => {
    const c1 = getMetricsCollector();
    const c2 = getMetricsCollector();
    expect(c1).toBe(c2);
  });

  it('should reset global collector', () => {
    const c1 = getMetricsCollector();
    c1.recordTokenUsage('openai', 'gpt-4', 100, 50);

    resetMetricsCollector();

    const c2 = getMetricsCollector();
    expect(c2).not.toBe(c1);
    expect(c2.getAggregatedMetrics().tokenUsage).toHaveLength(0);
  });
});
