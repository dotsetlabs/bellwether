/**
 * Workflow executor - runs workflows and tracks data flow.
 */

import type { MCPClient } from '../transport/mcp-client.js';
import type { MCPTool, MCPToolCallResult } from '../transport/types.js';
import type { LLMClient } from '../llm/client.js';
import type {
  Workflow,
  WorkflowStep,
  WorkflowResult,
  WorkflowStepResult,
  WorkflowExecutorOptions,
  AssertionResult,
  Assertion,
  DataFlowEdge,
  WorkflowProgress,
  WorkflowProgressCallback,
  WorkflowStateTracking,
  StateSnapshot,
  StateChange,
} from './types.js';
import { StateTracker } from './state-tracker.js';
import {
  buildWorkflowStepAnalysisPrompt,
  buildWorkflowSummaryPrompt,
  COMPLETION_OPTIONS,
} from '../prompts/templates.js';
import { getLogger, startTiming } from '../logging/logger.js';

/**
 * Default executor options (excluding callbacks).
 */
const DEFAULT_OPTIONS = {
  continueOnError: false,
  stepTimeout: 30000,
  analyzeSteps: true,
  generateSummary: true,
} as const;

/**
 * Wrap a promise with a timeout.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Executes workflows against an MCP server.
 */
export class WorkflowExecutor {
  private stepResults: WorkflowStepResult[] = [];
  private onProgress?: WorkflowProgressCallback;
  private logger = getLogger('workflow-executor');
  private stateTracker?: StateTracker;

  constructor(
    private client: MCPClient,
    private llm: LLMClient,
    private tools: MCPTool[],
    private options: WorkflowExecutorOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.onProgress = options.onProgress;

    // Initialize state tracker if enabled
    if (this.options.stateTracking?.enabled) {
      this.stateTracker = new StateTracker(
        client,
        tools,
        llm,
        this.options.stateTracking
      );
    }
  }

  /**
   * Emit progress event if callback is registered.
   */
  private emitProgress(
    workflow: Workflow,
    phase: WorkflowProgress['phase'],
    currentStep: number,
    startTime: number,
    currentStepInfo?: WorkflowStep
  ): void {
    if (!this.onProgress) return;

    const stepsFailed = this.stepResults.filter(r => !r.success).length;

    this.onProgress({
      phase,
      workflow,
      currentStep,
      totalSteps: workflow.steps.length,
      currentStepInfo,
      stepsCompleted: this.stepResults.length,
      stepsFailed,
      elapsedMs: Date.now() - startTime,
    });
  }

  /**
   * Execute a workflow.
   */
  async execute(workflow: Workflow): Promise<WorkflowResult> {
    const done = startTiming(this.logger, `workflow:${workflow.id}`);
    const startTime = Date.now();
    this.stepResults = [];

    this.logger.info({
      workflowId: workflow.id,
      workflowName: workflow.name,
      stepCount: workflow.steps.length,
      stateTrackingEnabled: !!this.stateTracker,
    }, 'Starting workflow execution');

    let success = true;
    let failureReason: string | undefined;
    let failedStepIndex: number | undefined;

    // State tracking data
    const snapshots: StateSnapshot[] = [];
    const changes: StateChange[] = [];

    // Emit starting progress
    this.emitProgress(workflow, 'starting', 0, startTime);

    // Take initial state snapshot if enabled
    if (this.stateTracker && this.options.stateTracking?.snapshotBefore) {
      this.logger.debug('Taking initial state snapshot');
      const initialSnapshot = await this.stateTracker.takeSnapshot(-1);
      snapshots.push(initialSnapshot);
    }

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];

      // Emit executing progress before step
      this.emitProgress(workflow, 'executing', i, startTime, step);

      const stepResult = await this.executeStep(step, i, workflow);
      this.stepResults.push(stepResult);

      // Take snapshot after each step if enabled
      if (this.stateTracker && this.options.stateTracking?.snapshotAfterEachStep) {
        const snapshot = await this.stateTracker.takeSnapshot(i);
        snapshots.push(snapshot);

        // Compare with previous snapshot to detect changes
        if (snapshots.length >= 2) {
          const prevSnapshot = snapshots[snapshots.length - 2];
          const stepChanges = this.stateTracker.compareSnapshots(prevSnapshot, snapshot, i);
          changes.push(...stepChanges);
        }
      }

      if (!stepResult.success) {
        if (!step.optional && !this.options.continueOnError) {
          success = false;
          failureReason = stepResult.error ?? 'Step failed';
          failedStepIndex = i;
          break;
        }
      }
    }

    // Take final state snapshot if enabled
    if (this.stateTracker && this.options.stateTracking?.snapshotAfter) {
      this.logger.debug('Taking final state snapshot');
      const finalSnapshot = await this.stateTracker.takeSnapshot(this.stepResults.length - 1);

      // If we haven't been taking per-step snapshots, compare initial to final
      if (!this.options.stateTracking?.snapshotAfterEachStep && snapshots.length > 0) {
        const initialSnapshot = snapshots[0];
        const overallChanges = this.stateTracker.compareSnapshots(
          initialSnapshot,
          finalSnapshot,
          this.stepResults.length - 1
        );
        changes.push(...overallChanges);
      }

      snapshots.push(finalSnapshot);
    }

    // Build data flow graph
    const dataFlow = this.buildDataFlowGraph(workflow);

    // Build state tracking result
    let stateTracking: WorkflowStateTracking | undefined;
    if (this.stateTracker) {
      const toolRoles = this.stateTracker.getAllToolInfo();
      let dependencies = this.stateTracker.inferDependencies(this.stepResults);

      // Verify dependencies if we have snapshots
      if (snapshots.length > 0 && changes.length > 0) {
        dependencies = this.stateTracker.verifyDependencies(dependencies, snapshots, changes);
      }

      const summary = await this.stateTracker.generateSummary({
        snapshots,
        changes,
        dependencies,
        toolRoles,
      });

      stateTracking = {
        snapshots,
        changes,
        dependencies,
        toolRoles,
        summary,
      };

      this.logger.debug({
        snapshotCount: snapshots.length,
        changeCount: changes.length,
        dependencyCount: dependencies.length,
      }, 'State tracking complete');
    }

    // Generate summary if requested
    let summary: string | undefined;
    if (this.options.generateSummary) {
      // Emit summarizing progress
      this.emitProgress(workflow, 'summarizing', workflow.steps.length, startTime);
      summary = await this.generateWorkflowSummary(workflow, this.stepResults, success);
    }

    // Emit complete progress
    this.emitProgress(workflow, 'complete', workflow.steps.length, startTime);

    const durationMs = Date.now() - startTime;
    this.logger.info({
      workflowId: workflow.id,
      success,
      stepsCompleted: this.stepResults.length,
      stepsFailed: this.stepResults.filter(r => !r.success).length,
      durationMs,
    }, 'Workflow execution complete');
    done();

    return {
      workflow,
      steps: this.stepResults,
      success,
      failureReason,
      failedStepIndex,
      durationMs,
      dataFlow,
      summary,
      stateTracking,
    };
  }

  /**
   * Execute a single workflow step.
   */
  private async executeStep(
    step: WorkflowStep,
    stepIndex: number,
    workflow: Workflow
  ): Promise<WorkflowStepResult> {
    const startTime = Date.now();

    // Verify tool exists
    const tool = this.tools.find(t => t.name === step.tool);
    if (!tool) {
      return {
        step,
        stepIndex,
        success: false,
        response: null,
        error: `Tool not found: ${step.tool}`,
        resolvedArgs: {},
        durationMs: Date.now() - startTime,
      };
    }

    // Resolve arguments (apply mapping from previous steps)
    let resolvedArgs: Record<string, unknown>;
    try {
      resolvedArgs = this.resolveArguments(step, stepIndex);
    } catch (error) {
      return {
        step,
        stepIndex,
        success: false,
        response: null,
        error: `Failed to resolve arguments: ${error instanceof Error ? error.message : String(error)}`,
        resolvedArgs: step.args ?? {},
        durationMs: Date.now() - startTime,
      };
    }

    // Execute the tool call with timeout
    let response: MCPToolCallResult | null = null;
    let error: string | undefined;

    const stepTimeout = this.options.stepTimeout ?? DEFAULT_OPTIONS.stepTimeout;
    try {
      response = await withTimeout(
        this.client.callTool(step.tool, resolvedArgs),
        stepTimeout,
        `Tool call '${step.tool}'`
      );

      if (response.isError) {
        error = this.extractErrorMessage(response);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    // Run assertions
    const assertionResults = step.assertions
      ? this.runAssertions(step.assertions, response)
      : undefined;

    const assertionsFailed = assertionResults?.some(r => !r.passed) ?? false;
    const success = !error && !assertionsFailed;

    // Generate analysis if requested
    let analysis: string | undefined;
    if (this.options.analyzeSteps) {
      analysis = await this.analyzeStep(step, stepIndex, workflow, response, error);
    }

    return {
      step,
      stepIndex,
      success,
      response,
      error,
      resolvedArgs,
      assertionResults,
      durationMs: Date.now() - startTime,
      analysis,
    };
  }

  /**
   * Resolve arguments for a step, applying mappings from previous step outputs.
   */
  private resolveArguments(step: WorkflowStep, stepIndex: number): Record<string, unknown> {
    const args: Record<string, unknown> = { ...(step.args ?? {}) };

    if (!step.argMapping) {
      return args;
    }

    for (const [paramName, pathExpr] of Object.entries(step.argMapping)) {
      const value = this.resolvePath(pathExpr, stepIndex);
      if (value !== undefined) {
        args[paramName] = value;
      }
    }

    return args;
  }

  /**
   * Resolve a JSONPath-like expression against previous step results.
   * Supports: $steps[n].result.path.to.value
   */
  private resolvePath(pathExpr: string, currentStepIndex: number): unknown {
    // Parse the path expression
    const match = pathExpr.match(/^\$steps\[(\d+)\]\.(.+)$/);
    if (!match) {
      throw new Error(`Invalid path expression: ${pathExpr}. Expected format: $steps[n].path.to.value`);
    }

    const stepIndex = parseInt(match[1], 10);
    const propertyPath = match[2];

    if (stepIndex >= currentStepIndex) {
      throw new Error(`Cannot reference step ${stepIndex} from step ${currentStepIndex} (can only reference earlier steps)`);
    }

    const stepResult = this.stepResults[stepIndex];
    if (!stepResult) {
      throw new Error(`Step ${stepIndex} has not been executed yet`);
    }

    if (!stepResult.success || !stepResult.response) {
      throw new Error(`Step ${stepIndex} failed or has no response`);
    }

    // Navigate the property path
    // First check if we're accessing 'result' (the raw content) or 'response' (the full response)
    let target: unknown;
    if (propertyPath.startsWith('result.') || propertyPath === 'result') {
      // Extract text content from the response
      const content = stepResult.response.content;
      const textContent = content.find(c => c.type === 'text' && c.text !== undefined);
      if (!textContent || textContent.text === undefined) {
        throw new Error(`Step ${stepIndex} response has no text content`);
      }

      const textValue = textContent.text;

      // Try to parse as JSON
      try {
        target = JSON.parse(textValue);
      } catch {
        target = textValue;
      }

      // Navigate the remaining path after 'result.'
      const remainingPath = propertyPath.replace(/^result\.?/, '');
      if (remainingPath) {
        target = this.navigatePath(target, remainingPath);
      }
    } else if (propertyPath.startsWith('response.')) {
      target = this.navigatePath(stepResult.response, propertyPath.replace(/^response\./, ''));
    } else {
      throw new Error(`Path must start with 'result.' or 'response.': ${pathExpr}`);
    }

    return target;
  }

  /**
   * Navigate a dot-separated path in an object.
   */
  private navigatePath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle array access: field[0]
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, fieldName, indexStr] = arrayMatch;
        const index = parseInt(indexStr, 10);
        current = (current as Record<string, unknown>)[fieldName];
        if (Array.isArray(current)) {
          current = current[index];
        } else {
          return undefined;
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  /**
   * Run assertions against a step response.
   */
  private runAssertions(
    assertions: Assertion[],
    response: MCPToolCallResult | null
  ): AssertionResult[] {
    return assertions.map(assertion => this.runAssertion(assertion, response));
  }

  /**
   * Run a single assertion.
   */
  private runAssertion(
    assertion: Assertion,
    response: MCPToolCallResult | null
  ): AssertionResult {
    if (!response) {
      return {
        assertion,
        passed: false,
        message: assertion.message ?? 'No response to assert against',
      };
    }

    // Extract the value at the path
    let actualValue: unknown;
    try {
      // Parse the response content as JSON
      const textContent = response.content.find(c => c.type === 'text' && c.text !== undefined);
      if (!textContent || textContent.text === undefined) {
        throw new Error('No text content in response');
      }

      const textValue = textContent.text;
      let parsed: unknown;
      try {
        parsed = JSON.parse(textValue);
      } catch {
        parsed = textValue;
      }

      actualValue = this.navigatePath(parsed, assertion.path);
    } catch (error) {
      return {
        assertion,
        passed: false,
        message: `Failed to extract path ${assertion.path}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Check the condition
    let passed = false;
    switch (assertion.condition) {
      case 'exists':
        passed = actualValue !== undefined && actualValue !== null;
        break;
      case 'truthy':
        passed = Boolean(actualValue);
        break;
      case 'equals':
        passed = actualValue === assertion.value;
        break;
      case 'contains':
        if (typeof actualValue === 'string' && typeof assertion.value === 'string') {
          passed = actualValue.includes(assertion.value);
        } else if (Array.isArray(actualValue)) {
          passed = actualValue.includes(assertion.value);
        }
        break;
      case 'type':
        passed = typeof actualValue === assertion.value;
        break;
    }

    return {
      assertion,
      passed,
      actualValue,
      message: passed ? undefined : (assertion.message ?? `Assertion failed: ${assertion.condition}`),
    };
  }

  /**
   * Extract error message from a tool response.
   */
  private extractErrorMessage(response: MCPToolCallResult): string {
    const textContent = response.content.find(c => c.type === 'text');
    if (textContent && 'text' in textContent) {
      return String(textContent.text);
    }
    return 'Unknown error';
  }

  /**
   * Build a data flow graph showing how data moves between steps.
   */
  private buildDataFlowGraph(workflow: Workflow): DataFlowEdge[] {
    const edges: DataFlowEdge[] = [];

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      if (!step.argMapping) continue;

      for (const [targetParam, pathExpr] of Object.entries(step.argMapping)) {
        const match = pathExpr.match(/^\$steps\[(\d+)\]\.(.+)$/);
        if (!match) continue;

        const fromStep = parseInt(match[1], 10);
        const sourcePath = match[2];

        // Try to get sample value from executed results
        let sampleValue: unknown;
        try {
          const stepResult = this.stepResults[fromStep];
          if (stepResult?.response) {
            sampleValue = this.resolvePath(pathExpr, i);
          }
        } catch {
          // Ignore resolution errors for graph building
        }

        edges.push({
          fromStep,
          toStep: i,
          sourcePath,
          targetParam,
          sampleValue,
        });
      }
    }

    return edges;
  }

  /**
   * Generate LLM analysis for a step.
   */
  private async analyzeStep(
    step: WorkflowStep,
    stepIndex: number,
    workflow: Workflow,
    response: MCPToolCallResult | null,
    error: string | undefined
  ): Promise<string> {
    const prompt = buildWorkflowStepAnalysisPrompt({
      workflow,
      step,
      stepIndex,
      response,
      error,
    });

    try {
      return await this.llm.complete(prompt, COMPLETION_OPTIONS.workflowStepAnalysis);
    } catch {
      return error ? `Step failed: ${error}` : 'Step completed.';
    }
  }

  /**
   * Generate a summary of the workflow execution.
   */
  private async generateWorkflowSummary(
    workflow: Workflow,
    stepResults: WorkflowStepResult[],
    success: boolean
  ): Promise<string> {
    const prompt = buildWorkflowSummaryPrompt({ workflow, stepResults, success });

    try {
      return await this.llm.complete(prompt, COMPLETION_OPTIONS.workflowSummary);
    } catch {
      return success
        ? `Workflow "${workflow.name}" completed successfully with ${stepResults.length} steps.`
        : `Workflow "${workflow.name}" failed at step ${stepResults.findIndex(r => !r.success) + 1}.`;
    }
  }
}
