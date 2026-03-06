import type { CSSProperties, RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { stateBadgeColor } from "@/lib/constants";
import type { Node } from "@/types";

interface AgentGraphTooltipProps {
  agent: Node | null;
  agentId: string | null;
  style?: CSSProperties;
  tooltipRef: RefObject<HTMLDivElement | null>;
}

export function AgentGraphTooltip({
  agent,
  agentId,
  style,
  tooltipRef,
}: AgentGraphTooltipProps) {
  return (
    <AnimatePresence>
      {agent && agentId ? (
        <motion.div
          ref={tooltipRef}
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 2, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-none fixed z-[100] rounded-md border border-glass-border bg-glass-bg px-3 py-2 shadow-xl backdrop-blur-sm"
          style={style}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">
              {agent.name ?? (
                <span className="capitalize">{agent.node_type}</span>
              )}
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] ${stateBadgeColor[agent.state]}`}
            >
              {agent.state.toUpperCase()}
            </Badge>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
            {agentId.slice(0, 8)}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
