import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTabs } from "@/hooks/useTabs";
import type { AgentEvent, TaskTab } from "@/types";

const fetchTabsMock = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchTabs: (...args: unknown[]) => fetchTabsMock(...args),
}));

function buildTab(overrides: Partial<TaskTab> = {}): TaskTab {
  return {
    id: overrides.id ?? "tab-1",
    title: overrides.title ?? "Execution",
    goal: overrides.goal ?? "Coordinate work",
    leader_id: overrides.leader_id ?? "leader-1",
    created_at: overrides.created_at ?? 1,
    updated_at: overrides.updated_at ?? 1,
    network_source: overrides.network_source ?? {
      state: "manual",
      blueprint_id: null,
      blueprint_name: null,
      blueprint_version: null,
      blueprint_available: false,
    },
    node_count: overrides.node_count ?? 2,
    edge_count: overrides.edge_count ?? 1,
  };
}

describe("useTabs", () => {
  beforeEach(() => {
    fetchTabsMock.mockReset();
  });

  it("merges partial tab updates without dropping existing fields", async () => {
    fetchTabsMock.mockResolvedValue([buildTab()]);

    const { result } = renderHook(() => useTabs());

    await waitFor(() => {
      expect(result.current.tabs.size).toBe(1);
    });

    const event: AgentEvent = {
      type: "tab_updated",
      agent_id: "assistant",
      timestamp: Date.now(),
      data: {
        id: "tab-1",
        goal: "Review findings",
        updated_at: 9,
      },
    };

    act(() => {
      result.current.handleUpdateEvent(event);
    });

    expect(result.current.tabs.get("tab-1")).toEqual({
      ...buildTab(),
      goal: "Review findings",
      updated_at: 9,
    });
  });

  it("allows explicit nullable tab updates while preserving unrelated fields", async () => {
    fetchTabsMock.mockResolvedValue([buildTab()]);

    const { result } = renderHook(() => useTabs());

    await waitFor(() => {
      expect(result.current.tabs.size).toBe(1);
    });

    const event: AgentEvent = {
      type: "tab_updated",
      agent_id: "assistant",
      timestamp: Date.now(),
      data: {
        id: "tab-1",
        leader_id: null,
        node_count: null,
      },
    };

    act(() => {
      result.current.handleUpdateEvent(event);
    });

    expect(result.current.tabs.get("tab-1")).toEqual({
      ...buildTab(),
      leader_id: null,
      node_count: undefined,
    });
  });
});
