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
import { AgentFormation } from "@/components/AgentFormation";
import { getAgentNodeWidth } from "@/lib/layout";
import type { Formation, Node } from "@/types";

const fitViewMock = vi.fn().mockResolvedValue(true);
const terminateNodeMock = vi.fn().mockResolvedValue(undefined);
const useAgentNodesRuntimeMock = vi.fn();
const useAgentFormationRuntimeMock = vi.fn();
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
  useAgentFormationRuntime: () => useAgentFormationRuntimeMock(),
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
    onNodeContextMenu?: (
      event: React.MouseEvent,
      node: { id: string; node_type?: string },
    ) => void;
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
    formation_id: "formation-root",
    state: "idle",
    connections: [],
    name: null,
    todos: [],
    role_name: null,
    ...overrides,
  };
}

function buildFormation(overrides: Partial<Formation>): Formation {
  return {
    id: "formation-root",
    owner_agent_id: "worker-1",
    parent_formation_id: null,
    name: "Research Formation",
    goal: "Investigate sources",
    ...overrides,
  };
}

function renderFormation(nodes: Node[], formations: Formation[] = []) {
  useAgentNodesRuntimeMock.mockReturnValue({
    agents: new Map(nodes.map((node) => [node.id, node])),
  });
  useAgentFormationRuntimeMock.mockReturnValue({
    formations: new Map(
      formations.map((formation) => [formation.id, formation]),
    ),
  });
  useAgentActivityRuntimeMock.mockReturnValue({
    activeMessages: [],
    activeToolCalls: new Map(),
  });
  useAgentUIMock.mockReturnValue({
    selectedAgentId: null,
    selectAgent: vi.fn(),
  });

  return render(<AgentFormation />);
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

describe("AgentFormation", () => {
  it("renders unnamed agent nodes using role_name and sizes width to fit the label", async () => {
    renderFormation([
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

  it("renders nested formation containers alongside agent nodes", async () => {
    renderFormation(
      [
        buildNode({
          id: "assistant",
          node_type: "assistant",
          connections: ["worker-1"],
          formation_id: null,
        }),
        buildNode({
          id: "worker-1",
          role_name: "Conductor",
          formation_id: "formation-root",
          connections: ["assistant", "worker-2"],
        }),
        buildNode({
          id: "worker-2",
          role_name: "Worker",
          formation_id: "formation-child",
          connections: ["worker-1"],
        }),
      ],
      [
        buildFormation({
          id: "formation-root",
          owner_agent_id: "worker-1",
          name: "Research Formation",
        }),
        buildFormation({
          id: "formation-child",
          owner_agent_id: "worker-1",
          parent_formation_id: "formation-root",
          name: "Site Sweep",
        }),
      ],
    );

    expect(await screen.findByText("Research Formation")).toBeInTheDocument();
    expect(screen.getByText("Site Sweep")).toBeInTheDocument();
    expect(screen.getByText("Conductor")).toBeInTheDocument();
    expect(screen.getByText("Worker")).toBeInTheDocument();
  });

  it("protects only assistant termination and allows stopping regular agents", async () => {
    renderFormation([
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
    renderFormation([
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
        maxZoom: 1,
        duration: 250,
      });
    });
  });

  it("configures the workspace canvas for freeform zooming", async () => {
    renderFormation([
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

    const view = renderFormation([
      buildNode({
        id: "assistant",
        node_type: "assistant",
        connections: ["worker-1"],
        formation_id: null,
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
            formation_id: null,
          }),
        ],
      ]),
    });

    view.rerender(<AgentFormation />);

    expect(screen.getByTestId("node-worker-1")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(330);
    });

    expect(screen.queryByTestId("node-worker-1")).not.toBeInTheDocument();
  });
});
