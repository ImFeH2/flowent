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
  const isDocked = variant === "docked";
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
          ? "overflow-hidden rounded-[1.5rem] border border-white/25 bg-slate-900/65 text-slate-100 shadow-2xl backdrop-blur-2xl"
          : isDocked
            ? "overflow-hidden rounded-3xl border border-white/70 bg-white/70 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)] backdrop-blur-xl"
            : "overflow-hidden rounded-3xl border border-white/70 bg-white/70 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)] backdrop-blur-xl",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-3",
          isFloating
            ? "border-white/15"
            : "border-slate-200/80 bg-gradient-to-r from-white/80 to-zinc-50/70",
        )}
      >
        <Shield
          className={cn(
            "size-4",
            isFloating ? "text-amber-300" : "text-zinc-600",
          )}
        />
        <span
          className={cn(
            "text-sm font-semibold",
            isFloating ? "text-slate-100" : "text-slate-800",
          )}
        >
          Steward Chat
        </span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium",
            connected
              ? "bg-emerald-400/20 text-emerald-300"
              : isFloating
                ? "bg-amber-300/20 text-amber-200"
                : "bg-amber-100 text-amber-700",
          )}
        >
          {connected ? "Live" : "Syncing"}
        </span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {stewardMessages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-[260px] space-y-2 text-center">
              <Sparkles
                className={cn(
                  "mx-auto size-5",
                  isFloating ? "text-zinc-300" : "text-zinc-500",
                )}
              />
              <p
                className={cn(
                  "text-sm",
                  isFloating ? "text-slate-300" : "text-slate-500",
                )}
              >
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
                    isFloating ? "text-amber-300" : "text-zinc-500",
                  )}
                />
                <div
                  className={cn(
                    "rounded-2xl border px-3 py-2 text-sm",
                    isFloating
                      ? "border-white/15 bg-slate-800/70 text-slate-100"
                      : "border-white/80 bg-white/85 text-slate-800",
                  )}
                >
                  <MarkdownContent content={msg.content} />
                </div>
              </div>
            )}
            {msg.from === "human" && (
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl border px-3 py-2 text-sm",
                  isFloating
                    ? "border-zinc-300/35 bg-zinc-400/20 text-zinc-100"
                    : "border-zinc-200 bg-zinc-50 text-zinc-800",
                )}
              >
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
          isFloating ? "border-white/15" : "border-slate-200/80",
        )}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the Steward... (Enter to send)"
          rows={2}
          className={cn(
            "flex-1 resize-none rounded-2xl border px-3 py-2 text-sm transition-colors focus:outline-none",
            isFloating
              ? "border-white/20 bg-slate-900/70 text-slate-100 placeholder:text-slate-400 focus:border-zinc-300/60"
              : "border-white/80 bg-white/90 text-slate-800 placeholder:text-slate-400 focus:border-zinc-300",
          )}
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className={cn(
            "flex size-10 items-center justify-center rounded-2xl text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            isFloating
              ? "bg-zinc-500 hover:bg-zinc-400"
              : "bg-slate-900 hover:bg-slate-700",
          )}
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
