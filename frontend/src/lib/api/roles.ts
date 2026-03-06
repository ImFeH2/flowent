import type { Role } from "@/types";
import { requestJson, requestVoid } from "./shared";

export async function fetchRoles(): Promise<Role[]> {
  return requestJson<{ roles?: Role[] }, Role[]>("/api/roles", {
    errorMessage: "Failed to fetch roles",
    fallback: [],
    map: (data) => data?.roles ?? [],
  });
}

export async function createRole(
  name: string,
  system_prompt: string,
): Promise<Role> {
  return requestJson<Role>("/api/roles", {
    method: "POST",
    body: { name, system_prompt },
    errorMessage: "Failed to create role",
  });
}

export async function updateRole(
  id: string,
  updates: Partial<Omit<Role, "id">>,
): Promise<Role> {
  return requestJson<Role>(`/api/roles/${id}`, {
    method: "PUT",
    body: updates,
    errorMessage: "Failed to update role",
  });
}

export async function deleteRole(id: string): Promise<void> {
  await requestVoid(`/api/roles/${id}`, {
    method: "DELETE",
    errorMessage: "Failed to delete role",
  });
}
