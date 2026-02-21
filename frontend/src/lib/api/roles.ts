import type { Role } from "@/types";

export async function fetchRoles(): Promise<Role[]> {
  const res = await fetch("/api/roles");
  const data = await res.json();
  return data.roles ?? [];
}

export async function createRole(
  name: string,
  system_prompt: string,
): Promise<Role> {
  const res = await fetch("/api/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, system_prompt }),
  });
  if (!res.ok) throw new Error("Failed to create role");
  return res.json();
}

export async function updateRole(
  id: string,
  updates: Partial<Omit<Role, "id">>,
): Promise<Role> {
  const res = await fetch(`/api/roles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update role");
  return res.json();
}

export async function deleteRole(id: string): Promise<void> {
  const res = await fetch(`/api/roles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete role");
}
