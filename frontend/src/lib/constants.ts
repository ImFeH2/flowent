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
  running: "bg-formation-status-running",
  idle: "bg-formation-status-idle",
  initializing: "bg-formation-status-initializing",
  error: "bg-formation-status-error",
  terminated: "bg-formation-status-terminated",
};

export const stateBadgeColor: Record<AgentState, string> = {
  running:
    "bg-formation-status-running/12 text-formation-status-running border-formation-status-running/30",
  idle: "bg-formation-status-idle/10 text-formation-status-idle border-formation-status-idle/20",
  initializing:
    "bg-formation-status-initializing/12 text-formation-status-initializing border-formation-status-initializing/30",
  error:
    "bg-formation-status-error/12 text-formation-status-error border-formation-status-error/30",
  terminated:
    "bg-formation-status-terminated/10 text-formation-status-terminated border-formation-status-terminated/20",
};

export const stateRing: Record<AgentState, string> = {
  running: "agent-state-ring-running",
  idle: "agent-state-ring-idle",
  initializing: "agent-state-ring-initializing",
  error: "agent-state-ring-error",
  terminated: "agent-state-ring-terminated",
};

export const nodeTypeIconStyle: Record<NodeType, string> = {
  assistant:
    "rounded-sm border-formation-assistant/40 bg-formation-assistant/10 text-formation-assistant",
  agent:
    "rounded-sm border-formation-node-border bg-surface-3 text-foreground/80",
};

export const stateBorder: Record<AgentState, string> = {
  running: "border-formation-status-running/60",
  idle: "border-formation-node-border",
  initializing: "border-formation-status-initializing/60",
  error: "border-formation-status-error/60",
  terminated: "border-formation-node-border",
};
