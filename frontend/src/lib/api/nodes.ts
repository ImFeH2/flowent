import type { Node, NodeDetail } from "@/types";

export async function fetchNodes(): Promise<Node[]> {
  const res = await fetch("/api/nodes");
  const data = await res.json();
  return data.nodes ?? [];
}

export async function fetchNodeDetail(
  nodeId: string,
): Promise<NodeDetail | null> {
  const res = await fetch(`/api/nodes/${nodeId}`);
  const data = await res.json();
  if (data.error || !Array.isArray(data.history)) return null;
  return data as NodeDetail;
}

export async function sendNodeMessage(
  nodeId: string,
  message: string,
): Promise<void> {
  await fetch(`/api/nodes/${nodeId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

export async function terminateNode(nodeId: string): Promise<void> {
  await fetch(`/api/nodes/${nodeId}/terminate`, { method: "POST" });
}
