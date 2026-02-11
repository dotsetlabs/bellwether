/**
 * Golden command - Manage golden outputs for tool validation.
 *
 * Commands:
 *   bellwether golden save --tool <name>      Save current output as golden
 *   bellwether golden compare                  Compare against all golden outputs
 *   bellwether golden list                     List all saved golden outputs
 *   bellwether golden delete --tool <name>    Delete a golden output
 */

import { Command } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../config/loader.js';
import { validateConfigForCheck } from '../../config/validator.js';
import {
  getGoldenStorePath,
  saveGoldenOutput,
  createGoldenOutput,
  listGoldenOutputs,
  deleteGoldenOutput,
  compareWithGolden,
  type GoldenComparisonMode,
  type GoldenComparisonResult,
} from '../../baseline/golden-output.js';
import * as output from '../output.js';
import { EXIT_CODES, PATHS } from '../../constants.js';
import { formatDateISO } from '../../utils/index.js';

export const goldenCommand = new Command('golden').description(
  'Manage golden outputs for tool validation'
);

// Save command
goldenCommand
  .command('save')
  .description('Capture current tool output as golden reference')
  .requiredOption('--tool <name>', 'Tool name to capture golden output for')
  .option('-c, --config <path>', 'Path to config file', PATHS.DEFAULT_CONFIG_FILENAME)
  .option('--args <json>', 'JSON arguments to pass to the tool')
  .option('--mode <mode>', 'Comparison mode: exact, structural, semantic')
  .option('--allowed-drift <paths>', 'Comma-separated JSONPath patterns for allowed changes')
  .option('--no-normalize-timestamps', 'Disable timestamp normalization')
  .option('--no-normalize-uuids', 'Disable UUID normalization')
  .option('--description <text>', 'Description of this golden output')
  .action(async (options) => {
    // Load configuration
    let config: BellwetherConfig;
    try {
      config = loadConfig(options.config);
    } catch (error) {
      if (error instanceof ConfigNotFoundError) {
        output.error(error.message);
        process.exit(EXIT_CODES.ERROR);
      }
      throw error;
    }

    // Validate config
    const serverCommand = config.server.command;
    const args = config.server.args;

    try {
      validateConfigForCheck(config, serverCommand);
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.ERROR);
    }

    const argsJson = options.args ?? config.golden.defaultArgs;
    const mode = options.mode ?? config.golden.mode;
    const normalizeTimestamps =
      options.normalizeTimestamps === false ? false : config.golden.normalizeTimestamps;
    const normalizeUuids = options.normalizeUuids === false ? false : config.golden.normalizeUuids;

    // Parse tool arguments
    let toolArgs: Record<string, unknown>;
    try {
      toolArgs = JSON.parse(argsJson);
    } catch (error) {
      output.error(`Invalid JSON for --args: ${error instanceof Error ? error.message : error}`);
      process.exit(EXIT_CODES.ERROR);
    }

    // Parse allowed drift paths
    const allowedDrift = options.allowedDrift
      ? options.allowedDrift.split(',').map((p: string) => p.trim())
      : [];

    // Validate comparison mode
    const validModes: GoldenComparisonMode[] = ['exact', 'structural', 'semantic'];
    if (!validModes.includes(mode)) {
      output.error(`Invalid mode "${mode}". Valid modes: ${validModes.join(', ')}`);
      process.exit(EXIT_CODES.ERROR);
    }

    const outputDir = config.output.dir;
    const storePath = getGoldenStorePath(outputDir);

    output.info(`Capturing golden output for: ${options.tool}`);
    output.info(`Mode: ${mode}`);
    if (allowedDrift.length > 0) {
      output.info(`Allowed drift paths: ${allowedDrift.join(', ')}`);
    }
    output.newline();

    const mcpClient = new MCPClient({
      timeout: config.server.timeout,
      debug: config.logging.level === 'debug',
      transport: 'stdio',
    });

    try {
      // Connect to server
      output.info('Connecting to MCP server...');
      await mcpClient.connect(serverCommand, args, config.server.env);

      // Discover tools
      const discovery = await discover(mcpClient, serverCommand, args);
      const tool = discovery.tools.find((t) => t.name === options.tool);

      if (!tool) {
        output.error(`Tool not found: ${options.tool}`);
        output.info(`Available tools: ${discovery.tools.map((t) => t.name).join(', ')}`);
        process.exit(EXIT_CODES.ERROR);
      }

      // Call the tool
      output.info(`Calling tool: ${options.tool}`);
      const response = await mcpClient.callTool(options.tool, toolArgs);

      if (response.isError) {
        output.error('Tool returned an error:');
        const textContent = response.content.find((c) => c.type === 'text');
        if (textContent && 'text' in textContent) {
          output.error(String(textContent.text));
        }
        process.exit(EXIT_CODES.ERROR);
      }

      // Create golden output
      const golden = createGoldenOutput(options.tool, toolArgs, response, {
        mode,
        allowedDrift,
        normalizeTimestamps,
        normalizeUuids,
        description: options.description,
      });

      // Ensure output directory exists
      mkdirSync(outputDir, { recursive: true });

      // Save golden output
      saveGoldenOutput(golden, storePath);

      output.success('\nGolden output saved!');
      output.info(`Store: ${storePath}`);
      output.info(`Tool: ${golden.toolName}`);
      output.info(`Content type: ${golden.output.contentType}`);
      output.info(`Content hash: ${golden.output.contentHash}`);
      output.info(`Comparison mode: ${golden.tolerance.mode}`);

      // Show preview of captured content
      const preview = golden.output.raw.slice(0, 200);
      if (preview) {
        output.newline();
        output.info('Output preview:');
        output.info(preview + (golden.output.raw.length > 200 ? '...' : ''));
      }
    } catch (error) {
      output.error(
        `Failed to capture golden output: ${error instanceof Error ? error.message : error}`
      );
      process.exit(EXIT_CODES.ERROR);
    } finally {
      await mcpClient.disconnect();
    }
  });

// Compare command
goldenCommand
  .command('compare')
  .description('Compare current outputs against saved golden outputs')
  .option('-c, --config <path>', 'Path to config file', PATHS.DEFAULT_CONFIG_FILENAME)
  .option('--tool <name>', 'Only compare a specific tool')
  .option('--fail-on-drift', 'Exit with error if any drift detected')
  .option('--format <format>', 'Output format: text, json, markdown')
  .action(async (options) => {
    // Load configuration
    let config: BellwetherConfig;
    try {
      config = loadConfig(options.config);
    } catch (error) {
      if (error instanceof ConfigNotFoundError) {
        output.error(error.message);
        process.exit(EXIT_CODES.ERROR);
      }
      throw error;
    }

    // Validate config
    const serverCommand = config.server.command;
    const args = config.server.args;

    try {
      validateConfigForCheck(config, serverCommand);
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.ERROR);
    }

    const outputDir = config.output.dir;
    const storePath = getGoldenStorePath(outputDir);
    const format = options.format ?? config.golden.compareFormat;

    if (!existsSync(storePath)) {
      output.warn('No golden outputs found.');
      output.info('Use "bellwether golden save --tool <name>" to capture golden outputs.');
      process.exit(EXIT_CODES.CLEAN);
    }

    const goldens = listGoldenOutputs(storePath);
    const filteredGoldens = options.tool
      ? goldens.filter((g) => g.toolName === options.tool)
      : goldens;

    if (filteredGoldens.length === 0) {
      if (options.tool) {
        output.warn(`No golden output found for tool: ${options.tool}`);
      } else {
        output.warn('No golden outputs saved.');
      }
      process.exit(EXIT_CODES.CLEAN);
    }

    output.info(`Comparing ${filteredGoldens.length} golden output(s)...`);
    output.newline();

    const mcpClient = new MCPClient({
      timeout: config.server.timeout,
      debug: config.logging.level === 'debug',
      transport: 'stdio',
    });

    try {
      // Connect to server
      output.info('Connecting to MCP server...');
      await mcpClient.connect(serverCommand, args, config.server.env);
      output.newline();

      const results: GoldenComparisonResult[] = [];

      for (const golden of filteredGoldens) {
        output.info(`Comparing: ${golden.toolName}`);

        try {
          const response = await mcpClient.callTool(golden.toolName, golden.inputArgs);
          const result = compareWithGolden(golden, response);
          results.push(result);

          const icon = result.passed ? '[PASS]' : '[FAIL]';
          if (result.passed) {
            output.success(`  ${icon} ${result.summary}`);
          } else {
            output.error(`  ${icon} ${result.summary}`);
            if (result.differences.filter((d) => !d.allowed).length <= 5) {
              for (const diff of result.differences.filter((d) => !d.allowed)) {
                output.warn(`    - ${diff.description} at ${diff.path}`);
              }
            }
          }
        } catch (error) {
          results.push({
            toolName: golden.toolName,
            passed: false,
            severity: 'breaking',
            mode: golden.tolerance.mode,
            goldenCapturedAt: golden.capturedAt,
            differences: [
              {
                type: 'changed',
                path: '$',
                expected: 'successful response',
                actual: `error: ${error instanceof Error ? error.message : String(error)}`,
                allowed: false,
                description: 'Tool call failed',
              },
            ],
            summary: `Tool call failed: ${error instanceof Error ? error.message : String(error)}`,
          });
          output.error(
            `  [FAIL] Tool call failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      output.newline();

      // Summary
      const passed = results.filter((r) => r.passed).length;
      const failed = results.length - passed;

      if (format === 'json') {
        output.info(JSON.stringify(results, null, 2));
      } else if (format === 'markdown') {
        output.info(formatResultsMarkdown(results));
      } else {
        output.info('--- Summary ---');
        output.info(`Total: ${results.length}`);
        output.success(`Passed: ${passed}`);
        if (failed > 0) {
          output.error(`Failed: ${failed}`);
        }
      }

      if (options.failOnDrift && failed > 0) {
        process.exit(EXIT_CODES.BREAKING);
      }
    } finally {
      await mcpClient.disconnect();
    }
  });

// List command
goldenCommand
  .command('list')
  .description('List all saved golden outputs')
  .option('-c, --config <path>', 'Path to config file', PATHS.DEFAULT_CONFIG_FILENAME)
  .option('--format <format>', 'Output format: text, json')
  .action(async (options) => {
    // Load configuration
    let config: BellwetherConfig;
    try {
      config = loadConfig(options.config);
    } catch (error) {
      if (error instanceof ConfigNotFoundError) {
        output.error(error.message);
        process.exit(EXIT_CODES.ERROR);
      }
      throw error;
    }

    const outputDir = config.output.dir;
    const storePath = getGoldenStorePath(outputDir);
    const format = options.format ?? config.golden.listFormat;

    if (!existsSync(storePath)) {
      output.info('No golden outputs found.');
      output.info('Use "bellwether golden save --tool <name>" to capture golden outputs.');
      return;
    }

    const goldens = listGoldenOutputs(storePath);

    if (goldens.length === 0) {
      output.info('No golden outputs saved.');
      return;
    }

    if (format === 'json') {
      output.info(JSON.stringify(goldens, null, 2));
      return;
    }

    output.info(`Golden Outputs (${goldens.length}):`);
    output.newline();

    output.info('| Tool | Captured | Mode | Content Type |');
    output.info('|------|----------|------|--------------|');

    for (const golden of goldens) {
      const captured = formatDateISO(new Date(golden.capturedAt));
      output.info(
        `| \`${golden.toolName}\` | ${captured} | ${golden.tolerance.mode} | ${golden.output.contentType} |`
      );
    }

    output.newline();
    output.info(`Store: ${storePath}`);
  });

// Delete command
goldenCommand
  .command('delete')
  .description('Delete a saved golden output')
  .requiredOption('--tool <name>', 'Tool name to delete golden output for')
  .option('-c, --config <path>', 'Path to config file', PATHS.DEFAULT_CONFIG_FILENAME)
  .option('--all', 'Delete all golden outputs for this tool (if multiple with different args)')
  .action(async (options) => {
    // Load configuration
    let config: BellwetherConfig;
    try {
      config = loadConfig(options.config);
    } catch (error) {
      if (error instanceof ConfigNotFoundError) {
        output.error(error.message);
        process.exit(EXIT_CODES.ERROR);
      }
      throw error;
    }

    const outputDir = config.output.dir;
    const storePath = getGoldenStorePath(outputDir);

    if (!existsSync(storePath)) {
      output.warn('No golden outputs found.');
      return;
    }

    const deleted = deleteGoldenOutput(options.tool, storePath);

    if (deleted) {
      output.success(`Deleted golden output for: ${options.tool}`);
    } else {
      output.warn(`No golden output found for: ${options.tool}`);
    }
  });

/**
 * Format comparison results as Markdown.
 */
function formatResultsMarkdown(results: GoldenComparisonResult[]): string {
  const lines: string[] = [];

  lines.push('## Golden Output Validation');
  lines.push('');
  lines.push('| Tool | Status | Mode | Differences |');
  lines.push('|------|--------|------|-------------|');

  for (const result of results) {
    const status = result.passed ? 'Match' : `${result.severity}`;
    const diffCount = result.differences.filter((d) => !d.allowed).length;
    lines.push(`| \`${result.toolName}\` | ${status} | ${result.mode} | ${diffCount} |`);
  }

  lines.push('');

  // Details for failed comparisons
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push('### Drift Details');
    lines.push('');

    for (const result of failed) {
      lines.push(`#### ${result.toolName}`);
      lines.push('');
      lines.push(`**Golden captured:** ${formatDateISO(new Date(result.goldenCapturedAt))}`);
      lines.push(`**Mode:** ${result.mode}`);
      lines.push(`**Severity:** ${result.severity}`);
      lines.push('');
      lines.push('**Changes:**');
      for (const diff of result.differences.filter((d) => !d.allowed)) {
        lines.push(`- ${diff.description}`);
        if (diff.expected !== undefined) {
          lines.push(`  - Expected: \`${String(diff.expected)}\``);
        }
        if (diff.actual !== undefined) {
          lines.push(`  - Actual: \`${String(diff.actual)}\``);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
