import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Orchestrator } from '../../src/interview/orchestrator.js';
import type { LLMClient } from '../../src/llm/client.js';
import type { MCPResource, MCPResourceReadResult } from '../../src/transport/types.js';

describe('Resource Interview', () => {
  let mockLLM: LLMClient;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    mockLLM = {
      complete: vi.fn(() => Promise.resolve('')),
      parseJSON: vi.fn((str: string) => JSON.parse(str)),
    } as unknown as LLMClient;
    orchestrator = new Orchestrator(mockLLM);
  });

  describe('generateResourceQuestions', () => {
    it('should generate questions for a resource', async () => {
      const resource: MCPResource = {
        uri: 'file:///test.txt',
        name: 'test-file',
        description: 'A test file',
        mimeType: 'text/plain',
      };

      (mockLLM.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify([
          { description: 'Basic read access', category: 'happy_path' },
          { description: 'Verify text content', category: 'happy_path' },
        ])
      );

      const questions = await orchestrator.generateResourceQuestions(resource, 2);

      expect(questions).toHaveLength(2);
      expect(questions[0].description).toBe('Basic read access');
      expect(questions[0].category).toBe('happy_path');
    });

    it('should return fallback questions on LLM failure', async () => {
      const resource: MCPResource = {
        uri: 'file:///test.txt',
        name: 'test-file',
        description: 'A test file',
        mimeType: 'text/plain',
      };

      (mockLLM.complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM error'));

      const questions = await orchestrator.generateResourceQuestions(resource, 2);

      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].description).toContain('test-file');
    });

    it('should include MIME type validation in fallback questions', async () => {
      const resource: MCPResource = {
        uri: 'file:///test.json',
        name: 'config',
        description: 'Configuration file',
        mimeType: 'application/json',
      };

      (mockLLM.complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM error'));

      const questions = await orchestrator.generateResourceQuestions(resource, 2);

      expect(questions.some(q => q.description.includes('MIME type'))).toBe(true);
    });
  });

  describe('analyzeResourceResponse', () => {
    it('should analyze successful resource read', async () => {
      const resource: MCPResource = {
        uri: 'file:///test.txt',
        name: 'test-file',
        description: 'A test file',
      };

      const question = { description: 'Basic read', category: 'happy_path' as const };
      const response: MCPResourceReadResult = {
        contents: [{ uri: 'file:///test.txt', text: 'Hello World', mimeType: 'text/plain' }],
      };

      (mockLLM.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Resource returned text content as expected.'
      );

      const analysis = await orchestrator.analyzeResourceResponse(resource, question, response, null);

      expect(analysis).toContain('text content');
    });

    it('should handle resource read error', async () => {
      const resource: MCPResource = {
        uri: 'file:///missing.txt',
        name: 'missing-file',
        description: 'A missing file',
      };

      const question = { description: 'Read missing file', category: 'error_handling' as const };

      (mockLLM.complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM error'));

      const analysis = await orchestrator.analyzeResourceResponse(
        resource,
        question,
        null,
        'File not found'
      );

      expect(analysis).toContain('failed');
      expect(analysis).toContain('File not found');
    });

    it('should handle binary content', async () => {
      const resource: MCPResource = {
        uri: 'file:///image.png',
        name: 'image',
        mimeType: 'image/png',
      };

      const question = { description: 'Read image', category: 'happy_path' as const };
      const response: MCPResourceReadResult = {
        contents: [{ uri: 'file:///image.png', blob: 'iVBORw0KGgoAAAANS...', mimeType: 'image/png' }],
      };

      (mockLLM.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Resource returned binary image data.'
      );

      const analysis = await orchestrator.analyzeResourceResponse(resource, question, response, null);

      expect(analysis).toBeDefined();
    });
  });

  describe('synthesizeResourceProfile', () => {
    it('should synthesize profile from interactions', async () => {
      const resource: MCPResource = {
        uri: 'file:///test.txt',
        name: 'test-file',
        description: 'A test file',
        mimeType: 'text/plain',
      };

      const interactions = [
        {
          question: { description: 'Basic read', category: 'happy_path' as const },
          response: { contents: [{ uri: 'file:///test.txt', text: 'content' }] },
          error: null,
          analysis: 'Read succeeded',
        },
      ];

      (mockLLM.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify({
          behavioralNotes: ['Returns text content'],
          limitations: [],
        })
      );

      const profile = await orchestrator.synthesizeResourceProfile(resource, interactions);

      expect(profile.name).toBe('test-file');
      expect(profile.uri).toBe('file:///test.txt');
      expect(profile.mimeType).toBe('text/plain');
      expect(profile.behavioralNotes).toContain('Returns text content');
    });

    it('should use fallback profile on LLM failure', async () => {
      const resource: MCPResource = {
        uri: 'file:///test.txt',
        name: 'test-file',
        description: 'A test file',
      };

      const interactions = [
        {
          question: { description: 'Basic read', category: 'happy_path' as const },
          response: null,
          error: null,
          analysis: 'Resource read completed',
        },
      ];

      (mockLLM.complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM error'));

      const profile = await orchestrator.synthesizeResourceProfile(resource, interactions);

      expect(profile.name).toBe('test-file');
      expect(profile.behavioralNotes).toContain('Resource read completed');
    });
  });
});
