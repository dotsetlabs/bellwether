/**
 * Intelligent Test Pruning.
 *
 * Determines which test categories to run or skip based on tool characteristics
 * and testing history. Reduces test time while maintaining coverage where it matters.
 */

import type { MCPTool } from '../transport/types.js';
import type { ToolFingerprint, ErrorPattern } from './types.js';
import { TEST_PRUNING } from '../constants.js';

/**
 * Test category type.
 */
export type TestCategory =
  | 'happy_path'
  | 'boundary'
  | 'enum'
  | 'optional_combinations'
  | 'error_handling'
  | 'security'
  | 'semantic';

/**
 * Decision about a test category.
 */
export interface TestCategoryDecision {
  /** The test category */
  category: TestCategory;
  /** Whether to run this category */
  shouldRun: boolean;
  /** Reason for the decision */
  reason: string;
  /** Priority if running (higher = more important) */
  priority: number;
}

/**
 * Complete pruning decision for a tool.
 */
export interface ToolPruningDecision {
  /** Tool name */
  toolName: string;
  /** Overall tool priority (0-100) */
  priority: number;
  /** Decisions for each category */
  categories: TestCategoryDecision[];
  /** Categories that will run */
  categoriesToRun: TestCategory[];
  /** Categories that will skip */
  categoriesToSkip: TestCategory[];
  /** Estimated test reduction percentage */
  reductionPercent: number;
}

/**
 * Tool characteristics for pruning decisions.
 */
export interface ToolCharacteristics {
  /** Number of parameters */
  parameterCount: number;
  /** Number of required parameters */
  requiredParamCount: number;
  /** Whether tool has numeric parameters */
  hasNumericParams: boolean;
  /** Whether tool has enum parameters */
  hasEnumParams: boolean;
  /** Whether tool has optional parameters */
  hasOptionalParams: boolean;
  /** Whether tool has string parameters (for security testing) */
  hasStringParams: boolean;
  /** Maximum nesting depth in schema */
  maxNestingDepth: number;
  /** Whether tool has external dependencies */
  hasExternalDependency: boolean;
  /** Error rate from previous testing (0-1) */
  errorRate: number;
  /** Hours since last test (null if never tested) */
  hoursSinceLastTest: number | null;
  /** Consecutive successful runs */
  consecutiveSuccesses: number;
}

/**
 * Input for making pruning decisions.
 */
export interface PruningInput {
  /** Tool definition */
  tool: MCPTool;
  /** Previous baseline fingerprint (if available) */
  fingerprint?: ToolFingerprint;
  /** Error patterns from baseline */
  errorPatterns?: ErrorPattern[];
  /** All test categories that could run */
  availableCategories: TestCategory[];
}

/**
 * Calculate pruning decisions for a set of tools.
 */
export function calculatePruningDecisions(
  inputs: PruningInput[]
): ToolPruningDecision[] {
  return inputs.map(input => calculateToolPruning(input));
}

/**
 * Calculate pruning decision for a single tool.
 */
export function calculateToolPruning(input: PruningInput): ToolPruningDecision {
  const { tool, fingerprint, errorPatterns, availableCategories } = input;

  // Analyze tool characteristics
  const characteristics = analyzeToolCharacteristics(tool, fingerprint, errorPatterns);

  // Calculate tool priority
  const priority = calculateToolPriority(characteristics, fingerprint);

  // Make decisions for each category
  const categories = availableCategories.map(category =>
    decideCategoryPruning(category, characteristics, priority)
  );

  // Apply maximum skip limit
  const skippableCategories = categories.filter(c => !c.shouldRun);
  const alwaysRun = categories.filter(c =>
    TEST_PRUNING.ALWAYS_RUN.includes(c.category)
  );

  // Ensure always-run categories are included
  for (const cat of alwaysRun) {
    cat.shouldRun = true;
    cat.reason = 'Required category';
  }

  // Respect max skip limit
  const skippedCount = categories.filter(c => !c.shouldRun).length;
  if (skippedCount > TEST_PRUNING.MAX_SKIPPED_CATEGORIES_PER_TOOL) {
    // Re-enable lowest priority skipped categories
    const toReEnable = skippableCategories
      .sort((a, b) => b.priority - a.priority)
      .slice(0, skippedCount - TEST_PRUNING.MAX_SKIPPED_CATEGORIES_PER_TOOL);

    for (const cat of toReEnable) {
      const found = categories.find(c => c.category === cat.category);
      if (found) {
        found.shouldRun = true;
        found.reason = 'Re-enabled due to skip limit';
      }
    }
  }

  const categoriesToRun = categories.filter(c => c.shouldRun).map(c => c.category);
  const categoriesToSkip = categories.filter(c => !c.shouldRun).map(c => c.category);

  // Calculate reduction percentage
  const reductionPercent = availableCategories.length > 0
    ? Math.round((categoriesToSkip.length / availableCategories.length) * 100)
    : 0;

  return {
    toolName: tool.name,
    priority,
    categories,
    categoriesToRun,
    categoriesToSkip,
    reductionPercent,
  };
}

/**
 * Analyze characteristics of a tool for pruning decisions.
 */
function analyzeToolCharacteristics(
  tool: MCPTool,
  fingerprint?: ToolFingerprint,
  errorPatterns?: ErrorPattern[]
): ToolCharacteristics {
  const schema = tool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  } | undefined;

  const properties = schema?.properties || {};
  const required = schema?.required || [];
  const paramNames = Object.keys(properties);

  let hasNumericParams = false;
  let hasEnumParams = false;
  const hasOptionalParams = required.length < paramNames.length;
  let hasStringParams = false;
  let maxNestingDepth = 0;

  // Analyze each parameter
  for (const paramName of paramNames) {
    const param = properties[paramName] as Record<string, unknown>;
    const type = param.type as string | undefined;

    if (type === 'number' || type === 'integer') {
      hasNumericParams = true;
    }

    if (type === 'string') {
      hasStringParams = true;
    }

    if (Array.isArray(param.enum)) {
      hasEnumParams = true;
    }

    // Calculate nesting depth
    const depth = calculateNestingDepth(param);
    maxNestingDepth = Math.max(maxNestingDepth, depth);
  }

  // Calculate error rate from patterns
  let errorRate = 0;
  if (errorPatterns && errorPatterns.length > 0) {
    const errorCount = errorPatterns.reduce((sum, p) => sum + (p.count || 1), 0);
    // Assume some baseline of total calls (conservative estimate)
    const estimatedCalls = Math.max(errorCount * 2, 10);
    errorRate = errorCount / estimatedCalls;
  }

  // Calculate hours since last test
  let hoursSinceLastTest: number | null = null;
  if (fingerprint?.lastTestedAt) {
    const lastTested = new Date(fingerprint.lastTestedAt).getTime();
    const now = Date.now();
    hoursSinceLastTest = (now - lastTested) / (1000 * 60 * 60);
  }

  // Check for external dependencies
  const hasExternalDependency = checkExternalDependency(tool, errorPatterns);

  // Count consecutive successes (simplified - would need history tracking)
  const consecutiveSuccesses = errorRate === 0 ? 5 : 0;

  return {
    parameterCount: paramNames.length,
    requiredParamCount: required.length,
    hasNumericParams,
    hasEnumParams,
    hasOptionalParams,
    hasStringParams,
    maxNestingDepth,
    hasExternalDependency,
    errorRate,
    hoursSinceLastTest,
    consecutiveSuccesses,
  };
}

/**
 * Calculate nesting depth of a schema.
 */
function calculateNestingDepth(schema: unknown, currentDepth = 0): number {
  if (!schema || typeof schema !== 'object' || currentDepth > 10) {
    return currentDepth;
  }

  const obj = schema as Record<string, unknown>;

  if (obj.type === 'object' && obj.properties) {
    const props = obj.properties as Record<string, unknown>;
    let maxChildDepth = currentDepth + 1;
    for (const prop of Object.values(props)) {
      maxChildDepth = Math.max(maxChildDepth, calculateNestingDepth(prop, currentDepth + 1));
    }
    return maxChildDepth;
  }

  if (obj.type === 'array' && obj.items) {
    return calculateNestingDepth(obj.items, currentDepth + 1);
  }

  return currentDepth;
}

/**
 * Check if tool has external dependencies.
 */
function checkExternalDependency(
  tool: MCPTool,
  errorPatterns?: ErrorPattern[]
): boolean {
  const description = (tool.description || '').toLowerCase();
  const name = tool.name.toLowerCase();

  // Check common external service indicators
  const externalIndicators = [
    'api', 'external', 'service', 'cloud', 'remote',
    'plaid', 'stripe', 'aws', 's3', 'openai', 'anthropic',
    'database', 'db', 'postgres', 'mysql', 'redis',
  ];

  if (externalIndicators.some(ind => description.includes(ind) || name.includes(ind))) {
    return true;
  }

  // Check error patterns for external service errors (timeout suggests external calls)
  if (errorPatterns) {
    const externalErrors = errorPatterns.filter(p =>
      p.category === 'timeout' || p.category === 'internal'
    );
    if (externalErrors.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate overall tool priority (0-100).
 */
function calculateToolPriority(
  characteristics: ToolCharacteristics,
  fingerprint?: ToolFingerprint
): number {
  let priority = 50; // Base priority

  // Factor 1: Error history (increases priority)
  if (characteristics.errorRate > 0) {
    priority += Math.round(characteristics.errorRate * 100 * TEST_PRUNING.PRIORITY_WEIGHTS.errorHistory);
  }

  // Factor 2: External dependencies (increases priority)
  if (characteristics.hasExternalDependency) {
    priority += 25 * TEST_PRUNING.PRIORITY_WEIGHTS.externalDependency;
  }

  // Factor 3: Schema complexity (increases priority)
  if (characteristics.parameterCount >= TEST_PRUNING.SCHEMA_COMPLEXITY.HIGH_PARAM_COUNT) {
    priority += 20 * TEST_PRUNING.PRIORITY_WEIGHTS.schemaComplexity;
  }
  if (characteristics.maxNestingDepth >= TEST_PRUNING.SCHEMA_COMPLEXITY.HIGH_NESTING_DEPTH) {
    priority += 15 * TEST_PRUNING.PRIORITY_WEIGHTS.schemaComplexity;
  }

  // Factor 4: Time since last test (increases priority if stale)
  if (characteristics.hoursSinceLastTest !== null) {
    if (characteristics.hoursSinceLastTest >= TEST_PRUNING.TIME_THRESHOLDS.VERY_STALE_HOURS) {
      priority += 30 * TEST_PRUNING.PRIORITY_WEIGHTS.timeSinceLastTest;
    } else if (characteristics.hoursSinceLastTest >= TEST_PRUNING.TIME_THRESHOLDS.STALE_HOURS) {
      priority += 15 * TEST_PRUNING.PRIORITY_WEIGHTS.timeSinceLastTest;
    }
  }

  // Factor 5: Consecutive successes (decreases priority)
  if (characteristics.consecutiveSuccesses >= TEST_PRUNING.SUCCESS_HISTORY.STABLE_RUN_COUNT) {
    priority -= 20;
  }

  // Factor 6: Schema changes (increases priority)
  if (fingerprint && fingerprint.inputSchemaHashAtTest) {
    // Would need current schema hash to compare - simplified
    // If schema changed, increase priority
  }

  return Math.max(0, Math.min(100, Math.round(priority)));
}

/**
 * Decide whether to run a test category.
 */
function decideCategoryPruning(
  category: TestCategory,
  characteristics: ToolCharacteristics,
  toolPriority: number
): TestCategoryDecision {
  // Always-run categories
  if (TEST_PRUNING.ALWAYS_RUN.includes(category)) {
    return {
      category,
      shouldRun: true,
      reason: 'Required category',
      priority: 100,
    };
  }

  switch (category) {
    case 'boundary':
      if (!characteristics.hasNumericParams) {
        return {
          category,
          shouldRun: false,
          reason: 'No numeric parameters',
          priority: 0,
        };
      }
      return {
        category,
        shouldRun: toolPriority >= 40,
        reason: characteristics.hasNumericParams ? 'Has numeric parameters' : 'Low priority tool',
        priority: toolPriority,
      };

    case 'enum':
      if (!characteristics.hasEnumParams) {
        return {
          category,
          shouldRun: false,
          reason: 'No enum parameters',
          priority: 0,
        };
      }
      return {
        category,
        shouldRun: true,
        reason: 'Has enum parameters',
        priority: 70,
      };

    case 'optional_combinations':
      if (!characteristics.hasOptionalParams) {
        return {
          category,
          shouldRun: false,
          reason: 'No optional parameters',
          priority: 0,
        };
      }
      // Only run for high-priority tools with optional params
      return {
        category,
        shouldRun: toolPriority >= 60,
        reason: characteristics.hasOptionalParams ? 'Has optional parameters' : 'Low priority',
        priority: toolPriority - 10,
      };

    case 'security':
      if (!characteristics.hasStringParams) {
        return {
          category,
          shouldRun: false,
          reason: 'No string parameters',
          priority: 0,
        };
      }
      // Security tests are important - run for medium+ priority
      return {
        category,
        shouldRun: toolPriority >= 30 || characteristics.hasExternalDependency,
        reason: characteristics.hasExternalDependency ? 'External dependency' : 'Has string inputs',
        priority: toolPriority + 10,
      };

    case 'semantic':
      // Semantic tests based on param naming - run for tools with clear semantic params
      return {
        category,
        shouldRun: toolPriority >= 50,
        reason: toolPriority >= 50 ? 'Standard priority' : 'Low priority tool',
        priority: toolPriority,
      };

    default:
      return {
        category,
        shouldRun: true,
        reason: 'Unknown category - running by default',
        priority: 50,
      };
  }
}

/**
 * Prioritize tools for testing order.
 */
export function prioritizeTools(decisions: ToolPruningDecision[]): ToolPruningDecision[] {
  return [...decisions].sort((a, b) => b.priority - a.priority);
}

/**
 * Generate summary of pruning decisions.
 */
export interface PruningSummary {
  /** Total tools analyzed */
  totalTools: number;
  /** Total categories that would run without pruning */
  totalCategoriesWithoutPruning: number;
  /** Total categories that will run with pruning */
  totalCategoriesWithPruning: number;
  /** Overall reduction percentage */
  overallReduction: number;
  /** Tools with highest priority */
  highPriorityTools: string[];
  /** Tools with most categories skipped */
  mostPrunedTools: string[];
}

/**
 * Generate pruning summary.
 */
export function generatePruningSummary(decisions: ToolPruningDecision[]): PruningSummary {
  const totalTools = decisions.length;
  let totalWithout = 0;
  let totalWith = 0;

  for (const decision of decisions) {
    totalWithout += decision.categories.length;
    totalWith += decision.categoriesToRun.length;
  }

  const overallReduction = totalWithout > 0
    ? Math.round(((totalWithout - totalWith) / totalWithout) * 100)
    : 0;

  const sorted = [...decisions].sort((a, b) => b.priority - a.priority);
  const highPriorityTools = sorted.slice(0, 5).map(d => d.toolName);

  const byPruning = [...decisions].sort((a, b) => b.reductionPercent - a.reductionPercent);
  const mostPrunedTools = byPruning
    .filter(d => d.reductionPercent > 0)
    .slice(0, 5)
    .map(d => d.toolName);

  return {
    totalTools,
    totalCategoriesWithoutPruning: totalWithout,
    totalCategoriesWithPruning: totalWith,
    overallReduction,
    highPriorityTools,
    mostPrunedTools,
  };
}

/**
 * Generate markdown report for pruning decisions.
 */
export function generatePruningMarkdown(
  decisions: ToolPruningDecision[],
  summary: PruningSummary
): string {
  const lines: string[] = [];

  lines.push('## Test Pruning Analysis');
  lines.push('');
  lines.push(`**Test Reduction: ${summary.overallReduction}%** (${summary.totalCategoriesWithPruning}/${summary.totalCategoriesWithoutPruning} categories)`);
  lines.push('');

  // Summary stats
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Tools Analyzed | ${summary.totalTools} |`);
  lines.push(`| Categories Without Pruning | ${summary.totalCategoriesWithoutPruning} |`);
  lines.push(`| Categories With Pruning | ${summary.totalCategoriesWithPruning} |`);
  lines.push(`| Reduction | ${summary.overallReduction}% |`);
  lines.push('');

  // High priority tools
  if (summary.highPriorityTools.length > 0) {
    lines.push('### High Priority Tools');
    lines.push('');
    lines.push('These tools have elevated testing priority:');
    lines.push('');
    for (const tool of summary.highPriorityTools) {
      const decision = decisions.find(d => d.toolName === tool);
      if (decision) {
        lines.push(`- \`${tool}\` (priority: ${decision.priority})`);
      }
    }
    lines.push('');
  }

  // Pruning details for top tools
  lines.push('### Pruning Decisions');
  lines.push('');
  lines.push('| Tool | Priority | Run | Skip | Reduction |');
  lines.push('|------|----------|-----|------|-----------|');

  const topDecisions = prioritizeTools(decisions).slice(0, 15);
  for (const d of topDecisions) {
    lines.push(
      `| \`${d.toolName}\` | ${d.priority} | ${d.categoriesToRun.length} | ${d.categoriesToSkip.length} | ${d.reductionPercent}% |`
    );
  }

  if (decisions.length > 15) {
    lines.push(`| ... | ... | ... | ... | ... |`);
    lines.push(`| *${decisions.length - 15} more tools* | | | | |`);
  }

  lines.push('');

  return lines.join('\n');
}
