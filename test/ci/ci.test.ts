/**
 * Tests for CI/CD integration utilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EXIT_CODES,
  detectCIEnvironment,
  getCIEnvironment,
  evaluateInterviewResult,
  evaluateDiff,
  formatCIOutput,
} from '../../src/ci/index.js';
import type { InterviewResult, ToolProfile } from '../../src/interview/types.js';
import type { BehavioralDiff } from '../../src/baseline/types.js';

// Helper to create mock interview result
function createMockInterviewResult(options: {
  serverName?: string;
  tools?: Partial<ToolProfile>[];
  workflowResults?: any[];
} = {}): InterviewResult {
  const tools = options.tools || [
    {
      name: 'test_tool',
      description: 'A test tool',
      interactions: [],
      behavioralNotes: [],
      limitations: [],
      securityNotes: [],
    },
  ];

  return {
    discovery: {
      serverInfo: {
        name: options.serverName || 'test-server',
        version: '1.0.0',
      },
      protocolVersion: '0.1.0',
      capabilities: {
        tools: true,
        prompts: false,
        resources: false,
        logging: false,
      },
      tools: tools.map((t) => ({
        name: t.name || 'test_tool',
        description: t.description || 'A test tool',
        inputSchema: { type: 'object', properties: {} },
      })),
      prompts: [],
      resources: [],
    },
    toolProfiles: tools as ToolProfile[],
    workflowResults: options.workflowResults,
    summary: 'Test interview completed',
    limitations: [],
    recommendations: [],
    metadata: {
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 1000,
      toolCallCount: 1,
      errorCount: 0,
      model: 'test-model',
    },
  };
}

// Helper to create mock diff
function createMockDiff(overrides: Partial<BehavioralDiff> = {}): BehavioralDiff {
  return {
    toolsAdded: [],
    toolsRemoved: [],
    toolsModified: [],
    behaviorChanges: [],
    severity: 'none',
    breakingCount: 0,
    warningCount: 0,
    infoCount: 0,
    summary: 'No changes detected.',
    ...overrides,
  };
}

describe('CI Module', () => {
  describe('EXIT_CODES', () => {
    it('should have correct exit code values', () => {
      expect(EXIT_CODES.SUCCESS).toBe(0);
      expect(EXIT_CODES.FAILURE).toBe(1);
      expect(EXIT_CODES.ERROR).toBe(2);
    });
  });

  describe('detectCIEnvironment', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      // Restore environment
      process.env = { ...originalEnv };
    });

    it('should detect CI environment variable', () => {
      process.env.CI = 'true';
      expect(detectCIEnvironment()).toBe(true);
    });

    it('should detect GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(detectCIEnvironment()).toBe(true);
    });

    it('should detect GitLab CI', () => {
      process.env.GITLAB_CI = 'true';
      expect(detectCIEnvironment()).toBe(true);
    });

    it('should return false when not in CI', () => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_URL;
      delete process.env.TRAVIS;
      delete process.env.BUILDKITE;
      delete process.env.AZURE_PIPELINES;
      delete process.env.TEAMCITY_VERSION;
      delete process.env.CONTINUOUS_INTEGRATION;

      expect(detectCIEnvironment()).toBe(false);
    });
  });

  describe('getCIEnvironment', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should detect GitHub Actions environment', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_RUN_ID = '12345';
      process.env.GITHUB_REF_NAME = 'main';
      process.env.GITHUB_SHA = 'abc123';

      const env = getCIEnvironment();

      expect(env.name).toBe('GitHub Actions');
      expect(env.detected).toBe(true);
      expect(env.runId).toBe('12345');
      expect(env.branch).toBe('main');
      expect(env.commit).toBe('abc123');
    });

    it('should detect GitLab CI environment', () => {
      delete process.env.GITHUB_ACTIONS;
      process.env.GITLAB_CI = 'true';
      process.env.CI_JOB_ID = '67890';
      process.env.CI_COMMIT_REF_NAME = 'develop';
      process.env.CI_COMMIT_SHA = 'def456';

      const env = getCIEnvironment();

      expect(env.name).toBe('GitLab CI');
      expect(env.detected).toBe(true);
      expect(env.runId).toBe('67890');
      expect(env.branch).toBe('develop');
      expect(env.commit).toBe('def456');
    });

    it('should return local when not in CI', () => {
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_URL;
      delete process.env.TRAVIS;

      const env = getCIEnvironment();

      expect(env.name).toBe('Local');
      expect(env.detected).toBe(false);
    });
  });

  describe('evaluateInterviewResult', () => {
    it('should pass for clean interview', () => {
      const result = createMockInterviewResult();
      const check = evaluateInterviewResult(result);

      expect(check.passed).toBe(true);
      expect(check.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('should extract security findings', () => {
      const result = createMockInterviewResult({
        tools: [{
          name: 'risky_tool',
          description: 'A risky tool',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: ['This tool has a security vulnerability'],
        }],
      });

      const check = evaluateInterviewResult(result);

      expect(check.securityFindingsCount).toBe(1);
      expect(check.findings.some((f) => f.category === 'security')).toBe(true);
    });

    it('should fail when failOnSecurity is set and security issues exist', () => {
      const result = createMockInterviewResult({
        tools: [{
          name: 'risky_tool',
          description: 'A risky tool',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: ['Security risk identified'],
        }],
      });

      const check = evaluateInterviewResult(result, { failOnSecurity: true });

      expect(check.passed).toBe(false);
      expect(check.exitCode).toBe(EXIT_CODES.FAILURE);
    });

    it('should extract workflow failures', () => {
      const result = createMockInterviewResult({
        workflowResults: [
          {
            workflow: { id: 'wf1', name: 'Test Workflow', description: 'Test', steps: [], expectedOutcome: 'success' },
            steps: [],
            success: false,
            failureReason: 'Step 2 failed',
          },
        ],
      });

      const check = evaluateInterviewResult(result);

      expect(check.findings.some((f) => f.category === 'reliability' && f.title.includes('Workflow failed'))).toBe(true);
    });

    it('should fail based on severity threshold', () => {
      const result = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: ['Critical security vulnerability'],
        }],
      });

      const check = evaluateInterviewResult(result, { failOnSeverity: 'warning' });

      expect(check.passed).toBe(false);
      expect(check.exitCode).toBe(EXIT_CODES.FAILURE);
    });

    it('should generate assertions from baseline', () => {
      const result = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test',
          interactions: [],
          behavioralNotes: ['Tool works correctly'],
          limitations: ['Has limitation'],
          securityNotes: ['Security note'],
        }],
      });

      const check = evaluateInterviewResult(result);

      expect(check.assertions.length).toBeGreaterThan(0);
    });
  });

  describe('evaluateDiff', () => {
    it('should pass for no changes', () => {
      const diff = createMockDiff();
      const check = evaluateDiff(diff);

      expect(check.passed).toBe(true);
      expect(check.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('should fail for breaking changes', () => {
      const diff = createMockDiff({
        toolsRemoved: ['removed_tool'],
        severity: 'breaking',
        breakingCount: 1,
      });

      const check = evaluateDiff(diff);

      expect(check.passed).toBe(false);
      expect(check.exitCode).toBe(EXIT_CODES.FAILURE);
    });

    it('should fail when failOnDrift is set and drift exists', () => {
      const diff = createMockDiff({
        toolsAdded: ['new_tool'],
        severity: 'info',
        infoCount: 1,
      });

      const check = evaluateDiff(diff, { failOnDrift: true });

      expect(check.passed).toBe(false);
      expect(check.exitCode).toBe(EXIT_CODES.FAILURE);
    });

    it('should convert removed tools to critical findings', () => {
      const diff = createMockDiff({
        toolsRemoved: ['removed_tool'],
        severity: 'breaking',
        breakingCount: 1,
      });

      const check = evaluateDiff(diff);

      const removedFinding = check.findings.find((f) =>
        f.category === 'drift' && f.severity === 'critical'
      );
      expect(removedFinding).toBeDefined();
      expect(removedFinding?.title).toContain('removed_tool');
    });

    it('should convert behavior changes to findings', () => {
      const diff = createMockDiff({
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'schema',
            before: 'old',
            after: 'new',
            significance: 'high',
            description: 'Schema changed',
          },
        ],
        severity: 'breaking',
        breakingCount: 1,
      });

      const check = evaluateDiff(diff);

      const schemaFinding = check.findings.find((f) =>
        f.title.includes('schema') && f.severity === 'high'
      );
      expect(schemaFinding).toBeDefined();
    });

    it('should detect security-related changes', () => {
      const diff = createMockDiff({
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'security',
            before: '',
            after: 'new security note',
            significance: 'high',
            description: 'Security change',
          },
        ],
        severity: 'breaking',
        breakingCount: 1,
      });

      const check = evaluateDiff(diff, { failOnSecurity: true });

      expect(check.passed).toBe(false);
      expect(check.securityFindingsCount).toBe(1);
    });
  });

  describe('formatCIOutput', () => {
    it('should format passing result', () => {
      const result = createMockInterviewResult();
      const check = evaluateInterviewResult(result);
      const output = formatCIOutput(check, { noColors: true });

      expect(output).toContain('PASSED');
      expect(output).toContain('Exit code: 0');
    });

    it('should format failing result', () => {
      const diff = createMockDiff({
        toolsRemoved: ['removed_tool'],
        severity: 'breaking',
        breakingCount: 1,
      });
      const check = evaluateDiff(diff);
      const output = formatCIOutput(check, { noColors: true });

      expect(output).toContain('FAILED');
      expect(output).toContain('Exit code: 1');
    });

    it('should group findings by severity', () => {
      const result = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test',
          interactions: [],
          behavioralNotes: [],
          limitations: ['Low severity limitation'],
          securityNotes: ['Security risk identified'],  // Contains 'risk' to be classified as high
        }],
      });

      const check = evaluateInterviewResult(result);
      const output = formatCIOutput(check, { noColors: true });

      expect(output).toContain('High');
      expect(output).toContain('Low/Info');
    });

    it('should respect noColors option', () => {
      const result = createMockInterviewResult();
      const check = evaluateInterviewResult(result);

      const colorOutput = formatCIOutput(check, { noColors: false, isCI: false });
      const plainOutput = formatCIOutput(check, { noColors: true });

      // Color output should have ANSI codes
      expect(colorOutput).toContain('\x1b[');
      // Plain output should not
      expect(plainOutput).not.toContain('\x1b[');
    });

    it('should not include colors when isCI is true', () => {
      const result = createMockInterviewResult();
      const check = evaluateInterviewResult(result);
      const output = formatCIOutput(check, { isCI: true });

      expect(output).not.toContain('\x1b[');
    });
  });
});
