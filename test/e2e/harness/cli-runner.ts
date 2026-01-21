/**
 * CLI Runner for E2E tests.
 *
 * Spawns the actual CLI binary as a subprocess for true end-to-end testing.
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Path to the compiled CLI entry point
// From cli/test/e2e/harness/ -> cli/dist/cli/index.js
const CLI_PATH = join(__dirname, '../../../dist/cli/index.js');

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface CLIOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default 30000) */
  timeout?: number;
  /** Input to send to stdin */
  stdin?: string;
  /** Path to the CLI entry point (for testing) */
  cliPath?: string;
}

export interface MockServerConfig {
  /** JSON array of tool definitions */
  tools?: unknown[];
  /** JSON array of prompt definitions */
  prompts?: unknown[];
  /** JSON array of resource definitions */
  resources?: unknown[];
  /** Delay in ms before responding */
  delay?: number;
  /** Fail on initialization */
  failInit?: boolean;
  /** Tool name that should fail */
  failTool?: string;
}

/**
 * Spawn the actual CLI binary as a subprocess.
 */
export async function runCLI(
  args: string[],
  options: CLIOptions = {}
): Promise<CLIResult> {
  const {
    cwd = process.cwd(),
    env = {},
    timeout = 30000,
    stdin,
    cliPath = CLI_PATH,
  } = options;

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn('node', [cliPath, ...args], {
      cwd,
      env: {
        ...process.env,
        // Disable colors for predictable output parsing
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        // Disable interactive prompts
        CI: 'true',
        // Clear any existing credentials
        BELLWETHER_SESSION: '',
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set up timeout
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
    }, timeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Send stdin if provided
    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    child.on('close', (code) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;

      if (killed) {
        reject(new Error(`Command timed out after ${timeout}ms`));
        return;
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        duration,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Run CLI with a mock MCP server configuration injected.
 * The mock server command is automatically set up with the provided configuration.
 */
export async function runCLIWithMockServer(
  args: string[],
  mockConfig: MockServerConfig = {},
  options: CLIOptions = {}
): Promise<CLIResult> {
  const mockEnv: Record<string, string> = {};

  if (mockConfig.tools !== undefined) {
    mockEnv.MOCK_TOOLS = JSON.stringify(mockConfig.tools);
  }
  if (mockConfig.prompts !== undefined) {
    mockEnv.MOCK_PROMPTS = JSON.stringify(mockConfig.prompts);
  }
  if (mockConfig.resources !== undefined) {
    mockEnv.MOCK_RESOURCES = JSON.stringify(mockConfig.resources);
  }
  if (mockConfig.delay !== undefined) {
    mockEnv.MOCK_DELAY = String(mockConfig.delay);
  }
  if (mockConfig.failInit) {
    mockEnv.MOCK_FAIL_INIT = 'true';
  }
  if (mockConfig.failTool) {
    mockEnv.MOCK_FAIL_TOOL = mockConfig.failTool;
  }

  return runCLI(args, {
    ...options,
    env: {
      ...options.env,
      ...mockEnv,
    },
  });
}

/**
 * Get the command and args for the mock MCP server.
 * Returns properly separated command and args for spawn().
 */
export function getMockServerCommand(): { command: string; args: string[] } {
  // From cli/test/e2e/harness/ -> cli/test/fixtures/mock-mcp-server.js
  const mockServerPath = join(__dirname, '../../fixtures/mock-mcp-server.js');
  return { command: 'node', args: [mockServerPath] };
}

/**
 * Get the TypeScript source path for the mock MCP server.
 * Returns properly separated command and args for spawn().
 */
export function getMockServerTsCommand(): { command: string; args: string[] } {
  // From cli/test/e2e/harness/ -> cli/test/fixtures/mock-mcp-server.ts
  const mockServerPath = join(__dirname, '../../fixtures/mock-mcp-server.ts');
  return { command: 'npx', args: ['tsx', mockServerPath] };
}

/**
 * Get a single command string for the mock MCP server (for display).
 */
export function getMockServerCommandString(): string {
  const { command, args } = getMockServerCommand();
  return `${command} ${args.join(' ')}`;
}

/**
 * Get a single command string for the mock MCP server TS version (for display).
 */
export function getMockServerTsCommandString(): string {
  const { command, args } = getMockServerTsCommand();
  return `${command} ${args.join(' ')}`;
}

/**
 * Get the mock server command as an array of CLI arguments.
 * Use this when passing the server command as positional arguments to CLI commands.
 * e.g., ['discover', ...getMockServerTsArgs()] -> ['discover', 'npx', 'tsx', '/path/to/file']
 */
export function getMockServerTsArgs(): string[] {
  const { command, args } = getMockServerTsCommand();
  return [command, ...args];
}

/**
 * Get the mock server command as an array of CLI arguments (JS version).
 */
export function getMockServerArgs(): string[] {
  const { command, args } = getMockServerCommand();
  return [command, ...args];
}

/**
 * Check if the CLI is built and available.
 */
export async function isCLIBuilt(): Promise<boolean> {
  try {
    const result = await runCLI(['--version'], { timeout: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get the CLI version string.
 */
export async function getCLIVersion(): Promise<string | null> {
  try {
    const result = await runCLI(['--version'], { timeout: 5000 });
    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}
