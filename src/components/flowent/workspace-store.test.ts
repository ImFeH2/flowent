import type { EdgeChange, NodeChange } from "@xyflow/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canvasSnapGrid,
  initialBlueprints,
  initialEdges,
  initialModelPresets,
  initialNodes,
  initialProviders,
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
    providers: initialProviders.map((provider) => ({ ...provider })),
    modelPresets: initialModelPresets.map((preset) => ({ ...preset })),
    roles: initialRoles.map((role) => ({ ...role })),
    nodes: cloneNodes(initialNodes),
    edges: cloneEdges(initialEdges),
    canvasMode: "blueprint",
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
    vi.unstubAllGlobals();
    resetStore();
  });

  it("starts in blueprint mode", () => {
    expect(useFlowentWorkspaceStore.getState().canvasMode).toBe("blueprint");
  });

  it("starts with a workspace blueprint asset selected", () => {
    const state = useFlowentWorkspaceStore.getState();

    expect(state.blueprints).toHaveLength(1);
    expect(state.activeBlueprintId).toBe("blueprint-launch-campaign");
    expect(state.blueprints[0]).toMatchObject({
      name: "Launch Campaign",
      lastRunStatus: "not-run",
    });
    expect(state.nodes).toHaveLength(initialNodes.length);
    expect(state.edges).toHaveLength(initialEdges.length);
  });

  it("loads saved local settings into the workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              saved: true,
              settings: {
                providers: [
                  {
                    id: "provider-custom-saved",
                    type: "custom",
                    name: "Saved Gateway",
                    apiKey: "saved-key",
                    baseUrl: "http://localhost:4400/v1",
                  },
                ],
                modelPresets: [
                  {
                    id: "preset-saved",
                    name: "Saved Model",
                    providerId: "provider-custom-saved",
                    modelId: "gpt-4.1",
                    temperature: 0.4,
                    maxTokens: 900,
                  },
                ],
                blueprints: [
                  {
                    ...initialBlueprints[0],
                    id: "blueprint-saved",
                    name: "Saved Blueprint",
                  },
                ],
                roles: [
                  {
                    id: "role-saved",
                    name: "Saved Role",
                    avatar: "SR",
                    systemPrompt: "Use the saved model.",
                    modelPresetId: "preset-saved",
                  },
                ],
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );

    await useFlowentWorkspaceStore.getState().loadLocalSettings();

    const state = useFlowentWorkspaceStore.getState();

    expect(state.localDataStatus).toBe("ready");
    expect(state.providers[0]?.name).toBe("Saved Gateway");
    expect(state.modelPresets[0]?.name).toBe("Saved Model");
    expect(state.blueprints[0]?.name).toBe("Saved Blueprint");
    expect(state.activeBlueprintId).toBe("blueprint-saved");
    expect(state.roles[0]?.name).toBe("Saved Role");
  });

  it("keeps settings unchanged when a local save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: "Settings could not be saved." }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );

    const saved = await useFlowentWorkspaceStore.getState().upsertProvider(
      {
        id: "",
        type: "custom",
        name: "Unsaved Gateway",
        apiKey: "new-key",
        baseUrl: "http://localhost:4500/v1",
      },
      null,
    );

    const state = useFlowentWorkspaceStore.getState();

    expect(saved).toBe(false);
    expect(
      state.providers.some((provider) => provider.name === "Unsaved Gateway"),
    ).toBe(false);
    expect(state.localDataStatus).toBe("error");
    expect(state.localDataMessage).toBe("Settings could not be saved.");
  });

  it("creates a blank blueprint and makes it current", () => {
    const id = useFlowentWorkspaceStore
      .getState()
      .createBlueprint("Audience Follow-up");

    const state = useFlowentWorkspaceStore.getState();

    expect(state.activeBlueprintId).toBe(id);
    expect(
      state.blueprints.find((blueprint) => blueprint.id === id),
    ).toMatchObject({
      name: "Audience Follow-up",
      lastRunStatus: "not-run",
      summary: "Blank blueprint ready to build.",
    });
    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.canvasMode).toBe("blueprint");
  });

  it("opens a blueprint and loads its saved graph", () => {
    const store = useFlowentWorkspaceStore.getState();
    const createdId = store.createBlueprint("Blank Draft");

    useFlowentWorkspaceStore.getState().addQuickNode("trigger");
    expect(useFlowentWorkspaceStore.getState().nodes).toHaveLength(1);

    useFlowentWorkspaceStore
      .getState()
      .openBlueprint("blueprint-launch-campaign");

    expect(useFlowentWorkspaceStore.getState().activeBlueprintId).toBe(
      "blueprint-launch-campaign",
    );
    expect(useFlowentWorkspaceStore.getState().nodes).toHaveLength(
      initialNodes.length,
    );

    useFlowentWorkspaceStore.getState().openBlueprint(createdId);

    expect(useFlowentWorkspaceStore.getState().activeBlueprintId).toBe(
      createdId,
    );
    expect(useFlowentWorkspaceStore.getState().nodes).toHaveLength(1);
    expect(useFlowentWorkspaceStore.getState().selectedNodeIds).toEqual([]);
  });

  it("ignores graph edits and runs when no blueprint is current", () => {
    useFlowentWorkspaceStore.setState({
      activeBlueprintId: null,
      nodes: [],
      edges: [],
      selectedNodeIds: [],
      selectedEdgeIds: [],
      nextNodeIndex: 1,
      canvasMode: "blueprint",
    });

    const store = useFlowentWorkspaceStore.getState();

    store.addQuickNode("trigger");
    store.startWorkflowRun();

    expect(useFlowentWorkspaceStore.getState().nodes).toEqual([]);
    expect(useFlowentWorkspaceStore.getState().edges).toEqual([]);
    expect(useFlowentWorkspaceStore.getState().canvasMode).toBe("blueprint");
  });

  it("starts with demo nodes aligned to the canvas grid", () => {
    for (const node of useFlowentWorkspaceStore.getState().nodes) {
      expectGridPosition(node.position);
    }
  });

  it("snaps newly added workflow nodes to the canvas grid", () => {
    useFlowentWorkspaceStore
      .getState()
      .addWorkflowNode("agent", { x: 13, y: 27 });

    const node = getNode("agent-3");

    expect(node.position).toEqual(snapCanvasPosition({ x: 13, y: 27 }));
    expect(useFlowentWorkspaceStore.getState().selectedNodeIds).toEqual([
      "agent-3",
    ]);
  });

  it("snaps quick-added nodes to the canvas grid", () => {
    useFlowentWorkspaceStore.getState().addQuickNode("trigger");

    expectGridPosition(getNode("trigger-3").position);
  });

  it("snaps agents created from roles to the canvas grid", () => {
    useFlowentWorkspaceStore
      .getState()
      .addAgentFromRole("role-product-copywriter", { x: 491, y: 267 });

    const node = getNode("agent-3");

    expect(node.position).toEqual(snapCanvasPosition({ x: 491, y: 267 }));
    expect(node.data.title).toBe("Product Copywriter");
  });

  it("keeps node movement smooth while dragging and snaps when dragging ends", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.applyNodeChanges([
      {
        id: "agent-1",
        type: "position",
        position: { x: 333, y: 47 },
        dragging: true,
      },
    ]);

    expect(getNode("agent-1").position).toEqual({ x: 333, y: 47 });

    store.applyNodeChanges([
      {
        id: "agent-1",
        type: "position",
        position: { x: 333, y: 47 },
        dragging: false,
      },
    ]);

    expect(getNode("agent-1").position).toEqual(
      snapCanvasPosition({ x: 333, y: 47 }),
    );
  });

  it("snaps non-dragging and multi-node position changes to the canvas grid", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.applyNodeChanges([
      {
        id: "agent-1",
        type: "position",
        position: { x: 351, y: 58 },
      },
      {
        id: "agent-2",
        type: "position",
        position: { x: 703, y: 186 },
      },
    ]);

    expect(getNode("agent-1").position).toEqual(
      snapCanvasPosition({ x: 351, y: 58 }),
    );
    expect(getNode("agent-2").position).toEqual(
      snapCanvasPosition({ x: 703, y: 186 }),
    );
  });

  it("moves into workflow mode when a run starts", () => {
    useFlowentWorkspaceStore.getState().startWorkflowRun();

    const state = useFlowentWorkspaceStore.getState();
    const agentDetails = getNode("agent-1").data.runDetails;
    const activeBlueprint = state.blueprints.find(
      (blueprint) => blueprint.id === state.activeBlueprintId,
    );

    expect(state.activeBlueprintId).toBe("blueprint-launch-campaign");
    expect(state.canvasMode).toBe("workflow");
    expect(activeBlueprint?.lastRunStatus).toBe("running");
    expect(getNode("trigger-1").data.status).toBe("success");
    expect(getNode("agent-1").data.status).toBe("running");
    expect(getNode("agent-2").data.status).toBe("pending");
    expect(getNode("trigger-1").data.runDetails?.kind).toBe("trigger");
    expect(agentDetails?.kind).toBe("agent");
    if (agentDetails?.kind !== "agent") {
      throw new Error("Missing agent run details");
    }
    expect(agentDetails.conversation.map((entry) => entry.role)).toEqual([
      "system",
      "user",
      "tool-calls",
      "assistant",
    ]);
    expect(getNode("agent-2").data.runDetails).toBeUndefined();
    expect(state.edges.every((edge) => edge.animated)).toBe(true);
  });

  it("keeps deleted model references visible for reselection", async () => {
    mockSuccessfulSettingsSave();

    await useFlowentWorkspaceStore
      .getState()
      .deleteModelPreset("preset-writing");

    const state = useFlowentWorkspaceStore.getState();

    expect(
      state.modelPresets.some((preset) => preset.id === "preset-writing"),
    ).toBe(false);
    expect(getNode("agent-1").data.modelPresetId).toBe("preset-writing");
    expect(
      state.roles.find((role) => role.id === "role-product-copywriter")
        ?.modelPresetId,
    ).toBe("preset-writing");
  });

  it("returns to blueprint mode with run presentation cleared", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.startWorkflowRun();
    store.returnToBlueprintMode();

    const state = useFlowentWorkspaceStore.getState();
    const activeBlueprint = state.blueprints.find(
      (blueprint) => blueprint.id === state.activeBlueprintId,
    );

    expect(state.canvasMode).toBe("blueprint");
    expect(
      activeBlueprint?.nodes.every((node) => node.data.status === "idle"),
    ).toBe(true);
    expect(state.nodes.every((node) => node.data.status === "idle")).toBe(true);
    expect(state.nodes.every((node) => !node.data.runDetails)).toBe(true);
    expect(state.edges.every((edge) => edge.animated === false)).toBe(true);

    store.advanceWorkflowRun();
    store.finishWorkflowRun();

    expect(
      useFlowentWorkspaceStore
        .getState()
        .nodes.every((node) => node.data.status === "idle"),
    ).toBe(true);
  });

  it("keeps agent run details current as the workflow advances", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.startWorkflowRun();
    store.advanceWorkflowRun();

    const firstAgentDetails = getNode("agent-1").data.runDetails;
    const secondAgentDetails = getNode("agent-2").data.runDetails;

    expect(getNode("agent-1").data.status).toBe("success");
    expect(getNode("agent-2").data.status).toBe("running");
    expect(firstAgentDetails?.kind).toBe("agent");
    expect(secondAgentDetails?.kind).toBe("agent");
    if (
      firstAgentDetails?.kind !== "agent" ||
      secondAgentDetails?.kind !== "agent"
    ) {
      throw new Error("Missing agent run details");
    }
    expect(secondAgentDetails.inputPayload).toBe(
      firstAgentDetails.outputPayload,
    );
  });

  it("ignores topology and node configuration edits in workflow mode", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.startWorkflowRun();

    const before = useFlowentWorkspaceStore.getState();
    const nodeChange: NodeChange<FlowNode> = {
      id: "agent-1",
      type: "position",
      position: { x: 999, y: 999 },
    };
    const edgeChange: EdgeChange<FlowEdge> = {
      id: "trigger-1-agent-1",
      type: "remove",
    };

    store.applyNodeChanges([nodeChange]);
    store.applyEdgeChanges([edgeChange]);
    store.connectNodes({
      source: "agent-2",
      target: "trigger-1",
      sourceHandle: "output",
      targetHandle: "input",
    });
    store.addWorkflowNode("agent", { x: 10, y: 20 });
    store.addQuickNode("trigger");
    store.deleteSelection();
    store.deleteConnectedEdges([getNode("trigger-1")]);
    store.updateNodeData("agent-1", { title: "Changed" });
    store.addAgentFromRole("role-product-copywriter", { x: 30, y: 40 });

    const after = useFlowentWorkspaceStore.getState();

    expect(after.nodes).toHaveLength(before.nodes.length);
    expect(after.edges).toHaveLength(before.edges.length);
    expect(getNode("agent-1").position).toEqual(before.nodes[1].position);
    expect(getNode("agent-1").data.title).toBe(before.nodes[1].data.title);
    expect(after.selectedNodeIds).toEqual(["agent-1"]);
  });
});
