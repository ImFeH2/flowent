import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import type { HistoryEntry, Node, NodeDetail } from "@/types";

const clearAssistantChatRequestMock = vi.fn();
const useAgentActivityRuntimeMock = vi.fn();
const useAgentConnectionRuntimeMock = vi.fn();
const useAgentHistoryRuntimeMock = vi.fn();
const useAgentNodesRuntimeMock = vi.fn();
const useAgentUIMock = vi.fn();
const fetchNodeDetailMock = vi.fn();
const resizeObservers: ResizeObserverMock[] = [];

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

class ResizeObserverMock {
  callback: ResizeObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }
}

function buildAssistantNode(state: Node["state"] = "running"): Node {
  return {
    id: "assistant",
    node_type: "assistant",
    is_leader: false,
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
    is_leader: false,
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

function AssistantChatScrollHarness({
  bottomInset = 0,
}: {
  bottomInset?: number;
}) {
  const { assistantActivity, onMessagesScroll, scrollRef, timelineItems } =
    useAssistantChat({ bottomInset });

  return (
    <>
      <div
        data-testid="assistant-scroll"
        onScroll={onMessagesScroll}
        ref={scrollRef}
      />
      <div data-testid="assistant-hint">
        {assistantActivity.runningHint?.label ?? "none"}
      </div>
      <div data-testid="assistant-count">{timelineItems.length}</div>
    </>
  );
}

function mockScrollableElement(
  element: HTMLDivElement,
  initial: {
    scrollHeight: number;
    clientHeight: number;
    scrollTop?: number;
  },
) {
  let scrollHeight = initial.scrollHeight;
  let clientHeight = initial.clientHeight;
  let scrollTop =
    initial.scrollTop ??
    Math.max(0, initial.scrollHeight - initial.clientHeight);

  Object.defineProperties(element, {
    scrollHeight: {
      configurable: true,
      get: () => scrollHeight,
    },
    clientHeight: {
      configurable: true,
      get: () => clientHeight,
    },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
        scrollTop = Math.max(0, Math.min(value, maxScrollTop));
      },
    },
  });

  return {
    get scrollTop() {
      return scrollTop;
    },
    setMetrics(next: Partial<{ scrollHeight: number; clientHeight: number }>) {
      if (typeof next.scrollHeight === "number") {
        scrollHeight = next.scrollHeight;
      }
      if (typeof next.clientHeight === "number") {
        clientHeight = next.clientHeight;
      }
    },
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
    resizeObservers.splice(0, resizeObservers.length);
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
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

  it("keeps following the bottom when the running hint appears without a new timeline item", async () => {
    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map([["assistant", buildAssistantNode("idle")]]),
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
          content: "Summarize the repo status",
          timestamp: 1,
        },
      ]),
    );

    const view = render(<AssistantChatScrollHarness bottomInset={0} />);
    const scrollElement = screen.getByTestId(
      "assistant-scroll",
    ) as HTMLDivElement;
    const scrollState = mockScrollableElement(scrollElement, {
      scrollHeight: 300,
      clientHeight: 100,
    });

    await waitFor(() => {
      expect(screen.getByTestId("assistant-count").textContent).toBe("1");
    });
    expect(screen.getByTestId("assistant-hint").textContent).toBe("none");
    expect(scrollState.scrollTop).toBe(200);

    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map([["assistant", buildAssistantNode("running")]]),
    });
    scrollState.setMetrics({ scrollHeight: 336 });
    view.rerender(<AssistantChatScrollHarness bottomInset={0} />);

    await waitFor(() => {
      expect(screen.getByTestId("assistant-hint").textContent).toBe(
        "Thinking...",
      );
    });
    expect(scrollState.scrollTop).toBe(236);
  });

  it("stops auto-follow after an upward scroll and restores it after returning to bottom", async () => {
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
          content: "Keep following the latest output",
          timestamp: 1,
        },
      ]),
    );

    const view = render(<AssistantChatScrollHarness bottomInset={0} />);
    const scrollElement = screen.getByTestId(
      "assistant-scroll",
    ) as HTMLDivElement;
    const scrollState = mockScrollableElement(scrollElement, {
      scrollHeight: 300,
      clientHeight: 100,
    });

    await waitFor(() => {
      expect(screen.getByTestId("assistant-count").textContent).toBe("1");
    });

    scrollElement.scrollTop = 120;
    fireEvent.scroll(scrollElement);

    scrollState.setMetrics({ scrollHeight: 340 });
    view.rerender(<AssistantChatScrollHarness bottomInset={40} />);

    await waitFor(() => {
      expect(scrollState.scrollTop).toBe(120);
    });

    scrollElement.scrollTop = 240;
    fireEvent.scroll(scrollElement);

    scrollState.setMetrics({ scrollHeight: 420 });
    view.rerender(<AssistantChatScrollHarness bottomInset={80} />);

    await waitFor(() => {
      expect(scrollState.scrollTop).toBe(320);
    });
  });

  it("keeps following the bottom when the panel height changes", async () => {
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
          content: "Stream a long answer",
          timestamp: 1,
        },
      ]),
    );

    render(<AssistantChatScrollHarness bottomInset={0} />);
    const scrollElement = screen.getByTestId(
      "assistant-scroll",
    ) as HTMLDivElement;
    const scrollState = mockScrollableElement(scrollElement, {
      scrollHeight: 300,
      clientHeight: 100,
    });

    await waitFor(() => {
      expect(screen.getByTestId("assistant-count").textContent).toBe("1");
      expect(resizeObservers).toHaveLength(1);
    });

    scrollState.setMetrics({ clientHeight: 80 });

    await act(async () => {
      resizeObservers[0]?.callback(
        [],
        resizeObservers[0] as unknown as ResizeObserver,
      );
    });

    await waitFor(() => {
      expect(scrollState.scrollTop).toBe(220);
    });
  });
});
