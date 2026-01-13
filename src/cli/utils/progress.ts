/**
 * Progress bar utilities for CLI interview display.
 */

import cliProgress from 'cli-progress';
import type { InterviewProgress } from '../../interview/interviewer.js';

export interface ProgressBarOptions {
  /** Whether to show the progress bar (false for verbose mode) */
  enabled?: boolean;
  /** Stream to write to (defaults to stdout) */
  stream?: NodeJS.WriteStream;
}

/**
 * Creates and manages a progress bar for interview progress.
 */
export class InterviewProgressBar {
  private bar: cliProgress.SingleBar | null = null;
  private enabled: boolean;
  private started = false;

  constructor(options: ProgressBarOptions = {}) {
    this.enabled = options.enabled ?? true;

    if (this.enabled) {
      this.bar = new cliProgress.SingleBar(
        {
          format:
            '{bar} {percentage}% | {persona}: {tool} ({current}/{total}) | {questions} questions',
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true,
          clearOnComplete: true,
          stream: options.stream ?? process.stdout,
        },
        cliProgress.Presets.shades_classic
      );
    }
  }

  /**
   * Start the progress bar with initial values.
   */
  start(totalTools: number, totalPersonas: number): void {
    if (!this.enabled || !this.bar) return;

    const total = totalTools * totalPersonas;
    this.bar.start(total, 0, {
      persona: 'Starting',
      tool: '...',
      current: 0,
      total: totalTools,
      questions: 0,
    });
    this.started = true;
  }

  /**
   * Update the progress bar with current progress.
   */
  update(progress: InterviewProgress): void {
    if (!this.enabled || !this.bar || !this.started) return;

    const current =
      progress.personasCompleted * progress.totalTools + progress.toolsCompleted;

    this.bar.update(current, {
      persona: progress.currentPersona ?? 'Interviewing',
      tool: progress.currentTool ?? '...',
      current: progress.toolsCompleted + 1,
      total: progress.totalTools,
      questions: progress.questionsAsked,
    });
  }

  /**
   * Stop and clear the progress bar.
   */
  stop(): void {
    if (!this.enabled || !this.bar || !this.started) return;

    this.bar.stop();
    this.started = false;
  }
}

/**
 * Format a startup banner showing interview configuration.
 */
export function formatStartupBanner(options: {
  serverCommand: string;
  provider: string;
  model: string;
  isQuality: boolean;
  personas: string[];
  questionsPerTool: number;
  toolCount?: number;
}): string {
  const {
    serverCommand,
    provider,
    model,
    isQuality,
    personas,
    questionsPerTool,
    toolCount,
  } = options;

  // Truncate server command if too long
  const maxCmdLen = 45;
  const displayCmd =
    serverCommand.length > maxCmdLen
      ? serverCommand.substring(0, maxCmdLen - 3) + '...'
      : serverCommand;

  const modelLabel = isQuality ? `${model} (premium)` : `${model} (budget)`;
  const personaList = personas.join(', ');
  const personaLabel = `${personaList} (${personas.length})`;

  const lines = [
    'Bellwether - MCP Server Interviewer',
    '',
    '\u250C' + '\u2500'.repeat(50) + '\u2510',
    `\u2502 Server:    ${displayCmd.padEnd(38)}\u2502`,
    `\u2502 Provider:  ${provider.padEnd(38)}\u2502`,
    `\u2502 Model:     ${modelLabel.padEnd(38)}\u2502`,
    `\u2502 Personas:  ${personaLabel.padEnd(38)}\u2502`,
    `\u2502 Questions: ${String(questionsPerTool + ' per tool').padEnd(38)}\u2502`,
  ];

  if (toolCount !== undefined) {
    lines.push(`\u2502 Tools:     ${String(toolCount + ' discovered').padEnd(38)}\u2502`);
  }

  lines.push('\u2514' + '\u2500'.repeat(50) + '\u2518');
  lines.push('');
  lines.push(
    'Tip: Use --quality for premium models, --security for security testing'
  );

  return lines.join('\n');
}
