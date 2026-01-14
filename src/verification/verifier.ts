/**
 * Verification module for the Verified by Bellwether program.
 */

import { createHash } from 'crypto';
import type {
  VerificationResult,
  VerificationStatus,
  VerificationTier,
  VerificationReport,
  VerificationBadge,
  VerificationConfig,
} from './types.js';
import type { InterviewResult } from '../interview/types.js';
import { getLogger } from '../logging/logger.js';

const logger = getLogger('verification');

/** Bellwether version */
const BELLWETHER_VERSION = '0.2.0';

/** Verification validity period in days */
const VERIFICATION_VALIDITY_DAYS = 90;

/**
 * Generate a verification result from an interview result.
 */
export function generateVerificationResult(
  interview: InterviewResult,
  config: VerificationConfig
): VerificationResult {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  // Calculate test statistics
  const { testsPassed, testsTotal } = calculateTestStats(interview);
  const passRate = testsTotal > 0 ? Math.round((testsPassed / testsTotal) * 100) : 0;

  // Determine tier based on coverage and pass rate
  const tier = determineTier(interview, passRate);

  // Determine status
  const status = determineStatus(passRate, tier, config.targetTier);

  // Generate report hash
  const reportHash = generateReportHash(interview);

  const result: VerificationResult = {
    serverId: config.serverId,
    version: config.version ?? interview.discovery.serverInfo.version,
    status,
    tier: status === 'verified' ? tier : undefined,
    verifiedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    toolsVerified: interview.toolProfiles.length,
    testsPassed,
    testsTotal,
    passRate,
    reportHash,
    bellwetherVersion: BELLWETHER_VERSION,
  };

  logger.info({
    serverId: result.serverId,
    status: result.status,
    tier: result.tier,
    passRate: result.passRate,
  }, 'Verification result generated');

  return result;
}

/**
 * Generate a full verification report.
 */
export function generateVerificationReport(
  interview: InterviewResult,
  config: VerificationConfig
): VerificationReport {
  const result = generateVerificationResult(interview, config);

  // Build tool verification details
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

  // Build prompt verification details
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

  // Build resource verification details
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
      bellwetherVersion: BELLWETHER_VERSION,
    },
  };
}

/**
 * Generate a verification badge for embedding.
 */
export function generateVerificationBadge(
  result: VerificationResult
): VerificationBadge {
  const badge: VerificationBadge = {
    label: 'bellwether',
    message: 'not verified',
    color: 'lightgrey',
  };

  switch (result.status) {
    case 'verified':
      badge.message = result.tier ?? 'verified';
      badge.color = getTierColor(result.tier);
      badge.icon = getTierIcon(result.tier);
      badge.verifiedAt = result.verifiedAt;
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
export function generateBadgeUrl(result: VerificationResult): string {
  const badge = generateVerificationBadge(result);
  const encodedLabel = encodeURIComponent(badge.label);
  const encodedMessage = encodeURIComponent(badge.message);
  const encodedColor = encodeURIComponent(badge.color);

  return `https://img.shields.io/badge/${encodedLabel}-${encodedMessage}-${encodedColor}`;
}

/**
 * Generate a verification badge markdown.
 */
export function generateBadgeMarkdown(
  result: VerificationResult,
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
 * Check if a verification result is still valid.
 */
export function isVerificationValid(result: VerificationResult): boolean {
  const expiresAt = new Date(result.expiresAt);
  return result.status === 'verified' && expiresAt > new Date();
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

/**
 * Determine verification tier based on coverage and pass rate.
 */
function determineTier(
  interview: InterviewResult,
  passRate: number
): VerificationTier {
  const hasSecurityTesting = interview.metadata.personas?.some(
    p => p.name.toLowerCase().includes('security')
  );

  const personaCount = interview.metadata.personas?.length ?? 1;
  const hasPrompts = (interview.promptProfiles?.length ?? 0) > 0;
  const hasResources = (interview.resourceProfiles?.length ?? 0) > 0;

  // Platinum: Security testing + all personas + high pass rate
  if (hasSecurityTesting && personaCount >= 4 && passRate >= 90) {
    return 'platinum';
  }

  // Gold: Multiple personas + good coverage + high pass rate
  if (personaCount >= 3 && passRate >= 85 && (hasPrompts || hasResources)) {
    return 'gold';
  }

  // Silver: Error handling tested + decent pass rate
  if (personaCount >= 2 && passRate >= 75) {
    return 'silver';
  }

  // Bronze: Basic testing
  return 'bronze';
}

/**
 * Determine verification status based on results.
 */
function determineStatus(
  passRate: number,
  achievedTier: VerificationTier,
  targetTier?: VerificationTier
): VerificationStatus {
  // Minimum pass rate for verification
  if (passRate < 50) {
    return 'failed';
  }

  // Check if target tier is met
  if (targetTier) {
    const tierOrder: VerificationTier[] = ['bronze', 'silver', 'gold', 'platinum'];
    const achievedIndex = tierOrder.indexOf(achievedTier);
    const targetIndex = tierOrder.indexOf(targetTier);

    if (achievedIndex < targetIndex) {
      return 'failed';
    }
  }

  return 'verified';
}

/**
 * Generate a hash of the interview results for verification.
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
    .substring(0, 16);
}

/**
 * Get color for a verification tier.
 */
function getTierColor(tier?: VerificationTier): string {
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
 * Get icon for a verification tier.
 */
function getTierIcon(tier?: VerificationTier): string {
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
