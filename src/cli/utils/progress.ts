/**
 * Progress bar utilities for CLI test display.
 */

import cliProgress from 'cli-progress';
import type { InterviewProgress } from '../../interview/interviewer.js';
import { suppressLogs, restoreLogLevel } from '../../logging/logger.js';
import { DISPLAY_LIMITS } from '../../constants.js';

export interface ProgressBarOptions {
  /** Whether to show the progress bar (false for verbose mode) */
  enabled?: boolean;
  /** Stream to write to (defaults to stdout) */
  stream?: NodeJS.WriteStream;
}

/**
 * Creates and manages a progress bar for test progress.
 */
export class InterviewProgressBar {
  private bar: cliProgress.SingleBar | null = null;
  private enabled: boolean;
  private started = false;
  private totalWork = 0;
  private toolWork = 0;
  private currentValue = 0;
  private currentPayload: Record<string, unknown> = {};

  constructor(options: ProgressBarOptions = {}) {
    const stream = options.stream ?? process.stderr;
    // Only enable progress bar if running in a TTY terminal
    this.enabled = (options.enabled ?? true) && (stream.isTTY ?? false);

    if (this.enabled) {
      this.bar = new cliProgress.SingleBar(
        {
          format:
            '{bar} {percentage}% | {phase}: {item} ({current}/{phaseTotal}) | {questions} questions',
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true,
          clearOnComplete: true,
          stream,
          // Force redraw on every update to prevent stale display
          forceRedraw: true,
          // Disable line wrapping to prevent display issues
          linewrap: false,
          // Synchronous updates prevent race conditions with terminal output
          synchronousUpdate: true,
        },
        cliProgress.Presets.shades_classic
      );
    }
  }

  /**
   * Start the progress bar with initial values.
   */
  start(totalTools: number, totalPersonas: number, totalPrompts = 0, totalResources = 0): void {
    if (!this.enabled || !this.bar) return;

    // Suppress logging while progress bar is active to prevent interference
    suppressLogs();

    // Calculate total work across all phases
    this.toolWork = totalTools * totalPersonas;
    this.totalWork = this.toolWork + totalPrompts + totalResources;

    this.bar.start(this.totalWork, 0, {
      phase: 'Starting',
      item: '...',
      current: 0,
      phaseTotal: totalTools,
      questions: 0,
    });
    this.started = true;
  }

  /**
   * Update the progress bar with current progress.
   */
  update(progress: InterviewProgress): void {
    if (!this.enabled || !this.bar || !this.started) return;

    // Handle workflow phase differently
    if (progress.phase === 'workflows' && progress.totalWorkflows) {
      this.bar.update(progress.workflowsCompleted ?? 0, {
        phase: 'Workflows',
        item: progress.currentWorkflow ?? '...',
        current: (progress.workflowsCompleted ?? 0) + 1,
        phaseTotal: progress.totalWorkflows,
        questions: progress.questionsAsked,
      });
      return;
    }

    // Calculate completed work based on current phase
    let completedWork: number;
    let phaseLabel: string;
    let currentItem: string;
    let currentNum: number;
    let totalNum: number;

    if (progress.phase === 'interviewing') {
      // Tools phase: count completed tools across personas
      completedWork = progress.personasCompleted * progress.totalTools + progress.toolsCompleted;
      phaseLabel = progress.currentPersona ?? 'Interviewing';
      currentItem = progress.currentTool ?? '...';
      currentNum = progress.toolsCompleted + 1;
      totalNum = progress.totalTools;
    } else if (progress.phase === 'prompts') {
      // Prompts phase: all tools done + prompts completed
      completedWork = this.toolWork + (progress.promptsCompleted ?? 0);
      phaseLabel = 'Prompts';
      currentItem = progress.currentTool?.replace('prompt:', '') ?? '...';
      currentNum = (progress.promptsCompleted ?? 0) + 1;
      totalNum = progress.totalPrompts ?? 0;
    } else if (progress.phase === 'resources') {
      // Resources phase: all tools done + all prompts done + resources completed
      completedWork = this.toolWork + (progress.totalPrompts ?? 0) + (progress.resourcesCompleted ?? 0);
      phaseLabel = 'Resources';
      currentItem = progress.currentTool?.replace('resource:', '') ?? '...';
      currentNum = (progress.resourcesCompleted ?? 0) + 1;
      totalNum = progress.totalResources ?? 0;
    } else {
      // Default/starting phase
      completedWork = 0;
      phaseLabel = 'Starting';
      currentItem = '...';
      currentNum = 0;
      totalNum = progress.totalTools;
    }

    // Track current state for potential restart after logging
    this.currentValue = completedWork;
    this.currentPayload = {
      phase: phaseLabel,
      item: currentItem,
      current: currentNum,
      phaseTotal: totalNum,
      questions: progress.questionsAsked,
    };

    this.bar.update(completedWork, this.currentPayload);
  }

  /**
   * Stop and clear the progress bar.
   */
  stop(): void {
    if (!this.enabled || !this.bar || !this.started) return;

    this.bar.stop();
    this.started = false;

    // Restore logging after progress bar is done
    restoreLogLevel();
  }

  /**
   * Log a message while the progress bar is active.
   * Uses the same stream as the progress bar to avoid terminal overlap issues.
   */
  log(message: string): void {
    if (!this.enabled || !this.bar || !this.started) {
      console.log(message);
      return;
    }

    // Stop the progress bar temporarily to prevent overlap
    this.bar.stop();

    // Write to stderr (same stream as progress bar) to avoid mixing streams
    process.stderr.write(message + '\n');

    // Restart the progress bar with tracked state
    this.bar.start(this.totalWork, this.currentValue, this.currentPayload);
  }
}

/**
 * Format a startup banner for the check command.
 */
export function formatCheckBanner(options: {
  serverCommand: string;
  toolCount?: number;
}): string {
  const { serverCommand, toolCount } = options;

  // Truncate server command if too long
  const maxCmdLen = DISPLAY_LIMITS.BANNER_COMMAND_MAX_LENGTH;
  const displayCmd =
    serverCommand.length > maxCmdLen
      ? serverCommand.substring(0, maxCmdLen - 3) + '...'
      : serverCommand;

  const lines = [
    'Bellwether Check - Schema Validation & Drift Detection',
    '',
    '\u250C' + '\u2500'.repeat(50) + '\u2510',
    `\u2502 Server:    ${displayCmd.padEnd(38)}\u2502`,
    `\u2502 Mode:      ${'Check (free, deterministic)'.padEnd(38)}\u2502`,
  ];

  if (toolCount !== undefined) {
    lines.push(`\u2502 Tools:     ${String(toolCount + ' discovered').padEnd(38)}\u2502`);
  }

  lines.push('\u2514' + '\u2500'.repeat(50) + '\u2518');

  return lines.join('\n');
}

/**
 * Format a startup banner for the explore command.
 */
export function formatExploreBanner(options: {
  serverCommand: string;
  provider: string;
  model: string;
  personas: string[];
  questionsPerTool: number;
  toolCount?: number;
}): string {
  const {
    serverCommand,
    provider,
    model,
    personas,
    questionsPerTool,
    toolCount,
  } = options;

  // Truncate server command if too long
  const maxCmdLen = DISPLAY_LIMITS.BANNER_COMMAND_MAX_LENGTH;
  const displayCmd =
    serverCommand.length > maxCmdLen
      ? serverCommand.substring(0, maxCmdLen - 3) + '...'
      : serverCommand;

  const personaList = personas.join(', ');
  const personaLabel = `${personaList} (${personas.length})`;

  const lines = [
    'Bellwether Explore - Behavioral Documentation',
    '',
    '\u250C' + '\u2500'.repeat(50) + '\u2510',
    `\u2502 Server:    ${displayCmd.padEnd(38)}\u2502`,
    `\u2502 Provider:  ${provider.padEnd(38)}\u2502`,
    `\u2502 Model:     ${model.padEnd(38)}\u2502`,
    `\u2502 Personas:  ${personaLabel.padEnd(38)}\u2502`,
    `\u2502 Questions: ${String(questionsPerTool + ' per tool').padEnd(38)}\u2502`,
  ];

  if (toolCount !== undefined) {
    lines.push(`\u2502 Tools:     ${String(toolCount + ' discovered').padEnd(38)}\u2502`);
  }

  lines.push('\u2514' + '\u2500'.repeat(50) + '\u2518');
  lines.push('');
  lines.push(
    'Tip: For drift detection, use "bellwether check" instead'
  );

  return lines.join('\n');
}
