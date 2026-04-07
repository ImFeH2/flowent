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
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HistoryEntry, Node } from "@/types";
import { CopyButton } from "@/components/CopyButton";
import { MarkdownContent } from "@/components/MarkdownContent";
import { getNodeLabel } from "@/lib/nodeLabel";
import { formatJsonOutput } from "@/lib/formatJsonOutput";

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
    <div className="space-y-1.5 p-2.5">
      {history.map((entry, index) => (
        <HistoryItem
          key={`${index}-${entry.timestamp}-${entry.type}-${entry.message_id ?? ""}-${entry.tool_call_id ?? ""}`}
          agentLabel={agentLabel}
          entry={entry}
          nodes={nodes}
        />
      ))}
    </div>
  );
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
          "text-[11px] whitespace-pre-wrap break-words leading-relaxed",
          preClassName,
        )}
      >
        <StreamingText text={formattedJson} streaming={streaming} />
      </pre>
    );
  }

  if (streaming) {
    return (
      <pre
        className={cn(
          "text-[11px] whitespace-pre-wrap break-words leading-relaxed",
          preClassName,
        )}
      >
        <StreamingText text={content ?? ""} streaming />
      </pre>
    );
  }

  return (
    <MarkdownContent
      content={content ?? ""}
      className={cn("text-[11px] leading-relaxed", markdownClassName)}
    />
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
      return (
        <CollapsibleBlock
          label="System"
          icon={<Terminal className="size-3 text-muted-foreground" />}
          className="border-border/40 bg-surface-1/24"
          defaultOpen={false}
        >
          <MarkdownOrJsonBlock
            content={entry.content}
            markdownClassName="text-muted-foreground"
            preClassName="text-muted-foreground leading-relaxed"
          />
        </CollapsibleBlock>
      );

    case "ReceivedMessage":
      return (
        <CollapsibleBlock
          label={`From ${getNodeLabel(entry.from_id ?? "", nodes)}`}
          icon={<MessageSquare className="size-3 text-foreground/70" />}
          className="border-white/10 bg-white/[0.024]"
          labelClassName="text-foreground/70"
          actions={<CopyButton text={entry.content ?? ""} />}
          defaultOpen={entry.streaming ?? false}
        >
          <MarkdownOrJsonBlock
            content={entry.content ?? ""}
            streaming={entry.streaming}
            markdownClassName="text-foreground/90"
            preClassName="text-foreground/90 leading-relaxed"
          />
        </CollapsibleBlock>
      );

    case "AssistantThinking":
      return (
        <CollapsibleBlock
          label="Thinking"
          icon={<Brain className="size-3 text-foreground/72" />}
          className="border-white/10 bg-white/[0.026]"
          labelClassName="text-foreground/72"
          defaultOpen={false}
        >
          <MarkdownOrJsonBlock
            content={entry.content}
            streaming={entry.streaming}
            markdownClassName="text-foreground/82"
            preClassName="text-foreground/82 leading-relaxed"
          />
        </CollapsibleBlock>
      );

    case "StateEntry":
      return (
        <CollapsibleBlock
          label={entry.state ? `State ${entry.state.toUpperCase()}` : "State"}
          icon={<Workflow className="size-3 text-foreground/62" />}
          className="border-white/8 bg-white/[0.016]"
          labelClassName="text-foreground/72"
          defaultOpen={false}
        >
          <div className="space-y-1 text-[11px] leading-relaxed text-foreground/84">
            <p className="font-mono uppercase tracking-[0.08em] text-foreground/78">
              {entry.state ?? "unknown"}
            </p>
            {entry.reason ? (
              <p className="text-muted-foreground">{entry.reason}</p>
            ) : null}
          </div>
        </CollapsibleBlock>
      );

    case "SentMessage": {
      const targets = (entry.to_ids ?? []).map((id) => getNodeLabel(id, nodes));
      return (
        <CollapsibleBlock
          label={`To ${targets.join(", ") || "Unknown"}`}
          icon={<Send className="size-3 text-foreground/58" />}
          className="border-white/8 bg-white/[0.016]"
          labelClassName="text-foreground/72"
          actions={<CopyButton text={entry.content ?? ""} />}
          defaultOpen={entry.streaming ?? false}
        >
          <MarkdownOrJsonBlock
            content={entry.content ?? ""}
            streaming={entry.streaming}
            markdownClassName="text-foreground/86"
            preClassName="text-foreground/86 leading-relaxed"
          />
        </CollapsibleBlock>
      );
    }

    case "AssistantText":
      return (
        <CollapsibleBlock
          label={agentLabel}
          icon={<Bot className="size-3 text-foreground/84" />}
          className="border-white/12 bg-surface-2/62"
          labelClassName="text-foreground/84"
          actions={<CopyButton text={entry.content ?? ""} />}
          defaultOpen={false}
        >
          <MarkdownOrJsonBlock
            content={entry.content ?? ""}
            streaming={entry.streaming}
            markdownClassName="text-foreground/88"
            preClassName="text-foreground/88 leading-relaxed"
          />
        </CollapsibleBlock>
      );

    case "ToolCall": {
      const formattedArguments = formatJsonOutput(entry.arguments) ?? "";
      const formattedResult = formatJsonOutput(entry.result);
      return (
        <CollapsibleBlock
          label={entry.tool_name ?? "tool"}
          icon={<Wrench className="size-3 text-foreground/66" />}
          className="border-white/8 bg-surface-1/5"
          labelClassName="text-foreground/72"
          defaultOpen={false}
        >
          <div className="space-y-2">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Arguments
              </div>
              <pre className="text-[11px] whitespace-pre-wrap break-words leading-relaxed text-foreground/78">
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
                  markdownClassName="text-muted-foreground"
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
          icon={<AlertCircle className="size-3 text-graph-status-error/84" />}
          className="border-graph-status-error/16 bg-graph-status-error/[0.038]"
          labelClassName="text-graph-status-error/78"
          actions={
            <CopyButton
              text={entry.content ?? ""}
              className="text-graph-status-error/84 hover:text-graph-status-error/84"
              iconClassName="text-graph-status-error/84"
              copiedClassName="text-graph-status-error/84"
            />
          }
          defaultOpen={false}
        >
          <MarkdownOrJsonBlock
            content={entry.content}
            markdownClassName="text-graph-status-error/84"
            preClassName="text-graph-status-error/84 leading-relaxed"
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
        className="flex cursor-pointer items-center gap-1.5 px-2 py-1.25 select-none"
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
            <div className={cn("px-2.5 pb-2 pt-0.5", contentClassName)}>
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
