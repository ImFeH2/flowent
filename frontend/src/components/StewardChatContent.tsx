import {
  useState,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
  type UIEventHandler,
} from "react";
import {
  AlertCircle,
  Brain,
  Check,
  ChevronRight,
  LoaderCircle,
  MessageSquare,
  Send,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { MarkdownContent } from "@/components/MarkdownContent";
import { cn } from "@/lib/utils";
import type { HistoryEntry, StewardChatItem } from "@/types";

export type StewardChatVariant = "panel" | "floating" | "workspace";

interface StewardChatMessagesProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  items: StewardChatItem[];
  onScroll: UIEventHandler<HTMLDivElement>;
  variant: StewardChatVariant;
}

interface StewardChatComposerProps {
  disabled: boolean;
  input: string;
  onChange: (value: string) => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onSend: () => void;
  variant: StewardChatVariant;
}

export function StewardChatMessages({
  scrollRef,
  items,
  onScroll,
  variant,
}: StewardChatMessagesProps) {
  const isWorkspace = variant === "workspace";
  const isFloating = variant === "floating";
  const visibleItems = items.filter(
    (item) =>
      item.type !== "SystemEntry" &&
      item.type !== "SystemInjection" &&
      !(item.type === "ToolCall" && item.tool_name === "idle"),
  );

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={cn(
        "flex-1 space-y-4 overflow-y-auto",
        isWorkspace ? "p-4" : "px-4 py-4",
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
          variant={variant}
        />
      ))}
    </div>
  );
}

export function StewardChatComposer({
  disabled,
  input,
  onChange,
  onKeyDown,
  onSend,
  variant,
}: StewardChatComposerProps) {
  const isWorkspace = variant === "workspace";

  return (
    <div
      className={cn(
        "border-glass-border border-t",
        isWorkspace ? "p-3" : "px-4 py-3",
      )}
    >
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            isWorkspace
              ? "Message the Assistant..."
              : "Message the Assistant... (Enter to send)"
          }
          rows={isWorkspace ? 1 : 2}
          className={cn(
            "flex-1 resize-none border border-glass-border bg-surface-2 px-3 py-2 text-sm text-foreground transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none",
            isWorkspace ? "min-h-[40px] rounded-md" : "rounded-2xl",
          )}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled}
          className={cn(
            "flex size-10 items-center justify-center bg-primary text-primary-foreground transition-all active:scale-[0.98] hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50",
            isWorkspace ? "rounded-md shadow-lg" : "rounded-2xl",
          )}
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}

function TimelineItem({
  item,
  variant,
}: {
  item: StewardChatItem;
  variant: StewardChatVariant;
}) {
  if (item.type === "PendingHumanMessage") {
    return <HumanBubble content={item.content} variant={variant} pending />;
  }

  switch (item.type) {
    case "ReceivedMessage":
      if (item.from_id !== "human" || !item.content) {
        return null;
      }
      return <HumanBubble content={item.content} variant={variant} />;
    case "AssistantText":
      if (!item.content) {
        return null;
      }
      return (
        <AssistantBubble
          content={item.content}
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
  variant: StewardChatVariant;
  pending?: boolean;
}) {
  const isWorkspace = variant === "workspace";

  return (
    <div className="flex min-w-0 justify-end">
      <div
        className={cn(
          "min-w-0 overflow-hidden px-3 py-2 text-sm [overflow-wrap:anywhere]",
          isWorkspace
            ? "max-w-[85%] rounded-md bg-primary text-primary-foreground shadow-lg"
            : "max-w-[80%] rounded-2xl border border-glass-border bg-surface-3 text-foreground",
          pending && "opacity-80",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">{content}</span>
          {pending && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-foreground/12 px-2 py-0.5 text-[10px] font-medium text-primary-foreground/80">
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
  variant,
}: {
  content: string;
  streaming?: boolean;
  variant: StewardChatVariant;
}) {
  const isWorkspace = variant === "workspace";
  const isFloating = variant === "floating";

  return (
    <div className="flex min-w-0 justify-start">
      <div
        className={cn(
          "flex min-w-0 items-start gap-2",
          isWorkspace ? "max-w-[85%]" : "max-w-[80%]",
        )}
      >
        <Shield
          className={cn(
            "mt-1 size-4 shrink-0",
            isWorkspace
              ? "text-primary"
              : isFloating
                ? "text-amber-300"
                : "text-muted-foreground",
          )}
        />
        <div
          className={cn(
            "group min-w-0 max-w-full overflow-hidden border border-glass-border bg-surface-2 px-3 py-2 text-sm text-foreground",
            isWorkspace ? "rounded-md" : "rounded-2xl",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary/80">
              Assistant
            </span>
            {streaming ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <LoaderCircle className="size-3 animate-spin" />
                Live
              </span>
            ) : null}
            <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
              <CopyButton text={content} />
            </span>
          </div>
          <RichContentBlock
            content={content}
            streaming={streaming}
            markdownClassName="text-sm text-foreground"
            preClassName="text-foreground/90"
          />
        </div>
      </div>
    </div>
  );
}

function ThinkingCard({
  item,
  variant,
}: {
  item: HistoryEntry & { type: "AssistantThinking" };
  variant: StewardChatVariant;
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
  variant: StewardChatVariant;
}) {
  const isSend = item.tool_name === "send";
  const toId = item.arguments?.to as string | undefined;
  const content = item.arguments?.content as string | undefined;
  const formattedArguments = formatJsonOutput(item.arguments) ?? "";
  const formattedResult = formatJsonOutput(item.result);

  if (isSend) {
    return (
      <ActivityDisclosure
        label={toId ? `Delegating to ${toId.slice(0, 8)}` : "Delegating"}
        icon={<Send className="size-3.5 text-sky-500" />}
        tone="send"
        streaming={item.streaming}
        variant={variant}
        defaultOpen={item.streaming ?? false}
      >
        <RichContentBlock
          content={content ?? ""}
          streaming={item.streaming}
          markdownClassName="text-[13px] text-foreground/80"
          preClassName="text-foreground/75"
        />
      </ActivityDisclosure>
    );
  }

  return (
    <ActivityDisclosure
      label={formatToolLabel(item.tool_name)}
      icon={<Wrench className="size-3.5 text-teal-500" />}
      tone="tool"
      streaming={item.streaming}
      variant={variant}
      defaultOpen={item.streaming ?? false}
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
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Result
          </div>
          {item.result ? (
            <RichContentBlock
              content={formattedResult ?? item.result}
              streaming={item.streaming}
              markdownClassName="text-[13px] text-foreground/80"
              preClassName="text-foreground/75"
            />
          ) : (
            <div className="rounded-lg bg-surface-1/80 px-2.5 py-2 text-[12px] text-muted-foreground">
              {item.streaming ? "Running..." : "No result"}
            </div>
          )}
        </div>
      </div>
    </ActivityDisclosure>
  );
}

function ErrorCard({
  content,
  variant,
}: {
  content: string;
  variant: StewardChatVariant;
}) {
  const isWorkspace = variant === "workspace";

  return (
    <div className="flex min-w-0 justify-start">
      <div
        className={cn(
          "min-w-0 space-y-2 border border-red-500/25 bg-red-500/6 px-3 py-2",
          isWorkspace ? "max-w-[85%] rounded-md" : "max-w-[80%] rounded-2xl",
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
  tone: "thinking" | "tool" | "send";
  streaming?: boolean;
  variant: StewardChatVariant;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isWorkspace = variant === "workspace";

  return (
    <div className="flex min-w-0 justify-start">
      <div
        className={cn(
          "min-w-0 border px-3 py-2 backdrop-blur-sm",
          isWorkspace ? "max-w-[82%] rounded-md" : "max-w-[78%] rounded-2xl",
          tone === "thinking" &&
            "border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.08),rgba(245,158,11,0.03))]",
          tone === "tool" &&
            "border-teal-500/20 bg-[linear-gradient(180deg,rgba(20,184,166,0.08),rgba(20,184,166,0.03))]",
          tone === "send" &&
            "border-sky-500/20 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),rgba(14,165,233,0.03))]",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center gap-2 text-left"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-background/80 shadow-sm">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold text-foreground/90">
              {label}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {streaming ? "In progress" : "Completed"}
            </span>
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              streaming
                ? "bg-foreground/6 text-foreground/75"
                : "bg-foreground/6 text-muted-foreground",
            )}
          >
            {streaming ? (
              <>
                <LoaderCircle className="size-3 animate-spin" />
                Live
              </>
            ) : (
              <>
                <Check className="size-3" />
                Done
              </>
            )}
          </span>
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        </button>

        {open ? <div className="mt-3 min-w-0">{children}</div> : null}
      </div>
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

  return (
    <div className="min-w-0">
      <MarkdownContent content={content ?? ""} className={markdownClassName} />
      {streaming ? <span className="streaming-cursor" /> : null}
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

function getTimelineItemKey(item: StewardChatItem, index: number) {
  if (item.type === "PendingHumanMessage") {
    return item.id;
  }

  return `${item.type}-${item.timestamp}-${item.tool_call_id ?? ""}-${index}`;
}

function WorkspaceEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center space-y-3 rounded-lg border border-dashed border-glass-border bg-surface-2 p-4 text-center">
      <div className="flex size-11 items-center justify-center rounded-md bg-surface-3">
        <MessageSquare className="size-5 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Start a conversation</p>
        <p className="max-w-[200px] text-[11px] text-muted-foreground">
          Ask the Assistant to plan tasks, summarize progress, or coordinate
          next steps.
        </p>
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
