import { Command } from 'commander';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { MCPClient } from '../../transport/mcp-client.js';
import { discover } from '../../discovery/discovery.js';
import { createLLMClient, type LLMClient } from '../../llm/index.js';
import { Interviewer } from '../../interview/interviewer.js';
import { loadConfig } from '../../config/loader.js';
import type { InterviewProgress } from '../../interview/interviewer.js';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  compareBaselines,
  formatDiffText,
} from '../../baseline/index.js';

export const watchCommand = new Command('watch')
  .description('Watch for MCP server changes and auto-interview')
  .argument('<command>', 'Command to start the MCP server')
  .argument('[args...]', 'Arguments to pass to the server')
  .option('-c, --config <path>', 'Path to config file')
  .option('-w, --watch-path <path>', 'Path to watch for changes', '.')
  .option('-i, --interval <ms>', 'Polling interval in milliseconds', '5000')
  .option('--max-questions <n>', 'Max questions per tool')
  .option('--baseline <path>', 'Baseline file to compare against', 'inquest-baseline.json')
  .option('--on-change <command>', 'Command to run after detecting drift')
  .action(async (command: string, args: string[], options) => {
    const config = loadConfig(options.config);
    const watchPath = resolve(options.watchPath);
    const interval = parseInt(options.interval, 10);
    const maxQuestions = options.maxQuestions
      ? parseInt(options.maxQuestions, 10)
      : config.interview.maxQuestionsPerTool;
    const baselinePath = resolve(options.baseline);

    console.log('Inquest Watch Mode\n');
    console.log(`Server: ${command} ${args.join(' ')}`);
    console.log(`Watching: ${watchPath}`);
    console.log(`Baseline: ${baselinePath}`);
    console.log(`Poll interval: ${interval}ms`);
    console.log('');

    // Initialize LLM client
    let llmClient: LLMClient;
    try {
      llmClient = createLLMClient({
        provider: config.llm.provider,
        model: config.llm.model,
        apiKey: config.llm.apiKey,
        apiKeyEnvVar: config.llm.apiKeyEnvVar,
        baseUrl: config.llm.baseUrl,
      });
    } catch (error) {
      console.error('Failed to initialize LLM client:', error instanceof Error ? error.message : error);
      process.exit(1);
    }

    // Track last baseline hash to detect changes
    let lastBaselineHash: string | null = null;
    if (existsSync(baselinePath)) {
      const baseline = loadBaseline(baselinePath);
      lastBaselineHash = baseline.integrityHash;
      console.log(`Loaded existing baseline: ${lastBaselineHash.slice(0, 8)}`);
    }

    // Track watched file modification times
    const fileModTimes = new Map<string, number>();

    async function runInterview(): Promise<void> {
      const mcpClient = new MCPClient({ timeout: 60000 });

      try {
        console.log('\n--- Running Interview ---');
        console.log(`[${new Date().toLocaleTimeString()}] Starting interview...`);

        await mcpClient.connect(command, args);
        const discovery = await discover(mcpClient, command, args);
        console.log(`Found ${discovery.tools.length} tools`);

        if (discovery.tools.length === 0) {
          console.log('No tools found. Skipping.');
          await mcpClient.disconnect();
          return;
        }

        const interviewer = new Interviewer(llmClient, {
          maxQuestionsPerTool: maxQuestions,
          timeout: 60000,
          skipErrorTests: config.interview.skipErrorTests ?? false,
          model: config.llm.model,
        });

        const progressCallback = (progress: InterviewProgress) => {
          const totalTools = progress.totalTools * progress.totalPersonas;
          const toolsDone = (progress.personasCompleted * progress.totalTools) + progress.toolsCompleted;
          process.stdout.write(`\rInterviewing: ${toolsDone}/${totalTools} tools`.padEnd(60));
        };

        const result = await interviewer.interview(mcpClient, discovery, progressCallback);
        console.log('\n');

        // Create and compare baseline
        const serverCommand = `${command} ${args.join(' ')}`;
        const newBaseline = createBaseline(result, serverCommand);

        if (lastBaselineHash && existsSync(baselinePath)) {
          const previousBaseline = loadBaseline(baselinePath);
          const diff = compareBaselines(previousBaseline, newBaseline);

          if (diff.severity !== 'none') {
            console.log('\n--- Behavioral Drift Detected ---');
            console.log(formatDiffText(diff));

            // Run on-change command if specified
            if (options.onChange) {
              console.log(`\nRunning: ${options.onChange}`);
              const { execSync } = await import('child_process');
              try {
                execSync(options.onChange, { stdio: 'inherit' });
              } catch (e) {
                console.error('On-change command failed:', e instanceof Error ? e.message : e);
              }
            }
          } else {
            console.log('No drift detected.');
          }
        }

        // Save new baseline
        saveBaseline(newBaseline, baselinePath);
        lastBaselineHash = newBaseline.integrityHash;
        console.log(`Baseline updated: ${newBaseline.integrityHash.slice(0, 8)}`);

      } catch (error) {
        console.error('Interview failed:', error instanceof Error ? error.message : error);
      } finally {
        await mcpClient.disconnect();
      }
    }

    function checkForChanges(): boolean {
      // Simple file watcher - check if any .ts, .js, .json files changed
      const extensions = ['.ts', '.js', '.json', '.py', '.go'];
      let changed = false;

      function walkDir(dir: string): void {
        try {
          const entries = readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            // Skip common directories
            if (entry.isDirectory()) {
              if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
                continue;
              }
              walkDir(fullPath);
            } else if (entry.isFile()) {
              if (extensions.some(ext => entry.name.endsWith(ext))) {
                const stat = statSync(fullPath);
                const modTime = stat.mtimeMs;
                const lastMod = fileModTimes.get(fullPath);

                if (lastMod === undefined) {
                  fileModTimes.set(fullPath, modTime);
                } else if (modTime > lastMod) {
                  fileModTimes.set(fullPath, modTime);
                  console.log(`\nFile changed: ${fullPath}`);
                  changed = true;
                }
              }
            }
          }
        } catch {
          // Ignore errors
        }
      }

      walkDir(watchPath);
      return changed;
    }

    // Initial interview
    await runInterview();

    console.log('\nWatching for changes... (Press Ctrl+C to exit)\n');

    // Poll for changes
    const pollInterval = setInterval(async () => {
      if (checkForChanges()) {
        clearInterval(pollInterval);
        await runInterview();
        console.log('\nWatching for changes... (Press Ctrl+C to exit)\n');
        // Restart polling
        setInterval(async () => {
          if (checkForChanges()) {
            await runInterview();
            console.log('\nWatching for changes... (Press Ctrl+C to exit)\n');
          }
        }, interval);
      }
    }, interval);

    // Handle exit
    process.on('SIGINT', () => {
      console.log('\n\nExiting watch mode.');
      clearInterval(pollInterval);
      process.exit(0);
    });
  });
