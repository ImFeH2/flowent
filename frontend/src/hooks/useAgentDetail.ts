import { useState, useEffect, useMemo } from "react";
import { useAgent } from "@/context/AgentContext";
import type { AgentDetail, HistoryEntry, StreamingDelta } from "@/types";

function reduceDeltas(deltas: StreamingDelta[]) {
  let content = "";
  let thinking = "";
  const toolResults = new Map<string, string>();

  for (const d of deltas) {
    switch (d.type) {
      case "content":
        content += d.text;
        break;
      case "thinking":
        thinking += d.text;
        break;
      case "tool_result":
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
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);
  const { agentHistories, clearAgentHistory, streamingDeltas, agents } =
    useAgent();

  useEffect(() => {
    if (!agentId) return;

    let cancelled = false;

    const fetchDetail = async () => {
      setLoading(true);
      clearAgentHistory(agentId);
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error || !Array.isArray(data.history)) return;
        clearAgentHistory(agentId);
        setDetail(data as AgentDetail);
        setFetchedAt(Date.now());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDetail();

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
          type: "assistant_thinking",
          content: thinking,
          from_id: null,
          to_id: null,
          tool_name: null,
          tool_call_id: null,
          arguments: null,
          timestamp: now,
          streaming: true,
        } satisfies HistoryEntry);
      }
      if (content) {
        base.push({
          type: "assistant_text",
          content,
          from_id: null,
          to_id: null,
          tool_name: null,
          tool_call_id: null,
          arguments: null,
          timestamp: now,
          streaming: true,
        } satisfies HistoryEntry);
      }
      if (toolResults.size > 0) {
        for (const [toolCallId, resultText] of toolResults) {
          for (let i = base.length - 1; i >= 0; i--) {
            const entry = base[i];
            if (
              entry.type === "tool_call" &&
              entry.tool_call_id === toolCallId &&
              entry.streaming
            ) {
              base[i] = { ...entry, content: resultText };
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
      merged.status_description = liveAgent.status_description;
    }
    return merged;
  }, [detail, agentId, agentHistories, streamingDeltas, agents, fetchedAt]);

  return { detail: merged, loading, fetchedAt };
}
