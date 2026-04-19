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
    addImages = async () => {},
    assistantActivity = { running: false },
    connected,
    draftImages = [],
    handleKeyDown,
    hasUploadingImages = false,
    input,
    isBrowsingInputHistory,
    navigateInputHistory,
    onMessagesScroll,
    removeImage = () => {},
    retryMessage,
    retryingMessageId,
    scrollRef,
    sending,
    sendMessage,
    setInput,
    supportsInputImage = false,
    timelineItems,
  } = useAssistantChat({ bottomInset: composerHeight });
  const isFloating = variant === "floating";
  const chatVariant = isFloating ? "floating" : "panel";

  return (
    <div
      className={cn(
        "relative flex h-full flex-col",
        isFloating
          ? "overflow-hidden rounded-[1.25rem] border border-border bg-surface-overlay text-foreground shadow-xl backdrop-blur-3xl"
          : "overflow-hidden border-l border-border bg-surface-overlay/94 text-foreground shadow-xl backdrop-blur-2xl",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 border transition-[opacity,border-color,box-shadow] duration-300",
          assistantActivity.running
            ? "animate-pulse border-ring/25 opacity-100 shadow-lg shadow-ring/10"
            : "border-transparent opacity-0",
        )}
      />
      <PanelHeader connected={connected} floating={isFloating} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AssistantChatMessages
          bottomInset={composerHeight}
          items={timelineItems}
          nodes={agents}
          onRetryHumanMessage={(messageId) => void retryMessage(messageId)}
          onScroll={onMessagesScroll}
          retryImageInputEnabled={supportsInputImage}
          retryingMessageId={retryingMessageId}
          scrollRef={scrollRef}
          variant={chatVariant}
        />
        <div
          ref={composerRef}
          style={{
            paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
          }}
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4",
            isFloating
              ? "bg-gradient-to-b from-transparent via-background/70 to-background/95 pt-8"
              : "bg-gradient-to-b from-transparent via-background/80 to-background pt-10",
          )}
        >
          <AssistantChatComposer
            disabled={
              (!input.trim() && draftImages.length === 0) ||
              hasUploadingImages ||
              sending
            }
            images={draftImages}
            imageInputEnabled={supportsInputImage}
            input={input}
            onAddImages={(files) => void addImages(files)}
            onChange={setInput}
            onNavigateHistory={navigateInputHistory}
            onKeyDown={handleKeyDown}
            onRemoveImage={removeImage}
            onSend={() => void sendMessage()}
            overlay
            suppressCommandNavigation={isBrowsingInputHistory}
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
        "relative z-10 flex items-center justify-between border-b px-4 py-3",
        floating
          ? "border-border bg-accent/20"
          : "border-border bg-background/20",
      )}
    >
      <span className="text-[13px] font-medium tracking-wide text-foreground">
        Assistant
      </span>
      <StatusBadge connected={connected} />
    </div>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[9px] font-medium uppercase tracking-wider transition-colors",
        connected
          ? "border-graph-status-running/18 bg-graph-status-running/[0.12] text-graph-status-running"
          : "border-graph-status-idle/18 bg-graph-status-idle/[0.12] text-graph-status-idle",
      )}
    >
      {connected ? "Online" : "Connecting"}
    </span>
  );
}
