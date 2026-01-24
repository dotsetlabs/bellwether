import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { InterviewResult } from '../interview/types.js';
import { REPORT_SCHEMAS } from '../constants.js';

export interface JsonReportOptions {
  /** Schema URL to embed in the report */
  schemaUrl?: string;
  /** Path to the schema file for validation */
  schemaPath?: string;
  /** Validate output against schema before writing */
  validate?: boolean;
}

/**
 * Generate a JSON report of the interview.
 */
export function generateJsonReport(result: InterviewResult, options: JsonReportOptions = {}): string {
  const report = options.schemaUrl
    ? { $schema: options.schemaUrl, ...result }
    : { ...result };
  const jsonReadyReport = JSON.parse(JSON.stringify(report));

  if (options.validate) {
    const schemaPath = resolveSchemaPath(options.schemaPath);
    validateReportAgainstSchema(jsonReadyReport, schemaPath);
  }

  return JSON.stringify(jsonReadyReport, null, 2);
}

function resolveSchemaPath(schemaPath?: string): string {
  if (schemaPath) {
    return schemaPath;
  }

  const url = new URL(`../../${REPORT_SCHEMAS.CHECK_REPORT_SCHEMA_FILE}`, import.meta.url);
  return fileURLToPath(url);
}

function validateReportAgainstSchema(report: unknown, schemaPath: string): void {
  const rawSchema = readFileSync(schemaPath, 'utf-8');
  const schema = JSON.parse(rawSchema) as Record<string, unknown>;

  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    // Avoid warnings for date-time without adding extra dependencies.
    formats: {
      'date-time': true,
    },
  });
  const validate = ajv.compile(schema);

  if (!validate(report)) {
    const errorText = ajv.errorsText(validate.errors, { separator: '\n' });
    throw new Error(`Check report schema validation failed:\n${errorText}`);
  }
}
