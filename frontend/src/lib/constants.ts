import { Bot, Shield } from "lucide-react";
import { type AgentState, type NodeType } from "@/types";

export const nodeTypeIcon = {
  steward: Shield,
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
  return name ?? roleName ?? (nodeType === "steward" ? "Assistant" : "Agent");
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
    "bg-graph-status-running/12 text-graph-status-running border-graph-status-running/30",
  idle: "bg-graph-status-idle/10 text-graph-status-idle border-graph-status-idle/20",
  initializing:
    "bg-graph-status-initializing/12 text-graph-status-initializing border-graph-status-initializing/30",
  error:
    "bg-graph-status-error/12 text-graph-status-error border-graph-status-error/30",
  terminated:
    "bg-graph-status-terminated/10 text-graph-status-terminated border-graph-status-terminated/20",
};

export const stateRing: Record<AgentState, string> = {
  running: "agent-state-ring-running",
  idle: "agent-state-ring-idle",
  initializing: "agent-state-ring-initializing",
  error: "agent-state-ring-error",
  terminated: "agent-state-ring-terminated",
};

export const nodeTypeIconStyle: Record<NodeType, string> = {
  steward:
    "rounded-sm border-graph-steward/40 bg-graph-steward/10 text-graph-steward",
  agent: "rounded-sm border-graph-node-border bg-surface-3 text-foreground/80",
};

export const stateBorder: Record<AgentState, string> = {
  running: "border-graph-status-running/60",
  idle: "border-graph-node-border",
  initializing: "border-graph-status-initializing/60",
  error: "border-graph-status-error/60",
  terminated: "border-graph-node-border",
};
