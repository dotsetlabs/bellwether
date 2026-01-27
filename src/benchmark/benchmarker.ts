/**
 * Benchmark module for the Tested with Bellwether program.
 */

import { createHash } from 'crypto';
import type {
  BenchmarkResult,
  BenchmarkStatus,
  BenchmarkTier,
  BenchmarkReport,
  BenchmarkBadge,
  BenchmarkConfig,
} from './types.js';
import type { InterviewResult } from '../interview/types.js';
import { getLogger } from '../logging/logger.js';
import { VERSION } from '../version.js';
import { TIME_CONSTANTS, DISPLAY_LIMITS, BENCHMARK_TIERS } from '../constants.js';

const logger = getLogger('benchmark');

/** Benchmark validity period in days (90 days) */
const BENCHMARK_VALIDITY_DAYS = 90;

/**
 * Generate a benchmark result from an interview result.
 */
export function generateBenchmarkResult(
  interview: InterviewResult,
  config: BenchmarkConfig
): BenchmarkResult {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + BENCHMARK_VALIDITY_DAYS * TIME_CONSTANTS.MS_PER_DAY);

  // Calculate test statistics
  const { testsPassed, testsTotal } = calculateTestStats(interview);
  const passRate = testsTotal > 0 ? Math.round((testsPassed / testsTotal) * 100) : 0;

  // Determine tier based on coverage and pass rate
  const tier = determineTier(interview, passRate);

  // Determine status
  const status = determineStatus(passRate, tier, config.targetTier);

  // Generate report hash
  const reportHash = generateReportHash(interview);

  const result: BenchmarkResult = {
    serverId: config.serverId,
    version: config.version ?? interview.discovery.serverInfo.version,
    status,
    tier: status === 'passed' ? tier : undefined,
    testedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    toolsTested: interview.toolProfiles.length,
    testsPassed,
    testsTotal,
    passRate,
    reportHash,
    bellwetherVersion: VERSION,
  };

  logger.info({
    serverId: result.serverId,
    status: result.status,
    tier: result.tier,
    passRate: result.passRate,
  }, 'Benchmark result generated');

  return result;
}

/**
 * Generate a full benchmark report.
 */
export function generateBenchmarkReport(
  interview: InterviewResult,
  config: BenchmarkConfig
): BenchmarkReport {
  const result = generateBenchmarkResult(interview, config);

  // Build tool benchmark details
  const tools = interview.toolProfiles.map(profile => {
    const passed = profile.interactions.filter(i => !i.error && !i.response?.isError).length;
    const errors = profile.interactions
      .filter(i => i.error || i.response?.isError)
      .map(i => i.error ?? 'Tool returned error');

    return {
      name: profile.name,
      testsRun: profile.interactions.length,
      testsPassed: passed,
      errors,
    };
  });

  // Build prompt benchmark details
  const prompts = interview.promptProfiles?.map(profile => {
    const passed = profile.interactions.filter(i => !i.error).length;
    const errors = profile.interactions
      .filter(i => i.error)
      .map(i => i.error ?? 'Prompt returned error');

    return {
      name: profile.name,
      testsRun: profile.interactions.length,
      testsPassed: passed,
      errors,
    };
  });

  // Build resource benchmark details
  const resources = interview.resourceProfiles?.map(profile => {
    const passed = profile.interactions.filter(i => !i.error).length;
    const errors = profile.interactions
      .filter(i => i.error)
      .map(i => i.error ?? 'Resource read error');

    return {
      uri: profile.uri,
      name: profile.name,
      testsRun: profile.interactions.length,
      testsPassed: passed,
      errors,
    };
  });

  return {
    result,
    serverInfo: {
      name: interview.discovery.serverInfo.name,
      version: interview.discovery.serverInfo.version,
      description: interview.summary,
    },
    tools,
    prompts,
    resources,
    environment: {
      os: process.platform,
      nodeVersion: process.version,
      bellwetherVersion: VERSION,
    },
  };
}

/**
 * Generate a benchmark badge for embedding.
 */
export function generateBenchmarkBadge(
  result: BenchmarkResult
): BenchmarkBadge {
  const badge: BenchmarkBadge = {
    label: 'bellwether',
    message: 'not tested',
    color: 'lightgrey',
  };

  switch (result.status) {
    case 'passed':
      badge.message = result.tier ?? 'passed';
      badge.color = getTierColor(result.tier);
      badge.icon = getTierIcon(result.tier);
      badge.testedAt = result.testedAt;
      break;

    case 'pending':
      badge.message = 'pending';
      badge.color = 'yellow';
      break;

    case 'failed':
      badge.message = 'failed';
      badge.color = 'red';
      break;

    case 'expired':
      badge.message = 'expired';
      badge.color = 'orange';
      break;
  }

  return badge;
}

/**
 * Generate a Shields.io compatible badge URL.
 */
export function generateBadgeUrl(result: BenchmarkResult): string {
  const badge = generateBenchmarkBadge(result);
  const encodedLabel = encodeURIComponent(badge.label);
  const encodedMessage = encodeURIComponent(badge.message);
  const encodedColor = encodeURIComponent(badge.color);

  return `https://img.shields.io/badge/${encodedLabel}-${encodedMessage}-${encodedColor}`;
}

/**
 * Generate a benchmark badge markdown.
 */
export function generateBadgeMarkdown(
  result: BenchmarkResult,
  reportUrl?: string
): string {
  const badgeUrl = generateBadgeUrl(result);
  const altText = `Bellwether ${result.status}: ${result.tier ?? result.status}`;

  if (reportUrl) {
    return `[![${altText}](${badgeUrl})](${reportUrl})`;
  }

  return `![${altText}](${badgeUrl})`;
}

/**
 * Check if a benchmark result is still valid.
 */
export function isBenchmarkValid(result: BenchmarkResult): boolean {
  const expiresAt = new Date(result.expiresAt);
  return result.status === 'passed' && expiresAt > new Date();
}

/**
 * Calculate test statistics from interview results.
 */
function calculateTestStats(interview: InterviewResult): {
  testsPassed: number;
  testsTotal: number;
  toolStats: Map<string, { passed: number; total: number }>;
} {
  let testsPassed = 0;
  let testsTotal = 0;
  const toolStats = new Map<string, { passed: number; total: number }>();

  // Count tool tests
  for (const profile of interview.toolProfiles) {
    const total = profile.interactions.length;
    const passed = profile.interactions.filter(i => !i.error && !i.response?.isError).length;

    toolStats.set(profile.name, { passed, total });
    testsPassed += passed;
    testsTotal += total;
  }

  // Count prompt tests
  if (interview.promptProfiles) {
    for (const profile of interview.promptProfiles) {
      const total = profile.interactions.length;
      const passed = profile.interactions.filter(i => !i.error).length;

      testsPassed += passed;
      testsTotal += total;
    }
  }

  // Count resource tests
  if (interview.resourceProfiles) {
    for (const profile of interview.resourceProfiles) {
      const total = profile.interactions.length;
      const passed = profile.interactions.filter(i => !i.error).length;

      testsPassed += passed;
      testsTotal += total;
    }
  }

  // Count scenario tests
  if (interview.scenarioResults) {
    for (const result of interview.scenarioResults) {
      testsTotal++;
      if (result.passed) {
        testsPassed++;
      }
    }
  }

  return { testsPassed, testsTotal, toolStats };
}

function determineTier(
  interview: InterviewResult,
  passRate: number
): BenchmarkTier {
  const hasSecurityTesting = interview.metadata.personas?.some(
    p => p.name.toLowerCase().includes('security')
  );

  const personaCount = interview.metadata.personas?.length ?? 1;
  const hasPrompts = (interview.promptProfiles?.length ?? 0) > 0;
  const hasResources = (interview.resourceProfiles?.length ?? 0) > 0;

  // Platinum: Security testing + all personas + high pass rate
  if (
    hasSecurityTesting &&
    personaCount >= BENCHMARK_TIERS.PLATINUM.MIN_PERSONAS &&
    passRate >= BENCHMARK_TIERS.PLATINUM.MIN_PASS_RATE
  ) {
    return 'platinum';
  }

  // Gold: Multiple personas + good coverage + high pass rate
  if (
    personaCount >= BENCHMARK_TIERS.GOLD.MIN_PERSONAS &&
    passRate >= BENCHMARK_TIERS.GOLD.MIN_PASS_RATE &&
    (hasPrompts || hasResources)
  ) {
    return 'gold';
  }

  // Silver: Error handling tested + decent pass rate
  if (
    personaCount >= BENCHMARK_TIERS.SILVER.MIN_PERSONAS &&
    passRate >= BENCHMARK_TIERS.SILVER.MIN_PASS_RATE
  ) {
    return 'silver';
  }

  // Bronze: Basic testing
  return 'bronze';
}

/**
 * Determine benchmark status based on results.
 */
function determineStatus(
  passRate: number,
  achievedTier: BenchmarkTier,
  targetTier?: BenchmarkTier
): BenchmarkStatus {
  // Minimum pass rate for passing benchmark
  if (passRate < BENCHMARK_TIERS.MIN_PASS_RATE_FOR_BENCHMARK) {
    return 'failed';
  }

  // Check if target tier is met
  if (targetTier) {
    const tierOrder: BenchmarkTier[] = ['bronze', 'silver', 'gold', 'platinum'];
    const achievedIndex = tierOrder.indexOf(achievedTier);
    const targetIndex = tierOrder.indexOf(targetTier);

    if (achievedIndex < targetIndex) {
      return 'failed';
    }
  }

  return 'passed';
}

/**
 * Generate a hash of the interview results for benchmark.
 */
function generateReportHash(interview: InterviewResult): string {
  const data = {
    serverName: interview.discovery.serverInfo.name,
    serverVersion: interview.discovery.serverInfo.version,
    toolCount: interview.toolProfiles.length,
    toolNames: interview.toolProfiles.map(p => p.name).sort(),
    promptCount: interview.promptProfiles?.length ?? 0,
    resourceCount: interview.resourceProfiles?.length ?? 0,
    timestamp: interview.metadata.startTime.toISOString(),
  };

  return createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .substring(0, DISPLAY_LIMITS.HASH_DISPLAY_LENGTH);
}

/**
 * Get color for a benchmark tier.
 */
function getTierColor(tier?: BenchmarkTier): string {
  switch (tier) {
    case 'platinum':
      return '00CED1'; // Dark cyan
    case 'gold':
      return 'FFD700'; // Gold
    case 'silver':
      return 'C0C0C0'; // Silver
    case 'bronze':
      return 'CD7F32'; // Bronze
    default:
      return 'brightgreen';
  }
}

/**
 * Get icon for a benchmark tier.
 */
function getTierIcon(tier?: BenchmarkTier): string {
  switch (tier) {
    case 'platinum':
      return '💎';
    case 'gold':
      return '🥇';
    case 'silver':
      return '🥈';
    case 'bronze':
      return '🥉';
    default:
      return '✓';
  }
}
