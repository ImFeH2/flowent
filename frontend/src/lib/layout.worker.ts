import type { Edge, Node } from "@xyflow/react";
import { getLayoutedElements } from "./layout";

self.addEventListener(
  "message",
  (event: MessageEvent<{ nodes: Node[]; edges: Edge[]; key: string }>) => {
    const { nodes, edges, key } = event.data;
    const layouted = getLayoutedElements(nodes, edges);
    const positions = layouted.nodes.map((node) => ({
      id: node.id,
      position: node.position,
    }));
    self.postMessage({ positions, key });
  },
);
