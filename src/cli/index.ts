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
import { checkCommand } from './commands/check.js';
import { exploreCommand } from './commands/explore.js';
import { discoverCommand } from './commands/discover.js';
import { watchCommand } from './commands/watch.js';
import { initCommand } from './commands/init.js';
import { authCommand } from './commands/auth.js';
import { baselineCommand } from './commands/baseline.js';
import { goldenCommand } from './commands/golden.js';
import { registryCommand } from './commands/registry.js';
import { verifyCommand } from './commands/verify.js';
import { contractCommand } from './commands/contract.js';
import { validateConfigCommand } from './commands/validate-config.js';
import { badgeCommand } from './commands/cloud/badge.js';
import { diffCommand } from './commands/cloud/diff.js';
import { historyCommand } from './commands/cloud/history.js';
import { linkCommand } from './commands/cloud/link.js';
import { loginCommand } from './commands/cloud/login.js';
import { projectsCommand } from './commands/cloud/projects.js';
import { teamsCommand } from './commands/cloud/teams.js';
import { uploadCommand } from './commands/cloud/upload.js';
import { configureLogger, type LogLevel } from '../logging/logger.js';
import { VERSION } from '../version.js';
import { findConfigFile } from '../config/validator.js';
import { ConfigNotFoundError } from '../config/loader.js';
import { EXIT_CODES, PATHS } from '../constants.js';

const program = new Command();

// ASCII art banner for help
const banner = `
Bellwether - MCP Server Validation & Documentation
`;

// Extended help with examples
const examples = `
Examples:

  Initialize configuration:
    $ bellwether init                       # Create bellwether.yaml
    $ bellwether init --preset ci           # Optimized for CI/CD
    $ bellwether init --preset local        # Local LLM with Ollama

  Check for drift (free, fast, deterministic):
    $ bellwether check npx @mcp/my-server   # Validate schemas
    $ bellwether baseline save              # Save baseline
    $ bellwether baseline compare ./bellwether-baseline.json  # Detect drift

  Explore behavior (LLM-powered):
    $ bellwether explore npx @mcp/my-server # Generate AGENTS.md documentation

  Discover server capabilities:
    $ bellwether discover npx @mcp/server-postgres

  Search MCP Registry:
    $ bellwether registry filesystem

  Cloud workflow:
    $ bellwether login                      # Authenticate with Bellwether Cloud
    $ bellwether teams                      # List your teams
    $ bellwether link my-project            # Link to cloud project
    $ bellwether upload                     # Upload baseline
    $ bellwether history                    # View version history

Documentation: https://docs.bellwether.sh
`;

program
  .name('bellwether')
  .description(`${banner}
Check MCP servers for drift. Explore behavior. Generate documentation.

Commands:
  check    - Schema validation and drift detection (free, fast, deterministic)
  explore  - LLM-powered behavioral exploration and documentation

For more information on a specific command, use:
  bellwether <command> --help`)
  .version(VERSION)
  .option('--log-level <level>', 'Log level: debug, info, warn, error, silent')
  .option('--log-file <path>', 'Write logs to file instead of stderr')
  .hook('preAction', (thisCommand, actionCommand) => {
    const activeCommand = actionCommand ?? thisCommand;
    const commandName = activeCommand.name();
    const opts = activeCommand.opts();

    // Commands that don't require config
    const configOptionalCommands = ['init', 'validate-config', 'registry', 'discover'];
    if (!configOptionalCommands.includes(commandName)) {
      const configPath = opts.config as string | undefined;
      const found = findConfigFile(configPath);
      if (!found) {
        const searchedPaths = configPath
          ? [configPath]
          : PATHS.CONFIG_FILENAMES.map((name) => join(process.cwd(), name));
        console.error(new ConfigNotFoundError(searchedPaths).message);
        process.exit(EXIT_CODES.ERROR);
      }
    }

    if (opts.logLevel || opts.logFile) {
      process.env.BELLWETHER_LOG_OVERRIDE = '1';
      configureLogger({
        level: opts.logLevel as LogLevel,
        file: opts.logFile,
      });
    }
  })
  .addHelpText('after', examples);

// Add command groups for better organization
program.addHelpText('beforeAll', '\nCore Commands:');

// Core commands - check and explore
program.addCommand(
  checkCommand.description(
    'Check MCP server schema and detect drift (free, fast, deterministic)'
  )
);
program.addCommand(
  exploreCommand.description(
    'Explore MCP server behavior with LLM-powered testing'
  )
);
program.addCommand(
  watchCommand.description(
    'Watch for MCP server changes and auto-check'
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
  goldenCommand.description(
    'Manage golden outputs for tool validation (save, compare, list, delete)'
  )
);
program.addCommand(
  registryCommand.description(
    'Search the MCP Registry for servers'
  )
);
program.addCommand(
  verifyCommand.description(
    'Generate verification report for Verified by Bellwether program'
  )
);
program.addCommand(
  contractCommand.description(
    'Validate MCP servers against contract definitions (validate, generate, show)'
  )
);
program.addCommand(
  validateConfigCommand.description(
    'Validate bellwether.yaml configuration (no tests)'
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
