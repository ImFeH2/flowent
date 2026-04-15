import {
  type ClipboardEventHandler,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  memo,
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
  Square,
  Sparkles,
  Wrench,
  ImagePlus,
  X,
} from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { ImageAssetPreview } from "@/components/ImageAssetPreview";
import { useImageViewer } from "@/context/imageViewer";
import { MarkdownContent } from "@/components/MarkdownContent";
import {
  insertAssistantCommand,
  isAssistantCommandReadyToSend,
  parseAssistantCommandInput,
  resolveAssistantCommandSelection,
  stepAssistantCommandSelection,
  type AssistantCommandSpec,
} from "@/lib/assistantCommands";
import { contentPartsToText, normalizeContentParts } from "@/lib/contentParts";
import { formatJsonOutput } from "@/lib/formatJsonOutput";
import { getNodeLabel } from "@/lib/nodeLabel";
import { cn } from "@/lib/utils";
import type {
  AssistantChatItem,
  ContentPart,
  HistoryEntry,
  Node,
} from "@/types";

export type AssistantChatVariant = "panel" | "floating" | "workspace";
type RichContentLayout = "parts-order" | "human-attachments-top";

interface AssistantChatMessagesProps {
  bottomInset?: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  items: AssistantChatItem[];
  nodes?: Map<string, Node>;
  onScroll: UIEventHandler<HTMLDivElement>;
  runningHint?: {
    label: string;
    toolName?: string | null;
  } | null;
  variant: AssistantChatVariant;
}

interface AssistantChatComposerProps {
  busy?: boolean;
  disabled: boolean;
  images?: Array<{
    id: string;
    previewUrl: string;
    name: string;
    width: number | null;
    height: number | null;
    status: "uploading" | "ready";
  }>;
  imageInputEnabled?: boolean;
  input: string;
  onAddImages?: (files: FileList | File[]) => void;
  onChange: (value: string) => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onRemoveImage?: (imageId: string) => void;
  onSend: () => void;
  onStop?: () => void;
  overlay?: boolean;
  stopping?: boolean;
  variant: AssistantChatVariant;
}

export const AssistantChatMessages = memo(function AssistantChatMessages({
  bottomInset = 0,
  scrollRef,
  items,
  nodes,
  onScroll,
  runningHint = null,
  variant,
}: AssistantChatMessagesProps) {
  const isWorkspace = variant === "workspace";
  const isFloating = variant === "floating";
  const baseBottomPadding = isWorkspace ? 14 : 16;
  const visibleItems = items.filter(
    (item) => item.type !== "SystemEntry" && item.type !== "StateEntry",
  );

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        paddingBottom: `${baseBottomPadding + bottomInset}px`,
        scrollPaddingBottom: `${baseBottomPadding + bottomInset}px`,
      }}
      className={cn(
        "flex-1 space-y-2.5 overflow-y-auto",
        isWorkspace ? "px-3 pt-3" : "px-3.5 pt-3.5",
      )}
    >
      {visibleItems.length === 0 &&
        !runningHint &&
        (isWorkspace ? (
          <WorkspaceEmptyState />
        ) : (
          <PanelEmptyState floating={isFloating} />
        ))}

      {visibleItems.map((item, index) => (
        <div
          key={getTimelineItemKey(item, index)}
          className="[content-visibility:auto] [contain-intrinsic-size:auto_100px]"
        >
          <TimelineItem item={item} nodes={nodes} variant={variant} />
        </div>
      ))}

      {runningHint ? (
        <AssistantRunningHint
          label={runningHint.label}
          toolName={runningHint.toolName}
          variant={variant}
        />
      ) : null}
    </div>
  );
});

function getClipboardImageFiles(
  items: DataTransferItemList | null | undefined,
): File[] {
  if (!items) {
    return [];
  }

  return Array.from(items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .flatMap((item) => {
      const file = item.getAsFile();
      return file ? [file] : [];
    });
}

export function AssistantChatComposer({
  busy = false,
  disabled,
  images = [],
  imageInputEnabled = true,
  input,
  onAddImages = () => {},
  onChange,
  onKeyDown,
  onRemoveImage = () => {},
  onSend,
  onStop,
  overlay = false,
  stopping = false,
  variant,
}: AssistantChatComposerProps) {
  const isWorkspace = variant === "workspace";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionLabel = busy ? (stopping ? "Stopping..." : "Stop") : "Send";
  const actionDisabled = busy ? stopping || !onStop : disabled;
  const {
    filtered: commandOptions,
    isCommandInput,
    token: commandToken,
  } = parseAssistantCommandInput(input);
  const [selectedCommandState, setSelectedCommandState] = useState<{
    index: number;
    token: string;
  }>({ index: 0, token: "" });
  const [dismissedCommandToken, setDismissedCommandToken] = useState<
    string | null
  >(null);
  const commandPanelVisible =
    images.length === 0 &&
    isCommandInput &&
    dismissedCommandToken !== commandToken;
  const { selectedCommand, selectedCommandIndex } =
    resolveAssistantCommandSelection(
      commandOptions,
      selectedCommandState,
      commandToken,
    );

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

  const handleInputChange = (nextValue: string) => {
    const nextCommandInput = parseAssistantCommandInput(nextValue);

    if (!nextCommandInput.isCommandInput) {
      setDismissedCommandToken(null);
      setSelectedCommandState({ index: 0, token: "" });
    } else if (nextCommandInput.token !== commandToken) {
      setSelectedCommandState({ index: 0, token: nextCommandInput.token });
      if (
        dismissedCommandToken &&
        dismissedCommandToken !== nextCommandInput.token
      ) {
        setDismissedCommandToken(null);
      }
    }

    onChange(nextValue);
  };

  const selectCommand = (command: AssistantCommandSpec) => {
    onChange(insertAssistantCommand(input, command));
    setSelectedCommandState({ index: 0, token: command.name });
    setDismissedCommandToken(null);
    textareaRef.current?.focus();
  };

  const resetCommandState = () => {
    setDismissedCommandToken(null);
    setSelectedCommandState({ index: 0, token: "" });
  };

  const handleComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (
    event,
  ) => {
    if (commandPanelVisible) {
      const completionCommand =
        commandOptions.length > 0 &&
        selectedCommand &&
        !isAssistantCommandReadyToSend(input, selectedCommand.name)
          ? selectedCommand
          : null;

      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedCommandToken(commandToken);
        return;
      }

      if (commandOptions.length > 0 && event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedCommandState(
          stepAssistantCommandSelection(
            commandOptions,
            selectedCommandState,
            commandToken,
            1,
          ),
        );
        return;
      }

      if (commandOptions.length > 0 && event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedCommandState(
          stepAssistantCommandSelection(
            commandOptions,
            selectedCommandState,
            commandToken,
            -1,
          ),
        );
        return;
      }

      if (completionCommand && event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        selectCommand(completionCommand);
        return;
      }

      if (completionCommand && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        selectCommand(completionCommand);
        return;
      }
    }

    onKeyDown(event);
  };

  const handleComposerPaste: ClipboardEventHandler<HTMLTextAreaElement> = (
    event,
  ) => {
    const pastedImages = getClipboardImageFiles(event.clipboardData?.items);
    if (pastedImages.length === 0 || !imageInputEnabled) {
      return;
    }

    event.preventDefault();
    resetCommandState();
    onAddImages(pastedImages);
  };

  return (
    <div
      className={cn(
        overlay
          ? "w-full pointer-events-auto"
          : cn(
              "border-t border-white/6",
              isWorkspace ? "p-2.5" : "px-3.5 py-2.5",
            ),
      )}
    >
      {commandPanelVisible ? (
        <div
          role="listbox"
          aria-label="Assistant commands"
          className={cn(
            "pointer-events-auto mb-2 overflow-hidden rounded-[1rem] border backdrop-blur-xl",
            isWorkspace
              ? "border-white/12 bg-black/[0.74] shadow-[0_18px_40px_-28px_rgba(0,0,0,0.92)]"
              : "border-white/10 bg-black/[0.78] shadow-[0_20px_44px_-30px_rgba(0,0,0,0.88)]",
          )}
        >
          {commandOptions.length > 0 ? (
            commandOptions.map((command, index) => {
              const selected = index === selectedCommandIndex;
              return (
                <button
                  key={command.name}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectCommand(command);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
                    selected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
                  )}
                >
                  <span className="mt-0.5 shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-white/88">
                    {command.name}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-white/88">
                      {command.description}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] text-white/48">
                      {command.usage}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-3 text-[12px] text-white/54">
              No matching commands.
            </div>
          )}
        </div>
      ) : null}
      <div
        className={cn(
          "rounded-[0.8rem] border px-2 py-1 transition-[border-color,background-color,box-shadow] duration-200",
          isWorkspace
            ? "border-white/14 bg-black/[0.18] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_14px_30px_-22px_rgba(0,0,0,0.82),0_8px_16px_-14px_rgba(255,255,255,0.06)] hover:border-white/22 focus-within:border-white/28 focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_38px_-24px_rgba(0,0,0,0.88),0_10px_20px_-16px_rgba(255,255,255,0.08)]"
            : "border-white/12 bg-surface-2/90 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_16px_32px_-24px_rgba(0,0,0,0.72),0_8px_16px_-14px_rgba(255,255,255,0.05)] backdrop-blur-xl hover:border-white/18 focus-within:border-white/24 focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_36px_-24px_rgba(0,0,0,0.78),0_9px_18px_-14px_rgba(255,255,255,0.08)]",
        )}
      >
        {images.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-b border-white/8 px-0.5 py-2">
            {images.map((image) => (
              <PendingImagePreviewTile
                key={image.id}
                image={image}
                onRemove={() => onRemoveImage(image.id)}
              />
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
          <input
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            multiple
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) {
                resetCommandState();
                onAddImages(event.target.files);
              }
              event.currentTarget.value = "";
            }}
            type="file"
          />
          <button
            type="button"
            aria-label={
              imageInputEnabled
                ? "Add images"
                : "Current model does not support image input"
            }
            disabled={!imageInputEnabled}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:cursor-not-allowed disabled:opacity-35",
              imageInputEnabled
                ? "bg-white/[0.08] hover:bg-white/[0.14]"
                : "bg-white/[0.04]",
            )}
          >
            <ImagePlus className="size-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            onPaste={handleComposerPaste}
            placeholder="Message Assistant or type / for commands"
            rows={1}
            className={cn(
              "min-h-5 w-full resize-none self-center bg-transparent px-0.5 py-0 text-[13px] leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none",
              isWorkspace ? "rounded-[0.55rem]" : "rounded-[0.6rem]",
            )}
          />
          <button
            type="button"
            onClick={busy ? onStop : onSend}
            disabled={actionDisabled}
            aria-label={busy ? "Stop assistant" : "Send message"}
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full transition-all duration-300 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30",
              isWorkspace
                ? "h-8 gap-1.5 px-3.5 bg-white text-black hover:opacity-90"
                : "size-8 bg-white/[0.1] text-white hover:bg-white/[0.15]",
              busy && isWorkspace
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "",
              busy && !isWorkspace
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "",
            )}
          >
            {busy ? (
              <Square className="size-3.5 fill-current" strokeWidth={2.4} />
            ) : (
              <ArrowUp className="size-4" strokeWidth={2.5} />
            )}
            {isWorkspace ? (
              <span className="text-[11px] font-medium">{actionLabel}</span>
            ) : null}
          </button>
        </div>
      </div>
      {!imageInputEnabled ? (
        <div className="px-1.5 pt-2 text-[11px] text-white/42">
          Current model does not support image input.
        </div>
      ) : null}
    </div>
  );
}

function AssistantRunningHint({
  label,
  toolName,
  variant,
}: {
  label: string;
  toolName?: string | null;
  variant: AssistantChatVariant;
}) {
  const isWorkspace = variant === "workspace";

  return (
    <div className="flex min-w-0 items-center">
      <div
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] text-muted-foreground/82",
          isWorkspace
            ? "border-white/10 bg-white/[0.04]"
            : "border-white/8 bg-white/[0.03]",
        )}
      >
        <span className="flex items-center gap-1.5">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="size-1.5 rounded-full bg-white/55 animate-pulse"
              style={{ animationDelay: `${index * 140}ms` }}
            />
          ))}
        </span>
        <span>{label}</span>
        {toolName ? (
          <span className="truncate rounded-full border border-white/8 bg-black/[0.16] px-2 py-0.5 font-mono text-[10px] text-white/72">
            {toolName}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PendingImagePreviewTile({
  image,
  onRemove,
}: {
  image: NonNullable<AssistantChatComposerProps["images"]>[number];
  onRemove: () => void;
}) {
  const { openImage } = useImageViewer();
  const meta =
    image.status === "uploading"
      ? "Uploading..."
      : image.width && image.height
        ? `${image.width}x${image.height}`
        : "Ready";

  return (
    <>
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/25 transition-colors hover:border-white/16">
        <button
          aria-label={`Preview ${image.name}`}
          className="block text-left"
          onClick={() =>
            openImage({
              src: image.previewUrl,
              alt: image.name,
              meta,
              width: image.width,
              height: image.height,
            })
          }
          type="button"
        >
          <img
            alt={image.name}
            className="h-20 w-20 object-cover"
            src={image.previewUrl}
          />
          <div className="absolute inset-x-0 bottom-0 bg-black/72 px-2 py-1 text-[10px] text-white/84">
            <div className="truncate">{image.name}</div>
            <div className="text-white/56">{meta}</div>
          </div>
        </button>
        <button
          aria-label={`Remove ${image.name}`}
          className="absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded-full bg-black/60 text-white/74 transition-colors hover:bg-black/80 hover:text-white"
          onClick={onRemove}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </>
  );
}

const TimelineItem = memo(function TimelineItem({
  item,
  nodes,
  variant,
}: {
  item: AssistantChatItem;
  nodes?: Map<string, Node>;
  variant: AssistantChatVariant;
}) {
  if (item.type === "PendingHumanMessage") {
    return (
      <HumanBubble
        content={item.content}
        parts={item.parts}
        variant={variant}
        pending
      />
    );
  }

  switch (item.type) {
    case "ReceivedMessage":
      if (normalizeContentParts(item.parts, item.content).length === 0) {
        return null;
      }
      if (item.from_id === "human") {
        return (
          <HumanBubble
            content={contentPartsToText(item.parts, item.content)}
            parts={item.parts}
            variant={variant}
          />
        );
      }
      return (
        <MessageActivityCard
          content={contentPartsToText(item.parts, item.content)}
          parts={item.parts}
          icon={<MessageSquare className="size-3.5 text-foreground/68" />}
          label={`From ${getNodeLabel(item.from_id ?? "", nodes)}`}
          tone="received"
          streaming={item.streaming}
          variant={variant}
        />
      );
    case "AssistantText":
      if (normalizeContentParts(item.parts, item.content).length === 0) {
        return null;
      }
      return (
        <AssistantBubble
          content={contentPartsToText(item.parts, item.content)}
          parts={item.parts}
          streaming={item.streaming}
        />
      );
    case "SentMessage":
      if (normalizeContentParts(item.parts, item.content).length === 0) {
        return null;
      }
      return (
        <MessageActivityCard
          content={contentPartsToText(item.parts, item.content)}
          parts={item.parts}
          icon={<Send className="size-3.5 text-foreground/58" />}
          label={`To ${
            (item.to_id
              ? [item.to_id]
              : (item.to_ids ?? []).filter((id): id is string => Boolean(id))
            )
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
    case "CommandResultEntry":
      return (
        <CommandResultCard
          item={item as HistoryEntry & { type: "CommandResultEntry" }}
          variant={variant}
        />
      );
    case "ErrorEntry":
      return <ErrorCard content={item.content ?? ""} variant={variant} />;
    default:
      return null;
  }
});

function HumanBubble({
  content,
  parts,
  variant,
  pending = false,
}: {
  content: string;
  parts?: ContentPart[] | null;
  variant: AssistantChatVariant;
  pending?: boolean;
}) {
  const isWorkspace = variant === "workspace";

  return (
    <div className="group mt-2 flex min-w-0 flex-col items-end">
      <div
        className={cn(
          "min-w-0 overflow-hidden px-2.5 py-1.5 text-[13px] [overflow-wrap:anywhere]",
          isWorkspace
            ? "max-w-[84%] rounded-[10px] border border-white/8 bg-white/[0.1] text-white"
            : "max-w-[80%] rounded-[12px] border border-white/10 bg-white/[0.08] text-white",
          pending && "opacity-80",
        )}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <RichContentBlock
            content={content}
            layout="human-attachments-top"
            parts={parts}
            markdownClassName="text-sm text-white"
            preClassName="text-white/90"
          />
          {pending ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80">
              <LoaderCircle className="size-3 animate-spin" />
              Sending
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-1 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton text={content} />
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  parts,
  streaming,
}: {
  content: string;
  parts?: ContentPart[] | null;
  streaming?: boolean;
}) {
  return (
    <div className="group min-w-0 w-full">
      <RichContentBlock
        content={content}
        parts={parts}
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
  parts,
  icon,
  label,
  tone,
  streaming,
  variant,
}: {
  content: string;
  parts?: ContentPart[] | null;
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
        "min-w-0 w-full px-2 py-1.5",
        isWorkspace ? "border-l border-white/8 pl-3" : "rounded-[12px]",
        tone === "received" &&
          "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))]",
        tone === "sent" &&
          "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.016),rgba(255,255,255,0.006))]",
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
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-none text-foreground/88">
          {label}
        </span>
        <span className="ml-auto" onClick={(event) => event.stopPropagation()}>
          <CopyButton text={content} />
        </span>
        {streaming ? (
          <span className="inline-flex size-5 items-center justify-center">
            <span className="relative flex size-2.5 items-center justify-center">
              <span className="absolute inline-flex size-2.5 animate-ping rounded-full bg-white/28" />
              <span className="relative inline-flex size-2 rounded-full bg-white/78" />
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
            parts={parts}
            streaming={streaming}
            markdownClassName="text-[12px] text-foreground/78"
            preClassName="text-foreground/74"
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
      icon={<Brain className="size-3.5 text-foreground/72" />}
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
      icon={<Wrench className="size-3.5 text-white/50" />}
      tone="tool"
      streaming={displayStreaming}
      variant={variant}
      defaultOpen={displayStreaming}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-white/30">
            Arguments
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-xl border border-white/[0.04] bg-black/40 px-3.5 py-3 text-[11px] font-mono leading-relaxed text-white/70">
            {formattedArguments}
          </pre>
        </div>
        {item.result || !isIdleTool ? (
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-white/30">
              Result
            </div>
            {item.result ? (
              <RichContentBlock
                content={formattedResult ?? item.result}
                streaming={displayStreaming}
                markdownClassName="text-[12px] text-white/80 leading-relaxed"
                preClassName="text-white/70"
              />
            ) : (
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3.5 py-3 text-[12px] text-white/40 italic">
                {displayStreaming ? "Running..." : "No result"}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </ActivityDisclosure>
  );
}

function CommandResultCard({
  item,
  variant,
}: {
  item: HistoryEntry & { type: "CommandResultEntry" };
  variant: AssistantChatVariant;
}) {
  const isWorkspace = variant === "workspace";

  return (
    <div
      className={cn(
        "min-w-0 w-full space-y-3 px-3 py-2.5",
        isWorkspace
          ? "border-l border-emerald-400/30 bg-emerald-400/[0.08]"
          : "rounded-xl border border-emerald-400/18 bg-emerald-400/[0.06]",
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-emerald-300" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-200/88">
          Command Result
        </span>
        {item.command_name ? (
          <span className="rounded-full border border-emerald-200/12 bg-black/20 px-2 py-0.5 font-mono text-[10px] text-emerald-100/78">
            {item.command_name}
          </span>
        ) : null}
        <span className="ml-auto">
          <CopyButton
            text={item.content ?? ""}
            className="text-emerald-100/54 hover:bg-emerald-400/10 hover:text-emerald-100/86"
            iconClassName="text-current"
            copiedClassName="text-emerald-200"
          />
        </span>
      </div>
      <RichContentBlock
        content={item.content}
        markdownClassName="text-[13px] text-emerald-50/92"
        preClassName="text-emerald-50/88"
      />
    </div>
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
        "min-w-0 w-full space-y-3 px-3 py-2.5",
        isWorkspace
          ? "border-l-2 border-red-500/40 bg-red-500/10"
          : "rounded-xl border border-red-500/20 bg-red-500/5",
      )}
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4 text-red-400" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-red-400">
          Error
        </span>
        <span className="ml-auto">
          <CopyButton
            text={content}
            className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
            iconClassName="text-current"
            copiedClassName="text-emerald-400"
          />
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-red-200">
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
        "min-w-0 w-full transition-all duration-300",
        isWorkspace
          ? "border-l border-white/[0.04] pl-3 py-1.5"
          : "rounded-xl border border-white/[0.04] bg-white/[0.01] px-3 py-2",
        tone === "thinking" && !isWorkspace && "hover:bg-white/[0.02]",
        tone === "tool" && !isWorkspace && "hover:bg-white/[0.02]",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="flex size-5 shrink-0 translate-y-px items-center justify-center text-white/50">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-white/70">
            {label}
          </span>
        </span>
        {streaming ? (
          <span className="ml-auto inline-flex size-5 items-center justify-center">
            <span className="relative flex size-2.5 items-center justify-center">
              <span className="absolute inline-flex size-2.5 animate-ping rounded-full bg-white/30" />
              <span className="relative inline-flex size-2 rounded-full bg-white/80" />
            </span>
            <span className="sr-only">Live</span>
          </span>
        ) : null}
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-white/30 transition-transform duration-200",
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
  layout = "parts-order",
  parts,
  streaming,
  markdownClassName,
  preClassName,
}: {
  content: string | null | undefined;
  layout?: RichContentLayout;
  parts?: ContentPart[] | null;
  streaming?: boolean;
  markdownClassName?: string;
  preClassName?: string;
}) {
  const normalizedParts = normalizeContentParts(parts, content);
  const hasImagePart = normalizedParts.some((part) => part.type === "image");
  const textContent = contentPartsToText(normalizedParts, content);
  const formattedJson = formatJsonOutput(textContent);

  if (layout === "human-attachments-top" && hasImagePart) {
    const textParts = normalizedParts.filter(
      (part): part is Extract<ContentPart, { type: "text" }> =>
        part.type === "text",
    );
    const imageParts = normalizedParts.filter(
      (part): part is Extract<ContentPart, { type: "image" }> =>
        part.type === "image",
    );

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2.5">
          {imageParts.map((part, index) => (
            <ImageAssetPreview
              key={`${index}-attachment-${part.asset_id}`}
              alt={part.alt}
              assetId={part.asset_id}
              compact
              height={part.height}
              mimeType={part.mime_type}
              width={part.width}
            />
          ))}
        </div>
        {textParts.length > 0 ? (
          <RichContentBlock
            content={contentPartsToText(textParts)}
            markdownClassName={markdownClassName}
            preClassName={preClassName}
            parts={textParts}
            streaming={streaming}
          />
        ) : null}
      </div>
    );
  }

  if (formattedJson) {
    return (
      <pre
        className={cn(
          "whitespace-pre-wrap break-words rounded-xl border border-white/[0.04] bg-black/40 px-3.5 py-3 text-[11px] font-mono leading-relaxed text-white/80",
          preClassName,
        )}
      >
        <StreamingText text={formattedJson} streaming={streaming} />
      </pre>
    );
  }

  if (normalizedParts.length > 0 && hasImagePart) {
    return (
      <div className="space-y-3">
        {normalizedParts.map((part, index) =>
          part.type === "text" ? (
            <RichContentBlock
              key={`${index}-text`}
              content={part.text}
              markdownClassName={markdownClassName}
              preClassName={preClassName}
            />
          ) : (
            <ImageAssetPreview
              key={`${index}-image-${part.asset_id}`}
              alt={part.alt}
              assetId={part.asset_id}
              height={part.height}
              mimeType={part.mime_type}
              width={part.width}
            />
          ),
        )}
      </div>
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
        <StreamingText text={textContent} streaming />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <MarkdownContent content={textContent} className={markdownClassName} />
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
            floating ? "text-white/72" : "text-muted-foreground",
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
