import { useState, useCallback, type ReactNode } from "react";
import {
  ChevronRight,
  MessageSquare,
  Brain,
  Wrench,
  Terminal,
  Send,
  Bot,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/types";
import { MarkdownContent } from "@/components/MarkdownContent";
import { CopyButton } from "@/components/CopyButton";

interface HistoryViewProps {
  history: HistoryEntry[];
}

export function HistoryView({ history }: HistoryViewProps) {
  return (
    <div className="space-y-1.5 p-3">
      {history.map((entry) => (
        <HistoryItem
          key={`${entry.timestamp}-${entry.type}-${entry.tool_call_id ?? ""}`}
          entry={entry}
        />
      ))}
    </div>
  );
}

function formatJsonOutput(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return value;
    }

    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function StreamingText({
  text,
  streaming,
}: {
  text: string | null | undefined;
  streaming?: boolean;
}) {
  return (
    <>
      {text}
      {streaming && <span className="streaming-cursor" />}
    </>
  );
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  switch (entry.type) {
    case "SystemEntry":
    case "SystemInjection":
      return (
        <CollapsibleBlock
          label={entry.type === "SystemEntry" ? "System" : "System Injection"}
          icon={<Terminal className="size-3 text-muted-foreground" />}
          className="border-border/50 bg-surface-1/30"
          defaultOpen={false}
        >
          <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
            {entry.content}
          </pre>
        </CollapsibleBlock>
      );

    case "ReceivedMessage":
      return (
        <div className="group relative rounded border border-muted-foreground/25 bg-muted-foreground/10 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <MessageSquare className="size-3 text-foreground/70" />
            <span className="text-[10px] font-medium text-foreground/70">
              From {entry.from_id ? entry.from_id.slice(0, 8) : "unknown"}
            </span>
            <span className="ml-auto">
              <CopyButton text={entry.content ?? ""} />
            </span>
          </div>
          <MarkdownContent
            content={entry.content ?? ""}
            className="text-xs text-foreground/90"
          />
        </div>
      );

    case "AssistantThinking":
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

    case "AssistantText":
      return (
        <div className="group relative rounded border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Bot className="size-3 text-emerald-400" />
            <span className="text-[10px] font-medium text-emerald-400">
              Assistant
            </span>
            <span className="ml-auto">
              <CopyButton text={entry.content ?? ""} />
            </span>
          </div>
          <MarkdownContent
            content={entry.content ?? ""}
            className="text-xs text-emerald-200"
          />
          {entry.streaming && <span className="streaming-cursor" />}
        </div>
      );

    case "ToolCall": {
      const isSendMessage = entry.tool_name === "send";
      const formattedArguments = formatJsonOutput(entry.arguments);
      const formattedResult = formatJsonOutput(entry.result);
      if (isSendMessage) {
        const toId = entry.arguments?.to as string | undefined;
        const content = entry.arguments?.content as string | undefined;
        return (
          <div className="group relative rounded border border-purple-500/20 bg-purple-500/5 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Send className="size-3 text-purple-400" />
              <span className="text-[10px] font-medium text-purple-400">
                To {toId ? toId.slice(0, 8) : "unknown"}
              </span>
              <span className="ml-auto">
                <CopyButton text={content ?? ""} />
              </span>
            </div>
            <MarkdownContent
              content={content ?? ""}
              className="text-xs text-purple-200"
            />
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
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Arguments
              </div>
              <pre className="text-[11px] text-teal-200/80 whitespace-pre-wrap break-words">
                {formattedArguments}
              </pre>
            </div>
            {entry.result && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Result
                </div>
                <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
                  <StreamingText
                    text={formattedResult}
                    streaming={entry.streaming}
                  />
                </pre>
              </div>
            )}
          </div>
        </CollapsibleBlock>
      );
    }

    case "ErrorEntry":
      return (
        <div className="group relative rounded border border-red-500/30 bg-red-500/5 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <AlertCircle className="size-3 text-red-400" />
            <span className="text-[10px] font-medium text-red-400">Error</span>
            <span className="ml-auto">
              <CopyButton text={entry.content ?? ""} />
            </span>
          </div>
          <p className="text-xs text-red-200 whitespace-pre-wrap break-words">
            {entry.content}
          </p>
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
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-surface-3/50 transition-colors"
      >
        <ChevronRight
          className={cn(
            "size-3 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        {icon}
        <span className="text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
      </button>
      {open && <div className="px-2.5 pb-2">{children}</div>}
    </div>
  );
}
