import type { Provider, Role } from "@/types";
import { requestJson, requestVoid } from "./shared";

export interface SettingsBootstrap<TSettings> {
  settings: TSettings;
  providers: Provider[];
  roles: Role[];
  version: string | null;
}

export async function fetchSettings<T>(): Promise<T> {
  return requestJson<T>("/api/settings", {
    errorMessage: "Failed to fetch settings",
  });
}

export async function fetchSettingsBootstrap<T>(): Promise<
  SettingsBootstrap<T>
> {
  return requestJson<SettingsBootstrap<T>>("/api/settings/bootstrap", {
    errorMessage: "Failed to fetch settings bootstrap",
  });
}

export async function saveSettings(settings: unknown): Promise<void> {
  await requestVoid("/api/settings", {
    method: "POST",
    body: settings,
    errorMessage: "Failed to save settings",
  });
}
