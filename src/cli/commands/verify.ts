/**
 * Verify command - generate verification reports for the Verified by Bellwether program.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import {
  generateVerificationReport,
  generateBadgeUrl,
  generateBadgeMarkdown,
} from '../../verification/index.js';
import type { VerificationTier, VerificationConfig } from '../../verification/index.js';
import { Interviewer, DEFAULT_CONFIG } from '../../interview/interviewer.js';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { createLLMClient } from '../../llm/index.js';
import { loadConfigNew, ConfigNotFoundError } from '../../config/loader.js';
import { BUILTIN_PERSONAS } from '../../persona/builtins.js';
import type { Persona } from '../../persona/types.js';
import { TIMEOUTS } from '../../constants.js';

// Convert BUILTIN_PERSONAS record to array
const ALL_PERSONAS: Persona[] = Object.values(BUILTIN_PERSONAS);

export function createVerifyCommand(): Command {
  const verify = new Command('verify')
    .description('Generate a verification report for the Verified by Bellwether program')
    .argument('<command>', 'Command to start the MCP server')
    .argument('[args...]', 'Arguments for the server command')
    .option('-o, --output <dir>', 'Output directory', '.')
    .option('--server-id <id>', 'Server identifier (namespace/name)')
    .option('--version <version>', 'Server version to verify')
    .option('--tier <tier>', 'Target verification tier (bronze, silver, gold, platinum)', 'silver')
    .option('--security', 'Include security testing (required for gold+ tiers)')
    .option('--json', 'Output verification result as JSON')
    .option('--badge-only', 'Only output badge URL')
    .option('--provider <provider>', 'LLM provider (openai, anthropic, ollama)', 'openai')
    .option('--model <model>', 'LLM model to use')
    .action(async (command: string, args: string[], options) => {
      await handleVerify(command, args, options);
    });

  return verify;
}

async function handleVerify(
  command: string,
  args: string[],
  options: {
    output: string;
    serverId?: string;
    version?: string;
    tier: string;
    security?: boolean;
    json?: boolean;
    badgeOnly?: boolean;
    provider: string;
    model?: string;
  }
): Promise<void> {
  console.log(chalk.bold('\n🔒 Bellwether Verification\n'));

  // Try to load config (optional - verify command doesn't require config file)
  let configProvider: string | undefined;
  let configModel: string | undefined;
  try {
    const config = loadConfigNew();
    configProvider = config.llm.provider;
    configModel = config.llm.model;
  } catch (error) {
    if (!(error instanceof ConfigNotFoundError)) {
      throw error;
    }
    // No config file is OK - we'll use CLI options or defaults
  }

  const provider = options.provider ?? configProvider ?? 'openai';
  const model = options.model ?? configModel;

  // Create LLM client
  let llm;
  try {
    llm = createLLMClient({
      provider: provider as 'openai' | 'anthropic' | 'ollama',
      model,
    });
  } catch {
    console.error(chalk.red('Error: Could not create LLM client. Check your API keys.'));
    process.exit(1);
  }

  // Connect to server
  console.log(chalk.gray(`Connecting to ${command} ${args.join(' ')}...`));
  const client = new MCPClient({ timeout: TIMEOUTS.DEFAULT });

  try {
    await client.connect(command, args);
    const discovery = await discover(client, command, args);

    console.log(chalk.green(`✓ Connected to ${discovery.serverInfo.name} v${discovery.serverInfo.version}`));
    console.log(chalk.gray(`  ${discovery.tools.length} tools, ${discovery.prompts.length} prompts, ${(discovery.resources ?? []).length} resources`));
    console.log('');

    // Determine personas based on tier and security option
    const targetTier = options.tier as VerificationTier;
    const personas = selectPersonasForTier(targetTier, options.security);

    console.log(chalk.gray(`Target tier: ${targetTier}`));
    console.log(chalk.gray(`Using personas: ${personas.map((p: Persona) => p.name).join(', ')}`));
    console.log('');

    // Run interview
    console.log(chalk.bold('Running verification test...'));
    const interviewer = new Interviewer(llm, {
      ...DEFAULT_CONFIG,
      personas,
      maxQuestionsPerTool: targetTier === 'platinum' ? 5 : targetTier === 'gold' ? 4 : 3,
    });

    const interview = await interviewer.interview(client, discovery, (progress) => {
      if (progress.currentTool) {
        process.stdout.write(chalk.gray(`  Testing: ${progress.currentTool}...\r`));
      }
    });

    console.log(chalk.green('\n✓ Test complete\n'));

    // Generate verification
    const serverId = options.serverId ?? `${discovery.serverInfo.name}`;
    const config: VerificationConfig = {
      serverId,
      version: options.version ?? discovery.serverInfo.version,
      targetTier,
      includeSecurity: options.security,
      outputDir: options.output,
    };

    const report = generateVerificationReport(interview, config);
    const result = report.result;

    // Output results
    if (options.badgeOnly) {
      console.log(generateBadgeUrl(result));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // Display verification result
    displayVerificationResult(result);

    // Save report
    const reportPath = join(options.output, 'bellwether-verification.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(chalk.gray(`\nReport saved to: ${reportPath}`));

    // Display badge
    console.log('\n' + chalk.bold('Badge:'));
    console.log(chalk.cyan(generateBadgeUrl(result)));
    console.log('');
    console.log(chalk.bold('Markdown:'));
    console.log(chalk.gray(generateBadgeMarkdown(result)));

    // Exit with appropriate code
    if (result.status !== 'verified') {
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

function selectPersonasForTier(tier: VerificationTier, includeSecurity?: boolean): Persona[] {
  switch (tier) {
    case 'platinum':
      // All personas including security
      return ALL_PERSONAS;

    case 'gold':
      // Technical Writer, QA Engineer, Security Tester
      if (includeSecurity) {
        return ALL_PERSONAS.filter((p: Persona) =>
          ['technical_writer', 'qa_engineer', 'security_tester'].includes(p.id)
        );
      }
      return ALL_PERSONAS.filter((p: Persona) =>
        ['technical_writer', 'qa_engineer', 'novice_user'].includes(p.id)
      );

    case 'silver':
      // Technical Writer and QA Engineer
      return ALL_PERSONAS.filter((p: Persona) =>
        ['technical_writer', 'qa_engineer'].includes(p.id)
      );

    case 'bronze':
    default:
      // Just Technical Writer
      return ALL_PERSONAS.filter((p: Persona) => p.id === 'technical_writer');
  }
}

function displayVerificationResult(result: {
  status: string;
  tier?: string;
  serverId: string;
  version: string;
  passRate: number;
  testsPassed: number;
  testsTotal: number;
  toolsVerified: number;
  verifiedAt: string;
  expiresAt: string;
}): void {
  const statusColor = result.status === 'verified' ? chalk.green : chalk.red;
  const tierColor = getTierChalk(result.tier);

  console.log('─'.repeat(60));
  console.log('');
  console.log(chalk.bold('Verification Result'));
  console.log('');
  console.log(`  Server:     ${result.serverId} v${result.version}`);
  console.log(`  Status:     ${statusColor(result.status.toUpperCase())}`);
  if (result.tier) {
    console.log(`  Tier:       ${tierColor(result.tier.toUpperCase())}`);
  }
  console.log('');
  console.log(`  Pass Rate:  ${result.passRate}% (${result.testsPassed}/${result.testsTotal} tests)`);
  console.log(`  Tools:      ${result.toolsVerified} verified`);
  console.log('');
  console.log(`  Verified:   ${new Date(result.verifiedAt).toLocaleDateString()}`);
  console.log(`  Expires:    ${new Date(result.expiresAt).toLocaleDateString()}`);
  console.log('');
  console.log('─'.repeat(60));
}

function getTierChalk(tier?: string): (text: string) => string {
  switch (tier) {
    case 'platinum':
      return (text: string) => chalk.cyan(text);
    case 'gold':
      return (text: string) => chalk.yellow(text);
    case 'silver':
      return (text: string) => chalk.gray(text);
    case 'bronze':
      return (text: string) => chalk.hex('#CD7F32')(text);
    default:
      return (text: string) => text;
  }
}
