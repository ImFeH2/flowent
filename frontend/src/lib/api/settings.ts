import { requestJson, requestVoid } from "./shared";

export async function fetchSettings<T>(): Promise<T> {
  return requestJson<T>("/api/settings", {
    errorMessage: "Failed to fetch settings",
  });
}

export async function saveSettings(settings: unknown): Promise<void> {
  await requestVoid("/api/settings", {
    method: "POST",
    body: settings,
    errorMessage: "Failed to save settings",
  });
}
