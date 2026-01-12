/**
 * Test fixtures index.
 */

export * from './sample-tools.js';
export * from './mock-llm-client.js';

// Mock MCP server is a standalone script, not exported
// Use: node test/fixtures/mock-mcp-server.js

/**
 * Path to the mock MCP server script.
 */
export const MOCK_SERVER_PATH = new URL('./mock-mcp-server.js', import.meta.url).pathname;

/**
 * Helper to get the compiled mock server path (in dist).
 */
export function getMockServerPath(): string {
  // When running tests, the mock server will be in the dist directory
  return new URL('../../dist/test/fixtures/mock-mcp-server.js', import.meta.url).pathname;
}
