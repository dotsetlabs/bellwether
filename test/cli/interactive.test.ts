/**
 * Tests for CLI interactive mode utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as readline from 'readline';

// Mock readline
vi.mock('readline', () => {
  const mockInterface = {
    question: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  };
  return {
    createInterface: vi.fn(() => mockInterface),
    default: {
      createInterface: vi.fn(() => mockInterface),
    },
  };
});

describe('Interactive Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('promptForConfig', () => {
    it('should prompt for server command when not provided', async () => {
      const { createInterface } = await import('readline');
      const mockRl = (createInterface as ReturnType<typeof vi.fn>)();

      // Mock responses: server command, personas (yes for first), format, output dir, max questions, baseline options
      let questionIndex = 0;
      const responses = [
        'npx @modelcontextprotocol/server-filesystem /tmp', // server command
        'y', // technical_writer persona
        'n', // security_tester
        'n', // qa_engineer
        'n', // novice_user
        '1', // output format (markdown)
        '', // output dir (default)
        '', // max questions (default)
        'y', // save baseline
        '', // baseline path (default)
        '', // compare baseline (none)
      ];

      mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
        callback(responses[questionIndex++] || '');
      });

      const { promptForConfig } = await import('../../src/cli/interactive.js');

      const mockConfig = {
        llm: { provider: 'openai', model: 'gpt-4o', apiKey: '' },
        interview: { maxQuestionsPerTool: 10, timeout: 30000, personas: ['technical_writer'] },
        output: { format: 'markdown' },
      };

      const result = await promptForConfig(mockConfig as any);

      expect(result.serverCommand).toBe('npx');
      expect(result.serverArgs).toContain('@modelcontextprotocol/server-filesystem');
      expect(result.selectedPersonas).toContain('technical_writer');
      expect(result.outputFormat).toBe('markdown');
      expect(result.saveBaseline).toBe(true);
    });

    it('should use provided command and args', async () => {
      const { createInterface } = await import('readline');
      const mockRl = (createInterface as ReturnType<typeof vi.fn>)();

      let questionIndex = 0;
      const responses = [
        'y', // technical_writer persona
        'n', // security_tester
        'n', // qa_engineer
        'n', // novice_user
        '2', // output format (json)
        './output', // output dir
        '5', // max questions
        'n', // save baseline
        '', // compare baseline
      ];

      mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
        callback(responses[questionIndex++] || '');
      });

      const { promptForConfig } = await import('../../src/cli/interactive.js');

      const mockConfig = {
        llm: { provider: 'openai', model: 'gpt-4o', apiKey: '' },
        interview: { maxQuestionsPerTool: 10, timeout: 30000, personas: ['technical_writer'] },
        output: { format: 'markdown' },
      };

      const result = await promptForConfig(mockConfig as any, 'python', ['server.py']);

      expect(result.serverCommand).toBe('python');
      expect(result.serverArgs).toEqual(['server.py']);
      expect(result.outputFormat).toBe('json');
      expect(result.outputDir).toBe('./output');
      expect(result.maxQuestions).toBe(5);
      expect(result.saveBaseline).toBe(false);
    });

    it('should default to technical_writer persona if none selected', async () => {
      const { createInterface } = await import('readline');
      const mockRl = (createInterface as ReturnType<typeof vi.fn>)();

      let questionIndex = 0;
      const responses = [
        'n', // technical_writer persona
        'n', // security_tester
        'n', // qa_engineer
        'n', // novice_user
        '1', // output format
        '', // output dir
        '', // max questions
        'n', // save baseline
        '', // compare baseline
      ];

      mockRl.question.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
        callback(responses[questionIndex++] || '');
      });

      const { promptForConfig } = await import('../../src/cli/interactive.js');

      const mockConfig = {
        llm: { provider: 'openai', model: 'gpt-4o', apiKey: '' },
        interview: { maxQuestionsPerTool: 10, timeout: 30000, personas: [] },
        output: { format: 'markdown' },
      };

      const result = await promptForConfig(mockConfig as any, 'node', ['server.js']);

      // Should default to technical_writer when none selected
      expect(result.selectedPersonas).toContain('technical_writer');
    });
  });

  describe('createPauseController', () => {
    it('should toggle pause state', async () => {
      const { createPauseController } = await import('../../src/cli/interactive.js');

      const controller = createPauseController();

      expect(controller.isPaused).toBe(false);

      controller.pause();
      expect(controller.isPaused).toBe(true);

      controller.resume();
      expect(controller.isPaused).toBe(false);
    });

    it('should waitIfPaused resolve immediately when not paused', async () => {
      const { createPauseController } = await import('../../src/cli/interactive.js');

      const controller = createPauseController();

      // Should resolve immediately
      const startTime = Date.now();
      await controller.waitIfPaused();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100);
    });

    it('should waitIfPaused wait until resumed', async () => {
      const { createPauseController } = await import('../../src/cli/interactive.js');

      const controller = createPauseController();
      controller.pause();

      let resolved = false;
      const waitPromise = controller.waitIfPaused().then(() => {
        resolved = true;
      });

      // Should not be resolved yet
      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);

      // Resume and it should resolve
      controller.resume();
      await waitPromise;
      expect(resolved).toBe(true);
    });
  });

  describe('displayConfigSummary', () => {
    it('should display all config options', async () => {
      const { displayConfigSummary } = await import('../../src/cli/interactive.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      displayConfigSummary({
        serverCommand: 'node',
        serverArgs: ['server.js', '--port', '3000'],
        selectedPersonas: ['technical_writer', 'security_tester'],
        outputFormat: 'both',
        outputDir: './output',
        saveBaseline: true,
        baselinePath: 'my-baseline.json',
        compareBaseline: 'old-baseline.json',
        maxQuestions: 15,
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration Summary'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('node'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('server.js'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('technical_writer, security_tester'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('both'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('./output'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('my-baseline.json'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('old-baseline.json'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('15'));

      consoleSpy.mockRestore();
    });

    it('should handle minimal config', async () => {
      const { displayConfigSummary } = await import('../../src/cli/interactive.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      displayConfigSummary({
        serverCommand: 'python',
        serverArgs: [],
        selectedPersonas: ['technical_writer'],
        outputFormat: 'markdown',
        outputDir: '.',
        saveBaseline: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('python'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('technical_writer'));
      // Should not mention baseline since saveBaseline is false
      const calls = consoleSpy.mock.calls.flat().join('\n');
      expect(calls).not.toContain('Save baseline:');

      consoleSpy.mockRestore();
    });
  });

  describe('InteractiveConfig type', () => {
    it('should have required fields', async () => {
      const { promptForConfig } = await import('../../src/cli/interactive.js');

      // Type check - this is mostly compile-time
      const config: Awaited<ReturnType<typeof promptForConfig>> = {
        serverCommand: 'test',
        serverArgs: [],
        selectedPersonas: ['technical_writer'],
        outputFormat: 'markdown',
        outputDir: '.',
        saveBaseline: false,
      };

      expect(config.serverCommand).toBeDefined();
      expect(config.serverArgs).toBeDefined();
      expect(config.selectedPersonas).toBeDefined();
      expect(config.outputFormat).toBeDefined();
      expect(config.outputDir).toBeDefined();
      expect(config.saveBaseline).toBeDefined();
    });
  });
});

describe('Interview Command Interactive Integration', () => {
  it('should have --interactive flag', async () => {
    const { interviewCommand } = await import('../../src/cli/commands/interview.js');

    const options = interviewCommand.options;
    const interactiveOption = options.find((opt) => opt.short === '-i' || opt.long === '--interactive');

    expect(interactiveOption).toBeDefined();
    expect(interactiveOption?.description).toContain('interactive');
  });

  it('should accept optional command argument', async () => {
    const { interviewCommand } = await import('../../src/cli/commands/interview.js');

    // The command argument should be optional to support --interactive mode
    const commandArg = interviewCommand._args?.[0];
    expect(commandArg).toBeDefined();
    // When argument is optional, it has [] in name or required is false
    expect(commandArg.required).toBe(false);
  });
});
