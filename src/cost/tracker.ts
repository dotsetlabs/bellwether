/**
 * Cost tracking and estimation for LLM API usage.
 */

/**
 * Pricing per 1M tokens (input/output) for various models.
 * Prices as of January 2026.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI models - GPT-5 series (latest)
  'gpt-5.2': { input: 1.75, output: 14.00 },
  'gpt-5.1': { input: 1.25, output: 10.00 },
  'gpt-5': { input: 1.25, output: 10.00 },
  'gpt-5-mini': { input: 0.25, output: 2.00 },
  'gpt-5-nano': { input: 0.05, output: 0.40 },
  // OpenAI models - GPT-4.1 series (legacy)
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  // OpenAI models - GPT-4o series (legacy)
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },

  // Anthropic models - Claude 4.5 series (latest)
  'claude-opus-4-5': { input: 5.00, output: 25.00 },
  'claude-opus-4-5-20251101': { input: 5.00, output: 25.00 },
  'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  // Anthropic models - Claude 4 series (legacy)
  'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  // Anthropic models - Claude 3.x series (legacy)
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
  'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },

  // Ollama (local, no cost)
  'llama3.2': { input: 0, output: 0 },
  'llama3.1': { input: 0, output: 0 },
  'mixtral': { input: 0, output: 0 },
  'codellama': { input: 0, output: 0 },
};

/**
 * Token usage information.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Cost estimation result.
 */
export interface CostEstimate {
  usage: TokenUsage;
  costUSD: number;
  model: string;
  breakdown: {
    inputCost: number;
    outputCost: number;
  };
}

/**
 * Cumulative cost tracker for a session.
 */
export class CostTracker {
  private model: string;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private callCount = 0;

  constructor(model: string) {
    this.model = model;
  }

  /**
   * Add token usage from an API call.
   */
  addUsage(inputTokens: number, outputTokens: number): void {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.callCount++;
  }

  /**
   * Get total usage so far.
   */
  getUsage(): TokenUsage {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
    };
  }

  /**
   * Get total cost estimate.
   */
  getCost(): CostEstimate {
    const usage = this.getUsage();
    const pricing = MODEL_PRICING[this.model] ?? { input: 0, output: 0 };

    const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;

    return {
      usage,
      costUSD: inputCost + outputCost,
      model: this.model,
      breakdown: {
        inputCost,
        outputCost,
      },
    };
  }

  /**
   * Get call count.
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Format cost summary for display.
   */
  formatSummary(): string {
    const cost = this.getCost();
    const usage = cost.usage;

    const lines = [
      `LLM Usage Summary:`,
      `  Model: ${cost.model}`,
      `  API Calls: ${this.callCount}`,
      `  Tokens: ${usage.totalTokens.toLocaleString()} (${usage.inputTokens.toLocaleString()} in, ${usage.outputTokens.toLocaleString()} out)`,
    ];

    if (cost.costUSD > 0) {
      lines.push(`  Estimated Cost: $${cost.costUSD.toFixed(4)}`);
    } else {
      lines.push(`  Estimated Cost: Free (local model)`);
    }

    return lines.join('\n');
  }
}

/**
 * Estimate cost for an interview before running.
 */
export function estimateInterviewCost(
  model: string,
  toolCount: number,
  questionsPerTool: number,
  personas: number = 3
): CostEstimate {
  // Average estimates based on typical interview patterns
  const avgInputPerQuestion = 500; // tokens
  const avgOutputPerQuestion = 300; // tokens
  const totalQuestions = toolCount * questionsPerTool * personas;

  // Add overhead for system prompts and tool schemas
  const schemaOverhead = toolCount * 200; // tokens per tool schema

  const inputTokens = (totalQuestions * avgInputPerQuestion) + schemaOverhead;
  const outputTokens = totalQuestions * avgOutputPerQuestion;

  const pricing = MODEL_PRICING[model] ?? { input: 0, output: 0 };
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return {
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    costUSD: inputCost + outputCost,
    model,
    breakdown: {
      inputCost,
      outputCost,
    },
  };
}

/**
 * Format a pre-interview cost estimate.
 */
export function formatCostEstimate(estimate: CostEstimate): string {
  const lines = [
    `Cost Estimate for Interview:`,
    `  Model: ${estimate.model}`,
    `  Estimated Tokens: ~${estimate.usage.totalTokens.toLocaleString()}`,
  ];

  if (estimate.costUSD > 0) {
    lines.push(`  Estimated Cost: ~$${estimate.costUSD.toFixed(4)}`);
  } else {
    lines.push(`  Estimated Cost: Free (local model)`);
  }

  return lines.join('\n');
}

/**
 * Get pricing info for a model.
 */
export function getModelPricing(model: string): { input: number; output: number } | null {
  return MODEL_PRICING[model] ?? null;
}
