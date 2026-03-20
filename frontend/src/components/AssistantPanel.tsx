import {
  AssistantChatComposer,
  AssistantChatMessages,
} from "@/components/AssistantChatContent";
import { useAgentNodesRuntime } from "@/context/AgentContext";
import { useMeasuredHeight } from "@/hooks/useMeasuredHeight";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import { cn } from "@/lib/utils";

interface AssistantPanelProps {
  variant?: "page" | "floating" | "docked";
}

export function AssistantPanel({ variant = "page" }: AssistantPanelProps) {
  const { agents } = useAgentNodesRuntime();
  const {
    connected,
    handleKeyDown,
    input,
    onMessagesScroll,
    scrollRef,
    sending,
    sendMessage,
    setInput,
    timelineItems,
  } = useAssistantChat();
  const isFloating = variant === "floating";
  const chatVariant = isFloating ? "floating" : "panel";
  const { height: composerHeight, ref: composerRef } =
    useMeasuredHeight<HTMLDivElement>();

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isFloating
          ? "overflow-hidden rounded-[1.5rem] border border-glass-border bg-glass-bg text-foreground shadow-2xl backdrop-blur-2xl"
          : "overflow-hidden rounded-3xl border border-glass-border bg-surface-raised shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)] backdrop-blur-xl",
      )}
    >
      <PanelHeader connected={connected} floating={isFloating} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AssistantChatMessages
          bottomInset={composerHeight}
          items={timelineItems}
          nodes={agents}
          onScroll={onMessagesScroll}
          scrollRef={scrollRef}
          variant={chatVariant}
        />
        <div
          ref={composerRef}
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4",
            isFloating
              ? "bg-[linear-gradient(180deg,transparent_0%,rgba(10,10,11,0.12)_24%,rgba(10,10,11,0.72)_68%,rgba(10,10,11,0.92)_100%)] pt-10"
              : "bg-[linear-gradient(180deg,transparent_0%,rgba(10,10,11,0.18)_26%,rgba(10,10,11,0.78)_70%,rgba(10,10,11,0.96)_100%)] pt-12",
          )}
        >
          <AssistantChatComposer
            disabled={!input.trim() || sending}
            input={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={() => void sendMessage()}
            overlay
            variant={chatVariant}
          />
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  connected,
  floating,
}: {
  connected: boolean;
  floating: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b px-4 py-3",
        floating ? "border-glass-border" : "border-glass-border bg-surface-2",
      )}
    >
      <span className="text-sm font-semibold text-foreground">
        Assistant Chat
      </span>
      <StatusBadge connected={connected} />
    </div>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium",
        connected
          ? "bg-emerald-400/20 text-emerald-300"
          : "bg-amber-400/20 text-amber-300",
      )}
    >
      {connected ? "Online" : "Offline"}
    </span>
  );
}
