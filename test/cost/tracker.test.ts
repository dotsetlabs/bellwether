/**
 * Tests for the cost tracking module.
 */

import { describe, it, expect } from 'vitest';
import {
  CostTracker,
  estimateInterviewCost,
  formatCostEstimate,
  getModelPricing,
  type TokenUsage,
  type CostEstimate,
} from '../../src/cost/tracker.js';

describe('CostTracker', () => {
  describe('constructor', () => {
    it('should initialize with model name', () => {
      const tracker = new CostTracker('gpt-4o');
      const cost = tracker.getCost();
      expect(cost.model).toBe('gpt-4o');
    });

    it('should start with zero usage', () => {
      const tracker = new CostTracker('gpt-4o');
      const usage = tracker.getUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
    });

    it('should start with zero call count', () => {
      const tracker = new CostTracker('gpt-4o');
      expect(tracker.getCallCount()).toBe(0);
    });
  });

  describe('addUsage', () => {
    it('should accumulate input tokens', () => {
      const tracker = new CostTracker('gpt-4o');
      tracker.addUsage(100, 50);
      tracker.addUsage(200, 100);

      const usage = tracker.getUsage();
      expect(usage.inputTokens).toBe(300);
    });

    it('should accumulate output tokens', () => {
      const tracker = new CostTracker('gpt-4o');
      tracker.addUsage(100, 50);
      tracker.addUsage(200, 100);

      const usage = tracker.getUsage();
      expect(usage.outputTokens).toBe(150);
    });

    it('should increment call count', () => {
      const tracker = new CostTracker('gpt-4o');
      tracker.addUsage(100, 50);
      tracker.addUsage(200, 100);
      tracker.addUsage(150, 75);

      expect(tracker.getCallCount()).toBe(3);
    });

    it('should calculate total tokens correctly', () => {
      const tracker = new CostTracker('gpt-4o');
      tracker.addUsage(1000, 500);

      const usage = tracker.getUsage();
      expect(usage.totalTokens).toBe(1500);
    });
  });

  describe('getCost', () => {
    it('should calculate cost for GPT-4o', () => {
      const tracker = new CostTracker('gpt-4o');
      // GPT-4o: $2.50/1M input, $10.00/1M output
      tracker.addUsage(1_000_000, 1_000_000);

      const cost = tracker.getCost();
      expect(cost.breakdown.inputCost).toBeCloseTo(2.50);
      expect(cost.breakdown.outputCost).toBeCloseTo(10.00);
      expect(cost.costUSD).toBeCloseTo(12.50);
    });

    it('should calculate cost for GPT-4o-mini', () => {
      const tracker = new CostTracker('gpt-4o-mini');
      // GPT-4o-mini: $0.15/1M input, $0.60/1M output
      tracker.addUsage(1_000_000, 1_000_000);

      const cost = tracker.getCost();
      expect(cost.breakdown.inputCost).toBeCloseTo(0.15);
      expect(cost.breakdown.outputCost).toBeCloseTo(0.60);
      expect(cost.costUSD).toBeCloseTo(0.75);
    });

    it('should calculate cost for Claude Sonnet', () => {
      const tracker = new CostTracker('claude-3-5-sonnet-20241022');
      // Claude 3.5 Sonnet: $3.00/1M input, $15.00/1M output
      tracker.addUsage(1_000_000, 1_000_000);

      const cost = tracker.getCost();
      expect(cost.breakdown.inputCost).toBeCloseTo(3.00);
      expect(cost.breakdown.outputCost).toBeCloseTo(15.00);
      expect(cost.costUSD).toBeCloseTo(18.00);
    });

    it('should return zero cost for Ollama models', () => {
      const tracker = new CostTracker('llama3.2');
      tracker.addUsage(1_000_000, 1_000_000);

      const cost = tracker.getCost();
      expect(cost.costUSD).toBe(0);
    });

    it('should handle unknown models with zero cost', () => {
      const tracker = new CostTracker('unknown-model');
      tracker.addUsage(1_000_000, 1_000_000);

      const cost = tracker.getCost();
      expect(cost.costUSD).toBe(0);
    });

    it('should calculate small token counts accurately', () => {
      const tracker = new CostTracker('gpt-4o');
      // 10000 tokens each
      tracker.addUsage(10_000, 10_000);

      const cost = tracker.getCost();
      // 10000 / 1M * $2.50 = $0.025 input
      // 10000 / 1M * $10 = $0.10 output
      expect(cost.breakdown.inputCost).toBeCloseTo(0.025);
      expect(cost.breakdown.outputCost).toBeCloseTo(0.10);
      expect(cost.costUSD).toBeCloseTo(0.125);
    });
  });

  describe('formatSummary', () => {
    it('should include model name', () => {
      const tracker = new CostTracker('gpt-4o');
      tracker.addUsage(1000, 500);

      const summary = tracker.formatSummary();
      expect(summary).toContain('gpt-4o');
    });

    it('should include call count', () => {
      const tracker = new CostTracker('gpt-4o');
      tracker.addUsage(1000, 500);
      tracker.addUsage(2000, 1000);

      const summary = tracker.formatSummary();
      expect(summary).toContain('API Calls: 2');
    });

    it('should include token counts', () => {
      const tracker = new CostTracker('gpt-4o');
      tracker.addUsage(10000, 5000);

      const summary = tracker.formatSummary();
      expect(summary).toContain('15,000');
      expect(summary).toContain('10,000 in');
      expect(summary).toContain('5,000 out');
    });

    it('should show cost for paid models', () => {
      const tracker = new CostTracker('gpt-4o');
      tracker.addUsage(100000, 50000);

      const summary = tracker.formatSummary();
      expect(summary).toContain('Estimated Cost: $');
    });

    it('should show free for local models', () => {
      const tracker = new CostTracker('llama3.2');
      tracker.addUsage(100000, 50000);

      const summary = tracker.formatSummary();
      expect(summary).toContain('Free (local model)');
    });
  });
});

describe('estimateInterviewCost', () => {
  it('should estimate cost based on tool count and questions', () => {
    const estimate = estimateInterviewCost('gpt-4o', 10, 5, 3);

    expect(estimate.model).toBe('gpt-4o');
    expect(estimate.usage.inputTokens).toBeGreaterThan(0);
    expect(estimate.usage.outputTokens).toBeGreaterThan(0);
    expect(estimate.costUSD).toBeGreaterThan(0);
  });

  it('should scale with tool count', () => {
    const small = estimateInterviewCost('gpt-4o', 5, 5, 3);
    const large = estimateInterviewCost('gpt-4o', 20, 5, 3);

    expect(large.costUSD).toBeGreaterThan(small.costUSD);
    expect(large.usage.totalTokens).toBeGreaterThan(small.usage.totalTokens);
  });

  it('should scale with questions per tool', () => {
    const few = estimateInterviewCost('gpt-4o', 10, 3, 3);
    const many = estimateInterviewCost('gpt-4o', 10, 10, 3);

    expect(many.costUSD).toBeGreaterThan(few.costUSD);
  });

  it('should scale with personas', () => {
    const single = estimateInterviewCost('gpt-4o', 10, 5, 1);
    const multiple = estimateInterviewCost('gpt-4o', 10, 5, 5);

    expect(multiple.costUSD).toBeGreaterThan(single.costUSD);
  });

  it('should return zero for free models', () => {
    const estimate = estimateInterviewCost('llama3.2', 10, 5, 3);

    expect(estimate.costUSD).toBe(0);
    expect(estimate.usage.totalTokens).toBeGreaterThan(0);
  });

  it('should include schema overhead', () => {
    // Schema overhead is 200 tokens per tool
    const estimate = estimateInterviewCost('gpt-4o', 10, 0, 0);

    // With 0 questions and 0 personas, we should still have schema overhead
    expect(estimate.usage.inputTokens).toBeGreaterThan(0);
  });
});

describe('formatCostEstimate', () => {
  it('should format estimate with model name', () => {
    const estimate: CostEstimate = {
      usage: { inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 },
      costUSD: 0.125,
      model: 'gpt-4o',
      breakdown: { inputCost: 0.025, outputCost: 0.10 },
    };

    const formatted = formatCostEstimate(estimate);
    expect(formatted).toContain('gpt-4o');
  });

  it('should format estimated tokens', () => {
    const estimate: CostEstimate = {
      usage: { inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 },
      costUSD: 0.125,
      model: 'gpt-4o',
      breakdown: { inputCost: 0.025, outputCost: 0.10 },
    };

    const formatted = formatCostEstimate(estimate);
    expect(formatted).toContain('15,000');
  });

  it('should format cost in dollars', () => {
    const estimate: CostEstimate = {
      usage: { inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 },
      costUSD: 1.2345,
      model: 'gpt-4o',
      breakdown: { inputCost: 0.5, outputCost: 0.7345 },
    };

    const formatted = formatCostEstimate(estimate);
    expect(formatted).toContain('$1.2345');
  });

  it('should indicate free for local models', () => {
    const estimate: CostEstimate = {
      usage: { inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 },
      costUSD: 0,
      model: 'llama3.2',
      breakdown: { inputCost: 0, outputCost: 0 },
    };

    const formatted = formatCostEstimate(estimate);
    expect(formatted).toContain('Free');
  });
});

describe('getModelPricing', () => {
  it('should return pricing for known models', () => {
    const pricing = getModelPricing('gpt-4o');
    expect(pricing).not.toBeNull();
    expect(pricing?.input).toBe(2.50);
    expect(pricing?.output).toBe(10.00);
  });

  it('should return null for unknown models', () => {
    const pricing = getModelPricing('unknown-model-xyz');
    expect(pricing).toBeNull();
  });

  it('should have pricing for Anthropic models', () => {
    const pricing = getModelPricing('claude-3-5-sonnet-20241022');
    expect(pricing).not.toBeNull();
    expect(pricing?.input).toBe(3.00);
    expect(pricing?.output).toBe(15.00);
  });

  it('should have zero pricing for Ollama models', () => {
    const pricing = getModelPricing('llama3.2');
    expect(pricing).not.toBeNull();
    expect(pricing?.input).toBe(0);
    expect(pricing?.output).toBe(0);
  });
});

