import type { Edge, Node } from "@xyflow/react";
import { getAgentGraphLayoutedElements } from "./agentGraphLayout";

self.addEventListener(
  "message",
  (event: MessageEvent<{ nodes: Node[]; edges: Edge[]; key: string }>) => {
    void (async () => {
      const { nodes, edges, key } = event.data;

      try {
        const layouted = await getAgentGraphLayoutedElements(nodes, edges);
        const positions = layouted.nodes.map((node) => ({
          id: node.id,
          position: node.position,
        }));

        self.postMessage({ positions, key });
      } catch (error) {
        self.postMessage({
          error:
            error instanceof Error
              ? error.message
              : "Failed to compute agent graph layout",
          key,
        });
      }
    })();
  },
);
