import type { MCPTool } from '../transport/types.js';
import { analyzeDependencies } from '../baseline/dependency-analyzer.js';
import type { ToolDependencyInfo } from './types.js';

/**
 * Resolve tool dependencies from schema analysis.
 */
export function resolveToolDependencies(tools: MCPTool[]): ToolDependencyInfo[] {
  const graph = analyzeDependencies(tools);
  const layerMap = new Map<string, number>();

  graph.layers.forEach((layer, index) => {
    for (const toolName of layer) {
      layerMap.set(toolName, index);
    }
  });

  return tools.map((tool) => {
    const dependsOn = graph.edges.filter((e) => e.to === tool.name).map((e) => e.from);
    const provides = graph.edges.filter((e) => e.from === tool.name).map((e) => e.to);

    return {
      tool: tool.name,
      dependsOn: Array.from(new Set(dependsOn)),
      providesOutputFor: Array.from(new Set(provides)),
      sequencePosition: layerMap.get(tool.name) ?? 0,
    };
  });
}

/**
 * Get tools ordered by dependency sequence.
 */
export function getDependencyOrder(dependencies: ToolDependencyInfo[]): string[] {
  return [...dependencies]
    .sort((a, b) => a.sequencePosition - b.sequencePosition || a.tool.localeCompare(b.tool))
    .map((d) => d.tool);
}
