import { useCallback, useEffect, useState } from "react";
import { fetchGraphs } from "@/lib/api";
import type { AgentEvent, Graph } from "@/types";

export function useGraphs() {
  const [graphs, setGraphs] = useState<Map<string, Graph>>(new Map());

  useEffect(() => {
    fetchGraphs()
      .then((list) => {
        const next = new Map<string, Graph>();
        for (const graph of list) {
          next.set(graph.id, graph);
        }
        setGraphs(next);
      })
      .catch(() => {});
  }, []);

  const handleUpdateEvent = useCallback((event: AgentEvent) => {
    if (event.type !== "graph_created") {
      return;
    }

    const data = event.data as Partial<Graph>;
    if (
      typeof data.id !== "string" ||
      typeof data.owner_agent_id !== "string"
    ) {
      return;
    }

    const graphId = data.id;
    const ownerAgentId = data.owner_agent_id;

    setGraphs((prev) => {
      const next = new Map(prev);
      next.set(graphId, {
        id: graphId,
        owner_agent_id: ownerAgentId,
        parent_graph_id:
          typeof data.parent_graph_id === "string"
            ? data.parent_graph_id
            : null,
        name: typeof data.name === "string" ? data.name : null,
        goal: typeof data.goal === "string" ? data.goal : "",
      });
      return next;
    });
  }, []);

  return { graphs, handleUpdateEvent };
}
