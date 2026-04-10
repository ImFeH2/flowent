import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "motion/react";
import { useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { nodeTypeIcon, nodeTypeIconStyle, stateColor } from "@/lib/constants";
import type { AgentState, NodeType } from "@/types";

interface AgentNodeData {
  label: string;
  width: number;
  node_type: NodeType;
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

export function AgentNode({ data }: NodeProps) {
  const {
    label,
    width,
    node_type,
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
    ? "border-emerald-500/30 shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]"
    : "border-white/[0.08]";

  const borderClass = selected
    ? "ring-1 ring-white/30 border-white/40 bg-white/[0.06]"
    : cn(baseBorder, "hover:border-white/[0.15] hover:bg-white/[0.04]");

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
        "relative isolate flex h-14 min-w-0 items-center gap-3 overflow-visible rounded-2xl border px-3.5 py-2.5",
        "bg-black/60 backdrop-blur-2xl shadow-xl",
        "transition-all duration-300",
        leaving && "pointer-events-none",
        borderClass,
      )}
      style={
        {
          width: `${width}px`,
          "--mouse-angle": "135deg",
          "--mouse-intensity": "0",
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.04] to-transparent opacity-50"
      />

      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          "!z-10 !size-2 !border-none !bg-white/40 transition-all duration-300 hover:!bg-white hover:!size-3 hover:!-top-1.5",
          !showIncomingHandle && "!opacity-0 !pointer-events-none",
        )}
      />

      <div
        className={cn(
          "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.02]",
          nodeTypeIconStyle[node_type],
        )}
      >
        <Icon className="size-4.5 text-white/80" />
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 items-center justify-between gap-2">
        <span
          className="truncate text-[13px] font-medium tracking-wide text-white/90"
          title={latestTodo ?? undefined}
        >
          {label}
        </span>

        <div
          className="relative flex items-center pr-0.5"
          title={isToolActive ? "Active" : state}
        >
          <span className="relative flex size-2.5 items-center justify-center">
            {(isRunning || isToolActive) && (
              <span
                className={cn(
                  "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                  isToolActive ? "bg-emerald-400" : stateColor[state],
                )}
              />
            )}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                isToolActive ? "bg-emerald-400" : stateColor[state],
              )}
            />
          </span>
        </div>
      </div>

      {isToolActive && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -bottom-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap"
        >
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-mono font-medium text-emerald-300 shadow-lg backdrop-blur-md">
            {toolCall}
          </span>
        </motion.div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!z-10 !size-2 !border-none !bg-white/40 transition-all duration-300 hover:!bg-white hover:!size-3 hover:!-bottom-1.5",
          !showOutgoingHandle && "!opacity-0 !pointer-events-none",
        )}
      />
    </motion.div>
  );
}
