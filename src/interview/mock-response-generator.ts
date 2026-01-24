import type { MCPTool, MCPToolCallResult } from '../transport/types.js';
import type { ExternalServiceName } from '../baseline/external-dependency-detector.js';

/**
 * Generate a deterministic mock response for an external service tool.
 */
export function generateMockResponse(
  tool: MCPTool,
  serviceName: ExternalServiceName
): MCPToolCallResult {
  const payload = buildMockPayload(tool, serviceName);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    isError: false,
  };
}

function buildMockPayload(tool: MCPTool, serviceName: ExternalServiceName): Record<string, unknown> {
  const base = {
    mock: true,
    service: serviceName,
    tool: tool.name,
    generatedAt: new Date().toISOString(),
  };

  switch (serviceName) {
    case 'plaid':
      return {
        ...base,
        requestId: 'req_plaid_mock_001',
        item: { item_id: 'item_mock_123', access_token: 'access-mock-token' },
        accounts: [
          { account_id: 'acc_mock_1', name: 'Checking', type: 'depository', balances: { current: 1200.55 } },
        ],
      };
    case 'stripe':
      return {
        ...base,
        id: 'ch_mock_123',
        status: 'succeeded',
        amount: 2000,
        currency: 'usd',
      };
    case 'aws':
      return {
        ...base,
        requestId: 'aws_mock_request',
        result: { bucket: 'mock-bucket', key: 'mock-key', status: 'ok' },
      };
    case 'openai':
      return {
        ...base,
        id: 'chatcmpl_mock_123',
        model: 'gpt-mock',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Mock response.' } }],
      };
    case 'anthropic':
      return {
        ...base,
        id: 'msg_mock_123',
        model: 'claude-mock',
        content: [{ type: 'text', text: 'Mock response.' }],
      };
    case 'firebase':
      return {
        ...base,
        id: 'doc_mock_123',
        status: 'ok',
        data: {},
      };
    case 'twilio':
      return {
        ...base,
        sid: 'SMmock123',
        status: 'queued',
        to: '+15551234567',
      };
    case 'sendgrid':
      return {
        ...base,
        message: 'Mock email accepted',
        status: 'queued',
      };
    case 'github':
      return {
        ...base,
        id: 123456,
        status: 'ok',
        url: 'https://api.github.com/mock',
      };
    case 'database':
      return {
        ...base,
        status: 'ok',
        rows: [],
      };
    default:
      return {
        ...base,
        status: 'ok',
        data: {},
      };
  }
}
