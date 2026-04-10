import { useEffect, useMemo, useState } from "react";
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
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenDirty, setTokenDirty] = useState(false);

  useEffect(() => {
    void fetchTelegramSettings()
      .then((data) => {
        setSettings(data);
      })
      .catch(() => {
        toast.error("Failed to load Telegram settings");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

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
      setSettings(result.telegram);
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
      setSettings(result.telegram);
      toast.success("Telegram chat approved");
    } catch {
      toast.error("Failed to approve Telegram chat");
    }
  };

  const handleReject = async (chatId: number) => {
    try {
      const result = await deletePendingTelegramChat(chatId);
      setSettings(result.telegram);
      toast.success("Pending Telegram chat removed");
    } catch {
      toast.error("Failed to remove pending Telegram chat");
    }
  };

  const handleRevoke = async (chatId: number) => {
    try {
      const result = await deleteTelegramChat(chatId);
      setSettings(result.telegram);
      toast.success("Approved Telegram chat removed");
    } catch {
      toast.error("Failed to remove approved Telegram chat");
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-2 w-32 animate-pulse rounded-full bg-white/[0.05]" />
          <p className="text-[13px] text-white/40">Loading channels...</p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold
      title="Channels"
      description="External messaging integrations."
    >
      <div className="h-full min-h-0 overflow-y-auto pr-2 scrollbar-none">
        <div className="mx-auto max-w-[680px] pb-10">
          <SoftPanel className="space-y-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">
                  Telegram
                </p>
                <h2 className="mt-1.5 text-lg font-medium text-white/90">
                  Bot Channel
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">
                  Configure the Telegram bot token and approve or revoke private
                  chats that can talk to the Assistant.
                </p>
              </div>
              <div
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                  configured
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-amber-500/20 bg-amber-500/10 text-amber-400",
                )}
              >
                {configured ? "Configured" : "Not configured"}
              </div>
            </div>

            <section>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-[13px] font-medium text-white/80">
                  Bot Token
                </label>
                <span className="text-[11px] text-white/30">
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
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 pr-10 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((current) => !current)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {showToken ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </button>
              </div>
            </section>

            <section className="border-t border-white/[0.04] pt-8">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-[13px] font-medium text-white/80">
                  Pending Private Chats
                </label>
                <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/40">
                  {settings.pending_chats.length} waiting
                </span>
              </div>
              {settings.pending_chats.length === 0 ? (
                <p className="mt-4 text-[13px] text-white/30">
                  No pending chats.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {settings.pending_chats.map((chat) => (
                    <div
                      key={chat.chat_id}
                      className="rounded-xl border border-white/[0.04] bg-white/[0.015] px-4 py-3.5 transition-colors hover:bg-white/[0.025]"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-white/90">
                            {getChatLabel(chat)}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-white/40">
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
                            className="flex h-7 items-center gap-1.5 rounded-md bg-white/[0.08] px-3 text-[11px] font-medium text-white transition-colors hover:bg-white/[0.12]"
                          >
                            <Check className="size-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReject(chat.chat_id)}
                            className="flex size-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
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

            <section className="border-t border-white/[0.04] pt-8">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-[13px] font-medium text-white/80">
                  Approved Private Chats
                </label>
                <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/40">
                  {settings.approved_chats.length} active
                </span>
              </div>
              {settings.approved_chats.length === 0 ? (
                <p className="mt-4 text-[13px] text-white/30">
                  No approved chats yet.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {settings.approved_chats.map((chat) => (
                    <div
                      key={chat.chat_id}
                      className="group rounded-xl border border-white/[0.04] bg-white/[0.015] px-4 py-3.5 transition-colors hover:bg-white/[0.025]"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-white/90">
                            {getChatLabel(chat)}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-white/40">
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
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/40 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="flex justify-end border-t border-white/[0.04] pt-6">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex h-9 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
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
