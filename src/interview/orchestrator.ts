import type { LLMClient } from '../llm/client.js';
import type { MCPTool, MCPToolCallResult } from '../transport/types.js';
import type { InterviewQuestion, ToolProfile, ServerContext } from './types.js';
import type { DiscoveryResult } from '../discovery/types.js';
import type { Persona, QuestionCategory } from '../persona/types.js';
import { DEFAULT_PERSONA } from '../persona/builtins.js';
import {
  DEFAULT_SYSTEM_PROMPT,
  buildQuestionGenerationPrompt,
  buildResponseAnalysisPrompt,
  buildToolProfileSynthesisPrompt,
  buildOverallSynthesisPrompt,
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
}
