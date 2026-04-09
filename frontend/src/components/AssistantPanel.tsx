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
  const { height: composerHeight, ref: composerRef } =
    useMeasuredHeight<HTMLDivElement>();
  const {
    assistantActivity = { running: false },
    connected,
    handleKeyDown,
    input,
    onMessagesScroll,
    scrollRef,
    sending,
    sendMessage,
    setInput,
    timelineItems,
  } = useAssistantChat({ bottomInset: composerHeight });
  const isFloating = variant === "floating";
  const chatVariant = isFloating ? "floating" : "panel";

  return (
    <div
      className={cn(
        "relative flex h-full flex-col",
        isFloating
          ? "overflow-hidden rounded-[1.25rem] border border-glass-border bg-glass-bg text-foreground shadow-2xl backdrop-blur-2xl"
          : "overflow-hidden rounded-[1rem] border border-glass-border bg-surface-raised shadow-[0_22px_64px_-42px_rgba(0,0,0,0.45)] backdrop-blur-xl",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 border transition-[opacity,border-color,box-shadow] duration-300",
          assistantActivity.running
            ? "animate-pulse border-white/14 opacity-100 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_0_30px_-12px_rgba(255,255,255,0.12)]"
            : "border-transparent opacity-0",
        )}
      />
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
          style={{
            paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
          }}
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3.5",
            isFloating
              ? "bg-[linear-gradient(180deg,transparent_0%,rgba(10,10,11,0.08)_20%,rgba(10,10,11,0.68)_64%,rgba(10,10,11,0.9)_100%)] pt-8"
              : "bg-[linear-gradient(180deg,transparent_0%,rgba(10,10,11,0.12)_22%,rgba(10,10,11,0.74)_64%,rgba(10,10,11,0.94)_100%)] pt-9",
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
        "flex items-center gap-2 border-b px-3.5 py-2.5",
        floating ? "border-glass-border" : "border-glass-border bg-surface-2",
      )}
    >
      <span className="text-[13px] font-semibold text-foreground">
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
          ? "border border-graph-status-idle/12 bg-graph-status-idle/[0.08] text-graph-status-idle/88"
          : "border border-graph-status-initializing/10 bg-graph-status-initializing/[0.03] text-graph-status-initializing/58",
      )}
    >
      {connected ? "Online" : "Offline"}
    </span>
  );
}
