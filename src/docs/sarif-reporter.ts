/**
 * SARIF (Static Analysis Results Interchange Format) reporter.
 * Produces output compatible with GitHub Code Scanning.
 */

import type { InterviewResult } from '../interview/types.js';
import type { BehavioralDiff, CIFinding } from '../baseline/types.js';
import { URLS } from '../constants.js';

/**
 * SARIF schema version.
 */
const SARIF_VERSION = '2.1.0';

/**
 * Bellwether version for SARIF reports.
 * This should match package.json version.
 */
const BELLWETHER_VERSION = '0.2.0';

/**
 * SARIF severity levels.
 */
type SarifLevel = 'none' | 'note' | 'warning' | 'error';

/**
 * SARIF result.
 */
interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: {
    text: string;
  };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation: {
        uri: string;
      };
    };
  }>;
  properties?: Record<string, unknown>;
}

/**
 * SARIF rule definition.
 */
interface SarifRule {
  id: string;
  name: string;
  shortDescription: {
    text: string;
  };
  fullDescription?: {
    text: string;
  };
  defaultConfiguration: {
    level: SarifLevel;
  };
  helpUri?: string;
}

/**
 * SARIF report structure.
 */
interface SarifReport {
  $schema: string;
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules: SarifRule[];
      };
    };
    results: SarifResult[];
    invocations?: Array<{
      executionSuccessful: boolean;
      exitCode?: number;
    }>;
  }>;
}

/**
 * Bellwether rule definitions.
 */
const BELLWETHER_RULES: SarifRule[] = [
  {
    id: 'BELLWETHER-001',
    name: 'SecurityFinding',
    shortDescription: { text: 'Security consideration identified' },
    fullDescription: { text: 'A security-related behavior was observed during tool testing' },
    defaultConfiguration: { level: 'warning' },
    helpUri: `${URLS.DOCS_BASE}#security`,
  },
  {
    id: 'BELLWETHER-002',
    name: 'BehavioralLimitation',
    shortDescription: { text: 'Tool limitation discovered' },
    fullDescription: { text: 'A limitation in tool behavior was identified' },
    defaultConfiguration: { level: 'note' },
    helpUri: `${URLS.DOCS_BASE}#limitations`,
  },
  {
    id: 'BELLWETHER-003',
    name: 'ToolRemoved',
    shortDescription: { text: 'Tool removed from server' },
    fullDescription: { text: 'A tool that existed in the baseline is no longer present' },
    defaultConfiguration: { level: 'error' },
    helpUri: `${URLS.DOCS_BASE}#drift`,
  },
  {
    id: 'BELLWETHER-004',
    name: 'ToolAdded',
    shortDescription: { text: 'New tool added to server' },
    fullDescription: { text: 'A new tool was discovered that was not in the baseline' },
    defaultConfiguration: { level: 'note' },
    helpUri: `${URLS.DOCS_BASE}#drift`,
  },
  {
    id: 'BELLWETHER-005',
    name: 'SchemaChanged',
    shortDescription: { text: 'Tool schema changed' },
    fullDescription: { text: 'The input schema for a tool has changed' },
    defaultConfiguration: { level: 'warning' },
    helpUri: `${URLS.DOCS_BASE}#drift`,
  },
  {
    id: 'BELLWETHER-006',
    name: 'BehaviorChanged',
    shortDescription: { text: 'Tool behavior changed' },
    fullDescription: { text: 'Observable tool behavior differs from baseline' },
    defaultConfiguration: { level: 'warning' },
    helpUri: `${URLS.DOCS_BASE}#drift`,
  },
  {
    id: 'BELLWETHER-007',
    name: 'WorkflowFailed',
    shortDescription: { text: 'Workflow execution failed' },
    fullDescription: { text: 'A workflow that previously succeeded now fails' },
    defaultConfiguration: { level: 'error' },
    helpUri: `${URLS.DOCS_BASE}#workflows`,
  },
];

/**
 * Generate SARIF report from interview results.
 */
export function generateSarifReport(
  result: InterviewResult,
  serverUri: string = 'mcp-server'
): string {
  const results: SarifResult[] = [];

  // Add security findings
  for (const profile of result.toolProfiles) {
    for (const note of profile.securityNotes) {
      results.push({
        ruleId: 'BELLWETHER-001',
        level: 'warning',
        message: { text: `${profile.name}: ${note}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: serverUri },
            },
          },
        ],
        properties: {
          tool: profile.name,
          category: 'security',
        },
      });
    }
  }

  // Add limitations
  for (const profile of result.toolProfiles) {
    for (const limitation of profile.limitations) {
      results.push({
        ruleId: 'BELLWETHER-002',
        level: 'note',
        message: { text: `${profile.name}: ${limitation}` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: serverUri },
            },
          },
        ],
        properties: {
          tool: profile.name,
          category: 'limitation',
        },
      });
    }
  }

  // Add workflow failures
  if (result.workflowResults) {
    for (const wr of result.workflowResults) {
      if (!wr.success) {
        results.push({
          ruleId: 'BELLWETHER-007',
          level: 'error',
          message: {
            text: `Workflow "${wr.workflow.name}" failed: ${wr.failureReason || 'Unknown error'}`,
          },
          properties: {
            workflow: wr.workflow.id,
            category: 'workflow',
          },
        });
      }
    }
  }

  const report: SarifReport = {
    $schema: URLS.SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'Bellwether',
            version: BELLWETHER_VERSION,
            informationUri: URLS.DOCS_BASE,
            rules: BELLWETHER_RULES,
          },
        },
        results,
        invocations: [
          {
            executionSuccessful: true,
          },
        ],
      },
    ],
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Generate SARIF report from behavioral diff.
 */
export function generateSarifFromDiff(
  diff: BehavioralDiff,
  serverUri: string = 'mcp-server'
): string {
  const results: SarifResult[] = [];

  // Removed tools
  for (const tool of diff.toolsRemoved) {
    results.push({
      ruleId: 'BELLWETHER-003',
      level: 'error',
      message: { text: `Tool "${tool}" was removed from the server` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: serverUri },
          },
        },
      ],
      properties: {
        tool,
        category: 'drift',
      },
    });
  }

  // Added tools
  for (const tool of diff.toolsAdded) {
    results.push({
      ruleId: 'BELLWETHER-004',
      level: 'note',
      message: { text: `New tool "${tool}" was added to the server` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: serverUri },
          },
        },
      ],
      properties: {
        tool,
        category: 'drift',
      },
    });
  }

  // Modified tools
  for (const toolDiff of diff.toolsModified) {
    if (toolDiff.schemaChanged) {
      results.push({
        ruleId: 'BELLWETHER-005',
        level: 'warning',
        message: { text: `Schema changed for tool "${toolDiff.tool}"` },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: serverUri },
            },
          },
        ],
        properties: {
          tool: toolDiff.tool,
          category: 'drift',
        },
      });
    }

    for (const change of toolDiff.changes) {
      const level: SarifLevel =
        change.significance === 'high' ? 'error' :
        change.significance === 'medium' ? 'warning' : 'note';

      results.push({
        ruleId: 'BELLWETHER-006',
        level,
        message: { text: change.description },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: serverUri },
            },
          },
        ],
        properties: {
          tool: change.tool,
          aspect: change.aspect,
          significance: change.significance,
          category: 'drift',
        },
      });
    }
  }

  const report: SarifReport = {
    $schema: URLS.SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'Bellwether',
            version: BELLWETHER_VERSION,
            informationUri: URLS.DOCS_BASE,
            rules: BELLWETHER_RULES,
          },
        },
        results,
        invocations: [
          {
            executionSuccessful: diff.severity !== 'breaking',
            exitCode: diff.severity === 'breaking' ? 1 : 0,
          },
        ],
      },
    ],
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Generate SARIF from CI findings.
 */
export function generateSarifFromFindings(
  findings: CIFinding[],
  serverUri: string = 'mcp-server'
): string {
  const results: SarifResult[] = findings.map((finding) => {
    const level: SarifLevel =
      finding.severity === 'critical' || finding.severity === 'high' ? 'error' :
      finding.severity === 'medium' ? 'warning' : 'note';

    const ruleId = findingCategoryToRuleId(finding.category);

    return {
      ruleId,
      level,
      message: { text: finding.description },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: serverUri },
          },
        },
      ],
      properties: {
        findingId: finding.id,
        category: finding.category,
        severity: finding.severity,
        tool: finding.tool,
        recommendation: finding.recommendation,
      },
    };
  });

  const report: SarifReport = {
    $schema: URLS.SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'Bellwether',
            version: BELLWETHER_VERSION,
            informationUri: URLS.DOCS_BASE,
            rules: BELLWETHER_RULES,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Map finding category to SARIF rule ID.
 */
function findingCategoryToRuleId(category: CIFinding['category']): string {
  switch (category) {
    case 'security':
      return 'BELLWETHER-001';
    case 'reliability':
      return 'BELLWETHER-002';
    case 'drift':
      return 'BELLWETHER-006';
    case 'behavior':
    default:
      return 'BELLWETHER-002';
  }
}
