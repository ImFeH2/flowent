import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAgentNodesRuntime } from "@/context/AgentContext";
import { useAgentFeedRuntime } from "@/context/AgentFeedContext";
import { cn } from "@/lib/utils";
import type { HistoryEntry, Node } from "@/types";

const RECENT_ACTIVITY_WINDOW_MS = 8000;
const MAX_VISIBLE_ACTIVITY_ITEMS = 24;

type ActivityTone = "active" | "quiet" | "alert" | "thinking";

interface ActivityTickerItem {
  id: string;
  text: string;
  tone: ActivityTone;
}

interface SidebarActivityTickerProps {
  width: number;
}

function clampLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function getNodeLabel(
  nodeId: string,
  agents: Map<string, Node>,
  maxLength: number,
): string {
  const node = agents.get(nodeId);
  const preferred = node?.name?.trim() || node?.role_name?.trim();
  if (preferred) {
    return clampLabel(preferred, maxLength);
  }
  if (nodeId === "assistant") {
    return "Assistant";
  }
  const fallback =
    nodeId.includes("-") && nodeId.length > 12 ? nodeId.slice(0, 8) : nodeId;
  return clampLabel(fallback || "unknown", maxLength);
}

function buildTickerItem(
  agentId: string,
  entry: HistoryEntry,
  agents: Map<string, Node>,
  labelMaxLength: number,
  toolMaxLength: number,
): ActivityTickerItem | null {
  const agentLabel = getNodeLabel(agentId, agents, labelMaxLength);

  switch (entry.type) {
    case "ReceivedMessage": {
      const fromLabel =
        entry.from_id === "human"
          ? "Human"
          : getNodeLabel(entry.from_id ?? "unknown", agents, labelMaxLength);
      return {
        id: `${agentId}-${entry.timestamp}-received-${entry.from_id ?? "unknown"}`,
        text: `${agentLabel} <- ${fromLabel}`,
        tone: "active",
      };
    }
    case "AssistantText":
      return {
        id: `${agentId}-${entry.timestamp}-text`,
        text: `${agentLabel} replied`,
        tone: "active",
      };
    case "AssistantThinking":
      return {
        id: `${agentId}-${entry.timestamp}-thinking`,
        text: `${agentLabel} thinking`,
        tone: "thinking",
      };
    case "ToolCall": {
      const toolName = entry.tool_name ?? "tool";
      if (toolName === "send") {
        const toId = String(entry.arguments?.to ?? "");
        const toLabel = toId
          ? getNodeLabel(toId, agents, labelMaxLength)
          : "unknown";
        return {
          id: `${agentId}-${entry.timestamp}-send-${toId || "unknown"}`,
          text: `${agentLabel} -> ${toLabel}`,
          tone: "active",
        };
      }
      if (toolName === "idle") {
        return {
          id: `${agentId}-${entry.timestamp}-idle`,
          text: `${agentLabel} idle`,
          tone: "quiet",
        };
      }
      if (toolName === "todo") {
        const todos = Array.isArray(entry.arguments?.todos)
          ? (entry.arguments?.todos as unknown[])
          : [];
        const count = todos.length;
        return {
          id: `${agentId}-${entry.timestamp}-todo-${count}`,
          text:
            count > 0
              ? `${agentLabel} todo x${count}`
              : `${agentLabel} todo clear`,
          tone: count > 0 ? "active" : "quiet",
        };
      }
      return {
        id: `${agentId}-${entry.timestamp}-tool-${toolName}`,
        text: `${agentLabel} · ${clampLabel(toolName, toolMaxLength)}`,
        tone: toolName === "exit" ? "quiet" : "active",
      };
    }
    case "ErrorEntry":
      return {
        id: `${agentId}-${entry.timestamp}-error`,
        text: `${agentLabel} error`,
        tone: "alert",
      };
    default:
      return null;
  }
}

export function SidebarActivityTicker({ width }: SidebarActivityTickerProps) {
  const { agents } = useAgentNodesRuntime();
  const { recentActivities } = useAgentFeedRuntime();
  const [now, setNow] = useState(() => Date.now());
  const widthProgress = Math.max(0, Math.min(1, (width - 180) / 220));
  const labelMaxLength = width < 220 ? 12 : width < 280 ? 16 : 22;
  const toolMaxLength = width < 220 ? 10 : width < 280 ? 14 : 18;
  const labelFontSizePx = 9.5 + widthProgress * 0.8;
  const tickerFontSizePx = 10.5 + widthProgress * 0.5;
  const rowHeightPx = 22 + widthProgress * 4;
  const itemGapPx = 7 + widthProgress * 3;
  const eventDotSizePx = 4 + widthProgress * 1;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const items = useMemo(
    () =>
      recentActivities
        .slice(-MAX_VISIBLE_ACTIVITY_ITEMS)
        .map((activity) =>
          buildTickerItem(
            activity.agentId,
            activity.entry,
            agents,
            labelMaxLength,
            toolMaxLength,
          ),
        )
        .filter((item): item is ActivityTickerItem => item !== null),
    [agents, labelMaxLength, recentActivities, toolMaxLength],
  );

  const recentBurstCount = useMemo(
    () =>
      recentActivities.filter(
        (entry) => now - entry.timestampMs <= RECENT_ACTIVITY_WINDOW_MS,
      ).length,
    [now, recentActivities],
  );

  const currentItem = items[items.length - 1] ?? null;

  return (
    <div className="flex items-center gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/62">
        <span
          className={cn(
            "size-1.5 rounded-full transition-all duration-300",
            recentBurstCount > 0
              ? "bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.55)]"
              : "bg-white/20",
          )}
        />
        <span style={{ fontSize: `${labelFontSizePx.toFixed(2)}px` }}>
          Live
        </span>
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        {!currentItem ? (
          <div
            className="flex min-w-0 items-center text-muted-foreground/72"
            style={{
              height: `${rowHeightPx.toFixed(2)}px`,
              fontSize: `${tickerFontSizePx.toFixed(2)}px`,
            }}
          >
            <span className="block truncate">Waiting for agent activity</span>
          </div>
        ) : (
          <div
            className="relative min-w-0 overflow-hidden"
            style={{
              height: `${rowHeightPx.toFixed(2)}px`,
            }}
          >
            <AnimatePresence initial={false}>
              <motion.div
                key={currentItem.id}
                initial={{ y: rowHeightPx * 0.65, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -rowHeightPx * 0.65, opacity: 0 }}
                transition={{
                  duration: 0.24,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="absolute inset-0 flex min-w-0 items-center text-muted-foreground/84"
                style={{
                  fontSize: `${tickerFontSizePx.toFixed(2)}px`,
                  gap: `${itemGapPx.toFixed(2)}px`,
                }}
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full",
                    currentItem.tone === "alert"
                      ? "bg-red-300/90"
                      : currentItem.tone === "thinking"
                        ? "bg-amber-300/90"
                        : currentItem.tone === "active"
                          ? "bg-white/80"
                          : "bg-white/28",
                  )}
                  style={{
                    width: `${eventDotSizePx.toFixed(2)}px`,
                    height: `${eventDotSizePx.toFixed(2)}px`,
                  }}
                />
                <span className="block min-w-0 truncate">
                  {currentItem.text}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
