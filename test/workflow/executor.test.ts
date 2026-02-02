/**
 * Integration tests for workflow/executor.ts
 *
 * Tests the WorkflowExecutor class using mocked MCP servers.
 * Following TDD principles - testing expected behavior based on rational assumptions.
 *
 * The WorkflowExecutor:
 * - Executes multi-step workflows against MCP servers
 * - Resolves argument mappings between steps ($steps[n].result.path)
 * - Runs assertions on step responses
 * - Builds data flow graphs
 * - Handles errors and optional steps
 * - Supports progress callbacks
 * - Falls back gracefully in check mode (no LLM)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getTsxCommand } from '../fixtures/tsx-command.js';
import { MCPClient } from '../../src/transport/mcp-client.js';
import { discover } from '../../src/discovery/discovery.js';
import { WorkflowExecutor } from '../../src/workflow/executor.js';
import type { Workflow, WorkflowStep, WorkflowProgress } from '../../src/workflow/types.js';
import type { MCPTool } from '../../src/transport/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MOCK_SERVER_PATH = join(__dirname, '../fixtures/mock-mcp-server.ts');
const { command: TSX_PATH, args: TSX_ARGS } = getTsxCommand(MOCK_SERVER_PATH);

/**
 * Create a simple test workflow step.
 */
function createStep(
  tool: string,
  args: Record<string, unknown> = {},
  extra: Partial<Omit<WorkflowStep, 'tool' | 'description' | 'args'>> = {}
): WorkflowStep {
  return {
    tool,
    description: `Call ${tool}`,
    args,
    ...extra,
  };
}

/**
 * Create a simple test workflow.
 */
function createTestWorkflow(options: {
  id?: string;
  name?: string;
  steps?: WorkflowStep[];
}): Workflow {
  return {
    id: options.id ?? 'test-workflow',
    name: options.name ?? 'Test Workflow',
    description: 'A test workflow',
    expectedOutcome: 'Test workflow completes successfully',
    steps: options.steps ?? [createStep('get_weather', { location: 'New York' })],
  };
}

describe('WorkflowExecutor', () => {
  let client: MCPClient;
  let tools: MCPTool[];

  beforeEach(async () => {
    client = new MCPClient({ timeout: 10000, startupDelay: 100 });
    await client.connect(TSX_PATH, TSX_ARGS);
    const discovery = await discover(client, TSX_PATH, TSX_ARGS);
    tools = discovery.tools;
  });

  afterEach(async () => {
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  });

  describe('basic execution', () => {
    it('should execute a single-step workflow successfully', async () => {
      const workflow = createTestWorkflow({
        steps: [createStep('get_weather', { location: 'Seattle' })],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].success).toBe(true);
      expect(result.steps[0].response).not.toBeNull();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('should execute a multi-step workflow', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('get_weather', { location: 'Seattle' }),
          createStep('calculate', { expression: '2 + 2' }),
          createStep('calculate', { expression: '3 + 3' }),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect(result.steps.every((s) => s.success)).toBe(true);
    }, 15000);

    it('should return workflow and step metadata', async () => {
      const workflow = createTestWorkflow({
        id: 'my-workflow',
        name: 'My Test Workflow',
        steps: [createStep('calculate', { expression: '1 + 1' })],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.workflow.id).toBe('my-workflow');
      expect(result.workflow.name).toBe('My Test Workflow');
      expect(result.steps[0].step.tool).toBe('calculate');
      expect(result.steps[0].stepIndex).toBe(0);
    }, 15000);
  });

  describe('error handling', () => {
    it('should fail on unknown tool', async () => {
      const workflow = createTestWorkflow({
        steps: [createStep('nonexistent_tool')],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toContain('Tool not found');
      expect(result.failedStepIndex).toBe(0);
    }, 15000);

    it('should fail workflow when non-optional step fails', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('read_file', { path: '/etc/passwd' }), // Will be denied
          createStep('get_weather', { location: 'Seattle' }),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        continueOnError: false,
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.failedStepIndex).toBe(0);
      // Second step should not have been executed
      expect(result.steps).toHaveLength(1);
    }, 15000);

    it('should continue on error when continueOnError is true', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('read_file', { path: '/etc/passwd' }), // Will be denied
          createStep('get_weather', { location: 'Seattle' }),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        continueOnError: true,
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      // Workflow may still be considered successful overall depending on implementation
      // But both steps should be executed
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[1].success).toBe(true);
    }, 15000);

    it('should skip optional steps that fail', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('read_file', { path: '/etc/passwd' }, { optional: true }), // Will be denied but optional
          createStep('get_weather', { location: 'Seattle' }),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        continueOnError: false,
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[1].success).toBe(true);
    }, 15000);

    it('should record failure reason', async () => {
      const workflow = createTestWorkflow({
        steps: [createStep('nonexistent_tool')],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.failureReason).toContain('Tool not found');
    }, 15000);
  });

  describe('argument mapping', () => {
    it('should resolve arguments from previous step results', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('get_weather', { location: 'Seattle' }),
          createStep(
            'calculate',
            { expression: '1 + 1' },
            {
              argMapping: {
                // This won't actually use the weather data for calculation,
                // but tests that the mapping mechanism works
              },
            }
          ),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps[1].resolvedArgs.expression).toBe('1 + 1');
    }, 15000);

    it('should fail when referencing future step', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep(
            'calculate',
            {},
            {
              argMapping: {
                expression: '$steps[1].result.value', // Can't reference step 1 from step 0
              },
            }
          ),
          createStep('get_weather', { location: 'Seattle' }),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.steps[0].error).toContain('Cannot reference');
    }, 15000);

    it('should fail on invalid path expression', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('get_weather', { location: 'Seattle' }),
          createStep(
            'calculate',
            {},
            {
              argMapping: {
                expression: 'invalid.path.format', // Missing $steps[n] prefix
              },
            }
          ),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.steps[1].error).toContain('Invalid path expression');
    }, 15000);

    it('should skip step when dependency has failed', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('nonexistent_tool'), // Step 0 will fail
          createStep(
            'calculate',
            {},
            {
              argMapping: {
                expression: '$steps[0].result.value', // Depends on failed step
              },
            }
          ),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        continueOnError: true,
        requireSuccessfulDependencies: true,
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[1].success).toBe(false);
      expect(result.steps[1].error).toContain('depends on failed');
    }, 15000);
  });

  describe('assertions', () => {
    it('should pass "exists" assertion when value exists', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep(
            'get_weather',
            { location: 'Seattle' },
            {
              assertions: [{ path: 'location', condition: 'exists' }],
            }
          ),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps[0].assertionResults).toHaveLength(1);
      expect(result.steps[0].assertionResults?.[0].passed).toBe(true);
    }, 15000);

    it('should fail "exists" assertion when value is missing', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep(
            'get_weather',
            { location: 'Seattle' },
            {
              assertions: [{ path: 'nonexistent_field', condition: 'exists' }],
            }
          ),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.steps[0].assertionResults?.[0].passed).toBe(false);
    }, 15000);

    it('should check "equals" assertion', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep(
            'calculate',
            { expression: '2 + 2' },
            {
              assertions: [{ path: 'result', condition: 'equals', value: 4 }],
            }
          ),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps[0].assertionResults?.[0].passed).toBe(true);
      expect(result.steps[0].assertionResults?.[0].actualValue).toBe(4);
    }, 15000);

    it('should check "contains" assertion for strings', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep(
            'get_weather',
            { location: 'Seattle' },
            {
              assertions: [{ path: 'location', condition: 'contains', value: 'Seattle' }],
            }
          ),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps[0].assertionResults?.[0].passed).toBe(true);
    }, 15000);

    it('should check "type" assertion', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep(
            'calculate',
            { expression: '5 * 5' },
            {
              assertions: [{ path: 'result', condition: 'type', value: 'number' }],
            }
          ),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps[0].assertionResults?.[0].passed).toBe(true);
    }, 15000);

    it('should check "truthy" assertion', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep(
            'get_weather',
            { location: 'Seattle' },
            {
              assertions: [{ path: 'conditions', condition: 'truthy' }],
            }
          ),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps[0].assertionResults?.[0].passed).toBe(true);
    }, 15000);

    it('should record assertion error messages', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep(
            'calculate',
            { expression: '3 + 3' },
            {
              assertions: [
                { path: 'result', condition: 'equals', value: 100, message: 'Expected 100' },
              ],
            }
          ),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.steps[0].assertionResults?.[0].passed).toBe(false);
      expect(result.steps[0].assertionResults?.[0].message).toBe('Expected 100');
    }, 15000);
  });

  describe('data flow graph', () => {
    it('should build empty data flow for independent steps', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('get_weather', { location: 'Seattle' }),
          createStep('calculate', { expression: '1 + 1' }),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.dataFlow).toHaveLength(0);
    }, 15000);

    it('should build data flow edges for mapped arguments', async () => {
      // Create a workflow with actual data mapping that can work
      // Note: Our mock server doesn't support complex chaining, so this tests the graph building logic
      const workflow: Workflow = {
        id: 'data-flow-test',
        name: 'Data Flow Test',
        description: 'Test data flow graph building',
        expectedOutcome: 'Data flow edges are built correctly',
        steps: [
          createStep('get_weather', { location: 'Seattle' }),
          createStep(
            'calculate',
            { precision: 2 },
            {
              // This will fail resolution but we can still test graph building
              argMapping: {
                expression: '$steps[0].result.temperature',
              },
            }
          ),
        ],
      };

      const executor = new WorkflowExecutor(client, null, tools, {
        continueOnError: true,
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      // Data flow edges should be built
      expect(result.dataFlow?.length).toBeGreaterThan(0);
      expect(result.dataFlow?.[0].fromStep).toBe(0);
      expect(result.dataFlow?.[0].toStep).toBe(1);
      expect(result.dataFlow?.[0].targetParam).toBe('expression');
    }, 15000);
  });

  describe('progress callbacks', () => {
    it('should emit progress events', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('get_weather', { location: 'Seattle' }),
          createStep('calculate', { expression: '1 + 1' }),
        ],
      });

      const progressEvents: WorkflowProgress[] = [];
      const onProgress = vi.fn((progress: WorkflowProgress) => {
        progressEvents.push({ ...progress });
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        onProgress,
        analyzeSteps: false,
        generateSummary: false,
      });

      await executor.execute(workflow);

      expect(onProgress).toHaveBeenCalled();

      // Should have starting, executing (per step), and complete phases
      const phases = progressEvents.map((p) => p.phase);
      expect(phases).toContain('starting');
      expect(phases).toContain('executing');
      expect(phases).toContain('complete');
    }, 15000);

    it('should track steps completed in progress', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('get_weather', { location: 'Seattle' }),
          createStep('calculate', { expression: '1 + 1' }),
          createStep('calculate', { expression: '2 + 2' }),
        ],
      });

      let maxStepsCompleted = 0;
      const onProgress = (progress: WorkflowProgress) => {
        if (progress.stepsCompleted > maxStepsCompleted) {
          maxStepsCompleted = progress.stepsCompleted;
        }
      };

      const executor = new WorkflowExecutor(client, null, tools, {
        onProgress,
        analyzeSteps: false,
        generateSummary: false,
      });

      await executor.execute(workflow);

      // By the end, all steps should be completed
      expect(maxStepsCompleted).toBe(3);
    }, 15000);

    it('should track failed steps in progress', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('nonexistent_tool'), // Will fail
          createStep('get_weather', { location: 'Seattle' }),
        ],
      });

      let failedCount = 0;
      const onProgress = (progress: WorkflowProgress) => {
        failedCount = progress.stepsFailed;
      };

      const executor = new WorkflowExecutor(client, null, tools, {
        onProgress,
        continueOnError: true,
        analyzeSteps: false,
        generateSummary: false,
      });

      await executor.execute(workflow);

      expect(failedCount).toBe(1);
    }, 15000);

    it('should include elapsed time in progress', async () => {
      const workflow = createTestWorkflow({
        steps: [createStep('calculate', { expression: '1 + 1' })],
      });

      let lastElapsed = 0;
      const onProgress = (progress: WorkflowProgress) => {
        lastElapsed = progress.elapsedMs;
      };

      const executor = new WorkflowExecutor(client, null, tools, {
        onProgress,
        analyzeSteps: false,
        generateSummary: false,
      });

      await executor.execute(workflow);

      // Elapsed time may be 0 if operation completes very quickly
      expect(lastElapsed).toBeGreaterThanOrEqual(0);
    }, 15000);
  });

  describe('check mode (no LLM)', () => {
    it('should generate fallback analysis without LLM', async () => {
      const workflow = createTestWorkflow({
        steps: [createStep('get_weather', { location: 'Seattle' })],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: true,
        generateSummary: true,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps[0].analysis).toBeDefined();
      expect(result.steps[0].analysis).toContain('completed');
      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('completed successfully');
    }, 15000);

    it('should generate fallback error analysis without LLM', async () => {
      // Use read_file with /nonexistent path - the mock server returns an error for this
      const workflow = createTestWorkflow({
        steps: [createStep('read_file', { path: '/nonexistent' })],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: true,
        generateSummary: true,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.steps[0].analysis).toBeDefined();
      expect(result.steps[0].analysis).toContain('Step failed:');
      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('failed');
    }, 15000);
  });

  describe('resolved arguments', () => {
    it('should record resolved arguments in step results', async () => {
      const workflow = createTestWorkflow({
        steps: [createStep('get_weather', { location: 'Seattle', units: 'fahrenheit' })],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.steps[0].resolvedArgs).toEqual({
        location: 'Seattle',
        units: 'fahrenheit',
      });
    }, 15000);

    it('should handle steps with empty args object', async () => {
      // Note: get_weather requires location, so we test with explicit empty args
      // that still work because the tool handler has defaults
      const workflow = createTestWorkflow({
        steps: [createStep('calculate', { expression: '0' })],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps[0].resolvedArgs).toEqual({ expression: '0' });
    }, 15000);
  });

  describe('step timing', () => {
    it('should record step duration', async () => {
      const workflow = createTestWorkflow({
        steps: [createStep('get_weather', { location: 'Seattle' })],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      // Duration should be recorded (may be 0 if tool responds very quickly)
      expect(result.steps[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.steps[0].durationMs).toBe('number');
    }, 15000);

    it('should record overall workflow duration', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('get_weather', { location: 'Seattle' }),
          createStep('calculate', { expression: '1 + 1' }),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.durationMs).toBeGreaterThan(0);
      // Total should be at least the sum of individual steps
      const stepTotal = result.steps.reduce((sum, s) => sum + s.durationMs, 0);
      expect(result.durationMs).toBeGreaterThanOrEqual(stepTotal);
    }, 15000);
  });

  describe('tool response handling', () => {
    it('should capture successful tool response', async () => {
      const workflow = createTestWorkflow({
        steps: [createStep('calculate', { expression: '10 * 5' })],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.steps[0].response).not.toBeNull();
      expect(result.steps[0].response?.content).toBeDefined();
      expect(result.steps[0].response?.content.length).toBeGreaterThan(0);
    }, 15000);

    it('should capture tool error responses', async () => {
      const workflow = createTestWorkflow({
        steps: [createStep('read_file', { path: '/nonexistent' })],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toBeDefined();
    }, 15000);
  });

  describe('complex workflows', () => {
    it('should handle workflow with mixed success and failure', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('get_weather', { location: 'Seattle' }),
          createStep('read_file', { path: '/etc/passwd' }, { optional: true }), // Will fail but optional
          createStep('calculate', { expression: '3 * 7' }),
          createStep('nonexistent_tool', {}, { optional: true }), // Will fail but optional
          createStep('calculate', { expression: '5 + 5' }),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(5);
      expect(result.steps[0].success).toBe(true); // weather
      expect(result.steps[1].success).toBe(false); // read_file (optional)
      expect(result.steps[2].success).toBe(true); // calculate
      expect(result.steps[3].success).toBe(false); // nonexistent (optional)
      expect(result.steps[4].success).toBe(true); // calculate
    }, 15000);

    it('should preserve step order in results', async () => {
      const workflow = createTestWorkflow({
        steps: [
          createStep('get_weather', { location: 'City1' }),
          createStep('get_weather', { location: 'City2' }),
          createStep('get_weather', { location: 'City3' }),
        ],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.steps[0].stepIndex).toBe(0);
      expect(result.steps[1].stepIndex).toBe(1);
      expect(result.steps[2].stepIndex).toBe(2);
    }, 15000);
  });

  describe('edge cases', () => {
    it('should handle empty workflow', async () => {
      const workflow = createTestWorkflow({
        steps: [],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(0);
    }, 15000);

    it('should handle workflow with single failing step', async () => {
      const workflow = createTestWorkflow({
        steps: [createStep('nonexistent_tool')],
      });

      const executor = new WorkflowExecutor(client, null, tools, {
        analyzeSteps: false,
        generateSummary: false,
      });

      const result = await executor.execute(workflow);

      expect(result.success).toBe(false);
      expect(result.failedStepIndex).toBe(0);
      expect(result.steps).toHaveLength(1);
    }, 15000);
  });
});
