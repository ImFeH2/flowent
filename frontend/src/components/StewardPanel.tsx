import { Shield } from "lucide-react";
import {
  StewardChatComposer,
  StewardChatMessages,
} from "@/components/StewardChatContent";
import { useStewardChat } from "@/hooks/useStewardChat";
import { cn } from "@/lib/utils";

interface StewardPanelProps {
  variant?: "page" | "floating" | "docked";
}

export function StewardPanel({ variant = "page" }: StewardPanelProps) {
  const {
    connected,
    handleKeyDown,
    input,
    onMessagesScroll,
    scrollRef,
    sending,
    sendMessage,
    setInput,
    stewardMessages,
  } = useStewardChat();
  const isFloating = variant === "floating";
  const chatVariant = isFloating ? "floating" : "panel";

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
      <StewardChatMessages
        messages={stewardMessages}
        onScroll={onMessagesScroll}
        scrollRef={scrollRef}
        variant={chatVariant}
      />
      <StewardChatComposer
        disabled={!input.trim() || sending}
        input={input}
        onChange={setInput}
        onKeyDown={handleKeyDown}
        onSend={() => void sendMessage()}
        variant={chatVariant}
      />
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
      <Shield
        className={cn(
          "size-4",
          floating ? "text-amber-300" : "text-muted-foreground",
        )}
      />
      <span className="text-sm font-semibold text-foreground">
        Steward Chat
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
      {connected ? "Live" : "Syncing"}
    </span>
  );
}
