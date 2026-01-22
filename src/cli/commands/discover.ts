import { Command } from 'commander';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover, summarizeDiscovery } from '../../discovery/discovery.js';
import { EXIT_CODES } from '../../constants.js';
import * as output from '../output.js';

interface DiscoverOptions {
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
  const timeout = parseInt(options.timeout ?? '30000', 10);
  const transportType = (options.transport ?? 'stdio') as 'stdio' | 'sse' | 'streamable-http';
  const isRemoteTransport = transportType === 'sse' || transportType === 'streamable-http';

  // Validate transport options
  if (isRemoteTransport && !options.url) {
    output.error(`Error: --url is required when using --transport ${transportType}`);
    process.exit(EXIT_CODES.ERROR);
  }

  if (options.url && !isRemoteTransport) {
    output.error('Error: --url requires --transport sse or --transport streamable-http');
    process.exit(EXIT_CODES.ERROR);
  }

  if (!isRemoteTransport && !command) {
    output.error('Error: Server command is required for stdio transport');
    process.exit(EXIT_CODES.ERROR);
  }

  const serverIdentifier = isRemoteTransport ? options.url! : `${command} ${args.join(' ')}`;
  output.info(`Connecting to MCP server: ${serverIdentifier}`);

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

    output.info('Discovering capabilities...\n');

    const result = await discover(client, command ?? options.url!, args);

    if (options.json) {
      output.json(result);
    } else {
      output.info(summarizeDiscovery(result));
    }
  } catch (error) {
    output.error('Discovery failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(EXIT_CODES.ERROR);
  } finally {
    await client.disconnect();
  }
}

export const discoverCommand = new Command('discover')
  .description('Discover MCP server capabilities (tools, prompts, resources)')
  .argument('[command]', 'Command to start the MCP server (not required for remote)')
  .argument('[args...]', 'Arguments to pass to the server')
  .option('--json', 'Output as JSON')
  .option('--timeout <ms>', 'Connection timeout in milliseconds', '30000')
  .option('--transport <type>', 'Transport type: stdio, sse, streamable-http', 'stdio')
  .option('--url <url>', 'URL for remote MCP server (requires --transport sse or streamable-http)')
  .option('--session-id <id>', 'Session ID for remote server authentication')
  .action(discoverAction);
