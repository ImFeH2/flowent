import { requestJson, requestVoid } from "./shared";
import type { Node, TabEdge, TaskTab } from "@/types";

interface TabsResponse {
  tabs: TaskTab[];
}

interface TabDetailResponse {
  tab: TaskTab;
  nodes: Node[];
  edges: TabEdge[];
}

interface CreateTabNodeResponse {
  id: string;
}

interface CreateTabEdgeResponse {
  id: string;
  tab_id: string;
  from_node_id: string;
  to_node_id: string;
}

export async function fetchTabs(signal?: AbortSignal): Promise<TaskTab[]> {
  return requestJson<TabsResponse, TaskTab[]>("/api/tabs", {
    method: "GET",
    signal,
    errorMessage: "Failed to fetch tabs",
    fallback: [],
    map: (data) => data?.tabs ?? [],
  });
}

export async function createTabRequest(
  title: string,
  goal = "",
  allow_network = false,
  write_dirs: string[] = [],
  blueprint_id?: string | null,
): Promise<TaskTab> {
  return requestJson<TaskTab, TaskTab>("/api/tabs", {
    method: "POST",
    body: { title, goal, allow_network, write_dirs, blueprint_id },
    errorMessage: "Failed to create tab",
  });
}

export async function deleteTabRequest(tabId: string): Promise<void> {
  await requestVoid(`/api/tabs/${tabId}`, {
    method: "DELETE",
    errorMessage: "Failed to delete tab",
  });
}

export async function fetchTabDetail(
  tabId: string,
  signal?: AbortSignal,
): Promise<TabDetailResponse> {
  return requestJson<TabDetailResponse, TabDetailResponse>(
    `/api/tabs/${tabId}`,
    {
      method: "GET",
      signal,
      errorMessage: "Failed to fetch tab detail",
    },
  );
}

export async function createTabNodeRequest(
  tabId: string,
  body: {
    role_name: string;
    name?: string | null;
    tools?: string[];
    write_dirs?: string[];
    allow_network?: boolean;
  },
): Promise<CreateTabNodeResponse> {
  return requestJson<Record<string, unknown>, CreateTabNodeResponse>(
    `/api/tabs/${tabId}/nodes`,
    {
      method: "POST",
      body,
      errorMessage: "Failed to create node",
      map: (data) => ({
        id: typeof data?.id === "string" ? data.id : "",
      }),
    },
  );
}

export async function deleteTabNodeRequest(
  tabId: string,
  nodeId: string,
): Promise<void> {
  await requestVoid(`/api/tabs/${tabId}/nodes/${nodeId}`, {
    method: "DELETE",
    errorMessage: "Failed to delete node",
  });
}

export async function createTabEdgeRequest(
  tabId: string,
  fromNodeId: string,
  toNodeId: string,
): Promise<CreateTabEdgeResponse> {
  return requestJson<CreateTabEdgeResponse, CreateTabEdgeResponse>(
    `/api/tabs/${tabId}/edges`,
    {
      method: "POST",
      body: {
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
      },
      errorMessage: "Failed to create edge",
    },
  );
}

export async function deleteTabEdgeRequest(
  tabId: string,
  fromNodeId: string,
  toNodeId: string,
): Promise<void> {
  const params = new URLSearchParams({
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
  });
  await requestVoid(`/api/tabs/${tabId}/edges?${params.toString()}`, {
    method: "DELETE",
    errorMessage: "Failed to delete edge",
  });
}
