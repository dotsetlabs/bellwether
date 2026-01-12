/**
 * Prompt templates for LLM-guided interview and analysis.
 *
 * All prompts are extracted here for:
 * - Easier maintenance and versioning
 * - Consistent formatting
 * - Potential future i18n support
 * - Testing and validation
 */

import type { MCPTool, MCPToolCallResult } from '../transport/types.js';
import type { InterviewQuestion, ToolProfile, ServerContext } from '../interview/types.js';
import type { DiscoveryResult } from '../discovery/types.js';
import type { Persona } from '../persona/types.js';
import type { Workflow, WorkflowStep, WorkflowStepResult } from '../workflow/types.js';

// =============================================================================
// Default System Prompts
// =============================================================================

/**
 * Default system prompt for documentation-focused interviews.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a technical documentation assistant helping to generate API documentation for software tools. Your task is to create helpful usage examples and documentation that developers can reference. All examples you generate are for documentation purposes only and will be used in developer guides and API references. Focus on being helpful and educational.`;

// =============================================================================
// Question Generation Prompts
// =============================================================================

export interface QuestionGenerationContext {
  tool: MCPTool;
  maxQuestions: number;
  categoryGuidance: string;
  categoryList: string;
  skipErrorTests: boolean;
  serverContext?: ServerContext;
  previousErrors?: Array<{ args: Record<string, unknown>; error: string }>;
}

/**
 * Build server context section for prompts.
 */
function buildServerContextSection(ctx: ServerContext | undefined): string {
  const parts: string[] = [];

  if (ctx?.allowedDirectories && ctx.allowedDirectories.length > 0) {
    parts.push(`IMPORTANT - Allowed directories: ${ctx.allowedDirectories.join(', ')}`);
    parts.push(`All file/directory paths MUST be within these directories (e.g., ${ctx.allowedDirectories[0]}/example.txt)`);
  } else {
    // Provide guidance even without known allowed directories
    parts.push('Note: Use simple, absolute paths for file operations. Avoid nested subdirectories unless testing that specifically.');
  }

  if (ctx?.allowedHosts && ctx.allowedHosts.length > 0) {
    parts.push(`Allowed hosts: ${ctx.allowedHosts.join(', ')}`);
  }

  if (ctx?.constraints && ctx.constraints.length > 0) {
    parts.push(`Server constraints:\n${ctx.constraints.map(c => `- ${c}`).join('\n')}`);
  }

  if (ctx?.hints && ctx.hints.length > 0) {
    parts.push(`Hints:\n${ctx.hints.map(h => `- ${h}`).join('\n')}`);
  }

  return `\nServer Context:\n${parts.join('\n')}\n`;
}

/**
 * Build section about previous errors to avoid.
 */
function buildPreviousErrorsSection(errors: Array<{ args: Record<string, unknown>; error: string }> | undefined): string {
  if (!errors || errors.length === 0) return '';

  const errorExamples = errors.slice(0, 3).map(e =>
    `- Args: ${JSON.stringify(e.args)} → Error: ${e.error}`
  ).join('\n');

  return `
LEARN FROM PREVIOUS ERRORS:
The following arguments failed. Generate different arguments that avoid these issues:
${errorExamples}
`;
}

/**
 * Generate the prompt for creating interview questions for a tool.
 */
export function buildQuestionGenerationPrompt(ctx: QuestionGenerationContext): string {
  const schemaStr = ctx.tool.inputSchema
    ? JSON.stringify(ctx.tool.inputSchema, null, 2)
    : 'No schema provided';

  const serverContextSection = buildServerContextSection(ctx.serverContext);
  const previousErrorsSection = buildPreviousErrorsSection(ctx.previousErrors);

  return `You are generating test cases for an API tool.

Tool Name: ${ctx.tool.name}
Description: ${ctx.tool.description ?? 'No description provided'}
Input Schema:
${schemaStr}
${serverContextSection}${previousErrorsSection}
Create ${ctx.maxQuestions} test cases. Target distribution: ${ctx.categoryGuidance}.

${ctx.skipErrorTests ? 'Focus on successful usage examples only.' : ''}

Respond with a JSON array:
[
  {
    "description": "What this test demonstrates",
    "category": "happy_path",
    "args": { ... test arguments ... }
  }
]

Categories: ${ctx.categoryList}

Guidelines:
- Use realistic example values based on the schema
- For required parameters, always include them (except in error_handling tests)
- Keep descriptions under 100 characters
- Be creative with test scenarios based on the tool's purpose
${ctx.serverContext?.allowedDirectories ? `- For path parameters, ALWAYS use paths within: ${ctx.serverContext.allowedDirectories[0]} (e.g., "${ctx.serverContext.allowedDirectories[0]}/file.txt", NOT "${ctx.serverContext.allowedDirectories[0]}/subdir/file.txt" unless testing subdirectories)` : ''}
- For array parameters containing paths, each path should be a complete, valid path (e.g., ["/tmp/file1.txt", "/tmp/file2.txt"]), NOT nested paths

Respond with ONLY the JSON array.`;
}

// =============================================================================
// Response Analysis Prompts
// =============================================================================

export interface ResponseAnalysisContext {
  tool: MCPTool;
  question: InterviewQuestion;
  response: MCPToolCallResult | null;
  error: string | null;
  persona: Persona;
}

/**
 * Get focus guidance based on persona type.
 */
function getPersonaFocusGuidance(persona: Persona): string {
  switch (persona.id) {
    case 'security_tester':
      return 'Pay special attention to any security implications, information disclosure, or concerning patterns in the response.';
    case 'qa_engineer':
      return 'Focus on any unexpected behaviors, edge case handling, or potential reliability issues.';
    case 'novice_user':
      return 'Evaluate the clarity of any error messages and how helpful they are for fixing the problem.';
    default:
      return 'Focus on documenting the behavior for developer reference.';
  }
}

/**
 * Generate the prompt for analyzing a tool response.
 */
export function buildResponseAnalysisPrompt(ctx: ResponseAnalysisContext): string {
  const responseStr = ctx.error
    ? `Error: ${ctx.error}`
    : ctx.response
      ? JSON.stringify(ctx.response, null, 2)
      : 'No response';

  const focusGuidance = getPersonaFocusGuidance(ctx.persona);

  return `You called the MCP tool "${ctx.tool.name}" with these arguments:
${JSON.stringify(ctx.question.args, null, 2)}

Test category: ${ctx.question.category}
Test description: ${ctx.question.description}

The tool returned:
${responseStr}

Analyze this response in 1-2 sentences. ${focusGuidance}

Questions to consider:
1. What does this tell us about the tool's behavior?
2. Any unexpected behavior or limitations observed?

Be concise and factual.`;
}

// =============================================================================
// Tool Profile Synthesis Prompts
// =============================================================================

export interface ToolProfileSynthesisContext {
  tool: MCPTool;
  interactions: Array<{
    question: InterviewQuestion;
    response: MCPToolCallResult | null;
    error: string | null;
    analysis: string;
  }>;
}

/**
 * Generate the prompt for synthesizing a tool profile.
 */
export function buildToolProfileSynthesisPrompt(ctx: ToolProfileSynthesisContext): string {
  const interactionSummary = ctx.interactions
    .map((i, idx) => `${idx + 1}. ${i.question.description}\n   Result: ${i.analysis}`)
    .join('\n\n');

  return `Based on these interview interactions with the "${ctx.tool.name}" tool, synthesize the findings.

Tool Description: ${ctx.tool.description ?? 'No description'}

Interactions:
${interactionSummary}

Generate a JSON object with:
{
  "behavioralNotes": ["Note about behavior 1", "Note about behavior 2"],
  "limitations": ["Limitation 1", "Limitation 2"],
  "securityNotes": ["Security consideration 1"]
}

Keep each note under 150 characters. Only include security notes if there are genuine concerns.
Return ONLY the JSON object.`;
}

// =============================================================================
// Overall Summary Prompts
// =============================================================================

export interface OverallSynthesisContext {
  discovery: DiscoveryResult;
  toolProfiles: ToolProfile[];
}

/**
 * Generate the prompt for synthesizing overall interview results.
 */
export function buildOverallSynthesisPrompt(ctx: OverallSynthesisContext): string {
  const profileSummary = ctx.toolProfiles
    .map(p => `- ${p.name}: ${p.behavioralNotes[0] ?? 'No notes'}`)
    .join('\n');

  return `Summarize the capabilities of this MCP server based on the interview findings.

Server: ${ctx.discovery.serverInfo.name} v${ctx.discovery.serverInfo.version}
Tools (${ctx.discovery.tools.length}):
${profileSummary}

Generate a JSON object with:
{
  "summary": "2-3 sentence high-level summary of what this server does",
  "limitations": ["Overall limitation 1", "Overall limitation 2"],
  "recommendations": ["Usage recommendation 1", "Usage recommendation 2"]
}

Be concise and practical. Focus on helping a developer understand how to use this server effectively.
Return ONLY the JSON object.`;
}

// =============================================================================
// Workflow Analysis Prompts
// =============================================================================

export interface WorkflowStepAnalysisContext {
  workflow: Workflow;
  step: WorkflowStep;
  stepIndex: number;
  response: MCPToolCallResult | null;
  error: string | undefined;
}

/**
 * Generate the prompt for analyzing a workflow step.
 */
export function buildWorkflowStepAnalysisPrompt(ctx: WorkflowStepAnalysisContext): string {
  const responseStr = ctx.error
    ? `Error: ${ctx.error}`
    : ctx.response
      ? JSON.stringify(ctx.response, null, 2)
      : 'No response';

  return `Analyze this workflow step result.

Workflow: ${ctx.workflow.name}
Step ${ctx.stepIndex + 1}/${ctx.workflow.steps.length}: ${ctx.step.description}
Tool: ${ctx.step.tool}
Arguments: ${JSON.stringify(ctx.step.args ?? {}, null, 2)}

Response:
${responseStr}

Provide a brief (1-2 sentence) analysis of what this step accomplished and any notable observations.`;
}

export interface WorkflowSummaryContext {
  workflow: Workflow;
  stepResults: WorkflowStepResult[];
  success: boolean;
}

/**
 * Generate the prompt for summarizing a workflow execution.
 */
export function buildWorkflowSummaryPrompt(ctx: WorkflowSummaryContext): string {
  const stepSummaries = ctx.stepResults.map((r, i) => {
    const status = r.success ? '✓' : '✗';
    return `${i + 1}. ${status} ${r.step.description}: ${r.analysis ?? (r.error || 'Completed')}`;
  }).join('\n');

  return `Summarize this workflow execution.

Workflow: ${ctx.workflow.name}
Description: ${ctx.workflow.description}
Expected Outcome: ${ctx.workflow.expectedOutcome}
Overall Success: ${ctx.success}

Step Results:
${stepSummaries}

Provide a 2-3 sentence summary of what the workflow demonstrated and any significant findings.`;
}

// =============================================================================
// Completion Options Constants
// =============================================================================

/**
 * Standard completion options for different prompt types.
 */
export const COMPLETION_OPTIONS = {
  /** For question generation - slightly higher temperature for variety */
  questionGeneration: {
    temperature: 0.4,
    responseFormat: 'json' as const,
  },
  /** For response analysis - lower temperature for consistency */
  responseAnalysis: {
    temperature: 0.3,
    maxTokens: 200,
  },
  /** For profile synthesis - structured output */
  profileSynthesis: {
    temperature: 0.3,
    responseFormat: 'json' as const,
  },
  /** For overall summary - structured output */
  overallSynthesis: {
    temperature: 0.3,
    responseFormat: 'json' as const,
  },
  /** For workflow step analysis */
  workflowStepAnalysis: {
    temperature: 0.3,
    maxTokens: 150,
  },
  /** For workflow summary */
  workflowSummary: {
    temperature: 0.3,
    maxTokens: 200,
  },
} as const;
