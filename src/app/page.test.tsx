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
    expect(
      screen.getByRole("heading", { level: 1, name: "Workflows" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Roles" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Launch Campaign Workflow")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Canvas" }),
    ).toBeInTheDocument();
  });

  it("shows the selected agent configuration", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Open Canvas" }));

    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    expect(screen.getAllByText("Copywriter").length).toBeGreaterThan(0);
    expect(screen.getByTestId("canvas-minimap")).toBeInTheDocument();
    expect(screen.getAllByText("Properties").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Copywriter")).toBeInTheDocument();
    expect(screen.getByLabelText("System Prompt")).toBeInTheDocument();
    expect(screen.getByText("Model Preset")).toBeInTheDocument();
  });

  it("shows run state feedback on nodes", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Open Canvas" }));
    fireEvent.click(screen.getByRole("button", { name: /^Run$/ }));

    expect(screen.getAllByText("success").length).toBeGreaterThan(0);
    expect(screen.getAllByText("running").length).toBeGreaterThan(0);
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
  });

  it("opens the roles library", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Roles" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Roles" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Product Copywriter")).toBeInTheDocument();
    expect(screen.getByLabelText("Role Name")).toBeInTheDocument();
    expect(screen.getByLabelText("System Prompt")).toBeInTheDocument();
  });

  it("creates an agent from a role", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Roles" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Use Role" })[0]);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Launch Campaign Workflow",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Product Copywriter").length).toBeGreaterThan(0);
  });

  it("shows settings in the main view", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Providers" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Model Presets" }),
    ).toBeInTheDocument();
    expect(screen.getByText("OpenAI Platform")).toBeInTheDocument();
  });
});
