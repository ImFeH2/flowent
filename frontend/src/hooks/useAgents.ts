import { useState, useCallback, useEffect } from "react";
import type { Agent, AgentEvent } from "@/types";

const MAX_EVENTS = 200;

export function useAgents() {
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data: { agents: (Agent & { name?: string | null })[] }) => {
        const map = new Map<string, Agent>();
        for (const a of data.agents) {
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
        branch?: string;
        name?: string | null;
      };
      setAgents((prev) => {
        const next = new Map(prev);
        next.set(event.agent_id, {
          id: event.agent_id,
          role: data.role,
          state: "initializing",
          branch: data.branch ?? null,
          children: [],
          name: data.name ?? null,
          status_description: "",
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
        next.set(event.agent_id, {
          ...agent,
          state: event.data.new_state as Agent["state"],
          status_description:
            (event.data.status_description as string) ??
            agent.status_description,
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
