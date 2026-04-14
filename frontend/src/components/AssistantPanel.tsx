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
    onMessagesScroll,
    removeImage = () => {},
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
          ? "overflow-hidden rounded-[1.25rem] border border-white/[0.08] bg-black/60 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_30px_60px_-16px_rgba(0,0,0,0.8)] backdrop-blur-3xl"
          : "overflow-hidden border-l border-white/[0.04] bg-black/40 text-white shadow-2xl backdrop-blur-2xl",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 border transition-[opacity,border-color,box-shadow] duration-300",
          assistantActivity.running
            ? "animate-pulse border-white/[0.12] opacity-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04),0_0_30px_-12px_rgba(255,255,255,0.1)]"
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
            "pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4",
            isFloating
              ? "bg-gradient-to-b from-transparent via-black/60 to-black/90 pt-8"
              : "bg-gradient-to-b from-transparent via-black/80 to-black pt-10",
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
            onKeyDown={handleKeyDown}
            onRemoveImage={removeImage}
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
        "relative z-10 flex items-center justify-between border-b px-4 py-3",
        floating
          ? "border-white/[0.06] bg-white/[0.02]"
          : "border-white/[0.04] bg-white/[0.01]",
      )}
    >
      <span className="text-[13px] font-medium tracking-wide text-white/90">
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
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          : "border-amber-500/20 bg-amber-500/10 text-amber-400",
      )}
    >
      {connected ? "Online" : "Connecting"}
    </span>
  );
}
