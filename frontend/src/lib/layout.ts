import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

export const AGENT_NODE_WIDTH = 220;
export const AGENT_NODE_HEIGHT = 62;

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

  for (const node of nodes) {
    g.setNode(node.id, {
      width: AGENT_NODE_WIDTH,
      height: AGENT_NODE_HEIGHT,
    });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - AGENT_NODE_WIDTH / 2,
        y: pos.y - AGENT_NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
