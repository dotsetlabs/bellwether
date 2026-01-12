import type { MCPClient } from '../transport/mcp-client.js';
import type { DiscoveryResult, ToolDetail, ToolInputSchema } from './types.js';
import type { MCPTool, MCPPrompt } from '../transport/types.js';
import { getLogger } from '../logging/logger.js';

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

  return {
    serverInfo: initResult.serverInfo,
    protocolVersion: initResult.protocolVersion,
    capabilities: initResult.capabilities,
    tools,
    prompts,
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

  lines.push(`Server: ${result.serverInfo.name} v${result.serverInfo.version}`);
  lines.push(`Protocol: ${result.protocolVersion}`);
  lines.push('');
  lines.push('Capabilities:');

  if (result.capabilities.tools) {
    lines.push(`  - Tools: ${result.tools.length} available`);
  }
  if (result.capabilities.prompts) {
    lines.push(`  - Prompts: ${result.prompts.length} available`);
  }
  if (result.capabilities.resources) {
    lines.push('  - Resources: supported');
  }
  if (result.capabilities.logging) {
    lines.push('  - Logging: supported');
  }

  if (result.tools.length > 0) {
    lines.push('');
    lines.push('Tools:');
    for (const tool of result.tools) {
      const detail = parseToolDetail(tool);
      const params = [...detail.requiredParams, ...detail.optionalParams.map(p => `${p}?`)];
      lines.push(`  - ${tool.name}(${params.join(', ')})`);
      if (tool.description) {
        lines.push(`    ${tool.description}`);
      }
    }
  }

  if (result.prompts.length > 0) {
    lines.push('');
    lines.push('Prompts:');
    for (const prompt of result.prompts) {
      lines.push(`  - ${prompt.name}`);
      if (prompt.description) {
        lines.push(`    ${prompt.description}`);
      }
    }
  }

  return lines.join('\n');
}
