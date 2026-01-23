/**
 * Tests for documentation quality scoring.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreDocumentation,
  scoreToolDocumentation,
  calculateDescriptionCoverage,
  calculateDescriptionQuality,
  calculateParameterDocumentation,
  calculateExampleCoverage,
  hasExamples,
  scoreToGrade,
  generateSuggestions,
  compareDocumentationScores,
  formatDocumentationScore,
  formatDocumentationScoreCompact,
  formatDocumentationScoreChange,
  toDocumentationScoreSummary,
  getGradeIndicator,
  getGradeBadgeColor,
  meetsDocumentationThreshold,
  meetsDocumentationGrade,
} from '../../src/baseline/documentation-scorer.js';
import type { MCPTool } from '../../src/transport/types.js';
import type { DocumentationScore, DocumentationGrade } from '../../src/baseline/documentation-scorer.js';
import { DOCUMENTATION_SCORING } from '../../src/constants.js';

// Helper to create a tool with specific properties
function createTool(overrides: Partial<MCPTool> = {}): MCPTool {
  return {
    name: 'test-tool',
    description: 'A test tool that performs testing operations',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    ...overrides,
  };
}

describe('scoreDocumentation', () => {
  describe('with no tools', () => {
    it('should return perfect score for empty tool list', () => {
      const result = scoreDocumentation([]);

      expect(result.overallScore).toBe(100);
      expect(result.grade).toBe('A');
      expect(result.issues).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
      expect(result.toolCount).toBe(0);
    });
  });

  describe('with well-documented tools', () => {
    it('should return high score for tools with good descriptions', () => {
      const tools: MCPTool[] = [
        createTool({
          name: 'create-file',
          description: 'Creates a new file at the specified path with the given content. Returns the file path on success.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The file path to create' },
              content: { type: 'string', description: 'The content to write to the file' },
            },
          },
        }),
        createTool({
          name: 'delete-file',
          description: 'Deletes the file at the specified path. Returns true if the file was successfully deleted.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The file path to delete' },
            },
          },
        }),
      ];

      const result = scoreDocumentation(tools);

      expect(result.overallScore).toBeGreaterThanOrEqual(75);
      expect(['A', 'B', 'C']).toContain(result.grade);
      expect(result.components.descriptionCoverage).toBe(100);
      expect(result.components.parameterDocumentation).toBe(100);
    });
  });

  describe('with poorly documented tools', () => {
    it('should return low score for tools without descriptions', () => {
      const tools: MCPTool[] = [
        createTool({ name: 'tool1', description: '' }),
        createTool({ name: 'tool2', description: undefined }),
      ];

      const result = scoreDocumentation(tools);

      expect(result.overallScore).toBeLessThan(50);
      expect(result.grade).toBe('F');
      expect(result.issues.some(i => i.type === 'missing_description')).toBe(true);
    });

    it('should return lower score for tools with short descriptions', () => {
      const tools: MCPTool[] = [
        createTool({ name: 'tool1', description: 'Does stuff' }),
        createTool({ name: 'tool2', description: 'A tool' }),
      ];

      const result = scoreDocumentation(tools);

      expect(result.overallScore).toBeLessThan(70);
      expect(result.issues.some(i => i.type === 'short_description')).toBe(true);
    });

    it('should penalize undocumented parameters', () => {
      const tools: MCPTool[] = [
        createTool({
          name: 'tool1',
          description: 'Creates files in the filesystem with the given content and path',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' }, // No description
              content: { type: 'string' }, // No description
            },
          },
        }),
      ];

      const result = scoreDocumentation(tools);

      expect(result.components.parameterDocumentation).toBe(0);
      expect(result.issues.some(i => i.type === 'missing_param_description')).toBe(true);
    });
  });
});

describe('scoreToolDocumentation', () => {
  it('should score individual tool documentation', () => {
    const tool = createTool({
      description: 'Gets user information from the database by their unique identifier',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The unique user ID' },
        },
      },
    });

    const result = scoreToolDocumentation(tool);

    expect(result.tool).toBe('test-tool');
    expect(result.score).toBeGreaterThan(50);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect missing description', () => {
    const tool = createTool({ description: '' });

    const result = scoreToolDocumentation(tool);

    expect(result.issues.some(i => i.type === 'missing_description')).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it('should detect short description', () => {
    const tool = createTool({ description: 'Does X' });

    const result = scoreToolDocumentation(tool);

    expect(result.issues.some(i => i.type === 'short_description')).toBe(true);
  });
});

describe('calculateDescriptionCoverage', () => {
  it('should return 100% when all tools have descriptions', () => {
    const tools: MCPTool[] = [
      createTool({ description: 'Description 1' }),
      createTool({ description: 'Description 2' }),
    ];

    expect(calculateDescriptionCoverage(tools)).toBe(100);
  });

  it('should return 0% when no tools have descriptions', () => {
    const tools: MCPTool[] = [
      createTool({ description: '' }),
      createTool({ description: undefined }),
    ];

    expect(calculateDescriptionCoverage(tools)).toBe(0);
  });

  it('should return correct percentage for mixed coverage', () => {
    const tools: MCPTool[] = [
      createTool({ description: 'Has description' }),
      createTool({ description: '' }),
    ];

    expect(calculateDescriptionCoverage(tools)).toBe(50);
  });

  it('should return 100% for empty tool list', () => {
    expect(calculateDescriptionCoverage([])).toBe(100);
  });
});

describe('calculateDescriptionQuality', () => {
  it('should score higher for longer descriptions', () => {
    const shortDesc: MCPTool[] = [createTool({ description: 'Short' })];
    const longDesc: MCPTool[] = [
      createTool({
        description: 'Creates a new file at the specified path with given content',
      }),
    ];

    expect(calculateDescriptionQuality(longDesc)).toBeGreaterThan(
      calculateDescriptionQuality(shortDesc)
    );
  });

  it('should give bonus for imperative verb start', () => {
    const noVerb: MCPTool[] = [createTool({ description: 'a file operation tool' })];
    const withVerb: MCPTool[] = [createTool({ description: 'Creates files in the system' })];

    expect(calculateDescriptionQuality(withVerb)).toBeGreaterThan(
      calculateDescriptionQuality(noVerb)
    );
  });

  it('should give bonus for behavior/return description', () => {
    const noBehavior: MCPTool[] = [createTool({ description: 'A file tool for files' })];
    const withBehavior: MCPTool[] = [
      createTool({ description: 'A file tool that returns the file path' }),
    ];

    expect(calculateDescriptionQuality(withBehavior)).toBeGreaterThan(
      calculateDescriptionQuality(noBehavior)
    );
  });

  it('should return 100% for empty tool list', () => {
    expect(calculateDescriptionQuality([])).toBe(100);
  });
});

describe('calculateParameterDocumentation', () => {
  it('should return 100% when all parameters have descriptions', () => {
    const tools: MCPTool[] = [
      createTool({
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string', description: 'First param' },
            param2: { type: 'number', description: 'Second param' },
          },
        },
      }),
    ];

    expect(calculateParameterDocumentation(tools)).toBe(100);
  });

  it('should return 0% when no parameters have descriptions', () => {
    const tools: MCPTool[] = [
      createTool({
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
            param2: { type: 'number' },
          },
        },
      }),
    ];

    expect(calculateParameterDocumentation(tools)).toBe(0);
  });

  it('should return correct percentage for mixed documentation', () => {
    const tools: MCPTool[] = [
      createTool({
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string', description: 'Has description' },
            param2: { type: 'number' }, // No description
          },
        },
      }),
    ];

    expect(calculateParameterDocumentation(tools)).toBe(50);
  });

  it('should return 100% for tools with no parameters', () => {
    const tools: MCPTool[] = [createTool({ inputSchema: { type: 'object', properties: {} } })];

    expect(calculateParameterDocumentation(tools)).toBe(100);
  });
});

describe('calculateExampleCoverage', () => {
  it('should return 100% when all tools have examples', () => {
    const tools: MCPTool[] = [
      createTool({
        inputSchema: {
          type: 'object',
          examples: [{ path: '/test' }],
        },
      }),
    ];

    expect(calculateExampleCoverage(tools)).toBe(100);
  });

  it('should return 0% when no tools have examples', () => {
    const tools: MCPTool[] = [
      createTool({ inputSchema: { type: 'object', properties: {} } }),
    ];

    expect(calculateExampleCoverage(tools)).toBe(0);
  });

  it('should detect property-level examples', () => {
    const tools: MCPTool[] = [
      createTool({
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', examples: ['/test/path'] },
          },
        },
      }),
    ];

    expect(calculateExampleCoverage(tools)).toBe(100);
  });
});

describe('hasExamples', () => {
  it('should detect schema-level examples', () => {
    const tool = createTool({
      inputSchema: {
        type: 'object',
        examples: [{ path: '/test' }],
      },
    });

    expect(hasExamples(tool)).toBe(true);
  });

  it('should detect property-level examples', () => {
    const tool = createTool({
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', examples: ['/test'] },
        },
      },
    });

    expect(hasExamples(tool)).toBe(true);
  });

  it('should return false when no examples exist', () => {
    const tool = createTool({
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
      },
    });

    expect(hasExamples(tool)).toBe(false);
  });
});

describe('scoreToGrade', () => {
  it('should return A for scores >= 90', () => {
    expect(scoreToGrade(90)).toBe('A');
    expect(scoreToGrade(100)).toBe('A');
  });

  it('should return B for scores 80-89', () => {
    expect(scoreToGrade(80)).toBe('B');
    expect(scoreToGrade(89)).toBe('B');
  });

  it('should return C for scores 70-79', () => {
    expect(scoreToGrade(70)).toBe('C');
    expect(scoreToGrade(79)).toBe('C');
  });

  it('should return D for scores 60-69', () => {
    expect(scoreToGrade(60)).toBe('D');
    expect(scoreToGrade(69)).toBe('D');
  });

  it('should return F for scores < 60', () => {
    expect(scoreToGrade(59)).toBe('F');
    expect(scoreToGrade(0)).toBe('F');
  });
});

describe('generateSuggestions', () => {
  it('should suggest adding descriptions for tools without them', () => {
    const issues = [
      { tool: 'tool1', type: 'missing_description' as const, severity: 'error' as const, message: 'Missing' },
    ];
    const tools: MCPTool[] = [createTool({ name: 'tool1' })];

    const suggestions = generateSuggestions(issues, tools);

    expect(suggestions.some(s => s.includes('description'))).toBe(true);
  });

  it('should suggest expanding short descriptions', () => {
    const issues = [
      { tool: 'tool1', type: 'short_description' as const, severity: 'warning' as const, message: 'Short' },
    ];
    const tools: MCPTool[] = [createTool({ name: 'tool1' })];

    const suggestions = generateSuggestions(issues, tools);

    expect(suggestions.some(s => s.includes('Expand'))).toBe(true);
  });

  it('should suggest adding parameter descriptions', () => {
    const issues = [
      { tool: 'tool1', type: 'missing_param_description' as const, severity: 'warning' as const, message: 'Missing param', paramName: 'path' },
    ];
    const tools: MCPTool[] = [createTool({ name: 'tool1' })];

    const suggestions = generateSuggestions(issues, tools);

    expect(suggestions.some(s => s.includes('parameter'))).toBe(true);
  });

  it('should limit suggestions to maximum', () => {
    const issues = Array.from({ length: 20 }, (_, i) => ({
      tool: `tool${i}`,
      type: 'missing_description' as const,
      severity: 'error' as const,
      message: 'Missing',
    }));
    const tools: MCPTool[] = [];

    const suggestions = generateSuggestions(issues, tools);

    expect(suggestions.length).toBeLessThanOrEqual(DOCUMENTATION_SCORING.MAX_SUGGESTIONS);
  });
});

describe('compareDocumentationScores', () => {
  const createScore = (overrides: Partial<DocumentationScore> = {}): DocumentationScore => ({
    overallScore: 75,
    grade: 'C',
    components: {
      descriptionCoverage: 80,
      descriptionQuality: 70,
      parameterDocumentation: 75,
      exampleCoverage: 50,
    },
    issues: [],
    suggestions: [],
    toolCount: 5,
    ...overrides,
  });

  it('should detect improvement', () => {
    const previous = createScore({ overallScore: 60, grade: 'D' });
    const current = createScore({ overallScore: 80, grade: 'B' });

    const change = compareDocumentationScores(previous, current);

    expect(change.improved).toBe(true);
    expect(change.degraded).toBe(false);
    expect(change.change).toBe(20);
    expect(change.previousGrade).toBe('D');
    expect(change.currentGrade).toBe('B');
  });

  it('should detect degradation', () => {
    const previous = createScore({ overallScore: 90, grade: 'A' });
    const current = createScore({ overallScore: 70, grade: 'C' });

    const change = compareDocumentationScores(previous, current);

    expect(change.improved).toBe(false);
    expect(change.degraded).toBe(true);
    expect(change.change).toBe(-20);
  });

  it('should handle no change', () => {
    const previous = createScore({ overallScore: 75, grade: 'C' });
    const current = createScore({ overallScore: 75, grade: 'C' });

    const change = compareDocumentationScores(previous, current);

    expect(change.improved).toBe(false);
    expect(change.degraded).toBe(false);
    expect(change.change).toBe(0);
  });

  it('should handle undefined previous score', () => {
    const current = createScore({ overallScore: 80, grade: 'B' });

    const change = compareDocumentationScores(undefined, current);

    expect(change.previousScore).toBe(0);
    expect(change.currentScore).toBe(80);
    expect(change.improved).toBe(true);
  });

  it('should calculate issues fixed and new issues', () => {
    const previous = createScore({
      issues: [{ tool: 'a', type: 'missing_description', severity: 'error', message: 'm' }],
    });
    const current = createScore({ issues: [] });

    const change = compareDocumentationScores(previous, current);

    expect(change.issuesFixed).toBe(1);
    expect(change.newIssues).toBe(0);
  });
});

describe('formatDocumentationScore', () => {
  it('should format score with all components', () => {
    const score: DocumentationScore = {
      overallScore: 85,
      grade: 'B',
      components: {
        descriptionCoverage: 100,
        descriptionQuality: 80,
        parameterDocumentation: 75,
        exampleCoverage: 60,
      },
      issues: [],
      suggestions: ['Add more examples'],
      toolCount: 5,
    };

    const formatted = formatDocumentationScore(score);

    expect(formatted).toContain('85/100');
    expect(formatted).toContain('(B)');
    expect(formatted).toContain('Description Coverage');
    expect(formatted).toContain('100%');
    expect(formatted).toContain('Add more examples');
  });

  it('should include issues when present', () => {
    const score: DocumentationScore = {
      overallScore: 60,
      grade: 'D',
      components: {
        descriptionCoverage: 50,
        descriptionQuality: 60,
        parameterDocumentation: 70,
        exampleCoverage: 0,
      },
      issues: [
        { tool: 'tool1', type: 'missing_description', severity: 'error', message: 'Missing' },
      ],
      suggestions: [],
      toolCount: 2,
    };

    const formatted = formatDocumentationScore(score);

    expect(formatted).toContain('Issues');
    expect(formatted).toContain('1');
  });
});

describe('formatDocumentationScoreCompact', () => {
  it('should format as compact single line', () => {
    const score: DocumentationScore = {
      overallScore: 85,
      grade: 'B',
      components: {
        descriptionCoverage: 100,
        descriptionQuality: 80,
        parameterDocumentation: 75,
        exampleCoverage: 60,
      },
      issues: [],
      suggestions: [],
      toolCount: 5,
    };

    const formatted = formatDocumentationScoreCompact(score);

    expect(formatted).toBe('Documentation: 85/100 (B)');
  });

  it('should include issue count when present', () => {
    const score: DocumentationScore = {
      overallScore: 60,
      grade: 'D',
      components: {
        descriptionCoverage: 50,
        descriptionQuality: 60,
        parameterDocumentation: 70,
        exampleCoverage: 0,
      },
      issues: [
        { tool: 'tool1', type: 'missing_description', severity: 'error', message: 'Missing' },
        { tool: 'tool2', type: 'short_description', severity: 'warning', message: 'Short' },
      ],
      suggestions: [],
      toolCount: 2,
    };

    const formatted = formatDocumentationScoreCompact(score);

    expect(formatted).toContain('2 issue(s)');
  });
});

describe('formatDocumentationScoreChange', () => {
  it('should format improvement', () => {
    const change = {
      previousScore: 60,
      currentScore: 80,
      change: 20,
      previousGrade: 'D' as DocumentationGrade,
      currentGrade: 'B' as DocumentationGrade,
      improved: true,
      degraded: false,
      issuesFixed: 2,
      newIssues: 0,
      summary: 'Documentation improved: 60 -> 80 (+20)',
    };

    const formatted = formatDocumentationScoreChange(change);

    expect(formatted).toContain('improved');
    expect(formatted).toContain('Issues fixed: 2');
  });

  it('should format degradation', () => {
    const change = {
      previousScore: 90,
      currentScore: 70,
      change: -20,
      previousGrade: 'A' as DocumentationGrade,
      currentGrade: 'C' as DocumentationGrade,
      improved: false,
      degraded: true,
      issuesFixed: 0,
      newIssues: 3,
      summary: 'Documentation degraded: 90 -> 70 (-20)',
    };

    const formatted = formatDocumentationScoreChange(change);

    expect(formatted).toContain('degraded');
    expect(formatted).toContain('New issues: 3');
  });
});

describe('toDocumentationScoreSummary', () => {
  it('should convert full score to summary', () => {
    const score: DocumentationScore = {
      overallScore: 85,
      grade: 'B',
      components: {
        descriptionCoverage: 100,
        descriptionQuality: 80,
        parameterDocumentation: 75,
        exampleCoverage: 60,
      },
      issues: [
        { tool: 'tool1', type: 'missing_description', severity: 'error', message: 'Missing' },
      ],
      suggestions: ['Add descriptions'],
      toolCount: 5,
    };

    const summary = toDocumentationScoreSummary(score);

    expect(summary.overallScore).toBe(85);
    expect(summary.grade).toBe('B');
    expect(summary.issueCount).toBe(1);
    expect(summary.toolCount).toBe(5);
  });
});

describe('getGradeIndicator', () => {
  it('should return correct indicators for each grade', () => {
    expect(getGradeIndicator('A')).toBe('✓');
    expect(getGradeIndicator('B')).toBe('✓');
    expect(getGradeIndicator('C')).toBe('~');
    expect(getGradeIndicator('D')).toBe('!');
    expect(getGradeIndicator('F')).toBe('✗');
  });
});

describe('getGradeBadgeColor', () => {
  it('should return correct colors for each grade', () => {
    expect(getGradeBadgeColor('A')).toBe('green');
    expect(getGradeBadgeColor('B')).toBe('green');
    expect(getGradeBadgeColor('C')).toBe('yellow');
    expect(getGradeBadgeColor('D')).toBe('orange');
    expect(getGradeBadgeColor('F')).toBe('red');
  });
});

describe('meetsDocumentationThreshold', () => {
  const score: DocumentationScore = {
    overallScore: 75,
    grade: 'C',
    components: {
      descriptionCoverage: 80,
      descriptionQuality: 70,
      parameterDocumentation: 75,
      exampleCoverage: 50,
    },
    issues: [],
    suggestions: [],
    toolCount: 5,
  };

  it('should return true when score meets threshold', () => {
    expect(meetsDocumentationThreshold(score, 70)).toBe(true);
    expect(meetsDocumentationThreshold(score, 75)).toBe(true);
  });

  it('should return false when score is below threshold', () => {
    expect(meetsDocumentationThreshold(score, 80)).toBe(false);
    expect(meetsDocumentationThreshold(score, 90)).toBe(false);
  });
});

describe('meetsDocumentationGrade', () => {
  const createScoreWithGrade = (grade: DocumentationGrade): DocumentationScore => ({
    overallScore: 75,
    grade,
    components: {
      descriptionCoverage: 80,
      descriptionQuality: 70,
      parameterDocumentation: 75,
      exampleCoverage: 50,
    },
    issues: [],
    suggestions: [],
    toolCount: 5,
  });

  it('should return true when grade meets minimum', () => {
    expect(meetsDocumentationGrade(createScoreWithGrade('A'), 'C')).toBe(true);
    expect(meetsDocumentationGrade(createScoreWithGrade('B'), 'B')).toBe(true);
    expect(meetsDocumentationGrade(createScoreWithGrade('C'), 'D')).toBe(true);
  });

  it('should return false when grade is below minimum', () => {
    expect(meetsDocumentationGrade(createScoreWithGrade('C'), 'A')).toBe(false);
    expect(meetsDocumentationGrade(createScoreWithGrade('D'), 'B')).toBe(false);
    expect(meetsDocumentationGrade(createScoreWithGrade('F'), 'C')).toBe(false);
  });
});

describe('integration tests', () => {
  it('should correctly score a realistic set of tools', () => {
    const tools: MCPTool[] = [
      {
        name: 'read_file',
        description: 'Reads the contents of a file at the specified path. Returns the file content as a string.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'The path to the file to read' },
            encoding: { type: 'string', description: 'Optional encoding (default: utf-8)' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Writes content to a file at the specified path. Creates the file if it does not exist.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'The path to the file to write' },
            content: { type: 'string', description: 'The content to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_files',
        description: 'Lists files in a directory',
        inputSchema: {
          type: 'object',
          properties: {
            directory: { type: 'string' }, // Missing description
          },
        },
      },
    ];

    const result = scoreDocumentation(tools);

    // Should have good coverage but not perfect due to missing param description
    expect(result.overallScore).toBeGreaterThan(60);
    expect(result.overallScore).toBeLessThan(100);
    expect(result.components.descriptionCoverage).toBe(100);
    expect(result.components.parameterDocumentation).toBeLessThan(100);
    expect(result.issues.some(i => i.tool === 'list_files')).toBe(true);
  });
});
