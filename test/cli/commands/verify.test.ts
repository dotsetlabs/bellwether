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

// Mock config loader
vi.mock('../../../src/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue(null),
}));

// Mock LLM client
vi.mock('../../../src/llm/index.js', () => ({
  createLLMClient: vi.fn().mockReturnValue({
    complete: vi.fn(),
    getProviderInfo: vi.fn().mockReturnValue({ name: 'openai' }),
  }),
}));

// Mock MCPClient
vi.mock('../../../src/transport/mcp-client.js', () => ({
  MCPClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
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

// Mock interviewer
vi.mock('../../../src/interview/interviewer.js', () => ({
  Interviewer: vi.fn().mockImplementation(() => ({
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
  })),
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
      const providerOption = options.find(o => o.long === '--provider');

      expect(outputOption).toBeDefined();
      expect(tierOption).toBeDefined();
      expect(securityOption).toBeDefined();
      expect(jsonOption).toBeDefined();
      expect(badgeOnlyOption).toBeDefined();
      expect(providerOption).toBeDefined();
    });
  });

  describe('handleVerify', () => {
    it('should connect to the MCP server', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(MCPClient).toHaveBeenCalled();
      const mockInstance = vi.mocked(MCPClient).mock.results[0].value;
      expect(mockInstance.connect).toHaveBeenCalledWith('node', ['server.js']);
    });

    it('should run discovery on the server', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(discover).toHaveBeenCalled();
    });

    it('should run interview with the interviewer', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(Interviewer).toHaveBeenCalled();
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

      const mockInstance = vi.mocked(MCPClient).mock.results[0].value;
      expect(mockInstance.disconnect).toHaveBeenCalled();
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
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle server connection failure', async () => {
      const mockConnect = vi.fn().mockRejectedValue(new Error('Connection failed'));
      vi.mocked(MCPClient).mockImplementationOnce(() => ({
        connect: mockConnect,
        disconnect: vi.fn(),
      }) as unknown as InstanceType<typeof MCPClient>);

      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js']);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Connection failed'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
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

      expect(processExitSpy).toHaveBeenCalledWith(1);
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

      const interviewerCall = vi.mocked(Interviewer).mock.calls[0];
      const config = interviewerCall[1];
      expect(config.personas.length).toBeGreaterThanOrEqual(2);
    });

    it('should include security_tester for gold tier with --security', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--tier', 'gold', '--security']);

      const interviewerCall = vi.mocked(Interviewer).mock.calls[0];
      const config = interviewerCall[1];
      const personaIds = config.personas.map((p: { id: string }) => p.id);
      expect(personaIds).toContain('security_tester');
    });

    it('should use all personas for platinum tier', async () => {
      const command = createVerifyCommand();
      await command.parseAsync(['node', 'test', 'node', 'server.js', '--tier', 'platinum']);

      const interviewerCall = vi.mocked(Interviewer).mock.calls[0];
      const config = interviewerCall[1];
      expect(config.personas.length).toBeGreaterThanOrEqual(4);
    });
  });
});
