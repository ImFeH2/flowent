import { Bot, Shield } from "lucide-react";
import { type AgentState, type NodeType } from "@/types";

export const nodeTypeIcon = {
  assistant: Shield,
  agent: Bot,
} as const;

export function getNodeLabel({
  name,
  roleName,
  nodeType,
}: {
  name: string | null;
  roleName: string | null;
  nodeType: NodeType;
}): string {
  return name ?? roleName ?? (nodeType === "assistant" ? "Assistant" : "Agent");
}

export const stateColor: Record<AgentState, string> = {
  running: "bg-graph-status-running",
  idle: "bg-graph-status-idle",
  initializing: "bg-graph-status-initializing",
  error: "bg-graph-status-error",
  terminated: "bg-graph-status-terminated",
};

export const stateBadgeColor: Record<AgentState, string> = {
  running:
    "border-graph-status-running/18 bg-graph-status-running/[0.12] text-graph-status-running shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]",
  idle: "border-graph-status-idle/10 bg-graph-status-idle/[0.04] text-graph-status-idle/72",
  initializing:
    "border-graph-status-initializing/14 bg-graph-status-initializing/[0.07] text-graph-status-initializing/84",
  error:
    "border-graph-status-error/20 bg-graph-status-error/[0.09] text-graph-status-error shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
  terminated: "border-white/8 bg-white/[0.03] text-white/56",
};

export const stateRing: Record<AgentState, string> = {
  running: "agent-state-ring-running",
  idle: "agent-state-ring-idle",
  initializing: "agent-state-ring-initializing",
  error: "agent-state-ring-error",
  terminated: "agent-state-ring-terminated",
};

export const nodeTypeIconStyle: Record<NodeType, string> = {
  assistant: "rounded-sm border-white/18 bg-white/[0.08] text-white",
  agent: "rounded-sm border-graph-node-border bg-surface-3 text-foreground/80",
};

export const stateBorder: Record<AgentState, string> = {
  running: "border-white/18",
  idle: "border-graph-node-border",
  initializing: "border-white/14 border-dashed",
  error: "border-white/24 border-double",
  terminated: "border-white/8",
};
