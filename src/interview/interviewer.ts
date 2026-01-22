import type { MCPClient } from '../transport/mcp-client.js';
import type { MCPTool, MCPToolCallResult } from '../transport/types.js';
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
  InterviewQuestion,
  PromptProfile,
  PromptInteraction,
  ResourceProfile,
  ResourceInteraction,
  WorkflowSummary,
} from './types.js';
import type { Persona } from '../persona/types.js';
import { DEFAULT_PERSONA } from '../persona/builtins.js';
import { getLogger, startTiming } from '../logging/logger.js';
import type { TestScenario, PromptScenario, ScenarioResult } from '../scenarios/types.js';
import type { PromptQuestion, ResourceQuestion } from './types.js';
import { evaluateAssertions } from '../scenarios/evaluator.js';
import { withTimeout, DEFAULT_TIMEOUTS, parallelLimit, createMutex } from '../utils/index.js';
import type { ToolResponseCache } from '../cache/response-cache.js';
import { INTERVIEW, WORKFLOW, DISPLAY_LIMITS } from '../constants.js';
import { WorkflowDiscoverer } from '../workflow/discovery.js';
import { WorkflowExecutor } from '../workflow/executor.js';
import type { Workflow, WorkflowResult } from '../workflow/types.js';

/**
 * Default interview configuration.
 */
export const DEFAULT_CONFIG: InterviewConfig = {
  maxQuestionsPerTool: INTERVIEW.MAX_QUESTIONS_PER_TOOL,
  timeout: INTERVIEW.TOOL_TIMEOUT,
  skipErrorTests: false,
};

/**
 * Default personas to use if none specified.
 * Uses Technical Writer only for a fast, cost-effective default experience.
 * Use --security or --personas to add more personas.
 */
export const DEFAULT_PERSONAS: Persona[] = [DEFAULT_PERSONA];

export interface InterviewProgress {
  phase: 'starting' | 'interviewing' | 'prompts' | 'resources' | 'workflows' | 'synthesizing' | 'complete';
  currentTool?: string;
  currentPersona?: string;
  personasCompleted: number;
  totalPersonas: number;
  toolsCompleted: number;
  totalTools: number;
  questionsAsked: number;
  /** Current workflow being executed */
  currentWorkflow?: string;
  /** Number of workflows completed */
  workflowsCompleted?: number;
  /** Total workflows to execute */
  totalWorkflows?: number;
  /** Number of prompts completed */
  promptsCompleted?: number;
  /** Total prompts to interview */
  totalPrompts?: number;
  /** Number of resources completed */
  resourcesCompleted?: number;
  /** Total resources to interview */
  totalResources?: number;
}

export type ProgressCallback = (progress: InterviewProgress) => void;

/**
 * Result of interviewing a single persona across all tools.
 * Used for parallel persona execution.
 */
interface PersonaInterviewData {
  persona: Persona;
  stats: PersonaSummary;
  toolInteractions: Map<string, ToolInteraction[]>;
  toolFindings: Map<string, PersonaFindings>;
  scenarioResults: ScenarioResult[];
}

/**
 * Interviewer conducts the interview process using the orchestrator.
 * Supports streaming output for real-time feedback during LLM operations.
 * Supports parallel persona execution for improved performance.
 * Supports caching tool responses and LLM analysis for efficiency.
 *
 * Two modes of operation:
 * - Check mode: No LLM required, uses fallback questions and simple analysis
 * - Explore mode: LLM required for question generation and behavioral analysis
 */
export class Interviewer {
  private llm: LLMClient | null;
  private config: InterviewConfig;
  private personas: Persona[];
  private logger = getLogger('interviewer');
  private serverContext?: ServerContext;
  private cache?: ToolResponseCache;

  /**
   * Create an Interviewer for explore mode (LLM-powered behavioral analysis).
   *
   * @param llm - LLM client for question generation and analysis
   * @param config - Interview configuration
   */
  constructor(llm: LLMClient, config?: Partial<InterviewConfig>);

  /**
   * Create an Interviewer for check mode (no LLM, deterministic).
   *
   * @param llm - null for check mode
   * @param config - Interview configuration (must have checkMode: true)
   */
  constructor(llm: null, config: Partial<InterviewConfig> & { checkMode: true });

  constructor(llm: LLMClient | null, config?: Partial<InterviewConfig>) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Validate: if no LLM provided, must be in check mode
    if (!llm && !this.config.checkMode) {
      throw new Error('LLM client is required for explore mode. Use checkMode: true for check mode.');
    }

    // Use multiple personas by default for better coverage
    this.personas = config?.personas ?? DEFAULT_PERSONAS;
    // Store cache reference for tool response and analysis caching
    this.cache = config?.cache;
  }

  /**
   * Create an orchestrator with streaming and caching enabled if configured.
   * Throws an error if called in check mode since orchestrator requires LLM.
   */
  private createOrchestrator(persona: Persona): Orchestrator {
    if (!this.llm) {
      throw new Error('Cannot create orchestrator in check mode - LLM client is required');
    }
    const orchestrator = new Orchestrator(this.llm, persona, this.serverContext, this.cache);

    // Enable streaming if configured
    if (this.config.enableStreaming && this.config.streamingCallbacks) {
      orchestrator.enableStreaming(this.config.streamingCallbacks);
    }

    return orchestrator;
  }

  /**
   * Generate simple analysis for check/fast mode.
   * Avoids LLM calls by providing basic success/error messages.
   */
  private generateSimpleAnalysis(
    error: string | null,
    hasResponse: boolean,
    successMessage: string
  ): string {
    if (error) {
      return `Error: ${error}`;
    }
    if (hasResponse) {
      return successMessage;
    }
    return 'No response received.';
  }

  /**
   * Check if we're in fast/check mode (no LLM calls).
   */
  private isCheckMode(): boolean {
    return this.config.customScenariosOnly || this.config.checkMode || false;
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
      allowedHosts: [],
      constraints: [],
      hints: [],
    };

    // Look for tools that reveal server constraints
    for (const toolName of INTERVIEW.CONSTRAINT_DISCOVERY_TOOLS) {
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
        } catch (error) {
          this.logger.debug({
            toolName,
            error: error instanceof Error ? error.message : String(error),
          }, 'Tool probe failed during context extraction');
        }
      }
    }

    // Extract hints and hosts from tool descriptions
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
        // Extract allowed hosts/URLs from descriptions
        const urlMatch = tool.description.match(/https?:\/\/[^\s"'<>]+/gi);
        if (urlMatch) {
          for (const url of urlMatch) {
            try {
              const parsed = new URL(url);
              const baseUrl = `${parsed.protocol}//${parsed.host}`;
              if (!context.allowedHosts?.includes(baseUrl)) {
                context.allowedHosts?.push(baseUrl);
              }
            } catch {
              // Invalid URL, skip
            }
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
    } catch (error) {
      this.logger.debug({
        error: error instanceof Error ? error.message : String(error),
        textPreview: text.substring(0, 100),
      }, 'Directory list not JSON, trying line-by-line parsing');
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
      promptsCompleted: 0,
      totalPrompts: discovery.prompts.length,
      resourcesCompleted: 0,
      totalResources: (discovery.resources ?? []).length,
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

    // Track all scenario results
    let allScenarioResults: ScenarioResult[] = [];

    // Interview with each persona
    progress.phase = 'interviewing';

    // Check if parallel execution is enabled
    const useParallel = this.config.parallelPersonas && this.personas.length > 1;

    if (useParallel) {
      // Parallel persona execution
      const concurrency = this.config.personaConcurrency ?? INTERVIEW.DEFAULT_PERSONA_CONCURRENCY;
      const toolCallMutex = createMutex(); // Shared mutex for serializing MCP tool calls

      this.logger.info({
        personaCount: this.personas.length,
        concurrency,
      }, 'Running persona interviews in parallel');

      // Create tasks for each persona
      const personaTasks = this.personas.map(persona => async () => {
        progress.currentPersona = persona.name;
        onProgress?.(progress);

        const result = await this.interviewPersona(client, discovery, persona, toolCallMutex);

        progress.personasCompleted++;
        progress.questionsAsked += result.stats.questionsAsked;
        onProgress?.(progress);

        return result;
      });

      // Execute personas in parallel with concurrency limit
      const parallelResults = await parallelLimit(personaTasks, { concurrency });

      // Check for errors
      if (!parallelResults.allSucceeded) {
        for (const [index, error] of parallelResults.errors) {
          this.logger.error({
            persona: this.personas[index]?.name,
            error: error.message,
          }, 'Persona interview failed');
        }
      }

      // Aggregate results
      const successfulResults = parallelResults.results.filter((r): r is PersonaInterviewData => r !== undefined);
      const aggregated = this.aggregateParallelResults(successfulResults, discovery);

      // Update tracking maps
      for (const [toolName, data] of aggregated.toolInteractionsMap) {
        const existing = toolInteractionsMap.get(toolName);
        if (existing) {
          existing.interactions = data.interactions;
          existing.findingsByPersona = data.findingsByPersona;
        }
      }

      // Update persona stats
      for (const [personaId, stats] of aggregated.personaStats) {
        personaStats.set(personaId, stats);
      }

      allScenarioResults = aggregated.allScenarioResults;

    } else {
      // Sequential persona execution (original behavior)
      for (const persona of this.personas) {
        progress.currentPersona = persona.name;
        onProgress?.(progress);

        // Create orchestrator with server context and streaming if enabled
        const orchestrator = this.createOrchestrator(persona);
        const stats = personaStats.get(persona.id)!;

        // Interview each tool with this persona
        for (const tool of discovery.tools) {
          progress.currentTool = tool.name;
          onProgress?.(progress);

          const personaInteractions: ToolInteraction[] = [];
          const previousErrors: Array<{ args: Record<string, unknown>; error: string }> = [];

          // Check for custom scenarios for this tool
          const customScenarios = this.getScenariosForTool(tool.name);

          // If customScenariosOnly and we have scenarios, skip LLM generation
          let questions: InterviewQuestion[] = [];

          if (customScenarios.length > 0) {
            // Execute custom scenarios
            const scenarioResults = await this.executeToolScenarios(
              client,
              tool.name,
              customScenarios
            );
            allScenarioResults.push(...scenarioResults);

            // Convert scenarios to interview questions for integration with profiling
            questions = customScenarios.map(s => this.scenarioToQuestion(s));

            // If not custom-only mode, also generate LLM questions (skip in fast CI mode)
            if (!this.config.customScenariosOnly && !this.config.checkMode) {
              const llmQuestions = await orchestrator.generateQuestions(
                tool,
                this.config.maxQuestionsPerTool,
                this.config.skipErrorTests
              );
              questions = [...questions, ...llmQuestions];
            }
          } else if (!this.config.customScenariosOnly) {
            // No custom scenarios - generate questions
            if (this.config.checkMode) {
              // Fast CI mode: use fallback questions (no LLM call)
              questions = orchestrator.getFallbackQuestions(tool, this.config.skipErrorTests)
                .slice(0, this.config.maxQuestionsPerTool);
            } else {
              // Normal mode: generate LLM questions
              questions = await orchestrator.generateQuestions(
                tool,
                this.config.maxQuestionsPerTool,
                this.config.skipErrorTests
              );
            }
          }
          // If customScenariosOnly and no scenarios for this tool, skip it

          // Ask each question with retry logic
          for (const question of questions) {
            const { interaction, hadError } = await this.executeWithRetry(
              client,
              tool.name,
              question,
              orchestrator,
              persona.id,
              stats
            );

            personaInteractions.push(interaction);

            // Track errors for learning
            if (hadError && interaction.error) {
              previousErrors.push({
                args: question.args,
                error: interaction.error,
              });

              // If we have multiple failures, regenerate remaining questions with error context
              // Skip in scenarios-only mode and fast CI mode
              if (!this.config.customScenariosOnly && !this.config.checkMode &&
                previousErrors.length >= 2 && personaInteractions.length < questions.length) {
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
          // Skip LLM synthesis in scenarios-only mode and fast CI mode
          let personaProfile: { behavioralNotes: string[]; limitations: string[]; securityNotes: string[] };
          if (this.config.customScenariosOnly || this.config.checkMode) {
            // Check mode: minimal profile, no misleading error counts
            personaProfile = {
              behavioralNotes: [],
              limitations: [],
              securityNotes: [],
            };
          } else {
            personaProfile = await orchestrator.synthesizeToolProfile(
              tool,
              personaInteractions.map(i => ({
                question: i.question,
                response: i.response,
                error: i.error,
                analysis: i.analysis,
              }))
            );
          }

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
    }

    // Build aggregated tool profiles
    const toolProfiles: ToolProfile[] = [];
    for (const tool of discovery.tools) {
      const toolData = toolInteractionsMap.get(tool.name)!;

      // Aggregate findings across personas (deduplicate)
      const aggregatedProfile = this.aggregateFindings(tool.name, tool.description ?? '', toolData);
      toolProfiles.push(aggregatedProfile);
    }

    // Interview prompts (if server has prompts capability)
    const promptProfiles: PromptProfile[] = [];
    if (discovery.prompts.length > 0) {
      this.logger.info({ promptCount: discovery.prompts.length }, 'Interviewing prompts');

      // Update phase for prompts
      progress.phase = 'prompts';
      progress.promptsCompleted = 0;
      onProgress?.(progress);

      const primaryOrchestrator = this.createOrchestrator(this.personas[0]);

      for (const prompt of discovery.prompts) {
        progress.currentTool = `prompt:${prompt.name}`;
        onProgress?.(progress);

        const promptInteractions: PromptInteraction[] = [];

        // Check for custom scenarios for this prompt
        const customScenarios = this.getScenariosForPrompt(prompt.name);

        // Build questions list - custom scenarios + LLM-generated (unless customScenariosOnly)
        let questions: PromptQuestion[] = [];

        if (customScenarios.length > 0) {
          // Execute custom prompt scenarios
          const scenarioResults = await this.executePromptScenarios(
            client,
            prompt.name,
            customScenarios
          );
          allScenarioResults.push(...scenarioResults);

          // Convert scenarios to prompt questions for profiling
          questions = customScenarios.map(s => ({
            description: s.description,
            args: s.args,
          }));

          // If not custom-only mode and not fast CI mode, also generate LLM questions
          if (!this.config.customScenariosOnly && !this.config.checkMode) {
            const llmQuestions = await primaryOrchestrator.generatePromptQuestions(prompt, 2);
            questions = [...questions, ...llmQuestions];
          }
        } else if (!this.config.customScenariosOnly && !this.config.checkMode) {
          // No custom scenarios - generate LLM questions as usual
          questions = await primaryOrchestrator.generatePromptQuestions(prompt, 2);
        } else if (this.config.checkMode) {
          // Fast CI mode: use simple fallback question for prompt
          questions = [{ description: 'Basic prompt test', args: {} }];
        }
        // If customScenariosOnly and no scenarios for this prompt, skip it

        for (const question of questions) {
          const interactionStart = Date.now();
          let response = null;
          let error = null;

          try {
            response = await client.getPrompt(prompt.name, question.args);
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
          }

          // Skip LLM analysis in scenarios-only mode and fast CI mode
          let analysis: string;
          if (this.isCheckMode()) {
            analysis = this.generateSimpleAnalysis(error, !!response, 'Prompt call succeeded.');
          } else {
            analysis = await primaryOrchestrator.analyzePromptResponse(
              prompt,
              question,
              response,
              error
            );
          }

          promptInteractions.push({
            promptName: prompt.name,
            question,
            response,
            error,
            analysis,
            durationMs: Date.now() - interactionStart,
          });

          progress.questionsAsked++;
          onProgress?.(progress);
        }

        // Synthesize prompt profile
        // Skip LLM synthesis in scenarios-only mode and fast CI mode
        let profile: { name: string; description: string; arguments: Array<{ name: string; description?: string; required?: boolean }>; behavioralNotes: string[]; limitations: string[] };
        if (this.config.customScenariosOnly || this.config.checkMode) {
          // Check mode: minimal profile, no misleading error counts
          profile = {
            name: prompt.name,
            description: prompt.description || prompt.name,
            arguments: prompt.arguments || [],
            behavioralNotes: [],
            limitations: [],
          };
        } else {
          profile = await primaryOrchestrator.synthesizePromptProfile(
            prompt,
            promptInteractions.map(i => ({
              question: i.question,
              response: i.response,
              error: i.error,
              analysis: i.analysis,
            }))
          );
        }

        promptProfiles.push({
          ...profile,
          interactions: promptInteractions,
        });

        // Update prompt progress
        progress.promptsCompleted = (progress.promptsCompleted ?? 0) + 1;
        onProgress?.(progress);
      }
    }

    // Interview resources (if server has resources capability)
    // Skip in scenarios-only mode since there's no resource scenario format
    const resourceProfiles: ResourceProfile[] = [];
    let resourceReadCount = 0;
    const discoveredResources = discovery.resources ?? [];
    if (discoveredResources.length > 0 && !this.config.customScenariosOnly) {
      this.logger.info({ resourceCount: discoveredResources.length }, 'Interviewing resources');

      // Update phase for resources
      progress.phase = 'resources';
      progress.resourcesCompleted = 0;
      onProgress?.(progress);

      const primaryOrchestrator = this.createOrchestrator(this.personas[0]);

      for (const resource of discoveredResources) {
        progress.currentTool = `resource:${resource.name}`;
        onProgress?.(progress);

        const resourceInteractions: ResourceInteraction[] = [];

        // Generate resource questions (skip LLM in fast CI mode)
        let questions: ResourceQuestion[];
        if (this.config.checkMode) {
          // Fast CI mode: use simple fallback question
          questions = [{ description: 'Basic resource read test', category: 'happy_path' as const }];
        } else {
          questions = await primaryOrchestrator.generateResourceQuestions(resource, 2);
        }

        for (const question of questions) {
          const interactionStart = Date.now();
          let response = null;
          let error = null;

          try {
            // Apply timeout to resource read to prevent indefinite hangs
            response = await withTimeout(
              client.readResource(resource.uri),
              this.config.resourceTimeout ?? DEFAULT_TIMEOUTS.resourceRead,
              `Resource read: ${resource.uri}`
            );
            resourceReadCount++;
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            resourceReadCount++;
          }

          // Skip LLM analysis in fast CI mode
          let analysis: string;
          if (this.isCheckMode()) {
            analysis = this.generateSimpleAnalysis(error, !!response, 'Resource read succeeded.');
          } else {
            analysis = await primaryOrchestrator.analyzeResourceResponse(
              resource,
              question,
              response,
              error
            );
          }

          resourceInteractions.push({
            resourceUri: resource.uri,
            resourceName: resource.name,
            question,
            response,
            error,
            analysis,
            durationMs: Date.now() - interactionStart,
          });

          progress.questionsAsked++;
          onProgress?.(progress);
        }

        // Synthesize resource profile (skip LLM in fast CI mode)
        let profile;
        if (this.config.checkMode) {
          // Check mode: minimal profile, no misleading error counts
          profile = {
            name: resource.name,
            uri: resource.uri,
            description: resource.description || resource.name,
            mimeType: resource.mimeType,
            behavioralNotes: [],
            limitations: [],
          };
        } else {
          profile = await primaryOrchestrator.synthesizeResourceProfile(
            resource,
            resourceInteractions.map(i => ({
              question: i.question,
              response: i.response,
              error: i.error,
              analysis: i.analysis,
            }))
          );
        }

        // Extract content preview from first successful read
        let contentPreview: string | undefined;
        const successfulRead = resourceInteractions.find(i => i.response && !i.error);
        if (successfulRead?.response?.contents?.[0]) {
          const content = successfulRead.response.contents[0];
          if (content.text) {
            contentPreview = content.text.length > DISPLAY_LIMITS.CONTENT_TEXT_PREVIEW
              ? content.text.substring(0, DISPLAY_LIMITS.CONTENT_TEXT_PREVIEW) + '...'
              : content.text;
          } else if (content.blob) {
            contentPreview = `[Binary data: ${content.blob.length} bytes base64]`;
          }
        }

        resourceProfiles.push({
          ...profile,
          interactions: resourceInteractions,
          contentPreview,
        });

        // Update resource progress
        progress.resourcesCompleted = (progress.resourcesCompleted ?? 0) + 1;
        onProgress?.(progress);
      }
    }

    // Execute workflows if configured
    let workflowResults: WorkflowResult[] | undefined;
    let workflowSummary: WorkflowSummary | undefined;

    const workflowConfig = this.config.workflowConfig;
    if (workflowConfig && (workflowConfig.workflows?.length || workflowConfig.discoverWorkflows)) {
      progress.phase = 'workflows';
      onProgress?.(progress);

      const { results, summary } = await this.executeWorkflows(
        client,
        discovery,
        workflowConfig,
        progress,
        onProgress
      );

      workflowResults = results.length > 0 ? results : undefined;
      workflowSummary = summary;
    }

    // Synthesize overall findings (use first persona's orchestrator for synthesis)
    // Skip LLM synthesis in scenarios-only mode and fast CI mode
    progress.phase = 'synthesizing';
    onProgress?.(progress);

    let overall: { summary: string; limitations: string[]; recommendations: string[] };
    if (this.config.customScenariosOnly || this.config.checkMode) {
      // Check mode: simple summary focused on verification, not pass/fail
      const serverName = discovery.serverInfo.name || 'This MCP server';
      overall = {
        summary: `${serverName} provides ${toolProfiles.length} tool(s) for MCP integration.`,
        limitations: [],
        recommendations: [],
      };
    } else {
      const primaryOrchestrator = this.createOrchestrator(this.personas[0]);
      overall = await primaryOrchestrator.synthesizeOverall(discovery, toolProfiles);
    }

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
      resourceReadCount: resourceReadCount > 0 ? resourceReadCount : undefined,
      errorCount: totalErrorCount,
      model: this.config.checkMode ? 'check' : this.config.model,
      personas: Array.from(personaStats.values()),
      workflows: workflowSummary,
      serverCommand: this.config.serverCommand,
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
      promptProfiles: promptProfiles.length > 0 ? promptProfiles : undefined,
      resourceProfiles: resourceProfiles.length > 0 ? resourceProfiles : undefined,
      workflowResults,
      scenarioResults: allScenarioResults.length > 0 ? allScenarioResults : undefined,
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
   * Uses caching to avoid redundant tool calls with identical arguments.
   */
  private async executeWithRetry(
    client: MCPClient,
    toolName: string,
    question: InterviewQuestion,
    orchestrator: Orchestrator,
    personaId: string,
    stats: PersonaSummary
  ): Promise<{ interaction: ToolInteraction; hadError: boolean }> {
    const interactionStart = Date.now();
    let response: MCPToolCallResult | null = null;
    let error: string | null = null;
    let hadError = false;
    let fromCache = false;
    let toolExecutionMs = 0;
    let llmAnalysisMs = 0;

    // Check cache for tool response (same tool + same args = same response)
    if (this.cache) {
      const cachedResponse = this.cache.getToolResponse<MCPToolCallResult>(
        toolName,
        question.args
      );
      if (cachedResponse) {
        response = cachedResponse;
        fromCache = true;
        this.logger.debug({ toolName, args: question.args }, 'Tool response served from cache');
        stats.toolCallCount++; // Still count as a tool call for metrics

        if (response.isError) {
          stats.errorCount++;
          hadError = true;
          const errorContent = response.content?.find(c => c.type === 'text');
          if (errorContent && 'text' in errorContent) {
            error = String(errorContent.text);
          }
        }
      }
    }

    // Make actual tool call if not cached
    if (!fromCache) {
      const toolCallStart = Date.now();
      try {
        response = await client.callTool(toolName, question.args);
        toolExecutionMs = Date.now() - toolCallStart;
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
        } else {
          // Cache successful responses for reuse by other personas
          // Don't cache errors as they may be transient
          if (this.cache && response) {
            this.cache.setToolResponse(toolName, question.args, response);
            this.logger.debug({ toolName, args: question.args }, 'Tool response cached');
          }
        }
      } catch (e) {
        toolExecutionMs = Date.now() - toolCallStart;
        error = e instanceof Error ? e.message : String(e);
        stats.errorCount++;
        stats.toolCallCount++;
        hadError = true;

        // Learn from exception message too
        this.learnFromError(error, orchestrator);
      }
    }

    // Analyze the response with this persona's perspective
    // Skip LLM analysis in scenarios-only mode and fast CI mode
    let analysis: string;
    const llmAnalysisStart = Date.now();
    if (this.isCheckMode()) {
      // In fast mode, generate simple analysis (no LLM call)
      analysis = this.generateSimpleAnalysis(error, !!response, 'Tool call succeeded.');
      llmAnalysisMs = 0; // No LLM call in fast mode
    } else {
      const tool: MCPTool = { name: toolName, description: '' };
      analysis = await orchestrator.analyzeResponse(
        tool,
        question,
        response,
        error
      );
      llmAnalysisMs = Date.now() - llmAnalysisStart;
    }

    const interaction: ToolInteraction = {
      toolName,
      question,
      response,
      error,
      analysis,
      durationMs: Date.now() - interactionStart,
      toolExecutionMs: fromCache ? 0 : toolExecutionMs,
      llmAnalysisMs,
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
    const pathMatch = error.match(/access denied|not allowed|outside.*(?:allowed|permitted).*?([/\\][^\s"']+)/i);
    if (pathMatch) {
      // Error mentions a path restriction
      const constraint = `Path access restricted: ${error.substring(0, DISPLAY_LIMITS.ERROR_CONSTRAINT_LENGTH)}`;
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

  /**
   * Interview all tools with a single persona.
   * Designed for parallel execution across personas.
   *
   * @param client - MCP client for tool calls
   * @param discovery - Discovery result with available tools
   * @param persona - Persona to use for this interview
   * @param toolCallMutex - Mutex for serializing tool calls (shared resource)
   * @returns PersonaInterviewData with all interactions and findings
   */
  private async interviewPersona(
    client: MCPClient,
    discovery: DiscoveryResult,
    persona: Persona,
    toolCallMutex: ReturnType<typeof createMutex>
  ): Promise<PersonaInterviewData> {
    const orchestrator = this.createOrchestrator(persona);

    const stats: PersonaSummary = {
      id: persona.id,
      name: persona.name,
      questionsAsked: 0,
      toolCallCount: 0,
      errorCount: 0,
    };

    const toolInteractions = new Map<string, ToolInteraction[]>();
    const toolFindings = new Map<string, PersonaFindings>();
    const scenarioResults: ScenarioResult[] = [];

    // Interview each tool with this persona
    for (const tool of discovery.tools) {
      const personaInteractions: ToolInteraction[] = [];
      const previousErrors: Array<{ args: Record<string, unknown>; error: string }> = [];

      // Check for custom scenarios for this tool
      const customScenarios = this.getScenariosForTool(tool.name);

      // Build questions list
      let questions: InterviewQuestion[] = [];

      if (customScenarios.length > 0) {
        // Execute custom scenarios (need mutex for tool calls)
        await toolCallMutex.acquire();
        try {
          const results = await this.executeToolScenarios(client, tool.name, customScenarios);
          scenarioResults.push(...results);
        } finally {
          toolCallMutex.release();
        }

        // Convert scenarios to interview questions
        questions = customScenarios.map(s => this.scenarioToQuestion(s));

        // If not custom-only mode, also generate LLM questions
        if (!this.config.customScenariosOnly) {
          const llmQuestions = await orchestrator.generateQuestions(
            tool,
            this.config.maxQuestionsPerTool,
            this.config.skipErrorTests
          );
          questions = [...questions, ...llmQuestions];
        }
      } else if (!this.config.customScenariosOnly) {
        // No custom scenarios - generate LLM questions as usual
        questions = await orchestrator.generateQuestions(
          tool,
          this.config.maxQuestionsPerTool,
          this.config.skipErrorTests
        );
      }

      // Ask each question with retry logic
      for (const question of questions) {
        // Acquire mutex for tool calls (shared MCP client)
        await toolCallMutex.acquire();
        let interaction: ToolInteraction;
        let hadError: boolean;
        try {
          const result = await this.executeWithRetry(
            client,
            tool.name,
            question,
            orchestrator,
            persona.id,
            stats
          );
          interaction = result.interaction;
          hadError = result.hadError;
        } finally {
          toolCallMutex.release();
        }

        personaInteractions.push(interaction);

        // Track errors for learning
        if (hadError && interaction.error) {
          previousErrors.push({
            args: question.args,
            error: interaction.error,
          });

          // If we have multiple failures, regenerate remaining questions
          if (!this.config.customScenariosOnly &&
            previousErrors.length >= 2 && personaInteractions.length < questions.length) {
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
              questions = [...questions.slice(0, personaInteractions.length), ...newQuestions];
            }
          }
        }

        stats.questionsAsked++;
      }

      // Synthesize this persona's findings for this tool
      let personaProfile: { behavioralNotes: string[]; limitations: string[]; securityNotes: string[] };
      if (this.config.customScenariosOnly) {
        // Scenarios-only mode: minimal profile, no misleading error counts
        personaProfile = {
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        };
      } else {
        personaProfile = await orchestrator.synthesizeToolProfile(
          tool,
          personaInteractions.map(i => ({
            question: i.question,
            response: i.response,
            error: i.error,
            analysis: i.analysis,
          }))
        );
      }

      // Store interactions and findings
      toolInteractions.set(tool.name, personaInteractions);
      toolFindings.set(tool.name, {
        personaId: persona.id,
        personaName: persona.name,
        behavioralNotes: personaProfile.behavioralNotes,
        limitations: personaProfile.limitations,
        securityNotes: personaProfile.securityNotes,
      });
    }

    this.logger.debug({
      persona: persona.name,
      toolCount: discovery.tools.length,
      questionsAsked: stats.questionsAsked,
    }, 'Persona interview complete');

    return {
      persona,
      stats,
      toolInteractions,
      toolFindings,
      scenarioResults,
    };
  }

  /**
   * Aggregate results from parallel persona interviews.
   */
  private aggregateParallelResults(
    personaResults: PersonaInterviewData[],
    discovery: DiscoveryResult
  ): {
    toolInteractionsMap: Map<string, { interactions: ToolInteraction[]; findingsByPersona: PersonaFindings[] }>;
    personaStats: Map<string, PersonaSummary>;
    allScenarioResults: ScenarioResult[];
  } {
    const toolInteractionsMap = new Map<string, { interactions: ToolInteraction[]; findingsByPersona: PersonaFindings[] }>();

    // Initialize map for each tool
    for (const tool of discovery.tools) {
      toolInteractionsMap.set(tool.name, {
        interactions: [],
        findingsByPersona: [],
      });
    }

    const personaStats = new Map<string, PersonaSummary>();
    const allScenarioResults: ScenarioResult[] = [];

    // Aggregate results from each persona
    for (const result of personaResults) {
      personaStats.set(result.persona.id, result.stats);
      allScenarioResults.push(...result.scenarioResults);

      // Merge tool interactions
      for (const [toolName, interactions] of result.toolInteractions) {
        const toolData = toolInteractionsMap.get(toolName);
        if (toolData) {
          toolData.interactions.push(...interactions);
        }
      }

      // Merge tool findings
      for (const [toolName, findings] of result.toolFindings) {
        const toolData = toolInteractionsMap.get(toolName);
        if (toolData) {
          toolData.findingsByPersona.push(findings);
        }
      }
    }

    return { toolInteractionsMap, personaStats, allScenarioResults };
  }

  /**
   * Convert a TestScenario to an InterviewQuestion.
   */
  private scenarioToQuestion(scenario: TestScenario): InterviewQuestion {
    return {
      description: scenario.description,
      category: scenario.category,
      args: scenario.args,
    };
  }

  /**
   * Get custom scenarios for a specific tool.
   */
  private getScenariosForTool(toolName: string): TestScenario[] {
    const scenarios = this.config.customScenarios?.toolScenarios ?? [];
    return scenarios.filter(s => s.tool === toolName && !s.skip);
  }

  /**
   * Get custom scenarios for a specific prompt.
   */
  private getScenariosForPrompt(promptName: string): PromptScenario[] {
    const scenarios = this.config.customScenarios?.promptScenarios ?? [];
    return scenarios.filter(s => s.prompt === promptName && !s.skip);
  }

  /**
   * Execute custom test scenarios for a tool.
   * Returns scenario results with assertion evaluations.
   */
  async executeToolScenarios(
    client: MCPClient,
    toolName: string,
    scenarios: TestScenario[]
  ): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      if (scenario.skip) {
        continue;
      }

      const startTime = Date.now();
      let response = null;
      let error: string | undefined;
      let isError = false;

      try {
        response = await client.callTool(toolName, scenario.args);
        isError = response.isError ?? false;

        if (isError) {
          // Extract error text from response
          const errorContent = response.content?.find(c => c.type === 'text');
          if (errorContent && 'text' in errorContent) {
            error = String(errorContent.text);
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        isError = true;
      }

      // Evaluate assertions if provided
      const assertionResults = scenario.assertions
        ? evaluateAssertions(scenario.assertions, response, isError)
        : [];

      // Scenario passes if no error (or expected error) and all assertions pass
      const allAssertionsPassed = assertionResults.every(r => r.passed);
      const passed = allAssertionsPassed && (!isError || scenario.category === 'error_handling');

      const result: ScenarioResult = {
        scenario,
        passed,
        assertionResults,
        error,
        response,
        durationMs: Date.now() - startTime,
      };

      results.push(result);

      this.logger.debug({
        tool: toolName,
        scenario: scenario.description,
        passed,
        assertions: assertionResults.length,
      }, 'Scenario executed');
    }

    return results;
  }

  /**
   * Execute custom test scenarios for a prompt.
   * Returns scenario results with assertion evaluations.
   */
  async executePromptScenarios(
    client: MCPClient,
    promptName: string,
    scenarios: PromptScenario[]
  ): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      if (scenario.skip) {
        continue;
      }

      const startTime = Date.now();
      let response = null;
      let error: string | undefined;

      try {
        response = await client.getPrompt(promptName, scenario.args);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }

      // Evaluate assertions if provided
      const assertionResults = scenario.assertions
        ? evaluateAssertions(scenario.assertions, response, !!error)
        : [];

      const allAssertionsPassed = assertionResults.every(r => r.passed);
      // Check if this scenario expects an error (has an assertion checking for 'error' to exist)
      const expectsError = scenario.assertions?.some(
        a => a.path === 'error' && a.condition === 'exists'
      ) ?? false;
      // Scenario passes if assertions pass AND (no error OR scenario expects error)
      const passed = allAssertionsPassed && (!error || expectsError);

      const result: ScenarioResult = {
        scenario,
        passed,
        assertionResults,
        error,
        response,
        durationMs: Date.now() - startTime,
      };

      results.push(result);

      this.logger.debug({
        prompt: promptName,
        scenario: scenario.description,
        passed,
        assertions: assertionResults.length,
      }, 'Prompt scenario executed');
    }

    return results;
  }

  /**
   * Execute workflow discovery and/or execution.
   * Discovers workflows using LLM if enabled, loads from file if provided,
   * and executes all workflows against the MCP server.
   */
  private async executeWorkflows(
    client: MCPClient,
    discovery: DiscoveryResult,
    workflowConfig: NonNullable<InterviewConfig['workflowConfig']>,
    progress: InterviewProgress,
    onProgress?: ProgressCallback
  ): Promise<{ results: WorkflowResult[]; summary: WorkflowSummary }> {
    const allWorkflows: Workflow[] = [];
    let discoveredCount = 0;
    let loadedCount = 0;

    // Add user-provided workflows
    if (workflowConfig.workflows && workflowConfig.workflows.length > 0) {
      allWorkflows.push(...workflowConfig.workflows);
      loadedCount = workflowConfig.workflows.length;
      this.logger.info({ count: loadedCount }, 'Using workflows loaded from file');
    }

    // Discover workflows using LLM if enabled (requires LLM - skip in check mode)
    if (workflowConfig.discoverWorkflows && discovery.tools.length >= 2 && this.llm) {
      this.logger.info('Discovering workflows using LLM analysis');

      const discoverer = new WorkflowDiscoverer(this.llm, {
        maxWorkflows: workflowConfig.maxDiscoveredWorkflows ?? WORKFLOW.MAX_DISCOVERED_WORKFLOWS,
        minSteps: WORKFLOW.MIN_WORKFLOW_STEPS,
        maxSteps: WORKFLOW.MAX_WORKFLOW_STEPS,
      });

      try {
        const discovered = await discoverer.discover(discovery.tools);
        if (discovered.length > 0) {
          allWorkflows.push(...discovered);
          discoveredCount = discovered.length;
          this.logger.info({
            count: discoveredCount,
            workflows: discovered.map(w => w.name),
          }, 'Discovered workflows');
        } else {
          this.logger.info('No workflows discovered from tool analysis');
        }
      } catch (error) {
        this.logger.warn({
          error: error instanceof Error ? error.message : String(error),
        }, 'Workflow discovery failed');
      }
    }

    // Execute all workflows
    const results: WorkflowResult[] = [];

    // Execute workflows (requires LLM for analysis - skip in check mode unless analyzeSteps is disabled)
    if (allWorkflows.length > 0 && !workflowConfig.skipWorkflowExecution && this.llm) {
      this.logger.info({ count: allWorkflows.length }, 'Executing workflows');

      progress.totalWorkflows = allWorkflows.length;
      progress.workflowsCompleted = 0;
      onProgress?.(progress);

      const executor = new WorkflowExecutor(
        client,
        this.llm,
        discovery.tools,
        {
          stepTimeout: WORKFLOW.STEP_TIMEOUT,
          analyzeSteps: !this.config.customScenariosOnly,
          generateSummary: !this.config.customScenariosOnly,
          stateTracking: workflowConfig.enableStateTracking
            ? {
              enabled: true,
              snapshotBefore: true,
              snapshotAfter: true,
              snapshotAfterEachStep: false,
            }
            : undefined,
          timeouts: {
            toolCall: WORKFLOW.STEP_TIMEOUT,
            stateSnapshot: WORKFLOW.STATE_SNAPSHOT_TIMEOUT,
            probeTool: WORKFLOW.PROBE_TOOL_TIMEOUT,
            llmAnalysis: WORKFLOW.LLM_ANALYSIS_TIMEOUT,
            llmSummary: WORKFLOW.LLM_SUMMARY_TIMEOUT,
          },
        }
      );

      for (const workflow of allWorkflows) {
        progress.currentWorkflow = workflow.name;
        onProgress?.(progress);

        this.logger.debug({
          workflowId: workflow.id,
          workflowName: workflow.name,
          stepCount: workflow.steps.length,
        }, 'Executing workflow');

        try {
          const result = await executor.execute(workflow);
          results.push(result);

          this.logger.info({
            workflowId: workflow.id,
            success: result.success,
            durationMs: result.durationMs,
          }, 'Workflow execution complete');
        } catch (error) {
          this.logger.error({
            workflowId: workflow.id,
            error: error instanceof Error ? error.message : String(error),
          }, 'Workflow execution failed');

          // Create a failed result
          results.push({
            workflow,
            steps: [],
            success: false,
            failureReason: error instanceof Error ? error.message : String(error),
            durationMs: 0,
            dataFlow: [],
          });
        }

        progress.workflowsCompleted = (progress.workflowsCompleted ?? 0) + 1;
        onProgress?.(progress);
      }
    }

    // Build summary
    const successfulCount = results.filter(r => r.success).length;
    const summary: WorkflowSummary = {
      workflowCount: results.length,
      successfulCount,
      failedCount: results.length - successfulCount,
      discoveredCount,
      loadedCount,
    };

    this.logger.info({
      total: summary.workflowCount,
      successful: summary.successfulCount,
      failed: summary.failedCount,
      discovered: summary.discoveredCount,
      loaded: summary.loadedCount,
    }, 'Workflow execution summary');

    return { results, summary };
  }
}
