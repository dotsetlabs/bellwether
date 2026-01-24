import { describe, it, expect } from 'vitest';
import { generateMockResponse } from '../../src/interview/mock-response-generator.js';
import type { MCPTool } from '../../src/transport/types.js';

describe('mock-response-generator', () => {
  it('generates a JSON mock response', () => {
    const tool: MCPTool = { name: 'stripe_charge', description: 'Create a Stripe charge' };
    const response = generateMockResponse(tool, 'stripe');
    const text = response.content[0].text ?? '';
    expect(text).toContain('"service"');
    expect(text).toContain('stripe');
  });
});
