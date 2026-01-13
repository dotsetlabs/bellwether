/**
 * Baseline format converter.
 *
 * Converts between local BehavioralBaseline format and cloud InquestBaseline format.
 */

import { createHash } from 'crypto';
import type { BehavioralBaseline, ToolFingerprint, BehavioralAssertion } from './types.js';
import type { InterviewResult, ToolProfile } from '../interview/types.js';
import type { DiscoveryResult } from '../discovery/types.js';
import type {
  InquestBaseline,
  BaselineMetadata,
  CloudServerFingerprint,
  ToolCapability,
  ResourceCapability,
  PromptCapability,
  PersonaInterview,
  PersonaFinding,
  CloudToolProfile,
  CloudAssertion,
  CloudAssertionType,
  CloudAssertionSeverity,
} from '../cloud/types.js';
import { BASELINE_FORMAT_VERSION } from '../cloud/types.js';

/**
 * Get the current CLI version from package.json.
 */
function getCliVersion(): string {
  // In production, this would be injected at build time
  // For now, return a default
  return process.env.npm_package_version ?? '0.2.0';
}

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
function convertAssertions(assertions: BehavioralAssertion[]): CloudAssertion[] {
  return assertions.map(convertAssertion);
}

/**
 * Convert a BehavioralBaseline to cloud InquestBaseline format.
 */
export function convertToCloudBaseline(
  baseline: BehavioralBaseline,
  discovery?: DiscoveryResult,
  interviewResult?: InterviewResult
): InquestBaseline {
  // Build metadata
  const metadata: BaselineMetadata = {
    formatVersion: BASELINE_FORMAT_VERSION,
    generatedAt: baseline.createdAt.toISOString(),
    cliVersion: getCliVersion(),
    serverCommand: baseline.serverCommand,
    serverName: baseline.server.name,
    durationMs: interviewResult?.metadata.durationMs ?? 0,
    personas: extractPersonas(interviewResult),
    model: interviewResult?.metadata.model ?? 'unknown',
  };

  // Build server fingerprint
  const server: CloudServerFingerprint = {
    name: baseline.server.name,
    version: baseline.server.version,
    protocolVersion: baseline.server.protocolVersion,
    capabilities: baseline.server.capabilities,
  };

  // Build capabilities
  const capabilities = buildCapabilities(baseline, discovery);

  // Build interviews
  const interviews = buildInterviews(interviewResult);

  // Build tool profiles (with converted assertions)
  const toolProfiles = baseline.tools.map(convertToolFingerprint);

  // Build workflows
  const workflows = baseline.workflowSignatures;

  // Convert assertions to cloud format
  const assertions = convertAssertions(baseline.assertions);

  // Build content hash
  const contentForHash = JSON.stringify({
    metadata,
    server,
    capabilities,
    interviews,
    toolProfiles,
    workflows,
    assertions,
    summary: baseline.summary,
  });
  const hash = hashString(contentForHash);

  return {
    version: BASELINE_FORMAT_VERSION,
    metadata,
    server,
    capabilities,
    interviews,
    toolProfiles,
    workflows,
    assertions,
    summary: baseline.summary,
    hash,
  };
}

/**
 * Extract persona names from interview result.
 */
function extractPersonas(result?: InterviewResult): string[] {
  if (!result?.metadata.personas) {
    return ['technical_writer']; // Default persona
  }

  return result.metadata.personas.map((p) => p.id);
}

/**
 * Build capabilities from baseline and discovery.
 */
function buildCapabilities(
  baseline: BehavioralBaseline,
  discovery?: DiscoveryResult
): {
  tools: ToolCapability[];
  resources?: ResourceCapability[];
  prompts?: PromptCapability[];
} {
  // Build tool capabilities
  const tools: ToolCapability[] = baseline.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: discovery
      ? getToolSchema(discovery, tool.name)
      : {},
    schemaHash: tool.schemaHash,
  }));

  // Build resource capabilities (from discovery if available)
  let resources: ResourceCapability[] | undefined;
  // Note: Resources would come from discovery.resources if we had them

  // Build prompt capabilities (from discovery if available)
  let prompts: PromptCapability[] | undefined;
  if (discovery?.prompts && discovery.prompts.length > 0) {
    prompts = discovery.prompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments?.map((a) => ({
        name: a.name,
        description: a.description,
        required: a.required,
      })),
    }));
  }

  return {
    tools,
    resources,
    prompts,
  };
}

/**
 * Get tool schema from discovery.
 */
function getToolSchema(
  discovery: DiscoveryResult,
  toolName: string
): Record<string, unknown> {
  const tool = discovery.tools.find((t) => t.name === toolName);
  return tool?.inputSchema ?? {};
}

/**
 * Build interview summaries from interview result.
 */
function buildInterviews(result?: InterviewResult): PersonaInterview[] {
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
 * Convert ToolFingerprint to CloudToolProfile.
 */
function convertToolFingerprint(tool: ToolFingerprint): CloudToolProfile {
  return {
    name: tool.name,
    description: tool.description,
    schemaHash: tool.schemaHash,
    assertions: convertAssertions(tool.assertions),
    securityNotes: tool.securityNotes,
    limitations: tool.limitations,
    behavioralNotes: tool.assertions
      .filter((a) => a.aspect === 'response_format' && a.isPositive)
      .map((a) => a.assertion),
  };
}

/**
 * Create an InquestBaseline directly from InterviewResult.
 *
 * This is the preferred method when you have fresh interview results.
 */
export function createCloudBaseline(
  result: InterviewResult,
  serverCommand: string
): InquestBaseline {
  // Build metadata
  const metadata: BaselineMetadata = {
    formatVersion: BASELINE_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    cliVersion: getCliVersion(),
    serverCommand,
    serverName: result.discovery.serverInfo.name,
    durationMs: result.metadata.durationMs,
    personas: result.metadata.personas?.map((p) => p.id) ?? ['technical_writer'],
    model: result.metadata.model,
  };

  // Build server fingerprint
  const server: CloudServerFingerprint = {
    name: result.discovery.serverInfo.name,
    version: result.discovery.serverInfo.version,
    protocolVersion: result.discovery.protocolVersion,
    capabilities: buildCapabilityList(result.discovery),
  };

  // Build capabilities
  const tools: ToolCapability[] = result.discovery.tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema ?? {},
    schemaHash: hashString(JSON.stringify(tool.inputSchema ?? {})),
  }));

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
  const interviews = buildInterviews(result);

  // Build tool profiles (with converted assertions)
  const toolProfiles: CloudToolProfile[] = result.toolProfiles.map((profile) => ({
    name: profile.name,
    description: profile.description,
    schemaHash: hashString(
      JSON.stringify(
        result.discovery.tools.find((t) => t.name === profile.name)?.inputSchema ?? {}
      )
    ),
    assertions: convertAssertions(extractToolAssertions(profile)),
    securityNotes: profile.securityNotes,
    limitations: profile.limitations,
    behavioralNotes: profile.behavioralNotes,
  }));

  // Build workflows
  const workflows = result.workflowResults?.map((wr) => ({
    id: wr.workflow.id,
    name: wr.workflow.name,
    toolSequence: wr.workflow.steps.map((s) => s.tool),
    succeeded: wr.success,
    summary: wr.summary,
  }));

  // Build assertions (convert to cloud format)
  const assertions = convertAssertions(extractAllAssertions(result));

  // Build content hash
  const contentForHash = JSON.stringify({
    metadata,
    server,
    capabilities: { tools, prompts },
    interviews,
    toolProfiles,
    workflows,
    assertions,
    summary: result.summary,
  });
  const hash = hashString(contentForHash);

  return {
    version: BASELINE_FORMAT_VERSION,
    metadata,
    server,
    capabilities: { tools, prompts },
    interviews,
    toolProfiles,
    workflows,
    assertions,
    summary: result.summary,
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
