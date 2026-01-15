import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateVerificationResult,
  generateVerificationReport,
  generateVerificationBadge,
  generateBadgeUrl,
  generateBadgeMarkdown,
  isVerificationValid,
} from '../../src/verification/verifier.js';
import type { InterviewResult } from '../../src/interview/types.js';
import type { VerificationConfig, VerificationResult } from '../../src/verification/types.js';
import { VERSION } from '../../src/version.js';

// Mock the logger
vi.mock('../../src/logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Verification Module', () => {
  // Helper to create a mock interview result
  function createMockInterview(options: {
    toolCount?: number;
    passRate?: number;
    personas?: Array<{ id: string; name: string }>;
    hasPrompts?: boolean;
    hasResources?: boolean;
    hasScenarios?: boolean;
  } = {}): InterviewResult {
    const {
      toolCount = 3,
      passRate = 100,
      personas = [{ id: 'friendly', name: 'Friendly User' }],
      hasPrompts = false,
      hasResources = false,
      hasScenarios = false,
    } = options;

    const interactionsPerTool = 10;
    const totalInteractions = toolCount * interactionsPerTool;
    const passedPerTool = Math.floor(interactionsPerTool * (passRate / 100));

    const toolProfiles = Array.from({ length: toolCount }, (_, i) => ({
      name: `tool-${i + 1}`,
      description: `Test tool ${i + 1}`,
      inputSchema: { type: 'object' as const, properties: {} },
      interactions: Array.from({ length: interactionsPerTool }, (_, j) => {
        const isPassing = j < passedPerTool;
        return {
          input: { testInput: j },
          response: isPassing
            ? { content: [{ type: 'text' as const, text: 'success' }], isError: false }
            : { content: [{ type: 'text' as const, text: 'error' }], isError: true },
          error: isPassing ? null : 'Test error',
          timestamp: new Date(),
          persona: personas[0],
        };
      }),
      behavioralNotes: ['Note 1'],
      limitations: [],
      securityNotes: [],
    }));

    const result: InterviewResult = {
      discovery: {
        serverInfo: { name: 'test-server', version: '1.0.0' },
        tools: toolProfiles.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        prompts: [],
        resources: [],
      },
      toolProfiles,
      metadata: {
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000,
        totalCalls: totalInteractions,
        personas,
      },
      summary: 'Test interview summary',
    };

    if (hasPrompts) {
      result.promptProfiles = [
        {
          name: 'test-prompt',
          description: 'Test prompt',
          interactions: [
            { input: {}, response: 'response', error: null, timestamp: new Date() },
          ],
        },
      ];
    }

    if (hasResources) {
      result.resourceProfiles = [
        {
          uri: 'file:///test.txt',
          name: 'test.txt',
          description: 'Test resource',
          mimeType: 'text/plain',
          interactions: [
            { input: {}, response: 'content', error: null, timestamp: new Date() },
          ],
        },
      ];
    }

    if (hasScenarios) {
      result.scenarioResults = [
        { scenarioId: 'scenario-1', name: 'Test Scenario', passed: true, steps: [] },
        { scenarioId: 'scenario-2', name: 'Failing Scenario', passed: false, steps: [] },
      ];
    }

    return result;
  }

  describe('generateVerificationResult', () => {
    it('should generate a verification result', () => {
      const interview = createMockInterview();
      const config: VerificationConfig = {
        serverId: 'test/server',
        version: '1.0.0',
      };

      const result = generateVerificationResult(interview, config);

      expect(result.serverId).toBe('test/server');
      expect(result.version).toBe('1.0.0');
      expect(result.bellwetherVersion).toBe(VERSION);
      expect(result.reportHash).toBeDefined();
      expect(result.verifiedAt).toBeDefined();
      expect(result.expiresAt).toBeDefined();
    });

    it('should set expiration to 90 days from now', () => {
      const interview = createMockInterview();
      const config: VerificationConfig = { serverId: 'test/server' };

      const result = generateVerificationResult(interview, config);

      const verifiedAt = new Date(result.verifiedAt);
      const expiresAt = new Date(result.expiresAt);
      const diffDays = (expiresAt.getTime() - verifiedAt.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeCloseTo(90, 0);
    });

    it('should use server version from interview if not provided in config', () => {
      const interview = createMockInterview();
      const config: VerificationConfig = { serverId: 'test/server' };

      const result = generateVerificationResult(interview, config);

      expect(result.version).toBe('1.0.0');
    });

    it('should calculate pass rate correctly', () => {
      const interview = createMockInterview({ passRate: 80 });
      const config: VerificationConfig = { serverId: 'test/server' };

      const result = generateVerificationResult(interview, config);

      expect(result.passRate).toBeGreaterThanOrEqual(0);
      expect(result.passRate).toBeLessThanOrEqual(100);
    });

    it('should count tools verified', () => {
      const interview = createMockInterview({ toolCount: 5 });
      const config: VerificationConfig = { serverId: 'test/server' };

      const result = generateVerificationResult(interview, config);

      expect(result.toolsVerified).toBe(5);
    });
  });

  describe('verification tiers', () => {
    it('should assign bronze tier for basic testing', () => {
      const interview = createMockInterview({
        personas: [{ id: 'friendly', name: 'Friendly User' }],
        passRate: 70,
      });
      const config: VerificationConfig = { serverId: 'test/server' };

      const result = generateVerificationResult(interview, config);

      expect(result.tier).toBe('bronze');
    });

    it('should assign silver tier for two personas with good pass rate', () => {
      const interview = createMockInterview({
        personas: [
          { id: 'technical_writer', name: 'Technical Writer' },
          { id: 'qa_engineer', name: 'QA Engineer' },
        ],
        passRate: 80,
      });
      const config: VerificationConfig = { serverId: 'test/server' };

      const result = generateVerificationResult(interview, config);

      expect(result.tier).toBe('silver');
    });

    it('should assign gold tier for three personas with prompts/resources', () => {
      const interview = createMockInterview({
        toolCount: 3,
        personas: [
          { id: 'technical_writer', name: 'Technical Writer' },
          { id: 'qa_engineer', name: 'QA Engineer' },
          { id: 'novice_user', name: 'Novice User' },
        ],
        passRate: 90, // Need >= 85%
        hasPrompts: true, // Need prompts or resources
      });
      const config: VerificationConfig = { serverId: 'test/server' };

      const result = generateVerificationResult(interview, config);

      // Gold requires: personaCount >= 3 && passRate >= 85 && (hasPrompts || hasResources)
      expect(result.tier).toBe('gold');
    });

    it('should assign platinum tier for security testing with high pass rate', () => {
      const interview = createMockInterview({
        toolCount: 3,
        personas: [
          { id: 'technical_writer', name: 'Technical Writer' },
          { id: 'qa_engineer', name: 'QA Engineer' },
          { id: 'novice_user', name: 'Novice User' },
          { id: 'security_tester', name: 'Security Tester' }, // Name must include 'security'
        ],
        passRate: 95, // Need >= 90%
      });
      const config: VerificationConfig = { serverId: 'test/server' };

      const result = generateVerificationResult(interview, config);

      // Platinum requires: hasSecurityTesting && personaCount >= 4 && passRate >= 90
      expect(result.tier).toBe('platinum');
    });
  });

  describe('verification status', () => {
    it('should set status to verified when pass rate is sufficient', () => {
      const interview = createMockInterview({ passRate: 80 });
      const config: VerificationConfig = { serverId: 'test/server' };

      const result = generateVerificationResult(interview, config);

      expect(result.status).toBe('verified');
    });

    it('should set status to failed when pass rate is below 50%', () => {
      // Create interview with very low pass rate (all interactions fail)
      const interview = createMockInterview({
        toolCount: 3,
        passRate: 30, // Well below 50% threshold
      });
      const config: VerificationConfig = { serverId: 'test/server' };

      const result = generateVerificationResult(interview, config);

      // When pass rate < 50%, status should be 'failed'
      expect(result.passRate).toBeLessThan(50);
      expect(result.status).toBe('failed');
      expect(result.tier).toBeUndefined();
    });

    it('should set status to failed when target tier is not met', () => {
      const interview = createMockInterview({
        personas: [{ id: 'friendly', name: 'Friendly User' }],
        passRate: 70,
      });
      const config: VerificationConfig = {
        serverId: 'test/server',
        targetTier: 'gold',
      };

      const result = generateVerificationResult(interview, config);

      expect(result.status).toBe('failed');
    });
  });

  describe('generateVerificationReport', () => {
    it('should include verification result', () => {
      const interview = createMockInterview();
      const config: VerificationConfig = { serverId: 'test/server' };

      const report = generateVerificationReport(interview, config);

      expect(report.result).toBeDefined();
      expect(report.result.serverId).toBe('test/server');
    });

    it('should include server info', () => {
      const interview = createMockInterview();
      const config: VerificationConfig = { serverId: 'test/server' };

      const report = generateVerificationReport(interview, config);

      expect(report.serverInfo).toBeDefined();
      expect(report.serverInfo.name).toBe('test-server');
      expect(report.serverInfo.version).toBe('1.0.0');
    });

    it('should include tool verification details', () => {
      const interview = createMockInterview({ toolCount: 2 });
      const config: VerificationConfig = { serverId: 'test/server' };

      const report = generateVerificationReport(interview, config);

      expect(report.tools).toHaveLength(2);
      expect(report.tools[0].name).toBe('tool-1');
      expect(report.tools[0].testsRun).toBeGreaterThan(0);
    });

    it('should include environment info', () => {
      const interview = createMockInterview();
      const config: VerificationConfig = { serverId: 'test/server' };

      const report = generateVerificationReport(interview, config);

      expect(report.environment).toBeDefined();
      expect(report.environment.os).toBe(process.platform);
      expect(report.environment.nodeVersion).toBe(process.version);
      expect(report.environment.bellwetherVersion).toBe(VERSION);
    });

    it('should include prompt details when available', () => {
      const interview = createMockInterview({ hasPrompts: true });
      const config: VerificationConfig = { serverId: 'test/server' };

      const report = generateVerificationReport(interview, config);

      expect(report.prompts).toBeDefined();
      expect(report.prompts).toHaveLength(1);
    });

    it('should include resource details when available', () => {
      const interview = createMockInterview({ hasResources: true });
      const config: VerificationConfig = { serverId: 'test/server' };

      const report = generateVerificationReport(interview, config);

      expect(report.resources).toBeDefined();
      expect(report.resources).toHaveLength(1);
      expect(report.resources![0].uri).toBe('file:///test.txt');
    });
  });

  describe('generateVerificationBadge', () => {
    it('should generate badge for verified status', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'verified',
        tier: 'silver',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        toolsVerified: 3,
        testsPassed: 10,
        testsTotal: 10,
        passRate: 100,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      const badge = generateVerificationBadge(result);

      expect(badge.label).toBe('bellwether');
      expect(badge.message).toBe('silver');
      expect(badge.color).toBe('C0C0C0');
    });

    it('should generate badge for failed status', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'failed',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        toolsVerified: 3,
        testsPassed: 3,
        testsTotal: 10,
        passRate: 30,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      const badge = generateVerificationBadge(result);

      expect(badge.message).toBe('failed');
      expect(badge.color).toBe('red');
    });

    it('should generate badge for pending status', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'pending',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        toolsVerified: 0,
        testsPassed: 0,
        testsTotal: 0,
        passRate: 0,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      const badge = generateVerificationBadge(result);

      expect(badge.message).toBe('pending');
      expect(badge.color).toBe('yellow');
    });

    it('should generate badge for expired status', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'expired',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        toolsVerified: 3,
        testsPassed: 10,
        testsTotal: 10,
        passRate: 100,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      const badge = generateVerificationBadge(result);

      expect(badge.message).toBe('expired');
      expect(badge.color).toBe('orange');
    });

    it('should include tier-specific icons', () => {
      const tiers = ['bronze', 'silver', 'gold', 'platinum'] as const;
      const expectedIcons = ['🥉', '🥈', '🥇', '💎'];

      tiers.forEach((tier, i) => {
        const result: VerificationResult = {
          serverId: 'test',
          version: '1.0.0',
          status: 'verified',
          tier,
          verifiedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          toolsVerified: 3,
          testsPassed: 10,
          testsTotal: 10,
          passRate: 100,
          reportHash: 'abc',
          bellwetherVersion: '0.2.0',
        };

        const badge = generateVerificationBadge(result);
        expect(badge.icon).toBe(expectedIcons[i]);
      });
    });
  });

  describe('generateBadgeUrl', () => {
    it('should generate shields.io URL', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'verified',
        tier: 'gold',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        toolsVerified: 3,
        testsPassed: 10,
        testsTotal: 10,
        passRate: 100,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      const url = generateBadgeUrl(result);

      expect(url).toContain('https://img.shields.io/badge/');
      expect(url).toContain('bellwether');
      expect(url).toContain('gold');
    });

    it('should URL-encode special characters', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'verified',
        tier: 'silver',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        toolsVerified: 3,
        testsPassed: 10,
        testsTotal: 10,
        passRate: 100,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      const url = generateBadgeUrl(result);

      // URL should be properly encoded
      expect(url).not.toContain(' ');
      expect(url).toMatch(/^https:\/\/img\.shields\.io\/badge\//);
    });
  });

  describe('generateBadgeMarkdown', () => {
    it('should generate markdown without report URL', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'verified',
        tier: 'silver',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        toolsVerified: 3,
        testsPassed: 10,
        testsTotal: 10,
        passRate: 100,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      const markdown = generateBadgeMarkdown(result);

      expect(markdown).toMatch(/^!\[.*\]\(.*\)$/);
      expect(markdown).toContain('Bellwether');
      expect(markdown).toContain('shields.io');
    });

    it('should generate markdown with report URL as link', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'verified',
        tier: 'gold',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        toolsVerified: 3,
        testsPassed: 10,
        testsTotal: 10,
        passRate: 100,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      const markdown = generateBadgeMarkdown(result, 'https://example.com/report');

      expect(markdown).toMatch(/^\[!\[.*\]\(.*\)\]\(.*\)$/);
      expect(markdown).toContain('https://example.com/report');
    });
  });

  describe('isVerificationValid', () => {
    it('should return true for verified result that has not expired', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'verified',
        tier: 'silver',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        toolsVerified: 3,
        testsPassed: 10,
        testsTotal: 10,
        passRate: 100,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      expect(isVerificationValid(result)).toBe(true);
    });

    it('should return false for verified result that has expired', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'verified',
        tier: 'silver',
        verifiedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        toolsVerified: 3,
        testsPassed: 10,
        testsTotal: 10,
        passRate: 100,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      expect(isVerificationValid(result)).toBe(false);
    });

    it('should return false for failed status', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'failed',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        toolsVerified: 3,
        testsPassed: 3,
        testsTotal: 10,
        passRate: 30,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      expect(isVerificationValid(result)).toBe(false);
    });

    it('should return false for pending status', () => {
      const result: VerificationResult = {
        serverId: 'test/server',
        version: '1.0.0',
        status: 'pending',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        toolsVerified: 0,
        testsPassed: 0,
        testsTotal: 0,
        passRate: 0,
        reportHash: 'abc123',
        bellwetherVersion: '0.2.0',
      };

      expect(isVerificationValid(result)).toBe(false);
    });
  });
});
