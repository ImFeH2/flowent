export async function fetchSettings<T>(): Promise<T> {
  const res = await fetch("/api/settings");
  return res.json() as Promise<T>;
}

export async function saveSettings(settings: unknown): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to save settings");
}

export interface MetaInfo {
  provider_types: string[];
  builtin_provider_names: string[];
}

export async function fetchMeta(): Promise<MetaInfo> {
  const res = await fetch("/api/meta");
  return res.json();
}

export interface ModelOption {
  id: string;
}

export async function fetchProviderModels(
  providerName: string,
): Promise<ModelOption[]> {
  const res = await fetch("/api/providers/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider_name: providerName }),
  });
  const data = await res.json();
  return data.models ?? [];
}
