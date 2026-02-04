/**
 * Baseline types for Bellwether.
 *
 * These types define the canonical baseline format used for:
 * - Local baseline storage
 * - Baseline comparison and drift detection
 * - Tool capability tracking
 *
 * Originally part of a hosted integration, now standalone for open-source use.
 */

import type { WorkflowSignature } from './types.js';
import type { ResponseFingerprint, InferredSchema, ErrorPattern } from './response-fingerprint.js';
import type { SecurityFingerprint } from '../security/types.js';

/**
 * Assertion type for baseline assertions.
 * Maps to: expects (positive), requires (critical), warns (negative), notes (informational)
 */
export type BaselineAssertionType = 'expects' | 'requires' | 'warns' | 'notes';

/**
 * Severity level for assertions.
 */
export type BaselineAssertionSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Behavioral assertion in baseline format.
 */
export interface BaselineAssertion {
  /** Type of assertion */
  type: BaselineAssertionType;
  /** The condition/assertion statement */
  condition: string;
  /** Tool this assertion relates to (optional) */
  tool?: string;
  /** Severity level (optional) */
  severity?: BaselineAssertionSeverity;
}

/**
 * Baseline mode indicating how the baseline was generated.
 * - 'check': Deterministic structural testing (no LLM required)
 * - 'explore': LLM-powered behavioral exploration
 */
export type BaselineMode = 'check' | 'explore';

/**
 * Metadata about how the baseline was generated.
 */
export interface BaselineMetadata {
  /** Baseline mode: 'check' = deterministic, 'explore' = LLM-powered */
  mode: BaselineMode;
  /** ISO timestamp when generated */
  generatedAt: string;
  /** CLI version that generated this baseline */
  cliVersion: string;
  /** Command used to start the server */
  serverCommand: string;
  /** Server name from MCP initialization */
  serverName?: string;
  /** Interview duration in milliseconds */
  durationMs: number;
  /** Personas used during interview (empty for check mode) */
  personas: string[];
  /** LLM model used ('none' for check mode) */
  model: string;
}

/**
 * Server fingerprint in baseline format.
 */
export interface BaselineServerFingerprint {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** MCP protocol version */
  protocolVersion: string;
  /** Available capabilities */
  capabilities: string[];
}

/**
 * Tool capability from discovery.
 */
export interface ToolCapability {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema */
  inputSchema: Record<string, unknown>;
  /** Hash of the schema for change detection */
  schemaHash: string;
  /** Hash of observed arguments schema (from actual calls) */
  observedArgsSchemaHash?: string;
  /** Consistency of observed argument schemas (0-1) */
  observedArgsSchemaConsistency?: number;
  /** Number of observed schema variations */
  observedArgsSchemaVariations?: number;
  // Response fingerprinting (check mode enhancement)
  /** Fingerprint of the tool's response structure */
  responseFingerprint?: ResponseFingerprint;
  /** Inferred JSON schema of the tool's output */
  inferredOutputSchema?: InferredSchema;
  /** Normalized error patterns observed during testing */
  errorPatterns?: ErrorPattern[];
  /** Baseline p50 latency in milliseconds */
  baselineP50Ms?: number;
  /** Baseline p95 latency in milliseconds */
  baselineP95Ms?: number;
  /** Baseline p99 latency in milliseconds */
  baselineP99Ms?: number;
  /** Baseline success rate (0-1) */
  baselineSuccessRate?: number;
  /** Response schema evolution metadata */
  responseSchemaEvolution?: ResponseSchemaEvolution;
  /** ISO timestamp of last time this tool was tested */
  lastTestedAt?: string;
  /** Schema hash captured at the last test time */
  inputSchemaHashAtTest?: string;
  /** Statistical confidence for performance baselines */
  performanceConfidence?: {
    sampleCount: number;
    successfulSamples: number;
    validationSamples: number;
    totalTests: number;
    standardDeviation: number;
    coefficientOfVariation: number;
    confidenceLevel: 'low' | 'medium' | 'high';
    recommendation?: string;
  };
  /** Security testing fingerprint with findings and risk score */
  securityFingerprint?: SecurityFingerprint;
}

/**
 * Resource capability from discovery.
 */
export interface ResourceCapability {
  /** Resource URI template */
  uri: string;
  /** Resource name */
  name: string;
  /** Resource description */
  description?: string;
  /** MIME type */
  mimeType?: string;
}

/**
 * Prompt capability from discovery.
 */
export interface PromptCapability {
  /** Prompt name */
  name: string;
  /** Prompt description */
  description?: string;
  /** Arguments the prompt accepts */
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * Interview results for a single persona.
 */
export interface PersonaInterview {
  /** Persona ID */
  persona: string;
  /** Number of tools interviewed */
  toolsInterviewed: number;
  /** Number of questions asked */
  questionsAsked: number;
  /** Findings from this persona */
  findings: PersonaFinding[];
}

/**
 * A finding from a persona interview.
 */
export interface PersonaFinding {
  /** Tool this finding relates to */
  tool: string;
  /** Finding category */
  category: 'behavior' | 'security' | 'reliability' | 'edge_case';
  /** Severity level */
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /** Description of the finding */
  description: string;
  /** Evidence supporting the finding */
  evidence?: string;
}

/**
 * Tool behavioral profile in baseline format.
 */
export interface BaselineToolProfile {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Hash of input schema */
  schemaHash: string;
  /** Behavioral assertions */
  assertions: BaselineAssertion[];
  /** Security notes */
  securityNotes: string[];
  /** Known limitations */
  limitations: string[];
  /** Behavioral notes */
  behavioralNotes: string[];
}

/**
 * Snapshot of accepted drift for a baseline.
 */
export interface AcceptedDiff {
  toolsAdded: string[];
  toolsRemoved: string[];
  toolsModified: string[];
  severity: 'none' | 'info' | 'warning' | 'breaking';
  breakingCount: number;
  warningCount: number;
  infoCount: number;
}

/**
 * Drift acceptance metadata attached to a baseline.
 */
export interface DriftAcceptance {
  acceptedAt: string | Date;
  acceptedBy?: string;
  reason?: string;
  acceptedDiff: AcceptedDiff;
}

/**
 * Serializable schema evolution data for baselines.
 */
export interface ResponseSchemaEvolution {
  currentHash: string;
  history: Array<{
    hash: string;
    schema: InferredSchema;
    observedAt: string | Date;
    sampleCount: number;
  }>;
  isStable: boolean;
  stabilityConfidence: number;
  inconsistentFields: string[];
  sampleCount: number;
}

/**
 * Serializable documentation score summary for baseline storage.
 */
export interface DocumentationScoreSummary {
  overallScore: number;
  grade: string;
  issueCount: number;
  toolCount: number;
}

/**
 * Canonical baseline format.
 *
 * This is the single baseline schema used by Bellwether CLI.
 *
 * Versioning: Uses CLI package version for compatibility checking.
 * Baselines with the same CLI major version are compatible.
 */
export interface BellwetherBaseline {
  /** CLI version that generated this baseline (e.g., '1.0.0') */
  version: string;

  /** Generation metadata */
  metadata: BaselineMetadata;

  /** Server fingerprint */
  server: BaselineServerFingerprint;

  /** Discovered capabilities */
  capabilities: {
    tools: ToolCapability[];
    resources?: ResourceCapability[];
    prompts?: PromptCapability[];
  };

  /** Interview results by persona */
  interviews: PersonaInterview[];

  /** Tool behavioral profiles */
  toolProfiles: BaselineToolProfile[];

  /** Workflow results (if workflows were tested) */
  workflows?: WorkflowSignature[];

  /** Overall behavioral assertions */
  assertions: BaselineAssertion[];

  /** Summary of findings */
  summary: string;

  /** SHA-256 hash of content (first 16 chars) for integrity */
  hash: string;

  /** Drift acceptance metadata (optional) */
  acceptance?: DriftAcceptance;

  /** Optional documentation score summary */
  documentationScore?: DocumentationScoreSummary;
}
