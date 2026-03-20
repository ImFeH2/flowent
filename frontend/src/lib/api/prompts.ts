import { requestJson } from "./shared";

export interface PromptSettings {
  custom_prompt: string;
  custom_post_prompt: string;
}

export async function fetchPromptSettings(): Promise<PromptSettings> {
  return requestJson<PromptSettings>("/api/prompts", {
    errorMessage: "Failed to fetch prompts",
  });
}

export async function savePromptSettings(
  payload: PromptSettings,
): Promise<PromptSettings> {
  return requestJson<PromptSettings>("/api/prompts", {
    method: "PUT",
    body: payload,
    errorMessage: "Failed to save prompts",
  });
}
