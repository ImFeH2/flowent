import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";
import { AgentGraph, type AgentGraphHandle } from "@/components/AgentGraph";
import { getAgentGraphLayoutedElements } from "@/lib/agentGraphLayout";
import type { Node, TaskTab } from "@/types";

const fitViewMock = vi.fn().mockResolvedValue(true);
const getZoomMock = vi.fn(() => 1);
const terminateNodeMock = vi.fn().mockResolvedValue(undefined);
const useAgentNodesRuntimeMock = vi.fn();
const useAgentTabsRuntimeMock = vi.fn();
const useAgentActivityRuntimeMock = vi.fn();
const useAgentUIMock = vi.fn();
const reactFlowPropsMock = vi.fn();
const resizeObservers: ResizeObserverMock[] = [];
const defaultWorker = globalThis.Worker;

class DeferredWorkerMock {
  static instances: DeferredWorkerMock[] = [];
  onmessage: ((ev: MessageEvent) => void) | null = null;
  messages: Array<{ nodes: FlowNode[]; edges: FlowEdge[]; key: string }> = [];

  constructor() {
    DeferredWorkerMock.instances.push(this);
  }

  postMessage(data: { nodes: FlowNode[]; edges: FlowEdge[]; key: string }) {
    this.messages.push(data);
  }

  async flush(index: number) {
    const message = this.messages[index];
    if (!message || !this.onmessage) {
      return;
    }
    const layouted = await getAgentGraphLayoutedElements(
      message.nodes,
      message.edges,
    );
    const positions = layouted.nodes.map((node) => ({
      id: node.id,
      position: node.position,
    }));
    this.onmessage({ data: { positions, key: message.key } } as MessageEvent);
  }

  fail(index: number, error = "layout failed") {
    const message = this.messages[index];
    if (!message || !this.onmessage) {
      return;
    }
    this.onmessage({ data: { key: message.key, error } } as MessageEvent);
  }

  terminate = vi.fn();
}

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

vi.mock("@/context/AgentContext", () => ({
  useAgentNodesRuntime: () => useAgentNodesRuntimeMock(),
  useAgentTabsRuntime: () => useAgentTabsRuntimeMock(),
  useAgentActivityRuntime: () => useAgentActivityRuntimeMock(),
  useAgentUI: () => useAgentUIMock(),
}));

vi.mock("@/lib/api", () => ({
  terminateNode: (...args: unknown[]) => terminateNodeMock(...args),
}));

vi.mock("@xyflow/react", async () => {
  const react = await import("react");
  type MockNodeComponentProps = {
    data: Record<string, unknown>;
    id: string;
    dragging: boolean;
    isConnectable: boolean;
    selected: boolean;
    type: string;
    xPos: number;
    yPos: number;
    zIndex: number;
  };

  function ReactFlowMock({
    nodes,
    edges,
    nodeTypes,
    onInit,
    onNodeClick,
    onNodeMouseEnter,
    onNodeMouseMove,
    onNodeMouseLeave,
    onConnect,
    onConnectStart,
    onConnectEnd,
    onMove,
    onNodeContextMenu,
    onPaneContextMenu,
    isValidConnection,
    nodesDraggable,
    nodesConnectable,
    connectionMode,
    connectOnClick,
    minZoom,
    maxZoom,
    zoomOnScroll,
    zoomOnPinch,
    children,
  }: {
    nodes: Array<{
      id: string;
      type: string;
      data: Record<string, unknown>;
      position: { x: number; y: number };
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }>;
    nodeTypes: Record<string, React.ComponentType<MockNodeComponentProps>>;
    onInit?: (instance: {
      fitView: typeof fitViewMock;
      getZoom: typeof getZoomMock;
    }) => void;
    onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
    onNodeMouseEnter?: (event: React.MouseEvent, node: { id: string }) => void;
    onNodeMouseMove?: (event: React.MouseEvent, node: { id: string }) => void;
    onNodeMouseLeave?: (event: React.MouseEvent, node: { id: string }) => void;
    onConnect?: (connection: { source: string; target: string }) => void;
    onConnectStart?: () => void;
    onConnectEnd?: (...args: unknown[]) => void;
    onMove?: (
      event: MouseEvent | TouchEvent | null,
      viewport: { x: number; y: number; zoom: number },
    ) => void;
    onNodeContextMenu?: (event: React.MouseEvent, node: { id: string }) => void;
    onPaneContextMenu?: (event: React.MouseEvent) => void;
    isValidConnection?: (connection: {
      source?: string;
      target?: string;
    }) => boolean;
    nodesDraggable?: boolean;
    nodesConnectable?: boolean;
    connectionMode?: string;
    connectOnClick?: boolean;
    minZoom?: number;
    maxZoom?: number;
    zoomOnScroll?: boolean;
    zoomOnPinch?: boolean;
    children?: React.ReactNode;
  }) {
    reactFlowPropsMock({
      nodes,
      edges,
      isValidConnection,
      nodesDraggable,
      nodesConnectable,
      connectionMode,
      connectOnClick,
      minZoom,
      maxZoom,
      zoomOnScroll,
      zoomOnPinch,
    });

    react.useEffect(() => {
      onInit?.({ fitView: fitViewMock, getZoom: getZoomMock });
    }, [onInit]);

    const emitConnection = (sourceIndex: number, targetIndex: number) => {
      const sourceId = nodes[sourceIndex]?.id;
      const targetId = nodes[targetIndex]?.id;
      if (!sourceId || !targetId) {
        return;
      }
      const connection = { source: sourceId, target: targetId };
      if (isValidConnection && !isValidConnection(connection)) {
        return;
      }
      onConnect?.(connection);
    };

    return (
      <div
        data-testid="react-flow"
        onContextMenu={(event) => onPaneContextMenu?.(event)}
      >
        <button
          data-testid="connect-start"
          onClick={() => onConnectStart?.()}
        />
        <button data-testid="connect-end" onClick={() => onConnectEnd?.()} />
        <button
          data-testid="connect-first-to-first"
          onClick={() => emitConnection(0, 0)}
        />
        <button
          data-testid="connect-first-to-second"
          onClick={() => emitConnection(0, 1)}
        />
        <button
          data-testid="connect-second-to-first"
          onClick={() => emitConnection(1, 0)}
        />
        <button
          data-testid="connect-first-to-last"
          onClick={() => emitConnection(0, nodes.length - 1)}
        />
        <button
          data-testid="connect-end-empty-first"
          onClick={() =>
            onConnectEnd?.(
              { clientX: 320, clientY: 240 } as unknown as React.MouseEvent,
              {
                fromNode: nodes[0] ? { id: nodes[0].id } : null,
                toNode: null,
              },
            )
          }
        />
        <button
          data-testid="move-zoom-142"
          onClick={() => onMove?.(null, { x: 0, y: 0, zoom: 1.42 })}
        />
        {nodes.map((node) => {
          const Component = nodeTypes[node.type];
          return (
            <div
              key={node.id}
              className="react-flow__node"
              data-testid={`node-${node.id}`}
              onClick={(event) => onNodeClick?.(event, node)}
              onMouseEnter={(event) => onNodeMouseEnter?.(event, node)}
              onMouseMove={(event) => onNodeMouseMove?.(event, node)}
              onMouseLeave={(event) => onNodeMouseLeave?.(event, node)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onNodeContextMenu?.(event, node);
              }}
            >
              <Component
                data={node.data}
                id={node.id}
                dragging={false}
                isConnectable={false}
                selected={false}
                type={node.type}
                xPos={0}
                yPos={0}
                zIndex={0}
              />
            </div>
          );
        })}
        {children}
      </div>
    );
  }

  return {
    ReactFlow: ReactFlowMock,
    Background: () => null,
    ConnectionMode: {
      Loose: "loose",
      Strict: "strict",
    },
    BaseEdge: ({ id }: { id: string }) => <div data-testid={`edge-${id}`} />,
    Handle: ({
      type,
      position,
      className,
    }: {
      type: string;
      position: string;
      className?: string;
    }) => (
      <div data-testid={`handle-${type}-${position}`} className={className} />
    ),
    Position: {
      Left: "left",
      Right: "right",
      Top: "top",
      Bottom: "bottom",
    },
    getBezierPath: () => ["M0,0 C0,0 0,0 0,0"],
  };
});

function buildNode(overrides: Partial<Node>): Node {
  return {
    id: "node",
    node_type: "agent",
    tab_id: "tab-1",
    is_leader: false,
    state: "idle",
    connections: [],
    name: null,
    todos: [],
    role_name: null,
    ...overrides,
  };
}

function buildTab(overrides: Partial<TaskTab> = {}): TaskTab {
  return {
    id: "tab-1",
    title: "Research Task",
    goal: "Inspect the repository",
    leader_id: "leader-1",
    created_at: 1,
    updated_at: 1,
    network_source: {
      state: "manual",
      blueprint_id: null,
      blueprint_name: null,
      blueprint_version: null,
      blueprint_available: false,
    },
    ...overrides,
  };
}

function renderGraph(
  nodes: Node[],
  options?: {
    activeTabId?: string | null;
    selectedAgentId?: string | null;
    tabs?: TaskTab[];
    ref?: React.Ref<AgentGraphHandle>;
    onCreateConnection?: (
      tabId: string,
      sourceNodeId: string,
      targetNodeId: string,
    ) => Promise<void>;
  },
) {
  useAgentNodesRuntimeMock.mockReturnValue({
    agents: new Map(nodes.map((node) => [node.id, node])),
  });
  useAgentTabsRuntimeMock.mockReturnValue({
    tabs: new Map(
      (options?.tabs ?? [buildTab()]).map((tab) => [tab.id, tab] as const),
    ),
  });
  useAgentActivityRuntimeMock.mockReturnValue({
    activeMessages: [],
    activeToolCalls: new Map(),
  });
  useAgentUIMock.mockReturnValue({
    activeTabId: options?.activeTabId ?? "tab-1",
    selectedAgentId: options?.selectedAgentId ?? null,
    selectAgent: vi.fn(),
  });

  return render(
    <AgentGraph
      ref={options?.ref}
      onCreateConnection={options?.onCreateConnection}
    />,
  );
}

function expectConnectionHandlesHidden(node: HTMLElement) {
  for (const handleId of ["handle-source-left", "handle-source-right"]) {
    expect(within(node).getByTestId(handleId)).toHaveClass("!opacity-0");
  }
}

function expectConnectionEntriesVisible(node: HTMLElement) {
  expect(within(node).getByTestId("connection-entry-left")).toBeInTheDocument();
  expect(
    within(node).getByTestId("connection-entry-right"),
  ).toBeInTheDocument();
}

function expectConnectionEntriesHidden(node: HTMLElement) {
  expect(
    within(node).queryByTestId("connection-entry-left"),
  ).not.toBeInTheDocument();
  expect(
    within(node).queryByTestId("connection-entry-right"),
  ).not.toBeInTheDocument();
}

beforeEach(() => {
  fitViewMock.mockClear();
  getZoomMock.mockClear();
  getZoomMock.mockReturnValue(1);
  terminateNodeMock.mockClear();
  reactFlowPropsMock.mockClear();
  resizeObservers.splice(0, resizeObservers.length);
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.stubGlobal("Worker", defaultWorker);
  DeferredWorkerMock.instances.splice(0, DeferredWorkerMock.instances.length);
});

describe("AgentGraph", () => {
  it("renders active tab agent nodes using role_name", async () => {
    renderGraph([
      buildNode({
        id: "assistant",
        node_type: "assistant",
        tab_id: null,
        connections: ["worker-1"],
      }),
      buildNode({
        id: "worker-1",
        role_name: "Worker",
        connections: [],
      }),
    ]);

    expect(await screen.findByText("Worker")).toBeInTheDocument();
    expect(screen.queryByText("Assistant")).not.toBeInTheDocument();

    const workerNode = screen.getByTestId("node-worker-1").firstElementChild;
    expect(workerNode).toHaveClass("w-max");
    expect(workerNode).toHaveClass("h-14");
  });

  it("keeps connected nodes visually clean until connection interaction begins", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Planner",
        connections: ["worker-2"],
      }),
      buildNode({
        id: "worker-2",
        role_name: "Reviewer",
        connections: ["worker-1"],
      }),
    ]);

    await screen.findByText("Planner");

    const plannerNode = screen.getByTestId("node-worker-1");
    const reviewerNode = screen.getByTestId("node-worker-2");

    expectConnectionHandlesHidden(plannerNode);
    expectConnectionHandlesHidden(reviewerNode);
    expectConnectionEntriesHidden(plannerNode);
    expectConnectionEntriesHidden(reviewerNode);
  });

  it("temporarily shows connection entries for isolated nodes during explicit connect interaction", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Planner",
        connections: [],
      }),
      buildNode({
        id: "worker-2",
        role_name: "Reviewer",
        connections: [],
      }),
    ]);

    await screen.findByText("Planner");

    const plannerNode = screen.getByTestId("node-worker-1");
    expectConnectionHandlesHidden(plannerNode);
    expectConnectionEntriesHidden(plannerNode);

    fireEvent.click(screen.getByTestId("connect-start"));

    expectConnectionHandlesHidden(plannerNode);
    expectConnectionEntriesVisible(plannerNode);

    fireEvent.click(screen.getByTestId("connect-end"));

    expectConnectionHandlesHidden(plannerNode);
    expectConnectionEntriesHidden(plannerNode);
  });

  it("keeps isolated connection entries hidden when selection is the only state", async () => {
    renderGraph(
      [
        buildNode({
          id: "worker-1",
          role_name: "Planner",
          connections: [],
        }),
      ],
      { selectedAgentId: "worker-1" },
    );

    await screen.findByText("Planner");

    const plannerNode = screen.getByTestId("node-worker-1");
    expectConnectionHandlesHidden(plannerNode);
    expectConnectionEntriesHidden(plannerNode);
  });

  it("keeps explicit connect mode active after an unfinished drag", async () => {
    const graphRef = React.createRef<AgentGraphHandle>();

    renderGraph(
      [
        buildNode({
          id: "worker-1",
          role_name: "Planner",
          connections: [],
        }),
        buildNode({
          id: "worker-2",
          role_name: "Reviewer",
          connections: [],
        }),
      ],
      { ref: graphRef },
    );

    await screen.findByText("Planner");

    act(() => {
      graphRef.current?.enterConnectMode();
    });

    const plannerNode = screen.getByTestId("node-worker-1");
    expectConnectionEntriesVisible(plannerNode);
    expect(screen.getByText("Connect Mode")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("connect-start"));
    fireEvent.click(screen.getByTestId("connect-end"));

    expectConnectionEntriesVisible(plannerNode);
    expect(screen.getByText("Connect Mode")).toBeInTheDocument();
  });

  it("highlights valid and invalid targets during explicit source picking", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Planner",
        connections: ["worker-2"],
      }),
      buildNode({
        id: "worker-2",
        role_name: "Reviewer",
        connections: ["worker-1"],
      }),
      buildNode({
        id: "worker-3",
        role_name: "Researcher",
        connections: [],
      }),
    ]);

    await screen.findByText("Planner");

    fireEvent.contextMenu(screen.getByTestId("node-worker-1"));
    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: "Connect To...",
      }),
    );

    const plannerNode = screen.getByTestId("node-worker-1");
    const reviewerNode = screen.getByTestId("node-worker-2");
    const researcherNode = screen.getByTestId("node-worker-3");

    expectConnectionEntriesVisible(plannerNode);
    expectConnectionEntriesVisible(reviewerNode);
    expectConnectionEntriesVisible(researcherNode);
    expect(plannerNode.firstElementChild).toHaveClass("ring-2");
    expect(reviewerNode.firstElementChild).toHaveClass("opacity-45");
    expect(researcherNode.firstElementChild).not.toHaveClass("opacity-45");
  });

  it("opens linked quick create when a dragged connection lands on empty space", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Planner",
        connections: [],
      }),
    ]);

    await screen.findByText("Planner");

    fireEvent.click(screen.getByTestId("connect-end-empty-first"));

    expect(await screen.findByText("No roles available.")).toBeInTheDocument();
  });

  it("blocks self and duplicate connections before calling onCreateConnection", async () => {
    const onCreateConnection = vi.fn().mockResolvedValue(undefined);

    renderGraph(
      [
        buildNode({
          id: "worker-1",
          role_name: "Planner",
          connections: ["worker-2"],
        }),
        buildNode({
          id: "worker-2",
          role_name: "Reviewer",
          connections: ["worker-1"],
        }),
        buildNode({
          id: "worker-3",
          role_name: "Researcher",
          connections: [],
        }),
      ],
      { onCreateConnection },
    );

    await screen.findByText("Planner");

    fireEvent.click(screen.getByTestId("connect-first-to-first"));
    fireEvent.click(screen.getByTestId("connect-first-to-second"));
    fireEvent.click(screen.getByTestId("connect-second-to-first"));

    expect(onCreateConnection).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("connect-first-to-last"));

    await waitFor(() => {
      expect(onCreateConnection).toHaveBeenCalledWith(
        "tab-1",
        "worker-1",
        "worker-3",
      );
    });
  });

  it("maps rendered edges onto the new undirected entry handles", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Planner",
        connections: ["worker-2"],
      }),
      buildNode({
        id: "worker-2",
        role_name: "Reviewer",
        connections: ["worker-1"],
      }),
    ]);

    await screen.findByText("Planner");

    await waitFor(() => {
      const latestProps = reactFlowPropsMock.mock.calls.at(-1)?.[0] as
        | {
            edges: Array<{
              id: string;
              sourceHandle?: string;
              targetHandle?: string;
            }>;
          }
        | undefined;

      expect(latestProps?.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "worker-1<->worker-2",
            sourceHandle: "right-entry",
            targetHandle: "left-entry",
          }),
        ]),
      );
    });
  });

  it("renders only nodes from the active task tab", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Planner",
        tab_id: "tab-1",
      }),
      buildNode({
        id: "worker-2",
        role_name: "Reviewer",
        tab_id: "tab-2",
      }),
    ]);

    expect(await screen.findByText("Planner")).toBeInTheDocument();
    expect(screen.queryByText("Reviewer")).not.toBeInTheDocument();
  });

  it("allows stopping regular agents from the graph context menu", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Worker",
      }),
    ]);

    fireEvent.contextMenu(screen.getByTestId("node-worker-1"));
    const stopWorker = await screen.findByRole("button", {
      name: "Stop Agent",
    });
    expect(stopWorker).toBeEnabled();
    expect(stopWorker.className).toContain("text-graph-status-error/90");

    await userEvent.setup().click(stopWorker);
    await waitFor(() => {
      expect(terminateNodeMock).toHaveBeenCalledWith("worker-1");
    });
  });

  it("renders graph context menus in a viewport portal instead of inside the workspace canvas", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Worker",
      }),
    ]);

    fireEvent.contextMenu(screen.getByTestId("node-worker-1"));

    const stopWorker = await screen.findByRole("button", {
      name: "Stop Agent",
    });
    expect(stopWorker).toBeInTheDocument();
    expect(
      within(screen.getByTestId("react-flow")).queryByRole("button", {
        name: "Stop Agent",
      }),
    ).not.toBeInTheDocument();
  });

  it("renders canvas context menus in a viewport portal instead of inside the workspace canvas", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Worker",
      }),
    ]);

    fireEvent.contextMenu(screen.getByTestId("react-flow"));

    const fitView = await screen.findByRole("button", {
      name: "Fit View",
    });
    expect(fitView).toBeInTheDocument();
    expect(
      within(screen.getByTestId("react-flow")).queryByRole("button", {
        name: "Fit View",
      }),
    ).not.toBeInTheDocument();
  });

  it("renders pane context menus in a viewport portal instead of inside the workspace canvas", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Worker",
      }),
    ]);

    fireEvent.contextMenu(screen.getByTestId("react-flow"));

    const fitView = await screen.findByRole("button", {
      name: "Fit View",
    });
    expect(fitView).toBeInTheDocument();
    expect(
      within(screen.getByTestId("react-flow")).queryByRole("button", {
        name: "Fit View",
      }),
    ).not.toBeInTheDocument();
  });

  it("renders node tooltips in a viewport portal instead of inside the workspace canvas", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Worker",
      }),
    ]);

    fireEvent.mouseEnter(screen.getByTestId("node-worker-1"), {
      clientX: 240,
      clientY: 180,
    });

    expect(await screen.findByText("Connections")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("react-flow")).queryByText("Connections"),
    ).not.toBeInTheDocument();
  });

  it("re-fits the graph when the container is resized", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Worker",
      }),
    ]);

    await waitFor(() => {
      expect(fitViewMock).toHaveBeenCalled();
      expect(resizeObservers).toHaveLength(1);
    });

    fitViewMock.mockClear();

    await act(async () => {
      resizeObservers[0]?.callback(
        [],
        resizeObservers[0] as unknown as ResizeObserver,
      );
    });

    await waitFor(() => {
      expect(fitViewMock).toHaveBeenCalledWith({
        padding: 0.3,
        maxZoom: 1,
        duration: 250,
      });
    });
  });

  it("configures the workspace canvas for freeform zooming", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Worker",
      }),
    ]);

    await waitFor(() => {
      expect(reactFlowPropsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.any(Array),
          nodesDraggable: false,
          nodesConnectable: true,
          connectionMode: "loose",
          connectOnClick: false,
          minZoom: 0.05,
          maxZoom: 6,
          zoomOnScroll: true,
          zoomOnPinch: true,
        }),
      );
    });
  });

  it("shows the current viewport zoom when a graph is visible and updates it live", async () => {
    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Worker",
      }),
    ]);

    expect(
      await screen.findByTestId("agent-graph-zoom-indicator"),
    ).toHaveTextContent("100%");

    fireEvent.click(screen.getByTestId("move-zoom-142"));

    expect(screen.getByTestId("agent-graph-zoom-indicator")).toHaveTextContent(
      "142%",
    );
  });

  it("hides the graph zoom indicator in the stable empty state", () => {
    renderGraph([]);

    expect(
      screen.queryByTestId("agent-graph-zoom-indicator"),
    ).not.toBeInTheDocument();
  });

  it("lays out active tab nodes from graph structure instead of stored positions", async () => {
    vi.stubGlobal("Worker", DeferredWorkerMock as unknown as typeof Worker);

    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Planner",
        position: { x: 900, y: 700 },
        connections: ["worker-2"],
      }),
      buildNode({
        id: "worker-2",
        role_name: "Reviewer",
        position: { x: 40, y: 20 },
        connections: [],
      }),
    ]);

    await screen.findByText("Planner");
    const worker = DeferredWorkerMock.instances[0];
    expect(worker?.messages).toHaveLength(1);

    await act(async () => {
      await worker?.flush(0);
    });

    await waitFor(() => {
      const latestProps = reactFlowPropsMock.mock.calls.at(-1)?.[0] as
        | {
            nodes: Array<{ id: string; position: { x: number; y: number } }>;
          }
        | undefined;
      const plannerNode = latestProps?.nodes.find(
        (node) => node.id === "worker-1",
      );
      const reviewerNode = latestProps?.nodes.find(
        (node) => node.id === "worker-2",
      );

      expect(plannerNode?.position).not.toEqual({ x: 900, y: 700 });
      expect(reviewerNode?.position).not.toEqual({ x: 40, y: 20 });
      expect(
        Math.hypot(
          (reviewerNode?.position.x ?? 0) - (plannerNode?.position.x ?? 0),
          (reviewerNode?.position.y ?? 0) - (plannerNode?.position.y ?? 0),
        ),
      ).toBeGreaterThan(80);
    });
  });

  it("keeps leader nodes out of the visible graph", async () => {
    renderGraph([
      buildNode({
        id: "leader-1",
        role_name: "Conductor",
        is_leader: true,
        name: "Leader",
      }),
      buildNode({
        id: "worker-1",
        role_name: "Worker",
        name: "Worker",
      }),
    ]);

    await screen.findByText("Worker");

    const latestProps = reactFlowPropsMock.mock.calls.at(-1)?.[0] as
      | {
          nodes: Array<{ id: string; position: { x: number; y: number } }>;
        }
      | undefined;
    const workerNode = latestProps?.nodes.find(
      (node) => node.id === "worker-1",
    );

    expect(workerNode).toBeDefined();
    expect(latestProps?.nodes).toHaveLength(1);
    expect(screen.queryByText("Leader")).not.toBeInTheDocument();
  });

  it("ignores stale worker layout results after structure changes", async () => {
    vi.stubGlobal("Worker", DeferredWorkerMock as unknown as typeof Worker);

    const view = renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Planner",
        connections: [],
      }),
    ]);

    const worker = DeferredWorkerMock.instances[0];
    expect(worker).toBeDefined();
    expect(worker?.messages).toHaveLength(1);

    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map(
        [
          buildNode({
            id: "worker-1",
            role_name: "Planner",
            connections: ["worker-2"],
          }),
          buildNode({
            id: "worker-2",
            role_name: "Reviewer",
            connections: [],
          }),
        ].map((node) => [node.id, node] as const),
      ),
    });

    view.rerender(<AgentGraph />);

    await waitFor(() => {
      expect(worker?.messages).toHaveLength(2);
    });

    await act(async () => {
      await worker?.flush(1);
    });

    await waitFor(() => {
      const latestProps = reactFlowPropsMock.mock.calls.at(-1)?.[0] as
        | {
            nodes: Array<{ id: string; position: { x: number; y: number } }>;
          }
        | undefined;
      const plannerNode = latestProps?.nodes.find(
        (node) => node.id === "worker-1",
      );
      const reviewerNode = latestProps?.nodes.find(
        (node) => node.id === "worker-2",
      );
      expect(
        Math.hypot(
          (reviewerNode?.position.x ?? 0) - (plannerNode?.position.x ?? 0),
          (reviewerNode?.position.y ?? 0) - (plannerNode?.position.y ?? 0),
        ),
      ).toBeGreaterThan(80);
    });

    const renderCountAfterFreshLayout = reactFlowPropsMock.mock.calls.length;

    await act(async () => {
      await worker?.flush(0);
    });

    await waitFor(() => {
      expect(reactFlowPropsMock.mock.calls).toHaveLength(
        renderCountAfterFreshLayout,
      );
    });
  });

  it("does not repost layout work for state-only rerenders while a layout is pending", async () => {
    vi.stubGlobal("Worker", DeferredWorkerMock as unknown as typeof Worker);

    const view = renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Worker",
        state: "idle",
      }),
    ]);

    const worker = DeferredWorkerMock.instances[0];
    expect(worker).toBeDefined();
    expect(worker?.messages).toHaveLength(1);

    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map(
        [
          buildNode({
            id: "worker-1",
            role_name: "Worker",
            state: "running",
          }),
        ].map((node) => [node.id, node] as const),
      ),
    });

    view.rerender(<AgentGraph />);

    await waitFor(() => {
      expect(worker?.messages).toHaveLength(1);
    });
  });

  it("retries a failed layout request once for the same structure", async () => {
    vi.stubGlobal("Worker", DeferredWorkerMock as unknown as typeof Worker);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Planner",
        connections: ["worker-2"],
      }),
      buildNode({
        id: "worker-2",
        role_name: "Reviewer",
        connections: [],
      }),
    ]);

    await screen.findByText("Planner");

    const worker = DeferredWorkerMock.instances[0];
    expect(worker?.messages).toHaveLength(1);

    act(() => {
      worker?.fail(0);
    });

    await waitFor(() => {
      expect(worker?.messages).toHaveLength(2);
    });

    await act(async () => {
      await worker?.flush(1);
    });

    await waitFor(() => {
      const latestProps = reactFlowPropsMock.mock.calls.at(-1)?.[0] as
        | {
            nodes: Array<{ id: string; position: { x: number; y: number } }>;
          }
        | undefined;
      const plannerNode = latestProps?.nodes.find(
        (node) => node.id === "worker-1",
      );
      const reviewerNode = latestProps?.nodes.find(
        (node) => node.id === "worker-2",
      );

      expect(
        Math.hypot(
          (reviewerNode?.position.x ?? 0) - (plannerNode?.position.x ?? 0),
          (reviewerNode?.position.y ?? 0) - (plannerNode?.position.y ?? 0),
        ),
      ).toBeGreaterThan(80);
    });

    consoleErrorSpy.mockRestore();
  });

  it("reposts layout after StrictMode remount when the first worker is terminated", async () => {
    vi.stubGlobal("Worker", DeferredWorkerMock as unknown as typeof Worker);

    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map(
        [
          buildNode({
            id: "worker-1",
            role_name: "Planner",
            connections: ["worker-2"],
          }),
          buildNode({
            id: "worker-2",
            role_name: "Reviewer",
            connections: [],
          }),
        ].map((node) => [node.id, node] as const),
      ),
    });
    useAgentTabsRuntimeMock.mockReturnValue({
      tabs: new Map([["tab-1", buildTab()]]),
    });
    useAgentActivityRuntimeMock.mockReturnValue({
      activeMessages: [],
      activeToolCalls: new Map(),
    });
    useAgentUIMock.mockReturnValue({
      activeTabId: "tab-1",
      selectedAgentId: null,
      selectAgent: vi.fn(),
    });

    render(
      <React.StrictMode>
        <AgentGraph />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(DeferredWorkerMock.instances.length).toBeGreaterThanOrEqual(2);
    });

    const latestWorker = DeferredWorkerMock.instances.at(-1);
    expect(latestWorker?.messages).toHaveLength(1);

    await act(async () => {
      await latestWorker?.flush(0);
    });

    await waitFor(() => {
      const latestProps = reactFlowPropsMock.mock.calls.at(-1)?.[0] as
        | {
            nodes: Array<{ id: string; position: { x: number; y: number } }>;
          }
        | undefined;
      const plannerNode = latestProps?.nodes.find(
        (node) => node.id === "worker-1",
      );
      const reviewerNode = latestProps?.nodes.find(
        (node) => node.id === "worker-2",
      );
      expect(
        Math.hypot(
          (reviewerNode?.position.x ?? 0) - (plannerNode?.position.x ?? 0),
          (reviewerNode?.position.y ?? 0) - (plannerNode?.position.y ?? 0),
        ),
      ).toBeGreaterThan(80);
    });
  });

  it("keeps removed nodes briefly for exit transitions before unmounting them", () => {
    vi.useFakeTimers();

    const view = renderGraph([
      buildNode({
        id: "worker-1",
        role_name: "Worker",
      }),
    ]);

    expect(screen.getByTestId("node-worker-1")).toBeInTheDocument();

    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map(),
    });

    view.rerender(<AgentGraph />);

    expect(screen.getByTestId("node-worker-1")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(330);
    });

    expect(screen.queryByTestId("node-worker-1")).not.toBeInTheDocument();
  });
});
