import { AnimatePresence, motion } from "motion/react";
import { useState, useCallback, type ReactNode } from "react";
import {
  ChevronRight,
  MessageSquare,
  Send,
  Brain,
  Wrench,
  Terminal,
  Bot,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HistoryEntry, Node } from "@/types";
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
  preClassName,
  streaming,
}: {
  content: string | null | undefined;
  preClassName?: string;
  streaming?: boolean;
}) {
  const formatted = formatJsonOutput(content) ?? content ?? "";

  return (
    <pre
      className={cn(
        "text-[11px] whitespace-pre-wrap break-words leading-relaxed",
        preClassName,
      )}
    >
      <StreamingText text={formatted} streaming={streaming} />
    </pre>
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
          <MarkdownOrJsonBlock
            content={entry.content ?? ""}
            preClassName="text-foreground/90 leading-relaxed"
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
            preClassName="text-amber-200/80 leading-relaxed"
          />
        </CollapsibleBlock>
      );

    case "SentMessage": {
      const targets = (entry.to_ids ?? []).map((id) => getNodeLabel(id, nodes));
      return (
        <CollapsibleBlock
          label={`To ${targets.join(", ") || "Unknown"}`}
          icon={<Send className="size-3 text-sky-400" />}
          className="border-sky-500/20 bg-sky-500/5"
          labelClassName="text-sky-300/90"
          actions={<CopyButton text={entry.content ?? ""} />}
          defaultOpen={false}
        >
          <MarkdownOrJsonBlock
            content={entry.content ?? ""}
            preClassName="text-sky-100/90 leading-relaxed"
          />
        </CollapsibleBlock>
      );
    }

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
          <MarkdownOrJsonBlock
            content={entry.content ?? ""}
            streaming={entry.streaming}
            preClassName="text-emerald-200 leading-relaxed"
          />
        </CollapsibleBlock>
      );

    case "ToolCall": {
      const formattedArguments = formatJsonOutput(entry.arguments) ?? "";
      const formattedResult = formatJsonOutput(entry.result);
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
              <pre className="text-[11px] whitespace-pre-wrap break-words leading-relaxed text-teal-200/80">
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
                  preClassName="text-muted-foreground leading-relaxed"
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
          <MarkdownOrJsonBlock
            content={entry.content}
            preClassName="text-red-200 leading-relaxed"
          />
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
      <div
        className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 select-none"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
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
            "flex-1 truncate text-[10px] font-medium text-muted-foreground",
            labelClassName,
          )}
        >
          {label}
        </span>
        {actions ? (
          <span
            className="ml-auto shrink-0 flex items-center leading-none"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </span>
        ) : null}
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
