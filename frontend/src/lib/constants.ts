import { Bot, Shield, Wand2 } from "lucide-react";
import { type AgentState, type NodeType } from "@/types";

export const nodeTypeIcon = {
  steward: Shield,
  conductor: Wand2,
  agent: Bot,
} as const;

export const stateColor: Record<AgentState, string> = {
  running: "bg-emerald-400",
  idle: "bg-sky-400",
  initializing: "bg-amber-400",
  error: "bg-rose-400",
  terminated: "bg-slate-400",
};

export const stateBadgeColor: Record<AgentState, string> = {
  running:
    "bg-emerald-100/80 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800",
  idle: "bg-sky-100/80 text-sky-700 border-sky-200 dark:bg-sky-900/50 dark:text-sky-300 dark:border-sky-800",
  initializing:
    "bg-amber-100/80 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800",
  error:
    "bg-rose-100/80 text-rose-700 border-rose-200 dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800",
  terminated:
    "bg-slate-100/80 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700",
};

export const stateBorder: Record<AgentState, string> = {
  running: "border-emerald-300/80",
  idle: "border-sky-300/80",
  initializing: "border-amber-300/80",
  error: "border-rose-300/80",
  terminated: "border-slate-300/80",
};

export const nodeTypeBorder: Record<NodeType, string> = {
  steward: "border-cyan-300/80",
  conductor: "border-sky-300/80",
  agent: "border-slate-300/80",
};
