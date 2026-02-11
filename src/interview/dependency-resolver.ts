import type { MCPTool, MCPToolAnnotations } from '../transport/types.js';
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
 * Get annotation-based sort priority.
 * readOnly tools run first (0), unannotated in the middle (1), destructive last (2).
 */
function getAnnotationPriority(annotations?: MCPToolAnnotations): number {
  if (!annotations) return 1;
  if (annotations.readOnlyHint) return 0;
  if (annotations.destructiveHint) return 2;
  return 1;
}

/**
 * Get tools ordered by dependency sequence.
 * Within each dependency layer, readOnly tools run first and destructive tools run last.
 */
export function getDependencyOrder(
  dependencies: ToolDependencyInfo[],
  toolAnnotations?: Map<string, MCPToolAnnotations>
): string[] {
  return [...dependencies]
    .sort((a, b) => {
      // Primary sort: dependency layer
      const layerDiff = a.sequencePosition - b.sequencePosition;
      if (layerDiff !== 0) return layerDiff;

      // Secondary sort: annotation-based priority (readOnly first, destructive last)
      if (toolAnnotations) {
        const aPriority = getAnnotationPriority(toolAnnotations.get(a.tool));
        const bPriority = getAnnotationPriority(toolAnnotations.get(b.tool));
        const priorityDiff = aPriority - bPriority;
        if (priorityDiff !== 0) return priorityDiff;
      }

      // Tertiary: alphabetical
      return a.tool.localeCompare(b.tool);
    })
    .map((d) => d.tool);
}
