import { describe, it, expect } from 'vitest';
import { StatefulTestRunner } from '../../src/interview/stateful-test-runner.js';
import type { MCPTool, MCPToolCallResult } from '../../src/transport/types.js';
import type { InterviewQuestion } from '../../src/interview/types.js';

describe('stateful-test-runner', () => {
  it('applies stored values to new questions', () => {
    const runner = new StatefulTestRunner({ shareOutputs: true });
    const tool: MCPTool = { name: 'create_item' };
    const response: MCPToolCallResult = {
      content: [{ type: 'text', text: JSON.stringify({ item_id: 'item-123' }) }],
    };

    runner.recordResponse(tool, response);

    const question: InterviewQuestion = {
      description: 'Use item',
      category: 'happy_path',
      args: { item_id: 'placeholder' },
    };

    const applied = runner.applyStateToQuestion('get_item', question);
    expect(applied.args.item_id).toBe('item-123');
    expect(applied.usedKeys).toContain('item_id');
  });
});
