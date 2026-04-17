import type { Provider, Role } from "@/types";
import { requestJson } from "./shared";

export interface SettingsBootstrap<TSettings> {
  settings: TSettings;
  providers: Provider[];
  roles: Role[];
  version: string | null;
}

export interface SaveSettingsResponse<TSettings> {
  settings: TSettings;
  reauthRequired: boolean;
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

export async function saveSettings<T>(
  settings: unknown,
): Promise<SaveSettingsResponse<T>> {
  return requestJson<
    { status: string; settings: T; reauth_required?: boolean },
    SaveSettingsResponse<T>
  >("/api/settings", {
    method: "POST",
    body: settings,
    errorMessage: "Failed to save settings",
    map: (data) => {
      if (!data) {
        throw new Error("Failed to save settings");
      }
      return {
        settings: data.settings,
        reauthRequired: data.reauth_required === true,
      };
    },
  });
}
