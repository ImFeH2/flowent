import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlueprintsPage } from "@/pages/BlueprintsPage";
import type { ReactNode } from "react";
import type { BlueprintVersionSummary, Role, RouteBlueprint } from "@/types";

const fitViewMock = vi.fn().mockResolvedValue(true);

const {
  createBlueprintRequestMock,
  deleteBlueprintRequestMock,
  fetchBlueprintsMock,
  fetchRolesMock,
  toastErrorMock,
  toastSuccessMock,
  updateBlueprintRequestMock,
} = vi.hoisted(() => ({
  createBlueprintRequestMock: vi.fn(),
  deleteBlueprintRequestMock: vi.fn(),
  fetchBlueprintsMock: vi.fn(),
  fetchRolesMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateBlueprintRequestMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createBlueprintRequest: (...args: unknown[]) =>
    createBlueprintRequestMock(...args),
  deleteBlueprintRequest: (...args: unknown[]) =>
    deleteBlueprintRequestMock(...args),
  fetchBlueprints: (...args: unknown[]) => fetchBlueprintsMock(...args),
  fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
  updateBlueprintRequest: (...args: unknown[]) =>
    updateBlueprintRequestMock(...args),
}));

vi.mock("@xyflow/react", async () => {
  const react = await import("react");

  function ReactFlowMock({
    nodes,
    onInit,
    onNodeClick,
    children,
  }: {
    nodes: Array<{
      id: string;
      data: { label: string };
    }>;
    onInit?: (instance: { fitView: typeof fitViewMock }) => void;
    onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
    children?: ReactNode;
  }) {
    react.useEffect(() => {
      onInit?.({ fitView: fitViewMock });
    }, [onInit]);

    return (
      <div data-testid="react-flow">
        {nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            data-testid={`node-${node.id}`}
            onClick={(event) => onNodeClick?.(event, node)}
          >
            {node.data.label}
          </button>
        ))}
        {children}
      </div>
    );
  }

  return {
    Background: () => null,
    Handle: () => null,
    MarkerType: {
      ArrowClosed: "arrow-closed",
    },
    Position: {
      Bottom: "bottom",
      Top: "top",
    },
    ReactFlow: ReactFlowMock,
  };
});

vi.mock("@/components/PanelResizer", () => ({
  PanelResizer: () => null,
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

function buildRole(overrides: Partial<Role> & Pick<Role, "name">): Role {
  return {
    name: overrides.name,
    description: overrides.description ?? `${overrides.name} description`,
    system_prompt: overrides.system_prompt ?? `${overrides.name} prompt`,
    model: overrides.model ?? null,
    model_params: overrides.model_params ?? null,
    included_tools: overrides.included_tools ?? [],
    excluded_tools: overrides.excluded_tools ?? [],
    is_builtin: overrides.is_builtin ?? false,
  };
}

function buildBlueprint(
  overrides: Partial<RouteBlueprint> & Pick<RouteBlueprint, "id" | "name">,
): RouteBlueprint {
  const versionHistory: BlueprintVersionSummary[] =
    overrides.version_history ?? [
      {
        version: overrides.version ?? 2,
        updated_at: overrides.updated_at ?? 1710000000,
      },
    ];

  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? "Leader plus reviewers",
    version: overrides.version ?? 2,
    slots: overrides.slots ?? [
      {
        id: "slot-1",
        role_name: "Reviewer",
        display_name: "Primary Reviewer",
      },
    ],
    edges: overrides.edges ?? [
      {
        from_slot_id: "leader",
        to_slot_id: "slot-1",
      },
    ],
    created_at: overrides.created_at ?? 1700000000,
    updated_at: overrides.updated_at ?? 1710000000,
    node_count: overrides.node_count ?? 1,
    edge_count: overrides.edge_count ?? 1,
    version_history: versionHistory,
  };
}

describe("BlueprintsPage", () => {
  beforeEach(() => {
    createBlueprintRequestMock.mockReset();
    deleteBlueprintRequestMock.mockReset();
    fetchBlueprintsMock.mockReset();
    fetchRolesMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    updateBlueprintRequestMock.mockReset();

    fetchBlueprintsMock.mockResolvedValue([
      buildBlueprint({
        id: "blueprint-1",
        name: "Review Pipeline",
      }),
    ]);
    fetchRolesMock.mockResolvedValue([
      buildRole({ name: "Worker", description: "General execution role" }),
      buildRole({ name: "Reviewer", description: "Review the result" }),
    ]);
  });

  it("renders library, stage, and inspector for the selected blueprint", async () => {
    render(<BlueprintsPage />);

    await screen.findAllByText("Review Pipeline");

    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Inspector")).toBeInTheDocument();
    expect(screen.getByTestId("react-flow")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("node-slot-1"));

    expect(screen.getByText("Slot Inspector")).toBeInTheDocument();
    expect(screen.getByText("Slot Key")).toBeInTheDocument();
    expect(screen.getAllByText("Primary Reviewer").length).toBeGreaterThan(0);
  });

  it("edits the selected blueprint and saves a new version", async () => {
    updateBlueprintRequestMock.mockResolvedValue(
      buildBlueprint({
        id: "blueprint-1",
        name: "Updated Pipeline",
        version: 3,
        version_history: [
          { version: 2, updated_at: 1710000000 },
          { version: 3, updated_at: 1720000000 },
        ],
      }),
    );

    render(<BlueprintsPage />);

    await screen.findAllByText("Review Pipeline");

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(screen.getByLabelText("Blueprint name"), {
      target: { value: "Updated Pipeline" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

    await waitFor(() =>
      expect(updateBlueprintRequestMock).toHaveBeenCalledWith("blueprint-1", {
        name: "Updated Pipeline",
        description: "Leader plus reviewers",
        slots: [
          {
            id: "slot-1",
            role_name: "Reviewer",
            display_name: "Primary Reviewer",
          },
        ],
        edges: [
          {
            from_slot_id: "leader",
            to_slot_id: "slot-1",
          },
        ],
      }),
    );

    expect(toastSuccessMock).toHaveBeenCalledWith("Blueprint updated");
  });
});
