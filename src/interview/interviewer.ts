import type { MCPClient } from '../transport/mcp-client.js';
import type { DiscoveryResult } from '../discovery/types.js';
import type { LLMClient } from '../llm/client.js';
import { Orchestrator } from './orchestrator.js';
import type {
  InterviewConfig,
  InterviewResult,
  ToolProfile,
  ToolInteraction,
  InterviewMetadata,
  PersonaFindings,
  PersonaSummary,
  ServerContext,
} from './types.js';
import type { Persona } from '../persona/types.js';
import { DEFAULT_PERSONA, securityTesterPersona } from '../persona/builtins.js';
import { getLogger, startTiming } from '../logging/logger.js';

/**
 * Default interview configuration.
 */
export const DEFAULT_CONFIG: InterviewConfig = {
  maxQuestionsPerTool: 3,
  timeout: 30000,
  skipErrorTests: false,
  model: 'gpt-4o',
};

/**
 * Default personas to use if none specified.
 * Using both technical_writer and security_tester provides balanced coverage.
 */
export const DEFAULT_PERSONAS: Persona[] = [DEFAULT_PERSONA, securityTesterPersona];

export interface InterviewProgress {
  phase: 'starting' | 'interviewing' | 'synthesizing' | 'complete';
  currentTool?: string;
  currentPersona?: string;
  personasCompleted: number;
  totalPersonas: number;
  toolsCompleted: number;
  totalTools: number;
  questionsAsked: number;
}

export type ProgressCallback = (progress: InterviewProgress) => void;

/**
 * Interviewer conducts the interview process using the orchestrator.
 */
export class Interviewer {
  private llm: LLMClient;
  private config: InterviewConfig;
  private personas: Persona[];
  private logger = getLogger('interviewer');
  private serverContext?: ServerContext;

  constructor(llm: LLMClient, config?: Partial<InterviewConfig>) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Use multiple personas by default for better coverage
    this.personas = config?.personas ?? DEFAULT_PERSONAS;
  }

  /**
   * Extract server context by probing discovery tools.
   * Looks for tools like list_allowed_directories to understand constraints.
   */
  async extractServerContext(
    client: MCPClient,
    discovery: DiscoveryResult
  ): Promise<ServerContext> {
    const context: ServerContext = {
      allowedDirectories: [],
      constraints: [],
      hints: [],
    };

    // Look for tools that reveal server constraints
    const constraintTools = [
      'list_allowed_directories',
      'get_allowed_paths',
      'list_permissions',
    ];

    for (const toolName of constraintTools) {
      const tool = discovery.tools.find(t => t.name === toolName);
      if (tool) {
        try {
          const result = await client.callTool(toolName, {});
          if (result?.content) {
            const textContent = result.content.find(c => c.type === 'text');
            if (textContent && 'text' in textContent) {
              const text = String(textContent.text);
              // Parse allowed directories from response
              const dirs = this.parseAllowedDirectories(text);
              if (dirs.length > 0) {
                context.allowedDirectories = dirs;
                this.logger.info({ dirs }, 'Extracted allowed directories from server');
              }
            }
          }
        } catch {
          // Tool probe failed, continue
        }
      }
    }

    // Extract hints from tool descriptions
    for (const tool of discovery.tools) {
      if (tool.description) {
        const desc = tool.description.toLowerCase();
        // Look for path restrictions mentioned in descriptions
        if (desc.includes('allowed director') || desc.includes('within allowed')) {
          context.hints?.push(`${tool.name}: operates within allowed directories only`);
        }
        if (desc.includes('only works within')) {
          const match = tool.description.match(/only works within (.+?)(?:\.|$)/i);
          if (match) {
            context.hints?.push(`${tool.name}: ${match[0]}`);
          }
        }
      }
    }

    // If we didn't find explicit directories but have hints, try to infer from CLI args
    // This will be populated by the interview command based on server args
    if (context.allowedDirectories?.length === 0) {
      // Default fallback - will be overridden if server args specify directories
      context.constraints?.push('Server may have directory restrictions - watch for access denied errors');
    }

    return context;
  }

  /**
   * Parse allowed directories from tool response text.
   */
  private parseAllowedDirectories(text: string): string[] {
    const dirs: string[] = [];

    // Try to parse as JSON array
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter(d => typeof d === 'string' && d.startsWith('/'));
      }
    } catch {
      // Not JSON, try line-by-line parsing
    }

    // Parse line by line looking for paths
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Match absolute paths
      if (trimmed.startsWith('/') && !trimmed.includes(' ')) {
        dirs.push(trimmed);
      }
      // Match "Allowed: /path" format
      const match = trimmed.match(/allowed[:\s]+(.+)/i);
      if (match) {
        const path = match[1].trim();
        if (path.startsWith('/')) {
          dirs.push(path);
        }
      }
    }

    return [...new Set(dirs)]; // Dedupe
  }

  /**
   * Set server context directly (e.g., from CLI arguments).
   */
  setServerContext(context: ServerContext): void {
    this.serverContext = context;
  }

  /**
   * Run a complete interview on a connected MCP server.
   * Supports multiple personas - runs each persona's interview and aggregates findings.
   */
  async interview(
    client: MCPClient,
    discovery: DiscoveryResult,
    onProgress?: ProgressCallback
  ): Promise<InterviewResult> {
    const done = startTiming(this.logger, 'interview');
    const startTime = new Date();

    this.logger.info({
      serverName: discovery.serverInfo.name,
      toolCount: discovery.tools.length,
      personaCount: this.personas.length,
    }, 'Starting interview');

    // Extract server context if not already set
    if (!this.serverContext) {
      this.serverContext = await this.extractServerContext(client, discovery);
    }

    // Track stats per persona
    const personaStats = new Map<string, PersonaSummary>();
    for (const persona of this.personas) {
      personaStats.set(persona.id, {
        id: persona.id,
        name: persona.name,
        questionsAsked: 0,
        toolCallCount: 0,
        errorCount: 0,
      });
    }

    const progress: InterviewProgress = {
      phase: 'starting',
      personasCompleted: 0,
      totalPersonas: this.personas.length,
      toolsCompleted: 0,
      totalTools: discovery.tools.length,
      questionsAsked: 0,
    };

    onProgress?.(progress);

    // Aggregate interactions by tool across all personas
    const toolInteractionsMap = new Map<string, {
      interactions: ToolInteraction[];
      findingsByPersona: PersonaFindings[];
    }>();

    // Initialize map for each tool
    for (const tool of discovery.tools) {
      toolInteractionsMap.set(tool.name, {
        interactions: [],
        findingsByPersona: [],
      });
    }

    // Interview with each persona
    progress.phase = 'interviewing';
    for (const persona of this.personas) {
      progress.currentPersona = persona.name;
      onProgress?.(progress);

      // Create orchestrator with server context
      const orchestrator = new Orchestrator(this.llm, persona, this.serverContext);
      const stats = personaStats.get(persona.id)!;

      // Interview each tool with this persona
      for (const tool of discovery.tools) {
        progress.currentTool = tool.name;
        onProgress?.(progress);

        const personaInteractions: ToolInteraction[] = [];
        const previousErrors: Array<{ args: Record<string, unknown>; error: string }> = [];

        // Generate questions for this tool with this persona
        let questions = await orchestrator.generateQuestions(
          tool,
          this.config.maxQuestionsPerTool,
          this.config.skipErrorTests
        );

        // Ask each question with retry logic
        for (const question of questions) {
          const { interaction, hadError } = await this.executeWithRetry(
            client,
            tool.name,
            question,
            orchestrator,
            persona.id,
            stats,
            previousErrors
          );

          personaInteractions.push(interaction);

          // Track errors for learning
          if (hadError && interaction.error) {
            previousErrors.push({
              args: question.args,
              error: interaction.error,
            });

            // If we have multiple failures, regenerate remaining questions with error context
            if (previousErrors.length >= 2 && personaInteractions.length < questions.length) {
              const remaining = this.config.maxQuestionsPerTool - personaInteractions.length;
              if (remaining > 0) {
                this.logger.debug({ tool: tool.name, errors: previousErrors.length },
                  'Regenerating questions after errors');
                const newQuestions = await orchestrator.generateQuestions(
                  tool,
                  remaining,
                  this.config.skipErrorTests,
                  previousErrors
                );
                // Replace remaining questions with newly generated ones
                questions = [...questions.slice(0, personaInteractions.length), ...newQuestions];
              }
            }
          }

          stats.questionsAsked++;
          progress.questionsAsked++;
          onProgress?.(progress);
        }

        // Synthesize this persona's findings for this tool
        const personaProfile = await orchestrator.synthesizeToolProfile(
          tool,
          personaInteractions.map(i => ({
            question: i.question,
            response: i.response,
            error: i.error,
            analysis: i.analysis,
          }))
        );

        // Store findings
        const toolData = toolInteractionsMap.get(tool.name)!;
        toolData.interactions.push(...personaInteractions);
        toolData.findingsByPersona.push({
          personaId: persona.id,
          personaName: persona.name,
          behavioralNotes: personaProfile.behavioralNotes,
          limitations: personaProfile.limitations,
          securityNotes: personaProfile.securityNotes,
        });

        progress.toolsCompleted++;
        onProgress?.(progress);
      }

      progress.personasCompleted++;
      // Reset tool count for next persona
      progress.toolsCompleted = 0;
      onProgress?.(progress);
    }

    // Build aggregated tool profiles
    const toolProfiles: ToolProfile[] = [];
    for (const tool of discovery.tools) {
      const toolData = toolInteractionsMap.get(tool.name)!;

      // Aggregate findings across personas (deduplicate)
      const aggregatedProfile = this.aggregateFindings(tool.name, tool.description ?? '', toolData);
      toolProfiles.push(aggregatedProfile);
    }

    // Synthesize overall findings (use first persona's orchestrator for synthesis)
    progress.phase = 'synthesizing';
    onProgress?.(progress);

    const primaryOrchestrator = new Orchestrator(this.llm, this.personas[0]);
    const overall = await primaryOrchestrator.synthesizeOverall(discovery, toolProfiles);

    // Calculate totals
    let totalToolCallCount = 0;
    let totalErrorCount = 0;
    for (const stats of personaStats.values()) {
      totalToolCallCount += stats.toolCallCount;
      totalErrorCount += stats.errorCount;
    }

    const endTime = new Date();
    const metadata: InterviewMetadata = {
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
      toolCallCount: totalToolCallCount,
      errorCount: totalErrorCount,
      model: this.config.model,
      personas: Array.from(personaStats.values()),
    };

    progress.phase = 'complete';
    onProgress?.(progress);

    this.logger.info({
      toolsProfiled: toolProfiles.length,
      totalToolCalls: totalToolCallCount,
      totalErrors: totalErrorCount,
      durationMs: metadata.durationMs,
    }, 'Interview complete');
    done();

    return {
      discovery,
      toolProfiles,
      summary: overall.summary,
      limitations: overall.limitations,
      recommendations: overall.recommendations,
      metadata,
    };
  }

  /**
   * Aggregate findings from multiple personas into a single tool profile.
   */
  private aggregateFindings(
    toolName: string,
    description: string,
    data: { interactions: ToolInteraction[]; findingsByPersona: PersonaFindings[] }
  ): ToolProfile {
    // Collect all notes, deduplicating similar content
    const behavioralNotes = new Set<string>();
    const limitations = new Set<string>();
    const securityNotes = new Set<string>();

    for (const findings of data.findingsByPersona) {
      for (const note of findings.behavioralNotes) {
        behavioralNotes.add(note);
      }
      for (const limitation of findings.limitations) {
        limitations.add(limitation);
      }
      for (const note of findings.securityNotes) {
        securityNotes.add(note);
      }
    }

    return {
      name: toolName,
      description,
      interactions: data.interactions,
      behavioralNotes: Array.from(behavioralNotes),
      limitations: Array.from(limitations),
      securityNotes: Array.from(securityNotes),
      findingsByPersona: data.findingsByPersona,
    };
  }

  /**
   * Execute a tool call with retry logic for recoverable errors.
   * Learns from errors and can update server context based on error messages.
   */
  private async executeWithRetry(
    client: MCPClient,
    toolName: string,
    question: { description: string; category: string; args: Record<string, unknown> },
    orchestrator: Orchestrator,
    personaId: string,
    stats: PersonaSummary,
    _previousErrors: Array<{ args: Record<string, unknown>; error: string }>
  ): Promise<{ interaction: ToolInteraction; hadError: boolean }> {
    const interactionStart = Date.now();
    let response = null;
    let error = null;
    let hadError = false;

    try {
      response = await client.callTool(toolName, question.args);
      stats.toolCallCount++;

      if (response.isError) {
        stats.errorCount++;
        hadError = true;

        // Extract error message and learn from it
        const errorContent = response.content?.find(c => c.type === 'text');
        if (errorContent && 'text' in errorContent) {
          error = String(errorContent.text);

          // Try to extract constraints from error message
          this.learnFromError(error, orchestrator);
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      stats.errorCount++;
      stats.toolCallCount++;
      hadError = true;

      // Learn from exception message too
      this.learnFromError(error, orchestrator);
    }

    // Analyze the response with this persona's perspective
    const tool = { name: toolName, description: '' };
    const analysis = await orchestrator.analyzeResponse(
      tool as any,
      question as any,
      response,
      error
    );

    const interaction: ToolInteraction = {
      toolName,
      question: question as any,
      response,
      error,
      analysis,
      durationMs: Date.now() - interactionStart,
      personaId,
    };

    return { interaction, hadError };
  }

  /**
   * Learn server constraints from error messages.
   * Updates server context with discovered restrictions.
   */
  private learnFromError(error: string, orchestrator: Orchestrator): void {
    // Extract allowed directories from error messages
    const pathMatch = error.match(/access denied|not allowed|outside.*(?:allowed|permitted).*?([\/\\][^\s"']+)/i);
    if (pathMatch) {
      // Error mentions a path restriction
      const constraint = `Path access restricted: ${error.substring(0, 100)}`;
      const currentContext = orchestrator.getServerContext() ?? { constraints: [] };
      if (!currentContext.constraints?.includes(constraint)) {
        currentContext.constraints = [...(currentContext.constraints ?? []), constraint];
        orchestrator.setServerContext(currentContext);
      }
    }

    // Extract allowed directories explicitly mentioned
    const allowedMatch = error.match(/allowed director(?:y|ies)[:\s]+([^\n]+)/i);
    if (allowedMatch) {
      const dirs = allowedMatch[1].split(/[,\s]+/).filter(d => d.startsWith('/'));
      if (dirs.length > 0) {
        const currentContext = orchestrator.getServerContext() ?? { allowedDirectories: [] };
        const existingDirs = currentContext.allowedDirectories ?? [];
        const newDirs = [...new Set([...existingDirs, ...dirs])];
        if (newDirs.length > existingDirs.length) {
          currentContext.allowedDirectories = newDirs;
          orchestrator.setServerContext(currentContext);
          this.logger.debug({ dirs: newDirs }, 'Learned allowed directories from error');
        }
      }
    }
  }
}
