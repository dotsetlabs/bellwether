/**
 * Types for the Verified by Bellwether program.
 */

/**
 * Verification status for a server.
 */
export type VerificationStatus =
  | 'verified'
  | 'pending'
  | 'failed'
  | 'expired'
  | 'not_verified';

/**
 * Verification tier based on test coverage.
 */
export type VerificationTier =
  | 'bronze'   // Basic verification (happy path only)
  | 'silver'   // Standard verification (includes error handling)
  | 'gold'     // Comprehensive verification (all personas)
  | 'platinum' // Full verification with security testing

/**
 * Verification result from a verification run.
 */
export interface VerificationResult {
  /** Server identifier (namespace/name) */
  serverId: string;
  /** Server version */
  version: string;
  /** Verification status */
  status: VerificationStatus;
  /** Verification tier achieved */
  tier?: VerificationTier;
  /** ISO timestamp when verified */
  verifiedAt: string;
  /** ISO timestamp when verification expires */
  expiresAt: string;
  /** Number of tools verified */
  toolsVerified: number;
  /** Number of tests passed */
  testsPassed: number;
  /** Total number of tests run */
  testsTotal: number;
  /** Pass rate (0-100) */
  passRate: number;
  /** Checksum of the verification report */
  reportHash: string;
  /** Bellwether version used */
  bellwetherVersion: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Verification badge data for embedding.
 */
export interface VerificationBadge {
  /** Badge label */
  label: string;
  /** Badge message */
  message: string;
  /** Badge color */
  color: string;
  /** Verification tier icon */
  icon?: string;
  /** Link to verification report */
  reportUrl?: string;
  /** ISO timestamp of verification */
  verifiedAt?: string;
}

/**
 * Configuration for verification.
 */
export interface VerificationConfig {
  /** Server identifier */
  serverId: string;
  /** Server version */
  version?: string;
  /** Tier to target */
  targetTier?: VerificationTier;
  /** Include security testing */
  includeSecurity?: boolean;
  /** Custom scenarios to include */
  scenariosPath?: string;
  /** Output directory for reports */
  outputDir?: string;
}

/**
 * Verification report (full detailed report).
 */
export interface VerificationReport {
  /** Verification result summary */
  result: VerificationResult;
  /** Server information */
  serverInfo: {
    name: string;
    version: string;
    description?: string;
    repository?: string;
  };
  /** Tool verification details */
  tools: Array<{
    name: string;
    testsRun: number;
    testsPassed: number;
    errors: string[];
  }>;
  /** Prompt verification details */
  prompts?: Array<{
    name: string;
    testsRun: number;
    testsPassed: number;
    errors: string[];
  }>;
  /** Resource verification details */
  resources?: Array<{
    uri: string;
    name: string;
    testsRun: number;
    testsPassed: number;
    errors: string[];
  }>;
  /** Environment information */
  environment: {
    os: string;
    nodeVersion: string;
    bellwetherVersion: string;
  };
}

/**
 * Verification submission for the registry.
 */
export interface VerificationSubmission {
  /** Verification result */
  result: VerificationResult;
  /** Signed verification token */
  signature?: string;
  /** Submitter information */
  submitter?: {
    email?: string;
    organization?: string;
  };
}
