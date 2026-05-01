import type { Node, TaskTab } from "@/types";

export function getWorkflowLeaderNode(
  nodes: Map<string, Node>,
  tab: TaskTab | null | undefined,
): Node | null {
  if (!tab?.leader_id) {
    return null;
  }
  return nodes.get(tab.leader_id) ?? null;
}
