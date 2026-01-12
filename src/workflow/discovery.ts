/**
 * Workflow discovery - uses LLM to identify likely tool workflows.
 */

import type { MCPTool } from '../transport/types.js';
import type { LLMClient } from '../llm/client.js';
import type { Workflow, WorkflowStep, WorkflowDiscoveryOptions } from './types.js';
import { getLogger } from '../logging/logger.js';

const logger = getLogger('workflow-discovery');

/**
 * Default discovery options.
 */
const DEFAULT_OPTIONS: WorkflowDiscoveryOptions = {
  maxWorkflows: 3,
  minSteps: 2,
  maxSteps: 5,
};

/**
 * Discovers likely workflows from a set of tools.
 */
export class WorkflowDiscoverer {
  private options: WorkflowDiscoveryOptions;

  constructor(
    private llm: LLMClient,
    options: WorkflowDiscoveryOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Discover workflows from available tools.
   */
  async discover(tools: MCPTool[]): Promise<Workflow[]> {
    if (tools.length < 2) {
      return [];
    }

    // Build tool summary for LLM
    const toolSummary = tools.map(t => {
      const params = this.extractParams(t);
      return `- ${t.name}: ${t.description ?? 'No description'}\n  Parameters: ${params}`;
    }).join('\n');

    const prompt = `You are analyzing a set of API tools to identify realistic usage workflows.

Available Tools:
${toolSummary}

Identify ${this.options.maxWorkflows} realistic workflows that chain these tools together.
Each workflow should represent a common usage pattern where the output of one tool feeds into another.

For each workflow:
1. Give it a short, descriptive name
2. Describe what it accomplishes
3. List ${this.options.minSteps}-${this.options.maxSteps} steps with the tool to call and how to map outputs to inputs

Respond with a JSON array:
[
  {
    "name": "Workflow name",
    "description": "What this workflow accomplishes",
    "expectedOutcome": "What should happen if successful",
    "steps": [
      {
        "tool": "tool_name",
        "description": "What this step does",
        "args": { "param": "example_value" },
        "argMapping": { "param": "$steps[0].result.field" }
      }
    ]
  }
]

Notes:
- Use $steps[N].result.path.to.field to reference output from step N
- Only use tool names that exist in the available tools list
- Create realistic example argument values
- Consider error handling and optional steps

Return ONLY the JSON array.`;

    try {
      const response = await this.llm.complete(prompt, {
        temperature: 0.4,
        responseFormat: 'json',
      });

      const workflows = this.llm.parseJSON<RawWorkflow[]>(response);
      return this.normalizeWorkflows(workflows, tools);
    } catch (error) {
      // Fallback: try to create a simple workflow from tools with related names
      logger.debug({ error }, 'LLM workflow discovery failed, using fallback');
      return this.fallbackDiscovery(tools);
    }
  }

  /**
   * Extract parameter information from a tool schema.
   */
  private extractParams(tool: MCPTool): string {
    const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] } | undefined;
    if (!schema?.properties) {
      return 'none';
    }

    const params = Object.entries(schema.properties).map(([name, prop]) => {
      const propSchema = prop as { type?: string; description?: string };
      const required = schema.required?.includes(name) ? '*' : '';
      return `${name}${required}: ${propSchema.type ?? 'any'}`;
    });

    return params.join(', ') || 'none';
  }

  /**
   * Normalize and validate discovered workflows.
   */
  private normalizeWorkflows(raw: RawWorkflow[], tools: MCPTool[]): Workflow[] {
    const toolNames = new Set(tools.map(t => t.name));
    const workflows: Workflow[] = [];

    for (const workflow of raw) {
      // Validate all steps reference valid tools
      const validSteps = workflow.steps.filter(s => toolNames.has(s.tool));
      if (validSteps.length < 2) continue;

      workflows.push({
        id: this.generateId(workflow.name),
        name: workflow.name,
        description: workflow.description ?? '',
        expectedOutcome: workflow.expectedOutcome ?? 'Workflow completes successfully',
        steps: validSteps.map(s => this.normalizeStep(s)),
        discovered: true,
      });
    }

    return workflows.slice(0, this.options.maxWorkflows);
  }

  /**
   * Normalize a workflow step.
   */
  private normalizeStep(raw: RawStep): WorkflowStep {
    return {
      tool: raw.tool,
      description: raw.description ?? `Call ${raw.tool}`,
      args: raw.args,
      argMapping: raw.argMapping,
      optional: raw.optional ?? false,
    };
  }

  /**
   * Generate a URL-safe ID from a name.
   */
  private generateId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Fallback discovery when LLM fails.
   * Tries to identify tools that might work together based on naming patterns.
   */
  private fallbackDiscovery(tools: MCPTool[]): Workflow[] {
    const workflows: Workflow[] = [];

    // Look for common CRUD patterns
    const toolsByPrefix = new Map<string, MCPTool[]>();
    for (const tool of tools) {
      const match = tool.name.match(/^(get|list|create|update|delete|search|find)_?(.+)/i);
      if (match) {
        const resource = match[2].toLowerCase();
        if (!toolsByPrefix.has(resource)) {
          toolsByPrefix.set(resource, []);
        }
        toolsByPrefix.get(resource)!.push(tool);
      }
    }

    // Create workflows for resources with multiple operations
    for (const [resource, resourceTools] of toolsByPrefix.entries()) {
      if (resourceTools.length < 2) continue;

      // Sort by typical operation order
      const opOrder = ['list', 'search', 'find', 'get', 'create', 'update', 'delete'];
      resourceTools.sort((a, b) => {
        const aOp = a.name.split('_')[0].toLowerCase();
        const bOp = b.name.split('_')[0].toLowerCase();
        return opOrder.indexOf(aOp) - opOrder.indexOf(bOp);
      });

      // Create a simple read workflow
      const readTools = resourceTools.filter(t =>
        /^(list|search|find|get)/i.test(t.name)
      ).slice(0, 2);

      if (readTools.length >= 2) {
        workflows.push({
          id: `discover_${resource}`,
          name: `Discover ${resource}`,
          description: `Search for and retrieve ${resource} details`,
          expectedOutcome: `Successfully retrieve ${resource} information`,
          steps: readTools.map(t => ({
            tool: t.name,
            description: t.description ?? `Call ${t.name}`,
          })),
          discovered: true,
        });
      }

      if (workflows.length >= (this.options.maxWorkflows ?? 3)) break;
    }

    return workflows;
  }
}

/**
 * Raw workflow from LLM response.
 */
interface RawWorkflow {
  name: string;
  description?: string;
  expectedOutcome?: string;
  steps: RawStep[];
}

/**
 * Raw step from LLM response.
 */
interface RawStep {
  tool: string;
  description?: string;
  args?: Record<string, unknown>;
  argMapping?: Record<string, string>;
  optional?: boolean;
}
