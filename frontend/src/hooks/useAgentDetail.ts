import { useState, useEffect, useMemo } from "react";
import { useAgent } from "@/context/AgentContext";
import type { AgentDetail, HistoryEntry } from "@/types";

export function useAgentDetail(agentId: string | null) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);
  const { agentHistories, clearAgentHistory, streamingBuffers, agents } = useAgent();

  useEffect(() => {
    if (!agentId) {
      setDetail(null);
      return;
    }

    setLoading(true);
    let cancelled = false;

    clearAgentHistory(agentId);

    fetch(`/api/agents/${agentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error || !Array.isArray(data.history)) {
          setLoading(false);
          return;
        }
        clearAgentHistory(agentId);
        setDetail(data as AgentDetail);
        setFetchedAt(Date.now());
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, clearAgentHistory]);

  const merged = useMemo(() => {
    if (!detail) return null;
    const incremental = agentId ? agentHistories.get(agentId) : undefined;
    const base = incremental && incremental.length > 0
      ? [...detail.history, ...incremental]
      : [...detail.history];

    const buf = agentId ? streamingBuffers.get(agentId) : undefined;
    if (buf) {
      const now = Date.now() / 1000;
      if (buf.thinking) {
        base.push({
          type: "assistant_thinking",
          content: buf.thinking,
          from_id: null,
          to_id: null,
          tool_name: null,
          tool_call_id: null,
          arguments: null,
          timestamp: now,
          streaming: true,
        } satisfies HistoryEntry);
      }
      if (buf.content) {
        base.push({
          type: "assistant_text",
          content: buf.content,
          from_id: null,
          to_id: null,
          tool_name: null,
          tool_call_id: null,
          arguments: null,
          timestamp: now,
          streaming: true,
        } satisfies HistoryEntry);
      }
      if (buf.toolResults.size > 0) {
        for (const [toolCallId, resultText] of buf.toolResults) {
          for (let i = base.length - 1; i >= 0; i--) {
            const entry = base[i];
            if (entry.type === "tool_call" && entry.tool_call_id === toolCallId && entry.streaming) {
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
  }, [detail, agentId, agentHistories, streamingBuffers, agents]);

  return { detail: merged, loading, fetchedAt };
}
