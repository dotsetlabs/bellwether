/**
 * CLI Output Module
 *
 * Provides structured output for CLI commands with support for:
 * - Different message types (info, success, error, warning)
 * - Quiet mode to suppress non-essential output
 * - Consistent formatting across all commands
 *
 * This module is for USER-FACING output only. For diagnostic/debug logging,
 * use the logging module (src/logging/logger.ts).
 */

/**
 * Output configuration options.
 */
export interface OutputConfig {
  /** Suppress non-essential output */
  quiet?: boolean;
  /** Disable colored output */
  noColor?: boolean;
}

/**
 * Check if colors should be disabled based on environment.
 * Respects NO_COLOR standard (https://no-color.org/)
 */
function shouldDisableColor(): boolean {
  // NO_COLOR takes precedence when set to any non-empty value
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
    return true;
  }
  // FORCE_COLOR=0 also disables colors
  if (process.env.FORCE_COLOR === '0') {
    return true;
  }
  return false;
}

/**
 * Global output configuration.
 */
let globalConfig: OutputConfig = {
  quiet: false,
  noColor: shouldDisableColor(),
};

/**
 * Configure global output settings.
 */
export function configureOutput(config: OutputConfig): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current output configuration.
 */
export function getOutputConfig(): OutputConfig {
  return { ...globalConfig };
}

/**
 * Reset output configuration to defaults.
 */
export function resetOutput(): void {
  globalConfig = { quiet: false, noColor: false };
}

/**
 * Check if output is in quiet mode.
 */
export function isQuiet(): boolean {
  return globalConfig.quiet ?? false;
}

/**
 * Standard information output.
 * Use for progress messages, status updates, and general information.
 */
export function info(message: string): void {
  if (!globalConfig.quiet) {
    console.log(message);
  }
}

/**
 * Success message output.
 * Use for completion messages and positive confirmations.
 */
export function success(message: string): void {
  if (!globalConfig.quiet) {
    console.log(message);
  }
}

/**
 * Warning message output.
 * Always shown (not suppressed by quiet mode) as warnings are important.
 */
export function warn(message: string): void {
  console.warn(message);
}

/**
 * Error message output.
 * Always shown (not suppressed by quiet mode) as errors are critical.
 */
export function error(message: string): void {
  console.error(message);
}

/**
 * Debug output (only shown in verbose mode).
 * For detailed information during development/troubleshooting.
 */
export function debug(message: string, verbose: boolean = false): void {
  if (verbose && !globalConfig.quiet) {
    console.log(message);
  }
}

/**
 * Print a blank line for formatting.
 */
export function newline(): void {
  if (!globalConfig.quiet) {
    console.log('');
  }
}

/**
 * Print multiple lines.
 */
export function lines(...messages: string[]): void {
  if (!globalConfig.quiet) {
    for (const msg of messages) {
      console.log(msg);
    }
  }
}

/**
 * Print formatted JSON output.
 * Always shown as this is typically requested data output.
 */
export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print a section header.
 */
export function section(title: string): void {
  if (!globalConfig.quiet) {
    console.log(`\n--- ${title} ---`);
  }
}

/**
 * Print a key-value pair.
 */
export function keyValue(key: string, value: string | number | boolean | undefined): void {
  if (!globalConfig.quiet && value !== undefined) {
    console.log(`${key}: ${value}`);
  }
}

/**
 * Print a list item.
 */
export function listItem(item: string, indent: number = 0): void {
  if (!globalConfig.quiet) {
    const prefix = `${'  '.repeat(indent)}- `;
    console.log(`${prefix}${item}`);
  }
}

/**
 * Print numbered list items.
 */
export function numberedList(items: string[], startIndex: number = 1): void {
  if (!globalConfig.quiet) {
    items.forEach((item, i) => {
      console.log(`  ${startIndex + i}) ${item}`);
    });
  }
}

/**
 * Create a scoped output instance for a specific command.
 * Useful for commands that need to track their own quiet state.
 */
export function createOutput(config: OutputConfig = {}): Output {
  return new Output({ ...globalConfig, ...config });
}

/**
 * Output class for scoped output with its own configuration.
 */
export class Output {
  private config: OutputConfig;

  constructor(config: OutputConfig = {}) {
    this.config = config;
  }

  info(message: string): void {
    if (!this.config.quiet) {
      console.log(message);
    }
  }

  success(message: string): void {
    if (!this.config.quiet) {
      console.log(message);
    }
  }

  warn(message: string): void {
    console.warn(message);
  }

  error(message: string): void {
    console.error(message);
  }

  debug(message: string, verbose: boolean = false): void {
    if (verbose && !this.config.quiet) {
      console.log(message);
    }
  }

  newline(): void {
    if (!this.config.quiet) {
      console.log('');
    }
  }

  lines(...messages: string[]): void {
    if (!this.config.quiet) {
      for (const msg of messages) {
        console.log(msg);
      }
    }
  }

  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }

  section(title: string): void {
    if (!this.config.quiet) {
      console.log(`\n--- ${title} ---`);
    }
  }

  keyValue(key: string, value: string | number | boolean | undefined): void {
    if (!this.config.quiet && value !== undefined) {
      console.log(`${key}: ${value}`);
    }
  }

  listItem(item: string, indent: number = 0): void {
    if (!this.config.quiet) {
      const prefix = `${'  '.repeat(indent)}- `;
      console.log(`${prefix}${item}`);
    }
  }

  numberedList(items: string[], startIndex: number = 1): void {
    if (!this.config.quiet) {
      items.forEach((item, i) => {
        console.log(`  ${startIndex + i}) ${item}`);
      });
    }
  }
}

/**
 * Streaming text display configuration.
 */
export interface StreamingDisplayConfig {
  /** Prefix to show before streaming output */
  prefix?: string;
  /** Suffix to show after streaming completes */
  suffix?: string;
  /** Whether to show a spinner during streaming */
  showSpinner?: boolean;
  /** Maximum line width before wrapping */
  maxWidth?: number;
  /** Stream to write to (defaults to stdout) */
  stream?: NodeJS.WriteStream;
  /** Color/style for the streaming text */
  style?: 'dim' | 'normal' | 'bright';
}

/**
 * Streaming display controller for real-time LLM output.
 * Provides clean, formatted output during streaming operations.
 */
export class StreamingDisplay {
  private config: StreamingDisplayConfig;
  private stream: NodeJS.WriteStream;
  private buffer: string = '';
  private lineLength: number = 0;
  private isActive: boolean = false;
  private quietMode: boolean;
  private supportsAnsi: boolean;

  constructor(config: StreamingDisplayConfig = {}) {
    this.config = config;
    this.stream = config.stream ?? process.stdout;
    this.quietMode = globalConfig.quiet ?? false;
    // Only use ANSI codes if output is a TTY and noColor is not set
    this.supportsAnsi = (this.stream.isTTY ?? false) && !globalConfig.noColor;
  }

  /**
   * Start streaming display with optional prefix.
   */
  start(prefix?: string): void {
    if (this.quietMode) return;

    this.isActive = true;
    this.buffer = '';
    this.lineLength = 0;

    const displayPrefix = prefix ?? this.config.prefix;
    if (displayPrefix) {
      this.stream.write(displayPrefix);
      this.lineLength = displayPrefix.length;
    }
  }

  /**
   * Write a chunk of streaming text.
   */
  write(chunk: string): void {
    if (this.quietMode || !this.isActive) return;

    this.buffer += chunk;

    // Apply styling only if ANSI is supported (TTY and noColor not set)
    let styledChunk = chunk;
    if (this.supportsAnsi) {
      if (this.config.style === 'dim') {
        styledChunk = `\x1b[2m${chunk}\x1b[0m`;
      } else if (this.config.style === 'bright') {
        styledChunk = `\x1b[1m${chunk}\x1b[0m`;
      }
    }

    // Handle line wrapping if maxWidth is set
    if (this.config.maxWidth) {
      const maxWidth = this.config.maxWidth;
      for (const char of chunk) {
        if (char === '\n') {
          this.stream.write('\n');
          this.lineLength = 0;
        } else {
          if (this.lineLength >= maxWidth) {
            this.stream.write('\n');
            this.lineLength = 0;
          }
          // Only apply ANSI styling per-character if supported
          const styledChar = this.supportsAnsi && this.config.style === 'dim'
            ? `\x1b[2m${char}\x1b[0m`
            : char;
          this.stream.write(styledChar);
          this.lineLength++;
        }
      }
    } else {
      this.stream.write(styledChunk);
      // Track line length for potential future use
      const lastNewline = chunk.lastIndexOf('\n');
      if (lastNewline >= 0) {
        this.lineLength = chunk.length - lastNewline - 1;
      } else {
        this.lineLength += chunk.length;
      }
    }
  }

  /**
   * Complete the streaming display.
   */
  finish(suffix?: string): string {
    if (this.quietMode) return this.buffer;

    this.isActive = false;

    const displaySuffix = suffix ?? this.config.suffix;
    if (displaySuffix) {
      this.stream.write(displaySuffix);
    }

    // Ensure we end on a newline
    if (this.lineLength > 0) {
      this.stream.write('\n');
    }

    return this.buffer;
  }

  /**
   * Abort the streaming display (e.g., on error).
   */
  abort(message?: string): void {
    if (this.quietMode) return;

    this.isActive = false;
    if (message) {
      this.stream.write(`\n${message}\n`);
    } else if (this.lineLength > 0) {
      this.stream.write('\n');
    }
  }

  /**
   * Get the complete buffer content.
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Check if streaming is currently active.
   */
  isStreaming(): boolean {
    return this.isActive;
  }
}

/**
 * Create a streaming display for interview operations.
 * Provides context-appropriate prefixes and styling.
 */
export function createStreamingDisplay(
  operation: 'generating' | 'analyzing' | 'synthesizing',
  context?: string
): StreamingDisplay {
  const prefixes: Record<string, string> = {
    generating: context ? `Generating questions for ${context}... ` : 'Generating... ',
    analyzing: context ? `Analyzing ${context}... ` : 'Analyzing... ',
    synthesizing: context ? `Synthesizing ${context}... ` : 'Synthesizing... ',
  };

  return new StreamingDisplay({
    prefix: prefixes[operation] ?? '',
    style: 'dim',
    maxWidth: 80,
  });
}

/**
 * Simple streaming callback that writes to stdout.
 * Use this for basic streaming output without the full StreamingDisplay.
 */
export function createStreamingCallback(prefix?: string): {
  onStart: (operation: string, context?: string) => void;
  onChunk: (chunk: string, operation: string) => void;
  onComplete: (text: string, operation: string) => void;
  onError: (error: Error, operation: string) => void;
} {
  let started = false;
  const quiet = globalConfig.quiet ?? false;

  return {
    onStart: (_operation: string, _context?: string) => {
      if (quiet) return;
      if (prefix) {
        process.stdout.write(prefix);
        started = true;
      }
    },
    onChunk: (chunk: string, _operation: string) => {
      if (quiet) return;
      if (!started && prefix) {
        process.stdout.write(prefix);
        started = true;
      }
      process.stdout.write(chunk);
    },
    onComplete: (_text: string, _operation: string) => {
      if (quiet) return;
      if (started) {
        process.stdout.write('\n');
      }
    },
    onError: (error: Error, _operation: string) => {
      if (quiet) return;
      if (started) {
        process.stdout.write(`\n[Error: ${error.message}]\n`);
      }
    },
  };
}
/**
 * Diff summary data used for displaying comparison results.
 */
export interface DiffSummary {
  severity: string;
  toolsAdded: number;
  toolsRemoved: number;
  toolsModified: number;
  behaviorChanges: number;
}

/**
 * Icon mapping for diff severity levels.
 */
const SEVERITY_ICONS: Record<string, string> = {
  none: '✓',
  info: 'ℹ',
  warning: '⚠',
  breaking: '✗',
};

/**
 * Get the icon for a severity level.
 */
export function getSeverityIcon(severity: string): string {
  return SEVERITY_ICONS[severity] ?? '?';
}

/**
 * Default export for convenient importing.
 */
export default {
  configureOutput,
  getOutputConfig,
  resetOutput,
  isQuiet,
  info,
  success,
  warn,
  error,
  debug,
  newline,
  lines,
  json,
  section,
  keyValue,
  listItem,
  numberedList,
  createOutput,
  Output,
  StreamingDisplay,
  createStreamingDisplay,
  createStreamingCallback,
  getSeverityIcon,
};
