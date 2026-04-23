import { requestJson, requestVoid } from "./shared";
import type { AgentBlueprint, BlueprintEdge, BlueprintSlot } from "@/types";

interface BlueprintsResponse {
  blueprints: AgentBlueprint[];
}

interface BlueprintPayload {
  name: string;
  description?: string;
  slots: BlueprintSlot[];
  edges: BlueprintEdge[];
}

export async function fetchBlueprints(
  signal?: AbortSignal,
): Promise<AgentBlueprint[]> {
  return requestJson<BlueprintsResponse, AgentBlueprint[]>("/api/blueprints", {
    method: "GET",
    signal,
    errorMessage: "Failed to fetch blueprints",
    fallback: [],
    map: (data) => data?.blueprints ?? [],
  });
}

export async function createBlueprintRequest(
  payload: BlueprintPayload,
): Promise<AgentBlueprint> {
  return requestJson<AgentBlueprint, AgentBlueprint>("/api/blueprints", {
    method: "POST",
    body: payload,
    errorMessage: "Failed to create blueprint",
  });
}

export async function updateBlueprintRequest(
  blueprintId: string,
  payload: BlueprintPayload,
): Promise<AgentBlueprint> {
  return requestJson<AgentBlueprint, AgentBlueprint>(
    `/api/blueprints/${blueprintId}`,
    {
      method: "PUT",
      body: payload,
      errorMessage: "Failed to update blueprint",
    },
  );
}

export async function deleteBlueprintRequest(
  blueprintId: string,
): Promise<void> {
  await requestVoid(`/api/blueprints/${blueprintId}`, {
    method: "DELETE",
    errorMessage: "Failed to delete blueprint",
  });
}

export async function saveTabAsBlueprintRequest(
  tabId: string,
  name: string,
  description = "",
): Promise<AgentBlueprint> {
  return requestJson<AgentBlueprint, AgentBlueprint>(
    `/api/workflows/${tabId}/blueprint`,
    {
      method: "POST",
      body: { name, description },
      errorMessage: "Failed to save blueprint",
    },
  );
}
