import type { Provider, Role, RoleModelConfig } from "@/types";
import type { ToolInfo } from "./meta";
import { requestJson, requestVoid } from "./shared";

type RolePayload = {
  name: string;
  system_prompt: string;
  model: RoleModelConfig | null;
  included_tools: string[];
  excluded_tools: string[];
};

export interface RolesBootstrap {
  roles: Role[];
  providers: Provider[];
  tools: ToolInfo[];
}

export async function fetchRoles(): Promise<Role[]> {
  return requestJson<{ roles?: Role[] }, Role[]>("/api/roles", {
    errorMessage: "Failed to fetch roles",
    fallback: [],
    map: (data) => data?.roles ?? [],
  });
}

export async function fetchRolesBootstrap(): Promise<RolesBootstrap> {
  return requestJson<RolesBootstrap>("/api/roles/bootstrap", {
    errorMessage: "Failed to fetch roles bootstrap",
  });
}

export async function createRole(role: RolePayload): Promise<Role> {
  return requestJson<Role>("/api/roles", {
    method: "POST",
    body: role,
    errorMessage: "Failed to create role",
  });
}

export async function updateRole(
  name: string,
  updates: Partial<RolePayload>,
): Promise<Role> {
  return requestJson<Role>(`/api/roles/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: updates,
    errorMessage: "Failed to update role",
  });
}

export async function deleteRole(name: string): Promise<void> {
  await requestVoid(`/api/roles/${encodeURIComponent(name)}`, {
    method: "DELETE",
    errorMessage: "Failed to delete role",
  });
}
