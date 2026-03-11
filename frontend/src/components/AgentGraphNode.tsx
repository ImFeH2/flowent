import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  getNodeLabel,
  nodeTypeIcon,
  nodeTypeIconStyle,
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
  role_name: string | null;
  latestTodo: string | null;
  selected: boolean;
  toolCall: string | null;
  [key: string]: unknown;
}

export function AgentGraphNode({ data }: NodeProps) {
  const { node_type, state, name, role_name, latestTodo, selected, toolCall } =
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
  const label = getNodeLabel({
    name,
    roleName: role_name,
    nodeType: node_type,
  });

  return (
    <motion.div
      ref={nodeRef}
      initial={{ opacity: 0, scale: 0.92, filter: "blur(6px) grayscale(0%)" }}
      animate={{
        opacity: state === "terminated" ? 0.4 : 1,
        scale: 1,
        filter:
          state === "terminated"
            ? "blur(0px) grayscale(100%)"
            : "blur(0px) grayscale(0%)",
      }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "relative isolate flex h-[62px] w-[220px] items-center gap-3 overflow-visible rounded-md border px-4 py-3",
        "shadow-[0_10px_24px_rgba(0,0,0,0.32)]",
        "bg-graph-node-bg",
        "transition-[border-color] duration-300",
        borderClass,
      )}
    >
      <div
        aria-hidden="true"
        className={cn("agent-state-ring", stateRing[state])}
      />
      <div
        aria-hidden="true"
        className={cn(
          "agent-loading-border",
          isRunning && "agent-loading-border-active",
        )}
      />

      <Handle
        type="target"
        position={Position.Top}
        className="!z-10 !size-2.5 !border !border-graph-handle-border !bg-graph-handle-bg"
      />

      <div
        className={cn(
          "relative z-10 flex size-9 shrink-0 items-center justify-center border",
          nodeTypeIconStyle[node_type],
        )}
      >
        <Icon className="size-5" />
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 items-center justify-between gap-3">
        <span
          className="truncate text-sm font-semibold text-foreground"
          title={latestTodo ?? undefined}
        >
          {label}
        </span>

        <div
          className="relative flex items-center pr-1"
          title={isToolActive ? "Active" : state}
        >
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
