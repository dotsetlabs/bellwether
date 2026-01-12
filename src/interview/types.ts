import type { DiscoveryResult } from '../discovery/types.js';
import type { MCPToolCallResult } from '../transport/types.js';
import type { Persona, QuestionCategory } from '../persona/types.js';
import type { WorkflowResult } from '../workflow/types.js';

/**
 * Server context extracted during discovery/initial probing.
 * Used to generate contextually appropriate test cases.
 */
export interface ServerContext {
  /** Allowed directories for filesystem operations */
  allowedDirectories?: string[];
  /** Base URLs or hosts the server can access */
  allowedHosts?: string[];
  /** Any constraints discovered from initial tool calls */
  constraints?: string[];
  /** Server-specific hints extracted from tool descriptions */
  hints?: string[];
}

/**
 * Configuration for the interview process.
 */
export interface InterviewConfig {
  /** Maximum questions per tool (default: 3) */
  maxQuestionsPerTool: number;
  /** Timeout for tool calls in ms (default: 30000) */
  timeout: number;
  /** Whether to skip error handling tests */
  skipErrorTests: boolean;
  /** LLM model to use */
  model: string;
  /** Personas to use for interviewing (default: technical_writer) */
  personas?: Persona[];
}

/**
 * A question to ask about a tool's behavior.
 */
export interface InterviewQuestion {
  /** Description of what this question tests */
  description: string;
  /** Category of question */
  category: QuestionCategory;
  /** Arguments to pass to the tool */
  args: Record<string, unknown>;
}

/**
 * Result of asking a single question.
 */
export interface ToolInteraction {
  /** Name of the tool called */
  toolName: string;
  /** The question that was asked */
  question: InterviewQuestion;
  /** The tool's response */
  response: MCPToolCallResult | null;
  /** Error if the call failed */
  error: string | null;
  /** LLM analysis of the response */
  analysis: string;
  /** Time taken in ms */
  durationMs: number;
  /** Persona that generated this interaction */
  personaId?: string;
}

/**
 * Findings by persona for a tool.
 */
export interface PersonaFindings {
  /** Persona ID that generated these findings */
  personaId: string;
  /** Persona name */
  personaName: string;
  /** Behavioral notes from this persona */
  behavioralNotes: string[];
  /** Limitations found by this persona */
  limitations: string[];
  /** Security notes from this persona */
  securityNotes: string[];
}

/**
 * Behavioral profile for a single tool.
 */
export interface ToolProfile {
  /** Tool name */
  name: string;
  /** Tool description from schema */
  description: string;
  /** Interactions during interview */
  interactions: ToolInteraction[];
  /** Synthesized behavioral notes (aggregated) */
  behavioralNotes: string[];
  /** Discovered limitations (aggregated) */
  limitations: string[];
  /** Security considerations (aggregated) */
  securityNotes: string[];
  /** Findings broken down by persona */
  findingsByPersona?: PersonaFindings[];
}

/**
 * Complete interview result.
 */
export interface InterviewResult {
  /** Original discovery result */
  discovery: DiscoveryResult;
  /** Profile for each tool */
  toolProfiles: ToolProfile[];
  /** Workflow execution results */
  workflowResults?: WorkflowResult[];
  /** Overall behavioral summary */
  summary: string;
  /** Overall limitations */
  limitations: string[];
  /** Overall recommendations */
  recommendations: string[];
  /** Interview metadata */
  metadata: InterviewMetadata;
}

/**
 * Summary of a persona used in the interview.
 */
export interface PersonaSummary {
  /** Persona ID */
  id: string;
  /** Persona name */
  name: string;
  /** Questions asked by this persona */
  questionsAsked: number;
  /** Tool calls made for this persona */
  toolCallCount: number;
  /** Errors encountered for this persona */
  errorCount: number;
}

export interface InterviewMetadata {
  /** Start time */
  startTime: Date;
  /** End time */
  endTime: Date;
  /** Total duration in ms */
  durationMs: number;
  /** Number of tool calls made */
  toolCallCount: number;
  /** Number of errors encountered */
  errorCount: number;
  /** LLM model used */
  model: string;
  /** Personas used in the interview */
  personas?: PersonaSummary[];
}
