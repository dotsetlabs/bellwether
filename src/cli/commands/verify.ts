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
import { createLLMClient, DEFAULT_MODELS } from '../../llm/index.js';
import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../config/loader.js';
import { CostTracker } from '../../cost/index.js';
import { BUILTIN_PERSONAS } from '../../persona/builtins.js';
import type { Persona } from '../../persona/types.js';
import { TIMEOUTS, EXIT_CODES, PATHS } from '../../constants.js';
import * as output from '../output.js';
import { InterviewProgressBar } from '../utils/progress.js';
import type { InterviewProgress } from '../../interview/interviewer.js';
import { createCloudClient } from '../../cloud/client.js';
import { getLinkedProject, getSessionToken } from '../../cloud/auth.js';
import type { CloudVerificationResult } from '../../cloud/types.js';

// Convert BUILTIN_PERSONAS record to array
const ALL_PERSONAS: Persona[] = Object.values(BUILTIN_PERSONAS);

/**
 * Create a new verify command instance.
 * Useful for testing where fresh command instances are needed.
 */
export function createVerifyCommand(): Command {
  return new Command('verify')
    .description('Generate a verification report for the Verified by Bellwether program')
    .argument('[server-command]', 'Server command (overrides config)')
    .argument('[args...]', 'Server arguments')
    .option('-c, --config <path>', 'Path to config file', PATHS.DEFAULT_CONFIG_FILENAME)
    .option('-o, --output <dir>', 'Output directory')
    .option('--server-id <id>', 'Server identifier (namespace/name)')
    .option('--version <version>', 'Server version to verify')
    .option('--tier <tier>', 'Target verification tier (bronze, silver, gold, platinum)', 'silver')
    .option('--security', 'Include security testing (required for gold+ tiers)')
    .option('--json', 'Output verification result as JSON')
    .option('--badge-only', 'Only output badge URL')
    .option('-p, --project <id>', 'Project ID to submit verification to (requires login)')
    .action(async (serverCommandArg: string | undefined, serverArgs: string[], options) => {
      await handleVerify(serverCommandArg, serverArgs, options);
    });
}

export const verifyCommand = createVerifyCommand();

async function handleVerify(
  serverCommandArg: string | undefined,
  serverArgs: string[],
  options: {
    config: string;
    output?: string;
    serverId?: string;
    version?: string;
    tier: string;
    security?: boolean;
    json?: boolean;
    badgeOnly?: boolean;
    project?: string;
  }
): Promise<void> {
  output.info(chalk.bold('\n🔒 Bellwether Verification\n'));

  // Load configuration
  let bellwetherConfig: BellwetherConfig;
  try {
    bellwetherConfig = loadConfig(options.config);
  } catch (error) {
    if (error instanceof ConfigNotFoundError) {
      output.error(error.message);
      process.exit(EXIT_CODES.ERROR);
    }
    throw error;
  }

  // Determine server command (CLI arg overrides config)
  const serverCommand = serverCommandArg || bellwetherConfig.server.command;
  const args = serverArgs.length > 0 ? serverArgs : bellwetherConfig.server.args;

  if (!serverCommand) {
    output.error('Error: No server command provided.');
    output.error('Either specify a server command as an argument or configure it in bellwether.yaml');
    process.exit(EXIT_CODES.ERROR);
  }

  // Get LLM settings from config
  const provider = bellwetherConfig.llm.provider || 'ollama';
  const model = bellwetherConfig.llm.model || undefined;
  const outputDir = options.output ?? bellwetherConfig.output.dir ?? '.';
  const serverTimeout = bellwetherConfig.server.timeout ?? TIMEOUTS.DEFAULT;
  const serverEnv = bellwetherConfig.server.env;

  // Initialize cost tracker
  const effectiveModel = model || DEFAULT_MODELS[provider as 'openai' | 'anthropic' | 'ollama'];
  const costTracker = new CostTracker(effectiveModel);

  // Create LLM client with usage tracking
  let llm;
  try {
    llm = createLLMClient({
      provider: provider as 'openai' | 'anthropic' | 'ollama',
      model,
      onUsage: (inputTokens: number, outputTokens: number) => {
        costTracker.addUsage(inputTokens, outputTokens);
      },
    });
  } catch {
    output.error(chalk.red('Error: Could not create LLM client. Check your API keys.'));
    process.exit(EXIT_CODES.ERROR);
  }

  output.info(chalk.gray(`Using model: ${effectiveModel}`));

  // Connect to server
  output.info(chalk.gray(`Connecting to ${serverCommand} ${args.join(' ')}...`));
  const client = new MCPClient({ timeout: serverTimeout });

  try {
    await client.connect(serverCommand, args, serverEnv);
    const discovery = await discover(client, serverCommand, args);

    output.info(chalk.green(`✓ Connected to ${discovery.serverInfo.name} v${discovery.serverInfo.version}`));
    output.info(chalk.gray(`  ${discovery.tools.length} tools, ${discovery.prompts.length} prompts, ${(discovery.resources ?? []).length} resources`));
    output.newline();

    // Determine personas based on tier and security option
    const targetTier = options.tier as VerificationTier;
    const personas = selectPersonasForTier(targetTier, options.security);

    output.info(chalk.gray(`Target tier: ${targetTier}`));
    output.info(chalk.gray(`Using personas: ${personas.map((p: Persona) => p.name).join(', ')}`));
    output.newline();

    // Run interview
    output.info(chalk.bold('Running verification test...\n'));
    const interviewer = new Interviewer(llm, {
      ...DEFAULT_CONFIG,
      personas,
      maxQuestionsPerTool: targetTier === 'platinum' ? 5 : targetTier === 'gold' ? 4 : 3,
    });

    // Set up progress bar
    const progressBar = new InterviewProgressBar({ enabled: !output.isQuiet() });

    const progressCallback = (progress: InterviewProgress) => {
      if (progress.phase === 'starting') {
        progressBar.start(
          progress.totalTools,
          progress.totalPersonas,
          progress.totalPrompts ?? 0,
          progress.totalResources ?? 0
        );
      } else if (['interviewing', 'prompts', 'resources'].includes(progress.phase)) {
        progressBar.update(progress);
      } else if (progress.phase === 'complete' || progress.phase === 'synthesizing') {
        progressBar.stop();
      }
    };

    const interview = await interviewer.interview(client, discovery, progressCallback);

    progressBar.stop();
    output.newline();
    output.info(chalk.green('✓ Test complete'));

    // Display cost summary
    const costEstimate = costTracker.getCost();
    const usage = costEstimate.usage;
    if (usage.totalTokens > 0) {
      const costStr = costEstimate.costUSD > 0
        ? `$${costEstimate.costUSD.toFixed(4)}`
        : 'Free (local model)';
      output.info(chalk.gray(`  Tokens: ${usage.totalTokens.toLocaleString()} (${usage.inputTokens.toLocaleString()} in, ${usage.outputTokens.toLocaleString()} out)`));
      output.info(chalk.gray(`  Estimated cost: ${costStr}`));
    }
    output.newline();

    // Generate verification
    const serverId = options.serverId ?? `${discovery.serverInfo.name}`;
    const verificationConfig: VerificationConfig = {
      serverId,
      version: options.version ?? discovery.serverInfo.version,
      targetTier,
      includeSecurity: options.security,
      outputDir,
    };

    const report = generateVerificationReport(interview, verificationConfig);
    const result = report.result;

    // Output results
    if (options.badgeOnly) {
      output.info(generateBadgeUrl(result));
      return;
    }

    if (options.json) {
      output.json(report);
      return;
    }

    // Display verification result
    displayVerificationResult(result);

    // Save report
    const reportPath = join(outputDir, 'bellwether-verification.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    output.info(chalk.gray(`\nReport saved to: ${reportPath}`));

    // Display badge
    output.info('\n' + chalk.bold('Badge:'));
    output.info(chalk.cyan(generateBadgeUrl(result)));
    output.newline();
    output.info(chalk.bold('Markdown:'));
    output.info(chalk.gray(generateBadgeMarkdown(result)));

    // Submit to cloud if project ID is specified
    const projectId = options.project ?? getLinkedProject()?.projectId;
    if (projectId) {
      output.newline();

      // Check if logged in
      if (!getSessionToken()) {
        output.warn(chalk.yellow('⚠ Not logged in. Run `bellwether login` to submit verification to the platform.'));
      } else {
        output.info(chalk.gray('Submitting verification to platform...'));

        try {
          const cloudClient = createCloudClient();

          // Convert local result to cloud format
          const cloudResult: CloudVerificationResult = {
            serverId: result.serverId,
            version: result.version,
            status: result.status,
            tier: result.tier,
            verifiedAt: result.verifiedAt,
            expiresAt: result.expiresAt,
            toolsVerified: result.toolsVerified,
            testsPassed: result.testsPassed,
            testsTotal: result.testsTotal,
            passRate: result.passRate,
            reportHash: result.reportHash,
            bellwetherVersion: result.bellwetherVersion,
          };

          const submission = await cloudClient.submitVerification(
            projectId,
            cloudResult,
            report as unknown as Record<string, unknown>
          );

          output.info(chalk.green(`✓ Verification submitted successfully`));
          output.info(chalk.gray(`  View at: ${submission.viewUrl}`));
        } catch (submitError) {
          output.error(chalk.red(`Failed to submit verification: ${submitError instanceof Error ? submitError.message : 'Unknown error'}`));
          // Don't exit with error - local verification succeeded
        }
      }
    }

    // Exit with appropriate code
    if (result.status !== 'verified') {
      process.exit(EXIT_CODES.ERROR);
    }
  } catch (error) {
    output.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(EXIT_CODES.ERROR);
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

  output.info('─'.repeat(60));
  output.newline();
  output.info(chalk.bold('Verification Result'));
  output.newline();
  output.info(`  Server:     ${result.serverId} v${result.version}`);
  output.info(`  Status:     ${statusColor(result.status.toUpperCase())}`);
  if (result.tier) {
    output.info(`  Tier:       ${tierColor(result.tier.toUpperCase())}`);
  }
  output.newline();
  output.info(`  Pass Rate:  ${result.passRate}% (${result.testsPassed}/${result.testsTotal} tests)`);
  output.info(`  Tools:      ${result.toolsVerified} verified`);
  output.newline();
  output.info(`  Verified:   ${new Date(result.verifiedAt).toLocaleDateString()}`);
  output.info(`  Expires:    ${new Date(result.expiresAt).toLocaleDateString()}`);
  output.newline();
  output.info('─'.repeat(60));
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
