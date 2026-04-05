import type { Node, NodeDetail } from "@/types";
import { requestJson, requestVoid } from "./shared";

export async function fetchNodes(): Promise<Node[]> {
  return requestJson<{ nodes?: Node[] }, Node[]>("/api/nodes", {
    errorMessage: "Failed to fetch nodes",
    fallback: [],
    map: (data) => data?.nodes ?? [],
  });
}

export async function fetchNodeDetail(
  nodeId: string,
  signal?: AbortSignal,
): Promise<NodeDetail | null> {
  return requestJson<NodeDetail, NodeDetail | null>(`/api/nodes/${nodeId}`, {
    errorMessage: "Failed to fetch node detail",
    fallback: null,
    signal,
    swallowHttpError: true,
    map: (data) => {
      if (!data || !Array.isArray(data.history)) {
        return null;
      }
      return data;
    },
  });
}

export async function terminateNode(nodeId: string): Promise<void> {
  await requestVoid(`/api/nodes/${nodeId}/terminate`, {
    method: "POST",
    errorMessage: "Failed to terminate node",
  });
}

export async function interruptNode(nodeId: string): Promise<void> {
  await requestVoid(`/api/nodes/${nodeId}/interrupt`, {
    method: "POST",
    errorMessage: "Failed to interrupt node",
  });
}

export async function dispatchNodeMessageRequest(
  nodeId: string,
  content: string,
  fromId = "human",
): Promise<void> {
  await requestVoid(`/api/nodes/${nodeId}/messages`, {
    method: "POST",
    body: {
      content,
      from_id: fromId,
    },
    errorMessage: "Failed to send node message",
  });
}

export async function updateNodePositionRequest(
  nodeId: string,
  x: number,
  y: number,
): Promise<void> {
  await requestVoid(`/api/nodes/${nodeId}/position`, {
    method: "PATCH",
    body: { x, y },
    errorMessage: "Failed to save node position",
  });
}
