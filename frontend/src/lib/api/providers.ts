import type { Provider, ProviderModelCatalogEntry } from "@/types";
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

type ProviderDraftPayload = Omit<Provider, "id" | "models"> & {
  provider_id?: string;
};

export async function fetchProviderCatalogPreview(
  payload: ProviderDraftPayload,
): Promise<ProviderModelCatalogEntry[]> {
  return requestJson<
    { models?: ProviderModelCatalogEntry[] },
    ProviderModelCatalogEntry[]
  >("/api/providers/models", {
    method: "POST",
    body: payload,
    errorMessage: "Failed to fetch provider models",
    fallback: [],
    map: (data) => data?.models ?? [],
  });
}

export async function testProviderModelRequest(
  payload: ProviderDraftPayload & { model: string },
): Promise<{
  ok: boolean;
  duration_ms?: number;
  error_summary?: string | null;
}> {
  return requestJson<{
    ok: boolean;
    duration_ms?: number;
    error_summary?: string | null;
  }>("/api/providers/models/test", {
    method: "POST",
    body: payload,
    errorMessage: "Failed to test provider model",
  });
}
