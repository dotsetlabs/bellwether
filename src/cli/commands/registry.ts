/**
 * Registry command - search and lookup MCP servers from the registry.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { RegistryClient, generateRunCommand } from '../../registry/index.js';
import type { RegistryServerEntry } from '../../registry/index.js';
import { EXIT_CODES } from '../../constants.js';
import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../config/loader.js';
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
    .option('-c, --config <path>', 'Path to config file')
    .option('-l, --limit <number>', 'Maximum results to show')
    .option('--json', 'Output as JSON')
    .action(
      async (
        query: string | undefined,
        options: { config?: string; limit?: string; json?: boolean }
      ) => {
        await handleRegistry(query, options);
      }
    );
}

export const registryCommand = createRegistryCommand();

async function handleRegistry(
  query: string | undefined,
  options: { config?: string; limit?: string; json?: boolean }
): Promise<void> {
  // Config is optional for registry command - use defaults if not found
  let config: BellwetherConfig | undefined;
  try {
    config = loadConfig(options.config);
  } catch (error) {
    if (!(error instanceof ConfigNotFoundError)) {
      throw error;
    }
    // Config not found - use defaults
  }

  // Allow overriding registry URL for testing
  const registryUrl = process.env.BELLWETHER_REGISTRY_URL;
  const client = new RegistryClient(registryUrl ? { baseUrl: registryUrl } : undefined);
  const defaultLimit = 10;
  const limit = parseInt(options.limit ?? '', 10) || config?.registry?.limit || defaultLimit;
  const outputJson = options.json ?? config?.registry?.json ?? false;

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

    if (outputJson) {
      output.json(servers);
      return;
    }

    if (servers.length === 0) {
      output.info(chalk.yellow('No servers found.'));
      if (query) {
        output.info(
          chalk.gray(`Try a different search term or browse all servers with: bellwether registry`)
        );
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
        output.info(chalk.cyan(`  bellwether check ${runCmd}`));
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      output.error(chalk.red(`Error: ${error.message}`));
    } else {
      output.error(chalk.red('An unexpected error occurred'));
    }
    process.exit(EXIT_CODES.ERROR);
  }
}

/**
 * Detect if an argument name looks like an environment variable requirement.
 */
function isLikelyEnvVar(name: string): boolean {
  const envPatterns = [
    /api[_-]?key$/i,
    /token$/i,
    /secret$/i,
    /password$/i,
    /credential/i,
    /auth/i,
    /^[A-Z][A-Z0-9_]+$/, // ALL_CAPS_PATTERN
  ];
  return envPatterns.some((pattern) => pattern.test(name));
}

/**
 * Extract likely environment variable name from argument.
 */
function toEnvVarName(name: string): string {
  // Convert kebab-case or camelCase to SCREAMING_SNAKE_CASE
  return name
    .replace(/-/g, '_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase();
}

/**
 * Analyze server requirements and return setup indicators.
 */
function analyzeServerRequirements(entry: RegistryServerEntry): {
  envVars: string[];
  requiredArgs: { name: string; description?: string }[];
  needsSetup: boolean;
  setupHints: string[];
} {
  const envVars: string[] = [];
  const requiredArgs: { name: string; description?: string }[] = [];
  const setupHints: string[] = [];

  if (entry.server.packages && entry.server.packages.length > 0) {
    const pkg = entry.server.packages[0];

    // Check package arguments for env vars and required args
    if (pkg.packageArguments) {
      for (const arg of pkg.packageArguments) {
        if (arg.isRequired) {
          requiredArgs.push({ name: arg.name, description: arg.description });
        }

        // Detect likely environment variables
        if (isLikelyEnvVar(arg.name)) {
          const envName = toEnvVarName(arg.name);
          if (!envVars.includes(envName)) {
            envVars.push(envName);
          }
        }

        // Check description for env var hints
        if (arg.description) {
          const envMatch = arg.description.match(/\$\{?([A-Z][A-Z0-9_]+)\}?/);
          if (envMatch && !envVars.includes(envMatch[1])) {
            envVars.push(envMatch[1]);
          }
          // Look for "set X environment variable" patterns
          const setEnvMatch = arg.description.match(/set\s+([A-Z][A-Z0-9_]+)/i);
          if (setEnvMatch && !envVars.includes(setEnvMatch[1].toUpperCase())) {
            envVars.push(setEnvMatch[1].toUpperCase());
          }
        }
      }
    }

    // Check for common service patterns in server name
    // Only look at the actual server name part (after last /) to avoid false matches
    // e.g., "io.github.user/postgres" should match "postgres", not "github"
    const fullName = entry.server.name.toLowerCase();
    const serverNamePart = fullName.includes('/')
      ? fullName.split('/').pop() || fullName
      : fullName;
    const serviceEnvVars: Record<string, string[]> = {
      openai: ['OPENAI_API_KEY'],
      anthropic: ['ANTHROPIC_API_KEY'],
      github: ['GITHUB_TOKEN', 'GITHUB_PERSONAL_ACCESS_TOKEN'],
      gitlab: ['GITLAB_TOKEN', 'GITLAB_PERSONAL_ACCESS_TOKEN'],
      slack: ['SLACK_TOKEN', 'SLACK_BOT_TOKEN'],
      discord: ['DISCORD_TOKEN', 'DISCORD_BOT_TOKEN'],
      postgres: ['DATABASE_URL', 'POSTGRES_CONNECTION_STRING'],
      mysql: ['DATABASE_URL', 'MYSQL_CONNECTION_STRING'],
      redis: ['REDIS_URL'],
      mongodb: ['MONGODB_URI'],
      aws: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
      azure: ['AZURE_SUBSCRIPTION_ID', 'AZURE_CLIENT_ID'],
      gcp: ['GOOGLE_APPLICATION_CREDENTIALS'],
      google: ['GOOGLE_API_KEY'],
      stripe: ['STRIPE_API_KEY'],
      twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
      sendgrid: ['SENDGRID_API_KEY'],
      mailgun: ['MAILGUN_API_KEY'],
      firebase: ['FIREBASE_PROJECT_ID'],
      supabase: ['SUPABASE_URL', 'SUPABASE_KEY'],
      notion: ['NOTION_API_KEY'],
      airtable: ['AIRTABLE_API_KEY'],
      letta: ['LETTA_API_KEY'],
      brave: ['BRAVE_API_KEY'],
      puppeteer: [],
      playwright: [],
      filesystem: [],
      everything: [],
      'sequential-thinking': [],
    };

    for (const [service, vars] of Object.entries(serviceEnvVars)) {
      if (serverNamePart.includes(service)) {
        for (const v of vars) {
          if (!envVars.includes(v)) {
            envVars.push(v);
          }
        }
      }
    }

    // Generate setup hints
    if (envVars.length > 0) {
      setupHints.push(`Set environment variable(s): ${envVars.join(', ')}`);
    }

    if (pkg.runtime === 'python') {
      setupHints.push('Requires Python runtime');
    } else if (pkg.runtime === 'node' && pkg.registryType === 'npm') {
      // No hint needed - npx handles this
    }
  }

  const needsSetup = envVars.length > 0 || requiredArgs.length > 0;

  return { envVars, requiredArgs, needsSetup, setupHints };
}

function displayServer(entry: RegistryServerEntry): void {
  const { server } = entry;
  const meta = entry._meta?.['io.modelcontextprotocol.registry/official'];
  const requirements = analyzeServerRequirements(entry);

  // Name and version with status indicators
  let nameLine = chalk.bold.blue(server.name);
  if (server.version) {
    nameLine += chalk.gray(` v${server.version}`);
  }
  if (meta?.status === 'active') {
    nameLine += chalk.green(' [active]');
  }
  if (requirements.needsSetup) {
    nameLine += chalk.yellow(' [setup required]');
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

    // Required arguments (existing)
    if (requirements.requiredArgs.length > 0) {
      output.info(chalk.gray('  Required args:'));
      for (const arg of requirements.requiredArgs) {
        const desc = arg.description ? ` - ${arg.description}` : '';
        output.info(chalk.gray(`    --${arg.name}${desc}`));
      }
    }

    // Environment variables (new)
    if (requirements.envVars.length > 0) {
      output.info(chalk.yellow('  Environment:'));
      for (const envVar of requirements.envVars) {
        const isSet = process.env[envVar] ? chalk.green('set') : chalk.red('missing');
        output.info(chalk.yellow(`    ${isSet} ${envVar}`));
      }
    }

    // Setup hints (new)
    if (requirements.setupHints.length > 0 && requirements.envVars.some((v) => !process.env[v])) {
      output.info(chalk.gray('  Setup:'));
      for (const hint of requirements.setupHints) {
        output.info(chalk.gray(`    → ${hint}`));
      }
    }
  }

  // Links
  if (server.repository?.url) {
    output.info(chalk.gray(`  Repository: ${server.repository.url}`));
  }
}
