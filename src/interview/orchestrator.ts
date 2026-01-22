import type { LLMClient, StreamingOptions } from '../llm/client.js';
import type {
  MCPTool,
  MCPToolCallResult,
  MCPPrompt,
  MCPPromptGetResult,
  MCPResource,
  MCPResourceReadResult,
} from '../transport/types.js';
import type {
  InterviewQuestion,
  ToolProfile,
  ServerContext,
  PromptQuestion,
  PromptProfile,
  ResourceQuestion,
  ResourceProfile,
} from './types.js';
import type { DiscoveryResult } from '../discovery/types.js';
import type { Persona, QuestionCategory } from '../persona/types.js';
import { DEFAULT_PERSONA } from '../persona/builtins.js';
import type { ToolResponseCache } from '../cache/response-cache.js';
import {
  DEFAULT_SYSTEM_PROMPT,
  buildQuestionGenerationPrompt,
  buildResponseAnalysisPrompt,
  buildToolProfileSynthesisPrompt,
  buildOverallSynthesisPrompt,
  buildPromptQuestionGenerationPrompt,
  buildPromptResponseAnalysisPrompt,
  buildPromptProfileSynthesisPrompt,
  COMPLETION_OPTIONS,
} from '../prompts/templates.js';
import { getLogger } from '../logging/logger.js';
import { withTimeout, DEFAULT_TIMEOUTS, TimeoutError } from '../utils/timeout.js';
import { RETRY, DISPLAY_LIMITS, ORCHESTRATOR } from '../constants.js';

/**
 * Error categories for LLM operations.
 */
type LLMErrorCategory = 'refusal' | 'rate_limit' | 'timeout' | 'auth' | 'network' | 'format_error' | 'unknown';

/**
 * Extended schema property type for structural test generation.
 */
interface StructuralPropertySchema {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  examples?: unknown[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  items?: StructuralPropertySchema;
  properties?: Record<string, StructuralPropertySchema>;
  required?: string[];
  description?: string;
  oneOf?: StructuralPropertySchema[];
  anyOf?: StructuralPropertySchema[];
}

/**
 * Extended input schema type for structural test generation.
 */
interface StructuralInputSchema {
  type?: string;
  properties?: Record<string, StructuralPropertySchema>;
  required?: string[];
  examples?: unknown[];
  default?: unknown;
}

/**
 * Categorize an error from LLM operations.
 */
function categorizeLLMError(error: unknown): { category: LLMErrorCategory; isRetryable: boolean; message: string } {
  if (error instanceof TimeoutError) {
    return { category: 'timeout', isRetryable: true, message: error.message };
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // Check for refusals
  if (
    message.includes('refused') ||
    message.includes('cannot generate') ||
    message.includes('unable to create') ||
    message.includes('content policy')
  ) {
    return { category: 'refusal', isRetryable: false, message: 'LLM declined to generate content' };
  }

  // Check for rate limits
  if (
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('too many requests')
  ) {
    return { category: 'rate_limit', isRetryable: true, message: 'Rate limit exceeded' };
  }

  // Check for auth errors
  if (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('api key')
  ) {
    return { category: 'auth', isRetryable: false, message: 'Authentication error' };
  }

  // Check for network errors
  if (
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('socket')
  ) {
    return { category: 'network', isRetryable: true, message: 'Network error' };
  }

  // Check for empty response (token exhaustion or model issues) - retryable
  if (
    message.includes('empty or whitespace') ||
    message.includes('token exhaustion') ||
    message.includes('unexpected end of json')
  ) {
    return { category: 'format_error', isRetryable: true, message: 'LLM returned empty response (possible token exhaustion)' };
  }

  // Check for format errors (LLM returned wrong format) - retryable once
  if (
    message.includes('invalid question format') ||
    message.includes('response was not an array') ||
    message.includes('unexpected token') ||
    message.includes('not valid json')
  ) {
    return { category: 'format_error', isRetryable: true, message: 'LLM returned invalid format' };
  }

  return { category: 'unknown', isRetryable: false, message: error instanceof Error ? error.message : String(error) };
}

/**
 * Streaming callback for orchestrator operations.
 */
export interface OrchestratorStreamingCallbacks {
  /** Called when streaming starts for an operation */
  onStart?: (operation: string, context?: string) => void;
  /** Called with each chunk of streaming text */
  onChunk?: (chunk: string, operation: string) => void;
  /** Called when streaming completes for an operation */
  onComplete?: (text: string, operation: string) => void;
  /** Called if an error occurs during streaming */
  onError?: (error: Error, operation: string) => void;
}

/**
 * Orchestrator uses an LLM to generate interview questions and synthesize findings.
 * Optionally accepts a Persona to customize the interview style.
 * Supports streaming output for real-time feedback during LLM operations.
 */
export class Orchestrator {
  private persona: Persona;
  private serverContext?: ServerContext;
  private logger = getLogger('orchestrator');
  private streamingCallbacks?: OrchestratorStreamingCallbacks;
  private useStreaming: boolean = false;
  private cache?: ToolResponseCache;

  constructor(
    private llm: LLMClient,
    persona?: Persona,
    serverContext?: ServerContext,
    cache?: ToolResponseCache
  ) {
    this.persona = persona ?? DEFAULT_PERSONA;
    this.serverContext = serverContext;
    this.cache = cache;
  }

  /**
   * Enable streaming with callbacks.
   */
  enableStreaming(callbacks: OrchestratorStreamingCallbacks): void {
    this.useStreaming = true;
    this.streamingCallbacks = callbacks;
  }

  /**
   * Disable streaming.
   */
  disableStreaming(): void {
    this.useStreaming = false;
    this.streamingCallbacks = undefined;
  }

  /**
   * Check if streaming is enabled.
   */
  isStreamingEnabled(): boolean {
    return this.useStreaming && this.llm.getProviderInfo().supportsStreaming;
  }

  /**
   * Create streaming options for an LLM call.
   */
  private createStreamingOptions(operation: string): Partial<StreamingOptions> {
    if (!this.useStreaming || !this.streamingCallbacks) {
      return {};
    }

    return {
      onChunk: (chunk: string) => this.streamingCallbacks?.onChunk?.(chunk, operation),
      onComplete: (text: string) => this.streamingCallbacks?.onComplete?.(text, operation),
      onError: (error: Error) => this.streamingCallbacks?.onError?.(error, operation),
    };
  }

  /**
   * Complete an LLM call, using streaming if enabled.
   * Falls back to non-streaming if streaming returns empty content.
   */
  private async completeWithStreaming(
    prompt: string,
    options: Parameters<LLMClient['complete']>[1],
    operation: string
  ): Promise<string> {
    if (this.isStreamingEnabled()) {
      this.streamingCallbacks?.onStart?.(operation);
      const streamingOpts = this.createStreamingOptions(operation);
      try {
        const result = await this.llm.stream(prompt, { ...options, ...streamingOpts });
        // If streaming returned empty/incomplete, fall back to non-streaming
        if (!result.completed || !result.text) {
          this.logger.warn({ operation }, 'Streaming returned empty, falling back to non-streaming');
          // Notify callbacks about the fallback
          this.streamingCallbacks?.onError?.(new Error('Streaming returned empty content'), operation);
          return this.llm.complete(prompt, options);
        }
        return result.text;
      } catch (error) {
        // On streaming error, fall back to non-streaming
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn({ operation, error: errorMessage }, 'Streaming failed, falling back to non-streaming');
        // Notify callbacks about the error
        this.streamingCallbacks?.onError?.(error instanceof Error ? error : new Error(errorMessage), operation);
        return this.llm.complete(prompt, options);
      }
    }
    return this.llm.complete(prompt, options);
  }

  /**
   * Set server context for contextually appropriate question generation.
   */
  setServerContext(context: ServerContext): void {
    this.serverContext = context;
  }

  /**
   * Get the current server context.
   */
  getServerContext(): ServerContext | undefined {
    return this.serverContext;
  }

  /**
   * Get the current persona.
   */
  getPersona(): Persona {
    return this.persona;
  }

  /**
   * Set a new persona for subsequent operations.
   */
  setPersona(persona: Persona): void {
    this.persona = persona;
  }

  /**
   * Get the system prompt, combining persona prompt with additional context.
   */
  private getSystemPrompt(): string {
    let prompt = this.persona.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    if (this.persona.additionalContext) {
      prompt += `\n\n${this.persona.additionalContext}`;
    }
    return prompt;
  }

  /**
   * Get categories to focus on based on persona bias.
   */
  private getCategoryDistribution(maxQuestions: number): QuestionCategory[] {
    const bias = this.persona.questionBias;
    const categories: QuestionCategory[] = [];

    // Build weighted distribution
    const weights: [QuestionCategory, number][] = [
      ['happy_path', bias.happyPath],
      ['edge_case', bias.edgeCase],
      ['error_handling', bias.errorHandling],
      ['boundary', bias.boundary],
    ];

    if (bias.security && bias.security > 0) {
      weights.push(['security', bias.security]);
    }

    // Normalize weights
    const totalWeight = weights.reduce((sum, [, w]) => sum + w, 0);

    // Distribute questions based on weights
    for (let i = 0; i < maxQuestions; i++) {
      let random = Math.random() * totalWeight;
      for (const [category, weight] of weights) {
        random -= weight;
        if (random <= 0) {
          categories.push(category);
          break;
        }
      }
      // Fallback if rounding issues
      if (categories.length <= i) {
        categories.push('happy_path');
      }
    }

    return categories;
  }

  /**
   * Generate interview questions for a tool.
   * Optionally accepts previous errors to learn from and avoid.
   *
   * Error handling strategy:
   * - Refusals: Use fallback questions (no retry)
   * - Rate limits: Retry with backoff
   * - Timeouts: Retry once, then fallback
   * - Auth errors: Log and use fallback (no retry)
   * - Network errors: Retry with backoff
   * - Unknown errors: Log and use fallback
   */
  async generateQuestions(
    tool: MCPTool,
    maxQuestions: number = 3,
    skipErrorTests: boolean = false,
    previousErrors?: Array<{ args: Record<string, unknown>; error: string }>
  ): Promise<InterviewQuestion[]> {
    // Get category distribution based on persona bias
    const targetCategories = this.getCategoryDistribution(maxQuestions);
    const categoryCounts = targetCategories.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const categoryGuidance = Object.entries(categoryCounts)
      .map(([cat, count]) => `${count} ${cat.replace('_', ' ')} example(s)`)
      .join(', ');

    // Build category list including security if persona uses it
    let categoryList = '"happy_path" (normal usage), "edge_case" (boundary values), "error_handling" (incomplete inputs), "boundary" (limits)';
    if (this.persona.questionBias.security && this.persona.questionBias.security > 0) {
      categoryList += ', "security" (security testing)';
    }

    const prompt = buildQuestionGenerationPrompt({
      tool,
      maxQuestions,
      categoryGuidance,
      categoryList,
      skipErrorTests,
      serverContext: this.serverContext,
      previousErrors,
    });

    // Retry logic for transient errors
    const maxRetries = 2;
    let lastError: { category: LLMErrorCategory; message: string } | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let rawResponse: string | undefined;
      try {
        // Apply timeout to LLM call - use streaming if enabled
        const response = await withTimeout(
          this.completeWithStreaming(prompt, {
            ...COMPLETION_OPTIONS.questionGeneration,
            systemPrompt: this.getSystemPrompt(),
          }, `generate-questions:${tool.name}`),
          DEFAULT_TIMEOUTS.questionGeneration,
          `Question generation for ${tool.name}`
        );

        rawResponse = response;

        // Check for empty/whitespace-only responses (common with token exhaustion)
        const trimmed = response.trim();
        if (!trimmed || /^[\s\t\n]+$/.test(response)) {
          throw new Error('LLM returned empty or whitespace-only response (possible token exhaustion)');
        }

        const parsed = this.llm.parseJSON<InterviewQuestion[] | InterviewQuestion | { error?: string }>(response);

        // Handle different response formats
        if (Array.isArray(parsed)) {
          // Ideal case: LLM returned an array
          return parsed.slice(0, maxQuestions);
        }

        // Check if it's a single valid question object (LLM sometimes returns single objects)
        const obj = parsed as Record<string, unknown>;
        if (obj.description && obj.category && obj.args !== undefined) {
          // It's a valid question object, wrap it in an array
          this.logger.debug({ tool: tool.name }, 'LLM returned single question object, wrapping in array');
          return [parsed as InterviewQuestion];
        }

        // Check for wrapped array format (e.g., {"test_cases": [...]} or {"questions": [...]})
        // Some models wrap the array in an object instead of returning bare array
        const wrapperKeys = ['test_cases', 'questions', 'tests', 'items', 'data'];
        for (const key of wrapperKeys) {
          if (Array.isArray(obj[key])) {
            this.logger.debug({ tool: tool.name, wrapperKey: key }, 'LLM wrapped array in object, unwrapping');
            return (obj[key] as InterviewQuestion[]).slice(0, maxQuestions);
          }
        }

        // It's an error object or invalid format
        const errorMsg = (parsed as { error?: string })?.error ?? 'Response was not a valid question format';
        throw new Error(`Invalid question format: ${errorMsg}`);
      } catch (error) {
        const categorized = categorizeLLMError(error);
        lastError = { category: categorized.category, message: categorized.message };

        this.logger.warn(
          {
            tool: tool.name,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            errorCategory: categorized.category,
            errorMessage: categorized.message,
            isRetryable: categorized.isRetryable,
            rawResponse: rawResponse?.substring(0, 1000),
          },
          'Question generation failed'
        );

        // Don't retry non-retryable errors
        if (!categorized.isRetryable) {
          break;
        }

        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(RETRY.INITIAL_DELAY * Math.pow(2, attempt), RETRY.MAX_DELAY);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Log the final failure reason clearly
    this.logger.info(
      {
        tool: tool.name,
        reason: lastError?.category ?? 'unknown',
        message: lastError?.message ?? 'No error details',
      },
      'Using fallback questions after LLM failure'
    );

    // Slice fallback questions to respect maxQuestions limit
    return this.generateStructuralTestCases(tool, skipErrorTests).slice(0, maxQuestions);
  }

  /**
   * Analyze a tool response and generate behavioral notes.
   * Uses cache to avoid redundant LLM calls for identical tool responses.
   */
  async analyzeResponse(
    tool: MCPTool,
    question: InterviewQuestion,
    response: MCPToolCallResult | null,
    error: string | null
  ): Promise<string> {
    // Check cache first
    if (this.cache && response) {
      const responseHash = this.cache.hashResponse(response);
      const cachedAnalysis = this.cache.getAnalysis(tool.name, question.args, responseHash);
      if (cachedAnalysis) {
        this.logger.debug({ tool: tool.name, args: question.args }, 'LLM analysis served from cache');
        return cachedAnalysis;
      }
    }

    const prompt = buildResponseAnalysisPrompt({
      tool,
      question,
      response,
      error,
      persona: this.persona,
    });

    try {
      const analysis = await this.completeWithStreaming(prompt, {
        ...COMPLETION_OPTIONS.responseAnalysis,
        systemPrompt: this.getSystemPrompt(),
      }, `analyze:${tool.name}`);

      // Cache successful analysis
      if (this.cache && response && analysis) {
        const responseHash = this.cache.hashResponse(response);
        this.cache.setAnalysis(tool.name, question.args, responseHash, analysis);
        this.logger.debug({ tool: tool.name, args: question.args }, 'LLM analysis cached');
      }

      return analysis;
    } catch (llmError) {
      // Graceful fallback if LLM refuses or fails
      this.logger.debug({
        tool: tool.name,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      }, 'LLM analysis failed, using fallback');
      if (error) {
        return `Tool returned an error: ${error}`;
      }
      if (response?.content) {
        const textContent = response.content.find(c => c.type === 'text');
        if (textContent && 'text' in textContent) {
          return `Tool returned: ${String(textContent.text).substring(0, DISPLAY_LIMITS.TOOL_RESPONSE_PREVIEW)}`;
        }
      }
      return 'Tool executed successfully.';
    }
  }

  /**
   * Synthesize findings for a single tool into a profile.
   */
  async synthesizeToolProfile(
    tool: MCPTool,
    interactions: { question: InterviewQuestion; response: MCPToolCallResult | null; error: string | null; analysis: string }[]
  ): Promise<Omit<ToolProfile, 'interactions'>> {
    const prompt = buildToolProfileSynthesisPrompt({ tool, interactions });

    try {
      const response = await this.completeWithStreaming(prompt, {
        ...COMPLETION_OPTIONS.profileSynthesis,
        systemPrompt: this.getSystemPrompt(),
      }, `synthesize-tool:${tool.name}`);

      const result = this.llm.parseJSON<{
        behavioralNotes: string[];
        limitations: string[];
        securityNotes: string[];
      }>(response);

      return {
        name: tool.name,
        description: tool.description ?? 'No description provided',
        behavioralNotes: result.behavioralNotes ?? [],
        limitations: result.limitations ?? [],
        securityNotes: result.securityNotes ?? [],
      };
    } catch (error) {
      // Graceful fallback if LLM fails or refuses
      const reason = error instanceof Error ? error.message : '';
      if (reason.includes('refused')) {
        this.logger.info({ tool: tool.name }, 'Using basic profile (LLM declined)');
      }
      return {
        name: tool.name,
        description: tool.description ?? 'No description provided',
        behavioralNotes: interactions.map(i => i.analysis).filter(a => a),
        limitations: [],
        securityNotes: [],
      };
    }
  }

  /**
   * Generate overall summary for the interview result.
   */
  async synthesizeOverall(
    discovery: DiscoveryResult,
    toolProfiles: ToolProfile[]
  ): Promise<{ summary: string; limitations: string[]; recommendations: string[] }> {
    const prompt = buildOverallSynthesisPrompt({ discovery, toolProfiles });

    try {
      const response = await this.completeWithStreaming(prompt, {
        ...COMPLETION_OPTIONS.overallSynthesis,
        systemPrompt: this.getSystemPrompt(),
      }, 'synthesize-overall');

      return this.llm.parseJSON<{
        summary: string;
        limitations: string[];
        recommendations: string[];
      }>(response);
    } catch (error) {
      // Graceful fallback if LLM fails or refuses
      const reason = error instanceof Error ? error.message : '';
      if (reason.includes('refused')) {
        this.logger.info({}, 'Using basic summary (LLM declined)');
      }
      return {
        summary: `${discovery.serverInfo.name} provides ${discovery.tools.length} tools for MCP integration.`,
        limitations: [],
        recommendations: [],
      };
    }
  }

  /**
   * Get fallback questions without LLM call (for fast CI mode).
   * Enhanced to generate comprehensive test cases from schema analysis.
   */
  getFallbackQuestions(tool: MCPTool, skipErrorTests: boolean): InterviewQuestion[] {
    return this.generateStructuralTestCases(tool, skipErrorTests);
  }

  /**
   * Generate comprehensive test cases for check mode.
   * Analyzes schema to create meaningful tests without LLM.
   */
  private generateStructuralTestCases(tool: MCPTool, skipErrorTests: boolean): InterviewQuestion[] {
    const happyPathTests: InterviewQuestion[] = [];
    const edgeCaseTests: InterviewQuestion[] = [];
    const errorTests: InterviewQuestion[] = [];
    const schema = tool.inputSchema as StructuralInputSchema | undefined;
    const seenArgsHashes = new Set<string>();

    // Helper to avoid duplicate test cases
    const addQuestion = (q: InterviewQuestion, list: InterviewQuestion[]): boolean => {
      const hash = JSON.stringify(q.args);
      if (seenArgsHashes.has(hash)) return false;
      seenArgsHashes.add(hash);
      list.push(q);
      return true;
    };

    // Schema-level examples take highest priority (author-provided)
    if (schema?.examples && Array.isArray(schema.examples)) {
      for (const example of schema.examples.slice(0, ORCHESTRATOR.MAX_SCHEMA_EXAMPLES)) {
        if (example && typeof example === 'object') {
          addQuestion({
            description: 'Test with schema-provided example',
            category: 'happy_path',
            args: example as Record<string, unknown>,
          }, happyPathTests);
        }
      }
    }

    if (schema?.default && typeof schema.default === 'object') {
      addQuestion({
        description: 'Test with schema default values',
        category: 'happy_path',
        args: schema.default as Record<string, unknown>,
      }, happyPathTests);
    }

    const defaultArgs = this.buildArgsFromDefaults(schema);
    if (Object.keys(defaultArgs).length > 0) {
      addQuestion({
        description: 'Test with property default values',
        category: 'happy_path',
        args: defaultArgs,
      }, happyPathTests);
    }

    const exampleArgs = this.buildArgsFromExamples(schema);
    if (Object.keys(exampleArgs).length > 0) {
      addQuestion({
        description: 'Test with property example values',
        category: 'happy_path',
        args: exampleArgs,
      }, happyPathTests);
    }

    const smartArgs = this.buildSmartDefaultArgs(schema);
    addQuestion({
      description: 'Basic functionality test with required parameters',
      category: 'happy_path',
      args: smartArgs,
    }, happyPathTests);

    const enumTests = this.generateEnumTests(schema, smartArgs);
    for (const test of enumTests.slice(0, ORCHESTRATOR.MAX_ENUM_TESTS)) {
      addQuestion(test, happyPathTests);
    }

    const boundaryTests = this.generateBoundaryTests(schema, smartArgs);
    for (const test of boundaryTests.slice(0, ORCHESTRATOR.MAX_BOUNDARY_TESTS)) {
      addQuestion(test, edgeCaseTests);
    }

    const optionalTests = this.generateOptionalParamTests(schema);
    for (const test of optionalTests.slice(0, ORCHESTRATOR.MAX_OPTIONAL_TESTS)) {
      addQuestion(test, happyPathTests);
    }

    if (!skipErrorTests) {
      // Empty args (missing required)
      addQuestion({
        description: 'Test with empty/missing parameters',
        category: 'error_handling',
        args: {},
      }, errorTests);

      // Invalid type tests
      const invalidTests = this.generateInvalidTypeTests(schema);
      for (const test of invalidTests.slice(0, ORCHESTRATOR.MAX_INVALID_TYPE_TESTS)) {
        addQuestion(test, errorTests);
      }
    }

    // Combine tests, ensuring a balanced mix:
    // - At least 1 error handling test if not skipped (put early to ensure inclusion when sliced)
    // - Then happy path tests
    // - Then edge case tests
    // - Then remaining error tests
    const questions: InterviewQuestion[] = [];

    // Add first happy path test (if any)
    if (happyPathTests.length > 0) {
      questions.push(happyPathTests[0]);
    }

    // Add first error handling test (if any and not skipped)
    if (errorTests.length > 0) {
      questions.push(errorTests[0]);
    }

    // Add remaining happy path tests
    for (let i = 1; i < happyPathTests.length; i++) {
      questions.push(happyPathTests[i]);
    }

    // Add edge case tests
    for (const test of edgeCaseTests) {
      questions.push(test);
    }

    // Add remaining error tests
    for (let i = 1; i < errorTests.length; i++) {
      questions.push(errorTests[i]);
    }

    return questions;
  }

  /**
   * Build args from property-level default values.
   * Also includes required parameters with smart defaults.
   */
  private buildArgsFromDefaults(schema: StructuralInputSchema | undefined): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    if (!schema?.properties) return args;

    const required = schema.required ?? [];
    let hasDefaults = false;

    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.default !== undefined) {
        args[name] = prop.default;
        hasDefaults = true;
      }
    }

    if (hasDefaults) {
      for (const param of required) {
        if (args[param] === undefined && schema.properties[param]) {
          args[param] = this.generateSmartValue(param, schema.properties[param]);
        }
      }
    }

    return args;
  }

  /**
   * Build args from property-level example values.
   * Also includes required parameters with smart defaults.
   */
  private buildArgsFromExamples(schema: StructuralInputSchema | undefined): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    if (!schema?.properties) return args;

    const required = schema.required ?? [];
    let hasExamples = false;

    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.examples && prop.examples.length > 0) {
        args[name] = prop.examples[0];
        hasExamples = true;
      }
    }

    if (hasExamples) {
      for (const param of required) {
        if (args[param] === undefined && schema.properties[param]) {
          args[param] = this.generateSmartValue(param, schema.properties[param]);
        }
      }
    }

    return args;
  }

  /**
   * Build smart default args based on parameter analysis.
   */
  private buildSmartDefaultArgs(schema: StructuralInputSchema | undefined): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    if (!schema?.properties) return args;

    const required = schema.required ?? [];

    for (const param of required) {
      const prop = schema.properties[param];
      if (prop) {
        args[param] = this.generateSmartValue(param, prop);
      }
    }

    return args;
  }

  /**
   * Generate a smart value for a parameter based on comprehensive schema analysis.
   * @param depth - Current recursion depth for circular schema protection
   */
  private generateSmartValue(paramName: string, schema: StructuralPropertySchema, depth: number = 0): unknown {
    // Prevent infinite recursion with circular schemas
    if (depth > ORCHESTRATOR.MAX_SCHEMA_RECURSION_DEPTH) {
      this.logger.debug({ paramName, depth }, 'Max schema recursion depth reached');
      return null;
    }

    // Priority: const > default > examples > enum > oneOf/anyOf > type-based generation
    if (schema.const !== undefined) return schema.const;
    if (schema.default !== undefined) return schema.default;
    if (schema.examples && schema.examples.length > 0) return schema.examples[0];
    if (schema.enum && schema.enum.length > 0) return schema.enum[0];

    if (schema.oneOf && schema.oneOf.length > 0) {
      return this.generateSmartValue(paramName, schema.oneOf[0], depth + 1);
    }
    if (schema.anyOf && schema.anyOf.length > 0) {
      return this.generateSmartValue(paramName, schema.anyOf[0], depth + 1);
    }

    const type = this.getSchemaType(schema.type);

    switch (type) {
      case 'string':
        return this.generateSmartString(paramName, schema);
      case 'number':
        return this.generateSmartNumber(schema, false);
      case 'integer':
        return this.generateSmartNumber(schema, true);
      case 'boolean':
        return true;
      case 'array':
        return this.generateSmartArray(paramName, schema, depth + 1);
      case 'object':
        return this.generateSmartObject(schema, depth + 1);
      case 'null':
        return null;
      default:
        // Infer from parameter name
        return this.inferValueFromName(paramName);
    }
  }

  /**
   * Generate a smart string value based on format, pattern, and name hints.
   * Works with or without a schema - when schema is absent, uses name-based inference only.
   */
  private generateSmartString(paramName: string, schema?: StructuralPropertySchema): string {
    const lowerName = paramName.toLowerCase();
    const description = (schema?.description ?? '').toLowerCase();

    // Check format first (if schema provided)
    if (schema?.format) {
      switch (schema.format) {
        case 'date':
          return '2024-01-15';
        case 'date-time':
          return '2024-01-15T10:30:00Z';
        case 'time':
          return '10:30:00';
        case 'email':
          return 'test@example.com';
        case 'uri':
        case 'url':
          return this.serverContext?.allowedHosts?.[0] ?? 'https://example.com';
        case 'uuid':
          return '550e8400-e29b-41d4-a716-446655440000';
        case 'hostname':
          return 'example.com';
        case 'ipv4':
          return '127.0.0.1';
        case 'ipv6':
          return '::1';
      }
    }

    // Check name-based hints
    if (lowerName.includes('path') || lowerName.includes('file')) {
      const baseDir = this.serverContext?.allowedDirectories?.[0] ?? '/tmp';
      if (lowerName.includes('dir') || lowerName.includes('directory') || lowerName.includes('folder')) {
        return baseDir;
      }
      return `${baseDir}/test.txt`;
    }

    if (lowerName.includes('url') || lowerName.includes('uri') || lowerName.includes('endpoint')) {
      return this.serverContext?.allowedHosts?.[0] ?? 'https://example.com/api';
    }

    if (lowerName.includes('email')) {
      return 'test@example.com';
    }

    if (lowerName.includes('phone') || lowerName.includes('tel')) {
      return '+1-555-123-4567';
    }

    if (lowerName.includes('id') || lowerName.includes('key') || lowerName.includes('token')) {
      return 'test-id-12345';
    }

    if (lowerName.includes('name')) {
      if (lowerName.includes('user') || lowerName.includes('author')) {
        return 'Test User';
      }
      return 'test-name';
    }

    if (lowerName.includes('query') || lowerName.includes('search') || lowerName.includes('filter')) {
      // Use a more realistic search term based on description
      if (description.includes('movie') || description.includes('film')) {
        return 'The Matrix';
      }
      if (description.includes('music') || description.includes('song') || description.includes('artist')) {
        return 'Beatles';
      }
      if (description.includes('book') || description.includes('author')) {
        return 'Tolkien';
      }
      return 'example query';
    }

    if (lowerName.includes('title')) {
      return 'Test Title';
    }

    if (lowerName.includes('description') || lowerName.includes('summary') || lowerName.includes('text')) {
      return 'This is a test description for validation purposes.';
    }

    if (lowerName.includes('content') || lowerName.includes('body') || lowerName.includes('message')) {
      return 'Test content for the operation.';
    }

    if (lowerName.includes('comment')) {
      return 'This is a test comment.';
    }

    if (lowerName.includes('code') || lowerName.includes('snippet')) {
      return 'function example() { return "Hello"; }';
    }

    if (lowerName.includes('pattern') || lowerName.includes('glob') || lowerName.includes('regex')) {
      return '*.txt';
    }

    if (lowerName.includes('format') || lowerName.includes('type')) {
      return 'json';
    }

    if (lowerName.includes('lang') || lowerName.includes('locale')) {
      return 'en-US';
    }

    if (lowerName.includes('date')) {
      return '2024-01-15';
    }

    if (lowerName.includes('time')) {
      return '10:30:00';
    }

    // Respect minLength/maxLength if specified in schema
    let value = 'test-value';
    if (schema?.minLength && value.length < schema.minLength) {
      value = value.padEnd(schema.minLength, '-');
    }
    if (schema?.maxLength && value.length > schema.maxLength) {
      value = value.slice(0, schema.maxLength);
    }

    return value;
  }

  /**
   * Generate a smart number value respecting constraints.
   */
  private generateSmartNumber(schema: StructuralPropertySchema, isInteger: boolean): number {
    let min = schema.minimum ?? schema.exclusiveMinimum ?? ORCHESTRATOR.DEFAULT_NUMBER_MIN;
    let max = schema.maximum ?? schema.exclusiveMaximum ?? ORCHESTRATOR.DEFAULT_NUMBER_MAX;

    // Adjust for exclusive bounds
    if (schema.exclusiveMinimum !== undefined) {
      min = isInteger ? Math.floor(min) + 1 : min + 0.1;
    }
    if (schema.exclusiveMaximum !== undefined) {
      max = isInteger ? Math.ceil(max) - 1 : max - 0.1;
    }

    // Pick a sensible middle value
    const value = (min + max) / 2;
    return isInteger ? Math.round(value) : value;
  }

  /**
   * Generate a smart array value.
   * @param depth - Current recursion depth for circular schema protection
   */
  private generateSmartArray(paramName: string, schema: StructuralPropertySchema, depth: number = 0): unknown[] {
    const lowerName = paramName.toLowerCase();

    // Handle path arrays
    if (lowerName.includes('path')) {
      const baseDir = this.serverContext?.allowedDirectories?.[0] ?? '/tmp';
      return [`${baseDir}/file1.txt`];
    }

    // Generate items based on items schema
    if (schema.items) {
      const item = this.generateSmartValue('item', schema.items, depth);
      return [item];
    }

    return ['sample-item'];
  }

  /**
   * Generate a smart object value.
   * @param depth - Current recursion depth for circular schema protection
   */
  private generateSmartObject(schema: StructuralPropertySchema, depth: number = 0): Record<string, unknown> {
    const obj: Record<string, unknown> = {};

    if (schema.properties) {
      const required = schema.required ?? [];
      // Fill required properties
      for (const prop of required) {
        if (schema.properties[prop]) {
          obj[prop] = this.generateSmartValue(prop, schema.properties[prop], depth);
        }
      }
    }

    return obj;
  }

  /**
   * Infer value from parameter name when no type info available.
   */
  private inferValueFromName(paramName: string): unknown {
    const lowerName = paramName.toLowerCase();

    if (lowerName.includes('count') || lowerName.includes('limit') || lowerName.includes('num')) {
      return 10;
    }
    if (lowerName.includes('enabled') || lowerName.includes('active') || lowerName.includes('flag')) {
      return true;
    }
    if (lowerName.includes('list') || lowerName.includes('items') || lowerName.includes('array')) {
      return [];
    }
    if (lowerName.includes('config') || lowerName.includes('options') || lowerName.includes('settings')) {
      return {};
    }

    return 'test';
  }

  /**
   * Get the primary type from a schema type definition.
   * Handles both single type strings and type arrays (e.g., ['string', 'null']).
   */
  private getSchemaType(typeValue: string | string[] | undefined): string | undefined {
    if (!typeValue) return undefined;
    return Array.isArray(typeValue) ? typeValue[0] : typeValue;
  }

  /**
   * Generate test cases for enum parameters.
   */
  private generateEnumTests(
    schema: StructuralInputSchema | undefined,
    baseArgs: Record<string, unknown>
  ): InterviewQuestion[] {
    const tests: InterviewQuestion[] = [];
    if (!schema?.properties) return tests;

    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.enum && prop.enum.length > 1) {
        // Test with different enum values (skip first which is already in baseArgs)
        for (const enumValue of prop.enum.slice(1, 4)) {
          tests.push({
            description: `Test ${name} with enum value: ${JSON.stringify(enumValue)}`,
            category: 'happy_path',
            args: { ...baseArgs, [name]: enumValue },
          });
        }
      }
    }

    return tests;
  }

  /**
   * Generate boundary tests for numeric parameters.
   */
  private generateBoundaryTests(
    schema: StructuralInputSchema | undefined,
    baseArgs: Record<string, unknown>
  ): InterviewQuestion[] {
    const tests: InterviewQuestion[] = [];
    if (!schema?.properties) return tests;

    for (const [name, prop] of Object.entries(schema.properties)) {
      const type = this.getSchemaType(prop.type);

      if (type === 'number' || type === 'integer') {
        // Test minimum
        if (prop.minimum !== undefined) {
          tests.push({
            description: `Test ${name} at minimum value (${prop.minimum})`,
            category: 'edge_case',
            args: { ...baseArgs, [name]: prop.minimum },
          });
        }

        // Test maximum
        if (prop.maximum !== undefined) {
          tests.push({
            description: `Test ${name} at maximum value (${prop.maximum})`,
            category: 'edge_case',
            args: { ...baseArgs, [name]: prop.maximum },
          });
        }

        // Test zero if in valid range
        const min = prop.minimum ?? Number.NEGATIVE_INFINITY;
        const max = prop.maximum ?? Number.POSITIVE_INFINITY;
        if (min <= 0 && max >= 0) {
          tests.push({
            description: `Test ${name} with zero`,
            category: 'edge_case',
            args: { ...baseArgs, [name]: 0 },
          });
        }
      }
    }

    return tests;
  }

  /**
   * Generate tests for optional parameters.
   */
  private generateOptionalParamTests(schema: StructuralInputSchema | undefined): InterviewQuestion[] {
    const tests: InterviewQuestion[] = [];
    if (!schema?.properties) return tests;

    const required = new Set(schema.required ?? []);
    const optionalParams = Object.entries(schema.properties)
      .filter(([name]) => !required.has(name));

    if (optionalParams.length === 0) return tests;

    const allArgs: Record<string, unknown> = {};

    for (const param of required) {
      const prop = schema.properties![param];
      if (prop) {
        allArgs[param] = this.generateSmartValue(param, prop);
      }
    }

    for (const [name, prop] of optionalParams) {
      allArgs[name] = this.generateSmartValue(name, prop);
    }

    tests.push({
      description: 'Test with all optional parameters included',
      category: 'happy_path',
      args: allArgs,
    });

    return tests;
  }

  /**
   * Generate tests with invalid types to check error handling.
   */
  private generateInvalidTypeTests(schema: StructuralInputSchema | undefined): InterviewQuestion[] {
    const tests: InterviewQuestion[] = [];
    if (!schema?.properties) return tests;

    const required = schema.required ?? [];
    if (required.length === 0) return tests;

    // Pick a required parameter and give it wrong type
    const param = required[0];
    const prop = schema.properties[param];
    if (!prop) return tests;

    const type = this.getSchemaType(prop.type);
    let invalidValue: unknown;

    switch (type) {
      case 'string':
        invalidValue = 12345; // Number instead of string
        break;
      case 'number':
      case 'integer':
        invalidValue = 'not-a-number';
        break;
      case 'boolean':
        invalidValue = 'not-a-boolean';
        break;
      case 'array':
        invalidValue = 'not-an-array';
        break;
      case 'object':
        invalidValue = 'not-an-object';
        break;
      default:
        return tests;
    }

    tests.push({
      description: `Test ${param} with invalid type (${typeof invalidValue} instead of ${type})`,
      category: 'error_handling',
      args: { [param]: invalidValue },
    });

    return tests;
  }

  /**
   * Generate interview questions for an MCP prompt.
   */
  async generatePromptQuestions(
    prompt: MCPPrompt,
    maxQuestions: number = 2
  ): Promise<PromptQuestion[]> {
    const promptText = buildPromptQuestionGenerationPrompt({
      prompt,
      maxQuestions,
    });

    try {
      const response = await this.completeWithStreaming(promptText, {
        ...COMPLETION_OPTIONS.promptQuestionGeneration,
        systemPrompt: this.getSystemPrompt(),
      }, `generate-prompt-questions:${prompt.name}`);

      const questions = this.llm.parseJSON<PromptQuestion[]>(response);
      return questions.slice(0, maxQuestions);
    } catch (llmError) {
      this.logger.debug({
        prompt: prompt.name,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      }, 'LLM prompt question generation failed, using fallback');
      // Fallback to basic questions (slice to respect maxQuestions limit)
      return this.generateFallbackPromptQuestions(prompt).slice(0, maxQuestions);
    }
  }

  /**
   * Analyze a prompt response.
   */
  async analyzePromptResponse(
    prompt: MCPPrompt,
    question: PromptQuestion,
    response: MCPPromptGetResult | null,
    error: string | null
  ): Promise<string> {
    const promptText = buildPromptResponseAnalysisPrompt({
      prompt,
      question,
      response,
      error,
    });

    try {
      return await this.completeWithStreaming(promptText, {
        ...COMPLETION_OPTIONS.promptResponseAnalysis,
        systemPrompt: this.getSystemPrompt(),
      }, `analyze-prompt:${prompt.name}`);
    } catch (llmError) {
      // Graceful fallback
      this.logger.debug({
        prompt: prompt.name,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      }, 'LLM prompt analysis failed, using fallback');
      if (error) {
        return `Prompt returned an error: ${error}`;
      }
      if (response?.messages?.length) {
        return `Prompt generated ${response.messages.length} message(s).`;
      }
      return 'Prompt executed successfully.';
    }
  }

  /**
   * Synthesize findings for a prompt into a profile.
   */
  async synthesizePromptProfile(
    prompt: MCPPrompt,
    interactions: Array<{
      question: PromptQuestion;
      response: MCPPromptGetResult | null;
      error: string | null;
      analysis: string;
    }>
  ): Promise<Omit<PromptProfile, 'interactions'>> {
    const promptText = buildPromptProfileSynthesisPrompt({ prompt, interactions });

    try {
      const response = await this.completeWithStreaming(promptText, {
        ...COMPLETION_OPTIONS.promptProfileSynthesis,
        systemPrompt: this.getSystemPrompt(),
      }, `synthesize-prompt:${prompt.name}`);

      const result = this.llm.parseJSON<{
        behavioralNotes: string[];
        limitations: string[];
      }>(response);

      // Extract example output from first successful interaction
      let exampleOutput: string | undefined;
      const successful = interactions.find(i => !i.error && i.response?.messages?.length);
      if (successful?.response) {
        const firstMsg = successful.response.messages[0];
        if (firstMsg?.content?.type === 'text' && firstMsg.content.text) {
          exampleOutput = firstMsg.content.text.substring(0, DISPLAY_LIMITS.EXAMPLE_OUTPUT_LENGTH);
        }
      }

      return {
        name: prompt.name,
        description: prompt.description ?? 'No description provided',
        arguments: prompt.arguments ?? [],
        behavioralNotes: result.behavioralNotes ?? [],
        limitations: result.limitations ?? [],
        exampleOutput,
      };
    } catch (llmError) {
      this.logger.debug({
        prompt: prompt.name,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      }, 'LLM prompt profile synthesis failed, using fallback');
      return {
        name: prompt.name,
        description: prompt.description ?? 'No description provided',
        arguments: prompt.arguments ?? [],
        behavioralNotes: interactions.map(i => i.analysis).filter(a => a),
        limitations: [],
      };
    }
  }

  /**
   * Fallback questions when LLM fails for prompts.
   */
  private generateFallbackPromptQuestions(prompt: MCPPrompt): PromptQuestion[] {
    const questions: PromptQuestion[] = [];
    const args: Record<string, string> = {};

    // Build args with required parameters
    if (prompt.arguments) {
      for (const arg of prompt.arguments) {
        if (arg.required) {
          args[arg.name] = this.generateSmartString(arg.name);
        }
      }
    }

    questions.push({
      description: 'Basic usage with required arguments',
      args,
    });

    // If there are optional args, add a test with all args
    const optionalArgs = prompt.arguments?.filter(a => !a.required) ?? [];
    if (optionalArgs.length > 0) {
      const allArgs = { ...args };
      for (const arg of optionalArgs) {
        allArgs[arg.name] = this.generateSmartString(arg.name);
      }
      questions.push({
        description: 'Usage with all arguments',
        args: allArgs,
      });
    }

    return questions;
  }

  /**
   * Generate interview questions for an MCP resource.
   */
  async generateResourceQuestions(
    resource: MCPResource,
    maxQuestions: number = 2
  ): Promise<ResourceQuestion[]> {
    const prompt = `You are analyzing an MCP resource to generate test questions.

Resource:
- Name: ${resource.name}
- URI: ${resource.uri}
- Description: ${resource.description ?? 'No description provided'}
- MIME Type: ${resource.mimeType ?? 'Not specified'}

Generate ${maxQuestions} test scenarios for reading this resource. Focus on:
1. Basic read access
2. Content validation (is the returned content appropriate for the MIME type?)
3. Error handling if applicable

Return JSON array:
[
  {
    "description": "What this test evaluates",
    "category": "happy_path" | "edge_case" | "error_handling"
  }
]

Return ONLY valid JSON, no explanation.`;

    try {
      const response = await this.completeWithStreaming(prompt, {
        ...COMPLETION_OPTIONS.questionGeneration,
        systemPrompt: this.getSystemPrompt(),
      }, `generate-resource-questions:${resource.name}`);

      const questions = this.llm.parseJSON<ResourceQuestion[]>(response);
      return questions.slice(0, maxQuestions);
    } catch (llmError) {
      this.logger.debug({
        resource: resource.name,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      }, 'LLM resource question generation failed, using fallback');
      // Fallback to basic questions (slice to respect maxQuestions limit)
      return this.generateFallbackResourceQuestions(resource).slice(0, maxQuestions);
    }
  }

  /**
   * Analyze a resource read response.
   */
  async analyzeResourceResponse(
    resource: MCPResource,
    question: ResourceQuestion,
    response: MCPResourceReadResult | null,
    error: string | null
  ): Promise<string> {
    const contentSummary = this.summarizeResourceContent(response);

    const prompt = `Analyze this resource read result.

Resource: ${resource.name} (${resource.uri})
Expected MIME type: ${resource.mimeType ?? 'Not specified'}

Test case: ${question.description}

Result:
${error ? `Error: ${error}` : `Content: ${contentSummary}`}

Provide a brief analysis (1-2 sentences) of:
- Whether the content matches expectations
- Any notable characteristics or issues
- Relevance of content to the resource description`;

    try {
      return await this.completeWithStreaming(prompt, {
        ...COMPLETION_OPTIONS.responseAnalysis,
        systemPrompt: this.getSystemPrompt(),
      }, `analyze-resource:${resource.name}`);
    } catch (llmError) {
      // Graceful fallback
      this.logger.debug({
        resource: resource.name,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      }, 'LLM resource analysis failed, using fallback');
      if (error) {
        return `Resource read failed: ${error}`;
      }
      if (response?.contents?.length) {
        return `Resource returned ${response.contents.length} content block(s).`;
      }
      return 'Resource read completed.';
    }
  }

  /**
   * Synthesize findings for a resource into a profile.
   */
  async synthesizeResourceProfile(
    resource: MCPResource,
    interactions: Array<{
      question: ResourceQuestion;
      response: MCPResourceReadResult | null;
      error: string | null;
      analysis: string;
    }>
  ): Promise<Omit<ResourceProfile, 'interactions' | 'contentPreview'>> {
    const prompt = `Synthesize findings for this MCP resource.

Resource: ${resource.name}
URI: ${resource.uri}
Description: ${resource.description ?? 'No description'}
MIME Type: ${resource.mimeType ?? 'Not specified'}

Test interactions:
${interactions.map((i, idx) => `
${idx + 1}. ${i.question.description}
   ${i.error ? `Error: ${i.error}` : `Analysis: ${i.analysis}`}
`).join('')}

Generate a JSON object with:
{
  "behavioralNotes": ["List of observed behaviors"],
  "limitations": ["List of limitations or issues discovered"]
}

Return ONLY valid JSON, no explanation.`;

    try {
      const response = await this.completeWithStreaming(prompt, {
        ...COMPLETION_OPTIONS.profileSynthesis,
        systemPrompt: this.getSystemPrompt(),
      }, `synthesize-resource:${resource.name}`);

      const result = this.llm.parseJSON<{
        behavioralNotes: string[];
        limitations: string[];
      }>(response);

      return {
        uri: resource.uri,
        name: resource.name,
        description: resource.description ?? 'No description provided',
        mimeType: resource.mimeType,
        behavioralNotes: result.behavioralNotes ?? [],
        limitations: result.limitations ?? [],
      };
    } catch (llmError) {
      this.logger.debug({
        resource: resource.name,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      }, 'LLM resource profile synthesis failed, using fallback');
      return {
        uri: resource.uri,
        name: resource.name,
        description: resource.description ?? 'No description provided',
        mimeType: resource.mimeType,
        behavioralNotes: interactions.map(i => i.analysis).filter(a => a),
        limitations: [],
      };
    }
  }

  /**
   * Fallback questions when LLM fails for resources.
   */
  private generateFallbackResourceQuestions(resource: MCPResource): ResourceQuestion[] {
    const questions: ResourceQuestion[] = [
      {
        description: `Basic read access for ${resource.name}`,
        category: 'happy_path',
      },
    ];

    // Add MIME type validation if specified
    if (resource.mimeType) {
      questions.push({
        description: `Verify content matches expected MIME type (${resource.mimeType})`,
        category: 'happy_path',
      });
    }

    return questions;
  }

  /**
   * Summarize resource content for analysis prompts.
   */
  private summarizeResourceContent(response: MCPResourceReadResult | null): string {
    if (!response?.contents?.length) {
      return 'No content returned';
    }

    const summaries: string[] = [];
    for (const content of response.contents) {
      if (content.text) {
        const preview = content.text.length > DISPLAY_LIMITS.CONTENT_PREVIEW_LENGTH
          ? content.text.substring(0, DISPLAY_LIMITS.CONTENT_PREVIEW_LENGTH) + '...'
          : content.text;
        summaries.push(`Text (${content.mimeType ?? 'unknown'}): ${preview}`);
      } else if (content.blob) {
        summaries.push(`Binary data (${content.mimeType ?? 'unknown'}): ${content.blob.length} bytes base64`);
      }
    }

    return summaries.join('\n');
  }
}
