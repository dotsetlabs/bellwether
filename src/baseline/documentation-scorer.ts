/**
 * Documentation quality scoring for MCP tools.
 *
 * Calculates documentation quality metrics including:
 * - Description coverage (percentage of tools with descriptions)
 * - Description quality (depth, clarity, actionable language)
 * - Parameter documentation (percentage of params documented)
 * - Example coverage (percentage of tools with examples)
 *
 * Overall score: 0-100 with grade A-F.
 */

import type { MCPTool } from '../transport/types.js';
import { DOCUMENTATION_SCORING } from '../constants.js';

// ==================== Types ====================

/**
 * Issue severity levels for documentation problems.
 */
export type DocumentationIssueSeverity = 'error' | 'warning' | 'info';

/**
 * Types of documentation issues that can be detected.
 */
export type DocumentationIssueType =
  | 'missing_description'
  | 'short_description'
  | 'missing_param_description'
  | 'no_examples';

/**
 * A specific documentation issue found during scoring.
 */
export interface DocumentationIssue {
  /** Tool name where issue was found */
  tool: string;
  /** Type of issue */
  type: DocumentationIssueType;
  /** Severity level */
  severity: DocumentationIssueSeverity;
  /** Human-readable message describing the issue */
  message: string;
  /** Parameter name (for parameter-specific issues) */
  paramName?: string;
}

/**
 * Component scores that make up the overall documentation score.
 */
export interface DocumentationComponents {
  /** Percentage of tools with descriptions (0-100) */
  descriptionCoverage: number;
  /** Quality score for descriptions (0-100) */
  descriptionQuality: number;
  /** Percentage of parameters with descriptions (0-100) */
  parameterDocumentation: number;
  /** Percentage of tools with examples (0-100) */
  exampleCoverage: number;
}

/**
 * Documentation grade (A-F).
 */
export type DocumentationGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Complete documentation quality score for a set of tools.
 */
export interface DocumentationScore {
  /** Overall score (0-100) */
  overallScore: number;
  /** Grade (A-F) */
  grade: DocumentationGrade;
  /** Component scores */
  components: DocumentationComponents;
  /** Specific issues found */
  issues: DocumentationIssue[];
  /** Improvement suggestions */
  suggestions: string[];
  /** Number of tools scored */
  toolCount: number;
}

/**
 * Score for a single tool's documentation.
 */
export interface ToolDocumentationScore {
  /** Tool name */
  tool: string;
  /** Individual score (0-100) */
  score: number;
  /** Issues found for this tool */
  issues: DocumentationIssue[];
}

/**
 * Change in documentation score between baselines.
 */
export interface DocumentationScoreChange {
  /** Previous overall score */
  previousScore: number;
  /** Current overall score */
  currentScore: number;
  /** Score change (positive = improved) */
  change: number;
  /** Previous grade */
  previousGrade: DocumentationGrade;
  /** Current grade */
  currentGrade: DocumentationGrade;
  /** Whether documentation improved */
  improved: boolean;
  /** Whether documentation degraded */
  degraded: boolean;
  /** Issues that were fixed */
  issuesFixed: number;
  /** New issues introduced */
  newIssues: number;
  /** Human-readable summary */
  summary: string;
}

/**
 * Serializable documentation score summary for baseline storage.
 */
export interface DocumentationScoreSummary {
  /** Overall score (0-100) */
  overallScore: number;
  /** Grade (A-F) */
  grade: string;
  /** Number of issues found */
  issueCount: number;
  /** Number of tools scored */
  toolCount: number;
}

// ==================== Main Scoring Functions ====================

/**
 * Score documentation quality for a set of tools.
 *
 * @param tools - Array of MCP tools to score
 * @returns Complete documentation score with components, issues, and suggestions
 */
export function scoreDocumentation(tools: MCPTool[]): DocumentationScore {
  if (tools.length === 0) {
    return {
      overallScore: 100,
      grade: 'A',
      components: {
        descriptionCoverage: 100,
        descriptionQuality: 100,
        parameterDocumentation: 100,
        exampleCoverage: 100,
      },
      issues: [],
      suggestions: [],
      toolCount: 0,
    };
  }

  // Score individual tools and collect issues
  const toolScores = tools.map(scoreToolDocumentation);
  const issues = toolScores.flatMap((t) => t.issues);

  // Calculate component scores
  const descriptionCoverage = calculateDescriptionCoverage(tools);
  const descriptionQuality = calculateDescriptionQuality(tools);
  const parameterDocumentation = calculateParameterDocumentation(tools);
  const exampleCoverage = calculateExampleCoverage(tools);

  // Calculate weighted overall score
  const weights = DOCUMENTATION_SCORING.WEIGHTS;
  const overallScore = Math.round(
    descriptionCoverage * weights.descriptionCoverage +
      descriptionQuality * weights.descriptionQuality +
      parameterDocumentation * weights.parameterDocumentation +
      exampleCoverage * weights.exampleCoverage
  );

  const grade = scoreToGrade(overallScore);
  const suggestions = generateSuggestions(issues, tools);

  return {
    overallScore,
    grade,
    components: {
      descriptionCoverage,
      descriptionQuality,
      parameterDocumentation,
      exampleCoverage,
    },
    issues,
    suggestions,
    toolCount: tools.length,
  };
}

/**
 * Score a single tool's documentation quality.
 *
 * @param tool - MCP tool to score
 * @returns Tool score with issues
 */
export function scoreToolDocumentation(tool: MCPTool): ToolDocumentationScore {
  const issues: DocumentationIssue[] = [];
  let score = 100;

  const penalties = DOCUMENTATION_SCORING.PENALTIES;
  const descConfig = DOCUMENTATION_SCORING.DESCRIPTION;

  // Check tool description
  const description = tool.description?.trim() ?? '';
  if (description.length === 0) {
    issues.push({
      tool: tool.name,
      type: 'missing_description',
      severity: DOCUMENTATION_SCORING.SEVERITY.missingDescription,
      message: `Tool "${tool.name}" has no description`,
    });
    score -= penalties.missingDescription;
  } else if (description.length < descConfig.MIN_ACCEPTABLE_LENGTH) {
    issues.push({
      tool: tool.name,
      type: 'short_description',
      severity: DOCUMENTATION_SCORING.SEVERITY.shortDescription,
      message: `Tool "${tool.name}" has a very short description (${description.length} chars)`,
    });
    score -= penalties.shortDescription;
  }

  // Check parameter descriptions
  const schema = tool.inputSchema as
    | {
        properties?: Record<string, { description?: string }>;
      }
    | undefined;

  if (schema?.properties) {
    const params = Object.entries(schema.properties);
    const undocumentedParams = params.filter(([_, p]) => !p.description?.trim());

    for (const [paramName] of undocumentedParams) {
      issues.push({
        tool: tool.name,
        type: 'missing_param_description',
        severity: DOCUMENTATION_SCORING.SEVERITY.missingParamDescription,
        message: `Parameter "${paramName}" in "${tool.name}" has no description`,
        paramName,
      });
    }

    if (undocumentedParams.length > 0 && params.length > 0) {
      const coverage = 1 - undocumentedParams.length / params.length;
      score -= Math.round((1 - coverage) * penalties.undocumentedParamMultiplier);
    }
  }

  return {
    tool: tool.name,
    score: Math.max(0, score),
    issues,
  };
}

// ==================== Component Score Calculations ====================

/**
 * Calculate description coverage score.
 * Percentage of tools that have non-empty descriptions.
 */
export function calculateDescriptionCoverage(tools: MCPTool[]): number {
  if (tools.length === 0) return 100;
  const withDescription = tools.filter((t) => t.description?.trim().length);
  return Math.round((withDescription.length / tools.length) * 100);
}

/**
 * Calculate description quality score.
 * Assesses length, imperative mood, behavior description, and examples.
 */
export function calculateDescriptionQuality(tools: MCPTool[]): number {
  if (tools.length === 0) return 100;

  const descConfig = DOCUMENTATION_SCORING.DESCRIPTION;
  let totalScore = 0;

  for (const tool of tools) {
    const desc = tool.description?.trim() ?? '';
    let score = 0;

    // Length scoring
    if (desc.length >= descConfig.MIN_GOOD_LENGTH) {
      score += descConfig.GOOD_LENGTH_SCORE;
    } else if (desc.length >= descConfig.MIN_ACCEPTABLE_LENGTH) {
      score += descConfig.ACCEPTABLE_LENGTH_SCORE;
    }

    // Check for imperative verb at start (e.g., "Creates", "Gets", "Sends")
    if (DOCUMENTATION_SCORING.IMPERATIVE_PATTERN.test(desc)) {
      score += descConfig.IMPERATIVE_VERB_BONUS;
    }

    // Check for mention of behavior or return value
    if (DOCUMENTATION_SCORING.BEHAVIOR_PATTERN.test(desc)) {
      score += descConfig.BEHAVIOR_DESCRIPTION_BONUS;
    }

    // Check for examples or specific details
    if (DOCUMENTATION_SCORING.EXAMPLES_PATTERN.test(desc)) {
      score += descConfig.EXAMPLES_BONUS;
    }

    totalScore += score;
  }

  return Math.round(totalScore / tools.length);
}

/**
 * Calculate parameter documentation score.
 * Percentage of parameters across all tools that have descriptions.
 */
export function calculateParameterDocumentation(tools: MCPTool[]): number {
  let totalParams = 0;
  let documentedParams = 0;

  for (const tool of tools) {
    const schema = tool.inputSchema as
      | {
          properties?: Record<string, { description?: string }>;
        }
      | undefined;

    if (schema?.properties) {
      for (const prop of Object.values(schema.properties)) {
        totalParams++;
        if (prop.description?.trim()) {
          documentedParams++;
        }
      }
    }
  }

  if (totalParams === 0) return 100;
  return Math.round((documentedParams / totalParams) * 100);
}

/**
 * Calculate example coverage score.
 * Percentage of tools that have schema-level or property-level examples.
 */
export function calculateExampleCoverage(tools: MCPTool[]): number {
  if (tools.length === 0) return 100;

  let toolsWithExamples = 0;
  for (const tool of tools) {
    if (hasExamples(tool)) {
      toolsWithExamples++;
    }
  }

  return Math.round((toolsWithExamples / tools.length) * 100);
}

/**
 * Check if a tool has any examples defined in its schema.
 */
export function hasExamples(tool: MCPTool): boolean {
  const schema = tool.inputSchema as
    | {
        examples?: unknown[];
        properties?: Record<string, { examples?: unknown[] }>;
      }
    | undefined;

  // Check for schema-level examples
  if (schema?.examples && schema.examples.length > 0) {
    return true;
  }

  // Check for property-level examples
  if (schema?.properties) {
    return Object.values(schema.properties).some((p) => p.examples?.length);
  }

  return false;
}

// ==================== Grade & Suggestions ====================

/**
 * Convert a numeric score to a letter grade.
 */
export function scoreToGrade(score: number): DocumentationGrade {
  const thresholds = DOCUMENTATION_SCORING.GRADE_THRESHOLDS;
  if (score >= thresholds.A) return 'A';
  if (score >= thresholds.B) return 'B';
  if (score >= thresholds.C) return 'C';
  if (score >= thresholds.D) return 'D';
  return 'F';
}

/**
 * Generate improvement suggestions based on issues found.
 */
export function generateSuggestions(issues: DocumentationIssue[], tools: MCPTool[]): string[] {
  const suggestions: string[] = [];
  const maxSuggestions = DOCUMENTATION_SCORING.MAX_SUGGESTIONS;

  // Suggest fixing missing descriptions
  const missingDescriptions = issues.filter((i) => i.type === 'missing_description');
  if (missingDescriptions.length > 0) {
    const toolNames = missingDescriptions.map((i) => i.tool);
    if (toolNames.length <= 3) {
      suggestions.push(`Add descriptions to tool(s): ${toolNames.join(', ')}`);
    } else {
      suggestions.push(
        `Add descriptions to ${missingDescriptions.length} tool(s) missing documentation`
      );
    }
  }

  // Suggest expanding short descriptions
  const shortDescriptions = issues.filter((i) => i.type === 'short_description');
  if (shortDescriptions.length > 0) {
    suggestions.push(
      `Expand descriptions for ${shortDescriptions.length} tool(s) to at least ${DOCUMENTATION_SCORING.DESCRIPTION.MIN_GOOD_LENGTH} characters`
    );
  }

  // Suggest adding parameter descriptions
  const missingParams = issues.filter((i) => i.type === 'missing_param_description');
  if (missingParams.length > 0) {
    const uniqueTools = new Set(missingParams.map((i) => i.tool));
    suggestions.push(
      `Add descriptions to ${missingParams.length} parameter(s) across ${uniqueTools.size} tool(s)`
    );
  }

  // Check for missing examples
  if (tools.length > 0) {
    const toolsWithoutExamples = tools.filter((t) => !hasExamples(t));
    const ratio = toolsWithoutExamples.length / tools.length;
    if (ratio > DOCUMENTATION_SCORING.EXAMPLES_SUGGESTION_THRESHOLD) {
      suggestions.push('Consider adding examples to tool schemas to improve documentation');
    }
  }

  return suggestions.slice(0, maxSuggestions);
}

// ==================== Comparison Functions ====================

/**
 * Compare documentation scores between baselines.
 *
 * @param previous - Previous documentation score (or summary)
 * @param current - Current documentation score
 * @returns Change analysis
 */
export function compareDocumentationScores(
  previous: DocumentationScore | DocumentationScoreSummary | undefined,
  current: DocumentationScore
): DocumentationScoreChange {
  if (!previous) {
    return {
      previousScore: 0,
      currentScore: current.overallScore,
      change: current.overallScore,
      previousGrade: 'F',
      currentGrade: current.grade,
      improved: current.overallScore > 0,
      degraded: false,
      issuesFixed: 0,
      newIssues: current.issues.length,
      summary: `Initial documentation score: ${current.overallScore} (${current.grade})`,
    };
  }

  const prevScore = previous.overallScore;
  const prevGrade = (previous.grade as DocumentationGrade) || scoreToGrade(prevScore);
  const prevIssueCount = 'issueCount' in previous ? previous.issueCount : previous.issues.length;

  const change = current.overallScore - prevScore;
  const improved = change > 0;
  const degraded = change < 0;

  // Calculate issues fixed/introduced
  const currentIssueCount = current.issues.length;
  const issuesFixed = Math.max(0, prevIssueCount - currentIssueCount);
  const newIssues = Math.max(0, currentIssueCount - prevIssueCount);

  // Generate summary
  let summary: string;
  if (change === 0) {
    summary = `Documentation score unchanged at ${current.overallScore} (${current.grade})`;
  } else if (improved) {
    summary = `Documentation improved: ${prevScore} -> ${current.overallScore} (+${change}) | Grade: ${prevGrade} -> ${current.grade}`;
  } else {
    summary = `Documentation degraded: ${prevScore} -> ${current.overallScore} (${change}) | Grade: ${prevGrade} -> ${current.grade}`;
  }

  return {
    previousScore: prevScore,
    currentScore: current.overallScore,
    change,
    previousGrade: prevGrade,
    currentGrade: current.grade,
    improved,
    degraded,
    issuesFixed,
    newIssues,
    summary,
  };
}

// ==================== Formatting Functions ====================

/**
 * Format documentation score as a human-readable string.
 */
export function formatDocumentationScore(score: DocumentationScore): string {
  const lines: string[] = [];

  lines.push(`Documentation Quality: ${score.overallScore}/100 (${score.grade})`);
  lines.push('');
  lines.push('Components:');
  lines.push(`  Description Coverage: ${score.components.descriptionCoverage}%`);
  lines.push(`  Description Quality: ${score.components.descriptionQuality}%`);
  lines.push(`  Parameter Documentation: ${score.components.parameterDocumentation}%`);
  lines.push(`  Example Coverage: ${score.components.exampleCoverage}%`);

  if (score.issues.length > 0) {
    lines.push('');
    lines.push(`Issues (${score.issues.length}):`);
    const issuesByType = groupIssuesByType(score.issues);
    for (const [type, issues] of Object.entries(issuesByType)) {
      lines.push(`  ${formatIssueType(type)}: ${issues.length}`);
    }
  }

  if (score.suggestions.length > 0) {
    lines.push('');
    lines.push('Suggestions:');
    for (const suggestion of score.suggestions) {
      lines.push(`  - ${suggestion}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format documentation score as a compact one-line summary.
 */
export function formatDocumentationScoreCompact(score: DocumentationScore): string {
  const issueCount = score.issues.length;
  const issueSuffix = issueCount > 0 ? ` | ${issueCount} issue(s)` : '';
  return `Documentation: ${score.overallScore}/100 (${score.grade})${issueSuffix}`;
}

/**
 * Format documentation score change as a human-readable string.
 */
export function formatDocumentationScoreChange(change: DocumentationScoreChange): string {
  const lines: string[] = [];

  lines.push(change.summary);

  if (change.issuesFixed > 0) {
    lines.push(`  Issues fixed: ${change.issuesFixed}`);
  }
  if (change.newIssues > 0) {
    lines.push(`  New issues: ${change.newIssues}`);
  }

  return lines.join('\n');
}

/**
 * Convert documentation score to a serializable summary for baseline storage.
 */
export function toDocumentationScoreSummary(score: DocumentationScore): DocumentationScoreSummary {
  return {
    overallScore: score.overallScore,
    grade: score.grade,
    issueCount: score.issues.length,
    toolCount: score.toolCount,
  };
}

// ==================== Helpers ====================

/**
 * Group issues by their type.
 */
function groupIssuesByType(issues: DocumentationIssue[]): Record<string, DocumentationIssue[]> {
  const grouped: Record<string, DocumentationIssue[]> = {};
  for (const issue of issues) {
    if (!grouped[issue.type]) {
      grouped[issue.type] = [];
    }
    grouped[issue.type].push(issue);
  }
  return grouped;
}

/**
 * Format issue type for display.
 */
function formatIssueType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Get the text indicator for a documentation grade.
 */
export function getGradeIndicator(grade: DocumentationGrade): string {
  switch (grade) {
    case 'A':
      return '+';
    case 'B':
      return '+';
    case 'C':
      return '~';
    case 'D':
      return '!';
    case 'F':
      return '-';
  }
}

/**
 * Get the badge color for a documentation grade.
 */
export function getGradeBadgeColor(
  grade: DocumentationGrade
): 'green' | 'yellow' | 'orange' | 'red' {
  switch (grade) {
    case 'A':
      return 'green';
    case 'B':
      return 'green';
    case 'C':
      return 'yellow';
    case 'D':
      return 'orange';
    case 'F':
      return 'red';
  }
}

/**
 * Check if a documentation score meets a minimum threshold.
 */
export function meetsDocumentationThreshold(score: DocumentationScore, minScore: number): boolean {
  return score.overallScore >= minScore;
}

/**
 * Check if documentation score meets a minimum grade.
 */
export function meetsDocumentationGrade(
  score: DocumentationScore,
  minGrade: DocumentationGrade
): boolean {
  const gradeOrder: DocumentationGrade[] = ['F', 'D', 'C', 'B', 'A'];
  const scoreIndex = gradeOrder.indexOf(score.grade);
  const minIndex = gradeOrder.indexOf(minGrade);
  return scoreIndex >= minIndex;
}
