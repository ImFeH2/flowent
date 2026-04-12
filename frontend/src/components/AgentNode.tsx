import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import { useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  getNodeIconStyle,
  nodeTypeIcon,
  stateBorder,
  stateColor,
  stateRing,
} from "@/lib/constants";
import type { AgentState, NodeType } from "@/types";

interface AgentNodeData {
  label: string;
  width: number;
  node_type: NodeType;
  is_leader: boolean;
  state: AgentState;
  shortId: string;
  name: string | null;
  role_name: string | null;
  latestTodo: string | null;
  selected: boolean;
  toolCall: string | null;
  leaving: boolean;
  showIncomingHandle: boolean;
  showOutgoingHandle: boolean;
  [key: string]: unknown;
}

export const AgentNode = memo(function AgentNode({ data }: NodeProps) {
  const {
    label,
    node_type,
    is_leader,
    state,
    latestTodo,
    selected,
    toolCall,
    showIncomingHandle,
    showOutgoingHandle,
  } = data as unknown as AgentNodeData;
  const leaving = Boolean((data as AgentNodeData).leaving);
  const Icon = nodeTypeIcon[node_type];
  const nodeRef = useRef<HTMLDivElement>(null);

  const updateMouseEffect = (clientX: number, clientY: number) => {
    if (!nodeRef.current) return;
    const rect = nodeRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const intensity = Math.max(0, 1 - distance / 240);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;

    nodeRef.current.style.setProperty("--mouse-angle", `${angle}deg`);
    nodeRef.current.style.setProperty(
      "--mouse-intensity",
      intensity.toString(),
    );
  };

  const resetMouseEffect = () => {
    if (!nodeRef.current) return;
    nodeRef.current.style.setProperty("--mouse-angle", "135deg");
    nodeRef.current.style.setProperty("--mouse-intensity", "0");
  };

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
      initial={{ opacity: 0, scale: 0.92, filter: "blur(6px) grayscale(0%)" }}
      animate={{
        opacity: leaving ? 0 : state === "terminated" ? 0.4 : 1,
        scale: leaving ? 0.9 : 1,
        y: leaving ? 8 : 0,
        filter: leaving
          ? "blur(8px) grayscale(100%)"
          : state === "terminated"
            ? "blur(0px) grayscale(100%)"
            : "blur(0px) grayscale(0%)",
      }}
      transition={{ duration: leaving ? 0.28 : 0.35, ease: [0.23, 1, 0.32, 1] }}
      onMouseEnter={(event) => updateMouseEffect(event.clientX, event.clientY)}
      onMouseMove={(event) => updateMouseEffect(event.clientX, event.clientY)}
      onMouseLeave={resetMouseEffect}
      className={cn(
        "relative isolate flex h-14 w-max min-w-[100px] max-w-[300px] items-center gap-2 overflow-visible rounded-[10px] border px-2.5 py-2.5",
        "shadow-[0_10px_24px_rgba(0,0,0,0.24)]",
        "bg-graph-node-bg",
        "transition-[border-color] duration-300",
        leaving && "pointer-events-none",
        borderClass,
      )}
      style={
        {
          "--mouse-angle": "135deg",
          "--mouse-intensity": "0",
        } as CSSProperties
      }
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
        className={cn(
          "!z-10 !size-2 !border !border-graph-handle-border !bg-graph-handle-bg transition-opacity duration-150",
          !showIncomingHandle && "!opacity-0 !pointer-events-none",
        )}
      />

      <div
        className={cn(
          "relative z-10 flex size-8 shrink-0 items-center justify-center border",
          getNodeIconStyle(node_type, is_leader),
        )}
      >
        <Icon className="size-4.5" />
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 items-center justify-between gap-2">
        <span
          className="truncate text-[13px] font-semibold text-foreground -translate-y-[0.7px]"
          title={latestTodo ?? undefined}
        >
          {label}
        </span>

        <div
          className="relative flex items-center pr-0.5"
          title={isToolActive ? "Active" : state}
        >
          <span className="relative flex size-2.5">
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
                "relative inline-flex size-2.5 rounded-full border border-card shadow-sm",
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
          className="absolute -bottom-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap"
        >
          <span className="rounded-sm border border-graph-attention/24 bg-surface-2/92 px-1.5 py-0.5 text-[9px] font-mono text-graph-attention-text shadow-lg backdrop-blur-sm">
            {toolCall}
          </span>
        </motion.div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!z-10 !size-2 !border !border-graph-handle-border !bg-graph-handle-bg transition-opacity duration-150",
          !showOutgoingHandle && "!opacity-0 !pointer-events-none",
        )}
      />
    </motion.div>
  );
});
