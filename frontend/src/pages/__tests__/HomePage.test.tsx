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
  clearChatMock,
  createBlueprintRequestMock,
  fetchRolesMock,
  fetchBlueprintsMock,
  createTabRequestMock,
  createTabNodeRequestMock,
  deleteTabRequestMock,
  deleteBlueprintRequestMock,
  dispatchNodeMessageRequestMock,
  createTabEdgeRequestMock,
  interruptNodeMock,
  saveTabAsBlueprintRequestMock,
  toastErrorMock,
  toastSuccessMock,
  updateBlueprintRequestMock,
} = vi.hoisted(() => ({
  clearChatMock: vi.fn(),
  createBlueprintRequestMock: vi.fn(),
  fetchRolesMock: vi.fn(),
  fetchBlueprintsMock: vi.fn(),
  createTabRequestMock: vi.fn(),
  createTabNodeRequestMock: vi.fn(),
  deleteTabRequestMock: vi.fn(),
  deleteBlueprintRequestMock: vi.fn(),
  dispatchNodeMessageRequestMock: vi.fn(),
  createTabEdgeRequestMock: vi.fn(),
  interruptNodeMock: vi.fn(),
  saveTabAsBlueprintRequestMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateBlueprintRequestMock: vi.fn(),
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
  createBlueprintRequest: (...args: unknown[]) =>
    createBlueprintRequestMock(...args),
  fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
  fetchBlueprints: (...args: unknown[]) => fetchBlueprintsMock(...args),
  createTabRequest: (...args: unknown[]) => createTabRequestMock(...args),
  createTabNodeRequest: (...args: unknown[]) =>
    createTabNodeRequestMock(...args),
  deleteBlueprintRequest: (...args: unknown[]) =>
    deleteBlueprintRequestMock(...args),
  deleteTabRequest: (...args: unknown[]) => deleteTabRequestMock(...args),
  dispatchNodeMessageRequest: (...args: unknown[]) =>
    dispatchNodeMessageRequestMock(...args),
  createTabEdgeRequest: (...args: unknown[]) =>
    createTabEdgeRequestMock(...args),
  interruptNode: (...args: unknown[]) => interruptNodeMock(...args),
  saveTabAsBlueprintRequest: (...args: unknown[]) =>
    saveTabAsBlueprintRequestMock(...args),
  updateBlueprintRequest: (...args: unknown[]) =>
    updateBlueprintRequestMock(...args),
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
    assistantActivity: {
      running: false,
      runningHint: null,
    },
    clearChat: (...args: unknown[]) => clearChatMock(...args),
    clearing: false,
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
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

function buildNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  return {
    id: overrides.id,
    node_type: overrides.node_type ?? "agent",
    tab_id: overrides.tab_id ?? "tab-1",
    is_leader: overrides.is_leader ?? false,
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

function buildRole(
  overrides: Partial<{ name: string; description: string }> & {
    name: string;
  },
) {
  return {
    name: overrides.name,
    description: overrides.description ?? `${overrides.name} description`,
    system_prompt: `${overrides.name} prompt`,
    model: null,
    model_params: null,
    included_tools: [],
    excluded_tools: [],
    is_builtin: overrides.name === "Worker" || overrides.name === "Designer",
  };
}

describe("HomePage", () => {
  beforeEach(() => {
    clearChatMock.mockReset();
    createBlueprintRequestMock.mockReset();
    fetchRolesMock.mockReset();
    fetchBlueprintsMock.mockReset();
    createTabRequestMock.mockReset();
    createTabNodeRequestMock.mockReset();
    deleteTabRequestMock.mockReset();
    deleteBlueprintRequestMock.mockReset();
    dispatchNodeMessageRequestMock.mockReset();
    createTabEdgeRequestMock.mockReset();
    interruptNodeMock.mockReset();
    saveTabAsBlueprintRequestMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    updateBlueprintRequestMock.mockReset();

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
      clearHistorySnapshot: vi.fn(),
      historyInvalidatedAt: new Map(),
      historyClearedAt: new Map(),
      historySnapshots: new Map(),
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
    fetchRolesMock.mockResolvedValue([
      buildRole({ name: "Worker", description: "General execution role" }),
      buildRole({ name: "Reviewer", description: "Review results carefully" }),
      buildRole({ name: "Designer", description: "Frontend design role" }),
    ]);
    fetchBlueprintsMock.mockResolvedValue([]);

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
      network_source: {
        state: "manual",
        blueprint_id: null,
        blueprint_name: null,
        blueprint_version: null,
        blueprint_available: false,
      },
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
        false,
        [],
        undefined,
      ),
    );
    expect(setActiveTabId).toHaveBeenCalledWith("tab-2");
  }, 10000);

  it("saves the current network as a blueprint from the workspace toolbar", async () => {
    fetchBlueprintsMock.mockResolvedValue([
      {
        id: "blueprint-1",
        name: "Review Pipeline",
        description: "Reviewer collaboration pattern",
        version: 1,
        slots: [
          {
            id: "slot-1",
            role_name: "Reviewer",
            display_name: "Primary Reviewer",
          },
        ],
        edges: [],
        created_at: 1,
        updated_at: 1,
        node_count: 1,
        edge_count: 0,
      },
    ]);
    saveTabAsBlueprintRequestMock.mockResolvedValue({
      id: "blueprint-2",
      name: "Saved Network",
      description: "Saved from current network",
      version: 1,
      slots: [],
      edges: [],
      created_at: 1,
      updated_at: 1,
      node_count: 0,
      edge_count: 0,
    });
    useAgentUIMock.mockReturnValue({
      activeTabId: "tab-1",
      pendingAssistantMessages: [],
      selectedAgentId: null,
      selectAgent: vi.fn(),
      setActiveTabId: vi.fn(),
    });

    render(<HomePage />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Save as Blueprint" })[0],
    );
    fireEvent.change(screen.getByLabelText("Blueprint name"), {
      target: { value: "Saved Network" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Save as Blueprint",
      }),
    );

    await waitFor(() =>
      expect(saveTabAsBlueprintRequestMock).toHaveBeenCalledWith(
        "tab-1",
        "Saved Network",
        "",
      ),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Blueprint saved to library");
  });

  it("keeps the workspace toolbar centered while constraining overflow inside the background", () => {
    render(<HomePage />);

    const toolbars = screen.getAllByTestId("workspace-toolbar");

    expect(toolbars.length).toBeGreaterThan(0);
    for (const toolbar of toolbars) {
      expect(toolbar).toHaveClass("inline-flex");
      expect(toolbar).toHaveClass("max-w-full");
      expect(toolbar).toHaveClass("overflow-x-auto");
      expect(toolbar.parentElement).toHaveClass("inset-x-3");
      expect(toolbar.parentElement).toHaveClass("justify-center");
    }
  });

  it("adds an agent through the custom dialog", async () => {
    createTabNodeRequestMock.mockResolvedValue(undefined);

    render(<HomePage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Add Agent" })[0]);
    await screen.findByText("Review results carefully");
    fireEvent.click(screen.getByRole("button", { name: /Reviewer/ }));
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

  it("opens assistant details from the workspace panel and keeps interrupt only in the detail header", async () => {
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

    expect(
      within(view.container).queryByRole("button", { name: "Interrupt" }),
    ).toBeNull();

    const assistantDetailButtons = screen.getAllByRole("button", {
      name: "Assistant Details",
    });
    fireEvent.click(assistantDetailButtons[assistantDetailButtons.length - 1]);

    expect(screen.getAllByText("Status").length).toBeGreaterThan(0);
    expect(screen.getAllByText("State Timeline").length).toBeGreaterThan(0);
    expect(screen.getByText("processing")).toBeInTheDocument();

    const interruptButton = await screen.findByRole("button", {
      name: "Interrupt",
    });
    expect(interruptButton).toHaveAttribute("data-variant", "destructive");
    fireEvent.click(interruptButton);

    await waitFor(() => {
      expect(interruptNodeMock).toHaveBeenCalledWith("assistant");
    });
  });

  it("clears assistant chat from the workspace panel header", async () => {
    clearChatMock.mockResolvedValue(undefined);
    useAgentUIMock.mockReturnValue({
      activeTabId: "tab-1",
      pendingAssistantMessages: [],
      selectedAgentId: null,
      selectAgent: vi.fn(),
      setActiveTabId: vi.fn(),
    });

    render(<HomePage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Clear Chat" })[0]);

    await waitFor(() => {
      expect(clearChatMock).toHaveBeenCalledTimes(1);
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
    expect(interruptButton).toHaveAttribute("data-variant", "destructive");
    fireEvent.click(interruptButton);

    await waitFor(() => {
      expect(interruptNodeMock).toHaveBeenCalledWith("agent-1");
    });
  });

  it("shows the same interrupt action for a sleeping task node detail view", async () => {
    const worker = buildNode({
      id: "agent-1",
      name: "Docs Worker",
      state: "sleeping",
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
        state: "sleeping",
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
    expect(interruptButton).toHaveAttribute("data-variant", "destructive");
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

  it("middle-clicks a tab into the same delete flow without activating it first", async () => {
    const setActiveTabId = vi.fn();
    deleteTabRequestMock.mockResolvedValue(undefined);
    useAgentTabsRuntimeMock.mockReturnValue({
      tabs: new Map([
        ["tab-1", buildTab()],
        [
          "tab-2",
          buildTab({
            id: "tab-2",
            title: "Other Tab",
            node_count: 2,
          }),
        ],
      ]),
    });
    useAgentUIMock.mockReturnValue({
      activeTabId: "tab-2",
      pendingAssistantMessages: [],
      selectedAgentId: null,
      selectAgent: vi.fn(),
      setActiveTabId,
    });

    render(<HomePage />);

    fireEvent(
      screen.getAllByRole("button", { name: "Example Tab" })[0],
      new MouseEvent("auxclick", {
        bubbles: true,
        button: 1,
      }),
    );

    expect(setActiveTabId).not.toHaveBeenCalledWith("tab-1");
    fireEvent.click(screen.getByRole("button", { name: "Delete Tab" }));

    await waitFor(() =>
      expect(deleteTabRequestMock).toHaveBeenCalledWith("tab-1"),
    );
  });
});
