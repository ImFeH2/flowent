import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import type { HistoryEntry, Node, NodeDetail } from "@/types";

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
});
