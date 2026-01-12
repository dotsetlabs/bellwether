/**
 * Baseline save/load functionality.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { InterviewResult, ToolProfile } from '../interview/types.js';
import type {
  BehavioralBaseline,
  ToolFingerprint,
  ServerFingerprint,
  BehavioralAssertion,
  WorkflowSignature,
} from './types.js';

/**
 * Current baseline format version.
 */
export const BASELINE_VERSION = 1;

/**
 * Create a behavioral baseline from interview results.
 */
export function createBaseline(
  result: InterviewResult,
  serverCommand: string
): BehavioralBaseline {
  const server = createServerFingerprint(result);
  const tools = result.toolProfiles.map(createToolFingerprint);
  const assertions = extractAssertions(result);
  const workflowSignatures = extractWorkflowSignatures(result);

  const baselineData: Omit<BehavioralBaseline, 'integrityHash'> = {
    version: BASELINE_VERSION,
    createdAt: new Date(),
    serverCommand,
    server,
    tools,
    summary: result.summary,
    assertions,
    workflowSignatures,
  };

  // Calculate integrity hash
  const integrityHash = calculateIntegrityHash(baselineData);

  return {
    ...baselineData,
    integrityHash,
  };
}

/**
 * Save baseline to a file.
 */
export function saveBaseline(baseline: BehavioralBaseline, path: string): void {
  const serialized = JSON.stringify(baseline, null, 2);
  writeFileSync(path, serialized, 'utf-8');
}

/**
 * Load baseline from a file.
 */
export function loadBaseline(path: string): BehavioralBaseline {
  if (!existsSync(path)) {
    throw new Error(`Baseline file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');
  const baseline = JSON.parse(content) as BehavioralBaseline;

  // Restore Date objects
  baseline.createdAt = new Date(baseline.createdAt);

  // Verify integrity
  if (!verifyIntegrity(baseline)) {
    throw new Error('Baseline integrity check failed - file may have been modified');
  }

  return baseline;
}

/**
 * Verify baseline integrity.
 */
export function verifyIntegrity(baseline: BehavioralBaseline): boolean {
  const { integrityHash, ...rest } = baseline;
  const expectedHash = calculateIntegrityHash(rest);
  return integrityHash === expectedHash;
}

/**
 * Create server fingerprint from discovery result.
 */
function createServerFingerprint(result: InterviewResult): ServerFingerprint {
  const { discovery } = result;
  const capabilities: string[] = [];

  if (discovery.capabilities.tools) capabilities.push('tools');
  if (discovery.capabilities.prompts) capabilities.push('prompts');
  if (discovery.capabilities.resources) capabilities.push('resources');
  if (discovery.capabilities.logging) capabilities.push('logging');

  return {
    name: discovery.serverInfo.name,
    version: discovery.serverInfo.version,
    protocolVersion: discovery.protocolVersion,
    capabilities,
  };
}

/**
 * Create tool fingerprint from tool profile.
 */
function createToolFingerprint(profile: ToolProfile): ToolFingerprint {
  const assertions = extractToolAssertions(profile);

  // Find the original schema from interactions
  let schemaHash = 'unknown';
  const firstInteraction = profile.interactions[0];
  if (firstInteraction) {
    // Hash the arguments structure as a proxy for schema
    const argsKeys = Object.keys(firstInteraction.question.args).sort();
    schemaHash = hashString(JSON.stringify(argsKeys));
  }

  return {
    name: profile.name,
    description: profile.description,
    schemaHash,
    assertions,
    securityNotes: [...profile.securityNotes],
    limitations: [...profile.limitations],
  };
}

/**
 * Extract behavioral assertions from a tool profile.
 */
function extractToolAssertions(profile: ToolProfile): BehavioralAssertion[] {
  const assertions: BehavioralAssertion[] = [];

  // Convert behavioral notes to assertions
  for (const note of profile.behavioralNotes) {
    assertions.push({
      tool: profile.name,
      aspect: 'response_format',
      assertion: note,
      isPositive: true,
    });
  }

  // Convert limitations to negative assertions
  for (const limitation of profile.limitations) {
    assertions.push({
      tool: profile.name,
      aspect: 'error_handling',
      assertion: limitation,
      isPositive: false,
    });
  }

  // Convert security notes to security assertions
  for (const secNote of profile.securityNotes) {
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

/**
 * Extract all assertions from interview result.
 */
function extractAssertions(result: InterviewResult): BehavioralAssertion[] {
  const assertions: BehavioralAssertion[] = [];

  // Extract from each tool
  for (const profile of result.toolProfiles) {
    assertions.push(...extractToolAssertions(profile));
  }

  // Add overall limitations as assertions
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

/**
 * Extract workflow signatures from interview result.
 */
function extractWorkflowSignatures(result: InterviewResult): WorkflowSignature[] {
  if (!result.workflowResults || result.workflowResults.length === 0) {
    return [];
  }

  return result.workflowResults.map((wr) => ({
    id: wr.workflow.id,
    name: wr.workflow.name,
    toolSequence: wr.workflow.steps.map((s) => s.tool),
    succeeded: wr.success,
    summary: wr.summary,
  }));
}

/**
 * Calculate integrity hash for baseline data.
 */
function calculateIntegrityHash(data: Omit<BehavioralBaseline, 'integrityHash'>): string {
  // Create a deterministic representation
  const normalized = JSON.stringify(data, (_key, value) => {
    // Normalize dates to ISO strings for consistent hashing
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  });

  return hashString(normalized);
}

/**
 * Create a SHA-256 hash of a string.
 */
function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Check if a baseline file exists.
 */
export function baselineExists(path: string): boolean {
  return existsSync(path);
}
