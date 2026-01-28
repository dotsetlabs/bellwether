/**
 * Cloud baseline builder.
 *
 * ## Severity Type Mappings
 *
 * The codebase uses three different severity type systems for different contexts:
 *
 * ### ChangeSeverity (baseline/types.ts)
 * Used for drift detection change classification. Maps to CLI exit codes.
 * Values: 'none' | 'info' | 'warning' | 'breaking'
 *
 * ### ErrorSeverity (errors/types.ts)
 * Used for error severity classification in error handling.
 * Values: 'low' | 'medium' | 'high' | 'critical'
 *
 * ### CloudAssertionSeverity (cloud/types.ts)
 * Used for cloud assertions and PersonaFinding severity levels.
 * Values: 'info' | 'low' | 'medium' | 'high' | 'critical'
 *
 * ### Conversion Mappings
 *
 * ChangeSeverity → CloudAssertionSeverity:
 * - 'none'     → 'info'     (no change, informational)
 * - 'info'     → 'low'      (minor changes)
 * - 'warning'  → 'medium'   (moderate changes)
 * - 'breaking' → 'critical' (breaking changes)
 *
 * CloudAssertionSeverity → ChangeSeverity (for display/filtering):
 * - 'info'     → 'info'
 * - 'low'      → 'info'
 * - 'medium'   → 'warning'
 * - 'high'     → 'warning'
 * - 'critical' → 'breaking'
 */

import { createHash } from 'crypto';
import type { BehavioralAssertion, BehavioralBaseline, ChangeSeverity } from './types.js';
import type { InterviewResult, ToolProfile } from '../interview/types.js';
import type { DiscoveryResult } from '../discovery/types.js';
import { analyzeResponses } from './response-fingerprint.js';
import { buildSchemaEvolution } from './response-schema-tracker.js';
import type {
  BaselineMetadata,
  BaselineMode,
  CloudServerFingerprint,
  ToolCapability,
  PromptCapability,
  PersonaInterview,
  PersonaFinding,
  CloudToolProfile,
  CloudAssertion,
  CloudAssertionType,
  CloudAssertionSeverity,
} from './cloud-types.js';
import { calculateMetrics, calculatePerformanceConfidence, type LatencySample } from './performance-tracker.js';
import { computeConsensusSchemaHash } from './schema-compare.js';
import { calculateBaselineHash } from './baseline-hash.js';
import { getBaselineVersion } from './version.js';
import { VERSION } from '../version.js';
import { scoreDocumentation, toDocumentationScoreSummary } from './documentation-scorer.js';

/**
 * Map ChangeSeverity to CloudAssertionSeverity.
 * Used when mapping CLI assertions to cloud severity levels.
 */
export const CHANGE_TO_CLOUD_SEVERITY: Record<ChangeSeverity, CloudAssertionSeverity> = {
  none: 'info',
  info: 'low',
  warning: 'medium',
  breaking: 'critical',
} as const;

/**
 * Map CloudAssertionSeverity to ChangeSeverity.
 * Used when filtering or displaying cloud data locally.
 */
export const CLOUD_TO_CHANGE_SEVERITY: Record<CloudAssertionSeverity, ChangeSeverity> = {
  info: 'info',
  low: 'info',
  medium: 'warning',
  high: 'warning',
  critical: 'breaking',
} as const;

/**
 * Hash a string using SHA-256.
 */
function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Convert a local BehavioralAssertion to cloud CloudAssertion format.
 *
 * Mapping:
 * - isPositive=true + security aspect → 'requires' (critical security requirement)
 * - isPositive=true + other aspect → 'expects' (expected behavior)
 * - isPositive=false + security aspect → 'warns' (security warning)
 * - isPositive=false + other aspect → 'notes' (limitation/note)
 */
function convertAssertion(assertion: BehavioralAssertion): CloudAssertion {
  // Determine assertion type based on isPositive and aspect
  let type: CloudAssertionType;
  if (assertion.isPositive) {
    type = assertion.aspect === 'security' ? 'requires' : 'expects';
  } else {
    type = assertion.aspect === 'security' ? 'warns' : 'notes';
  }

  // Determine severity based on aspect and content
  let severity: CloudAssertionSeverity = 'info';
  const lowerAssertion = assertion.assertion.toLowerCase();

  if (assertion.aspect === 'security') {
    if (
      lowerAssertion.includes('critical') ||
      lowerAssertion.includes('injection') ||
      lowerAssertion.includes('rce')
    ) {
      severity = 'critical';
    } else if (
      lowerAssertion.includes('high') ||
      lowerAssertion.includes('dangerous') ||
      lowerAssertion.includes('exploit')
    ) {
      severity = 'high';
    } else if (
      lowerAssertion.includes('medium') ||
      lowerAssertion.includes('sensitive') ||
      lowerAssertion.includes('leak')
    ) {
      severity = 'medium';
    } else {
      severity = 'low';
    }
  } else if (assertion.aspect === 'error_handling') {
    severity = assertion.isPositive ? 'info' : 'low';
  } else if (assertion.aspect === 'performance') {
    severity = 'medium';
  }

  return {
    type,
    condition: assertion.assertion,
    tool: assertion.tool,
    severity,
  };
}

/**
 * Convert an array of BehavioralAssertions to CloudAssertions.
 */
export function convertAssertions(assertions: BehavioralAssertion[]): CloudAssertion[] {
  return assertions.map(convertAssertion);
}

/**
 * Derive baseline mode from result metadata.
 * Returns 'check' for check mode results, 'explore' for explore mode results.
 * Note: Baselines should only be created from check mode results,
 * but explore uploads are still supported for documentation tracking.
 */
function deriveCloudMode(resultModel?: string, baselineMode?: 'check'): BaselineMode {
  // Check mode results have model === 'check'
  if (resultModel === 'check') return 'check';

  // LLM model names indicate explore mode
  if (resultModel) return 'explore';

  if (baselineMode === 'check') return 'check';

  // Default to check for legacy baselines without explicit mode
  return 'check';
}

function deriveModel(resultModel: string | undefined, mode: BaselineMode): string {
  if (mode === 'check') return 'none';
  return resultModel ?? 'unknown';
}

/**
 * Extract persona names from interview result.
 */
function extractPersonas(result: InterviewResult | undefined, mode: BaselineMode): string[] {
  if (mode === 'check') {
    return [];
  }

  if (!result?.metadata.personas || result.metadata.personas.length === 0) {
    return ['technical_writer'];
  }

  return result.metadata.personas.map((p) => p.id);
}

/**
 * Get tool schema from discovery.
 */
/**
 * Build interview summaries from interview result.
 */
function buildInterviews(result: InterviewResult | undefined, mode: BaselineMode): PersonaInterview[] {
  if (mode === 'check') {
    return [];
  }

  if (!result?.metadata.personas) {
    // Create a default technical_writer interview
    const totalQuestions = result?.toolProfiles.reduce(
      (sum, p) => sum + p.interactions.length,
      0
    ) ?? 0;

    return [
      {
        persona: 'technical_writer',
        toolsInterviewed: result?.toolProfiles.length ?? 0,
        questionsAsked: totalQuestions,
        findings: extractFindings(result?.toolProfiles ?? []),
      },
    ];
  }

  // Build interviews per persona
  return result.metadata.personas.map((persona) => {
    const personaInteractions = result.toolProfiles.flatMap((profile) =>
      profile.interactions.filter((i) => i.personaId === persona.id)
    );

    const toolsWithPersonaInteractions = new Set(
      personaInteractions.map((i) => i.toolName)
    );

    return {
      persona: persona.id,
      toolsInterviewed: toolsWithPersonaInteractions.size,
      questionsAsked: persona.questionsAsked,
      findings: extractFindingsForPersona(result.toolProfiles, persona.id),
    };
  });
}

/**
 * Extract findings from tool profiles.
 */
function extractFindings(toolProfiles: ToolProfile[]): PersonaFinding[] {
  const findings: PersonaFinding[] = [];

  for (const profile of toolProfiles) {
    // Add security findings
    for (const note of profile.securityNotes) {
      findings.push({
        tool: profile.name,
        category: 'security',
        severity: classifySeverity(note),
        description: note,
      });
    }

    // Add limitation findings
    for (const limitation of profile.limitations) {
      findings.push({
        tool: profile.name,
        category: 'reliability',
        severity: 'low',
        description: limitation,
      });
    }

    // Add behavioral findings (first few as behavior category)
    for (const note of profile.behavioralNotes.slice(0, 3)) {
      findings.push({
        tool: profile.name,
        category: 'behavior',
        severity: 'info',
        description: note,
      });
    }
  }

  return findings;
}

/**
 * Extract findings for a specific persona.
 */
function extractFindingsForPersona(
  toolProfiles: ToolProfile[],
  personaId: string
): PersonaFinding[] {
  const findings: PersonaFinding[] = [];

  for (const profile of toolProfiles) {
    const personaFindings = profile.findingsByPersona?.find(
      (f) => f.personaId === personaId
    );

    if (!personaFindings) continue;

    // Add security findings
    for (const note of personaFindings.securityNotes) {
      findings.push({
        tool: profile.name,
        category: 'security',
        severity: classifySeverity(note),
        description: note,
      });
    }

    // Add limitation findings
    for (const limitation of personaFindings.limitations) {
      findings.push({
        tool: profile.name,
        category: 'reliability',
        severity: 'low',
        description: limitation,
      });
    }

    // Add behavioral findings
    for (const note of personaFindings.behavioralNotes.slice(0, 3)) {
      findings.push({
        tool: profile.name,
        category: 'behavior',
        severity: 'info',
        description: note,
      });
    }
  }

  return findings;
}

/**
 * Classify severity based on note content.
 */
function classifySeverity(
  note: string
): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  const lowerNote = note.toLowerCase();

  if (
    lowerNote.includes('critical') ||
    lowerNote.includes('severe') ||
    lowerNote.includes('injection') ||
    lowerNote.includes('rce') ||
    lowerNote.includes('remote code')
  ) {
    return 'critical';
  }

  if (
    lowerNote.includes('high') ||
    lowerNote.includes('dangerous') ||
    lowerNote.includes('exploit') ||
    lowerNote.includes('bypass')
  ) {
    return 'high';
  }

  if (
    lowerNote.includes('medium') ||
    lowerNote.includes('moderate') ||
    lowerNote.includes('sensitive') ||
    lowerNote.includes('leak')
  ) {
    return 'medium';
  }

  if (
    lowerNote.includes('low') ||
    lowerNote.includes('minor') ||
    lowerNote.includes('potential')
  ) {
    return 'low';
  }

  return 'info';
}

/**
 * Create a BellwetherBaseline directly from InterviewResult.
 *
 * This is the preferred method when you have fresh interview results.
 */
export function createCloudBaseline(
  result: InterviewResult,
  serverCommand: string
): BehavioralBaseline {
  // Derive mode from result metadata
  const mode = deriveCloudMode(result.metadata.model);

  // Build metadata
  const metadata: BaselineMetadata = {
    mode,
    generatedAt: result.metadata.endTime instanceof Date
      ? result.metadata.endTime.toISOString()
      : result.metadata.endTime,
    cliVersion: VERSION,
    serverCommand,
    serverName: result.discovery.serverInfo.name,
    durationMs: result.metadata.durationMs,
    personas: extractPersonas(result, mode),
    model: deriveModel(result.metadata.model, mode),
  };

  // Build server fingerprint
  const server: CloudServerFingerprint = {
    name: result.discovery.serverInfo.name,
    version: result.discovery.serverInfo.version,
    protocolVersion: result.discovery.protocolVersion,
    capabilities: buildCapabilityList(result.discovery),
  };

  const schemaMap = new Map<string, Record<string, unknown>>();
  for (const tool of result.discovery.tools) {
    if (tool.inputSchema) {
      schemaMap.set(tool.name, tool.inputSchema as Record<string, unknown>);
    }
  }

  const tools: ToolCapability[] = result.toolProfiles.map((profile) => {
    const interactions = profile.interactions.map(i => ({ args: i.question.args }));
    const { hash: schemaHash } = computeConsensusSchemaHash(interactions);
    const responseData = profile.interactions
      .filter(i => !i.mocked)
      .map(i => ({
        response: i.response,
        error: i.error,
      }));
    const responseAnalysis = analyzeResponses(responseData);
    const responseSchemaEvolution = responseAnalysis.schemas.length > 0
      ? buildSchemaEvolution(responseAnalysis.schemas)
      : undefined;

    const latencySamples: LatencySample[] = profile.interactions
      .filter(i => i.toolExecutionMs !== undefined && !i.mocked)
      .map(i => ({
        toolName: profile.name,
        durationMs: i.toolExecutionMs ?? 0,
        success: !i.error && !i.response?.isError,
        timestamp: new Date(),
        expectedOutcome: i.question.expectedOutcome,
        outcomeCorrect: i.outcomeAssessment?.correct,
      }));

    let baselineP50Ms: number | undefined;
    let baselineP95Ms: number | undefined;
    let baselineP99Ms: number | undefined;
    let baselineSuccessRate: number | undefined;

    if (latencySamples.length > 0) {
      const metrics = calculateMetrics(latencySamples);
      if (metrics) {
        baselineP50Ms = metrics.p50Ms;
        baselineP95Ms = metrics.p95Ms;
        baselineP99Ms = metrics.p99Ms;
        baselineSuccessRate = metrics.successRate;
      }
    }

    const performanceConfidence = calculatePerformanceConfidence(latencySamples);

    return {
      name: profile.name,
      description: profile.description ?? '',
      inputSchema: schemaMap.get(profile.name) ?? {},
      schemaHash,
      responseFingerprint: responseAnalysis.fingerprint,
      inferredOutputSchema: responseAnalysis.inferredSchema,
      responseSchemaEvolution,
      errorPatterns: responseAnalysis.errorPatterns.length ? responseAnalysis.errorPatterns : undefined,
      baselineP50Ms,
      baselineP95Ms,
      baselineP99Ms,
      baselineSuccessRate,
      performanceConfidence,
    };
  });

  const prompts: PromptCapability[] | undefined =
    result.discovery.prompts.length > 0
      ? result.discovery.prompts.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments?.map((a) => ({
          name: a.name,
          description: a.description,
          required: a.required,
        })),
      }))
      : undefined;

  // Build interviews
  const interviews = buildInterviews(result, mode);

  // Build tool profiles (with converted assertions)
  const toolProfiles: CloudToolProfile[] = result.toolProfiles.map((profile) => {
    const matchingCapability = tools.find((tool) => tool.name === profile.name);
    return {
      name: profile.name,
      description: profile.description,
      schemaHash: matchingCapability?.schemaHash ?? hashString(profile.name),
      assertions: convertAssertions(extractToolAssertions(profile)),
      securityNotes: profile.securityNotes,
      limitations: profile.limitations,
      behavioralNotes: profile.behavioralNotes,
    };
  });

  // Build workflows
  const workflows = result.workflowResults?.map((wr) => ({
    id: wr.workflow.id,
    name: wr.workflow.name,
    toolSequence: wr.workflow.steps.map((s) => s.tool),
    succeeded: wr.success,
    summary: wr.summary,
  }));

  const documentationScore = toDocumentationScoreSummary(
    scoreDocumentation(result.discovery.tools)
  );

  // Build assertions (convert to cloud format)
  const assertions = convertAssertions(extractAllAssertions(result));

  const baselineWithoutHash: Omit<BehavioralBaseline, 'hash'> = {
    version: getBaselineVersion(),
    metadata,
    server,
    capabilities: { tools, prompts },
    interviews,
    toolProfiles,
    workflows,
    assertions,
    summary: result.summary,
    documentationScore,
  };
  const hash = calculateBaselineHash(baselineWithoutHash);

  return {
    ...baselineWithoutHash,
    hash,
  };
}

/**
 * Build capability list from discovery.
 */
function buildCapabilityList(discovery: DiscoveryResult): string[] {
  const capabilities: string[] = [];

  if (discovery.capabilities.tools) capabilities.push('tools');
  if (discovery.capabilities.prompts) capabilities.push('prompts');
  if (discovery.capabilities.resources) capabilities.push('resources');
  if (discovery.capabilities.logging) capabilities.push('logging');

  return capabilities;
}

/**
 * Extract behavioral assertions from a tool profile.
 */
function extractToolAssertions(profile: ToolProfile): BehavioralAssertion[] {
  const assertions: BehavioralAssertion[] = [];

  // Behavioral notes as positive assertions
  for (const note of profile.behavioralNotes) {
    assertions.push({
      tool: profile.name,
      aspect: 'response_format',
      assertion: note,
      isPositive: true,
    });
  }

  // Limitations as negative assertions
  for (const limitation of profile.limitations) {
    assertions.push({
      tool: profile.name,
      aspect: 'error_handling',
      assertion: limitation,
      isPositive: false,
    });
  }

  // Security notes as security assertions
  for (const secNote of profile.securityNotes) {
    assertions.push({
      tool: profile.name,
      aspect: 'security',
      assertion: secNote,
      isPositive:
        !secNote.toLowerCase().includes('risk') &&
        !secNote.toLowerCase().includes('vulnerab') &&
        !secNote.toLowerCase().includes('dangerous'),
    });
  }

  return assertions;
}

/**
 * Extract all assertions from interview result.
 */
function extractAllAssertions(result: InterviewResult): BehavioralAssertion[] {
  const assertions: BehavioralAssertion[] = [];

  // Extract from each tool
  for (const profile of result.toolProfiles) {
    assertions.push(...extractToolAssertions(profile));
  }

  // Add overall limitations as server assertions
  for (const limitation of result.limitations) {
    assertions.push({
      tool: 'server',
      aspect: 'error_handling',
      assertion: limitation,
      isPositive: false,
    });
  }

  return assertions;
}
