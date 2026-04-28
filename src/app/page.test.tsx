import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";
import {
  canvasSnapGrid,
  initialBlueprints,
  initialEdges,
  initialModelConnections,
  initialModelPresets,
  initialNodes,
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
      snapToGrid,
      snapGrid,
      onNodeClick,
    }: {
      children?: ReactNode;
      nodes?: MockNode[];
      edges?: MockEdge[];
      nodesDraggable?: boolean;
      snapToGrid?: boolean;
      snapGrid?: [number, number];
      onNodeClick?: (event: unknown, node: MockNode) => void;
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
          data-snap-grid={snapGrid?.join(",") ?? ""}
          data-snap-to-grid={snapToGrid ? "true" : "false"}
          data-testid="workflow-canvas"
        >
          {nodes.map((node) => (
            <div key={node.id}>
              <button type="button" onClick={() => onNodeClick?.({}, node)}>
                {node.data.title}
              </button>
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
    Background({ gap }: { gap?: number }) {
      return <div data-grid-gap={gap} data-testid="canvas-background" />;
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
    blueprints: initialBlueprints.map((blueprint) => ({
      ...blueprint,
      nodes: blueprint.nodes.map((node) => ({
        ...node,
        position: { ...node.position },
        data: { ...node.data },
      })),
      edges: blueprint.edges.map((edge) => ({ ...edge })),
    })),
    activeBlueprintId: initialBlueprints[0]?.id ?? null,
    modelConnections: initialModelConnections.map((connection) => ({
      ...connection,
    })),
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
    localDataStatus: "ready",
    localDataMessage: null,
    hasLoadedLocalData: false,
  });
}

function mockMissingLocalSettings() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ saved: false, settings: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ),
  );
}

describe("Home", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    mockMissingLocalSettings();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    resetWorkspaceStore();
  });

  it("renders the workflows workbench", () => {
    render(<Home />);
    const sidebar = screen.getByLabelText("Workspace navigation");
    const workflowContext = screen.getByLabelText("Current workflow");

    expect(
      screen.getByRole("heading", { level: 1, name: "Flowent" }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: "Workflows" }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: "Roles" }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dark Mode" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Launch Campaign").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Search workflows")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter workflows")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create workflow" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Launch Campaign" }),
    ).toBeInTheDocument();
    expect(within(sidebar).queryByText("Runs")).not.toBeInTheDocument();
    expect(within(sidebar).queryByText("No runs yet")).not.toBeInTheDocument();
    expect(within(workflowContext).getByText("Runs")).toBeInTheDocument();
    expect(
      within(workflowContext).getByText("No runs yet"),
    ).toBeInTheDocument();
    expect(
      within(workflowContext).getByRole("button", { name: "Run workflow" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Blueprint")).not.toBeInTheDocument();
  });

  it("shows the selected agent configuration", async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Copywriter" }));

    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run workflow" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    expect(screen.getAllByText("Copywriter").length).toBeGreaterThan(0);
    expect(screen.getByTestId("canvas-minimap")).toBeInTheDocument();
    expect(screen.getAllByText("Properties").length).toBeGreaterThan(0);
    expect(screen.getByText("Workflow editor")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-canvas")).toHaveAttribute(
      "data-snap-to-grid",
      "true",
    );
    expect(screen.getByTestId("workflow-canvas")).toHaveAttribute(
      "data-snap-grid",
      canvasSnapGrid.join(","),
    );
    expect(screen.getByTestId("canvas-background")).toHaveAttribute(
      "data-grid-gap",
      String(canvasSnapGrid[0]),
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue("Copywriter")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("System Prompt")).toBeInTheDocument();
    expect(screen.getByText("Model Preset")).toBeInTheDocument();
    expect(screen.queryByText("Idle")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
    expect(screen.queryByText("Success")).not.toBeInTheDocument();
  });

  it("asks users to choose a model when an agent references a removed preset", async () => {
    useFlowentWorkspaceStore.setState({
      modelPresets: initialModelPresets.filter(
        (preset) => preset.id !== "preset-writing",
      ),
    });

    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Copywriter" }));

    expect(screen.getByRole("button", { name: "Run workflow" })).toBeDisabled();
    expect(screen.getAllByText("Choose models before running").length).toBe(1);
    await waitFor(() =>
      expect(
        screen.getByText(
          "Choose an available model before running this agent.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("locks the canvas and shows run state feedback in workflow mode", async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Copywriter" }));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Copywriter")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("Run started.")).toBeInTheDocument();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(screen.getByText("Run view")).toBeInTheDocument();
    expect(screen.getByText("Read-only run")).toBeInTheDocument();
    expect(
      screen.getByText("Editing is locked while this run is open."),
    ).toBeInTheDocument();
    expect(screen.getByText("Execution Details")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-canvas")).toHaveAttribute(
      "data-read-only",
      "true",
    );
    expect(screen.getByTestId("workflow-canvas")).toHaveAttribute(
      "data-snap-to-grid",
      "false",
    );
    expect(screen.getByText("Conversation History")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Tool Calls")).toBeInTheDocument();
    expect(screen.getByText("Assistant")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Copywriter")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("System Prompt")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getAllByText("Success").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Thinking").length).toBeGreaterThan(0);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit workflow" }));

    expect(screen.getByText("Workflow editor")).toBeInTheDocument();
    expect(screen.queryByText("Read-only run")).not.toBeInTheDocument();
    expect(screen.queryByText("Read-only")).not.toBeInTheDocument();
    expect(screen.queryByText("Execution Details")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("workflow-canvas")).queryByText("Success"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("workflow-canvas")).queryByText("Thinking"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("workflow-canvas")).queryByText("Pending"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Properties")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copywriter" }));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Copywriter")).not.toBeDisabled(),
    );

    fireEvent.click(screen.getByText("Run started."));

    expect(screen.getByText("Run view")).toBeInTheDocument();
    expect(screen.getByText("Execution Details")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
  });

  it("keeps workflow runs in the current workflow panel", () => {
    render(<Home />);
    const sidebar = screen.getByLabelText("Workspace navigation");
    const workflowContext = screen.getByLabelText("Current workflow");

    expect(
      within(sidebar).queryByRole("button", { name: "Run workflow" }),
    ).not.toBeInTheDocument();
    expect(within(sidebar).queryByText("No runs yet")).not.toBeInTheDocument();
    expect(
      within(workflowContext).getByRole("button", { name: "Run workflow" }),
    ).toBeInTheDocument();
    expect(
      within(workflowContext).getByText("No runs yet"),
    ).toBeInTheDocument();
  });

  it("creates a workflow from the sidebar and opens it", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Create workflow" }));

    expect(
      screen.getByRole("heading", { level: 2, name: "Untitled workflow" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Blank workflow ready to build."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Untitled workflow" }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("clears workflow search filters with no results", () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("Search workflows"), {
      target: { value: "no matching workflow" },
    });

    expect(screen.getByText("No matching workflows")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getAllByText("Launch Campaign").length).toBeGreaterThan(0);
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
        name: "Launch Campaign",
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
    expect(
      screen.getByRole("tab", { name: "Connections" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Model Presets" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Work gateway")).toBeInTheDocument();
    expect(screen.getAllByText("Endpoint URL:").length).toBeGreaterThan(0);
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
