import { Bot, Shield, Wand2 } from "lucide-react";
import type { AgentState, NodeType } from "@/types";

export const nodeTypeIcon = {
  steward: Shield,
  conductor: Wand2,
  agent: Bot,
} as const;

export const stateColor: Record<AgentState, string> = {
  running: "bg-emerald-400",
  idle: "bg-blue-400",
  initializing: "bg-amber-400",
  error: "bg-red-400",
  terminated: "bg-zinc-500",
};

export const stateBadgeColor: Record<AgentState, string> = {
  running: "bg-emerald-400/20 text-emerald-300 border-emerald-500/30",
  idle: "bg-blue-400/20 text-blue-300 border-blue-500/30",
  initializing: "bg-amber-400/20 text-amber-300 border-amber-500/30",
  error: "bg-red-400/20 text-red-300 border-red-500/30",
  terminated: "bg-zinc-400/20 text-zinc-300 border-zinc-500/30",
};

export const stateBorder: Record<AgentState, string> = {
  running: "border-emerald-500/50",
  idle: "border-blue-500/50",
  initializing: "border-amber-500/50",
  error: "border-red-500/50",
  terminated: "border-zinc-600/50",
};

export const nodeTypeBorder: Record<NodeType, string> = {
  steward: "border-amber-500/60",
  conductor: "border-purple-500/60",
  agent: "border-zinc-700/60",
};
