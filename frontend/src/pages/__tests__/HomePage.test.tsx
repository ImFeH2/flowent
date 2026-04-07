import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "@/pages/HomePage";
import type { Node, TaskTab } from "@/types";
import type { ReactNode } from "react";

const {
  createTabRequestMock,
  createTabNodeRequestMock,
  deleteTabRequestMock,
  dispatchNodeMessageRequestMock,
  createTabEdgeRequestMock,
  interruptNodeMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  createTabRequestMock: vi.fn(),
  createTabNodeRequestMock: vi.fn(),
  deleteTabRequestMock: vi.fn(),
  dispatchNodeMessageRequestMock: vi.fn(),
  createTabEdgeRequestMock: vi.fn(),
  interruptNodeMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

const {
  useAgentNodesRuntimeMock,
  useAgentTabsRuntimeMock,
  useAgentConnectionRuntimeMock,
  useAgentActivityRuntimeMock,
  useAgentHistoryRuntimeMock,
  useAgentDetailMock,
  useAgentUIMock,
} = vi.hoisted(() => ({
  useAgentNodesRuntimeMock: vi.fn(),
  useAgentTabsRuntimeMock: vi.fn(),
  useAgentConnectionRuntimeMock: vi.fn(),
  useAgentActivityRuntimeMock: vi.fn(),
  useAgentHistoryRuntimeMock: vi.fn(),
  useAgentDetailMock: vi.fn(),
  useAgentUIMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createTabRequest: (...args: unknown[]) => createTabRequestMock(...args),
  createTabNodeRequest: (...args: unknown[]) =>
    createTabNodeRequestMock(...args),
  deleteTabRequest: (...args: unknown[]) => deleteTabRequestMock(...args),
  dispatchNodeMessageRequest: (...args: unknown[]) =>
    dispatchNodeMessageRequestMock(...args),
  createTabEdgeRequest: (...args: unknown[]) =>
    createTabEdgeRequestMock(...args),
  interruptNode: (...args: unknown[]) => interruptNodeMock(...args),
}));

vi.mock("@/context/AgentContext", () => ({
  useAgentActivityRuntime: () => useAgentActivityRuntimeMock(),
  useAgentNodesRuntime: () => useAgentNodesRuntimeMock(),
  useAgentTabsRuntime: () => useAgentTabsRuntimeMock(),
  useAgentConnectionRuntime: () => useAgentConnectionRuntimeMock(),
  useAgentHistoryRuntime: () => useAgentHistoryRuntimeMock(),
  useAgentUI: () => useAgentUIMock(),
}));

vi.mock("@/hooks/useAssistantChat", () => ({
  useAssistantChat: () => ({
    connected: true,
    handleKeyDown: vi.fn(),
    input: "",
    onMessagesScroll: vi.fn(),
    scrollRef: { current: null },
    sending: false,
    sendMessage: vi.fn(),
    setInput: vi.fn(),
    timelineItems: [],
  }),
}));

vi.mock("@/hooks/useAgentDetail", () => ({
  useAgentDetail: (...args: unknown[]) => useAgentDetailMock(...args),
}));

vi.mock("@/hooks/useMeasuredHeight", () => ({
  useMeasuredHeight: () => ({
    height: 0,
    ref: { current: null },
  }),
}));

vi.mock("@/hooks/usePanelDrag", () => ({
  hasCachedPanelWidth: () => true,
  usePanelDrag: () => ({
    isDragging: false,
    startDrag: vi.fn(),
  }),
  usePanelWidth: () => [560, vi.fn()],
}));

vi.mock("@/components/AgentGraph", () => ({
  AgentGraph: () => <div>AgentGraph</div>,
}));

vi.mock("@/components/HistoryView", () => ({
  HistoryView: () => <div>HistoryView</div>,
}));

vi.mock("@/components/AssistantChatContent", () => ({
  AssistantChatMessages: () => <div>AssistantChatMessages</div>,
  AssistantChatComposer: () => <div>AssistantChatComposer</div>,
}));

vi.mock("@/components/PanelResizer", () => ({
  PanelResizer: () => null,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function buildNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  return {
    id: overrides.id,
    node_type: overrides.node_type ?? "agent",
    tab_id: overrides.tab_id ?? "tab-1",
    state: overrides.state ?? "idle",
    connections: overrides.connections ?? [],
    name: overrides.name ?? null,
    todos: overrides.todos ?? [],
    role_name: overrides.role_name ?? "Worker",
    position: overrides.position ?? null,
  };
}

function buildTab(overrides: Partial<TaskTab> = {}): TaskTab {
  return {
    id: overrides.id ?? "tab-1",
    title: overrides.title ?? "Example Tab",
    goal: overrides.goal ?? "Ship the workspace polish",
    created_at: overrides.created_at ?? 1,
    updated_at: overrides.updated_at ?? 1,
    node_count: overrides.node_count ?? 2,
    edge_count: overrides.edge_count ?? 1,
  };
}

describe("HomePage", () => {
  beforeEach(() => {
    createTabRequestMock.mockReset();
    createTabNodeRequestMock.mockReset();
    deleteTabRequestMock.mockReset();
    dispatchNodeMessageRequestMock.mockReset();
    createTabEdgeRequestMock.mockReset();
    interruptNodeMock.mockReset();
    toastErrorMock.mockReset();

    const assistant = buildNode({
      id: "assistant",
      node_type: "assistant",
      tab_id: null,
      role_name: "Steward",
    });
    const worker = buildNode({
      id: "agent-1",
      name: "Docs Worker",
    });

    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map([
        [assistant.id, assistant],
        [worker.id, worker],
      ]),
    });
    useAgentTabsRuntimeMock.mockReturnValue({
      tabs: new Map([["tab-1", buildTab()]]),
    });
    useAgentConnectionRuntimeMock.mockReturnValue({
      connected: true,
    });
    useAgentActivityRuntimeMock.mockReturnValue({
      activeMessages: [],
      activeToolCalls: new Map(),
    });
    useAgentHistoryRuntimeMock.mockReturnValue({
      agentHistories: new Map(),
      clearAgentHistory: vi.fn(),
      streamingDeltas: new Map(),
    });
    useAgentDetailMock.mockReturnValue({
      detail: null,
      error: null,
      loading: false,
    });
    useAgentUIMock.mockReturnValue({
      activeTabId: "tab-1",
      pendingAssistantMessages: [],
      selectedAgentId: worker.id,
      selectAgent: vi.fn(),
      setActiveTabId: vi.fn(),
    });

    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver;
  });

  it("creates a tab through the custom dialog instead of a browser prompt", async () => {
    const setActiveTabId = vi.fn();
    useAgentUIMock.mockReturnValue({
      activeTabId: "tab-1",
      pendingAssistantMessages: [],
      selectedAgentId: null,
      selectAgent: vi.fn(),
      setActiveTabId,
    });
    createTabRequestMock.mockResolvedValue({
      id: "tab-2",
      title: "Release Prep",
      goal: "Coordinate the launch work",
    });

    render(<HomePage />);

    fireEvent.click(screen.getByLabelText("Create tab"));
    fireEvent.change(screen.getByLabelText("Tab title"), {
      target: { value: "Release Prep" },
    });
    fireEvent.change(screen.getByLabelText("Tab goal"), {
      target: { value: "Coordinate the launch work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Task Tab" }));

    await waitFor(() =>
      expect(createTabRequestMock).toHaveBeenCalledWith(
        "Release Prep",
        "Coordinate the launch work",
      ),
    );
    expect(setActiveTabId).toHaveBeenCalledWith("tab-2");
  });

  it("adds an agent through the custom dialog", async () => {
    createTabNodeRequestMock.mockResolvedValue(undefined);

    render(<HomePage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Add Agent" })[0]);
    fireEvent.change(screen.getByLabelText("Agent role"), {
      target: { value: "Reviewer" },
    });
    fireEvent.change(screen.getByLabelText("Agent display name"), {
      target: { value: "Release Reviewer" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Add Agent",
      }),
    );

    await waitFor(() =>
      expect(createTabNodeRequestMock).toHaveBeenCalledWith("tab-1", {
        role_name: "Reviewer",
        name: "Release Reviewer",
      }),
    );
  });

  it("opens assistant details from the workspace panel and interrupts a running assistant", async () => {
    const assistant = buildNode({
      id: "assistant",
      node_type: "assistant",
      tab_id: null,
      role_name: "Steward",
      state: "running",
    });
    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map([[assistant.id, assistant]]),
    });
    useAgentUIMock.mockReturnValue({
      activeTabId: "tab-1",
      pendingAssistantMessages: [],
      selectedAgentId: null,
      selectAgent: vi.fn(),
      setActiveTabId: vi.fn(),
    });
    useAgentDetailMock.mockReturnValue({
      detail: {
        id: assistant.id,
        node_type: "assistant",
        tab_id: null,
        state: "running",
        name: "Assistant",
        contacts: [],
        connections: [],
        role_name: "Steward",
        todos: [],
        tools: [],
        write_dirs: [],
        allow_network: true,
        position: null,
        history: [
          {
            type: "StateEntry",
            state: "idle",
            reason: "created",
            timestamp: 1,
          },
          {
            type: "StateEntry",
            state: "running",
            reason: "processing",
            timestamp: 2,
          },
        ],
      },
      error: null,
      loading: false,
    });
    interruptNodeMock.mockResolvedValue(undefined);

    const view = render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "Assistant Details" }));

    expect(screen.getAllByText("Status").length).toBeGreaterThan(0);
    expect(screen.getAllByText("State Timeline").length).toBeGreaterThan(0);
    expect(screen.getByText("processing")).toBeInTheDocument();

    const interruptButtons = within(view.container).getAllByRole("button", {
      name: "Interrupt",
    });
    const interruptButton = interruptButtons[interruptButtons.length - 1];
    fireEvent.click(interruptButton);

    await waitFor(() => {
      expect(interruptNodeMock).toHaveBeenCalledWith("assistant");
    });
  });

  it("shows the same interrupt action for a running task node detail view", async () => {
    const worker = buildNode({
      id: "agent-1",
      name: "Docs Worker",
      state: "running",
    });
    const assistant = buildNode({
      id: "assistant",
      node_type: "assistant",
      tab_id: null,
      role_name: "Steward",
    });
    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map([
        [assistant.id, assistant],
        [worker.id, worker],
      ]),
    });
    useAgentUIMock.mockReturnValue({
      activeTabId: "tab-1",
      pendingAssistantMessages: [],
      selectedAgentId: worker.id,
      selectAgent: vi.fn(),
      setActiveTabId: vi.fn(),
    });
    useAgentDetailMock.mockReturnValue({
      detail: {
        id: worker.id,
        node_type: "agent",
        tab_id: "tab-1",
        state: "running",
        name: "Docs Worker",
        contacts: ["assistant"],
        connections: [],
        role_name: "Worker",
        todos: [],
        tools: [],
        write_dirs: [],
        allow_network: false,
        position: null,
        history: [],
      },
      error: null,
      loading: false,
    });
    interruptNodeMock.mockResolvedValue(undefined);

    const view = render(<HomePage />);

    const interruptButtons = within(view.container).getAllByRole("button", {
      name: "Interrupt",
    });
    const interruptButton = interruptButtons[interruptButtons.length - 1];
    fireEvent.click(interruptButton);

    await waitFor(() => {
      expect(interruptNodeMock).toHaveBeenCalledWith("agent-1");
    });
  });

  it("deletes a tab through the confirmation dialog", async () => {
    deleteTabRequestMock.mockResolvedValue(undefined);

    render(<HomePage />);

    fireEvent.click(screen.getAllByLabelText("Delete Example Tab")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Tab" }));

    await waitFor(() =>
      expect(deleteTabRequestMock).toHaveBeenCalledWith("tab-1"),
    );
  });
});
