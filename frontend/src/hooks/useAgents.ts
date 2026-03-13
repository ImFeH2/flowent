import { useState, useCallback, useEffect } from "react";
import type { Node, AgentEvent } from "@/types";
import { fetchNodes } from "@/lib/api";

const MAX_EVENTS = 200;

export function useAgents() {
  const [agents, setAgents] = useState<Map<string, Node>>(new Map());
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    fetchNodes()
      .then((list) => {
        const map = new Map<string, Node>();
        for (const n of list) {
          map.set(n.id, { ...n, name: n.name ?? null });
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
    if (event.type === "node_created") {
      const data = event.data as unknown as {
        node_type: Node["node_type"];
        role_name?: string | null;
        name?: string | null;
      };
      setAgents((prev) => {
        const next = new Map(prev);
        next.set(event.agent_id, {
          id: event.agent_id,
          node_type: data.node_type,
          role_name: data.role_name ?? null,
          state: "initializing",
          connections: [],
          name: data.name ?? null,
          todos: [],
        });
        return next;
      });
    } else if (
      event.type === "node_state_changed" ||
      event.type === "node_todos_changed"
    ) {
      setAgents((prev) => {
        const node = prev.get(event.agent_id);
        if (!node) return prev;
        const next = new Map(prev);
        const todos = event.data.todos as Node["todos"] | undefined;
        const roleName = event.data.role_name as Node["role_name"] | undefined;
        const name = event.data.name as Node["name"] | undefined;
        next.set(event.agent_id, {
          ...node,
          state:
            event.type === "node_state_changed"
              ? (event.data.new_state as Node["state"])
              : node.state,
          role_name: roleName ?? node.role_name,
          name: name ?? node.name,
          todos: todos ?? node.todos,
        });
        return next;
      });
    } else if (event.type === "node_terminated") {
      setAgents((prev) => {
        const node = prev.get(event.agent_id);
        if (!node) return prev;
        const next = new Map(prev);
        next.set(event.agent_id, { ...node, state: "terminated" });
        return next;
      });
    } else if (event.type === "node_connected") {
      const { a, b } = event.data as { a: string; b: string };
      setAgents((prev) => {
        const next = new Map(prev);
        const nodeA = next.get(a);
        if (nodeA && !nodeA.connections.includes(b)) {
          next.set(a, {
            ...nodeA,
            connections: [...nodeA.connections, b],
          });
        }
        const nodeB = next.get(b);
        if (nodeB && !nodeB.connections.includes(a)) {
          next.set(b, {
            ...nodeB,
            connections: [...nodeB.connections, a],
          });
        }
        return next;
      });
    }
  }, []);

  return { agents, events, handleDisplayEvent, handleUpdateEvent };
}
