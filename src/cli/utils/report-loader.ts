import { existsSync, readFileSync } from 'fs';
import type { InterviewResult } from '../../interview/types.js';

const DEFAULT_MISSING_REPORT_MESSAGE =
  'Run `bellwether check` first with JSON output enabled.\n' +
  'Configure in bellwether.yaml:\n' +
  '  output:\n' +
  '    format: json  # or "both" for JSON + markdown';

/**
 * Load a check-mode interview report from JSON.
 */
export function loadCheckInterviewResult(
  reportPath: string,
  options?: {
    missingReportMessage?: string;
    invalidModeMessage?: (model: string | undefined) => string;
  }
): InterviewResult {
  if (!existsSync(reportPath)) {
    throw new Error(
      `Test report not found: ${reportPath}\n\n${options?.missingReportMessage ?? DEFAULT_MISSING_REPORT_MESSAGE}`
    );
  }

  const content = readFileSync(reportPath, 'utf-8');
  let result: InterviewResult;
  try {
    result = JSON.parse(content) as InterviewResult;
  } catch (error) {
    throw new Error(
      `Invalid JSON in report file ${reportPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  if (result.metadata.model && result.metadata.model !== 'check') {
    if (options?.invalidModeMessage) {
      throw new Error(options.invalidModeMessage(result.metadata.model));
    }
    throw new Error(
      `Baseline operations only work with check mode results.\n\n` +
        `The report at ${reportPath} was created with explore mode (model: ${result.metadata.model}).\n` +
        'Run `bellwether check` to generate a check mode report first.'
    );
  }

  return result;
}
