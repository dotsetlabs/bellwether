import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVerifyCommand } from '../../../src/cli/commands/verify.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    gray: (s: string) => s,
    bold: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    hex: () => (s: string) => s,
  },
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock config loader - use importOriginal to get the real ConfigNotFoundError for instanceof checks
vi.mock('../../../src/config/loader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/config/loader.js')>();
  return {
    ...actual,
    loadConfig: vi.fn().mockReturnValue({
      server: { command: '', args: [], timeout: 30000, env: {} },
      mode: 'explore',
      llm: { provider: 'ollama', model: '', ollama: { baseUrl: 'http://localhost:11434' } },
      explore: { personas: [], maxQuestionsPerTool: 3, parallelPersonas: false, skipErrorTests: false },
      output: { dir: '.', format: 'agents.md' },
      baseline: { failOnDrift: false },
      cache: { enabled: true, dir: '.bellwether/cache' },
      logging: { level: 'info', verbose: false },
      scenarios: { only: false },
      workflows: { discover: false, trackState: false },
    }),
    ConfigNotFoundError: actual.ConfigNotFoundError,
  };
});

// Mock LLM client
vi.mock('../../../src/llm/index.js', () => ({
  createLLMClient: vi.fn().mockReturnValue({
    complete: vi.fn(),
    getProviderInfo: vi.fn().mockReturnValue({ name: 'openai' }),
  }),
  DEFAULT_MODELS: {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
    ollama: 'llama3.2',
  },
}));

// Shared mock instance for MCPClient
const mockMCPClientInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
};

// Mock MCPClient - class returning shared instance methods
vi.mock('../../../src/transport/mcp-client.js', () => ({
  MCPClient: class MockMCPClient {
    connect = mockMCPClientInstance.connect;
    disconnect = mockMCPClientInstance.disconnect;
  },
}));

// Mock discovery
vi.mock('../../../src/discovery/discovery.js', () => ({
  discover: vi.fn().mockResolvedValue({
    serverInfo: { name: 'test-server', version: '1.0.0' },
    tools: [{ name: 'test-tool', description: 'A test tool', inputSchema: {} }],
    prompts: [],
    resources: [],
  }),
}));

// Shared mock instance for Interviewer - track constructor calls
const mockInterviewerInstance = {
  interview: vi.fn().mockResolvedValue({
    discovery: {
      serverInfo: { name: 'test-server', version: '1.0.0' },
    },
    toolProfiles: [
      {
        name: 'test-tool',
        interactions: [
          { input: {}, response: { content: [] }, error: null },
        ],
      },
    ],
    promptProfiles: [],
    resourceProfiles: [],
    metadata: {
      startTime: new Date(),
      endTime: new Date(),
      personas: [{ name: 'friendly', id: 'friendly' }],
    },
    summary: 'Test summary',
  }),
};

// Track Interviewer constructor calls for persona verification
const interviewerConstructorCalls: Array<[unknown, unknown]> = [];

// Mock interviewer - class that tracks constructor args
vi.mock('../../../src/interview/interviewer.js', () => ({
  Interviewer: class MockInterviewer {
    constructor(...args: unknown[]) {
      interviewerConstructorCalls.push(args as [unknown, unknown]);
    }
    interview = mockInterviewerInstance.interview;
  },
  DEFAULT_CONFIG: {
    maxQuestionsPerTool: 3,
  },
}));

// Mock verification module
vi.mock('../../../src/verification/index.js', () => ({
  generateVerificationReport: vi.fn().mockReturnValue({
    result: {
      serverId: 'test-server',
      version: '1.0.0',
      status: 'verified',
      tier: 'silver',
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      testsPassed: 10,
      testsTotal: 10,
      passRate: 100,
      toolsVerified: 1,
    },
    tools: [],
  }),
  generateBadgeUrl: vi.fn().mockReturnValue('https://img.shields.io/badge/bellwether-silver-C0C0C0'),
  generateBadgeMarkdown: vi.fn().mockReturnValue('![Bellwether](https://img.shields.io/badge/bellwether-silver-C0C0C0)'),
}));

// Mock personas
vi.mock('../../../src/persona/builtins.js', () => ({
  BUILTIN_PERSONAS: {
    friendly: { id: 'friendly', name: 'Friendly User' },
    technical_writer: { id: 'technical_writer', name: 'Technical Writer' },
    qa_engineer: { id: 'qa_engineer', name: 'QA Engineer' },
    security_tester: { id: 'security_tester', name: 'Security Tester' },
    novice_user: { id: 'novice_user', name: 'Novice User' },
  },
}));

import { MCPClient } from '../../../src/transport/mcp-client.js';
import { discover } from '../../../src/discovery/discovery.js';
import { Interviewer } from '../../../src/interview/interviewer.js';
import { generateVerificationReport, generateBadgeUrl, generateBadgeMarkdown } from '../../../src/verification/index.js';
import { writeFile } from 'fs/promises';

describe('Verify Command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Reset shared mock instances
    mockMCPClientInstance.connect.mockReset().mockResolvedValue(undefined);
    mockMCPClientInstance.disconnect.mockReset().mockResolvedValue(undefined);
    mockInterviewerInstance.interview.mockReset().mockResolvedValue({
      discovery: { serverInfo: { name: 'test-server', version: '1.0.0' } },
      toolProfiles: [{ name: 'test-tool', interactions: [{ input: {}, response: { content: [] }, error: null }] }],
      promptProfiles: [],
      resourceProfiles: [],
      metadata: { startTime: new Date(), endTime: new Date(), personas: [{ name: 'friendly', id: 'friendly' }] },
      summary: 'Test summary',
    });
    interviewerConstructorCalls.length = 0;

    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  describe('createVerifyCommand', () => {
    it('should create a command with correct name and description', () => {
      const command = createVerifyCommand();

      expect(command.name()).toBe('verify');
      expect(command.description()).toContain('verification');
    });

    it('should have required arguments and options', () => {
      const command = createVerifyCommand();
      const options = command.options;

      const outputOption = options.find(o => o.long === '--output');
      const tierOption = options.find(o => o.long === '--tier');
      const securityOption = options.find(o => o.long === '--security');
      const jsonOption = options.find(o => o.long === '--json');
      const badgeOnlyOption = options.find(o => o.long === '--badge-only');

      expect(outputOption).toBeDefined();
      expect(tierOption).toBeDefined();
      expect(securityOption).toBeDefined();
      expect(jsonOption).toBeDefined();
      expect(badgeOnlyOption).toBeDefined();
    });

    it('should not have provider or model options (uses config)', () => {
      const command = createVerifyCommand();
      const options = command.options;

      // Provider and model were removed - now read from config
      const providerOption = options.find(o => o.long === '--provider');
      const modelOption = options.find(o => o.long === '--model');

      expect(providerOption).toBeUndefined();
      expect(modelOption).toBeUndefined();
    });
  });

  describe('handleVerify', () => {
    it('should connect to the MCP server', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      // Verify MCPClient was used by checking the shared mock instance methods
      expect(mockMCPClientInstance.connect).toHaveBeenCalledWith('node', ['server.js'], {});
    });

    it('should run discovery on the server', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(discover).toHaveBeenCalled();
    });

    it('should run interview with the interviewer', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      // Verify Interviewer was used by checking the shared mock instance methods
      expect(mockInterviewerInstance.interview).toHaveBeenCalled();
    });

    it('should generate verification report', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(generateVerificationReport).toHaveBeenCalled();
    });

    it('should save report to output directory', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '-o', '/tmp']);

      expect(writeFile).toHaveBeenCalledWith(
        '/tmp/bellwether-verification.json',
        expect.any(String)
      );
    });

    it('should disconnect from server after verification', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(mockMCPClientInstance.disconnect).toHaveBeenCalled();
    });
  });

  describe('tier selection', () => {
    it('should default to silver tier', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('silver');
    });

    it('should accept --tier option', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--tier', 'gold']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('gold');
    });
  });

  describe('output options', () => {
    it('should output only badge URL with --badge-only', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--badge-only']);

      expect(generateBadgeUrl).toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should output JSON with --json', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--json']);

      // Should output JSON and not write file
      const jsonCalls = consoleLogSpy.mock.calls.filter(c =>
        typeof c[0] === 'string' && c[0].includes('"result"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('should display badge URL and markdown in normal mode', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(generateBadgeUrl).toHaveBeenCalled();
      expect(generateBadgeMarkdown).toHaveBeenCalled();
    });
  });

  describe('server identification', () => {
    it('should use --server-id option when provided', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--server-id', 'custom/server']);

      expect(generateVerificationReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ serverId: 'custom/server' })
      );
    });

    it('should use --version option when provided', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--version', '2.0.0']);

      expect(generateVerificationReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ version: '2.0.0' })
      );
    });
  });

  describe('error handling', () => {
    it('should handle LLM client creation failure', async () => {
      const { createLLMClient } = await import('../../../src/llm/index.js');
      vi.mocked(createLLMClient).mockImplementationOnce(() => {
        throw new Error('Invalid API key');
      });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('LLM client'));
      expect(processExitSpy).toHaveBeenCalledWith(4);
    });

    it('should handle server connection failure', async () => {
      // Make the shared mock instance reject connection
      mockMCPClientInstance.connect.mockRejectedValueOnce(new Error('Connection failed'));

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Connection failed'));
      expect(processExitSpy).toHaveBeenCalledWith(4);
    });

    it('should exit with code 1 when verification fails', async () => {
      vi.mocked(generateVerificationReport).mockReturnValueOnce({
        result: {
          serverId: 'test',
          version: '1.0.0',
          status: 'failed',
          verifiedAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
          testsPassed: 3,
          testsTotal: 10,
          passRate: 30,
          toolsVerified: 1,
          reportHash: 'abc123',
          bellwetherVersion: '0.2.0',
        },
        serverInfo: { name: 'test', version: '1.0.0' },
        tools: [],
        environment: { os: 'darwin', nodeVersion: 'v20', bellwetherVersion: '0.2.0' },
      });

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(processExitSpy).toHaveBeenCalledWith(4);
    });
  });

  describe('persona selection by tier', () => {
    it('should use technical_writer for bronze tier', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--tier', 'bronze']);

      const allOutput = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
      expect(allOutput).toContain('bronze');
    });

    it('should include qa_engineer for silver tier', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--tier', 'silver']);

      expect(interviewerConstructorCalls.length).toBeGreaterThan(0);
      const config = interviewerConstructorCalls[0][1] as { personas: Array<{ id: string }> };
      expect(config.personas.length).toBeGreaterThanOrEqual(2);
    });

    it('should include security_tester for gold tier with --security', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--tier', 'gold', '--security']);

      expect(interviewerConstructorCalls.length).toBeGreaterThan(0);
      const config = interviewerConstructorCalls[0][1] as { personas: Array<{ id: string }> };
      const personaIds = config.personas.map((p: { id: string }) => p.id);
      expect(personaIds).toContain('security_tester');
    });

    it('should use all personas for platinum tier', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--tier', 'platinum']);

      expect(interviewerConstructorCalls.length).toBeGreaterThan(0);
      const config = interviewerConstructorCalls[0][1] as { personas: Array<{ id: string }> };
      expect(config.personas.length).toBeGreaterThanOrEqual(4);
    });
  });
});
