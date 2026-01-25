/**
 * Incremental checking for faster CI runs.
 *
 * Compares current tool schemas against a baseline to determine which tools
 * need retesting. Tools with unchanged schemas can use cached results.
 */

import type { MCPTool } from '../transport/types.js';
import type { BehavioralBaseline, ToolFingerprint } from './types.js';
import { getToolFingerprints } from './accessors.js';
import { computeSchemaHash } from './schema-compare.js';

/**
 * Result of incremental analysis.
 */
export interface IncrementalCheckResult {
  /** Tools that need testing (new or changed schema) */
  toolsToTest: string[];
  /** Tools that can use cached results */
  toolsToSkip: string[];
  /** Tool fingerprints from baseline for skipped tools */
  cachedFingerprints: ToolFingerprint[];
  /** Summary of what changed */
  changeSummary: IncrementalChangeSummary;
}

/**
 * Summary of changes detected during incremental analysis.
 */
export interface IncrementalChangeSummary {
  /** Number of new tools (not in baseline) */
  newTools: number;
  /** Number of tools with changed schemas */
  changedTools: number;
  /** Number of tools with unchanged schemas */
  unchangedTools: number;
  /** Number of removed tools (in baseline but not current) */
  removedTools: number;
  /** Names of new tools */
  newToolNames: string[];
  /** Names of changed tools */
  changedToolNames: string[];
  /** Names of removed tools */
  removedToolNames: string[];
}

/**
 * Options for incremental checking.
 */
export interface IncrementalCheckOptions {
  /** Force retest even if schema unchanged */
  forceRetest?: boolean;
  /** Specific tools to always retest */
  alwaysRetest?: string[];
  /** Maximum age of cached results in hours (default: 168 = 1 week) */
  maxCacheAgeHours?: number;
}

/**
 * Determine which tools need testing based on schema changes.
 *
 * Algorithm:
 * 1. Load previous baseline
 * 2. Compare current tool schemas to baseline inputSchemaHash
 * 3. Return list of tools that need testing (new or changed)
 * 4. Return cached fingerprints for unchanged tools
 *
 * @param currentTools - Current tools from discovery
 * @param baseline - Previous baseline to compare against
 * @param options - Incremental check options
 * @returns Analysis result with tools to test and cached data
 */
export function analyzeForIncremental(
  currentTools: MCPTool[],
  baseline: BehavioralBaseline | null,
  options: IncrementalCheckOptions = {}
): IncrementalCheckResult {
  const {
    forceRetest = false,
    alwaysRetest = [],
    maxCacheAgeHours = 168, // 1 week
  } = options;

  // If no baseline or force retest, test everything
  if (!baseline || forceRetest) {
    return {
      toolsToTest: currentTools.map(t => t.name),
      toolsToSkip: [],
      cachedFingerprints: [],
      changeSummary: {
        newTools: baseline ? 0 : currentTools.length,
        changedTools: 0,
        unchangedTools: 0,
        removedTools: 0,
        newToolNames: baseline ? [] : currentTools.map(t => t.name),
        changedToolNames: [],
        removedToolNames: [],
      },
    };
  }

  const toolsToTest: string[] = [];
  const toolsToSkip: string[] = [];
  const cachedFingerprints: ToolFingerprint[] = [];

  const newToolNames: string[] = [];
  const changedToolNames: string[] = [];
  const removedToolNames: string[] = [];

  // Build maps for comparison
  const baselineToolMap = new Map(getToolFingerprints(baseline).map(t => [t.name, t]));
  const currentToolSet = new Set(currentTools.map(t => t.name));

  // Check current tools against baseline
  for (const tool of currentTools) {
    const baselineTool = baselineToolMap.get(tool.name);

    // Always retest if in the alwaysRetest list
    if (alwaysRetest.includes(tool.name)) {
      toolsToTest.push(tool.name);
      continue;
    }

    if (!baselineTool) {
      // New tool - needs testing
      toolsToTest.push(tool.name);
      newToolNames.push(tool.name);
      continue;
    }

    // Check if schema changed
    const currentSchemaHash = computeSchemaHash(tool.inputSchema);
    const baselineSchemaHash = baselineTool.schemaHash;

    if (currentSchemaHash !== baselineSchemaHash) {
      // Schema changed - needs retesting
      toolsToTest.push(tool.name);
      changedToolNames.push(tool.name);
      continue;
    }

    // Check cache age if lastTestedAt is available
    if (baselineTool.lastTestedAt) {
      const testedAt = new Date(baselineTool.lastTestedAt);
      const ageHours = (Date.now() - testedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > maxCacheAgeHours) {
        // Cache too old - needs retesting
        toolsToTest.push(tool.name);
        continue;
      }
    }

    // Schema unchanged and cache valid - can skip
    toolsToSkip.push(tool.name);
    cachedFingerprints.push(baselineTool);
  }

  // Find removed tools (in baseline but not current)
  for (const [name] of baselineToolMap) {
    if (!currentToolSet.has(name)) {
      removedToolNames.push(name);
    }
  }

  return {
    toolsToTest,
    toolsToSkip,
    cachedFingerprints,
    changeSummary: {
      newTools: newToolNames.length,
      changedTools: changedToolNames.length,
      unchangedTools: toolsToSkip.length,
      removedTools: removedToolNames.length,
      newToolNames,
      changedToolNames,
      removedToolNames,
    },
  };
}

/**
 * Merge new test results with cached fingerprints to create a complete baseline.
 *
 * @param newFingerprints - Fingerprints from newly tested tools
 * @param cachedFingerprints - Fingerprints from skipped tools (cached)
 * @returns Combined fingerprints in deterministic order
 */
export function mergeFingerprints(
  newFingerprints: ToolFingerprint[],
  cachedFingerprints: ToolFingerprint[]
): ToolFingerprint[] {
  // Combine all fingerprints
  const combined = [...newFingerprints, ...cachedFingerprints];

  // Sort by name for deterministic ordering
  return combined.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Format incremental check summary for display.
 *
 * @param summary - The incremental change summary
 * @returns Human-readable summary
 */
export function formatIncrementalSummary(summary: IncrementalChangeSummary): string {
  const parts: string[] = [];

  if (summary.newTools > 0) {
    parts.push(`${summary.newTools} new tool${summary.newTools > 1 ? 's' : ''}`);
  }
  if (summary.changedTools > 0) {
    parts.push(`${summary.changedTools} changed`);
  }
  if (summary.unchangedTools > 0) {
    parts.push(`${summary.unchangedTools} cached`);
  }
  if (summary.removedTools > 0) {
    parts.push(`${summary.removedTools} removed`);
  }

  if (parts.length === 0) {
    return 'No tools to check';
  }

  return parts.join(', ');
}

/**
 * Check if incremental mode can provide meaningful speedup.
 *
 * @param result - Incremental check result
 * @returns true if skipping tools provides >20% speedup
 */
export function isIncrementalWorthwhile(result: IncrementalCheckResult): boolean {
  const total = result.toolsToTest.length + result.toolsToSkip.length;
  if (total === 0) return false;

  const skipRatio = result.toolsToSkip.length / total;
  return skipRatio > 0.2; // At least 20% can be skipped
}

/**
 * Update tool fingerprints with incremental metadata.
 *
 * @param fingerprint - Tool fingerprint to update
 * @param schemaHash - Current schema hash
 * @returns Updated fingerprint with lastTestedAt and inputSchemaHashAtTest
 */
export function addIncrementalMetadata(
  fingerprint: ToolFingerprint,
  schemaHash: string
): ToolFingerprint {
  return {
    ...fingerprint,
    lastTestedAt: new Date(),
    inputSchemaHashAtTest: schemaHash,
  };
}
