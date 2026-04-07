import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import type { HistoryEntry, Node, NodeDetail } from "@/types";

const clearAssistantChatRequestMock = vi.fn();
const useAgentActivityRuntimeMock = vi.fn();
const useAgentConnectionRuntimeMock = vi.fn();
const useAgentHistoryRuntimeMock = vi.fn();
const useAgentNodesRuntimeMock = vi.fn();
const useAgentUIMock = vi.fn();
const fetchNodeDetailMock = vi.fn();

vi.mock("@/context/AgentContext", () => ({
  useAgentActivityRuntime: () => useAgentActivityRuntimeMock(),
  useAgentConnectionRuntime: () => useAgentConnectionRuntimeMock(),
  useAgentHistoryRuntime: () => useAgentHistoryRuntimeMock(),
  useAgentNodesRuntime: () => useAgentNodesRuntimeMock(),
  useAgentUI: () => useAgentUIMock(),
}));

vi.mock("@/lib/api", () => ({
  clearAssistantChatRequest: (...args: unknown[]) =>
    clearAssistantChatRequestMock(...args),
  fetchNodeDetail: (...args: unknown[]) => fetchNodeDetailMock(...args),
}));

function buildAssistantNode(state: Node["state"] = "running"): Node {
  return {
    id: "assistant",
    node_type: "assistant",
    state,
    connections: [],
    name: null,
    todos: [],
    role_name: "Steward",
  };
}

function buildDetail(history: HistoryEntry[]): NodeDetail {
  return {
    id: "assistant",
    node_type: "assistant",
    state: "running",
    name: null,
    contacts: [],
    connections: [],
    role_name: "Steward",
    todos: [],
    tools: [],
    write_dirs: [],
    allow_network: false,
    history,
  };
}

describe("useAssistantChat", () => {
  beforeEach(() => {
    clearAssistantChatRequestMock.mockReset();
    useAgentActivityRuntimeMock.mockReset();
    useAgentConnectionRuntimeMock.mockReset();
    useAgentHistoryRuntimeMock.mockReset();
    useAgentNodesRuntimeMock.mockReset();
    useAgentUIMock.mockReset();
    fetchNodeDetailMock.mockReset();

    useAgentConnectionRuntimeMock.mockReturnValue({
      connected: true,
    });
    useAgentHistoryRuntimeMock.mockReturnValue({
      agentHistories: new Map(),
      clearAgentHistory: vi.fn(),
      historyClearedAt: new Map(),
      streamingDeltas: new Map(),
    });
    useAgentUIMock.mockReturnValue({
      pendingAssistantMessages: [],
      sendAssistantMessage: vi.fn(),
    });
  });

  it("falls back to thinking after a completed tool call finishes", async () => {
    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map([["assistant", buildAssistantNode("running")]]),
    });
    useAgentActivityRuntimeMock.mockReturnValue({
      activeMessages: [],
      activeToolCalls: new Map(),
    });
    fetchNodeDetailMock.mockResolvedValue(
      buildDetail([
        {
          type: "ReceivedMessage",
          from_id: "human",
          content: "Inspect the workspace",
          timestamp: 1,
        },
        {
          type: "ToolCall",
          tool_name: "manage_roles",
          tool_call_id: "tool-1",
          arguments: {},
          result: '{"ok":true}',
          streaming: false,
          timestamp: 2,
        },
      ]),
    );

    const { result } = renderHook(() => useAssistantChat());

    await waitFor(() => {
      expect(result.current.assistantActivity.runningHint).toEqual({
        label: "Thinking...",
        toolName: null,
      });
    });
  });

  it("keeps the running tools hint while a tool call is still streaming", async () => {
    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map([["assistant", buildAssistantNode("running")]]),
    });
    useAgentActivityRuntimeMock.mockReturnValue({
      activeMessages: [],
      activeToolCalls: new Map(),
    });
    fetchNodeDetailMock.mockResolvedValue(
      buildDetail([
        {
          type: "ReceivedMessage",
          from_id: "human",
          content: "Inspect the workspace",
          timestamp: 1,
        },
        {
          type: "ToolCall",
          tool_name: "manage_roles",
          tool_call_id: "tool-2",
          arguments: {},
          streaming: true,
          timestamp: 2,
        },
      ]),
    );

    const { result } = renderHook(() => useAssistantChat());

    await waitFor(() => {
      expect(result.current.assistantActivity.runningHint).toEqual({
        label: "Running tools...",
        toolName: "manage_roles",
      });
    });
  });

  it("clears assistant chat and reloads the empty conversation detail", async () => {
    const clearAgentHistoryMock = vi.fn();

    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map([["assistant", buildAssistantNode("idle")]]),
    });
    useAgentActivityRuntimeMock.mockReturnValue({
      activeMessages: [],
      activeToolCalls: new Map(),
    });
    useAgentHistoryRuntimeMock.mockReturnValue({
      agentHistories: new Map(),
      clearAgentHistory: clearAgentHistoryMock,
      historyClearedAt: new Map(),
      streamingDeltas: new Map(),
    });
    fetchNodeDetailMock
      .mockResolvedValueOnce(
        buildDetail([
          {
            type: "ReceivedMessage",
            from_id: "human",
            content: "Old conversation",
            timestamp: 1,
          },
        ]),
      )
      .mockResolvedValueOnce(buildDetail([]));
    clearAssistantChatRequestMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAssistantChat());

    await waitFor(() => {
      expect(result.current.timelineItems).toHaveLength(1);
    });

    await act(async () => {
      await result.current.clearChat();
    });

    expect(clearAssistantChatRequestMock).toHaveBeenCalledWith("assistant");
    expect(clearAgentHistoryMock).toHaveBeenCalledWith("assistant");
    expect(result.current.timelineItems).toHaveLength(0);
  });
});
