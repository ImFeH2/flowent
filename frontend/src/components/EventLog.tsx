import { useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";
import { Wifi, WifiOff } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EventItem } from "@/components/EventItem";
import { cn } from "@/lib/utils";
import { useAgent } from "@/context/AgentContext";

export function EventLog() {
  const { events, connected, eventPanelVisible } = useAgent();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (!eventPanelVisible) return null;

  return (
    <div className="fixed right-4 top-4 bottom-4 w-80 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col overflow-hidden z-30 shadow-xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        {connected ? (
          <Wifi className="size-4 text-zinc-400" />
        ) : (
          <WifiOff className="size-4 text-zinc-500" />
        )}
        <span className="text-sm font-medium text-zinc-200">Events</span>
        <span
          className={cn(
            "ml-auto size-2 rounded-full",
            connected ? "bg-emerald-400" : "bg-zinc-500",
          )}
        />
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-1">
          <AnimatePresence initial={false}>
            {events.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-zinc-500">
                Waiting for events...
              </p>
            ) : (
              events.map((event, i) => (
                <EventItem key={`${event.timestamp}-${i}`} event={event} />
              ))
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
