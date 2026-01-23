import type { InterviewResult } from '../interview/types.js';

/**
 * Generate a JSON report of the interview.
 */
export function generateJsonReport(result: InterviewResult): string {
  return JSON.stringify(result, null, 2);
}
