/**
 * Global E2E Test Setup
 *
 * This file is run before all E2E tests to verify prerequisites
 * and set up the global test environment.
 */

import { beforeAll, afterAll } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { configureLogger } from '../../src/logging/logger.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Path to the compiled CLI (from cli/test/e2e/ -> cli/dist/cli/index.js)
const CLI_PATH = join(__dirname, '../../dist/cli/index.js');

// Path to the mock MCP server (from cli/test/e2e/ -> cli/test/fixtures/)
const MOCK_SERVER_PATH = join(__dirname, '../fixtures/mock-mcp-server.ts');

beforeAll(async () => {
  // Configure logger to be silent during E2E tests
  configureLogger({ level: 'silent' });

  // Verify CLI is built
  if (!existsSync(CLI_PATH)) {
    throw new Error(
      `CLI not built. Run 'npm run build' before running E2E tests.\n` +
      `Expected: ${CLI_PATH}`
    );
  }

  // Verify mock MCP server exists
  if (!existsSync(MOCK_SERVER_PATH)) {
    throw new Error(
      `Mock MCP server not found at: ${MOCK_SERVER_PATH}\n` +
      `This file is required for E2E tests.`
    );
  }

  // Set up environment for E2E tests
  // Disable colors for predictable output parsing
  process.env.NO_COLOR = '1';
  process.env.FORCE_COLOR = '0';

  // Indicate we're in test mode
  process.env.CI = 'true';

  // Clear any existing cloud session
  delete process.env.BELLWETHER_SESSION;

  // Use a test-specific cache directory
  process.env.BELLWETHER_CACHE_DIR = join(__dirname, '../../.test-cache');

  console.log('E2E test setup complete');
});

afterAll(() => {
  console.log('E2E tests complete');
});

// Export paths for use in tests
export const paths = {
  cli: CLI_PATH,
  mockServer: MOCK_SERVER_PATH,
  testRoot: __dirname,
  cliRoot: join(__dirname, '../..'),
};
