/**
 * Schema Evolution Timeline
 *
 * Tracks schema changes over time with visual timeline.
 * Provides version history, deprecation tracking, and change summaries.
 */

import type {
  ToolFingerprint,
  BehavioralBaseline,
} from './types.js';
import { getBaselineGeneratedAt, getToolFingerprints } from './accessors.js';
import {
  analyzeSchemaChanges,
  type SchemaChangeDetail,
} from './change-impact-analyzer.js';
import { SCHEMA_EVOLUTION } from '../constants.js';
/**
 * Event type for schema lifecycle events.
 */
export type SchemaEventType =
  | 'created'
  | 'updated'
  | 'deprecated'
  | 'removed'
  | 'restored';

/**
 * A single version of a tool's schema.
 */
export interface SchemaVersion {
  /** Tool name */
  toolName: string;
  /** Semantic version of the schema */
  version: string;
  /** Full input schema */
  schema: Record<string, unknown> | undefined;
  /** Schema hash for quick comparison */
  schemaHash: string;
  /** Changes from previous version */
  changes: SchemaChangeDetail[];
  /** Whether this version contains breaking changes */
  hasBreakingChanges: boolean;
  /** When this version was registered */
  registeredAt: Date;
  /** Release notes or change description */
  releaseNotes?: string;
  /** Git SHA if available */
  gitSha?: string;
  /** Source baseline file if available */
  sourceBaseline?: string;
}

/**
 * Deprecation event in the timeline.
 */
export interface DeprecationEvent {
  /** Tool name */
  toolName: string;
  /** Event type */
  eventType: 'deprecated' | 'sunset' | 'removed' | 'restored';
  /** When the event occurred */
  occurredAt: Date;
  /** Reason for deprecation */
  reason?: string;
  /** Suggested replacement tool */
  replacementTool?: string;
  /** Planned removal date */
  removalDate?: Date;
}

/**
 * Complete timeline for a single tool.
 */
export interface SchemaTimeline {
  /** Tool name */
  toolName: string;
  /** Current description */
  description: string;
  /** All schema versions */
  versions: SchemaVersion[];
  /** Deprecation history */
  deprecationHistory: DeprecationEvent[];
  /** When the tool was first seen */
  firstSeen: Date;
  /** When the tool was last updated */
  lastUpdated: Date;
  /** Current deprecation status */
  isDeprecated: boolean;
  /** Whether the tool has been removed */
  isRemoved: boolean;
  /** Total number of breaking changes across all versions */
  totalBreakingChanges: number;
}

/**
 * Timeline for an entire server across multiple baselines.
 */
export interface ServerTimeline {
  /** Server name */
  serverName: string;
  /** Server version (latest) */
  serverVersion: string;
  /** Individual tool timelines */
  toolTimelines: Map<string, SchemaTimeline>;
  /** Total number of baselines analyzed */
  baselineCount: number;
  /** Date range covered */
  dateRange: {
    earliest: Date;
    latest: Date;
  };
  /** Summary statistics */
  stats: TimelineStats;
}

/**
 * Summary statistics for a timeline.
 */
export interface TimelineStats {
  /** Total tools tracked */
  totalTools: number;
  /** Tools currently active */
  activeTools: number;
  /** Tools deprecated */
  deprecatedTools: number;
  /** Tools removed */
  removedTools: number;
  /** Total schema versions tracked */
  totalVersions: number;
  /** Total breaking changes */
  totalBreakingChanges: number;
  /** Average versions per tool */
  avgVersionsPerTool: number;
}

/**
 * Options for building timelines.
 */
export interface TimelineBuildOptions {
  /** Include full schema in each version (increases size) */
  includeFullSchemas?: boolean;
  /** Maximum versions to keep per tool (0 = unlimited) */
  maxVersionsPerTool?: number;
  /** Include removed tools in timeline */
  includeRemovedTools?: boolean;
}
/**
 * Build a server timeline from multiple baselines.
 * Baselines should be provided in chronological order (oldest first).
 */
export function buildServerTimeline(
  baselines: BehavioralBaseline[],
  options: TimelineBuildOptions = {}
): ServerTimeline {
  const opts = {
    includeFullSchemas: options.includeFullSchemas ?? false,
    maxVersionsPerTool: options.maxVersionsPerTool ?? SCHEMA_EVOLUTION.DEFAULT_MAX_VERSIONS_PER_TOOL,
    includeRemovedTools: options.includeRemovedTools ?? true,
  };

  if (baselines.length === 0) {
    throw new Error('At least one baseline is required to build a timeline');
  }

  const toolTimelines = new Map<string, SchemaTimeline>();
  const seenTools = new Set<string>();
  const removedTools = new Set<string>();

  // Process baselines in order
  for (let i = 0; i < baselines.length; i++) {
    const baseline = baselines[i];
    const previousBaseline = i > 0 ? baselines[i - 1] : undefined;
    const currentToolsList = getToolFingerprints(baseline);
    const currentTools = new Set(currentToolsList.map(t => t.name));
    const previousTools = previousBaseline ? getToolFingerprints(previousBaseline) : [];
    const baselineCreatedAt = getBaselineGeneratedAt(baseline);

    // Track new and updated tools
    for (const tool of currentToolsList) {
      seenTools.add(tool.name);
      removedTools.delete(tool.name); // Tool is back if it was removed

      const existingTimeline = toolTimelines.get(tool.name);
      const previousTool = previousTools.find(t => t.name === tool.name);

      if (!existingTimeline) {
        // New tool - create timeline
        const timeline = createToolTimeline(tool, baseline, opts);
        toolTimelines.set(tool.name, timeline);
      } else {
        // Existing tool - check for changes
        updateToolTimeline(existingTimeline, tool, previousTool, baseline, opts);
      }

      // Track deprecation events
      if (tool.deprecated && !previousTool?.deprecated) {
        addDeprecationEvent(toolTimelines.get(tool.name)!, tool, 'deprecated', baselineCreatedAt);
      }
    }

    // Track removed tools
    if (previousBaseline) {
      for (const prevTool of previousTools) {
        if (!currentTools.has(prevTool.name)) {
          removedTools.add(prevTool.name);
          const timeline = toolTimelines.get(prevTool.name);
          if (timeline && !timeline.isRemoved) {
            timeline.isRemoved = true;
            addDeprecationEvent(timeline, prevTool, 'removed', baselineCreatedAt);
          }
        }
      }
    }
  }

  // Remove timelines for removed tools if not including them
  if (!opts.includeRemovedTools) {
    for (const toolName of removedTools) {
      toolTimelines.delete(toolName);
    }
  }

  // Trim versions if needed
  if (opts.maxVersionsPerTool > 0) {
    for (const timeline of toolTimelines.values()) {
      if (timeline.versions.length > opts.maxVersionsPerTool) {
        timeline.versions = timeline.versions.slice(-opts.maxVersionsPerTool);
      }
    }
  }

  const latestBaseline = baselines[baselines.length - 1];
  const earliestBaseline = baselines[0];

  return {
    serverName: latestBaseline.server.name,
    serverVersion: latestBaseline.server.version,
    toolTimelines,
    baselineCount: baselines.length,
    dateRange: {
      earliest: getBaselineGeneratedAt(earliestBaseline),
      latest: getBaselineGeneratedAt(latestBaseline),
    },
    stats: calculateTimelineStats(toolTimelines),
  };
}

/**
 * Build a timeline for a single tool from multiple baselines.
 */
export function buildToolTimeline(
  toolName: string,
  baselines: BehavioralBaseline[],
  options: TimelineBuildOptions = {}
): SchemaTimeline | null {
  const serverTimeline = buildServerTimeline(baselines, options);
  return serverTimeline.toolTimelines.get(toolName) || null;
}

/**
 * Create a new tool timeline from its first appearance.
 */
function createToolTimeline(
  tool: ToolFingerprint,
  baseline: BehavioralBaseline,
  opts: Required<TimelineBuildOptions>
): SchemaTimeline {
  const initialVersion: SchemaVersion = {
    toolName: tool.name,
    version: '1.0.0',
    schema: opts.includeFullSchemas ? tool.inputSchema : undefined,
    schemaHash: tool.schemaHash,
    changes: [],
    hasBreakingChanges: false,
    registeredAt: getBaselineGeneratedAt(baseline),
    sourceBaseline: baseline.hash,
  };

  return {
    toolName: tool.name,
    description: tool.description,
    versions: [initialVersion],
    deprecationHistory: [],
    firstSeen: getBaselineGeneratedAt(baseline),
    lastUpdated: getBaselineGeneratedAt(baseline),
    isDeprecated: tool.deprecated ?? false,
    isRemoved: false,
    totalBreakingChanges: 0,
  };
}

/**
 * Update an existing tool timeline with a new version if changed.
 */
function updateToolTimeline(
  timeline: SchemaTimeline,
  tool: ToolFingerprint,
  previousTool: ToolFingerprint | undefined,
  baseline: BehavioralBaseline,
  opts: Required<TimelineBuildOptions>
): void {
  const latestVersion = timeline.versions[timeline.versions.length - 1];

  // Check if schema changed
  if (latestVersion.schemaHash !== tool.schemaHash) {
    const changes = analyzeSchemaChanges(
      previousTool?.inputSchema,
      tool.inputSchema
    );
    const hasBreaking = changes.some(c => c.breaking);

    // Increment version
    const newVersionNumber = incrementVersion(latestVersion.version, hasBreaking);

    const newVersion: SchemaVersion = {
      toolName: tool.name,
      version: newVersionNumber,
      schema: opts.includeFullSchemas ? tool.inputSchema : undefined,
      schemaHash: tool.schemaHash,
      changes,
      hasBreakingChanges: hasBreaking,
      registeredAt: getBaselineGeneratedAt(baseline),
      sourceBaseline: baseline.hash,
    };

    timeline.versions.push(newVersion);
    timeline.lastUpdated = getBaselineGeneratedAt(baseline);

    if (hasBreaking) {
      timeline.totalBreakingChanges++;
    }
  }

  // Update description if changed
  if (tool.description !== timeline.description) {
    timeline.description = tool.description;
  }

  // Update deprecation status
  timeline.isDeprecated = tool.deprecated ?? false;
}

/**
 * Add a deprecation event to a timeline.
 */
function addDeprecationEvent(
  timeline: SchemaTimeline,
  tool: ToolFingerprint,
  eventType: DeprecationEvent['eventType'],
  occurredAt: Date
): void {
  timeline.deprecationHistory.push({
    toolName: tool.name,
    eventType,
    occurredAt,
    reason: tool.deprecationNotice,
    replacementTool: tool.replacementTool,
    removalDate: tool.removalDate,
  });
}

/**
 * Increment version number based on whether change is breaking.
 */
function incrementVersion(currentVersion: string, isBreaking: boolean): string {
  const parts = currentVersion.split('.').map(Number);
  if (parts.length !== 3) {
    return isBreaking ? '2.0.0' : '1.1.0';
  }

  if (isBreaking) {
    // Major version bump
    return `${parts[0] + 1}.0.0`;
  } else {
    // Minor version bump
    return `${parts[0]}.${parts[1] + 1}.0`;
  }
}

/**
 * Calculate statistics for a timeline.
 */
function calculateTimelineStats(toolTimelines: Map<string, SchemaTimeline>): TimelineStats {
  let totalVersions = 0;
  let totalBreakingChanges = 0;
  let activeTools = 0;
  let deprecatedTools = 0;
  let removedTools = 0;

  for (const timeline of toolTimelines.values()) {
    totalVersions += timeline.versions.length;
    totalBreakingChanges += timeline.totalBreakingChanges;

    if (timeline.isRemoved) {
      removedTools++;
    } else if (timeline.isDeprecated) {
      deprecatedTools++;
    } else {
      activeTools++;
    }
  }

  const totalTools = toolTimelines.size;

  return {
    totalTools,
    activeTools,
    deprecatedTools,
    removedTools,
    totalVersions,
    totalBreakingChanges,
    avgVersionsPerTool: totalTools > 0 ? totalVersions / totalTools : 0,
  };
}
/**
 * Get all breaking changes for a tool.
 */
export function getBreakingChanges(timeline: SchemaTimeline): SchemaVersion[] {
  return timeline.versions.filter(v => v.hasBreakingChanges);
}

/**
 * Get version at a specific point in time.
 */
export function getVersionAtTime(
  timeline: SchemaTimeline,
  targetDate: Date
): SchemaVersion | null {
  // Find the latest version before or at the target date
  for (let i = timeline.versions.length - 1; i >= 0; i--) {
    if (timeline.versions[i].registeredAt <= targetDate) {
      return timeline.versions[i];
    }
  }
  return null;
}

/**
 * Get changes between two dates.
 */
export function getChangesBetween(
  timeline: SchemaTimeline,
  startDate: Date,
  endDate: Date
): SchemaVersion[] {
  return timeline.versions.filter(
    v => v.registeredAt >= startDate && v.registeredAt <= endDate
  );
}

/**
 * Check if a tool had breaking changes in a time period.
 */
export function hadBreakingChanges(
  timeline: SchemaTimeline,
  since: Date
): boolean {
  return timeline.versions.some(
    v => v.registeredAt >= since && v.hasBreakingChanges
  );
}

/**
 * Get tools with most versions (most active/changing tools).
 */
export function getMostActiveTools(
  serverTimeline: ServerTimeline,
  limit: number = SCHEMA_EVOLUTION.DEFAULT_ACTIVE_TOOLS_LIMIT
): SchemaTimeline[] {
  return Array.from(serverTimeline.toolTimelines.values())
    .sort((a, b) => b.versions.length - a.versions.length)
    .slice(0, limit);
}

/**
 * Get tools with most breaking changes.
 */
export function getMostBreakingTools(
  serverTimeline: ServerTimeline,
  limit: number = SCHEMA_EVOLUTION.DEFAULT_ACTIVE_TOOLS_LIMIT
): SchemaTimeline[] {
  return Array.from(serverTimeline.toolTimelines.values())
    .sort((a, b) => b.totalBreakingChanges - a.totalBreakingChanges)
    .filter(t => t.totalBreakingChanges > 0)
    .slice(0, limit);
}
/**
 * Format a timeline for console display.
 */
export function formatTimeline(timeline: SchemaTimeline): string {
  const lines: string[] = [];

  lines.push(`Schema Timeline: ${timeline.toolName}`);
  lines.push('═'.repeat(50));
  lines.push('');

  // Status
  const status = timeline.isRemoved ? 'REMOVED' :
                 timeline.isDeprecated ? 'DEPRECATED' : 'ACTIVE';
  lines.push(`Status: ${status}`);
  lines.push(`First seen: ${timeline.firstSeen.toISOString()}`);
  lines.push(`Last updated: ${timeline.lastUpdated.toISOString()}`);
  lines.push(`Total versions: ${timeline.versions.length}`);
  lines.push(`Breaking changes: ${timeline.totalBreakingChanges}`);
  lines.push('');

  // Versions
  lines.push('Version History:');
  lines.push('─'.repeat(40));

  for (const version of timeline.versions.slice(-SCHEMA_EVOLUTION.DEFAULT_DISPLAY_VERSIONS)) {
    const breakingIndicator = version.hasBreakingChanges ? ' [BREAKING]' : '';
    lines.push(`  v${version.version}${breakingIndicator}`);
    lines.push(`    Registered: ${version.registeredAt.toISOString()}`);

    if (version.changes.length > 0) {
      lines.push(`    Changes:`);
      for (const change of version.changes.slice(0, SCHEMA_EVOLUTION.DEFAULT_DISPLAY_CHANGES)) {
        const breakingMark = change.breaking ? '!' : ' ';
        lines.push(`      ${breakingMark} ${change.type}: ${change.parameterPath}`);
      }
      if (version.changes.length > SCHEMA_EVOLUTION.DEFAULT_DISPLAY_CHANGES) {
        lines.push(`      ... and ${version.changes.length - SCHEMA_EVOLUTION.DEFAULT_DISPLAY_CHANGES} more changes`);
      }
    }
    lines.push('');
  }

  // Deprecation history
  if (timeline.deprecationHistory.length > 0) {
    lines.push('Deprecation History:');
    lines.push('─'.repeat(40));
    for (const event of timeline.deprecationHistory) {
      lines.push(`  ${event.eventType.toUpperCase()} at ${event.occurredAt.toISOString()}`);
      if (event.reason) {
        lines.push(`    Reason: ${event.reason}`);
      }
      if (event.replacementTool) {
        lines.push(`    Replacement: ${event.replacementTool}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format server timeline summary.
 */
export function formatServerTimelineSummary(timeline: ServerTimeline): string {
  const lines: string[] = [];

  lines.push(`Server Timeline: ${timeline.serverName}`);
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(`Server version: ${timeline.serverVersion}`);
  lines.push(`Baselines analyzed: ${timeline.baselineCount}`);
  lines.push(`Date range: ${timeline.dateRange.earliest.toISOString()} to ${timeline.dateRange.latest.toISOString()}`);
  lines.push('');
  lines.push('Statistics:');
  lines.push(`  Total tools: ${timeline.stats.totalTools}`);
  lines.push(`  Active: ${timeline.stats.activeTools}`);
  lines.push(`  Deprecated: ${timeline.stats.deprecatedTools}`);
  lines.push(`  Removed: ${timeline.stats.removedTools}`);
  lines.push(`  Total versions: ${timeline.stats.totalVersions}`);
  lines.push(`  Total breaking changes: ${timeline.stats.totalBreakingChanges}`);
  lines.push(`  Avg versions/tool: ${timeline.stats.avgVersionsPerTool.toFixed(1)}`);

  return lines.join('\n');
}

/**
 * Generate a visual timeline (ASCII art).
 */
export function generateVisualTimeline(
  timeline: SchemaTimeline,
  width: number = SCHEMA_EVOLUTION.DEFAULT_VISUAL_TIMELINE_WIDTH
): string {
  if (timeline.versions.length === 0) {
    return 'No versions to display.';
  }

  const lines: string[] = [];
  const maxVersions = Math.min(timeline.versions.length, SCHEMA_EVOLUTION.MAX_VISUAL_TIMELINE_VERSIONS);
  const displayVersions = timeline.versions.slice(-maxVersions);

  lines.push(`${timeline.toolName} Schema Evolution`);
  lines.push('');

  // Timeline bar
  const barWidth = width - 20;
  const segmentWidth = Math.floor(barWidth / displayVersions.length);

  let bar = '';
  for (let i = 0; i < displayVersions.length; i++) {
    const v = displayVersions[i];
    const marker = v.hasBreakingChanges ? '◆' : '●';
    bar += marker + '─'.repeat(segmentWidth - 1);
  }
  lines.push('  ' + bar);

  // Version labels
  let labels = '  ';
  for (const v of displayVersions) {
    const label = `v${v.version}`;
    labels += label + ' '.repeat(Math.max(0, segmentWidth - label.length));
  }
  lines.push(labels);

  // Legend
  lines.push('');
  lines.push('Legend: ● Minor change | ◆ Breaking change');

  return lines.join('\n');
}
/**
 * Convert timeline to JSON-serializable format.
 */
export function serializeTimeline(timeline: SchemaTimeline): Record<string, unknown> {
  return {
    toolName: timeline.toolName,
    description: timeline.description,
    versions: timeline.versions.map(v => ({
      ...v,
      registeredAt: v.registeredAt.toISOString(),
    })),
    deprecationHistory: timeline.deprecationHistory.map(e => ({
      ...e,
      occurredAt: e.occurredAt.toISOString(),
      removalDate: e.removalDate?.toISOString(),
    })),
    firstSeen: timeline.firstSeen.toISOString(),
    lastUpdated: timeline.lastUpdated.toISOString(),
    isDeprecated: timeline.isDeprecated,
    isRemoved: timeline.isRemoved,
    totalBreakingChanges: timeline.totalBreakingChanges,
  };
}

/**
 * Deserialize timeline from JSON.
 */
export function deserializeTimeline(data: Record<string, unknown>): SchemaTimeline {
  const versions = (data.versions as Record<string, unknown>[]).map(v => ({
    ...v,
    registeredAt: new Date(v.registeredAt as string),
  })) as SchemaVersion[];

  const deprecationHistory = (data.deprecationHistory as Record<string, unknown>[]).map(e => ({
    ...e,
    occurredAt: new Date(e.occurredAt as string),
    removalDate: e.removalDate ? new Date(e.removalDate as string) : undefined,
  })) as DeprecationEvent[];

  return {
    toolName: data.toolName as string,
    description: data.description as string,
    versions,
    deprecationHistory,
    firstSeen: new Date(data.firstSeen as string),
    lastUpdated: new Date(data.lastUpdated as string),
    isDeprecated: data.isDeprecated as boolean,
    isRemoved: data.isRemoved as boolean,
    totalBreakingChanges: data.totalBreakingChanges as number,
  };
}

/**
 * Serialize server timeline to JSON.
 */
export function serializeServerTimeline(timeline: ServerTimeline): Record<string, unknown> {
  const toolTimelines: Record<string, unknown> = {};
  for (const [name, t] of timeline.toolTimelines) {
    toolTimelines[name] = serializeTimeline(t);
  }

  return {
    serverName: timeline.serverName,
    serverVersion: timeline.serverVersion,
    toolTimelines,
    baselineCount: timeline.baselineCount,
    dateRange: {
      earliest: timeline.dateRange.earliest.toISOString(),
      latest: timeline.dateRange.latest.toISOString(),
    },
    stats: timeline.stats,
  };
}

/**
 * Deserialize server timeline from JSON.
 */
export function deserializeServerTimeline(data: Record<string, unknown>): ServerTimeline {
  const toolTimelines = new Map<string, SchemaTimeline>();
  const toolData = data.toolTimelines as Record<string, Record<string, unknown>>;
  for (const [name, t] of Object.entries(toolData)) {
    toolTimelines.set(name, deserializeTimeline(t));
  }

  const dateRange = data.dateRange as { earliest: string; latest: string };

  return {
    serverName: data.serverName as string,
    serverVersion: data.serverVersion as string,
    toolTimelines,
    baselineCount: data.baselineCount as number,
    dateRange: {
      earliest: new Date(dateRange.earliest),
      latest: new Date(dateRange.latest),
    },
    stats: data.stats as TimelineStats,
  };
}
