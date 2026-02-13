import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

const IS_TEST_ENV =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  process.env.VITEST_WORKER_ID !== undefined;

/**
 * Log levels supported by Bellwether.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Logger configuration options.
 */
export interface LoggerConfig {
  /** Log level (default: 'info') */
  level?: LogLevel;
  /** Output file path (default: stderr) */
  file?: string;
  /** Enable pretty printing for development */
  pretty?: boolean;
  /** Include timestamps in output */
  timestamp?: boolean;
  /** Component name for context */
  name?: string;
}

/**
 * Default configuration.
 * Default level is 'warn' to keep CLI output clean.
 * Users can enable verbose output with --log-level info or --log-level debug.
 */
const DEFAULT_CONFIG: Required<Omit<LoggerConfig, 'file' | 'name'>> = {
  level: IS_TEST_ENV ? 'silent' : 'warn',
  pretty: false,
  timestamp: true,
};

/**
 * Global logger instance.
 */
let globalLogger: PinoLogger | null = null;

/**
 * Create a new logger instance.
 */
export function createLogger(config: LoggerConfig = {}): PinoLogger {
  const level = config.level ?? DEFAULT_CONFIG.level;
  const pretty = config.pretty ?? DEFAULT_CONFIG.pretty;
  const timestamp = config.timestamp ?? DEFAULT_CONFIG.timestamp;

  const options: LoggerOptions = {
    level,
    name: config.name,
    timestamp: timestamp ? pino.stdTimeFunctions.isoTime : false,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  // Use pino-pretty transport for development
  if (pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  // Create logger with file destination or stdout
  if (config.file) {
    return pino(options, pino.destination(config.file));
  }

  return pino(options);
}

/**
 * Get or create the global logger instance.
 */
export function getLogger(name?: string): PinoLogger {
  if (!globalLogger) {
    globalLogger = createLogger({ level: DEFAULT_CONFIG.level });
  }

  if (name) {
    return globalLogger.child({ component: name });
  }

  return globalLogger;
}

/**
 * Configure the global logger.
 */
export function configureLogger(config: LoggerConfig): void {
  globalLogger = createLogger(config);
}

/**
 * Reset the global logger (for testing).
 */
export function resetLogger(): void {
  globalLogger = null;
}

/**
 * Saved log level for restoration after temporary suppression.
 */
let savedLogLevel: LogLevel | null = null;

/**
 * Temporarily suppress all logging (set level to 'silent').
 * Call restoreLogLevel() to restore the previous level.
 */
export function suppressLogs(): void {
  if (globalLogger && savedLogLevel === null) {
    savedLogLevel = globalLogger.level as LogLevel;
    globalLogger.level = 'silent';
  }
}

/**
 * Restore the log level after suppression.
 */
export function restoreLogLevel(): void {
  if (globalLogger && savedLogLevel !== null) {
    globalLogger.level = savedLogLevel;
    savedLogLevel = null;
  }
}

/**
 * Create a child logger with additional context.
 */
export function childLogger(parent: PinoLogger, context: Record<string, unknown>): PinoLogger {
  return parent.child(context);
}

/**
 * Timing helper for performance measurement.
 */
export interface TimingResult {
  durationMs: number;
  log: () => void;
}

/**
 * Start a timing measurement.
 */
export function startTiming(logger: PinoLogger, operation: string): () => TimingResult {
  const startTime = Date.now();

  return () => {
    const durationMs = Date.now() - startTime;
    return {
      durationMs,
      log: () => {
        logger.debug({ operation, durationMs }, `${operation} completed`);
      },
    };
  };
}

/**
 * Log levels as numeric values for comparison.
 */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: Infinity,
};

/**
 * Check if a log level is enabled.
 */
export function isLevelEnabled(currentLevel: LogLevel, checkLevel: LogLevel): boolean {
  return LOG_LEVEL_VALUES[checkLevel] >= LOG_LEVEL_VALUES[currentLevel];
}

// Re-export Logger type for convenience
export type { PinoLogger as Logger };
