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

export async function sendNodeMessage(
  nodeId: string,
  message: string,
): Promise<void> {
  await requestVoid(`/api/nodes/${nodeId}/message`, {
    method: "POST",
    body: { message },
    errorMessage: "Failed to send node message",
  });
}

export async function terminateNode(nodeId: string): Promise<void> {
  await requestVoid(`/api/nodes/${nodeId}/terminate`, {
    method: "POST",
    errorMessage: "Failed to terminate node",
  });
}
