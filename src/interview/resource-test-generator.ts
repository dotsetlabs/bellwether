import type { MCPResource } from '../transport/types.js';
import type { ResourceQuestion } from './types.js';

export interface ResourceTestOptions {
  /** Maximum tests to generate */
  maxTests?: number;
}

/**
 * Generate deterministic resource tests.
 * Since resource reads are URI-based with no args, tests focus on consistency.
 */
export function generateResourceTests(
  resource: MCPResource,
  options: ResourceTestOptions = {}
): ResourceQuestion[] {
  const maxTests = options.maxTests ?? 2;
  const questions: ResourceQuestion[] = [];

  questions.push({
    description: `Basic resource read (${resource.name})`,
    category: 'happy_path',
  });

  if (questions.length < maxTests) {
    questions.push({
      description: `Repeated resource read (${resource.name})`,
      category: 'edge_case',
    });
  }

  return questions.slice(0, maxTests);
}
