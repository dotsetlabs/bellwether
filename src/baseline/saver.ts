/**
 * Baseline save/load functionality.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { z } from 'zod';
import type { InterviewResult, ToolProfile } from '../interview/types.js';
import type {
  BehavioralBaseline,
  BehavioralDiff,
  BaselineMode,
  ToolFingerprint,
  ServerFingerprint,
  BehavioralAssertion,
  WorkflowSignature,
  DriftAcceptance,
  AcceptedDiff,
} from './types.js';
import { computeConsensusSchemaHash } from './schema-compare.js';
import {
  getBaselineVersion,
  parseVersion,
  formatVersion,
} from './version.js';
import { migrateBaseline, needsMigration } from './migrations.js';
import { analyzeResponses, type InferredSchema } from './response-fingerprint.js';
import { calculateMetrics, calculatePerformanceConfidence, type LatencySample } from './performance-tracker.js';
import { PATTERNS, PAYLOAD_LIMITS } from '../constants.js';
import { getLogger } from '../logging/logger.js';

/**
 * Zod schema for behavioral assertion validation.
 */
const behavioralAssertionSchema = z.object({
  tool: z.string(),
  aspect: z.enum([
    'response_format',
    'response_structure',
    'error_handling',
    'error_pattern',
    'security',
    'performance',
    'schema',
    'description',
  ]),
  assertion: z.string(),
  evidence: z.string().optional(),
  isPositive: z.boolean(),
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
  standardDeviation: z.number(),
  coefficientOfVariation: z.number(),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  recommendation: z.string().optional(),
});

/**
 * Zod schema for tool fingerprint validation.
 */
const toolFingerprintSchema = z.object({
  name: z.string(),
  description: z.string(),
  schemaHash: z.string(),
  inputSchema: z.record(z.unknown()).optional(),
  assertions: z.array(behavioralAssertionSchema),
  securityNotes: z.array(z.string()),
  limitations: z.array(z.string()),
  // Response fingerprinting fields (check mode enhancement)
  responseFingerprint: responseFingerprintSchema.optional(),
  inferredOutputSchema: inferredSchemaSchema.optional(),
  errorPatterns: z.array(errorPatternSchema).optional(),
  // Performance baseline fields
  baselineP50Ms: z.number().optional(),
  baselineP95Ms: z.number().optional(),
  baselineSuccessRate: z.number().optional(),
  performanceConfidence: performanceConfidenceSchema.optional(),
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
    z.string().regex(PATTERNS.SEMVER, 'Version must be semver format (e.g., "1.0.0")'),
    z.number().int().positive(), // Legacy format support
  ]),
  createdAt: z.string().or(z.date()),
  mode: z.enum(['check']).optional(),
  serverCommand: z.string(),
  server: serverFingerprintSchema,
  tools: z.array(toolFingerprintSchema),
  summary: z.string(),
  assertions: z.array(behavioralAssertionSchema),
  workflowSignatures: z.array(workflowSignatureSchema).optional(),
  integrityHash: z.string(),
  acceptance: driftAcceptanceSchema.optional(),
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
 *
 * Baselines can only be created from check mode results.
 * Explore mode results are for documentation only.
 */
export function createBaseline(
  result: InterviewResult,
  serverCommand: string
): BehavioralBaseline {
  // Baselines are always check mode
  const effectiveMode: BaselineMode = 'check';

  const server = createServerFingerprint(result);
  // Create a map of tool name -> inputSchema from discovery
  const schemaMap = new Map<string, Record<string, unknown>>();
  for (const tool of result.discovery.tools) {
    if (tool.inputSchema) {
      schemaMap.set(tool.name, tool.inputSchema as Record<string, unknown>);
    }
  }
  const tools = result.toolProfiles.map(profile =>
    createToolFingerprint(profile, schemaMap.get(profile.name))
  );
  const assertions = extractAssertions(result);
  const workflowSignatures = extractWorkflowSignatures(result);

  const baselineData: Omit<BehavioralBaseline, 'integrityHash'> = {
    version: getBaselineVersion(),
    createdAt: new Date(),
    mode: effectiveMode,
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

  let baseline = result.data as unknown as Record<string, unknown>;

  // Check if migration is needed
  if (needsMigration(baseline)) {
    const currentVersion = parseVersion(baseline.version as string | number);

    if (migrate) {
      // Automatically migrate to current version
      baseline = migrateBaseline(baseline) as unknown as Record<string, unknown>;
    } else {
      // Log warning but continue with the old format
      getLogger('baseline').warn(
        `Baseline uses older CLI version ${formatVersion(currentVersion.raw)}. ` +
        `Current CLI version is ${formatVersion(getBaselineVersion())}. ` +
        `Run \`bellwether baseline migrate\` to upgrade.`
      );
    }
  }

  const typedBaseline = baseline as unknown as BehavioralBaseline;

  // Restore Date objects
  typedBaseline.createdAt = new Date(typedBaseline.createdAt);
  if (typedBaseline.acceptance?.acceptedAt) {
    typedBaseline.acceptance.acceptedAt = new Date(typedBaseline.acceptance.acceptedAt);
  }

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
 * Includes response fingerprinting for enhanced structural drift detection.
 */
function createToolFingerprint(
  profile: ToolProfile,
  inputSchema?: Record<string, unknown>
): ToolFingerprint {
  const assertions = extractToolAssertions(profile);

  // Compute schema hash from all interactions (not just first)
  // This includes argument types and infers schema from actual values
  const interactions = profile.interactions.map(i => ({ args: i.question.args }));
  const { hash: schemaHash } = computeConsensusSchemaHash(interactions);

  // Analyze responses to create fingerprint (check mode enhancement)
  const responseData = profile.interactions.map(i => ({
    response: i.response,
    error: i.error,
  }));
  const responseAnalysis = analyzeResponses(responseData);

  // Calculate performance metrics from interactions
  const latencySamples: LatencySample[] = profile.interactions
    .filter(i => i.toolExecutionMs !== undefined)
    .map(i => ({
      toolName: profile.name,
      durationMs: i.toolExecutionMs ?? 0,
      success: !i.error,
      timestamp: new Date(),
    }));

  let baselineP50Ms: number | undefined;
  let baselineP95Ms: number | undefined;
  let baselineSuccessRate: number | undefined;

  if (latencySamples.length > 0) {
    const metrics = calculateMetrics(latencySamples);
    if (metrics) {
      baselineP50Ms = metrics.p50Ms;
      baselineP95Ms = metrics.p95Ms;
      baselineSuccessRate = metrics.successRate;
    }
  }

  // Calculate performance confidence (sample count + coefficient of variation)
  const performanceConfidence = calculatePerformanceConfidence(latencySamples);

  return {
    name: profile.name,
    description: profile.description,
    schemaHash,
    inputSchema,
    assertions,
    securityNotes: [...profile.securityNotes],
    limitations: [...profile.limitations],
    // Response fingerprinting
    responseFingerprint: responseAnalysis.fingerprint,
    inferredOutputSchema: responseAnalysis.inferredSchema,
    errorPatterns: responseAnalysis.errorPatterns.length > 0
      ? responseAnalysis.errorPatterns
      : undefined,
    // Performance baseline
    baselineP50Ms,
    baselineP95Ms,
    baselineSuccessRate,
    performanceConfidence,
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

  // Create new baseline with acceptance metadata
  const baselineWithAcceptance: Omit<BehavioralBaseline, 'integrityHash'> = {
    version: currentBaseline.version,
    createdAt: currentBaseline.createdAt,
    mode: currentBaseline.mode,
    serverCommand: currentBaseline.serverCommand,
    server: currentBaseline.server,
    tools: currentBaseline.tools,
    summary: currentBaseline.summary,
    assertions: currentBaseline.assertions,
    workflowSignatures: currentBaseline.workflowSignatures,
    acceptance,
  };

  // Recalculate integrity hash with acceptance metadata
  const integrityHash = calculateIntegrityHash(baselineWithAcceptance);

  return {
    ...baselineWithAcceptance,
    integrityHash,
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
  // Destructure to exclude acceptance (and integrityHash which needs recalculating)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { acceptance: _removed, integrityHash: _oldHash, ...baselineWithoutAcceptance } = baseline;

  return {
    ...baselineWithoutAcceptance,
    integrityHash: calculateIntegrityHash(baselineWithoutAcceptance),
  };
}
