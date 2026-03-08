import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  nodeTypeIcon,
  stateBorder,
  stateColor,
  stateRing,
  stateBadgeColor,
} from "@/lib/constants";
import type { AgentState, NodeType } from "@/types";

interface AgentNodeData {
  node_type: NodeType;
  state: AgentState;
  shortId: string;
  name: string | null;
  latestTodo: string | null;
  selected: boolean;
  toolCall: string | null;
  [key: string]: unknown;
}

export function AgentGraphNode({ data }: NodeProps) {
  const { node_type, state, name, latestTodo, selected, toolCall } =
    data as unknown as AgentNodeData;
  const Icon = nodeTypeIcon[node_type];
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!nodeRef.current) return;
      const rect = nodeRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;

      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxDistance = 400; // Effect radius

      const intensity = Math.max(0, 1 - distance / maxDistance);
      // Angle in degrees, where top is 0
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;

      nodeRef.current.style.setProperty("--mouse-angle", `${angle}deg`);
      nodeRef.current.style.setProperty(
        "--mouse-intensity",
        intensity.toString(),
      );
    };

    // Initialize with a default slightly-off angle so it looks nice before movement
    if (nodeRef.current) {
      nodeRef.current.style.setProperty("--mouse-angle", "135deg");
      nodeRef.current.style.setProperty("--mouse-intensity", "0");
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const isToolActive = !!toolCall;
  const isRunning = state === "running";

  const baseBorder = isToolActive
    ? "border-graph-attention/70"
    : stateBorder[state];

  const borderClass = selected
    ? "ring-1 ring-graph-selection/25 border-graph-selection/80"
    : cn(baseBorder, "hover:border-graph-node-border-hover");

  return (
    <motion.div
      ref={nodeRef}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "relative isolate flex min-w-[210px] max-w-[260px] items-center gap-3 overflow-visible rounded-md border px-4 py-3",
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
      {isRunning && <div aria-hidden="true" className="agent-loading-border" />}

      <Handle
        type="target"
        position={Position.Top}
        className="!z-10 !size-2.5 !border !border-graph-handle-border !bg-graph-handle-bg"
      />

      <div className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-sm border border-graph-node-border bg-surface-3 text-foreground/80">
        <Icon className="size-5" />
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="truncate text-sm font-semibold text-foreground">
          {name ?? <span className="capitalize">{node_type}</span>}
        </span>

        <div
          title={latestTodo ?? undefined}
          className={cn(
            "flex shrink-0 items-center justify-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider min-w-[72px]",
            stateBadgeColor[state],
          )}
        >
          <span className="relative flex size-2 shrink-0">
            {(isRunning || isToolActive) && (
              <span
                className={cn(
                  "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                  isToolActive ? "bg-graph-attention" : stateColor[state],
                )}
              />
            )}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                isToolActive ? "bg-graph-attention" : stateColor[state],
              )}
            />
          </span>
          <span>{isToolActive ? "Active" : state}</span>
        </div>
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
