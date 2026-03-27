import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentGraph } from "@/components/AgentGraph";
import { getAgentNodeWidth } from "@/lib/layout";
import type { Node, TaskTab } from "@/types";

const fitViewMock = vi.fn().mockResolvedValue(true);
const terminateNodeMock = vi.fn().mockResolvedValue(undefined);
const useAgentNodesRuntimeMock = vi.fn();
const useAgentTabsRuntimeMock = vi.fn();
const useAgentActivityRuntimeMock = vi.fn();
const useAgentUIMock = vi.fn();
const reactFlowPropsMock = vi.fn();
const resizeObservers: ResizeObserverMock[] = [];

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
    nodeTypes,
    onInit,
    onNodeClick,
    onNodeContextMenu,
    onPaneContextMenu,
    minZoom,
    maxZoom,
    zoomOnScroll,
    zoomOnPinch,
    children,
  }: {
    nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
    nodeTypes: Record<string, React.ComponentType<MockNodeComponentProps>>;
    onInit?: (instance: { fitView: typeof fitViewMock }) => void;
    onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
    onNodeContextMenu?: (event: React.MouseEvent, node: { id: string }) => void;
    onPaneContextMenu?: (event: React.MouseEvent) => void;
    minZoom?: number;
    maxZoom?: number;
    zoomOnScroll?: boolean;
    zoomOnPinch?: boolean;
    children?: React.ReactNode;
  }) {
    reactFlowPropsMock({
      minZoom,
      maxZoom,
      zoomOnScroll,
      zoomOnPinch,
    });

    react.useEffect(() => {
      onInit?.({ fitView: fitViewMock });
    }, [onInit]);

    return (
      <div
        data-testid="react-flow"
        onContextMenu={(event) => onPaneContextMenu?.(event)}
      >
        {nodes.map((node) => {
          const Component = nodeTypes[node.type];
          return (
            <div
              key={node.id}
              className="react-flow__node"
              data-testid={`node-${node.id}`}
              onClick={(event) => onNodeClick?.(event, node)}
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
    BaseEdge: ({ id }: { id: string }) => <div data-testid={`edge-${id}`} />,
    Handle: ({ type }: { type: string }) => (
      <div data-testid={`handle-${type}`} />
    ),
    Position: {
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
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

function renderGraph(
  nodes: Node[],
  options?: {
    activeTabId?: string | null;
    tabs?: TaskTab[];
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
    selectedAgentId: null,
    selectAgent: vi.fn(),
  });

  return render(<AgentGraph />);
}

beforeEach(() => {
  fitViewMock.mockClear();
  terminateNodeMock.mockClear();
  reactFlowPropsMock.mockClear();
  resizeObservers.splice(0, resizeObservers.length);
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
});

describe("AgentGraph", () => {
  it("renders active tab agent nodes using role_name and sizes width to fit the label", async () => {
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
    expect(workerNode).toHaveStyle({
      width: `${getAgentNodeWidth("Worker")}px`,
    });
    expect(workerNode).toHaveClass("h-[62px]");
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

    await userEvent.setup().click(stopWorker);
    await waitFor(() => {
      expect(terminateNodeMock).toHaveBeenCalledWith("worker-1");
    });
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
      expect(reactFlowPropsMock).toHaveBeenCalledWith({
        minZoom: 0.05,
        maxZoom: 6,
        zoomOnScroll: true,
        zoomOnPinch: true,
      });
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
