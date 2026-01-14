import { Command } from 'commander';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover, summarizeDiscovery } from '../../discovery/discovery.js';

interface DiscoverOptions {
  json?: boolean;
  timeout?: string;
  transport?: string;
  url?: string;
  sessionId?: string;
}

/**
 * Shared action handler for discover/summary commands.
 */
async function discoverAction(command: string | undefined, args: string[], options: DiscoverOptions): Promise<void> {
  const timeout = parseInt(options.timeout ?? '30000', 10);
  const transportType = (options.transport ?? 'stdio') as 'stdio' | 'sse' | 'streamable-http';
  const isRemoteTransport = transportType === 'sse' || transportType === 'streamable-http';

  // Validate transport options
  if (isRemoteTransport && !options.url) {
    console.error(`Error: --url is required when using --transport ${transportType}`);
    process.exit(1);
  }

  if (options.url && !isRemoteTransport) {
    console.error('Error: --url requires --transport sse or --transport streamable-http');
    process.exit(1);
  }

  if (!isRemoteTransport && !command) {
    console.error('Error: Server command is required for stdio transport');
    process.exit(1);
  }

  const serverIdentifier = isRemoteTransport ? options.url! : `${command} ${args.join(' ')}`;
  console.log(`Connecting to MCP server: ${serverIdentifier}`);

  const client = new MCPClient({ timeout, transport: transportType });

  try {
    if (isRemoteTransport) {
      await client.connectRemote(options.url!, {
        transport: transportType,
        sessionId: options.sessionId,
      });
    } else {
      await client.connect(command!, args);
    }

    console.log('Discovering capabilities...\n');

    const result = await discover(client, command ?? options.url!, args);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(summarizeDiscovery(result));
    }
  } catch (error) {
    console.error('Discovery failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

export const discoverCommand = new Command('discover')
  .description('Discover MCP server capabilities without interviewing')
  .argument('[command]', 'Command to start the MCP server (not required for remote)')
  .argument('[args...]', 'Arguments to pass to the server')
  .option('--json', 'Output as JSON')
  .option('--timeout <ms>', 'Connection timeout in milliseconds', '30000')
  .option('--transport <type>', 'Transport type: stdio, sse, streamable-http', 'stdio')
  .option('--url <url>', 'URL for remote MCP server (requires --transport sse or streamable-http)')
  .option('--session-id <id>', 'Session ID for remote server authentication')
  .action(discoverAction);

/**
 * Summary command - alias for discover with friendlier name.
 */
export const summaryCommand = new Command('summary')
  .description('Quick overview of an MCP server\'s capabilities (alias for discover)')
  .argument('[command]', 'Command to start the MCP server (not required for remote)')
  .argument('[args...]', 'Arguments to pass to the server')
  .option('--json', 'Output as JSON')
  .option('--timeout <ms>', 'Connection timeout in milliseconds', '30000')
  .option('--transport <type>', 'Transport type: stdio, sse, streamable-http', 'stdio')
  .option('--url <url>', 'URL for remote MCP server (requires --transport sse or streamable-http)')
  .option('--session-id <id>', 'Session ID for remote server authentication')
  .action(discoverAction);
