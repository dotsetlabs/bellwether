/**
 * Workflow auto-generator - generates workflow YAML from discovered tools.
 *
 * This module analyzes tool descriptions and schemas to automatically
 * generate test workflows that represent common usage patterns.
 * Unlike the LLM-powered WorkflowDiscoverer, this uses heuristics
 * for deterministic workflow generation in check mode.
 */

import type { MCPTool } from '../transport/types.js';
import type { Workflow, WorkflowStep, WorkflowDiscoveryOptions } from './types.js';
import { WORKFLOW } from '../constants.js';

/**
 * Default options for workflow generation.
 */
const DEFAULT_OPTIONS: Required<WorkflowDiscoveryOptions> = {
  maxWorkflows: WORKFLOW.MAX_DISCOVERED_WORKFLOWS,
  minSteps: WORKFLOW.MIN_WORKFLOW_STEPS,
  maxSteps: WORKFLOW.MAX_WORKFLOW_STEPS,
};

/**
 * Common CRUD operation prefixes for pattern matching.
 */
const CRUD_PREFIXES = {
  create: ['create', 'add', 'new', 'insert', 'post', 'make'],
  read: ['get', 'read', 'fetch', 'retrieve', 'find', 'list', 'search', 'query'],
  update: ['update', 'edit', 'modify', 'patch', 'set', 'change'],
  delete: ['delete', 'remove', 'destroy', 'clear', 'reset'],
} as const;

/**
 * Workflow relationship patterns found in tool descriptions.
 */
const RELATIONSHIP_PATTERNS = [
  { pattern: /after\s+(?:calling\s+)?['"`]?(\w+)['"`]?/i, type: 'after' },
  { pattern: /requires?\s+(?:output\s+from\s+)?['"`]?(\w+)['"`]?/i, type: 'requires' },
  { pattern: /use\s+(?:the\s+)?(?:result|output)\s+(?:of|from)\s+['"`]?(\w+)['"`]?/i, type: 'uses' },
  { pattern: /(?:first|before)\s+(?:call\s+)?['"`]?(\w+)['"`]?/i, type: 'after' },
  { pattern: /chain\s+(?:with\s+)?['"`]?(\w+)['"`]?/i, type: 'chains' },
] as const;

/**
 * Common parameter patterns that suggest data flow.
 */
const PARAMETER_FLOW_PATTERNS = [
  { paramPattern: /^(item|access|session|auth)_?token$/i, sourceField: 'token' },
  { paramPattern: /^(item|access|session)_?id$/i, sourceField: 'id' },
  { paramPattern: /^(public|link)_?token$/i, sourceField: 'link_token' },
  { paramPattern: /^(cursor|next_?cursor|page_?token)$/i, sourceField: 'next_cursor' },
  { paramPattern: /^(file|resource|entity)_?path$/i, sourceField: 'path' },
] as const;

/**
 * Generate workflows from available tools using pattern matching.
 *
 * This function analyzes tool names, descriptions, and schemas to
 * identify common workflow patterns like CRUD operations, auth flows,
 * and chained data processing.
 *
 * @param tools - Available MCP tools
 * @param options - Generation options
 * @returns Array of generated workflows
 */
export function generateWorkflowsFromTools(
  tools: MCPTool[],
  options: WorkflowDiscoveryOptions = {}
): Workflow[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (tools.length < 2) {
    return [];
  }

  const workflows: Workflow[] = [];

  // Strategy 1: Find CRUD patterns
  const crudWorkflows = findCrudWorkflows(tools, opts);
  workflows.push(...crudWorkflows);

  // Strategy 2: Find relationship-based workflows from descriptions
  const relationshipWorkflows = findRelationshipWorkflows(tools, opts);
  workflows.push(...relationshipWorkflows);

  // Strategy 3: Find parameter-based workflows (data flow patterns)
  const parameterWorkflows = findParameterFlowWorkflows(tools, opts);
  workflows.push(...parameterWorkflows);

  // Deduplicate workflows by ID
  const seen = new Set<string>();
  const uniqueWorkflows = workflows.filter(w => {
    if (seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });

  // Limit to max workflows
  return uniqueWorkflows.slice(0, opts.maxWorkflows);
}

/**
 * Find CRUD-based workflows by grouping tools by resource type.
 */
function findCrudWorkflows(tools: MCPTool[], opts: Required<WorkflowDiscoveryOptions>): Workflow[] {
  const workflows: Workflow[] = [];
  const toolsByResource = groupToolsByResource(tools);

  for (const [resource, resourceTools] of toolsByResource.entries()) {
    // Need at least 2 tools for a workflow
    if (resourceTools.length < opts.minSteps) continue;

    // Try to build create-read workflow
    const createTool = resourceTools.find(t => matchesCrudOperation(t.name, 'create'));
    const readTool = resourceTools.find(t => matchesCrudOperation(t.name, 'read'));

    if (createTool && readTool) {
      workflows.push({
        id: `crud_create_read_${resource}`,
        name: `Create and Read ${capitalize(resource)}`,
        description: `Create a new ${resource} and verify it can be retrieved`,
        expectedOutcome: `Successfully create and read ${resource}`,
        steps: [
          {
            tool: createTool.name,
            description: `Create a new ${resource}`,
            args: generateMinimalArgs(createTool),
          },
          {
            tool: readTool.name,
            description: `Retrieve the created ${resource}`,
            argMapping: inferArgMapping(createTool, readTool, 0),
          },
        ],
        discovered: true,
      });
    }

    // Try to build list workflow
    const listTool = resourceTools.find(t => /^(list|get_all|search)_/i.test(t.name));
    if (listTool && readTool && listTool !== readTool) {
      workflows.push({
        id: `crud_list_read_${resource}`,
        name: `List and Read ${capitalize(resource)}`,
        description: `List ${resource}s and get details of the first one`,
        expectedOutcome: `Successfully list and retrieve ${resource} details`,
        steps: [
          {
            tool: listTool.name,
            description: `List available ${resource}s`,
            args: generateMinimalArgs(listTool),
          },
          {
            tool: readTool.name,
            description: `Get details of first ${resource}`,
            argMapping: inferListToDetailMapping(listTool, readTool),
          },
        ],
        discovered: true,
      });
    }
  }

  return workflows;
}

/**
 * Find workflows based on relationship patterns in descriptions.
 */
function findRelationshipWorkflows(
  tools: MCPTool[],
  opts: Required<WorkflowDiscoveryOptions>
): Workflow[] {
  const workflows: Workflow[] = [];
  const toolsByName = new Map(tools.map(t => [t.name.toLowerCase(), t]));

  for (const tool of tools) {
    const description = tool.description || '';

    for (const { pattern, type } of RELATIONSHIP_PATTERNS) {
      const match = description.match(pattern);
      if (!match) continue;

      const referencedToolName = match[1].toLowerCase();
      const referencedTool = toolsByName.get(referencedToolName);

      if (!referencedTool || referencedTool.name === tool.name) continue;

      // Build workflow based on relationship type
      const steps: WorkflowStep[] = [];

      if (type === 'after' || type === 'requires' || type === 'uses') {
        // Referenced tool comes first
        steps.push({
          tool: referencedTool.name,
          description: referencedTool.description || `Call ${referencedTool.name}`,
          args: generateMinimalArgs(referencedTool),
        });
        steps.push({
          tool: tool.name,
          description: tool.description || `Call ${tool.name}`,
          argMapping: inferArgMapping(referencedTool, tool, 0),
        });
      } else {
        // Current tool comes first (chains pattern)
        steps.push({
          tool: tool.name,
          description: tool.description || `Call ${tool.name}`,
          args: generateMinimalArgs(tool),
        });
        steps.push({
          tool: referencedTool.name,
          description: referencedTool.description || `Call ${referencedTool.name}`,
          argMapping: inferArgMapping(tool, referencedTool, 0),
        });
      }

      if (steps.length >= opts.minSteps) {
        const workflowId = `rel_${tool.name}_${referencedTool.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        workflows.push({
          id: workflowId,
          name: `${capitalize(steps[0].tool)} to ${capitalize(steps[1].tool)}`,
          description: `Workflow discovered from tool description relationship`,
          expectedOutcome: `Successfully chain ${steps[0].tool} and ${steps[1].tool}`,
          steps,
          discovered: true,
        });
      }
    }
  }

  return workflows;
}

/**
 * Find workflows based on parameter name patterns that suggest data flow.
 */
function findParameterFlowWorkflows(
  tools: MCPTool[],
  _opts: Required<WorkflowDiscoveryOptions>
): Workflow[] {
  const workflows: Workflow[] = [];

  // Map tools by what they might produce based on description/name
  const producerTools = new Map<string, MCPTool>();
  for (const tool of tools) {
    const description = (tool.description || '').toLowerCase();
    const name = tool.name.toLowerCase();

    // Tools that create/generate tokens
    if (/(?:create|generate|get).*(?:token|link)/i.test(name) ||
        /returns?\s+(?:a\s+)?(?:link_?)?token/i.test(description)) {
      producerTools.set('token', tool);
    }

    // Tools that list/return items with IDs
    if (/^list_|^get_all_|^search_/i.test(name)) {
      const resource = extractResourceName(name);
      if (resource) {
        producerTools.set(`${resource}_list`, tool);
      }
    }
  }

  // Find consumer tools and create workflows
  for (const tool of tools) {
    const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] } | undefined;
    if (!schema?.properties) continue;

    for (const paramName of Object.keys(schema.properties)) {
      for (const { paramPattern, sourceField } of PARAMETER_FLOW_PATTERNS) {
        if (!paramPattern.test(paramName)) continue;

        // Find a producer for this parameter
        const producerKey = sourceField === 'token' ? 'token' : `${extractResourceName(paramName)}_list`;
        const producer = producerTools.get(producerKey) || producerTools.get('token');

        if (!producer || producer.name === tool.name) continue;

        const workflowId = `flow_${producer.name}_${tool.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');

        // Check if we already have this workflow
        if (workflows.some(w => w.id === workflowId)) continue;

        workflows.push({
          id: workflowId,
          name: `${capitalize(producer.name)} to ${capitalize(tool.name)}`,
          description: `Data flow workflow: ${producer.name} produces input for ${tool.name}`,
          expectedOutcome: `Successfully pass ${sourceField} from ${producer.name} to ${tool.name}`,
          steps: [
            {
              tool: producer.name,
              description: producer.description || `Call ${producer.name}`,
              args: generateMinimalArgs(producer),
            },
            {
              tool: tool.name,
              description: tool.description || `Call ${tool.name}`,
              argMapping: {
                [paramName]: `$steps[0].result.${sourceField}`,
              },
            },
          ],
          discovered: true,
        });

        // Only one workflow per tool pair
        break;
      }
    }
  }

  return workflows;
}

/**
 * Group tools by their inferred resource type.
 */
function groupToolsByResource(tools: MCPTool[]): Map<string, MCPTool[]> {
  const groups = new Map<string, MCPTool[]>();

  for (const tool of tools) {
    const resource = extractResourceName(tool.name);
    if (!resource) continue;

    if (!groups.has(resource)) {
      groups.set(resource, []);
    }
    groups.get(resource)!.push(tool);
  }

  return groups;
}

/**
 * Extract resource name from a tool name (e.g., "get_user" -> "user").
 */
function extractResourceName(toolName: string): string | null {
  // Remove common prefixes
  let name = toolName.toLowerCase();

  for (const prefixes of Object.values(CRUD_PREFIXES)) {
    for (const prefix of prefixes) {
      if (name.startsWith(`${prefix}_`)) {
        name = name.slice(prefix.length + 1);
        break;
      }
      if (name.startsWith(prefix)) {
        name = name.slice(prefix.length);
        break;
      }
    }
  }

  // Clean up remaining underscores and pluralization
  name = name.replace(/^_+|_+$/g, '');
  name = name.replace(/s$/, ''); // Simple depluralization

  return name || null;
}

/**
 * Check if a tool name matches a CRUD operation type.
 */
function matchesCrudOperation(
  toolName: string,
  operation: keyof typeof CRUD_PREFIXES
): boolean {
  const name = toolName.toLowerCase();
  return CRUD_PREFIXES[operation].some(prefix =>
    name.startsWith(`${prefix}_`) || name.startsWith(prefix)
  );
}

/**
 * Generate minimal arguments for a tool based on its schema.
 * Only includes required parameters with placeholder values.
 */
function generateMinimalArgs(tool: MCPTool): Record<string, unknown> {
  const schema = tool.inputSchema as {
    properties?: Record<string, { type?: string; default?: unknown; enum?: unknown[] }>;
    required?: string[];
  } | undefined;

  if (!schema?.properties || !schema.required) {
    return {};
  }

  const args: Record<string, unknown> = {};

  for (const reqParam of schema.required) {
    const propSchema = schema.properties[reqParam];
    if (!propSchema) continue;

    // Use default if available
    if (propSchema.default !== undefined) {
      args[reqParam] = propSchema.default;
      continue;
    }

    // Use first enum value if available
    if (propSchema.enum && propSchema.enum.length > 0) {
      args[reqParam] = propSchema.enum[0];
      continue;
    }

    // Generate placeholder based on type
    switch (propSchema.type) {
      case 'string':
        args[reqParam] = `test_${reqParam}`;
        break;
      case 'number':
      case 'integer':
        args[reqParam] = 1;
        break;
      case 'boolean':
        args[reqParam] = true;
        break;
      case 'array':
        args[reqParam] = [];
        break;
      case 'object':
        args[reqParam] = {};
        break;
      default:
        args[reqParam] = `test_${reqParam}`;
    }
  }

  return args;
}

/**
 * Infer argument mapping from a source tool to a target tool.
 */
function inferArgMapping(
  _sourceTool: MCPTool,
  targetTool: MCPTool,
  sourceStepIndex: number
): Record<string, string> | undefined {
  const targetSchema = targetTool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  } | undefined;

  if (!targetSchema?.properties) return undefined;

  const mapping: Record<string, string> = {};
  const targetParams = Object.keys(targetSchema.properties);

  // Common result field names to try
  const commonResultFields = ['id', 'result', 'data', 'token', 'value', 'output'];

  for (const param of targetParams) {
    const paramLower = param.toLowerCase();

    // Look for ID fields
    if (paramLower.includes('id')) {
      mapping[param] = `$steps[${sourceStepIndex}].result.id`;
    }
    // Look for token fields
    else if (paramLower.includes('token')) {
      const tokenType = paramLower.replace('_token', '').replace('token', '');
      if (tokenType) {
        mapping[param] = `$steps[${sourceStepIndex}].result.${tokenType}_token`;
      } else {
        mapping[param] = `$steps[${sourceStepIndex}].result.token`;
      }
    }
    // Look for matching field names
    else if (commonResultFields.includes(paramLower)) {
      mapping[param] = `$steps[${sourceStepIndex}].result.${paramLower}`;
    }
  }

  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

/**
 * Infer mapping from a list operation to a detail operation.
 */
function inferListToDetailMapping(
  listTool: MCPTool,
  detailTool: MCPTool
): Record<string, string> | undefined {
  const detailSchema = detailTool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  } | undefined;

  if (!detailSchema?.properties) return undefined;

  const mapping: Record<string, string> = {};
  const detailParams = Object.keys(detailSchema.properties);

  for (const param of detailParams) {
    const paramLower = param.toLowerCase();

    // Map ID parameters to first item in list
    if (paramLower.includes('id')) {
      // Infer the array name from the list tool name
      const resource = extractResourceName(listTool.name);
      const arrayName = resource ? `${resource}s` : 'items';
      mapping[param] = `$steps[0].result.${arrayName}[0].id`;
    }
  }

  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

/**
 * Capitalize the first letter of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

/**
 * Generate YAML content for workflows.
 */
export function generateWorkflowYamlContent(workflows: Workflow[]): string {
  const lines: string[] = [
    '# Auto-generated workflow definitions',
    '# Generated by: bellwether check --generate-workflows',
    '# ',
    '# Usage: bellwether check --workflows ./bellwether-workflows.yaml',
    '# ',
    '# You can modify these workflows to add assertions, customize arguments,',
    '# or add additional steps. See the Bellwether documentation for more details.',
    '',
  ];

  for (let i = 0; i < workflows.length; i++) {
    const workflow = workflows[i];

    if (i > 0) {
      lines.push('---');
    }

    lines.push(`id: ${workflow.id}`);
    lines.push(`name: "${escapeYamlString(workflow.name)}"`);
    lines.push(`description: "${escapeYamlString(workflow.description)}"`);
    lines.push(`expectedOutcome: "${escapeYamlString(workflow.expectedOutcome)}"`);
    lines.push('');
    lines.push('steps:');

    for (const step of workflow.steps) {
      lines.push(`  - tool: ${step.tool}`);
      lines.push(`    description: "${escapeYamlString(step.description)}"`);

      if (step.args && Object.keys(step.args).length > 0) {
        lines.push('    args:');
        for (const [key, value] of Object.entries(step.args)) {
          const formattedValue = formatYamlValue(value);
          lines.push(`      ${key}: ${formattedValue}`);
        }
      }

      if (step.argMapping && Object.keys(step.argMapping).length > 0) {
        lines.push('    argMapping:');
        for (const [key, value] of Object.entries(step.argMapping)) {
          lines.push(`      ${key}: "${value}"`);
        }
      }

      if (step.optional) {
        lines.push('    optional: true');
      }

      // Add empty assertions section as a template
      lines.push('    # assertions:');
      lines.push('    #   - path: "$.result"');
      lines.push('    #     condition: exists');
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Escape a string for YAML double-quoted strings.
 */
function escapeYamlString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Format a value for YAML output.
 */
function formatYamlValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '~';
  if (typeof value === 'string') return `"${escapeYamlString(value)}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    if (Object.keys(value).length === 0) return '{}';
    return JSON.stringify(value);
  }
  return String(value);
}
