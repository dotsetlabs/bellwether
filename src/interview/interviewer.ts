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
  ErrorClassification,
  AssertionSummary,
  ResponseSchema,
  ToolDependencyInfo,
  ResponseAssertionResult,
  OutcomeAssessment,
} from './types.js';
import {
  categorizeErrorSource,
  detectExternalServiceFromTool,
  getExternalServiceStatus,
  type ServiceStatus,
  type ExternalServiceName,
} from '../baseline/external-dependency-detector.js';
import type { Persona } from '../persona/types.js';
import { DEFAULT_PERSONA } from '../persona/builtins.js';
import { getLogger, startTiming } from '../logging/logger.js';
import type { TestScenario, PromptScenario, ScenarioResult } from '../scenarios/types.js';
import type { PromptQuestion, ResourceQuestion } from './types.js';
import { evaluateAssertions } from '../scenarios/evaluator.js';
import { withTimeout, DEFAULT_TIMEOUTS, parallelLimit, createMutex } from '../utils/index.js';
import type { ToolResponseCache } from '../cache/response-cache.js';
import { INTERVIEW, WORKFLOW, DISPLAY_LIMITS, SCHEMA_TESTING, OUTCOME_ASSESSMENT } from '../constants.js';
import { generateSchemaTests } from './schema-test-generator.js';
import { WorkflowDiscoverer } from '../workflow/discovery.js';
import { WorkflowExecutor } from '../workflow/executor.js';
import type { Workflow, WorkflowResult } from '../workflow/types.js';
import { RateLimiter, calculateBackoffMs, isRateLimitError } from './rate-limiter.js';
import { inferResponseSchema } from './schema-inferrer.js';
import { validateResponseAssertions } from './response-validator.js';
import { StatefulTestRunner } from './stateful-test-runner.js';
import { resolveToolDependencies, getDependencyOrder } from './dependency-resolver.js';
import { generateMockResponse } from './mock-response-generator.js';

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
  /** Summary for the last completed tool (check mode) */
  lastCompletedTool?: ToolProgressSummary;
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

export interface ToolProgressSummary {
  toolName: string;
  totalTests: number;
  passedTests: number;
  validationTotal: number;
  validationPassed: number;
  avgMs: number;
  skipped?: boolean;
  skipReason?: string;
  mocked?: boolean;
  mockService?: string;
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
 * Result of testing a single tool in check mode.
 * Used for parallel tool testing.
 */
interface ToolCheckResult {
  toolName: string;
  interactions: ToolInteraction[];
  scenarioResults: ScenarioResult[];
  questionsAsked: number;
  toolCallCount: number;
  errorCount: number;
  skipped?: boolean;
  skipReason?: string;
  mocked?: boolean;
  mockService?: string;
  responseSchema?: ResponseSchema;
  dependencyInfo?: ToolDependencyInfo;
}

type ExternalServiceDecision = {
  action: 'allow' | 'skip' | 'mock';
  serviceName?: ExternalServiceName;
  reason?: string;
};

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
  private rateLimiter?: RateLimiter;
  private responseSchemas = new Map<string, ResponseSchema>();
  private rateLimitEvents = new Map<string, number>();
  private rateLimitRetries = 0;
  private externalServiceStatuses = new Map<string, ServiceStatus>();
  private skippedTools = new Set<string>();
  private mockedTools = new Set<string>();

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
    // Fall back to DEFAULT_PERSONAS if no personas provided or empty array
    const providedPersonas = config?.personas;
    this.personas = (providedPersonas && providedPersonas.length > 0) ? providedPersonas : DEFAULT_PERSONAS;
    // Store cache reference for tool response and analysis caching
    this.cache = config?.cache;
    if (this.config.rateLimit?.enabled) {
      this.rateLimiter = new RateLimiter(this.config.rateLimit);
    }
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
   * Assess whether the tool interaction outcome matched expectations.
   */
  private assessOutcome(
    question: InterviewQuestion,
    response: MCPToolCallResult | null,
    error: string | null
  ): OutcomeAssessment {
    const expected = this.inferExpectedOutcome(question);
    const actual: 'error' | 'success' = error || response?.isError ? 'error' : 'success';
    const correct = expected === 'either' || expected === actual;
    const isValidationSuccess = expected === 'error' && actual === 'error';

    return {
      expected,
      actual,
      correct,
      isValidationSuccess,
    };
  }

  /**
   * Infer expected outcome when not explicitly provided.
   */
  private inferExpectedOutcome(question: InterviewQuestion) {
    if (question.expectedOutcome) return question.expectedOutcome;

    if (OUTCOME_ASSESSMENT.EXPECTS_ERROR_CATEGORIES.includes(question.category as never)) {
      return 'error';
    }
    if (OUTCOME_ASSESSMENT.EXPECTS_SUCCESS_CATEGORIES.includes(question.category as never)) {
      return 'success';
    }
    if (OUTCOME_ASSESSMENT.EITHER_OUTCOME_CATEGORIES.includes(question.category as never)) {
      return 'either';
    }
    if (OUTCOME_ASSESSMENT.EXPECTS_ERROR_PATTERNS.some((pattern) => pattern.test(question.description))) {
      return 'error';
    }
    return 'success';
  }

  private extractErrorMessage(response: MCPToolCallResult | null, error: string | null): string | null {
    if (error) return error;
    const errorContent = response?.content?.find((c) => c.type === 'text');
    if (errorContent && 'text' in errorContent) {
      return String(errorContent.text);
    }
    return null;
  }

  private resolveExternalServiceDecision(tool: MCPTool): ExternalServiceDecision {
    const externalConfig = this.config.externalServices;
    if (!externalConfig) {
      return { action: 'allow' };
    }

    const detected = detectExternalServiceFromTool(tool.name, tool.description);
    if (!detected) {
      return { action: 'allow' };
    }

    const status = getExternalServiceStatus(detected.serviceName, externalConfig);
    this.externalServiceStatuses.set(detected.serviceName, status);

    if (status.configured) {
      return { action: 'allow', serviceName: detected.serviceName };
    }

    const missing = status.missingCredentials.length > 0
      ? `Missing: ${status.missingCredentials.join(', ')}`
      : 'Service not configured';

    if (externalConfig.mode === 'fail') {
      throw new Error(
        `External service "${detected.displayName}" is not configured. ${missing}`
      );
    }

    if (externalConfig.mode === 'mock' && status.mockAvailable) {
      return {
        action: 'mock',
        serviceName: detected.serviceName,
        reason: missing,
      };
    }

    return {
      action: 'skip',
      serviceName: detected.serviceName,
      reason: missing,
    };
  }

  private recordRateLimitEvent(toolName: string): void {
    const current = this.rateLimitEvents.get(toolName) ?? 0;
    this.rateLimitEvents.set(toolName, current + 1);
  }

  private async callToolWithPolicies(
    client: MCPClient,
    tool: MCPTool,
    args: Record<string, unknown>,
    decisionOverride?: ExternalServiceDecision
  ): Promise<{
    response: MCPToolCallResult | null;
    error: string | null;
    mocked?: boolean;
    mockService?: string;
    skipped?: boolean;
    skipReason?: string;
    toolExecutionMs: number;
  }> {
    const decision = decisionOverride ?? this.resolveExternalServiceDecision(tool);
    if (decision.action === 'skip') {
      this.skippedTools.add(tool.name);
      return {
        response: null,
        error: null,
        skipped: true,
        skipReason: decision.reason,
        toolExecutionMs: 0,
      };
    }

    if (decision.action === 'mock') {
      if (decision.serviceName) {
        this.mockedTools.add(tool.name);
        return {
          response: generateMockResponse(tool, decision.serviceName),
          error: null,
          mocked: true,
          mockService: decision.serviceName,
          toolExecutionMs: 0,
        };
      }
      this.skippedTools.add(tool.name);
      return {
        response: null,
        error: null,
        skipped: true,
        skipReason: 'Mock response unavailable',
        toolExecutionMs: 0,
      };
    }

    const rateLimitEnabled = this.config.rateLimit?.enabled ?? false;
    let attempts = 0;
    let lastError: string | null = null;
    let toolExecutionMs = 0;

    while (attempts <= (this.config.rateLimit?.maxRetries ?? 0)) {
      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
      }

      const toolCallStart = Date.now();
      try {
        const response = await client.callTool(tool.name, args);
        toolExecutionMs = Date.now() - toolCallStart;
        const errorMessage = response.isError ? this.extractErrorMessage(response, null) : null;

        if (rateLimitEnabled && response.isError && isRateLimitError(errorMessage)) {
          this.recordRateLimitEvent(tool.name);
          this.rateLimitRetries += 1;
          attempts += 1;
          const backoff = calculateBackoffMs(attempts, this.config.rateLimit?.backoffStrategy ?? 'exponential');
          await new Promise((resolve) => setTimeout(resolve, backoff));
          lastError = errorMessage ?? 'Rate limit exceeded';
          continue;
        }

        return { response, error: errorMessage, toolExecutionMs };
      } catch (error) {
        toolExecutionMs = Date.now() - toolCallStart;
        const message = error instanceof Error ? error.message : String(error);
        if (rateLimitEnabled && isRateLimitError(message)) {
          this.recordRateLimitEvent(tool.name);
          this.rateLimitRetries += 1;
          attempts += 1;
          const backoff = calculateBackoffMs(attempts, this.config.rateLimit?.backoffStrategy ?? 'exponential');
          await new Promise((resolve) => setTimeout(resolve, backoff));
          lastError = message;
          continue;
        }

        return { response: null, error: message, toolExecutionMs };
      }
    }

    return { response: null, error: lastError ?? 'Rate limit exceeded', toolExecutionMs };
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
    let checkModeResult: {
      toolProfiles: ToolProfile[];
      scenarioResults: ScenarioResult[];
      totalToolCallCount: number;
      totalErrorCount: number;
      totalQuestionsAsked: number;
    } | null = null;

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

    } else if (this.config.checkMode) {
      // Check mode tool testing (parallel or sequential based on config)
      // This path doesn't require an LLM - uses fallback questions and simple analysis
      const statefulConfig = this.config.statefulTesting;
      const statefulEnabled = statefulConfig?.enabled ?? false;
      const dependencies = statefulEnabled ? resolveToolDependencies(discovery.tools) : [];
      const dependencyMap = new Map<string, ToolDependencyInfo>(
        dependencies.map((d) => [d.tool, d])
      );

      const toolMap = new Map(discovery.tools.map((tool) => [tool.name, tool]));
      const orderedTools = statefulEnabled
        ? getDependencyOrder(dependencies)
          .map((name) => toolMap.get(name))
          .filter((tool): tool is MCPTool => !!tool)
        : discovery.tools;

      const effectiveConcurrency = statefulEnabled
        ? 1
        : this.config.parallelTools
          ? (this.config.toolConcurrency ?? INTERVIEW.DEFAULT_TOOL_CONCURRENCY)
          : 1; // Sequential when parallelTools is disabled

      if (statefulEnabled) {
        this.logger.info({ toolCount: orderedTools.length }, 'Stateful testing enabled');
      }

      this.logger.info({ parallel: this.config.parallelTools && !statefulEnabled, concurrency: effectiveConcurrency }, 'Using check mode tool testing');

      const statefulRunner = statefulEnabled
        ? new StatefulTestRunner({ shareOutputs: statefulConfig?.shareOutputsBetweenTools ?? true })
        : undefined;

      const parallelResult = await this.interviewToolsInParallel(
        client,
        orderedTools,
        progress,
        onProgress,
        {
          statefulRunner,
          dependencyMap,
          statefulConfig,
        }
      );
      checkModeResult = parallelResult;

      // Update tool interactions map with parallel results
      for (const profile of parallelResult.toolProfiles) {
        const toolData = toolInteractionsMap.get(profile.name);
        if (toolData) {
          toolData.interactions = profile.interactions;
          toolData.findingsByPersona = [{
            personaId: 'check_mode',
            personaName: 'Check Mode',
            behavioralNotes: [],
            limitations: [],
            securityNotes: [],
          }];
        }
      }

      // Update persona stats with aggregated counts
      const checkModeStats = personaStats.get(this.personas[0].id);
      if (checkModeStats) {
        checkModeStats.questionsAsked = parallelResult.totalQuestionsAsked;
        checkModeStats.toolCallCount = parallelResult.totalToolCallCount;
        checkModeStats.errorCount = parallelResult.totalErrorCount;
      }

      allScenarioResults = parallelResult.scenarioResults;

    } else {
      // Sequential persona execution (original behavior)
      for (const persona of this.personas) {
        progress.currentPersona = persona.name;
        onProgress?.(progress);

        // Create orchestrator with server context and streaming if enabled
        const orchestrator = this.createOrchestrator(persona);
        const stats = personaStats.get(persona.id)!

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
              tool,
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
    let toolProfiles: ToolProfile[] = [];
    if (this.config.checkMode && checkModeResult) {
      toolProfiles = checkModeResult.toolProfiles;
    } else {
      for (const tool of discovery.tools) {
        const toolData = toolInteractionsMap.get(tool.name)!;

        // Aggregate findings across personas (deduplicate)
        const aggregatedProfile = this.aggregateFindings(tool.name, tool.description ?? '', toolData);
        toolProfiles.push(aggregatedProfile);
      }
    }

    // Interview prompts (if server has prompts capability)
    const promptProfiles: PromptProfile[] = [];
    if (discovery.prompts.length > 0) {
      this.logger.info({ promptCount: discovery.prompts.length }, 'Interviewing prompts');

      // Update phase for prompts
      progress.phase = 'prompts';
      progress.promptsCompleted = 0;
      onProgress?.(progress);

      // Only create orchestrator if NOT in check mode (requires LLM)
      const primaryOrchestrator = this.isCheckMode() ? null : this.createOrchestrator(this.personas[0]);

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
          if (!this.config.customScenariosOnly && !this.config.checkMode && primaryOrchestrator) {
            const llmQuestions = await primaryOrchestrator.generatePromptQuestions(prompt, 2);
            questions = [...questions, ...llmQuestions];
          }
        } else if (!this.config.customScenariosOnly && !this.config.checkMode && primaryOrchestrator) {
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
          if (this.isCheckMode() || !primaryOrchestrator) {
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
        if (this.config.customScenariosOnly || this.config.checkMode || !primaryOrchestrator) {
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

      // Only create orchestrator if NOT in check mode (requires LLM)
      const primaryOrchestrator = this.isCheckMode() ? null : this.createOrchestrator(this.personas[0]);

      for (const resource of discoveredResources) {
        progress.currentTool = `resource:${resource.name}`;
        onProgress?.(progress);

        const resourceInteractions: ResourceInteraction[] = [];

        // Generate resource questions (skip LLM in fast CI mode)
        let questions: ResourceQuestion[];
        if (this.config.checkMode || !primaryOrchestrator) {
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
          if (this.isCheckMode() || !primaryOrchestrator) {
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
        if (this.config.checkMode || !primaryOrchestrator) {
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
    const allInteractions = toolProfiles.flatMap((p) => p.interactions);
    const assertionSummary = summarizeAssertions(allInteractions);
    const rateLimitSummary = this.rateLimitEvents.size > 0
      ? {
        totalEvents: Array.from(this.rateLimitEvents.values()).reduce((sum, v) => sum + v, 0),
        totalRetries: this.rateLimitRetries,
        tools: Array.from(this.rateLimitEvents.keys()),
      }
      : undefined;

    const externalServicesSummary = this.externalServiceStatuses.size > 0
      ? {
        mode: this.config.externalServices?.mode ?? 'skip',
        unconfiguredServices: Array.from(this.externalServiceStatuses.values())
          .filter((s) => !s.configured)
          .map((s) => s.service),
        skippedTools: Array.from(this.skippedTools),
        mockedTools: Array.from(this.mockedTools),
      }
      : undefined;

    const statefulSummary = this.config.statefulTesting?.enabled
      ? {
        enabled: true,
        toolCount: toolProfiles.length,
        dependencyCount: toolProfiles.reduce(
          (sum, profile) => sum + (profile.dependencyInfo?.dependsOn.length ?? 0),
          0
        ),
        maxChainLength: this.config.statefulTesting?.maxChainLength ?? 0,
      }
      : undefined;

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
      rateLimit: rateLimitSummary,
      externalServices: externalServicesSummary,
      assertions: assertionSummary,
      statefulTesting: statefulSummary,
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
   * Classify errors from interactions to separate tool correctness from environment issues.
   */
  private classifyErrors(
    interactions: ToolInteraction[],
    toolName: string,
    toolDescription: string
  ): ErrorClassification {
    let externalServiceErrors = 0;
    let environmentErrors = 0;
    let codeBugErrors = 0;
    let unknownErrors = 0;
    const detectedServices = new Set<string>();

    for (const interaction of interactions) {
      if (interaction.error) {
        const analysis = categorizeErrorSource(
          interaction.error,
          toolName,
          toolDescription
        );

        switch (analysis.source) {
          case 'external_dependency':
            externalServiceErrors++;
            if (analysis.dependency?.displayName) {
              detectedServices.add(analysis.dependency.displayName);
            }
            break;
          case 'environment':
            environmentErrors++;
            break;
          case 'code_bug':
            codeBugErrors++;
            break;
          default:
            unknownErrors++;
        }
      }
    }

    return {
      externalServiceErrors,
      environmentErrors,
      codeBugErrors,
      unknownErrors,
      detectedServices: detectedServices.size > 0 ? Array.from(detectedServices) : undefined,
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

    // Classify errors to separate tool correctness from environment issues
    const errorClassification = this.classifyErrors(data.interactions, toolName, description);

    return {
      name: toolName,
      description,
      interactions: data.interactions,
      behavioralNotes: Array.from(behavioralNotes),
      limitations: Array.from(limitations),
      securityNotes: Array.from(securityNotes),
      findingsByPersona: data.findingsByPersona,
      errorClassification,
    };
  }

  /**
   * Execute a tool call with retry logic for recoverable errors.
   * Learns from errors and can update server context based on error messages.
   * Uses caching to avoid redundant tool calls with identical arguments.
   */
  private async executeWithRetry(
    client: MCPClient,
    tool: MCPTool,
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
    let mocked = false;
    let mockService: string | undefined;

    // Check cache for tool response (same tool + same args = same response)
    if (this.cache) {
      const cachedResponse = this.cache.getToolResponse<MCPToolCallResult>(
        tool.name,
        question.args
      );
      if (cachedResponse) {
        response = cachedResponse;
        fromCache = true;
        this.logger.debug({ toolName: tool.name, args: question.args }, 'Tool response served from cache');
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
      const result = await this.callToolWithPolicies(client, tool, question.args);
      response = result.response;
      error = result.error;
      toolExecutionMs = result.toolExecutionMs;
      mocked = !!result.mocked;
      mockService = result.mockService;
      if (result.skipped) {
        error = result.skipReason ?? 'Skipped: external service not configured';
        hadError = true;
      } else {
        stats.toolCallCount++;
        if (error || response?.isError) {
          stats.errorCount++;
          hadError = true;
          if (error) {
            this.learnFromError(error, orchestrator);
          }
        } else if (this.cache && response) {
          // Cache successful responses for reuse by other personas
          // Don't cache errors as they may be transient
          this.cache.setToolResponse(tool.name, question.args, response);
          this.logger.debug({ toolName: tool.name, args: question.args }, 'Tool response cached');
        }
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
      const analysisTool: MCPTool = { name: tool.name, description: tool.description ?? '' };
      analysis = await orchestrator.analyzeResponse(
        analysisTool,
        question,
        response,
        error
      );
      llmAnalysisMs = Date.now() - llmAnalysisStart;
    }

    const interaction: ToolInteraction = {
      toolName: tool.name,
      question,
      response,
      error,
      analysis,
      durationMs: Date.now() - interactionStart,
      toolExecutionMs: fromCache ? 0 : toolExecutionMs,
      llmAnalysisMs,
      personaId,
      outcomeAssessment: this.assessOutcome(question, response, error),
      mocked,
      mockService,
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
            tool,
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
   * Interview a single tool in check mode (parallel-safe).
   * Designed for parallel tool testing with minimal overhead.
   *
   * @param client - MCP client for tool calls
   * @param tool - Tool to test
   * @param toolCallMutex - Mutex for serializing tool calls (shared resource)
   * @returns ToolCheckResult with interactions and stats
   */
  private async interviewToolInCheckMode(
    client: MCPClient,
    tool: MCPTool,
    toolCallMutex: ReturnType<typeof createMutex>,
    statefulRunner?: StatefulTestRunner,
    dependencyInfo?: ToolDependencyInfo,
    statefulConfig?: InterviewConfig['statefulTesting']
  ): Promise<ToolCheckResult> {
    const interactions: ToolInteraction[] = [];
    const scenarioResults: ScenarioResult[] = [];
    let questionsAsked = 0;
    let toolCallCount = 0;
    let errorCount = 0;
    const maxChainLength = statefulConfig?.maxChainLength ?? Number.POSITIVE_INFINITY;
    const allowStateful = !!statefulRunner && (dependencyInfo?.sequencePosition ?? 0) < maxChainLength;
    const externalDecision = this.resolveExternalServiceDecision(tool);

    if (externalDecision.action === 'skip') {
      this.skippedTools.add(tool.name);
      return {
        toolName: tool.name,
        interactions: [],
        scenarioResults,
        questionsAsked,
        toolCallCount,
        errorCount,
        skipped: true,
        skipReason: externalDecision.reason,
        dependencyInfo,
      };
    }

    // Check for custom scenarios for this tool
    const customScenarios = this.getScenariosForTool(tool.name);

    // Build questions list - custom scenarios or fallback questions
    let questions: InterviewQuestion[] = [];

    if (customScenarios.length > 0) {
      // Execute custom scenarios
      await toolCallMutex.acquire();
      try {
        const results = await this.executeToolScenarios(client, tool.name, customScenarios);
        scenarioResults.push(...results);
        toolCallCount += results.length;
        errorCount += results.filter(r => !r.passed).length;
      } finally {
        toolCallMutex.release();
      }

      // Convert scenarios to interview questions
      questions = customScenarios.map(s => this.scenarioToQuestion(s));
    } else {
      // No custom scenarios - use fallback questions (check mode, no LLM)
      // We need an orchestrator for fallback questions, but we won't use LLM
      // Get fallback questions directly
      questions = this.getFallbackQuestionsForTool(tool, this.config.skipErrorTests)
        .slice(0, this.config.maxQuestionsPerTool);
    }

    // Execute warmup runs if configured (helps reduce cold-start timing variance)
    // Warmup runs are not recorded in interactions
    const warmupRuns = this.config.warmupRuns ?? 1;
    if (warmupRuns > 0 && questions.length > 0) {
      const warmupQuestion = questions[0]; // Use first question for warmup
      await toolCallMutex.acquire();
      try {
        for (let i = 0; i < warmupRuns; i++) {
          try {
            await this.callToolWithPolicies(client, tool, warmupQuestion.args, externalDecision);
          } catch {
            // Ignore warmup errors - we just want to warm up the system
          }
        }
      } finally {
        toolCallMutex.release();
      }
      this.logger.debug({ tool: tool.name, warmupRuns }, 'Warmup runs complete');
    }

    // Ask each question
    for (const question of questions) {
      const interactionStart = Date.now();
      let response: MCPToolCallResult | null = null;
      let error: string | null = null;
      let toolExecutionMs = 0;
      let assertionResults: ResponseAssertionResult[] | undefined;
      let assertionsPassed: boolean | undefined;
      let mocked = false;
      let mockService: string | undefined;

      const expectedOutcome = this.inferExpectedOutcome(question);
      const shouldUseState = allowStateful && expectedOutcome !== 'error';
      const statefulArgs = shouldUseState && statefulRunner
        ? statefulRunner.applyStateToQuestion(tool.name, question)
        : { args: { ...question.args }, usedKeys: [] };

      const resolvedQuestion: InterviewQuestion = {
        ...question,
        args: statefulArgs.args,
        metadata: {
          ...question.metadata,
          stateful: {
            usedKeys: statefulArgs.usedKeys,
          },
        },
      };

      // Acquire mutex for tool calls (shared MCP client)
      await toolCallMutex.acquire();
      try {
        const result = await this.callToolWithPolicies(client, tool, resolvedQuestion.args, externalDecision);
        response = result.response;
        error = result.error;
        toolExecutionMs = result.toolExecutionMs;
        mocked = !!result.mocked;
        mockService = result.mockService;

        if (!result.skipped) {
          toolCallCount++;
          if (error || response?.isError) {
            errorCount++;
          }
        }
      } finally {
        toolCallMutex.release();
      }

      // Generate simple analysis (no LLM in check mode)
      const analysis = this.generateSimpleAnalysis(error, !!response, 'Tool call succeeded.');

      const outcomeAssessment = this.assessOutcome(resolvedQuestion, response, error);

      if (this.config.assertions?.enabled && outcomeAssessment.expected === 'success' && response && !response.isError) {
        let schema = this.responseSchemas.get(tool.name);
        if (!schema && this.config.assertions?.infer) {
          const inferred = inferResponseSchema(response);
          if (inferred) {
            schema = inferred;
            this.responseSchemas.set(tool.name, inferred);
          }
        }

        if (schema) {
          assertionResults = validateResponseAssertions(response, schema);
          assertionsPassed = assertionResults.every((r) => r.passed);
        }
      }

      if (allowStateful && response && !response.isError && statefulRunner) {
        const providedKeys = statefulRunner.recordResponse(tool, response);
        resolvedQuestion.metadata = {
          ...resolvedQuestion.metadata,
          stateful: {
            ...(resolvedQuestion.metadata?.stateful ?? {}),
            providedKeys,
          },
        };
      }

      const interaction: ToolInteraction = {
        toolName: tool.name,
        question: resolvedQuestion,
        response,
        error,
        analysis,
        durationMs: Date.now() - interactionStart,
        toolExecutionMs,
        llmAnalysisMs: 0, // No LLM in check mode
        personaId: 'check_mode',
        outcomeAssessment,
        assertionResults,
        assertionsPassed,
        mocked,
        mockService,
      };

      interactions.push(interaction);
      questionsAsked++;
    }

    this.logger.debug({
      tool: tool.name,
      questionsAsked,
      toolCallCount,
      errorCount,
    }, 'Tool check complete');

    return {
      toolName: tool.name,
      interactions,
      scenarioResults,
      questionsAsked,
      toolCallCount,
      errorCount,
      mocked: interactions.some((i) => i.mocked),
      mockService: interactions.find((i) => i.mockService)?.mockService,
      responseSchema: this.responseSchemas.get(tool.name),
      dependencyInfo,
    };
  }

  /**
   * Get fallback questions for a tool without requiring an orchestrator.
   * Used in check mode when parallel tool testing is enabled.
   *
   * Uses the SchemaTestGenerator to produce comprehensive deterministic tests
   * including boundaries, type coercion, enum validation, and error handling.
   */
  private getFallbackQuestionsForTool(
    tool: MCPTool,
    skipErrorTests: boolean
  ): InterviewQuestion[] {
    // Use the enhanced schema test generator for comprehensive coverage
    // Allow more tests in check mode since there's no LLM cost
    const maxTests = Math.max(
      this.config.maxQuestionsPerTool * 4,
      SCHEMA_TESTING.MAX_TESTS_PER_TOOL
    );

    return generateSchemaTests(tool, {
      skipErrorTests,
      maxTestsPerTool: maxTests,
    });
  }

  /**
   * Run parallel tool testing in check mode.
   * Tests all tools concurrently with a configurable worker limit.
   *
   * @param client - MCP client for tool calls
   * @param tools - Tools to test
   * @param onProgress - Progress callback
   * @returns Aggregated tool profiles
   */
  private async interviewToolsInParallel(
    client: MCPClient,
    tools: MCPTool[],
    progress: InterviewProgress,
    onProgress?: ProgressCallback,
    options?: {
      statefulRunner?: StatefulTestRunner;
      dependencyMap?: Map<string, ToolDependencyInfo>;
      statefulConfig?: InterviewConfig['statefulTesting'];
    }
  ): Promise<{
    toolProfiles: ToolProfile[];
    scenarioResults: ScenarioResult[];
    totalToolCallCount: number;
    totalErrorCount: number;
    totalQuestionsAsked: number;
  }> {
    // Use concurrency=1 for sequential execution when parallelTools is disabled
    const statefulEnabled = !!options?.statefulRunner;
    const concurrency = statefulEnabled
      ? 1
      : this.config.parallelTools
        ? (this.config.toolConcurrency ?? INTERVIEW.DEFAULT_TOOL_CONCURRENCY)
        : 1;
    const toolCallMutex = createMutex(); // Shared mutex for serializing MCP client calls

    this.logger.info({
      toolCount: tools.length,
      concurrency,
      parallel: this.config.parallelTools,
    }, 'Running check mode tool testing');

    // Create tasks for each tool
    const toolTasks = tools.map(tool => async () => {
      progress.currentTool = tool.name;
      onProgress?.(progress);

      const result = await this.interviewToolInCheckMode(
        client,
        tool,
        toolCallMutex,
        options?.statefulRunner,
        options?.dependencyMap?.get(tool.name),
        options?.statefulConfig
      );

      progress.toolsCompleted++;
      progress.questionsAsked += result.questionsAsked;
      progress.lastCompletedTool = this.buildToolProgressSummary(result);
      onProgress?.(progress);

      return result;
    });

    // Execute tools in parallel with concurrency limit
    const parallelResults = await parallelLimit(toolTasks, { concurrency });

    // Check for errors
    if (!parallelResults.allSucceeded) {
      for (const [index, error] of parallelResults.errors) {
        this.logger.error({
          tool: tools[index]?.name,
          error: error.message,
        }, 'Tool check failed');
      }
    }

    // Aggregate results
    const successfulResults = parallelResults.results.filter((r): r is ToolCheckResult => r !== undefined);
    const toolProfiles: ToolProfile[] = [];
    const scenarioResults: ScenarioResult[] = [];
    let totalToolCallCount = 0;
    let totalErrorCount = 0;
    let totalQuestionsAsked = 0;

    for (const result of successfulResults) {
      const tool = tools.find(t => t.name === result.toolName);
      if (!tool) continue;

      // Classify errors to separate tool correctness from environment issues
      const errorClassification = this.classifyErrors(
        result.interactions,
        result.toolName,
        tool.description ?? ''
      );

      const assertionSummary = summarizeAssertions(result.interactions);

      // Build minimal profile for check mode
      toolProfiles.push({
        name: result.toolName,
        description: tool.description ?? '',
        interactions: result.interactions,
        behavioralNotes: [],
        limitations: [],
        securityNotes: [],
        findingsByPersona: [],
        errorClassification,
        skipped: result.skipped,
        skipReason: result.skipReason,
        mocked: result.mocked,
        mockService: result.mockService,
        responseSchema: result.responseSchema,
        assertionSummary,
        dependencyInfo: result.dependencyInfo,
      });

      scenarioResults.push(...result.scenarioResults);
      totalToolCallCount += result.toolCallCount;
      totalErrorCount += result.errorCount;
      totalQuestionsAsked += result.questionsAsked;
    }

    this.logger.info({
      toolCount: toolProfiles.length,
      totalToolCallCount,
      totalErrorCount,
    }, 'Parallel tool testing complete');

    return {
      toolProfiles,
      scenarioResults,
      totalToolCallCount,
      totalErrorCount,
      totalQuestionsAsked,
    };
  }

  private buildToolProgressSummary(result: ToolCheckResult): ToolProgressSummary {
    const interactions = result.interactions.filter(i => !i.mocked);
    const totalTests = interactions.length;
    let passedTests = 0;
    let validationTotal = 0;
    let validationPassed = 0;
    let totalDuration = 0;

    for (const interaction of interactions) {
      totalDuration += interaction.durationMs;
      const assessment = interaction.outcomeAssessment;
      if (assessment) {
        if (assessment.correct) {
          passedTests += 1;
        }
        if (assessment.expected === 'error') {
          validationTotal += 1;
          if (assessment.correct) {
            validationPassed += 1;
          }
        }
      } else {
        const hasError = interaction.error || interaction.response?.isError;
        if (!hasError) {
          passedTests += 1;
        }
      }
    }

    const avgMs = totalTests > 0 ? Math.round(totalDuration / totalTests) : 0;

    return {
      toolName: result.toolName,
      totalTests,
      passedTests,
      validationTotal,
      validationPassed,
      avgMs,
      skipped: result.skipped,
      skipReason: result.skipReason,
      mocked: result.mocked,
      mockService: result.mockService,
    };
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
    const tool: MCPTool = { name: toolName, description: '' };

    for (const scenario of scenarios) {
      if (scenario.skip) {
        continue;
      }

      const startTime = Date.now();
      let response = null;
      let error: string | undefined;
      let isError = false;

      try {
        const result = await this.callToolWithPolicies(client, tool, scenario.args);
        if (result.skipped) {
          error = result.skipReason ?? 'Skipped: external service not configured';
          isError = true;
        } else {
          response = result.response;
          isError = response?.isError ?? false;
          if (isError) {
            const errorContent = response?.content?.find(c => c.type === 'text');
            if (errorContent && 'text' in errorContent) {
              error = String(errorContent.text);
            }
          }
          if (result.error) {
            error = result.error;
            isError = true;
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

      const stepTimeout = workflowConfig.stepTimeout ?? WORKFLOW.STEP_TIMEOUT;
      const timeouts = workflowConfig.timeouts ?? {
        toolCall: stepTimeout,
        stateSnapshot: WORKFLOW.STATE_SNAPSHOT_TIMEOUT,
        probeTool: WORKFLOW.PROBE_TOOL_TIMEOUT,
        llmAnalysis: WORKFLOW.LLM_ANALYSIS_TIMEOUT,
        llmSummary: WORKFLOW.LLM_SUMMARY_TIMEOUT,
      };

      const executor = new WorkflowExecutor(
        client,
        this.llm,
        discovery.tools,
        {
          stepTimeout,
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
          timeouts,
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

function summarizeAssertions(interactions: ToolInteraction[]): AssertionSummary | undefined {
  const allResults = interactions
    .filter((i) => !i.mocked)
    .flatMap((i) => i.assertionResults ?? []);
  if (allResults.length === 0) return undefined;
  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.length - passed;
  return {
    total: allResults.length,
    passed,
    failed,
  };
}
