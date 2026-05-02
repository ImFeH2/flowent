import {
  AssistantChatComposer,
  AssistantChatMessages,
} from "@/components/AssistantChatContent";
import { Button } from "@/components/ui/button";
import { useAgentNodesRuntime } from "@/context/AgentContext";
import { useMeasuredHeight } from "@/hooks/useMeasuredHeight";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import { cn } from "@/lib/utils";

interface AssistantPanelProps {
  onOpenDetails?: () => void;
  variant?: "page" | "floating" | "docked";
}

export function AssistantPanel({
  onOpenDetails,
  variant = "page",
}: AssistantPanelProps) {
  const { agents } = useAgentNodesRuntime();
  const { height: composerHeight, ref: composerRef } =
    useMeasuredHeight<HTMLDivElement>();
  const {
    addImages = async () => {},
    assistantActivity = { running: false },
    clearChat,
    clearing = false,
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
  const isPage = variant === "page";
  const chatVariant = variant;
  const assistantRoleName =
    Array.from(agents.values()).find((agent) => agent.node_type === "assistant")
      ?.role_name ?? null;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden text-foreground",
        isFloating
          ? "overflow-hidden rounded-xl border border-border bg-surface-2 text-foreground shadow-md"
          : isPage
            ? "bg-transparent"
            : "border-l border-border bg-surface-overlay/94 shadow-sm",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 transition-[opacity,border-color,box-shadow] duration-300",
          assistantActivity.running
            ? "animate-pulse shadow-lg shadow-ring/5"
            : "opacity-0",
          !isPage && "border",
          assistantActivity.running &&
            !isPage &&
            "border-ring/25 opacity-100 shadow-ring/10",
        )}
      />
      <PanelHeader
        connected={connected}
        floating={isFloating}
        page={isPage}
        onClearChat={() => void clearChat()}
        onOpenDetails={onOpenDetails}
        roleName={assistantRoleName}
        clearing={clearing}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AssistantChatMessages
          allowHumanMessageRetry
          bottomInset={composerHeight}
          items={timelineItems}
          nodes={agents}
          onRetryHumanMessage={(messageId) => void retryMessage(messageId)}
          onScroll={onMessagesScroll}
          retryImageInputEnabled={supportsInputImage}
          retryingMessageId={retryingMessageId}
          scrollRef={scrollRef}
          runningHint={
            assistantActivity.running
              ? {
                  label: "Assistant is working...",
                  toolName: null,
                }
              : null
          }
          variant={chatVariant}
        />
        <div
          ref={composerRef}
          style={{
            paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
          }}
          className={cn(
            "absolute inset-x-0 bottom-0 z-10 px-4",
            isPage ? "mx-auto w-full max-w-3xl" : "",
            isFloating
              ? "bg-gradient-to-b from-transparent via-background/70 to-background/95 pt-8 pointer-events-none"
              : isPage
                ? "bg-gradient-to-b from-transparent via-background/90 to-background pt-12 pointer-events-none"
                : "bg-gradient-to-b from-transparent via-background/80 to-background pt-10 pointer-events-none",
          )}
        >
          <div className="pointer-events-auto">
            <AssistantChatComposer
              disabled={
                (!input.trim() && draftImages.length === 0) ||
                hasUploadingImages ||
                sending
              }
              commandsEnabled
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
              targetLabel="Assistant"
              variant={chatVariant}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  clearing,
  connected,
  floating,
  page,
  onClearChat,
  onOpenDetails,
  roleName,
}: {
  clearing: boolean;
  connected: boolean;
  floating: boolean;
  page?: boolean;
  onClearChat: () => void;
  onOpenDetails?: () => void;
  roleName?: string | null;
}) {
  return (
    <div
      className={cn(
        "relative z-10 flex items-center justify-between px-4 py-3",
        floating
          ? "border-b border-border bg-accent/20"
          : page
            ? "bg-transparent"
            : "border-b border-border bg-background/20",
      )}
    >
      <div
        className={cn(
          "min-w-0",
          page && "opacity-0 select-none pointer-events-none",
        )}
      >
        <div className="text-[13px] font-medium tracking-wide text-foreground">
          Assistant
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground/78">
          {roleName ? (
            <span className="rounded-full border border-border bg-accent/35 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/78">
              Role: {roleName}
            </span>
          ) : null}
          <StatusBadge connected={connected} />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={page ? "ghost" : "outline"}
          disabled={clearing}
          onClick={onClearChat}
        >
          {clearing ? "Clearing..." : "Clear Chat"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={page ? "ghost" : "outline"}
          disabled={!onOpenDetails}
          onClick={onOpenDetails}
        >
          Assistant Details
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[9px] font-medium transition-colors",
        connected
          ? "border-graph-status-running/18 bg-graph-status-running/[0.12] text-graph-status-running"
          : "border-graph-status-idle/18 bg-graph-status-idle/[0.12] text-graph-status-idle",
      )}
    >
      {connected ? "Online" : "Connecting..."}
    </span>
  );
}
