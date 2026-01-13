import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createLogger,
  getLogger,
  configureLogger,
  resetLogger,
  childLogger,
  startTiming,
  isLevelEnabled,
  LOG_LEVEL_VALUES,
  type LogLevel,
} from '../../src/logging/logger.js';

describe('logging/logger', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-logger-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    resetLogger();
  });

  afterEach(() => {
    resetLogger();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createLogger', () => {
    it('should create logger with default config', () => {
      const logger = createLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should apply custom log level', () => {
      const logger = createLogger({ level: 'debug' });

      // Logger should be created with debug level
      expect(logger.level).toBe('debug');
    });

    it('should set silent level', () => {
      const logger = createLogger({ level: 'silent' });

      expect(logger.level).toBe('silent');
    });

    it('should set warn level', () => {
      const logger = createLogger({ level: 'warn' });

      expect(logger.level).toBe('warn');
    });

    it('should set error level', () => {
      const logger = createLogger({ level: 'error' });

      expect(logger.level).toBe('error');
    });

    it('should disable timestamps when configured', () => {
      const logger = createLogger({ timestamp: false });

      // Logger should be created without timestamps
      expect(logger).toBeDefined();
    });

    it('should write to file when file path provided', async () => {
      const logFile = join(testDir, 'test.log');
      const logger = createLogger({ file: logFile, level: 'info' });

      logger.info({ msg: 'test message' });

      // Pino writes asynchronously, need to flush
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(existsSync(logFile)).toBe(true);
      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('test message');
    });

    it('should include name when provided', () => {
      const logger = createLogger({ name: 'test-component' });

      expect(logger).toBeDefined();
      // Name is included in logger bindings
    });
  });

  describe('getLogger', () => {
    it('should return same global instance on multiple calls', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();

      // Both should reference the same base logger
      expect(logger1).toBe(logger2);
    });

    it('should create global logger on first call', () => {
      resetLogger();
      const logger = getLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    it('should return child logger with name', () => {
      const logger = getLogger('my-component');

      expect(logger).toBeDefined();
      // Child logger should have component binding
    });

    it('should add component metadata to child logger', () => {
      const parentLogger = getLogger();
      const childLog = getLogger('child-component');

      // Child should be different instance
      expect(childLog).not.toBe(parentLogger);
    });

    it('should return different child loggers for different names', () => {
      const logger1 = getLogger('component-a');
      const logger2 = getLogger('component-b');

      expect(logger1).not.toBe(logger2);
    });
  });

  describe('configureLogger', () => {
    it('should update global logger with new config', () => {
      configureLogger({ level: 'debug' });

      const logger = getLogger();
      expect(logger.level).toBe('debug');
    });

    it('should replace previous configuration', () => {
      configureLogger({ level: 'debug' });
      configureLogger({ level: 'error' });

      const logger = getLogger();
      expect(logger.level).toBe('error');
    });

    it('should apply pretty printing option', () => {
      // Note: pino-pretty may not be installed in all environments
      // This test verifies the config is accepted; if pino-pretty is missing, it should gracefully handle
      try {
        configureLogger({ pretty: true });
        const logger = getLogger();
        expect(logger).toBeDefined();
      } catch (error) {
        // pino-pretty not installed is acceptable in test environment
        expect((error as Error).message).toContain('pino-pretty');
      }
    });
  });

  describe('resetLogger', () => {
    it('should set global logger to null', () => {
      getLogger(); // Create global logger
      resetLogger();

      // Next getLogger should create new instance
      const logger = getLogger();
      expect(logger).toBeDefined();
    });

    it('should allow reconfiguration after reset', () => {
      configureLogger({ level: 'debug' });
      resetLogger();
      configureLogger({ level: 'error' });

      const logger = getLogger();
      expect(logger.level).toBe('error');
    });
  });

  describe('childLogger', () => {
    it('should create child with context metadata', () => {
      const parent = createLogger({ level: 'info' });
      const child = childLogger(parent, { requestId: '123', userId: 'abc' });

      expect(child).toBeDefined();
      expect(typeof child.info).toBe('function');
    });

    it('should preserve parent logger properties', () => {
      const parent = createLogger({ level: 'debug' });
      const child = childLogger(parent, { context: 'test' });

      expect(child.level).toBe('debug');
    });

    it('should include context in log output', async () => {
      const logFile = join(testDir, 'child.log');
      const parent = createLogger({ file: logFile, level: 'info' });
      const child = childLogger(parent, { requestId: 'req-123' });

      child.info({ msg: 'child log message' });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('req-123');
    });
  });

  describe('startTiming', () => {
    it('should return function that calculates duration', async () => {
      const logger = createLogger({ level: 'debug' });
      const endTiming = startTiming(logger, 'test operation');

      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = endTiming();

      expect(result.durationMs).toBeGreaterThanOrEqual(40);
      expect(result.durationMs).toBeLessThan(200);
    });

    it('should calculate elapsed time correctly', async () => {
      const logger = createLogger({ level: 'debug' });
      const endTiming = startTiming(logger, 'precise timing');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = endTiming();

      expect(result.durationMs).toBeGreaterThanOrEqual(90);
      expect(result.durationMs).toBeLessThan(200);
    });

    it('should have log function that logs the timing', async () => {
      const logFile = join(testDir, 'timing.log');
      const logger = createLogger({ file: logFile, level: 'debug' });
      const endTiming = startTiming(logger, 'timed operation');

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = endTiming();
      result.log();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('timed operation');
      expect(content).toContain('completed');
    });

    it('should handle sub-millisecond durations', () => {
      const logger = createLogger({ level: 'debug' });
      const endTiming = startTiming(logger, 'fast operation');

      const result = endTiming();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('should work with multiple sequential timings', async () => {
      const logger = createLogger({ level: 'debug' });

      const end1 = startTiming(logger, 'op1');
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result1 = end1();

      const end2 = startTiming(logger, 'op2');
      await new Promise((resolve) => setTimeout(resolve, 30));
      const result2 = end2();

      expect(result1.durationMs).toBeLessThan(result2.durationMs + 20);
    });
  });

  describe('LOG_LEVEL_VALUES', () => {
    it('should have correct numeric values', () => {
      expect(LOG_LEVEL_VALUES.debug).toBe(20);
      expect(LOG_LEVEL_VALUES.info).toBe(30);
      expect(LOG_LEVEL_VALUES.warn).toBe(40);
      expect(LOG_LEVEL_VALUES.error).toBe(50);
      expect(LOG_LEVEL_VALUES.silent).toBe(Infinity);
    });

    it('should have increasing values for increasing severity', () => {
      expect(LOG_LEVEL_VALUES.debug).toBeLessThan(LOG_LEVEL_VALUES.info);
      expect(LOG_LEVEL_VALUES.info).toBeLessThan(LOG_LEVEL_VALUES.warn);
      expect(LOG_LEVEL_VALUES.warn).toBeLessThan(LOG_LEVEL_VALUES.error);
      expect(LOG_LEVEL_VALUES.error).toBeLessThan(LOG_LEVEL_VALUES.silent);
    });
  });

  describe('isLevelEnabled', () => {
    it('should return true when check level >= current level', () => {
      expect(isLevelEnabled('info', 'info')).toBe(true);
      expect(isLevelEnabled('info', 'warn')).toBe(true);
      expect(isLevelEnabled('info', 'error')).toBe(true);
      expect(isLevelEnabled('debug', 'info')).toBe(true);
    });

    it('should return false when check level < current level', () => {
      expect(isLevelEnabled('warn', 'info')).toBe(false);
      expect(isLevelEnabled('warn', 'debug')).toBe(false);
      expect(isLevelEnabled('error', 'warn')).toBe(false);
      expect(isLevelEnabled('error', 'info')).toBe(false);
    });

    it('should handle silent level (always false for non-silent)', () => {
      expect(isLevelEnabled('silent', 'debug')).toBe(false);
      expect(isLevelEnabled('silent', 'info')).toBe(false);
      expect(isLevelEnabled('silent', 'warn')).toBe(false);
      expect(isLevelEnabled('silent', 'error')).toBe(false);
    });

    it('should return true for silent checking silent', () => {
      expect(isLevelEnabled('silent', 'silent')).toBe(true);
    });

    it('should handle debug level correctly', () => {
      expect(isLevelEnabled('debug', 'debug')).toBe(true);
      expect(isLevelEnabled('debug', 'info')).toBe(true);
      expect(isLevelEnabled('debug', 'warn')).toBe(true);
      expect(isLevelEnabled('debug', 'error')).toBe(true);
    });

    it('should work with all level combinations', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

      for (const current of levels) {
        for (const check of levels) {
          const expected = LOG_LEVEL_VALUES[check] >= LOG_LEVEL_VALUES[current];
          expect(isLevelEnabled(current, check)).toBe(expected);
        }
      }
    });
  });
});
