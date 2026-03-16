import { AnimatePresence, motion } from "motion/react";
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
import type { HistoryEntry, Node } from "@/types";
import { MarkdownContent } from "@/components/MarkdownContent";
import { CopyButton } from "@/components/CopyButton";
import { getNodeLabel } from "@/lib/nodeLabel";

interface HistoryViewProps {
  agentLabel?: string;
  history: HistoryEntry[];
  nodes?: Map<string, Node>;
}

export function HistoryView({
  agentLabel = "Agent",
  history,
  nodes,
}: HistoryViewProps) {
  return (
    <div className="space-y-1.5 p-3">
      {history.map((entry, index) => (
        <HistoryItem
          key={`${index}-${entry.timestamp}-${entry.type}-${entry.tool_call_id ?? ""}`}
          agentLabel={agentLabel}
          entry={entry}
          nodes={nodes}
        />
      ))}
    </div>
  );
}

function formatJsonOutput(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      return null;
    }

    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return null;
    }
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return null;
}

function MarkdownOrJsonBlock({
  content,
  markdownClassName,
  preClassName,
  streaming,
}: {
  content: string | null | undefined;
  markdownClassName?: string;
  preClassName?: string;
  streaming?: boolean;
}) {
  const formattedJson = formatJsonOutput(content);

  if (formattedJson) {
    return (
      <pre
        className={cn(
          "text-[11px] whitespace-pre-wrap break-words",
          preClassName,
        )}
      >
        <StreamingText text={formattedJson} streaming={streaming} />
      </pre>
    );
  }

  return (
    <>
      <MarkdownContent content={content ?? ""} className={markdownClassName} />
      {streaming && <span className="streaming-cursor" />}
    </>
  );
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

function HistoryItem({
  agentLabel,
  entry,
  nodes,
}: {
  agentLabel: string;
  entry: HistoryEntry;
  nodes?: Map<string, Node>;
}) {
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
          <MarkdownOrJsonBlock
            content={entry.content}
            markdownClassName="text-xs text-muted-foreground"
            preClassName="text-muted-foreground leading-relaxed"
          />
        </CollapsibleBlock>
      );

    case "ReceivedMessage":
      return (
        <CollapsibleBlock
          label={`From ${getNodeLabel(entry.from_id ?? "", nodes)}`}
          icon={<MessageSquare className="size-3 text-foreground/70" />}
          className="border-muted-foreground/25 bg-muted-foreground/10"
          labelClassName="text-foreground/70"
          actions={<CopyButton text={entry.content ?? ""} />}
          defaultOpen={false}
        >
          <MarkdownContent
            content={entry.content ?? ""}
            className="text-xs text-foreground/90"
          />
        </CollapsibleBlock>
      );

    case "AssistantThinking":
      return (
        <CollapsibleBlock
          label="Thinking"
          icon={<Brain className="size-3 text-amber-400" />}
          className="border-amber-500/20 bg-amber-500/5"
          labelClassName="text-amber-300/90"
          defaultOpen={false}
        >
          <MarkdownOrJsonBlock
            content={entry.content}
            streaming={entry.streaming}
            markdownClassName="text-xs text-amber-200/80"
            preClassName="text-amber-200/80 leading-relaxed"
          />
        </CollapsibleBlock>
      );

    case "AssistantText":
      return (
        <CollapsibleBlock
          label={agentLabel}
          icon={<Bot className="size-3 text-emerald-400" />}
          className="border-emerald-500/20 bg-emerald-500/5"
          labelClassName="text-emerald-400"
          actions={<CopyButton text={entry.content ?? ""} />}
          defaultOpen={false}
        >
          <MarkdownContent
            content={entry.content ?? ""}
            className="text-xs text-emerald-200"
          />
          {entry.streaming && <span className="streaming-cursor" />}
        </CollapsibleBlock>
      );

    case "ToolCall": {
      const isSendMessage = entry.tool_name === "send";
      const formattedArguments = formatJsonOutput(entry.arguments) ?? "";
      const formattedResult = formatJsonOutput(entry.result);
      if (isSendMessage) {
        const toId = entry.arguments?.to as string | undefined;
        const content = entry.arguments?.content as string | undefined;
        return (
          <CollapsibleBlock
            label={`To ${getNodeLabel(toId ?? "", nodes)}`}
            icon={<Send className="size-3 text-purple-400" />}
            className="border-purple-500/20 bg-purple-500/5"
            labelClassName="text-purple-400"
            actions={<CopyButton text={content ?? ""} />}
            defaultOpen={false}
          >
            <MarkdownContent
              content={content ?? ""}
              className="text-xs text-purple-200"
            />
          </CollapsibleBlock>
        );
      }
      return (
        <CollapsibleBlock
          label={entry.tool_name ?? "tool"}
          icon={<Wrench className="size-3 text-teal-400" />}
          className="border-teal-500/20 bg-teal-500/5"
          labelClassName="text-teal-300/90"
          defaultOpen={false}
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
                <MarkdownOrJsonBlock
                  content={formattedResult ?? entry.result}
                  streaming={entry.streaming}
                  markdownClassName="text-xs text-muted-foreground"
                  preClassName="text-muted-foreground"
                />
              </div>
            )}
          </div>
        </CollapsibleBlock>
      );
    }

    case "ErrorEntry":
      return (
        <CollapsibleBlock
          label="Error"
          icon={<AlertCircle className="size-3 text-red-400" />}
          className="border-red-500/30 bg-red-500/5"
          labelClassName="text-red-400"
          actions={<CopyButton text={entry.content ?? ""} />}
          defaultOpen={false}
        >
          <p className="text-xs text-red-200 whitespace-pre-wrap break-words">
            {entry.content}
          </p>
        </CollapsibleBlock>
      );

    default:
      return null;
  }
}

function CollapsibleBlock({
  actions,
  label,
  labelClassName,
  icon,
  className,
  contentClassName,
  defaultOpen = false,
  children,
}: {
  actions?: ReactNode;
  label: string;
  labelClassName?: string;
  icon: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div className={cn("rounded border", className)}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          type="button"
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:bg-surface-3/50 transition-colors"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="shrink-0">{icon}</span>
          <span
            className={cn(
              "truncate text-[10px] font-medium text-muted-foreground",
              labelClassName,
            )}
          >
            {label}
          </span>
        </button>
        {actions ? <span className="ml-auto shrink-0">{actions}</span> : null}
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className={cn("px-2.5 pb-2", contentClassName)}>
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
