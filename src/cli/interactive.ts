/**
 * Interactive mode utilities for CLI commands.
 *
 * Provides user prompts for server command, persona selection,
 * output format, and interview control.
 */

import * as readline from 'readline';
import type { InquestConfig } from '../config/loader.js';

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
  console.log(prompt);
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}) ${opt}`);
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await ask(rl, `Enter choice (1-${options.length}): `);
    const num = parseInt(input, 10);
    if (num >= 1 && num <= options.length) {
      return num - 1;
    }
    console.log(`Invalid choice. Please enter a number between 1 and ${options.length}.`);
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
  existingConfig: InquestConfig,
  providedCommand?: string,
  providedArgs?: string[]
): Promise<InteractiveConfig> {
  const rl = createPrompt();

  try {
    console.log('\n=== Inquest Interactive Mode ===\n');

    // Server command
    let serverCommand = providedCommand || '';
    let serverArgs = providedArgs || [];

    if (!serverCommand) {
      console.log('Enter the command to start your MCP server.');
      console.log('Examples:');
      console.log('  npx @modelcontextprotocol/server-filesystem /path/to/dir');
      console.log('  python mcp_server.py');
      console.log('  node my-server.js\n');

      const fullCommand = await ask(rl, 'Server command: ');
      if (!fullCommand) {
        throw new Error('Server command is required');
      }

      const parts = fullCommand.split(/\s+/);
      serverCommand = parts[0];
      serverArgs = parts.slice(1);
    }

    // Persona selection
    console.log('\nSelect personas to use during the interview:');
    const selectedPersonas: string[] = [];

    for (const persona of AVAILABLE_PERSONAS) {
      const selected = await confirm(rl, `  Use ${persona.name}? (${persona.description})`,
        existingConfig.interview.personas?.includes(persona.name) ?? persona.name === 'friendly');
      if (selected) {
        selectedPersonas.push(persona.name);
      }
    }

    if (selectedPersonas.length === 0) {
      console.log('No personas selected. Using default "friendly" persona.');
      selectedPersonas.push('friendly');
    }

    // Output format
    console.log('\nSelect output format:');
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
      baselinePath = await ask(rl, 'Baseline path [inquest-baseline.json]: ') || 'inquest-baseline.json';
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
      console.log('\n[Interview paused. Press Enter to resume, or Ctrl+C to abort]');
    },

    resume() {
      paused = false;
      if (resumePromiseResolve) {
        resumePromiseResolve();
        resumePromiseResolve = null;
      }
      console.log('[Resumed]');
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
    console.log('\nInterview aborted by user.');
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
  console.log('\n=== Configuration Summary ===');
  console.log(`Server: ${config.serverCommand} ${config.serverArgs.join(' ')}`);
  console.log(`Personas: ${config.selectedPersonas.join(', ')}`);
  console.log(`Output format: ${config.outputFormat}`);
  console.log(`Output directory: ${config.outputDir}`);
  console.log(`Max questions: ${config.maxQuestions ?? 'default'}`);
  if (config.saveBaseline) {
    console.log(`Save baseline: ${config.baselinePath}`);
  }
  if (config.compareBaseline) {
    console.log(`Compare baseline: ${config.compareBaseline}`);
  }
  console.log('');
}
