/**
 * State tracker - tracks state changes during workflow execution.
 *
 * This module provides functionality to:
 * - Classify tools by their state role (reader, writer, both)
 * - Identify probe tools that can capture state
 * - Take state snapshots before/after workflow steps
 * - Detect state changes between snapshots
 * - Infer dependencies between workflow steps
 *
 * RELIABILITY: All probe tool calls have timeouts to prevent indefinite hangs.
 */

import { createHash } from 'crypto';
import type { MCPClient } from '../transport/mcp-client.js';
import type { MCPTool, MCPToolCallResult } from '../transport/types.js';
import type { LLMClient } from '../llm/client.js';
import type {
  ToolStateRole,
  ToolStateInfo,
  StateSnapshot,
  StateChange,
  StateDependency,
  WorkflowStateTracking,
  StateTrackingOptions,
  WorkflowStepResult,
} from './types.js';
import { getLogger } from '../logging/logger.js';
import { withTimeout, DEFAULT_TIMEOUTS, TimeoutError } from '../utils/timeout.js';

/**
 * Patterns that indicate a tool reads state.
 */
const READER_PATTERNS = [
  /^(get|read|list|fetch|query|search|find|show|view|check|describe|inspect)/i,
  /(reader|getter|viewer|inspector|checker)$/i,
  /\b(retrieve|lookup|select|scan)\b/i,
];

/**
 * Patterns that indicate a tool writes state.
 */
const WRITER_PATTERNS = [
  /^(create|add|insert|write|set|update|modify|delete|remove|drop|clear|reset)/i,
  /^(post|put|patch)/i,
  /(writer|setter|creator|mutator|modifier)$/i,
  /\b(save|store|persist|commit|push)\b/i,
];

/**
 * Patterns that indicate a tool is suitable as a state probe.
 * These are tools that can provide a comprehensive view of state.
 */
const PROBE_PATTERNS = [
  /^(list|get_all|fetch_all|query_all|show_all)/i,
  /\b(all|everything|dump|export|snapshot)\b/i,
  /_list$/i,
  /^list_/i,
];

/**
 * Timeout configuration for state tracking operations.
 */
export interface StateTrackerTimeoutConfig {
  /** Timeout for state snapshot operations in ms */
  snapshotTimeout?: number;
  /** Timeout for individual probe tool calls in ms */
  probeTimeout?: number;
}

/**
 * State tracker for workflow execution.
 */
export class StateTracker {
  private logger = getLogger('state-tracker');
  private toolClassifications: Map<string, ToolStateInfo> = new Map();
  private probeTools: string[] = [];
  private snapshotTimeout: number;
  private probeTimeout: number;

  constructor(
    private client: MCPClient,
    private tools: MCPTool[],
    _llm?: LLMClient,
    private options: StateTrackingOptions = {},
    timeoutConfig?: StateTrackerTimeoutConfig
  ) {
    this.snapshotTimeout = timeoutConfig?.snapshotTimeout ?? DEFAULT_TIMEOUTS.stateSnapshot;
    this.probeTimeout = timeoutConfig?.probeTimeout ?? DEFAULT_TIMEOUTS.probeTool;
    this.classifyTools();
  }

  /**
   * Classify all tools by their state role.
   */
  private classifyTools(): void {
    for (const tool of this.tools) {
      const info = this.classifyTool(tool);
      this.toolClassifications.set(tool.name, info);

      if (info.isProbe) {
        this.probeTools.push(tool.name);
      }
    }

    // Use specified probe tools if provided
    if (this.options.probeTools?.length) {
      this.probeTools = this.options.probeTools.filter(name =>
        this.tools.some(t => t.name === name)
      );
    }

    this.logger.debug({
      toolCount: this.tools.length,
      probeCount: this.probeTools.length,
      probes: this.probeTools,
    }, 'Tools classified');
  }

  /**
   * Classify a single tool by analyzing its name and description.
   */
  private classifyTool(tool: MCPTool): ToolStateInfo {
    const name = tool.name;
    const description = tool.description ?? '';
    const combined = `${name} ${description}`;

    const isReader = READER_PATTERNS.some(p => p.test(combined));
    const isWriter = WRITER_PATTERNS.some(p => p.test(combined));
    const isProbe = PROBE_PATTERNS.some(p => p.test(combined));

    let role: ToolStateRole;
    let confidence: number;

    if (isReader && isWriter) {
      role = 'both';
      confidence = 0.7;
    } else if (isReader) {
      role = 'reader';
      confidence = 0.8;
    } else if (isWriter) {
      role = 'writer';
      confidence = 0.8;
    } else {
      role = 'unknown';
      confidence = 0.3;
    }

    // Infer state types from description
    const stateTypes = this.inferStateTypes(combined);

    return {
      tool: name,
      role,
      stateTypes: stateTypes.length > 0 ? stateTypes : undefined,
      isProbe: isProbe && isReader,
      confidence,
    };
  }

  /**
   * Infer state types from tool description.
   */
  private inferStateTypes(text: string): string[] {
    const types: string[] = [];
    const lowerText = text.toLowerCase();

    const stateTypePatterns: Array<[RegExp, string]> = [
      [/\b(file|files|directory|folder|path)\b/, 'files'],
      [/\b(database|db|table|row|record|sql)\b/, 'database'],
      [/\b(user|account|profile|auth)\b/, 'users'],
      [/\b(session|token|cookie)\b/, 'sessions'],
      [/\b(cache|cached|caching)\b/, 'cache'],
      [/\b(queue|message|event)\b/, 'queue'],
      [/\b(config|setting|preference)\b/, 'config'],
      [/\b(resource|entity|object|item)\b/, 'resources'],
    ];

    for (const [pattern, type] of stateTypePatterns) {
      if (pattern.test(lowerText)) {
        types.push(type);
      }
    }

    return [...new Set(types)];
  }

  /**
   * Get the classification for a specific tool.
   */
  getToolInfo(toolName: string): ToolStateInfo | undefined {
    return this.toolClassifications.get(toolName);
  }

  /**
   * Get all tool classifications.
   */
  getAllToolInfo(): ToolStateInfo[] {
    return Array.from(this.toolClassifications.values());
  }

  /**
   * Get available probe tools.
   */
  getProbeTools(): string[] {
    return [...this.probeTools];
  }

  /**
   * Take a state snapshot using available probe tools.
   *
   * RELIABILITY: Each probe tool call has an individual timeout to prevent hangs.
   * The entire snapshot operation also has a total timeout.
   *
   * @param afterStepIndex - The step index this snapshot was taken after
   * @param snapshotTimeoutMs - Optional total timeout for the snapshot operation (overrides configured timeout)
   */
  async takeSnapshot(
    afterStepIndex: number,
    snapshotTimeoutMs?: number
  ): Promise<StateSnapshot> {
    const effectiveSnapshotTimeout = snapshotTimeoutMs ?? this.snapshotTimeout;
    const snapshotStart = Date.now();
    const timestamp = new Date();
    const stateData: Record<string, unknown> = {};
    let successCount = 0;
    let failureCount = 0;

    // Track consecutive failures for circuit breaker
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = Math.ceil(this.probeTools.length * 0.5);

    // Call each probe tool to gather state with individual timeouts
    for (const probeName of this.probeTools) {
      // Check if we've exceeded the total snapshot timeout
      const elapsed = Date.now() - snapshotStart;
      if (elapsed >= effectiveSnapshotTimeout) {
        this.logger.warn(
          { afterStepIndex, elapsed, timeout: effectiveSnapshotTimeout },
          'Snapshot operation exceeded total timeout, stopping probe calls'
        );
        break;
      }

      // Circuit breaker: stop if too many consecutive failures
      if (consecutiveFailures >= maxConsecutiveFailures) {
        this.logger.warn(
          { consecutiveFailures, maxConsecutiveFailures },
          'Too many consecutive probe failures, aborting snapshot'
        );
        break;
      }

      try {
        // Apply timeout to individual probe tool call
        const result = await withTimeout(
          this.client.callTool(probeName, {}),
          this.probeTimeout,
          `Probe tool '${probeName}'`
        );
        const content = this.extractContent(result);
        stateData[probeName] = content;
        successCount++;
        consecutiveFailures = 0; // Reset on success
      } catch (error) {
        failureCount++;
        consecutiveFailures++;

        const isTimeout = error instanceof TimeoutError;
        this.logger.warn({
          probe: probeName,
          error: error instanceof Error ? error.message : String(error),
          isTimeout,
          consecutiveFailures,
        }, 'Probe tool failed');

        stateData[probeName] = {
          error: isTimeout ? 'probe_timeout' : 'probe_failed',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Log snapshot summary
    this.logger.debug({
      afterStepIndex,
      probeCount: this.probeTools.length,
      successCount,
      failureCount,
      durationMs: Date.now() - snapshotStart,
    }, 'Snapshot completed');

    // If no probes available or all failed, create empty snapshot
    const data = successCount > 0 ? stateData : null;
    const hash = this.hashState(data);

    return {
      timestamp,
      afterStepIndex,
      probeTool: this.probeTools.length > 0 ? this.probeTools.join(',') : undefined,
      data,
      hash,
    };
  }

  /**
   * Extract content from a tool call result.
   */
  private extractContent(result: MCPToolCallResult): unknown {
    const textContent = result.content.find(c => c.type === 'text' && c.text !== undefined);
    if (!textContent || textContent.text === undefined) {
      return null;
    }

    try {
      return JSON.parse(textContent.text);
    } catch {
      return textContent.text;
    }
  }

  /**
   * Generate a hash for state data.
   */
  private hashState(data: unknown): string {
    const json = JSON.stringify(data, null, 0);
    return createHash('sha256').update(json).digest('hex').slice(0, 16);
  }

  /**
   * Compare two snapshots and identify changes.
   */
  compareSnapshots(before: StateSnapshot, after: StateSnapshot, causedByStep: number): StateChange[] {
    const changes: StateChange[] = [];

    if (before.hash === after.hash) {
      return changes;
    }

    // Deep compare the state data
    const beforeData = before.data as Record<string, unknown> | null;
    const afterData = after.data as Record<string, unknown> | null;

    if (!beforeData || !afterData) {
      if (beforeData && !afterData) {
        changes.push({
          type: 'deleted',
          path: '$',
          before: beforeData,
          after: undefined,
          causedByStep,
        });
      } else if (!beforeData && afterData) {
        changes.push({
          type: 'created',
          path: '$',
          before: undefined,
          after: afterData,
          causedByStep,
        });
      }
      return changes;
    }

    // Compare probe results
    const allKeys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);

    for (const key of allKeys) {
      const beforeValue = beforeData[key];
      const afterValue = afterData[key];

      if (beforeValue === undefined && afterValue !== undefined) {
        changes.push({
          type: 'created',
          path: `$.${key}`,
          before: undefined,
          after: afterValue,
          causedByStep,
        });
      } else if (beforeValue !== undefined && afterValue === undefined) {
        changes.push({
          type: 'deleted',
          path: `$.${key}`,
          before: beforeValue,
          after: undefined,
          causedByStep,
        });
      } else if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes.push({
          type: 'modified',
          path: `$.${key}`,
          before: beforeValue,
          after: afterValue,
          causedByStep,
        });
      }
    }

    return changes;
  }

  /**
   * Infer dependencies between workflow steps based on state changes and tool roles.
   */
  inferDependencies(stepResults: WorkflowStepResult[]): StateDependency[] {
    const dependencies: StateDependency[] = [];
    const writerSteps: Map<string, number[]> = new Map(); // stateType -> step indices

    for (let i = 0; i < stepResults.length; i++) {
      const result = stepResults[i];
      const toolInfo = this.toolClassifications.get(result.step.tool);

      if (!toolInfo) continue;

      // Track writers
      if (toolInfo.role === 'writer' || toolInfo.role === 'both') {
        const stateTypes = toolInfo.stateTypes ?? ['unknown'];
        for (const stateType of stateTypes) {
          const writers = writerSteps.get(stateType) ?? [];
          writers.push(i);
          writerSteps.set(stateType, writers);
        }
      }

      // Track readers and create dependencies
      if (toolInfo.role === 'reader' || toolInfo.role === 'both') {
        const stateTypes = toolInfo.stateTypes ?? ['unknown'];
        for (const stateType of stateTypes) {
          const writers = writerSteps.get(stateType) ?? [];

          // Find most recent writer for this state type
          const recentWriters = writers.filter(w => w < i);
          if (recentWriters.length > 0) {
            const producerStep = recentWriters[recentWriters.length - 1];
            const producerTool = stepResults[producerStep].step.tool;

            dependencies.push({
              producerStep,
              consumerStep: i,
              stateType,
              description: `Step ${i} (${result.step.tool}) reads ${stateType} state potentially modified by step ${producerStep} (${producerTool})`,
              verified: false,
            });
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Verify dependencies using state snapshots.
   */
  verifyDependencies(
    dependencies: StateDependency[],
    _snapshots: StateSnapshot[],
    changes: StateChange[]
  ): StateDependency[] {
    return dependencies.map(dep => {
      // Check if the producer step caused any changes
      const producerChanges = changes.filter(c => c.causedByStep === dep.producerStep);
      const verified = producerChanges.length > 0;

      return {
        ...dep,
        verified,
      };
    });
  }

  /**
   * Generate a summary of state tracking results.
   */
  async generateSummary(tracking: WorkflowStateTracking): Promise<string> {
    const parts: string[] = [];

    // Summarize tool roles
    const writers = tracking.toolRoles.filter(t => t.role === 'writer' || t.role === 'both');
    const readers = tracking.toolRoles.filter(t => t.role === 'reader' || t.role === 'both');

    if (writers.length > 0) {
      parts.push(`State writers: ${writers.map(t => t.tool).join(', ')}`);
    }
    if (readers.length > 0) {
      parts.push(`State readers: ${readers.map(t => t.tool).join(', ')}`);
    }

    // Summarize changes
    if (tracking.changes.length > 0) {
      const created = tracking.changes.filter(c => c.type === 'created').length;
      const modified = tracking.changes.filter(c => c.type === 'modified').length;
      const deleted = tracking.changes.filter(c => c.type === 'deleted').length;

      const changeParts: string[] = [];
      if (created > 0) changeParts.push(`${created} created`);
      if (modified > 0) changeParts.push(`${modified} modified`);
      if (deleted > 0) changeParts.push(`${deleted} deleted`);

      parts.push(`State changes: ${changeParts.join(', ')}`);
    } else {
      parts.push('No state changes detected');
    }

    // Summarize dependencies
    if (tracking.dependencies.length > 0) {
      const verified = tracking.dependencies.filter(d => d.verified).length;
      parts.push(`Dependencies: ${tracking.dependencies.length} inferred (${verified} verified)`);
    }

    return parts.join('. ') + '.';
  }
}
