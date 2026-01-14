import { Command } from 'commander';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover, summarizeDiscovery } from '../../discovery/discovery.js';

/**
 * Shared action handler for discover/summary commands.
 */
async function discoverAction(command: string, args: string[], options: { json?: boolean; timeout?: string }): Promise<void> {
  const timeout = parseInt(options.timeout ?? '30000', 10);

  console.log(`Connecting to MCP server: ${command} ${args.join(' ')}`);

  const client = new MCPClient({ timeout });

  try {
    await client.connect(command, args);

    console.log('Discovering capabilities...\n');

    const result = await discover(client, command, args);

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
  .argument('<command>', 'Command to start the MCP server')
  .argument('[args...]', 'Arguments to pass to the server')
  .option('--json', 'Output as JSON')
  .option('--timeout <ms>', 'Connection timeout in milliseconds', '30000')
  .action(discoverAction);

/**
 * Summary command - alias for discover with friendlier name.
 */
export const summaryCommand = new Command('summary')
  .description('Quick overview of an MCP server\'s capabilities (alias for discover)')
  .argument('<command>', 'Command to start the MCP server')
  .argument('[args...]', 'Arguments to pass to the server')
  .option('--json', 'Output as JSON')
  .option('--timeout <ms>', 'Connection timeout in milliseconds', '30000')
  .action(discoverAction);
