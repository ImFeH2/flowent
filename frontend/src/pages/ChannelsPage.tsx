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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
          <div className="mx-auto h-2 w-32 rounded-full skeleton-shimmer" />
          <p className="text-sm text-muted-foreground">Loading channels...</p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold
      title="Channels"
      description="External messaging integrations"
    >
      <div className="h-full min-h-0 overflow-y-auto pr-2">
        <div className="mx-auto max-w-3xl pb-6">
          <SoftPanel className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
                  Telegram
                </p>
                <h2 className="mt-1 text-base font-semibold">Bot Channel</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only private chats are supported in this first version.
                  Unapproved chats are listed here by chat ID so you can approve
                  them directly from the Web UI.
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  configured
                    ? "border-white/14 bg-white/[0.07] text-white/88"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground"
                }
              >
                {configured ? "Configured" : "Not configured"}
              </Badge>
            </div>

            <section>
              <label className="text-sm font-medium">Bot Token</label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Token from @BotFather. Leave untouched to keep the current
                token.
              </p>
              <div className="relative mt-3">
                <input
                  type={showToken ? "text" : "password"}
                  value={tokenInput}
                  onChange={(event) => {
                    setTokenInput(event.target.value);
                    setTokenDirty(true);
                  }}
                  placeholder={settings.bot_token || "Enter Telegram bot token"}
                  className="w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 pr-10 text-sm transition-all placeholder:text-muted-foreground focus:border-white/16 focus:outline-none"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowToken((current) => !current)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                >
                  {showToken ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
            </section>

            <section className="border-t border-white/6 pt-5">
              <label className="text-sm font-medium">
                Pending Private Chats
              </label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Private chats that contacted the bot but are not approved yet.
              </p>
              {settings.pending_chats.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No pending chats.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {settings.pending_chats.map((chat) => (
                    <div
                      key={chat.chat_id}
                      className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {getChatLabel(chat)}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            chat_id: {chat.chat_id}
                          </p>
                          {chat.username ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              @{chat.username}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-muted-foreground">
                            First seen: {formatTimestamp(chat.first_seen_at)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Last seen: {formatTimestamp(chat.last_seen_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleApprove(chat.chat_id)}
                          >
                            <Check className="size-4" />
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void handleReject(chat.chat_id)}
                            className="text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="border-t border-white/6 pt-5">
              <label className="text-sm font-medium">
                Approved Private Chats
              </label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Approved chats can send messages to the Assistant and receive
                Assistant output.
              </p>
              {settings.approved_chats.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No approved chats yet.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {settings.approved_chats.map((chat) => (
                    <div
                      key={chat.chat_id}
                      className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {getChatLabel(chat)}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            chat_id: {chat.chat_id}
                          </p>
                          {chat.username ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              @{chat.username}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-muted-foreground">
                            Approved: {formatTimestamp(chat.approved_at)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void handleRevoke(chat.chat_id)}
                          className="shrink-0 text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="flex justify-end border-t border-white/6 pt-5">
              <Button onClick={() => void handleSave()} disabled={saving}>
                <Save className="size-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </SoftPanel>
        </div>
      </div>
    </PageScaffold>
  );
}
