import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteTelegramChat,
  fetchTelegramSettings,
  updateTelegramSettings,
} from "@/lib/api";
import { PageScaffold, SoftPanel } from "@/components/layout/PageScaffold";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TelegramSettings } from "@/types";

function parseAllowedUserIds(rawValue: string): number[] | null {
  const parts = rawValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return [];
  }

  const parsed: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const userId = Number(part);
    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      parsed.includes(userId)
    ) {
      return null;
    }
    parsed.push(userId);
  }
  return parsed;
}

export function ChannelsPage() {
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenDirty, setTokenDirty] = useState(false);
  const [allowedUserInput, setAllowedUserInput] = useState("");

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

  const commitAllowedUserInput = (): number[] | null => {
    if (!settings) {
      return null;
    }
    const trimmed = allowedUserInput.trim();
    if (!trimmed) {
      return settings.allowed_user_ids;
    }

    const parsed = parseAllowedUserIds(trimmed);
    if (!parsed) {
      toast.error(
        "Allowed user IDs must be positive integers separated by commas",
      );
      return null;
    }

    const nextAllowedUserIds = [
      ...settings.allowed_user_ids,
      ...parsed.filter((userId) => !settings.allowed_user_ids.includes(userId)),
    ];
    setSettings({
      ...settings,
      allowed_user_ids: nextAllowedUserIds,
    });
    setAllowedUserInput("");
    return nextAllowedUserIds;
  };

  const handleSave = async () => {
    if (!settings) {
      return;
    }
    const nextAllowedUserIds = commitAllowedUserInput();
    if (!nextAllowedUserIds) {
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<
        Pick<TelegramSettings, "bot_token" | "allowed_user_ids">
      > = {
        allowed_user_ids: nextAllowedUserIds,
      };
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

  const handleDeleteChat = async (chatId: number) => {
    try {
      const result = await deleteTelegramChat(chatId);
      setSettings(result.telegram);
      toast.success("Registered chat removed");
    } catch {
      toast.error("Failed to remove registered chat");
    }
  };

  const removeAllowedUserId = (userId: number) => {
    if (!settings) {
      return;
    }
    setSettings({
      ...settings,
      allowed_user_ids: settings.allowed_user_ids.filter(
        (existingUserId) => existingUserId !== userId,
      ),
    });
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
                  Connect a Telegram bot so authorized users can talk to the
                  same Assistant session outside the Web UI.
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  configured
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground"
                }
              >
                {configured ? "Configured" : "Not configured"}
              </Badge>
            </div>

            <div className="space-y-5">
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
                    placeholder={
                      settings.bot_token || "Enter Telegram bot token"
                    }
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
                <label className="text-sm font-medium">Allowed User IDs</label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Add Telegram user IDs allowed to send messages to the
                  Assistant.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={allowedUserInput}
                    onChange={(event) =>
                      setAllowedUserInput(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitAllowedUserInput();
                      }
                    }}
                    placeholder="123456789, 987654321"
                    className="w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all placeholder:text-muted-foreground focus:border-white/16 focus:outline-none"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={commitAllowedUserInput}
                  >
                    Add
                  </Button>
                </div>
                {settings.allowed_user_ids.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No allowed users configured.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {settings.allowed_user_ids.map((userId) => (
                      <Badge
                        key={userId}
                        variant="outline"
                        className="gap-1.5 border-white/10 bg-white/[0.03] pr-1 text-foreground"
                      >
                        {userId}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => removeAllowedUserId(userId)}
                          className="size-5 rounded-full text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                )}
              </section>

              <section className="border-t border-white/6 pt-5">
                <label className="text-sm font-medium">
                  Registered Chat IDs
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Chats are registered automatically after an authorized user
                  sends a message.
                </p>
                {settings.registered_chat_ids.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No registered chats yet.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {settings.registered_chat_ids.map((chatId) => (
                      <div
                        key={chatId}
                        className="flex items-center justify-between rounded-md border border-white/8 bg-white/[0.03] px-3 py-2"
                      >
                        <span className="font-mono text-sm text-foreground">
                          {chatId}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void handleDeleteChat(chatId)}
                          className="text-muted-foreground hover:bg-white/[0.05] hover:text-red-300"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

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
