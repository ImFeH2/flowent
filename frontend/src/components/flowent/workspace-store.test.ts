import type { EdgeChange, NodeChange } from "@xyflow/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canvasSnapGrid,
  initialBlueprints,
  initialEdges,
  initialModelConnections,
  initialModelPresets,
  initialNodes,
  initialRoles,
  snapCanvasPosition,
  type FlowEdge,
  type FlowNode,
} from "./model";
import { useFlowentWorkspaceStore } from "./workspace-store";

function cloneNodes(nodes: FlowNode[]) {
  return nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: {
      ...node.data,
      tools: node.data.tools ? [...node.data.tools] : node.data.tools,
    },
  }));
}

function cloneEdges(edges: FlowEdge[]) {
  return edges.map((edge) => ({ ...edge }));
}

function resetStore() {
  useFlowentWorkspaceStore.setState({
    blueprints: initialBlueprints.map((blueprint) => ({
      ...blueprint,
      nodes: cloneNodes(blueprint.nodes),
      edges: cloneEdges(blueprint.edges),
    })),
    activeBlueprintId: initialBlueprints[0]?.id ?? null,
    modelConnections: initialModelConnections.map((connection) => ({
      ...connection,
    })),
    modelPresets: initialModelPresets.map((preset) => ({ ...preset })),
    roles: initialRoles.map((role) => ({ ...role })),
    nodes: cloneNodes(initialNodes),
    edges: cloneEdges(initialEdges),
    workflowRunStatus: "idle",
    runStartedAt: null,
    runBlockedReason: null,
    frozenRunGraph: null,
    selectedNodeIds: ["agent-1"],
    selectedEdgeIds: [],
    nextNodeIndex: 3,
    localDataStatus: "ready",
    localDataMessage: null,
    hasLoadedLocalData: false,
  });
}

function getNode(nodeId: string) {
  const node = useFlowentWorkspaceStore
    .getState()
    .nodes.find((item) => item.id === nodeId);

  if (!node) {
    throw new Error(`Missing node ${nodeId}`);
  }

  return node;
}

function getActiveBlueprint() {
  const state = useFlowentWorkspaceStore.getState();
  const blueprint = state.blueprints.find(
    (item) => item.id === state.activeBlueprintId,
  );

  if (!blueprint) {
    throw new Error("Missing active blueprint");
  }

  return blueprint;
}

function expectGridPosition(position: FlowNode["position"]) {
  expect(position.x % canvasSnapGrid[0]).toBe(0);
  expect(position.y % canvasSnapGrid[1]).toBe(0);
}

function mockSuccessfulSettingsSave() {
  vi.stubGlobal(
    "fetch",
    vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

      return Promise.resolve(
        new Response(
          JSON.stringify({ saved: true, settings: body?.settings }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }),
  );
}

describe("useFlowentWorkspaceStore", () => {
  beforeEach(() => {
    resetStore();
    vi.unstubAllGlobals();
  });

  it("starts with idle run status and no frozen graph", () => {
    const state = useFlowentWorkspaceStore.getState();
    expect(state.workflowRunStatus).toBe("idle");
    expect(state.frozenRunGraph).toBeNull();
    expect(state.runBlockedReason).toBeNull();
  });

  it("starts with a workspace blueprint asset selected", () => {
    const state = useFlowentWorkspaceStore.getState();
    expect(state.activeBlueprintId).toBe(initialBlueprints[0]?.id);
    expect(state.blueprints).toHaveLength(initialBlueprints.length);
  });

  it("starts a run, freezes the graph, and clears run status on completion", () => {
    useFlowentWorkspaceStore.getState().startWorkflowRun();
    expect(useFlowentWorkspaceStore.getState().workflowRunStatus).toBe(
      "running",
    );
    expect(useFlowentWorkspaceStore.getState().frozenRunGraph).not.toBeNull();

    useFlowentWorkspaceStore.getState().advanceWorkflowRun();
    useFlowentWorkspaceStore.getState().finishWorkflowRun();

    expect(useFlowentWorkspaceStore.getState().workflowRunStatus).toBe(
      "succeeded",
    );
    expect(useFlowentWorkspaceStore.getState().frozenRunGraph).toBeNull();
  });

  it("stops a running workflow without marking unstarted nodes as canceled", () => {
    useFlowentWorkspaceStore.getState().startWorkflowRun();
    useFlowentWorkspaceStore.getState().cancelWorkflowRun();

    const state = useFlowentWorkspaceStore.getState();
    expect(state.workflowRunStatus).toBe("canceled");
    expect(state.frozenRunGraph).toBeNull();
    expect(getNode("agent-1").data.status).toBe("canceled");
    expect(getNode("agent-2").data.status).toBe("idle");
  });

  it("uses the frozen definition when a node is edited during a run", () => {
    useFlowentWorkspaceStore.getState().startWorkflowRun();
    useFlowentWorkspaceStore
      .getState()
      .updateNodeData("trigger-1", { initialPayload: "Updated mid-run" });

    useFlowentWorkspaceStore.getState().advanceWorkflowRun();
    useFlowentWorkspaceStore.getState().finishWorkflowRun();

    expect(getNode("trigger-1").data.initialPayload).toBe("Updated mid-run");
    expect(getNode("trigger-1").data.runDetails?.outputPayload).toBe(
      "Draft a concise campaign outline for the launch.",
    );
    expect(getNode("agent-1").data.runDetails?.inputPayload).toBe(
      "Draft a concise campaign outline for the launch.",
    );
  });

  it("clears all node run results when a new run starts", () => {
    useFlowentWorkspaceStore.getState().startWorkflowRun();
    useFlowentWorkspaceStore.getState().advanceWorkflowRun();
    useFlowentWorkspaceStore.getState().finishWorkflowRun();

    expect(getNode("agent-1").data.status).toBe("success");

    useFlowentWorkspaceStore.getState().startWorkflowRun();

    const triggerStatus = getNode("trigger-1").data.status;
    expect(triggerStatus).toBe("success");
    const downstreamStatuses = useFlowentWorkspaceStore
      .getState()
      .nodes.filter((node) => node.data.kind === "agent")
      .map((node) => node.data.status);
    expect(downstreamStatuses).toContain("running");
  });

  it("blocks running when there is no trigger node", () => {
    useFlowentWorkspaceStore.setState({
      nodes: [getNode("agent-1")],
      edges: [],
    });

    useFlowentWorkspaceStore.getState().startWorkflowRun();

    const state = useFlowentWorkspaceStore.getState();
    expect(state.workflowRunStatus).toBe("idle");
    expect(state.runBlockedReason).toMatch(/Trigger/);
  });

  it("blocks running when more than one trigger node is present", () => {
    const triggerOne = getNode("trigger-1");
    const triggerTwo = {
      ...triggerOne,
      id: "trigger-2",
      position: { ...triggerOne.position, y: triggerOne.position.y + 200 },
      data: { ...triggerOne.data },
    };
    useFlowentWorkspaceStore.setState({
      nodes: [triggerOne, triggerTwo, getNode("agent-1")],
    });

    useFlowentWorkspaceStore.getState().startWorkflowRun();

    expect(useFlowentWorkspaceStore.getState().runBlockedReason).toMatch(
      /one Trigger/,
    );
  });

  it("blocks running when an Agent node references a missing model preset", () => {
    useFlowentWorkspaceStore.setState({
      modelPresets: useFlowentWorkspaceStore
        .getState()
        .modelPresets.filter((preset) => preset.id !== "preset-writing"),
    });

    useFlowentWorkspaceStore.getState().startWorkflowRun();

    expect(useFlowentWorkspaceStore.getState().workflowRunStatus).toBe("idle");
    expect(useFlowentWorkspaceStore.getState().runBlockedReason).toMatch(
      /Pick an available model/,
    );
  });

  it("blocks running when a node has no path from the Trigger", () => {
    const orphan = getNode("agent-1");
    useFlowentWorkspaceStore.setState({
      nodes: [
        getNode("trigger-1"),
        {
          ...orphan,
          id: "agent-orphan",
          data: { ...orphan.data, title: "Orphan" },
        },
      ],
      edges: [],
    });

    useFlowentWorkspaceStore.getState().startWorkflowRun();

    expect(useFlowentWorkspaceStore.getState().runBlockedReason).toMatch(
      /Connect/,
    );
  });

  it("rejects structural node edits while a run is in progress", () => {
    useFlowentWorkspaceStore.getState().startWorkflowRun();
    const before = useFlowentWorkspaceStore.getState().nodes.length;

    const removeChange: NodeChange<FlowNode> = {
      id: "agent-1",
      type: "remove",
    };
    useFlowentWorkspaceStore.getState().applyNodeChanges([removeChange]);

    expect(useFlowentWorkspaceStore.getState().nodes).toHaveLength(before);
  });

  it("allows non-structural node updates during a run", () => {
    useFlowentWorkspaceStore.getState().startWorkflowRun();

    useFlowentWorkspaceStore
      .getState()
      .updateNodeData("trigger-1", { initialPayload: "Updated mid-run" });

    expect(getNode("trigger-1").data.initialPayload).toBe("Updated mid-run");
  });

  it("rejects new connections during a run", () => {
    useFlowentWorkspaceStore.getState().startWorkflowRun();
    const beforeEdges = useFlowentWorkspaceStore.getState().edges.length;

    useFlowentWorkspaceStore.getState().connectNodes({
      source: "trigger-1",
      target: "agent-1",
      sourceHandle: "output",
      targetHandle: "input",
    });

    expect(useFlowentWorkspaceStore.getState().edges).toHaveLength(beforeEdges);
  });

  it("creates a blank workflow and makes it current", () => {
    useFlowentWorkspaceStore.getState().createBlueprint();

    const state = useFlowentWorkspaceStore.getState();
    expect(state.activeBlueprintId).not.toBe(initialBlueprints[0]?.id);
    expect(state.nodes).toHaveLength(0);
    expect(state.edges).toHaveLength(0);
    expect(state.workflowRunStatus).toBe("idle");
  });

  it("opens a blueprint and loads its saved graph", () => {
    const newId = useFlowentWorkspaceStore.getState().createBlueprint();
    useFlowentWorkspaceStore.getState().openBlueprint(initialBlueprints[0]!.id);

    expect(useFlowentWorkspaceStore.getState().activeBlueprintId).toBe(
      initialBlueprints[0]!.id,
    );
    expect(useFlowentWorkspaceStore.getState().nodes.length).toBeGreaterThan(0);
    expect(useFlowentWorkspaceStore.getState().workflowRunStatus).toBe("idle");
    expect(newId).not.toBe(initialBlueprints[0]!.id);
  });

  it("starts with demo nodes aligned to the canvas grid", () => {
    useFlowentWorkspaceStore.getState().nodes.forEach((node) => {
      expectGridPosition(node.position);
    });
  });

  it("snaps newly added workflow nodes to the canvas grid", () => {
    useFlowentWorkspaceStore.getState().addWorkflowNode("agent", {
      x: 121,
      y: 87,
    });
    const node = useFlowentWorkspaceStore.getState().nodes.at(-1)!;
    expectGridPosition(node.position);
    expect(node.position).toEqual(snapCanvasPosition({ x: 121, y: 87 }));
  });

  it("snaps quick-added nodes to the canvas grid", () => {
    useFlowentWorkspaceStore.getState().addQuickNode("agent");
    const node = useFlowentWorkspaceStore.getState().nodes.at(-1)!;
    expectGridPosition(node.position);
  });

  it("keeps node movement smooth while dragging and snaps when dragging ends", () => {
    const draggingChange: NodeChange<FlowNode> = {
      id: "agent-1",
      type: "position",
      position: { x: 11, y: 9 },
      dragging: true,
    };
    useFlowentWorkspaceStore.getState().applyNodeChanges([draggingChange]);
    expect(getNode("agent-1").position).toEqual({ x: 11, y: 9 });

    const settledChange: NodeChange<FlowNode> = {
      id: "agent-1",
      type: "position",
      position: { x: 11, y: 9 },
      dragging: false,
    };
    useFlowentWorkspaceStore.getState().applyNodeChanges([settledChange]);
    expectGridPosition(getNode("agent-1").position);
  });

  it("ignores selection-only edge changes for persistence", () => {
    mockSuccessfulSettingsSave();
    useFlowentWorkspaceStore.setState({ hasLoadedLocalData: true });
    const fetchMock = window.fetch as unknown as ReturnType<typeof vi.fn>;
    const before = fetchMock.mock.calls.length;

    const change: EdgeChange<FlowEdge> = {
      id: useFlowentWorkspaceStore.getState().edges[0]!.id,
      type: "select",
      selected: true,
    };
    useFlowentWorkspaceStore.getState().applyEdgeChanges([change]);

    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("creates an agent from a role at a snapped position", () => {
    useFlowentWorkspaceStore
      .getState()
      .addAgentFromRole("role-product-copywriter", { x: 401, y: 87 });
    const node = useFlowentWorkspaceStore.getState().nodes.at(-1)!;
    expectGridPosition(node.position);
    expect(node.data.kind).toBe("agent");
    expect(node.data.title).toBe("Product Copywriter");
  });

  it("removes presets that depend on a deleted connection", async () => {
    mockSuccessfulSettingsSave();
    await useFlowentWorkspaceStore
      .getState()
      .deleteModelConnection("connection-work-gateway");

    const state = useFlowentWorkspaceStore.getState();
    expect(
      state.modelConnections.some(
        (item) => item.id === "connection-work-gateway",
      ),
    ).toBe(false);
    expect(
      state.modelPresets.some((item) => item.id === "preset-writing"),
    ).toBe(false);
  });

  it("treats an active blueprint as the persistence target", () => {
    expect(getActiveBlueprint().id).toBe(initialBlueprints[0]!.id);
  });
});
