import {
  formatDiffText,
  formatDiffJson,
  formatDiffCompact,
  formatDiffGitHubActions,
  formatDiffMarkdown,
  formatDiffJUnit,
  formatDiffSarif,
  getToolFingerprints,
  type BehavioralDiff,
  type BehavioralBaseline,
} from '../../baseline/index.js';

/**
 * Format a diff using the requested output format.
 */
export function formatDiffOutput(diff: BehavioralDiff, format: string, baselinePath: string): string {
  switch (format.toLowerCase()) {
    case 'json':
      return formatDiffJson(diff);
    case 'compact':
      return formatDiffCompact(diff);
    case 'github':
      return formatDiffGitHubActions(diff);
    case 'markdown':
    case 'md':
      return formatDiffMarkdown(diff);
    case 'junit':
    case 'junit-xml':
    case 'xml':
      return formatDiffJUnit(diff, 'bellwether-check');
    case 'sarif':
      return formatDiffSarif(diff, baselinePath);
    case 'text':
    default:
      return formatDiffText(diff);
  }
}

/**
 * Format check-only output when no baseline is provided.
 */
export function formatCheckResults(baseline: BehavioralBaseline, format: string): string | null {
  switch (format.toLowerCase()) {
    case 'junit':
    case 'junit-xml':
    case 'xml':
      return formatCheckResultsJUnit(baseline);
    case 'sarif':
      return formatCheckResultsSarif(baseline);
    default:
      return null;
  }
}

function formatCheckResultsJUnit(baseline: BehavioralBaseline): string {
  const tools = getToolFingerprints(baseline);
  const lines: string[] = [];
  const securityFailures = tools.filter((t) =>
    t.securityFingerprint?.findings?.some(
      (f) => f.riskLevel === 'critical' || f.riskLevel === 'high'
    )
  ).length;

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<testsuites>');
  lines.push(
    `  <testsuite name="bellwether-check" tests="${tools.length}" failures="${securityFailures}" errors="0">`
  );

  for (const tool of tools) {
    const successRate = tool.baselineSuccessRate ?? 1;
    const status = successRate >= 0.9 ? 'passed' : 'warning';
    lines.push(`    <testcase name="${tool.name}" classname="mcp-tools" time="0">`);
    lines.push(`      <system-out>Success rate: ${(successRate * 100).toFixed(0)}%</system-out>`);
    if (status === 'warning') {
      lines.push('      <system-err>Tool has success rate below 90%</system-err>');
    }
    lines.push('    </testcase>');
  }

  const securityTools = tools.filter((t) => t.securityFingerprint?.findings?.length);
  if (securityTools.length > 0) {
    lines.push('    <!-- Security findings -->');
    for (const tool of securityTools) {
      const findings = tool.securityFingerprint?.findings ?? [];
      const criticalHigh = findings.filter(
        (f) => f.riskLevel === 'critical' || f.riskLevel === 'high'
      ).length;
      if (criticalHigh > 0) {
        lines.push(`    <testcase name="${tool.name}-security" classname="security">`);
        lines.push(`      <failure message="${criticalHigh} critical/high security findings">`);
        for (const finding of findings.filter(
          (f) => f.riskLevel === 'critical' || f.riskLevel === 'high'
        )) {
          lines.push(
            `        ${finding.riskLevel.toUpperCase()}: ${finding.title} (${finding.cweId})`
          );
        }
        lines.push('      </failure>');
        lines.push('    </testcase>');
      }
    }
  }

  lines.push('  </testsuite>');
  lines.push('</testsuites>');
  return lines.join('\n');
}

function formatCheckResultsSarif(baseline: BehavioralBaseline): string {
  const tools = getToolFingerprints(baseline);
  const serverUri = baseline.metadata?.serverCommand || baseline.server.name || 'mcp-server';
  const results: Array<{
    ruleId: string;
    level: 'note' | 'warning' | 'error';
    message: { text: string };
    locations: Array<{
      physicalLocation: {
        artifactLocation: { uri: string };
        region: { startLine: number };
      };
    }>;
  }> = [];

  const securityTools = tools.filter((t) => t.securityFingerprint?.findings?.length);
  for (const tool of securityTools) {
    const findings = tool.securityFingerprint?.findings ?? [];
    for (const finding of findings) {
      const level =
        finding.riskLevel === 'critical' || finding.riskLevel === 'high'
          ? ('error' as const)
          : finding.riskLevel === 'medium'
            ? ('warning' as const)
            : ('note' as const);

      results.push({
        ruleId: finding.cweId || 'BWH-SEC',
        level,
        message: { text: `[${tool.name}] ${finding.title}: ${finding.description}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: serverUri },
              region: { startLine: 1 },
            },
          },
        ],
      });
    }
  }

  for (const tool of tools) {
    const successRate = tool.baselineSuccessRate ?? 1;
    if (successRate < 0.9) {
      results.push({
        ruleId: 'BWH-REL',
        level: 'warning',
        message: {
          text: `Tool "${tool.name}" has ${(successRate * 100).toFixed(0)}% success rate`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: serverUri },
              region: { startLine: 1 },
            },
          },
        ],
      });
    }
  }

  const sarif = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'bellwether',
            version: '1.0.0',
            informationUri: 'https://github.com/dotsetlabs/bellwether',
            rules: [
              {
                id: 'BWH-SEC',
                name: 'SecurityFinding',
                shortDescription: { text: 'Security vulnerability detected' },
                defaultConfiguration: { level: 'warning' },
              },
              {
                id: 'BWH-REL',
                name: 'LowReliability',
                shortDescription: { text: 'Tool reliability below threshold' },
                defaultConfiguration: { level: 'warning' },
              },
            ],
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
