import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

interface ActionConfig {
  name: string;
  inputs: Record<string, { required?: boolean; default?: string }>;
  outputs: Record<string, { description?: string }>;
  runs: {
    using: string;
    steps: Array<{ name?: string; run?: string; uses?: string }>;
  };
}

function loadActionConfig(): ActionConfig {
  const actionPath = join(process.cwd(), 'action.yml');
  const content = readFileSync(actionPath, 'utf8');
  return parse(content) as ActionConfig;
}

describe('GitHub Action Contract', () => {
  it('uses the expected composite action metadata', () => {
    const action = loadActionConfig();

    expect(action.name).toBe('Bellwether MCP Check');
    expect(action.runs.using).toBe('composite');
  });

  it('declares required core inputs and stable outputs', () => {
    const action = loadActionConfig();

    expect(action.inputs['server-command']?.required).toBe(true);
    expect(action.inputs['config-path']?.default).toBe('bellwether.yaml');
    expect(action.inputs['baseline-path']?.default).toBe('bellwether-baseline.json');

    for (const outputName of [
      'result',
      'exit-code',
      'severity',
      'drift-detected',
      'tool-count',
      'contract-md',
      'baseline-file',
    ]) {
      expect(action.outputs[outputName]).toBeDefined();
    }
  });

  it('includes required execution steps', () => {
    const action = loadActionConfig();
    const stepNames = action.runs.steps.map((step) => step.name).filter(Boolean);

    expect(stepNames).toContain('Run Bellwether Check');
    expect(stepNames).toContain('Upload JSON report artifact');
    expect(stepNames).toContain('Upload CONTRACT.md artifact');
  });
});
