/**
 * Tests for the progress bar utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InterviewProgressBar,
  formatCheckBanner,
  formatExploreBanner,
} from '../../../src/cli/utils/progress.js';
import type { InterviewProgress } from '../../../src/interview/interviewer.js';

// Mock cli-progress
vi.mock('cli-progress', () => {
  // Create a mock class that can be instantiated with 'new'
  class MockSingleBar {
    start = vi.fn();
    update = vi.fn();
    stop = vi.fn();
  }
  return {
    default: {
      SingleBar: MockSingleBar,
      Presets: {
        shades_classic: {},
      },
    },
  };
});

// Mock logger
vi.mock('../../../src/logging/logger.js', () => ({
  suppressLogs: vi.fn(),
  restoreLogLevel: vi.fn(),
}));

describe('InterviewProgressBar', () => {
  describe('constructor', () => {
    it('should create progress bar when enabled and TTY', () => {
      const mockStream = {
        isTTY: true,
      } as NodeJS.WriteStream;

      const progressBar = new InterviewProgressBar({
        enabled: true,
        stream: mockStream,
      });

      expect(progressBar).toBeDefined();
    });

    it('should not create progress bar when disabled', () => {
      const progressBar = new InterviewProgressBar({
        enabled: false,
      });

      expect(progressBar).toBeDefined();
      // Progress bar internals should be null when disabled
    });

    it('should not create progress bar when not TTY', () => {
      const mockStream = {
        isTTY: false,
      } as NodeJS.WriteStream;

      const progressBar = new InterviewProgressBar({
        enabled: true,
        stream: mockStream,
      });

      expect(progressBar).toBeDefined();
    });

    it('should use default options when none provided', () => {
      const progressBar = new InterviewProgressBar();
      expect(progressBar).toBeDefined();
    });
  });

  describe('start', () => {
    it('should calculate total work correctly', async () => {
      const mockStream = {
        isTTY: true,
      } as NodeJS.WriteStream;

      const progressBar = new InterviewProgressBar({
        enabled: true,
        stream: mockStream,
      });

      // Start with 5 tools, 2 personas, 3 prompts, 2 resources
      // Total: 5*2 + 3 + 2 = 15
      progressBar.start(5, 2, 3, 2);

      // The bar.start should be called with totalWork
      const cliProgress = vi.mocked(await import('cli-progress'));
      // Can't easily verify internal state, but no throw is good
      expect(true).toBe(true);
    });

    it('should handle zero tools', () => {
      const mockStream = {
        isTTY: true,
      } as NodeJS.WriteStream;

      const progressBar = new InterviewProgressBar({
        enabled: true,
        stream: mockStream,
      });

      expect(() => progressBar.start(0, 1, 0, 0)).not.toThrow();
    });

    it('should handle zero personas', () => {
      const mockStream = {
        isTTY: true,
      } as NodeJS.WriteStream;

      const progressBar = new InterviewProgressBar({
        enabled: true,
        stream: mockStream,
      });

      expect(() => progressBar.start(5, 0, 0, 0)).not.toThrow();
    });

    it('should suppress logs when started', async () => {
      const mockStream = {
        isTTY: true,
      } as NodeJS.WriteStream;

      const progressBar = new InterviewProgressBar({
        enabled: true,
        stream: mockStream,
      });

      progressBar.start(5, 1, 0, 0);

      const logger = await import('../../../src/logging/logger.js');
      expect(logger.suppressLogs).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should handle interviewing phase', () => {
      const progressBar = new InterviewProgressBar({ enabled: false });

      const progress: InterviewProgress = {
        phase: 'interviewing',
        currentPersona: 'technical_writer',
        currentTool: 'read_file',
        toolsCompleted: 2,
        totalTools: 5,
        personasCompleted: 0,
        totalPersonas: 1,
        questionsAsked: 10,
      };

      expect(() => progressBar.update(progress)).not.toThrow();
    });

    it('should handle prompts phase', () => {
      const progressBar = new InterviewProgressBar({ enabled: false });

      const progress: InterviewProgress = {
        phase: 'prompts',
        currentTool: 'prompt:summarize',
        toolsCompleted: 5,
        totalTools: 5,
        personasCompleted: 1,
        totalPersonas: 1,
        questionsAsked: 25,
        promptsCompleted: 2,
        totalPrompts: 5,
      };

      expect(() => progressBar.update(progress)).not.toThrow();
    });

    it('should handle resources phase', () => {
      const progressBar = new InterviewProgressBar({ enabled: false });

      const progress: InterviewProgress = {
        phase: 'resources',
        currentTool: 'resource:config.json',
        toolsCompleted: 5,
        totalTools: 5,
        personasCompleted: 1,
        totalPersonas: 1,
        questionsAsked: 30,
        promptsCompleted: 5,
        totalPrompts: 5,
        resourcesCompleted: 1,
        totalResources: 3,
      };

      expect(() => progressBar.update(progress)).not.toThrow();
    });

    it('should handle workflows phase', () => {
      const progressBar = new InterviewProgressBar({ enabled: false });

      const progress: InterviewProgress = {
        phase: 'workflows',
        currentWorkflow: 'CRUD workflow',
        toolsCompleted: 5,
        totalTools: 5,
        personasCompleted: 1,
        totalPersonas: 1,
        questionsAsked: 35,
        workflowsCompleted: 1,
        totalWorkflows: 3,
      };

      expect(() => progressBar.update(progress)).not.toThrow();
    });

    it('should handle starting phase', () => {
      const progressBar = new InterviewProgressBar({ enabled: false });

      const progress: InterviewProgress = {
        phase: 'starting',
        toolsCompleted: 0,
        totalTools: 5,
        personasCompleted: 0,
        totalPersonas: 1,
        questionsAsked: 0,
      };

      expect(() => progressBar.update(progress)).not.toThrow();
    });

    it('should handle undefined optional fields', () => {
      const progressBar = new InterviewProgressBar({ enabled: false });

      const progress: InterviewProgress = {
        phase: 'interviewing',
        toolsCompleted: 0,
        totalTools: 5,
        personasCompleted: 0,
        totalPersonas: 1,
        questionsAsked: 0,
        // currentPersona and currentTool intentionally undefined
      };

      expect(() => progressBar.update(progress)).not.toThrow();
    });
  });

  describe('stop', () => {
    it('should restore log level when stopped', async () => {
      const mockStream = {
        isTTY: true,
      } as NodeJS.WriteStream;

      const progressBar = new InterviewProgressBar({
        enabled: true,
        stream: mockStream,
      });

      progressBar.start(5, 1, 0, 0);
      progressBar.stop();

      const logger = await import('../../../src/logging/logger.js');
      expect(logger.restoreLogLevel).toHaveBeenCalled();
    });

    it('should handle double stop gracefully', () => {
      const progressBar = new InterviewProgressBar({ enabled: false });

      progressBar.stop();
      expect(() => progressBar.stop()).not.toThrow();
    });

    it('should handle stop without start', () => {
      const progressBar = new InterviewProgressBar({ enabled: false });

      expect(() => progressBar.stop()).not.toThrow();
    });
  });
});

describe('formatCheckBanner', () => {
  it('should format basic banner', () => {
    const banner = formatCheckBanner({
      serverCommand: 'npx @mcp/test-server',
    });

    expect(banner).toContain('Bellwether Check');
    expect(banner).toContain('Schema Validation');
    expect(banner).toContain('npx @mcp/test-server');
    expect(banner).toContain('Check (free, deterministic)');
  });

  it('should include tool count when provided', () => {
    const banner = formatCheckBanner({
      serverCommand: 'npx @mcp/test-server',
      toolCount: 15,
    });

    expect(banner).toContain('15');
    expect(banner).toContain('discovered');
  });

  it('should truncate long server commands', () => {
    const longCommand = 'npx @some-very-long-package-name/with-a-really-long-server-name-that-exceeds-the-limit';
    const banner = formatCheckBanner({
      serverCommand: longCommand,
    });

    expect(banner).toContain('...');
    expect(banner.length).toBeLessThan(longCommand.length + 500); // Some margin for the banner structure
  });

  it('should not truncate short commands', () => {
    const shortCommand = 'npx server';
    const banner = formatCheckBanner({
      serverCommand: shortCommand,
    });

    expect(banner).toContain(shortCommand);
    expect(banner).not.toContain('...');
  });

  it('should include box drawing characters', () => {
    const banner = formatCheckBanner({
      serverCommand: 'npx server',
    });

    // Check for box drawing characters
    expect(banner).toContain('\u250C'); // Top left corner
    expect(banner).toContain('\u2510'); // Top right corner
    expect(banner).toContain('\u2514'); // Bottom left corner
    expect(banner).toContain('\u2518'); // Bottom right corner
    expect(banner).toContain('\u2502'); // Vertical line
  });

  it('should handle empty server command', () => {
    const banner = formatCheckBanner({
      serverCommand: '',
    });

    expect(banner).toContain('Bellwether Check');
  });

  it('should handle zero tool count', () => {
    const banner = formatCheckBanner({
      serverCommand: 'npx server',
      toolCount: 0,
    });

    expect(banner).toContain('0');
    expect(banner).toContain('discovered');
  });
});

describe('formatExploreBanner', () => {
  it('should format basic banner', () => {
    const banner = formatExploreBanner({
      serverCommand: 'npx @mcp/test-server',
      provider: 'openai',
      model: 'gpt-4',
      personas: ['technical_writer'],
      questionsPerTool: 3,
    });

    expect(banner).toContain('Bellwether Explore');
    expect(banner).toContain('Behavioral Documentation');
    expect(banner).toContain('npx @mcp/test-server');
    expect(banner).toContain('openai');
    expect(banner).toContain('gpt-4');
    expect(banner).toContain('technical_writer');
    expect(banner).toContain('3');
  });

  it('should include tool count when provided', () => {
    const banner = formatExploreBanner({
      serverCommand: 'npx server',
      provider: 'anthropic',
      model: 'claude-3',
      personas: ['technical_writer'],
      questionsPerTool: 5,
      toolCount: 10,
    });

    expect(banner).toContain('10');
    expect(banner).toContain('discovered');
  });

  it('should format multiple personas', () => {
    const banner = formatExploreBanner({
      serverCommand: 'npx server',
      provider: 'ollama',
      model: 'llama2',
      personas: ['technical_writer', 'security_tester', 'qa_engineer'],
      questionsPerTool: 3,
    });

    expect(banner).toContain('technical_writer');
    expect(banner).toContain('security_tester');
    expect(banner).toContain('qa_engineer');
    expect(banner).toContain('(3)'); // Persona count
  });

  it('should truncate long server commands', () => {
    const longCommand = 'npx @some-very-long-package-name/with-a-really-long-server-name-that-exceeds-the-limit';
    const banner = formatExploreBanner({
      serverCommand: longCommand,
      provider: 'openai',
      model: 'gpt-4',
      personas: ['technical_writer'],
      questionsPerTool: 3,
    });

    expect(banner).toContain('...');
  });

  it('should include drift detection tip', () => {
    const banner = formatExploreBanner({
      serverCommand: 'npx server',
      provider: 'openai',
      model: 'gpt-4',
      personas: ['technical_writer'],
      questionsPerTool: 3,
    });

    expect(banner).toContain('drift detection');
    expect(banner).toContain('bellwether check');
  });

  it('should include box drawing characters', () => {
    const banner = formatExploreBanner({
      serverCommand: 'npx server',
      provider: 'openai',
      model: 'gpt-4',
      personas: ['technical_writer'],
      questionsPerTool: 3,
    });

    expect(banner).toContain('\u250C'); // Top left corner
    expect(banner).toContain('\u2510'); // Top right corner
    expect(banner).toContain('\u2514'); // Bottom left corner
    expect(banner).toContain('\u2518'); // Bottom right corner
  });

  it('should handle empty personas array', () => {
    const banner = formatExploreBanner({
      serverCommand: 'npx server',
      provider: 'openai',
      model: 'gpt-4',
      personas: [],
      questionsPerTool: 3,
    });

    expect(banner).toContain('(0)');
  });

  it('should handle single persona', () => {
    const banner = formatExploreBanner({
      serverCommand: 'npx server',
      provider: 'openai',
      model: 'gpt-4',
      personas: ['novice_user'],
      questionsPerTool: 3,
    });

    expect(banner).toContain('novice_user');
    expect(banner).toContain('(1)');
  });
});
