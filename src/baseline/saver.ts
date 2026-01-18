/**
 * Baseline save/load functionality.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { z } from 'zod';
import type { InterviewResult, ToolProfile } from '../interview/types.js';
import type {
  BehavioralBaseline,
  BaselineMode,
  ToolFingerprint,
  ServerFingerprint,
  BehavioralAssertion,
  WorkflowSignature,
} from './types.js';
import { computeConsensusSchemaHash } from './schema-compare.js';
import {
  BASELINE_FORMAT_VERSION,
  parseVersion,
  formatVersion,
} from './version.js';
import { migrateBaseline, needsMigration } from './migrations.js';

/**
 * Zod schema for behavioral assertion validation.
 */
const behavioralAssertionSchema = z.object({
  tool: z.string(),
  aspect: z.enum(['response_format', 'error_handling', 'security', 'performance', 'schema', 'description']),
  assertion: z.string(),
  evidence: z.string().optional(),
  isPositive: z.boolean(),
});

/**
 * Zod schema for tool fingerprint validation.
 */
const toolFingerprintSchema = z.object({
  name: z.string(),
  description: z.string(),
  schemaHash: z.string(),
  assertions: z.array(behavioralAssertionSchema),
  securityNotes: z.array(z.string()),
  limitations: z.array(z.string()),
});

/**
 * Zod schema for server fingerprint validation.
 */
const serverFingerprintSchema = z.object({
  name: z.string(),
  version: z.string(),
  protocolVersion: z.string(),
  capabilities: z.array(z.string()),
});

/**
 * Zod schema for workflow signature validation.
 */
const workflowSignatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  toolSequence: z.array(z.string()),
  succeeded: z.boolean(),
  summary: z.string().optional(),
});

/**
 * Zod schema for baseline validation.
 * Validates untrusted JSON to prevent injection attacks.
 *
 * Version can be:
 * - A semver string like "1.0.0" (current format)
 * - A legacy number like 1 (old format, will be migrated)
 */
const baselineSchema = z.object({
  version: z.union([
    z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format (e.g., "1.0.0")'),
    z.number().int().positive(), // Legacy format support
  ]),
  createdAt: z.string().or(z.date()),
  mode: z.enum(['full', 'structural']).optional(),
  serverCommand: z.string(),
  server: serverFingerprintSchema,
  tools: z.array(toolFingerprintSchema),
  summary: z.string(),
  assertions: z.array(behavioralAssertionSchema),
  workflowSignatures: z.array(workflowSignatureSchema).optional(),
  integrityHash: z.string(),
});

/**
 * Options for loading a baseline.
 */
export interface LoadBaselineOptions {
  /**
   * Automatically migrate old baseline formats to the current version.
   * If false and the baseline is outdated, a warning will be logged but
   * the baseline will still be loaded (with potential compatibility issues).
   * @default true
   */
  migrate?: boolean;

  /**
   * Skip integrity hash verification.
   * Use with caution - only for debugging or when you know the file was modified intentionally.
   * @default false
   */
  skipIntegrityCheck?: boolean;
}

/**
 * Create a behavioral baseline from interview results.
 */
export function createBaseline(
  result: InterviewResult,
  serverCommand: string,
  mode: BaselineMode = 'full'
): BehavioralBaseline {
  const server = createServerFingerprint(result);
  const tools = result.toolProfiles.map(createToolFingerprint);
  const assertions = extractAssertions(result);
  const workflowSignatures = extractWorkflowSignatures(result);

  const baselineData: Omit<BehavioralBaseline, 'integrityHash'> = {
    version: BASELINE_FORMAT_VERSION,
    createdAt: new Date(),
    mode,
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
 * Validates against Zod schema to prevent malicious JSON injection.
 *
 * @param path - Path to the baseline file
 * @param options - Load options
 * @returns Loaded baseline (migrated to current version if needed)
 */
export function loadBaseline(
  path: string,
  options: LoadBaselineOptions = {}
): BehavioralBaseline {
  const { migrate = true, skipIntegrityCheck = false } = options;

  if (!existsSync(path)) {
    throw new Error(`Baseline file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid JSON in baseline file ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Validate against schema to prevent malicious JSON
  const result = baselineSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const fieldPath = issue.path.join('.');
      return `  - ${fieldPath}: ${issue.message}`;
    });
    throw new Error(`Invalid baseline format in ${path}:\n${issues.join('\n')}`);
  }

  let baseline = result.data as unknown as Record<string, unknown>;

  // Check if migration is needed
  if (needsMigration(baseline)) {
    const currentVersion = parseVersion(baseline.version as string | number);

    if (migrate) {
      // Automatically migrate to current version
      baseline = migrateBaseline(baseline) as unknown as Record<string, unknown>;
    } else {
      // Log warning but continue with the old format
      console.warn(
        `Warning: Baseline uses older format ${formatVersion(currentVersion.raw)}. ` +
          `Current format is ${formatVersion(BASELINE_FORMAT_VERSION)}. ` +
          `Run 'bellwether baseline migrate' to upgrade.`
      );
    }
  }

  const typedBaseline = baseline as unknown as BehavioralBaseline;

  // Restore Date objects
  typedBaseline.createdAt = new Date(typedBaseline.createdAt);

  // Verify integrity (unless skipped or just migrated)
  if (!skipIntegrityCheck && !needsMigration(result.data as unknown as Record<string, unknown>)) {
    if (!verifyIntegrity(typedBaseline)) {
      throw new Error('Baseline integrity check failed - file may have been modified');
    }
  }

  return typedBaseline;
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
 * Recalculate and update the integrity hash for a baseline.
 * Useful after migration or manual modifications.
 */
export function recalculateIntegrityHash(
  baseline: Omit<BehavioralBaseline, 'integrityHash'>
): BehavioralBaseline {
  const integrityHash = calculateIntegrityHash(baseline);
  return {
    ...baseline,
    integrityHash,
  };
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

  // Compute schema hash from all interactions (not just first)
  // This includes argument types and infers schema from actual values
  const interactions = profile.interactions.map(i => ({ args: i.question.args }));
  const { hash: schemaHash } = computeConsensusSchemaHash(interactions);

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
