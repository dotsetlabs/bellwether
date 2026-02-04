import type { InterviewResult } from './types.js';
import type { SemanticInference } from '../validation/semantic-types.js';
import type { ResponseSchemaEvolution } from '../baseline/response-schema-tracker.js';
import type { ErrorAnalysisSummary } from '../baseline/error-analyzer.js';
import type { DocumentationScore } from '../baseline/documentation-scorer.js';
import { generateSemanticTests } from '../validation/semantic-test-generator.js';
import { SEMANTIC_VALIDATION } from '../constants.js';
import { analyzeResponses } from '../baseline/response-fingerprint.js';
import { buildSchemaEvolution } from '../baseline/response-schema-tracker.js';
import { generateErrorSummary } from '../baseline/error-analyzer.js';
import { scoreDocumentation } from '../baseline/documentation-scorer.js';

export interface InterviewInsights {
  semanticInferences?: Record<string, SemanticInference[]>;
  schemaEvolution?: Record<string, ResponseSchemaEvolution>;
  errorAnalysisSummaries?: Record<string, ErrorAnalysisSummary>;
  documentationScore?: DocumentationScore;
}

/**
 * Build derived insights from an interview result.
 * These insights are used for documentation and JSON report enrichment.
 */
export function buildInterviewInsights(result: InterviewResult): InterviewInsights {
  const semanticInferences: Record<string, SemanticInference[]> = {};
  for (const tool of result.discovery.tools) {
    const inferenceResult = generateSemanticTests(tool, {
      minConfidence: SEMANTIC_VALIDATION.MIN_CONFIDENCE_THRESHOLD,
      maxInvalidValuesPerParam: SEMANTIC_VALIDATION.MAX_INVALID_VALUES_PER_PARAM,
      skipSemanticTests: false,
    });
    if (inferenceResult.inferences.length > 0) {
      semanticInferences[tool.name] = inferenceResult.inferences;
    }
  }

  const schemaEvolution: Record<string, ResponseSchemaEvolution> = {};
  const errorAnalysisSummaries: Record<string, ErrorAnalysisSummary> = {};

  for (const profile of result.toolProfiles) {
    const responseData = profile.interactions
      .filter((i) => !i.mocked)
      .map((i) => ({ response: i.response, error: i.error }));
    const responseAnalysis = analyzeResponses(responseData);

    if (responseAnalysis.schemas.length > 0) {
      schemaEvolution[profile.name] = buildSchemaEvolution(responseAnalysis.schemas);
    }

    if (responseAnalysis.errorPatterns.length > 0) {
      const summary = generateErrorSummary(profile.name, responseAnalysis.errorPatterns);
      const categoryCounts =
        summary.categoryCounts instanceof Map
          ? Object.fromEntries(summary.categoryCounts.entries())
          : summary.categoryCounts;
      errorAnalysisSummaries[profile.name] = {
        ...summary,
        categoryCounts,
      };
    }
  }

  const documentationScore = scoreDocumentation(result.discovery.tools);

  return {
    semanticInferences: Object.keys(semanticInferences).length > 0 ? semanticInferences : undefined,
    schemaEvolution: Object.keys(schemaEvolution).length > 0 ? schemaEvolution : undefined,
    errorAnalysisSummaries:
      Object.keys(errorAnalysisSummaries).length > 0 ? errorAnalysisSummaries : undefined,
    documentationScore,
  };
}
