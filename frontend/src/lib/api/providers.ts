import type { Provider } from "@/types";

export async function fetchProviders(): Promise<Provider[]> {
  const res = await fetch("/api/providers");
  const data = await res.json();
  return data.providers ?? [];
}

export async function createProvider(
  data: Omit<Provider, "id">,
): Promise<Provider> {
  const res = await fetch("/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create provider");
  return res.json();
}

export async function updateProvider(
  id: string,
  updates: Partial<Omit<Provider, "id">>,
): Promise<Provider> {
  const res = await fetch(`/api/providers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update provider");
  return res.json();
}

export async function deleteProvider(id: string): Promise<void> {
  const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete provider");
}

export interface ModelOption {
  id: string;
}

export async function fetchProviderModels(
  providerId: string,
): Promise<ModelOption[]> {
  const res = await fetch("/api/providers/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider_id: providerId }),
  });
  const data = await res.json();
  return data.models ?? [];
}
