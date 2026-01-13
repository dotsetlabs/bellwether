/**
 * Tests for HTML report generator.
 */

import { describe, it, expect } from 'vitest';
import { generateHtmlReport } from '../../src/docs/html-reporter.js';
import type { InterviewResult, ToolProfile } from '../../src/interview/types.js';

// Helper to create mock interview result
function createMockInterviewResult(options: {
  serverName?: string;
  tools?: Partial<ToolProfile>[];
  workflowResults?: any[];
  personas?: any[];
} = {}): InterviewResult {
  const tools = options.tools || [
    {
      name: 'test_tool',
      description: 'A test tool for testing',
      interactions: [
        {
          toolName: 'test_tool',
          question: { description: 'Test', category: 'happy_path' as const, args: { input: 'test' } },
          response: { content: [{ type: 'text', text: 'success' }] },
          error: null,
          analysis: 'Works correctly',
          durationMs: 100,
        },
      ],
      behavioralNotes: ['Handles input correctly'],
      limitations: ['Cannot process empty input'],
      securityNotes: ['Requires authentication'],
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
        prompts: true,
        resources: false,
        logging: true,
      },
      tools: tools.map((t) => ({
        name: t.name || 'test_tool',
        description: t.description || 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input value' },
          },
          required: ['input'],
        },
      })),
      prompts: [],
      resources: [],
    },
    toolProfiles: tools as ToolProfile[],
    workflowResults: options.workflowResults,
    summary: 'Test interview summary',
    limitations: ['Server limitation 1'],
    recommendations: ['Recommendation 1'],
    metadata: {
      startTime: new Date('2024-01-15T10:00:00Z'),
      endTime: new Date('2024-01-15T10:05:00Z'),
      durationMs: 300000,
      toolCallCount: 5,
      errorCount: 1,
      model: 'gpt-4',
      personas: options.personas,
    },
  };
}

describe('HTML Reporter', () => {
  describe('generateHtmlReport', () => {
    it('should generate valid HTML document', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    it('should include server name in title', () => {
      const result = createMockInterviewResult({ serverName: 'My Test Server' });
      const html = generateHtmlReport(result);

      expect(html).toContain('<title>My Test Server - Bellwether Report</title>');
      expect(html).toContain('<h1>My Test Server</h1>');
    });

    it('should include navigation links', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('href="#overview"');
      expect(html).toContain('href="#tools"');
      expect(html).toContain('href="#findings"');
      expect(html).toContain('href="#security"');
    });

    it('should include stats cards', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('stat-card');
      expect(html).toContain('Tools');
      expect(html).toContain('Tool Calls');
      expect(html).toContain('Errors');
      expect(html).toContain('Duration');
    });

    it('should include capabilities badges', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('capability enabled');
      expect(html).toContain('capability disabled');
    });

    it('should include tool cards', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('tool-card');
      expect(html).toContain('test_tool');
      expect(html).toContain('A test tool for testing');
    });

    it('should include tool search functionality', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('tool-search');
      expect(html).toContain('filterTools()');
    });

    it('should include tool details toggle', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('toggleToolDetails');
      expect(html).toContain('Show Details');
    });

    it('should include findings table', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('findings-table');
      expect(html).toContain('finding-behavior');
      expect(html).toContain('finding-limitations');
      expect(html).toContain('finding-security');
    });

    it('should include filter checkboxes for findings', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('filter-behavior');
      expect(html).toContain('filter-limitations');
      expect(html).toContain('filter-security');
      expect(html).toContain('filterFindings()');
    });

    it('should include sortable table headers', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('sortTable(0)');
      expect(html).toContain('sortTable(1)');
      expect(html).toContain('sortTable(2)');
    });

    it('should include security section', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('id="security"');
      expect(html).toContain('Security Considerations');
    });

    it('should classify security findings by severity', () => {
      const result = createMockInterviewResult({
        tools: [
          {
            name: 'risky_tool',
            description: 'Risky',
            interactions: [],
            behavioralNotes: [],
            limitations: [],
            securityNotes: [
              'SQL injection vulnerability',
              'Potential data leak risk',
              'Uses secure authentication',
            ],
          },
        ],
      });

      const html = generateHtmlReport(result);

      expect(html).toContain('security-group critical');
      expect(html).toContain('security-group warning');
      expect(html).toContain('security-group info');
    });

    it('should include limitations section when present', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('Known Limitations');
      expect(html).toContain('Server limitation 1');
    });

    it('should include recommendations section when present', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('Recommendations');
      expect(html).toContain('Recommendation 1');
    });

    it('should include footer with Bellwether link', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('class="footer"');
      expect(html).toContain('github.com/dotsetlabs/bellwether');
    });

    it('should include CSS styles', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('<style>');
      expect(html).toContain('--primary');
      expect(html).toContain('.container');
      expect(html).toContain('.tool-card');
    });

    it('should include JavaScript for interactivity', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('<script>');
      expect(html).toContain('function filterTools()');
      expect(html).toContain('function toggleToolDetails');
      expect(html).toContain('function filterFindings()');
      expect(html).toContain('function sortTable');
    });

    it('should escape HTML in content', () => {
      const result = createMockInterviewResult({
        tools: [
          {
            name: 'xss_tool',
            description: '<script>alert("xss")</script>',
            interactions: [],
            behavioralNotes: ['<b>Bold</b> note'],
            limitations: [],
            securityNotes: [],
          },
        ],
      });

      const html = generateHtmlReport(result);

      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;b&gt;');
    });

    it('should show personas when used', () => {
      const result = createMockInterviewResult({
        personas: [
          { id: 'tech', name: 'Technical Writer', questionsAsked: 5, toolCallCount: 10, errorCount: 0 },
          { id: 'sec', name: 'Security Tester', questionsAsked: 3, toolCallCount: 8, errorCount: 1 },
        ],
      });

      const html = generateHtmlReport(result);

      expect(html).toContain('Technical Writer');
      expect(html).toContain('Security Tester');
    });
  });

  describe('Workflows in HTML report', () => {
    it('should include workflows section when present', () => {
      const result = createMockInterviewResult({
        workflowResults: [
          {
            workflow: {
              id: 'wf1',
              name: 'Test Workflow',
              description: 'A test workflow',
              steps: [
                { tool: 'tool_a', description: 'Step A' },
                { tool: 'tool_b', description: 'Step B' },
              ],
              expectedOutcome: 'success',
            },
            steps: [
              { step: { tool: 'tool_a', description: 'Step A' }, success: true, analysis: 'OK' },
              { step: { tool: 'tool_b', description: 'Step B' }, success: true, analysis: 'OK' },
            ],
            success: true,
            summary: 'Workflow completed successfully',
          },
        ],
      });

      const html = generateHtmlReport(result);

      expect(html).toContain('id="workflows"');
      expect(html).toContain('Test Workflow');
      expect(html).toContain('A test workflow');
    });

    it('should include workflow navigation link when workflows exist', () => {
      const result = createMockInterviewResult({
        workflowResults: [
          {
            workflow: { id: 'wf1', name: 'Test', description: 'Test', steps: [], expectedOutcome: '' },
            steps: [],
            success: true,
          },
        ],
      });

      const html = generateHtmlReport(result);

      expect(html).toContain('href="#workflows"');
    });

    it('should not include workflow navigation when no workflows', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).not.toContain('href="#workflows"');
    });

    it('should show workflow success/failure status', () => {
      const result = createMockInterviewResult({
        workflowResults: [
          {
            workflow: { id: 'wf1', name: 'Success Workflow', description: 'Test', steps: [], expectedOutcome: '' },
            steps: [],
            success: true,
          },
          {
            workflow: { id: 'wf2', name: 'Failed Workflow', description: 'Test', steps: [], expectedOutcome: '' },
            steps: [],
            success: false,
            failureReason: 'Step failed',
          },
        ],
      });

      const html = generateHtmlReport(result);

      expect(html).toContain('workflow-card success');
      expect(html).toContain('workflow-card failure');
      expect(html).toContain('✅');
      expect(html).toContain('❌');
    });

    it('should include mermaid diagram for workflows', () => {
      const result = createMockInterviewResult({
        workflowResults: [
          {
            workflow: {
              id: 'wf1',
              name: 'Test Workflow',
              description: 'Test',
              steps: [
                { tool: 'tool_a', description: 'Step A' },
                { tool: 'tool_b', description: 'Step B' },
              ],
              expectedOutcome: '',
            },
            steps: [
              { step: { tool: 'tool_a', description: 'Step A' }, success: true },
              { step: { tool: 'tool_b', description: 'Step B' }, success: false },
            ],
            success: false,
          },
        ],
      });

      const html = generateHtmlReport(result);

      expect(html).toContain('class="mermaid"');
      expect(html).toContain('flowchart LR');
    });

    it('should show workflow step details', () => {
      const result = createMockInterviewResult({
        workflowResults: [
          {
            workflow: {
              id: 'wf1',
              name: 'Test Workflow',
              description: 'Test',
              steps: [{ tool: 'tool_a', description: 'Step A' }],
              expectedOutcome: '',
            },
            steps: [
              {
                step: { tool: 'tool_a', description: 'Step A' },
                success: false,
                error: 'Something went wrong',
                analysis: 'Analysis of the step',
              },
            ],
            success: false,
          },
        ],
      });

      const html = generateHtmlReport(result);

      expect(html).toContain('workflow-step');
      expect(html).toContain('Something went wrong');
      expect(html).toContain('Analysis of the step');
    });
  });

  describe('Tool explorer features', () => {
    it('should include expand/collapse for tool details', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('tool-details');
      expect(html).toContain('expand-btn');
    });

    it('should include input schema in tool details', () => {
      const result = createMockInterviewResult();
      const html = generateHtmlReport(result);

      expect(html).toContain('Input Schema');
      // Quotes are escaped in HTML
      expect(html).toContain('&quot;type&quot;: &quot;object&quot;');
    });

    it('should show tool status indicators', () => {
      const result = createMockInterviewResult({
        tools: [
          {
            name: 'good_tool',
            description: 'Works well',
            interactions: [],
            behavioralNotes: ['Works'],
            limitations: [],
            securityNotes: [],
          },
          {
            name: 'warning_tool',
            description: 'Has issues',
            interactions: [],
            behavioralNotes: [],
            limitations: ['Has limitations'],
            securityNotes: ['Security concern'],
          },
        ],
      });

      const html = generateHtmlReport(result);

      expect(html).toContain('tool-status ok');
      expect(html).toContain('tool-status has-warnings');
    });
  });
});
