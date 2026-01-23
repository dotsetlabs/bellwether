/**
 * AI Agent Compatibility Scoring.
 *
 * Evaluates how well an MCP server is designed for AI agent consumption.
 * Scores tools based on description clarity, parameter naming, error quality,
 * example completeness, workflow documentation, and response predictability.
 */

import type { MCPTool } from '../transport/types.js';
import type { ToolFingerprint, ResponseSchemaEvolution } from './types.js';
import type { ErrorPattern } from './response-fingerprint.js';
import { AI_COMPATIBILITY } from '../constants.js';

/**
 * Individual component of the AI compatibility score.
 */
export interface ScoreComponent {
  /** Score value (0-100) */
  score: number;
  /** Weight in overall score (0-1) */
  weight: number;
  /** Weighted contribution to overall score */
  weightedScore: number;
  /** Human-readable notes about this component */
  notes: string[];
}

/**
 * Complete AI compatibility score breakdown.
 */
export interface AICompatibilityScore {
  /** Overall score (0-100) */
  overall: number;
  /** Letter grade */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Score breakdown by component */
  breakdown: {
    descriptionClarity: ScoreComponent;
    parameterNaming: ScoreComponent;
    errorMessageQuality: ScoreComponent;
    exampleCompleteness: ScoreComponent;
    workflowDocumentation: ScoreComponent;
    responsePredictability: ScoreComponent;
  };
  /** Actionable recommendations for improvement */
  recommendations: AICompatibilityRecommendation[];
  /** Per-tool scores for detailed analysis */
  toolScores: ToolAIScore[];
}

/**
 * A single recommendation for improving AI compatibility.
 */
export interface AICompatibilityRecommendation {
  /** Priority of this recommendation (1 = highest) */
  priority: number;
  /** Category this recommendation addresses */
  category: keyof AICompatibilityScore['breakdown'];
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** Affected tools (if applicable) */
  affectedTools?: string[];
  /** Potential score improvement if fixed */
  potentialImprovement: number;
}

/**
 * AI compatibility score for a single tool.
 */
export interface ToolAIScore {
  /** Tool name */
  toolName: string;
  /** Overall tool score (0-100) */
  score: number;
  /** Issues found for this tool */
  issues: string[];
}

/**
 * Input data for scoring (combines MCPTool with baseline fingerprint).
 */
export interface AICompatibilityInput {
  /** Tool definition from MCP */
  tool: MCPTool;
  /** Fingerprint from baseline (may have additional data) */
  fingerprint?: ToolFingerprint;
  /** Error patterns observed for this tool */
  errorPatterns?: ErrorPattern[];
  /** Response schema evolution data */
  schemaEvolution?: ResponseSchemaEvolution;
}

/**
 * Calculate AI compatibility score for a set of tools.
 */
export function calculateAICompatibilityScore(
  inputs: AICompatibilityInput[]
): AICompatibilityScore {
  if (inputs.length === 0) {
    return createEmptyScore();
  }

  // Calculate individual component scores
  const descriptionClarity = scoreDescriptionClarity(inputs);
  const parameterNaming = scoreParameterNaming(inputs);
  const errorMessageQuality = scoreErrorMessageQuality(inputs);
  const exampleCompleteness = scoreExampleCompleteness(inputs);
  const workflowDocumentation = scoreWorkflowDocumentation(inputs);
  const responsePredictability = scoreResponsePredictability(inputs);

  // Calculate weighted overall score
  const overall = Math.round(
    descriptionClarity.weightedScore +
    parameterNaming.weightedScore +
    errorMessageQuality.weightedScore +
    exampleCompleteness.weightedScore +
    workflowDocumentation.weightedScore +
    responsePredictability.weightedScore
  );

  // Determine grade
  const grade = calculateGrade(overall);

  // Calculate per-tool scores
  const toolScores = inputs.map(input => calculateToolScore(input));

  // Generate recommendations
  const recommendations = generateRecommendations({
    descriptionClarity,
    parameterNaming,
    errorMessageQuality,
    exampleCompleteness,
    workflowDocumentation,
    responsePredictability,
  }, inputs, toolScores);

  return {
    overall,
    grade,
    breakdown: {
      descriptionClarity,
      parameterNaming,
      errorMessageQuality,
      exampleCompleteness,
      workflowDocumentation,
      responsePredictability,
    },
    recommendations,
    toolScores,
  };
}

/**
 * Score description clarity across all tools.
 * Checks for: minimum length, action verbs, purpose explanation, input/output mentions.
 */
function scoreDescriptionClarity(inputs: AICompatibilityInput[]): ScoreComponent {
  const weight = AI_COMPATIBILITY.WEIGHTS.descriptionClarity;
  const notes: string[] = [];
  let totalScore = 0;

  for (const { tool } of inputs) {
    let toolScore = 0;
    const description = tool.description || '';

    // Check minimum length
    if (description.length >= AI_COMPATIBILITY.DESCRIPTION.GOOD_LENGTH) {
      toolScore += AI_COMPATIBILITY.DESCRIPTION.POINTS.GOOD_LENGTH;
    } else if (description.length >= AI_COMPATIBILITY.DESCRIPTION.MIN_LENGTH) {
      toolScore += AI_COMPATIBILITY.DESCRIPTION.POINTS.MIN_LENGTH;
    }

    // Check for action verb at start
    if (AI_COMPATIBILITY.DESCRIPTION.ACTION_VERB_PATTERN.test(description)) {
      toolScore += AI_COMPATIBILITY.DESCRIPTION.POINTS.ACTION_VERB;
    }

    // Check for purpose explanation
    if (AI_COMPATIBILITY.DESCRIPTION.PURPOSE_PATTERN.test(description)) {
      toolScore += AI_COMPATIBILITY.DESCRIPTION.POINTS.PURPOSE;
    }

    // Check for input/output mentions
    if (AI_COMPATIBILITY.DESCRIPTION.IO_PATTERN.test(description)) {
      toolScore += AI_COMPATIBILITY.DESCRIPTION.POINTS.IO_MENTION;
    }

    totalScore += Math.min(toolScore, 100);
  }

  const score = Math.round(totalScore / inputs.length);

  // Add notes based on common issues
  const shortDescriptions = inputs.filter(
    i => (i.tool.description || '').length < AI_COMPATIBILITY.DESCRIPTION.MIN_LENGTH
  );
  if (shortDescriptions.length > 0) {
    notes.push(`${shortDescriptions.length} tool(s) have short descriptions (<${AI_COMPATIBILITY.DESCRIPTION.MIN_LENGTH} chars)`);
  }

  const missingActionVerbs = inputs.filter(
    i => !AI_COMPATIBILITY.DESCRIPTION.ACTION_VERB_PATTERN.test(i.tool.description || '')
  );
  if (missingActionVerbs.length > inputs.length / 2) {
    notes.push('Many tools lack action verbs in descriptions');
  }

  if (notes.length === 0 && score >= 80) {
    notes.push('Good description clarity across tools');
  }

  return {
    score,
    weight,
    weightedScore: score * weight,
    notes,
  };
}

/**
 * Score parameter naming quality.
 * Checks for: descriptive names, consistent casing, common conventions.
 */
function scoreParameterNaming(inputs: AICompatibilityInput[]): ScoreComponent {
  const weight = AI_COMPATIBILITY.WEIGHTS.parameterNaming;
  const notes: string[] = [];
  let totalParams = 0;
  let goodParams = 0;
  const badNames: string[] = [];

  for (const { tool } of inputs) {
    const schema = tool.inputSchema as {
      properties?: Record<string, unknown>;
    } | undefined;

    if (!schema?.properties) continue;

    for (const paramName of Object.keys(schema.properties)) {
      totalParams++;

      // Check for generic/bad names
      if (AI_COMPATIBILITY.PARAMETER.BAD_NAMES.includes(paramName.toLowerCase())) {
        badNames.push(`${tool.name}.${paramName}`);
        continue;
      }

      // Check for minimum length
      if (paramName.length < AI_COMPATIBILITY.PARAMETER.MIN_NAME_LENGTH) {
        continue;
      }

      // Check for consistent casing (snake_case or camelCase)
      const isSnakeCase = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(paramName);
      const isCamelCase = /^[a-z][a-zA-Z0-9]*$/.test(paramName);
      if (!isSnakeCase && !isCamelCase) {
        continue;
      }

      goodParams++;
    }
  }

  const score = totalParams > 0 ? Math.round((goodParams / totalParams) * 100) : 100;

  if (badNames.length > 0) {
    const displayNames = badNames.slice(0, 3).join(', ');
    const more = badNames.length > 3 ? ` and ${badNames.length - 3} more` : '';
    notes.push(`Generic names found: ${displayNames}${more}`);
  }

  if (score >= 90) {
    notes.push('Excellent parameter naming conventions');
  } else if (score < 60) {
    notes.push('Many parameters have non-descriptive names');
  }

  return {
    score,
    weight,
    weightedScore: score * weight,
    notes,
  };
}

/**
 * Score error message quality.
 * Checks for: actionable messages, remediation hints, consistent format.
 */
function scoreErrorMessageQuality(inputs: AICompatibilityInput[]): ScoreComponent {
  const weight = AI_COMPATIBILITY.WEIGHTS.errorMessageQuality;
  const notes: string[] = [];
  let totalErrors = 0;
  let goodErrors = 0;
  const poorErrors: string[] = [];

  for (const { errorPatterns } of inputs) {
    if (!errorPatterns) continue;

    for (const pattern of errorPatterns) {
      totalErrors++;

      const message = pattern.example || '';
      let quality = 0;

      // Check for minimum length
      if (message.length >= AI_COMPATIBILITY.ERROR.MIN_MESSAGE_LENGTH) {
        quality++;
      }

      // Check for actionable content (contains suggestion/fix)
      if (AI_COMPATIBILITY.ERROR.ACTIONABLE_PATTERN.test(message)) {
        quality++;
      }

      // Check for remediation hints
      if (AI_COMPATIBILITY.ERROR.REMEDIATION_PATTERN.test(message)) {
        quality++;
      }

      // Good error messages have at least 2 quality indicators
      if (quality >= 2) {
        goodErrors++;
      } else if (quality === 0 && message.length > 0) {
        poorErrors.push(message.slice(0, 50));
      }
    }
  }

  // If no errors were observed, give a neutral score
  const score = totalErrors > 0
    ? Math.round((goodErrors / totalErrors) * 100)
    : AI_COMPATIBILITY.ERROR.DEFAULT_SCORE;

  if (totalErrors === 0) {
    notes.push('No error patterns observed (run with more test cases)');
  } else if (poorErrors.length > 0) {
    notes.push(`${poorErrors.length} error message(s) lack actionable guidance`);
  }

  if (score >= 80 && totalErrors > 0) {
    notes.push('Error messages provide good guidance');
  }

  return {
    score,
    weight,
    weightedScore: score * weight,
    notes,
  };
}

/**
 * Score example completeness.
 * Checks for: non-truncated examples, variety of examples, example coverage.
 */
function scoreExampleCompleteness(inputs: AICompatibilityInput[]): ScoreComponent {
  const weight = AI_COMPATIBILITY.WEIGHTS.exampleCompleteness;
  const notes: string[] = [];
  let toolsWithExamples = 0;
  let truncatedExamples = 0;

  for (const { fingerprint } of inputs) {
    // Check if tool has response data (indicates examples exist)
    if (fingerprint?.responseFingerprint) {
      toolsWithExamples++;

      // Check for truncation indicators
      const raw = JSON.stringify(fingerprint.responseFingerprint);
      if (raw.includes('...') || raw.includes('truncated')) {
        truncatedExamples++;
      }
    }
  }

  const coverage = inputs.length > 0 ? toolsWithExamples / inputs.length : 0;
  const truncationPenalty = toolsWithExamples > 0
    ? truncatedExamples / toolsWithExamples
    : 0;

  // Score based on coverage and truncation
  const score = Math.round(
    (coverage * AI_COMPATIBILITY.EXAMPLE.COVERAGE_WEIGHT +
    (1 - truncationPenalty) * AI_COMPATIBILITY.EXAMPLE.QUALITY_WEIGHT) * 100
  );

  if (truncatedExamples > 0) {
    notes.push(`${truncatedExamples} tool(s) have truncated examples`);
  }

  if (coverage < 0.5) {
    notes.push('Less than half of tools have captured examples');
  } else if (coverage === 1 && truncatedExamples === 0) {
    notes.push('Full example coverage with no truncation');
  }

  return {
    score,
    weight,
    weightedScore: score * weight,
    notes,
  };
}

/**
 * Score workflow documentation quality.
 * Checks for: sequence descriptions, dependency hints, multi-step guidance.
 */
function scoreWorkflowDocumentation(inputs: AICompatibilityInput[]): ScoreComponent {
  const weight = AI_COMPATIBILITY.WEIGHTS.workflowDocumentation;
  const notes: string[] = [];
  let toolsWithSequenceHints = 0;
  let toolsWithDependencyHints = 0;

  for (const { tool } of inputs) {
    const description = (tool.description || '').toLowerCase();

    // Check for sequence hints
    if (AI_COMPATIBILITY.WORKFLOW.SEQUENCE_PATTERN.test(description)) {
      toolsWithSequenceHints++;
    }

    // Check for dependency hints
    if (AI_COMPATIBILITY.WORKFLOW.DEPENDENCY_PATTERN.test(description)) {
      toolsWithDependencyHints++;
    }
  }

  // Calculate score based on presence of workflow hints
  const sequenceRatio = inputs.length > 0 ? toolsWithSequenceHints / inputs.length : 0;
  const dependencyRatio = inputs.length > 0 ? toolsWithDependencyHints / inputs.length : 0;

  // Workflow documentation is good if at least some tools have hints
  // But we don't penalize heavily if tools are independent
  const score = Math.round(
    Math.min(100, 50 + sequenceRatio * 25 + dependencyRatio * 25)
  );

  if (toolsWithSequenceHints > 0) {
    notes.push(`${toolsWithSequenceHints} tool(s) describe execution sequences`);
  }

  if (toolsWithDependencyHints > 0) {
    notes.push(`${toolsWithDependencyHints} tool(s) mention dependencies`);
  }

  if (score < 60 && inputs.length > 3) {
    notes.push('Consider adding workflow guidance to descriptions');
  }

  return {
    score,
    weight,
    weightedScore: score * weight,
    notes,
  };
}

/**
 * Score response predictability.
 * Checks for: schema stability, consistent structure, type consistency.
 */
function scoreResponsePredictability(inputs: AICompatibilityInput[]): ScoreComponent {
  const weight = AI_COMPATIBILITY.WEIGHTS.responsePredictability;
  const notes: string[] = [];
  let stableTools = 0;
  const unstableTools: string[] = [];

  for (const { tool, schemaEvolution } of inputs) {
    if (!schemaEvolution) {
      // No evolution data - assume stable
      stableTools++;
      continue;
    }

    // Check stability based on schema evolution data
    if (schemaEvolution.isStable) {
      stableTools++;
    } else {
      unstableTools.push(tool.name);
    }
  }

  const score = inputs.length > 0
    ? Math.round((stableTools / inputs.length) * 100)
    : AI_COMPATIBILITY.RESPONSE.DEFAULT_SCORE;

  if (unstableTools.length > 0) {
    const displayTools = unstableTools.slice(0, 3).join(', ');
    const more = unstableTools.length > 3 ? ` and ${unstableTools.length - 3} more` : '';
    notes.push(`Unstable responses: ${displayTools}${more}`);
  }

  if (score >= 90) {
    notes.push('Highly predictable response structures');
  }

  return {
    score,
    weight,
    weightedScore: score * weight,
    notes,
  };
}

/**
 * Calculate score for a single tool.
 */
function calculateToolScore(input: AICompatibilityInput): ToolAIScore {
  const issues: string[] = [];
  let score = 100;

  const { tool, errorPatterns, schemaEvolution } = input;
  const description = tool.description || '';

  // Description issues
  if (description.length < AI_COMPATIBILITY.DESCRIPTION.MIN_LENGTH) {
    score -= 15;
    issues.push('Short or missing description');
  } else if (!AI_COMPATIBILITY.DESCRIPTION.ACTION_VERB_PATTERN.test(description)) {
    score -= 5;
    issues.push('Description lacks action verb');
  }

  // Parameter issues
  const schema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
  if (schema?.properties) {
    for (const paramName of Object.keys(schema.properties)) {
      if (AI_COMPATIBILITY.PARAMETER.BAD_NAMES.includes(paramName.toLowerCase())) {
        score -= 10;
        issues.push(`Generic parameter name: ${paramName}`);
        break; // Only penalize once per tool
      }
    }
  }

  // Error quality issues
  if (errorPatterns && errorPatterns.length > 0) {
    const poorErrors = errorPatterns.filter(e => {
      const msg = e.example || '';
      return msg.length < AI_COMPATIBILITY.ERROR.MIN_MESSAGE_LENGTH ||
        (!AI_COMPATIBILITY.ERROR.ACTIONABLE_PATTERN.test(msg) &&
         !AI_COMPATIBILITY.ERROR.REMEDIATION_PATTERN.test(msg));
    });
    if (poorErrors.length > errorPatterns.length / 2) {
      score -= 10;
      issues.push('Error messages lack guidance');
    }
  }

  // Response stability issues
  if (schemaEvolution && !schemaEvolution.isStable) {
    score -= 15;
    issues.push('Response structure is unstable');
  }

  return {
    toolName: tool.name,
    score: Math.max(0, score),
    issues,
  };
}

/**
 * Generate actionable recommendations based on scores.
 */
function generateRecommendations(
  breakdown: AICompatibilityScore['breakdown'],
  inputs: AICompatibilityInput[],
  toolScores: ToolAIScore[]
): AICompatibilityRecommendation[] {
  const recommendations: AICompatibilityRecommendation[] = [];
  let priority = 1;

  // Recommend based on lowest-scoring components
  const components = Object.entries(breakdown) as [keyof typeof breakdown, ScoreComponent][];
  const sortedComponents = components.sort((a, b) => a[1].score - b[1].score);

  for (const [category, component] of sortedComponents) {
    if (component.score >= AI_COMPATIBILITY.RECOMMENDATION_THRESHOLD) continue;

    const affectedTools = toolScores
      .filter(t => t.issues.some(i => isIssueRelatedToCategory(i, category)))
      .map(t => t.toolName);

    const recommendation = createRecommendation(
      category,
      component,
      affectedTools,
      priority++,
      inputs
    );

    if (recommendation) {
      recommendations.push(recommendation);
    }

    // Limit recommendations
    if (recommendations.length >= AI_COMPATIBILITY.MAX_RECOMMENDATIONS) {
      break;
    }
  }

  return recommendations;
}

/**
 * Check if an issue is related to a scoring category.
 */
function isIssueRelatedToCategory(issue: string, category: string): boolean {
  const categoryKeywords: Record<string, string[]> = {
    descriptionClarity: ['description', 'action verb'],
    parameterNaming: ['parameter', 'name', 'generic'],
    errorMessageQuality: ['error', 'message', 'guidance'],
    exampleCompleteness: ['example', 'truncated'],
    workflowDocumentation: ['workflow', 'sequence', 'dependency'],
    responsePredictability: ['response', 'unstable', 'structure'],
  };

  const keywords = categoryKeywords[category] || [];
  return keywords.some(kw => issue.toLowerCase().includes(kw));
}

/**
 * Create a specific recommendation for a category.
 */
function createRecommendation(
  category: keyof AICompatibilityScore['breakdown'],
  component: ScoreComponent,
  affectedTools: string[],
  priority: number,
  inputs: AICompatibilityInput[]
): AICompatibilityRecommendation | null {
  const potentialImprovement = Math.round((100 - component.score) * component.weight);

  switch (category) {
    case 'descriptionClarity': {
      const shortDescTools = inputs
        .filter(i => (i.tool.description || '').length < AI_COMPATIBILITY.DESCRIPTION.MIN_LENGTH)
        .map(i => i.tool.name);
      return {
        priority,
        category,
        title: 'Improve tool descriptions',
        description: `Add clear, action-oriented descriptions (${AI_COMPATIBILITY.DESCRIPTION.MIN_LENGTH}+ chars) that explain what each tool does and when to use it.`,
        affectedTools: shortDescTools.length > 0 ? shortDescTools : affectedTools,
        potentialImprovement,
      };
    }

    case 'parameterNaming':
      return {
        priority,
        category,
        title: 'Use descriptive parameter names',
        description: 'Replace generic names (data, value, input) with specific, semantic names (transactionData, accountId, searchQuery).',
        affectedTools,
        potentialImprovement,
      };

    case 'errorMessageQuality':
      return {
        priority,
        category,
        title: 'Add remediation hints to errors',
        description: 'Include suggestions for fixing errors (e.g., "Invalid date format. Expected: YYYY-MM-DD").',
        affectedTools,
        potentialImprovement,
      };

    case 'exampleCompleteness':
      return {
        priority,
        category,
        title: 'Expand examples',
        description: 'Run with --full-examples to capture complete output samples for AI agent reference.',
        affectedTools,
        potentialImprovement,
      };

    case 'workflowDocumentation':
      return {
        priority,
        category,
        title: 'Document tool workflows',
        description: 'Add sequence/dependency hints to descriptions (e.g., "Call after create_user" or "Requires valid access_token").',
        affectedTools,
        potentialImprovement,
      };

    case 'responsePredictability':
      return {
        priority,
        category,
        title: 'Stabilize response structures',
        description: 'Ensure tools return consistent field names and types across calls.',
        affectedTools,
        potentialImprovement,
      };

    default:
      return null;
  }
}

/**
 * Calculate letter grade from score.
 */
function calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= AI_COMPATIBILITY.GRADE_THRESHOLDS.A) return 'A';
  if (score >= AI_COMPATIBILITY.GRADE_THRESHOLDS.B) return 'B';
  if (score >= AI_COMPATIBILITY.GRADE_THRESHOLDS.C) return 'C';
  if (score >= AI_COMPATIBILITY.GRADE_THRESHOLDS.D) return 'D';
  return 'F';
}

/**
 * Create an empty score for servers with no tools.
 */
function createEmptyScore(): AICompatibilityScore {
  const emptyComponent = (): ScoreComponent => ({
    score: 0,
    weight: 0,
    weightedScore: 0,
    notes: ['No tools available'],
  });

  return {
    overall: 0,
    grade: 'F',
    breakdown: {
      descriptionClarity: emptyComponent(),
      parameterNaming: emptyComponent(),
      errorMessageQuality: emptyComponent(),
      exampleCompleteness: emptyComponent(),
      workflowDocumentation: emptyComponent(),
      responsePredictability: emptyComponent(),
    },
    recommendations: [],
    toolScores: [],
  };
}

/**
 * Generate markdown documentation for AI compatibility score.
 */
export function generateAICompatibilityMarkdown(score: AICompatibilityScore): string {
  const lines: string[] = [];

  lines.push('## AI Agent Compatibility');
  lines.push('');
  lines.push(`**Overall Score: ${score.overall}/100 (Grade ${score.grade})**`);
  lines.push('');

  // Breakdown table
  lines.push('| Factor | Score | Weight | Notes |');
  lines.push('|--------|-------|--------|-------|');

  const components = [
    { name: 'Description Clarity', key: 'descriptionClarity' },
    { name: 'Parameter Naming', key: 'parameterNaming' },
    { name: 'Error Messages', key: 'errorMessageQuality' },
    { name: 'Example Completeness', key: 'exampleCompleteness' },
    { name: 'Workflow Docs', key: 'workflowDocumentation' },
    { name: 'Response Predictability', key: 'responsePredictability' },
  ] as const;

  for (const { name, key } of components) {
    const component = score.breakdown[key];
    const weightPercent = Math.round(component.weight * 100);
    const notes = component.notes.join('; ') || '-';
    lines.push(`| ${name} | ${component.score}/100 | ${weightPercent}% | ${notes} |`);
  }

  lines.push('');

  // Recommendations
  if (score.recommendations.length > 0) {
    lines.push('### Improvement Recommendations');
    lines.push('');

    for (const rec of score.recommendations) {
      lines.push(`${rec.priority}. **${rec.title}** - ${rec.description}`);
      if (rec.affectedTools && rec.affectedTools.length > 0) {
        const tools = rec.affectedTools.slice(0, 5).map(t => `\`${t}\``).join(', ');
        const more = rec.affectedTools.length > 5 ? ` (+${rec.affectedTools.length - 5} more)` : '';
        lines.push(`   - Affects: ${tools}${more}`);
      }
    }

    lines.push('');
  }

  // Low-scoring tools
  const lowScoreTools = score.toolScores.filter(t => t.score < 70);
  if (lowScoreTools.length > 0) {
    lines.push('### Tools Needing Attention');
    lines.push('');
    lines.push('| Tool | Score | Issues |');
    lines.push('|------|-------|--------|');

    for (const tool of lowScoreTools.slice(0, 10)) {
      const issues = tool.issues.slice(0, 2).join('; ') || '-';
      lines.push(`| \`${tool.toolName}\` | ${tool.score}/100 | ${issues} |`);
    }

    if (lowScoreTools.length > 10) {
      lines.push(`| ... | ... | ${lowScoreTools.length - 10} more tools below 70 |`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
