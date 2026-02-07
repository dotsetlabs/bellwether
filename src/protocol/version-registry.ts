/**
 * MCP Protocol Version Registry.
 *
 * Single source of truth for mapping MCP protocol versions to their feature sets.
 * All downstream code should use feature flags from this module, never version strings directly.
 *
 * Supported versions:
 * - 2024-11-05: Original MCP spec (tools, resources, prompts, logging, pagination, sampling)
 * - 2025-03-26: Tool annotations, entity titles, completions, resource annotations
 * - 2025-06-18: Structured output (outputSchema), server instructions, HTTP version header
 * - 2025-11-25: Tasks, icons, extensions framework
 */

export const MCP_PROTOCOL_VERSIONS = [
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
  '2025-11-25',
] as const;

export type MCPProtocolVersion = (typeof MCP_PROTOCOL_VERSIONS)[number];

/**
 * Feature flags for version-gated behavior.
 * Each flag indicates whether a feature is available at a given protocol version.
 */
export interface MCPFeatureFlags {
  /** Tool annotations (readOnlyHint, destructiveHint, etc.) — 2025-03-26+ */
  toolAnnotations: boolean;
  /** Entity title fields (tool.title, prompt.title, resource.title) — 2025-03-26+ */
  entityTitles: boolean;
  /** Completions capability — 2025-03-26+ */
  completions: boolean;
  /** Resource annotations (audience, priority) — 2025-03-26+ */
  resourceAnnotations: boolean;
  /** Structured output (outputSchema, structuredContent) — 2025-06-18+ */
  structuredOutput: boolean;
  /** Server instructions field — 2025-06-18+ */
  serverInstructions: boolean;
  /** MCP-Protocol-Version HTTP header required — 2025-06-18+ */
  httpVersionHeader: boolean;
  /** Tasks capability — 2025-11-25+ */
  tasks: boolean;
  /** Icons metadata — 2025-11-25+ */
  icons: boolean;
}

/**
 * Internal mapping from version to feature flags.
 */
const VERSION_FEATURES: Record<MCPProtocolVersion, MCPFeatureFlags> = {
  '2024-11-05': {
    toolAnnotations: false,
    entityTitles: false,
    completions: false,
    resourceAnnotations: false,
    structuredOutput: false,
    serverInstructions: false,
    httpVersionHeader: false,
    tasks: false,
    icons: false,
  },
  '2025-03-26': {
    toolAnnotations: true,
    entityTitles: true,
    completions: true,
    resourceAnnotations: true,
    structuredOutput: false,
    serverInstructions: false,
    httpVersionHeader: false,
    tasks: false,
    icons: false,
  },
  '2025-06-18': {
    toolAnnotations: true,
    entityTitles: true,
    completions: true,
    resourceAnnotations: true,
    structuredOutput: true,
    serverInstructions: true,
    httpVersionHeader: true,
    tasks: false,
    icons: false,
  },
  '2025-11-25': {
    toolAnnotations: true,
    entityTitles: true,
    completions: true,
    resourceAnnotations: true,
    structuredOutput: true,
    serverInstructions: true,
    httpVersionHeader: true,
    tasks: true,
    icons: true,
  },
};

/**
 * Mapping from feature name to the version that introduced it.
 */
const FEATURE_INTRODUCED: Record<keyof MCPFeatureFlags, MCPProtocolVersion> = {
  toolAnnotations: '2025-03-26',
  entityTitles: '2025-03-26',
  completions: '2025-03-26',
  resourceAnnotations: '2025-03-26',
  structuredOutput: '2025-06-18',
  serverInstructions: '2025-06-18',
  httpVersionHeader: '2025-06-18',
  tasks: '2025-11-25',
  icons: '2025-11-25',
};

/**
 * Type guard: check if a string is a known MCP protocol version.
 */
export function isKnownProtocolVersion(version: string): version is MCPProtocolVersion {
  return (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(version);
}

/**
 * Get feature flags for a given protocol version.
 *
 * - Known versions return their exact feature set.
 * - Unknown versions that sort before the oldest known version get the oldest flags.
 * - Unknown versions that sort after the latest known version get the latest flags.
 */
export function getFeatureFlags(version: string): MCPFeatureFlags {
  if (isKnownProtocolVersion(version)) {
    return { ...VERSION_FEATURES[version] };
  }

  // Unknown version: compare against known range
  const oldest = MCP_PROTOCOL_VERSIONS[0];
  const latest = MCP_PROTOCOL_VERSIONS[MCP_PROTOCOL_VERSIONS.length - 1];

  if (version < oldest) {
    return { ...VERSION_FEATURES[oldest] };
  }

  return { ...VERSION_FEATURES[latest] };
}

/**
 * Get the AND-intersection of feature flags for two versions.
 * A feature is only included if both versions support it.
 * Used when comparing baselines that may have been created with different protocol versions.
 */
export function getSharedFeatureFlags(v1: string, v2: string): MCPFeatureFlags {
  const flags1 = getFeatureFlags(v1);
  const flags2 = getFeatureFlags(v2);

  const shared: MCPFeatureFlags = {
    toolAnnotations: flags1.toolAnnotations && flags2.toolAnnotations,
    entityTitles: flags1.entityTitles && flags2.entityTitles,
    completions: flags1.completions && flags2.completions,
    resourceAnnotations: flags1.resourceAnnotations && flags2.resourceAnnotations,
    structuredOutput: flags1.structuredOutput && flags2.structuredOutput,
    serverInstructions: flags1.serverInstructions && flags2.serverInstructions,
    httpVersionHeader: flags1.httpVersionHeader && flags2.httpVersionHeader,
    tasks: flags1.tasks && flags2.tasks,
    icons: flags1.icons && flags2.icons,
  };

  return shared;
}

/**
 * Get the protocol version that introduced a specific feature.
 */
export function getFeatureIntroducedVersion(feature: keyof MCPFeatureFlags): MCPProtocolVersion {
  return FEATURE_INTRODUCED[feature];
}

/**
 * Get a human-readable list of features that are NOT supported at a given version
 * but ARE supported at the latest version. Useful for CLI display.
 */
export function getExcludedFeatureNames(version: string): string[] {
  const flags = getFeatureFlags(version);
  const excluded: string[] = [];

  const FEATURE_DISPLAY_NAMES: Record<keyof MCPFeatureFlags, string> = {
    toolAnnotations: 'tool annotations',
    entityTitles: 'entity titles',
    completions: 'completions',
    resourceAnnotations: 'resource annotations',
    structuredOutput: 'structured output',
    serverInstructions: 'server instructions',
    httpVersionHeader: 'HTTP version header',
    tasks: 'tasks',
    icons: 'icons',
  };

  for (const [key, displayName] of Object.entries(FEATURE_DISPLAY_NAMES)) {
    if (!flags[key as keyof MCPFeatureFlags]) {
      excluded.push(displayName);
    }
  }

  return excluded;
}
