import { useState, useCallback, useEffect } from "react";
import type { Agent, AgentEvent } from "@/types";
import { fetchAgents } from "@/lib/api";

const MAX_EVENTS = 200;

export function useAgents() {
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    fetchAgents()
      .then((list) => {
        const map = new Map<string, Agent>();
        for (const a of list) {
          map.set(a.id, { ...a, name: a.name ?? null });
        }
        setAgents(map);
      })
      .catch(() => {});
  }, []);

  const handleDisplayEvent = useCallback((event: AgentEvent) => {
    setEvents((prev) => {
      const next = [...prev, event];
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
    });
  }, []);

  const handleUpdateEvent = useCallback((event: AgentEvent) => {
    if (event.type === "agent_created") {
      const data = event.data as unknown as {
        role: Agent["role"];
        name?: string | null;
      };
      setAgents((prev) => {
        const next = new Map(prev);
        next.set(event.agent_id, {
          id: event.agent_id,
          role: data.role,
          state: "initializing",
          children: [],
          name: data.name ?? null,
          todos: [],
        });
        const parentId = event.data.parent_id as string | undefined;
        if (parentId && next.has(parentId)) {
          const parent = next.get(parentId)!;
          next.set(parentId, {
            ...parent,
            children: [...parent.children, event.agent_id],
          });
        }
        return next;
      });
    } else if (event.type === "agent_state_changed") {
      setAgents((prev) => {
        const agent = prev.get(event.agent_id);
        if (!agent) return prev;
        const next = new Map(prev);
        const todos = event.data.todos as Agent["todos"] | undefined;
        next.set(event.agent_id, {
          ...agent,
          state: event.data.new_state as Agent["state"],
          todos: todos ?? agent.todos,
        });
        return next;
      });
    } else if (event.type === "agent_terminated") {
      setAgents((prev) => {
        const agent = prev.get(event.agent_id);
        if (!agent) return prev;
        const next = new Map(prev);
        next.set(event.agent_id, { ...agent, state: "terminated" });
        return next;
      });
    }
  }, []);

  return { agents, events, handleDisplayEvent, handleUpdateEvent };
}
