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
): Promise<TaskTab> {
  return requestJson<TaskTab, TaskTab>("/api/tabs", {
    method: "POST",
    body: { title, goal },
    errorMessage: "Failed to create tab",
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
    x?: number;
    y?: number;
  },
): Promise<void> {
  await requestVoid(`/api/tabs/${tabId}/nodes`, {
    method: "POST",
    body,
    errorMessage: "Failed to create node",
  });
}

export async function createTabEdgeRequest(
  tabId: string,
  fromNodeId: string,
  toNodeId: string,
): Promise<void> {
  await requestVoid(`/api/tabs/${tabId}/edges`, {
    method: "POST",
    body: {
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
    },
    errorMessage: "Failed to create edge",
  });
}
