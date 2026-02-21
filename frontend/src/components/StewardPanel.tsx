import { useState, useRef, useEffect } from "react";
import { Send, Shield } from "lucide-react";
import { useAgent } from "@/context/AgentContext";
import { MarkdownContent } from "@/components/MarkdownContent";

export function StewardPanel() {
  const { stewardMessages } = useAgent();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [stewardMessages]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput("");

    try {
      await fetch("/api/steward/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (_) {
      void _;
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
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Shield className="size-4 text-amber-400" />
        <span className="text-sm font-medium text-zinc-200">Steward Chat</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {stewardMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-zinc-500">
              Send a message to start a conversation with the Steward.
            </p>
          </div>
        )}
        {stewardMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.from === "human" ? "justify-end" : "justify-start"}`}
          >
            {msg.from === "steward" && (
              <div className="flex items-start gap-2 max-w-[80%]">
                <Shield className="size-4 text-amber-400 mt-1 shrink-0" />
                <div className="rounded-lg px-3 py-2 bg-zinc-800 border border-zinc-700 text-sm text-zinc-200">
                  <MarkdownContent content={msg.content} />
                </div>
              </div>
            )}
            {msg.from === "human" && (
              <div className="max-w-[80%] rounded-lg px-3 py-2 bg-blue-600/20 border border-blue-500/30 text-sm text-zinc-200">
                {msg.content}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 px-4 py-3 border-t border-zinc-800">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the Steward... (Enter to send)"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="flex items-center justify-center size-9 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
