import { requestJson, requestVoid } from "./shared";
import type { TaskTab, TabEdge, WorkflowDefinition } from "@/types";

interface TabsResponse {
  tabs: TaskTab[];
}

interface TabDetailNode {
  id: string;
  node_type: string;
  tab_id: string | null;
  role_name: string | null;
  is_leader: boolean;
  state: string;
  connections: string[];
  name: string | null;
  todos: Array<{ text: string; type: string }>;
  position: {
    x: number;
    y: number;
  } | null;
  config?: Record<string, unknown>;
  inputs?: Array<Record<string, unknown>>;
  outputs?: Array<Record<string, unknown>>;
}

interface TabDetailResponse {
  tab: TaskTab;
  nodes: TabDetailNode[];
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
  allow_network = false,
  write_dirs: string[] = [],
): Promise<TaskTab> {
  return requestJson<TaskTab, TaskTab>("/api/tabs", {
    method: "POST",
    body: { title, allow_network, write_dirs },
    errorMessage: "Failed to create tab",
  });
}

export async function duplicateTabRequest(tabId: string): Promise<TaskTab> {
  return requestJson<TaskTab, TaskTab>(`/api/tabs/${tabId}/duplicate`, {
    method: "POST",
    errorMessage: "Failed to duplicate workflow",
  });
}

export async function updateTabDefinitionRequest(
  tabId: string,
  definition: WorkflowDefinition,
): Promise<TaskTab> {
  return requestJson<TaskTab, TaskTab>(`/api/tabs/${tabId}/definition`, {
    method: "PUT",
    body: { definition },
    errorMessage: "Failed to update workflow definition",
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
    node_type?: string;
    role_name?: string | null;
    name?: string | null;
    config?: Record<string, unknown>;
    tools?: string[];
    write_dirs?: string[];
    allow_network?: boolean;
  },
): Promise<TabDetailNode> {
  return requestJson<Record<string, unknown>, TabDetailNode>(
    `/api/tabs/${tabId}/nodes`,
    {
      method: "POST",
      body,
      errorMessage: "Failed to create node",
      map: (data) =>
        ({
          id: typeof data?.id === "string" ? data.id : "",
          node_type:
            typeof data?.node_type === "string" ? data.node_type : "agent",
          tab_id: typeof data?.tab_id === "string" ? data.tab_id : null,
          role_name:
            typeof data?.role_name === "string" ? data.role_name : null,
          is_leader: data?.is_leader === true,
          state: typeof data?.state === "string" ? data.state : "idle",
          connections: Array.isArray(data?.connections)
            ? data.connections.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
          name: typeof data?.name === "string" ? data.name : null,
          todos: Array.isArray(data?.todos)
            ? (data.todos as Array<{ text: string; type: string }>)
            : [],
          position:
            data?.position &&
            typeof data.position === "object" &&
            typeof (data.position as { x?: unknown }).x === "number" &&
            typeof (data.position as { y?: unknown }).y === "number"
              ? (data.position as { x: number; y: number })
              : null,
          config:
            data?.config && typeof data.config === "object"
              ? (data.config as Record<string, unknown>)
              : undefined,
          inputs: Array.isArray(data?.inputs)
            ? (data.inputs as Array<Record<string, unknown>>)
            : undefined,
          outputs: Array.isArray(data?.outputs)
            ? (data.outputs as Array<Record<string, unknown>>)
            : undefined,
        }) satisfies TabDetailNode,
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
  input: {
    fromNodeId: string;
    fromPortKey?: string;
    toNodeId: string;
    toPortKey?: string;
    kind?: "control" | "data" | "event";
  },
): Promise<TabEdge> {
  return requestJson<TabEdge, TabEdge>(`/api/tabs/${tabId}/edges`, {
    method: "POST",
    body: {
      from_node_id: input.fromNodeId,
      from_port_key: input.fromPortKey ?? "out",
      to_node_id: input.toNodeId,
      to_port_key: input.toPortKey ?? "in",
      kind: input.kind ?? "control",
    },
    errorMessage: "Failed to create edge",
  });
}

export async function deleteTabEdgeRequest(
  tabId: string,
  input: {
    edgeId?: string;
    fromNodeId?: string;
    fromPortKey?: string;
    toNodeId?: string;
    toPortKey?: string;
  },
): Promise<void> {
  const params = new URLSearchParams();
  if (input.edgeId) {
    params.set("edge_id", input.edgeId);
  }
  if (input.fromNodeId) {
    params.set("from_node_id", input.fromNodeId);
  }
  if (input.fromPortKey) {
    params.set("from_port_key", input.fromPortKey);
  }
  if (input.toNodeId) {
    params.set("to_node_id", input.toNodeId);
  }
  if (input.toPortKey) {
    params.set("to_port_key", input.toPortKey);
  }
  await requestVoid(`/api/tabs/${tabId}/edges?${params.toString()}`, {
    method: "DELETE",
    errorMessage: "Failed to delete edge",
  });
}
