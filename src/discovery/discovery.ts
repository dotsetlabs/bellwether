import type { MCPClient } from '../transport/mcp-client.js';
import type { DiscoveryResult, ToolDetail, ToolInputSchema } from './types.js';
import type { MCPTool, MCPPrompt, MCPResource } from '../transport/types.js';
import { getLogger } from '../logging/logger.js';
import { DISPLAY_LIMITS } from '../constants.js';

const logger = getLogger('discovery');

/**
 * Discover an MCP server's capabilities by connecting and querying it.
 */
export async function discover(
  client: MCPClient,
  command: string,
  args: string[]
): Promise<DiscoveryResult> {
  // Initialize connection
  const initResult = await client.initialize();

  // Discover tools
  let tools: MCPTool[] = [];
  if (initResult.capabilities.tools) {
    try {
      tools = await client.listTools();
    } catch (error) {
      logger.error({ error }, 'Failed to list tools');
    }
  }

  // Discover prompts
  let prompts: MCPPrompt[] = [];
  if (initResult.capabilities.prompts) {
    try {
      prompts = await client.listPrompts();
    } catch (error) {
      logger.error({ error }, 'Failed to list prompts');
    }
  }

  // Discover resources
  let resources: MCPResource[] = [];
  if (initResult.capabilities.resources) {
    try {
      resources = await client.listResources();
    } catch (error) {
      logger.error({ error }, 'Failed to list resources');
    }
  }

  return {
    serverInfo: initResult.serverInfo,
    protocolVersion: initResult.protocolVersion,
    capabilities: initResult.capabilities,
    tools,
    prompts,
    resources,
    timestamp: new Date(),
    serverCommand: command,
    serverArgs: args,
  };
}

/**
 * Parse tool information into a more detailed structure.
 */
export function parseToolDetail(tool: MCPTool): ToolDetail {
  const schema = tool.inputSchema as ToolInputSchema | undefined;

  const requiredParams: string[] = schema?.required ?? [];
  const optionalParams: string[] = [];

  if (schema?.properties) {
    for (const param of Object.keys(schema.properties)) {
      if (!requiredParams.includes(param)) {
        optionalParams.push(param);
      }
    }
  }

  return {
    name: tool.name,
    description: tool.description ?? 'No description provided',
    inputSchema: schema ?? null,
    requiredParams,
    optionalParams,
  };
}

/**
 * Generate a summary of discovered capabilities.
 */
export function summarizeDiscovery(result: DiscoveryResult): string {
  const lines: string[] = [];

  // Header with box drawing
  lines.push('┌─────────────────────────────────────────────────────────────────┐');
  lines.push(`│  ${result.serverInfo.name} v${result.serverInfo.version}`.padEnd(66) + '│');
  lines.push('└─────────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Server info
  lines.push(`Protocol Version: ${result.protocolVersion}`);
  lines.push(`Server Command: ${result.serverCommand} ${result.serverArgs.join(' ')}`);
  lines.push('');

  // Capabilities overview
  lines.push('CAPABILITIES');
  lines.push('────────────');
  const caps: string[] = [];
  if (result.capabilities.tools) caps.push(`${result.tools.length} Tools`);
  if (result.capabilities.prompts) caps.push(`${result.prompts.length} Prompts`);
  if (result.capabilities.resources) caps.push(`${(result.resources ?? []).length} Resources`);
  if (result.capabilities.logging) caps.push('Logging');
  lines.push(caps.join(' • ') || 'None discovered');
  lines.push('');

  // Tools section
  if (result.tools.length > 0) {
    lines.push('TOOLS');
    lines.push('─────');
    for (const tool of result.tools) {
      const detail = parseToolDetail(tool);
      const requiredStr = detail.requiredParams.length > 0
        ? detail.requiredParams.join(', ')
        : '';
      const optionalStr = detail.optionalParams.length > 0
        ? detail.optionalParams.map(p => `${p}?`).join(', ')
        : '';
      const allParams = [requiredStr, optionalStr].filter(Boolean).join(', ');

      lines.push(`  ${tool.name}(${allParams})`);
      if (tool.description) {
        // Truncate long descriptions
        const desc = tool.description.length > DISPLAY_LIMITS.DESCRIPTION_MAX_LENGTH
          ? tool.description.substring(0, DISPLAY_LIMITS.DESCRIPTION_TRUNCATE_AT) + '...'
          : tool.description;
        lines.push(`    └─ ${desc}`);
      }
    }
    lines.push('');
  }

  // Prompts section
  if (result.prompts.length > 0) {
    lines.push('PROMPTS');
    lines.push('───────');
    for (const prompt of result.prompts) {
      const args = prompt.arguments?.map(a => {
        return a.required ? a.name : `${a.name}?`;
      }).join(', ') ?? '';
      lines.push(`  ${prompt.name}(${args})`);
      if (prompt.description) {
        const desc = prompt.description.length > DISPLAY_LIMITS.DESCRIPTION_MAX_LENGTH
          ? prompt.description.substring(0, DISPLAY_LIMITS.DESCRIPTION_TRUNCATE_AT) + '...'
          : prompt.description;
        lines.push(`    └─ ${desc}`);
      }
    }
    lines.push('');
  }

  // Resources section
  const resources = result.resources ?? [];
  if (resources.length > 0) {
    lines.push('RESOURCES');
    lines.push('─────────');
    for (const resource of resources) {
      const mimeType = resource.mimeType ? ` [${resource.mimeType}]` : '';
      lines.push(`  ${resource.name}${mimeType}`);
      lines.push(`    URI: ${resource.uri}`);
      if (resource.description) {
        const desc = resource.description.length > DISPLAY_LIMITS.DESCRIPTION_MAX_LENGTH
          ? resource.description.substring(0, DISPLAY_LIMITS.DESCRIPTION_TRUNCATE_AT) + '...'
          : resource.description;
        lines.push(`    └─ ${desc}`);
      }
    }
    lines.push('');
  }

  // Quick start hint
  lines.push('QUICK START');
  lines.push('───────────');
  lines.push(`  bellwether check ${result.serverCommand} ${result.serverArgs.join(' ')}`);
  lines.push(`  bellwether explore ${result.serverCommand} ${result.serverArgs.join(' ')}`);
  lines.push('');
  lines.push('  Commands:');
  lines.push('    check    Schema validation and drift detection (free, fast)');
  lines.push('    explore  LLM-powered behavioral exploration');

  return lines.join('\n');
}
