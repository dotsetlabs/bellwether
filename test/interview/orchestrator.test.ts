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

  describe('error handling paths', () => {
    it('should categorize rate limit errors as retryable', async () => {
      let attempts = 0;
      const rateLimitingMock = new MockLLMClient({});
      rateLimitingMock.complete = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts <= 2) {
          const error = new Error('Rate limit exceeded 429');
          throw error;
        }
        // Return just the JSON string, not an object wrapper
        return Promise.resolve(
          JSON.stringify([{ description: 'Test', category: 'happy_path', args: {} }])
        );
      });

      const retryOrchestrator = new Orchestrator(rateLimitingMock);
      const questions = await retryOrchestrator.generateQuestions(weatherTool, 1);

      // Should have retried and eventually succeeded
      expect(attempts).toBe(3);
      expect(questions).toHaveLength(1);
    });

    it('should not retry on non-retryable errors like auth errors', async () => {
      let attempts = 0;
      const authErrorMock = new MockLLMClient({});
      authErrorMock.complete = vi.fn().mockImplementation(() => {
        attempts++;
        const error = new Error('401 Unauthorized - invalid api key');
        throw error;
      });

      const authOrchestrator = new Orchestrator(authErrorMock);
      const questions = await authOrchestrator.generateQuestions(weatherTool, 1);

      // Should have fallen back to defaults without excessive retries
      // Auth errors should not be retried
      expect(attempts).toBeLessThanOrEqual(1);
      expect(questions.length).toBeGreaterThan(0); // Fallback questions
    });

    it('should handle timeout errors with retry', async () => {
      let attempts = 0;
      const timeoutMock = new MockLLMClient({});
      timeoutMock.complete = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts <= 1) {
          const error = new Error('Request timeout');
          error.name = 'TimeoutError';
          throw error;
        }
        // Return just the JSON string, not an object wrapper
        return Promise.resolve(
          JSON.stringify([{ description: 'Success', category: 'happy_path', args: {} }])
        );
      });

      const timeoutOrchestrator = new Orchestrator(timeoutMock);
      const questions = await timeoutOrchestrator.generateQuestions(weatherTool, 1);

      // Should have retried at least once
      expect(attempts).toBeGreaterThanOrEqual(1);
      expect(questions.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect refusal responses', async () => {
      const refusalMock = new MockLLMClient({
        defaultResponse: "I can't help with that request.",
      });

      const refusalOrchestrator = new Orchestrator(refusalMock);
      const questions = await refusalOrchestrator.generateQuestions(weatherTool, 1);

      // Should fall back to defaults since response isn't valid JSON
      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].category).toBe('happy_path');
    });

    it('should handle malformed JSON responses gracefully', async () => {
      const malformedMock = new MockLLMClient({
        defaultResponse: '{"incomplete": json',
      });

      const malformedOrchestrator = new Orchestrator(malformedMock);
      const questions = await malformedOrchestrator.generateQuestions(weatherTool, 1);

      // Should fall back to defaults
      expect(questions.length).toBeGreaterThan(0);
    });

    it('should handle empty response from LLM', async () => {
      const emptyMock = new MockLLMClient({
        defaultResponse: '',
      });

      const emptyOrchestrator = new Orchestrator(emptyMock);
      const questions = await emptyOrchestrator.generateQuestions(weatherTool, 1);

      // Should fall back to defaults
      expect(questions.length).toBeGreaterThan(0);
    });

    it('should handle network errors with retry', async () => {
      let attempts = 0;
      const networkMock = new MockLLMClient({});
      networkMock.complete = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts <= 1) {
          throw new Error('ECONNRESET');
        }
        // Return just the JSON string, not an object wrapper
        return Promise.resolve(
          JSON.stringify([{ description: 'Test', category: 'happy_path', args: {} }])
        );
      });

      const networkOrchestrator = new Orchestrator(networkMock);
      const questions = await networkOrchestrator.generateQuestions(weatherTool, 1);

      expect(attempts).toBe(2);
      expect(questions).toHaveLength(1);
    });

    it('should respect max retry attempts', async () => {
      let attempts = 0;
      const alwaysFailingMock = new MockLLMClient({});
      alwaysFailingMock.complete = vi.fn().mockImplementation(() => {
        attempts++;
        throw new Error('Rate limit exceeded 429');
      });

      const retryOrchestrator = new Orchestrator(alwaysFailingMock);
      const questions = await retryOrchestrator.generateQuestions(weatherTool, 1);

      // Should have given up after max retries and used fallback
      // Default max retries is 3
      expect(attempts).toBeLessThanOrEqual(4); // Initial + 3 retries max
      expect(questions.length).toBeGreaterThan(0); // Fallback questions
    });
  });

  describe('cache integration', () => {
    it('should cache analysis results', async () => {
      const { ToolResponseCache } = await import('../../src/cache/response-cache.js');
      const cache = new ToolResponseCache();

      mockLLM.setConfig({
        defaultResponse: 'Analysis: Tool returned expected results.',
      });

      const orchestratorWithCache = new Orchestrator(mockLLM, undefined, undefined, cache);

      const question: InterviewQuestion = {
        description: 'Test query',
        category: 'happy_path',
        args: { location: 'NYC' },
      };
      const response = createMockToolResult('Weather in NYC: Sunny');

      // First call - should compute and cache
      const analysis1 = await orchestratorWithCache.analyzeResponse(
        weatherTool,
        question,
        response,
        null
      );

      // Verify the result is cached
      const responseHash = cache.hashResponse(response);
      const cachedAnalysis = cache.getAnalysis(weatherTool.name, question.args, responseHash);
      expect(cachedAnalysis).toBe(analysis1);
    });

    it('should return cached analysis without LLM call', async () => {
      const { ToolResponseCache } = await import('../../src/cache/response-cache.js');
      const cache = new ToolResponseCache();

      let llmCallCount = 0;
      const trackingMock = new MockLLMClient({
        defaultResponse: 'Fresh analysis',
      });
      const originalComplete = trackingMock.complete.bind(trackingMock);
      trackingMock.complete = vi.fn().mockImplementation((...args: unknown[]) => {
        llmCallCount++;
        return originalComplete(...args);
      });

      const orchestratorWithCache = new Orchestrator(trackingMock, undefined, undefined, cache);

      const question: InterviewQuestion = {
        description: 'Test query',
        category: 'happy_path',
        args: { location: 'NYC' },
      };
      const response = createMockToolResult('Weather in NYC: Sunny');

      // Pre-populate cache
      const responseHash = cache.hashResponse(response);
      cache.setAnalysis(weatherTool.name, question.args, responseHash, 'Cached analysis from previous run');

      // Call analyzeResponse - should return cached without LLM call
      const analysis = await orchestratorWithCache.analyzeResponse(
        weatherTool,
        question,
        response,
        null
      );

      expect(analysis).toBe('Cached analysis from previous run');
      expect(llmCallCount).toBe(0); // No LLM call should have been made
    });

    it('should not cache when response is null', async () => {
      const { ToolResponseCache } = await import('../../src/cache/response-cache.js');
      const cache = new ToolResponseCache();

      mockLLM.setConfig({
        defaultResponse: 'Analysis of null response',
      });

      const orchestratorWithCache = new Orchestrator(mockLLM, undefined, undefined, cache);

      const question: InterviewQuestion = {
        description: 'Test error',
        category: 'error_handling',
        args: {},
      };

      await orchestratorWithCache.analyzeResponse(
        weatherTool,
        question,
        null, // null response
        'Tool call failed'
      );

      // Cache should be empty since response was null
      const stats = cache.getStats();
      expect(stats.entries).toBe(0);
    });

    it('should work correctly without cache', async () => {
      // Create fresh mock for this test
      const freshMock = new MockLLMClient({
        defaultResponse: 'Analysis without cache',
      });

      // No cache passed
      const orchestratorNoCache = new Orchestrator(freshMock);

      const question: InterviewQuestion = {
        description: 'Test query',
        category: 'happy_path',
        args: { location: 'NYC' },
      };
      const response = createMockToolResult('Weather in NYC: Sunny');

      const analysis = await orchestratorNoCache.analyzeResponse(
        weatherTool,
        question,
        response,
        null
      );

      expect(analysis).toBe('Analysis without cache');
    });
  });
});
