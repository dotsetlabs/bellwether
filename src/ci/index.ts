/**
 * CI/CD integration utilities.
 */

import type { InterviewResult } from '../interview/types.js';
import type {
  BehavioralDiff,
  CICheckResult,
  CIFinding,
} from '../baseline/types.js';
import { createBaseline } from '../baseline/index.js';

/**
 * Exit codes for CI scripting.
 */
export const EXIT_CODES = {
  /** All checks passed */
  SUCCESS: 0,
  /** Behavioral drift or security issues detected */
  FAILURE: 1,
  /** Internal error during execution */
  ERROR: 2,
} as const;

/**
 * CI mode options.
 */
export interface CIModeOptions {
  /** Disable colors in output */
  noColors?: boolean;
  /** Fail if behavioral drift detected */
  failOnDrift?: boolean;
  /** Fail if security issues found */
  failOnSecurity?: boolean;
  /** Minimum severity to fail on */
  failOnSeverity?: 'info' | 'warning' | 'breaking';
  /** Output format */
  outputFormat?: 'text' | 'json' | 'sarif' | 'junit';
  /** Whether running in CI environment */
  isCI?: boolean;
}

/**
 * Detect if running in a CI environment.
 */
export function detectCIEnvironment(): boolean {
  const ciEnvVars = [
    'CI',
    'CONTINUOUS_INTEGRATION',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'CIRCLECI',
    'JENKINS_URL',
    'TRAVIS',
    'BUILDKITE',
    'AZURE_PIPELINES',
    'TEAMCITY_VERSION',
  ];

  return ciEnvVars.some((envVar) => process.env[envVar] !== undefined);
}

/**
 * Get CI environment details.
 */
export function getCIEnvironment(): {
  name: string;
  detected: boolean;
  runId?: string;
  branch?: string;
  commit?: string;
} {
  if (process.env.GITHUB_ACTIONS) {
    return {
      name: 'GitHub Actions',
      detected: true,
      runId: process.env.GITHUB_RUN_ID,
      branch: process.env.GITHUB_REF_NAME,
      commit: process.env.GITHUB_SHA,
    };
  }

  if (process.env.GITLAB_CI) {
    return {
      name: 'GitLab CI',
      detected: true,
      runId: process.env.CI_JOB_ID,
      branch: process.env.CI_COMMIT_REF_NAME,
      commit: process.env.CI_COMMIT_SHA,
    };
  }

  if (process.env.CIRCLECI) {
    return {
      name: 'CircleCI',
      detected: true,
      runId: process.env.CIRCLE_BUILD_NUM,
      branch: process.env.CIRCLE_BRANCH,
      commit: process.env.CIRCLE_SHA1,
    };
  }

  if (process.env.JENKINS_URL) {
    return {
      name: 'Jenkins',
      detected: true,
      runId: process.env.BUILD_NUMBER,
      branch: process.env.GIT_BRANCH,
      commit: process.env.GIT_COMMIT,
    };
  }

  if (process.env.TRAVIS) {
    return {
      name: 'Travis CI',
      detected: true,
      runId: process.env.TRAVIS_BUILD_NUMBER,
      branch: process.env.TRAVIS_BRANCH,
      commit: process.env.TRAVIS_COMMIT,
    };
  }

  if (detectCIEnvironment()) {
    return {
      name: 'Unknown CI',
      detected: true,
    };
  }

  return {
    name: 'Local',
    detected: false,
  };
}

/**
 * Evaluate CI check from interview result.
 */
export function evaluateInterviewResult(
  result: InterviewResult,
  options: CIModeOptions = {}
): CICheckResult {
  const findings: CIFinding[] = [];
  let securityFindingsCount = 0;

  // Extract findings from tool profiles
  for (const profile of result.toolProfiles) {
    // Security notes become findings
    for (let i = 0; i < profile.securityNotes.length; i++) {
      const note = profile.securityNotes[i];
      const isRisk =
        note.toLowerCase().includes('risk') ||
        note.toLowerCase().includes('vulnerab') ||
        note.toLowerCase().includes('dangerous') ||
        note.toLowerCase().includes('injection');

      findings.push({
        id: `SEC-${profile.name}-${i + 1}`,
        category: 'security',
        severity: isRisk ? 'high' : 'medium',
        title: `Security consideration for ${profile.name}`,
        description: note,
        tool: profile.name,
        recommendation: 'Review and validate security implications',
      });

      if (isRisk) securityFindingsCount++;
    }

    // Limitations as findings
    for (let i = 0; i < profile.limitations.length; i++) {
      findings.push({
        id: `LIM-${profile.name}-${i + 1}`,
        category: 'reliability',
        severity: 'low',
        title: `Limitation in ${profile.name}`,
        description: profile.limitations[i],
        tool: profile.name,
      });
    }
  }

  // Workflow failures
  if (result.workflowResults) {
    for (const wr of result.workflowResults) {
      if (!wr.success) {
        findings.push({
          id: `WF-${wr.workflow.id}`,
          category: 'reliability',
          severity: 'high',
          title: `Workflow failed: ${wr.workflow.name}`,
          description: wr.failureReason || 'Workflow execution failed',
          recommendation: 'Investigate workflow step failures',
        });
      }
    }
  }

  // Extract assertions
  const baseline = createBaseline(result, 'interview');
  const assertions = baseline.assertions;

  // Determine pass/fail
  let passed = true;
  let exitCode: number = EXIT_CODES.SUCCESS;

  if (options.failOnSecurity && securityFindingsCount > 0) {
    passed = false;
    exitCode = EXIT_CODES.FAILURE;
  }

  // Check severity threshold
  if (options.failOnSeverity) {
    const severityMap: Record<string, number> = {
      info: 1,
      low: 2,
      medium: 3,
      warning: 3,
      high: 4,
      critical: 5,
      breaking: 5,
    };
    const threshold = severityMap[options.failOnSeverity] || 0;

    const hasFailingSeverity = findings.some(
      (f) => (severityMap[f.severity] || 0) >= threshold
    );

    if (hasFailingSeverity) {
      passed = false;
      exitCode = EXIT_CODES.FAILURE;
    }
  }

  const summary = generateCheckSummary(result, findings, passed);

  return {
    passed,
    exitCode,
    assertions,
    securityFindingsCount,
    summary,
    findings,
  };
}

/**
 * Evaluate CI check from behavioral diff.
 */
export function evaluateDiff(
  diff: BehavioralDiff,
  options: CIModeOptions = {}
): CICheckResult {
  const findings: CIFinding[] = [];
  let securityFindingsCount = 0;

  // Convert diff to findings
  for (const tool of diff.toolsRemoved) {
    findings.push({
      id: `DRIFT-REMOVED-${tool}`,
      category: 'drift',
      severity: 'critical',
      title: `Tool removed: ${tool}`,
      description: `Tool "${tool}" was removed from the server`,
      tool,
      recommendation: 'Verify this removal was intentional',
    });
  }

  for (const tool of diff.toolsAdded) {
    findings.push({
      id: `DRIFT-ADDED-${tool}`,
      category: 'drift',
      severity: 'info',
      title: `Tool added: ${tool}`,
      description: `New tool "${tool}" was added to the server`,
      tool,
    });
  }

  for (const change of diff.behaviorChanges) {
    const severity =
      change.significance === 'high' ? 'high' :
      change.significance === 'medium' ? 'medium' : 'low';

    findings.push({
      id: `DRIFT-${change.tool}-${change.aspect}`,
      category: change.aspect === 'security' ? 'security' : 'drift',
      severity,
      title: `${change.aspect} changed: ${change.tool}`,
      description: change.description,
      tool: change.tool,
      evidence: [
        change.before ? `Before: ${change.before}` : '',
        change.after ? `After: ${change.after}` : '',
      ].filter(Boolean),
    });

    if (change.aspect === 'security') {
      securityFindingsCount++;
    }
  }

  // Determine pass/fail
  let passed = true;
  let exitCode: number = EXIT_CODES.SUCCESS;

  if (options.failOnDrift && diff.severity !== 'none') {
    passed = false;
    exitCode = EXIT_CODES.FAILURE;
  }

  if (options.failOnSecurity && securityFindingsCount > 0) {
    passed = false;
    exitCode = EXIT_CODES.FAILURE;
  }

  // Breaking changes always fail
  if (diff.severity === 'breaking') {
    passed = false;
    exitCode = EXIT_CODES.FAILURE;
  }

  const summary = diff.summary;

  return {
    passed,
    exitCode,
    diff,
    assertions: [],
    securityFindingsCount,
    summary,
    findings,
  };
}

/**
 * Generate summary for CI check.
 */
function generateCheckSummary(
  result: InterviewResult,
  findings: CIFinding[],
  passed: boolean
): string {
  const toolCount = result.toolProfiles.length;
  const securityCount = findings.filter((f) => f.category === 'security').length;
  const reliabilityCount = findings.filter((f) => f.category === 'reliability').length;

  const status = passed ? 'PASSED' : 'FAILED';

  return (
    `Inquest check ${status}: ` +
    `${toolCount} tool(s) profiled, ` +
    `${securityCount} security finding(s), ` +
    `${reliabilityCount} reliability finding(s)`
  );
}

/**
 * Format CI output for console.
 */
export function formatCIOutput(
  checkResult: CICheckResult,
  options: CIModeOptions = {}
): string {
  const lines: string[] = [];
  const useColors = !options.noColors && !options.isCI;

  const { green, red, yellow, cyan } = useColors ? colors : noColors;

  // Status header
  const statusIcon = checkResult.passed ? green('✓') : red('✗');
  const statusText = checkResult.passed ? green('PASSED') : red('FAILED');
  lines.push(`${statusIcon} Inquest Check ${statusText}`);
  lines.push('');

  // Summary
  lines.push(checkResult.summary);
  lines.push('');

  // Findings by severity
  const critical = checkResult.findings.filter((f) => f.severity === 'critical');
  const high = checkResult.findings.filter((f) => f.severity === 'high');
  const medium = checkResult.findings.filter((f) => f.severity === 'medium');
  const low = checkResult.findings.filter((f) => f.severity === 'low' || f.severity === 'info');

  if (critical.length > 0) {
    lines.push(red(`Critical (${critical.length}):`));
    for (const f of critical) {
      lines.push(`  ${red('!')} ${f.title}`);
    }
    lines.push('');
  }

  if (high.length > 0) {
    lines.push(red(`High (${high.length}):`));
    for (const f of high) {
      lines.push(`  ${red('●')} ${f.title}`);
    }
    lines.push('');
  }

  if (medium.length > 0) {
    lines.push(yellow(`Medium (${medium.length}):`));
    for (const f of medium) {
      lines.push(`  ${yellow('●')} ${f.title}`);
    }
    lines.push('');
  }

  if (low.length > 0 && !options.isCI) {
    lines.push(cyan(`Low/Info (${low.length}):`));
    for (const f of low) {
      lines.push(`  ${cyan('○')} ${f.title}`);
    }
    lines.push('');
  }

  // Exit code info
  lines.push(`Exit code: ${checkResult.exitCode}`);

  return lines.join('\n');
}

// Color utilities
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  reset: '\x1b[0m',
};

const noColors = {
  red: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
  cyan: (s: string) => s,
  bold: (s: string) => s,
  reset: '',
};
