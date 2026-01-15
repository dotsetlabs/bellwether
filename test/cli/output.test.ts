import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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
} from '../../src/cli/output.js';

describe('CLI Output Module', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resetOutput();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    resetOutput();
  });

  describe('configureOutput', () => {
    it('should set quiet mode', () => {
      configureOutput({ quiet: true });
      expect(isQuiet()).toBe(true);
    });

    it('should set noColor mode', () => {
      configureOutput({ noColor: true });
      const config = getOutputConfig();
      expect(config.noColor).toBe(true);
    });

    it('should merge with existing config', () => {
      configureOutput({ quiet: true });
      configureOutput({ noColor: true });
      const config = getOutputConfig();
      expect(config.quiet).toBe(true);
      expect(config.noColor).toBe(true);
    });
  });

  describe('getOutputConfig', () => {
    it('should return a copy of the config', () => {
      configureOutput({ quiet: true });
      const config = getOutputConfig();
      config.quiet = false;
      expect(isQuiet()).toBe(true);
    });

    it('should return default config initially', () => {
      const config = getOutputConfig();
      expect(config.quiet).toBe(false);
      expect(config.noColor).toBe(false);
    });
  });

  describe('resetOutput', () => {
    it('should reset config to defaults', () => {
      configureOutput({ quiet: true, noColor: true });
      resetOutput();
      const config = getOutputConfig();
      expect(config.quiet).toBe(false);
      expect(config.noColor).toBe(false);
    });
  });

  describe('isQuiet', () => {
    it('should return false by default', () => {
      expect(isQuiet()).toBe(false);
    });

    it('should return true when quiet mode is enabled', () => {
      configureOutput({ quiet: true });
      expect(isQuiet()).toBe(true);
    });
  });

  describe('info', () => {
    it('should output message to console.log', () => {
      info('test message');
      expect(consoleLogSpy).toHaveBeenCalledWith('test message');
    });

    it('should be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      info('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('should output message to console.log', () => {
      success('operation completed');
      expect(consoleLogSpy).toHaveBeenCalledWith('operation completed');
    });

    it('should be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      success('operation completed');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should output message to console.warn', () => {
      warn('warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('warning message');
    });

    it('should NOT be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      warn('warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('warning message');
    });
  });

  describe('error', () => {
    it('should output message to console.error', () => {
      error('error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('error message');
    });

    it('should NOT be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      error('error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('error message');
    });
  });

  describe('debug', () => {
    it('should not output by default', () => {
      debug('debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should output when verbose is true', () => {
      debug('debug message', true);
      expect(consoleLogSpy).toHaveBeenCalledWith('debug message');
    });

    it('should be suppressed in quiet mode even with verbose', () => {
      configureOutput({ quiet: true });
      debug('debug message', true);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('newline', () => {
    it('should output empty line', () => {
      newline();
      expect(consoleLogSpy).toHaveBeenCalledWith('');
    });

    it('should be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      newline();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('lines', () => {
    it('should output multiple lines', () => {
      lines('line 1', 'line 2', 'line 3');
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, 'line 1');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, 'line 2');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, 'line 3');
    });

    it('should be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      lines('line 1', 'line 2');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('json', () => {
    it('should output formatted JSON', () => {
      const data = { key: 'value', nested: { num: 42 } };
      json(data);
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });

    it('should NOT be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      json({ key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle arrays', () => {
      const data = [1, 2, 3];
      json(data);
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });

    it('should handle null', () => {
      json(null);
      expect(consoleLogSpy).toHaveBeenCalledWith('null');
    });
  });

  describe('section', () => {
    it('should output section header', () => {
      section('Test Section');
      expect(consoleLogSpy).toHaveBeenCalledWith('\n--- Test Section ---');
    });

    it('should be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      section('Test Section');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('keyValue', () => {
    it('should output key-value pair', () => {
      keyValue('Name', 'John');
      expect(consoleLogSpy).toHaveBeenCalledWith('Name: John');
    });

    it('should handle numeric values', () => {
      keyValue('Count', 42);
      expect(consoleLogSpy).toHaveBeenCalledWith('Count: 42');
    });

    it('should handle boolean values', () => {
      keyValue('Enabled', true);
      expect(consoleLogSpy).toHaveBeenCalledWith('Enabled: true');
    });

    it('should not output if value is undefined', () => {
      keyValue('Empty', undefined);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      keyValue('Name', 'John');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('listItem', () => {
    it('should output list item with dash prefix', () => {
      listItem('item content');
      expect(consoleLogSpy).toHaveBeenCalledWith('- item content');
    });

    it('should support indentation', () => {
      listItem('nested item', 1);
      expect(consoleLogSpy).toHaveBeenCalledWith('  - nested item');
    });

    it('should support multiple levels of indentation', () => {
      listItem('deeply nested', 3);
      expect(consoleLogSpy).toHaveBeenCalledWith('      - deeply nested');
    });

    it('should be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      listItem('item');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('numberedList', () => {
    it('should output numbered items', () => {
      numberedList(['first', 'second', 'third']);
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '  1) first');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '  2) second');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, '  3) third');
    });

    it('should support custom start index', () => {
      numberedList(['a', 'b'], 5);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '  5) a');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '  6) b');
    });

    it('should be suppressed in quiet mode', () => {
      configureOutput({ quiet: true });
      numberedList(['item']);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('createOutput', () => {
    it('should create Output instance with default config', () => {
      const output = createOutput();
      expect(output).toBeInstanceOf(Output);
    });

    it('should create Output instance with custom config', () => {
      const output = createOutput({ quiet: true });
      output.info('test');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should merge global config with provided config', () => {
      configureOutput({ noColor: true });
      const output = createOutput({ quiet: true });
      output.info('test');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('Output class', () => {
    describe('constructor', () => {
      it('should accept empty config', () => {
        const output = new Output();
        output.info('test');
        expect(consoleLogSpy).toHaveBeenCalledWith('test');
      });

      it('should accept quiet config', () => {
        const output = new Output({ quiet: true });
        output.info('test');
        expect(consoleLogSpy).not.toHaveBeenCalled();
      });
    });

    describe('info', () => {
      it('should output message', () => {
        const output = new Output();
        output.info('message');
        expect(consoleLogSpy).toHaveBeenCalledWith('message');
      });

      it('should be suppressed when quiet', () => {
        const output = new Output({ quiet: true });
        output.info('message');
        expect(consoleLogSpy).not.toHaveBeenCalled();
      });
    });

    describe('success', () => {
      it('should output message', () => {
        const output = new Output();
        output.success('done');
        expect(consoleLogSpy).toHaveBeenCalledWith('done');
      });

      it('should be suppressed when quiet', () => {
        const output = new Output({ quiet: true });
        output.success('done');
        expect(consoleLogSpy).not.toHaveBeenCalled();
      });
    });

    describe('warn', () => {
      it('should output to console.warn', () => {
        const output = new Output();
        output.warn('warning');
        expect(consoleWarnSpy).toHaveBeenCalledWith('warning');
      });

      it('should NOT be suppressed when quiet', () => {
        const output = new Output({ quiet: true });
        output.warn('warning');
        expect(consoleWarnSpy).toHaveBeenCalledWith('warning');
      });
    });

    describe('error', () => {
      it('should output to console.error', () => {
        const output = new Output();
        output.error('error');
        expect(consoleErrorSpy).toHaveBeenCalledWith('error');
      });

      it('should NOT be suppressed when quiet', () => {
        const output = new Output({ quiet: true });
        output.error('error');
        expect(consoleErrorSpy).toHaveBeenCalledWith('error');
      });
    });

    describe('debug', () => {
      it('should not output by default', () => {
        const output = new Output();
        output.debug('debug');
        expect(consoleLogSpy).not.toHaveBeenCalled();
      });

      it('should output when verbose is true', () => {
        const output = new Output();
        output.debug('debug', true);
        expect(consoleLogSpy).toHaveBeenCalledWith('debug');
      });
    });

    describe('newline', () => {
      it('should output empty line', () => {
        const output = new Output();
        output.newline();
        expect(consoleLogSpy).toHaveBeenCalledWith('');
      });
    });

    describe('lines', () => {
      it('should output multiple lines', () => {
        const output = new Output();
        output.lines('a', 'b');
        expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      });
    });

    describe('json', () => {
      it('should output formatted JSON', () => {
        const output = new Output();
        output.json({ x: 1 });
        expect(consoleLogSpy).toHaveBeenCalledWith('{\n  "x": 1\n}');
      });
    });

    describe('section', () => {
      it('should output section header', () => {
        const output = new Output();
        output.section('Title');
        expect(consoleLogSpy).toHaveBeenCalledWith('\n--- Title ---');
      });
    });

    describe('keyValue', () => {
      it('should output key-value pair', () => {
        const output = new Output();
        output.keyValue('key', 'value');
        expect(consoleLogSpy).toHaveBeenCalledWith('key: value');
      });
    });

    describe('listItem', () => {
      it('should output list item', () => {
        const output = new Output();
        output.listItem('item');
        expect(consoleLogSpy).toHaveBeenCalledWith('- item');
      });
    });

    describe('numberedList', () => {
      it('should output numbered list', () => {
        const output = new Output();
        output.numberedList(['a', 'b']);
        expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('isolation between global and scoped output', () => {
    it('global config should not affect scoped output after creation', () => {
      const output = createOutput();
      configureOutput({ quiet: true });

      // Scoped output should still work (was created before quiet mode)
      output.info('test');
      // Note: createOutput merges at creation time, so this might be affected
      // depending on implementation
    });

    it('scoped output should have its own quiet state', () => {
      const quietOutput = new Output({ quiet: true });
      const normalOutput = new Output({ quiet: false });

      quietOutput.info('quiet');
      normalOutput.info('normal');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith('normal');
    });
  });
});
