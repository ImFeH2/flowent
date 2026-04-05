import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

export const AGENT_NODE_MIN_WIDTH = 164;
export const AGENT_NODE_MAX_WIDTH = 300;
export const AGENT_NODE_HEIGHT = 56;

export function getAgentNodeWidth(label: string): number {
  const textWidth = Array.from(label).reduce((total, char) => {
    if (char === " ") {
      return total + 4;
    }
    return total + (char.charCodeAt(0) > 255 ? 14 : 8);
  }, 0);

  return Math.max(
    AGENT_NODE_MIN_WIDTH,
    Math.min(AGENT_NODE_MAX_WIDTH, textWidth + 98),
  );
}

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

  for (const node of nodes) {
    const width =
      typeof node.width === "number" ? node.width : AGENT_NODE_MIN_WIDTH;
    const height =
      typeof node.height === "number" ? node.height : AGENT_NODE_HEIGHT;
    g.setNode(node.id, {
      width,
      height,
    });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const width =
      typeof node.width === "number" ? node.width : AGENT_NODE_MIN_WIDTH;
    const height =
      typeof node.height === "number" ? node.height : AGENT_NODE_HEIGHT;
    return {
      ...node,
      position: {
        x: pos.x - width / 2,
        y: pos.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
