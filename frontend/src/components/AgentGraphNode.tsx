import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { roleIcon, stateColor, stateBorder } from "@/lib/constants";
import type { AgentState, Role } from "@/types";

interface AgentNodeData {
  role: Role;
  state: AgentState;
  shortId: string;
  name: string | null;
  selected: boolean;
  toolCall: string | null;
  [key: string]: unknown;
}

export function AgentGraphNode({ data }: NodeProps) {
  const { role, state, shortId, name, selected, toolCall } =
    data as unknown as AgentNodeData;
  const Icon = roleIcon[role];

  const isToolActive = !!toolCall;

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-lg border bg-zinc-900 px-3 py-2 transition-colors",
        isToolActive
          ? "border-amber-400/70 tool-call-pulse"
          : stateBorder[state],
        selected
          ? "ring-2 ring-blue-500 border-blue-500/60"
          : !isToolActive && "hover:border-zinc-600",
        state === "terminated" && "opacity-50",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-zinc-600 !w-2 !h-2 !border-0"
      />
      <Icon className="size-4 shrink-0 text-zinc-400" />
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium text-zinc-200 truncate">
          {name ?? <span className="capitalize">{role}</span>}
        </span>
        <span className="text-[10px] text-zinc-500 font-mono">{shortId}</span>
      </div>
      <span className="relative flex size-2 shrink-0 ml-auto">
        <span
          className={cn(
            "absolute inline-flex size-full rounded-full",
            isToolActive ? "bg-amber-400" : stateColor[state],
            (state === "running" || isToolActive) && "animate-ping opacity-75",
            state === "idle" && !isToolActive && "idle-breathe",
          )}
        />
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            isToolActive ? "bg-amber-400" : stateColor[state],
          )}
        />
      </span>
      {isToolActive && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-amber-900/80 px-1.5 py-0.5 text-[9px] text-amber-200 font-mono">
          {toolCall}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-zinc-600 !w-2 !h-2 !border-0"
      />
    </div>
  );
}
