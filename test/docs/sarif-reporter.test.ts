/**
 * Tests for SARIF reporter.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSarifReport,
  generateSarifFromDiff,
  generateSarifFromFindings,
} from '../../src/docs/sarif-reporter.js';
import type { InterviewResult, ToolProfile } from '../../src/interview/types.js';
import type { BehavioralDiff, CIFinding } from '../../src/baseline/types.js';

// Helper to create mock interview result
function createMockInterviewResult(options: {
  tools?: Partial<ToolProfile>[];
  workflowResults?: any[];
} = {}): InterviewResult {
  const tools = options.tools || [];

  return {
    discovery: {
      serverInfo: { name: 'test-server', version: '1.0.0' },
      protocolVersion: '0.1.0',
      capabilities: { tools: true, prompts: false, resources: false, logging: false },
      tools: tools.map((t) => ({
        name: t.name || 'test_tool',
        description: t.description || '',
        inputSchema: { type: 'object', properties: {} },
      })),
      prompts: [],
      resources: [],
    },
    toolProfiles: tools as ToolProfile[],
    workflowResults: options.workflowResults,
    summary: 'Test',
    limitations: [],
    recommendations: [],
    metadata: {
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 1000,
      toolCallCount: 0,
      errorCount: 0,
      model: 'test-model',
    },
  };
}

describe('SARIF Reporter', () => {
  describe('generateSarifReport', () => {
    it('should produce valid SARIF JSON', () => {
      const result = createMockInterviewResult();
      const sarif = generateSarifReport(result);
      const parsed = JSON.parse(sarif);

      expect(parsed.$schema).toContain('sarif');
      expect(parsed.version).toBe('2.1.0');
      expect(parsed.runs).toHaveLength(1);
    });

    it('should include tool driver info', () => {
      const result = createMockInterviewResult();
      const sarif = generateSarifReport(result);
      const parsed = JSON.parse(sarif);

      const driver = parsed.runs[0].tool.driver;
      expect(driver.name).toBe('Inquest');
      expect(driver.informationUri).toContain('inquest');
      expect(driver.rules.length).toBeGreaterThan(0);
    });

    it('should include security findings', () => {
      const result = createMockInterviewResult({
        tools: [{
          name: 'risky_tool',
          description: 'Risky',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: ['Security vulnerability found'],
        }],
      });

      const sarif = generateSarifReport(result);
      const parsed = JSON.parse(sarif);

      const securityResult = parsed.runs[0].results.find(
        (r: any) => r.ruleId === 'INQUEST-001'
      );
      expect(securityResult).toBeDefined();
      expect(securityResult.level).toBe('warning');
      expect(securityResult.message.text).toContain('Security vulnerability');
    });

    it('should include limitation findings', () => {
      const result = createMockInterviewResult({
        tools: [{
          name: 'limited_tool',
          description: 'Limited',
          interactions: [],
          behavioralNotes: [],
          limitations: ['Cannot handle large inputs'],
          securityNotes: [],
        }],
      });

      const sarif = generateSarifReport(result);
      const parsed = JSON.parse(sarif);

      const limitationResult = parsed.runs[0].results.find(
        (r: any) => r.ruleId === 'INQUEST-002'
      );
      expect(limitationResult).toBeDefined();
      expect(limitationResult.level).toBe('note');
    });

    it('should include workflow failures', () => {
      const result = createMockInterviewResult({
        workflowResults: [{
          workflow: { id: 'wf1', name: 'Test Workflow', description: '', steps: [], expectedOutcome: '' },
          steps: [],
          success: false,
          failureReason: 'Step failed',
        }],
      });

      const sarif = generateSarifReport(result);
      const parsed = JSON.parse(sarif);

      const workflowResult = parsed.runs[0].results.find(
        (r: any) => r.ruleId === 'INQUEST-007'
      );
      expect(workflowResult).toBeDefined();
      expect(workflowResult.level).toBe('error');
    });

    it('should include invocation info', () => {
      const result = createMockInterviewResult();
      const sarif = generateSarifReport(result);
      const parsed = JSON.parse(sarif);

      expect(parsed.runs[0].invocations).toHaveLength(1);
      expect(parsed.runs[0].invocations[0].executionSuccessful).toBe(true);
    });
  });

  describe('generateSarifFromDiff', () => {
    it('should produce valid SARIF JSON', () => {
      const diff: BehavioralDiff = {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
        behaviorChanges: [],
        severity: 'none',
        breakingCount: 0,
        warningCount: 0,
        infoCount: 0,
        summary: 'No changes',
      };

      const sarif = generateSarifFromDiff(diff);
      const parsed = JSON.parse(sarif);

      expect(parsed.$schema).toContain('sarif');
      expect(parsed.version).toBe('2.1.0');
    });

    it('should include removed tools as errors', () => {
      const diff: BehavioralDiff = {
        toolsAdded: [],
        toolsRemoved: ['removed_tool'],
        toolsModified: [],
        behaviorChanges: [],
        severity: 'breaking',
        breakingCount: 1,
        warningCount: 0,
        infoCount: 0,
        summary: 'Tool removed',
      };

      const sarif = generateSarifFromDiff(diff);
      const parsed = JSON.parse(sarif);

      const removedResult = parsed.runs[0].results.find(
        (r: any) => r.ruleId === 'INQUEST-003'
      );
      expect(removedResult).toBeDefined();
      expect(removedResult.level).toBe('error');
      expect(removedResult.message.text).toContain('removed_tool');
    });

    it('should include added tools as notes', () => {
      const diff: BehavioralDiff = {
        toolsAdded: ['new_tool'],
        toolsRemoved: [],
        toolsModified: [],
        behaviorChanges: [],
        severity: 'info',
        breakingCount: 0,
        warningCount: 0,
        infoCount: 1,
        summary: 'Tool added',
      };

      const sarif = generateSarifFromDiff(diff);
      const parsed = JSON.parse(sarif);

      const addedResult = parsed.runs[0].results.find(
        (r: any) => r.ruleId === 'INQUEST-004'
      );
      expect(addedResult).toBeDefined();
      expect(addedResult.level).toBe('note');
    });

    it('should include schema changes', () => {
      const diff: BehavioralDiff = {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [{
          tool: 'modified_tool',
          changes: [],
          schemaChanged: true,
          descriptionChanged: false,
        }],
        behaviorChanges: [],
        severity: 'warning',
        breakingCount: 0,
        warningCount: 1,
        infoCount: 0,
        summary: 'Schema changed',
      };

      const sarif = generateSarifFromDiff(diff);
      const parsed = JSON.parse(sarif);

      const schemaResult = parsed.runs[0].results.find(
        (r: any) => r.ruleId === 'INQUEST-005'
      );
      expect(schemaResult).toBeDefined();
      expect(schemaResult.level).toBe('warning');
    });

    it('should include behavior changes with appropriate levels', () => {
      const diff: BehavioralDiff = {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [{
          tool: 'changed_tool',
          changes: [
            {
              tool: 'changed_tool',
              aspect: 'security',
              before: '',
              after: '',
              significance: 'high',
              description: 'High significance change',
            },
            {
              tool: 'changed_tool',
              aspect: 'description',
              before: '',
              after: '',
              significance: 'low',
              description: 'Low significance change',
            },
          ],
          schemaChanged: false,
          descriptionChanged: true,
        }],
        behaviorChanges: [
          {
            tool: 'changed_tool',
            aspect: 'security',
            before: '',
            after: '',
            significance: 'high',
            description: 'High significance change',
          },
          {
            tool: 'changed_tool',
            aspect: 'description',
            before: '',
            after: '',
            significance: 'low',
            description: 'Low significance change',
          },
        ],
        severity: 'breaking',
        breakingCount: 1,
        warningCount: 0,
        infoCount: 1,
        summary: 'Behavior changes',
      };

      const sarif = generateSarifFromDiff(diff);
      const parsed = JSON.parse(sarif);

      const results = parsed.runs[0].results.filter(
        (r: any) => r.ruleId === 'INQUEST-006'
      );
      expect(results).toHaveLength(2);

      const highResult = results.find((r: any) => r.level === 'error');
      const lowResult = results.find((r: any) => r.level === 'note');
      expect(highResult).toBeDefined();
      expect(lowResult).toBeDefined();
    });

    it('should set exit code based on severity', () => {
      const breakingDiff: BehavioralDiff = {
        toolsAdded: [],
        toolsRemoved: ['tool'],
        toolsModified: [],
        behaviorChanges: [],
        severity: 'breaking',
        breakingCount: 1,
        warningCount: 0,
        infoCount: 0,
        summary: 'Breaking change',
      };

      const sarif = generateSarifFromDiff(breakingDiff);
      const parsed = JSON.parse(sarif);

      expect(parsed.runs[0].invocations[0].exitCode).toBe(1);
      expect(parsed.runs[0].invocations[0].executionSuccessful).toBe(false);
    });
  });

  describe('generateSarifFromFindings', () => {
    it('should convert findings to SARIF results', () => {
      const findings: CIFinding[] = [
        {
          id: 'SEC-001',
          category: 'security',
          severity: 'high',
          title: 'Security Issue',
          description: 'A security issue was found',
          tool: 'test_tool',
        },
        {
          id: 'REL-001',
          category: 'reliability',
          severity: 'medium',
          title: 'Reliability Issue',
          description: 'A reliability issue was found',
        },
      ];

      const sarif = generateSarifFromFindings(findings);
      const parsed = JSON.parse(sarif);

      expect(parsed.runs[0].results).toHaveLength(2);

      const securityResult = parsed.runs[0].results.find(
        (r: any) => r.properties.findingId === 'SEC-001'
      );
      expect(securityResult).toBeDefined();
      expect(securityResult.level).toBe('error');

      const reliabilityResult = parsed.runs[0].results.find(
        (r: any) => r.properties.findingId === 'REL-001'
      );
      expect(reliabilityResult).toBeDefined();
      expect(reliabilityResult.level).toBe('warning');
    });

    it('should include finding properties', () => {
      const findings: CIFinding[] = [
        {
          id: 'TEST-001',
          category: 'drift',
          severity: 'low',
          title: 'Test Finding',
          description: 'Test description',
          tool: 'test_tool',
          recommendation: 'Fix it',
        },
      ];

      const sarif = generateSarifFromFindings(findings);
      const parsed = JSON.parse(sarif);

      const result = parsed.runs[0].results[0];
      expect(result.properties.findingId).toBe('TEST-001');
      expect(result.properties.category).toBe('drift');
      expect(result.properties.severity).toBe('low');
      expect(result.properties.tool).toBe('test_tool');
      expect(result.properties.recommendation).toBe('Fix it');
    });

    it('should map severity to SARIF levels', () => {
      const findings: CIFinding[] = [
        { id: '1', category: 'security', severity: 'critical', title: 'Critical', description: '' },
        { id: '2', category: 'security', severity: 'high', title: 'High', description: '' },
        { id: '3', category: 'security', severity: 'medium', title: 'Medium', description: '' },
        { id: '4', category: 'security', severity: 'low', title: 'Low', description: '' },
        { id: '5', category: 'security', severity: 'info', title: 'Info', description: '' },
      ];

      const sarif = generateSarifFromFindings(findings);
      const parsed = JSON.parse(sarif);

      const levels = parsed.runs[0].results.map((r: any) => r.level);
      expect(levels).toEqual(['error', 'error', 'warning', 'note', 'note']);
    });
  });
});
