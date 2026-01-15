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
 * Global output configuration.
 */
let globalConfig: OutputConfig = {
  quiet: false,
  noColor: false,
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
    const prefix = '  '.repeat(indent) + '- ';
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
      const prefix = '  '.repeat(indent) + '- ';
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
};
