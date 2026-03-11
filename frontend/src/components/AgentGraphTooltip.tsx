import type { CSSProperties, RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { getNodeLabel, stateBadgeColor } from "@/lib/constants";
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
  const label = agent
    ? getNodeLabel({
        name: agent.name,
        roleName: agent.role_name,
        nodeType: agent.node_type,
      })
    : null;

  return (
    <AnimatePresence>
      {agent && agentId && label ? (
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
            <span className="text-xs font-medium">{label}</span>
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
