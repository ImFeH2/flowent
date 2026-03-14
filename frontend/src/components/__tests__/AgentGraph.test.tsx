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
import type { Graph, Node } from "@/types";

const fitViewMock = vi.fn().mockResolvedValue(true);
const terminateNodeMock = vi.fn().mockResolvedValue(undefined);
const useAgentNodesRuntimeMock = vi.fn();
const useAgentGraphRuntimeMock = vi.fn();
const useAgentActivityRuntimeMock = vi.fn();
const useAgentUIMock = vi.fn();
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
  useAgentGraphRuntime: () => useAgentGraphRuntimeMock(),
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
    children,
  }: {
    nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
    nodeTypes: Record<string, React.ComponentType<MockNodeComponentProps>>;
    onInit?: (instance: { fitView: typeof fitViewMock }) => void;
    onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
    onNodeContextMenu?: (
      event: React.MouseEvent,
      node: { id: string; node_type?: string },
    ) => void;
    onPaneContextMenu?: (event: React.MouseEvent) => void;
    children?: React.ReactNode;
  }) {
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
    graph_id: "graph-root",
    state: "idle",
    connections: [],
    name: null,
    todos: [],
    role_name: null,
    ...overrides,
  };
}

function buildGraph(overrides: Partial<Graph>): Graph {
  return {
    id: "graph-root",
    owner_agent_id: "worker-1",
    parent_graph_id: null,
    name: "Research Graph",
    goal: "Investigate sources",
    entry_node_id: "worker-1",
    ...overrides,
  };
}

function renderGraph(nodes: Node[], graphs: Graph[] = []) {
  useAgentNodesRuntimeMock.mockReturnValue({
    agents: new Map(nodes.map((node) => [node.id, node])),
  });
  useAgentGraphRuntimeMock.mockReturnValue({
    graphs: new Map(graphs.map((graph) => [graph.id, graph])),
  });
  useAgentActivityRuntimeMock.mockReturnValue({
    activeMessages: [],
    activeToolCalls: new Map(),
  });
  useAgentUIMock.mockReturnValue({
    selectedAgentId: null,
    selectAgent: vi.fn(),
  });

  return render(<AgentGraph />);
}

beforeEach(() => {
  fitViewMock.mockClear();
  terminateNodeMock.mockClear();
  resizeObservers.splice(0, resizeObservers.length);
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
});

describe("AgentGraph", () => {
  it("renders unnamed agent nodes using role_name and sizes width to fit the label", async () => {
    renderGraph([
      buildNode({
        id: "assistant",
        node_type: "assistant",
        connections: ["worker-1"],
      }),
      buildNode({
        id: "worker-1",
        role_name: "Worker",
        connections: ["assistant"],
      }),
    ]);

    expect(await screen.findByText("Assistant")).toBeInTheDocument();
    expect(screen.getByText("Worker")).toBeInTheDocument();

    const workerNode = screen.getByTestId("node-worker-1").firstElementChild;
    expect(workerNode).toHaveStyle({
      width: `${getAgentNodeWidth("Worker")}px`,
    });
    expect(workerNode).toHaveClass("h-[62px]");
  });

  it("renders nested graph containers alongside agent nodes", async () => {
    renderGraph(
      [
        buildNode({
          id: "assistant",
          node_type: "assistant",
          connections: ["worker-1"],
          graph_id: null,
        }),
        buildNode({
          id: "worker-1",
          role_name: "Conductor",
          graph_id: "graph-root",
          connections: ["assistant", "worker-2"],
        }),
        buildNode({
          id: "worker-2",
          role_name: "Worker",
          graph_id: "graph-child",
          connections: ["worker-1"],
        }),
      ],
      [
        buildGraph({
          id: "graph-root",
          owner_agent_id: "worker-1",
          name: "Research Graph",
        }),
        buildGraph({
          id: "graph-child",
          owner_agent_id: "worker-1",
          parent_graph_id: "graph-root",
          name: "Site Sweep",
        }),
      ],
    );

    expect(await screen.findByText("Research Graph")).toBeInTheDocument();
    expect(screen.getByText("Site Sweep")).toBeInTheDocument();
    expect(screen.getByText("Conductor")).toBeInTheDocument();
    expect(screen.getByText("Worker")).toBeInTheDocument();
  });

  it("protects only assistant termination and allows stopping regular agents", async () => {
    renderGraph([
      buildNode({
        id: "assistant",
        node_type: "assistant",
        connections: ["worker-1"],
      }),
      buildNode({
        id: "worker-1",
        role_name: "Worker",
        connections: ["assistant"],
      }),
    ]);

    fireEvent.contextMenu(screen.getByTestId("node-assistant"));
    const stopAssistant = await screen.findByRole("button", {
      name: "Stop Agent",
    });
    expect(stopAssistant).toBeDisabled();

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Stop Agent" }),
      ).not.toBeInTheDocument();
    });

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

  it("re-fits the forest when the container is resized", async () => {
    renderGraph([
      buildNode({
        id: "assistant",
        node_type: "assistant",
        connections: ["worker-1"],
      }),
      buildNode({
        id: "worker-1",
        role_name: "Worker",
        connections: ["assistant"],
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
        maxZoom: 0.75,
        duration: 250,
      });
    });
  });

  it("keeps removed nodes briefly for exit transitions before unmounting them", () => {
    vi.useFakeTimers();

    const view = renderGraph([
      buildNode({
        id: "assistant",
        node_type: "assistant",
        connections: ["worker-1"],
        graph_id: null,
      }),
      buildNode({
        id: "worker-1",
        role_name: "Worker",
        connections: ["assistant"],
      }),
    ]);

    expect(screen.getByTestId("node-worker-1")).toBeInTheDocument();

    useAgentNodesRuntimeMock.mockReturnValue({
      agents: new Map([
        [
          "assistant",
          buildNode({
            id: "assistant",
            node_type: "assistant",
            connections: [],
            graph_id: null,
          }),
        ],
      ]),
    });

    view.rerender(<AgentGraph />);

    expect(screen.getByTestId("node-worker-1")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(330);
    });

    expect(screen.queryByTestId("node-worker-1")).not.toBeInTheDocument();
  });
});
