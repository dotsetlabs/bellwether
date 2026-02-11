/**
 * Cross-Tool Dependency Analyzer.
 *
 * Analyzes tool descriptions and schemas to identify dependencies
 * between tools, enabling better testing strategies and documentation.
 *
 * Detection strategies:
 * 1. Description analysis - mentions of other tool names
 * 2. Parameter name matching - params that match output field names
 * 3. Resource reference patterns - common ID/token patterns
 * 4. Workflow step order - sequence implied by tool naming
 */

import type { MCPTool } from '../transport/types.js';
import { mermaidLabel } from '../utils/index.js';

/**
 * A dependency edge between two tools.
 */
export interface DependencyEdge {
  /** Source tool that provides data */
  from: string;
  /** Target tool that consumes data */
  to: string;
  /** Type of dependency relationship */
  type: DependencyType;
  /** Confidence level of this dependency detection (0-1) */
  confidence: number;
  /** Description of the relationship */
  description: string;
  /** Which field/parameter creates the dependency */
  field?: string;
}

/**
 * Types of dependencies between tools.
 */
export type DependencyType =
  | 'mention' // Tool A's description mentions tool B
  | 'output_input' // Tool A's output is tool B's input
  | 'resource_ref' // Tool A creates resource that tool B uses
  | 'sequence' // Tool A must run before tool B (implied)
  | 'shared_resource'; // Both tools operate on same resource

/**
 * Full dependency graph for a set of tools.
 */
export interface DependencyGraph {
  /** All dependency edges */
  edges: DependencyEdge[];
  /** Tools grouped by layer (no dependencies -> most dependencies) */
  layers: string[][];
  /** Tools with no dependencies (entry points) */
  entryPoints: string[];
  /** Tools with no dependents (terminal operations) */
  terminalPoints: string[];
  /** Detected cycles (if any) */
  cycles: string[][];
}

/**
 * Statistics about the dependency graph.
 */
export interface DependencyStats {
  /** Total number of edges */
  totalEdges: number;
  /** Edges by type */
  byType: Record<DependencyType, number>;
  /** Average dependencies per tool */
  avgDependencies: number;
  /** Maximum dependency chain length */
  maxChainLength: number;
  /** Tools with most dependencies */
  mostDependent: Array<{ tool: string; count: number }>;
  /** Tools most depended upon */
  mostDependedUpon: Array<{ tool: string; count: number }>;
}

// Common patterns for tool relationships
const DEPENDENCY_PATTERNS = [
  // "requires output from X" / "requires X"
  {
    pattern: /requires?\s+(?:output\s+from\s+)?['"`]?(\w+)['"`]?/gi,
    type: 'mention' as DependencyType,
  },
  // "after calling X" / "after X"
  { pattern: /after\s+(?:calling\s+)?['"`]?(\w+)['"`]?/gi, type: 'sequence' as DependencyType },
  // "use result from X" / "use output of X"
  {
    pattern: /use\s+(?:the\s+)?(?:result|output)\s+(?:of|from)\s+['"`]?(\w+)['"`]?/gi,
    type: 'output_input' as DependencyType,
  },
  // "first call X" / "call X first"
  {
    pattern: /(?:first\s+call|call\s+first)\s+['"`]?(\w+)['"`]?/gi,
    type: 'sequence' as DependencyType,
  },
  // "chain with X" / "chains to X"
  { pattern: /chains?\s+(?:with|to)\s+['"`]?(\w+)['"`]?/gi, type: 'sequence' as DependencyType },
  // "needs X" / "need X to"
  { pattern: /needs?\s+['"`]?(\w+)['"`]?\s+(?:to|first)?/gi, type: 'mention' as DependencyType },
  // "X returns ... which is used by"
  {
    pattern: /['"`]?(\w+)['"`]?\s+returns?.*which\s+is\s+used/gi,
    type: 'output_input' as DependencyType,
  },
];

// Common ID/token parameter patterns that suggest dependencies
const ID_PARAMETER_PATTERNS = [
  { pattern: /^(item|access|session|auth|link|public)_?token$/i, prefix: 'link' },
  { pattern: /^(item|account|user|resource|entity)_?id$/i, prefix: '' },
  { pattern: /^(cursor|next_?cursor|page_?token)$/i, prefix: '' },
  { pattern: /^(file|resource)_?path$/i, prefix: '' },
];

// Common output field names that create resources
// Note: Reserved for future enhanced dependency detection
const _RESOURCE_OUTPUT_PATTERNS = [
  'id',
  'item_id',
  'account_id',
  'user_id',
  'token',
  'link_token',
  'access_token',
  'session_id',
  'path',
  'file_path',
  'resource_id',
];
void _RESOURCE_OUTPUT_PATTERNS;

/**
 * Analyze dependencies between tools.
 */
export function analyzeDependencies(tools: MCPTool[]): DependencyGraph {
  const edges: DependencyEdge[] = [];
  const toolNames = new Set(tools.map((t) => t.name.toLowerCase()));
  const toolMap = new Map(tools.map((t) => [t.name.toLowerCase(), t]));

  for (const tool of tools) {
    // Strategy 1: Description analysis
    const mentionEdges = extractToolMentions(tool, tools, toolNames);
    edges.push(...mentionEdges);

    // Strategy 2: Parameter name matching
    const paramEdges = findParameterMatches(tool, tools);
    edges.push(...paramEdges);

    // Strategy 3: Resource reference patterns
    const resourceEdges = findResourceReferences(tool, tools, toolMap);
    edges.push(...resourceEdges);

    // Strategy 4: Sequence patterns from naming
    const sequenceEdges = findSequencePatterns(tool, tools, toolNames);
    edges.push(...sequenceEdges);
  }

  // Deduplicate edges (keep highest confidence for each pair)
  const deduped = deduplicateEdges(edges);

  // Build graph structure
  return buildGraph(deduped, tools);
}

/**
 * Extract tool mentions from a tool's description.
 */
function extractToolMentions(
  tool: MCPTool,
  allTools: MCPTool[],
  toolNames: Set<string>
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const description = tool.description || '';

  // Check explicit patterns
  for (const { pattern, type } of DEPENDENCY_PATTERNS) {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      const mentionedTool = match[1].toLowerCase();
      if (toolNames.has(mentionedTool) && mentionedTool !== tool.name.toLowerCase()) {
        edges.push({
          from: mentionedTool,
          to: tool.name,
          type,
          confidence: 0.9,
          description: `${tool.name} description mentions ${mentionedTool}`,
        });
      }
    }
  }

  // Check for direct tool name mentions
  for (const otherTool of allTools) {
    if (otherTool.name === tool.name) continue;

    const nameVariants = [
      otherTool.name,
      otherTool.name.replace(/_/g, ' '),
      otherTool.name.replace(/_/g, '-'),
    ];

    for (const variant of nameVariants) {
      if (description.toLowerCase().includes(variant.toLowerCase())) {
        // Check if already found via pattern
        const existingEdge = edges.find(
          (e) => e.from === otherTool.name.toLowerCase() || e.from === otherTool.name
        );
        if (!existingEdge) {
          edges.push({
            from: otherTool.name,
            to: tool.name,
            type: 'mention',
            confidence: 0.6,
            description: `${tool.name} description mentions ${otherTool.name}`,
          });
        }
      }
    }
  }

  return edges;
}

/**
 * Find dependencies based on parameter name matching.
 */
function findParameterMatches(tool: MCPTool, allTools: MCPTool[]): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const schema = tool.inputSchema as
    | { properties?: Record<string, unknown>; required?: string[] }
    | undefined;

  if (!schema?.properties) return edges;

  const params = Object.keys(schema.properties);

  for (const param of params) {
    // Check if this param matches known ID/token patterns
    for (const { pattern, prefix } of ID_PARAMETER_PATTERNS) {
      if (!pattern.test(param)) continue;

      // Look for tools that might produce this
      for (const otherTool of allTools) {
        if (otherTool.name === tool.name) continue;

        // Check if other tool name suggests it produces this type of output
        const otherName = otherTool.name.toLowerCase();
        const paramLower = param.toLowerCase();

        // E.g., param "item_id" might come from "get_item", "create_item", "link_exchange"
        const resourceType = paramLower.replace(/_?(id|token)$/i, '');

        if (
          otherName.includes(resourceType) ||
          (prefix && otherName.includes(prefix)) ||
          otherName.includes('create') ||
          otherName.includes('link') ||
          otherName.includes('exchange')
        ) {
          edges.push({
            from: otherTool.name,
            to: tool.name,
            type: 'output_input',
            confidence: 0.5,
            description: `${tool.name}.${param} may use output from ${otherTool.name}`,
            field: param,
          });
        }
      }
    }
  }

  return edges;
}

/**
 * Find resource reference patterns.
 */
function findResourceReferences(
  tool: MCPTool,
  allTools: MCPTool[],
  _toolMap: Map<string, MCPTool>
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const toolName = tool.name.toLowerCase();

  // Extract resource type from tool name
  const resourceMatch = toolName.match(/(?:get|list|update|delete|search|find)_?(\w+)/);
  if (!resourceMatch) return edges;

  const resourceType = resourceMatch[1];

  // Look for create/link tools for this resource
  for (const otherTool of allTools) {
    if (otherTool.name === tool.name) continue;

    const otherName = otherTool.name.toLowerCase();

    // create_X -> [get|list|update|delete]_X dependency
    if (
      otherName.includes(resourceType) &&
      (otherName.includes('create') ||
        otherName.includes('add') ||
        otherName.includes('link') ||
        otherName.includes('exchange'))
    ) {
      edges.push({
        from: otherTool.name,
        to: tool.name,
        type: 'resource_ref',
        confidence: 0.7,
        description: `${otherTool.name} creates ${resourceType} used by ${tool.name}`,
        field: resourceType,
      });
    }
  }

  return edges;
}

/**
 * Find sequence patterns from tool naming conventions.
 */
function findSequencePatterns(
  tool: MCPTool,
  _allTools: MCPTool[],
  toolNames: Set<string>
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const toolName = tool.name.toLowerCase();

  // Common sequence patterns
  const sequences = [
    { suffix: '_sync', precedent: '_link', confidence: 0.6 },
    { suffix: '_sync', precedent: '_exchange', confidence: 0.6 },
    { suffix: '_list', precedent: '_sync', confidence: 0.5 },
    { suffix: '_search', precedent: '_sync', confidence: 0.5 },
    { suffix: '_details', precedent: '_list', confidence: 0.5 },
    { suffix: '_update', precedent: '_get', confidence: 0.4 },
    { suffix: '_delete', precedent: '_get', confidence: 0.4 },
    { prefix: 'get_', precedent: 'create_', confidence: 0.5 },
    { prefix: 'list_', precedent: 'create_', confidence: 0.5 },
    { prefix: 'update_', precedent: 'create_', confidence: 0.5 },
  ];

  for (const { suffix, prefix, precedent, confidence } of sequences) {
    // Check if current tool matches the suffix/prefix pattern
    let resourcePart = '';
    if (suffix && toolName.endsWith(suffix)) {
      resourcePart = toolName.slice(0, -suffix.length);
    } else if (prefix && toolName.startsWith(prefix)) {
      resourcePart = toolName.slice(prefix.length);
    }

    if (!resourcePart) continue;

    // Look for the precedent tool
    const precedentName = precedent.startsWith('_')
      ? resourcePart + precedent
      : precedent + resourcePart;

    if (toolNames.has(precedentName)) {
      edges.push({
        from: precedentName,
        to: tool.name,
        type: 'sequence',
        confidence,
        description: `${precedentName} typically runs before ${tool.name}`,
      });
    }
  }

  return edges;
}

/**
 * Deduplicate edges, keeping highest confidence for each pair.
 */
function deduplicateEdges(edges: DependencyEdge[]): DependencyEdge[] {
  const edgeMap = new Map<string, DependencyEdge>();

  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`;
    const existing = edgeMap.get(key);

    if (!existing || edge.confidence > existing.confidence) {
      edgeMap.set(key, edge);
    }
  }

  return Array.from(edgeMap.values());
}

/**
 * Build the full dependency graph from edges.
 */
function buildGraph(edges: DependencyEdge[], tools: MCPTool[]): DependencyGraph {
  const toolNames = tools.map((t) => t.name);

  // Build adjacency lists
  const dependsOn = new Map<string, Set<string>>();
  const dependedBy = new Map<string, Set<string>>();

  for (const name of toolNames) {
    dependsOn.set(name, new Set());
    dependedBy.set(name, new Set());
  }

  for (const edge of edges) {
    dependsOn.get(edge.to)?.add(edge.from);
    dependedBy.get(edge.from)?.add(edge.to);
  }

  // Find entry points (no dependencies)
  const entryPoints = toolNames.filter((name) => (dependsOn.get(name)?.size ?? 0) === 0);

  // Find terminal points (no dependents)
  const terminalPoints = toolNames.filter((name) => (dependedBy.get(name)?.size ?? 0) === 0);

  // Build layers using topological sort
  const layers = topologicalLayers(toolNames, dependsOn);

  // Detect cycles
  const cycles = detectCycles(toolNames, dependsOn);

  return {
    edges,
    layers,
    entryPoints,
    terminalPoints,
    cycles,
  };
}

/**
 * Build layers using topological sort (tools with same depth in same layer).
 */
function topologicalLayers(toolNames: string[], dependsOn: Map<string, Set<string>>): string[][] {
  const layers: string[][] = [];
  const depth = new Map<string, number>();

  // Initialize depths
  for (const name of toolNames) {
    depth.set(name, 0);
  }

  // Calculate depths iteratively
  let changed = true;
  let iterations = 0;
  const maxIterations = toolNames.length * 2; // Prevent infinite loops

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const name of toolNames) {
      const deps = dependsOn.get(name) ?? new Set();
      let maxDepDepth = -1;

      for (const dep of deps) {
        const depDepth = depth.get(dep) ?? 0;
        if (depDepth > maxDepDepth) {
          maxDepDepth = depDepth;
        }
      }

      const newDepth = maxDepDepth + 1;
      if (newDepth > (depth.get(name) ?? 0)) {
        depth.set(name, newDepth);
        changed = true;
      }
    }
  }

  // Group by depth
  const maxDepth = Math.max(...Array.from(depth.values()));
  for (let d = 0; d <= maxDepth; d++) {
    const layerTools = toolNames.filter((name) => depth.get(name) === d);
    if (layerTools.length > 0) {
      layers.push(layerTools);
    }
  }

  return layers;
}

/**
 * Detect cycles in the dependency graph.
 */
function detectCycles(toolNames: string[], dependsOn: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (recursionStack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart);
      cycle.push(node);
      cycles.push(cycle);
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const deps = dependsOn.get(node) ?? new Set();
    for (const dep of deps) {
      dfs(dep, [...path]);
    }

    recursionStack.delete(node);
  }

  for (const name of toolNames) {
    if (!visited.has(name)) {
      dfs(name, []);
    }
  }

  return cycles;
}

/**
 * Calculate statistics about the dependency graph.
 */
export function calculateDependencyStats(graph: DependencyGraph): DependencyStats {
  const byType: Record<DependencyType, number> = {
    mention: 0,
    output_input: 0,
    resource_ref: 0,
    sequence: 0,
    shared_resource: 0,
  };

  for (const edge of graph.edges) {
    byType[edge.type]++;
  }

  // Count dependencies per tool
  const depCounts = new Map<string, number>();
  const depOnCounts = new Map<string, number>();

  for (const edge of graph.edges) {
    depCounts.set(edge.to, (depCounts.get(edge.to) ?? 0) + 1);
    depOnCounts.set(edge.from, (depOnCounts.get(edge.from) ?? 0) + 1);
  }

  const mostDependent = Array.from(depCounts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const mostDependedUpon = Array.from(depOnCounts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalTools = new Set([...graph.edges.map((e) => e.from), ...graph.edges.map((e) => e.to)])
    .size;

  return {
    totalEdges: graph.edges.length,
    byType,
    avgDependencies: totalTools > 0 ? graph.edges.length / totalTools : 0,
    maxChainLength: graph.layers.length,
    mostDependent,
    mostDependedUpon,
  };
}

/**
 * Generate a Mermaid diagram for the dependency graph.
 */
export function generateDependencyMermaid(graph: DependencyGraph): string {
  const lines: string[] = ['graph TD'];

  // Group edges by confidence for styling
  const highConfidence = graph.edges.filter((e) => e.confidence >= 0.7);
  const mediumConfidence = graph.edges.filter((e) => e.confidence >= 0.5 && e.confidence < 0.7);
  const lowConfidence = graph.edges.filter((e) => e.confidence < 0.5);

  // Add high confidence edges (solid lines)
  for (const edge of highConfidence) {
    const fromLabel = mermaidLabel(edge.from);
    const toLabel = mermaidLabel(edge.to);
    lines.push(`    ${fromLabel} --> ${toLabel}`);
  }

  // Add medium confidence edges (dashed lines)
  for (const edge of mediumConfidence) {
    const fromLabel = mermaidLabel(edge.from);
    const toLabel = mermaidLabel(edge.to);
    lines.push(`    ${fromLabel} -.-> ${toLabel}`);
  }

  // Add low confidence edges (dotted, if any)
  if (lowConfidence.length > 0 && lowConfidence.length <= 10) {
    for (const edge of lowConfidence) {
      const fromLabel = mermaidLabel(edge.from);
      const toLabel = mermaidLabel(edge.to);
      lines.push(`    ${fromLabel} -..-> ${toLabel}`);
    }
  }

  // Track styled nodes to prevent duplicates (a node can be both entry and terminal)
  const styledNodes = new Set<string>();

  // Add styling for entry points (green - tools that others depend on)
  if (graph.entryPoints.length > 0) {
    for (const entry of graph.entryPoints.slice(0, 10)) {
      const label = mermaidLabel(entry);
      if (!styledNodes.has(label)) {
        lines.push(`    style ${label} fill:#90EE90`);
        styledNodes.add(label);
      }
    }
  }

  // Add styling for terminal points (pink - tools that depend on others)
  // Skip if already styled as entry point to avoid duplicate declarations
  if (graph.terminalPoints.length > 0) {
    for (const terminal of graph.terminalPoints.slice(0, 10)) {
      const label = mermaidLabel(terminal);
      if (!styledNodes.has(label)) {
        lines.push(`    style ${label} fill:#FFB6C1`);
        styledNodes.add(label);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generate markdown documentation for dependencies.
 */
export function generateDependencyMarkdown(graph: DependencyGraph, stats: DependencyStats): string {
  const lines: string[] = [];

  lines.push('## Tool Dependencies');
  lines.push('');

  if (graph.edges.length === 0) {
    lines.push('No inter-tool dependencies detected.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`Detected ${graph.edges.length} dependency relationship(s) between tools.`);
  lines.push('');

  // Mermaid diagram
  if (graph.edges.length <= 50) {
    lines.push('```mermaid');
    lines.push(generateDependencyMermaid(graph));
    lines.push('```');
    lines.push('');
  }

  // Stats summary
  lines.push('### Dependency Statistics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Dependencies | ${stats.totalEdges} |`);
  lines.push(`| Avg. Dependencies/Tool | ${stats.avgDependencies.toFixed(1)} |`);
  lines.push(`| Max Chain Length | ${stats.maxChainLength} |`);
  lines.push(`| Entry Points | ${graph.entryPoints.length} |`);
  lines.push(`| Terminal Points | ${graph.terminalPoints.length} |`);
  lines.push('');

  // Dependency types breakdown
  const typeLabels: Record<DependencyType, string> = {
    mention: 'Description Mentions',
    output_input: 'Output → Input',
    resource_ref: 'Resource References',
    sequence: 'Sequence (implied)',
    shared_resource: 'Shared Resource',
  };

  const typeCounts = Object.entries(stats.byType).filter(([_, count]) => count > 0);
  if (typeCounts.length > 1) {
    lines.push('#### By Relationship Type');
    lines.push('');
    lines.push('| Type | Count |');
    lines.push('|------|-------|');
    for (const [type, count] of typeCounts) {
      lines.push(`| ${typeLabels[type as DependencyType]} | ${count} |`);
    }
    lines.push('');
  }

  // Most depended upon
  if (stats.mostDependedUpon.length > 0) {
    lines.push('#### Key Dependencies');
    lines.push('');
    lines.push('| Tool | Dependents |');
    lines.push('|------|------------|');
    for (const { tool, count } of stats.mostDependedUpon.slice(0, 5)) {
      lines.push(`| \`${tool}\` | ${count} tools depend on it |`);
    }
    lines.push('');
  }

  // Dependency details table
  if (graph.edges.length <= 30) {
    lines.push('### Dependency Details');
    lines.push('');
    lines.push('| Tool | Depends On | Relationship | Confidence |');
    lines.push('|------|-----------|--------------|------------|');

    // Sort by target tool, then confidence
    const sortedEdges = [...graph.edges].sort((a, b) => {
      if (a.to !== b.to) return a.to.localeCompare(b.to);
      return b.confidence - a.confidence;
    });

    for (const edge of sortedEdges) {
      const confidenceIcon = edge.confidence >= 0.7 ? '●' : edge.confidence >= 0.5 ? '◐' : '○';
      lines.push(
        `| \`${edge.to}\` | \`${edge.from}\` | ${edge.description} | ${confidenceIcon} ${(edge.confidence * 100).toFixed(0)}% |`
      );
    }
    lines.push('');
  }

  // Cycles warning
  if (graph.cycles.length > 0) {
    lines.push('### Circular Dependencies');
    lines.push('');
    lines.push('The following circular dependencies were detected:');
    lines.push('');
    for (const cycle of graph.cycles.slice(0, 5)) {
      lines.push(`- ${cycle.map((t) => `\`${t}\``).join(' → ')}`);
    }
    lines.push('');
  }

  // Execution layers
  if (graph.layers.length > 1) {
    lines.push('### Suggested Execution Order');
    lines.push('');
    lines.push('Based on dependencies, tools can be organized into layers:');
    lines.push('');
    for (let i = 0; i < graph.layers.length && i < 5; i++) {
      const layer = graph.layers[i];
      lines.push(`${i + 1}. ${layer.map((t) => `\`${t}\``).join(', ')}`);
    }
    if (graph.layers.length > 5) {
      lines.push(`... and ${graph.layers.length - 5} more layers`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
