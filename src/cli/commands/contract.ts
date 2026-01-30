/**
 * Contract commands - validate MCP servers against contracts.
 *
 * Subcommands:
 *   - validate [path]     Validate server against a contract file
 *   - generate [path]     Generate a contract from current server state
 *   - show [path]         Display contract contents
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  loadContract,
  findContractFile,
  validateContract,
  generateContract,
  generateContractYaml,
  generateContractValidationMarkdown,
} from '../../contract/index.js';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { EXIT_CODES, CONTRACT_TESTING } from '../../constants.js';
import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../config/loader.js';
import * as output from '../output.js';

/**
 * Default paths for contract files.
 */
const DEFAULT_CONTRACT_FILENAMES = CONTRACT_TESTING.CONTRACT_FILENAMES;

function loadConfigOrExit(configPath?: string): BellwetherConfig {
  try {
    return loadConfig(configPath);
  } catch (error) {
    if (error instanceof ConfigNotFoundError) {
      output.error(error.message);
      process.exit(EXIT_CODES.ERROR);
    }
    throw error;
  }
}

/**
 * Find or use provided contract path.
 */
function resolveContractPath(providedPath?: string, baseDir?: string): string | null {
  if (providedPath) {
    const fullPath = providedPath.startsWith('/')
      ? providedPath
      : join(baseDir || '.', providedPath);
    if (existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  // Try default filenames
  return findContractFile(baseDir || '.');
}

export const contractCommand = new Command('contract')
  .description('Validate MCP servers against contract definitions')
  .addHelpText(
    'after',
    `
Examples:
  $ bellwether contract validate npx @mcp/server  # Validate against contract
  $ bellwether contract generate npx @mcp/server  # Generate contract from server
  $ bellwether contract show                       # Show current contract
  $ bellwether contract validate npx @mcp/server --contract ./my-contract.yaml
`
  );

// contract validate

contractCommand
  .command('validate')
  .description('Validate an MCP server against a contract file')
  .argument('<server-command...>', 'MCP server command and arguments')
  .option('-c, --config <path>', 'Path to config file')
  .option('--contract <path>', 'Path to contract file (default: bellwether-contract.yaml)')
  .option('--mode <mode>', 'Validation mode: strict, lenient, report')
  .option('--fail-on-violation', 'Exit with error if violations detected (default in CI)')
  .option('--format <format>', 'Output format: text, json, markdown')
  .option('--timeout <ms>', 'Server startup timeout in milliseconds')
  .action(async (serverCmd: string[], options) => {
    const config = loadConfigOrExit(options.config);
    const outputDir = config.output.dir;
    const defaultContractPath = config.contract.path;
    const mode = (options.mode ?? config.contract.mode) as 'strict' | 'lenient' | 'report';
    const format = options.format ?? config.contract.format;
    const timeout = parseInt(options.timeout ?? String(config.contract.timeout), 10);

    // Find contract file
    const contractPath = resolveContractPath(options.contract ?? defaultContractPath, outputDir);
    if (!contractPath) {
      output.error('Contract file not found.');
      output.error('');
      output.error('Create a contract file by running:');
      output.error('  bellwether contract generate <server-command>');
      output.error('');
      output.error(`Expected filenames: ${DEFAULT_CONTRACT_FILENAMES.join(', ')}`);
      process.exit(EXIT_CODES.ERROR);
    }

    // Load contract
    let contract;
    try {
      contract = loadContract(contractPath);
    } catch (error) {
      output.error(`Failed to load contract: ${error instanceof Error ? error.message : error}`);
      process.exit(EXIT_CODES.ERROR);
    }

    output.info(`Loading contract: ${contractPath}`);
    output.info(`Validating against: ${serverCmd.join(' ')}`);
    output.newline();

    // Start MCP server
    const mcpClient = new MCPClient({
      timeout,
      debug: false,
      transport: 'stdio',
    });

    try {
      // Parse server command
      const command = serverCmd[0];
      const args = serverCmd.slice(1);

      await mcpClient.connect(command, args);

      // Discover capabilities
      const discovery = await discover(mcpClient, command, args);

      // Validate against contract
      const result = await validateContract(contract, discovery.tools, {
        mode,
      });

      // Output results
      switch (format) {
        case 'json':
          output.info(JSON.stringify(result, null, 2));
          break;
        case 'markdown':
          output.info(generateContractValidationMarkdown(result));
          break;
        default:
          // Text format
          if (result.passed) {
            output.success('Contract validation PASSED');
          } else {
            output.error('Contract validation FAILED');
          }
          output.newline();
          output.info(`Mode: ${result.mode}`);
          output.info(`Tools checked: ${result.summary.toolsChecked}`);
          output.info(`Tools passed: ${result.summary.toolsPassed}`);
          output.info(`Violations: ${result.summary.totalViolations}`);

          if (result.violations.length > 0) {
            output.newline();
            output.info('Violations:');

            // Group by severity
            const breaking = result.violations.filter(v => v.severity === 'breaking');
            const warnings = result.violations.filter(v => v.severity === 'warning');
            const infos = result.violations.filter(v => v.severity === 'info');

            for (const v of breaking) {
              output.error(`  [BREAKING] ${v.tool || v.type}: ${v.message}`);
            }
            for (const v of warnings) {
              output.warn(`  [WARNING] ${v.tool || v.type}: ${v.message}`);
            }
            for (const v of infos.slice(0, 5)) {
              output.info(`  [INFO] ${v.tool || v.type}: ${v.message}`);
            }
            if (infos.length > 5) {
              output.info(`  ... and ${infos.length - 5} more info violations`);
            }
          }
      }

      // Exit with appropriate code
      const failOnViolation = options.failOnViolation ? true : (config.contract.failOnViolation ?? !!process.env.CI);
      if (!result.passed && failOnViolation) {
        process.exit(EXIT_CODES.BREAKING);
      }
    } catch (error) {
      output.error(`Validation failed: ${error instanceof Error ? error.message : error}`);
      process.exit(EXIT_CODES.ERROR);
    } finally {
      await mcpClient.disconnect();
    }
  });

// contract generate

contractCommand
  .command('generate')
  .description('Generate a contract file from current server state')
  .argument('<server-command...>', 'MCP server command and arguments')
  .option('-c, --config <path>', 'Path to config file')
  .option('-o, --output <path>', 'Output path for contract file')
  .option('--timeout <ms>', 'Server startup timeout in milliseconds')
  .option('-f, --force', 'Overwrite existing contract file')
  .action(async (serverCmd: string[], options) => {
    const config = loadConfigOrExit(options.config);
    const outputDir = config.output.dir;
    const defaultOutput = config.contract.path ?? DEFAULT_CONTRACT_FILENAMES[0];
    const outputOption = options.output ?? defaultOutput;
    const outputPath = outputOption.startsWith('/')
      ? outputOption
      : join(outputDir, outputOption);
    const timeout = parseInt(options.timeout ?? String(config.contract.timeout), 10);

    // Check for existing file
    if (existsSync(outputPath) && !options.force) {
      output.error(`Contract file already exists: ${outputPath}`);
      output.error('Use --force to overwrite.');
      process.exit(EXIT_CODES.ERROR);
    }

    output.info(`Generating contract from: ${serverCmd.join(' ')}`);

    // Start MCP server
    const mcpClient = new MCPClient({
      timeout,
      debug: false,
      transport: 'stdio',
    });

    try {
      // Parse server command
      const command = serverCmd[0];
      const args = serverCmd.slice(1);

      await mcpClient.connect(command, args);

      // Discover capabilities
      const discovery = await discover(mcpClient, command, args);

      // Generate contract
      const serverName = discovery.serverInfo?.name || 'MCP Server';
      const contract = generateContract(discovery.tools, serverName);
      const yaml = generateContractYaml(contract);

      // Write to file
      writeFileSync(outputPath, yaml);

      output.success(`Contract generated: ${outputPath}`);
      output.newline();
      output.info(`  Server: ${serverName}`);
      output.info(`  Tools: ${discovery.tools.length}`);
      output.info(`  Parameters: ${countParameters(contract)}`);
    } catch (error) {
      output.error(`Generation failed: ${error instanceof Error ? error.message : error}`);
      process.exit(EXIT_CODES.ERROR);
    } finally {
      await mcpClient.disconnect();
    }
  });

// contract show

contractCommand
  .command('show')
  .description('Display contract file contents')
  .argument('[path]', 'Path to contract file')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output as JSON instead of YAML')
  .action(async (contractPath: string | undefined, options) => {
    const config = loadConfigOrExit(options.config);
    const outputDir = config.output.dir;
    const path = resolveContractPath(contractPath ?? config.contract.path, outputDir);

    if (!path) {
      output.error('Contract file not found.');
      output.error(`Expected filenames: ${DEFAULT_CONTRACT_FILENAMES.join(', ')}`);
      process.exit(EXIT_CODES.ERROR);
    }

    try {
      const contract = loadContract(path);

      output.info(`Contract: ${path}`);
      output.info(`Version: ${contract.version}`);
      if (contract.server?.name) {
        output.info(`Server: ${contract.server.name}`);
      }
      output.newline();

      if (options.json) {
        output.info(JSON.stringify(contract, null, 2));
      } else {
        const content = readFileSync(path, 'utf-8');
        output.info(content);
      }
    } catch (error) {
      output.error(`Failed to load contract: ${error instanceof Error ? error.message : error}`);
      process.exit(EXIT_CODES.ERROR);
    }
  });

/**
 * Count total parameters in a contract.
 */
function countParameters(contract: ReturnType<typeof generateContract>): number {
  let count = 0;
  for (const toolContract of Object.values(contract.tools)) {
    if (toolContract.input) {
      count += Object.keys(toolContract.input).length;
    }
  }
  return count;
}
