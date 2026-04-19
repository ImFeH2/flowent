import { useMemo, useState } from "react";
import useSWR from "swr";
import { Check, Eye, EyeOff, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  approveTelegramChat,
  deletePendingTelegramChat,
  deleteTelegramChat,
  fetchTelegramSettings,
  updateTelegramSettings,
} from "@/lib/api";
import { PageScaffold, SoftPanel } from "@/components/layout/PageScaffold";
import { cn } from "@/lib/utils";
import type {
  TelegramApprovedChat,
  TelegramPendingChat,
  TelegramSettings,
} from "@/types";

function formatTimestamp(timestampSeconds: number): string {
  if (!timestampSeconds) {
    return "—";
  }
  return new Date(timestampSeconds * 1000).toLocaleString();
}

function getChatLabel(
  chat: TelegramPendingChat | TelegramApprovedChat,
): string {
  if (chat.display_name.trim()) {
    return chat.display_name.trim();
  }
  if (chat.username?.trim()) {
    return `@${chat.username.trim()}`;
  }
  return "Unknown chat";
}

export function ChannelsPage() {
  const {
    data: settings,
    isLoading: loading,
    mutate,
  } = useSWR("telegramSettings", fetchTelegramSettings);

  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenDirty, setTokenDirty] = useState(false);

  const configured = useMemo(
    () => Boolean(settings?.bot_token),
    [settings?.bot_token],
  );

  const handleSave = async () => {
    if (!settings) {
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<Pick<TelegramSettings, "bot_token">> = {};
      if (tokenDirty) {
        payload.bot_token = tokenInput.trim();
      }

      const result = await updateTelegramSettings(payload);
      void mutate(result.telegram, false);
      setTokenInput("");
      setTokenDirty(false);
      toast.success("Telegram settings saved");
    } catch {
      toast.error("Failed to save Telegram settings");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (chatId: number) => {
    try {
      const result = await approveTelegramChat(chatId);
      void mutate(result.telegram, false);
      toast.success("Telegram chat approved");
    } catch {
      toast.error("Failed to approve Telegram chat");
    }
  };

  const handleReject = async (chatId: number) => {
    try {
      const result = await deletePendingTelegramChat(chatId);
      void mutate(result.telegram, false);
      toast.success("Pending Telegram chat removed");
    } catch {
      toast.error("Failed to remove pending Telegram chat");
    }
  };

  const handleRevoke = async (chatId: number) => {
    try {
      const result = await deleteTelegramChat(chatId);
      void mutate(result.telegram, false);
      toast.success("Approved Telegram chat removed");
    } catch {
      toast.error("Failed to remove approved Telegram chat");
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-2 w-32 animate-pulse rounded-full bg-accent/30" />
          <p className="text-[13px] text-muted-foreground">
            Loading channels...
          </p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold>
      <div className="h-full min-h-0 overflow-y-auto pr-2 scrollbar-none pt-8">
        <div className="mx-auto max-w-[680px] pb-10">
          <SoftPanel className="space-y-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/75">
                  Telegram
                </p>
                <h2 className="mt-1.5 text-lg font-medium text-foreground">
                  Bot Channel
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  Configure the Telegram bot token and approve or revoke private
                  chats that can talk to the Assistant.
                </p>
              </div>
              <div
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                  configured
                    ? "border-graph-status-running/20 bg-graph-status-running/[0.12] text-graph-status-running"
                    : "border-graph-status-idle/20 bg-graph-status-idle/[0.12] text-graph-status-idle",
                )}
              >
                {configured ? "Configured" : "Not configured"}
              </div>
            </div>

            <section>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-[13px] font-medium text-foreground/80">
                  Bot Token
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Leave empty to keep the current token
                </span>
              </div>
              <div className="relative mt-3">
                <input
                  type={showToken ? "text" : "password"}
                  value={tokenInput}
                  onChange={(event) => {
                    setTokenInput(event.target.value);
                    setTokenDirty(true);
                  }}
                  placeholder={settings.bot_token || "Enter Telegram bot token"}
                  className="w-full rounded-lg border border-input bg-background/50 px-3.5 py-2.5 pr-10 font-mono text-[13px] text-foreground shadow-xs transition-[border-color,background-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:bg-background/65 focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((current) => !current)}
                  className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/45 hover:text-foreground"
                >
                  {showToken ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </button>
              </div>
            </section>

            <section className="border-t border-border pt-8">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-[13px] font-medium text-foreground/80">
                  Pending Private Chats
                </label>
                <span className="rounded-full border border-border bg-accent/25 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {settings.pending_chats.length} waiting
                </span>
              </div>
              {settings.pending_chats.length === 0 ? (
                <p className="mt-4 text-[13px] text-muted-foreground">
                  No pending chats.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {settings.pending_chats.map((chat) => (
                    <div
                      key={chat.chat_id}
                      className="rounded-xl border border-border bg-card/30 px-4 py-3.5 transition-colors hover:bg-accent/20"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-foreground">
                            {getChatLabel(chat)}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="font-mono">
                              ID: {chat.chat_id}
                            </span>
                            {chat.username ? (
                              <span>@{chat.username}</span>
                            ) : null}
                            <span>
                              First seen: {formatTimestamp(chat.first_seen_at)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleApprove(chat.chat_id)}
                            className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                          >
                            <Check className="size-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReject(chat.chat_id)}
                            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="border-t border-border pt-8">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-[13px] font-medium text-foreground/80">
                  Approved Private Chats
                </label>
                <span className="rounded-full border border-border bg-accent/25 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {settings.approved_chats.length} active
                </span>
              </div>
              {settings.approved_chats.length === 0 ? (
                <p className="mt-4 text-[13px] text-muted-foreground">
                  No approved chats yet.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {settings.approved_chats.map((chat) => (
                    <div
                      key={chat.chat_id}
                      className="group rounded-xl border border-border bg-card/30 px-4 py-3.5 transition-colors hover:bg-accent/20"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-foreground">
                            {getChatLabel(chat)}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="font-mono">
                              ID: {chat.chat_id}
                            </span>
                            {chat.username ? (
                              <span>@{chat.username}</span>
                            ) : null}
                            <span>
                              Approved: {formatTimestamp(chat.approved_at)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRevoke(chat.chat_id)}
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="flex justify-end border-t border-border pt-6">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex h-9 items-center gap-2 rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Save className="size-4" />
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </SoftPanel>
        </div>
      </div>
    </PageScaffold>
  );
}
