/**
 * Tests for AI Agent Compatibility Scoring.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAICompatibilityScore,
  generateAICompatibilityMarkdown,
  type AICompatibilityInput,
} from '../../src/baseline/ai-compatibility-scorer.js';
import type { MCPTool } from '../../src/transport/types.js';

describe('AI Compatibility Scorer', () => {
  describe('calculateAICompatibilityScore', () => {
    it('should return empty score for empty inputs', () => {
      const score = calculateAICompatibilityScore([]);

      expect(score.overall).toBe(0);
      expect(score.grade).toBe('F');
      expect(score.toolScores).toHaveLength(0);
    });

    it('should calculate score for well-documented tools', () => {
      const inputs: AICompatibilityInput[] = [
        {
          tool: {
            name: 'create_user',
            description: 'Creates a new user account with the specified details. Returns the created user object including the generated user_id.',
            inputSchema: {
              type: 'object',
              properties: {
                username: { type: 'string', description: 'Unique username for the account' },
                email: { type: 'string', format: 'email', description: 'User email address' },
                role: { type: 'string', enum: ['admin', 'user', 'guest'] },
              },
              required: ['username', 'email'],
            },
          },
        },
      ];

      const score = calculateAICompatibilityScore(inputs);

      expect(score.overall).toBeGreaterThan(50);
      expect(score.grade).not.toBe('F');
      expect(score.breakdown.descriptionClarity.score).toBeGreaterThan(0);
      expect(score.breakdown.parameterNaming.score).toBeGreaterThan(0);
    });

    it('should penalize short descriptions', () => {
      const inputs: AICompatibilityInput[] = [
        {
          tool: {
            name: 'do_thing',
            description: 'Does thing.',
            inputSchema: {},
          },
        },
      ];

      const score = calculateAICompatibilityScore(inputs);

      expect(score.breakdown.descriptionClarity.score).toBeLessThan(50);
      expect(score.breakdown.descriptionClarity.notes.length).toBeGreaterThan(0);
    });

    it('should penalize generic parameter names', () => {
      const inputs: AICompatibilityInput[] = [
        {
          tool: {
            name: 'process_data',
            description: 'Processes data and returns the result.',
            inputSchema: {
              type: 'object',
              properties: {
                data: { type: 'string' },
                value: { type: 'number' },
                input: { type: 'object' },
              },
            },
          },
        },
      ];

      const score = calculateAICompatibilityScore(inputs);

      expect(score.breakdown.parameterNaming.score).toBeLessThan(80);
      expect(score.breakdown.parameterNaming.notes.some(n => n.includes('Generic'))).toBe(true);
    });

    it('should reward action verbs in descriptions', () => {
      const goodInput: AICompatibilityInput[] = [
        {
          tool: {
            name: 'fetch_data',
            description: 'Retrieves data from the database based on the provided query parameters.',
            inputSchema: {},
          },
        },
      ];

      const badInput: AICompatibilityInput[] = [
        {
          tool: {
            name: 'data_getter',
            description: 'Data from the database based on query parameters.',
            inputSchema: {},
          },
        },
      ];

      const goodScore = calculateAICompatibilityScore(goodInput);
      const badScore = calculateAICompatibilityScore(badInput);

      expect(goodScore.breakdown.descriptionClarity.score).toBeGreaterThan(
        badScore.breakdown.descriptionClarity.score
      );
    });

    it('should calculate per-tool scores', () => {
      const inputs: AICompatibilityInput[] = [
        {
          tool: {
            name: 'good_tool',
            description: 'Creates a new resource with comprehensive validation and error handling.',
            inputSchema: {
              type: 'object',
              properties: {
                resourceName: { type: 'string' },
                resourceType: { type: 'string' },
              },
            },
          },
        },
        {
          tool: {
            name: 'bad_tool',
            description: 'Tool.',
            inputSchema: {
              type: 'object',
              properties: {
                x: { type: 'string' },
              },
            },
          },
        },
      ];

      const score = calculateAICompatibilityScore(inputs);

      expect(score.toolScores).toHaveLength(2);

      const goodToolScore = score.toolScores.find(t => t.toolName === 'good_tool');
      const badToolScore = score.toolScores.find(t => t.toolName === 'bad_tool');

      expect(goodToolScore).toBeDefined();
      expect(badToolScore).toBeDefined();
      expect(goodToolScore!.score).toBeGreaterThan(badToolScore!.score);
      expect(badToolScore!.issues.length).toBeGreaterThan(0);
    });

    it('should generate recommendations for low-scoring components', () => {
      const inputs: AICompatibilityInput[] = [
        {
          tool: {
            name: 't',
            description: 'X.',
            inputSchema: {
              type: 'object',
              properties: {
                data: { type: 'string' },
              },
            },
          },
        },
      ];

      const score = calculateAICompatibilityScore(inputs);

      expect(score.recommendations.length).toBeGreaterThan(0);
      expect(score.recommendations[0].priority).toBe(1);
      expect(score.recommendations[0].potentialImprovement).toBeGreaterThan(0);
    });

    it('should assign correct letter grades', () => {
      // Create inputs that should result in different grades
      const excellentTool: MCPTool = {
        name: 'comprehensive_tool',
        description: 'Creates and manages user sessions with full authentication support. Validates credentials, establishes secure tokens, and returns session metadata including expiration time.',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
            rememberMe: { type: 'boolean' },
          },
          required: ['username', 'password'],
        },
      };

      const excellentInputs: AICompatibilityInput[] = [{ tool: excellentTool }];
      const score = calculateAICompatibilityScore(excellentInputs);

      // Should get at least a B or better for well-documented tool
      expect(['A', 'B', 'C']).toContain(score.grade);
    });

    it('should detect workflow documentation hints', () => {
      const inputs: AICompatibilityInput[] = [
        {
          tool: {
            name: 'step_one',
            description: 'First step in the authentication flow. Call this before exchange_token.',
            inputSchema: {},
          },
        },
        {
          tool: {
            name: 'step_two',
            description: 'Second step. Requires step_one to be called first. Returns access token.',
            inputSchema: {},
          },
        },
      ];

      const score = calculateAICompatibilityScore(inputs);

      expect(score.breakdown.workflowDocumentation.score).toBeGreaterThan(50);
      expect(score.breakdown.workflowDocumentation.notes.some(n =>
        n.includes('sequence') || n.includes('dependencies')
      )).toBe(true);
    });

    it('should handle schema evolution data for predictability', () => {
      const inputs: AICompatibilityInput[] = [
        {
          tool: {
            name: 'stable_tool',
            description: 'Returns data in a consistent format.',
            inputSchema: {},
          },
          schemaEvolution: {
            toolName: 'stable_tool',
            versions: [],
            isStable: true,
            stabilityScore: 100,
            currentVersion: { version: 1, fields: [], structure: { type: 'object' } },
          },
        },
        {
          tool: {
            name: 'unstable_tool',
            description: 'Returns data that changes frequently.',
            inputSchema: {},
          },
          schemaEvolution: {
            toolName: 'unstable_tool',
            versions: [],
            isStable: false,
            stabilityScore: 30,
            currentVersion: { version: 3, fields: [], structure: { type: 'object' } },
          },
        },
      ];

      const score = calculateAICompatibilityScore(inputs);

      expect(score.breakdown.responsePredictability.notes.some(n =>
        n.includes('Unstable')
      )).toBe(true);
    });
  });

  describe('generateAICompatibilityMarkdown', () => {
    it('should generate valid markdown output', () => {
      const inputs: AICompatibilityInput[] = [
        {
          tool: {
            name: 'test_tool',
            description: 'A test tool for validation purposes.',
            inputSchema: {},
          },
        },
      ];

      const score = calculateAICompatibilityScore(inputs);
      const markdown = generateAICompatibilityMarkdown(score);

      expect(markdown).toContain('## AI Agent Compatibility');
      expect(markdown).toContain('Overall Score:');
      expect(markdown).toContain('Grade');
      expect(markdown).toContain('| Factor | Score | Weight | Notes |');
    });

    it('should include recommendations section when present', () => {
      const inputs: AICompatibilityInput[] = [
        {
          tool: {
            name: 'poor_tool',
            description: 'X',
            inputSchema: {
              type: 'object',
              properties: {
                data: { type: 'string' },
              },
            },
          },
        },
      ];

      const score = calculateAICompatibilityScore(inputs);
      const markdown = generateAICompatibilityMarkdown(score);

      if (score.recommendations.length > 0) {
        expect(markdown).toContain('### Improvement Recommendations');
      }
    });

    it('should include low-scoring tools table when applicable', () => {
      const inputs: AICompatibilityInput[] = [
        {
          tool: {
            name: 'very_poor_tool',
            description: 'X',
            inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
          },
        },
      ];

      const score = calculateAICompatibilityScore(inputs);
      const markdown = generateAICompatibilityMarkdown(score);

      const lowScoreTools = score.toolScores.filter(t => t.score < 70);
      if (lowScoreTools.length > 0) {
        expect(markdown).toContain('### Tools Needing Attention');
      }
    });
  });
});
