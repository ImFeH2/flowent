import type { Provider } from "@/types";
import { requestJson, requestVoid } from "./shared";

export async function fetchProviders(): Promise<Provider[]> {
  return requestJson<{ providers?: Provider[] }, Provider[]>("/api/providers", {
    errorMessage: "Failed to fetch providers",
    fallback: [],
    map: (data) => data?.providers ?? [],
  });
}

export async function createProvider(
  data: Omit<Provider, "id">,
): Promise<Provider> {
  return requestJson<Provider>("/api/providers", {
    method: "POST",
    body: data,
    errorMessage: "Failed to create provider",
  });
}

export async function updateProvider(
  id: string,
  updates: Partial<Omit<Provider, "id">>,
): Promise<Provider> {
  return requestJson<Provider>(`/api/providers/${id}`, {
    method: "PUT",
    body: updates,
    errorMessage: "Failed to update provider",
  });
}

export async function deleteProvider(id: string): Promise<void> {
  await requestVoid(`/api/providers/${id}`, {
    method: "DELETE",
    errorMessage: "Failed to delete provider",
  });
}

export interface ModelOption {
  id: string;
}

export async function fetchProviderModels(
  providerId: string,
): Promise<ModelOption[]> {
  return requestJson<{ models?: ModelOption[] }, ModelOption[]>(
    "/api/providers/models",
    {
      method: "POST",
      body: { provider_id: providerId },
      errorMessage: "Failed to fetch provider models",
      fallback: [],
      map: (data) => data?.models ?? [],
    },
  );
}
