import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgents } from "@/hooks/useAgents";
import type { AgentEvent, Node } from "@/types";

const fetchNodesMock = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchNodes: (...args: unknown[]) => fetchNodesMock(...args),
}));

function buildNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  return {
    id: overrides.id,
    node_type: overrides.node_type ?? "agent",
    tab_id: overrides.tab_id ?? null,
    is_leader: overrides.is_leader ?? false,
    state: overrides.state ?? "idle",
    connections: overrides.connections ?? [],
    name: overrides.name ?? null,
    todos: overrides.todos ?? [],
    role_name: overrides.role_name ?? "Worker",
    position: overrides.position ?? null,
  };
}

describe("useAgents", () => {
  beforeEach(() => {
    fetchNodesMock.mockReset();
  });

  it("removes deleted tab nodes and stale connections when a tab is deleted", async () => {
    fetchNodesMock.mockResolvedValue([
      buildNode({
        id: "assistant",
        node_type: "assistant",
        role_name: "Steward",
      }),
      buildNode({
        id: "node-a",
        tab_id: "tab-1",
        name: "Alpha",
        connections: ["node-b"],
      }),
      buildNode({
        id: "node-b",
        tab_id: "tab-1",
        name: "Beta",
      }),
      buildNode({
        id: "node-c",
        tab_id: "tab-2",
        name: "Gamma",
        connections: ["node-a", "assistant"],
      }),
    ]);

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.agents.size).toBe(4);
    });

    const event: AgentEvent = {
      type: "tab_deleted",
      agent_id: "assistant",
      data: {
        id: "tab-1",
        removed_node_ids: ["node-a", "node-b"],
      },
      timestamp: Date.now(),
    };

    act(() => {
      result.current.handleUpdateEvent(event);
    });

    expect(result.current.agents.has("node-a")).toBe(false);
    expect(result.current.agents.has("node-b")).toBe(false);
    expect(result.current.agents.get("node-c")?.connections).toEqual([
      "assistant",
    ]);
  });

  it("falls back to the deleted tab id when removed node ids are missing", async () => {
    fetchNodesMock.mockResolvedValue([
      buildNode({
        id: "assistant",
        node_type: "assistant",
        role_name: "Steward",
      }),
      buildNode({
        id: "leader",
        tab_id: "tab-1",
        is_leader: true,
        connections: ["worker"],
      }),
      buildNode({
        id: "worker",
        tab_id: "tab-1",
      }),
      buildNode({
        id: "observer",
        tab_id: "tab-2",
        connections: ["leader", "assistant"],
      }),
    ]);

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.agents.size).toBe(4);
    });

    act(() => {
      result.current.handleUpdateEvent({
        type: "tab_deleted",
        agent_id: "assistant",
        data: {
          id: "tab-1",
        },
        timestamp: Date.now(),
      });
    });

    expect(result.current.agents.has("leader")).toBe(false);
    expect(result.current.agents.has("worker")).toBe(false);
    expect(result.current.agents.get("observer")?.connections).toEqual([
      "assistant",
    ]);
  });
});
