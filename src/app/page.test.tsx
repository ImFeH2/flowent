import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Home from "./page";

type MockNode = {
  id: string;
  data: {
    title?: string;
    status?: string;
  };
};

type MockEdge = {
  id: string;
  source: string;
  target: string;
};

type MockConnection = {
  source?: string | null;
  target?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

vi.mock("@xyflow/react", async () => {
  const React = await import("react");

  return {
    ReactFlowProvider({ children }: { children: ReactNode }) {
      return <div data-testid="flow-provider">{children}</div>;
    },
    ReactFlow({
      children,
      nodes = [],
      edges = [],
    }: {
      children?: ReactNode;
      nodes?: MockNode[];
      edges?: MockEdge[];
    }) {
      return (
        <div data-testid="workflow-canvas">
          {nodes.map((node) => (
            <div key={node.id}>
              <span>{node.data.title}</span>
              <span>{node.data.status}</span>
            </div>
          ))}
          {edges.map((edge) => (
            <span key={edge.id}>
              {edge.source} to {edge.target}
            </span>
          ))}
          {children}
        </div>
      );
    },
    Background() {
      return <div data-testid="canvas-background" />;
    },
    Controls() {
      return <div data-testid="canvas-controls" />;
    },
    MiniMap() {
      return <div data-testid="canvas-minimap" />;
    },
    Handle() {
      return <span data-testid="node-handle" />;
    },
    Position: {
      Left: "left",
      Right: "right",
    },
    addEdge(connection: MockConnection, edges: MockEdge[]) {
      return edges.concat({
        id: `${connection.source}-${connection.target}`,
        source: connection.source ?? "",
        target: connection.target ?? "",
      });
    },
    applyNodeChanges(_changes: unknown[], nodes: MockNode[]) {
      return nodes;
    },
    applyEdgeChanges(_changes: unknown[], edges: MockEdge[]) {
      return edges;
    },
    getConnectedEdges(nodes: MockNode[], edges: MockEdge[]) {
      const nodeIds = new Set(nodes.map((node) => node.id));

      return edges.filter(
        (edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target),
      );
    },
    useNodesState(initialNodes: MockNode[]) {
      const [nodes, setNodes] = React.useState(initialNodes);

      return [nodes, setNodes, vi.fn()];
    },
    useEdgesState(initialEdges: MockEdge[]) {
      const [edges, setEdges] = React.useState(initialEdges);

      return [edges, setEdges, vi.fn()];
    },
    useReactFlow() {
      return {
        fitView: vi.fn(),
        screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({
          x,
          y,
        }),
        setViewport: vi.fn(),
      };
    },
  };
});

describe("Home", () => {
  it("renders the workflow workspace", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Flowent" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Node Library")).toBeInTheDocument();
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    expect(screen.getAllByText("Copywriter").length).toBeGreaterThan(0);
    expect(screen.getByTestId("canvas-minimap")).toBeInTheDocument();
  });

  it("shows the selected agent configuration", () => {
    render(<Home />);

    expect(screen.getAllByText("Properties").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Copywriter")).toBeInTheDocument();
    expect(screen.getByLabelText("System Prompt")).toBeInTheDocument();
    expect(screen.getByText("Model Preset")).toBeInTheDocument();
  });

  it("shows run state feedback on nodes", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /^Run$/ }));

    expect(screen.getAllByText("success").length).toBeGreaterThan(0);
    expect(screen.getAllByText("running").length).toBeGreaterThan(0);
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
  });
});
