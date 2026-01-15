/**
 * Interactive mode utilities for CLI commands.
 *
 * Provides user prompts for server command, persona selection,
 * output format, and interview control.
 */

import * as readline from 'readline';
import type { BellwetherConfig } from '../config/loader.js';
import * as output from './output.js';

/**
 * Create a readline interface for prompting.
 */
function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a question and wait for user input.
 */
function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Present numbered options and get user selection.
 */
async function selectOption(
  rl: readline.Interface,
  prompt: string,
  options: string[]
): Promise<number> {
  output.info(prompt);
  output.numberedList(options);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await ask(rl, `Enter choice (1-${options.length}): `);
    const num = parseInt(input, 10);
    if (num >= 1 && num <= options.length) {
      return num - 1;
    }
    output.info(`Invalid choice. Please enter a number between 1 and ${options.length}.`);
  }
}

/**
 * Present yes/no question.
 */
async function confirm(rl: readline.Interface, prompt: string, defaultValue = false): Promise<boolean> {
  const suffix = defaultValue ? '[Y/n]' : '[y/N]';
  const input = await ask(rl, `${prompt} ${suffix}: `);

  if (!input) {
    return defaultValue;
  }

  return input.toLowerCase() === 'y' || input.toLowerCase() === 'yes';
}

/**
 * Interactive configuration gathered from prompts.
 */
export interface InteractiveConfig {
  serverCommand: string;
  serverArgs: string[];
  selectedPersonas: string[];
  outputFormat: 'markdown' | 'json' | 'both';
  outputDir: string;
  saveBaseline: boolean;
  baselinePath?: string;
  compareBaseline?: string;
  maxQuestions?: number;
}

/**
 * Available personas for selection.
 */
const AVAILABLE_PERSONAS = [
  { name: 'friendly', description: 'Casual, exploratory testing' },
  { name: 'adversarial', description: 'Security-focused boundary testing' },
  { name: 'compliance', description: 'Policy and compliance verification' },
  { name: 'thorough', description: 'Comprehensive feature coverage' },
  { name: 'minimal', description: 'Quick smoke testing' },
];

/**
 * Output format options.
 */
const OUTPUT_FORMATS = [
  { value: 'markdown', description: 'AGENTS.md documentation file' },
  { value: 'json', description: 'JSON report file' },
  { value: 'both', description: 'Both markdown and JSON' },
];

/**
 * Prompt user for interactive configuration.
 */
export async function promptForConfig(
  existingConfig: BellwetherConfig,
  providedCommand?: string,
  providedArgs?: string[]
): Promise<InteractiveConfig> {
  const rl = createPrompt();

  try {
    output.info('\n=== Bellwether Interactive Mode ===\n');

    // Server command
    let serverCommand = providedCommand || '';
    let serverArgs = providedArgs || [];

    if (!serverCommand) {
      output.info('Enter the command to start your MCP server.');
      output.info('Examples:');
      output.info('  npx @modelcontextprotocol/server-filesystem /path/to/dir');
      output.info('  python mcp_server.py');
      output.info('  node my-server.js\n');

      const fullCommand = await ask(rl, 'Server command: ');
      if (!fullCommand) {
        throw new Error('Server command is required');
      }

      const parts = fullCommand.split(/\s+/);
      serverCommand = parts[0];
      serverArgs = parts.slice(1);
    }

    // Persona selection
    output.info('\nSelect personas to use during the interview:');
    const selectedPersonas: string[] = [];

    for (const persona of AVAILABLE_PERSONAS) {
      const selected = await confirm(rl, `  Use ${persona.name}? (${persona.description})`,
        existingConfig.interview.personas?.includes(persona.name) ?? persona.name === 'friendly');
      if (selected) {
        selectedPersonas.push(persona.name);
      }
    }

    if (selectedPersonas.length === 0) {
      output.info('No personas selected. Using default "friendly" persona.');
      selectedPersonas.push('friendly');
    }

    // Output format
    output.info('\nSelect output format:');
    const formatIndex = await selectOption(
      rl,
      '',
      OUTPUT_FORMATS.map((f) => `${f.value} - ${f.description}`)
    );
    const outputFormat = OUTPUT_FORMATS[formatIndex].value as InteractiveConfig['outputFormat'];

    // Output directory
    const outputDir = await ask(rl, '\nOutput directory [.]: ') || '.';

    // Max questions per tool
    const maxQuestionsInput = await ask(
      rl,
      `\nMax questions per tool [${existingConfig.interview.maxQuestionsPerTool}]: `
    );
    const maxQuestions = maxQuestionsInput
      ? parseInt(maxQuestionsInput, 10)
      : existingConfig.interview.maxQuestionsPerTool;

    // Baseline options
    const saveBaseline = await confirm(rl, '\nSave baseline for future drift detection?', true);
    let baselinePath: string | undefined;
    if (saveBaseline) {
      baselinePath = await ask(rl, 'Baseline path [bellwether-baseline.json]: ') || 'bellwether-baseline.json';
    }

    const compareBaseline = await ask(rl, '\nCompare against existing baseline (leave empty to skip): ');

    return {
      serverCommand,
      serverArgs,
      selectedPersonas,
      outputFormat,
      outputDir,
      saveBaseline,
      baselinePath,
      compareBaseline: compareBaseline || undefined,
      maxQuestions,
    };
  } finally {
    rl.close();
  }
}

/**
 * Pause controller for mid-interview pause/resume.
 */
export interface PauseController {
  isPaused: boolean;
  pause(): void;
  resume(): void;
  waitIfPaused(): Promise<void>;
}

/**
 * Create a pause controller for interview control.
 */
export function createPauseController(): PauseController {
  let paused = false;
  let resumePromiseResolve: (() => void) | null = null;

  return {
    get isPaused() {
      return paused;
    },

    pause() {
      paused = true;
      output.info('\n[Interview paused. Press Enter to resume, or Ctrl+C to abort]');
    },

    resume() {
      paused = false;
      if (resumePromiseResolve) {
        resumePromiseResolve();
        resumePromiseResolve = null;
      }
      output.info('[Resumed]');
    },

    async waitIfPaused(): Promise<void> {
      if (!paused) return;

      return new Promise((resolve) => {
        resumePromiseResolve = resolve;
      });
    },
  };
}

/**
 * Setup keyboard listener for pause/resume during interview.
 */
export function setupInteractiveKeyboard(controller: PauseController): () => void {
  const rl = createPrompt();

  // Don't block the process
  rl.on('line', () => {
    if (controller.isPaused) {
      controller.resume();
    } else {
      controller.pause();
    }
  });

  // Handle SIGINT gracefully
  rl.on('SIGINT', () => {
    output.info('\nInterview aborted by user.');
    process.exit(130);
  });

  return () => {
    rl.close();
  };
}

/**
 * Display a summary of the interactive configuration.
 */
export function displayConfigSummary(config: InteractiveConfig): void {
  output.info('\n=== Configuration Summary ===');
  output.info(`Server: ${config.serverCommand} ${config.serverArgs.join(' ')}`);
  output.info(`Personas: ${config.selectedPersonas.join(', ')}`);
  output.info(`Output format: ${config.outputFormat}`);
  output.info(`Output directory: ${config.outputDir}`);
  output.info(`Max questions: ${config.maxQuestions ?? 'default'}`);
  if (config.saveBaseline) {
    output.info(`Save baseline: ${config.baselinePath}`);
  }
  if (config.compareBaseline) {
    output.info(`Compare baseline: ${config.compareBaseline}`);
  }
  output.newline();
}
