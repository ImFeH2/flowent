import { useState, useCallback, type ReactNode } from "react";
import { ChevronRight, MessageSquare, Brain, Wrench, Terminal, Send, Bot, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/types";

interface HistoryViewProps {
  history: HistoryEntry[];
}

export function HistoryView({ history }: HistoryViewProps) {
  return (
    <div className="space-y-1.5 p-3">
      {history.map((entry, i) => (
        <HistoryItem key={i} entry={entry} />
      ))}
    </div>
  );
}

function StreamingText({ text, streaming }: { text: string | null; streaming?: boolean }) {
  return (
    <>
      {text}
      {streaming && <span className="streaming-cursor" />}
    </>
  );
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  switch (entry.type) {
    case "system":
    case "system_injection":
      return (
        <CollapsibleBlock
          label={entry.type === "system" ? "System" : "System Injection"}
          icon={<Terminal className="size-3 text-zinc-500" />}
          className="border-zinc-700/50 bg-zinc-800/30"
          defaultOpen={false}
        >
          <pre className="text-[11px] text-zinc-500 whitespace-pre-wrap break-words leading-relaxed">
            {entry.content}
          </pre>
        </CollapsibleBlock>
      );

    case "received_message":
      return (
        <div className="rounded border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <MessageSquare className="size-3 text-blue-400" />
            <span className="text-[10px] font-medium text-blue-400">
              From {entry.from_id ? entry.from_id.slice(0, 8) : "unknown"}
            </span>
          </div>
          <p className="text-xs text-blue-200 whitespace-pre-wrap break-words">{entry.content}</p>
        </div>
      );

    case "assistant_thinking":
      return (
        <CollapsibleBlock
          label="Thinking"
          icon={<Brain className="size-3 text-amber-400" />}
          className="border-amber-500/20 bg-amber-500/5"
          defaultOpen={entry.streaming ?? false}
        >
          <p className="text-[11px] text-amber-200/80 whitespace-pre-wrap break-words leading-relaxed">
            <StreamingText text={entry.content} streaming={entry.streaming} />
          </p>
        </CollapsibleBlock>
      );

    case "assistant_text":
      return (
        <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Bot className="size-3 text-emerald-400" />
            <span className="text-[10px] font-medium text-emerald-400">Assistant</span>
          </div>
          <p className="text-xs text-emerald-200 whitespace-pre-wrap break-words leading-relaxed">
            <StreamingText text={entry.content} streaming={entry.streaming} />
          </p>
        </div>
      );

    case "tool_call": {
      const isSendMessage = entry.tool_name === "send_message";
      if (isSendMessage) {
        const toId = entry.arguments?.to_id as string | undefined;
        const content = entry.arguments?.content as string | undefined;
        return (
          <div className="rounded border border-purple-500/20 bg-purple-500/5 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Send className="size-3 text-purple-400" />
              <span className="text-[10px] font-medium text-purple-400">
                To {toId ? toId.slice(0, 8) : "unknown"}
              </span>
            </div>
            <p className="text-xs text-purple-200 whitespace-pre-wrap break-words">{content}</p>
          </div>
        );
      }
      return (
        <CollapsibleBlock
          label={entry.tool_name ?? "tool"}
          icon={<Wrench className="size-3 text-teal-400" />}
          className="border-teal-500/20 bg-teal-500/5"
          defaultOpen={entry.streaming ?? false}
        >
          <div className="space-y-2">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Arguments</div>
              <pre className="text-[11px] text-teal-200/80 whitespace-pre-wrap break-words">
                {JSON.stringify(entry.arguments, null, 2)}
              </pre>
            </div>
            {entry.content && (
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Result</div>
                <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap break-words">
                  <StreamingText text={entry.content} streaming={entry.streaming} />
                </pre>
              </div>
            )}
          </div>
        </CollapsibleBlock>
      );
    }

    case "sent_message":
      return (
        <div className="rounded border border-purple-500/20 bg-purple-500/5 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Send className="size-3 text-purple-400" />
            <span className="text-[10px] font-medium text-purple-400">
              To {entry.to_id ? entry.to_id.slice(0, 8) : "unknown"}
            </span>
          </div>
          <p className="text-xs text-purple-200 whitespace-pre-wrap break-words">{entry.content}</p>
        </div>
      );

    case "error":
      return (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <AlertCircle className="size-3 text-red-400" />
            <span className="text-[10px] font-medium text-red-400">Error</span>
          </div>
          <p className="text-xs text-red-200 whitespace-pre-wrap break-words">{entry.content}</p>
        </div>
      );

    default:
      return null;
  }
}

function CollapsibleBlock({
  label,
  icon,
  className,
  defaultOpen = false,
  children,
}: {
  label: string;
  icon: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div className={cn("rounded border", className)}>
      <button
        onClick={toggle}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-white/5 transition-colors"
      >
        <ChevronRight
          className={cn("size-3 text-zinc-500 transition-transform", open && "rotate-90")}
        />
        {icon}
        <span className="text-[10px] font-medium text-zinc-400">{label}</span>
      </button>
      {open && <div className="px-2.5 pb-2">{children}</div>}
    </div>
  );
}
