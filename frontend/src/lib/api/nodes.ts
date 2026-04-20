import type { ContentPart, Node, NodeDetail } from "@/types";
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

export async function clearAssistantChatRequest(nodeId: string): Promise<void> {
  await requestVoid(`/api/nodes/${nodeId}/clear-chat`, {
    method: "POST",
    errorMessage: "Failed to clear assistant chat",
  });
}

export async function dispatchNodeMessageRequest(
  nodeId: string,
  input: {
    content?: string;
    parts?: ContentPart[];
  },
): Promise<{ message_id?: string | null }> {
  return requestJson<
    { status: string; message_id?: string | null },
    { message_id?: string | null }
  >(`/api/nodes/${nodeId}/messages`, {
    method: "POST",
    body: {
      content: input.content,
      parts: input.parts,
    },
    errorMessage: "Failed to send node message",
    map: (data) => ({
      message_id:
        typeof data?.message_id === "string" ? data.message_id : undefined,
    }),
  });
}
