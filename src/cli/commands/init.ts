/**
 * Init command - creates a bellwether.yaml configuration file.
 *
 * The generated config includes ALL possible options with comments,
 * making it self-documenting. Users can customize by editing the file.
 */

import { Command } from 'commander';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';
import { generateConfigTemplate, generatePresetConfig, PRESETS } from '../../config/template.js';
import * as output from '../output.js';

/**
 * Detect environment variables from .env.example or .env.sample files.
 * Returns an array of variable names found.
 */
function detectEnvVars(cwd: string): string[] {
  const envExampleFiles = [
    '.env.example',
    '.env.sample',
    'env.example',
    'env.sample',
  ];

  for (const filename of envExampleFiles) {
    const filepath = join(cwd, filename);
    if (existsSync(filepath)) {
      try {
        const content = readFileSync(filepath, 'utf-8');
        const envVars: string[] = [];

        for (const line of content.split('\n')) {
          // Skip comments and empty lines
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            continue;
          }

          // Parse VAR=value or VAR= patterns
          const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/i);
          if (match) {
            envVars.push(match[1]);
          }
        }

        return envVars;
      } catch {
        // Ignore read errors
      }
    }
  }

  return [];
}

/**
 * Prompt for user input.
 */
async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export const initCommand = new Command('init')
  .description('Initialize a bellwether.yaml configuration file')
  .argument('[server-command]', 'MCP server command (e.g., "npx @mcp/server")')
  .option('-f, --force', 'Overwrite existing config file')
  .option(
    '-p, --preset <name>',
    `Use a preset configuration (${Object.keys(PRESETS).join(', ')})`
  )
  .option('--provider <provider>', 'LLM provider for explore command (ollama, openai, anthropic)', 'ollama')
  .option('-y, --yes', 'Skip prompts, use defaults')
  .action(async (serverCommandArg: string | undefined, options) => {
    const configPath = join(process.cwd(), 'bellwether.yaml');

    // Check for existing config
    if (existsSync(configPath) && !options.force) {
      output.error(`Config file already exists: ${configPath}`);
      output.error('Use --force to overwrite.');
      process.exit(1);
    }

    // Validate preset if provided
    if (options.preset && !PRESETS[options.preset]) {
      output.error(`Unknown preset: ${options.preset}`);
      output.error(`Available presets: ${Object.keys(PRESETS).join(', ')}`);
      process.exit(1);
    }

    // Determine server command
    let serverCommand = '';
    let serverArgs: string[] = [];

    // Parse server command argument if provided
    if (serverCommandArg) {
      const parts = serverCommandArg.split(/\s+/);
      serverCommand = parts[0];
      serverArgs = parts.slice(1);
    }

    // If no server command and not using --yes, prompt for it
    if (!serverCommand && !options.yes && process.stdin.isTTY) {
      output.info('Bellwether Configuration Setup');
      output.info('==============================');
      output.newline();

      const answer = await prompt('MCP server command (press Enter to skip): ');
      if (answer) {
        // Parse command and args
        const parts = answer.split(/\s+/);
        serverCommand = parts[0];
        serverArgs = parts.slice(1);
      }
      output.newline();
    }

    // Detect environment variables from .env.example
    const envVars = detectEnvVars(process.cwd());

    // Generate config content
    let content: string;

    if (options.preset) {
      content = generatePresetConfig(options.preset, {
        serverCommand,
        serverArgs,
        envVars,
      });
    } else {
      content = generateConfigTemplate({
        serverCommand,
        serverArgs,
        provider: options.provider as 'ollama' | 'openai' | 'anthropic',
        envVars,
      });
    }

    // Write config file
    writeFileSync(configPath, content);

    // Show success message
    output.success(`Created: ${configPath}`);
    output.newline();

    // Show info about detected env vars
    if (envVars.length > 0) {
      output.info(`Detected ${envVars.length} environment variable(s) from .env.example:`);
      output.info(`  ${envVars.join(', ')}`);
      output.newline();
      output.info('These have been added to bellwether.yaml with ${VAR} interpolation syntax.');
      output.info('Make sure to set these in your environment or .env file before running commands.');
      output.newline();
    }

    // Show guidance for using both commands
    output.info('Configuration created for bellwether check and explore commands.');
    output.newline();
    output.info('Next steps:');

    if (!serverCommand) {
      output.info('  1. Edit bellwether.yaml and set your server command:');
      output.info('     server:');
      output.info('       command: "npx @your/mcp-server"');
      output.newline();
    }

    const step = serverCommand ? 1 : 2;
    output.info(`  ${step}. Run schema validation (free, fast, no LLM):`);
    output.info('     bellwether check');
    output.newline();
    output.info(`  ${step + 1}. Save a baseline for drift detection:`);
    output.info('     bellwether baseline save');
    output.newline();
    output.info(`  ${step + 2}. Run LLM-powered behavioral exploration:`);
    output.info('     bellwether explore');
    output.newline();

    // Show LLM setup instructions based on provider
    const provider = options.preset ? PRESETS[options.preset].provider : options.provider;

    if (provider === 'ollama') {
      output.info('For explore command, ensure Ollama is running:');
      output.info('  ollama serve');
      output.info('  ollama pull qwen3:8b');
    } else if (provider === 'openai') {
      output.info('For explore command, set up your OpenAI API key:');
      output.info('  bellwether auth');
      output.info('  # or: export OPENAI_API_KEY=sk-xxx');
    } else if (provider === 'anthropic') {
      output.info('For explore command, set up your Anthropic API key:');
      output.info('  bellwether auth');
      output.info('  # or: export ANTHROPIC_API_KEY=sk-ant-xxx');
    }

    // Show env var hint only if no env vars were auto-detected
    if (envVars.length === 0) {
      output.newline();
      output.info('Note: If your server requires environment variables, add them to bellwether.yaml:');
      output.info('     server:');
      output.info('       env:');
      output.info('         MY_VAR: "${MY_VAR}"  # pulls from .env or shell');
    }

    output.newline();
    output.info('For more information: https://docs.bellwether.sh');

    // Show preset-specific info
    if (options.preset) {
      output.newline();
      output.info(`Preset "${options.preset}" applied:`);
      switch (options.preset) {
        case 'ci':
          output.info('  - Optimized for bellwether check in CI/CD');
          output.info('  - Fails on drift detection');
          output.info('  - Minimal logging');
          break;
        case 'security':
          output.info('  - Optimized for bellwether explore with security focus');
          output.info('  - Multiple personas (technical, security, QA)');
          output.info('  - 5 questions per tool');
          break;
        case 'thorough':
          output.info('  - Optimized for bellwether explore with all personas');
          output.info('  - Parallel persona execution');
          output.info('  - Workflow discovery enabled');
          break;
        case 'local':
          output.info('  - Optimized for bellwether explore with local Ollama');
          output.info('  - Free, private, no API keys');
          break;
      }
    }
  });
