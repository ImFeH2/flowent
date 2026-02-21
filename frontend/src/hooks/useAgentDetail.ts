import { useState, useEffect, useMemo } from "react";
import { useAgent } from "@/context/AgentContext";
import { fetchNodeDetail } from "@/lib/api";
import type { NodeDetail, HistoryEntry, StreamingDelta } from "@/types";

function reduceDeltas(deltas: StreamingDelta[]) {
  let content = "";
  let thinking = "";
  const toolResults = new Map<string, string>();

  for (const d of deltas) {
    switch (d.type) {
      case "ContentDelta":
        content += d.text;
        break;
      case "ThinkingDelta":
        thinking += d.text;
        break;
      case "ToolResultDelta":
        toolResults.set(
          d.tool_call_id,
          (toolResults.get(d.tool_call_id) ?? "") + d.text,
        );
        break;
    }
  }

  return { content, thinking, toolResults };
}

export function useAgentDetail(agentId: string | null) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);
  const { agentHistories, clearAgentHistory, streamingDeltas, agents } =
    useAgent();

  useEffect(() => {
    if (!agentId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      clearAgentHistory(agentId);
      try {
        const data = await fetchNodeDetail(agentId);
        if (cancelled) return;
        clearAgentHistory(agentId);
        setDetail(data);
        setFetchedAt(Date.now());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [agentId, clearAgentHistory]);

  const merged = useMemo(() => {
    if (!detail || !agentId) return null;
    const incremental = agentId ? agentHistories.get(agentId) : undefined;
    const base =
      incremental && incremental.length > 0
        ? [...detail.history, ...incremental]
        : [...detail.history];

    const deltas = agentId ? streamingDeltas.get(agentId) : undefined;
    if (deltas && deltas.length > 0) {
      const { content, thinking, toolResults } = reduceDeltas(deltas);
      const now = fetchedAt / 1000;

      if (thinking) {
        base.push({
          type: "AssistantThinking",
          content: thinking,
          timestamp: now,
          streaming: true,
        } satisfies HistoryEntry);
      }
      if (content) {
        base.push({
          type: "AssistantText",
          content,
          timestamp: now,
          streaming: true,
        } satisfies HistoryEntry);
      }
      if (toolResults.size > 0) {
        for (const [toolCallId, resultText] of toolResults) {
          for (let i = base.length - 1; i >= 0; i--) {
            const entry = base[i];
            if (
              entry.type === "ToolCall" &&
              entry.tool_call_id === toolCallId &&
              entry.streaming
            ) {
              base[i] = { ...entry, result: resultText };
              break;
            }
          }
        }
      }
    }

    const liveAgent = agentId ? agents.get(agentId) : undefined;
    const merged = { ...detail, history: base };
    if (liveAgent) {
      merged.state = liveAgent.state;
      merged.todos = liveAgent.todos;
    }
    return merged;
  }, [detail, agentId, agentHistories, streamingDeltas, agents, fetchedAt]);

  return { detail: merged, loading, fetchedAt };
}
