/**
 * Structural comparison for drift detection.
 *
 * Compares baselines using deterministic structural comparison:
 * - Tool presence/absence
 * - Schema changes (hash comparison)
 * - Description changes (exact string comparison)
 * - Workflow success/failure changes
 *
 * All comparisons are 100% deterministic - no LLM involvement.
 */

import type { InterviewResult } from '../interview/types.js';
import type {
  BehavioralBaseline,
  BehavioralDiff,
  ToolDiff,
  BehaviorChange,
  BehaviorAspect,
  CompareOptions,
  ChangeSeverity,
  ToolFingerprint,
  VersionCompatibilityInfo,
  SeverityConfig,
} from './types.js';
import type {
  BaselineServerFingerprint,
  PromptCapability,
  ResourceCapability,
  ResourceTemplateCapability,
} from './baseline-format.js';
import { createBaseline } from './saver.js';
import { getToolFingerprints } from './accessors.js';
import { compareFingerprints, compareErrorPatterns } from './response-fingerprint.js';
import { analyzeErrorTrends } from './error-analyzer.js';
import type { ErrorTrendReport } from './types.js';
import { compareSecurityFingerprints } from '../security/security-tester.js';
import type { SecurityDiff, SecurityFinding } from '../security/types.js';
import { compareSchemaEvolution } from './response-schema-tracker.js';
import type { SchemaEvolutionReport, SchemaEvolutionIssue, SchemaEvolutionDiff } from './types.js';
import {
  checkVersionCompatibility,
  BaselineVersionError,
  parseVersion,
  areVersionsCompatible,
  getCompatibilityWarning,
} from './version.js';
import { compareSchemas, computeSchemaHash } from './schema-compare.js';
import { PERFORMANCE_TRACKING } from '../constants.js';
import { getSharedFeatureFlags, type MCPFeatureFlags } from '../protocol/index.js';
import type {
  PerformanceRegressionReport,
  PerformanceRegression,
  PerformanceConfidenceChange,
  DocumentationScoreChange,
} from './types.js';
import { hasReliableConfidence } from './performance-tracker.js';
import { compareDocumentationScores, scoreDocumentation } from './documentation-scorer.js';

/**
 * Compare current interview results against a baseline.
 */
export function compareWithBaseline(
  baseline: BehavioralBaseline,
  current: InterviewResult,
  serverCommand: string,
  options: CompareOptions = {}
): BehavioralDiff {
  const currentBaseline = createBaseline(current, serverCommand);
  return compareBaselines(baseline, currentBaseline, options);
}

/**
 * Compare two baselines directly.
 * All changes are structural and deterministic.
 *
 * @param previous - The baseline to compare against (source/old)
 * @param current - The current baseline (target/new)
 * @param options - Comparison options
 * @returns Diff result including version compatibility information
 * @throws BaselineVersionError if versions are incompatible and ignoreVersionMismatch is false
 */
export function compareBaselines(
  previous: BehavioralBaseline,
  current: BehavioralBaseline,
  options: CompareOptions = {}
): BehavioralDiff {
  // Check version compatibility
  const v1 = parseVersion(previous.version);
  const v2 = parseVersion(current.version);
  const versionCompatibility: VersionCompatibilityInfo = {
    compatible: areVersionsCompatible(v1, v2),
    warning: getCompatibilityWarning(v1, v2),
    sourceVersion: v1.raw,
    targetVersion: v2.raw,
  };

  // Throw error if versions are incompatible (unless ignored)
  if (!versionCompatibility.compatible && !options.ignoreVersionMismatch) {
    throw new BaselineVersionError(
      `Cannot compare baselines with incompatible format versions: v${v1.raw} vs v${v2.raw}. ` +
        `Recreate the older baseline with the current CLI version, ` +
        `or use --ignore-version-mismatch to force comparison (results may be incorrect).`,
      v1.raw,
      v2.raw
    );
  }

  // Compute shared feature flags from both baselines' protocol versions
  const sharedFeatures = getSharedFeatureFlags(
    previous.server.protocolVersion,
    current.server.protocolVersion
  );

  const previousTools = getToolFingerprints(previous);
  const currentTools = getToolFingerprints(current);
  const previousToolMap = new Map(previousTools.map((t) => [t.name, t]));
  const currentToolMap = new Map(currentTools.map((t) => [t.name, t]));

  const toolsAdded: string[] = [];
  const toolsRemoved: string[] = [];
  const toolsModified: ToolDiff[] = [];
  const behaviorChanges: BehaviorChange[] = [];

  // Check for removed tools
  for (const [name] of previousToolMap) {
    if (!currentToolMap.has(name)) {
      if (!options.tools || options.tools.length === 0 || options.tools.includes(name)) {
        toolsRemoved.push(name);
      }
    }
  }

  // Check for added tools and modifications
  for (const [name, currentTool] of currentToolMap) {
    if (options.tools && options.tools.length > 0 && !options.tools.includes(name)) {
      continue;
    }

    const previousTool = previousToolMap.get(name);

    if (!previousTool) {
      toolsAdded.push(name);
      continue;
    }

    const toolDiff = compareTool(previousTool, currentTool, options, sharedFeatures);

    if (
      toolDiff.changes.length > 0 ||
      toolDiff.schemaChanged ||
      toolDiff.descriptionChanged ||
      toolDiff.securityChanged ||
      toolDiff.responseSchemaEvolutionChanged
    ) {
      toolsModified.push(toolDiff);
      behaviorChanges.push(...toolDiff.changes);
    }
  }

  // Compare prompts, resources, and resource templates
  behaviorChanges.push(
    ...comparePrompts(previous.capabilities.prompts, current.capabilities.prompts, sharedFeatures)
  );
  behaviorChanges.push(
    ...compareResources(
      previous.capabilities.resources,
      current.capabilities.resources,
      sharedFeatures
    )
  );
  behaviorChanges.push(
    ...compareResourceTemplates(
      previous.capabilities.resourceTemplates,
      current.capabilities.resourceTemplates,
      sharedFeatures
    )
  );

  // Compare server metadata and capabilities
  behaviorChanges.push(...compareServerInfo(previous.server, current.server, sharedFeatures));

  // Compare workflows
  const workflowChanges = compareWorkflows(previous.workflows || [], current.workflows || []);
  behaviorChanges.push(...workflowChanges);

  const { severity, breakingCount, warningCount, infoCount } = calculateSeverity(
    toolsAdded,
    toolsRemoved,
    behaviorChanges
  );

  const summary = generateSummary(
    toolsAdded,
    toolsRemoved,
    toolsModified,
    behaviorChanges,
    severity
  );

  // Generate performance regression report if performance data is available
  const performanceReport = comparePerformanceData(
    previousTools,
    currentTools,
    options.performanceThreshold ?? PERFORMANCE_TRACKING.DEFAULT_REGRESSION_THRESHOLD
  );

  // Generate security diff report if security testing was performed
  const securityReport = compareSecurityData(
    previousTools,
    currentTools,
    options.ignoreSecurityChanges ?? false
  );

  // Generate schema evolution report if schema evolution data is available
  const schemaEvolutionReport = generateSchemaEvolutionReport(
    toolsModified,
    previousTools,
    currentTools
  );

  // Generate error trend report if error pattern data is available
  const errorTrendReport = generateErrorTrendReport(
    previousTools,
    currentTools,
    options.ignoreErrorPatternChanges ?? false
  );

  // Generate documentation score comparison if documentation scores are available
  const documentationScoreReport = compareDocumentationData(previous, current);

  return {
    toolsAdded,
    toolsRemoved,
    toolsModified,
    behaviorChanges,
    severity,
    breakingCount,
    warningCount,
    infoCount,
    summary,
    versionCompatibility,
    performanceReport,
    securityReport,
    schemaEvolutionReport,
    errorTrendReport,
    documentationScoreReport,
  };
}

function compareTool(
  previous: ToolFingerprint,
  current: ToolFingerprint,
  options: CompareOptions,
  features: MCPFeatureFlags
): ToolDiff {
  const changes: BehaviorChange[] = [];
  let schemaChanged = false;
  let descriptionChanged = false;
  let responseStructureChanged = false;
  let errorPatternsChanged = false;
  let responseSchemaEvolutionChanged = false;
  let securityChanged = false;
  let schemaEvolutionDiff: SchemaEvolutionDiff | undefined;

  // Compare input schema with detailed diff (declared schema hash)
  const previousDeclaredHash = getDeclaredSchemaHash(previous);
  const currentDeclaredHash = getDeclaredSchemaHash(current);

  if (previousDeclaredHash !== currentDeclaredHash && !options.ignoreSchemaChanges) {
    schemaChanged = true;

    // Get detailed schema comparison if inputSchema is available on both
    const schemaComparison = compareSchemas(
      previous.inputSchema as Parameters<typeof compareSchemas>[0],
      current.inputSchema as Parameters<typeof compareSchemas>[0]
    );

    if (schemaComparison.changes.length > 0) {
      // Add individual schema changes with proper severity
      for (const schemaChange of schemaComparison.changes) {
        changes.push({
          tool: current.name,
          aspect: 'schema',
          before: formatSchemaChangeValue(schemaChange.before),
          after: formatSchemaChangeValue(schemaChange.after),
          severity: schemaChange.breaking ? 'breaking' : 'warning',
          description: `${schemaChange.path}: ${schemaChange.description}`,
        });
      }
    } else {
      // Fallback to hash comparison if no detailed changes detected
      // (can happen if inputSchema is missing on one or both sides)
      changes.push({
        tool: current.name,
        aspect: 'schema',
        before: `Schema hash: ${previousDeclaredHash}`,
        after: `Schema hash: ${currentDeclaredHash}`,
        severity: 'breaking',
        description: `Schema for ${current.name} has changed`,
      });
    }
  }

  // Compare description
  if (previous.description !== current.description && !options.ignoreDescriptionChanges) {
    descriptionChanged = true;
    changes.push({
      tool: current.name,
      aspect: 'description',
      before: previous.description,
      after: current.description,
      severity: 'info',
      description: `Description for ${current.name} has changed`,
    });
  }

  // Compare response structure fingerprints (check mode enhancement)
  if (!options.ignoreResponseStructureChanges) {
    const fingerprintDiff = compareFingerprints(
      previous.responseFingerprint,
      current.responseFingerprint
    );

    if (!fingerprintDiff.identical) {
      responseStructureChanged = true;

      for (const change of fingerprintDiff.changes) {
        changes.push({
          tool: current.name,
          aspect: 'response_structure',
          before: change.before,
          after: change.after,
          severity: change.breaking ? 'breaking' : 'warning',
          description: change.description,
        });
      }
    }
  }

  // Compare error patterns (check mode enhancement)
  if (!options.ignoreErrorPatternChanges) {
    const errorDiff = compareErrorPatterns(previous.errorPatterns, current.errorPatterns);

    if (errorDiff.behaviorChanged) {
      errorPatternsChanged = true;

      for (const added of errorDiff.added) {
        changes.push({
          tool: current.name,
          aspect: 'error_pattern',
          before: 'none',
          after: `${added.category}: ${added.example.slice(0, 50)}...`,
          severity: 'warning',
          description: `New error pattern detected: ${added.category}`,
        });
      }

      for (const removed of errorDiff.removed) {
        changes.push({
          tool: current.name,
          aspect: 'error_pattern',
          before: `${removed.category}: ${removed.example.slice(0, 50)}...`,
          after: 'none',
          severity: 'info',
          description: `Error pattern no longer occurs: ${removed.category}`,
        });
      }
    }
  }

  // Compare response schema evolution (check mode enhancement)
  if (!options.ignoreResponseStructureChanges) {
    schemaEvolutionDiff = compareSchemaEvolution(
      previous.responseSchemaEvolution,
      current.responseSchemaEvolution
    );

    if (schemaEvolutionDiff.structureChanged) {
      responseSchemaEvolutionChanged = true;

      // Add changes for removed fields (breaking)
      if (schemaEvolutionDiff.fieldsRemoved.length > 0) {
        changes.push({
          tool: current.name,
          aspect: 'response_schema_evolution',
          before: schemaEvolutionDiff.fieldsRemoved.join(', '),
          after: 'removed',
          severity: 'breaking',
          description: `Response fields removed: ${schemaEvolutionDiff.fieldsRemoved.join(', ')}`,
        });
      }

      // Add changes for added fields (non-breaking)
      if (schemaEvolutionDiff.fieldsAdded.length > 0) {
        changes.push({
          tool: current.name,
          aspect: 'response_schema_evolution',
          before: 'none',
          after: schemaEvolutionDiff.fieldsAdded.join(', '),
          severity: 'info',
          description: `Response fields added: ${schemaEvolutionDiff.fieldsAdded.join(', ')}`,
        });
      }

      // Add changes for type changes
      for (const typeChange of schemaEvolutionDiff.typeChanges) {
        changes.push({
          tool: current.name,
          aspect: 'response_schema_evolution',
          before: typeChange.previousType,
          after: typeChange.currentType,
          severity: typeChange.backwardCompatible ? 'warning' : 'breaking',
          description: `Response field "${typeChange.field}" type changed: ${typeChange.previousType} → ${typeChange.currentType}`,
        });
      }

      // Add changes for new required fields (breaking)
      if (schemaEvolutionDiff.newRequired.length > 0) {
        changes.push({
          tool: current.name,
          aspect: 'response_schema_evolution',
          before: 'optional',
          after: 'required',
          severity: 'breaking',
          description: `Response fields now required: ${schemaEvolutionDiff.newRequired.join(', ')}`,
        });
      }
    }
  }

  // Compare security fingerprints (check mode --security flag)
  if (!options.ignoreSecurityChanges) {
    const securityDiff = compareSecurityFingerprints(
      previous.securityFingerprint,
      current.securityFingerprint
    );

    if (securityDiff.newFindings.length > 0 || securityDiff.resolvedFindings.length > 0) {
      securityChanged = true;

      // Add changes for new security findings (security degradation)
      for (const finding of securityDiff.newFindings) {
        changes.push({
          tool: current.name,
          aspect: 'security',
          before: 'no finding',
          after: `${finding.riskLevel}: ${finding.title}`,
          severity:
            finding.riskLevel === 'critical' || finding.riskLevel === 'high'
              ? 'breaking'
              : finding.riskLevel === 'medium'
                ? 'warning'
                : 'info',
          description: `New security finding: ${finding.title} (${finding.cweId})`,
        });
      }

      // Add changes for resolved security findings (security improvement)
      for (const finding of securityDiff.resolvedFindings) {
        changes.push({
          tool: current.name,
          aspect: 'security',
          before: `${finding.riskLevel}: ${finding.title}`,
          after: 'resolved',
          severity: 'info',
          description: `Security finding resolved: ${finding.title} (${finding.cweId})`,
        });
      }
    }
  }

  // Compare tool title — only when both versions support entity titles
  if (features.entityTitles) {
    if (
      previous.title !== current.title &&
      (previous.title !== undefined || current.title !== undefined)
    ) {
      changes.push({
        tool: current.name,
        aspect: 'tool_annotations',
        before: previous.title ?? 'none',
        after: current.title ?? 'none',
        severity: 'info',
        description: `Tool "${current.name}" title changed`,
      });
    }
  }

  // Compare tool annotations — only when both versions support them
  if (features.toolAnnotations) {
    // Compare annotations
    const prevAnno = previous.annotations;
    const currAnno = current.annotations;

    if (prevAnno || currAnno) {
      if (prevAnno?.readOnlyHint !== currAnno?.readOnlyHint) {
        // readOnlyHint changing (e.g., tool becoming non-read-only) is breaking
        changes.push({
          tool: current.name,
          aspect: 'tool_annotations',
          before: String(prevAnno?.readOnlyHint ?? 'unset'),
          after: String(currAnno?.readOnlyHint ?? 'unset'),
          severity: 'breaking',
          description: `Tool "${current.name}" readOnlyHint changed`,
        });
      }
      if (prevAnno?.destructiveHint !== currAnno?.destructiveHint) {
        changes.push({
          tool: current.name,
          aspect: 'tool_annotations',
          before: String(prevAnno?.destructiveHint ?? 'unset'),
          after: String(currAnno?.destructiveHint ?? 'unset'),
          severity: 'warning',
          description: `Tool "${current.name}" destructiveHint changed`,
        });
      }
      if (prevAnno?.idempotentHint !== currAnno?.idempotentHint) {
        changes.push({
          tool: current.name,
          aspect: 'tool_annotations',
          before: String(prevAnno?.idempotentHint ?? 'unset'),
          after: String(currAnno?.idempotentHint ?? 'unset'),
          severity: 'warning',
          description: `Tool "${current.name}" idempotentHint changed`,
        });
      }
      if (prevAnno?.openWorldHint !== currAnno?.openWorldHint) {
        changes.push({
          tool: current.name,
          aspect: 'tool_annotations',
          before: String(prevAnno?.openWorldHint ?? 'unset'),
          after: String(currAnno?.openWorldHint ?? 'unset'),
          severity: 'info',
          description: `Tool "${current.name}" openWorldHint changed`,
        });
      }
    }
  }

  // Compare output schema — only when both versions support structured output
  if (features.structuredOutput && previous.outputSchemaHash !== current.outputSchemaHash) {
    if (!previous.outputSchemaHash && current.outputSchemaHash) {
      changes.push({
        tool: current.name,
        aspect: 'output_schema',
        before: 'none',
        after: `outputSchema: ${current.outputSchemaHash}`,
        severity: 'warning',
        description: `Tool "${current.name}" outputSchema added`,
      });
    } else if (previous.outputSchemaHash && !current.outputSchemaHash) {
      changes.push({
        tool: current.name,
        aspect: 'output_schema',
        before: `outputSchema: ${previous.outputSchemaHash}`,
        after: 'none',
        severity: 'warning',
        description: `Tool "${current.name}" outputSchema removed`,
      });
    } else {
      changes.push({
        tool: current.name,
        aspect: 'output_schema',
        before: `outputSchema: ${previous.outputSchemaHash}`,
        after: `outputSchema: ${current.outputSchemaHash}`,
        severity: 'breaking',
        description: `Tool "${current.name}" outputSchema changed`,
      });
    }
  }

  // Compare execution/task support — only when both versions support tasks
  if (features.tasks) {
    const prevExec = previous.execution?.taskSupport;
    const currExec = current.execution?.taskSupport;
    if (prevExec !== currExec && (prevExec !== undefined || currExec !== undefined)) {
      changes.push({
        tool: current.name,
        aspect: 'tool_annotations',
        before: prevExec ?? 'none',
        after: currExec ?? 'none',
        severity: 'warning',
        description: `Tool "${current.name}" task support changed`,
      });
    }
  }

  return {
    tool: current.name,
    changes,
    schemaChanged,
    descriptionChanged,
    responseStructureChanged,
    errorPatternsChanged,
    responseSchemaEvolutionChanged,
    securityChanged,
    schemaEvolutionDiff,
  };
}

function comparePrompts(
  previous: PromptCapability[] | undefined,
  current: PromptCapability[] | undefined,
  features?: MCPFeatureFlags
): BehaviorChange[] {
  const changes: BehaviorChange[] = [];
  const prevMap = new Map((previous ?? []).map((p) => [p.name, p]));
  const currMap = new Map((current ?? []).map((p) => [p.name, p]));

  for (const [name, currPrompt] of currMap) {
    const prevPrompt = prevMap.get(name);
    if (!prevPrompt) {
      changes.push({
        tool: `prompt:${name}`,
        aspect: 'prompt',
        before: 'absent',
        after: 'present',
        severity: 'info',
        description: `Prompt "${name}" added`,
      });
      continue;
    }

    if (prevPrompt.description !== currPrompt.description) {
      changes.push({
        tool: `prompt:${name}`,
        aspect: 'prompt',
        before: prevPrompt.description ?? 'none',
        after: currPrompt.description ?? 'none',
        severity: 'info',
        description: `Prompt "${name}" description changed`,
      });
    }

    if (
      features?.entityTitles &&
      prevPrompt.title !== currPrompt.title &&
      (prevPrompt.title !== undefined || currPrompt.title !== undefined)
    ) {
      changes.push({
        tool: `prompt:${name}`,
        aspect: 'prompt',
        before: prevPrompt.title ?? 'none',
        after: currPrompt.title ?? 'none',
        severity: 'info',
        description: `Prompt "${name}" title changed`,
      });
    }

    const prevArgs = prevPrompt.arguments ?? [];
    const currArgs = currPrompt.arguments ?? [];
    const prevArgMap = new Map(prevArgs.map((a) => [a.name, a]));
    const currArgMap = new Map(currArgs.map((a) => [a.name, a]));

    for (const [argName, currArg] of currArgMap) {
      const prevArg = prevArgMap.get(argName);
      if (!prevArg) {
        changes.push({
          tool: `prompt:${name}`,
          aspect: 'prompt',
          before: 'absent',
          after: 'present',
          severity: currArg.required ? 'breaking' : 'info',
          description: `Prompt "${name}" argument "${argName}" added`,
        });
        continue;
      }

      if (prevArg.required !== currArg.required) {
        changes.push({
          tool: `prompt:${name}`,
          aspect: 'prompt',
          before: String(prevArg.required ?? false),
          after: String(currArg.required ?? false),
          severity: currArg.required ? 'breaking' : 'warning',
          description: `Prompt "${name}" argument "${argName}" requirement changed`,
        });
      }

      if (prevArg.description !== currArg.description) {
        changes.push({
          tool: `prompt:${name}`,
          aspect: 'prompt',
          before: prevArg.description ?? 'none',
          after: currArg.description ?? 'none',
          severity: 'info',
          description: `Prompt "${name}" argument "${argName}" description changed`,
        });
      }
    }

    for (const [argName] of prevArgMap) {
      if (!currArgMap.has(argName)) {
        changes.push({
          tool: `prompt:${name}`,
          aspect: 'prompt',
          before: 'present',
          after: 'absent',
          severity: 'breaking',
          description: `Prompt "${name}" argument "${argName}" removed`,
        });
      }
    }
  }

  for (const [name] of prevMap) {
    if (!currMap.has(name)) {
      changes.push({
        tool: `prompt:${name}`,
        aspect: 'prompt',
        before: 'present',
        after: 'absent',
        severity: 'breaking',
        description: `Prompt "${name}" removed`,
      });
    }
  }

  return changes;
}

function compareResources(
  previous: ResourceCapability[] | undefined,
  current: ResourceCapability[] | undefined,
  features?: MCPFeatureFlags
): BehaviorChange[] {
  const changes: BehaviorChange[] = [];
  const prevMap = new Map((previous ?? []).map((r) => [r.uri, r]));
  const currMap = new Map((current ?? []).map((r) => [r.uri, r]));

  for (const [uri, currResource] of currMap) {
    const prevResource = prevMap.get(uri);
    if (!prevResource) {
      changes.push({
        tool: `resource:${currResource.name ?? uri}`,
        aspect: 'resource',
        before: 'absent',
        after: 'present',
        severity: 'info',
        description: `Resource "${uri}" added`,
      });
      continue;
    }

    if (prevResource.name !== currResource.name) {
      changes.push({
        tool: `resource:${currResource.name ?? uri}`,
        aspect: 'resource',
        before: prevResource.name ?? 'none',
        after: currResource.name ?? 'none',
        severity: 'info',
        description: `Resource "${uri}" name changed`,
      });
    }

    if (prevResource.description !== currResource.description) {
      changes.push({
        tool: `resource:${currResource.name ?? uri}`,
        aspect: 'resource',
        before: prevResource.description ?? 'none',
        after: currResource.description ?? 'none',
        severity: 'info',
        description: `Resource "${uri}" description changed`,
      });
    }

    if (prevResource.mimeType !== currResource.mimeType) {
      changes.push({
        tool: `resource:${currResource.name ?? uri}`,
        aspect: 'resource',
        before: prevResource.mimeType ?? 'none',
        after: currResource.mimeType ?? 'none',
        severity: 'warning',
        description: `Resource "${uri}" mime type changed`,
      });
    }

    // Compare resource title — only when both versions support entity titles
    if (
      features?.entityTitles &&
      prevResource.title !== currResource.title &&
      (prevResource.title !== undefined || currResource.title !== undefined)
    ) {
      changes.push({
        tool: `resource:${currResource.name ?? uri}`,
        aspect: 'resource',
        before: prevResource.title ?? 'none',
        after: currResource.title ?? 'none',
        severity: 'info',
        description: `Resource "${uri}" title changed`,
      });
    }

    // Compare resource annotations — only when both versions support them
    if (features?.resourceAnnotations) {
      const prevAudience = prevResource.annotations?.audience?.join(',');
      const currAudience = currResource.annotations?.audience?.join(',');
      if (prevAudience !== currAudience && (prevAudience || currAudience)) {
        changes.push({
          tool: `resource:${currResource.name ?? uri}`,
          aspect: 'resource_annotations',
          before: prevAudience ?? 'none',
          after: currAudience ?? 'none',
          severity: 'warning',
          description: `Resource "${uri}" audience annotation changed`,
        });
      }

      if (
        prevResource.size !== currResource.size &&
        (prevResource.size !== undefined || currResource.size !== undefined)
      ) {
        changes.push({
          tool: `resource:${currResource.name ?? uri}`,
          aspect: 'resource_annotations',
          before: prevResource.size !== undefined ? String(prevResource.size) : 'unknown',
          after: currResource.size !== undefined ? String(currResource.size) : 'unknown',
          severity: 'info',
          description: `Resource "${uri}" size changed`,
        });
      }
    }
  }

  for (const [uri, prevResource] of prevMap) {
    if (!currMap.has(uri)) {
      changes.push({
        tool: `resource:${prevResource.name ?? uri}`,
        aspect: 'resource',
        before: 'present',
        after: 'absent',
        severity: 'breaking',
        description: `Resource "${uri}" removed`,
      });
    }
  }

  return changes;
}

function compareResourceTemplates(
  previous: ResourceTemplateCapability[] | undefined,
  current: ResourceTemplateCapability[] | undefined,
  features?: MCPFeatureFlags
): BehaviorChange[] {
  const changes: BehaviorChange[] = [];
  const prevMap = new Map((previous ?? []).map((t) => [t.uriTemplate, t]));
  const currMap = new Map((current ?? []).map((t) => [t.uriTemplate, t]));

  for (const [uriTemplate, currTemplate] of currMap) {
    const prevTemplate = prevMap.get(uriTemplate);
    if (!prevTemplate) {
      changes.push({
        tool: `resource_template:${currTemplate.name ?? uriTemplate}`,
        aspect: 'resource_template',
        before: 'absent',
        after: 'present',
        severity: 'info',
        description: `Resource template "${uriTemplate}" added`,
      });
      continue;
    }

    if (prevTemplate.description !== currTemplate.description) {
      changes.push({
        tool: `resource_template:${currTemplate.name ?? uriTemplate}`,
        aspect: 'resource_template',
        before: prevTemplate.description ?? 'none',
        after: currTemplate.description ?? 'none',
        severity: 'info',
        description: `Resource template "${uriTemplate}" description changed`,
      });
    }

    if (prevTemplate.mimeType !== currTemplate.mimeType) {
      changes.push({
        tool: `resource_template:${currTemplate.name ?? uriTemplate}`,
        aspect: 'resource_template',
        before: prevTemplate.mimeType ?? 'none',
        after: currTemplate.mimeType ?? 'none',
        severity: 'info',
        description: `Resource template "${uriTemplate}" mime type changed`,
      });
    }

    if (
      features?.entityTitles &&
      prevTemplate.title !== currTemplate.title &&
      (prevTemplate.title !== undefined || currTemplate.title !== undefined)
    ) {
      changes.push({
        tool: `resource_template:${currTemplate.name ?? uriTemplate}`,
        aspect: 'resource_template',
        before: prevTemplate.title ?? 'none',
        after: currTemplate.title ?? 'none',
        severity: 'info',
        description: `Resource template "${uriTemplate}" title changed`,
      });
    }
  }

  for (const [uriTemplate, prevTemplate] of prevMap) {
    if (!currMap.has(uriTemplate)) {
      changes.push({
        tool: `resource_template:${prevTemplate.name ?? uriTemplate}`,
        aspect: 'resource_template',
        before: 'present',
        after: 'absent',
        severity: 'breaking',
        description: `Resource template "${uriTemplate}" removed`,
      });
    }
  }

  return changes;
}

function compareServerInfo(
  previous: BaselineServerFingerprint,
  current: BaselineServerFingerprint,
  features?: MCPFeatureFlags
): BehaviorChange[] {
  const changes: BehaviorChange[] = [];

  if (previous.name !== current.name) {
    changes.push({
      tool: 'server',
      aspect: 'server',
      before: previous.name,
      after: current.name,
      severity: 'info',
      description: 'Server name changed',
    });
  }

  if (previous.version !== current.version) {
    changes.push({
      tool: 'server',
      aspect: 'server',
      before: previous.version,
      after: current.version,
      severity: 'info',
      description: 'Server version changed',
    });
  }

  if (previous.protocolVersion !== current.protocolVersion) {
    // Protocol version change is always warning severity.
    // The version registry handles feature gating — the version change itself
    // is informational drift, not a breaking change.
    changes.push({
      tool: 'server',
      aspect: 'server',
      before: previous.protocolVersion,
      after: current.protocolVersion,
      severity: 'warning',
      description: `Protocol version changed from ${previous.protocolVersion} to ${current.protocolVersion}`,
    });
  }

  // Compare server instructions — only when both versions support them
  if (features?.serverInstructions) {
    if (
      previous.instructions !== current.instructions &&
      (previous.instructions !== undefined || current.instructions !== undefined)
    ) {
      changes.push({
        tool: 'server',
        aspect: 'server',
        before: previous.instructions ? `"${previous.instructions.slice(0, 50)}..."` : 'none',
        after: current.instructions ? `"${current.instructions.slice(0, 50)}..."` : 'none',
        severity: 'info',
        description: 'Server instructions changed',
      });
    }
  }

  const prevCaps = new Set(previous.capabilities);
  const currCaps = new Set(current.capabilities);

  for (const cap of prevCaps) {
    if (!currCaps.has(cap)) {
      // Skip capabilities that are version-gated and not in the shared feature set
      if (cap === 'completions' && !features?.completions) continue;
      if (cap === 'tasks' && !features?.tasks) continue;
      changes.push({
        tool: 'server',
        aspect: 'capability',
        before: cap,
        after: 'removed',
        severity: 'breaking',
        description: `Capability "${cap}" removed`,
      });
    }
  }

  for (const cap of currCaps) {
    if (!prevCaps.has(cap)) {
      changes.push({
        tool: 'server',
        aspect: 'capability',
        before: 'absent',
        after: cap,
        severity: 'info',
        description: `Capability "${cap}" added`,
      });
    }
  }

  return changes;
}

function getDeclaredSchemaHash(tool: ToolFingerprint): string {
  if (tool.inputSchema && Object.keys(tool.inputSchema).length > 0) {
    return computeSchemaHash(tool.inputSchema);
  }
  return tool.schemaHash;
}

/**
 * Format a schema change value for display in BehaviorChange.
 * Converts unknown values to human-readable strings.
 */
function formatSchemaChangeValue(value: unknown): string {
  if (value === undefined) return '<none>';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 3) return `[${value.map((v) => formatSchemaChangeValue(v)).join(', ')}]`;
    return `[${value
      .slice(0, 3)
      .map((v) => formatSchemaChangeValue(v))
      .join(', ')}, ...]`;
  }
  // For objects, show a compact representation
  try {
    const json = JSON.stringify(value);
    return json.length > 50 ? `${json.slice(0, 47)}...` : json;
  } catch {
    return String(value);
  }
}

function compareWorkflows(
  previous: Array<{ id: string; name: string; succeeded: boolean }>,
  current: Array<{ id: string; name: string; succeeded: boolean }>
): BehaviorChange[] {
  const changes: BehaviorChange[] = [];

  const prevMap = new Map(previous.map((w) => [w.id, w]));
  const currMap = new Map(current.map((w) => [w.id, w]));

  for (const [id, currWorkflow] of currMap) {
    const prevWorkflow = prevMap.get(id);

    if (prevWorkflow) {
      if (prevWorkflow.succeeded && !currWorkflow.succeeded) {
        changes.push({
          tool: currWorkflow.name,
          aspect: 'error_handling',
          before: 'succeeded',
          after: 'failed',
          severity: 'breaking',
          description: `Workflow "${currWorkflow.name}" now fails (previously succeeded)`,
        });
      } else if (!prevWorkflow.succeeded && currWorkflow.succeeded) {
        changes.push({
          tool: currWorkflow.name,
          aspect: 'error_handling',
          before: 'failed',
          after: 'succeeded',
          severity: 'info',
          description: `Workflow "${currWorkflow.name}" now succeeds (previously failed)`,
        });
      }
    }
  }

  return changes;
}

function calculateSeverity(
  toolsAdded: string[],
  toolsRemoved: string[],
  changes: BehaviorChange[]
): {
  severity: ChangeSeverity;
  breakingCount: number;
  warningCount: number;
  infoCount: number;
} {
  let breakingCount = toolsRemoved.length;
  let warningCount = 0;
  let infoCount = toolsAdded.length;

  for (const change of changes) {
    switch (change.severity) {
      case 'breaking':
        breakingCount++;
        break;
      case 'warning':
        warningCount++;
        break;
      case 'info':
        infoCount++;
        break;
    }
  }

  let severity: ChangeSeverity = 'none';
  if (breakingCount > 0) {
    severity = 'breaking';
  } else if (warningCount > 0) {
    severity = 'warning';
  } else if (infoCount > 0) {
    severity = 'info';
  }

  return { severity, breakingCount, warningCount, infoCount };
}

function generateSummary(
  toolsAdded: string[],
  toolsRemoved: string[],
  toolsModified: ToolDiff[],
  changes: BehaviorChange[],
  severity: ChangeSeverity
): string {
  if (severity === 'none') {
    return 'No changes detected.';
  }

  const parts: string[] = [];

  if (toolsRemoved.length > 0) {
    parts.push(`${toolsRemoved.length} tool(s) removed: ${toolsRemoved.join(', ')}`);
  }
  if (toolsAdded.length > 0) {
    parts.push(`${toolsAdded.length} tool(s) added: ${toolsAdded.join(', ')}`);
  }
  if (toolsModified.length > 0) {
    parts.push(`${toolsModified.length} tool(s) modified`);
  }

  const breakingChanges = changes.filter((c) => c.severity === 'breaking').length;
  const warningChanges = changes.filter((c) => c.severity === 'warning').length;

  if (breakingChanges > 0) {
    parts.push(`${breakingChanges} breaking change(s)`);
  }
  if (warningChanges > 0) {
    parts.push(`${warningChanges} warning(s)`);
  }

  return `${parts.join('. ')}.`;
}

export function hasBreakingChanges(diff: BehavioralDiff): boolean {
  return diff.severity === 'breaking';
}

export function hasSecurityChanges(diff: BehavioralDiff): boolean {
  return diff.behaviorChanges.some((c) => c.aspect === 'security');
}

export function filterByMinimumSeverity(
  diff: BehavioralDiff,
  minSeverity: ChangeSeverity
): BehaviorChange[] {
  const severityOrder: ChangeSeverity[] = ['none', 'info', 'warning', 'breaking'];
  const minIndex = severityOrder.indexOf(minSeverity);

  return diff.behaviorChanges.filter((change) => {
    // BehaviorChange.severity is already a ChangeSeverity, so no mapping needed
    return severityOrder.indexOf(change.severity) >= minIndex;
  });
}

/**
 * Severity order for comparison.
 */
const SEVERITY_ORDER: ChangeSeverity[] = ['none', 'info', 'warning', 'breaking'];

/**
 * Compare two severity levels.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareSeverity(a: ChangeSeverity, b: ChangeSeverity): number {
  return SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b);
}

/**
 * Check if a severity meets or exceeds a threshold.
 */
export function severityMeetsThreshold(
  severity: ChangeSeverity,
  threshold: ChangeSeverity
): boolean {
  return compareSeverity(severity, threshold) >= 0;
}

/**
 * Apply aspect overrides to a behavior change.
 * Returns the modified severity based on aspect overrides.
 */
export function applyAspectOverride(
  change: BehaviorChange,
  aspectOverrides?: Partial<Record<BehaviorAspect, ChangeSeverity>>
): ChangeSeverity {
  if (!aspectOverrides) {
    return change.severity;
  }
  const override = aspectOverrides[change.aspect];
  return override !== undefined ? override : change.severity;
}

/**
 * Apply severity configuration to a diff result.
 * Returns a new diff with filtered/modified changes based on config.
 */
export function applySeverityConfig(diff: BehavioralDiff, config: SeverityConfig): BehavioralDiff {
  const { minimumSeverity = 'none', suppressWarnings = false, aspectOverrides } = config;

  // Apply aspect overrides and filter by minimum severity
  const filteredChanges = diff.behaviorChanges
    .map((change) => {
      const newSeverity = applyAspectOverride(change, aspectOverrides);
      return { ...change, severity: newSeverity };
    })
    .filter((change) => {
      // Filter by minimum severity
      if (!severityMeetsThreshold(change.severity, minimumSeverity)) {
        return false;
      }
      // Suppress warnings if configured
      if (suppressWarnings && change.severity === 'warning') {
        return false;
      }
      return true;
    });

  // Filter toolsModified to only include those with remaining changes
  const toolsWithChanges = new Set(filteredChanges.map((c) => c.tool));
  const filteredToolsModified = diff.toolsModified.filter(
    (td) =>
      toolsWithChanges.has(td.tool) ||
      (td.schemaChanged && (!aspectOverrides?.schema || aspectOverrides.schema !== 'none')) ||
      (td.descriptionChanged &&
        (!aspectOverrides?.description || aspectOverrides.description !== 'none'))
  );

  // Recalculate counts
  let breakingCount = diff.toolsRemoved.length;
  let warningCount = 0;
  let infoCount = diff.toolsAdded.length;

  for (const change of filteredChanges) {
    switch (change.severity) {
      case 'breaking':
        breakingCount++;
        break;
      case 'warning':
        warningCount++;
        break;
      case 'info':
        infoCount++;
        break;
    }
  }

  // Determine overall severity
  let severity: ChangeSeverity = 'none';
  if (breakingCount > 0) {
    severity = 'breaking';
  } else if (warningCount > 0) {
    severity = 'warning';
  } else if (infoCount > 0) {
    severity = 'info';
  }

  return {
    ...diff,
    behaviorChanges: filteredChanges,
    toolsModified: filteredToolsModified,
    severity,
    breakingCount,
    warningCount,
    infoCount,
    summary: generateSummary(
      diff.toolsAdded,
      diff.toolsRemoved,
      filteredToolsModified,
      filteredChanges,
      severity
    ),
  };
}

/**
 * Determine the appropriate exit code based on diff severity and config.
 * Returns true if the check should fail (non-zero exit).
 */
export function shouldFailOnDiff(
  diff: BehavioralDiff,
  failOnSeverity: ChangeSeverity = 'breaking'
): boolean {
  return severityMeetsThreshold(diff.severity, failOnSeverity);
}

/**
 * Check if two baselines have compatible versions for comparison.
 *
 * @param baseline1 - First baseline
 * @param baseline2 - Second baseline
 * @returns Version compatibility information
 */
export function checkBaselineVersionCompatibility(
  baseline1: BehavioralBaseline,
  baseline2: BehavioralBaseline
): VersionCompatibilityInfo {
  const result = checkVersionCompatibility(baseline1.version, baseline2.version);
  return {
    compatible: result.compatible,
    warning: result.warning,
    sourceVersion: result.sourceVersion,
    targetVersion: result.targetVersion,
  };
}

/**
 * Compare performance data between two baselines.
 * Detects performance regressions based on p50 latency threshold.
 * Includes confidence information to indicate reliability of comparisons.
 *
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @param threshold - Regression threshold (0-1, e.g., 0.10 = 10% slower)
 * @returns Performance regression report, or undefined if no performance data
 */
function comparePerformanceData(
  previousTools: ToolFingerprint[],
  currentTools: ToolFingerprint[],
  threshold: number
): PerformanceRegressionReport | undefined {
  const regressions: PerformanceRegression[] = [];
  const confidenceChanges: PerformanceConfidenceChange[] = [];
  const lowConfidenceTools: string[] = [];
  let improvementCount = 0;

  // Build map of previous tool performance (including confidence)
  const previousPerf = new Map<
    string,
    {
      p50: number;
      p95: number;
      confidence?: 'high' | 'medium' | 'low';
    }
  >();
  for (const tool of previousTools) {
    if (tool.baselineP50Ms !== undefined) {
      previousPerf.set(tool.name, {
        p50: tool.baselineP50Ms,
        p95: tool.baselineP95Ms ?? tool.baselineP50Ms,
        confidence: tool.performanceConfidence?.confidenceLevel,
      });
    }
  }

  // Compare current tool performance
  for (const tool of currentTools) {
    if (tool.baselineP50Ms === undefined) {
      continue; // No performance data
    }

    const currentConfidence = tool.performanceConfidence;
    const currentConfidenceLevel = currentConfidence?.confidenceLevel ?? 'low';

    // Track low confidence tools
    if (currentConfidence && !hasReliableConfidence(currentConfidence)) {
      lowConfidenceTools.push(tool.name);
    }

    const prev = previousPerf.get(tool.name);
    if (!prev) {
      continue; // New tool, no baseline to compare
    }

    // Track confidence level changes
    if (prev.confidence && currentConfidenceLevel !== prev.confidence) {
      const previousLevel = prev.confidence;
      const improved =
        (previousLevel === 'low' && currentConfidenceLevel !== 'low') ||
        (previousLevel === 'medium' && currentConfidenceLevel === 'high');
      const degraded =
        (previousLevel === 'high' && currentConfidenceLevel !== 'high') ||
        (previousLevel === 'medium' && currentConfidenceLevel === 'low');

      confidenceChanges.push({
        toolName: tool.name,
        previousLevel,
        currentLevel: currentConfidenceLevel,
        improved,
        degraded,
        summary: improved
          ? `Confidence improved from ${previousLevel} to ${currentConfidenceLevel}`
          : degraded
            ? `Confidence degraded from ${previousLevel} to ${currentConfidenceLevel}`
            : `Confidence changed from ${previousLevel} to ${currentConfidenceLevel}`,
      });
    }

    // Calculate regression percentage
    const regressionPercent = prev.p50 > 0 ? (tool.baselineP50Ms - prev.p50) / prev.p50 : 0;

    // Determine if the regression is reliable (based on confidence)
    const isReliable = currentConfidence !== undefined && hasReliableConfidence(currentConfidence);

    if (regressionPercent > threshold) {
      // Performance regression
      regressions.push({
        toolName: tool.name,
        previousP50Ms: prev.p50,
        currentP50Ms: tool.baselineP50Ms,
        regressionPercent,
        exceedsThreshold: true,
        previousConfidence: prev.confidence,
        currentConfidence: currentConfidenceLevel,
        isReliable,
      });
    } else if (regressionPercent < -PERFORMANCE_TRACKING.WARNING_THRESHOLD) {
      // Performance improvement (> 5% faster)
      improvementCount++;
    }
  }

  // Return undefined if no performance data exists
  if (previousPerf.size === 0) {
    return undefined;
  }

  return {
    regressions,
    regressionCount: regressions.length,
    improvementCount,
    hasRegressions: regressions.length > 0,
    confidenceChanges: confidenceChanges.length > 0 ? confidenceChanges : undefined,
    lowConfidenceTools: lowConfidenceTools.length > 0 ? lowConfidenceTools : undefined,
  };
}

/**
 * Compare security data between two baselines.
 * Aggregates security findings across all tools to produce a server-level security diff.
 *
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @param ignoreSecurityChanges - Whether to skip security comparison
 * @returns Security diff report, or undefined if no security data
 */
function compareSecurityData(
  previousTools: ToolFingerprint[],
  currentTools: ToolFingerprint[],
  ignoreSecurityChanges: boolean
): SecurityDiff | undefined {
  if (ignoreSecurityChanges) {
    return undefined;
  }

  // Check if either baseline has security data
  const previousHasSecurity = previousTools.some((t) => t.securityFingerprint?.tested);
  const currentHasSecurity = currentTools.some((t) => t.securityFingerprint?.tested);

  if (!previousHasSecurity && !currentHasSecurity) {
    return undefined; // No security data to compare
  }

  // Aggregate findings from all tools
  const previousFindings = new Map<string, SecurityFinding>();
  const currentFindings = new Map<string, SecurityFinding>();

  // Build finding maps keyed by a unique identifier (tool:category:cweId:parameter)
  for (const tool of previousTools) {
    if (tool.securityFingerprint?.findings) {
      for (const finding of tool.securityFingerprint.findings) {
        const key = `${finding.tool}:${finding.category}:${finding.cweId}:${finding.parameter}`;
        previousFindings.set(key, finding);
      }
    }
  }

  for (const tool of currentTools) {
    if (tool.securityFingerprint?.findings) {
      for (const finding of tool.securityFingerprint.findings) {
        const key = `${finding.tool}:${finding.category}:${finding.cweId}:${finding.parameter}`;
        currentFindings.set(key, finding);
      }
    }
  }

  // Calculate new and resolved findings
  const newFindings: SecurityFinding[] = [];
  const resolvedFindings: SecurityFinding[] = [];

  for (const [key, finding] of currentFindings) {
    if (!previousFindings.has(key)) {
      newFindings.push(finding);
    }
  }

  for (const [key, finding] of previousFindings) {
    if (!currentFindings.has(key)) {
      resolvedFindings.push(finding);
    }
  }

  // Calculate aggregate risk scores
  let previousRiskScore = 0;
  let currentRiskScore = 0;
  let previousToolCount = 0;
  let currentToolCount = 0;

  for (const tool of previousTools) {
    if (tool.securityFingerprint?.tested) {
      previousRiskScore += tool.securityFingerprint.riskScore;
      previousToolCount++;
    }
  }

  for (const tool of currentTools) {
    if (tool.securityFingerprint?.tested) {
      currentRiskScore += tool.securityFingerprint.riskScore;
      currentToolCount++;
    }
  }

  // Average risk scores if there are tested tools
  const avgPreviousRisk = previousToolCount > 0 ? previousRiskScore / previousToolCount : 0;
  const avgCurrentRisk = currentToolCount > 0 ? currentRiskScore / currentToolCount : 0;
  const riskScoreChange = avgCurrentRisk - avgPreviousRisk;

  // Generate summary
  const summaryParts: string[] = [];

  if (newFindings.length > 0) {
    const criticalHigh = newFindings.filter(
      (f) => f.riskLevel === 'critical' || f.riskLevel === 'high'
    ).length;
    if (criticalHigh > 0) {
      summaryParts.push(`${criticalHigh} critical/high severity findings detected`);
    }
    summaryParts.push(`${newFindings.length} new security finding(s)`);
  }

  if (resolvedFindings.length > 0) {
    summaryParts.push(`${resolvedFindings.length} finding(s) resolved`);
  }

  if (riskScoreChange > 0) {
    summaryParts.push(`risk score increased by ${riskScoreChange.toFixed(1)}`);
  } else if (riskScoreChange < 0) {
    summaryParts.push(`risk score decreased by ${Math.abs(riskScoreChange).toFixed(1)}`);
  }

  const summary =
    summaryParts.length > 0 ? summaryParts.join('; ') : 'No security changes detected';

  return {
    newFindings,
    resolvedFindings,
    previousRiskScore: Math.round(avgPreviousRisk),
    currentRiskScore: Math.round(avgCurrentRisk),
    riskScoreChange: Math.round(riskScoreChange),
    degraded: newFindings.length > 0 || riskScoreChange > 0,
    summary,
  };
}

/**
 * Generate schema evolution report from tool diffs.
 * Tracks schema stability changes across tools.
 *
 * @param toolsModified - Tools with modifications
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @returns Schema evolution report, or undefined if no schema evolution data
 */
function generateSchemaEvolutionReport(
  toolsModified: ToolDiff[],
  previousTools: ToolFingerprint[],
  currentTools: ToolFingerprint[]
): SchemaEvolutionReport | undefined {
  // Check if either baseline has schema evolution data
  const previousHasEvolution = previousTools.some((t) => t.responseSchemaEvolution);
  const currentHasEvolution = currentTools.some((t) => t.responseSchemaEvolution);

  if (!previousHasEvolution && !currentHasEvolution) {
    return undefined; // No schema evolution data to compare
  }

  const toolsWithIssues: SchemaEvolutionIssue[] = [];
  let unstableCount = 0;
  let stableCount = 0;
  let structureChangedCount = 0;
  let hasBreakingChanges = false;

  // Analyze tools with schema evolution data
  for (const tool of currentTools) {
    const currEvolution = tool.responseSchemaEvolution;
    if (!currEvolution) continue;

    // Count stable vs unstable
    if (currEvolution.isStable) {
      stableCount++;
    } else {
      unstableCount++;
    }

    // Find corresponding tool diff
    const toolDiff = toolsModified.find((td) => td.tool === tool.name);
    if (toolDiff?.schemaEvolutionDiff?.structureChanged) {
      structureChangedCount++;

      if (toolDiff.schemaEvolutionDiff.isBreaking) {
        hasBreakingChanges = true;
      }

      // Find previous tool
      const prevTool = previousTools.find((t) => t.name === tool.name);
      const prevEvolution = prevTool?.responseSchemaEvolution;
      const becameUnstable = (prevEvolution?.isStable ?? false) && !currEvolution.isStable;

      toolsWithIssues.push({
        toolName: tool.name,
        becameUnstable,
        fieldsAdded: toolDiff.schemaEvolutionDiff.fieldsAdded,
        fieldsRemoved: toolDiff.schemaEvolutionDiff.fieldsRemoved,
        isBreaking: toolDiff.schemaEvolutionDiff.isBreaking,
        summary: toolDiff.schemaEvolutionDiff.summary,
      });
    } else if (!currEvolution.isStable && currEvolution.inconsistentFields.length > 0) {
      // Tool with unstable schema (no change, but already unstable)
      const prevTool = previousTools.find((t) => t.name === tool.name);
      const prevEvolution = prevTool?.responseSchemaEvolution;
      const becameUnstable = (prevEvolution?.isStable ?? false) && !currEvolution.isStable;

      if (becameUnstable) {
        toolsWithIssues.push({
          toolName: tool.name,
          becameUnstable: true,
          fieldsAdded: [],
          fieldsRemoved: [],
          isBreaking: false,
          summary: `Schema became unstable: ${currEvolution.inconsistentFields.join(', ')}`,
        });
      }
    }
  }

  return {
    toolsWithIssues,
    unstableCount,
    stableCount,
    structureChangedCount,
    hasBreakingChanges,
  };
}

/**
 * Generate error trend report from baseline comparison.
 * Aggregates error patterns across all tools to identify trends.
 *
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @param ignoreErrorPatternChanges - Whether to skip error pattern comparison
 * @returns Error trend report, or undefined if no error pattern data
 */
function generateErrorTrendReport(
  previousTools: ToolFingerprint[],
  currentTools: ToolFingerprint[],
  ignoreErrorPatternChanges: boolean
): ErrorTrendReport | undefined {
  if (ignoreErrorPatternChanges) {
    return undefined;
  }

  // Check if either baseline has error pattern data
  const previousHasErrors = previousTools.some(
    (t) => t.errorPatterns && t.errorPatterns.length > 0
  );
  const currentHasErrors = currentTools.some((t) => t.errorPatterns && t.errorPatterns.length > 0);

  if (!previousHasErrors && !currentHasErrors) {
    return undefined; // No error pattern data to compare
  }

  // Aggregate error patterns from all tools
  const allPreviousPatterns = previousTools.flatMap((t) => t.errorPatterns ?? []);
  const allCurrentPatterns = currentTools.flatMap((t) => t.errorPatterns ?? []);

  return analyzeErrorTrends(allPreviousPatterns, allCurrentPatterns);
}

/**
 * Compare documentation scores between baselines.
 * Returns a change report if documentation score data is available.
 *
 * @param previous - The previous baseline
 * @param current - The current baseline
 * @returns Documentation score change report, or undefined if no data
 */
function compareDocumentationData(
  previous: BehavioralBaseline,
  current: BehavioralBaseline
): DocumentationScoreChange | undefined {
  // If current doesn't have documentation score, try to calculate it from tools
  // This allows comparing old baselines without scores against new ones with scores
  const currentScore = current.documentationScore ?? calculateDocScoreFromTools(current);
  const previousScore = previous.documentationScore;

  if (!currentScore) {
    return undefined;
  }

  // Use the documentation scorer's comparison function
  // We need to reconstruct a minimal DocumentationScore for comparison
  const currentDocScore = {
    overallScore: currentScore.overallScore,
    grade: currentScore.grade as 'A' | 'B' | 'C' | 'D' | 'F',
    components: {
      descriptionCoverage: 0,
      descriptionQuality: 0,
      parameterDocumentation: 0,
      exampleCoverage: 0,
    },
    issues: [],
    suggestions: [],
    toolCount: currentScore.toolCount,
  };

  return compareDocumentationScores(previousScore, currentDocScore);
}

/**
 * Calculate documentation score summary from baseline tools.
 * Used when baseline doesn't have pre-calculated score.
 */
function calculateDocScoreFromTools(
  baseline: BehavioralBaseline
): { overallScore: number; grade: string; issueCount: number; toolCount: number } | undefined {
  const toolsFromBaseline = getToolFingerprints(baseline);
  if (toolsFromBaseline.length === 0) {
    return undefined;
  }

  // Create minimal MCPTool objects from ToolFingerprint
  const tools = toolsFromBaseline.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema ?? {},
  }));

  const score = scoreDocumentation(tools);
  return {
    overallScore: score.overallScore,
    grade: score.grade,
    issueCount: score.issues.length,
    toolCount: score.toolCount,
  };
}
