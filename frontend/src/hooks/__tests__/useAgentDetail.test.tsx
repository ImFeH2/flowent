import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentDetail } from "@/hooks/useAgentDetail";
import type { HistoryEntry, Node, NodeDetail } from "@/types";

const useAgentNodesRuntimeMock = vi.fn();
const useAgentHistoryRuntimeMock = vi.fn();
const fetchNodeDetailMock = vi.fn();

vi.mock("@/context/AgentContext", () => ({
  useAgentNodesRuntime: () => useAgentNodesRuntimeMock(),
  useAgentHistoryRuntime: () => useAgentHistoryRuntimeMock(),
}));

vi.mock("@/lib/api", () => ({
  fetchNodeDetail: (...args: unknown[]) => fetchNodeDetailMock(...args),
}));

function buildDetail(history: HistoryEntry[] = []): NodeDetail {
  return {
    id: "assistant",
    node_type: "assistant",
    state: "idle",
    name: null,
    connections: [],
    role_name: "Steward",
    todos: [],
    tools: [],
    write_dirs: [],
    allow_network: false,
    history,
  };
}

function buildNode(): Node {
  return {
    id: "assistant",
    node_type: "assistant",
    state: "idle",
    connections: [],
    name: null,
    todos: [],
    role_name: "Steward",
  };
}

describe("useAgentDetail", () => {
  beforeEach(() => {
    fetchNodeDetailMock.mockReset();
    useAgentNodesRuntimeMock.mockReset();
    useAgentHistoryRuntimeMock.mockReset();
  });

  it("preserves assistant incremental history when requested", async () => {
    const incrementalEntry: HistoryEntry = {
      type: "AssistantText",
      content: "recent message",
      timestamp: 2,
    };
    const agentHistories = new Map<string, HistoryEntry[]>([
      ["assistant", [incrementalEntry]],
    ]);
    const clearAgentHistory = vi.fn((agentId: string) => {
      agentHistories.delete(agentId);
    });

    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map<string, Node>([["assistant", buildNode()]]),
    });
    useAgentHistoryRuntimeMock.mockReturnValue({
      agentHistories,
      clearAgentHistory,
      streamingDeltas: new Map(),
    });
    fetchNodeDetailMock.mockResolvedValue(buildDetail());

    const { result } = renderHook(() => useAgentDetail("assistant", true));

    await waitFor(() => {
      expect(result.current.detail?.history).toEqual([incrementalEntry]);
    });
    expect(clearAgentHistory).not.toHaveBeenCalled();
  });

  it("clears incremental history for regular detail views by default", async () => {
    const incrementalEntry: HistoryEntry = {
      type: "AssistantText",
      content: "recent message",
      timestamp: 2,
    };
    const agentHistories = new Map<string, HistoryEntry[]>([
      ["agent-1", [incrementalEntry]],
    ]);
    const clearAgentHistory = vi.fn((agentId: string) => {
      agentHistories.delete(agentId);
    });

    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map<string, Node>([["assistant", buildNode()]]),
    });
    useAgentHistoryRuntimeMock.mockReturnValue({
      agentHistories,
      clearAgentHistory,
      streamingDeltas: new Map(),
    });
    fetchNodeDetailMock.mockResolvedValue({
      ...buildDetail(),
      id: "agent-1",
      node_type: "agent",
      role_name: "Worker",
    } satisfies NodeDetail);

    const { result } = renderHook(() => useAgentDetail("agent-1"));

    await waitFor(() => {
      expect(result.current.detail?.history).toEqual([]);
    });
    expect(clearAgentHistory).toHaveBeenCalledWith("agent-1");
  });
});
