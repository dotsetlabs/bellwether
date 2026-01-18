#!/usr/bin/env node

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Load global ~/.bellwether/.env first (if exists)
const globalEnvPath = join(homedir(), '.bellwether', '.env');
if (existsSync(globalEnvPath)) {
  config({ path: globalEnvPath });
}

// Then load project .env (overrides global settings)
config();

// Load credentials from keychain if not already in env
// This is done async but we await it before parsing commands
async function loadKeychainCredentials(): Promise<void> {
  // Only load from keychain if env vars aren't already set
  if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    try {
      const { getKeychainService } = await import('../auth/keychain.js');
      const keychain = getKeychainService();

      // Load OpenAI key if not in env
      if (!process.env.OPENAI_API_KEY) {
        const key = await keychain.getApiKey('openai');
        if (key) {
          process.env.OPENAI_API_KEY = key;
        }
      }

      // Load Anthropic key if not in env
      if (!process.env.ANTHROPIC_API_KEY) {
        const key = await keychain.getApiKey('anthropic');
        if (key) {
          process.env.ANTHROPIC_API_KEY = key;
        }
      }
    } catch {
      // Keychain not available - continue without it
    }
  }
}

import { Command } from 'commander';
import { testCommand } from './commands/test.js';
import { discoverCommand } from './commands/discover.js';
import { watchCommand } from './commands/watch.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { linkCommand, projectsCommand } from './commands/link.js';
import { uploadCommand } from './commands/upload.js';
import { historyCommand, diffCommand } from './commands/history.js';
import { authCommand } from './commands/auth.js';
import { badgeCommand } from './commands/badge.js';
import { teamsCommand } from './commands/teams.js';
import { baselineCommand } from './commands/baseline.js';
import { createRegistryCommand } from './commands/registry.js';
import { createVerifyCommand } from './commands/verify.js';
import { configureLogger, type LogLevel } from '../logging/logger.js';
import { VERSION } from '../version.js';

const program = new Command();

// ASCII art banner for help
const banner = `
Bellwether - Behavioral Drift Detection for MCP Servers
`;

// Extended help with examples
const examples = `
Examples:

  Initialize and test a server:
    $ bellwether init                     # Create bellwether.yaml
    $ bellwether test npx @mcp/my-server  # Test using config

  Baseline workflow:
    $ bellwether test npx @mcp/my-server  # Run test (generates report)
    $ bellwether baseline save            # Save baseline for drift detection
    $ bellwether baseline compare ./bellwether-baseline.json  # Compare

  Discover server capabilities:
    $ bellwether discover npx @mcp/server-postgres

  Search MCP Registry:
    $ bellwether registry filesystem

  Cloud workflow:
    $ bellwether login                    # Authenticate
    $ bellwether teams                    # List your teams
    $ bellwether teams switch <team-id>   # Switch active team
    $ bellwether link my-project          # Link to cloud project
    $ bellwether upload                   # Upload baseline
    $ bellwether history                  # View version history

Documentation: https://docs.bellwether.sh
`;

program
  .name('bellwether')
  .description(`${banner}
Test MCP servers. Detect structural drift. Generate documentation.

For more information on a specific command, use:
  bellwether <command> --help`)
  .version(VERSION)
  .option('--log-level <level>', 'Log level: debug, info, warn, error, silent', 'info')
  .option('--log-file <path>', 'Write logs to file instead of stderr')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    configureLogger({
      level: opts.logLevel as LogLevel,
      file: opts.logFile,
    });
  })
  .addHelpText('after', examples);

// Add command groups for better organization
program.addHelpText('beforeAll', '\nCore Commands:');

// Core commands - local testing
program.addCommand(
  testCommand.description(
    'Test an MCP server and generate baselines for drift detection'
  )
);
program.addCommand(
  watchCommand.description(
    'Watch for MCP server changes and auto-test'
  )
);
program.addCommand(
  discoverCommand.description(
    'Discover MCP server capabilities (tools, prompts, resources)'
  )
);
program.addCommand(
  initCommand.description(
    'Create a new bellwether.yaml configuration file'
  )
);
program.addCommand(
  authCommand.description(
    'Manage LLM provider API keys (keychain storage)'
  )
);
program.addCommand(
  baselineCommand.description(
    'Manage baselines for drift detection (save, compare, show, diff)'
  )
);
program.addCommand(
  createRegistryCommand().description(
    'Search the MCP Registry for servers'
  )
);
program.addCommand(
  createVerifyCommand().description(
    'Generate verification report for Verified by Bellwether program'
  )
);

// Cloud commands - sync with Bellwether Cloud
program.addCommand(
  loginCommand.description(
    'Authenticate with Bellwether Cloud'
  )
);
program.addCommand(
  teamsCommand.description(
    'Manage team selection for cloud operations'
  )
);
program.addCommand(
  linkCommand.description(
    'Link local project to Bellwether Cloud project'
  )
);
program.addCommand(
  projectsCommand.description(
    'List your Bellwether Cloud projects'
  )
);
program.addCommand(
  uploadCommand.description(
    'Upload baseline to Bellwether Cloud'
  )
);
program.addCommand(
  historyCommand.description(
    'View baseline version history'
  )
);
program.addCommand(
  diffCommand.description(
    'Compare two baseline versions'
  )
);
program.addCommand(
  badgeCommand.description(
    'Get embeddable verification badge for your project'
  )
);

// Custom help formatting
program.configureHelp({
  sortSubcommands: false, // Keep our custom order
  subcommandTerm: (cmd) => cmd.name() + ' ' + cmd.usage(),
});

// Load keychain credentials, then parse commands
loadKeychainCredentials().then(() => {
  program.parse();
}).catch(() => {
  // If keychain loading fails, still parse commands
  program.parse();
});
