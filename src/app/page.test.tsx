import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";
import {
  initialEdges,
  initialModelPresets,
  initialNodes,
  initialProviders,
  initialRoles,
} from "@/components/flowent/model";
import { useFlowentWorkspaceStore } from "@/components/flowent/workspace-store";
import { themeStorageKey } from "@/lib/theme";

type MockNode = {
  id: string;
  data: {
    title?: string;
    status?: string;
    canvasMode?: string;
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
      nodesDraggable,
    }: {
      children?: ReactNode;
      nodes?: MockNode[];
      edges?: MockEdge[];
      nodesDraggable?: boolean;
    }) {
      const statusLabels: Record<string, string> = {
        idle: "Idle",
        pending: "Pending",
        running: "Thinking",
        success: "Success",
        error: "Error",
      };

      return (
        <div
          data-read-only={nodesDraggable === false ? "true" : "false"}
          data-testid="workflow-canvas"
        >
          {nodes.map((node) => (
            <div key={node.id}>
              <span>{node.data.title}</span>
              {node.data.canvasMode === "workflow" && node.data.status && (
                <span>{statusLabels[node.data.status]}</span>
              )}
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

function resetWorkspaceStore() {
  useFlowentWorkspaceStore.setState({
    providers: initialProviders.map((provider) => ({ ...provider })),
    modelPresets: initialModelPresets.map((preset) => ({ ...preset })),
    roles: initialRoles.map((role) => ({ ...role })),
    nodes: initialNodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
    })),
    edges: initialEdges.map((edge) => ({ ...edge })),
    canvasMode: "blueprint",
    selectedNodeIds: ["agent-1"],
    selectedEdgeIds: [],
    nextNodeIndex: 3,
  });
}

describe("Home", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    resetWorkspaceStore();
  });

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
    expect(
      screen.getByRole("button", { name: "Dark Mode" }),
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
    expect(screen.getByText("Blueprint Mode")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Copywriter")).toBeInTheDocument();
    expect(screen.getByLabelText("System Prompt")).toBeInTheDocument();
    expect(screen.getByText("Model Preset")).toBeInTheDocument();
    expect(screen.queryByText("Idle")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
    expect(screen.queryByText("Success")).not.toBeInTheDocument();
  });

  it("locks the canvas and shows run state feedback in workflow mode", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Open Canvas" }));
    fireEvent.click(screen.getByRole("button", { name: /^Run$/ }));

    expect(screen.getByText("Workflow Mode")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-canvas")).toHaveAttribute(
      "data-read-only",
      "true",
    );
    expect(screen.getByDisplayValue("Copywriter")).toBeDisabled();
    expect(screen.getByLabelText("System Prompt")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getAllByText("Success").length).toBeGreaterThan(0);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Blueprint" }));

    expect(screen.getByText("Blueprint Mode")).toBeInTheDocument();
    expect(screen.queryByText("Read-only")).not.toBeInTheDocument();
    expect(screen.queryByText("Success")).not.toBeInTheDocument();
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Copywriter")).not.toBeDisabled();
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

  it("defaults to dark mode and saves the selected theme", () => {
    render(<Home />);

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).not.toHaveClass("light");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "Dark Mode" }));

    expect(window.localStorage.getItem(themeStorageKey)).toBe("light");
    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(
      screen.getByRole("button", { name: "Light Mode" }),
    ).toBeInTheDocument();
  });

  it("scopes theme selectors to the app root", () => {
    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(css).toContain("html.dark {");
    expect(css).toContain("html.light {");
    expect(css).not.toMatch(/\n\.dark\s*\{/);
    expect(css).not.toMatch(/\n\.light\s*\{/);
  });
});
