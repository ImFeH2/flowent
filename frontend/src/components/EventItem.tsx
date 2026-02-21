import { motion } from "motion/react";
import type { AgentEvent } from "@/types";

const typeColor: Record<string, string> = {
  node_created: "bg-emerald-400",
  node_state_changed: "bg-blue-400",
  node_message: "bg-violet-400",
  node_terminated: "bg-zinc-500",
  node_connected: "bg-teal-400",
  steward_content: "bg-amber-300",
  tool_called: "bg-amber-400",
};

const typeLabel: Record<string, string> = {
  node_created: "created",
  node_state_changed: "state",
  node_message: "message",
  node_terminated: "terminated",
  node_connected: "connected",
  steward_content: "steward",
  tool_called: "tool",
};

function formatTime(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function EventItem({ event }: { event: AgentEvent }) {
  const dotColor = typeColor[event.type] ?? "bg-zinc-500";
  const label = typeLabel[event.type] ?? event.type;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="flex items-start gap-2 px-3 py-1.5 text-xs"
    >
      <span
        className={`mt-1.5 inline-block size-1.5 shrink-0 rounded-full ${dotColor}`}
      />
      <div className="min-w-0 flex-1">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-500 ml-1.5">
          {event.agent_id.slice(0, 8)}
        </span>
        {"new_state" in event.data && (
          <span className="text-zinc-400 ml-1">
            &rarr; {String(event.data.new_state)}
          </span>
        )}
        {"tool_name" in event.data && (
          <span className="text-zinc-400 ml-1">
            {String(event.data.tool_name)}
          </span>
        )}
      </div>
      <span className="shrink-0 text-zinc-600">
        {formatTime(event.timestamp)}
      </span>
    </motion.div>
  );
}
