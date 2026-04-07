import { useState, useEffect, useMemo } from "react";
import {
  useAgentHistoryRuntime,
  useAgentNodesRuntime,
} from "@/context/AgentContext";
import { fetchNodeDetail } from "@/lib/api";
import {
  clearConversationHistory,
  mergeHistoryWithDeltas,
} from "@/lib/history";
import type { NodeDetail } from "@/types";

export function useAgentDetail(
  agentId: string | null,
  preserveIncrementalHistory = false,
) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const { agents } = useAgentNodesRuntime();
  const {
    agentHistories,
    clearAgentHistory,
    historyClearedAt,
    streamingDeltas,
  } = useAgentHistoryRuntime();
  const detailHistoryClearedAt = agentId
    ? (historyClearedAt.get(agentId) ?? 0)
    : 0;

  useEffect(() => {
    if (!detailHistoryClearedAt) {
      return;
    }

    setDetail((current) =>
      current
        ? {
            ...current,
            history: clearConversationHistory(current.history),
          }
        : current,
    );
    setFetchedAt(Date.now());
  }, [detailHistoryClearedAt]);

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
      if (!preserveIncrementalHistory) {
        clearAgentHistory(agentId);
      }
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
  }, [
    agentId,
    clearAgentHistory,
    detailHistoryClearedAt,
    preserveIncrementalHistory,
  ]);

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
