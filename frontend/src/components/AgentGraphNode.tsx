import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  nodeTypeIcon,
  stateBorder,
  stateColor,
  stateRing,
} from "@/lib/constants";
import type { AgentState, NodeType } from "@/types";

interface AgentNodeData {
  node_type: NodeType;
  state: AgentState;
  shortId: string;
  name: string | null;
  selected: boolean;
  toolCall: string | null;
  [key: string]: unknown;
}

export function AgentGraphNode({ data }: NodeProps) {
  const { node_type, state, shortId, name, selected, toolCall } =
    data as unknown as AgentNodeData;
  const Icon = nodeTypeIcon[node_type];

  const isToolActive = !!toolCall;
  const isRunning = state === "running";

  const baseBorder = isToolActive
    ? "border-graph-attention/70"
    : stateBorder[state];

  const borderClass = selected
    ? "ring-1 ring-graph-selection/25 border-graph-selection/80"
    : cn(
        baseBorder,
        (state === "idle" || state === "terminated") &&
          "hover:border-graph-node-border-hover",
      );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "relative isolate flex min-w-[210px] items-center gap-3 overflow-visible rounded-md border px-4 py-3",
        "shadow-[0_10px_24px_rgba(0,0,0,0.32)]",
        "bg-graph-node-bg",
        borderClass,
        state === "terminated" && "opacity-40 grayscale",
      )}
    >
      <div
        aria-hidden="true"
        className={cn("agent-state-ring", stateRing[state])}
      />

      <Handle
        type="target"
        position={Position.Top}
        className="!z-10 !size-2.5 !border !border-graph-handle-border !bg-graph-handle-bg"
      />

      <div className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-sm border border-graph-node-border bg-surface-3 text-foreground/80">
        <Icon className="size-5" />
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-foreground">
          {name ?? <span className="capitalize">{node_type}</span>}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {shortId}
        </span>
      </div>

      <div className="relative z-10 flex items-center gap-2">
        <span className="relative flex size-3">
          {(isRunning || isToolActive) && (
            <span
              className={cn(
                "absolute inline-flex size-full animate-ping rounded-full opacity-40",
                isToolActive ? "bg-graph-attention" : stateColor[state],
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex size-3 rounded-full border border-card shadow-sm",
              isToolActive ? "bg-graph-attention" : stateColor[state],
            )}
          />
        </span>
      </div>

      {isToolActive && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -bottom-7 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap"
        >
          <span className="rounded-sm border border-graph-attention/30 bg-surface-2 px-2 py-1 text-[10px] font-mono text-graph-attention-text shadow-lg backdrop-blur-sm">
            {toolCall}
          </span>
        </motion.div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!z-10 !size-2.5 !border !border-graph-handle-border !bg-graph-handle-bg"
      />
    </motion.div>
  );
}
