/**
 * Cost tracking and estimation for LLM API usage.
 */

import {
  FORMATTING,
  COST_THRESHOLDS,
  TIME_ESTIMATION,
} from '../constants.js';

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
  'gemma3': { input: 0, output: 0 },
  'gemma2': { input: 0, output: 0 },
  'qwen3': { input: 0, output: 0 },
  'qwen3:8b': { input: 0, output: 0 },
  'qwen3:4b': { input: 0, output: 0 },
  'qwen2.5': { input: 0, output: 0 },
  'phi3': { input: 0, output: 0 },
  'mistral': { input: 0, output: 0 },
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
      lines.push(`  Estimated Cost: $${cost.costUSD.toFixed(FORMATTING.PRICE_PRECISION)}`);
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
    lines.push(`  Estimated Cost: ~$${estimate.costUSD.toFixed(FORMATTING.PRICE_PRECISION)}`);
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

/**
 * Time estimation result for an interview.
 */
export interface InterviewTimeEstimate {
  /** Estimated duration in seconds */
  durationSeconds: number;
  /** Estimated duration in minutes (rounded) */
  durationMinutes: number;
  /** Whether estimate assumes parallel execution */
  isParallel: boolean;
  /** Whether using a local model (slower) */
  isLocalModel: boolean;
}

/**
 * Check if a provider uses local inference (slower than cloud APIs).
 */
export function isLocalProvider(provider: string): boolean {
  return provider === 'ollama';
}

/**
 * Estimate interview time based on tool count and configuration.
 */
export function estimateInterviewTime(
  toolCount: number,
  questionsPerTool: number,
  personas: number,
  parallelPersonas: boolean = false,
  provider: string = 'openai',
  promptCount: number = 0,
  resourceCount: number = 0,
  checkMode: boolean = false
): InterviewTimeEstimate {
  const isLocal = isLocalProvider(provider);

  // Fast CI mode: skips all LLM calls, only executes tool calls
  if (checkMode) {
    // Just tool execution + network overhead
    const totalItems = toolCount + promptCount + resourceCount;
    const executionTime = totalItems * 0.5; // ~0.5s per item for direct calls
    const fixedOverhead = TIME_ESTIMATION.DISCOVERY_OVERHEAD_SECONDS + 5; // Discovery + minimal synthesis
    const totalSeconds = executionTime + fixedOverhead;

    return {
      durationSeconds: Math.round(totalSeconds),
      durationMinutes: Math.max(1, Math.round(totalSeconds / 60)),
      isParallel: parallelPersonas,
      isLocalModel: isLocal,
    };
  }

  const totalQuestions = toolCount * questionsPerTool * personas;

  // Base time: seconds per question + overhead per tool
  const questionTime = totalQuestions * TIME_ESTIMATION.SECONDS_PER_QUESTION;
  const toolOverhead = toolCount * TIME_ESTIMATION.SECONDS_PER_TOOL_OVERHEAD;

  // Add time for prompts and resources
  const promptTime = promptCount * TIME_ESTIMATION.SECONDS_PER_PROMPT;
  const resourceTime = resourceCount * TIME_ESTIMATION.SECONDS_PER_RESOURCE;

  // Fixed overhead for discovery and synthesis
  const fixedOverhead =
    TIME_ESTIMATION.DISCOVERY_OVERHEAD_SECONDS +
    TIME_ESTIMATION.SYNTHESIS_OVERHEAD_SECONDS;

  let totalSeconds = questionTime + toolOverhead + promptTime + resourceTime + fixedOverhead;

  // Apply parallel efficiency if running personas in parallel
  if (parallelPersonas && personas > 1) {
    // Parallel execution reduces the question time portion
    const parallelFactor =
      1 - (1 - 1 / personas) * TIME_ESTIMATION.PARALLEL_EFFICIENCY;
    totalSeconds =
      questionTime * parallelFactor + toolOverhead + promptTime + resourceTime + fixedOverhead;
  }

  // Local models (Ollama) are significantly slower than cloud APIs
  if (isLocal) {
    totalSeconds *= TIME_ESTIMATION.LOCAL_MODEL_MULTIPLIER;
  }

  return {
    durationSeconds: Math.round(totalSeconds),
    durationMinutes: Math.max(1, Math.round(totalSeconds / 60)),
    isParallel: parallelPersonas,
    isLocalModel: isLocal,
  };
}

/**
 * Format a combined cost and time estimate for display.
 */
export function formatCostAndTimeEstimate(
  cost: CostEstimate,
  time: InterviewTimeEstimate
): string {
  const costStr =
    cost.costUSD > 0
      ? `~$${cost.costUSD.toFixed(2)}`
      : 'Free (local)';
  const timeStr = `~${time.durationMinutes} min`;

  // Add note for local models being slower
  const localNote = time.isLocalModel ? ' (local models are slower)' : '';

  return `Estimated: ${costStr} | ${timeStr}${localNote}`;
}

/**
 * Optimization suggestion for reducing cost or time.
 */
export interface OptimizationSuggestion {
  /** Flag to use (e.g., "--ci") */
  flag: string;
  /** Human-readable description */
  description: string;
  /** Estimated savings (e.g., "~80% cheaper") */
  estimatedSavings: string;
  /** Priority for sorting suggestions */
  priority: 'high' | 'medium' | 'low';
}

/**
 * Context for generating optimization suggestions.
 */
export interface OptimizationContext {
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Number of tools discovered */
  toolCount: number;
  /** Number of personas being used */
  personaCount: number;
  /** Whether using parallel personas */
  isParallelPersonas: boolean;
  /** Whether using a premium model (--quality flag) */
  isPremiumModel: boolean;
  /** Whether using CI preset */
  isUsingCiPreset: boolean;
  /** Whether scenarios file exists */
  hasScenariosFile: boolean;
}

/**
 * Generate optimization suggestions based on the interview context.
 */
export function suggestOptimizations(
  context: OptimizationContext
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // Suggest --ci if cost > threshold and not already using ci preset
  if (
    context.estimatedCost > COST_THRESHOLDS.SUGGEST_CI_THRESHOLD &&
    !context.isUsingCiPreset
  ) {
    suggestions.push({
      flag: '--ci',
      description: 'Use CI mode for fast, cheap runs',
      estimatedSavings: '~80% cheaper',
      priority: 'high',
    });
  }

  // Suggest --scenarios-only if cost > threshold and has scenarios file
  if (
    context.estimatedCost > COST_THRESHOLDS.SUGGEST_SCENARIOS_ONLY_THRESHOLD &&
    context.hasScenariosFile
  ) {
    suggestions.push({
      flag: '--scenarios-only',
      description: 'Run only custom scenarios (no LLM)',
      estimatedSavings: 'Free',
      priority: 'high',
    });
  }

  // Suggest --parallel-personas if many tools and multiple personas
  if (
    context.toolCount >= COST_THRESHOLDS.PARALLEL_PERSONAS_TOOL_THRESHOLD &&
    context.personaCount > 1 &&
    !context.isParallelPersonas
  ) {
    suggestions.push({
      flag: '--parallel-personas',
      description: 'Run personas in parallel',
      estimatedSavings: '~50% faster',
      priority: 'medium',
    });
  }

  // Suggest removing --quality if premium model + many tools
  if (
    context.isPremiumModel &&
    context.toolCount >= COST_THRESHOLDS.QUALITY_TOOL_THRESHOLD
  ) {
    suggestions.push({
      flag: 'remove --quality',
      description: 'Use budget model for large codebases',
      estimatedSavings: '~60% cheaper',
      priority: 'medium',
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

/**
 * Format optimization suggestions for CLI display.
 */
export function formatOptimizationSuggestions(
  suggestions: OptimizationSuggestion[],
  maxSuggestions: number = 3
): string {
  if (suggestions.length === 0) {
    return '';
  }

  const lines = ['Optimization suggestions:'];
  const toShow = suggestions.slice(0, maxSuggestions);

  for (const suggestion of toShow) {
    lines.push(`  ${suggestion.flag} - ${suggestion.description} (${suggestion.estimatedSavings})`);
  }

  return lines.join('\n');
}
