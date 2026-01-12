import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SYSTEM_PROMPT,
  buildQuestionGenerationPrompt,
  buildResponseAnalysisPrompt,
  buildToolProfileSynthesisPrompt,
  buildOverallSynthesisPrompt,
  buildWorkflowStepAnalysisPrompt,
  buildWorkflowSummaryPrompt,
  COMPLETION_OPTIONS,
  type QuestionGenerationContext,
  type ResponseAnalysisContext,
  type ToolProfileSynthesisContext,
  type OverallSynthesisContext,
  type WorkflowStepAnalysisContext,
  type WorkflowSummaryContext,
} from '../../src/prompts/templates.js';
import type { MCPTool } from '../../src/transport/types.js';
import type { Persona } from '../../src/persona/types.js';

describe('prompts/templates', () => {
  // Sample test data
  const sampleTool: MCPTool = {
    name: 'get_weather',
    description: 'Get current weather for a location',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' },
        units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
      },
      required: ['location'],
    },
  };

  const samplePersona: Persona = {
    id: 'technical_writer',
    name: 'Technical Writer',
    description: 'Documentation focused',
    systemPrompt: 'You are a technical writer',
    questionBias: {
      happy_path: 0.4,
      edge_cases: 0.2,
      error_handling: 0.2,
      boundary_conditions: 0.2,
    },
  };

  describe('DEFAULT_SYSTEM_PROMPT', () => {
    it('should be defined', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toBeDefined();
      expect(typeof DEFAULT_SYSTEM_PROMPT).toBe('string');
    });

    it('should mention documentation purpose', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('documentation');
    });

    it('should mention API documentation', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('API documentation');
    });
  });

  describe('buildQuestionGenerationPrompt', () => {
    const baseContext: QuestionGenerationContext = {
      tool: sampleTool,
      maxQuestions: 5,
      categoryGuidance: '40% happy path, 30% edge cases, 30% error handling',
      categoryList: 'happy_path, edge_cases, error_handling',
      skipErrorTests: false,
    };

    it('should include tool name and description', () => {
      const prompt = buildQuestionGenerationPrompt(baseContext);

      expect(prompt).toContain('get_weather');
      expect(prompt).toContain('Get current weather for a location');
    });

    it('should include input schema as JSON', () => {
      const prompt = buildQuestionGenerationPrompt(baseContext);

      expect(prompt).toContain('"type": "object"');
      expect(prompt).toContain('"location"');
      expect(prompt).toContain('"units"');
    });

    it('should include max questions count', () => {
      const prompt = buildQuestionGenerationPrompt(baseContext);

      expect(prompt).toContain('5 test cases');
    });

    it('should include category guidance', () => {
      const prompt = buildQuestionGenerationPrompt(baseContext);

      expect(prompt).toContain('40% happy path');
      expect(prompt).toContain('30% edge cases');
    });

    it('should include server context section when provided', () => {
      const contextWithServer: QuestionGenerationContext = {
        ...baseContext,
        serverContext: {
          allowedDirectories: ['/tmp/data'],
          allowedHosts: ['api.example.com'],
          constraints: ['Max 100 results per query'],
          hints: ['Use ISO date format'],
        },
      };

      const prompt = buildQuestionGenerationPrompt(contextWithServer);

      expect(prompt).toContain('/tmp/data');
      expect(prompt).toContain('api.example.com');
      expect(prompt).toContain('Max 100 results per query');
      expect(prompt).toContain('Use ISO date format');
    });

    it('should include error handling guidance when skipErrorTests is false', () => {
      const prompt = buildQuestionGenerationPrompt(baseContext);

      // Should NOT have the skip message
      expect(prompt).not.toContain('Focus on successful usage examples only');
    });

    it('should include skip message when skipErrorTests is true', () => {
      const contextSkipErrors: QuestionGenerationContext = {
        ...baseContext,
        skipErrorTests: true,
      };

      const prompt = buildQuestionGenerationPrompt(contextSkipErrors);

      expect(prompt).toContain('Focus on successful usage examples only');
    });

    it('should include guidelines for path parameters', () => {
      const contextWithPaths: QuestionGenerationContext = {
        ...baseContext,
        serverContext: {
          allowedDirectories: ['/tmp/workspace'],
        },
      };

      const prompt = buildQuestionGenerationPrompt(contextWithPaths);

      expect(prompt).toContain('/tmp/workspace');
    });

    it('should request JSON array response', () => {
      const prompt = buildQuestionGenerationPrompt(baseContext);

      expect(prompt).toContain('JSON array');
      expect(prompt).toContain('"description"');
      expect(prompt).toContain('"category"');
      expect(prompt).toContain('"args"');
    });

    it('should handle tool without description', () => {
      const toolNoDesc: MCPTool = {
        name: 'mystery_tool',
      };

      const prompt = buildQuestionGenerationPrompt({
        ...baseContext,
        tool: toolNoDesc,
      });

      expect(prompt).toContain('mystery_tool');
      expect(prompt).toContain('No description provided');
    });

    it('should handle tool without schema', () => {
      const toolNoSchema: MCPTool = {
        name: 'simple_tool',
        description: 'A simple tool',
      };

      const prompt = buildQuestionGenerationPrompt({
        ...baseContext,
        tool: toolNoSchema,
      });

      expect(prompt).toContain('No schema provided');
    });

    it('should include previous errors when provided', () => {
      const contextWithErrors: QuestionGenerationContext = {
        ...baseContext,
        previousErrors: [
          { args: { location: 'invalid' }, error: 'Location not found' },
          { args: { location: '' }, error: 'Location required' },
        ],
      };

      const prompt = buildQuestionGenerationPrompt(contextWithErrors);

      expect(prompt).toContain('LEARN FROM PREVIOUS ERRORS');
      expect(prompt).toContain('Location not found');
      expect(prompt).toContain('Location required');
    });
  });

  describe('buildResponseAnalysisPrompt', () => {
    const baseAnalysisContext: ResponseAnalysisContext = {
      tool: sampleTool,
      question: {
        description: 'Test basic weather lookup',
        category: 'happy_path',
        args: { location: 'New York' },
      },
      response: {
        content: [{ type: 'text', text: '{"temp": 72, "conditions": "sunny"}' }],
      },
      error: null,
      persona: samplePersona,
    };

    it('should include tool name', () => {
      const prompt = buildResponseAnalysisPrompt(baseAnalysisContext);

      expect(prompt).toContain('get_weather');
    });

    it('should include test category and description', () => {
      const prompt = buildResponseAnalysisPrompt(baseAnalysisContext);

      expect(prompt).toContain('happy_path');
      expect(prompt).toContain('Test basic weather lookup');
    });

    it('should include response when present', () => {
      const prompt = buildResponseAnalysisPrompt(baseAnalysisContext);

      expect(prompt).toContain('temp');
      expect(prompt).toContain('sunny');
    });

    it('should include error message when present', () => {
      const contextWithError: ResponseAnalysisContext = {
        ...baseAnalysisContext,
        response: null,
        error: 'Location not found: InvalidCity',
      };

      const prompt = buildResponseAnalysisPrompt(contextWithError);

      expect(prompt).toContain('Error: Location not found: InvalidCity');
    });

    it('should include persona-specific focus guidance for security_tester', () => {
      const securityPersona: Persona = {
        id: 'security_tester',
        name: 'Security Tester',
        description: 'Security focused',
        systemPrompt: 'Security tester',
        questionBias: { happy_path: 0.2, edge_cases: 0.3, error_handling: 0.3, boundary_conditions: 0.2 },
      };

      const prompt = buildResponseAnalysisPrompt({
        ...baseAnalysisContext,
        persona: securityPersona,
      });

      expect(prompt).toContain('security');
    });

    it('should include persona-specific focus guidance for qa_engineer', () => {
      const qaPersona: Persona = {
        id: 'qa_engineer',
        name: 'QA Engineer',
        description: 'QA focused',
        systemPrompt: 'QA engineer',
        questionBias: { happy_path: 0.2, edge_cases: 0.4, error_handling: 0.2, boundary_conditions: 0.2 },
      };

      const prompt = buildResponseAnalysisPrompt({
        ...baseAnalysisContext,
        persona: qaPersona,
      });

      expect(prompt).toContain('unexpected');
    });

    it('should include persona-specific focus guidance for novice_user', () => {
      const novicePersona: Persona = {
        id: 'novice_user',
        name: 'Novice User',
        description: 'New user perspective',
        systemPrompt: 'Novice user',
        questionBias: { happy_path: 0.5, edge_cases: 0.2, error_handling: 0.2, boundary_conditions: 0.1 },
      };

      const prompt = buildResponseAnalysisPrompt({
        ...baseAnalysisContext,
        persona: novicePersona,
      });

      expect(prompt).toContain('clarity');
    });

    it('should request concise analysis', () => {
      const prompt = buildResponseAnalysisPrompt(baseAnalysisContext);

      expect(prompt).toContain('1-2 sentences');
      expect(prompt).toContain('concise');
    });

    it('should handle null response', () => {
      const contextNoResponse: ResponseAnalysisContext = {
        ...baseAnalysisContext,
        response: null,
        error: null,
      };

      const prompt = buildResponseAnalysisPrompt(contextNoResponse);

      expect(prompt).toContain('No response');
    });
  });

  describe('buildToolProfileSynthesisPrompt', () => {
    const synthesisContext: ToolProfileSynthesisContext = {
      tool: sampleTool,
      interactions: [
        {
          question: { description: 'Basic lookup', category: 'happy_path', args: { location: 'NYC' } },
          response: { content: [{ type: 'text', text: '{"temp": 72}' }] },
          error: null,
          analysis: 'Returns temperature in the expected format.',
        },
        {
          question: { description: 'Invalid location', category: 'error_handling', args: { location: 'XYZ123' } },
          response: null,
          error: 'Location not found',
          analysis: 'Properly returns error for invalid locations.',
        },
      ],
    };

    it('should include tool name and description', () => {
      const prompt = buildToolProfileSynthesisPrompt(synthesisContext);

      expect(prompt).toContain('get_weather');
      expect(prompt).toContain('Get current weather');
    });

    it('should include interaction summaries', () => {
      const prompt = buildToolProfileSynthesisPrompt(synthesisContext);

      expect(prompt).toContain('Basic lookup');
      expect(prompt).toContain('Invalid location');
      expect(prompt).toContain('Returns temperature');
      expect(prompt).toContain('Properly returns error');
    });

    it('should request JSON response with specific fields', () => {
      const prompt = buildToolProfileSynthesisPrompt(synthesisContext);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('behavioralNotes');
      expect(prompt).toContain('limitations');
      expect(prompt).toContain('securityNotes');
    });

    it('should limit notes to 150 characters', () => {
      const prompt = buildToolProfileSynthesisPrompt(synthesisContext);

      expect(prompt).toContain('150 characters');
    });

    it('should handle empty interactions', () => {
      const emptyContext: ToolProfileSynthesisContext = {
        tool: sampleTool,
        interactions: [],
      };

      const prompt = buildToolProfileSynthesisPrompt(emptyContext);

      expect(prompt).toContain('get_weather');
      expect(prompt).toContain('Interactions:');
    });
  });

  describe('buildOverallSynthesisPrompt', () => {
    const overallContext: OverallSynthesisContext = {
      discovery: {
        serverInfo: { name: 'Weather Server', version: '1.0.0' },
        capabilities: { tools: {} },
        tools: [sampleTool],
        prompts: [],
        resources: [],
      },
      toolProfiles: [
        {
          name: 'get_weather',
          description: 'Get weather',
          interactions: [],
          behavioralNotes: ['Returns JSON weather data'],
          limitations: ['US cities only'],
          securityNotes: [],
        },
      ],
    };

    it('should include server name and version', () => {
      const prompt = buildOverallSynthesisPrompt(overallContext);

      expect(prompt).toContain('Weather Server');
      expect(prompt).toContain('1.0.0');
    });

    it('should include tool count', () => {
      const prompt = buildOverallSynthesisPrompt(overallContext);

      expect(prompt).toContain('Tools (1)');
    });

    it('should include profile summary', () => {
      const prompt = buildOverallSynthesisPrompt(overallContext);

      expect(prompt).toContain('get_weather');
      expect(prompt).toContain('Returns JSON weather data');
    });

    it('should request JSON response format', () => {
      const prompt = buildOverallSynthesisPrompt(overallContext);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('summary');
      expect(prompt).toContain('limitations');
      expect(prompt).toContain('recommendations');
    });

    it('should handle tool with no behavioral notes', () => {
      const contextNoNotes: OverallSynthesisContext = {
        ...overallContext,
        toolProfiles: [
          {
            name: 'get_weather',
            description: 'Get weather',
            interactions: [],
            behavioralNotes: [],
            limitations: [],
            securityNotes: [],
          },
        ],
      };

      const prompt = buildOverallSynthesisPrompt(contextNoNotes);

      expect(prompt).toContain('No notes');
    });
  });

  describe('buildWorkflowStepAnalysisPrompt', () => {
    const workflowStepContext: WorkflowStepAnalysisContext = {
      workflow: {
        id: 'checkout-flow',
        name: 'Checkout Flow',
        description: 'Test checkout process',
        expectedOutcome: 'Order created successfully',
        steps: [
          { tool: 'get_cart', description: 'Get cart' },
          { tool: 'create_order', description: 'Create order' },
        ],
      },
      step: { tool: 'get_cart', description: 'Get shopping cart' },
      stepIndex: 0,
      response: { content: [{ type: 'text', text: '{"items": []}' }] },
      error: undefined,
    };

    it('should include workflow name', () => {
      const prompt = buildWorkflowStepAnalysisPrompt(workflowStepContext);

      expect(prompt).toContain('Checkout Flow');
    });

    it('should include step index and total steps', () => {
      const prompt = buildWorkflowStepAnalysisPrompt(workflowStepContext);

      expect(prompt).toContain('Step 1/2');
    });

    it('should include tool name', () => {
      const prompt = buildWorkflowStepAnalysisPrompt(workflowStepContext);

      expect(prompt).toContain('get_cart');
    });

    it('should include arguments', () => {
      const contextWithArgs: WorkflowStepAnalysisContext = {
        ...workflowStepContext,
        step: {
          tool: 'get_cart',
          description: 'Get cart',
          args: { userId: '123' },
        },
      };

      const prompt = buildWorkflowStepAnalysisPrompt(contextWithArgs);

      expect(prompt).toContain('userId');
      expect(prompt).toContain('123');
    });

    it('should include response when present', () => {
      const prompt = buildWorkflowStepAnalysisPrompt(workflowStepContext);

      expect(prompt).toContain('items');
    });

    it('should include error when present', () => {
      const contextWithError: WorkflowStepAnalysisContext = {
        ...workflowStepContext,
        response: null,
        error: 'Cart not found',
      };

      const prompt = buildWorkflowStepAnalysisPrompt(contextWithError);

      expect(prompt).toContain('Error: Cart not found');
    });
  });

  describe('buildWorkflowSummaryPrompt', () => {
    const workflowSummaryContext: WorkflowSummaryContext = {
      workflow: {
        id: 'checkout-flow',
        name: 'Checkout Flow',
        description: 'Test checkout process',
        expectedOutcome: 'Order created successfully',
        steps: [
          { tool: 'get_cart', description: 'Get cart' },
          { tool: 'create_order', description: 'Create order' },
        ],
      },
      stepResults: [
        {
          step: { tool: 'get_cart', description: 'Get cart' },
          success: true,
          response: { content: [{ type: 'text', text: '{}' }] },
          analysis: 'Cart retrieved',
        },
        {
          step: { tool: 'create_order', description: 'Create order' },
          success: true,
          response: { content: [{ type: 'text', text: '{}' }] },
          analysis: 'Order created',
        },
      ],
      success: true,
    };

    it('should include workflow name and description', () => {
      const prompt = buildWorkflowSummaryPrompt(workflowSummaryContext);

      expect(prompt).toContain('Checkout Flow');
      expect(prompt).toContain('Test checkout process');
    });

    it('should include expected outcome', () => {
      const prompt = buildWorkflowSummaryPrompt(workflowSummaryContext);

      expect(prompt).toContain('Order created successfully');
    });

    it('should include success status', () => {
      const prompt = buildWorkflowSummaryPrompt(workflowSummaryContext);

      expect(prompt).toContain('Overall Success: true');
    });

    it('should format step results with status indicators', () => {
      const prompt = buildWorkflowSummaryPrompt(workflowSummaryContext);

      // Success marker
      expect(prompt).toMatch(/1\. ✓/);
      expect(prompt).toMatch(/2\. ✓/);
    });

    it('should show failure markers for failed steps', () => {
      const failedContext: WorkflowSummaryContext = {
        ...workflowSummaryContext,
        stepResults: [
          {
            step: { tool: 'get_cart', description: 'Get cart' },
            success: false,
            error: 'Cart service unavailable',
          },
        ],
        success: false,
      };

      const prompt = buildWorkflowSummaryPrompt(failedContext);

      expect(prompt).toMatch(/1\. ✗/);
      expect(prompt).toContain('Cart service unavailable');
    });

    it('should request 2-3 sentence summary', () => {
      const prompt = buildWorkflowSummaryPrompt(workflowSummaryContext);

      expect(prompt).toContain('2-3 sentence');
    });
  });

  describe('COMPLETION_OPTIONS', () => {
    it('should have temperature 0.4 for question generation', () => {
      expect(COMPLETION_OPTIONS.questionGeneration.temperature).toBe(0.4);
    });

    it('should have responseFormat json for structured outputs', () => {
      expect(COMPLETION_OPTIONS.questionGeneration.responseFormat).toBe('json');
      expect(COMPLETION_OPTIONS.profileSynthesis.responseFormat).toBe('json');
      expect(COMPLETION_OPTIONS.overallSynthesis.responseFormat).toBe('json');
    });

    it('should have temperature 0.3 for analysis prompts', () => {
      expect(COMPLETION_OPTIONS.responseAnalysis.temperature).toBe(0.3);
      expect(COMPLETION_OPTIONS.profileSynthesis.temperature).toBe(0.3);
      expect(COMPLETION_OPTIONS.overallSynthesis.temperature).toBe(0.3);
      expect(COMPLETION_OPTIONS.workflowStepAnalysis.temperature).toBe(0.3);
      expect(COMPLETION_OPTIONS.workflowSummary.temperature).toBe(0.3);
    });

    it('should have maxTokens limits for text outputs', () => {
      expect(COMPLETION_OPTIONS.responseAnalysis.maxTokens).toBe(200);
      expect(COMPLETION_OPTIONS.workflowStepAnalysis.maxTokens).toBe(150);
      expect(COMPLETION_OPTIONS.workflowSummary.maxTokens).toBe(200);
    });
  });
});
