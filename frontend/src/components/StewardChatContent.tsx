import type { KeyboardEventHandler, RefObject } from "react";
import { MessageSquare, Send, Shield, Sparkles } from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";
import { cn } from "@/lib/utils";
import type { StewardMessage } from "@/types";

export type StewardChatVariant = "panel" | "floating" | "workspace";

interface StewardChatMessagesProps {
  bottomRef: RefObject<HTMLDivElement | null>;
  messages: StewardMessage[];
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
  bottomRef,
  messages,
  variant,
}: StewardChatMessagesProps) {
  const isWorkspace = variant === "workspace";
  const isFloating = variant === "floating";

  return (
    <div
      className={cn(
        "flex-1 space-y-4 overflow-y-auto",
        isWorkspace ? "p-4" : "px-4 py-4",
      )}
    >
      {messages.length === 0 &&
        (isWorkspace ? (
          <WorkspaceEmptyState />
        ) : (
          <PanelEmptyState floating={isFloating} />
        ))}

      {messages.map((msg, i) => (
        <div
          key={`${msg.timestamp}-${i}`}
          className={`flex ${msg.from === "human" ? "justify-end" : "justify-start"}`}
        >
          {msg.from === "steward" && (
            <div
              className={cn(
                "flex items-start gap-2",
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
                  "border border-glass-border bg-surface-2 px-3 py-2 text-sm text-foreground",
                  isWorkspace ? "rounded-md" : "rounded-2xl",
                )}
              >
                <MarkdownContent content={msg.content} />
              </div>
            </div>
          )}

          {msg.from === "human" && (
            <div
              className={cn(
                "px-3 py-2 text-sm",
                isWorkspace
                  ? "max-w-[85%] rounded-md bg-primary text-primary-foreground shadow-lg"
                  : "max-w-[80%] rounded-2xl border border-glass-border bg-surface-3 text-foreground",
              )}
            >
              {msg.content}
            </div>
          )}
        </div>
      ))}

      <div ref={bottomRef} />
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
              ? "Message the Steward..."
              : "Message the Steward... (Enter to send)"
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

function WorkspaceEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center space-y-3 rounded-lg border border-dashed border-glass-border bg-surface-2 p-4 text-center">
      <div className="flex size-11 items-center justify-center rounded-md bg-surface-3">
        <MessageSquare className="size-5 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Start a conversation</p>
        <p className="max-w-[200px] text-[11px] text-muted-foreground">
          Ask the Steward to plan tasks, summarize progress, or coordinate next
          steps.
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
          Ask the Steward to plan tasks, summarize progress, or coordinate next
          steps.
        </p>
      </div>
    </div>
  );
}
