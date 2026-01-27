/**
 * Types for the Tested with Bellwether program.
 */

/**
 * Benchmark status for a server.
 */
export type BenchmarkStatus =
  | 'passed'
  | 'pending'
  | 'failed'
  | 'expired'
  | 'not_tested';

/**
 * Benchmark tier based on test coverage.
 */
export type BenchmarkTier =
  | 'bronze'   // Basic benchmark (happy path only)
  | 'silver'   // Standard benchmark (includes error handling)
  | 'gold'     // Comprehensive benchmark (all personas)
  | 'platinum' // Full benchmark with security testing

/**
 * Benchmark result from a benchmark run.
 */
export interface BenchmarkResult {
  /** Server identifier (namespace/name) */
  serverId: string;
  /** Server version */
  version: string;
  /** Benchmark status */
  status: BenchmarkStatus;
  /** Benchmark tier achieved */
  tier?: BenchmarkTier;
  /** ISO timestamp when tested */
  testedAt: string;
  /** ISO timestamp when benchmark expires */
  expiresAt: string;
  /** Number of tools tested */
  toolsTested: number;
  /** Number of tests passed */
  testsPassed: number;
  /** Total number of tests run */
  testsTotal: number;
  /** Pass rate (0-100) */
  passRate: number;
  /** Checksum of the benchmark report */
  reportHash: string;
  /** Bellwether version used */
  bellwetherVersion: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Benchmark badge data for embedding.
 */
export interface BenchmarkBadge {
  /** Badge label */
  label: string;
  /** Badge message */
  message: string;
  /** Badge color */
  color: string;
  /** Benchmark tier icon */
  icon?: string;
  /** Link to benchmark report */
  reportUrl?: string;
  /** ISO timestamp of benchmark */
  testedAt?: string;
}

/**
 * Configuration for benchmark.
 */
export interface BenchmarkConfig {
  /** Server identifier */
  serverId: string;
  /** Server version */
  version?: string;
  /** Tier to target */
  targetTier?: BenchmarkTier;
  /** Include security testing */
  includeSecurity?: boolean;
  /** Custom scenarios to include */
  scenariosPath?: string;
  /** Output directory for reports */
  outputDir?: string;
}

/**
 * Benchmark report (full detailed report).
 */
export interface BenchmarkReport {
  /** Benchmark result summary */
  result: BenchmarkResult;
  /** Server information */
  serverInfo: {
    name: string;
    version: string;
    description?: string;
    repository?: string;
  };
  /** Tool benchmark details */
  tools: Array<{
    name: string;
    testsRun: number;
    testsPassed: number;
    errors: string[];
  }>;
  /** Prompt benchmark details */
  prompts?: Array<{
    name: string;
    testsRun: number;
    testsPassed: number;
    errors: string[];
  }>;
  /** Resource benchmark details */
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
 * Benchmark submission for the registry.
 */
export interface BenchmarkSubmission {
  /** Benchmark result */
  result: BenchmarkResult;
  /** Signed benchmark token */
  signature?: string;
  /** Submitter information */
  submitter?: {
    email?: string;
    organization?: string;
  };
}
