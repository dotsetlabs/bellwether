/**
 * Tests for shared command utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the output module
vi.mock('../../../src/cli/output.js', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  newline: vi.fn(),
}));

describe('extractServerContextFromArgs', () => {
  let extractServerContextFromArgs: typeof import('../../../src/cli/commands/shared.js').extractServerContextFromArgs;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../src/cli/commands/shared.js');
    extractServerContextFromArgs = mod.extractServerContextFromArgs;
  });

  describe('filesystem server detection', () => {
    it('should detect filesystem server from command', () => {
      const context = extractServerContextFromArgs('npx @mcp/filesystem', ['/home/user']);

      expect(context.allowedDirectories).toContain('/home/user');
      expect(context.hints?.some(h => h.includes('Filesystem'))).toBe(true);
      expect(context.constraints?.some(c => c.includes('limited to specified directories'))).toBe(true);
    });

    it('should detect file-system variant', () => {
      const context = extractServerContextFromArgs('node file-system-server.js', ['/data']);

      expect(context.allowedDirectories).toContain('/data');
      expect(context.hints?.some(h => h.includes('Filesystem'))).toBe(true);
    });

    it('should handle multiple path arguments', () => {
      const context = extractServerContextFromArgs('npx @mcp/filesystem', ['/path1', '/path2', '--option', '/path3']);

      expect(context.allowedDirectories).toContain('/path1');
      expect(context.allowedDirectories).toContain('/path2');
      expect(context.allowedDirectories).toContain('/path3');
      expect(context.allowedDirectories).not.toContain('--option');
    });

    it('should not include option flags as paths', () => {
      const context = extractServerContextFromArgs('npx @mcp/filesystem', ['--verbose', '/data']);

      expect(context.allowedDirectories).toContain('/data');
      expect(context.allowedDirectories).not.toContain('--verbose');
    });
  });

  describe('database server detection', () => {
    it('should detect postgres server', () => {
      const context = extractServerContextFromArgs('npx @mcp/postgres', ['--connection', 'postgresql://localhost']);

      expect(context.hints?.some(h => h.includes('Database'))).toBe(true);
      expect(context.constraints?.some(c => c.includes('Database operations'))).toBe(true);
    });

    it('should detect mysql server', () => {
      const context = extractServerContextFromArgs('node mysql-mcp-server', []);

      expect(context.hints?.some(h => h.includes('Database'))).toBe(true);
    });

    it('should detect sqlite server', () => {
      const context = extractServerContextFromArgs('npx sqlite-mcp', ['--db', 'test.db']);

      expect(context.hints?.some(h => h.includes('Database'))).toBe(true);
    });
  });

  describe('git server detection', () => {
    it('should detect git server', () => {
      const context = extractServerContextFromArgs('npx @mcp/git', ['/repo']);

      expect(context.allowedDirectories).toContain('/repo');
      expect(context.hints?.some(h => h.includes('Git'))).toBe(true);
    });

    it('should be case-insensitive for git detection', () => {
      const context = extractServerContextFromArgs('NPX @MCP/GIT', []);

      expect(context.hints?.some(h => h.includes('Git'))).toBe(true);
    });
  });

  describe('generic server handling', () => {
    it('should extract paths for unknown servers', () => {
      const context = extractServerContextFromArgs('npx @custom/server', ['/custom/path']);

      expect(context.allowedDirectories).toContain('/custom/path');
      // Should not have database or git hints
      expect(context.hints?.some(h => h.includes('Database'))).toBe(false);
      expect(context.hints?.some(h => h.includes('Git'))).toBe(false);
    });

    it('should handle no arguments', () => {
      const context = extractServerContextFromArgs('npx @custom/server', []);

      expect(context.allowedDirectories).toEqual([]);
    });

    it('should return empty hints for unknown servers', () => {
      const context = extractServerContextFromArgs('npx @custom/server', []);

      // Hints array should be empty for unknown servers
      expect(context.hints ?? []).toEqual([]);
    });
  });
});

describe('isCI', () => {
  let isCI: typeof import('../../../src/cli/commands/shared.js').isCI;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    // Clear all CI-related env vars
    delete process.env.CI;
    delete process.env.CONTINUOUS_INTEGRATION;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.CIRCLECI;
    delete process.env.JENKINS_URL;
    delete process.env.TRAVIS;
    delete process.env.BUILDKITE;

    const mod = await import('../../../src/cli/commands/shared.js');
    isCI = mod.isCI;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return false when not in CI', () => {
    expect(isCI()).toBe(false);
  });

  it('should return true when CI env var is set', () => {
    process.env.CI = 'true';
    expect(isCI()).toBe(true);
  });

  it('should return true when CONTINUOUS_INTEGRATION is set', () => {
    process.env.CONTINUOUS_INTEGRATION = '1';
    expect(isCI()).toBe(true);
  });

  it('should return true for GitHub Actions', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(isCI()).toBe(true);
  });

  it('should return true for GitLab CI', () => {
    process.env.GITLAB_CI = 'true';
    expect(isCI()).toBe(true);
  });

  it('should return true for CircleCI', () => {
    process.env.CIRCLECI = 'true';
    expect(isCI()).toBe(true);
  });

  it('should return true for Jenkins', () => {
    process.env.JENKINS_URL = 'https://jenkins.example.com';
    expect(isCI()).toBe(true);
  });

  it('should return true for Travis CI', () => {
    process.env.TRAVIS = 'true';
    expect(isCI()).toBe(true);
  });

  it('should return true for Buildkite', () => {
    process.env.BUILDKITE = 'true';
    expect(isCI()).toBe(true);
  });
});

describe('ensureOutputDirs', () => {
  let ensureOutputDirs: typeof import('../../../src/cli/commands/shared.js').ensureOutputDirs;
  let tempDir: string;
  let fs: typeof import('fs');
  let path: typeof import('path');
  let os: typeof import('os');

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../src/cli/commands/shared.js');
    ensureOutputDirs = mod.ensureOutputDirs;
    fs = await import('fs');
    path = await import('path');
    os = await import('os');
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bellwether-test-'));
  });

  afterEach(() => {
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create output directory', () => {
    const outputDir = path.join(tempDir, 'output');

    ensureOutputDirs(outputDir, outputDir);

    expect(fs.existsSync(outputDir)).toBe(true);
    expect(fs.statSync(outputDir).isDirectory()).toBe(true);
  });

  it('should create separate docs directory when different', () => {
    const outputDir = path.join(tempDir, 'output');
    const docsDir = path.join(tempDir, 'docs');

    ensureOutputDirs(outputDir, docsDir);

    expect(fs.existsSync(outputDir)).toBe(true);
    expect(fs.existsSync(docsDir)).toBe(true);
    expect(fs.statSync(outputDir).isDirectory()).toBe(true);
    expect(fs.statSync(docsDir).isDirectory()).toBe(true);
  });

  it('should handle nested directories', () => {
    const nestedDir = path.join(tempDir, 'deep', 'nested', 'output');

    ensureOutputDirs(nestedDir, nestedDir);

    expect(fs.existsSync(nestedDir)).toBe(true);
  });

  it('should not throw if directory already exists', () => {
    const outputDir = path.join(tempDir, 'existing');
    fs.mkdirSync(outputDir);

    expect(() => ensureOutputDirs(outputDir, outputDir)).not.toThrow();
    expect(fs.existsSync(outputDir)).toBe(true);
  });
});

describe('displayScenarioResults', () => {
  let displayScenarioResults: typeof import('../../../src/cli/commands/shared.js').displayScenarioResults;
  let outputMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../src/cli/commands/shared.js');
    displayScenarioResults = mod.displayScenarioResults;
    outputMock = await import('../../../src/cli/output.js');
  });

  it('should do nothing with empty results', () => {
    displayScenarioResults([]);
    expect(outputMock.info).not.toHaveBeenCalled();
  });

  it('should do nothing with null results', () => {
    displayScenarioResults(null as any);
    expect(outputMock.info).not.toHaveBeenCalled();
  });

  it('should display all passed summary', () => {
    displayScenarioResults([
      { passed: true, scenario: { tool: 'read_file', description: 'Read file test' } },
      { passed: true, scenario: { tool: 'write_file', description: 'Write file test' } },
    ]);

    expect(outputMock.info).toHaveBeenCalledWith(expect.stringContaining('2/2 passed'));
    expect(outputMock.info).toHaveBeenCalledWith(expect.stringContaining('\u2713')); // Checkmark
  });

  it('should display failed scenarios with error', () => {
    displayScenarioResults([
      { passed: true, scenario: { tool: 'read_file', description: 'Read file test' } },
      { passed: false, scenario: { tool: 'write_file', description: 'Write file test' }, error: 'Permission denied' },
    ]);

    expect(outputMock.info).toHaveBeenCalledWith(expect.stringContaining('1/2 passed'));
    expect(outputMock.info).toHaveBeenCalledWith(expect.stringContaining('\u2717')); // X mark
    expect(outputMock.info).toHaveBeenCalledWith(expect.stringContaining('Failed scenarios'));
    expect(outputMock.info).toHaveBeenCalledWith(expect.stringContaining('write_file'));
    expect(outputMock.info).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
  });

  it('should handle prompt-based scenarios', () => {
    displayScenarioResults([
      { passed: false, scenario: { prompt: 'summarize', description: 'Summarize test' } },
    ]);

    expect(outputMock.info).toHaveBeenCalledWith(expect.stringContaining('summarize'));
  });
});

describe('handleCommandError', () => {
  let handleCommandError: typeof import('../../../src/cli/commands/shared.js').handleCommandError;
  let outputMock: any;
  let exitSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit called');
    });
    const mod = await import('../../../src/cli/commands/shared.js');
    handleCommandError = mod.handleCommandError;
    outputMock = await import('../../../src/cli/output.js');
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('should display check failed title', () => {
    try {
      handleCommandError(new Error('Test error'), 'check');
    } catch {
      // Expected exit
    }

    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('Check Failed'));
  });

  it('should display explore failed title', () => {
    try {
      handleCommandError(new Error('Test error'), 'explore');
    } catch {
      // Expected exit
    }

    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('Exploration Failed'));
  });

  it('should suggest server not running for ECONNREFUSED', () => {
    try {
      handleCommandError(new Error('ECONNREFUSED'), 'check');
    } catch {
      // Expected exit
    }

    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('not running'));
  });

  it('should suggest connection refused for Connection refused', () => {
    try {
      handleCommandError(new Error('Connection refused'), 'check');
    } catch {
      // Expected exit
    }

    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('not running'));
  });

  it('should suggest timeout increase for timeout errors', () => {
    try {
      handleCommandError(new Error('Request timeout'), 'check');
    } catch {
      // Expected exit
    }

    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('timeout'));
    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('bellwether.yaml'));
  });

  it('should suggest command check for ENOENT', () => {
    try {
      handleCommandError(new Error('ENOENT'), 'check');
    } catch {
      // Expected exit
    }

    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('PATH'));
  });

  it('should suggest auth for API key errors', () => {
    try {
      handleCommandError(new Error('Invalid API key'), 'explore');
    } catch {
      // Expected exit
    }

    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('API key'));
    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('bellwether auth'));
  });

  it('should handle non-Error objects', () => {
    try {
      handleCommandError('String error', 'check');
    } catch {
      // Expected exit
    }

    expect(outputMock.error).toHaveBeenCalledWith(expect.stringContaining('String error'));
  });

  it('should exit with error code', () => {
    try {
      handleCommandError(new Error('Test'), 'check');
    } catch {
      // Expected exit
    }

    expect(exitSpy).toHaveBeenCalled();
  });
});
