import type { LLMClient } from '../llm/client.js';
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

/**
 * Orchestrator uses an LLM to generate interview questions and synthesize findings.
 * Optionally accepts a Persona to customize the interview style.
 */
export class Orchestrator {
  private persona: Persona;
  private serverContext?: ServerContext;

  constructor(
    private llm: LLMClient,
    persona?: Persona,
    serverContext?: ServerContext
  ) {
    this.persona = persona ?? DEFAULT_PERSONA;
    this.serverContext = serverContext;
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

    try {
      const response = await this.llm.complete(prompt, {
        ...COMPLETION_OPTIONS.questionGeneration,
        systemPrompt: this.getSystemPrompt(),
      });

      const questions = this.llm.parseJSON<InterviewQuestion[]>(response);
      return questions.slice(0, maxQuestions);
    } catch (error) {
      // Fallback to basic questions if LLM fails or refuses
      const reason = error instanceof Error ? error.message : 'unknown';
      if (reason.includes('refused')) {
        console.log(`  Note: Using fallback examples for ${tool.name} (LLM declined)`);
      }
      return this.generateFallbackQuestions(tool, skipErrorTests);
    }
  }

  /**
   * Analyze a tool response and generate behavioral notes.
   */
  async analyzeResponse(
    tool: MCPTool,
    question: InterviewQuestion,
    response: MCPToolCallResult | null,
    error: string | null
  ): Promise<string> {
    const prompt = buildResponseAnalysisPrompt({
      tool,
      question,
      response,
      error,
      persona: this.persona,
    });

    try {
      return await this.llm.complete(prompt, {
        ...COMPLETION_OPTIONS.responseAnalysis,
        systemPrompt: this.getSystemPrompt(),
      });
    } catch {
      // Graceful fallback if LLM refuses or fails
      if (error) {
        return `Tool returned an error: ${error}`;
      }
      if (response?.content) {
        const textContent = response.content.find(c => c.type === 'text');
        if (textContent && 'text' in textContent) {
          return `Tool returned: ${String(textContent.text).substring(0, 100)}`;
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
      const response = await this.llm.complete(prompt, {
        ...COMPLETION_OPTIONS.profileSynthesis,
        systemPrompt: this.getSystemPrompt(),
      });

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
        console.log(`  Note: Using basic profile for ${tool.name} (LLM declined)`);
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
      const response = await this.llm.complete(prompt, {
        ...COMPLETION_OPTIONS.overallSynthesis,
        systemPrompt: this.getSystemPrompt(),
      });

      return this.llm.parseJSON<{
        summary: string;
        limitations: string[];
        recommendations: string[];
      }>(response);
    } catch (error) {
      // Graceful fallback if LLM fails or refuses
      const reason = error instanceof Error ? error.message : '';
      if (reason.includes('refused')) {
        console.log('  Note: Using basic summary (LLM declined)');
      }
      return {
        summary: `${discovery.serverInfo.name} provides ${discovery.tools.length} tools for MCP integration.`,
        limitations: [],
        recommendations: [],
      };
    }
  }

  /**
   * Fallback questions when LLM fails.
   */
  private generateFallbackQuestions(tool: MCPTool, skipErrorTests: boolean): InterviewQuestion[] {
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
      case 'array':
        // For paths array, include an example path
        if (lowerName.includes('path')) {
          const baseDir = this.serverContext?.allowedDirectories?.[0] ?? '/tmp';
          return [`${baseDir}/file1.txt`];
        }
        return [];
      case 'object':
        return {};
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
      const response = await this.llm.complete(promptText, {
        ...COMPLETION_OPTIONS.promptQuestionGeneration,
        systemPrompt: this.getSystemPrompt(),
      });

      const questions = this.llm.parseJSON<PromptQuestion[]>(response);
      return questions.slice(0, maxQuestions);
    } catch {
      // Fallback to basic questions
      return this.generateFallbackPromptQuestions(prompt);
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
      return await this.llm.complete(promptText, {
        ...COMPLETION_OPTIONS.promptResponseAnalysis,
        systemPrompt: this.getSystemPrompt(),
      });
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
      const response = await this.llm.complete(promptText, {
        ...COMPLETION_OPTIONS.promptProfileSynthesis,
        systemPrompt: this.getSystemPrompt(),
      });

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
          exampleOutput = firstMsg.content.text.substring(0, 500);
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
   */
  private generateDefaultStringValue(argName: string): string {
    const lowerName = argName.toLowerCase();
    if (lowerName.includes('name')) return 'test-name';
    if (lowerName.includes('title')) return 'Test Title';
    if (lowerName.includes('description')) return 'A test description';
    if (lowerName.includes('content')) return 'Test content';
    if (lowerName.includes('text')) return 'Sample text';
    if (lowerName.includes('query')) return 'test query';
    if (lowerName.includes('url')) return 'https://example.com';
    if (lowerName.includes('path')) return '/tmp/test';
    if (lowerName.includes('id')) return '12345';
    if (lowerName.includes('code')) return 'console.log("hello")';
    if (lowerName.includes('language')) return 'javascript';
    return 'test-value';
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
      const response = await this.llm.complete(prompt, {
        ...COMPLETION_OPTIONS.questionGeneration,
        systemPrompt: this.getSystemPrompt(),
      });

      const questions = this.llm.parseJSON<ResourceQuestion[]>(response);
      return questions.slice(0, maxQuestions);
    } catch {
      // Fallback to basic questions
      return this.generateFallbackResourceQuestions(resource);
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
      return await this.llm.complete(prompt, {
        ...COMPLETION_OPTIONS.responseAnalysis,
        systemPrompt: this.getSystemPrompt(),
      });
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
      const response = await this.llm.complete(prompt, {
        ...COMPLETION_OPTIONS.profileSynthesis,
        systemPrompt: this.getSystemPrompt(),
      });

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
        const preview = content.text.length > 200
          ? content.text.substring(0, 200) + '...'
          : content.text;
        summaries.push(`Text (${content.mimeType ?? 'unknown'}): ${preview}`);
      } else if (content.blob) {
        summaries.push(`Binary data (${content.mimeType ?? 'unknown'}): ${content.blob.length} bytes base64`);
      }
    }

    return summaries.join('\n');
  }
}
