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
import { RETRY, DISPLAY_LIMITS } from '../constants.js';

/**
 * Error categories for LLM operations.
 */
type LLMErrorCategory = 'refusal' | 'rate_limit' | 'timeout' | 'auth' | 'network' | 'format_error' | 'unknown';

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
    return this.generateFallbackQuestionsInternal(tool, skipErrorTests).slice(0, maxQuestions);
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
    } catch {
      // Graceful fallback if LLM refuses or fails
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
   */
  getFallbackQuestions(tool: MCPTool, skipErrorTests: boolean): InterviewQuestion[] {
    return this.generateFallbackQuestionsInternal(tool, skipErrorTests);
  }

  /**
   * Fallback questions when LLM fails.
   */
  private generateFallbackQuestionsInternal(tool: MCPTool, skipErrorTests: boolean): InterviewQuestion[] {
    const questions: InterviewQuestion[] = [];
    const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] } | undefined;

    // Generate a basic happy path test with required params
    const args: Record<string, unknown> = {};
    if (schema?.required) {
      for (const param of schema.required) {
        args[param] = this.generateDefaultValue(param, schema.properties?.[param]);
      }
    }

    questions.push({
      description: 'Basic functionality test with required parameters',
      category: 'happy_path',
      args,
    });

    if (!skipErrorTests) {
      questions.push({
        description: 'Test with empty/missing parameters',
        category: 'error_handling',
        args: {},
      });
    }

    return questions;
  }

  /**
   * Generate a sensible default value for a parameter.
   * Uses server context to generate valid paths within allowed directories.
   */
  private generateDefaultValue(paramName: string, schema: unknown): unknown {
    const propSchema = schema as { type?: string; enum?: unknown[] } | undefined;

    if (propSchema?.enum && propSchema.enum.length > 0) {
      return propSchema.enum[0];
    }

    const lowerName = paramName.toLowerCase();

    switch (propSchema?.type) {
      case 'string':
        // Use allowed directories for path parameters
        if (lowerName.includes('path') || lowerName.includes('file') || lowerName.includes('dir')) {
          const baseDir = this.serverContext?.allowedDirectories?.[0] ?? '/tmp';
          if (lowerName.includes('dir') || lowerName.includes('directory')) {
            return baseDir;
          }
          return `${baseDir}/test.txt`;
        }
        if (lowerName.includes('url')) {
          const host = this.serverContext?.allowedHosts?.[0] ?? 'https://example.com';
          return host;
        }
        if (lowerName.includes('pattern')) return '*.txt';
        if (lowerName.includes('content')) return 'test content';
        if (lowerName.includes('text')) return 'sample text';
        return 'test';
      case 'number':
      case 'integer':
        return 1;
      case 'boolean':
        return true;
      case 'array': {
        // For paths array, include an example path
        if (lowerName.includes('path')) {
          const baseDir = this.serverContext?.allowedDirectories?.[0] ?? '/tmp';
          return [`${baseDir}/file1.txt`];
        }
        // Try to generate a sample item if the array has an items schema
        const arraySchema = schema as { items?: { type?: string; properties?: Record<string, unknown>; required?: string[] } };
        if (arraySchema?.items?.type === 'object' && arraySchema.items.properties) {
          const sampleItem: Record<string, unknown> = {};
          const itemProps = arraySchema.items.properties;
          const itemRequired = arraySchema.items.required ?? Object.keys(itemProps);
          for (const prop of itemRequired) {
            if (itemProps[prop]) {
              sampleItem[prop] = this.generateDefaultValue(prop, itemProps[prop]);
            }
          }
          // Only return non-empty sample if we generated something
          if (Object.keys(sampleItem).length > 0) {
            return [sampleItem];
          }
        }
        // For string arrays, include a sample string
        if (arraySchema?.items?.type === 'string') {
          return ['sample-item'];
        }
        return [];
      }
      case 'object': {
        // Try to generate sample properties if schema has properties defined
        const objSchema = schema as { properties?: Record<string, unknown>; required?: string[] };
        if (objSchema?.properties) {
          const sampleObj: Record<string, unknown> = {};
          const required = objSchema.required ?? [];
          for (const prop of required) {
            if (objSchema.properties[prop]) {
              sampleObj[prop] = this.generateDefaultValue(prop, objSchema.properties[prop]);
            }
          }
          if (Object.keys(sampleObj).length > 0) {
            return sampleObj;
          }
        }
        return {};
      }
      default:
        return 'test';
    }
  }

  // ===========================================================================
  // Prompt Interview Methods
  // ===========================================================================

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
    } catch {
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
    } catch {
      // Graceful fallback
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
    } catch {
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
          args[arg.name] = this.generateDefaultStringValue(arg.name);
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
        allArgs[arg.name] = this.generateDefaultStringValue(arg.name);
      }
      questions.push({
        description: 'Usage with all arguments',
        args: allArgs,
      });
    }

    return questions;
  }

  /**
   * Generate a sensible default string value for a prompt argument.
   * Values are designed to be realistic and context-appropriate.
   */
  private generateDefaultStringValue(argName: string): string {
    const lowerName = argName.toLowerCase();

    // Names and identifiers
    if (lowerName.includes('name')) return 'example-resource';
    if (lowerName.includes('title')) return 'Example Document Title';
    if (lowerName.includes('id')) return 'res_12345';

    // Content and text
    if (lowerName.includes('description')) return 'A brief description of the resource for documentation purposes.';
    if (lowerName.includes('content')) return 'This is sample content for testing. It includes multiple sentences to simulate realistic input.';
    if (lowerName.includes('text')) return 'Sample text content for processing.';
    if (lowerName.includes('message')) return 'Hello, this is a test message.';
    if (lowerName.includes('comment')) return 'This is a code review comment.';

    // Code-related
    if (lowerName.includes('code') || lowerName.includes('snippet')) {
      return 'function example() {\n  return "Hello, World!";\n}';
    }
    if (lowerName.includes('language') || lowerName.includes('lang')) return 'javascript';
    if (lowerName.includes('syntax')) return 'typescript';

    // Queries and search
    if (lowerName.includes('query') || lowerName.includes('search')) return 'how to implement authentication';
    if (lowerName.includes('keyword')) return 'authentication';
    if (lowerName.includes('filter')) return 'status:active';

    // URLs and paths
    if (lowerName.includes('url') || lowerName.includes('link')) return 'https://example.com/api/v1/resource';
    if (lowerName.includes('path') || lowerName.includes('file')) {
      const baseDir = this.serverContext?.allowedDirectories?.[0] ?? '/tmp';
      return `${baseDir}/example.txt`;
    }

    // Dates and times
    if (lowerName.includes('date')) return new Date().toISOString().split('T')[0];
    if (lowerName.includes('time')) return new Date().toISOString();

    // Formats
    if (lowerName.includes('format')) return 'json';
    if (lowerName.includes('type')) return 'document';

    // Default fallback
    return 'example-value';
  }

  // ===========================================================================
  // Resource Interview Methods
  // ===========================================================================

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
    } catch {
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
    } catch {
      // Graceful fallback
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
    } catch {
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
