/**
 * Tested with Bellwether program module.
 */

export {
  generateBenchmarkResult,
  generateBenchmarkReport,
  generateBenchmarkBadge,
  generateBadgeUrl,
  generateBadgeMarkdown,
  isBenchmarkValid,
} from './benchmarker.js';

export type {
  BenchmarkStatus,
  BenchmarkTier,
  BenchmarkResult,
  BenchmarkBadge,
  BenchmarkConfig,
  BenchmarkReport,
  BenchmarkSubmission,
} from './types.js';
