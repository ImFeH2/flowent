import { useState } from "react";
import { MessageSquare, PanelRightClose, PanelRightOpen } from "lucide-react";
import { AgentTree } from "@/components/AgentTree";
import { StewardPanel } from "@/components/StewardPanel";
import { cn } from "@/lib/utils";

export function HomePage() {
  const [chatCollapsed, setChatCollapsed] = useState(false);

  return (
    <div className="relative h-full bg-zinc-950">
      <AgentTree />

      <div
        className={cn(
          "pointer-events-none absolute inset-y-4 right-4 z-20 flex transition-all duration-300",
          chatCollapsed ? "w-12" : "w-96",
        )}
      >
        {chatCollapsed ? (
          <button
            onClick={() => setChatCollapsed(false)}
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-700/70 bg-zinc-900/85 text-zinc-200 shadow-xl backdrop-blur hover:bg-zinc-800"
            title="Open Steward Chat"
          >
            <PanelRightOpen className="size-4" />
          </button>
        ) : (
          <div className="pointer-events-auto relative h-full w-full">
            <button
              onClick={() => setChatCollapsed(true)}
              className="absolute -left-3 top-4 z-10 flex size-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 shadow-lg hover:bg-zinc-800"
              title="Collapse Steward Chat"
            >
              <PanelRightClose className="size-3.5" />
            </button>

            <StewardPanel variant="floating" />

            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-zinc-700/70 bg-zinc-900/70 px-2 py-1 text-[10px] text-zinc-400">
              <MessageSquare className="size-3" />
              <span>Enter to send</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
