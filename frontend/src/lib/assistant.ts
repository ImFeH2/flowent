import type { Node } from "@/types";

export function getAssistantNode(nodes: Map<string, Node>): Node | null {
  for (const node of nodes.values()) {
    if (node.node_type === "assistant") {
      return node;
    }
  }
  return null;
}

export function getAssistantNodeId(nodes: Map<string, Node>): string | null {
  return getAssistantNode(nodes)?.id ?? null;
}
