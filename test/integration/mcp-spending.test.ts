/**
 * Integration test for a spending-style server profile using the mock server.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { MCPClient } from '../../src/transport/mcp-client.js';
import { discover } from '../../src/discovery/discovery.js';
import { Interviewer } from '../../src/interview/interviewer.js';
import { generateContractMd, generateJsonReport } from '../../src/docs/generator.js';
import { REPORT_SCHEMAS } from '../../src/constants.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MOCK_SERVER_PATH = join(__dirname, '../fixtures/mock-mcp-server.ts');
const TSX_PATH = 'npx';
const TSX_ARGS = ['tsx', MOCK_SERVER_PATH];

describe('mcp-spending style integration', () => {
  let client: MCPClient;

  beforeEach(() => {
    client = new MCPClient({ timeout: 5000, startupDelay: 100 });
  });

  afterEach(async () => {
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  });

  it('produces schema-validated JSON report', async () => {
    await client.connect(TSX_PATH, TSX_ARGS, { MOCK_DELAY: '10' });
    const discovery = await discover(client, TSX_PATH, TSX_ARGS);

    const interviewer = new Interviewer(null, {
      checkMode: true,
      maxQuestionsPerTool: 2,
      parallelTools: true,
      toolConcurrency: 2,
    });

    const result = await interviewer.interview(client, discovery);
    const contract = generateContractMd(result, {
      countValidationAsSuccess: true,
      separateValidationMetrics: true,
    });
    expect(contract).toContain('## Issues Detected');

    const report = generateJsonReport(result, {
      schemaUrl: REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL,
      validate: true,
    });
    const parsed = JSON.parse(report) as { $schema?: string };
    expect(parsed.$schema).toBe(REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_URL);
  }, 30000);
});
