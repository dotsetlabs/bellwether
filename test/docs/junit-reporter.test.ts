/**
 * Tests for JUnit XML reporter.
 */

import { describe, it, expect } from 'vitest';
import {
  generateJunitReport,
  generateJunitFromDiff,
} from '../../src/docs/junit-reporter.js';
import type { InterviewResult, ToolProfile, ToolInteraction } from '../../src/interview/types.js';
import type { BehavioralDiff } from '../../src/baseline/types.js';

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

describe('JUnit Reporter', () => {
  describe('generateJunitReport', () => {
    it('should produce valid XML', () => {
      const result = createMockInterviewResult();
      const xml = generateJunitReport(result);

      expect(xml).toMatch(/^<\?xml version="1\.0"/);
      expect(xml).toContain('<testsuites');
      expect(xml).toContain('</testsuites>');
    });

    it('should include server name in testsuites', () => {
      const result = createMockInterviewResult();
      const xml = generateJunitReport(result);

      expect(xml).toContain('name="test-server"');
    });

    it('should create testsuite for each tool', () => {
      const result = createMockInterviewResult({
        tools: [
          {
            name: 'tool_a',
            description: 'Tool A',
            interactions: [],
            behavioralNotes: [],
            limitations: [],
            securityNotes: [],
          },
          {
            name: 'tool_b',
            description: 'Tool B',
            interactions: [],
            behavioralNotes: [],
            limitations: [],
            securityNotes: [],
          },
        ],
      });

      const xml = generateJunitReport(result);

      expect(xml).toContain('name="tool_a"');
      expect(xml).toContain('name="tool_b"');
    });

    it('should create testcase for each interaction', () => {
      const interaction: ToolInteraction = {
        toolName: 'test_tool',
        question: {
          description: 'Test question',
          category: 'happy_path',
          args: { input: 'test' },
        },
        response: { content: [{ type: 'text', text: 'success' }] },
        error: null,
        analysis: 'Tool worked correctly',
        durationMs: 100,
      };

      const result = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test',
          interactions: [interaction],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        }],
      });

      const xml = generateJunitReport(result);

      expect(xml).toContain('<testcase');
      expect(xml).toContain('name="Test question"');
      expect(xml).toContain('classname="test_tool"');
    });

    it('should mark failed interactions as failures', () => {
      const failedInteraction: ToolInteraction = {
        toolName: 'test_tool',
        question: {
          description: 'Failing test',
          category: 'error_handling',
          args: {},
        },
        response: null,
        error: 'Tool call failed with error',
        analysis: 'Error occurred',
        durationMs: 50,
      };

      const result = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test',
          interactions: [failedInteraction],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        }],
      });

      const xml = generateJunitReport(result);

      expect(xml).toContain('<failure');
      expect(xml).toContain('Tool call failed with error');
    });

    it('should include analysis in system-out', () => {
      const interaction: ToolInteraction = {
        toolName: 'test_tool',
        question: {
          description: 'Test',
          category: 'happy_path',
          args: {},
        },
        response: { content: [] },
        error: null,
        analysis: 'Tool analysis result',
        durationMs: 100,
      };

      const result = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test',
          interactions: [interaction],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        }],
      });

      const xml = generateJunitReport(result);

      expect(xml).toContain('<system-out>Tool analysis result</system-out>');
    });

    it('should include behavioral notes as testcases', () => {
      const result = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test',
          interactions: [],
          behavioralNotes: ['Behavior note 1', 'Behavior note 2'],
          limitations: [],
          securityNotes: [],
        }],
      });

      const xml = generateJunitReport(result);

      expect(xml).toContain('name="behavioral_note_1"');
      expect(xml).toContain('name="behavioral_note_2"');
      expect(xml).toContain('Behavior note 1');
    });

    it('should include security notes in system-err', () => {
      const result = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test',
          interactions: [],
          behavioralNotes: [],
          limitations: [],
          securityNotes: ['Security warning here'],
        }],
      });

      const xml = generateJunitReport(result);

      expect(xml).toContain('name="security_note_1"');
      expect(xml).toContain('<system-err>');
      expect(xml).toContain('Security warning here');
    });

    it('should escape XML special characters', () => {
      const interaction: ToolInteraction = {
        toolName: 'test_tool',
        question: {
          description: 'Test <with> & "special" chars',
          category: 'happy_path',
          args: {},
        },
        response: { content: [] },
        error: null,
        analysis: 'Analysis with <tags> & "quotes"',
        durationMs: 100,
      };

      const result = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Tool with <description>',
          interactions: [interaction],
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        }],
      });

      const xml = generateJunitReport(result);

      expect(xml).toContain('&lt;');
      expect(xml).toContain('&gt;');
      expect(xml).toContain('&amp;');
      expect(xml).toContain('&quot;');
    });

    it('should include workflow suites', () => {
      const result = createMockInterviewResult({
        workflowResults: [{
          workflow: {
            id: 'wf1',
            name: 'Test Workflow',
            description: 'Test workflow description',
            steps: [
              { tool: 'tool_a', description: 'Step A' },
              { tool: 'tool_b', description: 'Step B' },
            ],
            expectedOutcome: 'success',
          },
          steps: [
            { step: { tool: 'tool_a', description: 'Step A' }, success: true, analysis: 'OK' },
            { step: { tool: 'tool_b', description: 'Step B' }, success: false, error: 'Failed' },
          ],
          success: false,
          failureReason: 'Step 2 failed',
        }],
      });

      const xml = generateJunitReport(result);

      expect(xml).toContain('name="workflow:Test Workflow"');
      expect(xml).toContain('name="step_1:tool_a"');
      expect(xml).toContain('name="step_2:tool_b"');
      expect(xml).toContain('<failure');
    });

    it('should calculate correct test counts', () => {
      const interactions: ToolInteraction[] = [
        {
          toolName: 'test_tool',
          question: { description: 'Test 1', category: 'happy_path', args: {} },
          response: { content: [] },
          error: null,
          analysis: '',
          durationMs: 100,
        },
        {
          toolName: 'test_tool',
          question: { description: 'Test 2', category: 'error_handling', args: {} },
          response: null,
          error: 'Failed',
          analysis: '',
          durationMs: 50,
        },
      ];

      const result = createMockInterviewResult({
        tools: [{
          name: 'test_tool',
          description: 'Test',
          interactions,
          behavioralNotes: [],
          limitations: [],
          securityNotes: [],
        }],
      });

      const xml = generateJunitReport(result);

      // Should have 2 tests, 1 failure
      expect(xml).toMatch(/tests="2"/);
      expect(xml).toMatch(/failures="1"/);
    });
  });

  describe('generateJunitFromDiff', () => {
    it('should produce valid XML', () => {
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

      const xml = generateJunitFromDiff(diff);

      expect(xml).toMatch(/^<\?xml version="1\.0"/);
      expect(xml).toContain('name="Behavioral Drift Detection"');
    });

    it('should mark removed tools as errors', () => {
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

      const xml = generateJunitFromDiff(diff);

      expect(xml).toContain('name="tool_present:removed_tool"');
      expect(xml).toContain('<error');
      expect(xml).toContain('Tool was removed');
    });

    it('should include added tools as passing tests', () => {
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

      const xml = generateJunitFromDiff(diff);

      expect(xml).toContain('name="new_tool:new_tool"');
      expect(xml).toContain('<system-out>New tool discovered');
    });

    it('should include modified tools with schema changes as failures', () => {
      const diff: BehavioralDiff = {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [{
          tool: 'modified_tool',
          changes: [
            {
              tool: 'modified_tool',
              aspect: 'schema',
              before: 'old',
              after: 'new',
              significance: 'high',
              description: 'Schema changed',
            },
          ],
          schemaChanged: true,
          descriptionChanged: false,
        }],
        behaviorChanges: [],
        severity: 'breaking',
        breakingCount: 1,
        warningCount: 0,
        infoCount: 0,
        summary: 'Schema changed',
      };

      const xml = generateJunitFromDiff(diff);

      expect(xml).toContain('name="tool_unchanged:modified_tool"');
      expect(xml).toContain('<failure');
      expect(xml).toContain('Schema changed');
    });

    it('should create behavior_changes testsuite', () => {
      const diff: BehavioralDiff = {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'security',
            before: '',
            after: '',
            significance: 'high',
            description: 'Security change',
          },
          {
            tool: 'test_tool',
            aspect: 'description',
            before: '',
            after: '',
            significance: 'low',
            description: 'Description change',
          },
        ],
        severity: 'breaking',
        breakingCount: 1,
        warningCount: 0,
        infoCount: 1,
        summary: 'Behavior changes',
      };

      const xml = generateJunitFromDiff(diff);

      expect(xml).toContain('name="behavior_changes"');
      expect(xml).toContain('name="behavior_1:test_tool"');
      expect(xml).toContain('classname="drift.behavior.security"');
    });

    it('should mark high significance changes as failures', () => {
      const diff: BehavioralDiff = {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'security',
            before: 'old value',
            after: 'new value',
            significance: 'high',
            description: 'High significance change',
          },
        ],
        severity: 'breaking',
        breakingCount: 1,
        warningCount: 0,
        infoCount: 0,
        summary: 'Breaking change',
      };

      const xml = generateJunitFromDiff(diff);

      expect(xml).toContain('<failure message="High significance change"');
      expect(xml).toContain('Before: old value');
      expect(xml).toContain('After: new value');
    });

    it('should not mark low significance changes as failures', () => {
      const diff: BehavioralDiff = {
        toolsAdded: [],
        toolsRemoved: [],
        toolsModified: [],
        behaviorChanges: [
          {
            tool: 'test_tool',
            aspect: 'description',
            before: '',
            after: '',
            significance: 'low',
            description: 'Minor change',
          },
        ],
        severity: 'info',
        breakingCount: 0,
        warningCount: 0,
        infoCount: 1,
        summary: 'Minor change',
      };

      const xml = generateJunitFromDiff(diff);

      // Should have system-out instead of failure
      expect(xml).toContain('<system-out>Minor change</system-out>');
      expect(xml).not.toMatch(/<failure.*Minor change/);
    });
  });
});
