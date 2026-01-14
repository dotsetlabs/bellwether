#!/usr/bin/env node

import { config } from 'dotenv';
config(); // Load .env file before anything else

import { Command } from 'commander';
import { interviewCommand } from './commands/interview.js';
import { discoverCommand, summaryCommand } from './commands/discover.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { linkCommand, projectsCommand } from './commands/link.js';
import { uploadCommand } from './commands/upload.js';
import { historyCommand, diffCommand } from './commands/history.js';
import { profileCommand } from './commands/profile.js';
import { badgeCommand } from './commands/badge.js';
import { createRegistryCommand } from './commands/registry.js';
import { createVerifyCommand } from './commands/verify.js';
import { configureLogger, type LogLevel } from '../logging/logger.js';

const program = new Command();

// ASCII art banner for help
const banner = `
Bellwether - Behavioral Documentation for MCP Servers
`;

// Extended help with examples
const examples = `
Examples:

  Interview a server:
    $ bellwether interview npx @modelcontextprotocol/server-filesystem /tmp

  Interactive mode (prompts for options):
    $ bellwether interview --interactive

  Discover tools without interviewing:
    $ bellwether discover npx @mcp/server-postgres

  Save and compare baselines:
    $ bellwether interview --save-baseline npx @mcp/my-server
    $ bellwether interview --compare-baseline ./baseline.json npx @mcp/my-server

  CI/CD workflow (fail on drift):
    $ bellwether interview --compare-baseline ./baseline.json --fail-on-drift npx @mcp/my-server

  Quick interview (fast, for CI):
    $ bellwether interview --quick npx @mcp/my-server

  Search MCP Registry:
    $ bellwether registry filesystem    # Search for filesystem servers
    $ bellwether registry --json        # List servers as JSON

  Cloud workflow:
    $ bellwether login                    # Authenticate
    $ bellwether link my-project          # Link to cloud project
    $ bellwether upload                   # Upload baseline
    $ bellwether history                  # View version history
    $ bellwether diff 1 2                 # Compare versions

Documentation: https://bellwether.sh/docs
`;

program
  .name('bellwether')
  .description(`${banner}
Interview MCP servers to generate behavioral documentation, detect drift, and ensure tool reliability.

For more information on a specific command, use:
  bellwether <command> --help`)
  .version('0.2.0')
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

// Core commands - local interview and documentation
program.addCommand(
  interviewCommand.description(
    'Interview an MCP server and generate behavioral documentation'
  )
);
program.addCommand(
  discoverCommand.description(
    'Discover available tools without full interview'
  )
);
program.addCommand(
  summaryCommand.description(
    'Quick overview of server capabilities (alias for discover)'
  )
);
program.addCommand(
  initCommand.description(
    'Create a new bellwether.yaml configuration file'
  )
);
program.addCommand(
  profileCommand.description(
    'Manage interview profiles'
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

program.parse();
