import { useState, useRef, useEffect } from "react";
import { Send, Shield, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAgent } from "@/context/AgentContext";
import { MarkdownContent } from "@/components/MarkdownContent";
import { cn } from "@/lib/utils";

interface StewardPanelProps {
  variant?: "page" | "floating" | "docked";
}

export function StewardPanel({ variant = "page" }: StewardPanelProps) {
  const { stewardMessages, sendStewardMessage, connected } = useAgent();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isFloating = variant === "floating";
  const messageCount = stewardMessages.length;

  useEffect(() => {
    if (messageCount < 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput("");

    try {
      await sendStewardMessage(content);
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isFloating
          ? "overflow-hidden rounded-[1.5rem] border border-glass-border bg-glass-bg text-foreground shadow-2xl backdrop-blur-2xl"
          : "overflow-hidden rounded-3xl border border-glass-border bg-surface-raised shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)] backdrop-blur-xl",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-3",
          isFloating
            ? "border-glass-border"
            : "border-glass-border bg-surface-2",
        )}
      >
        <Shield
          className={cn(
            "size-4",
            isFloating ? "text-amber-300" : "text-muted-foreground",
          )}
        />
        <span className="text-sm font-semibold text-foreground">
          Steward Chat
        </span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium",
            connected
              ? "bg-emerald-400/20 text-emerald-300"
              : "bg-amber-400/20 text-amber-300",
          )}
        >
          {connected ? "Live" : "Syncing"}
        </span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {stewardMessages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-[260px] space-y-2 text-center">
              <Sparkles className="mx-auto size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Ask the Steward to plan tasks, summarize progress, or coordinate
                next steps.
              </p>
            </div>
          </div>
        )}
        {stewardMessages.map((msg, i) => (
          <div
            key={`${msg.timestamp}-${i}`}
            className={`flex ${msg.from === "human" ? "justify-end" : "justify-start"}`}
          >
            {msg.from === "steward" && (
              <div className="flex items-start gap-2 max-w-[80%]">
                <Shield
                  className={cn(
                    "mt-1 size-4 shrink-0",
                    isFloating ? "text-amber-300" : "text-muted-foreground",
                  )}
                />
                <div className="rounded-2xl border border-glass-border bg-surface-2 px-3 py-2 text-sm text-foreground">
                  <MarkdownContent content={msg.content} />
                </div>
              </div>
            )}
            {msg.from === "human" && (
              <div className="max-w-[80%] rounded-2xl border border-glass-border bg-surface-3 px-3 py-2 text-sm text-foreground">
                {msg.content}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div
        className={cn(
          "flex items-end gap-2 border-t px-4 py-3",
          "border-glass-border",
        )}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the Steward... (Enter to send)"
          rows={2}
          className="flex-1 resize-none rounded-2xl border border-glass-border bg-surface-2 px-3 py-2 text-sm text-foreground transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-all active:scale-[0.98] hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
