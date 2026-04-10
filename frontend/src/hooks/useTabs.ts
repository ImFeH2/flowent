import { useCallback, useEffect, useState } from "react";
import { fetchTabs } from "@/lib/api";
import type { AgentEvent, TaskTab } from "@/types";

export function useTabs() {
  const [tabs, setTabs] = useState<Map<string, TaskTab>>(new Map());

  useEffect(() => {
    fetchTabs()
      .then((items) => {
        const next = new Map<string, TaskTab>();
        for (const tab of items) {
          next.set(tab.id, tab);
        }
        setTabs(next);
      })
      .catch(() => {});
  }, []);

  const handleUpdateEvent = useCallback((event: AgentEvent) => {
    if (event.type === "tab_created" || event.type === "tab_updated") {
      const data = event.data as Partial<TaskTab>;
      if (typeof data.id !== "string" || typeof data.title !== "string") {
        return;
      }
      const id = data.id;
      const title = data.title;
      setTabs((prev) => {
        const next = new Map(prev);
        next.set(id, {
          id,
          title,
          goal: typeof data.goal === "string" ? data.goal : "",
          leader_id: typeof data.leader_id === "string" ? data.leader_id : null,
          created_at:
            typeof data.created_at === "number" ? data.created_at : Date.now(),
          updated_at:
            typeof data.updated_at === "number" ? data.updated_at : Date.now(),
          node_count:
            typeof data.node_count === "number" ? data.node_count : undefined,
          edge_count:
            typeof data.edge_count === "number" ? data.edge_count : undefined,
        });
        return next;
      });
      return;
    }

    if (event.type !== "tab_deleted") {
      return;
    }

    const data = event.data as Partial<TaskTab>;
    if (typeof data.id !== "string") {
      return;
    }
    const id = data.id;
    setTabs((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { tabs, handleUpdateEvent };
}
