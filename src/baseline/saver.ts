/**
 * Baseline save/load functionality.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { z } from 'zod';
import type { InterviewResult } from '../interview/types.js';
import type {
  BehavioralBaseline,
  BehavioralDiff,
  DriftAcceptance,
  AcceptedDiff,
} from './types.js';
import {
  getBaselineVersion,
  parseVersion,
  formatVersion,
} from './version.js';
import { createCloudBaseline } from './converter.js';
import { calculateBaselineHash } from './baseline-hash.js';
import type { InferredSchema } from './response-fingerprint.js';
import { PAYLOAD_LIMITS } from '../constants.js';
import { getLogger } from '../logging/logger.js';

const cloudAssertionSchema = z.object({
  type: z.enum(['expects', 'requires', 'warns', 'notes']),
  condition: z.string(),
  tool: z.string().optional(),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
});

/**
 * Zod schema for response fingerprint validation.
 */
const responseFingerprintSchema = z.object({
  structureHash: z.string(),
  contentType: z.enum(['text', 'object', 'array', 'primitive', 'empty', 'error', 'mixed', 'binary']),
  fields: z.array(z.string()).optional(),
  arrayItemStructure: z.string().optional(),
  size: z.enum(['tiny', 'small', 'medium', 'large']),
  isEmpty: z.boolean(),
  sampleCount: z.number(),
  confidence: z.number(),
});

/**
 * Zod schema for inferred schema validation (recursive).
 */
const inferredSchemaSchema: z.ZodType<InferredSchema> = z.lazy(() =>
  z.object({
    type: z.string(),
    properties: z.record(inferredSchemaSchema).optional(),
    items: inferredSchemaSchema.optional(),
    required: z.array(z.string()).optional(),
    nullable: z.boolean().optional(),
    enum: z.array(z.unknown()).optional(),
  })
);

/**
 * Zod schema for error pattern validation.
 */
const errorPatternSchema = z.object({
  category: z.enum(['validation', 'not_found', 'permission', 'timeout', 'internal', 'unknown']),
  patternHash: z.string(),
  example: z.string(),
  count: z.number(),
});

/**
 * Zod schema for performance confidence validation.
 */
const performanceConfidenceSchema = z.object({
  sampleCount: z.number(),
  successfulSamples: z.number(),
  validationSamples: z.number(),
  totalTests: z.number(),
  standardDeviation: z.number(),
  coefficientOfVariation: z.number(),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  recommendation: z.string().optional(),
});

/**
 * Zod schema for tool fingerprint validation.
 */
const toolCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
  schemaHash: z.string(),
  responseFingerprint: responseFingerprintSchema.optional(),
  inferredOutputSchema: inferredSchemaSchema.optional(),
  errorPatterns: z.array(errorPatternSchema).optional(),
  baselineP50Ms: z.number().min(0).optional(),
  baselineP95Ms: z.number().min(0).optional(),
  baselineP99Ms: z.number().min(0).optional(),
  baselineSuccessRate: z.number().min(0).max(1).optional(),
  responseSchemaEvolution: z.record(z.unknown()).optional(),
  lastTestedAt: z.string().optional(),
  inputSchemaHashAtTest: z.string().optional(),
  performanceConfidence: performanceConfidenceSchema.optional(),
  securityFingerprint: z.record(z.unknown()).optional(),
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

const workflowSignatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  toolSequence: z.array(z.string()),
  succeeded: z.boolean(),
  summary: z.string().optional(),
});

/**
 * Zod schema for accepted diff validation.
 */
const acceptedDiffSchema = z.object({
  toolsAdded: z.array(z.string()),
  toolsRemoved: z.array(z.string()),
  toolsModified: z.array(z.string()),
  severity: z.enum(['none', 'info', 'warning', 'breaking']),
  breakingCount: z.number(),
  warningCount: z.number(),
  infoCount: z.number(),
});

/**
 * Zod schema for drift acceptance validation.
 */
const driftAcceptanceSchema = z.object({
  acceptedAt: z.string().or(z.date()),
  acceptedBy: z.string().optional(),
  reason: z.string().optional(),
  acceptedDiff: acceptedDiffSchema,
});

const baselineSchema = z.object({
  version: z.string(),
  metadata: z.object({
    mode: z.enum(['check', 'explore']),
    generatedAt: z.string(),
    cliVersion: z.string(),
    serverCommand: z.string(),
    serverName: z.string().optional(),
    durationMs: z.number().int().min(0),
    personas: z.array(z.string()).optional(),
    model: z.string().optional(),
    branch: z.string().optional(),
    gitSha: z.string().optional(),
    environment: z.record(z.unknown()).optional(),
    warmupRuns: z.number().int().min(0).max(10).optional(),
  }),
  server: serverFingerprintSchema,
  capabilities: z.object({
    tools: z.array(toolCapabilitySchema),
    resources: z.array(z.record(z.unknown())).optional(),
    prompts: z.array(z.record(z.unknown())).optional(),
  }),
  interviews: z.array(z.record(z.unknown())),
  toolProfiles: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    schemaHash: z.string().optional(),
    assertions: z.array(cloudAssertionSchema),
    securityNotes: z.array(z.string()).optional(),
    limitations: z.array(z.string()).optional(),
    behavioralNotes: z.array(z.string()).optional(),
  })),
  workflows: z.array(workflowSignatureSchema).optional(),
  assertions: z.array(cloudAssertionSchema),
  summary: z.string(),
  hash: z.string(),
  acceptance: driftAcceptanceSchema.optional(),
  documentationScore: z.record(z.unknown()).optional(),
});

/**
 * Options for loading a baseline.
 */
export interface LoadBaselineOptions {
  /**
   * Skip integrity hash verification.
   * Use with caution - only for debugging or when you know the file was modified intentionally.
   * @default false
   */
  skipIntegrityCheck?: boolean;
}

/**
 * Create a behavioral baseline from interview results.
 *
 * Baselines can only be created from check mode results.
 * Explore mode results are for documentation only.
 */
export function createBaseline(
  result: InterviewResult,
  serverCommand: string
): BehavioralBaseline {
  return createCloudBaseline(result, serverCommand);
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
 * @returns Loaded baseline
 */
export function loadBaseline(
  path: string,
  options: LoadBaselineOptions = {}
): BehavioralBaseline {
  const { skipIntegrityCheck = false } = options;

  if (!existsSync(path)) {
    throw new Error(`Baseline file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');

  // Check file size to prevent resource exhaustion
  const contentSize = Buffer.byteLength(content, 'utf-8');
  if (contentSize > PAYLOAD_LIMITS.MAX_BASELINE_SIZE) {
    const sizeMB = (contentSize / (1024 * 1024)).toFixed(2);
    const limitMB = (PAYLOAD_LIMITS.MAX_BASELINE_SIZE / (1024 * 1024)).toFixed(0);
    throw new Error(
      `Baseline file too large: ${sizeMB}MB exceeds limit of ${limitMB}MB. ` +
        `File may be corrupted or contain excessive data.`
    );
  }

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

  const baseline = result.data as unknown as BehavioralBaseline;
  const baselineVersion = parseVersion(baseline.version);
  const currentVersion = parseVersion(getBaselineVersion());

  if (baselineVersion.major !== currentVersion.major) {
    getLogger('baseline').warn(
      `Baseline uses CLI version ${formatVersion(baselineVersion.raw)}. ` +
      `Current CLI version is ${formatVersion(currentVersion.raw)}. ` +
      `Recreate the baseline with this CLI version for best results.`
    );
  }

  if (baseline.acceptance?.acceptedAt) {
    baseline.acceptance.acceptedAt = new Date(baseline.acceptance.acceptedAt);
  }

  if (!skipIntegrityCheck) {
    if (!verifyBaselineHash(baseline)) {
      throw new Error('Baseline hash verification failed - file may have been modified');
    }
  }

  return baseline;
}

/**
 * Verify baseline hash.
 */
export function verifyBaselineHash(baseline: BehavioralBaseline): boolean {
  const { hash, ...rest } = baseline;
  const expectedHash = calculateBaselineHash(rest);
  return hash === expectedHash;
}

/**
 * Recalculate and update the hash for a baseline.
 * Useful after manual modifications (e.g. acceptance metadata).
 */
export function recalculateBaselineHash(
  baseline: Omit<BehavioralBaseline, 'hash'>
): BehavioralBaseline {
  const hash = calculateBaselineHash(baseline);
  return {
    ...baseline,
    hash,
  };
}

// Legacy local-baseline helpers removed.

/**
 * Check if a baseline file exists.
 * Returns false for directories - baselines must be files.
 */
export function baselineExists(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Options for accepting drift.
 */
export interface AcceptDriftOptions {
  /** Who is accepting the drift (for audit trail) */
  acceptedBy?: string;
  /** Reason for accepting the drift */
  reason?: string;
}

/**
 * Accept drift by updating a baseline with drift acceptance metadata.
 *
 * This marks the current state of the server as the new expected baseline,
 * acknowledging that the detected changes were intentional.
 *
 * @param currentBaseline - The new baseline from the current server state
 * @param diff - The diff that is being accepted
 * @param options - Acceptance options (reason, acceptedBy)
 * @returns The baseline with acceptance metadata attached
 */
export function acceptDrift(
  currentBaseline: BehavioralBaseline,
  diff: BehavioralDiff,
  options: AcceptDriftOptions = {}
): BehavioralBaseline {
  // Create the accepted diff snapshot
  const acceptedDiff: AcceptedDiff = {
    toolsAdded: [...diff.toolsAdded],
    toolsRemoved: [...diff.toolsRemoved],
    toolsModified: diff.toolsModified.map(t => t.tool),
    severity: diff.severity,
    breakingCount: diff.breakingCount,
    warningCount: diff.warningCount,
    infoCount: diff.infoCount,
  };

  // Create acceptance metadata
  const acceptance: DriftAcceptance = {
    acceptedAt: new Date(),
    acceptedBy: options.acceptedBy,
    reason: options.reason,
    acceptedDiff,
  };

  const { hash: oldHash, ...baselineWithoutHash } = currentBaseline;
  void oldHash;
  const baselineWithAcceptance: Omit<BehavioralBaseline, 'hash'> = {
    ...baselineWithoutHash,
    acceptance,
  };
  const hash = calculateBaselineHash(baselineWithAcceptance);

  return {
    ...baselineWithAcceptance,
    hash,
  };
}

/**
 * Check if a baseline has acceptance metadata.
 */
export function hasAcceptance(baseline: BehavioralBaseline): boolean {
  return baseline.acceptance !== undefined;
}

/**
 * Clear acceptance metadata from a baseline.
 * Useful when re-running checks after the accepted changes are no longer relevant.
 * Returns a new baseline without acceptance, with recalculated integrity hash.
 */
export function clearAcceptance(baseline: BehavioralBaseline): BehavioralBaseline {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { acceptance: _removed, hash: _oldHash, ...baselineWithoutAcceptance } = baseline;
  return {
    ...baselineWithoutAcceptance,
    hash: calculateBaselineHash(baselineWithoutAcceptance),
  };
}
