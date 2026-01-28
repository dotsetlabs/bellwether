import type { CloudToolProfile, ToolCapability } from './cloud-types.js';
import type { BehavioralAssertion, BehavioralBaseline, ToolFingerprint } from './types.js';

function buildAssertions(profile: CloudToolProfile): BehavioralAssertion[] {
  const assertions: BehavioralAssertion[] = [];

  for (const note of profile.behavioralNotes ?? []) {
    assertions.push({
      tool: profile.name,
      aspect: 'response_format',
      assertion: note,
      isPositive: true,
    });
  }

  for (const limitation of profile.limitations ?? []) {
    assertions.push({
      tool: profile.name,
      aspect: 'error_handling',
      assertion: limitation,
      isPositive: false,
    });
  }

  for (const secNote of profile.securityNotes ?? []) {
    assertions.push({
      tool: profile.name,
      aspect: 'security',
      assertion: secNote,
      isPositive: !secNote.toLowerCase().includes('risk') &&
        !secNote.toLowerCase().includes('vulnerab') &&
        !secNote.toLowerCase().includes('dangerous'),
    });
  }

  return assertions;
}

export function getBaselineGeneratedAt(baseline: BehavioralBaseline): Date {
  return new Date(baseline.metadata.generatedAt);
}

export function getBaselineHash(baseline: BehavioralBaseline): string {
  return baseline.hash;
}

export function getBaselineServerCommand(baseline: BehavioralBaseline): string {
  return baseline.metadata.serverCommand;
}

export function getBaselineMode(baseline: BehavioralBaseline): BehavioralBaseline['metadata']['mode'] {
  return baseline.metadata.mode;
}

export function getBaselineWorkflows(baseline: BehavioralBaseline): BehavioralBaseline['workflows'] {
  return baseline.workflows;
}

export function toToolCapability(tool: ToolFingerprint): ToolCapability {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? {},
    schemaHash: tool.schemaHash,
    responseSchemaEvolution: tool.responseSchemaEvolution,
    lastTestedAt: tool.lastTestedAt instanceof Date ? tool.lastTestedAt.toISOString() : tool.lastTestedAt,
    inputSchemaHashAtTest: tool.inputSchemaHashAtTest,
    responseFingerprint: tool.responseFingerprint,
    inferredOutputSchema: tool.inferredOutputSchema,
    errorPatterns: tool.errorPatterns,
    baselineP50Ms: tool.baselineP50Ms,
    baselineP95Ms: tool.baselineP95Ms,
    baselineSuccessRate: tool.baselineSuccessRate,
    performanceConfidence: tool.performanceConfidence,
    securityFingerprint: tool.securityFingerprint,
  };
}

export function getToolFingerprints(baseline: BehavioralBaseline): ToolFingerprint[] {
  const capabilities = baseline.capabilities?.tools ?? [];
  const profiles = baseline.toolProfiles ?? [];
  const profileMap = new Map<string, CloudToolProfile>(
    profiles.map((profile) => [profile.name, profile])
  );

  const fingerprints: ToolFingerprint[] = capabilities.map((tool: ToolCapability) => {
    const profile = profileMap.get(tool.name);
    const assertions = profile ? buildAssertions(profile) : [];
    const securityNotes = profile?.securityNotes ?? [];
    const limitations = profile?.limitations ?? [];
    const description = tool.description || profile?.description || '';
    const schemaHash = tool.schemaHash || profile?.schemaHash || '';

    const lastTestedAt = tool.lastTestedAt
      ? new Date(tool.lastTestedAt)
      : undefined;

    return {
      name: tool.name,
      description,
      schemaHash,
      inputSchema: tool.inputSchema,
      assertions,
      securityNotes,
      limitations,
      responseSchemaEvolution: tool.responseSchemaEvolution as ToolFingerprint['responseSchemaEvolution'],
      lastTestedAt,
      inputSchemaHashAtTest: tool.inputSchemaHashAtTest,
      responseFingerprint: tool.responseFingerprint,
      inferredOutputSchema: tool.inferredOutputSchema,
      errorPatterns: tool.errorPatterns,
      baselineP50Ms: tool.baselineP50Ms,
      baselineP95Ms: tool.baselineP95Ms,
      baselineSuccessRate: tool.baselineSuccessRate,
      performanceConfidence: tool.performanceConfidence,
      securityFingerprint: tool.securityFingerprint,
    };
  });

  if (fingerprints.length > 0) {
    return fingerprints;
  }

  return profiles.map((profile) => ({
    name: profile.name,
    description: profile.description ?? '',
    schemaHash: profile.schemaHash ?? '',
    assertions: buildAssertions(profile),
    securityNotes: profile.securityNotes ?? [],
    limitations: profile.limitations ?? [],
  }));
}
