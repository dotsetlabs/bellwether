import type { MCPClient } from '../transport/mcp-client.js';
import type {
  DiscoveryResult,
  ToolDetail,
  ToolInputSchema,
  TransportErrorRecord,
  DiscoveryWarning,
} from './types.js';
import type { MCPTool, MCPPrompt, MCPResource, MCPResourceTemplate } from '../transport/types.js';
import { getLogger } from '../logging/logger.js';
import { DISPLAY_LIMITS, MCP } from '../constants.js';
import { getFeatureFlags } from '../protocol/index.js';

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
  const capabilityWarnings: DiscoveryWarning[] = [];

  // Discover tools
  let tools: MCPTool[] = [];
  if (initResult.capabilities.tools) {
    try {
      tools = await client.listTools();
    } catch (error) {
      logger.error({ error }, 'Failed to list tools');
      throw new Error(
        `Failed to list tools despite advertised tools capability: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Discover prompts
  let prompts: MCPPrompt[] = [];
  if (initResult.capabilities.prompts) {
    try {
      prompts = await client.listPrompts();
    } catch (error) {
      logger.error({ error }, 'Failed to list prompts');
      capabilityWarnings.push({
        level: 'warning',
        message: `Failed to list prompts: ${error instanceof Error ? error.message : String(error)}`,
        recommendation: 'Check server prompt implementation and transport health.',
      });
    }
  }

  // Discover resources
  let resources: MCPResource[] = [];
  let resourceTemplates: MCPResourceTemplate[] = [];
  if (initResult.capabilities.resources) {
    try {
      resources = await client.listResources();
    } catch (error) {
      logger.error({ error }, 'Failed to list resources');
      capabilityWarnings.push({
        level: 'warning',
        message: `Failed to list resources: ${
          error instanceof Error ? error.message : String(error)
        }`,
        recommendation: 'Check server resource implementation and transport health.',
      });
    }
    try {
      resourceTemplates = await client.listResourceTemplates();
    } catch (error) {
      logger.debug({ error }, 'Failed to list resource templates (server may not support them)');
      capabilityWarnings.push({
        level: 'info',
        message: `Failed to list resource templates: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  // Collect transport errors from the client
  const transportErrors: TransportErrorRecord[] = client.getTransportErrors();

  // Generate warnings based on discovery results
  const warnings: DiscoveryWarning[] = [
    ...capabilityWarnings,
    ...generateDiscoveryWarnings(
      initResult.capabilities,
      tools,
      prompts,
      resources,
      transportErrors,
      initResult.protocolVersion
    ),
  ];

  return {
    serverInfo: initResult.serverInfo,
    protocolVersion: initResult.protocolVersion,
    capabilities: initResult.capabilities,
    tools,
    prompts,
    resources,
    resourceTemplates,
    instructions: initResult.instructions,
    timestamp: new Date(),
    serverCommand: command,
    serverArgs: args,
    transportErrors: transportErrors.length > 0 ? transportErrors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Generate warnings based on discovery results.
 */
function generateDiscoveryWarnings(
  capabilities: {
    tools?: unknown;
    prompts?: unknown;
    resources?: unknown;
    completions?: unknown;
    tasks?: unknown;
  },
  tools: MCPTool[],
  prompts: MCPPrompt[],
  resources: MCPResource[],
  transportErrors: TransportErrorRecord[],
  protocolVersion?: string
): DiscoveryWarning[] {
  const warnings: DiscoveryWarning[] = [];

  // Warn if server advertises tools capability but has no tools
  if (capabilities.tools && tools.length === 0) {
    warnings.push({
      level: 'warning',
      message: 'Server advertises tools capability but no tools were discovered',
      recommendation:
        'Check if the server requires configuration or environment setup to expose tools',
    });
  }

  // Warn if server advertises prompts capability but has no prompts
  if (capabilities.prompts && prompts.length === 0) {
    warnings.push({
      level: 'info',
      message: 'Server advertises prompts capability but no prompts were discovered',
    });
  }

  // Warn if server advertises resources capability but has no resources
  if (capabilities.resources && resources.length === 0) {
    warnings.push({
      level: 'info',
      message: 'Server advertises resources capability but no resources were discovered',
    });
  }

  // Warn about transport errors that indicate server bugs
  const serverBugErrors = transportErrors.filter((e) => e.likelyServerBug);
  if (serverBugErrors.length > 0) {
    warnings.push({
      level: 'error',
      message: `${serverBugErrors.length} transport error(s) detected that likely indicate server bugs`,
      recommendation: 'Review the Transport Issues section for details on protocol violations',
    });
  }

  // Warn if there were non-bug transport errors
  const envErrors = transportErrors.filter((e) => !e.likelyServerBug);
  if (envErrors.length > 0) {
    warnings.push({
      level: 'warning',
      message: `${envErrors.length} transport error(s) detected (likely environment/configuration issues)`,
      recommendation:
        'Check server process configuration and ensure all dependencies are installed',
    });
  }

  // Warn about older protocol version
  if (protocolVersion && protocolVersion !== MCP.PROTOCOL_VERSION) {
    warnings.push({
      level: 'info',
      message: `Server negotiated protocol version ${protocolVersion} (latest: ${MCP.PROTOCOL_VERSION})`,
      recommendation:
        'Version-gated features not supported by this server will be excluded from analysis.',
    });
  }

  return warnings;
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
  lines.push(`${`│  ${result.serverInfo.name} v${result.serverInfo.version}`.padEnd(66)}│`);
  lines.push('└─────────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Server info
  lines.push(`Protocol Version: ${result.protocolVersion}`);
  if (result.protocolVersion !== MCP.PROTOCOL_VERSION) {
    lines.push(`  (Server protocol; bellwether supports up to ${MCP.PROTOCOL_VERSION})`);
  }
  lines.push(`Server Command: ${result.serverCommand} ${result.serverArgs.join(' ')}`);
  lines.push('');

  // Server instructions
  if (result.instructions) {
    lines.push('INSTRUCTIONS');
    lines.push('────────────');
    lines.push(result.instructions);
    lines.push('');
  }

  // Capabilities overview
  lines.push('CAPABILITIES');
  lines.push('────────────');
  const caps: string[] = [];
  if (result.capabilities.tools) caps.push(`${result.tools.length} Tools`);
  if (result.capabilities.prompts) caps.push(`${result.prompts.length} Prompts`);
  if (result.capabilities.resources) {
    const resourceCount = (result.resources ?? []).length;
    const templateCount = (result.resourceTemplates ?? []).length;
    const resourceParts = [`${resourceCount} Resources`];
    if (templateCount > 0) {
      resourceParts.push(`${templateCount} Templates`);
    }
    caps.push(resourceParts.join(', '));
  }
  if (result.capabilities.logging) caps.push('Logging');
  const features = getFeatureFlags(result.protocolVersion);
  if (result.capabilities.completions && features.completions) caps.push('Completions');
  if (result.capabilities.tasks && features.tasks) caps.push('Tasks');
  lines.push(caps.join(' • ') || 'None discovered');
  lines.push('');

  // Tools section
  if (result.tools.length > 0) {
    lines.push('TOOLS');
    lines.push('─────');
    for (const tool of result.tools) {
      const detail = parseToolDetail(tool);
      const requiredStr = detail.requiredParams.length > 0 ? detail.requiredParams.join(', ') : '';
      const optionalStr =
        detail.optionalParams.length > 0
          ? detail.optionalParams.map((p) => `${p}?`).join(', ')
          : '';
      const allParams = [requiredStr, optionalStr].filter(Boolean).join(', ');

      const displayName = tool.title ?? tool.name;
      lines.push(`  ${displayName}(${allParams})`);
      if (tool.description) {
        // Truncate long descriptions
        const desc =
          tool.description.length > DISPLAY_LIMITS.DESCRIPTION_MAX_LENGTH
            ? `${tool.description.substring(0, DISPLAY_LIMITS.DESCRIPTION_TRUNCATE_AT)}...`
            : tool.description;
        lines.push(`    └─ ${desc}`);
      }
      // Show annotations if present
      const hints: string[] = [];
      if (tool.annotations?.readOnlyHint) hints.push('read-only');
      if (tool.annotations?.destructiveHint) hints.push('destructive');
      if (tool.annotations?.idempotentHint) hints.push('idempotent');
      if (tool.annotations?.openWorldHint) hints.push('open-world');
      if (tool.outputSchema) hints.push('structured-output');
      if (hints.length > 0) {
        lines.push(`    [${hints.join(', ')}]`);
      }
    }
    lines.push('');
  }

  // Prompts section
  if (result.prompts.length > 0) {
    lines.push('PROMPTS');
    lines.push('───────');
    for (const prompt of result.prompts) {
      const args =
        prompt.arguments
          ?.map((a) => {
            return a.required ? a.name : `${a.name}?`;
          })
          .join(', ') ?? '';
      lines.push(`  ${prompt.name}(${args})`);
      if (prompt.description) {
        const desc =
          prompt.description.length > DISPLAY_LIMITS.DESCRIPTION_MAX_LENGTH
            ? `${prompt.description.substring(0, DISPLAY_LIMITS.DESCRIPTION_TRUNCATE_AT)}...`
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
        const desc =
          resource.description.length > DISPLAY_LIMITS.DESCRIPTION_MAX_LENGTH
            ? `${resource.description.substring(0, DISPLAY_LIMITS.DESCRIPTION_TRUNCATE_AT)}...`
            : resource.description;
        lines.push(`    └─ ${desc}`);
      }
    }
    lines.push('');
  }

  // Resource templates section
  const resourceTemplates = result.resourceTemplates ?? [];
  if (resourceTemplates.length > 0) {
    lines.push('RESOURCE TEMPLATES');
    lines.push('──────────────────');
    for (const template of resourceTemplates) {
      const mimeType = template.mimeType ? ` [${template.mimeType}]` : '';
      lines.push(`  ${template.name}${mimeType}`);
      lines.push(`    URI Template: ${template.uriTemplate}`);
      if (template.description) {
        const desc =
          template.description.length > DISPLAY_LIMITS.DESCRIPTION_MAX_LENGTH
            ? `${template.description.substring(0, DISPLAY_LIMITS.DESCRIPTION_TRUNCATE_AT)}...`
            : template.description;
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
