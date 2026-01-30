import { Command } from 'commander';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover, summarizeDiscovery } from '../../discovery/discovery.js';
import { EXIT_CODES } from '../../constants.js';
import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../config/loader.js';
import * as output from '../output.js';

interface DiscoverOptions {
  config?: string;
  json?: boolean;
  timeout?: string;
  transport?: string;
  url?: string;
  sessionId?: string;
}

/**
 * Action handler for the discover command.
 */
async function discoverAction(command: string | undefined, args: string[], options: DiscoverOptions): Promise<void> {
  // Config is optional for discover command - use defaults if not found
  let config: BellwetherConfig | undefined;
  try {
    config = loadConfig(options.config);
  } catch (error) {
    if (!(error instanceof ConfigNotFoundError)) {
      throw error;
    }
    // Config not found - use defaults
  }

  // Default values when no config
  const defaultTimeout = 30000;
  const defaultTransport = 'stdio';

  const timeout = parseInt(options.timeout ?? '', 10) || config?.discovery?.timeout || defaultTimeout;
  const transportType = (options.transport ?? config?.discovery?.transport ?? defaultTransport) as 'stdio' | 'sse' | 'streamable-http';
  const isRemoteTransport = transportType === 'sse' || transportType === 'streamable-http';
  const outputJson = options.json ?? config?.discovery?.json ?? false;
  const remoteUrl = options.url ?? config?.discovery?.url;
  const sessionId = options.sessionId ?? config?.discovery?.sessionId;

  // Validate transport options
  if (isRemoteTransport && !remoteUrl) {
    output.error(`Error: --url is required when using --transport ${transportType}`);
    process.exit(EXIT_CODES.ERROR);
  }

  if (remoteUrl && !isRemoteTransport) {
    output.error('Error: --url requires --transport sse or --transport streamable-http');
    process.exit(EXIT_CODES.ERROR);
  }

  if (!isRemoteTransport && !command) {
    output.error('Error: Server command is required for stdio transport');
    process.exit(EXIT_CODES.ERROR);
  }

  const serverIdentifier = isRemoteTransport ? remoteUrl! : `${command} ${args.join(' ')}`;
  output.info(`Connecting to MCP server: ${serverIdentifier}`);

  const client = new MCPClient({ timeout, transport: transportType });

  try {
    if (isRemoteTransport) {
      await client.connectRemote(remoteUrl!, {
        transport: transportType,
        sessionId,
      });
    } else {
      await client.connect(command!, args);
    }

    output.info('Discovering capabilities...\n');

    const result = await discover(
      client,
      isRemoteTransport ? remoteUrl! : command!,
      isRemoteTransport ? [] : args
    );

    // Output discovery warnings (Issue D: anomaly detection)
    if (result.warnings && result.warnings.length > 0) {
      output.newline();
      for (const warning of result.warnings) {
        output.warn(`⚠ ${warning.message}`);
      }
    }

    // Output transport errors from discovery
    if (result.transportErrors && result.transportErrors.length > 0) {
      output.newline();
      output.warn('Transport errors during discovery:');
      for (const err of result.transportErrors.slice(0, 3)) {
        const typeLabel = err.category.replace(/_/g, ' ');
        output.warn(`  ✗ ${typeLabel}: ${err.message.substring(0, 100)}`);
      }
      if (result.transportErrors.length > 3) {
        output.warn(`  ... and ${result.transportErrors.length - 3} more`);
      }
    }

    if (outputJson) {
      output.json(result);
    } else {
      output.info(summarizeDiscovery(result));
    }
  } catch (error) {
    output.error(`Discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(EXIT_CODES.ERROR);
  } finally {
    await client.disconnect();
  }
}

export const discoverCommand = new Command('discover')
  .description('Discover MCP server capabilities (tools, prompts, resources)')
  .allowUnknownOption() // Allow server flags like -y for npx to pass through
  .argument('[command]', 'Command to start the MCP server (not required for remote)')
  .argument('[args...]', 'Arguments to pass to the server')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output as JSON')
  .option('--timeout <ms>', 'Connection timeout in milliseconds')
  .option('--transport <type>', 'Transport type: stdio, sse, streamable-http')
  .option('--url <url>', 'URL for remote MCP server (requires --transport sse or streamable-http)')
  .option('--session-id <id>', 'Session ID for remote server authentication')
  .action(discoverAction);
