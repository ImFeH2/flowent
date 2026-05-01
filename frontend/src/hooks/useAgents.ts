import { useState, useCallback, useEffect } from "react";
import type { Node, AgentEvent } from "@/types";
import { fetchNodes } from "@/lib/api";
import { getDeletedTabNodeIds } from "@/lib/tabEvents";

export function useAgents() {
  const [agents, setAgents] = useState<Map<string, Node>>(new Map());

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

  const handleUpdateEvent = useCallback((event: AgentEvent) => {
    if (event.type === "node_created") {
      const data = event.data as unknown as {
        node_type: Node["node_type"];
        tab_id?: string | null;
        is_leader?: boolean;
        role_name?: string | null;
        name?: string | null;
      };
      setAgents((prev) => {
        const next = new Map(prev);
        next.set(event.agent_id, {
          id: event.agent_id,
          node_type: data.node_type,
          tab_id: data.tab_id ?? null,
          is_leader: data.is_leader ?? false,
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
        const tabId = event.data.tab_id as Node["tab_id"] | undefined;
        const isLeader = event.data.is_leader as Node["is_leader"] | undefined;
        const name = event.data.name as Node["name"] | undefined;
        next.set(event.agent_id, {
          ...node,
          state:
            event.type === "node_state_changed"
              ? (event.data.new_state as Node["state"])
              : node.state,
          tab_id: tabId ?? node.tab_id,
          is_leader: isLeader ?? node.is_leader,
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
    } else if (event.type === "node_deleted") {
      setAgents((prev) => {
        if (!prev.has(event.agent_id)) {
          return prev;
        }
        const next = new Map(prev);
        next.delete(event.agent_id);
        for (const [nodeId, node] of next.entries()) {
          const connections = node.connections.filter(
            (connection) => connection !== event.agent_id,
          );
          if (connections.length !== node.connections.length) {
            next.set(nodeId, { ...node, connections });
          }
        }
        return next;
      });
    } else if (event.type === "tab_deleted") {
      setAgents((prev) => {
        const removedNodeIdSet = getDeletedTabNodeIds(event.data, prev);
        if (removedNodeIdSet.size === 0) {
          return prev;
        }
        const next = new Map(prev);
        for (const nodeId of removedNodeIdSet) {
          next.delete(nodeId);
        }
        for (const [nodeId, node] of next.entries()) {
          const connections = node.connections.filter(
            (connection) => !removedNodeIdSet.has(connection),
          );
          if (connections.length !== node.connections.length) {
            next.set(nodeId, { ...node, connections });
          }
        }
        return next;
      });
    } else if (event.type === "node_connected") {
      const { from_id, to_id } = event.data as {
        from_id: string;
        to_id: string;
      };
      setAgents((prev) => {
        const next = new Map(prev);
        const source = next.get(from_id);
        if (source && !source.connections.includes(to_id)) {
          next.set(from_id, {
            ...source,
            connections: [...source.connections, to_id],
          });
        }
        return next;
      });
    } else if (event.type === "node_disconnected") {
      const { from_id, to_id } = event.data as {
        from_id: string;
        to_id: string;
      };
      setAgents((prev) => {
        const next = new Map(prev);
        const source = next.get(from_id);
        if (!source) return prev;
        next.set(from_id, {
          ...source,
          connections: source.connections.filter(
            (connection) => connection !== to_id,
          ),
        });
        return next;
      });
    }
  }, []);

  return { agents, handleUpdateEvent };
}
