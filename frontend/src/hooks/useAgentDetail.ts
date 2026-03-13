import { useState, useEffect, useMemo } from "react";
import { useAgentRuntime } from "@/context/AgentContext";
import { fetchNodeDetail } from "@/lib/api";
import { mergeHistoryWithDeltas } from "@/lib/history";
import type { NodeDetail } from "@/types";

export function useAgentDetail(agentId: string | null) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const { agentHistories, clearAgentHistory, streamingDeltas, agents } =
    useAgentRuntime();

  useEffect(() => {
    if (!agentId) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      clearAgentHistory(agentId);
      try {
        const data = await fetchNodeDetail(agentId, controller.signal);
        if (cancelled) return;
        setDetail(data);
        setFetchedAt(Date.now());
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setDetail(null);
        setError(
          err instanceof Error ? err.message : "Failed to fetch node detail",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [agentId, clearAgentHistory]);

  const merged = useMemo(() => {
    if (!detail || !agentId) return null;
    const incremental = agentHistories.get(agentId);
    const deltas = streamingDeltas.get(agentId);
    const base = mergeHistoryWithDeltas({
      history: detail.history,
      incremental,
      deltas,
      fetchedAt,
    });

    const liveAgent = agentId ? agents.get(agentId) : undefined;
    const merged = { ...detail, history: base };
    if (liveAgent) {
      merged.state = liveAgent.state;
      merged.todos = liveAgent.todos;
    }
    return merged;
  }, [detail, agentId, agentHistories, streamingDeltas, agents, fetchedAt]);

  return { detail: merged, loading, error, fetchedAt };
}
