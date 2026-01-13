#!/usr/bin/env node

import { config } from 'dotenv';
config(); // Load .env file before anything else

import { Command } from 'commander';
import { interviewCommand } from './commands/interview.js';
import { discoverCommand } from './commands/discover.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { linkCommand, projectsCommand } from './commands/link.js';
import { uploadCommand } from './commands/upload.js';
import { historyCommand, diffCommand } from './commands/history.js';
import { profileCommand } from './commands/profile.js';
import { configureLogger, type LogLevel } from '../logging/logger.js';

const program = new Command();

// ASCII art banner for help
const banner = `
Inquest - Behavioral Documentation for MCP Servers
`;

// Extended help with examples
const examples = `
Examples:

  Interview a server:
    $ inquest interview npx @modelcontextprotocol/server-filesystem /tmp

  Interactive mode (prompts for options):
    $ inquest interview --interactive

  Discover tools without interviewing:
    $ inquest discover npx @mcp/server-postgres

  Save and compare baselines:
    $ inquest interview --save-baseline npx @mcp/my-server
    $ inquest interview --compare-baseline ./baseline.json npx @mcp/my-server

  CI/CD workflow (fail on drift):
    $ inquest interview --compare-baseline ./baseline.json --fail-on-drift npx @mcp/my-server

  Quick interview (fast, for CI):
    $ inquest interview --quick npx @mcp/my-server

  Cloud workflow:
    $ inquest login                    # Authenticate
    $ inquest link my-project          # Link to cloud project
    $ inquest upload                   # Upload baseline
    $ inquest history                  # View version history
    $ inquest diff 1 2                 # Compare versions

Documentation: https://inquest.dev/docs
`;

program
  .name('inquest')
  .description(`${banner}
Interview MCP servers to generate behavioral documentation, detect drift, and ensure tool reliability.

For more information on a specific command, use:
  inquest <command> --help`)
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
  initCommand.description(
    'Create a new inquest.yaml configuration file'
  )
);
program.addCommand(
  profileCommand.description(
    'Manage interview profiles'
  )
);

// Cloud commands - sync with Inquest Cloud
program.addCommand(
  loginCommand.description(
    'Authenticate with Inquest Cloud'
  )
);
program.addCommand(
  linkCommand.description(
    'Link local project to Inquest Cloud project'
  )
);
program.addCommand(
  projectsCommand.description(
    'List your Inquest Cloud projects'
  )
);
program.addCommand(
  uploadCommand.description(
    'Upload baseline to Inquest Cloud'
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

// Custom help formatting
program.configureHelp({
  sortSubcommands: false, // Keep our custom order
  subcommandTerm: (cmd) => cmd.name() + ' ' + cmd.usage(),
});

program.parse();
