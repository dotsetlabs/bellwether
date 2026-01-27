import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateBenchmarkResult,
  generateBenchmarkReport,
  generateBenchmarkBadge,
  generateBadgeUrl,
  generateBadgeMarkdown,
  isBenchmarkValid,
} from '../../src/benchmark/index.js';
import type { InterviewResult } from '../../src/interview/types.js';

describe('benchmark', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateBenchmarkResult', () => {
    it('should generate a benchmark result with correct structure', () => {
      const interview = createMockInterview();
      const config = {
        serverId: 'test/server',
        version: '1.0.0',
      };

      const result = generateBenchmarkResult(interview, config);

      expect(result.serverId).toBe('test/server');
      expect(result.version).toBe('1.0.0');
      expect(result.status).toBeDefined();
      expect(result.testedAt).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.toolsTested).toBeGreaterThanOrEqual(0);
      expect(result.passRate).toBeGreaterThanOrEqual(0);
      expect(result.passRate).toBeLessThanOrEqual(100);
    });

    it('should use server version from discovery when not provided', () => {
      const interview = createMockInterview();
      interview.discovery.serverInfo.version = '2.5.0';

      const result = generateBenchmarkResult(interview, { serverId: 'test/server' });

      expect(result.version).toBe('2.5.0');
    });

    it('should calculate pass rate correctly', () => {
      const interview = createMockInterview({
        toolProfiles: [
          createMockToolProfile('tool1', [
            { error: undefined, response: { isError: false } },
            { error: undefined, response: { isError: false } },
            { error: 'Failed', response: undefined },
          ]),
        ],
      });

      const result = generateBenchmarkResult(interview, { serverId: 'test/server' });

      // 2 passed out of 3 = 67%
      expect(result.passRate).toBe(67);
      expect(result.testsPassed).toBe(2);
      expect(result.testsTotal).toBe(3);
    });

    it('should assign appropriate tier based on coverage', () => {
      // With 1 persona and passing tests, should get bronze
      const interview = createMockInterview();

      const result = generateBenchmarkResult(interview, { serverId: 'test/server' });

      expect(['bronze', 'silver', 'gold', 'platinum']).toContain(result.tier);
    });

    it('should set status to failed when pass rate is too low', () => {
      const interview = createMockInterview({
        toolProfiles: [
          createMockToolProfile('tool1', [
            { error: 'Failed', response: undefined },
            { error: 'Failed', response: undefined },
            { error: 'Failed', response: undefined },
          ]),
        ],
      });

      const result = generateBenchmarkResult(interview, { serverId: 'test/server' });

      expect(result.status).toBe('failed');
      expect(result.tier).toBeUndefined();
    });
  });

  describe('generateBenchmarkReport', () => {
    it('should generate a complete benchmark report', () => {
      const interview = createMockInterview();

      const report = generateBenchmarkReport(interview, { serverId: 'test/server' });

      expect(report.result).toBeDefined();
      expect(report.serverInfo).toBeDefined();
      expect(report.tools).toBeInstanceOf(Array);
      expect(report.environment).toBeDefined();
    });

    it('should include tool-level details', () => {
      const interview = createMockInterview({
        toolProfiles: [
          createMockToolProfile('tool1', [
            { error: undefined, response: { isError: false } },
            { error: 'Error!', response: undefined },
          ]),
        ],
      });

      const report = generateBenchmarkReport(interview, { serverId: 'test/server' });

      expect(report.tools.length).toBe(1);
      expect(report.tools[0].name).toBe('tool1');
      expect(report.tools[0].testsRun).toBe(2);
      expect(report.tools[0].testsPassed).toBe(1);
      expect(report.tools[0].errors).toContain('Error!');
    });
  });

  describe('generateBenchmarkBadge', () => {
    it('should generate badge for passed benchmark', () => {
      const result = createMockBenchmarkResult({ status: 'passed', tier: 'gold' });

      const badge = generateBenchmarkBadge(result);

      expect(badge.label).toBe('bellwether');
      expect(badge.message).toBe('gold');
      expect(badge.testedAt).toBeDefined();
    });

    it('should generate badge for failed benchmark', () => {
      const result = createMockBenchmarkResult({ status: 'failed' });

      const badge = generateBenchmarkBadge(result);

      expect(badge.message).toBe('failed');
      expect(badge.color).toBe('red');
    });

    it('should generate badge for not tested', () => {
      const result = createMockBenchmarkResult({ status: 'not_tested' });

      const badge = generateBenchmarkBadge(result);

      expect(badge.message).toBe('not tested');
      expect(badge.color).toBe('lightgrey');
    });
  });

  describe('generateBadgeUrl', () => {
    it('should generate valid shields.io URL', () => {
      const result = createMockBenchmarkResult({ status: 'passed', tier: 'silver' });

      const url = generateBadgeUrl(result);

      expect(url).toContain('https://img.shields.io/badge/');
      expect(url).toContain('bellwether');
    });
  });

  describe('generateBadgeMarkdown', () => {
    it('should generate markdown without link when no report URL', () => {
      const result = createMockBenchmarkResult({ status: 'passed', tier: 'bronze' });

      const markdown = generateBadgeMarkdown(result);

      expect(markdown).toMatch(/^!\[.+\]\(.+\)$/);
    });

    it('should generate markdown with link when report URL provided', () => {
      const result = createMockBenchmarkResult({ status: 'passed', tier: 'bronze' });

      const markdown = generateBadgeMarkdown(result, 'https://example.com/report');

      expect(markdown).toContain('[![');
      expect(markdown).toContain('](https://example.com/report)');
    });
  });

  describe('isBenchmarkValid', () => {
    it('should return true for passed benchmark within expiry', () => {
      const result = createMockBenchmarkResult({
        status: 'passed',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(isBenchmarkValid(result)).toBe(true);
    });

    it('should return false for failed benchmark', () => {
      const result = createMockBenchmarkResult({
        status: 'failed',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(isBenchmarkValid(result)).toBe(false);
    });

    it('should return false for expired benchmark', () => {
      const result = createMockBenchmarkResult({
        status: 'passed',
        expiresAt: new Date(Date.now() - 1).toISOString(),
      });

      expect(isBenchmarkValid(result)).toBe(false);
    });
  });
});

// Helper functions to create mock data

function createMockInterview(overrides: Partial<InterviewResult> = {}): InterviewResult {
  return {
    discovery: {
      serverInfo: {
        name: 'test-server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
      },
      capabilities: ['tools'],
      tools: [],
      prompts: [],
      resources: [],
    },
    toolProfiles: overrides.toolProfiles ?? [
      createMockToolProfile('testTool', [
        { error: undefined, response: { isError: false } },
      ]),
    ],
    promptProfiles: overrides.promptProfiles,
    resourceProfiles: overrides.resourceProfiles,
    scenarioResults: overrides.scenarioResults,
    summary: 'Test interview',
    metadata: {
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 1000,
      model: 'test-model',
      toolCount: 1,
      questionCount: 1,
      personas: [{ name: 'technical_writer', id: 'technical_writer' }],
    },
    ...overrides,
  };
}

function createMockToolProfile(
  name: string,
  interactions: Array<{ error?: string; response?: { isError: boolean } }>
): any {
  return {
    name,
    description: `Description for ${name}`,
    inputSchema: { type: 'object' },
    interactions: interactions.map((i, idx) => ({
      question: `Question ${idx + 1}`,
      parameters: {},
      response: i.response,
      error: i.error,
      durationMs: 100,
    })),
  };
}

function createMockBenchmarkResult(
  overrides: Partial<{
    status: string;
    tier: string;
    expiresAt: string;
  }> = {}
): any {
  return {
    serverId: 'test/server',
    version: '1.0.0',
    status: overrides.status ?? 'passed',
    tier: overrides.tier ?? 'bronze',
    testedAt: new Date().toISOString(),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    toolsTested: 5,
    testsPassed: 4,
    testsTotal: 5,
    passRate: 80,
    reportHash: 'abc123def456',
    bellwetherVersion: '1.0.0',
  };
}
