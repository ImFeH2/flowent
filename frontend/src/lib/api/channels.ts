import type { TelegramSettings } from "@/types";
import { requestJson } from "./shared";

export async function fetchTelegramSettings(): Promise<TelegramSettings> {
  return requestJson<TelegramSettings>("/api/settings/telegram", {
    errorMessage: "Failed to fetch Telegram settings",
  });
}

export async function updateTelegramSettings(
  payload: Partial<Pick<TelegramSettings, "bot_token">>,
): Promise<{ status: string; telegram: TelegramSettings }> {
  return requestJson<{ status: string; telegram: TelegramSettings }>(
    "/api/settings/telegram",
    {
      method: "PATCH",
      body: payload,
      errorMessage: "Failed to save Telegram settings",
    },
  );
}

export async function approveTelegramChat(
  chatId: number,
): Promise<{ status: string; telegram: TelegramSettings }> {
  return requestJson<{ status: string; telegram: TelegramSettings }>(
    `/api/settings/telegram/approve/${chatId}`,
    {
      method: "POST",
      errorMessage: "Failed to approve Telegram chat",
    },
  );
}

export async function deletePendingTelegramChat(
  chatId: number,
): Promise<{ status: string; telegram: TelegramSettings }> {
  return requestJson<{ status: string; telegram: TelegramSettings }>(
    `/api/settings/telegram/pending/${chatId}`,
    {
      method: "DELETE",
      errorMessage: "Failed to remove pending Telegram chat",
    },
  );
}

export async function deleteTelegramChat(
  chatId: number,
): Promise<{ status: string; telegram: TelegramSettings }> {
  return requestJson<{ status: string; telegram: TelegramSettings }>(
    `/api/settings/telegram/chat/${chatId}`,
    {
      method: "DELETE",
      errorMessage: "Failed to remove Telegram chat",
    },
  );
}
