import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../../src/interview/orchestrator.js';
import {
  MockLLMClient,
  createQuestionGeneratorMock,
  createFailingMock,
} from '../fixtures/mock-llm-client.js';
import {
  weatherTool,
  calculatorTool,
  noParamsTool,
  minimalTool,
  mockServerInfo,
  createMockToolResult,
} from '../fixtures/sample-tools.js';
import type { ToolProfile, InterviewQuestion } from '../../src/interview/types.js';
import type { DiscoveryResult } from '../../src/discovery/types.js';

describe('Orchestrator', () => {
  let mockLLM: MockLLMClient;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    mockLLM = createQuestionGeneratorMock();
    orchestrator = new Orchestrator(mockLLM);
  });

  describe('generateQuestions', () => {
    it('should generate questions using LLM', async () => {
      mockLLM.setConfig({
        defaultResponse: JSON.stringify([
          { description: 'Test NYC weather', category: 'happy_path', args: { location: 'NYC' } },
          { description: 'Test edge case', category: 'edge_case', args: { location: '' } },
        ]),
      });

      const questions = await orchestrator.generateQuestions(weatherTool, 3);

      expect(questions).toHaveLength(2);
      expect(questions[0]).toHaveProperty('description');
      expect(questions[0]).toHaveProperty('category');
      expect(questions[0]).toHaveProperty('args');
    });

    it('should include tool information in prompt', async () => {
      mockLLM.setConfig({ defaultResponse: JSON.stringify([]) });

      await orchestrator.generateQuestions(weatherTool, 3);

      const lastCall = mockLLM.getLastCall();
      expect(lastCall?.messages[0].content).toContain('get_weather');
      expect(lastCall?.messages[0].content).toContain('location');
    });

    it('should include schema in prompt', async () => {
      mockLLM.setConfig({ defaultResponse: JSON.stringify([]) });

      await orchestrator.generateQuestions(weatherTool, 3);

      const lastCall = mockLLM.getLastCall();
      expect(lastCall?.messages[0].content).toContain('"type": "object"');
    });

    it('should limit questions to maxQuestions', async () => {
      // Create fresh mock that returns 3 questions
      const localMock = new MockLLMClient({
        defaultResponse: JSON.stringify([
          { description: 'Q1', category: 'happy_path', args: {} },
          { description: 'Q2', category: 'edge_case', args: {} },
          { description: 'Q3', category: 'boundary', args: {} },
        ]),
      });
      const localOrchestrator = new Orchestrator(localMock);

      // Ask for only 1 question
      const questions = await localOrchestrator.generateQuestions(weatherTool, 1);

      expect(questions).toHaveLength(1);
    });

    it('should use fallback when LLM fails', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const questions = await failingOrchestrator.generateQuestions(weatherTool, 3);

      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].category).toBe('happy_path');
    });

    it('should generate fallback with required params', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const questions = await failingOrchestrator.generateQuestions(weatherTool, 3);

      // Should have 'location' as required param
      expect(questions[0].args).toHaveProperty('location');
    });

    it('should skip error tests when requested', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const questions = await failingOrchestrator.generateQuestions(weatherTool, 3, true);

      // Should only have happy_path, no error_handling
      expect(questions.every(q => q.category !== 'error_handling')).toBe(true);
    });

    it('should include error handling tests by default', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const questions = await failingOrchestrator.generateQuestions(weatherTool, 3, false);

      // Should have at least one error_handling test
      expect(questions.some(q => q.category === 'error_handling')).toBe(true);
    });

    it('should handle tool with no schema', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const questions = await failingOrchestrator.generateQuestions(minimalTool, 3);

      expect(questions.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeResponse', () => {
    it('should analyze successful response', async () => {
      mockLLM.setConfig({
        defaultResponse: JSON.stringify({
          analysis: 'The tool responded with valid weather data.',
        }),
      });

      const question: InterviewQuestion = {
        description: 'Test basic weather lookup',
        category: 'happy_path',
        args: { location: 'New York' },
      };

      const response = createMockToolResult('{"temp": 72}');
      const analysis = await orchestrator.analyzeResponse(weatherTool, question, response, null);

      expect(analysis).toBeTruthy();
    });

    it('should analyze error response', async () => {
      mockLLM.setConfig({
        defaultResponse: JSON.stringify({
          analysis: 'The tool returned an error as expected.',
        }),
      });

      const question: InterviewQuestion = {
        description: 'Test error handling',
        category: 'error_handling',
        args: {},
      };

      const analysis = await orchestrator.analyzeResponse(weatherTool, question, null, 'Invalid location');

      expect(analysis).toBeTruthy();
    });

    it('should fallback gracefully on LLM failure', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const question: InterviewQuestion = {
        description: 'Test',
        category: 'happy_path',
        args: {},
      };

      const response = createMockToolResult('Hello');
      const analysis = await failingOrchestrator.analyzeResponse(
        weatherTool,
        question,
        response,
        null
      );

      expect(analysis).toContain('Tool returned: Hello');
    });

    it('should handle error case in fallback', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const question: InterviewQuestion = {
        description: 'Test',
        category: 'error_handling',
        args: {},
      };

      const analysis = await failingOrchestrator.analyzeResponse(
        weatherTool,
        question,
        null,
        'Connection failed'
      );

      expect(analysis).toContain('Tool returned an error: Connection failed');
    });
  });

  describe('synthesizeToolProfile', () => {
    it('should synthesize profile from interactions', async () => {
      // Create fresh mock for this test
      const localMock = new MockLLMClient({
        defaultResponse: JSON.stringify({
          behavioralNotes: ['Returns JSON data', 'Fast response time'],
          limitations: ['No batch support'],
          securityNotes: ['No auth required'],
        }),
      });
      const localOrchestrator = new Orchestrator(localMock);

      const interactions = [
        {
          question: {
            description: 'Test 1',
            category: 'happy_path' as const,
            args: { location: 'NYC' },
          },
          response: createMockToolResult('{"temp": 72}'),
          error: null,
          analysis: 'Tool returned weather data successfully.',
        },
      ];

      const profile = await localOrchestrator.synthesizeToolProfile(weatherTool, interactions);

      expect(profile.name).toBe('get_weather');
      expect(profile.behavioralNotes).toContain('Returns JSON data');
      expect(profile.limitations).toContain('No batch support');
      expect(profile.securityNotes).toContain('No auth required');
    });

    it('should use analysis as fallback on LLM failure', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const interactions = [
        {
          question: {
            description: 'Test 1',
            category: 'happy_path' as const,
            args: {},
          },
          response: createMockToolResult('OK'),
          error: null,
          analysis: 'Tool worked correctly.',
        },
      ];

      const profile = await failingOrchestrator.synthesizeToolProfile(weatherTool, interactions);

      expect(profile.behavioralNotes).toContain('Tool worked correctly.');
    });

    it('should handle empty interactions', async () => {
      mockLLM.setConfig({
        defaultResponse: JSON.stringify({
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        }),
      });

      const profile = await orchestrator.synthesizeToolProfile(weatherTool, []);

      expect(profile.name).toBe('get_weather');
      expect(profile.behavioralNotes).toEqual([]);
    });
  });

  describe('synthesizeOverall', () => {
    let mockDiscovery: DiscoveryResult;
    let mockProfiles: ToolProfile[];

    beforeEach(() => {
      mockDiscovery = {
        serverInfo: mockServerInfo,
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        tools: [weatherTool, calculatorTool],
        prompts: [],
        timestamp: new Date(),
        serverCommand: 'test',
        serverArgs: [],
      };

      mockProfiles = [
        {
          name: 'get_weather',
          description: 'Get weather',
          interactions: [],
          behavioralNotes: ['Fast responses'],
          limitations: [],
          securityNotes: [],
        },
      ];
    });

    it('should synthesize overall summary', async () => {
      // Create fresh mock for this test
      const localMock = new MockLLMClient({
        defaultResponse: JSON.stringify({
          summary: 'A weather and calculation service.',
          limitations: ['No offline mode'],
          recommendations: ['Cache results'],
        }),
      });
      const localOrchestrator = new Orchestrator(localMock);

      const result = await localOrchestrator.synthesizeOverall(mockDiscovery, mockProfiles);

      expect(result.summary).toContain('weather');
      expect(result.limitations).toContain('No offline mode');
      expect(result.recommendations).toContain('Cache results');
    });

    it('should use fallback on LLM failure', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const result = await failingOrchestrator.synthesizeOverall(mockDiscovery, mockProfiles);

      expect(result.summary).toContain('test-server');
      expect(result.summary).toContain('2 tools');
    });
  });

  describe('fallback value generation', () => {
    it('should generate path values', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const tool = {
        name: 'read_file',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string' },
          },
          required: ['filePath'],
        },
      };

      const questions = await failingOrchestrator.generateQuestions(tool, 1);

      expect(questions[0].args.filePath).toContain('test');
    });

    it('should generate URL values', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const tool = {
        name: 'fetch',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
          },
          required: ['url'],
        },
      };

      const questions = await failingOrchestrator.generateQuestions(tool, 1);

      expect(questions[0].args.url).toContain('https://');
    });

    it('should use enum values when available', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const tool = {
        name: 'convert',
        inputSchema: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'xml', 'csv'] },
          },
          required: ['format'],
        },
      };

      const questions = await failingOrchestrator.generateQuestions(tool, 1);

      expect(questions[0].args.format).toBe('json');
    });

    it('should generate appropriate type defaults', async () => {
      const failingLLM = createFailingMock();
      const failingOrchestrator = new Orchestrator(failingLLM);

      const tool = {
        name: 'multi_type',
        inputSchema: {
          type: 'object',
          properties: {
            count: { type: 'number' },
            enabled: { type: 'boolean' },
            items: { type: 'array' },
            config: { type: 'object' },
          },
          required: ['count', 'enabled', 'items', 'config'],
        },
      };

      const questions = await failingOrchestrator.generateQuestions(tool, 1);

      expect(questions[0].args.count).toBe(1);
      expect(questions[0].args.enabled).toBe(true);
      expect(questions[0].args.items).toEqual([]);
      expect(questions[0].args.config).toEqual({});
    });
  });
});
