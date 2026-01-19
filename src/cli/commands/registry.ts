/**
 * Registry command - search and lookup MCP servers from the registry.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  RegistryClient,
  generateRunCommand,
} from '../../registry/index.js';
import type { RegistryServerEntry } from '../../registry/index.js';
import * as output from '../output.js';

/**
 * Create a new registry command instance.
 * Useful for testing where fresh command instances are needed.
 */
export function createRegistryCommand(): Command {
  return new Command('registry')
    .alias('lookup')
    .description('Search the MCP Registry for servers')
    .argument('[query]', 'Search query (server name or keyword)')
    .option('-l, --limit <number>', 'Maximum results to show', '10')
    .option('--json', 'Output as JSON')
    .action(async (query: string | undefined, options: { limit: string; json: boolean }) => {
      await handleRegistry(query, options);
    });
}

export const registryCommand = createRegistryCommand();

async function handleRegistry(
  query: string | undefined,
  options: { limit: string; json: boolean }
): Promise<void> {
  const client = new RegistryClient();
  const limit = parseInt(options.limit, 10) || 10;

  try {
    let servers: RegistryServerEntry[];

    if (query) {
      output.info(chalk.gray(`Searching for "${query}"...`));
      servers = await client.searchServers(query, limit);
    } else {
      output.info(chalk.gray('Fetching popular servers...'));
      const response = await client.listServers({ limit });
      servers = response.servers;
    }

    if (options.json) {
      output.json(servers);
      return;
    }

    if (servers.length === 0) {
      output.info(chalk.yellow('No servers found.'));
      if (query) {
        output.info(chalk.gray(`Try a different search term or browse all servers with: bellwether registry`));
      }
      return;
    }

    // Header
    output.newline();
    output.info(chalk.bold(`Found ${servers.length} server(s)`));
    output.info('─'.repeat(60));
    output.newline();

    // Display each server
    for (const entry of servers) {
      displayServer(entry);
      output.newline();
    }

    // Footer with usage hint
    output.info('─'.repeat(60));
    output.info(chalk.gray('To test a server, run:'));
    if (servers.length > 0) {
      const firstServer = servers[0].server;
      const runCmd = generateRunCommand(firstServer);
      if (runCmd) {
        output.info(chalk.cyan(`  bellwether test ${runCmd}`));
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      output.error(chalk.red(`Error: ${error.message}`));
    } else {
      output.error(chalk.red('An unexpected error occurred'));
    }
    process.exit(1);
  }
}

function displayServer(entry: RegistryServerEntry): void {
  const { server } = entry;
  const meta = entry._meta?.['io.modelcontextprotocol.registry/official'];

  // Name and version
  let nameLine = chalk.bold.blue(server.name);
  if (server.version) {
    nameLine += chalk.gray(` v${server.version}`);
  }
  if (meta?.status === 'active') {
    nameLine += chalk.green(' ✓');
  }
  output.info(nameLine);

  // Description
  if (server.description) {
    output.info(chalk.white(`  ${server.description}`));
  }

  // Run command
  const runCmd = generateRunCommand(server);
  if (runCmd) {
    output.info(chalk.gray('  Run: ') + chalk.cyan(runCmd));
  }

  // Transport and package info
  if (server.packages && server.packages.length > 0) {
    const pkg = server.packages[0];
    const details: string[] = [];

    if (pkg.registryType) {
      details.push(pkg.registryType);
    }
    if (pkg.transport?.type) {
      details.push(`transport: ${pkg.transport.type}`);
    }

    if (details.length > 0) {
      output.info(chalk.gray(`  [${details.join(', ')}]`));
    }

    // Required arguments
    const requiredArgs = pkg.packageArguments?.filter(a => a.isRequired) ?? [];
    if (requiredArgs.length > 0) {
      output.info(chalk.gray('  Required args:'));
      for (const arg of requiredArgs) {
        const desc = arg.description ? ` - ${arg.description}` : '';
        output.info(chalk.gray(`    --${arg.name}${desc}`));
      }
    }
  }

  // Links
  if (server.repository?.url) {
    output.info(chalk.gray(`  Repository: ${server.repository.url}`));
  }
}
