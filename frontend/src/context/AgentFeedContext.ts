import { createContext, useContext } from "react";
import type { HistoryEntry } from "@/types";

export interface ActivityFeedEntry {
  id: string;
  agentId: string;
  entry: HistoryEntry;
  timestampMs: number;
}

export interface AgentFeedContextValue {
  recentActivities: ActivityFeedEntry[];
}

export const AgentFeedContext = createContext<AgentFeedContextValue | null>(
  null,
);

export const MAX_ACTIVITY_FEED_ITEMS = 48;

export function normalizeEventTimestampMs(timestamp: number): number {
  return timestamp > 1_000_000_000_000
    ? Math.round(timestamp)
    : Math.round(timestamp * 1000);
}

export function useAgentFeedRuntime() {
  const ctx = useContext(AgentFeedContext);
  if (!ctx) {
    throw new Error("useAgentFeedRuntime must be used within AgentProvider");
  }
  return ctx;
}
