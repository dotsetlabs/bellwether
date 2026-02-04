import type { MCPPrompt } from '../transport/types.js';
import type { PromptQuestion } from './types.js';

export interface PromptTestOptions {
  /** Maximum tests to generate */
  maxTests?: number;
}

/**
 * Generate deterministic prompt tests based on prompt arguments.
 * Focuses on valid inputs to avoid false negatives.
 */
export function generatePromptTests(
  prompt: MCPPrompt,
  options: PromptTestOptions = {}
): PromptQuestion[] {
  const maxTests = options.maxTests ?? 3;
  const questions: PromptQuestion[] = [];
  const argsSpec = prompt.arguments ?? [];

  const requiredArgs = argsSpec.filter((a) => a.required);
  const optionalArgs = argsSpec.filter((a) => !a.required);

  const baseArgs: Record<string, string> = {};
  for (const arg of requiredArgs) {
    baseArgs[arg.name] = generatePromptArgValue(arg.name, arg.description);
  }

  // Basic invocation
  questions.push({
    description:
      requiredArgs.length > 0 ? 'Basic prompt invocation' : 'Prompt invocation (no args)',
    args: baseArgs,
  });

  if (questions.length < maxTests && optionalArgs.length > 0) {
    const fullArgs = { ...baseArgs };
    for (const arg of optionalArgs.slice(0, 2)) {
      fullArgs[arg.name] = generatePromptArgValue(arg.name, arg.description);
    }
    questions.push({
      description: 'Prompt invocation with optional arguments',
      args: fullArgs,
    });
  }

  if (questions.length < maxTests && Object.keys(baseArgs).length > 0) {
    const altArgs: Record<string, string> = {};
    for (const arg of requiredArgs) {
      altArgs[arg.name] = generateAlternateValue(baseArgs[arg.name], arg.name);
    }
    questions.push({
      description: 'Prompt invocation with alternate values',
      args: altArgs,
    });
  }

  return questions.slice(0, maxTests);
}

function generatePromptArgValue(name: string, description?: string): string {
  const lowerName = name.toLowerCase();
  const lowerDesc = (description ?? '').toLowerCase();

  if (lowerName.includes('path') || lowerDesc.includes('path')) return '/tmp/example.txt';
  if (lowerName.includes('url') || lowerDesc.includes('url') || lowerName.includes('uri')) {
    return 'https://example.com';
  }
  if (lowerName.includes('email') || lowerDesc.includes('email')) return 'test@example.com';
  if (lowerName.includes('date') || lowerDesc.includes('date')) return '2024-01-15';
  if (lowerName.includes('time') || lowerDesc.includes('time')) return '2024-01-15T14:30:00Z';
  if (lowerName.includes('id') || lowerDesc.includes('identifier')) return 'id_123';
  if (lowerName.includes('query') || lowerDesc.includes('search')) return 'example query';

  return 'example';
}

function generateAlternateValue(value: string, name: string): string {
  if (value.startsWith('http')) {
    return 'https://example.org';
  }
  if (value.startsWith('/')) {
    return '/tmp/alternate.txt';
  }
  if (value.includes('@')) {
    return 'user@example.org';
  }
  if (name.toLowerCase().includes('id')) {
    return 'id_456';
  }
  return `${value}-alt`;
}
