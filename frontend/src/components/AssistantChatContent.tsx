import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
  type UIEventHandler,
} from "react";
import {
  AlertCircle,
  ArrowUp,
  Brain,
  ChevronRight,
  LoaderCircle,
  MessageSquare,
  Send,
  Sparkles,
  Wrench,
} from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { MarkdownContent } from "@/components/MarkdownContent";
import { formatJsonOutput } from "@/lib/formatJsonOutput";
import { getNodeLabel } from "@/lib/nodeLabel";
import { cn } from "@/lib/utils";
import type { AssistantChatItem, HistoryEntry, Node } from "@/types";

export type AssistantChatVariant = "panel" | "floating" | "workspace";

interface AssistantChatMessagesProps {
  bottomInset?: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  items: AssistantChatItem[];
  nodes?: Map<string, Node>;
  onScroll: UIEventHandler<HTMLDivElement>;
  variant: AssistantChatVariant;
}

interface AssistantChatComposerProps {
  disabled: boolean;
  input: string;
  onChange: (value: string) => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onSend: () => void;
  overlay?: boolean;
  variant: AssistantChatVariant;
}

export function AssistantChatMessages({
  bottomInset = 0,
  scrollRef,
  items,
  nodes,
  onScroll,
  variant,
}: AssistantChatMessagesProps) {
  const isWorkspace = variant === "workspace";
  const isFloating = variant === "floating";
  const baseBottomPadding = isWorkspace ? 14 : 16;
  const visibleItems = items.filter((item) => item.type !== "SystemEntry");

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        paddingBottom: `${baseBottomPadding + bottomInset}px`,
        scrollPaddingBottom: `${baseBottomPadding + bottomInset}px`,
      }}
      className={cn(
        "flex-1 space-y-3 overflow-y-auto",
        isWorkspace ? "px-3.5 pt-3.5" : "px-4 pt-4",
      )}
    >
      {visibleItems.length === 0 &&
        (isWorkspace ? (
          <WorkspaceEmptyState />
        ) : (
          <PanelEmptyState floating={isFloating} />
        ))}

      {visibleItems.map((item, index) => (
        <TimelineItem
          key={getTimelineItemKey(item, index)}
          item={item}
          nodes={nodes}
          variant={variant}
        />
      ))}
    </div>
  );
}

export function AssistantChatComposer({
  disabled,
  input,
  onChange,
  onKeyDown,
  onSend,
  overlay = false,
  variant,
}: AssistantChatComposerProps) {
  const isWorkspace = variant === "workspace";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 20;
    const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
    const minHeight = lineHeight + paddingTop + paddingBottom;
    const maxHeight =
      lineHeight * (isWorkspace ? 8 : 7) + paddingTop + paddingBottom;

    textarea.style.height = "0px";

    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, minHeight),
      maxHeight,
    );

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input, isWorkspace]);

  return (
    <div
      className={cn(
        overlay
          ? "w-full pointer-events-auto"
          : cn("border-t border-white/6", isWorkspace ? "p-3" : "px-4 py-3"),
      )}
    >
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[0.85rem] border px-2 py-1.5 transition-[border-color,background-color,box-shadow] duration-200",
          isWorkspace
            ? "border-white/18 bg-black/[0.24] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_18px_38px_-24px_rgba(0,0,0,0.88),0_10px_18px_-14px_rgba(255,255,255,0.08)] hover:border-white/26 focus-within:border-white/34 focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_22px_46px_-26px_rgba(0,0,0,0.92),0_12px_24px_-16px_rgba(255,255,255,0.12)]"
            : "border-white/14 bg-surface-2/92 shadow-[0_0_0_1px_rgba(255,255,255,0.025),0_18px_36px_-24px_rgba(0,0,0,0.72),0_8px_16px_-12px_rgba(255,255,255,0.05)] backdrop-blur-xl hover:border-white/22 focus-within:border-white/28 focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_22px_42px_-26px_rgba(0,0,0,0.78),0_10px_20px_-14px_rgba(255,255,255,0.08)]",
        )}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            isWorkspace
              ? "Message the Assistant..."
              : "Message the Assistant... (Enter to send)"
          }
          rows={1}
          className={cn(
            "min-h-5 w-full resize-none self-center bg-transparent px-0.5 py-0 text-sm leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none",
            isWorkspace ? "rounded-[0.6rem]" : "rounded-[0.65rem]",
          )}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled}
          aria-label="Send message"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
            isWorkspace
              ? "bg-primary/[0.92] text-primary-foreground hover:bg-primary/[0.86]"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <ArrowUp className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

function TimelineItem({
  item,
  nodes,
  variant,
}: {
  item: AssistantChatItem;
  nodes?: Map<string, Node>;
  variant: AssistantChatVariant;
}) {
  if (item.type === "PendingHumanMessage") {
    return <HumanBubble content={item.content} variant={variant} pending />;
  }

  switch (item.type) {
    case "ReceivedMessage":
      if (!item.content) {
        return null;
      }
      if (item.from_id === "human") {
        return <HumanBubble content={item.content} variant={variant} />;
      }
      return (
        <MessageActivityCard
          content={item.content}
          icon={<MessageSquare className="size-3.5 text-sky-400" />}
          label={`From ${getNodeLabel(item.from_id ?? "", nodes)}`}
          tone="received"
          streaming={item.streaming}
          variant={variant}
        />
      );
    case "AssistantText":
      if (!item.content) {
        return null;
      }
      return (
        <AssistantBubble content={item.content} streaming={item.streaming} />
      );
    case "SentMessage":
      if (!item.content) {
        return null;
      }
      return (
        <MessageActivityCard
          content={item.content}
          icon={<Send className="size-3.5 text-sky-300" />}
          label={`To ${
            (item.to_ids ?? [])
              .map((id) => getNodeLabel(id, nodes))
              .join(", ") || "Unknown"
          }`}
          tone="sent"
          streaming={item.streaming}
          variant={variant}
        />
      );
    case "AssistantThinking":
      return (
        <ThinkingCard
          item={item as HistoryEntry & { type: "AssistantThinking" }}
          variant={variant}
        />
      );
    case "ToolCall":
      return (
        <ToolCallCard
          item={item as HistoryEntry & { type: "ToolCall" }}
          variant={variant}
        />
      );
    case "ErrorEntry":
      return <ErrorCard content={item.content ?? ""} variant={variant} />;
    default:
      return null;
  }
}

function HumanBubble({
  content,
  variant,
  pending = false,
}: {
  content: string;
  variant: AssistantChatVariant;
  pending?: boolean;
}) {
  const isWorkspace = variant === "workspace";

  return (
    <div className="mt-2 flex min-w-0 justify-end">
      <div
        className={cn(
          "min-w-0 overflow-hidden px-3 py-2 text-sm [overflow-wrap:anywhere]",
          isWorkspace
            ? "max-w-[85%] rounded-md border border-white/8 bg-white/[0.12] text-white"
            : "max-w-[80%] rounded-xl border border-white/10 bg-white/[0.08] text-white",
          pending && "opacity-80",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">{content}</span>
          {pending && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80">
              <LoaderCircle className="size-3 animate-spin" />
              Sending
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="group min-w-0 w-full">
      <RichContentBlock
        content={content}
        streaming={streaming}
        markdownClassName="text-sm text-foreground"
        preClassName="text-foreground/90"
      />
      <div className="mt-1 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton text={content} />
      </div>
    </div>
  );
}

function MessageActivityCard({
  content,
  icon,
  label,
  tone,
  streaming,
  variant,
}: {
  content: string;
  icon: ReactNode;
  label: string;
  tone: "received" | "sent";
  streaming?: boolean;
  variant: AssistantChatVariant;
}) {
  const isWorkspace = variant === "workspace";
  const [open, setOpen] = useState(Boolean(streaming));

  return (
    <div
      className={cn(
        "min-w-0 w-full px-2.5 py-1.5",
        isWorkspace ? "border-l border-white/8 pl-3.5" : "rounded-xl",
        tone === "received" &&
          "border-sky-500/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.03),rgba(56,189,248,0.01))]",
        tone === "sent" &&
          "border-cyan-500/20 bg-[linear-gradient(180deg,rgba(34,211,238,0.03),rgba(34,211,238,0.01))]",
      )}
    >
      <div
        aria-expanded={open}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="flex size-5 shrink-0 translate-y-px items-center justify-center text-current">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-none text-foreground/90">
          {label}
        </span>
        <span className="ml-auto" onClick={(event) => event.stopPropagation()}>
          <CopyButton text={content} />
        </span>
        {streaming ? (
          <span className="inline-flex size-5 items-center justify-center">
            <span className="relative flex size-2.5 items-center justify-center">
              <span className="absolute inline-flex size-2.5 animate-ping rounded-full bg-emerald-400/45" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <span className="sr-only">Live</span>
          </span>
        ) : null}
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </div>
      {open ? (
        <div className="mt-2 min-w-0">
          <RichContentBlock
            content={content}
            streaming={streaming}
            markdownClassName="text-[13px] text-foreground/80"
            preClassName="text-foreground/75"
          />
        </div>
      ) : null}
    </div>
  );
}

function ThinkingCard({
  item,
  variant,
}: {
  item: HistoryEntry & { type: "AssistantThinking" };
  variant: AssistantChatVariant;
}) {
  return (
    <ActivityDisclosure
      label="Thinking"
      icon={<Brain className="size-3.5 text-amber-500" />}
      tone="thinking"
      streaming={item.streaming}
      variant={variant}
      defaultOpen={item.streaming ?? false}
    >
      <RichContentBlock
        content={item.content}
        streaming={item.streaming}
        markdownClassName="text-[13px] text-foreground/80"
        preClassName="text-foreground/75"
      />
    </ActivityDisclosure>
  );
}

function ToolCallCard({
  item,
  variant,
}: {
  item: HistoryEntry & { type: "ToolCall" };
  variant: AssistantChatVariant;
}) {
  const isIdleTool = item.tool_name === "idle";
  const displayStreaming = Boolean(item.streaming) && !isIdleTool;
  const formattedArguments = formatJsonOutput(item.arguments) ?? "";
  const formattedResult = formatJsonOutput(item.result);

  return (
    <ActivityDisclosure
      label={formatToolLabel(item.tool_name)}
      icon={<Wrench className="size-3.5 text-teal-500" />}
      tone="tool"
      streaming={displayStreaming}
      variant={variant}
      defaultOpen={displayStreaming}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Arguments
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-surface-1/80 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/75">
            {formattedArguments}
          </pre>
        </div>
        {item.result || !isIdleTool ? (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Result
            </div>
            {item.result ? (
              <RichContentBlock
                content={formattedResult ?? item.result}
                streaming={displayStreaming}
                markdownClassName="text-[13px] text-foreground/80"
                preClassName="text-foreground/75"
              />
            ) : (
              <div className="rounded-lg bg-surface-1/80 px-2.5 py-2 text-[12px] text-muted-foreground">
                {displayStreaming ? "Running..." : "No result"}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </ActivityDisclosure>
  );
}

function ErrorCard({
  content,
  variant,
}: {
  content: string;
  variant: AssistantChatVariant;
}) {
  const isWorkspace = variant === "workspace";

  return (
    <div
      className={cn(
        "min-w-0 w-full space-y-2 border-l-2 border-red-500/30 bg-red-500/[0.045] px-2.5 py-1.5",
        !isWorkspace && "rounded-xl",
      )}
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="size-3.5 text-red-500" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-500">
          Error
        </span>
        <span className="ml-auto">
          <CopyButton text={content} />
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-[13px] text-red-950/80 dark:text-red-200">
        {content}
      </p>
    </div>
  );
}

function ActivityDisclosure({
  label,
  icon,
  tone,
  streaming,
  variant,
  defaultOpen,
  children,
}: {
  label: string;
  icon: ReactNode;
  tone: "thinking" | "tool";
  streaming?: boolean;
  variant: AssistantChatVariant;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isWorkspace = variant === "workspace";

  return (
    <div
      className={cn(
        "min-w-0 w-full px-2.5 py-1.5",
        isWorkspace ? "border-l border-white/8 pl-3.5" : "rounded-xl",
        tone === "thinking" &&
          "border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.03),rgba(245,158,11,0.01))]",
        tone === "tool" &&
          "border-teal-500/20 bg-[linear-gradient(180deg,rgba(20,184,166,0.03),rgba(20,184,166,0.01))]",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="flex size-5 shrink-0 translate-y-px items-center justify-center text-current">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold leading-none text-foreground/90">
            {label}
          </span>
        </span>
        {streaming ? (
          <span className="ml-auto inline-flex size-5 items-center justify-center">
            <span className="relative flex size-2.5 items-center justify-center">
              <span className="absolute inline-flex size-2.5 animate-ping rounded-full bg-emerald-400/45" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <span className="sr-only">Live</span>
          </span>
        ) : null}
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open ? <div className="mt-3 min-w-0">{children}</div> : null}
    </div>
  );
}

function RichContentBlock({
  content,
  streaming,
  markdownClassName,
  preClassName,
}: {
  content: string | null | undefined;
  streaming?: boolean;
  markdownClassName?: string;
  preClassName?: string;
}) {
  const formattedJson = formatJsonOutput(content);

  if (formattedJson) {
    return (
      <pre
        className={cn(
          "whitespace-pre-wrap break-words rounded-lg bg-surface-1/80 px-2.5 py-2 text-[11px] leading-relaxed",
          preClassName,
        )}
      >
        <StreamingText text={formattedJson} streaming={streaming} />
      </pre>
    );
  }

  if (streaming) {
    return (
      <div
        className={cn(
          "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
          markdownClassName,
        )}
      >
        <StreamingText text={content ?? ""} streaming />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <MarkdownContent content={content ?? ""} className={markdownClassName} />
    </div>
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
      {streaming ? <span className="streaming-cursor" /> : null}
    </>
  );
}

function formatToolLabel(value: string | null | undefined) {
  if (!value) {
    return "Tool Call";
  }

  return value
    .split("_")
    .map((segment) =>
      segment.length > 0
        ? `${segment[0].toUpperCase()}${segment.slice(1)}`
        : segment,
    )
    .join(" ");
}

function getTimelineItemKey(item: AssistantChatItem, index: number) {
  if (item.type === "PendingHumanMessage") {
    return item.id;
  }

  return `${item.type}-${item.timestamp}-${item.message_id ?? ""}-${item.tool_call_id ?? ""}-${index}`;
}

function WorkspaceEmptyState() {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="max-w-[220px] space-y-3 text-center">
        <div className="mx-auto flex size-11 items-center justify-center">
          <MessageSquare className="size-5 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Start a conversation</p>
          <p className="text-[11px] text-muted-foreground">
            Ask the Assistant to plan tasks, summarize progress, or coordinate
            next steps.
          </p>
        </div>
      </div>
    </div>
  );
}

function PanelEmptyState({ floating }: { floating: boolean }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-[260px] space-y-2 text-center">
        <Sparkles
          className={cn(
            "mx-auto size-5",
            floating ? "text-amber-300" : "text-muted-foreground",
          )}
        />
        <p className="text-sm text-muted-foreground">
          Ask the Assistant to plan tasks, summarize progress, or coordinate
          next steps.
        </p>
      </div>
    </div>
  );
}
